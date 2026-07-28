import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { CalcError } from '../../../lib/types'
import { resolveBand } from '../../../lib/view'

const base = {
  annualIncome: 90_000,
  monthlyDebts: 500,
  downPayment: 60_000,
  annualRate: 6.5,
  years: '30',
} as const

const stat = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)

/**
 * Independent check: amortize `loan` forward month by month, paying `payment`,
 * and report the balance left after `months`. If the closed-form inversion in
 * compute.ts is right, that balance is zero.
 */
function balanceAfter(loan: number, annualRate: number, months: number, payment: number): number {
  const r = annualRate / 100 / 12
  let balance = loan
  for (let i = 0; i < months; i++) balance = balance * (1 + r) - payment
  return balance
}

describe('house affordability', () => {
  test('the 28% housing limit binds when debts are modest', () => {
    const r = compute(base)
    const gross = 90_000 / 12 // 7500
    // 28% of 7500 = 2100; the 36% path leaves 2700 − 500 = 2200, which is higher.
    expect(stat(r, 'Max monthly housing payment')).toBeCloseTo(gross * 0.28, 9)
    expect(stat(r, 'Max monthly housing payment')).toBeCloseTo(2100, 9)
  })

  test('the loan is exactly what that payment amortizes away — checked by simulation', () => {
    const r = compute(base)
    const loan = stat(r, 'Maximum loan amount')
    const payment = stat(r, 'Max monthly housing payment')
    // Independent method: 360 forward steps of balance × (1+r) − payment.
    expect(balanceAfter(loan, 6.5, 360, payment)).toBeCloseTo(0, 6)
    // And the headline is that loan plus the cash down payment.
    expect(Number(r.primary.value)).toBeCloseTo(loan + 60_000, 9)
  })

  test('the 36% limit binds once other debts are large', () => {
    const r = compute({ ...base, monthlyDebts: 1200 })
    const gross = 90_000 / 12
    expect(stat(r, 'Max monthly housing payment')).toBeCloseTo(gross * 0.36 - 1200, 9)
    expect(stat(r, 'Max monthly housing payment')).toBeCloseTo(1500, 9)
    // Cross-check the loan again at the tighter budget.
    const loan = stat(r, 'Maximum loan amount')
    expect(balanceAfter(loan, 6.5, 360, 1500)).toBeCloseTo(0, 6)
    expect(r.notes!.some((n) => n.includes('binding constraint'))).toBe(true)
  })

  test('a 0% mortgage is the payment times the number of months, not a divide by zero', () => {
    const r = compute({ ...base, annualRate: 0 })
    expect(stat(r, 'Maximum loan amount')).toBeCloseTo(2100 * 360, 9)
    expect(Number(r.primary.value)).toBeCloseTo(2100 * 360 + 60_000, 9)
  })

  test('clearing debt raises the price by the freed payment times the loan multiplier', () => {
    const withDebt = compute({ ...base, monthlyDebts: 1200 })
    const cleared = compute({ ...base, monthlyDebts: 800 })
    const perDollar =
      stat(cleared, 'Maximum loan amount') - stat(withDebt, 'Maximum loan amount')
    // Both are debt-limited, so the budget difference is exactly $400/month.
    expect(
      stat(cleared, 'Max monthly housing payment') -
        stat(withDebt, 'Max monthly housing payment'),
    ).toBeCloseTo(400, 9)
    // $400/month at 6.5% over 30 years amortizes a loan we can derive independently.
    const r = 6.5 / 100 / 12
    const expected = (400 * (Math.pow(1 + r, 360) - 1)) / (r * Math.pow(1 + r, 360))
    expect(perDollar).toBeCloseTo(expected, 6)
  })

  test('a shorter term buys less house', () => {
    const long = compute(base)
    const short = compute({ ...base, years: '15' })
    expect(Number(short.primary.value)).toBeLessThan(Number(long.primary.value))
    // Same payment budget either way — only the term changed.
    expect(stat(short, 'Max monthly housing payment')).toBeCloseTo(
      stat(long, 'Max monthly housing payment'),
      9,
    )
  })

  test('more income raises the maximum price (the e2e nudge case)', () => {
    const nudged = compute({ ...base, annualIncome: 90_000 * 1.1 })
    expect(Number(nudged.primary.value)).toBeGreaterThan(Number(compute(base).primary.value))
  })

  test('scaleValue is the existing debt-to-income ratio and lands in the right band', () => {
    const r = compute(base)
    expect(r.scaleValue).toBeCloseTo((500 / (90_000 / 12)) * 100, 9) // 6.666…%
    expect(resolveBand(def.scale, r.scaleValue!)!.id).toBe('excellent')
    const stretched = compute({ ...base, monthlyDebts: 2200 })
    expect(resolveBand(def.scale, stretched.scaleValue!)!.id).toBe('warn')
  })

  test('a 20% down payment drops the PMI note', () => {
    const small = compute({ ...base, downPayment: 10_000 })
    expect(small.notes!.some((n) => n.includes('private mortgage insurance'))).toBe(true)
    // Enough cash that the down payment clears 20% of the resulting price.
    const large = compute({ ...base, downPayment: 200_000 })
    expect(stat(large, 'Down payment share')).toBeGreaterThan(20)
    expect(large.notes!.some((n) => n.includes('private mortgage insurance'))).toBe(false)
  })

  test.each([
    ['zero income', { annualIncome: 0 }, 'annualIncome'],
    ['negative debts', { monthlyDebts: -1 }, 'monthlyDebts'],
    ['negative down payment', { downPayment: -5 }, 'downPayment'],
    ['negative rate', { annualRate: -1 }, 'annualRate'],
    ['debts already at 36% of income', { monthlyDebts: 2700 }, 'monthlyDebts'],
  ])('rejects %s', (_label, patch, fieldId) => {
    let thrown: unknown
    try {
      compute({ ...base, ...patch })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
  })

  test('never returns NaN for any valid combination', () => {
    for (const rate of [0, 0.125, 6.5, 30]) {
      for (const years of ['10', '15', '20', '30'] as const) {
        const r = compute({ ...base, annualRate: rate, years })
        expect(Number.isFinite(Number(r.primary.value))).toBe(true)
      }
    }
  })
})


/**
 * The shared invariant, asserted the same way everywhere: every slice is finite
 * and non-negative, and the slices add up to the stated whole to 4dp.
 */
function expectPartsSum(r: ReturnType<typeof compute>) {
  const parts = r.parts!
  expect(parts.length).toBeGreaterThan(0)
  for (const p of parts) {
    expect(Number.isFinite(p.value)).toBe(true)
    expect(p.value).toBeGreaterThanOrEqual(0)
  }
  const whole = Number((r.partsTotal ?? r.primary).value)
  expect(parts.reduce((s, p) => s + p.value, 0)).toBeCloseTo(whole, 4)
  return parts
}

describe('house affordability parts', () => {
  // The compute models one undifferentiated housing payment — the whole 28% is
  // treated as principal and interest, with no tax or insurance line — so the
  // split it can actually support is the 36% back-end budget: housing plus the
  // existing debt payments the user already reported.
  test('the parts are the housing payment and existing debt', () => {
    const r = compute(base)
    const parts = expectPartsSum(r)
    expect(parts.map((p) => p.label)).toEqual(['Housing payment', 'Other debt'])
    expect(parts[0]!.value).toBeCloseTo(stat(r, 'Max monthly housing payment'), 10)
    expect(parts[1]!.value).toBeCloseTo(500, 10)
    expect(r.partsTotal!.label).toBe('Monthly obligations')
  })

  test('when income is the binding constraint the whole sits below the 36% cap', () => {
    // 90,000/yr, only 100/mo of other debt: the 28% front-end limit binds.
    const r = compute({ ...base, monthlyDebts: 100 })
    const parts = expectPartsSum(r)
    expect(parts[0]!.value).toBeCloseTo((90_000 / 12) * 0.28, 8)
    expect(Number(r.partsTotal!.value)).toBeLessThanOrEqual((90_000 / 12) * 0.36 + 1e-9)
  })

  test('when debts bind, the whole is exactly 36% of gross monthly income', () => {
    // 2,000/mo of debt against 90,000/yr: the back-end limit bites first, so
    // housing + debt lands precisely on the 36% line.
    const r = compute({ ...base, monthlyDebts: 2_000 })
    const parts = expectPartsSum(r)
    expect(Number(r.partsTotal!.value)).toBeCloseTo((90_000 / 12) * 0.36, 8)
    expect(parts[1]!.value).toBeCloseTo(2_000, 10)
  })

  test('zero other debt leaves a single non-zero slice', () => {
    const r = compute({ ...base, monthlyDebts: 0 })
    const parts = expectPartsSum(r)
    expect(parts[1]!.value).toBe(0)
    expect(Number(r.partsTotal!.value)).toBeCloseTo(parts[0]!.value, 10)
  })

  test('the invariant holds across incomes, debts, rates and terms', () => {
    for (const annualIncome of [12_000, 90_000, 10_000_000]) {
      for (const monthlyDebts of [0, 500, 2_000]) {
        for (const annualRate of [0, 6.5, 30]) {
          for (const years of ['10', '15', '20', '30'] as const) {
            const v = { ...base, annualIncome, monthlyDebts, downPayment: 60_000, annualRate, years }
            if (annualIncome / 12 * 0.36 - monthlyDebts <= 0) continue
            expectPartsSum(compute(v))
          }
        }
      }
    }
  })
})

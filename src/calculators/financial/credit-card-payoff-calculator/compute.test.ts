import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'
import type { Values } from '../../../lib/types'
import { resolveBand } from '../../../lib/view'

const base: Values<typeof fields> = { balance: 5000, apr: 22.9, monthlyPayment: 250 }

const monthsOf = (r: ReturnType<typeof compute>) => Number(r.primary.value)
const statOf = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)

/**
 * Independent check of the month count, by closed form rather than by loop.
 * With b(k+1) = b(k)(1+r) − P, the balance hits exactly zero at the real
 * n* = −ln(1 − rB/P) / ln(1 + r); the payoff month is ceil(n*).
 */
function monthsClosedForm(balance: number, apr: number, payment: number): number {
  const r = apr / 100 / 12
  if (r === 0) return Math.ceil(balance / payment)
  return Math.ceil(-Math.log(1 - (r * balance) / payment) / Math.log(1 + r))
}

describe('credit card payoff', () => {
  test('$5,000 at 22.9% APR paying $250/month clears in 26 months', () => {
    const r = compute(base)
    expect(monthsOf(r)).toBe(26)
    // Same answer from a formula that shares no code with the implementation.
    expect(monthsOf(r)).toBe(monthsClosedForm(5000, 22.9, 250))
  })

  test.each([
    [5000, 22.9, 250],
    [12_500, 19.99, 400],
    [800, 29.99, 45],
    [25_000, 15, 500],
    [3200, 0.9, 120],
    [1000, 24, 21], // barely above the first month's $20 of interest
  ])('loop and closed form agree for $%d at %d%% paying $%d', (balance, apr, payment) => {
    expect(monthsOf(compute({ balance, apr, monthlyPayment: payment }))).toBe(
      monthsClosedForm(balance, apr, payment),
    )
  })

  test('a 0% card is just the balance divided by the payment, with no interest', () => {
    const r = compute({ balance: 5000, apr: 0, monthlyPayment: 250 })
    expect(monthsOf(r)).toBe(20)
    expect(statOf(r, 'Total interest')).toBe(0)
    expect(statOf(r, 'Total paid')).toBeCloseTo(5000, 10)
  })

  test('an uneven 0% balance rounds up to a short final payment', () => {
    const r = compute({ balance: 5100, apr: 0, monthlyPayment: 250 })
    expect(monthsOf(r)).toBe(21) // 20 full payments plus $100
    expect(statOf(r, 'Final payment')).toBeCloseTo(100, 10)
  })

  test('total paid equals the scheduled payments, and equals balance plus interest', () => {
    const r = compute(base)
    const months = monthsOf(r)
    const scheduled = (months - 1) * base.monthlyPayment + statOf(r, 'Final payment')
    expect(statOf(r, 'Total paid')).toBeCloseTo(scheduled, 8)
    expect(statOf(r, 'Total paid')).toBeCloseTo(base.balance + statOf(r, 'Total interest'), 8)
  })

  test('total interest matches an independently simulated amortisation loop', () => {
    let remaining = base.balance
    let interest = 0
    while (remaining > 0) {
      const charge = (remaining * base.apr) / 100 / 12
      interest += charge
      remaining = Math.max(0, remaining + charge - base.monthlyPayment)
    }
    expect(statOf(compute(base), 'Total interest')).toBeCloseTo(interest, 8)
  })

  test('paying more clears the card sooner and costs less interest', () => {
    const slow = compute({ ...base, monthlyPayment: 150 })
    const fast = compute({ ...base, monthlyPayment: 500 })
    expect(monthsOf(fast)).toBeLessThan(monthsOf(slow))
    expect(statOf(fast, 'Total interest')).toBeLessThan(statOf(slow, 'Total interest'))
  })

  test('nudging the first number field stays valid and moves the answer', () => {
    // The e2e suite bumps the first number field to 1.1x its default.
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('balance')
    const nudged = compute({ ...base, balance: first.default * 1.1 })
    expect(monthsOf(nudged)).toBeGreaterThan(monthsOf(compute(base)))
  })

  test('scaleValue is the month count and lands in the declared bands', () => {
    const r = compute(base)
    expect(r.scaleValue).toBe(monthsOf(r))
    expect(resolveBand(def.scale, r.scaleValue!)!.id).toBe('neutral')
    expect(resolveBand(def.scale, compute({ ...base, monthlyPayment: 600 }).scaleValue!)!.id).toBe(
      'excellent',
    )
    expect(resolveBand(def.scale, compute({ ...base, monthlyPayment: 120 }).scaleValue!)!.id).toBe(
      'critical',
    )
  })

  test.each([
    ['a zero balance', { balance: 0 }, 'balance'],
    ['a negative balance', { balance: -100 }, 'balance'],
    ['a negative APR', { apr: -1 }, 'apr'],
    ['a zero payment', { monthlyPayment: 0 }, 'monthlyPayment'],
    // $5,000 at 22.9% accrues $95.42 in month one.
    ['a payment below the first month of interest', { monthlyPayment: 95 }, 'monthlyPayment'],
    ['a payment exactly equal to the interest', { monthlyPayment: (5000 * 22.9) / 1200 }, 'monthlyPayment'],
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

  test('a payoff beyond the 1200-month cap is refused rather than looped forever', () => {
    // $1,000,000 at 0% paying $100 would take 10,000 months.
    let thrown: unknown
    try {
      compute({ balance: 1_000_000, apr: 0, monthlyPayment: 100 })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe('monthlyPayment')
  })

  test('a payment one cent above the interest still terminates', () => {
    const r = compute({ balance: 1000, apr: 24, monthlyPayment: 20.01 })
    expect(monthsOf(r)).toBe(monthsClosedForm(1000, 24, 20.01))
    expect(monthsOf(r)).toBeLessThanOrEqual(1200)
  })
})

describe('credit card parts and series', () => {
  const sumParts = (r: ReturnType<typeof compute>) =>
    r.parts!.reduce((acc, p) => acc + p.value, 0)

  test('parts sum exactly to the total paid', () => {
    const r = compute(base)
    expect(r.partsTotal!.label).toBe('Total paid')
    expect(r.parts!.map((p) => p.label)).toEqual(['Principal', 'Interest'])
    expect(r.parts![0]!.value).toBe(base.balance)
    expect(sumParts(r)).toBeCloseTo(Number(r.partsTotal!.value), 4)
    expect(Number(r.partsTotal!.value)).toBeCloseTo(
      Number(r.stats!.find((s) => s.label === 'Total paid')!.value),
      6,
    )
  })

  test('parts still sum exactly on a second, non-default input set', () => {
    const r = compute({ balance: 18_400, apr: 27.99, monthlyPayment: 460 })
    expect(sumParts(r)).toBeCloseTo(Number(r.partsTotal!.value), 4)
    for (const p of r.parts!) expect(p.value).toBeGreaterThanOrEqual(0)
  })

  test('a 0% card has no interest slice and still sums', () => {
    const r = compute({ ...base, apr: 0 })
    expect(r.parts![1]!.value).toBeCloseTo(0, 6)
    expect(sumParts(r)).toBeCloseTo(Number(r.partsTotal!.value), 4)
  })

  test('the balance curve runs in months from the full balance to zero', () => {
    const r = compute(base)
    const pts = r.series!.find((s) => s.label === 'Remaining balance')!.points
    expect(pts[0]).toEqual([0, 5000])
    expect(pts[pts.length - 1]![0]).toBe(Number(r.primary.value))
    expect(pts[pts.length - 1]![1]).toBeCloseTo(0, 6)
  })

  test('series x is strictly increasing and thinned to a chartable length', () => {
    // 1160-ish months at this payment — the worst case the calculator allows.
    for (const v of [base, { balance: 30_000, apr: 24, monthlyPayment: 610 }]) {
      for (const s of compute(v).series!) {
        expect(s.points.length).toBeGreaterThan(1)
        expect(s.points.length).toBeLessThanOrEqual(45)
        s.points.forEach((p, i) => {
          expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true)
          if (i > 0) expect(p[0]).toBeGreaterThan(s.points[i - 1]![0])
        })
      }
    }
  })

  test('the month-12 point matches an independent month-by-month loop', () => {
    const r = compute(base)
    let owed = 5000
    const monthlyRate = 22.9 / 100 / 12
    for (let m = 0; m < 12; m += 1) owed = Math.max(0, owed + owed * monthlyRate - 250)
    const charted = r.series![0]!.points.find((p) => p[0] === 12)!
    expect(charted[1]).toBeCloseTo(owed, 6)
  })
})

import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'
import { resolveBand } from '../../../lib/view'

const base = {
  vehiclePrice: 30_000,
  downPayment: 3000,
  tradeInValue: 2000,
  salesTaxRate: 6.5,
  annualRate: 7.5,
  months: '60',
} as const

const stat = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)

/**
 * Independent check on the closed-form payment: run the loan month by month at
 * the proposed payment and confirm the balance lands exactly on zero. This
 * never touches the amortization formula, so it cannot re-state the
 * implementation.
 */
function balanceAfterTerm(principal: number, annualRate: number, months: number, payment: number) {
  const r = annualRate / 100 / 12
  let balance = principal
  for (let i = 0; i < months; i++) balance = balance * (1 + r) - payment
  return balance
}

describe('auto loan', () => {
  test('the default scenario amortizes to exactly zero', () => {
    const r = compute(base)
    // Amount financed: (30000 - 2000) taxed at 6.5% = 1820 of tax;
    // 30000 - 3000 - 2000 + 1820 = 26,820.
    expect(stat(r, 'Amount financed')).toBeCloseTo(26_820, 6)
    expect(stat(r, 'Sales tax')).toBeCloseTo(1820, 6)
    expect(balanceAfterTerm(26_820, 7.5, 60, Number(r.primary.value))).toBeCloseTo(0, 6)
  })

  test('sales tax is charged net of the trade-in but not of the down payment', () => {
    // Move $2,000 from the down payment into the trade-in: the cash out of
    // pocket is unchanged, but the taxable amount drops by $2,000.
    const asDown = compute({ ...base, downPayment: 5000, tradeInValue: 0 })
    const asTrade = compute({ ...base, downPayment: 3000, tradeInValue: 2000 })
    expect(stat(asDown, 'Sales tax') - stat(asTrade, 'Sales tax')).toBeCloseTo(2000 * 0.065, 9)
    expect(stat(asDown, 'Amount financed') - stat(asTrade, 'Amount financed')).toBeCloseTo(130, 9)
  })

  test('a 0% APR loan spreads the balance evenly with no interest', () => {
    const r = compute({ ...base, annualRate: 0 })
    expect(Number(r.primary.value)).toBeCloseTo(26_820 / 60, 9)
    expect(stat(r, 'Total interest')).toBeCloseTo(0, 9)
  })

  test('total interest equals the payments made less the amount financed', () => {
    for (const months of ['24', '36', '48', '60', '72', '84'] as const) {
      const r = compute({ ...base, months })
      const n = Number(months)
      expect(balanceAfterTerm(stat(r, 'Amount financed'), 7.5, n, Number(r.primary.value))).toBeCloseTo(
        0,
        6,
      )
      expect(stat(r, 'Total interest')).toBeCloseTo(
        Number(r.primary.value) * n - stat(r, 'Amount financed'),
        6,
      )
    }
  })

  test('a longer term lowers the payment and raises total interest', () => {
    const short = compute({ ...base, months: '36' })
    const long = compute({ ...base, months: '84' })
    expect(Number(long.primary.value)).toBeLessThan(Number(short.primary.value))
    expect(stat(long, 'Total interest')).toBeGreaterThan(stat(short, 'Total interest'))
    expect(long.notes!.length).toBeGreaterThan(0)
    expect(short.notes).toHaveLength(0)
  })

  test('the up-front share drives the scale value and the band', () => {
    // 3,000 + 2,000 on a 30,000 car = 16.67% up front.
    const r = compute(base)
    expect(r.scaleValue).toBeCloseTo((5000 / 30_000) * 100, 9)
    expect(resolveBand(def.scale, r.scaleValue!)!.id).toBe('warn')
    const strong = compute({ ...base, downPayment: 10_000 })
    expect(resolveBand(def.scale, strong.scaleValue!)!.id).toBe('excellent')
    const thin = compute({ ...base, downPayment: 0, tradeInValue: 1000 })
    expect(resolveBand(def.scale, thin.scaleValue!)!.id).toBe('critical')
  })

  test('nudging the first number field by 10% keeps the input valid and moves the result', () => {
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('vehiclePrice')
    const nudged = compute({ ...base, vehiclePrice: first.default * 1.1 })
    expect(Number(nudged.primary.value)).not.toBeCloseTo(Number(compute(base).primary.value), 2)
    expect(Number.isFinite(Number(nudged.primary.value))).toBe(true)
  })

  test.each([
    ['zero vehicle price', { vehiclePrice: 0 }, 'vehiclePrice'],
    ['negative down payment', { downPayment: -1 }, 'downPayment'],
    ['trade-in above the price', { tradeInValue: 40_000 }, 'tradeInValue'],
    ['negative tax rate', { salesTaxRate: -0.5 }, 'salesTaxRate'],
    ['negative APR', { annualRate: -1 }, 'annualRate'],
    ['nothing left to finance', { downPayment: 30_000, tradeInValue: 0, salesTaxRate: 0 }, 'downPayment'],
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

  test('every declared term option produces a finite payment', () => {
    const termField = fields.find((f) => f.id === 'months')!
    expect(termField.kind).toBe('select')
    const options = (termField as Extract<typeof termField, { kind: 'select' }>).options
    for (const opt of options) {
      const r = compute({ ...base, months: opt.value })
      expect(Number.isFinite(Number(r.primary.value))).toBe(true)
      expect(Number(r.primary.value)).toBeGreaterThan(0)
    }
  })
})

describe('auto loan parts and series', () => {
  const sumParts = (r: ReturnType<typeof compute>) =>
    r.parts!.reduce((acc, p) => acc + p.value, 0)

  test('parts sum exactly to the total cost', () => {
    const r = compute(base)
    expect(r.partsTotal!.label).toBe('Total cost')
    expect(r.parts!.map((p) => p.label)).toEqual(['Vehicle price', 'Sales tax', 'Interest'])
    expect(sumParts(r)).toBeCloseTo(Number(r.partsTotal!.value), 4)
    expect(Number(r.partsTotal!.value)).toBeCloseTo(
      Number(r.stats!.find((s) => s.label === 'Total cost of the car')!.value),
      6,
    )
  })

  test('parts still sum exactly on a second, non-default input set', () => {
    const r = compute({
      vehiclePrice: 62_500,
      downPayment: 1500,
      tradeInValue: 9800,
      salesTaxRate: 9.25,
      annualRate: 4.15,
      months: '84',
    })
    expect(sumParts(r)).toBeCloseTo(Number(r.partsTotal!.value), 4)
    for (const p of r.parts!) expect(p.value).toBeGreaterThanOrEqual(0)
  })

  test('a 0% APR loan sums with a zero interest slice', () => {
    const r = compute({ ...base, annualRate: 0 })
    expect(r.parts![2]!.value).toBeCloseTo(0, 6)
    expect(sumParts(r)).toBeCloseTo(Number(r.partsTotal!.value), 4)
  })

  test('the balance curve starts at the amount financed and ends at zero', () => {
    const r = compute(base)
    const financed = Number(r.stats!.find((s) => s.label === 'Amount financed')!.value)
    const pts = r.series!.find((s) => s.label === 'Remaining balance')!.points
    expect(pts[0]![0]).toBe(0)
    expect(pts[0]![1]).toBeCloseTo(financed, 6)
    expect(pts[pts.length - 1]![0]).toBeCloseTo(5, 6)
    expect(pts[pts.length - 1]![1]).toBeCloseTo(0, 4)
  })

  test('series x is strictly increasing and the length stays chartable', () => {
    for (const term of ['24', '60', '84'] as const) {
      for (const s of compute({ ...base, months: term }).series!) {
        expect(s.points.length).toBeGreaterThan(1)
        expect(s.points.length).toBeLessThanOrEqual(45)
        s.points.forEach((p, i) => {
          expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true)
          if (i > 0) expect(p[0]).toBeGreaterThan(s.points[i - 1]![0])
        })
      }
    }
  })

  test('year-3 balance matches an independent month-by-month loop', () => {
    const r = compute(base)
    const payment = Number(r.primary.value)
    let owed = Number(r.stats!.find((s) => s.label === 'Amount financed')!.value)
    const monthlyRate = 7.5 / 100 / 12
    for (let m = 0; m < 36; m += 1) owed = owed + owed * monthlyRate - payment
    const charted = r.series![0]!.points.find((p) => p[0] === 3)!
    expect(charted[1]).toBeCloseTo(owed, 4)
  })
})

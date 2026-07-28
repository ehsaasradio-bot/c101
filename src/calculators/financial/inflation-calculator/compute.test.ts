import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { CalcError } from '../../../lib/types'
import { resolveBand } from '../../../lib/view'

const base = {
  amount: 10_000,
  annualInflationRate: 3,
  years: 20,
} as const

const stat = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)

/** Independent check: apply the rate one year at a time instead of exponentiating. */
function simulate(amount: number, ratePercent: number, years: number): number {
  let value = amount
  for (let i = 0; i < years; i++) value *= 1 + ratePercent / 100
  return value
}

describe('inflation', () => {
  test('$10,000 at 3% for 20 years, cross-checked against a year-by-year loop', () => {
    const r = compute(base)
    // Year-by-year simulation, derived without the closed form under test.
    const looped = simulate(10_000, 3, 20)
    expect(Number(r.primary.value)).toBeCloseTo(looped, 6)
    // Sanity anchor: 1.03^20 ≈ 1.8061, so ≈ $18,061.
    expect(Number(r.primary.value)).toBeGreaterThan(18_000)
    expect(Number(r.primary.value)).toBeLessThan(18_100)
  })

  test('equivalent value is the exact inverse of the future cost', () => {
    const r = compute(base)
    const equivalent = stat(r, 'Equivalent value today')
    // amount ÷ factor, where factor = futureCost ÷ amount → amount² ÷ futureCost.
    expect(equivalent).toBeCloseTo((10_000 * 10_000) / Number(r.primary.value), 8)
    // Inflating the discounted value back must return the original amount.
    expect(simulate(equivalent, 3, 20)).toBeCloseTo(10_000, 6)
    expect(stat(r, 'Purchasing power lost in dollars')).toBeCloseTo(10_000 - equivalent, 8)
  })

  test('purchasing power kept and lost always sum to 100%', () => {
    for (const years of [0, 1, 7, 20, 55]) {
      const r = compute({ ...base, years })
      const kept = Number(
        (r.steps as ReadonlyArray<{ label?: string; value?: number }>).find(
          (s) => s.label === 'Purchasing power kept',
        )!.value,
      )
      expect(kept + stat(r, 'Purchasing power lost')).toBeCloseTo(100, 9)
    }
  })

  test('zero inflation leaves prices and purchasing power untouched', () => {
    const r = compute({ ...base, annualInflationRate: 0 })
    expect(Number(r.primary.value)).toBe(10_000)
    expect(stat(r, 'Equivalent value today')).toBe(10_000)
    expect(stat(r, 'Purchasing power lost')).toBe(0)
    expect(stat(r, 'Extra cost versus today')).toBe(0)
    expect(r.notes).toHaveLength(1)
  })

  test('zero years is a no-op and does not divide by zero', () => {
    const r = compute({ ...base, years: 0 })
    expect(Number(r.primary.value)).toBe(10_000)
    expect(stat(r, 'Average extra cost per year')).toBe(0)
    expect(Number.isFinite(stat(r, 'Purchasing power lost'))).toBe(true)
  })

  test('the rule of 70: 3% roughly halves purchasing power in ~23 years', () => {
    // 70 / 3 ≈ 23.3, so 23 years should be just under half lost and 24 just over.
    expect(stat(compute({ ...base, years: 23 }), 'Purchasing power lost')).toBeLessThan(50)
    expect(stat(compute({ ...base, years: 24 }), 'Purchasing power lost')).toBeGreaterThan(50)
  })

  test('purchasing power lost is independent of the amount', () => {
    const small = stat(compute({ ...base, amount: 100 }), 'Purchasing power lost')
    const large = stat(compute({ ...base, amount: 5_000_000 }), 'Purchasing power lost')
    expect(small).toBeCloseTo(large, 9)
  })

  test('nudging the first number field scales the primary result proportionally', () => {
    // The e2e suite bumps `amount` (the first number field) to 1.1× its default.
    const nudged = compute({ ...base, amount: base.amount * 1.1 })
    expect(Number(nudged.primary.value)).toBeCloseTo(Number(compute(base).primary.value) * 1.1, 6)
    expect(Number(nudged.primary.value)).not.toBe(Number(compute(base).primary.value))
  })

  test('scaleValue is the percentage of purchasing power lost, and bands agree', () => {
    const r = compute(base)
    expect(r.scaleValue).toBeCloseTo(stat(r, 'Purchasing power lost'), 9)
    // 1 − 1/1.8061 ≈ 44.6% → the 40–60% band.
    expect(resolveBand(def.scale, r.scaleValue!)!.id).toBe('warn')
    expect(resolveBand(def.scale, compute({ ...base, years: 2 }).scaleValue!)!.id).toBe('excellent')
    expect(resolveBand(def.scale, compute({ ...base, years: 40 }).scaleValue!)!.id).toBe('critical')
  })

  test.each([
    ['zero amount', { amount: 0 }, 'amount'],
    ['negative amount', { amount: -500 }, 'amount'],
    ['a non-numeric amount', { amount: Number.NaN }, 'amount'],
    ['negative inflation rate', { annualInflationRate: -1 }, 'annualInflationRate'],
    ['negative years', { years: -1 }, 'years'],
    ['an implausible horizon', { years: 500 }, 'years'],
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

  test('never returns NaN for any valid input', () => {
    const r = compute({ amount: 1, annualInflationRate: 50, years: 100 })
    expect(Number.isFinite(Number(r.primary.value))).toBe(true)
    for (const s of r.stats!) expect(Number.isFinite(Number(s.value))).toBe(true)
  })
})

describe('inflation parts and series', () => {
  const inputs: Array<[string, { [K in keyof typeof base]: number }]> = [
    ['the defaults', base],
    ['a second input set', { amount: 45_000, annualInflationRate: 7.5, years: 35 }],
    ['zero inflation', { ...base, annualInflationRate: 0 }],
    ['the longest horizon', { amount: 1, annualInflationRate: 50, years: 100 }],
  ]

  test.each(inputs)('parts sum exactly to the amount for %s', (_label, input) => {
    const r = compute(input)
    const sum = r.parts!.reduce((s, p) => s + p.value, 0)
    expect(r.partsTotal!.label).toBe("Today's amount")
    expect(Number(r.partsTotal!.value)).toBe(input.amount)
    expect(sum).toBeCloseTo(input.amount, 4)
    for (const p of r.parts!) expect(p.value).toBeGreaterThanOrEqual(0)
    expect(r.parts!.find((p) => p.label === 'Value retained')!.value).toBeCloseTo(
      stat(r, 'Equivalent value today'),
      6,
    )
  })

  test.each(inputs)('both series end on the reported figures for %s', (_label, input) => {
    const r = compute(input)
    const power = r.series!.find((s) => s.label === 'Purchasing power')!
    const cost = r.series!.find((s) => s.label === 'Cost to buy the same thing')!
    expect(power.points[power.points.length - 1]![0]).toBe(input.years)
    expect(power.points[power.points.length - 1]![1]).toBeCloseTo(stat(r, 'Equivalent value today'), 6)
    expect(cost.points[cost.points.length - 1]![0]).toBe(input.years)
    expect(cost.points[cost.points.length - 1]![1]).toBeCloseTo(Number(r.primary.value), 6)
    expect(power.points[0]![1]).toBeCloseTo(input.amount, 6)
    expect(cost.points[0]![1]).toBeCloseTo(input.amount, 6)
  })

  test.each(inputs)('series x is strictly increasing and thinned for %s', (_label, input) => {
    for (const s of compute(input).series!) {
      expect(s.points.length).toBeGreaterThan(1)
      expect(s.points.length).toBeLessThanOrEqual(45)
      s.points.forEach((p, i) => {
        expect(Number.isFinite(p[0])).toBe(true)
        expect(Number.isFinite(p[1])).toBe(true)
        if (i > 0) expect(p[0]).toBeGreaterThan(s.points[i - 1]![0])
      })
    }
  })

  test('the cost curve matches an independent year-by-year loop', () => {
    const cost = compute(base).series!.find((s) => s.label === 'Cost to buy the same thing')!
    for (const [x, y] of cost.points) expect(y).toBeCloseTo(simulate(base.amount, base.annualInflationRate, x), 4)
  })

  test('omits the series at a zero horizon', () => {
    const r = compute({ ...base, years: 0 })
    expect(r.series ?? []).toHaveLength(0)
    expect(r.parts!.reduce((s, p) => s + p.value, 0)).toBeCloseTo(base.amount, 4)
  })
})

import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { CalcError } from '../../../lib/types'
import { resolveBand } from '../../../lib/view'

const base = {
  homePrice: 400_000,
  downPayment: 0,
  rate: 6.5,
  years: '30',
  propertyTax: 0,
  insurance: 0,
} as const

describe('mortgage', () => {
  test('$400k at 6.5% over 30 years', () => {
    const r = compute(base)
    expect(Number(r.primary.value)).toBeCloseTo(2528.27, 2)
  })

  test('total interest exceeds the principal at this rate', () => {
    const r = compute(base)
    const totalInterest = r.stats!.find((s) => s.label === 'Total interest')!
    // 360 × 2528.27 − 400,000
    expect(Number(totalInterest.value)).toBeCloseTo(510_178.3, 0)
  })

  test('a 0% loan divides evenly instead of dividing by zero', () => {
    const r = compute({ ...base, rate: 0 })
    expect(Number(r.primary.value)).toBeCloseTo(400_000 / 360, 6)
  })

  test('a 20% down payment avoids PMI', () => {
    const withPmi = compute({ ...base, downPayment: 40_000 })
    const withoutPmi = compute({ ...base, downPayment: 80_000 })
    expect(withPmi.notes).toHaveLength(1)
    expect(withoutPmi.notes).toHaveLength(0)
  })

  test('scaleValue is the loan-to-value ratio', () => {
    expect(compute({ ...base, downPayment: 80_000 }).scaleValue).toBeCloseTo(80, 6)
  })

  test('exactly 20% down lands in the healthy band, not PMI territory', () => {
    // This is the calculator's default state, so the meter must agree with both
    // the PMI charge and the down-payment field's help text.
    const result = compute({ ...base, downPayment: 80_000 })
    expect(result.notes).toHaveLength(0)
    expect(resolveBand(def.scale, result.scaleValue!)!.id).toBe('good')
  })

  test('a hair under 20% down does trigger PMI', () => {
    const result = compute({ ...base, downPayment: 79_000 })
    expect(result.notes).toHaveLength(1)
    expect(resolveBand(def.scale, result.scaleValue!)!.id).toBe('warn')
  })

  test('a shorter term costs more monthly but less overall', () => {
    const short = compute({ ...base, years: '15' })
    const long = compute({ ...base, years: '30' })
    expect(Number(short.primary.value)).toBeGreaterThan(Number(long.primary.value))
    const total = (r: ReturnType<typeof compute>) =>
      Number(r.stats!.find((s) => s.label === 'Total repaid')!.value)
    expect(total(short)).toBeLessThan(total(long))
  })

  test.each([
    ['zero home price', { homePrice: 0 }, 'homePrice'],
    ['down payment above home price', { downPayment: 500_000 }, 'downPayment'],
    ['negative rate', { rate: -1 }, 'rate'],
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
})

describe('mortgage parts and series', () => {
  const withEscrow = { ...base, downPayment: 80_000, propertyTax: 4800, insurance: 1800 } as const

  const sumParts = (r: ReturnType<typeof compute>) =>
    r.parts!.reduce((acc, p) => acc + p.value, 0)

  test('parts sum exactly to the total monthly payment', () => {
    const r = compute(withEscrow)
    expect(r.partsTotal!.label).toBe('Total monthly payment')
    expect(sumParts(r)).toBeCloseTo(Number(r.partsTotal!.value), 4)
    expect(r.parts!.map((p) => p.label)).toEqual([
      'Principal & interest',
      'Property tax',
      'Home insurance',
    ])
  })

  test('parts still sum exactly on a second, non-default input set', () => {
    // Under 20% down, so PMI appears as a fourth slice.
    const r = compute({
      homePrice: 725_000,
      downPayment: 36_250,
      rate: 7.125,
      years: '15',
      propertyTax: 11_400,
      insurance: 3300,
    })
    expect(r.parts).toHaveLength(4)
    expect(sumParts(r)).toBeCloseTo(Number(r.partsTotal!.value), 4)
    // The total is also the PITI stat, so donut and grid cannot disagree.
    expect(Number(r.partsTotal!.value)).toBeCloseTo(
      Number(r.stats!.find((s) => s.label === 'Total monthly (PITI)')!.value),
      6,
    )
  })

  test('zero-valued components are dropped without breaking the sum', () => {
    const r = compute({ ...base, downPayment: 80_000 })
    expect(r.parts!.map((p) => p.label)).toEqual(['Principal & interest'])
    expect(sumParts(r)).toBeCloseTo(Number(r.partsTotal!.value), 4)
    for (const p of r.parts!) expect(p.value).toBeGreaterThanOrEqual(0)
  })

  test('balance runs from the full loan to zero, equity the other way', () => {
    const r = compute(withEscrow)
    const balance = r.series!.find((s) => s.label === 'Remaining balance')!
    const equity = r.series!.find((s) => s.label === 'Equity')!

    expect(balance.points[0]).toEqual([0, 320_000])
    expect(balance.points[balance.points.length - 1]![0]).toBe(30)
    expect(balance.points[balance.points.length - 1]![1]).toBeCloseTo(0, 4)

    expect(equity.points[0]![1]).toBeCloseTo(80_000, 6)
    expect(equity.points[equity.points.length - 1]![1]).toBeCloseTo(400_000, 4)
  })

  test('series x is strictly increasing and the length stays chartable', () => {
    for (const s of compute(withEscrow).series!) {
      expect(s.points.length).toBeGreaterThan(1)
      expect(s.points.length).toBeLessThanOrEqual(45)
      s.points.forEach((p, i) => {
        expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true)
        if (i > 0) expect(p[0]).toBeGreaterThan(s.points[i - 1]![0])
      })
    }
  })

  test('year-10 balance matches an independent month-by-month amortization', () => {
    const r = compute(withEscrow)
    const pi = Number(r.primary.value)
    let owed = 320_000
    const monthlyRate = 6.5 / 100 / 12
    for (let m = 0; m < 120; m += 1) owed = owed + owed * monthlyRate - pi
    const charted = r.series!.find((s) => s.label === 'Remaining balance')!.points.find(
      (p) => p[0] === 10,
    )!
    expect(charted[1]).toBeCloseTo(owed, 4)
  })

  test('a 0% loan pays down in a straight line to zero', () => {
    const r = compute({ ...base, downPayment: 80_000, rate: 0 })
    const pts = r.series!.find((s) => s.label === 'Remaining balance')!.points
    expect(pts[0]![1]).toBeCloseTo(320_000, 6)
    expect(pts[15]![1]).toBeCloseTo(160_000, 6)
    expect(pts[pts.length - 1]![1]).toBeCloseTo(0, 6)
  })
})

import { describe, expect, test } from 'vitest'
import compute from './compute'
import { CalcError } from '../../../lib/types'

const base = { amount: 25_000, rate: 8.5, months: 60, extra: 0 } as const
const stat = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)

describe('loan', () => {
  test('$25k at 8.5% over 60 months', () => {
    // Cross-checked by simulating the amortization: 60 payments of 512.9133
    // drive the balance to exactly 0.00, for $5,774.80 of interest.
    expect(Number(compute(base).primary.value)).toBeCloseTo(512.9133, 3)
  })

  test('a 0% loan divides evenly and charges no interest', () => {
    const r = compute({ ...base, rate: 0 })
    expect(Number(r.primary.value)).toBeCloseTo(25_000 / 60, 6)
    expect(stat(r, 'Total interest')).toBeCloseTo(0, 6)
  })

  test('extra payments shorten the term and cut interest', () => {
    const plain = compute(base)
    const extra = compute({ ...base, extra: 100 })
    expect(stat(extra, 'Payoff time')).toBeLessThan(stat(plain, 'Payoff time'))
    expect(stat(extra, 'Total interest')).toBeLessThan(stat(plain, 'Total interest'))
    expect(stat(extra, 'Interest saved')).toBeGreaterThan(0)
  })

  test('without extra payments nothing is saved', () => {
    const r = compute(base)
    expect(stat(r, 'Interest saved')).toBeCloseTo(0, 6)
    expect(stat(r, 'Time saved')).toBe(0)
  })

  test('total repaid equals principal plus interest', () => {
    const r = compute({ ...base, extra: 250 })
    expect(stat(r, 'Total repaid')).toBeCloseTo(25_000 + stat(r, 'Total interest'), 6)
  })

  test('rejects invalid input', () => {
    expect(() => compute({ ...base, amount: 0 })).toThrow(CalcError)
    expect(() => compute({ ...base, months: 0 })).toThrow(CalcError)
    expect(() => compute({ ...base, rate: -1 })).toThrow(CalcError)
  })
})

describe('loan parts and series', () => {
  const sumParts = (r: ReturnType<typeof compute>) =>
    r.parts!.reduce((acc, p) => acc + p.value, 0)

  test('parts sum exactly to the total repaid', () => {
    const r = compute(base)
    expect(r.partsTotal!.label).toBe('Total repaid')
    expect(r.parts!.map((p) => p.label)).toEqual(['Principal', 'Interest'])
    expect(sumParts(r)).toBeCloseTo(Number(r.partsTotal!.value), 4)
    expect(Number(r.partsTotal!.value)).toBeCloseTo(stat(r, 'Total repaid'), 6)
  })

  test('parts still sum exactly on a second, non-default input set', () => {
    const r = compute({ amount: 180_000, rate: 11.25, months: 144, extra: 300 })
    expect(sumParts(r)).toBeCloseTo(Number(r.partsTotal!.value), 4)
    // The interest slice is the ACCELERATED figure, not the scheduled one.
    expect(r.parts![1]!.value).toBeCloseTo(stat(r, 'Total interest'), 6)
    expect(r.parts![1]!.value).toBeLessThan(
      Number(
        compute({ amount: 180_000, rate: 11.25, months: 144, extra: 0 }).parts![1]!.value,
      ),
    )
    for (const p of r.parts!) expect(p.value).toBeGreaterThanOrEqual(0)
  })

  test('a 0% loan has no interest slice value and still sums', () => {
    const r = compute({ ...base, rate: 0 })
    expect(r.parts![1]!.value).toBeCloseTo(0, 6)
    expect(sumParts(r)).toBeCloseTo(Number(r.partsTotal!.value), 4)
  })

  test('the balance curve starts at the loan and ends at zero', () => {
    const r = compute(base)
    const pts = r.series!.find((s) => s.label === 'Remaining balance')!.points
    expect(pts[0]).toEqual([0, 25_000])
    expect(pts[pts.length - 1]![0]).toBeCloseTo(5, 6)
    expect(pts[pts.length - 1]![1]).toBeCloseTo(0, 4)
  })

  test('the curve spans the ACTUAL payoff term when paying extra', () => {
    const r = compute({ ...base, extra: 200 })
    const pts = r.series!.find((s) => s.label === 'Remaining balance')!.points
    expect(pts[pts.length - 1]![0]).toBeCloseTo(stat(r, 'Payoff time') / 12, 6)
    expect(pts[pts.length - 1]![0]).toBeLessThan(5)
    expect(pts[pts.length - 1]![1]).toBeCloseTo(0, 4)
  })

  test('series x is strictly increasing and the length stays chartable', () => {
    for (const v of [base, { ...base, extra: 200 }, { amount: 400_000, rate: 6, months: 480, extra: 0 }]) {
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

  test('year-2 balance matches an independent month-by-month loop', () => {
    const r = compute(base)
    const payment = Number(r.primary.value)
    let owed = 25_000
    const monthlyRate = 8.5 / 100 / 12
    for (let m = 0; m < 24; m += 1) owed = owed + owed * monthlyRate - payment
    const charted = r.series![0]!.points.find((p) => p[0] === 2)!
    expect(charted[1]).toBeCloseTo(owed, 4)
  })
})

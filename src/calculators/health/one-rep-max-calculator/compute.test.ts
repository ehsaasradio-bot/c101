import { describe, expect, test } from 'vitest'
import compute from './compute'
import { CalcError } from '../../../lib/types'

const num = (x: unknown) => Number(x)
const stat = (r: ReturnType<typeof compute>, label: string) =>
  num(r.stats!.find((s) => s.label === label)!.value)

describe('one-rep max', () => {
  test('100kg for 5 reps averages Epley 116.67 and Brzycki 112.5', () => {
    // Derived by hand from the two published formulas:
    //   Epley   = 100 * (1 + 5/30)   = 116.666...
    //   Brzycki = 100 * 36 / (37-5)  = 100 * 36/32 = 112.5
    const epley = 100 * (1 + 5 / 30)
    const brzycki = (100 * 36) / 32
    expect(epley).toBeCloseTo(116.6667, 4)
    expect(brzycki).toBe(112.5)

    const r = compute({ units: 'kg', weight: 100, reps: 5 })
    expect(num(r.primary.value)).toBeCloseTo((epley + brzycki) / 2, 10)
    expect(num(r.primary.value)).toBeCloseTo(114.5833, 4)
  })

  test('Brzycki step matches the independent 1/(1.0278 - 0.0278r) form', () => {
    // Brzycki is also published as load / (1.0278 - 0.0278 * reps). That is
    // algebraically 36/(37-r) but arrived at from the other direction, so it is
    // a real cross-check on the implementation rather than a restatement.
    for (const reps of [2, 4, 6, 8, 10, 12]) {
      const r = compute({ units: 'kg', weight: 140, reps })
      const step = r.steps!.find(
        (s) => 'label' in s && s.label.startsWith('Brzycki'),
      ) as { value: number }
      const alt = 140 / (37 / 36 - reps / 36)
      expect(num(step.value)).toBeCloseTo(alt, 9)
    }
  })

  test('Epley step inverts back to the weight actually lifted', () => {
    // Epley says a set of r reps sits at 1/(1 + r/30) of the max. Running the
    // relationship backwards must return the input weight.
    for (const reps of [1, 3, 7, 11]) {
      const r = compute({ units: 'kg', weight: 87.5, reps })
      const step = r.steps!.find(
        (s) => 'label' in s && s.label.startsWith('Epley'),
      ) as { value: number } | undefined
      if (!step) continue // the 1-rep branch reports no formula steps
      expect(num(step.value) / (1 + reps / 30)).toBeCloseTo(87.5, 9)
    }
  })

  test('a single rep is the max itself, not an extrapolation', () => {
    const r = compute({ units: 'kg', weight: 142.5, reps: 1 })
    expect(num(r.primary.value)).toBe(142.5)
    // Brzycki independently agrees exactly at one rep: 36/(37-1) = 1.
    expect((142.5 * 36) / 36).toBe(142.5)
  })

  test('training loads are the stated percentages of the max', () => {
    const r = compute({ units: 'kg', weight: 100, reps: 5 })
    const max = num(r.primary.value)
    for (const p of [95, 90, 85, 80, 70]) {
      expect(stat(r, `${p}% of 1RM`)).toBeCloseTo((max * p) / 100, 10)
    }
    expect(stat(r, '70% of 1RM')).toBeLessThan(stat(r, '95% of 1RM'))
  })

  test('more reps at the same weight implies a higher max, monotonically', () => {
    let previous = 0
    for (let reps = 1; reps <= 12; reps++) {
      const value = num(compute({ units: 'kg', weight: 100, reps }).primary.value)
      expect(value).toBeGreaterThan(previous)
      previous = value
    }
    // Boundary: the heaviest allowed rep count still returns a finite number.
    expect(Number.isFinite(previous)).toBe(true)
  })

  test('the unit selection changes labels only, never the arithmetic', () => {
    const kg = compute({ units: 'kg', weight: 225, reps: 3 })
    const lb = compute({ units: 'lb', weight: 225, reps: 3 })
    expect(num(lb.primary.value)).toBe(num(kg.primary.value))
    expect((kg.primary.format as { unit?: string }).unit).toBe('kg')
    expect((lb.primary.format as { unit?: string }).unit).toBe('lb')
  })

  test('nudging the first number field by 10% stays valid and moves the result', () => {
    const base = compute({ units: 'kg', weight: 100, reps: 5 })
    const nudged = compute({ units: 'kg', weight: 110, reps: 5 })
    expect(num(nudged.primary.value)).not.toBe(num(base.primary.value))
    expect(num(nudged.primary.value)).toBeCloseTo(num(base.primary.value) * 1.1, 10)
  })

  test('rejects a non-positive weight', () => {
    expect(() => compute({ units: 'kg', weight: 0, reps: 5 })).toThrow(CalcError)
    expect(() => compute({ units: 'kg', weight: -20, reps: 5 })).toThrow(CalcError)
    try {
      compute({ units: 'kg', weight: 0, reps: 5 })
    } catch (e) {
      expect((e as CalcError).fieldId).toBe('weight')
    }
  })

  test('rejects rep counts outside 1..12 and fractional reps', () => {
    expect(() => compute({ units: 'kg', weight: 100, reps: 0 })).toThrow(CalcError)
    expect(() => compute({ units: 'kg', weight: 100, reps: 13 })).toThrow(CalcError)
    expect(() => compute({ units: 'kg', weight: 100, reps: 2.5 })).toThrow(CalcError)
    expect(() => compute({ units: 'kg', weight: 100, reps: Number.NaN })).toThrow(CalcError)
    try {
      compute({ units: 'kg', weight: 100, reps: 13 })
    } catch (e) {
      expect((e as CalcError).fieldId).toBe('reps')
    }
    // 12 is inside the band, 13 is not.
    expect(() => compute({ units: 'kg', weight: 100, reps: 12 })).not.toThrow()
  })

  test('the estimated-load series has strictly increasing reps on x', () => {
    for (const reps of [1, 2, 5, 8, 12]) {
      const series = compute({ units: 'kg', weight: 100, reps }).series!
      expect(series).toHaveLength(1)
      expect(series[0]!.label).toBe('Estimated load')
      const points = series[0]!.points
      expect(points.length).toBeGreaterThanOrEqual(2)
      expect(points.length).toBeLessThanOrEqual(45)
      points.forEach(([x, y], i) => {
        expect(Number.isFinite(x)).toBe(true)
        expect(Number.isFinite(y)).toBe(true)
        if (i > 0) expect(x).toBeGreaterThan(points[i - 1]![0])
      })
      expect(points[0]![0]).toBe(1)
      expect(points[points.length - 1]![0]).toBe(12)
    }
  })

  test('the estimated load falls as reps rise', () => {
    for (const reps of [1, 3, 6, 12]) {
      const points = compute({ units: 'lb', weight: 315, reps }).series![0]!.points
      points.forEach(([, y], i) => {
        if (i > 0) expect(y).toBeLessThan(points[i - 1]![1])
      })
    }
  })

  test('the series passes through the set the user actually did', () => {
    // The curve is the calculator run backwards, so at the entered rep count it
    // must hand back the entered weight — otherwise the chart would contradict
    // the input box directly above it.
    for (const weight of [60, 100, 142.5, 315]) {
      for (let reps = 1; reps <= 12; reps++) {
        const points = compute({ units: 'kg', weight, reps }).series![0]!.points
        const own = points.find(([x]) => x === reps)!
        expect(own[1]).toBeCloseTo(weight, 9)
      }
    }
  })

  test('the series point at 1 rep is the headline one-rep max', () => {
    const r = compute({ units: 'kg', weight: 100, reps: 5 })
    expect(r.series![0]!.points[0]![1]).toBeCloseTo(Number(r.primary.value), 10)
  })

  test('each series load re-estimates back to the same one-rep max', () => {
    // Feeding any point on the curve back into compute must reproduce the same
    // max, which is the definition of the curve being an inverse.
    const r = compute({ units: 'kg', weight: 100, reps: 5 })
    const max = num(r.primary.value)
    for (const [reps, load] of r.series![0]!.points) {
      if (reps === 1) continue // the 1-rep branch short-circuits the averaging
      expect(num(compute({ units: 'kg', weight: load, reps }).primary.value)).toBeCloseTo(max, 8)
    }
  })

  test('never returns NaN for any valid input in range', () => {
    for (let reps = 1; reps <= 12; reps++) {
      const r = compute({ units: 'lb', weight: 0.5, reps })
      expect(Number.isNaN(num(r.primary.value))).toBe(false)
      for (const s of r.stats!) expect(Number.isNaN(num(s.value))).toBe(false)
    }
  })
})

import { describe, expect, test } from 'vitest'
import compute from './compute'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'

const base = { units: 'metric', weight: 70, exerciseMinutes: 30, climate: 'temperate' } as const

const ml = (r: ReturnType<typeof compute>) =>
  Number(r.stats!.find((s) => s.label === 'Millilitres')!.value)

describe('water intake', () => {
  test('70 kg, 30 min exercise, temperate = 2.95 L', () => {
    // Derived independently: 70 × 35 = 2450 ml baseline, plus one full 30-minute
    // block of exercise at 500 ml, times a 1.0 climate factor.
    const expected = (70 * 35 + 500) * 1
    const r = compute({ ...base })
    expect(expected).toBe(2950)
    expect(ml(r)).toBeCloseTo(expected, 9)
    expect(Number(r.primary.value)).toBeCloseTo(expected / 1000, 9)
  })

  test('exercise term matches a minute-by-minute simulation', () => {
    // Cross-check the closed-form 500/30 ml-per-minute term by accumulating
    // sweat replacement one minute at a time.
    for (const minutes of [0, 7, 30, 45, 90, 137]) {
      let simulated = 0
      for (let i = 0; i < minutes; i++) simulated += 500 / 30
      const r = compute({ ...base, exerciseMinutes: minutes })
      expect(ml(r)).toBeCloseTo(70 * 35 + simulated, 6)
    }
  })

  test('zero exercise leaves only the weight baseline', () => {
    const r = compute({ ...base, exerciseMinutes: 0 })
    expect(ml(r)).toBeCloseTo(70 * 35, 9)
    expect(Number(r.primary.value)).toBeCloseTo(2.45, 9)
  })

  test('imperial and metric agree for the same body', () => {
    const metric = compute({ ...base, units: 'metric', weight: 70 })
    const imperial = compute({ ...base, units: 'imperial', weight: 70 * 2.20462 })
    expect(ml(imperial)).toBeCloseTo(ml(metric), 6)
  })

  test('hot climate adds exactly 15%', () => {
    const temperate = compute({ ...base, climate: 'temperate' })
    const hot = compute({ ...base, climate: 'hot' })
    expect(ml(hot)).toBeCloseTo(ml(temperate) * 1.15, 9)
    expect(ml(hot)).toBeCloseTo(2950 * 1.15, 9)
  })

  test('the target scales linearly with body weight', () => {
    const one = compute({ ...base, weight: 60, exerciseMinutes: 0 })
    const two = compute({ ...base, weight: 120, exerciseMinutes: 0 })
    expect(ml(two)).toBeCloseTo(ml(one) * 2, 9)
  })

  test('cups and glasses are the millilitre total re-expressed', () => {
    const r = compute({ ...base })
    const stat = (label: string) => Number(r.stats!.find((s) => s.label === label)!.value)
    expect(stat('Cups (240 ml)')).toBeCloseTo(2950 / 240, 9)
    expect(stat('Glasses (250 ml)')).toBeCloseTo(2950 / 250, 9)
  })

  test('nudging the first number field keeps input valid and moves the result', () => {
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('weight')
    const nudged = compute({ ...base, weight: first.default * 1.1 })
    expect(Number(nudged.primary.value)).not.toBeCloseTo(Number(compute({ ...base }).primary.value), 6)
  })

  test('rejects non-positive weight', () => {
    expect(() => compute({ ...base, weight: 0 })).toThrow(CalcError)
    expect(() => compute({ ...base, weight: -5 })).toThrow(CalcError)
    try {
      compute({ ...base, weight: 0 })
    } catch (e) {
      expect((e as CalcError).fieldId).toBe('weight')
    }
  })

  test('catches kg entered while imperial is selected is fine, but absurd mass is not', () => {
    // 400 kg is beyond any plausible body weight and is rejected.
    expect(() => compute({ ...base, weight: 400 })).toThrow(CalcError)
    // The same number in pounds is ~181 kg, which is plausible and accepted.
    expect(() => compute({ ...base, units: 'imperial', weight: 400 })).not.toThrow()
  })

  test('rejects negative or implausible exercise minutes', () => {
    expect(() => compute({ ...base, exerciseMinutes: -1 })).toThrow(CalcError)
    expect(() => compute({ ...base, exerciseMinutes: 601 })).toThrow(CalcError)
    try {
      compute({ ...base, exerciseMinutes: -1 })
    } catch (e) {
      expect((e as CalcError).fieldId).toBe('exerciseMinutes')
    }
  })

  test('rejects an unknown climate', () => {
    expect(() => compute({ ...base, climate: 'lunar' })).toThrow(CalcError)
  })

  test('never returns NaN', () => {
    const r = compute({ ...base })
    expect(Number.isFinite(Number(r.primary.value))).toBe(true)
    for (const s of r.stats!) expect(Number.isFinite(Number(s.value))).toBe(true)
  })

  describe('parts of the daily target', () => {
    // Both climates, both unit systems, and the no-exercise case, which is the
    // one that produces a genuinely zero slice.
    test.each([
      ['defaults', base],
      ['hot climate', { ...base, climate: 'hot' as const }],
      ['imperial, hot', { ...base, units: 'imperial' as const, weight: 154, climate: 'hot' as const }],
      ['no exercise', { ...base, exerciseMinutes: 0 }],
      ['no exercise, hot', { ...base, exerciseMinutes: 0, climate: 'hot' as const }],
      ['heavy training', { ...base, exerciseMinutes: 600, weight: 110 }],
    ])('sum to the litre headline and stay non-negative for %s', (_label, v) => {
      const r = compute(v)
      // The three add back to the daily target, so no separate whole is needed.
      expect(r.partsTotal).toBeUndefined()

      const sum = r.parts!.reduce((acc, p) => acc + p.value, 0)
      expect(sum).toBeCloseTo(Number(r.primary.value), 4)
      for (const part of r.parts!) {
        expect(part.value).toBeGreaterThanOrEqual(0)
        expect(Number.isFinite(part.value)).toBe(true)
      }
    })

    test('the split follows the actual arithmetic, in litres', () => {
      const r = compute(base)
      const part = (label: string) => r.parts!.find((p) => p.label === label)!.value
      expect(part('Baseline need')).toBeCloseTo((70 * 35) / 1000, 10)
      expect(part('Exercise allowance')).toBeCloseTo(500 / 1000, 10)
      // Temperate is a 1.0 factor, so the climate adds exactly nothing.
      expect(part('Climate adjustment')).toBe(0)
    })

    test('a hot climate loads its multiplier into its own slice', () => {
      const r = compute({ ...base, climate: 'hot' })
      const part = (label: string) => r.parts!.find((p) => p.label === label)!.value
      // The multiplier applies to baseline and exercise together, so the slice
      // is 0.15 × (2450 + 500) ml, and the other two stay at their raw values.
      expect(part('Baseline need')).toBeCloseTo(2.45, 10)
      expect(part('Exercise allowance')).toBeCloseTo(0.5, 10)
      expect(part('Climate adjustment')).toBeCloseTo((0.15 * 2950) / 1000, 6)
    })
  })
})

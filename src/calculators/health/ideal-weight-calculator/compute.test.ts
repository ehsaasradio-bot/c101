import { describe, expect, test } from 'vitest'
import compute from './compute'
import { CalcError } from '../../../lib/types'

const stat = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)

describe('ideal weight', () => {
  test('a 70in (5ft 10in) male matches the four formulas worked by hand', () => {
    const r = compute({ units: 'imperial', sex: 'male', height: 70 })
    // over = 10in. Devine 50+2.3*10, Robinson 52+1.9*10, Miller 56.2+1.41*10,
    // Hamwi 48+2.7*10 — all in kg, then converted to lb by the calculator.
    const expectedKg = { Devine: 73, Robinson: 71, Miller: 70.3, Hamwi: 75 }
    for (const [name, kg] of Object.entries(expectedKg)) {
      expect(stat(r, name)).toBeCloseTo(kg * 2.20462, 3)
    }
    const avgKg = Object.values(expectedKg).reduce((a, b) => a + b, 0) / 4
    expect(avgKg).toBeCloseTo(72.325, 6)
    expect(Number(r.primary.value)).toBeCloseTo(avgKg * 2.20462, 3)
  })

  test('at exactly 5ft the result is the mean of the four base weights', () => {
    const male = compute({ units: 'imperial', sex: 'male', height: 60 })
    expect(Number(male.primary.value)).toBeCloseTo(((50 + 52 + 56.2 + 48) / 4) * 2.20462, 4)

    const female = compute({ units: 'imperial', sex: 'female', height: 60 })
    expect(Number(female.primary.value)).toBeCloseTo(
      ((45.5 + 49 + 53.1 + 45.5) / 4) * 2.20462,
      4,
    )
    // Every formula's height term drops out at the anchor.
    expect(stat(male, 'Devine')).toBeCloseTo(50 * 2.20462, 4)
    expect(stat(female, 'Hamwi')).toBeCloseTo(45.5 * 2.20462, 4)
  })

  test('metric and imperial describe the same body', () => {
    const imperial = compute({ units: 'imperial', sex: 'female', height: 65 })
    const metric = compute({ units: 'metric', sex: 'female', height: 65 * 2.54 })
    // Same person, different units: kg reading = lb reading / 2.20462.
    expect(Number(metric.primary.value) * 2.20462).toBeCloseTo(Number(imperial.primary.value), 6)
    expect(stat(metric, 'Robinson') * 2.20462).toBeCloseTo(stat(imperial, 'Robinson'), 6)
  })

  test('the average is linear in height, cross-checked by a slope walk', () => {
    // Independent method: the mean of four linear functions is itself linear, so
    // stepping height by 1in must add a constant = mean of the four per-inch terms.
    const perInchMale = (2.3 + 1.9 + 1.41 + 2.7) / 4
    let prev = Number(compute({ units: 'imperial', sex: 'male', height: 60 }).primary.value)
    for (let h = 61; h <= 78; h++) {
      const next = Number(compute({ units: 'imperial', sex: 'male', height: h }).primary.value)
      expect(next - prev).toBeCloseTo(perInchMale * 2.20462, 6)
      prev = next
    }
  })

  test('men come out heavier than women at the same height', () => {
    const m = Number(compute({ units: 'metric', sex: 'male', height: 175 }).primary.value)
    const f = Number(compute({ units: 'metric', sex: 'female', height: 175 }).primary.value)
    expect(m).toBeGreaterThan(f)
  })

  test('the ideal weight sits inside the healthy BMI range', () => {
    const r = compute({ units: 'metric', sex: 'male', height: 175 })
    const bmi = Number(r.primary.value) / (1.75 * 1.75)
    expect(bmi).toBeGreaterThan(18.5)
    expect(bmi).toBeLessThan(24.9)
    expect(stat(r, 'Healthy BMI range (low)')).toBeCloseTo(18.5 * 1.75 * 1.75, 6)
    expect(stat(r, 'Healthy BMI range (high)')).toBeCloseTo(24.9 * 1.75 * 1.75, 6)
  })

  test('nudging the default height changes the primary result', () => {
    const base = Number(compute({ units: 'metric', sex: 'male', height: 175 }).primary.value)
    const nudged = Number(compute({ units: 'metric', sex: 'male', height: 192.5 }).primary.value)
    expect(nudged).toBeGreaterThan(base)
  })

  test('rejects bad input with CalcError', () => {
    expect(() => compute({ units: 'metric', sex: 'male', height: 0 })).toThrow(CalcError)
    expect(() => compute({ units: 'metric', sex: 'male', height: 110 })).toThrow(CalcError)
    expect(() => compute({ units: 'metric', sex: 'male', height: 300 })).toThrow(CalcError)
    // centimetres entered while imperial is selected
    expect(() => compute({ units: 'imperial', sex: 'male', height: 175 })).toThrow(CalcError)
    expect(() => compute({ units: 'metric', sex: 'other' as 'male', height: 175 })).toThrow(
      CalcError,
    )
  })

  test('CalcError points at the offending field', () => {
    try {
      compute({ units: 'metric', sex: 'male', height: -5 })
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(CalcError)
      expect((e as CalcError).fieldId).toBe('height')
    }
  })
})

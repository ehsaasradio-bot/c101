import { describe, expect, test } from 'vitest'
import compute from './compute'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'

const base = { units: 'metric', sex: 'male', weight: 70, height: 175, age: 30 } as const

/**
 * A second, independent restatement of Mifflin-St Jeor: instead of the closed
 * form, accumulate the four terms one at a time. If the implementation drifts,
 * this disagrees.
 */
function mifflinByAccumulation(kg: number, cm: number, age: number, sex: 'male' | 'female') {
  let total = 0
  for (let i = 0; i < 10; i++) total += kg
  for (let i = 0; i < 25; i++) total += cm / 4 // 25 x (cm/4) === 6.25 x cm
  for (let i = 0; i < 5; i++) total -= age
  return total + (sex === 'male' ? 5 : -161)
}

describe('bmr', () => {
  test('70kg, 175cm, 30yo male is 1648.75 kcal/day', () => {
    // 10x70 = 700, 6.25x175 = 1093.75, -5x30 = -150, +5 => 1648.75
    const r = compute(base)
    expect(Number(r.primary.value)).toBeCloseTo(1648.75, 6)
  })

  test('matches an independently accumulated Mifflin-St Jeor across a grid', () => {
    for (const sex of ['male', 'female'] as const) {
      for (const weight of [45, 70, 92.5, 120]) {
        for (const height of [150, 175.5, 198]) {
          for (const age of [18, 30, 64, 91]) {
            const r = compute({ units: 'metric', sex, weight, height, age })
            expect(Number(r.primary.value)).toBeCloseTo(
              mifflinByAccumulation(weight, height, age, sex),
              6,
            )
          }
        }
      }
    }
  })

  test('the female constant sits exactly 166 kcal below the male one', () => {
    const male = Number(compute(base).primary.value)
    const female = Number(compute({ ...base, sex: 'female' }).primary.value)
    expect(male - female).toBeCloseTo(166, 9) // 5 - (-161)
  })

  test('imperial and metric agree for the same body', () => {
    const metric = compute(base)
    // 70 kg and 175 cm expressed in lb and inches.
    const imperial = compute({
      ...base,
      units: 'imperial',
      weight: 70 * 2.20462,
      height: 175 / 2.54,
    })
    expect(Number(imperial.primary.value)).toBeCloseTo(Number(metric.primary.value), 3)
  })

  test('activity stats are the BMR scaled by their stated multipliers', () => {
    const r = compute(base)
    const bmr = Number(r.primary.value)
    const factors = [1.2, 1.375, 1.55, 1.725]
    expect(r.stats).toHaveLength(4)
    r.stats!.forEach((s, i) => {
      expect(Number(s.value)).toBeCloseTo(bmr * factors[i], 6)
    })
    // Every activity level must exceed resting burn, and the list must ascend.
    const values = r.stats!.map((s) => Number(s.value))
    expect(Math.min(...values)).toBeGreaterThan(bmr)
    expect([...values].sort((a, b) => a - b)).toEqual(values)
  })

  test('the steps sum to the primary result', () => {
    const r = compute(base)
    const terms = ['10 x weight', '6.25 x height', '-5 x age', 'Sex constant']
    const sum = terms.reduce((acc, label) => {
      const step = r.steps!.find((s) => 'label' in s && s.label === label)
      return acc + Number((step as { value: number }).value)
    }, 0)
    expect(sum).toBeCloseTo(Number(r.primary.value), 6)
  })

  test('BMR is monotonic: heavier and taller raise it, older lowers it', () => {
    const bmr = (patch: Partial<Parameters<typeof compute>[0]>) =>
      Number(compute({ ...base, ...patch }).primary.value)
    expect(bmr({ weight: 71 })).toBeGreaterThan(bmr({}))
    expect(bmr({ height: 176 })).toBeGreaterThan(bmr({}))
    expect(bmr({ age: 31 })).toBeLessThan(bmr({}))
  })

  test('the e2e nudge of the first number field stays valid and moves the result', () => {
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('weight')
    const nudged = first.default * 1.1
    expect(nudged).toBeGreaterThanOrEqual(first.min!)
    expect(nudged).toBeLessThanOrEqual(first.max!)
    const after = compute({ ...base, weight: nudged })
    // +7 kg at a coefficient of 10 is exactly +70 kcal.
    expect(Number(after.primary.value) - Number(compute(base).primary.value)).toBeCloseTo(70, 6)
  })

  test('every number field default sits inside its own bounds', () => {
    for (const f of fields) {
      if (f.kind !== 'number') continue
      expect(f.default).toBeGreaterThanOrEqual(f.min!)
      expect(f.default).toBeLessThanOrEqual(f.max!)
    }
  })

  test.each([
    ['zero weight', { weight: 0 }, 'weight'],
    ['negative weight', { weight: -5 }, 'weight'],
    ['zero height', { height: 0 }, 'height'],
    ['zero age', { age: 0 }, 'age'],
    ['an impossible age', { age: 200 }, 'age'],
    ['cm entered while imperial is selected', { units: 'imperial', height: 175 }, 'height'],
  ])('rejects %s with a CalcError naming the field', (_label, patch, fieldId) => {
    let thrown: unknown
    try {
      compute({ ...base, ...patch })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
  })

  test('never returns NaN for a malformed sex value', () => {
    expect(() => compute({ ...base, sex: 'other' as 'male' })).toThrow(CalcError)
  })
})

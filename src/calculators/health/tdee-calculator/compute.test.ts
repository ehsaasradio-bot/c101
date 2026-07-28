import { describe, expect, test } from 'vitest'
import compute from './compute'
import { CalcError } from '../../../lib/types'

const base = {
  units: 'metric',
  sex: 'male',
  weight: 70,
  height: 175,
  age: 30,
  activityLevel: 'moderate',
} as const

const stat = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)

describe('tdee', () => {
  test('BMR for a 70kg 175cm 30yo male is 1648.75 kcal', () => {
    // Mifflin-St Jeor, worked by hand:
    // 10*70 = 700; 6.25*175 = 1093.75; 5*30 = 150; male constant +5
    // 700 + 1093.75 - 150 + 5 = 1648.75
    const r = compute(base)
    expect(stat(r, 'BMR (at complete rest)')).toBeCloseTo(1648.75, 6)
  })

  test('moderate TDEE is BMR times 1.55', () => {
    const r = compute(base)
    expect(Number(r.primary.value)).toBeCloseTo(1648.75 * 1.55, 6)
    expect(Number(r.primary.value)).toBeCloseTo(2555.5625, 4)
  })

  test('the male and female constants differ by exactly 166 kcal', () => {
    const male = stat(compute(base), 'BMR (at complete rest)')
    const female = stat(compute({ ...base, sex: 'female' }), 'BMR (at complete rest)')
    expect(male - female).toBeCloseTo(166, 9)
  })

  test('imperial input agrees with the equivalent metric body', () => {
    const metric = compute(base)
    const imperial = compute({
      ...base,
      units: 'imperial',
      weight: 70 * 2.20462, // kg -> lb
      height: 175 / 2.54, // cm -> in
    })
    expect(Number(imperial.primary.value)).toBeCloseTo(Number(metric.primary.value), 4)
  })

  test('each activity step raises TDEE, and the ratio to BMR is the published factor', () => {
    const factors = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      very: 1.725,
      athlete: 1.9,
    } as const
    let previous = 0
    for (const [level, factor] of Object.entries(factors)) {
      const r = compute({ ...base, activityLevel: level })
      const tdee = Number(r.primary.value)
      const bmr = stat(r, 'BMR (at complete rest)')
      expect(tdee / bmr).toBeCloseTo(factor, 9)
      expect(tdee).toBeGreaterThan(previous)
      previous = tdee
    }
  })

  test('the loss and gain targets straddle maintenance by 500 each', () => {
    const r = compute(base)
    const tdee = Number(r.primary.value)
    expect(stat(r, 'Mild weight loss (-500)')).toBeCloseTo(tdee - 500, 9)
    expect(stat(r, 'Mild weight gain (+500)')).toBeCloseTo(tdee + 500, 9)
    expect(stat(r, 'Mild weight gain (+500)') - stat(r, 'Mild weight loss (-500)')).toBeCloseTo(
      1000,
      9,
    )
  })

  test('BMR falls by exactly 5 kcal per year of age and rises 10 per kg', () => {
    // `base` is `as const`, so Partial<typeof base> would pin each number to its
    // exact literal (age: 30) and reject the perturbations this test exists to make.
    const bmr = (over: Partial<Record<keyof typeof base, number | string>>) =>
      stat(compute({ ...base, ...over } as Parameters<typeof compute>[0]), 'BMR (at complete rest)')
    expect(bmr({ age: 31 })).toBeCloseTo(bmr({}) - 5, 9)
    expect(bmr({ weight: 71 })).toBeCloseTo(bmr({}) + 10, 9)
    expect(bmr({ height: 176 })).toBeCloseTo(bmr({}) + 6.25, 9)
  })

  test('nudging the first number field keeps input valid and moves the result', () => {
    const nudged = compute({ ...base, weight: 70 * 1.1 })
    expect(Number(nudged.primary.value)).toBeGreaterThan(Number(compute(base).primary.value))
  })

  test('a very low maintenance figure adds a safety note', () => {
    const low = compute({
      ...base,
      sex: 'female',
      weight: 45,
      height: 150,
      age: 60,
      activityLevel: 'sedentary',
    })
    expect(Number(low.primary.value) - 500).toBeLessThan(1200)
    expect(low.notes!.length).toBe(3)
    expect(compute(base).notes!.length).toBe(2)
  })

  test('rejects non-positive measurements', () => {
    expect(() => compute({ ...base, weight: 0 })).toThrow(CalcError)
    expect(() => compute({ ...base, height: 0 })).toThrow(CalcError)
    expect(() => compute({ ...base, age: 0 })).toThrow(CalcError)
  })

  test('rejects an implausible age', () => {
    expect(() => compute({ ...base, age: 130 })).toThrow(CalcError)
  })

  test('catches cm entered while imperial is selected', () => {
    expect(() => compute({ ...base, units: 'imperial', weight: 154, height: 175 })).toThrow(
      CalcError,
    )
  })

  test('rejects unknown select values with the offending field id', () => {
    expect(() => compute({ ...base, activityLevel: 'lazy' })).toThrow(CalcError)
    try {
      compute({ ...base, activityLevel: 'lazy' })
    } catch (e) {
      expect((e as CalcError).fieldId).toBe('activityLevel')
    }
    try {
      compute({ ...base, sex: 'other' })
    } catch (e) {
      expect((e as CalcError).fieldId).toBe('sex')
    }
  })

  describe('BMR and activity parts', () => {
    // Both sexes, both unit systems, and the two extremes of the multiplier —
    // sedentary at 1.2 gives the smallest activity slice, athlete at 1.9 the
    // largest, and neither may push a part below zero.
    test.each([
      ['defaults', base],
      ['female', { ...base, sex: 'female' as const }],
      ['imperial', { ...base, units: 'imperial' as const, weight: 154, height: 69 }],
      ['sedentary', { ...base, activityLevel: 'sedentary' as const }],
      ['athlete', { ...base, activityLevel: 'athlete' as const }],
      [
        'older female, sedentary',
        { ...base, sex: 'female' as const, age: 75, weight: 52, activityLevel: 'sedentary' as const },
      ],
    ])('sum to the headline TDEE and stay non-negative for %s', (_label, v) => {
      const r = compute(v)
      // The parts decompose the primary itself, so there is no separate whole.
      expect(r.partsTotal).toBeUndefined()

      const sum = r.parts!.reduce((acc, p) => acc + p.value, 0)
      expect(sum).toBeCloseTo(Number(r.primary.value), 4)
      for (const part of r.parts!) {
        expect(part.value).toBeGreaterThanOrEqual(0)
        expect(Number.isFinite(part.value)).toBe(true)
      }
    })

    test('the BMR part matches the BMR stat and activity burn is the remainder', () => {
      const r = compute(base)
      const bmrPart = r.parts!.find((p) => p.label === 'BMR')!.value
      const burn = r.parts!.find((p) => p.label === 'Activity burn')!.value
      expect(bmrPart).toBeCloseTo(stat(r, 'BMR (at complete rest)'), 10)
      // 1648.75 × 1.55 = 2555.5625, so the activity share is 1648.75 × 0.55.
      expect(bmrPart).toBeCloseTo(1648.75, 4)
      expect(burn).toBeCloseTo(1648.75 * 0.55, 4)
    })

    test('a sedentary multiplier still leaves a positive activity slice', () => {
      const r = compute({ ...base, activityLevel: 'sedentary' })
      expect(r.parts!.find((p) => p.label === 'Activity burn')!.value).toBeGreaterThan(0)
    })

    test('an impossible resting rate is rejected rather than made negative', () => {
      // 20 kg, 60 cm, 100 years, female: the linear fit runs below zero here.
      let thrown: unknown
      try {
        compute({ ...base, sex: 'female', weight: 20, height: 60, age: 100 })
      } catch (err) {
        thrown = err
      }
      expect(thrown).toBeInstanceOf(CalcError)
      expect((thrown as CalcError).fieldId).toBe('weight')
    })
  })
})

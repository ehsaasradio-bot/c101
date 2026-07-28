import { describe, expect, test } from 'vitest'
import compute, { KCAL_PER_GRAM, SPLITS } from './compute'
import def from './index'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'

const gramsOf = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)

describe('macro splits', () => {
  test('every split sums to exactly 100 percent', () => {
    for (const [id, s] of Object.entries(SPLITS)) {
      expect(`${id}:${s.protein + s.carbs + s.fat}`).toBe(`${id}:100`)
    }
  })

  test('every select option maps to a defined split', () => {
    const select = fields.find((f) => f.id === 'goal')!
    const values = (select as { options: readonly { value: string }[] }).options.map(
      (o) => o.value,
    )
    expect(values.sort()).toEqual(Object.keys(SPLITS).sort())
  })
})

describe('macro calculator', () => {
  test('2000 kcal balanced gives 150g protein, 200g carbs, 67g fat', () => {
    // Derived: 2000 × 30% = 600 kcal ÷ 4 = 150 g; 2000 × 40% = 800 ÷ 4 = 200 g;
    // 2000 × 30% = 600 ÷ 9 = 66.67 g.
    const r = compute({ calories: 2000, goal: 'balanced' })
    expect(Number(r.primary.value)).toBeCloseTo(150, 10)
    expect(gramsOf(r, 'Carbohydrate')).toBeCloseTo(200, 10)
    expect(gramsOf(r, 'Fat')).toBeCloseTo(600 / 9, 10)
  })

  test.each(Object.keys(SPLITS))(
    'grams re-multiplied by their energy density recover the calorie target (%s)',
    (goal) => {
      // Independent check: go the other way round, from grams back to calories.
      const calories = 2350
      const r = compute({ calories, goal })
      const back =
        Number(r.primary.value) * KCAL_PER_GRAM.protein +
        gramsOf(r, 'Carbohydrate') * KCAL_PER_GRAM.carbs +
        gramsOf(r, 'Fat') * KCAL_PER_GRAM.fat
      expect(back).toBeCloseTo(calories, 8)
      // And the reported per-macro calories must agree with the grams.
      expect(gramsOf(r, 'Protein calories')).toBeCloseTo(
        Number(r.primary.value) * KCAL_PER_GRAM.protein,
        8,
      )
      expect(gramsOf(r, 'Fat calories')).toBeCloseTo(gramsOf(r, 'Fat') * KCAL_PER_GRAM.fat, 8)
    },
  )

  test('output scales linearly with calories', () => {
    const one = compute({ calories: 1500, goal: 'lowCarb' })
    const two = compute({ calories: 3000, goal: 'lowCarb' })
    expect(Number(two.primary.value)).toBeCloseTo(Number(one.primary.value) * 2, 10)
    expect(gramsOf(two, 'Fat')).toBeCloseTo(gramsOf(one, 'Fat') * 2, 10)
  })

  test('the low-carb split trades carbs for protein and fat', () => {
    const balanced = compute({ calories: 2000, goal: 'balanced' })
    const low = compute({ calories: 2000, goal: 'lowCarb' })
    expect(gramsOf(low, 'Carbohydrate')).toBeLessThan(gramsOf(balanced, 'Carbohydrate'))
    expect(Number(low.primary.value)).toBeGreaterThan(Number(balanced.primary.value))
    expect(gramsOf(low, 'Fat')).toBeGreaterThan(gramsOf(balanced, 'Fat'))
  })

  test('the default calorie value nudged to 1.1x is valid and moves the result', () => {
    // The end-to-end suite nudges the first number field this way.
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('calories')
    const nudged = first.default * 1.1
    expect(nudged).toBeGreaterThanOrEqual(first.min!)
    expect(nudged).toBeLessThanOrEqual(first.max!)
    const before = compute({ calories: first.default, goal: def.fields[1].default })
    const after = compute({ calories: nudged, goal: def.fields[1].default })
    expect(Number(after.primary.value)).not.toBe(Number(before.primary.value))
  })

  test('rejects a non-positive calorie target', () => {
    for (const calories of [0, -500]) {
      let thrown: unknown
      try {
        compute({ calories, goal: 'balanced' })
      } catch (err) {
        thrown = err
      }
      expect(thrown).toBeInstanceOf(CalcError)
      expect((thrown as CalcError).fieldId).toBe('calories')
    }
  })

  test('rejects an implausible calorie target rather than returning a number', () => {
    let thrown: unknown
    try {
      compute({ calories: 999_999, goal: 'balanced' })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe('calories')
  })

  test('rejects an unknown split', () => {
    let thrown: unknown
    try {
      compute({ calories: 2000, goal: 'keto' })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe('goal')
  })

  test('never emits NaN for valid input', () => {
    const r = compute({ calories: 800, goal: 'highCarb' })
    const all = [r.primary, ...r.stats!, ...r.steps!.filter((s) => 'value' in s)]
    for (const q of all) expect(Number.isFinite(Number((q as { value: number }).value))).toBe(true)
  })

  describe('calorie parts', () => {
    const goals = Object.keys(SPLITS)

    // Every goal, at both ends of the allowed calorie range. Grams would not add
    // up to anything meaningful; calories are the common currency.
    test.each(goals.flatMap((goal) => [800, 2000, 6000].map((calories) => [goal, calories] as const)))(
      'the %s split at %i kcal sums to the calorie target',
      (goal, calories) => {
        const r = compute({ calories, goal })
        expect(r.partsTotal).toBeDefined()
        expect(r.partsTotal!.label).toBe('Daily calories')
        expect(Number(r.partsTotal!.value)).toBe(calories)

        const sum = r.parts!.reduce((acc, p) => acc + p.value, 0)
        expect(sum).toBeCloseTo(calories, 4)
        for (const part of r.parts!) {
          expect(part.value).toBeGreaterThanOrEqual(0)
          expect(Number.isFinite(part.value)).toBe(true)
        }
      },
    )

    test('each part is its share of the target, and converts back to its grams', () => {
      const r = compute({ calories: 2000, goal: 'balanced' })
      const part = (label: string) => r.parts!.find((p) => p.label === label)!.value
      expect(part('Protein')).toBeCloseTo(600, 10)
      expect(part('Carbs')).toBeCloseTo(800, 10)
      expect(part('Fat')).toBeCloseTo(600, 10)

      expect(part('Protein') / KCAL_PER_GRAM.protein).toBeCloseTo(Number(r.primary.value), 10)
      expect(part('Carbs') / KCAL_PER_GRAM.carbs).toBeCloseTo(gramsOf(r, 'Carbohydrate'), 10)
      expect(part('Fat') / KCAL_PER_GRAM.fat).toBeCloseTo(gramsOf(r, 'Fat'), 10)
    })

    test('the parts total is the whole, not the headline', () => {
      // The primary is grams of protein — 150 g at 2000 kcal balanced — so the
      // parts must declare their own total or the donut would print a lie.
      const r = compute({ calories: 2000, goal: 'balanced' })
      expect(Number(r.primary.value)).toBeCloseTo(150, 10)
      expect(Number(r.partsTotal!.value)).toBe(2000)
    })
  })
})

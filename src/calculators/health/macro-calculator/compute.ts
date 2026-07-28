import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

/** Atwater energy factors: the kcal delivered by one gram of each macronutrient. */
export const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const

/**
 * Percentage of total daily energy assigned to each macronutrient.
 * Every split must sum to exactly 100 — the test suite asserts this.
 */
export const SPLITS = {
  balanced: { protein: 30, carbs: 40, fat: 30 },
  lowCarb: { protein: 40, carbs: 20, fat: 40 },
  highCarb: { protein: 25, carbs: 55, fat: 20 },
} as const

export type SplitId = keyof typeof SPLITS

export default function compute(v: Values<typeof fields>): CalcResult {
  const { calories } = v
  // `goal` is a select, so it arrives as a string.
  const goal = v.goal as SplitId

  if (!Number.isFinite(calories) || !(calories > 0))
    throw new CalcError('Enter a calorie target greater than 0.', 'calories')
  if (calories > 20_000)
    throw new CalcError('That calorie target is implausibly high.', 'calories')

  const split = SPLITS[goal]
  if (!split) throw new CalcError('Choose one of the available macro splits.', 'goal')

  const proteinKcal = (calories * split.protein) / 100
  const carbsKcal = (calories * split.carbs) / 100
  const fatKcal = (calories * split.fat) / 100

  const proteinGrams = proteinKcal / KCAL_PER_GRAM.protein
  const carbsGrams = carbsKcal / KCAL_PER_GRAM.carbs
  const fatGrams = fatKcal / KCAL_PER_GRAM.fat

  const grams = { style: 'decimal', decimals: 0, unit: 'g' } as const
  const kcal = { style: 'decimal', decimals: 0, unit: 'kcal' } as const

  return {
    primary: { label: 'Daily protein', value: proteinGrams, format: grams },
    stats: [
      { label: 'Carbohydrate', value: carbsGrams, format: grams },
      { label: 'Fat', value: fatGrams, format: grams },
      { label: 'Protein calories', value: proteinKcal, format: kcal },
      { label: 'Carbohydrate calories', value: carbsKcal, format: kcal },
      { label: 'Fat calories', value: fatKcal, format: kcal },
      { label: 'Protein per meal (3 meals)', value: proteinGrams / 3, format: grams },
    ],
    steps: [
      { label: 'Calorie target', value: calories, format: kcal },
      { rule: true },
      { label: 'Protein share', value: split.protein, format: { style: 'percent', decimals: 0 } },
      { label: 'Carbohydrate share', value: split.carbs, format: { style: 'percent', decimals: 0 } },
      { label: 'Fat share', value: split.fat, format: { style: 'percent', decimals: 0 } },
      { rule: true },
      { label: 'Protein kcal ÷ 4', value: proteinGrams, format: grams },
      { label: 'Carbohydrate kcal ÷ 4', value: carbsGrams, format: grams },
      { label: 'Fat kcal ÷ 9', value: fatGrams, format: grams },
    ],
    // Grams are not comparable across macronutrients — a gram of fat carries
    // more than twice the energy of a gram of carbohydrate — so the proportions
    // are expressed in calories, where the three shares do sum to the target.
    // The headline is grams of protein, so the whole needs stating explicitly.
    parts: [
      { label: 'Protein', value: proteinKcal, format: kcal },
      { label: 'Carbs', value: carbsKcal, format: kcal },
      { label: 'Fat', value: fatKcal, format: kcal },
    ],
    partsTotal: { label: 'Daily calories', value: calories, format: kcal },
    notes: [
      'Protein and carbohydrate supply 4 kcal per gram, fat supplies 9 kcal per gram, so the same percentage buys fewer grams of fat.',
      'These splits are starting points. Very active people and those in a calorie deficit usually do better with protein at the higher end.',
    ],
  }
}

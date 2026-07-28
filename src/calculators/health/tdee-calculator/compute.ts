import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

const LB_PER_KG = 2.20462
const CM_PER_IN = 2.54

/** Multipliers applied to BMR to reach total daily energy expenditure. */
const ACTIVITY: Record<string, { factor: number; label: string }> = {
  sedentary: { factor: 1.2, label: 'Sedentary' },
  light: { factor: 1.375, label: 'Lightly active' },
  moderate: { factor: 1.55, label: 'Moderately active' },
  very: { factor: 1.725, label: 'Very active' },
  athlete: { factor: 1.9, label: 'Athlete' },
}

/** A 500 kcal/day gap is roughly 0.45 kg (1 lb) of body mass per week. */
const ADJUSTMENT = 500

export default function compute(v: Values<typeof fields>): CalcResult {
  const { units, sex, weight, height, age, activityLevel } = v
  const imperial = units === 'imperial'

  if (!(weight > 0)) throw new CalcError('Enter a weight greater than 0.', 'weight')
  if (!(height > 0)) throw new CalcError('Enter a height greater than 0.', 'height')
  if (!(age > 0)) throw new CalcError('Enter an age greater than 0.', 'age')
  if (age > 120) throw new CalcError('Enter an age of 120 or under.', 'age')

  if (sex !== 'male' && sex !== 'female') {
    throw new CalcError('Choose a sex so the right constant is used.', 'sex')
  }

  const activity = ACTIVITY[activityLevel]
  if (!activity) throw new CalcError('Choose an activity level.', 'activityLevel')

  const kg = imperial ? weight / LB_PER_KG : weight
  const cm = imperial ? height * CM_PER_IN : height

  if (cm > 272) throw new CalcError('That height looks too large — check the units.', 'height')
  if (cm < 60) throw new CalcError('That height looks too small — check the units.', 'height')

  // Mifflin-St Jeor resting metabolic rate.
  const bmr = 10 * kg + 6.25 * cm - 5 * age + (sex === 'male' ? 5 : -161)
  // The regression is linear and unbounded, so an extreme combination (very
  // light, very short, very old) drives it to or below zero. That is a data
  // error, not a metabolism, and it would otherwise yield a negative part.
  if (!(bmr > 0))
    throw new CalcError('Those figures give an impossible resting rate — re-check them.', 'weight')

  const tdee = bmr * activity.factor
  // Everything the multiplier adds on top of resting metabolism. The multiplier
  // is never below 1, so this can never go negative.
  const activityBurn = tdee - bmr

  const kcal = { style: 'decimal', decimals: 0, unit: 'kcal/day' } as const

  const notes = [
    'Activity multipliers are broad averages. Track your weight for two to three weeks and adjust the number up or down if it is not moving the way this estimate predicts.',
    'A 500 kcal daily gap corresponds to roughly 0.45 kg (1 lb) of body mass a week, but real-world loss slows as body mass and therefore BMR fall.',
  ]
  if (tdee - ADJUSTMENT < (sex === 'male' ? 1500 : 1200)) {
    notes.push(
      'The deficit figure here falls below the intake normally considered safe without medical supervision. Consider a smaller deficit or more activity instead.',
    )
  }

  return {
    primary: { label: 'Maintenance calories', value: tdee, format: kcal },
    stats: [
      { label: 'BMR (at complete rest)', value: bmr, format: kcal },
      { label: 'Mild weight loss (-500)', value: tdee - ADJUSTMENT, format: kcal },
      { label: 'Mild weight gain (+500)', value: tdee + ADJUSTMENT, format: kcal },
      {
        label: 'Activity multiplier',
        value: activity.factor,
        format: { style: 'decimal', decimals: 3 },
      },
    ],
    steps: [
      { label: 'Weight', value: kg, format: { style: 'decimal', decimals: 1, unit: 'kg' } },
      { label: 'Height', value: cm, format: { style: 'decimal', decimals: 1, unit: 'cm' } },
      { label: 'Age', value: age, format: { style: 'decimal', decimals: 0, unit: 'years' } },
      { rule: true },
      { label: 'BMR = 10×kg + 6.25×cm − 5×age ± constant', value: bmr, format: kcal },
      { label: `Multiplier (${activity.label})`, value: activity.factor, format: { style: 'decimal', decimals: 3 } },
      { label: 'TDEE = BMR × multiplier', value: tdee, format: kcal },
      { label: 'Burned through activity', value: activityBurn, format: kcal },
    ],
    // These two are the headline itself, split in two, so no `partsTotal`.
    parts: [
      { label: 'BMR', value: bmr, format: kcal },
      { label: 'Activity burn', value: activityBurn, format: kcal },
    ],
    notes,
  }
}

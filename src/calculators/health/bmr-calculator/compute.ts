import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

const LB_PER_KG = 2.20462
const CM_PER_IN = 2.54

/** Mifflin-St Jeor sex constant: +5 for men, -161 for women. */
const SEX_CONSTANT = { male: 5, female: -161 } as const

/** Conventional Harris-Benedict style activity multipliers, applied to BMR. */
const ACTIVITY = [
  { label: 'Sedentary (little exercise)', factor: 1.2 },
  { label: 'Lightly active (1-3 days/wk)', factor: 1.375 },
  { label: 'Moderately active (3-5 days/wk)', factor: 1.55 },
  { label: 'Very active (6-7 days/wk)', factor: 1.725 },
] as const

export default function compute(v: Values<typeof fields>): CalcResult {
  const { weight, height, age } = v
  const imperial = v.units === 'imperial'
  const sex = v.sex

  if (sex !== 'male' && sex !== 'female')
    throw new CalcError('Choose male or female.', 'sex')
  if (!(weight > 0)) throw new CalcError('Enter a weight greater than 0.', 'weight')
  if (!(height > 0)) throw new CalcError('Enter a height greater than 0.', 'height')
  if (!(age > 0)) throw new CalcError('Enter an age greater than 0.', 'age')
  if (age > 120) throw new CalcError('Enter an age of 120 or under.', 'age')

  const kg = imperial ? weight / LB_PER_KG : weight
  const cm = imperial ? height * CM_PER_IN : height

  if (cm > 272) throw new CalcError('That height looks too large — check the units.', 'height')
  if (kg > 700) throw new CalcError('That weight looks too large — check the units.', 'weight')

  const bmr = 10 * kg + 6.25 * cm - 5 * age + SEX_CONSTANT[sex]

  if (!(bmr > 0))
    throw new CalcError('Those measurements produce a non-positive BMR.', 'weight')

  return {
    primary: {
      label: 'Basal metabolic rate',
      value: bmr,
      format: { style: 'decimal', decimals: 0, unit: 'kcal/day' },
    },
    stats: ACTIVITY.map((a) => ({
      label: a.label,
      value: bmr * a.factor,
      format: { style: 'decimal' as const, decimals: 0, unit: 'kcal/day' },
    })),
    steps: [
      { label: 'Weight', value: kg, format: { style: 'decimal', decimals: 1, unit: 'kg' } },
      { label: 'Height', value: cm, format: { style: 'decimal', decimals: 1, unit: 'cm' } },
      { label: 'Age', value: age, format: { style: 'decimal', decimals: 0, unit: 'years' } },
      { rule: true },
      {
        label: '10 x weight',
        value: 10 * kg,
        format: { style: 'decimal', decimals: 1, unit: 'kcal' },
      },
      {
        label: '6.25 x height',
        value: 6.25 * cm,
        format: { style: 'decimal', decimals: 1, unit: 'kcal' },
      },
      {
        label: '-5 x age',
        value: -5 * age,
        format: { style: 'decimal', decimals: 1, unit: 'kcal' },
      },
      {
        label: 'Sex constant',
        value: SEX_CONSTANT[sex],
        format: { style: 'decimal', decimals: 0, unit: 'kcal' },
      },
      { rule: true },
      {
        label: 'Basal metabolic rate',
        value: bmr,
        format: { style: 'decimal', decimals: 0, unit: 'kcal/day' },
      },
      {
        label: 'Per hour',
        value: bmr / 24,
        format: { style: 'decimal', decimals: 1, unit: 'kcal/h' },
      },
    ],
    notes: [
      'BMR is the energy your body burns completely at rest. Total daily needs are higher — multiply by an activity factor, which is what the figures above do.',
      'Mifflin-St Jeor was validated on adults and assumes an average body composition, so it under-reads for very muscular people and over-reads at high body fat.',
    ],
  }
}

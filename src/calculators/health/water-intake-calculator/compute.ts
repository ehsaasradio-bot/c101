import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

const LB_PER_KG = 2.20462

/** Baseline fluid requirement, millilitres per kilogram of body weight per day. */
const ML_PER_KG = 35
/** Replacement for sweat losses: ~500 ml per 30 minutes of exercise. */
const ML_PER_EXERCISE_MINUTE = 500 / 30
/** A US cup, in millilitres. */
const ML_PER_CUP = 240
/** A standard drinking glass, in millilitres. */
const ML_PER_GLASS = 250

const CLIMATE_FACTOR: Record<string, number> = {
  temperate: 1,
  hot: 1.15,
}

export default function compute(v: Values<typeof fields>): CalcResult {
  const { units, weight, exerciseMinutes, climate } = v
  const imperial = units === 'imperial'

  if (!Number.isFinite(weight) || !(weight > 0)) {
    throw new CalcError('Enter a body weight greater than 0.', 'weight')
  }
  if (!Number.isFinite(exerciseMinutes) || exerciseMinutes < 0) {
    throw new CalcError('Exercise minutes cannot be negative.', 'exerciseMinutes')
  }
  if (exerciseMinutes > 600) {
    throw new CalcError('Enter 600 minutes of exercise or fewer.', 'exerciseMinutes')
  }

  const factor = CLIMATE_FACTOR[climate]
  if (factor === undefined) throw new CalcError('Choose a climate.', 'climate')

  const kg = imperial ? weight / LB_PER_KG : weight
  if (kg > 300) {
    throw new CalcError('That weight looks too large — check the units.', 'weight')
  }

  const baselineMl = kg * ML_PER_KG
  const exerciseMl = exerciseMinutes * ML_PER_EXERCISE_MINUTE
  const totalMl = (baselineMl + exerciseMl) * factor
  const litres = totalMl / 1000

  // The climate adjustment is multiplicative, so it has no millilitre figure of
  // its own — it is whatever the multiplier added on top of the other two.
  // Deriving it by subtraction rather than as (baseline + exercise) × (factor −
  // 1) makes the three add back to the total exactly. It is zero in a temperate
  // climate, where the factor is 1, and never negative, as no factor is below 1.
  // The clamp is for float dust only: at a factor of exactly 1 the subtraction
  // can land a few times 10⁻¹⁷ below zero, which would print as "-0 ml".
  const climateMl = Math.max(0, totalMl - baselineMl - exerciseMl)

  return {
    primary: {
      label: 'Daily water target',
      value: litres,
      format: { style: 'decimal', decimals: 2, unit: 'L' },
    },
    stats: [
      {
        label: 'Millilitres',
        value: totalMl,
        format: { style: 'decimal', decimals: 0, unit: 'ml' },
      },
      {
        label: 'Cups (240 ml)',
        value: totalMl / ML_PER_CUP,
        format: { style: 'decimal', decimals: 1, unit: 'cups' },
      },
      {
        label: 'Glasses (250 ml)',
        value: totalMl / ML_PER_GLASS,
        format: { style: 'decimal', decimals: 1, unit: 'glasses' },
      },
    ],
    steps: [
      { label: 'Body weight', value: kg, format: { style: 'decimal', decimals: 1, unit: 'kg' } },
      {
        label: 'Baseline at 35 ml/kg',
        value: baselineMl,
        format: { style: 'decimal', decimals: 0, unit: 'ml' },
      },
      {
        label: 'Exercise replacement (500 ml per 30 min)',
        value: exerciseMl,
        format: { style: 'decimal', decimals: 0, unit: 'ml' },
      },
      { rule: true },
      {
        label: 'Climate multiplier',
        value: factor,
        format: { style: 'decimal', decimals: 2, unit: '×' },
      },
      {
        label: 'Total fluid target',
        value: totalMl,
        format: { style: 'decimal', decimals: 0, unit: 'ml' },
      },
      {
        label: 'Added by the climate',
        value: climateMl,
        format: { style: 'decimal', decimals: 0, unit: 'ml' },
      },
    ],
    // In litres, so the three decompose the headline directly.
    parts: [
      {
        label: 'Baseline need',
        value: baselineMl / 1000,
        format: { style: 'decimal', decimals: 2, unit: 'L' },
      },
      {
        label: 'Exercise allowance',
        value: exerciseMl / 1000,
        format: { style: 'decimal', decimals: 2, unit: 'L' },
      },
      {
        label: 'Climate adjustment',
        value: climateMl / 1000,
        format: { style: 'decimal', decimals: 2, unit: 'L' },
      },
    ],
    notes: [
      'This is total fluid from all sources. Food supplies roughly 20% of it, so the amount you actually need to drink is usually a little lower.',
      'Kidney disease, heart failure, pregnancy, breastfeeding, and some medications all change fluid needs. Ask a clinician before using a fixed target.',
      'Thirst and pale-straw urine remain the most practical day-to-day guides; drinking far beyond need can dilute blood sodium, which is dangerous.',
    ],
  }
}

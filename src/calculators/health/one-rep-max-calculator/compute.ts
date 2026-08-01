import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, Values } from '../../../lib/types'
import type { fields } from './fields'

/** Training percentages reported alongside the estimate, heaviest first. */
const TRAINING_PERCENTS = [95, 90, 85, 80, 70] as const

/** Brzycki's denominator hits zero at 37 reps and is already unreliable past ~10. */
const MAX_REPS = 12

export function epley(weight: number, reps: number): number {
  return weight * (1 + reps / 30)
}

export function brzycki(weight: number, reps: number): number {
  return (weight * 36) / (37 - reps)
}

/**
 * The multiplier the calculator applies to a load lifted for `reps` reps to get
 * the one-rep max — the average of the two formulas, written per unit of weight
 * so it can be inverted. At one rep the calculator treats the load as the max
 * itself rather than averaging, so the factor there is exactly 1.
 *
 * Dividing the max by this factor therefore runs the calculator backwards: it
 * answers "what could be lifted for r reps", and passing the user's own rep
 * count returns the weight they entered.
 */
export function maxFactor(reps: number): number {
  if (reps === 1) return 1
  return (epley(1, reps) + brzycki(1, reps)) / 2
}

export default function compute(v: Values<typeof fields>): CalcResult {
  const { weight, reps, units } = v
  const unit = units === 'lb' ? 'lb' : 'kg'

  if (!Number.isFinite(weight) || !(weight > 0)) {
    throw new CalcError('Enter a weight greater than 0.', 'weight')
  }
  if (!Number.isFinite(reps) || !Number.isInteger(reps)) {
    throw new CalcError('Enter a whole number of reps.', 'reps')
  }
  if (reps < 1) {
    throw new CalcError('Enter at least 1 rep.', 'reps')
  }
  if (reps > MAX_REPS) {
    throw new CalcError(
      `Rep-max formulas lose accuracy above ${MAX_REPS} reps. Use a heavier set.`,
      'reps',
    )
  }

  // A single rep is already a one-rep max — no estimation needed, and averaging
  // the two formulas would inflate it by about 1.7%.
  const single = reps === 1
  const epleyMax = epley(weight, reps)
  const brzyckiMax = brzycki(weight, reps)
  const oneRepMax = single ? weight : (epleyMax + brzyckiMax) / 2

  const loads: Quantity[] = TRAINING_PERCENTS.map((p) => ({
    label: `${p}% of 1RM`,
    value: (oneRepMax * p) / 100,
    format: { style: 'decimal', decimals: 1, unit },
  }))

  const steps: CalcResult['steps'] = single
    ? [
        {
          label: 'Reps completed',
          value: reps,
          format: { style: 'decimal', decimals: 0, unit: 'reps' },
        },
        { rule: true },
        {
          label: 'A single completed rep is the one-rep max',
          value: weight,
          format: { style: 'decimal', decimals: 1, unit },
        },
      ]
    : [
        {
          label: 'Epley: weight x (1 + reps / 30)',
          value: epleyMax,
          format: { style: 'decimal', decimals: 1, unit },
        },
        {
          label: 'Brzycki: weight x 36 / (37 - reps)',
          value: brzyckiMax,
          format: { style: 'decimal', decimals: 1, unit },
        },
        { rule: true },
        {
          label: 'Average of the two estimates',
          value: oneRepMax,
          format: { style: 'decimal', decimals: 1, unit },
        },
      ]

  // The rep/load curve, derived by inverting the very same averaged formulas
  // that produced `oneRepMax`. `maxFactor` grows with reps, so the load falls
  // monotonically, and at the user's own rep count it returns their input
  // weight exactly — the chart passes through the set they actually did.
  const loadPoints: Array<readonly [number, number]> = []
  for (let r = 1; r <= MAX_REPS; r++) {
    loadPoints.push([r, oneRepMax / maxFactor(r)])
  }

  return {
    primary: {
      label: 'Estimated one-rep max',
      value: oneRepMax,
      format: { style: 'decimal', decimals: 1, unit },
    },
    stats: loads,
    steps,
    series: [
      {
        label: 'Estimated load',
        points: loadPoints,
        format: { style: 'decimal', decimals: 1, unit },
      },
    ],
    chart: { title: 'Estimated load by rep count', xLabel: 'Reps' },
    notes: [
      'This is an estimate from a submaximal set, not a tested max. The two formulas disagree by a few percent, and the spread widens as reps rise.',
      'The set must have been taken close to failure. Reps left in reserve make the estimate read low.',
      'Never attempt a true one-rep max without a spotter, a warm-up, and technique you can hold under load.',
    ],
  }
}

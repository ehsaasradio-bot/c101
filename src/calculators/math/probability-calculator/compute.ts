import { CalcError } from '../../../lib/types'
import type { CalcResult, Part, Quantity, Series, StepRule, Values } from '../../../lib/types'
import type { fields } from './fields'

/**
 * Two-event probability under an explicitly chosen relationship, plus the
 * "at least once in n tries" figure.
 *
 * The standard results (Kolmogorov's axioms and their usual corollaries):
 *
 *   multiplication rule, independent events   P(A ∩ B) = P(A) · P(B)
 *   mutually exclusive events                 P(A ∩ B) = 0
 *   addition rule (always true)               P(A ∪ B) = P(A) + P(B) − P(A ∩ B)
 *   complement rule                           P(not A) = 1 − P(A)
 *   De Morgan / neither                       P(A' ∩ B') = 1 − P(A ∪ B)
 *   at least one in n Bernoulli trials        1 − (1 − p)^n
 *
 * Which of the first two applies is the thing people get wrong, so it is a
 * field rather than an assumption buried in the formula.
 */

const RELATIONSHIPS = ['independent', 'exclusive'] as const
type Relationship = (typeof RELATIONSHIPS)[number]

const isRelationship = (s: string): s is Relationship =>
  (RELATIONSHIPS as readonly string[]).includes(s)

/** Probabilities travel as percentage points here, matching `format.ts`. */
const pct = (label: string, value: number, decimals = 2): Quantity => ({
  label,
  value,
  format: { style: 'percent', decimals },
})

const raw = (label: string, value: string): Quantity => ({
  label,
  value,
  format: { style: 'raw' },
})

/** A probability in 0–1 written as a percentage string, for the worked steps. */
const asPct = (p: number, decimals = 2): string => `${(p * 100).toFixed(decimals)}%`

/** Trim a fixed-decimal string back to something a person would write. */
const tidy = (n: number, decimals: number): string =>
  n.toFixed(decimals).replace(/\.?0+$/, '') || '0'

export default function compute(v: Values<typeof fields>): CalcResult {
  const relationship = v.relationship

  if (!isRelationship(relationship)) {
    throw new CalcError('Choose whether the events are independent or mutually exclusive.', 'relationship')
  }

  // Finiteness first: coerceValues emits NaN for unparseable input, and a
  // magnitude test like `probA < 0` is false for NaN, so it would slip through.
  if (!Number.isFinite(v.probA)) {
    throw new CalcError('Enter a probability for event A, from 0% to 100%.', 'probA')
  }
  if (!Number.isFinite(v.probB)) {
    throw new CalcError('Enter a probability for event B, from 0% to 100%.', 'probB')
  }
  if (!Number.isFinite(v.trials)) {
    throw new CalcError('Enter how many trials you are running.', 'trials')
  }

  // A probability outside 0–1 is not a probability at all.
  if (v.probA < 0 || v.probA > 100) {
    throw new CalcError('P(A) has to be between 0% and 100%.', 'probA')
  }
  if (v.probB < 0 || v.probB > 100) {
    throw new CalcError('P(B) has to be between 0% and 100%.', 'probB')
  }

  const trials = Math.round(v.trials)
  if (trials < 1 || trials > 100) {
    throw new CalcError('Use between 1 and 100 trials.', 'trials')
  }

  /*
   * Mutually exclusive means A ∩ B = ∅, so P(A ∪ B) = P(A) + P(B), and no
   * probability may exceed 1. A pair summing past 100% therefore describes a
   * sample space that cannot exist — there is no number to return, only a
   * contradiction between the two inputs and the chosen relationship. Rejecting
   * it against P(B) puts the highlight on the value the visitor can lower
   * without abandoning the premise, and the message names the other fix too.
   *
   * The tolerance is on percentage points rather than fractions so that typing
   * 30 and 70 is accepted exactly rather than tripping on 0.3 + 0.7 in binary.
   */
  if (relationship === 'exclusive' && v.probA + v.probB > 100 + 1e-9) {
    const headroom = Math.max(0, 100 - v.probA)
    throw new CalcError(
      `Mutually exclusive events never overlap, so P(A) + P(B) cannot exceed 100% — these add to ${tidy(v.probA + v.probB, 4)}%. Lower P(B) to ${tidy(headroom, 4)}% or less, or set the events to independent.`,
      'probB',
    )
  }

  const a = v.probA / 100
  const b = v.probB / 100

  const both = relationship === 'independent' ? a * b : 0

  // The four outcomes of the joint sample space. Each is clamped at zero: they
  // are non-negative by construction, but a subtraction of two nearly equal
  // floats can land a hair below it.
  const aOnly = Math.max(0, a - both)
  const bOnly = Math.max(0, b - both)
  // Addition rule. Clamped at 1 because the exclusive guard above allows a
  // sum of exactly 100% and binary rounding can put that a hair over.
  const either = Math.min(1, both + aOnly + bOnly)
  const neither = Math.max(0, 1 - either)
  const exactlyOne = Math.max(0, either - both)

  // Bernoulli trials: the only way to avoid A entirely is to miss it every time.
  const missOnce = 1 - a
  const missAll = Math.pow(missOnce, trials)
  const atLeastOneA = Math.min(1, Math.max(0, 1 - missAll))
  const atLeastOneEither = Math.min(1, Math.max(0, 1 - Math.pow(1 - either, trials)))
  const expectedA = a * trials

  const oddsText =
    a === 0
      ? 'Never — P(A) is 0%'
      : a === 1
        ? 'Certain — P(A) is 100%'
        : `about 1 in ${tidy(1 / a, 2)}`

  /*
   * Two lines over the number of trials, from 0 (where both are 0 by
   * definition) up to the chosen count. The counts never vary with input: two
   * series, always, so the chart is server-rendered at the defaults and the
   * theme only ever rebuilds paths it already has.
   *
   * Long horizons are thinned with a stride and the final point is pinned to
   * the trial count, so the curve ends on exactly the figure in the stats.
   */
  const stride = Math.max(1, Math.ceil(trials / 40))
  const xs: number[] = []
  for (let n = 0; n < trials; n += stride) xs.push(n)
  xs.push(trials)

  const series: Series[] = [
    {
      label: 'At least one A',
      points: xs.map((n) => [n, (1 - Math.pow(missOnce, n)) * 100] as const),
      format: { style: 'percent', decimals: 2 },
    },
    {
      label: 'At least one A or B',
      points: xs.map((n) => [n, (1 - Math.pow(1 - either, n)) * 100] as const),
      format: { style: 'percent', decimals: 2 },
    },
  ]

  /*
   * The four outcomes partition the sample space, so they sum to exactly 100%
   * whatever the inputs — and the donut prints that 100% in its centre. The
   * count is fixed at four; a zero-probability outcome stays in the list rather
   * than disappearing, because "neither happens: 0%" is information.
   */
  const parts: Part[] = [
    { label: 'Both A and B', value: both * 100, format: { style: 'percent', decimals: 2 } },
    { label: 'A only', value: aOnly * 100, format: { style: 'percent', decimals: 2 } },
    { label: 'B only', value: bOnly * 100, format: { style: 'percent', decimals: 2 } },
    { label: 'Neither', value: neither * 100, format: { style: 'percent', decimals: 2 } },
  ]

  const intersectionStep =
    relationship === 'independent'
      ? raw(
          'P(A and B) = P(A) × P(B)',
          `${asPct(a)} × ${asPct(b)} = ${asPct(both, 4)}`,
        )
      : raw('P(A and B)', '0% — mutually exclusive events never happen together')

  const steps: (Quantity | StepRule)[] = [
    pct('P(A)', v.probA),
    pct('P(B)', v.probB),
    raw(
      'Assumption',
      relationship === 'independent'
        ? 'Independent — A happening does not change the chance of B'
        : 'Mutually exclusive — A and B cannot both happen',
    ),
    { rule: true },
    intersectionStep,
    raw(
      'P(A or B) = P(A) + P(B) − P(A and B)',
      `${asPct(a)} + ${asPct(b)} − ${asPct(both, 4)} = ${asPct(either, 4)}`,
    ),
    raw('P(neither) = 1 − P(A or B)', `100% − ${asPct(either, 4)} = ${asPct(neither, 4)}`),
    { rule: true },
    raw('P(A does not happen on one trial)', `1 − ${asPct(a)} = ${asPct(missOnce)}`),
    raw(
      `P(A never happens in ${trials} ${trials === 1 ? 'trial' : 'trials'})`,
      `${asPct(missOnce)}^${trials} = ${asPct(missAll, 4)}`,
    ),
    raw(
      'P(at least one A) = 1 − P(no A at all)',
      `100% − ${asPct(missAll, 4)} = ${asPct(atLeastOneA, 4)}`,
    ),
  ]

  const notes: string[] = [
    relationship === 'independent'
      ? 'Independence is an assumption about the world, not something the numbers can prove. Two coin flips are independent; rain today and rain tomorrow are not.'
      : 'Mutually exclusive events are never independent unless one of them is impossible: knowing A happened tells you B did not, which is the opposite of "no effect on each other".',
    'If the events are neither independent nor mutually exclusive, P(A and B) has to be measured or given — it cannot be derived from P(A) and P(B) alone.',
  ]

  return {
    primary: {
      label: 'P(A and B) — both happen',
      value: both * 100,
      format: { style: 'percent', decimals: 2 },
    },
    stats: [
      pct('P(A or B) — at least one happens', either * 100),
      pct('P(neither A nor B)', neither * 100),
      pct('P(exactly one of them)', exactlyOne * 100),
      pct('P(not A)', (1 - a) * 100),
      pct('P(not B)', (1 - b) * 100),
      pct(`P(at least one A in ${trials} ${trials === 1 ? 'trial' : 'trials'})`, atLeastOneA * 100),
      pct(
        `P(at least one A or B in ${trials} ${trials === 1 ? 'trial' : 'trials'})`,
        atLeastOneEither * 100,
      ),
      {
        label: 'Expected number of A occurrences',
        value: expectedA,
        format: { style: 'decimal', decimals: 2 },
      },
      raw('Event A stated as odds', oddsText),
    ],
    steps,
    parts,
    partsTotal: {
      label: 'All four outcomes',
      value: 100,
      format: { style: 'percent', decimals: 2 },
    },
    series,
    notes,
  }
}

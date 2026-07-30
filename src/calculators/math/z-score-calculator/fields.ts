import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * `value` is deliberately first: the end-to-end suite nudges the first number
 * field to 1.1x its default, and 85 -> 93.5 moves z from 1.4 to 2.25, which is
 * still a perfectly valid answer and a visibly different one.
 *
 * All three bounds are symmetric about zero because a z-score is scale-free —
 * the value and the mean can be temperatures, test scores, or lab results, and
 * negatives are ordinary. Every default sits on `min + n * step`, which needs
 * more care than usual with a negative minimum: (85 - -1000) / 0.5 = 2170.
 */
export const fields = [
  {
    kind: 'number',
    id: 'value',
    label: 'Your value (x)',
    default: 85,
    min: -1000,
    max: 1000,
    step: 0.5,
    help: 'The single observation you want to place in the distribution.',
  },
  {
    kind: 'number',
    id: 'mean',
    label: 'Mean of the distribution',
    default: 71,
    min: -1000,
    max: 1000,
    step: 0.5,
    help: 'The average of the group your value is being compared against.',
  },
  {
    kind: 'number',
    id: 'standardDeviation',
    label: 'Standard deviation',
    default: 10,
    // A slider spans these, so both ends must be values compute accepts — and
    // compute refuses zero, because dividing by a spread of zero is undefined.
    // The minimum is therefore one step above zero rather than zero itself.
    min: 0.1,
    max: 500,
    step: 0.1,
    help: 'How widely the data is spread. Must be greater than zero.',
  },
] as const satisfies readonly Field[]

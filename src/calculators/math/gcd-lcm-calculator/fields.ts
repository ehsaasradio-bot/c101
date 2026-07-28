import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its input type from
 * them without importing `index.ts` — which imports `compute.ts` and would cycle.
 *
 * Both inputs are whole numbers; anything else is rounded before the Euclidean
 * algorithm runs, because divisibility is only defined over the integers.
 */
export const fields = [
  {
    kind: 'number',
    id: 'numberA',
    label: 'First number',
    default: 48,
    min: -1_000_000_000,
    max: 1_000_000_000,
    step: 1,
    help: 'Whole numbers only — decimals are rounded to the nearest integer.',
  },
  {
    kind: 'number',
    id: 'numberB',
    label: 'Second number',
    default: 180,
    min: -1_000_000_000,
    max: 1_000_000_000,
    step: 1,
    help: 'Signs are ignored: the divisors of -12 and 12 are the same.',
  },
] as const satisfies readonly Field[]

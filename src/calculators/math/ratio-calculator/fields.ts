import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its input type from
 * them without importing `index.ts` — which imports `compute.ts` and would cycle.
 *
 * `termA` is first on purpose: it is the divisor in x = b × c ÷ a, so nudging it
 * always moves the solved term, and any positive value stays valid input.
 *
 * `termA` and `termB` carry a positive `min` because compute rejects 0 on both:
 * a stepper that can land on 0 would be advertising an input the calculator then
 * refuses. `termC` may legitimately be 0, so it keeps a floor of 0. Smaller
 * positive terms than the stepper reaches can still be typed in directly.
 */
export const fields = [
  {
    kind: 'number',
    id: 'termA',
    label: 'Term A',
    default: 3,
    min: 0.5,
    max: 1000,
    step: 0.5,
    help: 'The left side of the known ratio A : B. Must be greater than 0.',
  },
  {
    kind: 'number',
    id: 'termB',
    label: 'Term B',
    default: 4,
    min: 0.5,
    max: 1000,
    step: 0.5,
    help: 'The right side of the known ratio A : B. Must also be greater than 0.',
  },
  {
    kind: 'number',
    id: 'termC',
    label: 'Term C',
    default: 9,
    min: 0,
    max: 1000,
    step: 1,
    help: 'The left side of the proportion C : X, solved against A : B.',
  },
] as const satisfies readonly Field[]

import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its input type from
 * them without importing `index.ts` — which imports `compute.ts` and would cycle.
 *
 * `a` is first deliberately: the end-to-end test nudges the first number field to
 * 1.1x its default, and a = 1.1 is still a valid quadratic (a != 0) whose roots
 * differ from those of a = 1.
 */
export const fields = [
  {
    kind: 'number',
    id: 'a',
    label: 'a (x² coefficient)',
    default: 1,
    min: -1000,
    max: 1000,
    step: 0.1,
    help: 'Must not be 0 — with a = 0 the equation is linear, not quadratic.',
  },
  {
    kind: 'number',
    id: 'b',
    label: 'b (x coefficient)',
    default: -3,
    min: -1000,
    max: 1000,
    step: 0.1,
  },
  {
    kind: 'number',
    id: 'c',
    label: 'c (constant term)',
    default: -4,
    min: -1000,
    max: 1000,
    step: 0.1,
  },
] as const satisfies readonly Field[]

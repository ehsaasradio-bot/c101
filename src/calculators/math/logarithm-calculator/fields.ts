import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * `x` is deliberately first: the end-to-end suite nudges the first number field
 * to 1.1x its default, and 1000 -> 1100 is still an ordinary logarithm
 * (3 becomes 3.041393), so the nudge proves the island recomputed rather than
 * tripping a validation error.
 *
 * Two minimums are load-bearing rather than decorative:
 *
 *  - `x` starts at 0.001, not 0. Every number field renders as a slider, so the
 *    left end is one drag away, and compute refuses zero because no real power
 *    of a positive base ever produces it. 0.001 is both legal and tidy:
 *    log10(0.001) is exactly -3.
 *  - `base` starts at 0.1 for the same reason. Base 1 sits inside the range and
 *    is rejected by compute — a genuine hole in the middle of the domain rather
 *    than a bound that could be moved, because 1 raised to any power is 1.
 *
 * Every default sits on `min + n * step`, which an HTML range snaps to:
 * (1000 - 0.001) / 0.001 = 999999, (10 - 0.1) / 0.1 = 99, and
 * (3 - -50) / 0.1 = 530.
 */
export const fields = [
  {
    kind: 'number',
    id: 'x',
    label: 'Value (x)',
    default: 1000,
    min: 0.001,
    max: 1_000_000_000,
    step: 0.001,
    help: 'The number you want the logarithm of. Must be greater than zero.',
  },
  {
    kind: 'number',
    id: 'base',
    label: 'Base (b)',
    default: 10,
    min: 0.1,
    max: 1000,
    step: 0.1,
    help: 'Use 10 for common logs, 2 for binary logs, or 2.718281828 for natural logs. Must be positive, and cannot be 1.',
  },
  {
    kind: 'number',
    id: 'logValue',
    label: 'Known logarithm (y)',
    default: 3,
    min: -50,
    max: 50,
    step: 0.1,
    help: 'The inverse question: if the logarithm were y, what was x? The answer is b raised to this power.',
  },
] as const satisfies readonly Field[]

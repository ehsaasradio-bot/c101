import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * `base` is deliberately first: the end-to-end suite nudges the first number
 * field to 1.1x its default, and 2 -> 2.2 is still an ordinary power
 * (2^10 = 1024 becomes 2.2^10 = 2655.9922791424), so the nudge proves the
 * island recomputed rather than tripping a validation error.
 *
 * Both fields span negative values on purpose. A negative base and a negative
 * exponent are the two cases this page exists to explain, so they have to be
 * one drag away rather than something only a typed value can reach:
 *
 *  - `base` runs -1000..1000. `softRange` sizes the visible track from the
 *    default (|2| x 4, rounded up to 10), so the slider itself shows -10..10 —
 *    both signs, at 0.1 a step, with the full validated range still typeable.
 *    Zero sits inside the range and is a real answer for a positive exponent;
 *    only 0 to a NEGATIVE power is refused, because that is 1 divided by 0.
 *  - `exponent` runs -400..400, which is what makes overflow reachable at all:
 *    1000^400 is 10^1200, far past the 1.8e308 a double can hold, and the page
 *    reports its magnitude rather than a dash.
 *
 * Every default sits on `min + n * step`, which an HTML range snaps to:
 * (2 - -1000) / 0.1 = 10020 and (10 - -400) / 0.1 = 4100.
 */
export const fields = [
  {
    kind: 'number',
    id: 'base',
    label: 'Base (b)',
    default: 2,
    min: -1000,
    max: 1000,
    step: 0.1,
    help: 'The number being raised to a power. May be negative, and may be zero for a positive exponent.',
  },
  {
    kind: 'number',
    id: 'exponent',
    label: 'Exponent (n)',
    default: 10,
    min: -400,
    max: 400,
    step: 0.1,
    help: 'How many times the base is multiplied by itself. Negative means a reciprocal, fractional means a root, and zero gives 1.',
  },
] as const satisfies readonly Field[]

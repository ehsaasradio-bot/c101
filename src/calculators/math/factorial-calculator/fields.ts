import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * `n` is the only field, and therefore the first NUMBER field — the one the
 * end-to-end suite nudges to 1.1x its default. 100 x 1.1 = 110, a whole number,
 * which matters because non-integer input is rejected here rather than rounded.
 * (The suite rounds with toFixed(4) before filling, so the 110.00000000000001
 * that the multiplication actually produces arrives as a clean 110.)
 *
 * The default is 100 because 100! is the canonical example: 158 digits, all of
 * which this page prints, and exactly 24 trailing zeros.
 *
 * `min: 0` is deliberate and safe — 0! = 1 is defined, not an error, so the
 * left end of the slider is a real answer rather than a thrown message. Every
 * default sits on `min + k x step` (100 = 0 + 100 x 1).
 *
 * The max is 10,000, chosen from measurement rather than taste; the reasoning
 * and the timings are in the comment above MAX_N in `compute.ts`. Note that the
 * slider itself only spans about 4x the default (~400) — everything above that
 * is reachable by typing, which is the right trade for a field whose interesting
 * range is small and whose tail is enormous.
 */
export const fields = [
  {
    kind: 'number',
    id: 'n',
    label: 'n — the number to take the factorial of',
    default: 100,
    min: 0,
    max: 10_000,
    step: 1,
    help: 'A whole number from 0 to 10,000. 0! and 1! are both 1 — that is a definition, not a bug.',
  },
] as const satisfies readonly Field[]

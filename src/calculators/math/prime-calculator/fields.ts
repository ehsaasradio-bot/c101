import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * One field, and it is the one the end-to-end suite nudges to 1.1x its default:
 * 360 becomes 396, still a whole number, still in range, and a different answer
 * (396 = 2^2 x 3^2 x 11 rather than 2^3 x 3^2 x 5). Note that 360 * 1.1 is
 * 396.00000000000006 in binary floating point; the spec rounds the bump through
 * toFixed(4) before typing it, which is what keeps it the whole number compute
 * will accept.
 *
 * `max` is a measured limit, not a round number chosen for looks: the worst
 * keystroke — a large PRIME, where trial division cannot exit early and both
 * nearest-prime searches repeat the same full-length loop — measured 12.7 ms
 * mean and 19.2 ms worst at this cap, against 43.6 / 70.3 ms one decade up. The
 * full table is in the performance note at the top of `compute.ts`.
 *
 * `min` is 0 rather than 2 because
 * 0 and 1 have real answers here ("not prime, and here is why"), and a slider
 * whose left end threw would be a broken control.
 */
export const fields = [
  {
    kind: 'number',
    id: 'number',
    label: 'Number to test',
    default: 360,
    min: 0,
    max: 100_000_000_000,
    step: 1,
    help: 'Any whole number from 0 up to 100,000,000,000. The slider covers the small end — type directly for anything larger.',
  },
] as const satisfies readonly Field[]

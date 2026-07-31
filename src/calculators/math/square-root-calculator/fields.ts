import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * `value` is deliberately first: the end-to-end suite nudges the first number
 * field to 1.1x its default, and 72 -> 79.2 is still an ordinary square root
 * (8.485281 becomes 8.899438), so the nudge proves the island recomputed rather
 * than tripping a validation error. It also crosses a real boundary here — 72
 * has a simplified radical form and 79.2 does not, because a radical only
 * simplifies over the whole numbers.
 *
 * Bounds worth explaining:
 *
 *  - `value` reaches below zero on purpose. A negative number has no real
 *    square root, but it does have an imaginary one, and the odd roots of a
 *    negative ARE real: the cube root of -8 is -2. Forbidding negatives would
 *    hide both facts. Every value the slider can reach returns an answer.
 *  - `step: 1` keeps the slider on whole numbers, which are the values that
 *    have a radical form worth showing. Decimals still work when typed.
 *  - `degree` starts at 2 rather than 1. The first root is the number itself,
 *    which is a true but useless answer to sit at the end of a slider.
 *
 * Both defaults sit on `min + n * step`: (72 - -1000000) / 1 = 1000072 and
 * (2 - 2) / 1 = 0.
 */
export const fields = [
  {
    kind: 'number',
    id: 'value',
    label: 'Number',
    default: 72,
    min: -1_000_000,
    max: 1_000_000,
    step: 1,
    help: 'The number under the radical sign. Whole numbers get a simplified radical form; a negative gets the imaginary form for the square root.',
  },
  {
    kind: 'number',
    id: 'degree',
    label: 'Root degree (n)',
    default: 2,
    min: 2,
    max: 20,
    step: 1,
    help: '2 for a square root, 3 for a cube root, and so on. Whole numbers only — decimals are rounded.',
  },
] as const satisfies readonly Field[]

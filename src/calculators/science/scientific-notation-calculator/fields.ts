import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * `coefficientA` is deliberately the first number field, because the end-to-end
 * suite nudges that one to 1.1x its default: 6.02 becomes 6.622, which is a
 * perfectly ordinary coefficient and produces a visibly different standard form
 * rather than a validation error.
 *
 * The coefficients span -1000..1000 rather than the 1..10 of standard form, and
 * that is the point of the "write in standard form" mode: 250 x 10^3 and
 * 0.004 x 10^6 are the inputs someone actually arrives with, and both are the
 * same number as 2.5 x 10^5 and 4 x 10^3. `softRange` sizes the visible track
 * from the default — niceCeil(6.02 x 4) = 50 — so the slider shows -50..50 with
 * the full validated range still typeable, and a negative coefficient, which is
 * how a negative number is written in standard form, stays one drag away.
 *
 * The exponents run -350..350. Beyond about 308 a double becomes Infinity, and
 * the whole reason the coefficient and the exponent are kept as separate fields
 * here is that the arithmetic on the exponent is exact integer work: 6.02 x
 * 10^300 times 3 x 10^300 is reported as 2 x 10^601, not as a dash.
 *
 * Every default lands on `min + n * step`, which an HTML range snaps to:
 * (6.02 + 1000) / 0.01 = 100602, (23 + 350) / 1 = 373.
 */
export const fields = [
  {
    kind: 'select',
    id: 'operation',
    label: 'What to do',
    default: 'normalise',
    options: [
      { value: 'normalise', label: 'Write in standard form' },
      { value: 'multiply', label: 'Multiply A by B' },
      { value: 'divide', label: 'Divide A by B' },
      { value: 'add', label: 'Add A and B' },
      { value: 'subtract', label: 'Subtract B from A' },
    ],
  },
  {
    kind: 'number',
    id: 'coefficientA',
    label: 'Coefficient of A',
    // 6.02 x 10^23 is Avogadro's number, the figure this notation exists for.
    default: 6.02,
    min: -1000,
    max: 1000,
    step: 0.01,
    help: 'The number in front. Standard form wants it between 1 and 10, but anything is accepted and normalised.',
  },
  {
    kind: 'number',
    id: 'exponentA',
    label: 'Exponent of A (power of ten)',
    default: 23,
    min: -350,
    max: 350,
    step: 1,
    help: 'How many places the decimal point moves. Positive is a large number, negative a small one.',
  },
  {
    kind: 'number',
    id: 'coefficientB',
    label: 'Coefficient of B',
    // Written 3.0 in a textbook, and stored as 3 here — a number input has
    // nowhere to keep that trailing zero, which the result says out loud.
    default: 3,
    min: -1000,
    max: 1000,
    step: 0.01,
    help: 'Only used by multiply, divide, add and subtract.',
  },
  {
    kind: 'number',
    id: 'exponentB',
    label: 'Exponent of B (power of ten)',
    default: 8,
    min: -350,
    max: 350,
    step: 1,
    help: 'Only used by multiply, divide, add and subtract.',
  },
] as const satisfies readonly Field[]

import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * The debt list is ONE text field on purpose: a household has however many debts
 * it has, and a fixed grid of number inputs would cap the list at whatever count
 * we guessed. `kind: 'text'` renders as a SINGLE-LINE input, so the parser in
 * `compute.ts` accepts semicolons, commas and newlines as record separators and
 * never splits on spaces — "Credit card: 6200" has to survive intact.
 *
 * `monthlyBudget` is the first NUMBER field, which is the one the end-to-end
 * suite nudges to 1.1x its default. A bigger budget is always valid input and
 * always shortens the payoff, so the nudge produces a different, valid result.
 */
export const fields = [
  {
    kind: 'text',
    id: 'debts',
    label: 'Your debts',
    default:
      'Medical bill: 1400 at 0%; Credit card: 6200 at 24.99%; Car loan: 9800 at 6.9% min 265; Student loan: 11500 at 5.5% min 125',
    placeholder: 'Credit card: 6200 at 24.99%; Car loan: 9800 at 6.9% min 265',
    help: 'One debt per entry, separated by a semicolon or a comma: name, balance, rate, and optionally the required minimum payment. Anything unlabelled is read as balance, then rate, then minimum.',
  },
  {
    kind: 'number',
    id: 'monthlyBudget',
    label: 'Total monthly budget for debt',
    default: 950,
    // Both ends of this slider are values compute accepts at the default debt
    // list: $650 clears it in about 55 months, and $20,000 in two.
    min: 650,
    max: 20_000,
    step: 10,
    unit: '$',
    help: 'Everything you put toward these debts each month, minimum payments included.',
  },
] as const satisfies readonly Field[]

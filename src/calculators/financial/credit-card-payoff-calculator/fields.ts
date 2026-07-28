import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its input type from
 * them without importing `index.ts` — which imports `compute.ts` and would cycle.
 *
 * `balance` is deliberately first: it is the field an end-to-end test nudges to
 * 1.1x its default, and a bigger balance at the same payment is always still
 * valid input and always moves the payoff time.
 */
export const fields = [
  {
    kind: 'number',
    id: 'balance',
    label: 'Card balance',
    default: 5000,
    min: 100,
    max: 1_000_000,
    step: 100,
    unit: '$',
  },
  {
    kind: 'number',
    id: 'apr',
    label: 'Annual interest rate (APR)',
    default: 22.9,
    min: 0,
    max: 100,
    step: 0.1,
    unit: '%',
  },
  {
    kind: 'number',
    id: 'monthlyPayment',
    label: 'Monthly payment',
    default: 250,
    // `compute` rejects a payment that does not clear the first month of interest;
    // at the default balance and APR that is about $95.
    min: 100,
    max: 100_000,
    step: 10,
    unit: '$',
    help: 'Must exceed the first month of interest, or the balance never falls.',
  },
] as const satisfies readonly Field[]

import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its input type from
 * them without importing `index.ts` — which imports `compute.ts` and would cycle.
 *
 * `goalAmount` is deliberately first: the end-to-end suite nudges the first
 * number field to 1.1× its default, and a larger target always moves the number
 * of months (whereas nudging, say, a rate can round to the same month count).
 */
export const fields = [
  {
    kind: 'number',
    id: 'goalAmount',
    label: 'Savings goal',
    default: 25_000,
    min: 1,
    max: 100_000_000,
    step: 1000,
    unit: '$',
    help: 'The balance you want to reach.',
  },
  {
    kind: 'number',
    id: 'currentSavings',
    label: 'Current savings',
    default: 5000,
    min: 0,
    max: 100_000_000,
    step: 500,
    unit: '$',
  },
  {
    kind: 'number',
    id: 'monthlyDeposit',
    label: 'Monthly deposit',
    default: 300,
    min: 0,
    max: 1_000_000,
    step: 50,
    unit: '$/mo',
  },
  {
    kind: 'number',
    id: 'annualRate',
    label: 'Annual return',
    default: 4,
    min: 0,
    max: 30,
    step: 0.1,
    unit: '%',
    help: 'Compounded monthly. Use the rate your account actually pays.',
  },
] as const satisfies readonly Field[]

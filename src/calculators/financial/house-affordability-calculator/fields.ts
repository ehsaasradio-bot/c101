import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its input type from
 * them without importing `index.ts` — which imports `compute.ts` and would cycle.
 *
 * `annualIncome` is deliberately first: the end-to-end suite nudges the first
 * number field to 1.1× its default, and more income must remain valid input and
 * must move the headline number.
 */
export const fields = [
  {
    kind: 'number',
    id: 'annualIncome',
    label: 'Gross annual income',
    default: 90_000,
    // Below roughly $17k a year the default other-debt payment already eats the
    // whole 36% back-end limit, which `compute` rejects.
    min: 20_000,
    max: 10_000_000,
    step: 1000,
    unit: '$',
    help: 'Household income before tax.',
  },
  {
    kind: 'number',
    id: 'monthlyDebts',
    label: 'Other monthly debt payments',
    default: 500,
    min: 0,
    max: 100_000,
    step: 25,
    unit: '$/mo',
    help: 'Car loans, student loans, and minimum card payments — not rent.',
  },
  {
    kind: 'number',
    id: 'downPayment',
    label: 'Cash down payment',
    default: 60_000,
    min: 0,
    max: 10_000_000,
    step: 1000,
    unit: '$',
  },
  {
    kind: 'number',
    id: 'annualRate',
    label: 'Mortgage interest rate',
    default: 6.5,
    min: 0,
    max: 30,
    step: 0.125,
    unit: '%',
  },
  {
    kind: 'select',
    id: 'years',
    label: 'Loan term',
    default: '30',
    options: [
      { value: '30', label: '30 years' },
      { value: '20', label: '20 years' },
      { value: '15', label: '15 years' },
      { value: '10', label: '10 years' },
    ],
  },
] as const satisfies readonly Field[]

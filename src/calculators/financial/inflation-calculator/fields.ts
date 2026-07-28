import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its input type from
 * them without importing `index.ts` — which imports `compute.ts` and would cycle.
 *
 * `amount` is deliberately first: the end-to-end suite nudges the first number
 * field to 1.1× its default, and scaling the amount both stays inside min/max
 * and moves the primary result proportionally.
 */
export const fields = [
  {
    kind: 'number',
    id: 'amount',
    label: 'Amount today',
    default: 10_000,
    min: 100,
    max: 1_000_000_000,
    step: 100,
    unit: '$',
    help: 'The sum of money whose future cost you want to project.',
  },
  {
    kind: 'number',
    id: 'annualInflationRate',
    label: 'Annual inflation rate',
    default: 3,
    min: 0,
    max: 50,
    step: 0.1,
    unit: '%',
    help: 'Long-run US CPI inflation has averaged roughly 3% a year.',
  },
  {
    kind: 'number',
    id: 'years',
    label: 'Number of years',
    default: 20,
    min: 0,
    max: 100,
    step: 1,
    unit: 'yr',
  },
] as const satisfies readonly Field[]

import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its input type from
 * them without importing `index.ts` — which imports `compute.ts` and would cycle.
 */
export const fields = [
  {
    kind: 'number',
    id: 'principal',
    label: 'Starting balance',
    default: 10_000,
    min: 0,
    max: 100_000_000,
    step: 500,
    unit: '$',
  },
  {
    kind: 'number',
    id: 'annualRate',
    label: 'Annual interest rate',
    default: 7,
    min: 0,
    max: 100,
    step: 0.25,
    unit: '%',
    help: 'The nominal yearly rate, before compounding is applied.',
  },
  {
    kind: 'number',
    id: 'years',
    label: 'Years to grow',
    default: 20,
    min: 1,
    max: 100,
    step: 1,
    unit: 'yr',
  },
  {
    kind: 'select',
    id: 'compoundsPerYear',
    label: 'Compounding frequency',
    default: '12',
    options: [
      { value: '1', label: 'Annually' },
      { value: '4', label: 'Quarterly' },
      { value: '12', label: 'Monthly' },
      { value: '365', label: 'Daily' },
    ],
  },
  {
    kind: 'number',
    id: 'monthlyContribution',
    label: 'Monthly contribution',
    default: 200,
    min: 0,
    max: 1_000_000,
    step: 50,
    unit: '$/mo',
    help: 'Added at the end of every month, on top of the starting balance.',
  },
] as const satisfies readonly Field[]

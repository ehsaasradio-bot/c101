import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its input type from
 * them without importing `index.ts` — which imports `compute.ts` and would cycle.
 *
 * `amount` is deliberately first: the end-to-end suite nudges the first number
 * field to 1.1× its default, and that has to stay valid and move the result.
 */
export const fields = [
  {
    kind: 'number',
    id: 'amount',
    label: 'Amount',
    default: 100,
    min: 0,
    max: 100_000_000,
    step: 1,
    unit: '$',
    help: 'The pre-tax price when adding tax, or the tax-inclusive total when extracting it.',
  },
  {
    kind: 'number',
    id: 'taxRate',
    label: 'Sales tax rate',
    default: 8.25,
    min: 0,
    max: 100,
    step: 0.05,
    unit: '%',
  },
  {
    kind: 'select',
    id: 'mode',
    label: 'Calculation',
    default: 'add',
    options: [
      { value: 'add', label: 'Add tax to the amount' },
      { value: 'extract', label: 'Extract tax from the amount' },
    ],
  },
] as const satisfies readonly Field[]

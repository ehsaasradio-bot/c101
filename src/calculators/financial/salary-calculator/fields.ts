import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its input type from
 * them without importing `index.ts` — which imports `compute.ts` and would cycle.
 *
 * `amount` is deliberately first: the end-to-end suite nudges the first number
 * field to 1.1x its default, and pay is perfectly linear in the amount, so the
 * nudged value is always valid and always moves the headline number.
 */
export const fields = [
  {
    kind: 'number',
    id: 'amount',
    label: 'Pay amount',
    default: 25,
    min: 0.5,
    max: 10_000_000,
    step: 0.5,
    unit: '$',
    help: 'Gross pay, before tax and deductions.',
  },
  {
    kind: 'select',
    id: 'payPeriod',
    label: 'Paid per',
    default: 'hourly',
    options: [
      { value: 'hourly', label: 'Hour' },
      { value: 'daily', label: 'Day' },
      { value: 'weekly', label: 'Week' },
      { value: 'biweekly', label: 'Two weeks' },
      { value: 'monthly', label: 'Month' },
      { value: 'annual', label: 'Year' },
    ],
  },
  {
    kind: 'number',
    id: 'hoursPerWeek',
    label: 'Hours per week',
    default: 40,
    min: 1,
    max: 168,
    step: 1,
    unit: 'hrs',
  },
  {
    kind: 'number',
    id: 'weeksPerYear',
    label: 'Paid weeks per year',
    default: 52,
    min: 1,
    max: 52,
    step: 1,
    unit: 'wks',
    help: 'Drop below 52 if you take unpaid time off.',
  },
] as const satisfies readonly Field[]

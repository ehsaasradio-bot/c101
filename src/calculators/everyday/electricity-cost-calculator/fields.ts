import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its input type from
 * them without importing `index.ts` — which imports `compute.ts` and would cycle.
 *
 * `watts` is deliberately first: the end-to-end suite nudges the first number
 * field to 1.1× its default, and wattage is both valid anywhere in its range and
 * strictly proportional to the headline cost.
 */
export const fields = [
  {
    kind: 'number',
    id: 'watts',
    label: 'Appliance power',
    default: 1000,
    min: 10,
    max: 100_000,
    step: 10,
    unit: 'W',
    help: 'Check the rating plate or manual. 1 kW = 1000 W.',
  },
  {
    kind: 'number',
    id: 'hoursPerDay',
    label: 'Hours used per day',
    default: 4,
    min: 0,
    max: 24,
    step: 0.5,
    unit: 'h',
  },
  {
    kind: 'number',
    id: 'daysPerMonth',
    label: 'Days used per month',
    default: 30,
    min: 0,
    max: 31,
    step: 1,
    unit: 'days',
  },
  {
    kind: 'number',
    id: 'ratePerKwh',
    label: 'Electricity rate',
    default: 0.17,
    min: 0,
    max: 5,
    step: 0.01,
    unit: '$/kWh',
    help: 'Take your bill total divided by the kWh billed, so it includes fixed charges.',
  },
] as const satisfies readonly Field[]

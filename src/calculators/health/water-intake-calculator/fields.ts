import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its input type from
 * them without importing `index.ts` — which imports `compute.ts` and would cycle.
 *
 * `weight` is deliberately the first number field: it scales the baseline
 * requirement linearly, so nudging it always moves the primary result.
 */
export const fields = [
  {
    kind: 'select',
    id: 'units',
    label: 'Units',
    default: 'metric',
    options: [
      { value: 'metric', label: 'Metric (kg)' },
      { value: 'imperial', label: 'Imperial (lb)' },
    ],
  },
  {
    kind: 'number',
    id: 'weight',
    label: 'Body weight',
    default: 70,
    // `compute` rejects anything over 300 kg as a unit mix-up. 660 lb converts
    // to 299 kg, so the imperial variant reaches the same real ceiling without
    // the metric cap cutting an imperial user off at 300 lb (136 kg).
    min: 20,
    max: 660,
    step: 0.5,
    unit: 'kg',
    variants: {
      on: 'units',
      cases: {
        metric: { min: 20, max: 300, step: 0.5, unit: 'kg' },
        imperial: { min: 44, max: 660, step: 1, unit: 'lb', factor: 2.2046226218487757 },
      },
    },
  },
  {
    kind: 'number',
    id: 'exerciseMinutes',
    label: 'Exercise',
    default: 30,
    min: 0,
    max: 600,
    step: 5,
    unit: 'min/day',
    help: 'Minutes of moderate-to-hard activity on a typical day.',
  },
  {
    kind: 'select',
    id: 'climate',
    label: 'Climate',
    default: 'temperate',
    options: [
      { value: 'temperate', label: 'Temperate' },
      { value: 'hot', label: 'Hot or humid' },
    ],
  },
] as const satisfies readonly Field[]

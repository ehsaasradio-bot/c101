import type { Field } from '../../../lib/types'

/**
 * Weight is the first number field, so it is the one the end-to-end suite
 * nudges to 1.1x its default. 77kg is well inside min/max and moves BMR by
 * exactly 10 x 7 = 70 kcal, so the primary result provably changes.
 */
export const fields = [
  {
    kind: 'select',
    id: 'units',
    label: 'Units',
    default: 'metric',
    options: [
      { value: 'metric', label: 'Metric (kg, cm)' },
      { value: 'imperial', label: 'Imperial (lb, in)' },
    ],
  },
  {
    kind: 'select',
    id: 'sex',
    label: 'Sex at birth',
    default: 'male',
    options: [
      { value: 'male', label: 'Male' },
      { value: 'female', label: 'Female' },
    ],
    help: 'Mifflin-St Jeor uses a different constant for each.',
  },
  {
    kind: 'number',
    id: 'weight',
    label: 'Weight',
    default: 70,
    // The union of the variants below. `compute` calls anything over 700 kg a
    // unit mix-up, and 660 lb is only 299 kg, so neither variant reaches it.
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
    id: 'height',
    label: 'Height',
    default: 175,
    min: 20,
    // `compute` rejects heights above 272 cm as a unit mix-up; 107 in is 271.8 cm.
    max: 272,
    step: 0.5,
    unit: 'cm',
    variants: {
      on: 'units',
      cases: {
        metric: { min: 50, max: 272, step: 0.5, unit: 'cm' },
        imperial: { min: 20, max: 107, step: 0.5, unit: 'in', factor: 0.39370078740157477 },
      },
    },
  },
  {
    kind: 'number',
    id: 'age',
    label: 'Age',
    default: 30,
    min: 1,
    max: 120,
    step: 1,
    unit: 'years',
  },
] as const satisfies readonly Field[]

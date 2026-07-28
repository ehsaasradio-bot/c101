import type { Field } from '../../../lib/types'

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
    kind: 'number',
    id: 'weight',
    label: 'Weight',
    default: 70,
    // Top-level min/max are the union of the two variants below — the absolute
    // range the field will ever accept. The variants narrow the control to the
    // unit actually selected, so an imperial user is no longer handed a
    // kilogram-shaped slider they have to fight.
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
    max: 250,
    step: 0.5,
    unit: 'cm',
    // 250 cm and 98 in both land under the 2.72 m unit-sanity check in `compute`.
    variants: {
      on: 'units',
      cases: {
        metric: { min: 50, max: 250, step: 0.5, unit: 'cm' },
        imperial: { min: 20, max: 98, step: 0.5, unit: 'in', factor: 0.39370078740157477 },
      },
    },
  },
] as const satisfies readonly Field[]

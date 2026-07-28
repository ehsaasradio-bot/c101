import type { Field } from '../../../lib/types'

export const fields = [
  {
    kind: 'select',
    id: 'units',
    label: 'Units',
    default: 'metric',
    options: [
      { value: 'metric', label: 'Metric (cm, kg)' },
      { value: 'imperial', label: 'Imperial (in, lb)' },
    ],
  },
  {
    kind: 'select',
    id: 'sex',
    label: 'Sex',
    default: 'male',
    options: [
      { value: 'male', label: 'Male' },
      { value: 'female', label: 'Female' },
    ],
  },
  {
    kind: 'number',
    id: 'height',
    label: 'Height',
    default: 175,
    min: 48,
    max: 250,
    step: 0.5,
    unit: 'cm',
    help: 'Centimetres in metric, inches in imperial.',
    // `compute` applies the formulas from 120 cm up, calls anything over 250 cm
    // a unit mix-up, and separately rejects an imperial height above 100 as
    // centimetres. 48 in is 122 cm and 98 in is 249 cm, so both clear all three.
    variants: {
      on: 'units',
      cases: {
        metric: { min: 120, max: 250, step: 0.5, unit: 'cm' },
        imperial: { min: 48, max: 98, step: 0.5, unit: 'in', factor: 0.39370078740157477 },
      },
    },
  },
] as const satisfies readonly Field[]

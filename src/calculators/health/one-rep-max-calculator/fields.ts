import type { Field } from '../../../lib/types'

export const fields = [
  {
    kind: 'select',
    id: 'units',
    label: 'Units',
    default: 'kg',
    options: [
      { value: 'kg', label: 'Kilograms (kg)' },
      { value: 'lb', label: 'Pounds (lb)' },
    ],
  },
  {
    kind: 'number',
    id: 'weight',
    label: 'Weight lifted',
    help: 'The load on the bar for the set you actually completed.',
    default: 100,
    // The union of the two variants. `compute` never converts — it echoes the
    // unit back — so the only thing the variants fix is the scale of the slider:
    // a 500 kg cap is a 1000 lb cap, not a 500 lb one.
    min: 1,
    max: 1000,
    step: 0.5,
    unit: 'kg',
    variants: {
      on: 'units',
      cases: {
        kg: { min: 1, max: 500, step: 0.5, unit: 'kg' },
        lb: { min: 2, max: 1000, step: 1, unit: 'lb', factor: 2.2046226218487757 },
      },
    },
  },
  {
    kind: 'number',
    id: 'reps',
    label: 'Reps completed',
    help: 'Whole reps taken close to failure. Accuracy drops badly above 12.',
    default: 5,
    min: 1,
    max: 12,
    step: 1,
  },
] as const satisfies readonly Field[]

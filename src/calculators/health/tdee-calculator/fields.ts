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
    kind: 'select',
    id: 'sex',
    label: 'Sex',
    help: 'Mifflin-St Jeor uses a different constant for each.',
    default: 'male',
    options: [
      { value: 'male', label: 'Male' },
      { value: 'female', label: 'Female' },
    ],
  },
  {
    kind: 'number',
    id: 'weight',
    label: 'Weight',
    default: 70,
    // Union of the two variants; each one narrows the control to its own unit.
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
    min: 24,
    max: 272,
    step: 0.5,
    unit: 'cm',
    // `compute` treats anything outside 60–272 cm as a unit mix-up. 24 in is
    // 61 cm and 107 in is 271.8 cm, so both imperial ends stay inside it.
    variants: {
      on: 'units',
      cases: {
        metric: { min: 60, max: 272, step: 0.5, unit: 'cm' },
        imperial: { min: 24, max: 107, step: 0.5, unit: 'in', factor: 0.39370078740157477 },
      },
    },
  },
  {
    kind: 'number',
    id: 'age',
    label: 'Age',
    default: 30,
    min: 15,
    max: 100,
    step: 1,
    unit: 'years',
  },
  {
    kind: 'select',
    id: 'activityLevel',
    label: 'Activity level',
    help: 'Count deliberate training, not fidgeting.',
    default: 'moderate',
    options: [
      { value: 'sedentary', label: 'Sedentary — desk job, little or no exercise' },
      { value: 'light', label: 'Lightly active — 1-3 sessions a week' },
      { value: 'moderate', label: 'Moderately active — 3-5 sessions a week' },
      { value: 'very', label: 'Very active — 6-7 sessions a week' },
      { value: 'athlete', label: 'Athlete — twice-daily or physical job' },
    ],
  },
] as const satisfies readonly Field[]

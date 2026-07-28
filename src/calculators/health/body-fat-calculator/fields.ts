import type { Field } from '../../../lib/types'

/**
 * Height leads the number fields deliberately: it is the one measurement that
 * appears in both the male and the female equation, so any nudge to it always
 * moves the result.
 *
 * Every tape measurement carries `variants` keyed off the units select, because
 * a bound that is sane in centimetres is nonsense in inches. Top-level min/max
 * stay as the union of the two — the absolute accepted range — while the
 * variants are what the control actually offers.
 */
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
    label: 'Sex at birth',
    default: 'male',
    options: [
      { value: 'male', label: 'Male' },
      { value: 'female', label: 'Female' },
    ],
    help: 'The Navy method uses a different equation for each.',
  },
  {
    kind: 'number',
    id: 'height',
    label: 'Height',
    default: 178,
    min: 42,
    max: 250,
    step: 0.5,
    unit: 'cm',
    // `compute` works in inches and accepts 40–107 in. 105 cm is the lowest
    // centimetre value that clears the floor; 42 in is the imperial equivalent.
    variants: {
      on: 'units',
      cases: {
        metric: { min: 105, max: 250, step: 0.5, unit: 'cm' },
        imperial: { min: 42, max: 98, step: 0.5, unit: 'in', factor: 0.39370078740157477 },
      },
    },
  },
  {
    kind: 'number',
    id: 'neck',
    label: 'Neck circumference',
    default: 38,
    min: 8,
    max: 60,
    step: 0.5,
    unit: 'cm',
    help: 'Measure just below the larynx, tape sloping slightly down at the front.',
    // A neck approaching the waist drives the Navy regression to a non-positive
    // percentage, which `compute` rejects. Both caps stay inside that.
    variants: {
      on: 'units',
      cases: {
        metric: { min: 20, max: 60, step: 0.5, unit: 'cm' },
        imperial: { min: 8, max: 24, step: 0.25, unit: 'in', factor: 0.39370078740157477 },
      },
    },
  },
  {
    kind: 'number',
    id: 'waist',
    label: 'Waist circumference',
    default: 92,
    min: 28,
    max: 200,
    step: 0.5,
    unit: 'cm',
    help: 'Men measure at the navel; women measure at the narrowest point.',
    // Mirror image of the neck cap: too small a waist against the default neck
    // returns a non-positive percentage.
    variants: {
      on: 'units',
      cases: {
        metric: { min: 70, max: 200, step: 0.5, unit: 'cm' },
        imperial: { min: 28, max: 79, step: 0.5, unit: 'in', factor: 0.39370078740157477 },
      },
    },
  },
  {
    kind: 'number',
    id: 'hip',
    label: 'Hip circumference',
    default: 100,
    min: 28,
    max: 200,
    step: 0.5,
    unit: 'cm',
    help: 'Used by the female equation only — measure at the widest point.',
    variants: {
      on: 'units',
      cases: {
        metric: { min: 70, max: 200, step: 0.5, unit: 'cm' },
        imperial: { min: 28, max: 79, step: 0.5, unit: 'in', factor: 0.39370078740157477 },
      },
    },
  },
  {
    // Weight plays no part in the Navy equation; it only turns the resulting
    // percentage into a fat mass and a lean mass. It trails the tape
    // measurements for that reason. 80 kg matches the 178 cm / 92 cm waist
    // default body already described by the fields above.
    kind: 'number',
    id: 'weight',
    label: 'Body weight',
    default: 80,
    min: 20,
    max: 660,
    step: 0.5,
    unit: 'kg',
    help: 'Used only to split the percentage into fat mass and lean mass.',
    variants: {
      on: 'units',
      cases: {
        metric: { min: 20, max: 300, step: 0.5, unit: 'kg' },
        imperial: { min: 44, max: 660, step: 1, unit: 'lb', factor: 2.2046226218487757 },
      },
    },
  },
] as const satisfies readonly Field[]

import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * `waist` is deliberately the FIRST number field: `tests/calculators.spec.ts`
 * nudges that one to 1.1x its default and expects a valid, different result.
 * 88 cm becomes 96.8 cm, which stays inside the field's own bounds and moves the
 * ratio from 0.863 to 0.949 — across the WHO cut-off for men, so the headline,
 * the band and the meter all genuinely change.
 *
 * Every tape measurement carries `variants` keyed off the units select, because
 * a bound that is sane in centimetres is nonsense in inches. The top-level
 * min/max stay as the union of the two cases — the absolute accepted range —
 * while the variants are what the control actually offers.
 *
 * Both ratios are dimensionless, so the unit selection never changes the answer;
 * it exists so the sliders, the ticks and the printed lengths speak the
 * visitor's own units.
 */
export const fields = [
  {
    kind: 'select',
    id: 'units',
    label: 'Units',
    default: 'metric',
    options: [
      { value: 'metric', label: 'Metric (cm)' },
      { value: 'imperial', label: 'Imperial (in)' },
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
    help: 'The WHO waist-to-hip cut-off is 0.90 for men and 0.85 for women.',
  },
  {
    kind: 'number',
    id: 'waist',
    label: 'Waist circumference',
    default: 88,
    // Union of the two cases below: 16 in is 40.6 cm and 79 in is 200.7 cm, so
    // the two cases describe one real range to within a centimetre.
    min: 16,
    max: 200,
    step: 0.5,
    unit: 'cm',
    help: 'Measure midway between the lowest rib and the top of the hip bone, at the end of a normal breath out.',
    variants: {
      on: 'units',
      cases: {
        metric: { min: 40, max: 200, step: 0.5, unit: 'cm' },
        imperial: { min: 16, max: 79, step: 0.5, unit: 'in', factor: 0.39370078740157477 },
      },
    },
  },
  {
    kind: 'number',
    id: 'hip',
    label: 'Hip circumference',
    default: 102,
    // The floor is a usable positive value rather than 0. The ratio divides by
    // this number and `compute` refuses a hip of zero, so a slider whose left
    // end sat on 0 would be one drag away from an error message.
    min: 20,
    max: 200,
    step: 0.5,
    unit: 'cm',
    help: 'Measure around the widest part of the buttocks, keeping the tape level all the way round.',
    variants: {
      on: 'units',
      cases: {
        metric: { min: 50, max: 200, step: 0.5, unit: 'cm' },
        imperial: { min: 20, max: 79, step: 0.5, unit: 'in', factor: 0.39370078740157477 },
      },
    },
  },
  {
    kind: 'number',
    id: 'height',
    label: 'Height',
    default: 180,
    // 39 in is 99.1 cm and 98 in is 248.9 cm; the metric case runs 100 to 250.
    // All four ends sit inside the 90-272 cm unit-sanity window `compute`
    // enforces, so neither end of either slider offers a value the calculator
    // then refuses.
    min: 39,
    max: 250,
    step: 0.5,
    unit: 'cm',
    help: 'Used for the waist-to-height ratio only — the waist-to-hip ratio does not need it.',
    variants: {
      on: 'units',
      cases: {
        metric: { min: 100, max: 250, step: 0.5, unit: 'cm' },
        imperial: { min: 39, max: 98, step: 0.5, unit: 'in', factor: 0.39370078740157477 },
      },
    },
  },
] as const satisfies readonly Field[]

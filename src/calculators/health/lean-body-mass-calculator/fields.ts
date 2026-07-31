import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * Weight leads the number fields deliberately: it appears in all three
 * predictive equations AND in the body-fat route, so the 1.1x nudge the
 * end-to-end suite applies to the first number field always moves every figure
 * on the page.
 *
 * The mass and length fields carry `variants` keyed off the units select,
 * because a bound that is sane in kilograms is nonsense in pounds. The
 * top-level min/max stay as the union of the two — the absolute accepted range
 * — while the variants are what the control actually offers. Body fat is a
 * percentage and means the same thing in both systems, so it has no variants.
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
    help: 'Each of these equations was fitted separately for men and women.',
  },
  {
    kind: 'number',
    id: 'weight',
    label: 'Body weight',
    default: 80,
    min: 50,
    max: 400,
    step: 0.5,
    unit: 'kg',
    /*
     * The floor is not squeamishness about small people, it is the equations
     * running out of road. Boer adds 0.267 kg of predicted lean mass per
     * centimetre of height regardless of weight, so below roughly 50 kg at an
     * average height it predicts more lean mass than the whole body weighs —
     * `compute` rejects that, and a slider must not offer a value its own
     * calculator refuses. 110 lb is the same 49.9 kg in the imperial control.
     */
    variants: {
      on: 'units',
      cases: {
        metric: { min: 50, max: 180, step: 0.5, unit: 'kg' },
        imperial: { min: 110, max: 400, step: 1, unit: 'lb', factor: 2.2046226218487757 },
      },
    },
  },
  {
    kind: 'number',
    id: 'height',
    label: 'Height',
    default: 178,
    min: 52,
    max: 220,
    step: 0.5,
    unit: 'cm',
    /*
     * `compute` accepts 120-230 cm and treats anything outside that as the
     * wrong unit selected — 178 read as inches, or 70 read as centimetres.
     * Both variants sit inside it: 52 in is 132.1 cm, 86 in is 218.4 cm.
     */
    variants: {
      on: 'units',
      cases: {
        metric: { min: 130, max: 220, step: 0.5, unit: 'cm' },
        imperial: { min: 52, max: 86, step: 0.5, unit: 'in', factor: 0.39370078740157477 },
      },
    },
  },
  {
    // The one input that carries real information about your own composition
    // rather than a population average. It trails the two the predictive
    // formulas need, because those deliberately work without it.
    kind: 'number',
    id: 'bodyFat',
    label: 'Known body fat',
    default: 21,
    min: 3,
    max: 60,
    step: 0.5,
    unit: '%',
    help: 'From a DEXA scan, calipers or the tape method. It changes only the fourth estimate — the three predictive formulas never see it.',
  },
] as const satisfies readonly Field[]

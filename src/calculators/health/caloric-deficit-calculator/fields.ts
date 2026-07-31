import type { Field } from '../../../lib/types'

/**
 * This calculator deliberately starts where the TDEE calculator finishes.
 *
 * `maintenance` is an INPUT here, not an output: estimating it from height,
 * weight, age, sex and activity is the TDEE calculator's whole job, and
 * repeating Mifflin-St Jeor here would give the site two pages answering the
 * same question that disagree the moment one is edited. What this page adds is
 * the part TDEE stops short of — turning a maintenance figure and a goal weight
 * into a daily intake, a rate and a date, and then showing how badly the
 * arithmetic behind that date ages.
 *
 * `maintenance` is also the first number field, which is the one the end-to-end
 * suite nudges to 1.1x its default. 2,500 becomes 2,750, which is inside its
 * bounds and moves every downstream figure, so the check has something real to
 * observe.
 *
 * `startDate` is last and defaults to 'today', resolved by the view layer so
 * `compute` never reads a clock. A hardcoded start would be stale within months
 * and would put every projected goal date in the past.
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
    kind: 'select',
    id: 'sex',
    label: 'Sex',
    help: 'Used only for the minimum intake considered safe without medical supervision.',
    default: 'male',
    options: [
      { value: 'male', label: 'Male' },
      { value: 'female', label: 'Female' },
    ],
  },
  {
    kind: 'number',
    id: 'maintenance',
    label: 'Maintenance calories',
    default: 2500,
    // The floor is not cosmetic. The safe-intake check needs room to leave a
    // usable deficit at every value the slider offers, and 1,600 kcal still
    // leaves 100 kcal against the stricter 1,500 kcal floor.
    min: 1600,
    max: 5000,
    step: 50,
    unit: 'kcal/day',
    help: 'The calories you burn in an average day. The TDEE calculator estimates this if you do not know it.',
  },
  {
    kind: 'number',
    id: 'currentWeight',
    label: 'Current weight',
    default: 85,
    // Union of the two variants; each case narrows the control to its own unit.
    min: 35,
    max: 660,
    step: 0.5,
    unit: 'kg',
    variants: {
      on: 'units',
      cases: {
        metric: { min: 35, max: 300, step: 0.5, unit: 'kg' },
        imperial: { min: 77, max: 660, step: 1, unit: 'lb', factor: 2.2046226218487757 },
      },
    },
  },
  {
    kind: 'number',
    id: 'targetWeight',
    label: 'Goal weight',
    default: 75,
    min: 35,
    max: 660,
    step: 0.5,
    unit: 'kg',
    help: 'A goal above your current weight is fine — the same energy balance runs in reverse.',
    variants: {
      on: 'units',
      cases: {
        metric: { min: 35, max: 300, step: 0.5, unit: 'kg' },
        imperial: { min: 77, max: 660, step: 1, unit: 'lb', factor: 2.2046226218487757 },
      },
    },
  },
  {
    kind: 'number',
    id: 'weeklyRate',
    label: 'Target rate of change',
    default: 0.4,
    min: 0.05,
    max: 1.9,
    step: 0.05,
    unit: 'kg/week',
    help: 'How fast you want the weight to move. Faster means a bigger deficit, which the safe-intake floor may refuse.',
    // The metric cap of 0.9 kg/week is a 992 kcal/day deficit, which still
    // leaves a safe intake at the default maintenance figure. The imperial cap
    // of 1.9 lb/week is 950 kcal/day, deliberately just inside it.
    variants: {
      on: 'units',
      cases: {
        metric: { min: 0.05, max: 0.9, step: 0.05, unit: 'kg/week' },
        imperial: { min: 0.1, max: 1.9, step: 0.1, unit: 'lb/week', factor: 2.2046226218487757 },
      },
    },
  },
  {
    kind: 'date',
    id: 'startDate',
    label: 'Start date',
    default: 'today',
    help: 'The day you begin. Both projected goal dates are counted from here.',
  },
] as const satisfies readonly Field[]

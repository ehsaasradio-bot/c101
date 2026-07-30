import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * `distance` is deliberately the FIRST number field: the end-to-end suite nudges
 * that one to 1.1x its default and expects a valid, different result. 2400 m
 * becomes 2640 m, which stays inside the field's own bounds and moves the Cooper
 * estimate from 42.4 to 47.7 ml/kg/min — and the Cooper test is the DEFAULT
 * method, so the headline genuinely changes rather than ignoring the input.
 *
 * Every number field a method reads is bounded to a range that method's own
 * equation accepts. The Cooper regression, for instance, returns zero at 504.9 m
 * and goes negative below it, so the floor here is 1000 m rather than something
 * decorative like 0.
 */
export const fields = [
  {
    kind: 'select',
    id: 'method',
    label: 'Field test',
    default: 'cooper',
    options: [
      { value: 'cooper', label: 'Cooper 12-minute run' },
      { value: 'run15', label: '1.5-mile (2.4 km) run' },
      { value: 'rockport', label: 'Rockport 1-mile walk' },
      { value: 'resting', label: 'Resting heart rate (no test)' },
    ],
    help: 'Each test has its own published equation. Fill in the rows the chosen test uses.',
  },
  {
    kind: 'select',
    id: 'units',
    label: 'Units',
    default: 'metric',
    options: [
      { value: 'metric', label: 'Metric (m, kg)' },
      { value: 'imperial', label: 'Imperial (yd, lb)' },
    ],
  },
  {
    kind: 'number',
    id: 'distance',
    label: 'Cooper test — distance in 12 minutes',
    default: 2400,
    // Top-level min/max are the UNION of the two variants below: the absolute
    // range this field will ever accept. The variants narrow the control to the
    // unit actually selected, so a metric user is never handed a yard-shaped
    // slider. 1000 m and 1100 yd are the same distance to within 6 m, as are
    // 4500 m and 4920 yd, so the two cases describe one real range.
    min: 1000,
    max: 4920,
    step: 10,
    unit: 'm',
    variants: {
      on: 'units',
      cases: {
        metric: { min: 1000, max: 4500, step: 10, unit: 'm' },
        imperial: { min: 1100, max: 4920, step: 10, unit: 'yd', factor: 1.0936132983377078 },
      },
    },
  },
  {
    kind: 'number',
    id: 'runTime',
    label: '1.5-mile run — finishing time',
    default: 11.5,
    min: 6,
    max: 25,
    step: 0.1,
    unit: 'min',
    help: 'The same test is run over 2.4 km outside the US; the two distances differ by 14 metres.',
  },
  {
    kind: 'number',
    id: 'walkTime',
    label: 'Rockport walk — time for 1 mile',
    default: 14,
    min: 8,
    max: 25,
    step: 0.1,
    unit: 'min',
  },
  {
    kind: 'number',
    id: 'walkHeartRate',
    label: 'Rockport walk — heart rate at the finish',
    default: 120,
    min: 60,
    max: 200,
    step: 1,
    unit: 'bpm',
    help: 'Take your pulse immediately as you stop walking.',
  },
  {
    kind: 'number',
    id: 'maxHeartRate',
    label: 'Maximum heart rate',
    default: 190,
    min: 120,
    max: 220,
    step: 1,
    unit: 'bpm',
    help: 'A measured maximum if you have one. Otherwise 220 minus your age is the usual stand-in.',
  },
  {
    kind: 'number',
    id: 'restingHeartRate',
    label: 'Resting heart rate',
    default: 60,
    min: 30,
    max: 120,
    step: 1,
    unit: 'bpm',
    help: 'Measured lying down, before getting out of bed.',
  },
  {
    kind: 'number',
    id: 'age',
    label: 'Age',
    default: 30,
    // The fitness-category norms this calculator reports start at age 20.
    min: 20,
    max: 79,
    step: 1,
    unit: 'years',
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
    help: 'Used by the Rockport equation and by the fitness-category norms.',
  },
  {
    kind: 'number',
    id: 'weight',
    label: 'Body weight',
    default: 75,
    // Union of the two cases: 250 kg and 550 lb are the same weight to within
    // 1 kg, and 30 kg and 66 lb likewise.
    min: 30,
    max: 550,
    step: 0.5,
    unit: 'kg',
    variants: {
      on: 'units',
      cases: {
        metric: { min: 30, max: 250, step: 0.5, unit: 'kg' },
        imperial: { min: 66, max: 550, step: 1, unit: 'lb', factor: 2.2046226218487757 },
      },
    },
  },
] as const satisfies readonly Field[]

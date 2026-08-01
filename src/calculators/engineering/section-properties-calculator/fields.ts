import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * `a` is first because the end-to-end suite nudges the first number field to
 * 1.1x its default: 200 becomes 220, which stays clear of the inner height and
 * moves every property on the page.
 *
 * The symbols are the ones a section table uses — a and b for the outer height
 * and width, a₁ and b₁ for the hole — so the output reads straight across to a
 * textbook or a steel handbook without a translation step.
 */
export const fields = [
  {
    kind: 'select',
    id: 'shape',
    label: 'Section',
    default: 'hollowRectangle',
    options: [
      { value: 'hollowRectangle', label: 'Hollow rectangle (box)' },
      { value: 'rectangle', label: 'Solid rectangle' },
      { value: 'hollowCircle', label: 'Hollow circle (tube)' },
      { value: 'circle', label: 'Solid circle' },
    ],
    help: 'Each section reads only the boxes it needs — a circle ignores the height and width, a solid one ignores the hole — so whatever the others hold cannot stop it answering.',
  },
  {
    kind: 'select',
    id: 'unit',
    label: 'Units',
    default: 'mm',
    options: [
      { value: 'mm', label: 'Millimetres (mm)' },
      { value: 'cm', label: 'Centimetres (cm)' },
      { value: 'in', label: 'Inches (in)' },
    ],
    help: 'Switching converts what you have already typed rather than reinterpreting it.',
  },
  {
    kind: 'number',
    id: 'a',
    label: 'Outer height, a',
    default: 200,
    min: 1,
    max: 5000,
    step: 1,
    unit: 'mm',
    variants: {
      on: 'unit',
      // mm is the base, so every factor below is "one of this unit, in mm".
      cases: {
        mm: { min: 1, max: 5000, step: 1, unit: 'mm' },
        cm: { min: 1, max: 500, step: 0.1, unit: 'cm', factor: 10 },
        in: { min: 1, max: 200, step: 0.01, unit: 'in', factor: 25.4 },
      },
    },
  },
  {
    kind: 'number',
    id: 'b',
    label: 'Outer width, b',
    default: 120,
    min: 1,
    max: 5000,
    step: 1,
    unit: 'mm',
    variants: {
      on: 'unit',
      cases: {
        mm: { min: 1, max: 5000, step: 1, unit: 'mm' },
        cm: { min: 1, max: 500, step: 0.1, unit: 'cm', factor: 10 },
        in: { min: 1, max: 200, step: 0.01, unit: 'in', factor: 25.4 },
      },
    },
  },
  {
    // Zero is a legitimate value — it is how you say "no hole" without leaving
    // the hollow section — so the floor is 0 rather than a positive minimum.
    kind: 'number',
    id: 'innerHeight',
    label: 'Inner height, a₁',
    default: 160,
    min: 0,
    max: 4999,
    step: 1,
    unit: 'mm',
    variants: {
      on: 'unit',
      cases: {
        mm: { min: 0, max: 4999, step: 1, unit: 'mm' },
        cm: { min: 0, max: 499, step: 0.1, unit: 'cm', factor: 10 },
        in: { min: 0, max: 196, step: 0.01, unit: 'in', factor: 25.4 },
      },
    },
  },
  {
    kind: 'number',
    id: 'innerWidth',
    label: 'Inner width, b₁',
    default: 90,
    min: 0,
    max: 4999,
    step: 1,
    unit: 'mm',
    variants: {
      on: 'unit',
      cases: {
        mm: { min: 0, max: 4999, step: 1, unit: 'mm' },
        cm: { min: 0, max: 499, step: 0.1, unit: 'cm', factor: 10 },
        in: { min: 0, max: 196, step: 0.01, unit: 'in', factor: 25.4 },
      },
    },
  },
  {
    // A circle is one dimension, not two, so it gets its own pair rather than
    // borrowing the height box and making its label a lie.
    kind: 'number',
    id: 'diameter',
    label: 'Outer diameter, D',
    default: 200,
    min: 1,
    max: 5000,
    step: 1,
    unit: 'mm',
    variants: {
      on: 'unit',
      cases: {
        mm: { min: 1, max: 5000, step: 1, unit: 'mm' },
        cm: { min: 1, max: 500, step: 0.1, unit: 'cm', factor: 10 },
        in: { min: 1, max: 200, step: 0.01, unit: 'in', factor: 25.4 },
      },
    },
  },
  {
    kind: 'number',
    id: 'innerDiameter',
    label: 'Inner diameter, d',
    default: 160,
    min: 0,
    max: 4999,
    step: 1,
    unit: 'mm',
    variants: {
      on: 'unit',
      cases: {
        mm: { min: 0, max: 4999, step: 1, unit: 'mm' },
        cm: { min: 0, max: 499, step: 0.1, unit: 'cm', factor: 10 },
        in: { min: 0, max: 196, step: 0.01, unit: 'in', factor: 25.4 },
      },
    },
  },
] as const satisfies readonly Field[]

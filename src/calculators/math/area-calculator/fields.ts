import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * ── Why the dimensions are called a, b and h ─────────────────────────────────
 *
 * There is no per-shape field visibility in this codebase: every field declared
 * here is always rendered, whatever the `shape` select holds, and a field's
 * LABEL cannot change with another field's value. `variants` can narrow a
 * select's options or move a number's bounds and unit, but it cannot rename or
 * hide anything.
 *
 * Two designs were possible. Six shapes each with their own named fields
 * (length, width, base, radius, semi-axis a, …) would mean eleven-ish
 * permanently visible inputs of which at most three ever matter — a wall of
 * controls that mostly do nothing, with no way to tell which. Instead there are
 * three generically-named dimensions whose LABEL lists every role they take,
 * whose `help` spells the mapping out shape by shape, and which `compute` names
 * explicitly in its steps and notes for the shape actually selected ("Length a",
 * "Radius a", "First parallel side a"). Three inputs, an honest label, and the
 * working shows exactly what each number was read as.
 *
 * `variants` is still used, on `lengthUnit`, for the thing it is actually for:
 * bounds and display units that follow a unit selector. A room is a fixed
 * physical quantity, so each case declares a `factor` and switching from feet to
 * metres restates 16 ft as 4.8768 m rather than leaving 16 to mean something
 * new. The area therefore does not jump when you change the unit.
 *
 * `a` is deliberately the first number field: the e2e suite nudges it to 1.1x
 * its default, and it enters the area of the default shape (a rectangle)
 * linearly, so the answer always moves.
 */

/**
 * Bounds, step and display unit per length unit.
 *
 * `factor` is "value in this case ÷ the same quantity in the base case", and the
 * base is the first case listed — feet, because square footage is the question
 * most people arrive with. The conversions are exact: the international inch has
 * been exactly 25.4 mm since 1959, so 1 ft = 0.3048 m and 1 yd = 0.9144 m.
 */
const LENGTH_VARIANTS = {
  on: 'lengthUnit',
  cases: {
    // Base case: factor 1, deliberately omitted.
    foot: { min: 0.1, max: 100_000, step: 0.1, unit: 'ft' },
    metre: { min: 0.1, max: 30_000, step: 0.1, unit: 'm', factor: 0.3048 },
    yard: { min: 0.1, max: 33_000, step: 0.1, unit: 'yd', factor: 1 / 3 },
    inch: { min: 0.5, max: 1_000_000, step: 0.5, unit: 'in', factor: 12 },
    centimetre: { min: 1, max: 3_000_000, step: 1, unit: 'cm', factor: 30.48 },
  },
} as const

export const fields = [
  {
    kind: 'select',
    id: 'shape',
    label: 'Shape',
    default: 'rectangle',
    options: [
      { value: 'rectangle', label: 'Rectangle or square' },
      { value: 'triangle', label: 'Triangle' },
      { value: 'circle', label: 'Circle' },
      { value: 'trapezoid', label: 'Trapezoid (trapezium)' },
      { value: 'parallelogram', label: 'Parallelogram' },
      { value: 'ellipse', label: 'Ellipse or oval' },
    ],
    help: 'The three dimensions below are read differently for each shape. The working under the result names what each one was used as.',
  },
  {
    kind: 'select',
    id: 'lengthUnit',
    label: 'Measurements are in',
    default: 'foot',
    options: [
      { value: 'foot', label: 'Feet (ft)' },
      { value: 'metre', label: 'Metres (m)' },
      { value: 'yard', label: 'Yards (yd)' },
      { value: 'inch', label: 'Inches (in)' },
      { value: 'centimetre', label: 'Centimetres (cm)' },
    ],
    help: 'Switching this restates the dimensions rather than reinterpreting them, so the area stays the same size. It is reported in this unit squared and converted to six other units.',
  },
  {
    kind: 'number',
    id: 'a',
    label: 'Dimension a — length, base, radius or semi-axis',
    default: 16,
    // The union across every variant; each case narrows it.
    min: 0.1,
    max: 3_000_000,
    step: 0.1,
    unit: 'ft',
    variants: LENGTH_VARIANTS,
    help: 'Rectangle: the length. Triangle or parallelogram: the base. Circle: the radius. Trapezoid: the first parallel side. Ellipse: the longer semi-axis.',
  },
  {
    kind: 'number',
    id: 'b',
    label: 'Dimension b — width, height or second side',
    default: 12,
    min: 0.1,
    max: 3_000_000,
    step: 0.1,
    unit: 'ft',
    variants: LENGTH_VARIANTS,
    help: 'Rectangle: the width. Triangle or parallelogram: the perpendicular height. Trapezoid: the second parallel side. Ellipse: the shorter semi-axis. A circle ignores it.',
  },
  {
    kind: 'number',
    id: 'h',
    label: 'Height h — trapezoid only',
    default: 8,
    min: 0.1,
    max: 3_000_000,
    step: 0.1,
    unit: 'ft',
    variants: LENGTH_VARIANTS,
    help: 'Only the trapezoid uses this: the perpendicular distance between its two parallel sides a and b. Every other shape ignores it.',
  },
] as const satisfies readonly Field[]

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
      { value: 'square', label: 'Square' },
      { value: 'squareDiamond', label: 'Square on the diagonal' },
      { value: 'rotatedRectangle', label: 'Rotated rectangle' },
      { value: 'thinWalledRectangle', label: 'Thin-walled rectangle' },
      { value: 'triangle', label: 'Triangle' },
      { value: 'hexagon', label: 'Hexagon' },
      { value: 'octagon', label: 'Octagon' },
      { value: 'regularPolygon', label: 'Regular polygon' },
      { value: 'cross', label: 'Cross' },
      { value: 'generalTrapezoid', label: 'General trapezoid' },
      { value: 'isoscelesTrapezoid', label: 'Isosceles trapezoid' },
      { value: 'equalLegAngle', label: 'Equal-leg angle' },
      { value: 'rectangularAngle', label: 'Unequal-leg angle' },
      { value: 'channel', label: 'Channel' },
      { value: 'taperedChannel', label: 'Tapered channel' },
      { value: 'zedBeam', label: 'Zed beam' },
      { value: 'iBeam', label: 'I-beam' },
      { value: 'taperedIBeam', label: 'Tapered I-beam' },
      { value: 'unequalIBeam', label: 'Unequal I-beam' },
      { value: 'teeBeam', label: 'Tee beam' },
      { value: 'taperedTeeBeam', label: 'Tapered tee beam' },
      { value: 'circle', label: 'Solid circle' },
      { value: 'hollowCircle', label: 'Hollow circle (tube)' },
      { value: 'thinWalledCircle', label: 'Thin-walled circle' },
      { value: 'halfCircle', label: 'Half circle' },
      { value: 'quarterCircle', label: 'Quarter circle' },
      { value: 'circularSector', label: 'Circular sector' },
      { value: 'circularSegment', label: 'Circular segment' },
      { value: 'oval', label: 'Oval (ellipse)' },
      { value: 'hollowOval', label: 'Hollow oval' },
      { value: 'halfEllipse', label: 'Half ellipse' },
      { value: 'ellipticalQuadrant', label: 'Elliptical quadrant' },
      { value: 'parabolicArea', label: 'Parabolic area' },
      { value: 'parabolicHalfArea', label: 'Parabolic half area' },
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
    // Web or wall. Named for what it is rather than which section uses it,
    // because thirty-odd shapes cannot each have their own box — there is no
    // per-mode field visibility here, so every field renders on every section.
    kind: 'number',
    id: 'webThickness',
    label: 'Web / wall thickness, t',
    default: 10,
    min: 0.1,
    max: 1000,
    step: 0.1,
    unit: 'mm',
    variants: {
      on: 'unit',
      cases: {
        mm: { min: 0.1, max: 1000, step: 0.1, unit: 'mm' },
        cm: { min: 0.1, max: 100, step: 0.1, unit: 'cm', factor: 10 },
        in: { min: 0.1, max: 40, step: 0.01, unit: 'in', factor: 25.4 },
      },
    },
  },
  {
    kind: 'number',
    id: 'flangeThickness',
    label: 'Flange thickness, tf',
    // 20 rather than 15 so an 8 degree taper clears the widest overhang on the
    // page: a channel's flange projects the full b - t, so its drop is
    // 110*tan8 = 15.5, which a 15 mm flange would run out before reaching.
    default: 20,
    min: 0.1,
    max: 1000,
    step: 0.1,
    unit: 'mm',
    variants: {
      on: 'unit',
      cases: {
        mm: { min: 0.1, max: 1000, step: 0.1, unit: 'mm' },
        cm: { min: 0.1, max: 100, step: 0.1, unit: 'cm', factor: 10 },
        in: { min: 0.1, max: 40, step: 0.01, unit: 'in', factor: 25.4 },
      },
    },
  },
  {
    // Dimensionless, so it takes no unit variant.
    kind: 'number',
    id: 'sides',
    label: 'Number of sides, n',
    default: 6,
    min: 3,
    max: 60,
    step: 1,
    help: 'Regular polygons only.',
  },
  {
    kind: 'number',
    id: 'angle',
    label: 'Angle',
    // 8° is a realistic rolled-flange taper, and it is the binding constraint:
    // a taper has to satisfy ((b − t)/2)·tanθ <= tf or the flange runs out
    // before the tip, which caps it near 15° at these defaults. A sector is
    // happy at any angle, so the taper is the one that sets the default.
    default: 8,
    min: 1,
    max: 360,
    step: 1,
    unit: '°',
    help: 'The taper of a tapered flange, the angle a sector or segment subtends, or the rotation of a rotated rectangle. Sectors usually want a much larger value than the default.',
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

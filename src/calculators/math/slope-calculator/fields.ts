import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * `x1` is deliberately first: the end-to-end suite nudges the first number field
 * to 1.1x its default, and moving x1 changes the run, so the slope, the angle,
 * the intercept, the distance and the midpoint all move with it. A default of 0
 * would be immune to that nudge (1.1 x 0 is still 0), so x1 is non-zero.
 *
 * Coordinates are signed, so `min` is negative. Every default still lands on
 * `min + n * step` — with min -1000 and step 0.5, any multiple of 0.5 does,
 * negative ones included.
 */
export const fields = [
  {
    kind: 'number',
    id: 'x1',
    label: 'First point x₁',
    default: 4,
    min: -1000,
    max: 1000,
    step: 0.5,
    help: 'Horizontal coordinate of the first point. Negative values are fine.',
  },
  {
    kind: 'number',
    id: 'y1',
    label: 'First point y₁',
    default: 5,
    min: -1000,
    max: 1000,
    step: 0.5,
    help: 'Vertical coordinate of the first point.',
  },
  {
    kind: 'number',
    id: 'x2',
    label: 'Second point x₂',
    default: 12,
    min: -1000,
    max: 1000,
    step: 0.5,
    help: 'Horizontal coordinate of the second point. Equal to x₁ makes the line vertical.',
  },
  {
    kind: 'number',
    id: 'y2',
    label: 'Second point y₂',
    default: 11,
    min: -1000,
    max: 1000,
    step: 0.5,
    help: 'Vertical coordinate of the second point. Equal to y₁ makes the line horizontal.',
  },
] as const satisfies readonly Field[]

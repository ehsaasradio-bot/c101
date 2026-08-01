import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * ── Why the z boxes never disappear ─────────────────────────────────────────
 *
 * There is no per-mode field visibility in this codebase: every field declared
 * here is rendered whatever the selects hold. So `az` and `bz` stay on screen in
 * 2D and `compute` simply treats them as zero, which is the honest reading —
 * a plane vector IS a space vector with no third component. Switching back to 3D
 * restores whatever you had typed rather than losing it.
 *
 * ── Defaults chosen to be checkable in your head ────────────────────────────
 *
 *     a = (3, 4, 0)   b = (1, 2, 2)
 *
 * |a| = √(9 + 16 + 0) = 5, the 3-4-5 triangle. |b| = √(1 + 4 + 4) = 3, the
 * 1-2-2 triple. a · b = 3 + 8 + 0 = 11. Three exact integers, so anyone can
 * check the page is doing what it claims before trusting it with real numbers.
 * The cross product a × b = (8, −6, 2) then satisfies Lagrange's identity
 * exactly: |a × b|² + (a · b)² = 104 + 121 = 225 = (5 × 3)².
 *
 * ── Ordering ────────────────────────────────────────────────────────────────
 *
 * `operation` and `dimensions` come first because they decide what the six
 * numbers below mean.
 *
 * `ax` is deliberately the FIRST NUMBER field: the end-to-end suite sets it to
 * 1.1× its default and requires a valid, DIFFERENT result. The default operation
 * is the dot product, which reads it directly — 3.3 gives 11.3 rather than 11 —
 * and a default of 3 is far enough from zero that the multiplication moves it.
 *
 * ── Bounds ──────────────────────────────────────────────────────────────────
 *
 * All six components share −1000 to 1000 with a step of 0.5, matching the
 * Cartesian fields on the distance calculator. Every default lands on that grid:
 * (3 − −1000)/0.5, (0 − −1000)/0.5 and the rest are all integers.
 */
export const fields = [
  {
    kind: 'select',
    id: 'operation',
    label: 'Operation',
    default: 'dot',
    options: [
      { value: 'dot', label: 'Dot product (a · b)' },
      { value: 'cross', label: 'Cross product (a × b)' },
      { value: 'angle', label: 'Angle between a and b' },
      { value: 'magnitude', label: 'Magnitude and unit vector of a' },
      { value: 'projection', label: 'Projection of a onto b' },
      { value: 'add', label: 'Add (a + b)' },
      { value: 'subtract', label: 'Subtract (a − b)' },
    ],
    help: 'Every operation reads both vectors except the magnitude, which describes a on its own but still reports |b| alongside it.',
  },
  {
    kind: 'select',
    id: 'dimensions',
    label: 'Dimensions',
    default: '3d',
    options: [
      { value: '3d', label: '3D (x, y, z)' },
      { value: '2d', label: '2D (x, y)' },
    ],
    help: 'Choosing 2D treats both z components as zero rather than hiding their boxes, so nothing you typed is thrown away. In 2D the cross product is a single signed number, not a vector.',
  },
  {
    kind: 'number',
    id: 'ax',
    label: 'Vector a — x',
    default: 3,
    min: -1000,
    max: 1000,
    step: 0.5,
    help: 'First component of a. With the defaults, a = (3, 4, 0) has a magnitude of exactly 5.',
  },
  {
    kind: 'number',
    id: 'ay',
    label: 'Vector a — y',
    default: 4,
    min: -1000,
    max: 1000,
    step: 0.5,
    help: 'Second component of a. Negative components are perfectly ordinary.',
  },
  {
    kind: 'number',
    id: 'az',
    label: 'Vector a — z',
    default: 0,
    min: -1000,
    max: 1000,
    step: 0.5,
    help: 'Third component of a. Ignored in 2D. The slider is narrow because it is centred on a default of zero; type any value you need.',
  },
  {
    kind: 'number',
    id: 'bx',
    label: 'Vector b — x',
    default: 1,
    min: -1000,
    max: 1000,
    step: 0.5,
    help: 'First component of b. With the defaults, b = (1, 2, 2) has a magnitude of exactly 3.',
  },
  {
    kind: 'number',
    id: 'by',
    label: 'Vector b — y',
    default: 2,
    min: -1000,
    max: 1000,
    step: 0.5,
    help: 'Second component of b.',
  },
  {
    kind: 'number',
    id: 'bz',
    label: 'Vector b — z',
    default: 2,
    min: -1000,
    max: 1000,
    step: 0.5,
    help: 'Third component of b. Ignored in 2D.',
  },
] as const satisfies readonly Field[]

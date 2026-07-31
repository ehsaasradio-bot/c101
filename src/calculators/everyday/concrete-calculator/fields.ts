import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * ── How the four shapes share one set of always-visible inputs ───────────────
 *
 * There is no per-shape field visibility in this codebase: every field declared
 * here is rendered whatever `shape` holds, and no field's LABEL can change with
 * another field's value. `variants` moves bounds, step and unit; it renames
 * nothing and hides nothing.
 *
 * `math/area-calculator` answers this with three deliberately generic
 * dimensions (a, b, h) plus a ROLES table in compute; `math/volume-calculator`
 * answers it with labels that name both readings at once ("Diameter or length").
 * Both work because their shapes overlap heavily — every solid there needs a
 * first span, so one field can honestly be "the first span".
 *
 * A concrete pour does not overlap that way. A slab is rectangular and a column
 * is round, and they share no dimension: nothing a slab measures is a diameter,
 * and nothing a column measures is a width. Folding them into one `dim1` would
 * produce a field that is a length for two shapes and a diameter for the other
 * two — the exact mislabelling both of those files were working around, and with
 * no saving in field count, because the shapes need disjoint inputs anyway.
 *
 * So this takes the area-calculator half of the pattern — one table in compute
 * as the single source of truth for the mapping — but keeps honest names, and
 * puts the shape list in the LABEL rather than only in the help. A single ROLES
 * table in `compute.ts` then drives which dimensions each shape validates, what
 * the steps call them, and what the note says was ignored, so the page cannot
 * claim a number was read as something the formula did not read it as.
 *
 * `length` is deliberately the first number field: the end-to-end suite nudges
 * it to 1.1x its default, and it enters the DEFAULT shape (a slab) linearly, so
 * the headline volume always moves.
 */

/**
 * Exact by the 1959 international agreement: the inch is exactly 25.4 mm, so
 * 1 ft = 0.3048 m and 1 in = 2.54 cm.
 *
 * A variant `factor` is "value in this case divided by the same quantity in the
 * base case", and the base is the first case listed — imperial, because the
 * cubic yard and the 80 lb bag are the units this question usually arrives in.
 * A pour is a fixed physical thing, so every metric case converts: switching the
 * selector restates a 10 ft slab as 3.048 m rather than making it 10 m.
 */
const M_PER_FT = 0.3048
const CM_PER_IN = 2.54

/** Plan dimensions, paced out on the ground: feet in imperial, metres in metric. */
const SPAN_VARIANTS = {
  on: 'units',
  cases: {
    // Base case: factor 1, deliberately omitted.
    imperial: { min: 0.5, max: 400, step: 0.5, unit: 'ft' },
    metric: { min: 0.15, max: 120, step: 0.05, unit: 'm', factor: M_PER_FT },
  },
} as const

/** Small dimensions read off a tape: inches in imperial, centimetres in metric. */
const TAPE_VARIANTS = {
  on: 'units',
  cases: {
    imperial: { min: 1, max: 48, step: 0.5, unit: 'in' },
    metric: { min: 2.5, max: 120, step: 0.5, unit: 'cm', factor: CM_PER_IN },
  },
} as const

/**
 * The diameter reads off the same tape but tolerates a wider column, so it gets
 * its own bounds rather than sharing the thickness pair. Both stay inside the
 * 3 m plausibility guard in compute.ts.
 */
const DIAMETER_VARIANTS = {
  on: 'units',
  cases: {
    imperial: { min: 2, max: 60, step: 0.5, unit: 'in' },
    metric: { min: 5, max: 150, step: 0.5, unit: 'cm', factor: CM_PER_IN },
  },
} as const

export const fields = [
  {
    kind: 'select',
    id: 'shape',
    label: 'What you are pouring',
    default: 'slab',
    options: [
      { value: 'slab', label: 'Slab (patio, shed base, driveway)' },
      { value: 'footing', label: 'Footing (a continuous strip)' },
      { value: 'column', label: 'Round column or pier' },
      { value: 'posthole', label: 'Round post holes' },
    ],
    help: 'Each pour reads only some of the dimensions below. The working under the result names every one it used, and says which it ignored.',
  },
  {
    kind: 'select',
    id: 'units',
    label: 'Units',
    default: 'imperial',
    options: [
      { value: 'imperial', label: 'Imperial (ft, in)' },
      { value: 'metric', label: 'Metric (m, cm)' },
    ],
    help: 'Switching this restates the measurements you already typed rather than reinterpreting them, so the pour stays the same size. Cubic yards, cubic metres and every bag count are shown either way.',
  },
  {
    kind: 'number',
    id: 'length',
    label: 'Length — slab and footing only',
    default: 10,
    // The union across both variants; each case narrows the control to one unit.
    min: 0.15,
    max: 400,
    step: 0.05,
    unit: 'ft',
    variants: SPAN_VARIANTS,
    help: 'Slab: the longer side. Footing: the whole run of the strip, corners included, measured along its centre line. Round pours ignore this.',
  },
  {
    kind: 'number',
    id: 'width',
    label: 'Width — slab and footing only',
    default: 10,
    min: 0.15,
    max: 400,
    step: 0.05,
    unit: 'ft',
    variants: SPAN_VARIANTS,
    help: 'Slab: the shorter side. Footing: how wide the trench is. Round pours ignore this — a circle is as wide as its own diameter.',
  },
  {
    kind: 'number',
    id: 'thickness',
    label: 'Thickness — slab and footing only',
    default: 4,
    min: 1,
    max: 120,
    step: 0.5,
    unit: 'in',
    variants: TAPE_VARIANTS,
    help: 'Slab: 4 in (100 mm) for a patio or shed base, 5 to 6 in (125-150 mm) where a vehicle will stand. Footing: how deep the trench is filled. Round pours ignore this.',
  },
  {
    kind: 'number',
    id: 'diameter',
    label: 'Diameter — column and post hole only',
    default: 10,
    min: 2,
    max: 150,
    step: 0.5,
    unit: 'in',
    variants: DIAMETER_VARIANTS,
    help: 'The distance straight across the tube or the hole, not the radius. Slab and footing ignore this.',
  },
  {
    kind: 'number',
    id: 'height',
    label: 'Height or hole depth — column and post hole only',
    default: 3,
    min: 0.15,
    max: 60,
    step: 0.05,
    unit: 'ft',
    variants: {
      on: 'units',
      cases: {
        imperial: { min: 0.5, max: 60, step: 0.5, unit: 'ft' },
        metric: { min: 0.15, max: 18, step: 0.05, unit: 'm', factor: M_PER_FT },
      },
    },
    help: 'Column: how tall the finished pier stands. Post hole: how deep the hole is, from the bottom up to where the concrete stops. Slab and footing ignore this.',
  },
  {
    kind: 'number',
    id: 'count',
    label: 'How many',
    default: 1,
    min: 1,
    max: 200,
    step: 1,
    unit: 'of these',
    // No variants: a count is the same number in either unit system.
    help: 'How many identical pours of the shape above — one slab, or twelve post holes. Whole numbers only.',
  },
  {
    kind: 'number',
    id: 'waste',
    label: 'Waste allowance',
    default: 10,
    min: 0,
    max: 25,
    step: 1,
    unit: '%',
    help: 'Added on top for spillage, an over-dug hole and a sub-base that is not perfectly level. 10% is the usual allowance; 15% suits dug trenches and post holes, where the ground rarely matches the drawing.',
  },
] as const satisfies readonly Field[]

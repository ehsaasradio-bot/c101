import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * WHY THE DIMENSION FIELDS ARE NAMED GENERICALLY
 *
 * There is no per-shape field visibility here: every field is always rendered,
 * and `variants` can move a number field's bounds, step and unit but never its
 * label. So a field called "Radius" would still be sitting there — mislabelled —
 * while someone measures a cardboard box.
 *
 * The fix taken here is three fields whose labels are honest for every solid at
 * once, because each names BOTH readings of the same physical span:
 *
 *   dim1  "Diameter or length"  a round solid's diameter, or a box's length
 *   dim2  "Width"               the second base edge; round solids have none
 *   dim3  "Height or side"      the vertical height, or a capsule's straight side
 *
 * Diameter rather than radius is deliberate: it is the measurement you can
 * actually take with a tape across the top of a tank, and it makes dim1 mean
 * "how wide is it" for every solid in the list. The `help` text below, and the
 * `steps` and `notes` built in compute.ts, then restate per solid exactly which
 * reading is in use and which field is being ignored.
 *
 * The alternative — a select whose `variants` narrow another select's options —
 * solves a different problem (a form offering a combination compute would
 * reject) and cannot rename anything, so it does not apply. `variants` IS used
 * below for what it is for: one physical dimension expressed in m, cm, ft or in.
 */

/**
 * Metres per unit, exact by international definition since 1959: the inch is
 * exactly 25.4 mm, so the foot is exactly 0.3048 m. A variant `factor` is
 * "value in this variant divided by the same quantity in the base", so these
 * are the reciprocals of the metres-per-unit figures used in compute.ts.
 */
const PER_METRE_CENTIMETRE = 100
const PER_METRE_FOOT = 1 / 0.3048
const PER_METRE_INCH = 1 / 0.0254

/**
 * Bounds are per unit because the same physical span is a different number in
 * each: 100 m is 10 000 cm. The metre case is listed first, so it is the base
 * and the defaults below are read as metres. Every case tops out near 100 m,
 * far beyond any tank, room or shipping container and well inside the 1 km
 * plausibility guard in compute.ts. The top-level min/max is their union.
 */
const lengthVariants = {
  on: 'lengthUnit',
  cases: {
    metre: { min: 0.05, max: 100, step: 0.05, unit: 'm' },
    centimetre: { min: 1, max: 10_000, step: 1, unit: 'cm', factor: PER_METRE_CENTIMETRE },
    foot: { min: 0.05, max: 330, step: 0.1, unit: 'ft', factor: PER_METRE_FOOT },
    inch: { min: 0.5, max: 3960, step: 0.5, unit: 'in', factor: PER_METRE_INCH },
  },
} as const

export const fields = [
  {
    kind: 'select',
    id: 'shape',
    label: 'Solid',
    default: 'cylinder',
    options: [
      { value: 'box', label: 'Box / cuboid' },
      { value: 'cylinder', label: 'Cylinder' },
      { value: 'sphere', label: 'Sphere' },
      { value: 'cone', label: 'Cone' },
      { value: 'capsule', label: 'Capsule (cylinder with domed ends)' },
      { value: 'pyramid', label: 'Pyramid (rectangular base)' },
    ],
    help: 'Each solid uses only some of the three dimensions below. The working spells out which.',
  },
  {
    kind: 'select',
    id: 'lengthUnit',
    label: 'Dimensions are in',
    default: 'metre',
    options: [
      { value: 'metre', label: 'Metres (m)' },
      { value: 'centimetre', label: 'Centimetres (cm)' },
      { value: 'foot', label: 'Feet (ft)' },
      { value: 'inch', label: 'Inches (in)' },
    ],
    help: 'Changing this restates the dimensions you already typed; it does not resize the solid.',
  },
  {
    /*
     * The first number field, and the one the end-to-end suite nudges to 1.1x
     * its default. It feeds every solid in the list — including the default
     * cylinder, where it is the diameter, so the nudge moves the volume by 1.21.
     *
     * Default 1.2 m across by 1.5 m tall is an ordinary domestic rainwater tank
     * of about 1700 litres. It also keeps the slider useful: the track is sized
     * at roughly 4x the default, so the draggable range is about 0 to 5 m.
     */
    kind: 'number',
    id: 'dim1',
    label: 'Diameter or length',
    default: 1.2,
    min: 0.05,
    max: 10_000,
    step: 0.05,
    unit: 'm',
    help: 'Cylinder, sphere, cone and capsule: the diameter across the widest point. Box and pyramid: the length of the base.',
    variants: lengthVariants,
  },
  {
    kind: 'number',
    id: 'dim2',
    label: 'Width',
    default: 0.8,
    min: 0.05,
    max: 10_000,
    step: 0.05,
    unit: 'm',
    help: 'The second edge of a rectangular base — box and pyramid only. A round solid is as wide as its diameter, so this is ignored for one.',
    variants: lengthVariants,
  },
  {
    kind: 'number',
    id: 'dim3',
    label: 'Height or side',
    default: 1.5,
    min: 0.05,
    max: 10_000,
    step: 0.05,
    unit: 'm',
    help: 'Box, cylinder, cone and pyramid: the vertical height. Capsule: the straight side between the two domed ends. A sphere has none, so this is ignored for it.',
    variants: lengthVariants,
  },
] as const satisfies readonly Field[]

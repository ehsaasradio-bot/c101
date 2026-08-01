import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * All six triangle elements keep their own box in every mode. There is no
 * per-mode field visibility here, and adding one would throw away whatever you
 * had already typed each time you switched: `mode` names the three parts that
 * are inputs, and `compute` reads only those three. The rest are ignored, not
 * validated — refusing to answer because of a number nobody asked about would be
 * surprising.
 *
 * THE DEFAULTS ARE ONE TRIANGLE, so all five modes agree on it. Start from
 * a = 5, b = 7, C = 45° and solve it once:
 *
 *   c = sqrt(a² + b² − 2ab·cos C) = sqrt(24.502525316941675) = 4.950002557266175
 *   A = acos((b² + c² − a²) ÷ 2bc) = 45.581677969386639°
 *   B = 180° − C − A               = 89.418322030613353°
 *
 * Seeded here at the precision each field displays: c = 4.95, A = 45.5817,
 * B = 89.4183. Those two angle roundings are equal and opposite, so A + B + C
 * is still exactly 180° and the angle-driven modes stay honest.
 *
 * The angles need FOUR decimals, not two, and that is why they step in
 * 0.0001° rather than 0.01°. Four of the five modes are well conditioned and
 * would not care. SSA is not: this triangle is 0.58° off a right angle at B,
 * and sin B = (b ÷ a)·sin A there amplifies an error in A by a factor of 96.
 * Seeding A = 45.58 makes the SSA mode answer B = 89.2742 while every other
 * mode says 89.4183 — a visible 0.14° contradiction on one page. At 45.5817 the
 * gap falls to 0.002°, in line with the rounding everywhere else. Exact
 * agreement is not on offer at any precision: the solved parts are irrational,
 * so each mode reproduces the triangle only to within the rounding of its seeds.
 *
 * `sideA` is deliberately the first NUMBER field: the end-to-end suite sets it
 * to 1.1× its default and expects a different but still valid answer. The
 * default SAS mode reads it, and 5 → 5.5 moves the headline side c from
 * 4.950003 to 4.980239.
 *
 * Bounds: a slider spans min..max, so both ends must be values compute accepts.
 * Each end is fine on its own here; several are refused only because of what
 * ANOTHER field holds — a side of 1000 against the default b = 7 and c = 4.95
 * breaks the triangle inequality. Those are the cross-field entries in
 * `field-bounds.test.ts`, not bounds to narrow: clamping a slider to what the
 * current partner values happen to allow would make it lie the other way.
 */
export const fields = [
  {
    kind: 'select',
    id: 'mode',
    label: 'What do you know?',
    default: 'sas',
    options: [
      { value: 'sas', label: 'Two sides and the angle between them (a, b, C)' },
      { value: 'sss', label: 'Three sides (a, b, c)' },
      { value: 'asa', label: 'Two angles and the side between them (A, B, c)' },
      { value: 'aas', label: 'Two angles and a side beside one of them (A, B, a)' },
      { value: 'ssa', label: 'Two sides and an angle not between them (a, b, A)' },
    ],
    help: 'Only the three parts named here are read. Whatever is in the other boxes is left alone.',
  },
  {
    kind: 'number',
    id: 'sideA',
    label: 'Side a',
    default: 5,
    min: 0.01,
    max: 1000,
    step: 0.01,
    unit: 'units',
    help: 'The side opposite angle A. Read in SAS, SSS, AAS and SSA.',
  },
  {
    kind: 'number',
    id: 'sideB',
    label: 'Side b',
    default: 7,
    min: 0.01,
    max: 1000,
    step: 0.01,
    unit: 'units',
    help: 'The side opposite angle B. Read in SAS, SSS and SSA.',
  },
  {
    kind: 'number',
    id: 'sideC',
    label: 'Side c',
    default: 4.95,
    min: 0.01,
    max: 1000,
    step: 0.01,
    unit: 'units',
    help: 'The side opposite angle C. Read in SSS and ASA. Use one unit for all three sides.',
  },
  {
    kind: 'number',
    id: 'angleA',
    label: 'Angle A',
    default: 45.5817,
    min: 0.0001,
    max: 179.9999,
    step: 0.0001,
    unit: '°',
    help: 'The angle at vertex A, facing side a. Read in ASA, AAS and SSA.',
  },
  {
    kind: 'number',
    id: 'angleB',
    label: 'Angle B',
    default: 89.4183,
    min: 0.0001,
    max: 179.9999,
    step: 0.0001,
    unit: '°',
    help: 'The angle at vertex B, facing side b. Read in ASA and AAS.',
  },
  {
    kind: 'number',
    id: 'angleC',
    label: 'Angle C',
    default: 45,
    min: 0.0001,
    max: 179.9999,
    step: 0.0001,
    unit: '°',
    help: 'The angle at vertex C, facing side c. Read in SAS, where it sits between sides a and b.',
  },
] as const satisfies readonly Field[]

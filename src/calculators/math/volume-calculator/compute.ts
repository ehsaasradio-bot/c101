import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, StepRule, Values } from '../../../lib/types'
import type { fields } from './fields'

/**
 * Standard solid-geometry formulas. Every dimension is normalised to metres
 * first, so one set of output conversions serves all six solids:
 *
 *   box       V = l·w·h
 *   cylinder  V = πr²h
 *   sphere    V = 4/3·πr³
 *   cone      V = 1/3·πr²h
 *   capsule   V = πr²h + 4/3·πr³   (a cylinder plus two hemispherical caps,
 *                                   which together make exactly one sphere)
 *   pyramid   V = 1/3·l·w·h        (rectangular base, apex over the centre;
 *                                   the same 1/3 that relates a cone to its
 *                                   circumscribing cylinder)
 *
 * The output units are exact definitions rather than rounded factors:
 *   1 litre            = 1/1000 cubic metre         exactly
 *   1 cubic foot       = 0.3048³ m³ = 0.028316846592 m³ exactly (1959 yard)
 *   1 US liquid gallon = 231 in³ = 0.003785411784 m³ exactly
 *   1 imperial gallon  = 4.54609 litres = 0.00454609 m³ exactly (1985 Act)
 */

const METRES_PER_UNIT: Record<string, number> = {
  metre: 1,
  centimetre: 0.01,
  foot: 0.3048,
  inch: 0.0254,
}

const UNIT_ABBREV: Record<string, string> = {
  metre: 'm',
  centimetre: 'cm',
  foot: 'ft',
  inch: 'in',
}

const LITRES_PER_CUBIC_METRE = 1000
const CUBIC_METRES_PER_CUBIC_FOOT = 0.3048 ** 3
const CUBIC_METRES_PER_US_GALLON = 231 * 0.0254 ** 3
const CUBIC_METRES_PER_IMPERIAL_GALLON = 0.00454609

/** Past this, a "solid" is a landscape feature and almost certainly a typo. */
const MAX_DIMENSION_METRES = 1000

type DimId = 'dim1' | 'dim2' | 'dim3'
type Dims = Record<DimId, number>

interface ShapeSpec {
  /** Which fields this solid reads, and what each one means for it. */
  uses: ReadonlyArray<{ id: DimId; role: string }>
  /** True when dim1 is a diameter rather than a straight edge. */
  round: boolean
  /** Used verbatim as the label of the volume step. */
  formula: string
  /** Dimensions already in metres; returns cubic metres. */
  volume: (d: Dims) => number
  /** Says which fields are in play for this solid and which are ignored. */
  note: string
}

const SHAPES = {
  box: {
    uses: [
      { id: 'dim1', role: 'Length l' },
      { id: 'dim2', role: 'Width w' },
      { id: 'dim3', role: 'Height h' },
    ],
    round: false,
    formula: 'Volume l·w·h',
    volume: (d) => d.dim1 * d.dim2 * d.dim3,
    note: 'A box uses all three dimensions as the lengths of its edges, in any order — tip it on its side and it holds exactly as much.',
  },
  cylinder: {
    uses: [
      { id: 'dim1', role: 'Diameter d' },
      { id: 'dim3', role: 'Height h' },
    ],
    round: true,
    formula: 'Volume πr²h',
    volume: (d) => Math.PI * (d.dim1 / 2) ** 2 * d.dim3,
    note: 'A cylinder is fixed by the diameter across its top and its height, so the width field is ignored here.',
  },
  sphere: {
    uses: [{ id: 'dim1', role: 'Diameter d' }],
    round: true,
    formula: 'Volume 4/3·πr³',
    volume: (d) => (4 / 3) * Math.PI * (d.dim1 / 2) ** 3,
    note: 'A sphere is fixed by its diameter alone, so the width and height fields are both ignored here.',
  },
  cone: {
    uses: [
      { id: 'dim1', role: 'Base diameter d' },
      { id: 'dim3', role: 'Height h' },
    ],
    round: true,
    formula: 'Volume 1/3·πr²h',
    volume: (d) => (1 / 3) * Math.PI * (d.dim1 / 2) ** 2 * d.dim3,
    note: 'Measure the height straight up from the centre of the base to the tip, not along the sloping side. The width field is ignored here.',
  },
  capsule: {
    uses: [
      { id: 'dim1', role: 'Diameter d' },
      { id: 'dim3', role: 'Straight side h' },
    ],
    round: true,
    formula: 'Volume πr²h + 4/3·πr³',
    volume: (d) => Math.PI * (d.dim1 / 2) ** 2 * d.dim3 + (4 / 3) * Math.PI * (d.dim1 / 2) ** 3,
    note: 'Enter the straight side only, not the overall length: the two domed ends are half-spheres that together make one whole sphere, added on top. The width field is ignored here.',
  },
  pyramid: {
    uses: [
      { id: 'dim1', role: 'Base length l' },
      { id: 'dim2', role: 'Base width w' },
      { id: 'dim3', role: 'Height h' },
    ],
    round: false,
    formula: 'Volume 1/3·l·w·h',
    volume: (d) => (1 / 3) * d.dim1 * d.dim2 * d.dim3,
    note: 'This is a pyramid on a rectangular base with its apex over the centre. The height runs straight up from the base, not along a sloping edge.',
  },
} as const satisfies Record<string, ShapeSpec>

type ShapeId = keyof typeof SHAPES

const isShape = (s: string): s is ShapeId => Object.prototype.hasOwnProperty.call(SHAPES, s)

export default function compute(v: Values<typeof fields>): CalcResult {
  const shape = v.shape
  const lengthUnit = v.lengthUnit

  if (!isShape(shape)) throw new CalcError('Choose which solid you are measuring.', 'shape')
  if (!(lengthUnit in METRES_PER_UNIT))
    throw new CalcError('Choose the unit your dimensions are measured in.', 'lengthUnit')

  const spec: ShapeSpec = SHAPES[shape]
  const perUnit = METRES_PER_UNIT[lengthUnit]
  const abbrev = UNIT_ABBREV[lengthUnit]

  const typed: Dims = { dim1: v.dim1, dim2: v.dim2, dim3: v.dim3 }
  const metres: Dims = { dim1: 0, dim2: 0, dim3: 0 }

  /*
   * Only the dimensions this solid actually reads are validated. A cylinder
   * genuinely has no width, so rejecting a blank one would refuse a perfectly
   * well-specified tank over a field the answer never touches.
   *
   * Finiteness is checked before magnitude: coerceValues emits NaN for
   * unparseable input, and `value <= 0` is false for NaN, so a magnitude test
   * on its own would let it through and hand back NaN litres.
   */
  for (const { id, role } of spec.uses) {
    const value = typed[id]
    if (!Number.isFinite(value))
      throw new CalcError(`Enter a number for the ${role.toLowerCase()}.`, id)
    if (value <= 0)
      throw new CalcError('Every dimension of a solid must be greater than zero.', id)

    const inMetres = value * perUnit
    if (inMetres > MAX_DIMENSION_METRES)
      throw new CalcError('That dimension is over a kilometre — check the unit.', id)
    metres[id] = inMetres
  }

  const cubicMetres = spec.volume(metres)
  const litres = cubicMetres * LITRES_PER_CUBIC_METRE
  const cubicFeet = cubicMetres / CUBIC_METRES_PER_CUBIC_FOOT
  const usGallons = cubicMetres / CUBIC_METRES_PER_US_GALLON
  const imperialGallons = cubicMetres / CUBIC_METRES_PER_IMPERIAL_GALLON

  const inMetres = (label: string, value: number): Quantity => ({
    label,
    value,
    format: { style: 'decimal', decimals: 4, unit: 'm' },
  })

  const steps: Array<Quantity | StepRule> = []

  if (lengthUnit !== 'metre') {
    steps.push({
      label: `1 ${abbrev} in metres`,
      value: perUnit,
      format: { style: 'decimal', decimals: 6, unit: 'm' },
    })
  }

  for (const { id, role } of spec.uses) steps.push(inMetres(role, metres[id]))
  if (spec.round) steps.push(inMetres('Radius r = d ÷ 2', metres.dim1 / 2))

  steps.push({ rule: true })
  steps.push({
    label: spec.formula,
    value: cubicMetres,
    format: { style: 'decimal', decimals: 5, unit: 'm³' },
  })
  steps.push({
    label: 'Litres = m³ × 1000',
    value: litres,
    format: { style: 'decimal', decimals: 1, unit: 'L' },
  })

  return {
    primary: {
      label: 'Volume in litres',
      value: litres,
      format: { style: 'decimal', decimals: 1, unit: 'L' },
    },
    stats: [
      {
        label: 'Cubic metres',
        value: cubicMetres,
        format: { style: 'decimal', decimals: 4, unit: 'm³' },
      },
      {
        label: 'Cubic feet',
        value: cubicFeet,
        format: { style: 'decimal', decimals: 3, unit: 'ft³' },
      },
      {
        label: 'US gallons',
        value: usGallons,
        format: { style: 'decimal', decimals: 2, unit: 'US gal' },
      },
      {
        label: 'Imperial gallons',
        value: imperialGallons,
        format: { style: 'decimal', decimals: 2, unit: 'imp gal' },
      },
    ],
    steps,
    notes: [
      spec.note,
      'Dimensions are converted to metres before anything else, so 1.2 m, 120 cm and 3.94 ft all give the same answer.',
      'A litre is exactly one thousandth of a cubic metre. The US liquid gallon is exactly 231 cubic inches while the imperial gallon is exactly 4.54609 litres, which is why the two gallon figures differ by about a fifth.',
      'Fresh water weighs almost exactly one kilogram per litre, so the litre figure doubles as the weight in kilograms of this solid filled with water.',
    ],
  }
}

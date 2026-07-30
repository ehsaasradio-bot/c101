import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, Values } from '../../../lib/types'
import type { fields } from './fields'

/*
 * Area of a chosen plane shape, reported in the unit you measured in and in six
 * others. The formulas are the standard Euclidean ones:
 *
 *   rectangle      A = a·b
 *   triangle       A = ½·a·b            (base × perpendicular height)
 *   circle         A = π·a²
 *   trapezoid      A = ½·(a + b)·h      (mean of the parallel sides × height)
 *   parallelogram  A = a·b              (base × perpendicular height)
 *   ellipse        A = π·a·b            (product of the two semi-axes)
 *
 * The unit conversions are exact by definition rather than approximate. Since
 * the 1959 international agreement the inch is exactly 25.4 mm, which fixes
 * 1 ft = 0.3048 m and 1 yd = 0.9144 m. The acre is defined as 4840 square yards,
 * so 1 acre = 4840 × 0.9144² = 4046.8564224 m² = 43,560 ft² exactly, and a
 * hectare is 10,000 m² by definition.
 */

const SHAPES = [
  'rectangle',
  'triangle',
  'circle',
  'trapezoid',
  'parallelogram',
  'ellipse',
] as const
type Shape = (typeof SHAPES)[number]
const isShape = (s: string): s is Shape => (SHAPES as readonly string[]).includes(s)

const DIM_IDS = ['a', 'b', 'h'] as const
type DimId = (typeof DIM_IDS)[number]

const M_PER_FT = 0.3048
const M_PER_YD = 0.9144
const M_PER_IN = 0.0254

/** Metres in one of each selectable length unit. Exact. */
const METRES_PER: Record<string, number> = {
  foot: M_PER_FT,
  metre: 1,
  yard: M_PER_YD,
  inch: M_PER_IN,
  centimetre: 0.01,
}

/** The length symbol, and the same symbol squared, per selectable unit. */
const LENGTH_SYMBOL: Record<string, string> = {
  foot: 'ft',
  metre: 'm',
  yard: 'yd',
  inch: 'in',
  centimetre: 'cm',
}
const AREA_SYMBOL: Record<string, string> = {
  foot: 'ft²',
  metre: 'm²',
  yard: 'yd²',
  inch: 'in²',
  centimetre: 'cm²',
}

// Square metres in one unit of each reported area unit. The first three are
// written as the square of the exact length definition so a typo cannot creep
// into a long literal.
const SQM_PER_SQFT = M_PER_FT * M_PER_FT // 0.09290304
const SQM_PER_SQYD = M_PER_YD * M_PER_YD // 0.83612736
const SQM_PER_SQIN = M_PER_IN * M_PER_IN // 0.00064516
/*
 * 1 acre = 4840 square yards = 4840 × 0.9144² m². Written as the literal
 * because evaluating `4840 * SQM_PER_SQYD` in binary floating point lands on
 * 4046.8564223999997, which would then be printed as the conversion factor in
 * the working. `compute.test.ts` pins the literal against the definition.
 */
const SQM_PER_ACRE = 4046.8564224
const SQM_PER_HECTARE = 10_000

const SHAPE_LABEL: Record<Shape, string> = {
  rectangle: 'Rectangle',
  triangle: 'Triangle',
  circle: 'Circle',
  trapezoid: 'Trapezoid',
  parallelogram: 'Parallelogram',
  ellipse: 'Ellipse',
}

/**
 * What each generic dimension MEANS for each shape, and — by omission — which
 * dimensions a shape does not use at all.
 *
 * The fields are called a, b and h because every field is always rendered and no
 * label can change with the selected shape (see the note in `fields.ts`). This
 * table is therefore the single source of truth for the mapping: it drives the
 * validation messages, the step labels and the note under the result, so what
 * the page says a number was read as cannot drift from what the formula did.
 */
const ROLES: Record<Shape, Readonly<Partial<Record<DimId, string>>>> = {
  rectangle: { a: 'length', b: 'width' },
  triangle: { a: 'base', b: 'perpendicular height' },
  circle: { a: 'radius' },
  trapezoid: {
    a: 'first parallel side',
    b: 'second parallel side',
    h: 'height between the parallel sides',
  },
  parallelogram: { a: 'base', b: 'perpendicular height' },
  ellipse: { a: 'first semi-axis', b: 'second semi-axis' },
}

const FORMULA: Record<Shape, string> = {
  rectangle: 'Area = a × b',
  triangle: 'Area = ½ × a × b',
  circle: 'Area = π × a²',
  trapezoid: 'Area = ½ × (a + b) × h',
  parallelogram: 'Area = a × b',
  ellipse: 'Area = π × a × b',
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Enough decimals to keep a small answer meaningful without printing eight of
 * them next to a number in the thousands. An acre reading of a bedroom is a few
 * thousandths; a square-inch reading of a field is six figures.
 */
function decimalsFor(value: number): number {
  const x = Math.abs(value)
  if (x === 0) return 2
  if (x < 0.001) return 8
  if (x < 1) return 6
  if (x < 100) return 4
  return 2
}

const area = (label: string, value: number, unit: string): Quantity => ({
  label,
  value,
  format: { style: 'decimal', decimals: decimalsFor(value), unit },
})

const lengthQty = (label: string, value: number, unit: string): Quantity => ({
  label,
  value,
  format: { style: 'decimal', decimals: 4, unit },
})

export default function compute(v: Values<typeof fields>): CalcResult {
  const { shape, lengthUnit } = v

  if (!isShape(shape)) throw new CalcError('Choose one of the listed shapes.', 'shape')

  const metresPerUnit = METRES_PER[lengthUnit]
  if (metresPerUnit === undefined)
    throw new CalcError('Choose the unit your measurements are in.', 'lengthUnit')

  const symbol = AREA_SYMBOL[lengthUnit]!
  const lengthSymbol = LENGTH_SYMBOL[lengthUnit]!
  const sqmPerUnit = metresPerUnit * metresPerUnit

  const roles = ROLES[shape]
  const dims: Record<DimId, number> = { a: v.a, b: v.b, h: v.h }
  const usedIds = DIM_IDS.filter((id) => roles[id] !== undefined)
  const ignoredIds = DIM_IDS.filter((id) => roles[id] === undefined)

  /*
   * Validate only the dimensions this shape actually consumes: a circle has no
   * opinion about `b`, and demanding one would reject a form state the page
   * itself offers. Finiteness is checked FIRST — `coerceValues` turns
   * unparseable input into NaN, and `NaN <= 0` is false, so a magnitude test on
   * its own would let NaN straight through into the answer.
   */
  for (const id of DIM_IDS) {
    const role = roles[id]
    if (role === undefined) continue
    const value = dims[id]
    if (!Number.isFinite(value))
      throw new CalcError(`Enter a number for the ${role} (${id}).`, id)
    if (value <= 0)
      throw new CalcError(`The ${role} (${id}) must be greater than zero.`, id)
  }

  const { a, b, h } = dims

  // Area in the unit that was typed in, squared.
  const areaInUnit =
    shape === 'rectangle'
      ? a * b
      : shape === 'triangle'
        ? (a * b) / 2
        : shape === 'circle'
          ? Math.PI * a * a
          : shape === 'trapezoid'
            ? ((a + b) / 2) * h
            : shape === 'parallelogram'
              ? a * b
              : Math.PI * a * b // ellipse

  if (!Number.isFinite(areaInUnit)) {
    // Point at the biggest dimension, which is the one worth shrinking.
    const worst = usedIds.reduce((best, id) => (dims[id] > dims[best] ? id : best), usedIds[0]!)
    throw new CalcError('Those dimensions are too large to multiply without overflowing.', worst)
  }

  // One conversion into SI, then every reported unit derives from it, so the
  // figures cannot disagree with each other.
  const squareMetres = areaInUnit * sqmPerUnit

  const squareFeet = squareMetres / SQM_PER_SQFT
  const squareYards = squareMetres / SQM_PER_SQYD
  const squareInches = squareMetres / SQM_PER_SQIN
  const acres = squareMetres / SQM_PER_ACRE
  const hectares = squareMetres / SQM_PER_HECTARE

  const dimensionSteps = usedIds.map((id) =>
    lengthQty(`${cap(roles[id]!)} (${id})`, dims[id], lengthSymbol),
  )

  const mapping = usedIds.map((id) => `${id} is the ${roles[id]}`).join(', ')
  const ignoredNote =
    ignoredIds.length === 0
      ? ''
      : ignoredIds.length === 1
        ? ` Input ${ignoredIds[0]} is ignored for this shape.`
        : ` Inputs ${ignoredIds.join(' and ')} are ignored for this shape.`

  return {
    primary: {
      label: 'Area',
      value: areaInUnit,
      format: { style: 'decimal', decimals: decimalsFor(areaInUnit), unit: symbol },
    },
    stats: [
      area('Square metres', squareMetres, 'm²'),
      area('Square feet', squareFeet, 'ft²'),
      area('Square yards', squareYards, 'yd²'),
      area('Square inches', squareInches, 'in²'),
      area('Acres', acres, 'acres'),
      area('Hectares', hectares, 'ha'),
    ],
    steps: [
      { label: 'Shape', value: SHAPE_LABEL[shape], format: { style: 'raw' } },
      ...dimensionSteps,
      { rule: true },
      area(FORMULA[shape], areaInUnit, symbol),
      { rule: true },
      area(`Square metres = ${symbol} × ${sqmPerUnit}`, squareMetres, 'm²'),
      area(`Square feet = m² ÷ ${SQM_PER_SQFT}`, squareFeet, 'ft²'),
      area(`Acres = m² ÷ ${SQM_PER_ACRE}`, acres, 'acres'),
    ],
    notes: [
      `For a ${SHAPE_LABEL[shape].toLowerCase()}, ${mapping}.${ignoredNote}`,
      'Heights must be perpendicular. The height of a triangle or a parallelogram is the straight-line distance from the base to the opposite vertex or side, not the length of a slanted edge.',
      '1 acre = 43,560 ft² = 4,046.8564224 m², and 1 hectare = 10,000 m² ≈ 2.4711 acres. Both follow from the international definition of the yard as exactly 0.9144 m.',
      'For an irregular room, split it into rectangles, work each one out separately and add the results together.',
    ],
  }
}

import { CalcError } from '../../../lib/types'
import type { CalcResult, Part, Quantity, Series, StepRule, Values } from '../../../lib/types'
import type { fields } from './fields'

/*
 * How much concrete a pour needs, and how many pre-mix bags that is.
 *
 * The geometry is ordinary solid geometry — a slab and a footing are both
 * rectangular prisms, a column and a post hole are both cylinders:
 *
 *   slab, footing      V = length x width x thickness
 *   column, post hole  V = pi x (diameter / 2)^2 x height
 *
 * multiplied by how many identical elements are being poured, then increased by
 * the waste allowance. Slab and footing share a formula, and so do column and
 * post hole; they are kept as four separate choices because the guidance under
 * the result differs completely — a footing is dug rather than formed, and a
 * post hole has a post standing in it.
 *
 * Every dimension is normalised to metres first, so one set of output
 * conversions serves all four shapes. The length conversions are exact by the
 * 1959 international agreement, which fixes the inch at exactly 25.4 mm:
 *
 *   1 ft   = 0.3048 m                      exactly
 *   1 yd   = 0.9144 m                      exactly
 *   1 ft^3 = 0.3048^3 = 0.028316846592 m^3 exactly
 *   1 yd^3 = 0.9144^3 = 0.764554857984 m^3 exactly  ( = 27 ft^3 )
 */

const M_PER_FT = 0.3048
const M_PER_IN = 0.0254
const M3_PER_FT3 = M_PER_FT ** 3
const M3_PER_YD3 = 0.9144 ** 3

/*
 * ── BAG YIELDS: WHERE EACH NUMBER COMES FROM ────────────────────────────────
 *
 * These are the manufacturers' own published figures, taken from the product
 * data sheets rather than from any secondary summary table. Secondary tables
 * disagree with each other badly here — a search for the yield of a 25 kg bag
 * turns up 0.0111, 0.0117, 0.012 and 0.0125 cubic metres on four different
 * sites, all stated flatly and none citing anything.
 *
 * IMPERIAL — QUIKRETE Concrete Mix, product No. 1101, data sheet revised
 * October 2022, section "YIELD" (quikrete.com/pdfs/data_sheet-concrete mix
 * 1101.pdf). It lists, verbatim:
 *
 *     A 40 lb (18.1 kg) bag yields approximately 0.30 ft3 (8.5 L)
 *     A 50 lb (22.6 kg) bag yields approximately 0.375 ft3 (10.6 L)
 *     A 60 lb (27.2 kg) bag yields approximately 0.45 ft3 (12.7 L)
 *     An 80 lb (36.2 kg) bag yields approximately 0.60 ft3 (17 L)
 *     A 90 lb (40.8 kg) bag yields approximately 0.675 ft3 (19.1 L)
 *
 * The five are exactly linear in mass at 0.0075 ft3 per pound, which is a
 * useful check that the table has been read rather than remembered.
 *
 * METRIC — Tarmac Blue Circle Multi-Purpose Concrete, product data sheet dated
 * December 2023, section "PACKAGING AND COVERAGE": "One 20kg bag will typically
 * produce around 0.01 m3 of fresh concrete (0.33m x 0.33m x 0.1m)."
 *
 * The two manufacturers corroborate each other: QUIKRETE's 80 lb (36.2 kg) bag
 * at 17 L is 0.470 L per kg, Blue Circle's 20 kg bag at 10 L is 0.500 L per kg
 * — about 6% apart, which is the difference between two mixes and two roundings
 * rather than a disagreement about the arithmetic.
 *
 * The 25 kg figure is the ONLY derived one: Blue Circle publishes 20 kg bags
 * only, so 0.0125 m3 is their own 0.01 m3 scaled by mass (25/20). It is flagged
 * as derived in the notes under the result rather than passed off as published,
 * because 25 kg is the size the secondary tables disagree most about.
 */
interface BagSpec {
  label: string
  /** Published yield, in `unit`. Kept in the unit it was published in. */
  yield: number
  unit: 'ft³' | 'm³'
  system: 'imperial' | 'metric'
}

const BAGS = [
  { label: '40 lb bags', yield: 0.3, unit: 'ft³', system: 'imperial' },
  { label: '60 lb bags', yield: 0.45, unit: 'ft³', system: 'imperial' },
  { label: '80 lb bags', yield: 0.6, unit: 'ft³', system: 'imperial' },
  { label: '20 kg bags', yield: 0.01, unit: 'm³', system: 'metric' },
  { label: '25 kg bags', yield: 0.0125, unit: 'm³', system: 'metric' },
] as const satisfies readonly BagSpec[]

/** The size the steps work through, so one bag count is shown being rounded. */
const HEADLINE_BAG = { imperial: '80 lb bags', metric: '20 kg bags' } as const

const DIM_IDS = ['length', 'width', 'thickness', 'diameter', 'height'] as const
type DimId = (typeof DIM_IDS)[number]

/**
 * Which dimensions are measured as a span paced out on the ground (feet or
 * metres) and which are read across a tape (inches or centimetres). This has to
 * agree with the `variants` in `fields.ts`, which is why both sides name the
 * same two groups.
 */
const TAPE_DIMS = new Set<DimId>(['thickness', 'diameter'])

/**
 * Past these, the number is a typo or the wrong unit rather than a pour. Each
 * is comfortably above the largest value the corresponding slider offers — a
 * 400 ft run is 121.9 m, a 48 in slab is 1.22 m, a 60 ft column is 18.3 m — so
 * every bound the form can reach is a bound compute accepts.
 */
const MAX_METRES: Record<DimId, number> = {
  length: 200,
  width: 200,
  thickness: 3,
  diameter: 3,
  height: 30,
}

/**
 * What each dimension MEANS for each shape, and — by omission — which
 * dimensions a shape does not read at all.
 *
 * This table is the single source of truth for the mapping. It decides which
 * fields are validated, what the steps call each number, and what the note says
 * was ignored, so the page cannot claim a number was read as something the
 * formula never touched. A slab genuinely has no diameter, and rejecting a blank
 * one would refuse a perfectly well-specified pour over a field the answer does
 * not use.
 */
const ROLES: Record<string, Readonly<Partial<Record<DimId, string>>>> = {
  slab: { length: 'Length', width: 'Width', thickness: 'Thickness' },
  footing: { length: 'Run of footing', width: 'Trench width', thickness: 'Depth of fill' },
  column: { diameter: 'Diameter', height: 'Height' },
  posthole: { diameter: 'Hole diameter', height: 'Hole depth' },
}

const SHAPE_LABEL: Record<string, string> = {
  slab: 'Slab',
  footing: 'Footing',
  column: 'Round column',
  posthole: 'Round post hole',
}

/** Singular name of one element, for the "x how many" step. */
const ELEMENT_LABEL: Record<string, string> = {
  slab: 'slab',
  footing: 'footing run',
  column: 'column',
  posthole: 'post hole',
}

const FORMULA: Record<string, string> = {
  slab: 'Volume of one slab = length × width × thickness',
  footing: 'Volume of one run = run × trench width × depth',
  column: 'Volume of one column = π × r² × height',
  posthole: 'Volume of one hole = π × r² × depth',
}

/** True when the shape is a cylinder rather than a rectangular prism. */
const IS_ROUND: Record<string, boolean> = {
  slab: false,
  footing: false,
  column: true,
  posthole: true,
}

const SHAPE_NOTE: Record<string, string> = {
  slab: 'A slab is measured to the inside face of the forms. Thicken the edges of a driveway or a shed base if the ground is soft — an extra 2 in around the perimeter is common, and it is not included here.',
  footing:
    'A footing is dug, not formed, so the trench is almost always wider and deeper in places than the drawing says. That is why 15% is the usual allowance on a footing rather than 10%, and why the run is measured along the centre line of the trench rather than around its outside face.',
  column:
    'This is the full cylinder, so it suits a cardboard forming tube filled to the top. A pier sitting on a wider spread footing is two pours: work the footing out separately and add the two figures together.',
  posthole:
    'This is the volume of the empty hole. The post itself stands in that hole and displaces concrete — a 4x4 post in a 10 in hole takes up roughly a seventh of it — so the figure here is generous by about that much, which is usually the right way to be wrong.',
}

/**
 * The x axis of the chart: bags needed at a waste allowance of 0% through 25%.
 * Fixed rather than derived from the `waste` field, so the number of points
 * never varies with input and the chart is drawable at the defaults — which is
 * the only time the server renders its container.
 */
const WASTE_AXIS = [0, 5, 10, 15, 20, 25] as const

const isShape = (s: string): boolean => Object.prototype.hasOwnProperty.call(ROLES, s)

export default function compute(v: Values<typeof fields>): CalcResult {
  const { shape, units } = v

  if (!isShape(shape)) throw new CalcError('Choose what you are pouring.', 'shape')
  if (units !== 'imperial' && units !== 'metric')
    throw new CalcError('Choose which units your measurements are in.', 'units')

  const imperial = units === 'imperial'
  const spanUnit = imperial ? 'ft' : 'm'
  const tapeUnit = imperial ? 'in' : 'cm'
  const spanToMetres = imperial ? M_PER_FT : 1
  const tapeToMetres = imperial ? M_PER_IN : 0.01

  const roles = ROLES[shape]!
  const typed: Record<DimId, number> = {
    length: v.length,
    width: v.width,
    thickness: v.thickness,
    diameter: v.diameter,
    height: v.height,
  }
  const usedIds = DIM_IDS.filter((id) => roles[id] !== undefined)
  const ignoredIds = DIM_IDS.filter((id) => roles[id] === undefined)
  const metres: Partial<Record<DimId, number>> = {}

  /*
   * Only the dimensions this shape actually consumes are validated.
   *
   * Finiteness is checked FIRST, every time: `coerceValues` hands compute a raw
   * NaN for anything it could not parse, and NaN fails every ordinary
   * comparison — `NaN <= 0` is false — so a magnitude test on its own would let
   * it fall straight through into the arithmetic and surface as NaN bags.
   */
  for (const id of usedIds) {
    const role = roles[id]!
    const value = typed[id]
    if (!Number.isFinite(value))
      throw new CalcError(`Enter a number for the ${role.toLowerCase()}.`, id)
    // Zero is not a thin pour, it is the absence of one. A slab of no thickness
    // needs no concrete, and a form offering it would be offering nothing.
    if (value <= 0)
      throw new CalcError(`The ${role.toLowerCase()} must be greater than zero.`, id)

    const inMetres = value * (TAPE_DIMS.has(id) ? tapeToMetres : spanToMetres)
    if (inMetres > MAX_METRES[id])
      throw new CalcError(
        `That ${role.toLowerCase()} is far larger than any pour — check the unit selector.`,
        id,
      )
    metres[id] = inMetres
  }

  const count = v.count
  if (!Number.isFinite(count)) throw new CalcError('Enter how many of these you are pouring.', 'count')
  if (count < 1) throw new CalcError('Pour at least one of these.', 'count')
  if (!Number.isInteger(count))
    throw new CalcError('You cannot pour part of a slab or a hole — use a whole number.', 'count')

  const waste = v.waste
  if (!Number.isFinite(waste)) throw new CalcError('Enter a waste allowance.', 'waste')
  if (waste < 0) throw new CalcError('The waste allowance cannot be negative.', 'waste')
  if (waste > 100)
    throw new CalcError('A waste allowance over 100% would more than double the pour.', 'waste')

  const round = IS_ROUND[shape]!
  const radiusMetres = round ? metres.diameter! / 2 : 0
  const oneElementM3 = round
    ? Math.PI * radiusMetres ** 2 * metres.height!
    : metres.length! * metres.width! * metres.thickness!

  const netM3 = oneElementM3 * count
  const totalM3 = netM3 * (1 + waste / 100)

  const totalFt3 = totalM3 / M3_PER_FT3
  const totalYd3 = totalM3 / M3_PER_YD3
  const netFt3 = netM3 / M3_PER_FT3
  const netYd3 = netM3 / M3_PER_YD3

  /** The pour expressed in whichever unit a given bag's yield was published in. */
  const totalIn = (unit: 'ft³' | 'm³'): number => (unit === 'ft³' ? totalFt3 : totalM3)

  /*
   * The line that matters. Concrete comes in whole bags: 61.1 bags is 62 bags,
   * and the 0.9 of a bag you did not need is still in the car. Rounding to the
   * nearest bag instead would leave the pour short — and a slab finished the
   * next day with a fresh mix has a cold joint through it, which is a crack
   * waiting to happen rather than an inconvenience.
   */
  /**
   * Ceiling, with a whole-bag quotient snapped back before rounding.
   *
   * A pour that lands on an exact number of bags mathematically can land a few
   * ulps above it in binary: 145.2 m³ of concrete divided by a 0.01 m³ bag is
   * 14520.000000000002, and a bare `Math.ceil` sells a 14521st bag to cover two
   * femtolitres. The tolerance is scaled by the magnitude because the error
   * grows with the quotient, and it is many orders of magnitude below any
   * measurement a tape can produce, so nothing real is ever rounded down.
   */
  const ceilBags = (exact: number): number => {
    const nearest = Math.round(exact)
    const slack = 1e-9 * Math.max(1, Math.abs(exact))
    return Math.abs(exact - nearest) < slack ? nearest : Math.ceil(exact)
  }

  const exactBagsFor = (bag: BagSpec): number => totalIn(bag.unit) / bag.yield
  const bagsFor = (bag: BagSpec): number => ceilBags(exactBagsFor(bag))

  const headline = BAGS.find((b) => b.label === HEADLINE_BAG[units])!
  const headlineExact = exactBagsFor(headline)
  const headlineBags = bagsFor(headline)
  const headlinePurchased = headlineBags * headline.yield
  const headlineUnit = headline.unit
  // Clamped so the purchased figure and the pour cannot print as a negative gap
  // when the division lands exactly on a whole bag.
  const headlineLeftOver = Math.max(0, headlinePurchased - totalIn(headlineUnit))

  const volumeQty = (label: string, value: number, unit: string, decimals = 3): Quantity => ({
    label,
    value,
    format: { style: 'decimal', decimals, unit },
  })

  const bagStats: Quantity[] = BAGS.map((bag) => ({
    label: bag.label,
    value: bagsFor(bag),
    format: { style: 'decimal', decimals: 0, unit: 'bags' },
  }))

  const steps: Array<Quantity | StepRule> = [
    { label: 'Pouring', value: SHAPE_LABEL[shape]!, format: { style: 'raw' } },
  ]

  for (const id of usedIds) {
    const unit = TAPE_DIMS.has(id) ? tapeUnit : spanUnit
    steps.push(volumeQty(`${roles[id]} (as typed)`, typed[id], unit, 2))
  }
  for (const id of usedIds) {
    steps.push(volumeQty(`${roles[id]} in metres`, metres[id]!, 'm', 4))
  }
  if (round) steps.push(volumeQty('Radius r = diameter ÷ 2', radiusMetres, 'm', 4))

  steps.push({ rule: true })
  steps.push(volumeQty(FORMULA[shape]!, oneElementM3, 'm³', 5))
  steps.push({
    label: `How many (${ELEMENT_LABEL[shape]}s)`,
    value: count,
    format: { style: 'decimal', decimals: 0 },
  })
  steps.push(volumeQty('Concrete in the pour = one × how many', netM3, 'm³', 5))

  steps.push({ rule: true })
  steps.push({ label: 'Waste allowance', value: waste, format: { style: 'decimal', decimals: 0, unit: '%' } })
  steps.push(volumeQty(`Total = pour × (1 + ${waste}%)`, totalM3, 'm³', 5))

  steps.push({ rule: true })
  steps.push(volumeQty('Cubic yards = m³ ÷ 0.764554857984', totalYd3, 'yd³', 3))
  steps.push(volumeQty('Cubic feet = m³ ÷ 0.028316846592', totalFt3, 'ft³', 2))

  steps.push({ rule: true })
  steps.push(
    volumeQty(`One ${headline.label.replace(' bags', '')} bag yields`, headline.yield, headlineUnit, 4),
  )
  // The two lines the whole page exists for, next to each other on purpose.
  steps.push({
    label: `Bags needed exactly = ${totalIn(headlineUnit).toFixed(3)} ${headlineUnit} ÷ ${headline.yield} ${headlineUnit}`,
    value: headlineExact,
    format: { style: 'decimal', decimals: 3, unit: 'bags' },
  })
  steps.push({
    label: 'Bags to buy = rounded UP to a whole bag',
    value: headlineBags,
    format: { style: 'decimal', decimals: 0, unit: 'bags' },
  })
  steps.push(
    volumeQty(
      `Concrete purchased = ${headlineBags} × ${headline.yield} ${headlineUnit}`,
      headlinePurchased,
      headlineUnit,
      3,
    ),
  )
  steps.push(volumeQty('Left over in the last bag', headlineLeftOver, headlineUnit, 3))

  /*
   * Parts are stated in the same unit as the headline, so the slices add up to
   * the number the donut prints in its middle. The second part is the remainder
   * of the first from the whole, so the sum is exact by construction; the clamp
   * is for a waste allowance of exactly zero, where floating point can put the
   * difference a hair below.
   */
  const partUnit = imperial ? 'yd³' : 'm³'
  const partWhole = imperial ? totalYd3 : totalM3
  const partNet = imperial ? netYd3 : netM3
  const parts: Part[] = [
    {
      label: 'Concrete in the pour',
      value: partNet,
      format: { style: 'decimal', decimals: 3, unit: partUnit },
    },
    {
      label: 'Waste allowance',
      value: Math.max(0, partWhole - partNet),
      format: { style: 'decimal', decimals: 3, unit: partUnit },
    },
  ]

  /*
   * Bags against the waste allowance, both curves built from the same
   * expressions as the headline, so at x = the selected allowance the "to buy"
   * point IS `headlineBags`. The staircase is the point: the exact line climbs
   * smoothly while the line you pay for jumps a whole bag at a time.
   */
  const inBagUnit = (m3: number): number => (headlineUnit === 'ft³' ? m3 / M3_PER_FT3 : m3)
  const exactPoints = WASTE_AXIS.map(
    (w) => [w, inBagUnit(netM3 * (1 + w / 100)) / headline.yield] as const,
  )
  const buyPoints = exactPoints.map((p) => [p[0], ceilBags(p[1])] as const)

  const series: Series[] = [
    {
      label: `${headline.label} needed exactly`,
      points: exactPoints,
      format: { style: 'decimal', decimals: 2, unit: 'bags' },
    },
    {
      label: `${headline.label} to buy`,
      points: buyPoints,
      format: { style: 'decimal', decimals: 0, unit: 'bags' },
    },
  ]

  /** "a, b and c" — plain English, so the note under the result reads as prose. */
  const list = (items: readonly string[]): string =>
    items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`

  const mapping = list(usedIds.map((id) => roles[id]!.toLowerCase()))
  const ignoredNote =
    ignoredIds.length === 0
      ? ''
      : ` The ${list(ignoredIds)} ${ignoredIds.length === 1 ? 'field is' : 'fields are'} ignored for this pour.`

  return {
    primary: imperial
      ? { label: 'Concrete needed', value: totalYd3, format: { style: 'decimal', decimals: 2, unit: 'yd³' } }
      : { label: 'Concrete needed', value: totalM3, format: { style: 'decimal', decimals: 2, unit: 'm³' } },
    stats: [
      volumeQty('Cubic yards', totalYd3, 'yd³', 2),
      volumeQty('Cubic metres', totalM3, 'm³', 3),
      volumeQty('Cubic feet', totalFt3, 'ft³', 1),
      ...bagStats,
    ],
    steps,
    parts,
    series,
    notes: [
      `A ${SHAPE_LABEL[shape]!.toLowerCase()} is worked out from its ${mapping}.${ignoredNote}`,
      SHAPE_NOTE[shape]!,
      'Bags are rounded UP, never averaged: a pour needing 61.1 bags takes 62. Running short mid-pour is far worse than a spare bag — concrete placed against concrete that has already stiffened leaves a cold joint, which is a plane of weakness right through the finished work.',
      'Bag yields are the manufacturers’ published figures: QUIKRETE Concrete Mix No. 1101 gives 0.30, 0.45 and 0.60 cubic feet for its 40, 60 and 80 lb bags, and Tarmac Blue Circle Multi-Purpose Concrete gives 0.01 cubic metres for a 20 kg bag. The 25 kg figure is that same 0.01 scaled by mass, because Blue Circle publishes the 20 kg size only. Check the bag you are actually buying — mixes differ by a few per cent.',
      'Past about one cubic yard (0.75 m³) mixing by the bag stops being sensible: that is roughly sixty 80 lb bags, half a tonne of lifting, and a mix that has to stay wet and continuous. A ready-mix truck is usually both cheaper and stronger at that point.',
      'This is the concrete only. Reinforcing mesh, rebar, a compacted sub-base and the expansion joints a slab needs are separate materials, and none of them are in this figure.',
    ],
  }
}

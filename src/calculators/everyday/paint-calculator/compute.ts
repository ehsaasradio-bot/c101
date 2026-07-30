import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

/**
 * 1 ft² = 0.09290304 m², exact — 1 inch is 2.54 cm by international definition,
 * so a square foot is 144 x 6.4516 cm².
 */
const M2_PER_FT2 = 0.09290304

/*
 * The deduction rule of thumb published by the major paint brands (Sherwin-
 * Williams, Benjamin Moore, Dulux all quote the same pair): take 20 square feet
 * of wall off for every door and 15 for every window.
 *
 * They are stated in square feet because that is where the published figures
 * come from, and converted exactly for the metric path — so switching the unit
 * selector never changes the physical hole in the wall, only how it is written.
 */
const DOOR_AREA_FT2 = 20
const WINDOW_AREA_FT2 = 15

/**
 * The x axis of the chart: paint needed at one coat through five. Fixed, not
 * derived from the `coats` field, so the number of points never varies with
 * input and the chart is drawable at the defaults — which is the only time the
 * server renders its container.
 */
const COAT_AXIS = [1, 2, 3, 4, 5] as const

export default function compute(v: Values<typeof fields>): CalcResult {
  const { roomLength, roomWidth, wallHeight, doors, windows, coats, coverage, canSize, pricePerCan } =
    v
  // Selects arrive as strings; the derived Values type makes that explicit.
  const imperial = v.units === 'imperial'

  // Finiteness first, every time: `coerceValues` hands compute a raw NaN for
  // anything it could not parse, and NaN fails every ordinary comparison, so a
  // bare `x <= 0` check would let it fall through into the arithmetic and
  // surface as a NaN result instead of a CalcError the form can highlight.
  if (!Number.isFinite(roomLength) || !(roomLength > 0))
    throw new CalcError('Enter a room length greater than 0.', 'roomLength')
  if (!Number.isFinite(roomWidth) || !(roomWidth > 0))
    throw new CalcError('Enter a room width greater than 0.', 'roomWidth')
  if (!Number.isFinite(wallHeight) || !(wallHeight > 0))
    throw new CalcError('Enter a wall height greater than 0.', 'wallHeight')
  if (!Number.isFinite(doors) || doors < 0)
    throw new CalcError('The number of doors cannot be negative.', 'doors')
  if (!Number.isFinite(windows) || windows < 0)
    throw new CalcError('The number of windows cannot be negative.', 'windows')
  if (!Number.isFinite(coats) || !(coats >= 1))
    throw new CalcError('Paint at least one coat.', 'coats')
  if (coats > 20) throw new CalcError('More than 20 coats is not a painting job.', 'coats')
  if (!Number.isFinite(coverage) || !(coverage > 0))
    throw new CalcError('Enter the coverage printed on the tin, greater than 0.', 'coverage')
  if (!Number.isFinite(canSize) || !(canSize > 0))
    throw new CalcError('Enter a tin size greater than 0.', 'canSize')
  if (!Number.isFinite(pricePerCan) || pricePerCan < 0)
    throw new CalcError('The price per tin cannot be negative.', 'pricePerCan')

  const lengthUnit = imperial ? 'ft' : 'm'
  const areaUnit = imperial ? 'ft²' : 'm²'
  const volumeUnit = imperial ? 'gal' : 'L'
  const coverageUnit = imperial ? 'ft²/gal' : 'm²/L'
  const doorArea = imperial ? DOOR_AREA_FT2 : DOOR_AREA_FT2 * M2_PER_FT2
  const windowArea = imperial ? WINDOW_AREA_FT2 : WINDOW_AREA_FT2 * M2_PER_FT2

  // Four walls: two of length x height and two of width x height, which is the
  // perimeter times the height. Ceiling and floor are not included.
  const perimeter = 2 * (roomLength + roomWidth)
  const grossArea = perimeter * wallHeight

  const doorDeduction = doors * doorArea
  const windowDeduction = windows * windowArea
  const deductions = doorDeduction + windowDeduction
  const netArea = grossArea - deductions

  // A negative wall is not a small wall. Say which count to fix rather than
  // quietly returning a negative area that then buys a negative number of tins.
  if (!(netArea > 0)) {
    const message =
      'The doors and windows add up to more wall than the room has. Check the counts, or the room size.'
    throw new CalcError(message, doors > 0 ? 'doors' : 'windows')
  }

  const areaToCover = netArea * coats
  const volumeNeeded = areaToCover / coverage

  // The honest part. Paint is sold in whole tins, so the shop rounds up and you
  // pay for the rounding: 3.08 tins is four tins, and the 0.92 of a tin you did
  // not need is still on the receipt.
  const cansExact = volumeNeeded / canSize
  const cans = Math.ceil(cansExact)
  const purchased = cans * canSize
  // Clamped so the two parts sum to `purchased` by construction even when
  // floating point puts `volumeNeeded` a hair above an exact multiple.
  const used = Math.min(volumeNeeded, purchased)
  const leftOver = purchased - used
  const wastePercent = (leftOver / purchased) * 100
  const totalCost = cans * pricePerCan

  // Both curves come from the same expressions as the headline, so the chart
  // and the number above it cannot drift apart: at x = coats the "needed" point
  // IS `volumeNeeded`, evaluated identically.
  const neededPoints = COAT_AXIS.map(
    (c) => [c, (netArea * c) / coverage] as readonly [number, number],
  )
  const purchasedPoints = COAT_AXIS.map((c) => {
    const needed = (netArea * c) / coverage
    return [c, Math.ceil(needed / canSize) * canSize] as readonly [number, number]
  })

  return {
    primary: {
      label: 'Paint needed',
      value: volumeNeeded,
      format: { style: 'decimal', decimals: 2, unit: volumeUnit },
    },
    // How much of what you have to buy actually ends up on the wall.
    scaleValue: wastePercent,
    stats: [
      { label: 'Tins to buy', value: cans, format: { style: 'decimal', decimals: 0, unit: 'tins' } },
      { label: 'Total paint cost', value: totalCost, format: { style: 'currency' } },
      {
        label: 'Wall area to paint',
        value: netArea,
        format: { style: 'decimal', decimals: 1, unit: areaUnit },
      },
      {
        label: 'Area over all coats',
        value: areaToCover,
        format: { style: 'decimal', decimals: 1, unit: areaUnit },
      },
      {
        label: 'Paint purchased',
        value: purchased,
        format: { style: 'decimal', decimals: 2, unit: volumeUnit },
      },
      {
        label: 'Paint left over',
        value: leftOver,
        format: { style: 'decimal', decimals: 2, unit: volumeUnit },
      },
    ],
    steps: [
      {
        label: 'Wall perimeter = 2 × (length + width)',
        value: perimeter,
        format: { style: 'decimal', decimals: 2, unit: lengthUnit },
      },
      {
        label: 'Gross wall area = perimeter × height',
        value: grossArea,
        format: { style: 'decimal', decimals: 2, unit: areaUnit },
      },
      { rule: true },
      {
        label: `Doors (${doors} × ${doorArea.toFixed(2)} ${areaUnit})`,
        value: doorDeduction,
        format: { style: 'decimal', decimals: 2, unit: areaUnit },
      },
      {
        label: `Windows (${windows} × ${windowArea.toFixed(2)} ${areaUnit})`,
        value: windowDeduction,
        format: { style: 'decimal', decimals: 2, unit: areaUnit },
      },
      {
        label: 'Net wall area = gross − openings',
        value: netArea,
        format: { style: 'decimal', decimals: 2, unit: areaUnit },
      },
      { rule: true },
      { label: 'Coats', value: coats, format: { style: 'decimal', decimals: 0, unit: 'coats' } },
      {
        label: 'Area to cover = net × coats',
        value: areaToCover,
        format: { style: 'decimal', decimals: 2, unit: areaUnit },
      },
      {
        label: 'Coverage',
        value: coverage,
        format: { style: 'decimal', decimals: 2, unit: coverageUnit },
      },
      {
        label: 'Paint needed = area ÷ coverage',
        value: volumeNeeded,
        format: { style: 'decimal', decimals: 3, unit: volumeUnit },
      },
      { rule: true },
      {
        label: 'Tin size',
        value: canSize,
        format: { style: 'decimal', decimals: 2, unit: volumeUnit },
      },
      // The two lines that matter. Shown next to each other on purpose: the
      // gap between them is the whole reason a paint estimate costs more than
      // the litres suggest.
      {
        label: 'Tins needed exactly = paint ÷ tin size',
        value: cansExact,
        format: { style: 'decimal', decimals: 3, unit: 'tins' },
      },
      {
        label: 'Tins to buy = rounded UP to a whole tin',
        value: cans,
        format: { style: 'decimal', decimals: 0, unit: 'tins' },
      },
      {
        label: 'Paint purchased = tins × tin size',
        value: purchased,
        format: { style: 'decimal', decimals: 2, unit: volumeUnit },
      },
      {
        label: 'Left in the tin',
        value: leftOver,
        format: { style: 'decimal', decimals: 2, unit: volumeUnit },
      },
      { rule: true },
      { label: 'Price per tin', value: pricePerCan, format: { style: 'currency' } },
      { label: 'Total cost = tins × price', value: totalCost, format: { style: 'currency' } },
    ],
    parts: [
      {
        label: 'Goes on the wall',
        value: used,
        format: { style: 'decimal', decimals: 2, unit: volumeUnit },
      },
      {
        label: 'Left over',
        value: leftOver,
        format: { style: 'decimal', decimals: 2, unit: volumeUnit },
      },
    ],
    // The parts split what you buy, not the headline, which is what you need.
    partsTotal: {
      label: 'Paint purchased',
      value: purchased,
      format: { style: 'decimal', decimals: 2, unit: volumeUnit },
    },
    series: [
      {
        label: 'Paint needed',
        points: neededPoints,
        format: { style: 'decimal', decimals: 2, unit: volumeUnit },
      },
      {
        label: 'Paint you must buy',
        points: purchasedPoints,
        format: { style: 'decimal', decimals: 2, unit: volumeUnit },
      },
    ],
    notes: [
      'Tins are rounded up, never averaged: a job needing 3.1 tins takes 4. That is why the cost jumps in steps as the room grows, and why a slightly larger tin size sometimes costs less overall.',
      'Walls only. Ceilings, skirting, architrave and doors themselves are separate jobs with their own coverage, and ceiling paint is usually a different product.',
      'Coverage on the tin is measured on smooth, sealed, primed wall. Bare plaster, textured or heavily patched surfaces drink noticeably more, so treat the tin figure as the best case.',
    ],
  }
}

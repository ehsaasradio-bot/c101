import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

/*
 * How many tiles a floor or a wall needs — worked out twice, on purpose.
 *
 * ── The thing almost every tile calculator gets wrong ────────────────────────
 *
 * The usual method is floor area ÷ tile area. That answer is a lower bound, not
 * a requirement, because it silently assumes a tile can be cut into pieces and
 * every offcut reused somewhere else. A 4.5 x 3.5 m floor in 60 x 60 cm tiles
 * is 43.32 tiles by area, so 44 — but you cannot lay 44 of them. The room takes
 * 6 tiles across and 8 along, which is 48, and buying 44 leaves you four short
 * before a single one has been broken.
 *
 * The honest calculation lays the tiles out:
 *
 *   tiles across = ceil((room width  + joint) / (tile width  + joint))
 *   tiles along  = ceil((room length + joint) / (tile length + joint))
 *   tiles        = across × along
 *
 * The `+ joint` on top is not a fudge. A run of n tiles has n−1 joints between
 * them and none at the two walls, so n tiles span n·tile + (n−1)·joint; adding
 * one joint to both sides of the division turns that into a clean n·(tile +
 * joint), and a run that happens to fit exactly comes out as exactly n rather
 * than a hair over.
 *
 * Both figures here use the same effective tile footprint — the tile plus one
 * joint in each direction, which is the space one tile actually occupies in the
 * grid — so the ONLY difference between them is where the rounding up happens:
 * once, over the whole floor, or once per row and once per column. That
 * isolates the layout effect, which is the thing worth showing. (Calculators
 * that also ignore the grout entirely come out lower still.)
 *
 * ── Which one to order from ──────────────────────────────────────────────────
 *
 * The truth is between them. The area count assumes perfect offcut reuse; the
 * layout count assumes none at all — every part tile at a wall comes from a
 * fresh one. Real tiling reuses some offcuts and wastes others, so the order is
 * built on the layout count, which is the figure that cannot leave you short,
 * and the trade's waste allowance goes on top of it for breakage, mis-cuts and
 * spares. Running out mid-job means a second batch, and a second batch means a
 * different dye lot.
 */

/** 1 in = 2.54 cm exactly, so 1 ft = 12 in = 30.48 cm. */
const CM_PER_M = 100
const MM_PER_M = 1000
const IN_PER_FT = 12

/**
 * Counting tiles is integer work done in floating point, so a run that fits
 * exactly can land at 5.999999999999999 or 6.000000000000001. Both of these
 * treat anything within 1e-9 of a whole number as that whole number, which
 * keeps `floorTol <= ceilTol` and stops an exact fit from buying a phantom row.
 */
const ceilTol = (x: number): number => Math.ceil(x - 1e-9)
const floorTol = (x: number): number => Math.floor(x + 1e-9)

/**
 * The x axis of the chart: waste allowance from 0% to 30%. Fixed, not derived
 * from the `wastePercent` field, so the number of points never varies with
 * input and the chart is drawable at the defaults — which is the only time the
 * server renders its container.
 *
 * It runs to 30 because that is the `wastePercent` field's own maximum: an axis
 * stopping at 25 would leave the chosen allowance off the right-hand end of the
 * chart for anyone who drags the slider past it, and the headline would then sit
 * beyond the curve that is supposed to contain it.
 */
const WASTE_AXIS = [0, 5, 10, 15, 20, 25, 30] as const

/**
 * A plausibility ceiling, well clear of anything the sliders can reach: the
 * widest room bound against the smallest tile bound is 100 / 0.05 = 2000 tiles
 * a side, or 4 million. Past 10 million something has been mistyped.
 */
const MAX_TILES = 10_000_000

export default function compute(v: Values<typeof fields>): CalcResult {
  const {
    roomLength,
    roomWidth,
    tileLength,
    tileWidth,
    groutGap,
    wastePercent,
    tilesPerBox,
    pricePerBox,
  } = v
  // Selects arrive as strings; the derived Values type makes that explicit.
  const imperial = v.units === 'imperial'

  // Finiteness first, every time: `coerceValues` hands compute a raw NaN for
  // anything it could not parse, and NaN fails every ordinary comparison, so a
  // bare `x <= 0` test would let it fall straight through into the arithmetic
  // and surface as a NaN result rather than a CalcError the form can highlight.
  if (!Number.isFinite(roomLength) || !(roomLength > 0))
    throw new CalcError('Enter a room length greater than 0.', 'roomLength')
  if (!Number.isFinite(roomWidth) || !(roomWidth > 0))
    throw new CalcError('Enter a room width greater than 0.', 'roomWidth')
  if (!Number.isFinite(tileLength) || !(tileLength > 0))
    throw new CalcError('Enter a tile length greater than 0.', 'tileLength')
  if (!Number.isFinite(tileWidth) || !(tileWidth > 0))
    throw new CalcError('Enter a tile width greater than 0.', 'tileWidth')
  if (!Number.isFinite(groutGap) || groutGap < 0)
    throw new CalcError('The grout joint cannot be negative. Use 0 for a butt joint.', 'groutGap')
  if (!Number.isFinite(wastePercent) || wastePercent < 0)
    throw new CalcError('The waste allowance cannot be negative.', 'wastePercent')
  if (wastePercent > 100)
    throw new CalcError('A waste allowance above 100% would more than double the order.', 'wastePercent')
  if (!Number.isFinite(tilesPerBox) || !(tilesPerBox >= 1))
    throw new CalcError('A box holds at least one tile.', 'tilesPerBox')
  if (!Number.isFinite(pricePerBox) || pricePerBox < 0)
    throw new CalcError('The price per box cannot be negative.', 'pricePerBox')

  // One base length unit per system — metres, or feet — so the mixed units the
  // form collects never reach the layout arithmetic.
  const lengthUnit = imperial ? 'ft' : 'm'
  const areaUnit = imperial ? 'ft²' : 'm²'
  const tileUnit = imperial ? 'in' : 'cm'
  const gapUnit = imperial ? 'in' : 'mm'
  const tileDivisor = imperial ? IN_PER_FT : CM_PER_M
  const gapDivisor = imperial ? IN_PER_FT : MM_PER_M

  const tileL = tileLength / tileDivisor
  const tileW = tileWidth / tileDivisor
  const gap = groutGap / gapDivisor

  // The space one tile occupies in the grid: its face plus one joint.
  const pitchL = tileL + gap
  const pitchW = tileW + gap

  const roomArea = roomLength * roomWidth
  const tileFaceArea = tileL * tileW
  const pitchArea = pitchL * pitchW

  // ── Method 1: the naive one. Area ÷ footprint, rounded up once. ────────────
  const areaExact = roomArea / pitchArea
  const areaCount = Math.max(1, ceilTol(areaExact))

  // ── Method 2: the honest one. Round up per row and per column. ─────────────
  const alongExact = (roomLength + gap) / pitchL
  const acrossExact = (roomWidth + gap) / pitchW
  const along = Math.max(1, ceilTol(alongExact))
  const across = Math.max(1, ceilTol(acrossExact))
  const layoutCount = along * across

  if (!Number.isFinite(layoutCount) || layoutCount > MAX_TILES) {
    // Point at the tile, which is the number worth checking: a room is rarely
    // mistyped by three orders of magnitude, a tile size often is.
    throw new CalcError(
      'That combination needs more than ten million tiles. Check the tile size and the unit selector.',
      tileLength <= tileWidth ? 'tileLength' : 'tileWidth',
    )
  }

  // Uncut tiles: whole rows and whole columns that clear the walls untrimmed.
  // Zero in either direction when the tile is longer than the room, which is a
  // real case — one tile, cut down, covers the whole run.
  const fullAlong = Math.max(0, floorTol(alongExact))
  const fullAcross = Math.max(0, floorTol(acrossExact))
  const fullTiles = fullAlong * fullAcross
  const cutTiles = layoutCount - fullTiles
  const tileOversized = fullAlong === 0 || fullAcross === 0

  // How far short the area method leaves you, as a share of what the layout
  // actually needs. Zero when the tiles happen to divide the room exactly.
  const shortfall = layoutCount - areaCount
  const shortfallPercent = (shortfall / layoutCount) * 100

  // ── The order ──────────────────────────────────────────────────────────────
  const tilesToBuy = ceilTol(layoutCount * (1 + wastePercent / 100))
  const wasteTiles = tilesToBuy - layoutCount

  // Boxes round UP, the same convention as tins of paint: shops sell boxes, not
  // tiles, and 13.25 boxes is 14 on any real receipt.
  const boxesExact = tilesToBuy / tilesPerBox
  const boxes = ceilTol(boxesExact)
  const tilesPurchased = boxes * tilesPerBox
  const spareTiles = Math.max(0, tilesPurchased - tilesToBuy)
  const totalCost = boxes * pricePerBox

  // What the area method would have had you order, for the comparison note.
  const areaMethodOrder = ceilTol(areaCount * (1 + wastePercent / 100))

  const tiledArea = layoutCount * tileFaceArea

  // Both curves come from the same expressions as the headline, so the chart
  // and the number above it cannot drift apart: at x = wastePercent the layout
  // line IS `tilesToBuy`, evaluated identically.
  const layoutPoints = WASTE_AXIS.map(
    (w) => [w, ceilTol(layoutCount * (1 + w / 100))] as readonly [number, number],
  )
  const areaPoints = WASTE_AXIS.map(
    (w) => [w, ceilTol(areaCount * (1 + w / 100))] as readonly [number, number],
  )

  const count = (label: string, value: number, unit = 'tiles') => ({
    label,
    value,
    format: { style: 'decimal' as const, decimals: 0, unit },
  })

  /** "1 tile", "48 tiles" — a count read by a person, not a template. */
  const tileWord = (n: number) => `${n} ${n === 1 ? 'tile' : 'tiles'}`

  const notes = [
    `Laid out row by row this floor takes ${tileWord(layoutCount)}. Dividing the area by one tile's footprint gives ${areaCount}, because that division quietly assumes every offcut can be reused somewhere else in the room. The gap between the two figures is ${tileWord(shortfall)} before any allowance for breakage.`,
    'The true requirement sits between the two: the area figure assumes perfect offcut reuse, the layout figure assumes none at all. The order here is built on the layout figure, because being over is a leftover box and being under is a second delivery from a different batch.',
    'Tile batches vary in shade. Buy the whole job in one order, keep the spares, and check the batch number on every box before the first one is opened.',
    'For a rectangular tile the orientation matters — swapping the tile length and width can change the total by a whole row. Try it both ways and take the smaller answer.',
    'Boxes are rounded up, never averaged: a job needing 13.25 boxes takes 14. That is why the cost climbs in steps rather than smoothly as the room grows.',
  ]
  if (tileOversized) {
    notes.unshift(
      'The tile is longer than the room in at least one direction, so every tile in that run is a cut tile: one tile, trimmed, covers the whole span.',
    )
  }

  return {
    primary: {
      // "Tiles needed", not "tiles to buy": what you actually buy is whole
      // boxes, which is `tilesPurchased` — 56 against the 53 needed at the
      // defaults. Naming this one "to buy" contradicted the step below it.
      label: 'Tiles needed',
      value: tilesToBuy,
      format: { style: 'decimal', decimals: 0, unit: 'tiles' },
    },
    // How much of the real requirement the area method misses.
    scaleValue: shortfallPercent,
    stats: [
      count('Boxes to buy', boxes, 'boxes'),
      { label: 'Total tile cost', value: totalCost, format: { style: 'currency' } },
      count('Tiles by layout (rows × columns)', layoutCount),
      count('Tiles by area (the naive figure)', areaCount),
      count('Tiles the area method misses', shortfall),
      {
        label: 'Floor area',
        value: roomArea,
        format: { style: 'decimal', decimals: 2, unit: areaUnit },
      },
    ],
    steps: [
      {
        label: 'Room',
        value: `${roomLength} × ${roomWidth} ${lengthUnit}`,
        format: { style: 'raw' },
      },
      {
        label: 'Floor area = length × width',
        value: roomArea,
        format: { style: 'decimal', decimals: 3, unit: areaUnit },
      },
      {
        label: 'Tile',
        value: `${tileLength} × ${tileWidth} ${tileUnit}`,
        format: { style: 'raw' },
      },
      {
        label: 'Grout joint',
        value: groutGap,
        format: { style: 'decimal', decimals: 2, unit: gapUnit },
      },
      {
        label: 'Tile footprint = (tile + joint) each way',
        value: pitchArea,
        format: { style: 'decimal', decimals: 5, unit: areaUnit },
      },
      { rule: true },
      // The naive method, shown in full so the reader can see exactly what it
      // does and where it stops.
      {
        label: 'Area method: floor area ÷ footprint',
        value: areaExact,
        format: { style: 'decimal', decimals: 3, unit: 'tiles' },
      },
      count('Area method, rounded up', areaCount),
      { rule: true },
      // The layout method, the same way.
      {
        label: `Tiles along the length = (${roomLength} + joint) ÷ ${pitchL.toFixed(4)} ${lengthUnit}`,
        value: alongExact,
        format: { style: 'decimal', decimals: 3, unit: 'tiles' },
      },
      count('Rounded up to whole rows', along, 'rows'),
      {
        label: `Tiles across the width = (${roomWidth} + joint) ÷ ${pitchW.toFixed(4)} ${lengthUnit}`,
        value: acrossExact,
        format: { style: 'decimal', decimals: 3, unit: 'tiles' },
      },
      count('Rounded up to whole columns', across, 'columns'),
      count('Layout method = rows × columns', layoutCount),
      { rule: true },
      // The two lines that matter, side by side.
      count('Difference: tiles the area method misses', shortfall),
      { label: 'Uncut tiles in the field', value: fullTiles, format: { style: 'decimal', decimals: 0, unit: 'tiles' } },
      count('Tiles that need cutting', cutTiles),
      { rule: true },
      {
        // `formatValue` takes a percent as percentage POINTS — 10 renders as
        // "10%", not 0.1 — so dividing here printed the allowance as "0%".
        label: 'Waste allowance',
        value: wastePercent,
        format: { style: 'percent', decimals: 0 },
      },
      count('Tiles needed = layout + allowance, rounded UP', tilesToBuy),
      count('The area method would have ordered', areaMethodOrder),
      { rule: true },
      count('Tiles per box', tilesPerBox),
      {
        label: 'Boxes needed exactly = tiles ÷ tiles per box',
        value: boxesExact,
        format: { style: 'decimal', decimals: 3, unit: 'boxes' },
      },
      count('Boxes to buy = rounded UP to a whole box', boxes, 'boxes'),
      count('Tiles purchased = boxes × tiles per box', tilesPurchased),
      count('Spare tiles in the last box', spareTiles),
      { rule: true },
      { label: 'Price per box', value: pricePerBox, format: { style: 'currency' } },
      { label: 'Total cost = boxes × price', value: totalCost, format: { style: 'currency' } },
    ],
    // Four components, always, so the donut is drawable at the defaults and its
    // arcs never disappear. They are derived so they sum to the purchased total
    // by construction: full + cut = layout, + allowance = to buy, + spare =
    // purchased. None can be negative.
    parts: [
      count('Uncut tiles', fullTiles),
      count('Cut at the edges', cutTiles),
      count('Waste allowance', wasteTiles),
      count('Spare in the last box', spareTiles),
    ],
    partsTotal: {
      label: 'Tiles purchased',
      value: tilesPurchased,
      format: { style: 'decimal', decimals: 0, unit: 'tiles' },
    },
    series: [
      {
        label: 'Layout method',
        points: layoutPoints,
        format: { style: 'decimal', decimals: 0, unit: 'tiles' },
      },
      {
        label: 'Area method',
        points: areaPoints,
        format: { style: 'decimal', decimals: 0, unit: 'tiles' },
      },
    ],
    chart: { title: 'Tiles needed by waste allowance', xLabel: 'Waste allowance (%)' },
    notes: [
      ...notes,
      // Deliberately unsigned: the tile face can land either side of the floor
      // area. It exceeds it when the cuts at the walls dominate (48 tiles of
      // 60 x 60 cm present 17.28 m² of face on a 15.75 m² floor), and falls
      // below it when the joint is wide enough to take a real share of the
      // floor, as it is with mosaic. Claiming one direction was wrong half the
      // time.
      `Those ${tileWord(layoutCount)} present ${tiledArea.toFixed(2)} ${areaUnit} of tile face on a ${roomArea.toFixed(2)} ${areaUnit} floor. The difference between the two is the grout joints plus everything trimmed off at the walls.`,
    ],
  }
}

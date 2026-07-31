import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its input type from
 * them without importing `index.ts` — which imports `compute.ts` and would cycle.
 *
 * Three different lengths are in play and each is entered in the unit a tiler
 * actually uses for it: the room in metres or feet, the tile in centimetres or
 * inches, the grout joint in millimetres or inches. `compute` converts all three
 * to one base per system (metres, or feet) before it lays anything out, so the
 * mixed units never reach the arithmetic.
 *
 * Every dimension here is a fixed physical quantity, so each imperial case
 * carries a `factor`: switching the selector restates a 4.5 m room as 14.76 ft
 * rather than leaving 4.5 to mean 4.5 ft. The tile count therefore does not jump
 * when you change unit system — which is the point, and what the tests pin.
 *
 * `roomLength` is deliberately the first number field: the end-to-end suite
 * nudges that field to 1.1x its default, and a longer room is valid anywhere in
 * the range and always adds at least one more row of tiles.
 */

/** 1 m = 3.2808398950131235 ft exactly (1 ft = 0.3048 m since 1959). */
const FT_PER_M = 3.2808398950131235
/** 1 cm = 0.39370078740157477 in exactly (1 in = 2.54 cm). */
const IN_PER_CM = 0.39370078740157477
/** 1 mm = 0.03937007874015748 in exactly. */
const IN_PER_MM = 0.03937007874015748

/** Room dimensions: metres, or feet. */
const ROOM_VARIANTS = {
  on: 'units',
  cases: {
    // Base case: factor 1, deliberately omitted.
    metric: { min: 0.3, max: 30, step: 0.1, unit: 'm' },
    imperial: { min: 1, max: 100, step: 0.5, unit: 'ft', factor: FT_PER_M },
  },
} as const

/** Tile dimensions: centimetres, or inches. */
const TILE_VARIANTS = {
  on: 'units',
  cases: {
    metric: { min: 5, max: 200, step: 1, unit: 'cm' },
    imperial: { min: 2, max: 80, step: 0.5, unit: 'in', factor: IN_PER_CM },
  },
} as const

export const fields = [
  {
    kind: 'select',
    id: 'units',
    label: 'Units',
    default: 'metric',
    options: [
      { value: 'metric', label: 'Metric (m, cm, mm)' },
      { value: 'imperial', label: 'Imperial (ft, in)' },
    ],
    help: 'Rooms are measured in metres or feet, tiles in centimetres or inches, and the grout joint in millimetres or inches.',
  },
  {
    kind: 'number',
    id: 'roomLength',
    label: 'Room length',
    default: 4.5,
    // Top-level min/max are the union across both variants — the absolute range
    // the field will ever accept. Each variant narrows the control to the unit
    // actually selected, so a foot-based visitor is not handed a metre slider.
    min: 0.3,
    max: 100,
    step: 0.1,
    unit: 'm',
    variants: ROOM_VARIANTS,
    help: 'The wall-to-wall run the tiles are laid along. For a wall rather than a floor, this is the wall width.',
  },
  {
    kind: 'number',
    id: 'roomWidth',
    label: 'Room width',
    default: 3.5,
    min: 0.3,
    max: 100,
    step: 0.1,
    unit: 'm',
    variants: ROOM_VARIANTS,
    help: 'The other run, across the tiles. For a wall, this is the height being tiled.',
  },
  {
    kind: 'number',
    id: 'tileLength',
    label: 'Tile length',
    default: 60,
    min: 2,
    max: 200,
    step: 1,
    unit: 'cm',
    variants: TILE_VARIANTS,
    help: 'The tile side that runs along the room length. Swapping the two tile sides can change the total, so it is worth trying it both ways.',
  },
  {
    kind: 'number',
    id: 'tileWidth',
    label: 'Tile width',
    default: 60,
    min: 2,
    max: 200,
    step: 1,
    unit: 'cm',
    variants: TILE_VARIANTS,
    help: 'The tile side that runs across the room width.',
  },
  {
    kind: 'number',
    id: 'groutGap',
    label: 'Grout joint',
    default: 3,
    min: 0,
    max: 20,
    step: 0.5,
    unit: 'mm',
    variants: {
      on: 'units',
      cases: {
        metric: { min: 0, max: 20, step: 0.5, unit: 'mm' },
        imperial: { min: 0, max: 0.75, step: 0.0625, unit: 'in', factor: IN_PER_MM },
      },
    },
    help: 'The gap between tiles. 2-3 mm (about 1/8 in) for rectified porcelain, 3-5 mm for ceramic, more for stone. Set it to zero for a butt joint.',
  },
  {
    kind: 'number',
    id: 'wastePercent',
    label: 'Waste allowance',
    default: 10,
    min: 0,
    max: 30,
    step: 1,
    unit: '%',
    // No variants: a percentage is the same number in both unit systems.
    help: '10% is the usual trade allowance for cuts and breakages. Allow 15% for a diagonal or herringbone lay, or a room with many corners.',
  },
  {
    kind: 'number',
    id: 'tilesPerBox',
    label: 'Tiles per box',
    default: 4,
    min: 1,
    max: 100,
    step: 1,
    unit: 'tiles',
    help: 'Printed on the box. Large-format 60 x 60 cm porcelain is usually 4 to a box; 30 x 30 cm ceramic is often 10 or more.',
  },
  {
    kind: 'number',
    id: 'pricePerBox',
    label: 'Price per box',
    default: 45,
    min: 0,
    max: 500,
    step: 1,
    unit: 'per box',
    help: 'What one box of the tiles above costs. Leave it at zero if you only want the counts.',
  },
] as const satisfies readonly Field[]

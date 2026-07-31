import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'tile-calculator',
  category: 'everyday',
  title: 'Tile Calculator',
  seoTitle: 'Tile Calculator: How Many Tiles, Boxes and What It Costs',
  description:
    'Work out how many tiles a floor or wall needs by laying them out row by row, not by dividing area — plus boxes to buy, waste allowance and total cost.',
  intro:
    'Dividing the floor area by the area of one tile is the standard way to estimate tiles, and it is the reason people run short: a tile cannot be cut up and reassembled across the room, so the count has to round up once per row and once per column, not once over the whole floor. This lays the tiles out both ways — the naive area figure and the honest row-by-row figure — shows the gap between them, adds the grout joint into the tile footprint, applies your waste allowance, and rounds the boxes up to what a shop will actually sell you.',
  fields,
  resultLabel: 'Tiles needed',
  compute,
  scale: {
    min: 0,
    max: 100,
    unit: '%',
    // How far short the area method leaves you, as a share of the tiles the
    // layout actually needs. It is nothing to do with the waste allowance: it
    // is purely the cost of rounding once instead of per row and per column,
    // and it grows with the tile size relative to the room.
    bands: [
      { id: 'excellent', label: 'The tiles fit the room almost exactly — under 2% out', from: 0, to: 2 },
      { id: 'good', label: 'A small layout penalty — 2% to 6%', from: 2, to: 6 },
      { id: 'neutral', label: 'A real gap — 6% to 12% more than the area figure', from: 6, to: 12 },
      { id: 'warn', label: 'Large tiles in an awkward room — 12% to 25%', from: 12, to: 25 },
      { id: 'critical', label: 'The area figure is badly short — 25% or more', from: 25, to: 100 },
    ],
  },
  faqs: [
    {
      q: 'Why does area divided by tile area come out too low?',
      a: 'Because that division assumes a tile can be cut into pieces and every offcut reused somewhere else in the room, which is not how tiling works. A run of floor 4.5 m long takes eight 60 cm tiles, not 7.47 of them, and the same rounding happens again across the width. Round up once per row and once per column and a 4.5 by 3.5 m floor comes to 6 x 8 = 48 tiles, against 44 by area — four tiles short before anything has been broken or mis-cut.',
    },
    {
      q: 'How much waste should I allow?',
      a: '10% is the usual trade allowance for a straight lay in a simple rectangular room, and it is what this starts with. Go to 15% for a diagonal or herringbone pattern, where almost every perimeter tile is a cut, or for a room with lots of alcoves, doorways and pipe boxings. Large-format tiles also justify more, because a single mis-cut wastes a bigger piece. The allowance is on top of the layout count, and it covers breakage in transit, mistakes on the day, and a few spares to keep for repairs.',
    },
    {
      q: 'Should the grout joint be included?',
      a: 'Yes, and this includes it in both figures. A tile occupies its own face plus one joint in each direction, so 60 cm tiles at a 3 mm joint sit on a 60.3 cm pitch. Eight of them along a 4.5 m run have seven joints between them, which is 21 mm of grout — not enough to change this particular answer, but enough to matter with small mosaic tiles where the joint can be a tenth of the tile itself.',
    },
    {
      q: 'Which number should I actually order from?',
      a: 'The layout figure plus your waste allowance, which is the headline here. The area figure assumes perfect offcut reuse and the layout figure assumes none at all, so the truth is between them — but the two errors are not symmetrical. Ordering over leaves you with a spare box, which is worth having anyway for future repairs. Ordering under means a second delivery, days lost, and tiles from a different batch that may not match the shade of the first.',
    },
    {
      q: 'Does it matter which way round the tile goes?',
      a: 'For a square tile, no. For a rectangular one it can change the total by a whole row, because the rounding up happens against different room dimensions. A 30 x 60 cm tile in a 4.5 by 3.5 m room comes out differently with the long side running along the room than across it. Swap the tile length and width here and take the smaller answer — then check the pattern still looks right, since plank-format tiles are usually laid with the long side along the longest sightline.',
    },
    {
      q: 'Why round boxes up?',
      a: 'Because shops sell boxes, not tiles. If the maths says 13.25 boxes you buy 14, and you pay for all 14 — the three spare tiles are on the receipt whether you use them or not. Rounding to the nearest box instead would leave a job three tiles short, which means a second trip and possibly a second batch. The spare tiles are shown separately here so you can see what the box size is costing you; a smaller box size sometimes costs less overall even at a higher price per tile.',
    },
    {
      q: 'Does this work for walls as well as floors?',
      a: 'Yes — a wall is the same grid problem. Enter the wall width as the room length and the tiled height as the room width, and the layout works out identically. Deduct nothing for a window or a door opening unless it is large: the tiles cut around a small opening are rarely reusable, so the full-rectangle count is usually closer to what you need than a deducted one.',
    },
  ],
  // Slugs, never hrefs. Every one must resolve or the conformance suite fails.
  related: ['paint-calculator', 'area-calculator', 'unit-converter-calculator'],
  lastReviewed: '2026-07-31',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'
import { convertBetween, defaultValues, resolveBounds, toResultView } from '../../../lib/view'
import type { Field, NumberField } from '../../../lib/types'

type Input = Parameters<typeof compute>[0]

const base: Input = {
  units: 'metric',
  roomLength: 4.5,
  roomWidth: 3.5,
  tileLength: 60,
  tileWidth: 60,
  groutGap: 3,
  wastePercent: 10,
  tilesPerBox: 4,
  pricePerBox: 45,
}

const defaults = defaultValues(def) as Input

/** Exact by definition: 1 in = 2.54 cm, 1 ft = 0.3048 m. */
const FT_PER_M = 3.2808398950131235
const IN_PER_CM = 0.39370078740157477
const IN_PER_MM = 0.03937007874015748

/**
 * The same physical room, tile and joint restated in feet and inches — exactly
 * what the form's unit selector produces when it converts what the visitor has
 * already typed. Every one of these dimensions is a fixed quantity, so all five
 * convert; the percentage, the box size and the price do not.
 */
const toImperial = (v: Input): Input => ({
  ...v,
  units: 'imperial',
  roomLength: v.roomLength * FT_PER_M,
  roomWidth: v.roomWidth * FT_PER_M,
  tileLength: v.tileLength * IN_PER_CM,
  tileWidth: v.tileWidth * IN_PER_CM,
  groutGap: v.groutGap * IN_PER_MM,
})

const stat = (r: ReturnType<typeof compute>, prefix: string) =>
  Number(r.stats!.find((s) => s.label.startsWith(prefix))!.value)

const step = (r: ReturnType<typeof compute>, label: string) =>
  Number(
    (r.steps!.find((s) => 'label' in s && s.label === label) as { value: number } | undefined)!.value,
  )

const stepLabels = (r: ReturnType<typeof compute>) =>
  r.steps!.flatMap((s) => ('label' in s ? [s.label] : []))

/**
 * The independent method: physically lay tiles down a run and count them,
 * making no use of a ceiling function at all. Start at one wall, put a tile
 * down, and keep adding joint-then-tile until the far wall is covered. The last
 * one gets cut, which is why it still counts.
 *
 * This is what `ceil((L + joint) / (tile + joint))` is supposed to mean, and the
 * two are asserted against each other below across a wide grid of sizes.
 */
const tilesInRun = (roomMetres: number, tileMetres: number, jointMetres: number): number => {
  let laid = 0
  let covered = 0
  while (covered < roomMetres - 1e-9) {
    if (laid > 0) covered += jointMetres
    covered += tileMetres
    laid += 1
    if (laid > 1_000_000) throw new Error('runaway')
  }
  return laid
}

describe('tile', () => {
  test('the field defaults are exactly the fixture', () => {
    // Everything below is asserted against `base`; if the fields drift, the page
    // and this file would silently stop describing the same calculator.
    expect(defaults).toEqual(base)
  })

  test('a 4.5 × 3.5 m floor in 60 cm tiles lays out as 8 × 6 = 48, not 44', () => {
    /*
     * Derived from the formula, in metres:
     *   pitch      = 0.60 + 0.003              = 0.603 m each way
     *   along      = (4.5 + 0.003) / 0.603     = 7.46766… → 8 rows
     *   across     = (3.5 + 0.003) / 0.603     = 5.80929… → 6 columns
     *   layout     = 8 × 6                     = 48 tiles
     *   floor area = 4.5 × 3.5                 = 15.75 m²
     *   footprint  = 0.603²                    = 0.363609 m²
     *   area count = 15.75 / 0.363609          = 43.31576… → 44 tiles
     */
    const r = compute(base)
    expect(stat(r, 'Tiles by layout')).toBe(48)
    expect(stat(r, 'Tiles by area')).toBe(44)
    expect(stat(r, 'Tiles the area method misses')).toBe(4)
    expect(stat(r, 'Floor area')).toBeCloseTo(15.75, 12)

    expect(step(r, 'Rounded up to whole rows')).toBe(8)
    expect(step(r, 'Rounded up to whole columns')).toBe(6)
    expect(step(r, 'Area method: floor area ÷ footprint')).toBeCloseTo(43.3157595109032, 9)
    expect(step(r, 'Tile footprint = (tile + joint) each way')).toBeCloseTo(0.363609, 12)
  })

  test('the same 48 falls out of laying the tiles down one at a time', () => {
    // Second, independent route: no division and no ceiling — just place tiles
    // along each run until the wall is reached (see `tilesInRun`).
    const along = tilesInRun(4.5, 0.6, 0.003)
    const across = tilesInRun(3.5, 0.6, 0.003)
    expect(along).toBe(8)
    expect(across).toBe(6)
    expect(along * across).toBe(48)

    // And the naive figure a third way, in whole millimetres so no float can
    // move it: 4500 × 3500 mm² of floor over a 603 × 603 mm² footprint.
    const areaExactMm = (4500 * 3500) / (603 * 603)
    expect(areaExactMm).toBeCloseTo(43.3157595109032, 9)
    expect(Math.ceil(areaExactMm)).toBe(44)

    const r = compute(base)
    expect(stat(r, 'Tiles by layout')).toBe(along * across)
    expect(stat(r, 'Tiles by area')).toBe(Math.ceil(areaExactMm))
  })

  test('the row count agrees with a physical lay-down across the size range', () => {
    // The whole page rests on this one identity, so it is checked against the
    // simulation over every combination of run, tile and joint worth trying —
    // including exact fits, where an off-by-one would buy a phantom row.
    for (const roomMetres of [0.3, 1, 2.4, 4.5, 4.821, 7, 12.6, 30]) {
      for (const tileMetres of [0.05, 0.2, 0.6, 1.2, 2]) {
        for (const jointMetres of [0, 0.003, 0.02]) {
          const r = compute({
            ...base,
            roomLength: roomMetres,
            roomWidth: roomMetres,
            tileLength: tileMetres * 100,
            tileWidth: tileMetres * 100,
            groutGap: jointMetres * 1000,
          })
          const expected = tilesInRun(roomMetres, tileMetres, jointMetres)
          expect(
            step(r, 'Rounded up to whole rows'),
            `${roomMetres} m run of ${tileMetres} m tiles at a ${jointMetres} m joint`,
          ).toBe(expected)
          expect(stat(r, 'Tiles by layout')).toBe(expected * expected)
        }
      }
    }
  })

  test('a run that fits exactly buys no phantom row', () => {
    // Eight 60 cm tiles with seven 3 mm joints between them span exactly
    // 8 × 0.6 + 7 × 0.003 = 4.821 m. The count must be 8, not 9, and every tile
    // in that run is uncut.
    expect(tilesInRun(4.821, 0.6, 0.003)).toBe(8)
    const r = compute({ ...base, roomLength: 4.821, roomWidth: 4.821, wastePercent: 0 })
    expect(step(r, 'Rounded up to whole rows')).toBe(8)
    expect(stat(r, 'Tiles by layout')).toBe(64)
    expect(step(r, 'Tiles that need cutting')).toBe(0)
    expect(step(r, 'Uncut tiles in the field')).toBe(64)
    // With nothing cut and no allowance, the two methods finally agree.
    expect(stat(r, 'Tiles by area')).toBe(64)
    expect(r.scaleValue).toBe(0)
  })

  test('the layout count is never below the area count, and the gap is real', () => {
    // The claim the page is built on. `ceil(a)·ceil(b) ≥ ceil(a·b)` for positive
    // a and b, so this cannot fail by construction — which is exactly why it is
    // worth pinning: it is the invariant that would break first if either method
    // were rewritten.
    let differing = 0
    for (const roomLength of [0.3, 1, 2.5, 4.5, 9.7, 30]) {
      for (const roomWidth of [0.3, 1, 3.5, 7.2, 30]) {
        for (const tileLength of [5, 20, 33, 60, 120, 200]) {
          for (const tileWidth of [5, 30, 60, 200]) {
            for (const groutGap of [0, 3, 20]) {
              const r = compute({ ...base, roomLength, roomWidth, tileLength, tileWidth, groutGap })
              const layout = stat(r, 'Tiles by layout')
              const area = stat(r, 'Tiles by area')
              expect(layout).toBeGreaterThanOrEqual(area)
              expect(layout - area).toBe(stat(r, 'Tiles the area method misses'))
              if (layout > area) differing += 1
            }
          }
        }
      }
    }
    // The defaults are one of them: 48 against 44.
    expect(differing).toBeGreaterThan(100)
    expect(stat(compute(base), 'Tiles by layout')).toBeGreaterThan(stat(compute(base), 'Tiles by area'))
  }, 30_000)

  test('the headline at the defaults is 53 tiles, 14 boxes, $630', () => {
    /*
     *   needed    = ceil(48 × 1.10)  = ceil(52.8)  = 53 tiles
     *   boxes     = ceil(53 / 4)     = ceil(13.25) = 14 boxes
     *   purchased = 14 × 4                          = 56 tiles
     *   spare     = 56 − 53                         = 3 tiles
     *   cost      = 14 × 45                         = $630
     */
    const r = compute(base)
    expect(r.primary.label).toBe('Tiles needed')
    expect(r.primary.value).toBe(53)
    expect(r.primary.format).toEqual({ style: 'decimal', decimals: 0, unit: 'tiles' })
    expect(stat(r, 'Boxes to buy')).toBe(14)
    expect(stat(r, 'Total tile cost')).toBe(630)
    expect(step(r, 'Boxes needed exactly = tiles ÷ tiles per box')).toBeCloseTo(13.25, 12)
    expect(step(r, 'Tiles purchased = boxes × tiles per box')).toBe(56)
    expect(step(r, 'Spare tiles in the last box')).toBe(3)
    // The label on the page and the label in the definition are the same words.
    expect(def.resultLabel).toBe(r.primary.label)
  })

  test('the whole job worked in feet and inches gives the same physical answer', () => {
    // Fully independent path: every length converted, compute run entirely in
    // feet. Counts are unit-free, so they must come out identical — not close.
    const metric = compute(base)
    const imperial = compute(toImperial(base))

    expect(imperial.primary.value).toBe(metric.primary.value)
    expect(stat(imperial, 'Tiles by layout')).toBe(48)
    expect(stat(imperial, 'Tiles by area')).toBe(44)
    expect(stat(imperial, 'Boxes to buy')).toBe(14)
    expect(stat(imperial, 'Total tile cost')).toBe(630)

    // The floor area is the same floor, written in ft²: 15.75 m² ÷ 0.09290304.
    expect(stat(imperial, 'Floor area')).toBeCloseTo(15.75 / 0.09290304, 9)
    expect(stat(imperial, 'Floor area') * 0.09290304).toBeCloseTo(15.75, 9)

    // Both systems name their own units, and neither leaks the other's.
    expect(stepLabels(imperial).some((l) => l.includes('ft'))).toBe(true)
    expect(stepLabels(metric).some((l) => l.includes(' m'))).toBe(true)
  })

  test('metric and imperial agree over the whole input space, not just the defaults', () => {
    for (const roomLength of [0.5, 2, 4.5, 12, 29]) {
      for (const roomWidth of [0.4, 3.5, 11]) {
        for (const tileLength of [5, 30, 45, 60, 150]) {
          for (const groutGap of [0, 2, 3, 12]) {
            const patch = { ...base, roomLength, roomWidth, tileLength, groutGap }
            const m = compute(patch)
            const i = compute(toImperial(patch))
            const where = `${roomLength}×${roomWidth} m, ${tileLength} cm, ${groutGap} mm`
            expect(i.primary.value, where).toBe(m.primary.value)
            expect(stat(i, 'Tiles by layout'), where).toBe(stat(m, 'Tiles by layout'))
            expect(stat(i, 'Tiles by area'), where).toBe(stat(m, 'Tiles by area'))
            expect(stat(i, 'Boxes to buy'), where).toBe(stat(m, 'Boxes to buy'))
          }
        }
      }
    }
  }, 30_000)

  test('boxes round UP, never down, and never by more than one box', () => {
    // 53 tiles in boxes of 4 is 13.25 boxes, which is 14 on any real receipt.
    expect(stat(compute(base), 'Boxes to buy')).toBe(14)

    let previous = 0
    for (let roomLength = 0.5; roomLength <= 20; roomLength += 0.25) {
      for (const tilesPerBox of [1, 3, 4, 7, 12, 100]) {
        const r = compute({ ...base, roomLength, tilesPerBox })
        const boxes = stat(r, 'Boxes to buy')
        const needed = Number(r.primary.value)
        const purchased = step(r, 'Tiles purchased = boxes × tiles per box')

        expect(Number.isInteger(boxes)).toBe(true)
        expect(boxes).toBe(Math.ceil(needed / tilesPerBox))
        // Never short — the whole point of rounding up.
        expect(purchased).toBeGreaterThanOrEqual(needed)
        // And never generous by a whole extra box.
        expect(purchased - needed).toBeLessThan(tilesPerBox)
        expect(step(r, 'Spare tiles in the last box')).toBe(purchased - needed)
      }
      // A longer room never needs fewer boxes at a fixed box size.
      const boxesAtFour = stat(compute({ ...base, roomLength }), 'Boxes to buy')
      expect(boxesAtFour).toBeGreaterThanOrEqual(previous)
      previous = boxesAtFour
    }
  }, 30_000)

  test('the waste allowance is applied to the layout count and shown as a percentage', () => {
    for (const [wastePercent, expected] of [
      [0, 48],
      [5, 51], // ceil(50.4)
      [10, 53], // ceil(52.8)
      [15, 56], // ceil(55.2)
      [30, 63], // ceil(62.4)
    ] as const) {
      const r = compute({ ...base, wastePercent })
      expect(Number(r.primary.value), `${wastePercent}%`).toBe(expected)
      expect(step(r, 'Waste allowance')).toBe(wastePercent)
    }

    // Regression: `formatValue` takes a percent as percentage POINTS, so a step
    // carrying `wastePercent / 100` rendered the 10% allowance as "0%".
    const view = toResultView(compute(base), def.scale)
    const shown = view.steps.find((s) => 'label' in s && s.label === 'Waste allowance')!
    expect((shown as { text: string }).text).toBe('10%')
  })

  test('a tile larger than the room is one cut tile, not zero and not an error', () => {
    // A 200 × 200 cm tile in a 1 × 1 m room. There is no whole tile anywhere in
    // the field: one tile, trimmed on two sides, covers the lot.
    const r = compute({ ...base, roomLength: 1, roomWidth: 1, tileLength: 200, tileWidth: 200 })
    expect(stat(r, 'Tiles by layout')).toBe(1)
    expect(stat(r, 'Tiles by area')).toBe(1) // 1 m² over a 4.12 m² footprint, floored at one
    expect(step(r, 'Uncut tiles in the field')).toBe(0)
    expect(step(r, 'Tiles that need cutting')).toBe(1)
    expect(r.scaleValue).toBe(0)
    // Rounding up still applies to the allowance: one tile plus 10% is two.
    expect(r.primary.value).toBe(2)
    expect(r.notes!.some((n) => n.includes('longer than the room'))).toBe(true)
    expect(r.notes![0]).toMatch(/longer than the room/)

    // Oversized in one direction only — a plank longer than the room is common.
    const plank = compute({ ...base, roomLength: 1, roomWidth: 3.5, tileLength: 120, tileWidth: 60 })
    expect(step(r, 'Uncut tiles in the field')).toBe(0)
    expect(plank.notes!.some((n) => n.includes('longer than the room'))).toBe(true)
    expect(stat(plank, 'Tiles by layout')).toBe(1 * 6)

    // Singular counts read as singular.
    expect(r.notes!.some((n) => n.includes('1 tiles'))).toBe(false)
    expect(r.notes!.some((n) => n.includes('takes 1 tile.'))).toBe(true)
  })

  test('the parts split what is purchased, exactly and without a negative slice', () => {
    // 35 uncut + 13 cut = 48 laid out, + 5 allowance = 53 needed, + 3 spare in
    // the last box = 56 purchased.
    const r = compute(base)
    expect(r.parts!.map((p) => [p.label, p.value])).toEqual([
      ['Uncut tiles', 35],
      ['Cut at the edges', 13],
      ['Waste allowance', 5],
      ['Spare in the last box', 3],
    ])
    expect(Number(r.partsTotal!.value)).toBe(56)

    for (const patch of [
      {},
      { wastePercent: 0 },
      { wastePercent: 30 },
      { tilesPerBox: 1 },
      { tilesPerBox: 100 },
      { roomLength: 0.3, roomWidth: 0.3 },
      { tileLength: 200, tileWidth: 200 },
      { tileLength: 5, tileWidth: 5, groutGap: 0 },
      { groutGap: 20 },
      toImperial(base),
      { roomLength: 30, roomWidth: 30 },
    ] as Partial<Input>[]) {
      const result = compute({ ...base, ...patch })
      // The count never varies with input, so the donut the server renders at
      // the defaults always has the same four arcs to reconcile against.
      expect(result.parts).toHaveLength(4)
      const sum = result.parts!.reduce((acc, p) => acc + p.value, 0)
      expect(sum).toBeCloseTo(Number(result.partsTotal!.value), 6)
      for (const part of result.parts!) expect(part.value).toBeGreaterThanOrEqual(0)
    }
  })

  test('the chart always draws two lines over the same seven allowances', () => {
    for (const patch of [
      {},
      { wastePercent: 0 },
      { wastePercent: 30 },
      { tileLength: 5, tileWidth: 5 },
      { tileLength: 200, tileWidth: 200 },
      { roomLength: 30, roomWidth: 30 },
      toImperial(base),
    ] as Partial<Input>[]) {
      const r = compute({ ...base, ...patch })
      expect(r.series).toHaveLength(2)
      for (const series of r.series!) {
        expect(series.points.map(([x]) => x)).toEqual([0, 5, 10, 15, 20, 25, 30])
        series.points.forEach(([x, y], i) => {
          expect(Number.isFinite(x)).toBe(true)
          expect(Number.isFinite(y)).toBe(true)
          if (i > 0) expect(x).toBeGreaterThan(series.points[i - 1]![0])
        })
      }
      // The layout line is never below the area line, at any allowance.
      const layout = r.series![0]!.points
      const area = r.series![1]!.points
      layout.forEach(([, y], i) => expect(y).toBeGreaterThanOrEqual(area[i]![1]))
    }
  })

  test('the chart point at the chosen allowance is the headline itself', () => {
    // The axis runs to 30 because the field does; every value the slider can
    // land on that the axis samples must be the headline exactly, not near it.
    for (const wastePercent of [0, 5, 10, 15, 20, 25, 30]) {
      const r = compute({ ...base, wastePercent })
      const point = r.series![0]!.points.find(([x]) => x === wastePercent)!
      expect(point[1]).toBe(Number(r.primary.value))
    }
  })

  test('the scale is the share of the real requirement the area method misses', () => {
    // 4 tiles missed out of the 48 actually needed = 8.333…%.
    const r = compute(base)
    expect(r.scaleValue).toBeCloseTo((4 / 48) * 100, 12)

    const view = toResultView(r, def.scale)
    expect(view.band).toBe('neutral')
    expect(view.scalePercent).toBeGreaterThanOrEqual(0)
    expect(view.scalePercent).toBeLessThanOrEqual(100)
    expect(view.primary.text).toBe('53 tiles')
    for (const s of view.stats) expect(s.text).not.toContain('NaN')
    for (const s of view.steps) if ('text' in s) expect(s.text).not.toContain('NaN')
    for (const p of view.parts) expect(p.text).not.toContain('NaN')

    // It stays a real percentage everywhere, never negative and never 100.
    for (const roomLength of [0.3, 1.1, 4.5, 17, 30]) {
      for (const tileLength of [5, 60, 137, 200]) {
        for (const groutGap of [0, 3, 20]) {
          const swept = compute({ ...base, roomLength, tileLength, tileWidth: tileLength, groutGap })
          expect(swept.scaleValue!).toBeGreaterThanOrEqual(0)
          expect(swept.scaleValue!).toBeLessThan(100)
        }
      }
    }
  })

  test('the orientation of a rectangular tile changes the answer', () => {
    // The FAQ promises this, so it is pinned: a 30 × 60 cm plank in the default
    // room is 15 × 6 = 90 tiles one way and 8 × 12 = 96 the other.
    const longways = compute({ ...base, tileLength: 30, tileWidth: 60 })
    const crossways = compute({ ...base, tileLength: 60, tileWidth: 30 })
    expect(stat(longways, 'Tiles by layout')).toBe(90)
    expect(stat(crossways, 'Tiles by layout')).toBe(96)
  })

  test('nudging the first number field to 1.1x stays valid and moves the result', () => {
    // The e2e suite does exactly this, so pin the invariant here too.
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('roomLength')

    const before = Number(compute(defaults).primary.value)
    const after = Number(compute({ ...defaults, roomLength: defaults.roomLength * 1.1 }).primary.value)
    // 4.95 m: (4.95 + 0.003) / 0.603 = 8.2139 → 9 rows × 6 columns = 54 tiles,
    // and ceil(54 × 1.1) = ceil(59.4) = 60.
    expect(after).toBe(60)
    expect(after).not.toBe(before)
  })

  test('an absurd combination is refused rather than counted', () => {
    let thrown: unknown
    try {
      compute({ ...base, roomLength: 10_000_000 })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).message).toMatch(/ten million tiles/)
    // It blames the tile, which is the number actually worth re-reading.
    expect((thrown as CalcError).fieldId).toBe('tileLength')
  })

  test.each([
    ['zero room length', { roomLength: 0 }, 'roomLength'],
    ['negative room length', { roomLength: -4.5 }, 'roomLength'],
    ['zero room width', { roomWidth: 0 }, 'roomWidth'],
    ['zero tile length', { tileLength: 0 }, 'tileLength'],
    ['negative tile length', { tileLength: -60 }, 'tileLength'],
    ['zero tile width', { tileWidth: 0 }, 'tileWidth'],
    ['a negative grout joint', { groutGap: -1 }, 'groutGap'],
    ['a negative waste allowance', { wastePercent: -1 }, 'wastePercent'],
    ['a waste allowance over 100%', { wastePercent: 101 }, 'wastePercent'],
    ['an empty box', { tilesPerBox: 0 }, 'tilesPerBox'],
    ['half a tile in a box', { tilesPerBox: 0.5 }, 'tilesPerBox'],
    ['a negative price', { pricePerBox: -1 }, 'pricePerBox'],
  ])('rejects %s against the offending field', (_label, patch, fieldId) => {
    let thrown: unknown
    try {
      compute({ ...base, ...patch })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
  })

  test('a zero grout joint is a butt joint, not an error', () => {
    // `min: 0` on the field, so the slider reaches it: compute must accept it.
    const r = compute({ ...base, groutGap: 0 })
    // pitch 0.6 m: ceil(4.5 / 0.6) = 8 rows, ceil(3.5 / 0.6) = 6 columns.
    expect(stat(r, 'Tiles by layout')).toBe(48)
    expect(tilesInRun(4.5, 0.6, 0)).toBe(8)
    // And a zero price is a valid "counts only" answer.
    expect(stat(compute({ ...base, pricePerBox: 0 }), 'Total tile cost')).toBe(0)
  })

  // The form layer coerces an unparseable entry to a raw NaN and hands it
  // straight to compute (src/lib/view.ts coerceValues), so every number field
  // must reject non-finite input with a CalcError rather than returning NaN.
  const nonFinite = [
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ] as const
  const numberIds = fields.filter((f) => f.kind === 'number').map((f) => f.id)

  test.each(
    numberIds.flatMap((fieldId) => nonFinite.map(([label, value]) => [fieldId, label, value] as const)),
  )('rejects %s = %s with a CalcError, never a NaN result', (fieldId, _label, value) => {
    let thrown: unknown
    try {
      const r = compute({ ...base, [fieldId]: value })
      throw new Error(`expected a CalcError, got primary.value = ${String(r.primary.value)}`)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
  })

  /*
   * A local copy of `src/calculators/field-bounds.test.ts` for this calculator
   * alone — it is not in the registry barrel yet, so that suite does not reach
   * it, and this is the file that has to carry the check until it is. Every end
   * of every slider, in both unit systems, with the other fields converted the
   * way the form converts them, must be a value compute accepts.
   */
  describe('declared bounds are values compute accepts', () => {
    // Widened first: `as const` pins each entry to its own literal type, and a
    // `f is NumberField` predicate is not assignable to that union.
    const numberFields = (fields as readonly Field[]).filter(
      (f): f is NumberField => f.kind === 'number',
    )

    const stateFor = (caseKey: string) => {
      const values: Record<string, unknown> = { ...defaults, units: caseKey }
      for (const field of numberFields) {
        if (field.variants?.on !== 'units') continue
        const cases = field.variants.cases
        const baseCase = cases[Object.keys(cases)[0]!]!
        values[field.id] = convertBetween(field.default, baseCase, cases[caseKey]!)
      }
      return values
    }

    const cases = numberFields.flatMap((field) => {
      const states = field.variants
        ? Object.keys(field.variants.cases).map((k) => ({ suffix: `:units=${k}`, values: stateFor(k) }))
        : [{ suffix: '', values: { ...defaults } as Record<string, unknown> }]
      return states.flatMap((state) => {
        const active = resolveBounds(field, state.values)
        return (['min', 'max'] as const).flatMap((bound) => {
          const value = active[bound]
          return value === undefined
            ? []
            : [{ key: `${field.id}${state.suffix}:${bound}`, fieldId: field.id, value, state: state.values }]
        })
      })
    })

    test('there is something to check in both unit systems', () => {
      expect(cases.length).toBeGreaterThan(20)
      expect(cases.some((c) => c.key.includes('units=imperial'))).toBe(true)
    })

    test.each(cases.map((c) => [c.key, c] as const))('%s is accepted', (_key, { fieldId, value, state }) => {
      const r = compute({ ...state, [fieldId]: value } as Input)
      expect(Number.isFinite(Number(r.primary.value))).toBe(true)
      expect(Number(r.primary.value)).toBeGreaterThan(0)
    })

    test('every default sits inside its own base variant, and variants inside the union', () => {
      for (const field of numberFields) {
        expect(field.default).toBeGreaterThanOrEqual(field.min!)
        expect(field.default).toBeLessThanOrEqual(field.max!)
        if (!field.variants) continue
        const keys = Object.keys(field.variants.cases)
        const baseCase = field.variants.cases[keys[0]!]!
        // The first case listed is the base; its factor is 1 and omitted.
        expect(baseCase.factor ?? 1).toBe(1)
        expect(field.default).toBeGreaterThanOrEqual(baseCase.min!)
        expect(field.default).toBeLessThanOrEqual(baseCase.max!)
        for (const variant of Object.values(field.variants.cases)) {
          expect(variant.min!).toBeGreaterThanOrEqual(field.min!)
          expect(variant.max!).toBeLessThanOrEqual(field.max!)
        }
      }
    })

    /*
     * An HTML range snaps to `min + n × step`, so a default off that grid shifts
     * the moment the control is touched. Converting variants are exempt by
     * nature — 3 mm is 0.118 in and no step lands that on a grid — so only the
     * base and the non-converting cases are checkable.
     */
    test('every number default lands on min + n × step', () => {
      const onGrid = (min: number | undefined, stepSize: number | undefined, value: number) => {
        if (min === undefined || stepSize === undefined || stepSize <= 0) return true
        const n = (value - min) / stepSize
        return Math.abs(n - Math.round(n)) < 1e-9
      }
      for (const field of numberFields) {
        expect(onGrid(field.min, field.step, field.default), `${field.id} base`).toBe(true)
        for (const [name, variant] of Object.entries(field.variants?.cases ?? {})) {
          if ((variant.factor ?? 1) !== 1 || variant.convert) continue
          expect(
            onGrid(variant.min ?? field.min, variant.step ?? field.step, field.default),
            `${field.id}[${name}]`,
          ).toBe(true)
        }
      }
    })
  })

  describe('copy and definition', () => {
    test('the meta description fits a search result', () => {
      expect(def.description.length).toBeGreaterThan(50)
      expect(def.description.length).toBeLessThanOrEqual(160)
      expect(def.seoTitle.length).toBeLessThanOrEqual(70)
      expect(def.intro.length).toBeGreaterThan(40)
    })

    test('there are at least three real FAQs', () => {
      expect(def.faqs.length).toBeGreaterThanOrEqual(3)
      for (const faq of def.faqs) {
        expect(faq.q.endsWith('?')).toBe(true)
        expect(faq.a.length).toBeGreaterThan(40)
      }
    })

    test('scale bands are ordered, contiguous, and span the scale', () => {
      const { bands, min, max } = def.scale
      expect(min).toBeLessThan(max)
      bands.forEach((band, i) => {
        expect(band.from).toBeLessThan(band.to)
        if (i > 0) expect(band.from).toBe(bands[i - 1]!.to)
      })
      expect(bands[0]!.from).toBe(min)
      expect(bands[bands.length - 1]!.to).toBe(max)
    })

    test('related slugs point elsewhere and are unique', () => {
      expect(def.related.length).toBeGreaterThanOrEqual(2)
      for (const slug of def.related) expect(slug).not.toBe(def.slug)
      expect(new Set(def.related).size).toBe(def.related.length)
    })

    test('field ids are unique, camelCase, and safe as selectors', () => {
      const ids = fields.map((f) => f.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const id of ids) expect(id).toMatch(/^[a-z][a-zA-Z0-9]*$/)
    })

    test('the definition carries no colour, class name or markup', () => {
      const serialized = JSON.stringify(def, (_k, v) => (typeof v === 'function' ? undefined : v))
      expect(serialized).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(serialized).not.toMatch(/\b(bg|text|border|rounded|shadow)-[a-z]+-\d{2,3}\b/)
      expect(serialized).not.toMatch(/<\/?[a-z][\s\S]*>/i)
    })
  })
})

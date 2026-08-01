import { describe, expect, test } from 'vitest'
import type { Series } from '../../lib/types'
import { chartScale, compactTick, projector, xTickValues, yTickValues } from './axis'

/**
 * The axis is drawn twice — once by TimeChart.astro at build time, once by
 * studio.ts on every recompute — and the two must agree. These lock the maths
 * both passes share, including the two properties that decide which parts of
 * the axis the script has to redraw at all.
 */

const GEO = { W: 720, H: 260, PAD: { top: 16, right: 16, bottom: 28, left: 56 } }
const series = (points: Array<[number, number]>, label = 's'): Series => ({ label, points })

describe('chartScale', () => {
  test('spans every point of every series', () => {
    const scale = chartScale([
      series([
        [0, 10],
        [5, 90],
      ]),
      series([
        [0, 20],
        [5, 40],
      ]),
    ])
    expect(scale.xMin).toBe(0)
    expect(scale.xMax).toBe(5)
    // Headroom above the peak, so the line never touches the top edge.
    expect(scale.yMax).toBeCloseTo(90 * 1.05, 6)
    // Baselined at zero: a series from 100k to 110k must read as a gentle climb,
    // not a cliff, so the floor does NOT track the minimum when it is positive.
    expect(scale.yMin).toBe(0)
  })

  /*
   * The bug this floor exists to fix. A zero floor projected every negative
   * point below the plot, where it silently vanished — live on refinance
   * (6 of 41 points), npv (14 of 82) and mortgage-points (7 of 41).
   */
  test('a series that goes negative drops the floor to fit it', () => {
    const scale = chartScale([
      series([
        [0, -4000],
        [1, 8000],
      ]),
    ])
    expect(scale.yMin).toBeCloseTo(-4000 * 1.05, 6)
    expect(scale.yMin).toBeLessThan(-4000)
  })

  test('every point of a negative series lands inside the plot', () => {
    const s = series([
      [0, -1],
      [1, 0],
      [2, 1],
    ])
    const { y } = projector(GEO, chartScale([s]))
    const top = GEO.PAD.top
    const bottom = GEO.H - GEO.PAD.bottom
    for (const [, value] of s.points) {
      expect(y(value)).toBeGreaterThanOrEqual(top)
      expect(y(value)).toBeLessThanOrEqual(bottom)
    }
  })

  test('an all-zero series still yields a usable scale', () => {
    // Without the guard every y would divide by zero and the path would be NaN.
    const scale = chartScale([
      series([
        [0, 0],
        [3, 0],
      ]),
    ])
    expect(scale.yMax).toBe(1)
    expect(Number.isFinite(scale.yMax)).toBe(true)
  })
})

describe('projector', () => {
  test('maps the data range onto the plot area', () => {
    const scale = { xMin: 0, xMax: 10, yMin: 0, yMax: 100 }
    const { x, y } = projector(GEO, scale)
    expect(x(0)).toBeCloseTo(GEO.PAD.left, 6)
    expect(x(10)).toBeCloseTo(GEO.W - GEO.PAD.right, 6)
    expect(y(0)).toBeCloseTo(GEO.H - GEO.PAD.bottom, 6)
    expect(y(100)).toBeCloseTo(GEO.PAD.top, 6)
  })

  // The floor change must be inert for every chart that was already correct,
  // which is most of them — a zero yMin has to reduce to the old `y / yMax`.
  test('a zero floor projects exactly as it did before', () => {
    const { y } = projector(GEO, { xMin: 0, xMax: 1, yMin: 0, yMax: 250 })
    const plot = GEO.H - GEO.PAD.top - GEO.PAD.bottom
    for (const v of [0, 1, 62.5, 125, 249, 250]) {
      expect(y(v)).toBeCloseTo(GEO.H - GEO.PAD.bottom - (v / 250) * plot, 9)
    }
  })

  test('a single-point span does not divide by zero', () => {
    const { x } = projector(GEO, { xMin: 4, xMax: 4, yMin: 0, yMax: 1 })
    expect(Number.isFinite(x(4))).toBe(true)
  })

  test('a flat series does not divide by zero either', () => {
    const { y } = projector(GEO, { xMin: 0, xMax: 1, yMin: 5, yMax: 5 })
    expect(Number.isFinite(y(5))).toBe(true)
  })
})

describe('yTickValues', () => {
  test('runs from the floor to the top of the axis', () => {
    const ticks = yTickValues(0, 200)
    expect(ticks).toHaveLength(5)
    expect(ticks[0]).toBe(0)
    expect(ticks[ticks.length - 1]).toBeCloseTo(200, 6)
  })

  test('a negative floor gets labelled, not hidden', () => {
    const ticks = yTickValues(-100, 100)
    expect(ticks).toHaveLength(5)
    expect(ticks[0]).toBeCloseTo(-100, 6)
    expect(ticks[2]).toBeCloseTo(0, 6)
    expect(ticks[4]).toBeCloseTo(100, 6)
  })

  /*
   * THE reason studio.ts redraws the y LABELS but leaves the gridlines alone.
   * A tick's y is a fixed fraction of the plot height because the yMax inside
   * the tick value cancels against the yMax inside the projection. Should the
   * ticks ever become non-linear — a log axis, "nice" rounded values — that
   * cancellation stops holding and the gridlines would need redrawing too.
   * This test is what would catch that.
   */
  test('gridline positions do not depend on the scale', () => {
    const at = (yMin: number, yMax: number) => {
      const { y } = projector(GEO, { xMin: 0, xMax: 1, yMin, yMax })
      return yTickValues(yMin, yMax).map((t) => Number(y(t).toFixed(9)))
    }
    expect(at(0, 1)).toEqual(at(0, 1_000))
    expect(at(0, 1_000)).toEqual(at(0, 987_654_321))
    // Still true with a floor below zero: the tick and the projection subtract
    // the same yMin, so it cancels exactly as yMax always did.
    expect(at(-500, 500)).toEqual(at(0, 1_000))
    expect(at(-1.05, 1.05)).toEqual(at(0, 200))
  })
})

describe('xTickValues', () => {
  test('spans the axis end to end', () => {
    const ticks = xTickValues(0, 30)
    expect(ticks[0]).toBe(0)
    expect(ticks[ticks.length - 1]).toBeCloseTo(30, 6)
  })

  /*
   * THE reason studio.ts reconciles the x labels against a template rather than
   * updating a fixed set by index: the count is a function of the input. A
   * horizon that shrinks leaves surplus labels behind; one that grows silently
   * drops the extras — the same failure the donut had.
   */
  test('the count varies with the span, and is capped at six', () => {
    expect(xTickValues(0, 0)).toHaveLength(1)
    expect(xTickValues(0, 1)).toHaveLength(2)
    expect(xTickValues(0, 3)).toHaveLength(4)
    expect(xTickValues(0, 30)).toHaveLength(6)
    expect(xTickValues(0, 100)).toHaveLength(6)
  })

  test('never produces an empty axis', () => {
    for (const [lo, hi] of [
      [0, 0],
      [5, 5],
      [0, 0.5],
    ] as const) {
      expect(xTickValues(lo, hi).length).toBeGreaterThan(0)
      expect(xTickValues(lo, hi).every(Number.isFinite)).toBe(true)
    }
  })
})

describe('compactTick', () => {
  test('shortens what a glance cannot parse', () => {
    expect(compactTick(0)).toBe('0')
    expect(compactTick(950)).toBe('950')
    expect(compactTick(1_200)).toBe('1.2k')
    expect(compactTick(19_000)).toBe('19k')
    expect(compactTick(1_200_000)).toBe('1.2M')
  })

  test('scales that differ by orders of magnitude produce different labels', () => {
    // The bug this whole module exists to prevent: a 100-year projection drawn
    // against a 20-year axis, where both axes happened to read the same.
    const labels = (peak: number) => {
      const s = chartScale([series([[0, peak]])])
      return yTickValues(s.yMin, s.yMax).map((t) => compactTick(t, s.yMax - s.yMin))
    }
    expect(labels(19_000)).not.toEqual(labels(192_000))
  })

  /*
   * A sine wave spans −1 to 1. At zero decimals every tick rounds to 0 or 1 and
   * the axis reads `0 0 1 1 1` — five labels claiming two values, next to a
   * curve that visibly has more. Precision has to follow the range.
   */
  test('a narrow range gets decimals instead of collapsing to 0 and 1', () => {
    const s = chartScale([
      series([
        [0, -1],
        [1, 1],
      ]),
    ])
    const labels = yTickValues(s.yMin, s.yMax).map((t) => compactTick(t, s.yMax - s.yMin))
    expect(new Set(labels).size).toBe(labels.length)
    expect(labels.some((l) => l.includes('.'))).toBe(true)
    expect(labels.some((l) => l.startsWith('-'))).toBe(true)
  })

  test('a wide range still reads as whole numbers', () => {
    expect(compactTick(4.7, 200)).toBe('5')
    expect(compactTick(0, 200)).toBe('0')
  })
})

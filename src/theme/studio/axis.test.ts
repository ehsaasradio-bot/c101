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
    const scale = { xMin: 0, xMax: 10, yMax: 100 }
    const { x, y } = projector(GEO, scale)
    expect(x(0)).toBeCloseTo(GEO.PAD.left, 6)
    expect(x(10)).toBeCloseTo(GEO.W - GEO.PAD.right, 6)
    expect(y(0)).toBeCloseTo(GEO.H - GEO.PAD.bottom, 6)
    expect(y(100)).toBeCloseTo(GEO.PAD.top, 6)
  })

  test('a single-point span does not divide by zero', () => {
    const { x } = projector(GEO, { xMin: 4, xMax: 4, yMax: 1 })
    expect(Number.isFinite(x(4))).toBe(true)
  })
})

describe('yTickValues', () => {
  test('runs from zero to the top of the axis', () => {
    const ticks = yTickValues(200)
    expect(ticks).toHaveLength(5)
    expect(ticks[0]).toBe(0)
    expect(ticks[ticks.length - 1]).toBeCloseTo(200, 6)
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
    const at = (yMax: number) => {
      const { y } = projector(GEO, { xMin: 0, xMax: 1, yMax })
      return yTickValues(yMax).map((t) => Number(y(t).toFixed(9)))
    }
    expect(at(1)).toEqual(at(1_000))
    expect(at(1_000)).toEqual(at(987_654_321))
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
    const short = yTickValues(chartScale([series([[0, 19_000]])]).yMax).map(compactTick)
    const long = yTickValues(chartScale([series([[0, 192_000]])]).yMax).map(compactTick)
    expect(short).not.toEqual(long)
  })
})

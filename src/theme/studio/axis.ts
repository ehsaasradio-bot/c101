import type { Series } from '../../lib/types'
import { formatValue } from '../../lib/format'

/**
 * Chart axis maths, shared by TimeChart.astro (build-time render) and studio.ts
 * (every recompute in the browser).
 *
 * One module for exactly the reason range.ts is one module: the axis the server
 * draws and the axis the script rewrites have to be the same axis. When they
 * were computed separately the curve rescaled and the numbers beside it did
 * not, so a hundred-year projection was drawn against a twenty-year axis —
 * which is worse than no axis, because it reads as precision.
 */

const Y_TICKS = 5
const X_TICKS_MAX = 6

export interface Geometry {
  W: number
  H: number
  PAD: { top: number; right: number; bottom: number; left: number }
}

export interface Scale {
  xMin: number
  xMax: number
  yMax: number
}

export function chartScale(series: ReadonlyArray<Series>): Scale {
  const xs = series.flatMap((s) => s.points.map((p) => p[0]))
  const ys = series.flatMap((s) => s.points.map((p) => p[1]))
  return {
    xMin: Math.min(...xs),
    xMax: Math.max(...xs),
    // Headroom above the peak so the line never touches the top edge. The `|| 1`
    // catches an all-zero series, which would otherwise divide every y by zero.
    yMax: Math.max(...ys) * 1.05 || 1,
  }
}

/** Data space → SVG space. Both sides project through this, so both agree. */
export function projector(geo: Geometry, scale: Scale) {
  const { W, H, PAD } = geo
  const span = scale.xMax - scale.xMin || 1
  return {
    x: (x: number) => PAD.left + ((x - scale.xMin) / span) * (W - PAD.left - PAD.right),
    y: (y: number) => H - PAD.bottom - (y / scale.yMax) * (H - PAD.top - PAD.bottom),
  }
}

/**
 * Five values from zero to the top of the axis.
 *
 * The count is fixed, and so are the gridline positions: a tick's y is a fixed
 * fraction of the plot height, because the yMax inside the tick value cancels
 * against the yMax inside the projection. Only the labels ever change.
 */
export function yTickValues(yMax: number): number[] {
  return Array.from({ length: Y_TICKS }, (_, i) => (yMax / (Y_TICKS - 1)) * i)
}

/**
 * At most six, but never more than there are whole x values to label — a
 * three-year horizon gets four ticks rather than six crowded onto the same
 * points. So this COUNT depends on input, which is why studio.ts reconciles the
 * labels against a template instead of updating a fixed set by index.
 */
export function xTickValues(xMin: number, xMax: number): number[] {
  const count = Math.max(1, Math.floor(Math.min(X_TICKS_MAX, xMax - xMin + 1)))
  return Array.from(
    { length: count },
    (_, i) => xMin + ((xMax - xMin) * i) / (count - 1 || 1),
  )
}

/** Axis labels are read at a glance, so 1.2M beats 1,200,000. */
export function compactTick(v: number): string {
  return Math.abs(v) >= 1_000_000
    ? `${Math.round(v / 100_000) / 10}M`
    : Math.abs(v) >= 1000
      ? `${Math.round(v / 100) / 10}k`
      : formatValue(v, { style: 'decimal', decimals: 0 })
}

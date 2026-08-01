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
  /** Zero for data that never goes below it; the floor of the data when it does. */
  yMin: number
  yMax: number
}

export function chartScale(series: ReadonlyArray<Series>): Scale {
  const xs = series.flatMap((s) => s.points.map((p) => p[0]))
  const ys = series.flatMap((s) => s.points.map((p) => p[1]))
  const low = Math.min(...ys)
  return {
    xMin: Math.min(...xs),
    xMax: Math.max(...xs),
    /*
     * The floor is zero for data that never goes below it, and only drops when
     * the data actually does.
     *
     * Both halves matter. Baselining at zero is why a balance running from
     * 100k to 110k reads as a gentle climb rather than a cliff — anchoring to
     * the minimum instead would exaggerate every flat series on the site. But
     * a floor of zero also silently swallowed anything negative: an amortised
     * refinance saving, a discounted cash flow, the underwater half of a
     * sine wave. Those points projected below the plot and simply vanished.
     */
    yMin: Math.min(0, low * 1.05),
    // Headroom above the peak so the line never touches the top edge. The `|| 1`
    // catches an all-zero series, which would otherwise divide every y by zero.
    yMax: Math.max(...ys) * 1.05 || 1,
  }
}

/** Data space → SVG space. Both sides project through this, so both agree. */
export function projector(geo: Geometry, scale: Scale) {
  const { W, H, PAD } = geo
  const span = scale.xMax - scale.xMin || 1
  // Reduces to the old `y / yMax` whenever yMin is zero, which is every series
  // that never goes negative — so this changes nothing for the charts that
  // were already correct.
  const height = scale.yMax - scale.yMin || 1
  return {
    x: (x: number) => PAD.left + ((x - scale.xMin) / span) * (W - PAD.left - PAD.right),
    y: (y: number) =>
      H - PAD.bottom - ((y - scale.yMin) / height) * (H - PAD.top - PAD.bottom),
  }
}

/**
 * Five values spanning the axis, floor to ceiling.
 *
 * The count is fixed, and so are the gridline positions: a tick sits at a fixed
 * fraction of the range, and the projection divides by that same range, so the
 * two cancel. That is why studio.ts rewrites the labels but leaves the
 * gridlines alone — and it stays true with a non-zero floor, because both the
 * tick and the projection subtract the same yMin.
 */
export function yTickValues(yMin: number, yMax: number): number[] {
  return Array.from({ length: Y_TICKS }, (_, i) => yMin + ((yMax - yMin) / (Y_TICKS - 1)) * i)
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

/**
 * Axis labels are read at a glance, so 1.2M beats 1,200,000.
 *
 * `span` is the full height of the axis, and it decides the precision: whole
 * numbers are right for a balance running to 200k, and useless for a sine wave
 * running −1 to 1, where every tick would round to 0 or 1 and the axis would
 * read `0 0 1 1 1`. Omitted, it behaves as it always did.
 */
export function compactTick(v: number, span = Number.POSITIVE_INFINITY): string {
  if (Math.abs(v) >= 1_000_000) return `${Math.round(v / 100_000) / 10}M`
  if (Math.abs(v) >= 1000) return `${Math.round(v / 100) / 10}k`
  const decimals = span >= 10 ? 0 : span >= 1 ? 1 : span >= 0.1 ? 2 : 3
  return formatValue(v, { style: 'decimal', decimals })
}

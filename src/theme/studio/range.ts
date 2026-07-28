/**
 * Slider range maths, shared by FieldGroup.astro (build-time render) and
 * studio.ts (unit switching in the browser). One module so the server-rendered
 * ticks and the ones rewritten after a unit change can never disagree.
 */

/** Round up to the next 1, 2 or 5 × 10ⁿ, so tick labels read as human numbers. */
export function niceCeil(n: number): number {
  if (n <= 0) return 0
  const mag = Math.pow(10, Math.floor(Math.log10(n)))
  const norm = n / mag
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag
}

/**
 * Validation bounds are not useful slider bounds, at EITHER end. Starting
 * balance accepts up to 100M, which would pin a $10,000 thumb to the far left;
 * GCD accepts down to -1e9, which pins it to the far right. The slider spans a
 * realistic band around the default; the number input still takes the full
 * validated range.
 */
export function softRange(min: number, max: number, def: number) {
  const span = niceCeil(Math.max(Math.abs(def) * 4, 1))
  const softMax = Math.min(max, Math.max(span, min + 1))
  // Only pull the lower bound up when the field actually reaches far negative.
  const softMin = Math.max(min, Math.min(0, -span))
  return {
    min: softMin,
    max: softMax,
    cappedMax: softMax < max,
    cappedMin: softMin > min,
  }
}

const TICK_COUNT = 5

/** Evenly spaced tick labels across a slider, in the field's own units. */
export function tickLabels(min: number, max: number, unit?: string): string[] {
  return Array.from({ length: TICK_COUNT }, (_, i) => {
    const v = min + ((max - min) * i) / (TICK_COUNT - 1)
    const compact =
      Math.abs(v) >= 1_000_000
        ? `${Math.round(v / 100_000) / 10}M`
        : Math.abs(v) >= 1000
          ? `${Math.round(v / 100) / 10}k`
          : String(Math.round(v * 10) / 10)
    return unit === '%' ? `${compact}%` : compact
  })
}

/** The decorated tick text, including the `<` / `+` markers for a capped end. */
export function decoratedTicks(
  min: number,
  max: number,
  unit: string | undefined,
  cappedMin: boolean,
  cappedMax: boolean,
): string[] {
  const labels = tickLabels(min, max, unit)
  return labels.map((t, i) => {
    if (cappedMin && i === 0) return `<${t}`
    if (cappedMax && i === labels.length - 1) return `${t}+`
    return t
  })
}

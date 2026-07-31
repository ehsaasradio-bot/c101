import type {
  BandId,
  CalcResult,
  CalculatorDef,
  CalculatorView,
  Field,
  ResultView,
  Scale,
  StepRule,
  UnitConversion,
  UnitVariant,
} from './types'
import { formatQuantity, formatValue } from './format'
import { categoryById } from './categories'

/** Today as YYYY-MM-DD, for `default: 'today'` date fields. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function defaultValues(def: Pick<CalculatorDef, 'fields'>): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const field of def.fields) {
    values[field.id] = field.kind === 'date' && field.default === 'today' ? todayIso() : field.default
  }
  return values
}

/**
 * Coerces raw DOM string values into the types `compute` expects. The island
 * reads everything as strings; compute functions must never have to care.
 */
export function coerceValues(
  fields: readonly Field[],
  raw: Record<string, string | boolean>,
): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const field of fields) {
    const value = raw[field.id]
    if (value === undefined) {
      values[field.id] = field.kind === 'date' && field.default === 'today' ? todayIso() : field.default
      continue
    }
    if (field.kind === 'number') {
      const n = typeof value === 'string' ? Number(value.replace(/[,\s]/g, '')) : Number(value)
      values[field.id] = Number.isFinite(n) ? n : Number.NaN
    } else if (field.kind === 'toggle') {
      values[field.id] = value === true || value === 'true'
    } else {
      values[field.id] = String(value)
    }
  }
  return values
}

const isRule = (step: unknown): step is StepRule =>
  typeof step === 'object' && step !== null && 'rule' in step

export function resolveBand(scale: Scale, value: number): { id: BandId; label: string } | undefined {
  return (
    scale.bands.find((b) => value >= b.from && value < b.to) ?? scale.bands[scale.bands.length - 1]
  )
}

/** Pointer position along the scale, 0–100. */
export function scalePercent(scale: Scale, value: number): number {
  const visualMax = scale.clampMax ?? scale.max
  const clamped = Math.min(Math.max(value, scale.min), visualMax)
  const span = visualMax - scale.min
  return span === 0 ? 0 : ((clamped - scale.min) / span) * 100
}

export function toResultView(result: CalcResult, scale?: Scale): ResultView {
  const band =
    scale && result.scaleValue !== undefined ? resolveBand(scale, result.scaleValue) : undefined

  const parts = result.parts ?? []
  // Negatives are clamped so one component cannot invert a proportion.
  const partsTotal = parts.reduce((sum, p) => sum + Math.max(0, p.value), 0)

  return {
    primary: formatQuantity(result.primary),
    stats: (result.stats ?? []).map(formatQuantity),
    steps: (result.steps ?? []).map((step) => (isRule(step) ? step : formatQuantity(step))),
    notes: result.notes ?? [],
    scaleValue: result.scaleValue,
    band: band?.id,
    bandLabel: band?.label,
    scalePercent:
      scale && result.scaleValue !== undefined ? scalePercent(scale, result.scaleValue) : undefined,
    parts: parts.map((part) => ({
      ...part,
      text: formatValue(part.value, part.format ?? { style: 'decimal', decimals: 0 }),
      // Precomputed, so drawing a proportion never requires arithmetic in a theme.
      percent: partsTotal > 0 ? (Math.max(0, part.value) / partsTotal) * 100 : 0,
    })),
    // Falls back to the primary, which is correct whenever the parts decompose
    // the headline itself.
    partsTotal: formatQuantity(result.partsTotal ?? result.primary),
    series: result.series ?? [],
  }
}

export interface ResolvedBounds {
  min?: number
  max?: number
  step?: number
  unit?: string
  factor: number
}

/**
 * The bounds a number field has right now, given what its controlling select
 * currently holds. Falls back to the field's own widest bounds when it declares
 * no variants, or when the controlling value is one it does not know about.
 *
 * Shared deliberately: the theme draws sliders from this and the field-bounds
 * test validates against it, so the control can never offer a range the
 * calculator would reject.
 */
export function resolveBounds(field: Field, values: Record<string, unknown>): ResolvedBounds {
  if (field.kind !== 'number') return { factor: 1 }

  const base = { min: field.min, max: field.max, step: field.step, unit: field.unit, factor: 1 }
  if (!field.variants) return base

  const selected = String(values[field.variants.on] ?? '')
  const variant = field.variants.cases[selected]
  if (!variant) return base

  return {
    min: variant.min ?? field.min,
    max: variant.max ?? field.max,
    step: variant.step ?? field.step,
    unit: variant.unit ?? field.unit,
    factor: variant.factor ?? 1,
  }
}

/**
 * The option values a select currently offers, given what its controlling field
 * holds. Returns every option when it declares no variants.
 */
export function allowedOptions(field: Field, values: Record<string, unknown>): ReadonlyArray<string> {
  if (field.kind !== 'select') return []
  const all = field.options.map((o) => o.value)
  if (!field.variants) return all

  const selected = String(values[field.variants.on] ?? '')
  const variant = field.variants.cases[selected]
  if (!variant) return all
  // Preserve the declared option order rather than the case's.
  return all.filter((value) => variant.options.includes(value))
}

/**
 * Settles every dependent select onto a choice that is valid for whatever its
 * controller currently holds — the state the form actually reaches after a
 * visitor switches category. Probing anything else tests a combination the UI
 * cannot produce.
 *
 * Iterates because dependencies chain: changing the category moves the unit,
 * which in turn can invalidate something downstream of the unit.
 */
export function withDependentSelects(
  fields: readonly Field[],
  values: Record<string, unknown>,
  pinned: ReadonlySet<string> = new Set(),
): Record<string, unknown> {
  const next = { ...values }
  // Small fixed cap: the chains are shallow, and this must never spin.
  for (let pass = 0; pass < 5; pass += 1) {
    let changed = false
    for (const field of fields) {
      if (field.kind !== 'select' || !field.variants || pinned.has(field.id)) continue
      const variant = field.variants.cases[String(next[field.variants.on] ?? '')]
      if (!variant) continue
      if (!variant.options.includes(String(next[field.id] ?? ''))) {
        next[field.id] = variant.default ?? variant.options[0]
        changed = true
      }
    }
    if (!changed) break
  }
  return next
}

/** Normalises the `factor` shorthand into a full conversion spec. */
function conversionOf(variant: UnitVariant | undefined): UnitConversion | undefined {
  if (!variant) return undefined
  if (variant.convert) return variant.convert
  if (variant.factor !== undefined) return { kind: 'linear', factor: variant.factor }
  return undefined
}

const toBase = (value: number, c: UnitConversion | undefined): number => {
  if (!c) return value
  if (c.kind === 'linear') return c.factor === 0 ? value : value / c.factor
  if (c.kind === 'reciprocal') return value === 0 ? value : c.constant / value
  return c.factor === 0 ? value : (value - c.offset) / c.factor
}

const fromBase = (base: number, c: UnitConversion | undefined): number => {
  if (!c) return base
  if (c.kind === 'linear') return base * c.factor
  if (c.kind === 'reciprocal') return base === 0 ? base : c.constant / base
  return base * c.factor + c.offset
}

/**
 * Restates a value measured in one variant as the same quantity in another,
 * routed through the base variant so any pair converts correctly.
 *
 * Returns the value untouched when either side declares no conversion — the
 * deliberate behaviour for converter inputs, where switching the "from" unit
 * means the visitor is entering a different amount rather than the same one.
 */
export function convertBetween(
  value: number,
  from: UnitVariant | undefined,
  to: UnitVariant | undefined,
): number {
  const fromConv = conversionOf(from)
  const toConv = conversionOf(to)
  if (!fromConv && !toConv) return value
  if (!Number.isFinite(value)) return value
  return fromBase(toBase(value, fromConv), toConv)
}

export const calculatorHref = (slug: string): string => `/calculators/${slug}/`

/**
 * Strips `compute` and resolves related slugs to real titles. This is the only
 * shape that crosses into the browser — a CalculatorDef never does, because a
 * function cannot survive serialization.
 */
export function toCalculatorView(
  def: CalculatorDef,
  bySlug: ReadonlyMap<string, CalculatorDef>,
): CalculatorView {
  const { compute: _compute, ...rest } = def
  return {
    ...rest,
    fields: def.fields,
    categoryName: categoryById.get(def.category)?.name ?? def.category,
    href: calculatorHref(def.slug),
    relatedLinks: def.related.flatMap((slug) => {
      const target = bySlug.get(slug)
      return target ? [{ slug, title: target.title, href: calculatorHref(slug) }] : []
    }),
  }
}

/**
 * Points for the hero illustration, drawn from the calculator's own numbers.
 *
 * This used to be one hardcoded bezier in the studio theme — byte-identical on
 * all 79 pages, under a comment claiming it rendered the calculator's series.
 * Two sources of truth now, in order:
 *
 *  1. A real series, where the calculator has one.
 *  2. Otherwise, sweep the first number field across its slider and plot the
 *     headline against it. Still the calculator's own arithmetic, and it answers
 *     a question worth asking: how does the answer move with the input you are
 *     most likely to change?
 *
 * A calculator whose headline is not a number — prime's "No, 360 is composite",
 * a spelled-out date — gets `null` rather than a fake curve.
 *
 * It lives here, not in the theme, because a theme is handed a `CalculatorView`
 * with no `compute` on it: functions do not survive props serialization, which
 * is the same reason `[slug].astro` builds the scenario presets.
 */
export interface HeroCurve {
  points: ReadonlyArray<readonly [number, number]>
  /** What the curve actually shows, for the illustration's accessible label. */
  label: string
}

export function heroCurve(calc: CalculatorDef, view: ResultView): HeroCurve | null {
  const series = view.series[0]
  if (series && series.points.length >= 2) return { points: series.points, label: series.label }

  // Cheap gate: a headline that is not numeric at the defaults will not become
  // numeric across the sweep, so do not pay for 24 computes to discover that.
  if (!Number.isFinite(Number(view.primary.value))) return null

  const values = defaultValues(calc)

  /** Sweep one field across its slider, dropping values compute refuses. */
  const sweep = (field: Extract<Field, { kind: 'number' }>) => {
    const { min, max } = resolveBounds(field, values)
    if (min === undefined || max === undefined || !(max > min)) return null
    const points: Array<readonly [number, number]> = []
    const SAMPLES = 24
    for (let i = 0; i < SAMPLES; i++) {
      const x = min + ((max - min) * i) / (SAMPLES - 1)
      try {
        const y = Number(calc.compute({ ...values, [field.id]: x } as never).primary.value)
        if (Number.isFinite(y)) points.push([x, y])
      } catch {
        // A refused value is not a data point; the sweep simply skips it.
      }
    }
    return points.length >= 2 ? points : null
  }

  /**
   * How far the curve departs from the straight line joining its ends, after
   * normalising both axes to 0..1 so the score does not depend on units.
   *
   * This is what picks WHICH field to sweep. Taking the first number field was
   * arbitrary, and for a calculator whose answer is proportional to it — a tip
   * on a bill, an area from a side — it draws a straight line. Truthful, but
   * every such page ends up with the same picture, which is how the hardcoded
   * bezier looked in the first place. The relationship worth illustrating is the
   * one that is NOT a straight line: a mortgage payment against the term, a BMI
   * against height. Selecting for curvature is not selecting for prettiness —
   * it is selecting for the part a reader could not have guessed, and the label
   * names the field so nothing is hidden about what is on screen.
   */
  const curvature = (points: ReadonlyArray<readonly [number, number]>) => {
    const xs = points.map((pt) => pt[0])
    const ys = points.map((pt) => pt[1])
    const x0 = Math.min(...xs)
    const xSpan = Math.max(...xs) - x0 || 1
    const y0 = Math.min(...ys)
    const ySpan = Math.max(...ys) - y0 || 1
    const nx = xs.map((x) => (x - x0) / xSpan)
    const ny = ys.map((y) => (y - y0) / ySpan)
    const first = { x: nx[0]!, y: ny[0]! }
    const last = { x: nx[nx.length - 1]!, y: ny[ny.length - 1]! }
    const dx = last.x - first.x || 1
    return Math.max(
      ...nx.map((x, i) => Math.abs(ny[i]! - (first.y + ((x - first.x) / dx) * (last.y - first.y)))),
    )
  }

  let best: { points: ReadonlyArray<readonly [number, number]>; label: string; score: number } | null =
    null
  for (const field of calc.fields) {
    if (field.kind !== 'number') continue
    const points = sweep(field)
    if (!points) continue
    const score = curvature(points)
    // Strictly greater, so ties keep the earlier field and the choice is stable
    // across builds rather than depending on iteration order.
    if (!best || score > best.score) {
      // The label names the field ACTUALLY swept. Naming the first field while
      // drawing another would be a smaller lie than the hardcoded curve, but a
      // lie in the same direction.
      best = { points, label: `${view.primary.label} across ${field.label}`, score }
    }
  }
  return best ? { points: best.points, label: best.label } : null
}

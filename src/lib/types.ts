/**
 * The contracts every calculator and every theme is written against.
 *
 * THE ORGANIZING RULE: a calculator definition may not contain a color, a class
 * name, a hex code, or a string of HTML. It holds domain facts only. Everything
 * visual resolves in `src/theme/`. If you find yourself wanting to add a `color`
 * or `class` field below, add a semantic token instead (see `BandId`).
 */

// ── Formatting ────────────────────────────────────────────────────────────
// A Quantity carries a raw value plus a spec for how to display it, never a
// pre-formatted string. That is what lets a redesign change currency display or
// decimal precision without editing a single compute function.

export type FormatSpec =
  | { style: 'currency'; currency?: string; decimals?: number }
  | { style: 'percent'; decimals?: number }
  | { style: 'decimal'; decimals?: number; unit?: string }
  | { style: 'duration'; from: 'months' | 'days' | 'minutes' | 'seconds' }
  | { style: 'raw' }

export interface Quantity {
  label: string
  value: number | string
  format: FormatSpec
}

// ── Inputs ────────────────────────────────────────────────────────────────

export interface FieldBase {
  id: string
  label: string
  /** Short hint rendered near the input by the theme. */
  help?: string
}

/**
 * The bounds and display unit that apply while a controlling select holds a
 * particular value. A height field means something different in centimetres
 * than in inches, and a single min/max cannot serve both.
 */
/**
 * How a value in this variant relates to the same quantity in the base variant.
 *
 * Not every unit pair is a multiplication. Fuel economy inverts (8 L/100km is
 * 12.5 km/L), and temperature has an offset. A variant that omits this entirely
 * keeps the typed number as-is when the unit changes, which is what a converter
 * wants: changing the "from" unit means you are entering a different amount,
 * not restating the same one.
 */
export type UnitConversion =
  | { kind: 'linear'; factor: number }
  | { kind: 'reciprocal'; constant: number }
  | { kind: 'affine'; factor: number; offset: number }

export interface UnitVariant {
  min?: number
  max?: number
  step?: number
  /** Display unit for this case, e.g. 'cm' or 'in'. */
  unit?: string
  /**
   * Shorthand for `convert: { kind: 'linear', factor }` — value in this variant
   * ÷ the same quantity in the base variant, where the base is the first case
   * listed. Without it, 178 cm silently becomes 178 in.
   */
  factor?: number
  /** For unit pairs that are not a simple multiplication. Wins over `factor`. */
  convert?: UnitConversion
}

export interface NumberField extends FieldBase {
  kind: 'number'
  default: number
  /** The widest accepted bound across every variant. Variants narrow it. */
  min?: number
  max?: number
  step?: number
  /** Display-only unit, e.g. '$' or 'kg'. Not used in computation. */
  unit?: string
  /**
   * Bounds that depend on another field's value — nearly always a metric /
   * imperial select. The value itself is always in the CURRENTLY selected
   * unit, which is what `compute` reads, so these variants describe the same
   * quantity measured two ways rather than two different quantities.
   */
  variants?: {
    /** Field id of the controlling select. */
    on: string
    /** Keyed by that select's option values. The first entry is the base. */
    cases: Readonly<Record<string, UnitVariant>>
  }
}

export interface SelectField extends FieldBase {
  kind: 'select'
  default: string
  options: ReadonlyArray<{ value: string; label: string }>
  /**
   * Which of `options` are valid, depending on another field's value.
   *
   * Choosing "temperature" in a converter must not leave "kilometre" selected —
   * the form would be offering a combination the calculator rejects. Cases list
   * option VALUES only; the labels come from `options` above, so there is one
   * source of truth for the wording.
   */
  variants?: {
    on: string
    cases: Readonly<Record<string, { options: ReadonlyArray<string>; default?: string }>>
  }
}

export interface ToggleField extends FieldBase {
  kind: 'toggle'
  default: boolean
}

export interface DateField extends FieldBase {
  kind: 'date'
  /** 'today' resolves at render time; otherwise an ISO date string. */
  default: 'today' | string
}

export interface TextField extends FieldBase {
  kind: 'text'
  default: string
  placeholder?: string
}

export type Field = NumberField | SelectField | ToggleField | DateField | TextField

/**
 * Derives the compute-input type from the field list, so `compute` is fully
 * typed with no casts and renaming a field id is a compile error.
 */
export type Values<F extends readonly Field[]> = {
  [K in F[number] as K['id']]: K extends { kind: 'number' }
    ? number
    : K extends { kind: 'toggle' }
      ? boolean
      : string
}

// ── Results ───────────────────────────────────────────────────────────────

/**
 * A semantic band, NOT a color. The theme maps each id to a CSS custom
 * property; the island only ever writes `data-band="good"`.
 */
export type BandId = 'critical' | 'warn' | 'neutral' | 'good' | 'excellent'

export interface Scale {
  min: number
  max: number
  /** Visual cap for the right edge, when the last band is open-ended. */
  clampMax?: number
  unit?: string
  bands: ReadonlyArray<{ id: BandId; label: string; from: number; to: number }>
}

/** A horizontal rule between groups of steps. */
export interface StepRule {
  rule: true
}

/**
 * A component of a whole — "of the final balance, this much is interest".
 * Deliberately just a label and a number: whether it becomes a donut, a stacked
 * bar, or a plain list is the theme's decision, not the calculator's.
 */
export interface Part {
  label: string
  value: number
  format?: FormatSpec
}

/** A named line for charting over time. `points` are [x, y] pairs. */
export interface Series {
  label: string
  points: ReadonlyArray<readonly [number, number]>
  format?: FormatSpec
}

/**
 * What the chart is OF, in the calculator's own words. Domain wording only —
 * no colours, no classes, no markup; the theme still decides how it looks.
 *
 * This belongs on the result rather than on the definition because the axis can
 * change with input: half-life plots the same 0–25 span in seconds, days or
 * years depending on a select, so a label fixed at build time would be wrong the
 * moment someone changed the unit. It is also why studio.ts rewrites this on
 * every recompute, alongside the tick labels.
 */
export interface ChartCopy {
  /** Replaces the caption above the chart. */
  title?: string
  /** Names the x axis, unit and all — "Seconds", "Reps", "Distance (km)". */
  xLabel?: string
}

export interface CalcResult {
  primary: Quantity
  /** Secondary figures, rendered as a grid by the default theme. */
  stats?: ReadonlyArray<Quantity>
  /** Worked steps, rendered as a list. `{ rule: true }` inserts a separator. */
  steps?: ReadonlyArray<Quantity | StepRule>
  /** Position on `def.scale`. Required when the definition declares a scale. */
  scaleValue?: number
  /** Free-text caveats shown under the result. */
  notes?: ReadonlyArray<string>
  /** Components of some whole. Themes may draw these as a proportion. */
  parts?: ReadonlyArray<Part>
  /**
   * The whole that `parts` add up to, when that is NOT the primary figure —
   * a mortgage's parts split the full monthly payment, while the headline is
   * principal and interest alone. Omit it when the parts sum to the primary.
   */
  partsTotal?: Quantity
  /** Values over time. Themes may draw these as lines or stacked bars. */
  series?: ReadonlyArray<Series>
  /**
   * What the chart is of. Omit it and the theme falls back to its financial
   * default — which is correct for a balance over years and wrong for reps,
   * seconds or degrees, so any calculator whose x axis is not time should say
   * so here.
   */
  chart?: ChartCopy
}

/** Thrown by a compute function for invalid input. `fieldId` lets the theme highlight. */
export class CalcError extends Error {
  constructor(
    message: string,
    public fieldId?: string,
  ) {
    super(message)
    this.name = 'CalcError'
  }
}

export type Compute<F extends readonly Field[] = readonly Field[]> = (
  values: Values<F>,
) => CalcResult

// ── Definition ────────────────────────────────────────────────────────────

export type CategoryId = 'financial' | 'health' | 'math' | 'everyday' | 'science' | 'engineering'

export type DisclaimerId = 'financial' | 'health' | 'legal'

export interface CalculatorDef<F extends readonly Field[] = readonly Field[]> {
  /** URL segment, kebab-case. Serves at /calculators/<slug>/ */
  slug: string
  category: CategoryId
  /** The H1. */
  title: string
  /** The <title> tag, which usually differs from the H1 for keyword reasons. */
  seoTitle: string
  /** Meta description. Max 160 characters — enforced by the conformance test. */
  description: string
  /** One-paragraph direct answer, rendered above the tool. */
  intro: string
  fields: F
  resultLabel: string
  compute: Compute<F>
  scale?: Scale
  faqs: ReadonlyArray<{ q: string; a: string }>
  /** Slugs, never hrefs — link text follows the target's own title. */
  related: ReadonlyArray<string>
  /** A token; the theme supplies the wording. */
  disclaimer?: DisclaimerId
  /** ISO date. Feeds sitemap lastmod and JSON-LD dateModified. */
  lastReviewed: string
  /** Sitemap hint, 0–1. */
  priority?: number
}

// ── View models ───────────────────────────────────────────────────────────
// What crosses into the browser: plain data, no functions.

export interface FormattedQuantity {
  label: string
  /** Display-ready text produced by `formatQuantity`. */
  text: string
  /**
   * The raw value and its spec, carried alongside the text purely so a count-up
   * animation can re-run `formatValue` every frame. Tweening the formatted
   * string instead would mangle currency symbols and thousands separators.
   */
  value: number | string
  format: FormatSpec
}

/**
 * The only part of a calculator the island needs at runtime.
 *
 * A full `CalculatorView` satisfies this structurally, but serialising one into
 * every page ships the intro, description, FAQs and related links to the
 * browser for no reason — about 3.4 KB per form, which a page carrying dozens
 * of them cannot afford.
 */
export interface IslandConfig {
  fields: ReadonlyArray<Field>
  scale?: Scale
}

export interface FormattedPart extends Part {
  text: string
  /** Share of the parts total, 0–100. Precomputed so themes need no arithmetic. */
  percent: number
}

export interface ResultView {
  primary: FormattedQuantity
  stats: ReadonlyArray<FormattedQuantity>
  steps: ReadonlyArray<FormattedQuantity | StepRule>
  notes: ReadonlyArray<string>
  scaleValue?: number
  /** Resolved from `scaleValue` against `scale.bands`. */
  band?: BandId
  bandLabel?: string
  /** 0–100, the pointer position along the scale. */
  scalePercent?: number
  parts: ReadonlyArray<FormattedPart>
  /** Resolved: `partsTotal` when given, otherwise the primary. */
  partsTotal: FormattedQuantity
  series: ReadonlyArray<Series>
  /** Resolved chart wording; `{}` when the calculator names none. */
  chart: ChartCopy
}

/** The serializable half of a CalculatorDef — everything except `compute`. */
export type CalculatorView = Omit<CalculatorDef, 'compute' | 'fields'> & {
  fields: ReadonlyArray<Field>
  relatedLinks: ReadonlyArray<{ slug: string; title: string; href: string }>
  categoryName: string
  href: string
}

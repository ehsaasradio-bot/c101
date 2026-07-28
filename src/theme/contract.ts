import type { BandId, CalculatorView, Field, ResultView, Scale } from '../lib/types'
import type { Category } from '../lib/categories'

/**
 * The props every theme slot must accept.
 *
 * This is what makes the theme swappable *safely* rather than by convention:
 * each theme's components declare `Props` as one of these interfaces, so a new
 * theme that drops or renames a prop fails `astro check` instead of silently
 * rendering a blank page. Add a slot here before adding it to a theme.
 */

export interface ShellProps {
  title: string
  description: string
  /** Rendered above the main content by themes that show a trail. */
  breadcrumbs?: ReadonlyArray<{ name: string; href: string }>
}

/**
 * A precomputed "what if". Built where `compute` is available, so a theme only
 * ever receives finished values and never a function.
 */
export interface Scenario {
  label: string
  detail: string
  /** The headline this scenario produces, already formatted. */
  primaryText: string
  /** Field values to apply when the visitor picks it. */
  values: Record<string, string>
  current?: boolean
}

export interface CalculatorPageProps {
  calc: CalculatorView
  /** Computed at build time from the calculator's defaults. */
  initial: ResultView
  /** Resolved wording for `calc.disclaimer`, if it has one. */
  disclaimer?: string
  /** Optional. A theme that does not compare scenarios simply ignores it. */
  scenarios?: ReadonlyArray<Scenario>
}

export interface FieldGroupProps {
  fields: ReadonlyArray<Field>
  /** Values used for the build-time render; also the input `value` attributes. */
  values: Record<string, unknown>
}

export interface ResultCardProps {
  result: ResultView
  resultLabel: string
  scale?: Scale
}

export interface MeterProps {
  scale: Scale
  percent?: number
  band?: BandId
  bandLabel?: string
}

export interface StatGridProps {
  stats: ResultView['stats']
}

export interface StepListProps {
  steps: ResultView['steps']
}

export interface NoteListProps {
  notes: ReadonlyArray<string>
}

export interface FaqListProps {
  faqs: ReadonlyArray<{ q: string; a: string }>
}

export interface RelatedGridProps {
  links: ReadonlyArray<{ slug: string; title: string; href: string }>
}

export interface HeroProps {
  /** Small line above the headline, e.g. a count or a promise. */
  eyebrow?: string
  title: string
  subtitle: string
  actions?: ReadonlyArray<{ label: string; href: string; primary?: boolean }>
  /**
   * Real results from real calculators, computed at build time. Using genuine
   * figures rather than lorem keeps the hero honest and doubles as proof the
   * pages render without JavaScript.
   */
  samples?: ReadonlyArray<{ title: string; label: string; value: string; href: string }>
}

export interface CalculatorGridProps {
  items: ReadonlyArray<{ slug: string; title: string; href: string; description: string }>
}

export interface CategoryGridProps {
  categories: ReadonlyArray<Category & { count: number }>
}

export interface BreadcrumbsProps {
  items: ReadonlyArray<{ name: string; href: string }>
}

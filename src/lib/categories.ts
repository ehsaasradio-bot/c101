import type { CategoryId, DisclaimerId } from './types'

export interface Category {
  id: CategoryId
  name: string
  /** Meta description for the category page. Max 160 chars. */
  description: string
  intro: string
  href: string
}

// No `bgClass`, no `color`. The theme decides how a category looks; this file
// only says what a category *is*.
export const categories: readonly Category[] = [
  {
    id: 'financial',
    name: 'Financial',
    description:
      'Free financial calculators for mortgages, loans, compound interest, retirement, and savings. Instant results, no sign-up.',
    intro:
      'Work out what a loan really costs, how fast savings compound, and what you can afford — using the same formulas banks use.',
    href: '/categories/financial',
  },
  {
    id: 'health',
    name: 'Health & Fitness',
    description:
      'Free health calculators for BMI, body fat, calories, TDEE, macros, and heart rate. Instant results, no sign-up.',
    intro:
      'Estimate body composition, energy needs, and training targets with the standard clinical and sports-science formulas.',
    href: '/categories/health',
  },
  {
    id: 'math',
    name: 'Math',
    description:
      'Free math calculators for percentages, fractions, statistics, geometry, and number theory. Instant results, no sign-up.',
    intro:
      'Solve the everyday math that comes up in school, work, and DIY — with every step shown, not just the answer.',
    href: '/categories/math',
  },
  {
    id: 'everyday',
    name: 'Everyday',
    description:
      'Free everyday calculators for tips, dates, ages, unit conversion, fuel costs, and more. Instant results, no sign-up.',
    intro:
      'The small calculations that come up constantly — split a bill, count the days, convert the units.',
    href: '/categories/everyday',
  },
  // Appended last on purpose: position sets the nav order, the grid order, and
  // the `i % 5` hue, and index 4 lands on --c-cat-5, which tokens.css already
  // defines. Moving it would recolour every category above it.
  {
    id: 'science',
    name: 'Science',
    description:
      'Free science calculators for trigonometry, physics, chemistry, and lab measurement. Instant results, no sign-up.',
    intro:
      'The working behind physics and chemistry homework — solve a named law for any variable, and see which formula was used.',
    href: '/categories/science',
  },
  {
    id: 'engineering',
    name: 'Engineering',
    description:
      'Free engineering calculators for section properties, structural geometry, and design checks. Instant results, no sign-up.',
    intro:
      'The geometry and mechanics behind a design — worked from first principles, with every formula written out beside the number it produced.',
    href: '/categories/engineering',
  },
]

export const categoryById = new Map(categories.map((c) => [c.id, c]))

/** Disclaimer wording lives here, keyed by token, so definitions stay copy-free. */
export const disclaimers: Record<DisclaimerId, string> = {
  financial:
    'For informational purposes only. This is not financial advice — confirm major decisions with a licensed advisor.',
  health:
    'For informational purposes only. This is not medical advice — consult a healthcare professional about your health.',
  legal:
    'For informational purposes only. This is not legal or tax advice — consult a qualified professional.',
}

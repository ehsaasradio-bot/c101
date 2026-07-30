import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * `grossSalary` is deliberately first: the end-to-end suite nudges the first
 * number field to 1.1x its default, and 82,500 is an ordinary salary that moves
 * every downstream figure without tripping a guard.
 *
 * The two dollar deductions are quoted PER PAYCHECK because that is how a pay
 * stub states them, and how anyone reading one would type them back in.
 */
export const fields = [
  {
    kind: 'number',
    id: 'grossSalary',
    label: 'Gross annual salary',
    default: 75_000,
    // The slider spans these, so both ends must be values compute accepts. The
    // floor is high enough that the default per-paycheck deductions below still
    // leave something to take home.
    min: 10_000,
    max: 5_000_000,
    step: 500,
    unit: '$',
    help: 'Before any tax or deduction.',
  },
  {
    kind: 'select',
    id: 'payFrequency',
    label: 'Pay frequency',
    default: 'biweekly',
    options: [
      { value: 'weekly', label: 'Weekly (52 a year)' },
      { value: 'biweekly', label: 'Every two weeks (26 a year)' },
      { value: 'semimonthly', label: 'Twice a month (24 a year)' },
      { value: 'monthly', label: 'Monthly (12 a year)' },
    ],
  },
  {
    kind: 'select',
    id: 'filingStatus',
    label: 'Federal filing status',
    default: 'single',
    options: [
      { value: 'single', label: 'Single' },
      { value: 'married', label: 'Married filing jointly' },
      { value: 'head', label: 'Head of household' },
    ],
  },
  {
    kind: 'number',
    id: 'retirementPercent',
    label: 'Traditional 401(k)',
    default: 6,
    min: 0,
    max: 50,
    step: 0.5,
    unit: '% of pay',
    help: 'Pre-tax deferral. Capped at the 2026 annual limit of 24,500 dollars.',
  },
  {
    kind: 'number',
    id: 'healthPremium',
    label: 'Health premium per paycheck',
    default: 150,
    min: 0,
    max: 1_000,
    step: 5,
    unit: '$',
    help: 'Your share of medical, dental and vision, taken before tax.',
  },
  {
    kind: 'number',
    id: 'postTaxDeductions',
    label: 'Post-tax deductions per paycheck',
    default: 25,
    min: 0,
    max: 1_000,
    step: 5,
    unit: '$',
    help: 'Roth contributions, union dues, life cover, garnishments.',
  },
] as const satisfies readonly Field[]

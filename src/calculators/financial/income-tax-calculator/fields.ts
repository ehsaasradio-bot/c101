import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * `grossIncome` is deliberately first: the end-to-end suite nudges the first
 * number field to 1.1x its default, and tax is non-decreasing in gross income
 * and strictly increasing above the standard deduction, so the nudged value is
 * always valid and always moves the headline.
 *
 * `preTaxDeductions` tops out at $60,000 — comfortably above a full 401(k)
 * elective deferral plus catch-up plus an HSA and an FSA — and stays below the
 * default gross income, so the top of that slider is a value compute accepts
 * while `grossIncome` sits at its own default.
 */
export const fields = [
  {
    kind: 'number',
    id: 'grossIncome',
    label: 'Gross annual income',
    default: 85_000,
    // A slider spans these, so both ends must be values compute accepts.
    min: 0,
    max: 5_000_000,
    step: 500,
    unit: '$',
    help: 'Everything before deductions: wages, salary, bonus, and self-employment profit.',
  },
  {
    kind: 'select',
    id: 'filingStatus',
    label: 'Filing status',
    default: 'single',
    options: [
      { value: 'single', label: 'Single' },
      { value: 'married', label: 'Married filing jointly' },
      { value: 'headOfHousehold', label: 'Head of household' },
    ],
  },
  {
    kind: 'number',
    id: 'preTaxDeductions',
    label: 'Pre-tax deductions',
    default: 0,
    min: 0,
    max: 60_000,
    step: 500,
    unit: '$',
    help: 'Traditional 401(k), HSA and FSA contributions, which come out before federal income tax.',
  },
] as const satisfies readonly Field[]

import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its input type from
 * them without importing `index.ts` — which imports `compute.ts` and would cycle.
 *
 * `currentAge` is deliberately first: the end-to-end suite nudges the first
 * number field to 1.1x its default, and 30 -> 33 is an exact integer that stays
 * inside its own bounds, stays below `retirementAge`, and always moves the
 * answer (three fewer years of compounding).
 *
 * The bounds on the two ages are chosen so neither collides with the other's
 * default: `currentAge` stops at 64 (below the retirement default of 65) and
 * `retirementAge` starts at 40 (above the current-age default of 30). Both ends
 * of both sliders are therefore values `compute` accepts, with no cross-field
 * exemption needed in `field-bounds.test.ts`.
 */
export const fields = [
  {
    kind: 'number',
    id: 'currentAge',
    label: 'Current age',
    default: 30,
    min: 18,
    max: 64,
    step: 1,
    unit: 'yrs',
  },
  {
    kind: 'number',
    id: 'retirementAge',
    label: 'Retirement age',
    default: 65,
    min: 40,
    max: 75,
    step: 1,
    unit: 'yrs',
    help: 'Must be later than your current age.',
  },
  {
    kind: 'number',
    id: 'currentBalance',
    label: 'Current 401(k) balance',
    default: 30_000,
    min: 0,
    max: 2_000_000,
    step: 1000,
    unit: '$',
  },
  {
    kind: 'number',
    id: 'annualSalary',
    label: 'Annual salary',
    default: 70_000,
    min: 15_000,
    max: 750_000,
    step: 1000,
    unit: '$/yr',
  },
  {
    kind: 'number',
    id: 'contributionPercent',
    label: 'Your contribution',
    default: 5,
    min: 0,
    max: 50,
    step: 0.5,
    unit: '% of pay',
    help: 'The share of each paycheck you defer into the plan.',
  },
  {
    kind: 'number',
    id: 'employerMatchRate',
    label: 'Employer match rate',
    default: 50,
    min: 0,
    max: 200,
    step: 5,
    unit: '% matched',
    help: 'Cents on the dollar your employer adds. 50 means 50 cents for every dollar you pay in.',
  },
  {
    kind: 'number',
    id: 'employerMatchCap',
    label: 'Match cap',
    default: 6,
    min: 0,
    max: 15,
    step: 0.5,
    unit: '% of pay',
    help: 'Matching stops above this share of pay. The defaults read as "50% of the first 6%".',
  },
  {
    kind: 'number',
    id: 'annualReturn',
    label: 'Expected annual return',
    default: 7,
    min: 0,
    max: 15,
    step: 0.25,
    unit: '%',
  },
  {
    kind: 'number',
    id: 'salaryGrowth',
    label: 'Annual pay rise',
    default: 2.5,
    min: 0,
    max: 10,
    step: 0.5,
    unit: '%/yr',
    help: 'Contributions are a share of pay, so they grow as pay does.',
  },
] as const satisfies readonly Field[]

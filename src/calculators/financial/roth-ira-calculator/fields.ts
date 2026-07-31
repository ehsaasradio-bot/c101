import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * `currentAge` is deliberately first: the end-to-end suite nudges the first
 * number field to 1.1x its default, and 30 -> 33 is an exact integer that stays
 * inside its own bounds, stays below the retirement age above it, and always
 * moves the answer (three fewer years of contributions and compounding).
 *
 * The two ages are bounded so neither end collides with the other's default:
 * `currentAge` stops at 64, below the retirement default of 65, and
 * `retirementAge` starts at 40, above the current-age default of 30. Both ends
 * of both sliders are therefore values `compute` accepts.
 *
 * Every default sits on `min + n x step`, because an HTML range snaps to that
 * grid and would otherwise shift the moment the control is touched. Each max is
 * inside `niceCeil(default x 4)` too, so `softRange` leaves the whole slider
 * draggable rather than capping the top end with a `+`.
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
    help: 'Must be later than your current age. Roth earnings come out tax-free from 59 and a half, provided the account is five years old.',
  },
  {
    kind: 'number',
    id: 'annualContribution',
    label: 'Annual Roth contribution',
    // The IRA contribution limit for the 2026 tax year (IRS Notice 2025-67).
    default: 7_500,
    min: 500,
    max: 30_000,
    step: 500,
    unit: '$/yr',
    help: 'After-tax dollars going into the account. The 2026 IRA limit is 7,500 dollars, or 8,600 from age 50.',
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
    id: 'taxRateNow',
    label: 'Your tax rate now',
    default: 22,
    min: 0,
    max: 50,
    step: 1,
    unit: '%',
    help: 'The marginal rate a deductible contribution would save you today, federal and state combined.',
  },
  {
    kind: 'number',
    id: 'taxRateRetirement',
    label: 'Expected tax rate in retirement',
    default: 15,
    min: 0,
    max: 50,
    step: 1,
    unit: '%',
    help: 'The rate you expect to pay on withdrawals. This is the only input that decides which account wins.',
  },
] as const satisfies readonly Field[]

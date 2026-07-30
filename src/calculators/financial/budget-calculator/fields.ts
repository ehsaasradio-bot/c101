import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * Order matters twice over:
 *
 *  - the end-to-end suite nudges the FIRST number field to 1.1x its default and
 *    expects a valid, different result. `income` is that field: 5,000 x 1.1 =
 *    5,500 sits inside its bounds and moves every share, so the headline moves.
 *  - the four "needs" lines are grouped ahead of wants and savings so the form
 *    reads in the same order as the 50/30/20 split it is measured against.
 *
 * Every default lands on `min + n x step`, because each of these renders as a
 * slider and an HTML range snaps to that grid the moment it is touched. The
 * maxima sit well above the defaults — a slider only spans about 4x the default
 * (`softRange`), so the rest is reachable by typing — and every bound here is a
 * value `compute` accepts on its own.
 */
export const fields = [
  {
    kind: 'number',
    id: 'income',
    label: 'Monthly take-home pay',
    default: 5000,
    // Zero income would leave the shares with no denominator, so the floor is a
    // usable positive amount rather than 0.
    min: 500,
    max: 100_000,
    step: 100,
    unit: '$',
    help: 'What actually lands in your account each month, after tax and payroll deductions.',
  },
  {
    kind: 'number',
    id: 'housing',
    label: 'Housing',
    default: 1600,
    min: 0,
    max: 50_000,
    step: 50,
    unit: '$',
    help: 'Rent or mortgage payment, property tax, home insurance, and utilities.',
  },
  {
    kind: 'number',
    id: 'transport',
    label: 'Transport',
    default: 450,
    min: 0,
    max: 20_000,
    step: 25,
    unit: '$',
    help: 'Car payment, fuel, insurance, maintenance, or transit passes.',
  },
  {
    kind: 'number',
    id: 'food',
    label: 'Groceries',
    default: 600,
    min: 0,
    max: 20_000,
    step: 25,
    unit: '$',
    help: 'Food eaten at home. Restaurants and takeaway belong under wants.',
  },
  {
    kind: 'number',
    id: 'otherNeeds',
    label: 'Other essentials',
    default: 500,
    min: 0,
    max: 20_000,
    step: 25,
    unit: '$',
    help: 'Health insurance, childcare, phone, and the minimum payment on every debt.',
  },
  {
    kind: 'number',
    id: 'wants',
    label: 'Wants',
    default: 900,
    min: 0,
    max: 20_000,
    step: 25,
    unit: '$',
    help: 'Dining out, subscriptions, hobbies, travel, shopping — anything you could pause.',
  },
  {
    kind: 'number',
    id: 'savings',
    label: 'Savings and extra debt repayment',
    default: 700,
    min: 0,
    max: 20_000,
    step: 25,
    unit: '$',
    help: 'Money you move out on purpose: emergency fund, investments, retirement, and anything paid above a debt minimum.',
  },
] as const satisfies readonly Field[]

import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * `amount` is deliberately the first number field: it appears in both modes'
 * formulas, so the end-to-end nudge to 1.1x its default always moves the answer.
 *
 * Present value and future value are the same formula read in two directions,
 * so they share one page and one mode select rather than splitting into two
 * thin pages that would each be half of an idea.
 */
export const fields = [
  {
    kind: 'select',
    id: 'mode',
    label: 'What do you want to work out?',
    default: 'pv',
    options: [
      { value: 'pv', label: 'Present value — what future money is worth today' },
      { value: 'fv', label: 'Future value — what money today grows to' },
    ],
  },
  {
    kind: 'number',
    id: 'amount',
    label: 'Lump sum',
    default: 100_000,
    min: 0,
    max: 10_000_000,
    step: 1000,
    unit: '$',
    help: 'A single amount: the future payout when discounting back, or the money you hold today when growing forward. Set it to 0 to value the payments alone.',
  },
  {
    kind: 'number',
    id: 'payment',
    label: 'Recurring payment',
    default: 500,
    min: 0,
    max: 1_000_000,
    step: 50,
    unit: '$/period',
    help: 'An optional payment each period — a pension, a rent, a bond coupon. Set it to 0 for a lump sum on its own.',
  },
  {
    kind: 'select',
    id: 'frequency',
    label: 'Payment and compounding frequency',
    default: '12',
    options: [
      { value: '12', label: 'Monthly' },
      { value: '4', label: 'Quarterly' },
      { value: '1', label: 'Annually' },
    ],
    help: 'Payments arrive at the end of each period, and the rate compounds at that same frequency.',
  },
  {
    kind: 'number',
    id: 'annualRate',
    label: 'Discount or growth rate',
    default: 5,
    min: 0,
    max: 25,
    step: 0.25,
    unit: '%',
    help: 'The nominal annual rate. Zero is allowed and simply means money keeps its face value over time.',
  },
  {
    kind: 'number',
    id: 'years',
    label: 'Number of years',
    default: 20,
    min: 1,
    max: 50,
    step: 1,
    unit: 'yr',
  },
] as const satisfies readonly Field[]

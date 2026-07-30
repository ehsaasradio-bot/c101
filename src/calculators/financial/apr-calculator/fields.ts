import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * Remember the first number field is the one the end-to-end suite nudges to 1.1x
 * its default, so it has to tolerate that and still change the result. `amount`
 * does: the fixed-dollar fees shrink as a share of a larger loan, so the APR
 * moves even though the quoted rate has not.
 */
export const fields = [
  {
    kind: 'number',
    id: 'amount',
    label: 'Loan amount',
    default: 250_000,
    // A slider spans these, so both ends must be values compute accepts. The
    // floor sits well clear of the default fees: a $2,750 upfront cost has to
    // leave something behind to actually borrow.
    min: 25_000,
    max: 2_000_000,
    step: 1000,
    unit: '$',
    help: 'The face amount of the loan, before any fees come out of it.',
  },
  {
    kind: 'number',
    id: 'rate',
    label: 'Quoted interest rate',
    default: 6.5,
    min: 0,
    max: 25,
    step: 0.05,
    unit: '%',
    help: 'The nominal note rate the lender advertises — not its APR.',
  },
  {
    kind: 'number',
    id: 'years',
    label: 'Term',
    default: 30,
    min: 1,
    max: 40,
    step: 1,
    unit: 'years',
  },
  {
    kind: 'number',
    id: 'points',
    label: 'Discount points',
    default: 1,
    min: 0,
    max: 5,
    step: 0.25,
    unit: '%',
    help: 'One point is 1% of the loan amount, paid up front to buy the rate down.',
  },
  {
    kind: 'number',
    id: 'fees',
    label: 'Other upfront fees',
    default: 2500,
    min: 0,
    max: 25_000,
    step: 100,
    unit: '$',
    help: 'Origination, underwriting and broker charges — the fees APR must include.',
  },
] as const satisfies readonly Field[]

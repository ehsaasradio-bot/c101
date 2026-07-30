import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * The order is deliberate: the loan you have, then the loan you are being
 * offered. `balance` leads because it is the number every visitor knows, and
 * because the end-to-end suite nudges the FIRST number field to 1.1x its
 * default — a bigger balance scales both payments, so the monthly saving grows
 * and the break-even moves from 13 months to 12.
 */
export const fields = [
  {
    kind: 'number',
    id: 'balance',
    label: 'Current loan balance',
    default: 250_000,
    // Not the original loan amount — what you still owe today. The slider spans
    // roughly 4x the default (softRange in theme/studio/range.ts), so 10k..1M
    // is draggable and the number input still accepts the rest.
    min: 10_000,
    max: 2_000_000,
    step: 1_000,
    unit: '$',
    help: 'What you still owe today, not what you originally borrowed.',
  },
  {
    kind: 'number',
    id: 'currentRate',
    label: 'Current interest rate',
    default: 6.75,
    // 0% is a real (if rare) subsidised loan, and compute handles it as a
    // straight division rather than dividing by zero.
    min: 0,
    max: 20,
    step: 0.125,
    unit: '%',
  },
  {
    kind: 'number',
    id: 'remainingYears',
    label: 'Years left on your current loan',
    // 22 years left on a 30-year loan is the case this page exists to warn
    // about: refinancing into a fresh 30-year term lowers the payment while
    // adding eight more years of interest.
    default: 22,
    min: 1,
    max: 40,
    step: 1,
    unit: 'years',
    help: 'Round to the nearest year — a 30-year loan taken out in 2018 has about 22 left.',
  },
  {
    kind: 'number',
    id: 'newRate',
    label: 'New interest rate',
    default: 5.75,
    min: 0,
    max: 20,
    step: 0.125,
    unit: '%',
  },
  {
    kind: 'number',
    id: 'newYears',
    label: 'New loan term',
    // A free number rather than a 30/20/15/10 select, because the single most
    // useful thing this page can ask you to do is set this to the years you
    // have left — which isolates the rate cut from the term reset. A fixed
    // option list cannot express "22", so it could not make the comparison.
    default: 30,
    min: 5,
    max: 40,
    step: 1,
    unit: 'years',
    help: 'Set this to the years you have left for a like-for-like comparison.',
  },
  {
    kind: 'number',
    id: 'closingCosts',
    label: 'Closing costs',
    // Zero is allowed: a "no-cost" refinance really does exist, paid for with a
    // higher rate. Break-even is then immediate, which is the correct answer
    // rather than an edge case to reject.
    default: 4_500,
    min: 0,
    max: 30_000,
    step: 100,
    unit: '$',
    help: 'Origination, appraisal, title and recording fees, paid up front.',
  },
] as const satisfies readonly Field[]

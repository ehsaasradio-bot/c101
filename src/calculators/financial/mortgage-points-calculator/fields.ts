import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * ORDER, which here is a maths problem rather than a matter of taste. The
 * end-to-end suite nudges the FIRST number field to 1.1x its default and demands
 * a different headline, and the headline is
 *
 *   break-even months = ceil(up-front cost ÷ monthly saving)
 *
 * Two of the obvious candidates cannot move that number at all:
 *
 *  - `loanAmount` moves it by EXACTLY nothing. The cost is a fixed percentage of
 *    the loan and the payment gap is the same annuity-factor difference times
 *    the loan, so the ratio is algebraically independent of loan size. A page
 *    that led with it would sit there showing 62 months however far you dragged.
 *  - `points` barely moves it either, for a subtler reason: 10% more points buy
 *    10% more rate cut, and the payment is so nearly linear in the rate over a
 *    quarter of a point that the two almost exactly cancel. Measured, the
 *    break-even goes from 61.16 raw months to 61.19 — the same 62 after
 *    rounding up. That near-invariance is a genuine finding about points, not a
 *    quirk: over a normal rate sheet the break-even hardly depends on how many
 *    you buy.
 *  - `keepYears` moves the verdict but not the break-even, by construction.
 *
 * `baseRate` leads because it does move it — a higher par rate with the same
 * quarter-point cut buys a bigger payment gap, taking the default 62 months to
 * 60 — and because it is also the honest first question. Everything about
 * points is priced against the rate you could have had for free.
 */
export const fields = [
  {
    kind: 'number',
    id: 'baseRate',
    label: 'Rate with no points',
    default: 6.5,
    // Floored at 1% rather than 0: with one point bought at the default quarter
    // point per point, a 0% par rate would imply a negative rate paid, and a
    // slider end the calculator has to refuse is a broken control.
    min: 1,
    max: 20,
    step: 0.125,
    unit: '%',
    help: 'The par rate your lender quotes with zero points — the one to beat.',
  },
  {
    kind: 'number',
    id: 'reductionPerPoint',
    label: 'Rate cut per point',
    // A quarter of a percentage point per point is the common rate-sheet shape,
    // but it is a convention and not a law — sheets bend, and the first point
    // usually buys more than the third. Kept as an input so you can type what
    // your own two quotes actually differ by rather than trust a rule of thumb.
    default: 0.25,
    min: 0,
    max: 1,
    step: 0.05,
    unit: '% per point',
    help: 'Read it off two quotes: the par rate minus the rate at one point.',
  },
  {
    kind: 'number',
    id: 'points',
    label: 'Discount points bought',
    // One point is the ordinary quote. Zero is deliberately reachable on the
    // slider: "what if I just take the par rate" is the comparison this whole
    // page exists to make, and compute answers it rather than refusing.
    default: 1,
    min: 0,
    max: 4,
    step: 0.125,
    unit: 'points',
    help: 'One point costs 1% of the loan amount, paid at closing.',
  },
  {
    kind: 'number',
    id: 'loanAmount',
    label: 'Loan amount',
    default: 400_000,
    // What you borrow, not the purchase price — points are charged on the loan.
    min: 10_000,
    max: 2_000_000,
    step: 1_000,
    unit: '$',
    help: 'The amount borrowed, not the purchase price. Points are charged on this.',
  },
  {
    kind: 'number',
    id: 'termYears',
    label: 'Loan term',
    default: 30,
    min: 5,
    max: 40,
    step: 1,
    unit: 'years',
  },
  {
    kind: 'number',
    id: 'keepYears',
    label: 'Years you expect to keep this loan',
    // The field that turns a number into a verdict. Nine years is close to the
    // typical spell an owner holds a mortgage before selling or refinancing, and
    // it sits well short of thirty on purpose: the default should show the
    // reader the case they are actually in, not the textbook one.
    default: 9,
    min: 1,
    max: 40,
    step: 1,
    unit: 'years',
    help: 'Until you sell or refinance — not the term. Most loans end early.',
  },
] as const satisfies readonly Field[]

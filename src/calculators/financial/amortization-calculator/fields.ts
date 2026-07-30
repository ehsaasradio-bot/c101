import type { Field } from '../../../lib/types'

/**
 * Deliberately no "extra payment" field — that is `loan-calculator`'s question
 * ("what would paying more do?"). This one answers "where is my money actually
 * going, and when does that change?", so the fourth input picks a year to look
 * at rather than altering the loan.
 */
export const fields = [
  {
    kind: 'number',
    id: 'amount',
    label: 'Loan amount',
    default: 300_000,
    min: 1_000,
    max: 2_000_000,
    step: 1_000,
    unit: '$',
  },
  {
    kind: 'number',
    id: 'rate',
    label: 'Annual interest rate (APR)',
    default: 6.5,
    // 0% is a real loan (an interest-free plan), and compute handles it as a
    // straight division rather than dividing by zero.
    min: 0,
    max: 25,
    step: 0.05,
    unit: '%',
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
    id: 'focusYear',
    label: 'Show the split for year',
    // Not 1, even though year 1 is the most striking figure. The theme's slider
    // spans roughly 4× the default rather than the validation bounds
    // (`softRange` in theme/studio/range.ts), so a default of 1 caps the drag at
    // year 5 and the crossover — the thing this page exists to show, around year
    // 19 — becomes unreachable without typing. 10 makes the slider span the
    // whole 40-year range, and payment 1 is spelled out in the steps regardless.
    default: 10,
    min: 1,
    // The widest term above. compute clamps to the actual term, so dragging
    // this past a 15-year loan reports its final year rather than throwing.
    max: 40,
    step: 1,
    help: 'Any year past the end of the term shows the final year.',
  },
] as const satisfies readonly Field[]

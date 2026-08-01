import type { Field } from '../../../lib/types'

/**
 * Two lists and one number, in that order.
 *
 * The lists are `kind: 'text'` for the same reason `average-calculator` uses
 * one: a data set has no fixed arity, so a grid of number inputs would cap it at
 * whatever count we guessed. `predictX` is the only number field, which makes it
 * the one the end-to-end suite nudges to 1.1x its default — 10 becomes 11 — and
 * requires a different result from. That is satisfied by construction here,
 * because the headline is the prediction rather than the equation: a raw-text
 * equation would sit unchanged through the nudge and fail the test.
 *
 * The bounds are wide because a prediction is legitimate anywhere on the line,
 * including well before the first observation. `softRange` sizes the slider from
 * the default rather than from these, so the track spans -50 to 50 and marks
 * both ends as capped.
 */
export const fields = [
  {
    kind: 'text',
    id: 'xValues',
    label: 'x values (the predictor)',
    default: '1, 2, 3, 4, 5',
    placeholder: '1, 2, 3, 4, 5',
    help: 'Separate values with commas, spaces, or semicolons. There must be at least two, and they must not all be identical.',
  },
  {
    kind: 'text',
    id: 'yValues',
    label: 'y values (the response)',
    default: '2.1, 4.2, 5.9, 8.1, 9.9',
    placeholder: '2.1, 4.2, 5.9, 8.1, 9.9',
    help: 'One y for every x, in the same order. Decimals and negatives are fine.',
  },
  {
    kind: 'number',
    id: 'predictX',
    label: 'Predict y at x',
    default: 10,
    min: -1000,
    max: 1000,
    step: 0.1,
  },
] as const satisfies readonly Field[]

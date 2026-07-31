import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * `initialInvestment` is deliberately first: the end-to-end suite nudges the
 * first number field to 1.1x its default and demands a valid, different result.
 * The upfront outlay is subtracted from the discounted inflows dollar for
 * dollar, so a 10% larger investment always moves the NPV and never breaks it.
 *
 * The cash flows are one text field because a project has no fixed number of
 * periods — a grid of number inputs would cap the horizon at whatever count we
 * guessed. Note that `kind: 'text'` renders as a SINGLE-LINE input, so the help
 * text must not promise "one per line"; a column pasted out of a spreadsheet
 * arrives with its newlines already flattened to spaces.
 */
export const fields = [
  {
    kind: 'number',
    id: 'initialInvestment',
    label: 'Upfront investment',
    // A slider spans these, so both ends must be values compute accepts. The
    // floor is a positive value rather than 0: the profitability index divides
    // by the present value of the costs, and a project that costs nothing at
    // all has no such ratio to report.
    default: 100_000,
    min: 1000,
    max: 10_000_000,
    step: 1000,
    unit: '$',
    help: 'What the project costs today, at year 0. Enter it as a positive number.',
  },
  {
    kind: 'text',
    id: 'cashFlows',
    label: 'Cash flows, one per year',
    default: '25000, 30000, 35000, 40000, 45000',
    placeholder: '25000, 30000, 35000, 40000, 45000',
    help: 'Separate the years with commas, spaces or semicolons, in order. A year that loses money can be negative or in brackets.',
  },
  {
    kind: 'number',
    id: 'discountRate',
    label: 'Required rate of return',
    default: 10,
    min: 0,
    max: 50,
    step: 0.25,
    unit: '%',
    help: 'Your hurdle rate or cost of capital — what this money would earn elsewhere at the same risk.',
  },
] as const satisfies readonly Field[]

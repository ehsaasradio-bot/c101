import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * `payRate` is deliberately first. The end-to-end suite nudges the first number
 * field to 1.1x its default and demands a valid, *different* headline; gross pay
 * is exactly linear in the rate, so any positive nudge moves the number and
 * nothing about the timesheet can refuse it.
 *
 * The days are one text field because the site has no repeating-field support.
 * That field renders as a SINGLE-LINE input, so the help text must never promise
 * "one per line" — a column pasted out of a spreadsheet arrives with its
 * newlines already flattened to spaces, and the parser is built for that.
 */
export const fields = [
  {
    kind: 'number',
    id: 'payRate',
    label: 'Pay rate',
    default: 22,
    // A slider spans these, so both ends must be values compute accepts.
    min: 0.5,
    max: 500,
    step: 0.5,
    unit: '$/hr',
    help: 'Gross hourly rate, before tax and deductions.',
  },
  {
    kind: 'text',
    id: 'days',
    label: 'Days worked',
    default:
      'Mon 8:00-16:30 30, Tue 8:00-17:00 30, Wed 8:00-16:30 30, Thu 8:00-17:30 45, Fri 8:00-16:00 30',
    placeholder: 'Mon 9:00-17:30 30, Tue 9:00-17:00 30',
    help: 'One entry per day: name, clock-in-clock-out, then unpaid break minutes. Separate days with commas, semicolons or spaces. 12-hour times (9am-5:30pm) and overnight shifts (22:00-06:00) both work.',
  },
  {
    kind: 'select',
    id: 'overtimeRule',
    label: 'Overtime rule',
    default: 'weekly',
    options: [
      { value: 'weekly', label: 'Over 40 hours in the week (US federal, FLSA)' },
      { value: 'daily', label: 'Over 8 hours in a day (California-style)' },
      { value: 'none', label: 'No overtime — every hour at the base rate' },
    ],
    help: 'The federal rule counts the whole week. Some states count each day instead.',
  },
  {
    kind: 'number',
    id: 'overtimeMultiplier',
    label: 'Overtime multiplier',
    default: 1.5,
    min: 1,
    max: 3,
    step: 0.25,
    unit: '×',
    help: 'The FLSA minimum is 1.5 — time and a half.',
  },
] as const satisfies readonly Field[]

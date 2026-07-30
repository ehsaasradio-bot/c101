import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * `cycleLength` is deliberately first. It is the only number field here, and the
 * end-to-end suite nudges the first number field to 1.1x its default and demands
 * a different result — a `date` field cannot be moved that way, so a date sitting
 * in front of it would leave that check nothing to drive. 28 x 1.1 = 30.8, which
 * rounds to a three-day shift in the due date.
 *
 * Both dates arrive at `compute` as ISO `YYYY-MM-DD` strings, and both default to
 * `'today'`, which the view layer resolves at render time so `compute` never
 * reads a clock. A hardcoded last-period date would be valid only for a few
 * months after it was written: measured against a live "today" it would drift
 * past the end of any plausible pregnancy and the shipped defaults would start
 * throwing. Today-to-today computes on every possible build date, and it reads as
 * day zero — exactly where Naegele's rule starts counting.
 */
export const fields = [
  {
    kind: 'number',
    id: 'cycleLength',
    label: 'Average cycle length',
    default: 28,
    // A slider spans these, so both ends must be values compute accepts.
    min: 20,
    max: 45,
    step: 1,
    unit: 'days',
    help: 'First day of one period to the first day of the next. Naegele’s rule assumes 28 days.',
  },
  {
    kind: 'date',
    id: 'lmpDate',
    label: 'First day of last period',
    default: 'today',
    help: 'The first day of bleeding, not the last. Must fall on or before the date below.',
  },
  {
    kind: 'date',
    id: 'asOfDate',
    label: 'Work out gestational age on',
    default: 'today',
    help: 'Defaults to today. Change it to read the gestational age on any other date.',
  },
] as const satisfies readonly Field[]

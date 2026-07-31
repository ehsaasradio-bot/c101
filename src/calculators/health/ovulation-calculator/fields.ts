import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * `cycleLength` is deliberately first. It is the only number field here, and the
 * end-to-end suite nudges the first number field to 1.1x its default and demands
 * a different, valid result — a `date` field cannot be driven that way, so a date
 * sitting in front of it would leave that check nothing to move. 28 x 1.1 = 30.8,
 * which rounds to a 31-day cycle and shifts every date by three days.
 *
 * The bounds are the range in which a calendar estimate means anything. 20 is the
 * floor rather than a rounder 15 because ovulation is placed on cycle day
 * `cycleLength - 14` and the fertile window opens five days before it: at 20 days
 * the window opens on cycle day 1, and anything shorter would place it before the
 * period it is counted from. 45 is the ceiling because past it the fixed-luteal
 * assumption has stopped describing anything. The default, 28, sits on
 * `min + 8 * step`.
 *
 * `lmpDate` arrives at `compute` as an ISO `YYYY-MM-DD` string and defaults to
 * `'today'`, which the view layer resolves at render time so `compute` never
 * reads a clock. A hardcoded date would age into nonsense; today is valid on
 * every possible build date, and it reads as cycle day 1 — exactly where the
 * count starts.
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
    help: 'First day of one period to the first day of the next. Use your usual length, not your longest.',
  },
  {
    kind: 'date',
    id: 'lmpDate',
    label: 'First day of last period',
    default: 'today',
    help: 'The first day of bleeding, not the last. That day is cycle day 1.',
  },
] as const satisfies readonly Field[]

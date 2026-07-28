import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its input type from
 * them without importing `index.ts` — which imports `compute.ts` and would cycle.
 *
 * Both dates arrive as ISO `YYYY-MM-DD` strings; `includeEndDate` arrives as a
 * boolean. There is deliberately no number field: every quantity here is derived
 * from the two dates.
 *
 * Both dates default to `'today'`, which resolves at render time. A hardcoded
 * start date would be wrong twice over: before that date the two defaults are
 * out of order and `compute` rejects its own starting state, and after it the
 * default span drifts wider every day the site is served. Today-to-today is the
 * only pair that is valid on every possible build date, and with the end date
 * counted it reads as the honest "one day".
 */
export const fields = [
  {
    kind: 'date',
    id: 'startDate',
    label: 'Start date',
    default: 'today',
    help: 'The earlier of the two dates.',
  },
  {
    kind: 'date',
    id: 'endDate',
    label: 'End date',
    default: 'today',
    help: 'Must fall on or after the start date.',
  },
  {
    kind: 'toggle',
    id: 'includeEndDate',
    label: 'Count the end date as a full day',
    default: true,
    help: 'On for inclusive counts such as holiday bookings; off for plain elapsed days.',
  },
] as const satisfies readonly Field[]

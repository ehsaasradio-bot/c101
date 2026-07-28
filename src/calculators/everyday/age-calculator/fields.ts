import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its input type from
 * them without importing `index.ts` — which imports `compute.ts` and would cycle.
 *
 * Both inputs are dates, so they arrive at `compute` as ISO `YYYY-MM-DD`
 * strings. `asOfDate` uses the `'today'` sentinel, which the view layer resolves
 * at render time — `compute` itself never reads a clock and stays pure.
 */
export const fields = [
  {
    kind: 'date',
    id: 'birthDate',
    label: 'Date of birth',
    default: '1995-06-15',
    help: 'The day you were born.',
  },
  {
    kind: 'date',
    id: 'asOfDate',
    label: 'Age at date',
    default: 'today',
    help: 'Defaults to today. Set a future date to see how old you will be then.',
  },
] as const satisfies readonly Field[]

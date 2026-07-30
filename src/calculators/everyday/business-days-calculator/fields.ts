import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * `businessDays` is the only NUMBER field, and it deliberately sits ahead of both
 * dates: the end-to-end suite finds the first number field, sets it to 1.1x its
 * default and demands a different result. A date field cannot be driven that
 * way, so a calculator whose only movable input was a date would leave that
 * check nothing to do. 10 x 1.1 = 11, which moves the arrival date by a day.
 *
 * `mode` decides which of the two questions is being asked. The inputs the other
 * mode does not need are ignored by `compute` rather than hidden — the form has
 * no mechanism for hiding a field, and an input the visitor can still see is
 * less confusing than one that vanishes.
 *
 * Both dates arrive at `compute` as ISO `YYYY-MM-DD` strings and both default to
 * `'today'`, which the view layer resolves at render time so `compute` never
 * reads a clock. A hardcoded start date would be stale the month after it was
 * written, and — exactly as in `date-difference-calculator` — a hardcoded start
 * beside a live "today" end would be out of order on some build dates and would
 * reject its own shipped defaults. Today-to-today is valid on every build date.
 */
export const fields = [
  {
    kind: 'select',
    id: 'mode',
    label: 'What to work out',
    default: 'add',
    options: [
      { value: 'add', label: 'Add business days to a date' },
      { value: 'between', label: 'Count business days between two dates' },
    ],
    help: 'Adding answers “when will it arrive”; counting answers “how long have I got”.',
  },
  {
    kind: 'number',
    id: 'businessDays',
    label: 'Business days to add',
    default: 10,
    // A slider spans these, so both ends must be values compute accepts. 260 is
    // about one working year, as far as a "when will it arrive" question reaches.
    min: 1,
    max: 260,
    step: 1,
    unit: 'days',
    help: 'Used when adding. The start date is never counted, so 1 means the next working day.',
  },
  {
    kind: 'date',
    id: 'startDate',
    label: 'Start date',
    default: 'today',
    help: 'The day the clock starts. Counted itself when counting a range, not when adding.',
  },
  {
    kind: 'date',
    id: 'endDate',
    label: 'End date',
    default: 'today',
    help: 'Used when counting a range, and counted itself. Must fall on or after the start date.',
  },
  {
    kind: 'select',
    id: 'holidays',
    label: 'Public holidays to skip',
    default: 'usFederal',
    options: [
      { value: 'usFederal', label: 'US federal holidays' },
      { value: 'none', label: 'None — weekends only' },
    ],
    help: 'Federal holidays are worked out by rule for any year, including the observed-day shift.',
  },
] as const satisfies readonly Field[]

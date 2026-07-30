import { CalcError } from '../../../lib/types'
import type { CalcResult, FormatSpec, Part, Quantity, Values } from '../../../lib/types'
import type { fields } from './fields'

const MS_PER_DAY = 86_400_000
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

const SUNDAY = 0
const MONDAY = 1
const THURSDAY = 4
const SATURDAY = 6

/**
 * The observed-day rule of 5 U.S.C. 6103(b) — a holiday on a Saturday is taken
 * the Friday before, one on a Sunday the Monday after — arrived with Executive
 * Order 11582 in 1971, the same year the Uniform Monday Holiday Act moved
 * Washington's Birthday, Memorial Day and Columbus Day onto fixed Mondays.
 * Before that the federal calendar was a different shape, so this calculator
 * refuses to pretend it knows it.
 */
const MIN_YEAR = 1971
/** Beyond this a year is a typo rather than a date. */
const MAX_YEAR = 2199

/** Martin Luther King Jr. Day was created in 1983 and first observed in 1986. */
const MLK_FROM_YEAR = 1986
/** Juneteenth was signed into law on 17 June 2021 and first observed that year. */
const JUNETEENTH_FROM_YEAR = 2021

/**
 * The Uniform Monday Holiday Act moved Veterans Day to the fourth Monday in
 * October for 1971 through 1977. Public Law 94-97 put it back on 11 November
 * from 1978, which is where it has stayed.
 */
const VETERANS_DAY_BACK_ON_11_NOVEMBER_FROM_YEAR = 1978

/** Adding more than one working year ahead is not a question anyone asks. */
const MAX_BUSINESS_DAYS = 260

/**
 * Parses an ISO date into a whole number of days since the epoch.
 *
 * Everything here is UTC on purpose, and for the same reason as in
 * `date-difference-calculator`: a local-time subtraction across a
 * daylight-saving boundary is 23 or 25 hours long, which rounds a span to the
 * wrong number of days — and one day is the difference between landing on the
 * Friday and landing on the Monday. UTC has no such boundaries. `new
 * Date(string)` is avoided for the same reason: it resolves in the runtime's own
 * zone, so the build server and the browser would not have to agree.
 */
function parseIsoDay(raw: string, fieldId: string): number {
  const match = ISO_DATE.exec(String(raw).trim())
  if (!match) throw new CalcError('Enter a date as YYYY-MM-DD.', fieldId)

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  if (year < MIN_YEAR || year > MAX_YEAR)
    throw new CalcError(
      `Enter a year between ${MIN_YEAR} and ${MAX_YEAR} — the modern federal holiday rules only reach back to ${MIN_YEAR}.`,
      fieldId,
    )

  const ms = Date.UTC(year, month - 1, day)
  if (!Number.isFinite(ms)) throw new CalcError('That date is not a real calendar date.', fieldId)

  // Date.UTC rolls 2026-02-30 forward into March rather than refusing it, so
  // read the fields back and insist they survived the round trip.
  const date = new Date(ms)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    throw new CalcError('That date is not a real calendar date.', fieldId)

  return ms / MS_PER_DAY
}

/** Epoch day for a Y-M-D. Every year reaching this is >= 1970. */
const epochDayOf = (year: number, monthIndex: number, day: number): number =>
  Date.UTC(year, monthIndex, day) / MS_PER_DAY

/**
 * Day of the week straight from the day number: 1970-01-01 was a Thursday, so
 * epoch day 0 is 4. The `+ 11` is `+ 7 + 4`, which keeps the result positive for
 * dates before 1970, where `%` in JavaScript would otherwise go negative.
 *
 * Derived arithmetically rather than through `Date#getUTCDay` so that the tests
 * can check this against the platform's own answer instead of restating it.
 */
const dayOfWeek = (epochDay: number): number => ((epochDay % 7) + 11) % 7

const isWeekend = (epochDay: number): boolean => {
  const dow = dayOfWeek(epochDay)
  return dow === SATURDAY || dow === SUNDAY
}

const isLeap = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const

const daysInMonth = (year: number, monthIndex: number): number =>
  monthIndex === 1 && isLeap(year) ? 29 : MONTH_LENGTHS[monthIndex]!

/** The nth given weekday of a month — "the fourth Thursday in November". */
function nthWeekdayOfMonth(year: number, monthIndex: number, weekday: number, n: number): number {
  const first = epochDayOf(year, monthIndex, 1)
  const shift = (weekday - dayOfWeek(first) + 7) % 7
  return first + shift + (n - 1) * 7
}

/** The last given weekday of a month — "the last Monday in May". */
function lastWeekdayOfMonth(year: number, monthIndex: number, weekday: number): number {
  const last = epochDayOf(year, monthIndex, daysInMonth(year, monthIndex))
  return last - ((dayOfWeek(last) - weekday + 7) % 7)
}

/**
 * 5 U.S.C. 6103(b): a holiday on a fixed calendar date that falls on a Saturday
 * is observed the preceding Friday, and one falling on a Sunday is observed the
 * following Monday. Holidays already pinned to a Monday or a Thursday can never
 * need this, so only the fixed-date ones are passed through it.
 */
function observedDay(actual: number): number {
  const dow = dayOfWeek(actual)
  if (dow === SATURDAY) return actual - 1
  if (dow === SUNDAY) return actual + 1
  return actual
}

interface ObservedHoliday {
  name: string
  /** The date in law. */
  actual: number
  /** The date it is actually taken off, after the Saturday/Sunday shift. */
  observed: number
}

/**
 * THE ELEVEN US FEDERAL HOLIDAYS of 5 U.S.C. 6103(a), each computed from its own
 * rule rather than read from a table of dates that would expire:
 *
 *   New Year's Day                1 January
 *   Martin Luther King Jr. Day    third Monday in January        (from 1986)
 *   Washington's Birthday         third Monday in February
 *   Memorial Day                  last Monday in May
 *   Juneteenth                    19 June                        (from 2021)
 *   Independence Day              4 July
 *   Labor Day                     first Monday in September
 *   Columbus Day                  second Monday in October
 *   Veterans Day                  11 November (4th Monday in Oct, 1971-1977)
 *   Thanksgiving Day              fourth Thursday in November
 *   Christmas Day                 25 December
 *
 * Checked against OPM's published observed dates for 2024-2028, which is where
 * the awkward cases live: 4 July 2026 is a Saturday, so federal offices close on
 * Friday 3 July 2026, and New Year's Day 2028 is a Saturday, so it is taken on
 * Friday 31 December 2027 — a holiday landing in the previous calendar year,
 * which is why callers generate a year either side of the range they want.
 */
function usFederalHolidays(year: number): ObservedHoliday[] {
  const list: ObservedHoliday[] = []
  // Fixed-date holidays are the only ones the observed-day rule can move.
  const fixed = (name: string, monthIndex: number, day: number) => {
    const actual = epochDayOf(year, monthIndex, day)
    list.push({ name, actual, observed: observedDay(actual) })
  }
  // Monday and Thursday holidays are weekdays by construction.
  const onWeekday = (name: string, actual: number) => list.push({ name, actual, observed: actual })

  fixed('New Year’s Day', 0, 1)
  if (year >= MLK_FROM_YEAR)
    onWeekday('Martin Luther King Jr. Day', nthWeekdayOfMonth(year, 0, MONDAY, 3))
  onWeekday('Washington’s Birthday', nthWeekdayOfMonth(year, 1, MONDAY, 3))
  onWeekday('Memorial Day', lastWeekdayOfMonth(year, 4, MONDAY))
  if (year >= JUNETEENTH_FROM_YEAR) fixed('Juneteenth National Independence Day', 5, 19)
  fixed('Independence Day', 6, 4)
  onWeekday('Labor Day', nthWeekdayOfMonth(year, 8, MONDAY, 1))
  onWeekday('Columbus Day', nthWeekdayOfMonth(year, 9, MONDAY, 2))
  if (year >= VETERANS_DAY_BACK_ON_11_NOVEMBER_FROM_YEAR) fixed('Veterans Day', 10, 11)
  else onWeekday('Veterans Day', nthWeekdayOfMonth(year, 9, MONDAY, 4))
  onWeekday('Thanksgiving Day', nthWeekdayOfMonth(year, 10, THURSDAY, 4))
  fixed('Christmas Day', 11, 25)
  return list
}

/**
 * Every observed holiday whose day off falls inside [fromDay, toDay], keyed by
 * that day so two rules can never contribute the same date twice — which would
 * make the parts below double-count and stop summing to the span.
 */
function observedHolidaysBetween(
  fromDay: number,
  toDay: number,
  observe: boolean,
): Map<number, ObservedHoliday> {
  const found = new Map<number, ObservedHoliday>()
  if (!observe || toDay < fromDay) return found

  const firstYear = new Date(fromDay * MS_PER_DAY).getUTCFullYear() - 1
  const lastYear = new Date(toDay * MS_PER_DAY).getUTCFullYear() + 1
  for (let year = firstYear; year <= lastYear; year++) {
    for (const holiday of usFederalHolidays(year)) {
      if (holiday.observed < fromDay || holiday.observed > toDay) continue
      // The observed date is always a weekday, but filter rather than assume:
      // the parts only sum to the span if no holiday is also a weekend day.
      if (isWeekend(holiday.observed)) continue
      if (!found.has(holiday.observed)) found.set(holiday.observed, holiday)
    }
  }
  return found
}

/**
 * Monday-to-Friday days in a run of `days` days beginning on weekday `startDow`.
 * Closed form: whole weeks contribute five each and only the leftover days need
 * looking at, so a 200-year span costs the same as a one-week span.
 */
function countWeekdays(startDow: number, days: number): number {
  if (days <= 0) return 0
  const fullWeeks = Math.floor(days / 7)
  let count = fullWeeks * 5
  for (let i = fullWeeks * 7; i < days; i++) {
    const dow = (startDow + i) % 7
    if (dow !== SUNDAY && dow !== SATURDAY) count++
  }
  return count
}

const pad = (n: number, width: number): string => String(n).padStart(width, '0')

/** Built by hand so no locale can reach it. */
function toIso(epochDay: number): string {
  const date = new Date(epochDay * MS_PER_DAY)
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}`
}

/**
 * A date in the result is read by a person, not parsed by one, so it is written
 * long — and spelled out from fixed tables rather than `toLocaleDateString`,
 * because compute runs at build time in Node and again in the browser and the
 * two must produce the same string. ISO stays in the steps, where an
 * unambiguous machine-readable form is the useful one.
 *
 * The weekday leads: on a business-days calculator, which day of the week you
 * land on is most of the answer.
 */
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const

function toLongDate(epochDay: number): string {
  const date = new Date(epochDay * MS_PER_DAY)
  return `${WEEKDAYS[dayOfWeek(epochDay)]}, ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

const isoStep = (label: string, epochDay: number): Quantity => ({
  label,
  value: toIso(epochDay),
  format: { style: 'raw' },
})

/**
 * A whole number of days. Typed narrowly enough to serve as both a `Quantity`
 * in the stats and steps and a `Part` in the donut — a plain `Quantity` cannot,
 * because its value may be a string and a `Part`'s may not.
 */
const dayCount = (
  label: string,
  value: number,
): { label: string; value: number; format: FormatSpec } => ({
  label,
  value,
  format: { style: 'decimal', decimals: 0 },
})

/** How many holiday rows the steps name before summarising the rest. */
const MAX_LISTED_HOLIDAYS = 12

export default function compute(v: Values<typeof fields>): CalcResult {
  // Only `businessDays` is a number; the selects and both dates arrive as
  // strings, and the derived Values type makes forgetting that a compile error.
  const { businessDays } = v
  const adding = v.mode === 'add'
  const observe = v.holidays === 'usFederal'

  const startDay = parseIsoDay(v.startDate, 'startDate')

  let spanStart: number
  let spanEnd: number
  let arrivalDay: number

  if (adding) {
    // Finiteness first: coerceValues emits NaN for unparseable input, and a
    // magnitude test like `businessDays < 1` is false for NaN, so a bare range
    // check would let it straight through into the walk below. The count is only
    // validated in this mode — a stale value left in the box must not block a
    // perfectly good "days between two dates" question.
    if (!Number.isFinite(businessDays))
      throw new CalcError('Enter a whole number of business days to add.', 'businessDays')
    if (!Number.isInteger(businessDays))
      throw new CalcError(
        'Business days come in whole days, so enter a whole number.',
        'businessDays',
      )
    if (businessDays < 1) throw new CalcError('Enter at least 1 business day to add.', 'businessDays')
    if (businessDays > MAX_BUSINESS_DAYS)
      throw new CalcError(
        `Adding more than ${MAX_BUSINESS_DAYS} business days — about a working year — is past what this is for.`,
        'businessDays',
      )

    // A working week is 5 days in 7, so N business days can never need more than
    // 7N/5 calendar days plus a run of holidays; 60 days of slack covers every
    // holiday cluster in a year several times over. The horizon bounds both the
    // walk and the holidays generated for it, so the two can never disagree
    // about a day — and the walk refuses rather than silently stopping short.
    const horizon = startDay + Math.ceil((businessDays * 7) / 5) + 60
    const upcoming = observedHolidaysBetween(startDay + 1, horizon, observe)

    let cursor = startDay
    let counted = 0
    while (counted < businessDays && cursor < horizon) {
      cursor++
      if (!isWeekend(cursor) && !upcoming.has(cursor)) counted++
    }
    if (counted < businessDays)
      throw new CalcError('That many business days runs past what this can count.', 'businessDays')

    arrivalDay = cursor
    // The start date is not counted: "3 business days" means three working days
    // after it, the WORKDAY convention that carriers, banks and court deadlines
    // use. So the span being decomposed is the wait — the day after the start
    // date through to the arrival date, both counted.
    spanStart = startDay + 1
    spanEnd = arrivalDay
  } else {
    const endDay = parseIsoDay(v.endDate, 'endDate')
    if (endDay < startDay)
      throw new CalcError('The end date must fall on or after the start date.', 'endDate')
    // Both endpoints count, the NETWORKDAYS convention: Monday to Friday of one
    // week is five working days, not four.
    spanStart = startDay
    spanEnd = endDay
    arrivalDay = endDay
  }

  const totalDays = spanEnd - spanStart + 1
  const weekdayCount = countWeekdays(dayOfWeek(spanStart), totalDays)
  const weekendDays = totalDays - weekdayCount

  const holidayList = [...observedHolidaysBetween(spanStart, spanEnd, observe).values()].sort(
    (a, b) => a.observed - b.observed,
  )
  const holidayCount = holidayList.length

  // Every holiday in that map is a weekday inside the span and appears exactly
  // once, so this cannot go negative and the three parts below partition the
  // span exactly rather than approximately.
  const workingDays = weekdayCount - holidayCount

  const fullWeeks = Math.floor(totalDays / 7)
  const remainderDays = totalDays - fullWeeks * 7

  const holidaySteps: Quantity[] = holidayList.slice(0, MAX_LISTED_HOLIDAYS).map((h) => ({
    label: h.observed === h.actual ? h.name : `${h.name} (observed)`,
    value: toIso(h.observed),
    format: { style: 'raw' as const },
  }))
  if (holidayCount > MAX_LISTED_HOLIDAYS)
    holidaySteps.push(
      dayCount('Further holidays, not listed', holidayCount - MAX_LISTED_HOLIDAYS),
    )
  if (holidayCount === 0)
    holidaySteps.push({
      label: 'Public holidays in this span',
      value: observe ? 'None' : 'Not observed',
      format: { style: 'raw' },
    })

  const steps: Array<Quantity | { rule: true }> = adding
    ? [
        isoStep('Start date', startDay),
        dayCount('Business days added', businessDays),
        { rule: true },
        ...holidaySteps,
        { rule: true },
        isoStep('First day counted', spanStart),
        isoStep('Arrival date', arrivalDay),
        dayCount('Calendar days from the start date', totalDays),
        dayCount('Weekend days skipped', weekendDays),
        dayCount('Public holidays skipped', holidayCount),
        dayCount('Business days counted', workingDays),
      ]
    : [
        isoStep('Start date', spanStart),
        isoStep('End date', spanEnd),
        { rule: true },
        dayCount('Calendar days, both ends counted', totalDays),
        dayCount('Whole weeks in the span', fullWeeks),
        dayCount('Weekdays from those whole weeks (5 each)', fullWeeks * 5),
        dayCount(`Weekdays among the remaining ${remainderDays} days`, weekdayCount - fullWeeks * 5),
        dayCount('Weekdays (Mon–Fri) in total', weekdayCount),
        { rule: true },
        ...holidaySteps,
        dayCount('Public holidays deducted', holidayCount),
        { rule: true },
        dayCount('Business days', workingDays),
      ]

  // Three slices of one span, and the count never varies with input, so the
  // donut is drawable at the defaults and at everything else. Every day in the
  // span is exactly one of the three by construction: the weekend days are the
  // complement of the weekdays, and the holidays are the weekdays taken off.
  const parts: Part[] = [
    dayCount('Business days', workingDays),
    dayCount('Weekend days', weekendDays),
    dayCount('Public holidays', holidayCount),
  ]

  const notes: string[] = [
    adding
      ? 'The start date is not counted. Adding 1 business day gives the next working day, which is the convention shipping, banking and court deadlines use.'
      : 'Both the start and the end date are counted, so Monday to Friday of one week is 5 business days, not 4. That matches a spreadsheet’s NETWORKDAYS.',
    'Business days are Monday to Friday. Saturdays and Sundays are never counted, whatever the holiday setting.',
    observe
      ? 'The eleven US federal holidays are worked out from their rules — Thanksgiving is the fourth Thursday in November, Memorial Day the last Monday in May — so the answer stays right in any year rather than expiring with a hardcoded list.'
      : 'No public holidays are deducted, so this is the plain Monday-to-Friday count.',
    'Dates are handled at UTC midnight, so a daylight-saving clock change never adds or loses a day.',
  ]
  if (observe)
    notes.push(
      'A federal holiday falling on a Saturday is observed the Friday before, and one falling on a Sunday the Monday after (5 U.S.C. 6103(b)). That is why 4 July 2026, a Saturday, is taken as a day off on Friday 3 July.',
    )
  if (observe && new Date(spanStart * MS_PER_DAY).getUTCFullYear() < JUNETEENTH_FROM_YEAR)
    notes.push(
      `Juneteenth only became a federal holiday in ${JUNETEENTH_FROM_YEAR}, and Martin Luther King Jr. Day in ${MLK_FROM_YEAR}, so neither is deducted before then.`,
    )
  if (observe)
    notes.push(
      'Federal holidays are the days federal offices close. State, local and company holidays differ, and most private employers do not observe all eleven.',
    )

  return {
    primary: adding
      ? { label: 'Date it lands on', value: toLongDate(arrivalDay), format: { style: 'raw' } }
      : {
          label: 'Business days',
          value: workingDays,
          format: {
            style: 'decimal',
            decimals: 0,
            unit: workingDays === 1 ? 'day' : 'days',
          },
        },
    stats: [
      {
        label: 'Business days',
        value: workingDays,
        format: { style: 'decimal', decimals: 0, unit: workingDays === 1 ? 'day' : 'days' },
      },
      dayCount(adding ? 'Calendar days to wait' : 'Calendar days in the range', totalDays),
      dayCount('Weekend days', weekendDays),
      dayCount('Public holidays', holidayCount),
      { label: 'Start date', value: toLongDate(startDay), format: { style: 'raw' } },
      adding
        ? {
            label: 'Working weeks',
            value: workingDays / 5,
            format: { style: 'decimal', decimals: 1 },
          }
        : { label: 'End date', value: toLongDate(spanEnd), format: { style: 'raw' } },
    ],
    steps,
    parts,
    partsTotal: {
      label: adding ? 'Calendar days from the start date' : 'Calendar days in the range',
      value: totalDays,
      format: { style: 'decimal', decimals: 0, unit: totalDays === 1 ? 'day' : 'days' },
    },
    notes,
  }
}

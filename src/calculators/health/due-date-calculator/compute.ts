import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, Values } from '../../../lib/types'
import type { fields } from './fields'

const MS_PER_DAY = 86_400_000
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * NAEGELE'S RULE. The estimated due date is the first day of the last menstrual
 * period plus 280 days — conventionally stated as "subtract three months, add
 * seven days and a year", which is the same arithmetic for all but a handful of
 * end-of-month starts. The 280 days are 40 weeks measured from the LMP, not 38
 * weeks from conception: the rule builds in a 14-day pre-ovulatory phase, which
 * is where its 28-day cycle assumption lives.
 *
 * A cycle that is not 28 days long moves ovulation by the difference, so the
 * whole dating window moves with it. Adding `cycleLength - 28` days to the LMP
 * gives a corrected start of dating, and every figure below — due date,
 * gestational age, trimester, milestones — is measured from that one anchor, so
 * the due date always lands at exactly 40 weeks 0 days.
 */
const GESTATION_DAYS = 280
const REFERENCE_CYCLE_DAYS = 28
const OVULATION_DAY = 14

/** Gestational-age boundaries, in days from the corrected LMP. */
const SECOND_TRIMESTER_DAY = 14 * 7 // 98  — 14w0d
const THIRD_TRIMESTER_DAY = 28 * 7 // 196 — 28w0d
const EARLY_TERM_DAY = 37 * 7 // 259 — 37w0d, ACOG's earliest "term"
const FULL_TERM_DAY = 39 * 7 // 273 — 39w0d
const LATE_TERM_DAY = 41 * 7 // 287 — 41w0d
const POST_TERM_DAY = 42 * 7 // 294 — 42w0d
const ANATOMY_SCAN_DAY = 18 * 7 // 126 — the usual 18–22 week scan window opens

/**
 * No pregnancy runs past about 46 weeks, so a gestational age beyond that is an
 * input mistake rather than an answer. Refusing it also keeps the scale honest:
 * `resolveBand` falls back to the LAST band when nothing matches, so an
 * unbounded value would silently be labelled post-term.
 */
const MAX_GESTATION_DAYS = 46 * 7 // 322

/** Years outside this are typos, not dates, and `toIso` cannot render them. */
const MIN_YEAR = 1900
const MAX_YEAR = 2199

/**
 * Parses an ISO date into a whole number of days since the epoch.
 *
 * Everything here is UTC on purpose. A local-time subtraction across a
 * daylight-saving boundary is 23 or 25 hours long, which rounds a span to the
 * wrong number of days — and one day is the difference between 12w 6d and
 * 13w 0d. UTC has no such boundaries. `new Date(string)` is avoided for the same
 * reason: it resolves in the runtime's own zone, so the server and the browser
 * would not have to agree.
 */
function parseIsoDay(raw: string, fieldId: string): number {
  const match = ISO_DATE.exec(String(raw).trim())
  if (!match) throw new CalcError('Enter a date as YYYY-MM-DD.', fieldId)

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  if (year < MIN_YEAR || year > MAX_YEAR)
    throw new CalcError(`Enter a year between ${MIN_YEAR} and ${MAX_YEAR}.`, fieldId)

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

const pad = (n: number, width: number): string => String(n).padStart(width, '0')

/** The inverse of `parseIsoDay`, built by hand so no locale can reach it. */
function toIso(epochDay: number): string {
  const date = new Date(epochDay * MS_PER_DAY)
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}`
}

/**
 * The headline is a date a person reads, not a key they parse, so it is written
 * long. Spelled out from a fixed month table rather than `toLocaleDateString`:
 * compute runs at build time in Node and again in the browser, and the two must
 * produce the same string. `format.ts` pins its locale for exactly this reason,
 * and a table needs no locale at all. ISO stays in the steps, where an
 * unambiguous machine-readable form is the useful one.
 */
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

function toLongDate(epochDay: number): string {
  const date = new Date(epochDay * MS_PER_DAY)
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

/** Gestational age is always written weeks + days, never decimal weeks. */
const weeksAndDays = (days: number): string => `${Math.floor(days / 7)}w ${days % 7}d`

const isoStep = (label: string, epochDay: number): Quantity => ({
  label,
  value: toIso(epochDay),
  format: { style: 'raw' },
})

export default function compute(v: Values<typeof fields>): CalcResult {
  // Only `cycleLength` is a number; both dates arrive as strings, and the
  // derived Values type makes forgetting that a compile error.
  const { cycleLength } = v

  // Finiteness first: coerceValues emits NaN for unparseable input, and a
  // magnitude test like `cycleLength < 20` is false for NaN, so a bare
  // range check would let it straight through into the arithmetic.
  if (!Number.isFinite(cycleLength))
    throw new CalcError('Enter your average cycle length in days.', 'cycleLength')
  if (cycleLength < 20 || cycleLength > 45)
    throw new CalcError('Cycle length must be between 20 and 45 days.', 'cycleLength')

  const lmpDay = parseIsoDay(v.lmpDate, 'lmpDate')
  const asOfDay = parseIsoDay(v.asOfDate, 'asOfDate')

  if (lmpDay > asOfDay)
    throw new CalcError(
      'The last period cannot start after the date you are working the age out on.',
      'lmpDate',
    )

  // Whole days only: a 30.8-day cycle is a 3-day shift, not a 2.8-day one,
  // because a due date is a calendar day rather than a moment.
  const cycleShift = Math.round(cycleLength - REFERENCE_CYCLE_DAYS)
  const datingDay = lmpDay + cycleShift
  const dueDay = datingDay + GESTATION_DAYS

  const rawGestation = asOfDay - datingDay
  if (rawGestation > MAX_GESTATION_DAYS)
    throw new CalcError(
      'That period started more than 46 weeks before the date being checked, which is longer than any pregnancy runs.',
      'lmpDate',
    )

  // A cycle longer than 28 days pushes the corrected start past the LMP itself,
  // so the first few days after the period can sit before dating begins. Report
  // that as zero rather than as a negative age; the note below says why.
  const gestationDays = Math.max(0, rawGestation)
  const weeks = Math.floor(gestationDays / 7)
  const days = gestationDays % 7

  const trimester =
    gestationDays < SECOND_TRIMESTER_DAY
      ? 'First'
      : gestationDays < THIRD_TRIMESTER_DAY
        ? 'Second'
        : 'Third'

  const daysToDue = dueDay - asOfDay
  const daysCompleted = Math.min(gestationDays, GESTATION_DAYS)
  // Derived by subtraction from the same constant, so the two parts sum to the
  // 280-day whole exactly rather than by luck — and neither can go negative.
  const daysRemaining = GESTATION_DAYS - daysCompleted

  const notes: string[] = [
    'Naegele’s rule adds 280 days — 40 weeks — to the first day of the last period, assuming a 28-day cycle with ovulation on day 14.',
    'This is an estimate, not an appointment. Only about 4% of babies arrive on their estimated due date, and most births fall within roughly two weeks either side of it.',
    'A dating ultrasound in the first trimester measures the pregnancy directly and is more accurate than the last period. Where the two disagree by more than about a week, the scan date is normally the one used.',
  ]
  if (cycleShift !== 0)
    notes.push(
      `A ${Math.round(cycleLength)}-day cycle puts ovulation about ${Math.abs(cycleShift)} day${Math.abs(cycleShift) === 1 ? '' : 's'} ${cycleShift > 0 ? 'later' : 'earlier'} than the 28-day assumption, so every date here is shifted by that much.`,
    )
  if (rawGestation < 0)
    notes.push(
      'The date being checked falls before the cycle-adjusted start of dating, so the gestational age reads 0w 0d.',
    )
  if (gestationDays >= POST_TERM_DAY)
    notes.push(
      'A gestational age of 42 weeks or more is classed as post-term, which is normally monitored rather than left to run.',
    )

  return {
    primary: { label: 'Estimated due date', value: toLongDate(dueDay), format: { style: 'raw' } },
    // The meter tracks progress through the 280 days, so its position is the
    // gestational age itself rather than any figure derived from it.
    scaleValue: gestationDays,
    stats: [
      { label: 'Gestational age', value: weeksAndDays(gestationDays), format: { style: 'raw' } },
      { label: 'Trimester', value: trimester, format: { style: 'raw' } },
      {
        label: daysToDue >= 0 ? 'Days to the due date' : 'Days past the due date',
        value: Math.abs(daysToDue),
        format: { style: 'decimal', decimals: 0 },
      },
      {
        label: 'Weeks completed',
        value: gestationDays / 7,
        format: { style: 'decimal', decimals: 1 },
      },
      {
        label: 'Estimated conception',
        value: toIso(datingDay + OVULATION_DAY),
        format: { style: 'raw' },
      },
      { label: 'Full term begins', value: toIso(datingDay + FULL_TERM_DAY), format: { style: 'raw' } },
    ],
    steps: [
      isoStep('First day of last period', lmpDay),
      {
        label: 'Cycle length',
        value: Math.round(cycleLength),
        format: { style: 'decimal', decimals: 0, unit: 'days' },
      },
      {
        label: 'Cycle adjustment (length − 28)',
        value: cycleShift,
        format: { style: 'decimal', decimals: 0, unit: 'days' },
      },
      isoStep('Adjusted start of dating', datingDay),
      { rule: true },
      isoStep(`Estimated conception (day ${OVULATION_DAY})`, datingDay + OVULATION_DAY),
      isoStep('Second trimester begins (14 weeks)', datingDay + SECOND_TRIMESTER_DAY),
      isoStep('Anatomy scan window opens (18 weeks)', datingDay + ANATOMY_SCAN_DAY),
      isoStep('Third trimester begins (28 weeks)', datingDay + THIRD_TRIMESTER_DAY),
      isoStep('Early term begins (37 weeks)', datingDay + EARLY_TERM_DAY),
      isoStep('Full term begins (39 weeks)', datingDay + FULL_TERM_DAY),
      isoStep('Estimated due date (40 weeks)', dueDay),
      isoStep('Late term begins (41 weeks)', datingDay + LATE_TERM_DAY),
      isoStep('Post-term begins (42 weeks)', datingDay + POST_TERM_DAY),
      { rule: true },
      isoStep('Gestational age worked out on', asOfDay),
      {
        label: 'Days since the adjusted start',
        value: gestationDays,
        format: { style: 'decimal', decimals: 0 },
      },
      { label: 'That age in weeks and days', value: weeksAndDays(gestationDays), format: { style: 'raw' } },
    ],
    // Two slices of one fixed 280-day whole, so the count never varies with
    // input and the donut is drawable at the defaults (0 completed, 280 to go).
    parts: [
      { label: 'Days completed', value: daysCompleted, format: { style: 'decimal', decimals: 0 } },
      { label: 'Days remaining', value: daysRemaining, format: { style: 'decimal', decimals: 0 } },
    ],
    partsTotal: {
      label: '40 weeks of gestation',
      value: GESTATION_DAYS,
      format: { style: 'decimal', decimals: 0, unit: 'days' },
    },
    notes,
  }
}

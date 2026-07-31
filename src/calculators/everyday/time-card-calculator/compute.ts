import { CalcError } from '../../../lib/types'
import type { CalcResult, Part, Quantity, StepRule, Values } from '../../../lib/types'
import type { fields } from './fields'

/*
 * Weekly timesheet arithmetic.
 *
 * EVERYTHING IS DONE IN WHOLE MINUTES and converted to hours exactly once, at
 * the end. Accumulating 8.5 + 8.5 + ... in decimal hours drifts; minutes are
 * integers and 60 divides them cleanly, so the decimal figure and the
 * hours-and-minutes figure can never disagree.
 *
 * OVERTIME. Two rules are offered and the applied one is named in the output:
 *
 *  - 'weekly' — the US federal rule. The Fair Labor Standards Act, 29 U.S.C.
 *    § 207(a)(1), requires at least one and a half times the regular rate for
 *    hours worked "in excess of forty hours" in a workweek. There is no federal
 *    daily overtime: a 12-hour Monday inside a 38-hour week is all straight time.
 *  - 'daily' — the pattern used by several states, California being the usual
 *    reference (Cal. Lab. Code § 510: over 8 hours in one workday). Implemented
 *    here as the 8-hour daily threshold only; the double-time tier past 12 hours
 *    and the seventh-consecutive-day rule are deliberately not modelled.
 *  - 'none' — every hour at the base rate.
 *
 * Selects and text arrive as strings — the derived Values type makes forgetting
 * Number(...) a compile error rather than a NaN later.
 */

const MINUTES_PER_DAY = 1440
const MINUTES_PER_HOUR = 60
/** FLSA 29 U.S.C. § 207(a)(1): overtime begins past 40 hours in the workweek. */
const WEEKLY_OVERTIME_THRESHOLD_MIN = 40 * MINUTES_PER_HOUR
/** Cal. Lab. Code § 510: overtime begins past 8 hours in the workday. */
const DAILY_OVERTIME_THRESHOLD_MIN = 8 * MINUTES_PER_HOUR

/** Strict h-and-minutes, always two minute digits: 2445 -> "40h 45m". */
function hoursAndMinutes(totalMinutes: number): string {
  const n = Math.round(totalMinutes)
  const h = Math.floor(n / MINUTES_PER_HOUR)
  const m = n - h * MINUTES_PER_HOUR
  return `${h}h ${String(m).padStart(2, '0')}m`
}

const DECIMAL_HOURS = { style: 'decimal', decimals: 2, unit: 'h' } as const
const RAW = { style: 'raw' } as const
const MONEY = { style: 'currency' } as const

// ── Parsing ───────────────────────────────────────────────────────────────

interface ParsedDay {
  /** What the visitor typed for this day, echoed back in errors. */
  source: string
  label: string
  inMin: number
  outMin: number
  /** Clock-out minus clock-in, wrapped over midnight. */
  spanMin: number
  breakMin: number
  workedMin: number
  crossesMidnight: boolean
}

/**
 * Normalises the many ways a range gets typed into one token per range.
 *
 * The field is a single-line input, so a pasted spreadsheet column arrives with
 * its newlines flattened to spaces and every entry runs together. Splitting on
 * whitespace is therefore the only reliable tokenisation — which means anything
 * that legitimately contains a space inside one field ("9:00 - 17:30",
 * "9 am-5 pm") has to be glued back together first.
 */
function normalise(raw: string): string {
  return (
    raw
      // "9 am" and "9 a.m." both become "9am", so the meridiem never survives
      // as its own token once the line is split on whitespace.
      .replace(/(\d)\s*(a\.?m\.?|p\.?m\.?)/gi, (_m, d: string, mer: string) => d + mer.replace(/\./g, ''))
      // En and em dashes always mean "to" here.
      .replace(/[‐-―−]/g, '-')
      // Glue a hyphen or the word "to" to the times on either side of it, but
      // only when digits (or a meridiem) sit on both sides — so a label like
      // "Sat - overtime" is not silently welded to the next entry.
      .replace(/(\d|am|pm)\s*-\s*(?=\d)/gi, '$1-')
      .replace(/(\d|am|pm)\s+to\s+(?=\d)/gi, '$1-')
  )
}

const RANGE = /^(.+?)-(.+)$/
const CLOCK = /^(\d{1,2})(?::([0-5]\d))?(am|pm)?$/i
const MILITARY = /^(\d{3,4})$/
/** A plain break: "30", "30m", "45min", "0.5h", "0:45". */
const BREAK_MINUTES = /^(\d+(?:\.\d+)?)(?:m|min|mins|minute|minutes)?$/i
const BREAK_HOURS = /^(\d+(?:\.\d+)?)(?:h|hr|hrs|hour|hours)$/i
const BREAK_HMM = /^(\d{1,2}):([0-5]\d)$/

/** Minutes since midnight, 0..1440. 1440 is "24:00", i.e. the following midnight. */
function parseClock(token: string, source: string): number {
  const t = token.trim()
  if (t === '') throw new CalcError(`Could not read a time in "${source}".`, 'days')

  const military = MILITARY.exec(t)
  if (military) {
    // 900 -> 9:00, 1730 -> 17:30. Only reached when there is no colon and no
    // am/pm, which is exactly how a punch clock prints it.
    const digits = military[1]!
    const h = Number(digits.slice(0, digits.length - 2))
    const m = Number(digits.slice(-2))
    if (!Number.isFinite(h) || !Number.isFinite(m) || h > 24 || m > 59)
      throw new CalcError(`"${token}" in "${source}" is not a valid time.`, 'days')
    return h * MINUTES_PER_HOUR + m
  }

  const match = CLOCK.exec(t)
  if (!match) throw new CalcError(`"${token}" in "${source}" is not a valid time.`, 'days')

  let h = Number(match[1])
  const m = match[2] === undefined ? 0 : Number(match[2])
  const meridiem = match[3]?.toLowerCase()

  if (!Number.isFinite(h) || !Number.isFinite(m))
    throw new CalcError(`"${token}" in "${source}" is not a valid time.`, 'days')

  if (meridiem) {
    if (h < 1 || h > 12)
      throw new CalcError(`"${token}" in "${source}" needs a 12-hour clock hour of 1 to 12.`, 'days')
    h = h % 12
    if (meridiem === 'pm') h += 12
  } else if (h > 24 || (h === 24 && m > 0)) {
    throw new CalcError(`"${token}" in "${source}" is past 24:00.`, 'days')
  }

  return h * MINUTES_PER_HOUR + m
}

function parseBreak(token: string, source: string): number {
  const t = token.trim()
  const hm = BREAK_HMM.exec(t)
  if (hm) return Number(hm[1]) * MINUTES_PER_HOUR + Number(hm[2])
  const hours = BREAK_HOURS.exec(t)
  if (hours) return Math.round(Number(hours[1]) * MINUTES_PER_HOUR)
  const mins = BREAK_MINUTES.exec(t)
  if (mins) return Math.round(Number(mins[1]))
  throw new CalcError(`"${token}" in "${source}" is not a break length in minutes.`, 'days')
}

function looksLikeBreak(token: string): boolean {
  return BREAK_HMM.test(token) || BREAK_HOURS.test(token) || BREAK_MINUTES.test(token)
}

function looksLikeRange(token: string): boolean {
  const m = RANGE.exec(token)
  if (!m) return false
  return /\d/.test(m[1]!) && /\d/.test(m[2]!)
}

/**
 * Splits the single line into one record per day.
 *
 * Grammar, greedily applied: optional label words, then a range token, then an
 * optional break token. A record ends when the next range token appears, so
 * `Mon 9:00-17:30 30 Tue 9:00-17:00` reads correctly with or without commas.
 */
function parseDays(raw: string): ParsedDay[] {
  const tokens = normalise(raw)
    .split(/[\s,;]+/)
    .filter((t) => t.length > 0)

  interface Draft {
    labelParts: string[]
    range: string
    breakToken?: string
  }

  const drafts: Draft[] = []
  let labelParts: string[] = []

  for (const token of tokens) {
    if (looksLikeRange(token)) {
      drafts.push({ labelParts, range: token })
      labelParts = []
      continue
    }
    const current = drafts[drafts.length - 1]
    if (current && current.breakToken === undefined && labelParts.length === 0 && looksLikeBreak(token)) {
      current.breakToken = token
      continue
    }
    labelParts.push(token)
  }

  if (labelParts.length > 0)
    throw new CalcError(
      `Could not read "${labelParts.join(' ')}" — every day needs a clock-in and clock-out, like "Mon 9:00-17:30 30".`,
      'days',
    )
  if (drafts.length === 0)
    throw new CalcError(
      'Enter at least one day, like "Mon 9:00-17:30 30" (name, in-out, unpaid break minutes).',
      'days',
    )
  if (drafts.length > 31)
    throw new CalcError('That is more than 31 days. Enter one week at a time.', 'days')

  return drafts.map((draft, i) => {
    const source = [...draft.labelParts, draft.range, draft.breakToken ?? '']
      .filter((p) => p !== '')
      .join(' ')
    const parts = RANGE.exec(draft.range)!
    const inMin = parseClock(parts[1]!, source)
    const outMin = parseClock(parts[2]!, source)

    // THE MIDNIGHT CROSSING. A shift clocking out at a smaller number than it
    // clocked in at ran through midnight: 22:00-06:00 is 8 hours, not -16.
    // Adding a full day to the clock-out is the whole fix. Equal times are a
    // zero-length shift, NOT a 24-hour one — a punch in and straight back out.
    let spanMin = outMin - inMin
    const crossesMidnight = spanMin < 0
    if (crossesMidnight) spanMin += MINUTES_PER_DAY

    const breakMin = draft.breakToken === undefined ? 0 : parseBreak(draft.breakToken, source)
    if (!Number.isFinite(breakMin) || breakMin < 0)
      throw new CalcError(`The unpaid break in "${source}" must be zero or more minutes.`, 'days')
    if (breakMin > spanMin)
      throw new CalcError(
        `The ${breakMin}-minute unpaid break in "${source}" is longer than the ${spanMin}-minute shift.`,
        'days',
      )

    return {
      source,
      label: draft.labelParts.length > 0 ? draft.labelParts.join(' ') : `Day ${i + 1}`,
      inMin,
      outMin,
      spanMin,
      breakMin,
      workedMin: spanMin - breakMin,
      crossesMidnight,
    }
  })
}

// ── Compute ───────────────────────────────────────────────────────────────

export default function compute(v: Values<typeof fields>): CalcResult {
  const { payRate, overtimeMultiplier } = v
  const overtimeRule = v.overtimeRule

  // Guard finiteness FIRST: coerceValues emits NaN for unparseable input, and
  // `payRate < 0` is false for NaN, so a magnitude test alone lets it through.
  if (!Number.isFinite(payRate) || !(payRate > 0))
    throw new CalcError('Enter an hourly pay rate greater than 0.', 'payRate')
  if (!Number.isFinite(overtimeMultiplier) || overtimeMultiplier < 1)
    throw new CalcError('The overtime multiplier cannot be below 1.', 'overtimeMultiplier')
  if (overtimeMultiplier > 3)
    throw new CalcError('The overtime multiplier cannot be above 3.', 'overtimeMultiplier')
  if (overtimeRule !== 'weekly' && overtimeRule !== 'daily' && overtimeRule !== 'none')
    throw new CalcError('Choose an overtime rule.', 'overtimeRule')

  const days = parseDays(v.days)

  // Integer minutes throughout. One conversion to hours, right at the end.
  let totalWorkedMin = 0
  let totalSpanMin = 0
  let totalBreakMin = 0
  let dailyOvertimeMin = 0
  for (const day of days) {
    totalWorkedMin += day.workedMin
    totalSpanMin += day.spanMin
    totalBreakMin += day.breakMin
    dailyOvertimeMin += Math.max(0, day.workedMin - DAILY_OVERTIME_THRESHOLD_MIN)
  }

  const overtimeMin =
    overtimeRule === 'weekly'
      ? Math.max(0, totalWorkedMin - WEEKLY_OVERTIME_THRESHOLD_MIN)
      : overtimeRule === 'daily'
        ? dailyOvertimeMin
        : 0
  const regularMin = totalWorkedMin - overtimeMin

  const totalHours = totalWorkedMin / MINUTES_PER_HOUR
  const regularHours = regularMin / MINUTES_PER_HOUR
  const overtimeHours = overtimeMin / MINUTES_PER_HOUR

  const regularPay = regularHours * payRate
  const overtimePay = overtimeHours * payRate * overtimeMultiplier
  // Gross is defined as the sum, so the two parts add up to it exactly by
  // construction rather than by luck — the donut prints this total.
  const grossPay = regularPay + overtimePay

  const ruleText =
    overtimeRule === 'weekly'
      ? 'Over 40 hours in the week (US federal, FLSA)'
      : overtimeRule === 'daily'
        ? 'Over 8 hours in a day (California-style)'
        : 'None — every hour at the base rate'

  const parts: Part[] = [
    { label: 'Regular pay', value: regularPay, format: MONEY },
    { label: 'Overtime pay', value: overtimePay, format: MONEY },
  ]

  // Exactly one line, always. A per-day series would make the count an input,
  // and the chart is server-rendered from the default result only. The point
  // count may vary freely; the anchor at (0, 0) guarantees at least two points
  // even for a single-day card.
  let running = 0
  const cumulative: Array<readonly [number, number]> = [[0, 0]]
  days.forEach((day, i) => {
    running += day.workedMin
    cumulative.push([i + 1, running / MINUTES_PER_HOUR])
  })

  const stats: Quantity[] = [
    { label: 'Total hours worked', value: totalHours, format: DECIMAL_HOURS },
    { label: 'Total, hours and minutes', value: hoursAndMinutes(totalWorkedMin), format: RAW },
    { label: 'Regular hours', value: regularHours, format: DECIMAL_HOURS },
    { label: 'Overtime hours', value: overtimeHours, format: DECIMAL_HOURS },
    { label: 'Regular pay', value: regularPay, format: MONEY },
    { label: 'Overtime pay', value: overtimePay, format: MONEY },
    { label: 'Days worked', value: days.length, format: { style: 'decimal', decimals: 0 } },
    { label: 'Unpaid breaks deducted', value: hoursAndMinutes(totalBreakMin), format: RAW },
    {
      label: 'Average day',
      value: hoursAndMinutes(totalWorkedMin / days.length),
      format: RAW,
    },
    { label: 'Overtime rule applied', value: ruleText, format: RAW },
  ]

  // Per-day detail lives here, where a varying row count is safe. The theme
  // clones its own template per stat, unlike the server-rendered donut and chart.
  for (const day of days) {
    stats.push({
      label: day.label,
      value: `${hoursAndMinutes(day.workedMin)} (${(day.workedMin / MINUTES_PER_HOUR).toFixed(2)} h)${
        day.crossesMidnight ? ' — overnight' : ''
      }`,
      format: RAW,
    })
  }

  const steps: Array<Quantity | StepRule> = [
    { label: 'Days entered', value: days.length, format: { style: 'decimal', decimals: 0 } },
    { label: 'Clock-in to clock-out', value: hoursAndMinutes(totalSpanMin), format: RAW },
    { label: 'Less unpaid breaks', value: hoursAndMinutes(totalBreakMin), format: RAW },
    { label: 'Hours worked', value: hoursAndMinutes(totalWorkedMin), format: RAW },
    { label: 'Hours worked, decimal', value: totalHours, format: DECIMAL_HOURS },
    { rule: true },
    { label: 'Overtime rule', value: ruleText, format: RAW },
    { label: 'Regular hours', value: regularHours, format: DECIMAL_HOURS },
    { label: 'Overtime hours', value: overtimeHours, format: DECIMAL_HOURS },
    { rule: true },
    { label: 'Pay rate', value: payRate, format: MONEY },
    { label: 'Regular pay = regular hours × rate', value: regularPay, format: MONEY },
    {
      label: `Overtime pay = overtime hours × rate × ${overtimeMultiplier}`,
      value: overtimePay,
      format: MONEY,
    },
    { label: 'Gross pay', value: grossPay, format: MONEY },
  ]

  const overnight = days.filter((d) => d.crossesMidnight)
  const zeroLength = days.filter((d) => d.spanMin === 0)

  const notes: string[] = [
    overtimeRule === 'weekly'
      ? 'Overtime is counted over 40 hours in the workweek, the US federal rule under the Fair Labor Standards Act (29 U.S.C. § 207(a)(1)). A long single day inside a short week earns no federal overtime.'
      : overtimeRule === 'daily'
        ? 'Overtime is counted over 8 hours in a single day, the rule used by California and several other states. The double-time tier past 12 hours and the seventh-consecutive-day rule are not applied here.'
        : 'No overtime premium is applied: every hour is paid at the base rate.',
    'Gross pay only. Income tax, FICA, benefits and other payroll deductions are not taken out.',
  ]
  if (overnight.length > 0)
    notes.push(
      `${overnight.length === 1 ? 'One shift runs' : `${overnight.length} shifts run`} past midnight and ${overnight.length === 1 ? 'is' : 'are'} counted forward into the next day, not backwards.`,
    )
  if (zeroLength.length > 0)
    notes.push(
      'A shift whose clock-out equals its clock-in is read as zero hours, not a full 24, so a mis-punch does not inflate the week.',
    )

  return {
    primary: { label: 'Gross pay for the period', value: grossPay, format: MONEY },
    stats,
    steps,
    notes,
    parts,
    series: [
      {
        label: 'Cumulative hours worked',
        points: cumulative,
        format: DECIMAL_HOURS,
      },
    ],
  }
}

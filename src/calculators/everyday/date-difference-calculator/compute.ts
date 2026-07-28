import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

const MS_PER_DAY = 86_400_000
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Parses an ISO date into a UTC midnight timestamp.
 *
 * Everything downstream is done in UTC on purpose: a local-time subtraction
 * across a daylight-saving boundary is 23 or 25 hours long, which silently
 * rounds a span to the wrong number of days. UTC has no such boundaries.
 */
function parseIsoUtc(raw: string, fieldId: string): number {
  const match = ISO_DATE.exec(raw.trim())
  if (!match) throw new CalcError('Enter a date as YYYY-MM-DD.', fieldId)

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  // Date.UTC maps two-digit years into the 1900s, so set the year explicitly.
  const date = new Date(Date.UTC(2000, month - 1, day))
  date.setUTCFullYear(year)
  const ms = date.getTime()

  if (!Number.isFinite(ms)) throw new CalcError('That date is not a real calendar date.', fieldId)
  // Rejects 2026-02-30 and friends, which JS would otherwise roll forward.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    throw new CalcError('That date is not a real calendar date.', fieldId)

  return ms
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const

/** Length of a given calendar month, February varying with the leap rule. */
function daysInMonth(year: number, monthIndex: number): number {
  return monthIndex === 1 && isLeap(year) ? 29 : MONTH_LENGTHS[monthIndex]!
}

/**
 * Adds whole calendar months to a UTC date, clamping the day to the end of the
 * target month — the convention that makes 31 January plus one month land on 28
 * February rather than rolling into March.
 */
function addMonthsUtc(from: Date, n: number): number {
  const total = from.getUTCMonth() + n
  const year = from.getUTCFullYear() + Math.floor(total / 12)
  const month = ((total % 12) + 12) % 12
  const day = Math.min(from.getUTCDate(), daysInMonth(year, month))
  const result = new Date(Date.UTC(2000, month, day))
  result.setUTCFullYear(year)
  return result.getTime()
}

/**
 * Counts Monday–Friday days in a half-open run of `days` days beginning on the
 * weekday `startDow` (0 = Sunday). Closed form, so a 500-year span costs the
 * same as a one-week span.
 */
function countBusinessDays(startDow: number, days: number): number {
  const fullWeeks = Math.floor(days / 7)
  let count = fullWeeks * 5
  const remainder = days - fullWeeks * 7
  for (let i = 0; i < remainder; i++) {
    const dow = (startDow + i) % 7
    if (dow !== 0 && dow !== 6) count++
  }
  return count
}

export default function compute(v: Values<typeof fields>): CalcResult {
  // Date fields arrive as strings; the toggle arrives as a real boolean.
  const { includeEndDate } = v

  const startMs = parseIsoUtc(v.startDate, 'startDate')
  const rawEndMs = parseIsoUtc(v.endDate, 'endDate')

  if (rawEndMs < startMs)
    throw new CalcError('The end date must fall on or after the start date.', 'endDate')

  // Counting the end date as a full day is the same as moving the exclusive
  // upper bound forward by one day, so every figure below stays consistent.
  const endMs = rawEndMs + (includeEndDate ? MS_PER_DAY : 0)

  const totalDays = Math.round((endMs - startMs) / MS_PER_DAY)
  const start = new Date(startMs)
  const end = new Date(endMs)

  // Calendar breakdown: count whole months forward from the start date, then
  // measure the leftover in days. Stepping forward (rather than subtracting
  // day-of-month numbers) is what keeps 31 Jan → 1 Mar at "1 month, 1 day".
  let totalMonths =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth())
  if (totalMonths > 0 && addMonthsUtc(start, totalMonths) > endMs) totalMonths--
  const days = Math.round((endMs - addMonthsUtc(start, totalMonths)) / MS_PER_DAY)
  const years = Math.floor(totalMonths / 12)
  const months = totalMonths % 12
  const businessDays = countBusinessDays(start.getUTCDay(), totalDays)
  const weekendDays = totalDays - businessDays
  // One canonical rendering of the calendar breakdown, reused by the stat and
  // the step below. A `duration` spec cannot be used here: the shared formatter
  // approximates a month as 30 days, which disagrees with the exact calendar
  // walk above (208 days is "6 months 28 days" approximated, "6m 27d" exactly).
  const breakdown = `${years}y ${months}m ${days}d`

  return {
    primary: {
      label: 'Days between',
      value: totalDays,
      format: { style: 'decimal', decimals: 0, unit: totalDays === 1 ? 'day' : 'days' },
    },
    stats: [
      { label: 'Calendar span', value: breakdown, format: { style: 'raw' } },
      { label: 'Weeks', value: totalDays / 7, format: { style: 'decimal', decimals: 2 } },
      {
        label: 'Business days',
        value: businessDays,
        format: { style: 'decimal', decimals: 0 },
      },
      { label: 'Weekend days', value: weekendDays, format: { style: 'decimal', decimals: 0 } },
      { label: 'Complete months', value: totalMonths, format: { style: 'decimal', decimals: 0 } },
      { label: 'Complete years', value: years, format: { style: 'decimal', decimals: 0 } },
    ],
    steps: [
      { label: 'Start date', value: v.startDate, format: { style: 'raw' } },
      { label: 'End date', value: v.endDate, format: { style: 'raw' } },
      {
        label: 'End date counted as a full day',
        value: includeEndDate ? 'Yes' : 'No',
        format: { style: 'raw' },
      },
      { rule: true },
      { label: 'Total days', value: totalDays, format: { style: 'decimal', decimals: 0 } },
      {
        label: 'Years, months and days',
        value: breakdown,
        format: { style: 'raw' },
      },
      { label: 'Total hours', value: totalDays * 24, format: { style: 'decimal', decimals: 0 } },
      {
        label: 'Total minutes',
        value: totalDays * 1440,
        format: { style: 'decimal', decimals: 0 },
      },
      { rule: true },
      {
        label: 'Whole weeks in the span',
        value: Math.floor(totalDays / 7),
        format: { style: 'decimal', decimals: 0 },
      },
      { label: 'Weekday days (Mon–Fri)', value: businessDays, format: { style: 'decimal', decimals: 0 } },
      { label: 'Weekend days (Sat–Sun)', value: weekendDays, format: { style: 'decimal', decimals: 0 } },
    ],
    // Every day in the span is either a weekday or a weekend day, so these two
    // slices partition the total exactly, by construction of `weekendDays`.
    parts: [
      { label: 'Business days', value: businessDays, format: { style: 'decimal', decimals: 0 } },
      { label: 'Weekend days', value: weekendDays, format: { style: 'decimal', decimals: 0 } },
    ],
    partsTotal: {
      label: 'Total days',
      value: businessDays + weekendDays,
      format: { style: 'decimal', decimals: 0, unit: totalDays === 1 ? 'day' : 'days' },
    },
    notes: [
      'Dates are compared at UTC midnight, so daylight-saving changes never add or lose a day.',
      includeEndDate
        ? 'The end date is counted, so a single-day booking reads as 1 day.'
        : 'The end date is not counted, so same start and end dates read as 0 days elapsed.',
      'Business days exclude Saturdays and Sundays only — public holidays are not deducted.',
    ],
  }
}

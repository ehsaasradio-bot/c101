import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

const MS_PER_DAY = 86_400_000

interface Ymd {
  year: number
  month: number
  day: number
}

const pad = (n: number): string => String(n).padStart(2, '0')

const isLeapYear = (year: number): boolean =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0

/** Days in `month` (1–12) of `year`. */
function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31
}

/**
 * Parses `YYYY-MM-DD` by hand rather than via `new Date(string)`. The Date
 * constructor would resolve in the runtime's local zone, so the same input
 * could produce a different age on a server in Auckland than in a browser in
 * Los Angeles. Field-by-field parsing keeps the result deterministic, and also
 * rejects impossible calendar days like 2025-02-30, which Date silently rolls
 * over into March.
 */
function parseIsoDate(raw: string, fieldId: string): Ymd {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(raw).trim())
  if (!match) throw new CalcError('Enter a date as YYYY-MM-DD.', fieldId)

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  if (month < 1 || month > 12) throw new CalcError('Month must be between 01 and 12.', fieldId)
  if (day < 1 || day > daysInMonth(year, month))
    throw new CalcError('That day does not exist in that month.', fieldId)

  return { year, month, day }
}

/** Days since the epoch. UTC-based, so no daylight-saving hour ever shifts it. */
const toEpochDay = (d: Ymd): number => Date.UTC(d.year, d.month - 1, d.day) / MS_PER_DAY

/** The month immediately before `{year, month}`, wrapping across January. */
const previousMonth = (year: number, month: number): { year: number; month: number } =>
  month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }

export default function compute(v: Values<typeof fields>): CalcResult {
  // Both fields are dates, so they arrive as strings — the derived Values type
  // makes forgetting that a compile error rather than a NaN at runtime.
  const birth = parseIsoDate(v.birthDate, 'birthDate')
  const asOf = parseIsoDate(v.asOfDate, 'asOfDate')

  const birthDay = toEpochDay(birth)
  const asOfDay = toEpochDay(asOf)

  if (birthDay > asOfDay)
    throw new CalcError('Date of birth must be on or before the "age at" date.', 'birthDate')

  // Calendar subtraction with borrowing. When the day of the month is short we
  // borrow the length of the month *preceding the as-of date* — borrowing a
  // flat 30 or the birth month's length would both be wrong across February.
  // The loop matters: from 31 January to 1 March, one borrow (29 days in
  // February 2000) still leaves the day count negative, so it borrows January
  // as well rather than returning a negative component.
  //
  // For a birth day of 29–31 this differs from the other common convention,
  // which clamps "31 January plus one month" to 29 February. Borrowing is the
  // convention that inverts: birth date + years + months (letting an impossible
  // day roll into the next month) + days lands back on the as-of date exactly.
  // compute.test.ts asserts that round trip on every case it checks.
  let years = asOf.year - birth.year
  let months = asOf.month - birth.month
  let days = asOf.day - birth.day

  let cursor = { year: asOf.year, month: asOf.month }
  while (days < 0) {
    cursor = previousMonth(cursor.year, cursor.month)
    days += daysInMonth(cursor.year, cursor.month)
    months -= 1
  }
  if (months < 0) {
    months += 12
    years -= 1
  }

  const totalDays = asOfDay - birthDay
  const totalWeeks = Math.floor(totalDays / 7)
  const totalMonths = years * 12 + months

  // A 29 February birthday has no anniversary in a common year. The widespread
  // civil convention (and the one most legal systems use) is that the birthday
  // falls on 1 March in those years.
  const bornOnLeapDay = birth.month === 2 && birth.day === 29
  const birthdayIn = (year: number): Ymd =>
    bornOnLeapDay && !isLeapYear(year)
      ? { year, month: 3, day: 1 }
      : { year, month: birth.month, day: birth.day }

  let nextBirthday = birthdayIn(asOf.year)
  if (toEpochDay(nextBirthday) < asOfDay) nextBirthday = birthdayIn(asOf.year + 1)
  const daysToNextBirthday = toEpochDay(nextBirthday) - asOfDay
  const isBirthdayToday = daysToNextBirthday === 0
  const ageAtNextBirthday = nextBirthday.year - birth.year

  const notes: string[] = []
  if (isBirthdayToday) notes.push('The as-of date is a birthday, so the countdown reads zero days.')
  if (bornOnLeapDay)
    notes.push(
      'A 29 February birthday only recurs in leap years; in common years this calculator treats 1 March as the anniversary.',
    )
  return {
    primary: {
      label: 'Age',
      value: years,
      format: { style: 'decimal', decimals: 0, unit: years === 1 ? 'year' : 'years' },
    },
    stats: [
      { label: 'Months past that birthday', value: months, format: { style: 'decimal', decimals: 0 } },
      { label: 'Days past that', value: days, format: { style: 'decimal', decimals: 0 } },
      { label: 'Age in months', value: totalMonths, format: { style: 'decimal', decimals: 0 } },
      { label: 'Age in weeks', value: totalWeeks, format: { style: 'decimal', decimals: 0 } },
      { label: 'Days lived', value: totalDays, format: { style: 'decimal', decimals: 0 } },
      {
        label: 'Days to next birthday',
        value: daysToNextBirthday,
        format: { style: 'decimal', decimals: 0 },
      },
      {
        label: 'Turning',
        value: ageAtNextBirthday,
        format: { style: 'decimal', decimals: 0 },
      },
    ],
    steps: [
      { label: 'Date of birth', value: `${birth.year}-${pad(birth.month)}-${pad(birth.day)}`, format: { style: 'raw' } },
      { label: 'Age at date', value: `${asOf.year}-${pad(asOf.month)}-${pad(asOf.day)}`, format: { style: 'raw' } },
      { rule: true },
      { label: 'Whole years elapsed', value: years, format: { style: 'decimal', decimals: 0 } },
      { label: 'Whole months after that', value: months, format: { style: 'decimal', decimals: 0 } },
      { label: 'Remaining days', value: days, format: { style: 'decimal', decimals: 0 } },
      { rule: true },
      { label: 'Total days between the dates', value: totalDays, format: { style: 'decimal', decimals: 0 } },
      { label: 'That span written out', value: totalDays, format: { style: 'duration', from: 'days' } },
      { label: 'Complete weeks', value: totalWeeks, format: { style: 'decimal', decimals: 0 } },
      { label: 'Complete months', value: totalMonths, format: { style: 'decimal', decimals: 0 } },
      { rule: true },
      {
        label: 'Next birthday',
        value: `${nextBirthday.year}-${pad(nextBirthday.month)}-${pad(nextBirthday.day)}`,
        format: { style: 'raw' },
      },
      {
        label: 'Days until then',
        value: daysToNextBirthday,
        format: { style: 'decimal', decimals: 0 },
      },
    ],
    notes,
  }
}

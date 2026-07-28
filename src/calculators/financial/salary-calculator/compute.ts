import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

/** A conventional work week is five days; only the daily rate depends on this. */
const DAYS_PER_WEEK = 5
const MONTHS_PER_YEAR = 12
const SEMI_MONTHLY_PERIODS_PER_YEAR = 24

/**
 * How many of each pay period fit in one year, given the working pattern.
 *
 * Everything except monthly/semi-monthly/annual is anchored on `weeksPerYear`
 * rather than on the calendar, so converting a period to annual and back is an
 * exact round trip even when some weeks of the year are unpaid.
 */
function periodsPerYear(hoursPerWeek: number, weeksPerYear: number) {
  return {
    hourly: hoursPerWeek * weeksPerYear,
    daily: DAYS_PER_WEEK * weeksPerYear,
    weekly: weeksPerYear,
    biweekly: weeksPerYear / 2,
    semiMonthly: SEMI_MONTHLY_PERIODS_PER_YEAR,
    monthly: MONTHS_PER_YEAR,
    annual: 1,
  }
}

type PeriodId = keyof ReturnType<typeof periodsPerYear>

export default function compute(v: Values<typeof fields>): CalcResult {
  const { amount, hoursPerWeek, weeksPerYear } = v
  // `payPeriod` is a select, so it arrives as a string.
  const payPeriod = v.payPeriod

  if (!Number.isFinite(amount) || !(amount > 0))
    throw new CalcError('Enter a pay amount greater than 0.', 'amount')
  if (!Number.isFinite(hoursPerWeek) || !(hoursPerWeek > 0))
    throw new CalcError('Hours per week must be greater than 0.', 'hoursPerWeek')
  if (hoursPerWeek > 168)
    throw new CalcError('A week only has 168 hours.', 'hoursPerWeek')
  if (!Number.isFinite(weeksPerYear) || !(weeksPerYear > 0))
    throw new CalcError('Paid weeks per year must be greater than 0.', 'weeksPerYear')
  if (weeksPerYear > 52)
    throw new CalcError('A year only has 52 weeks.', 'weeksPerYear')

  const counts = periodsPerYear(hoursPerWeek, weeksPerYear)
  if (!Object.prototype.hasOwnProperty.call(counts, payPeriod) || payPeriod === 'semiMonthly')
    throw new CalcError('Choose a pay period.', 'payPeriod')

  // Normalise to annual first; every other period is then a single division.
  const annual = amount * counts[payPeriod as PeriodId]

  const per = (id: PeriodId) => annual / counts[id]

  return {
    primary: {
      label: 'Annual salary',
      value: annual,
      format: { style: 'currency', decimals: 0 },
    },
    stats: [
      { label: 'Hourly', value: per('hourly'), format: { style: 'currency' } },
      { label: 'Daily', value: per('daily'), format: { style: 'currency' } },
      { label: 'Weekly', value: per('weekly'), format: { style: 'currency' } },
      { label: 'Biweekly', value: per('biweekly'), format: { style: 'currency' } },
      { label: 'Semi-monthly', value: per('semiMonthly'), format: { style: 'currency' } },
      { label: 'Monthly', value: per('monthly'), format: { style: 'currency' } },
    ],
    steps: [
      { label: 'Amount entered', value: amount, format: { style: 'currency' } },
      {
        label: 'Pay periods per year',
        value: counts[payPeriod as PeriodId],
        format: { style: 'decimal', decimals: 2 },
      },
      { label: 'Annual gross', value: annual, format: { style: 'currency', decimals: 0 } },
      { rule: true },
      { label: 'Hours per week', value: hoursPerWeek, format: { style: 'decimal', decimals: 1 } },
      { label: 'Paid weeks per year', value: weeksPerYear, format: { style: 'decimal', decimals: 0 } },
      {
        label: 'Hours worked per year',
        value: counts.hourly,
        format: { style: 'decimal', decimals: 0 },
      },
      {
        label: 'Working days per year',
        value: counts.daily,
        format: { style: 'decimal', decimals: 0 },
      },
    ],
    notes: [
      'Figures are gross pay, before income tax, payroll deductions, and benefits.',
      'The daily rate assumes a five-day working week.',
      ...(weeksPerYear < 52
        ? ['Unpaid weeks lower the annual total but leave the hourly rate unchanged.']
        : []),
    ],
  }
}

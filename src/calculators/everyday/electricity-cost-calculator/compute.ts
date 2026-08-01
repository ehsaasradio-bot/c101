import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

const MONTHS_PER_YEAR = 12
const WATTS_PER_KILOWATT = 1000

export default function compute(v: Values<typeof fields>): CalcResult {
  const { watts, hoursPerDay, daysPerMonth, ratePerKwh } = v

  // Every guard tests finiteness first: the form layer hands compute a raw NaN
  // for anything it could not parse, and NaN fails every ordinary comparison,
  // so a bare `x < 0` check would let it fall through into the arithmetic and
  // surface as a NaN result instead of a CalcError.
  if (!Number.isFinite(watts) || !(watts > 0))
    throw new CalcError('Enter an appliance power greater than 0 W.', 'watts')
  if (!Number.isFinite(hoursPerDay))
    throw new CalcError('Enter the hours used per day as a number.', 'hoursPerDay')
  if (hoursPerDay < 0) throw new CalcError('Hours per day cannot be negative.', 'hoursPerDay')
  if (hoursPerDay > 24) throw new CalcError('A day only has 24 hours.', 'hoursPerDay')
  if (!Number.isFinite(daysPerMonth))
    throw new CalcError('Enter the days used per month as a number.', 'daysPerMonth')
  if (daysPerMonth < 0) throw new CalcError('Days per month cannot be negative.', 'daysPerMonth')
  if (daysPerMonth > 31) throw new CalcError('No month has more than 31 days.', 'daysPerMonth')
  if (!Number.isFinite(ratePerKwh))
    throw new CalcError('Enter your electricity rate as a number.', 'ratePerKwh')
  if (ratePerKwh < 0) throw new CalcError('Electricity rate cannot be negative.', 'ratePerKwh')

  const kilowatts = watts / WATTS_PER_KILOWATT
  const kwhPerDay = kilowatts * hoursPerDay
  const kwhPerMonth = kwhPerDay * daysPerMonth
  const kwhPerYear = kwhPerMonth * MONTHS_PER_YEAR

  const costPerDay = kwhPerDay * ratePerKwh
  const costPerMonth = kwhPerMonth * ratePerKwh
  const costPerYear = kwhPerYear * ratePerKwh

  // Useful for comparing two appliances at a glance, and it is the only figure
  // here that is independent of how often the thing is switched on.
  const costPerHour = kilowatts * ratePerKwh

  // Running total across the year. Month m is m × costPerMonth rather than an
  // accumulating sum, so floating-point error cannot compound and month 12
  // lands on exactly the `costPerYear` printed in the stats above — which is
  // itself kwhPerMonth × 12 × rate, the same product in a different order.
  const cumulativePoints: Array<readonly [number, number]> = []
  for (let month = 1; month <= MONTHS_PER_YEAR; month++) {
    cumulativePoints.push([month, month === MONTHS_PER_YEAR ? costPerYear : month * costPerMonth])
  }

  return {
    primary: {
      label: 'Cost per month',
      value: costPerMonth,
      format: { style: 'currency' },
    },
    stats: [
      { label: 'Cost per day', value: costPerDay, format: { style: 'currency' } },
      { label: 'Cost per year', value: costPerYear, format: { style: 'currency', decimals: 0 } },
      {
        label: 'kWh per month',
        value: kwhPerMonth,
        format: { style: 'decimal', decimals: 1, unit: 'kWh' },
      },
      {
        label: 'kWh per year',
        value: kwhPerYear,
        format: { style: 'decimal', decimals: 0, unit: 'kWh' },
      },
      { label: 'Cost per running hour', value: costPerHour, format: { style: 'currency' } },
    ],
    steps: [
      {
        label: 'Power in kilowatts',
        value: kilowatts,
        format: { style: 'decimal', decimals: 3, unit: 'kW' },
      },
      {
        label: 'Hours per day',
        value: hoursPerDay,
        format: { style: 'decimal', decimals: 1, unit: 'h' },
      },
      {
        label: 'kWh per day = kW × hours',
        value: kwhPerDay,
        format: { style: 'decimal', decimals: 3, unit: 'kWh' },
      },
      { rule: true },
      {
        label: 'Days used per month',
        value: daysPerMonth,
        format: { style: 'decimal', decimals: 0, unit: 'days' },
      },
      {
        label: 'kWh per month',
        value: kwhPerMonth,
        format: { style: 'decimal', decimals: 2, unit: 'kWh' },
      },
      { rule: true },
      { label: 'Rate', value: ratePerKwh, format: { style: 'currency', decimals: 3 } },
      {
        label: 'Cost per month = kWh × rate',
        value: costPerMonth,
        format: { style: 'currency' },
      },
      { label: 'Cost per year = month × 12', value: costPerYear, format: { style: 'currency' } },
    ],
    series: [
      {
        label: 'Cumulative cost',
        points: cumulativePoints,
        format: { style: 'currency', decimals: 0 },
      },
    ],
    chart: { title: 'Cumulative cost over the year', xLabel: 'Months' },
    notes: [
      'Yearly figures are simply twelve times the monthly ones, so they cover twelve times the days you entered per month — at the default 30 days that is a 360-day year, about 1.4% short of 365 days. Enter 30.4 days per month if you want the yearly total to track a full calendar year.',
      'Motor and heating appliances rarely draw their rated wattage continuously — a fridge or thermostat-controlled heater cycles on and off, so its real average draw is well below the plate rating.',
    ],
  }
}

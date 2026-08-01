import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

/** Exact by definition: 1 international mile = 1609.344 m. */
const KM_PER_MILE = 1.609344

const RACE_KM = [
  { label: '5K finish', km: 5 },
  { label: '10K finish', km: 10 },
  { label: 'Half marathon finish', km: 21.0975 },
  { label: 'Marathon finish', km: 42.195 },
] as const

export default function compute(v: Values<typeof fields>): CalcResult {
  const { distance, hours, minutes, seconds } = v
  const miles = v.distanceUnit === 'mi'

  if (!Number.isFinite(distance) || !(distance > 0))
    throw new CalcError('Enter a distance greater than 0.', 'distance')
  if (!Number.isFinite(hours) || hours < 0)
    throw new CalcError('Hours cannot be negative.', 'hours')
  if (!Number.isFinite(minutes) || minutes < 0 || minutes >= 60)
    throw new CalcError('Minutes must be between 0 and 59.', 'minutes')
  if (!Number.isFinite(seconds) || seconds < 0 || seconds >= 60)
    throw new CalcError('Seconds must be between 0 and 59.', 'seconds')

  const totalSeconds = hours * 3600 + minutes * 60 + seconds
  if (!(totalSeconds > 0))
    throw new CalcError('Enter a finishing time greater than zero.', 'minutes')

  const km = miles ? distance * KM_PER_MILE : distance
  const mi = km / KM_PER_MILE

  const secPerKm = totalSeconds / km
  const secPerMile = secPerKm * KM_PER_MILE
  const kmPerHour = 3600 / secPerKm
  const milesPerHour = kmPerHour / KM_PER_MILE

  // Race predictions, computed once and used for both the stat grid and the
  // curve, so the chart cannot drift from the numbers printed beside it.
  const predictions = RACE_KM.map((race) => ({ ...race, seconds: race.km * secPerKm }))

  return {
    primary: {
      label: miles ? 'Pace per mile' : 'Pace per kilometre',
      value: miles ? secPerMile : secPerKm,
      format: { style: 'duration', from: 'seconds' },
    },
    stats: [
      {
        label: miles ? 'Pace per kilometre' : 'Pace per mile',
        value: miles ? secPerKm : secPerMile,
        format: { style: 'duration', from: 'seconds' },
      },
      { label: 'Speed', value: kmPerHour, format: { style: 'decimal', decimals: 2, unit: 'km/h' } },
      { label: 'Speed', value: milesPerHour, format: { style: 'decimal', decimals: 2, unit: 'mph' } },
      ...predictions.map((race) => ({
        label: race.label,
        value: race.seconds,
        format: { style: 'duration', from: 'seconds' } as const,
      })),
    ],
    series: [
      {
        label: 'Predicted finish',
        points: predictions.map((race) => [race.km, race.seconds] as const),
        format: { style: 'duration', from: 'seconds' },
      },
    ],
    chart: { title: 'Predicted finish by distance', xLabel: 'Distance' },
    steps: [
      { label: 'Total time', value: totalSeconds, format: { style: 'duration', from: 'seconds' } },
      { label: 'Distance', value: km, format: { style: 'decimal', decimals: 3, unit: 'km' } },
      { label: 'Distance', value: mi, format: { style: 'decimal', decimals: 3, unit: 'mi' } },
      { rule: true },
      {
        label: 'Pace = time ÷ distance',
        value: secPerKm,
        format: { style: 'duration', from: 'seconds' },
      },
      {
        label: 'Seconds per kilometre',
        value: secPerKm,
        format: { style: 'decimal', decimals: 1, unit: 's' },
      },
      {
        label: 'Speed = 3600 ÷ seconds per km',
        value: kmPerHour,
        format: { style: 'decimal', decimals: 2, unit: 'km/h' },
      },
    ],
    notes: [
      'Race predictions here hold your current pace constant over the longer distance. Real finishing times drift slower as distance grows — Riegel’s formula (time × ratio^1.06) is the usual correction for that fade.',
    ],
  }
}

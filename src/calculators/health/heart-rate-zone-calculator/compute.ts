import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, Values } from '../../../lib/types'
import type { fields } from './fields'

/**
 * The five classic training zones, as whole-percent shares of heart rate
 * reserve. They are contiguous by construction: each zone's `to` is the next
 * zone's `from`, so the printed ranges tile the whole reserve with no gaps.
 *
 * Percentages are integers rather than 0.6-style fractions so that
 * `reserve * percent / 100` divides an exact integer — a target that lands on a
 * true half-beat then rounds the same way every time.
 */
const ZONES = [
  { name: 'Zone 1 — Recovery', from: 50, to: 60 },
  { name: 'Zone 2 — Endurance', from: 60, to: 70 },
  { name: 'Zone 3 — Tempo', from: 70, to: 80 },
  { name: 'Zone 4 — Threshold', from: 80, to: 90 },
  { name: 'Zone 5 — VO2 max', from: 90, to: 100 },
] as const

export default function compute(v: Values<typeof fields>): CalcResult {
  const { age, restingHeartRate } = v

  if (!(age > 0)) throw new CalcError('Enter an age greater than 0.', 'age')
  if (age >= 120) throw new CalcError('Enter an age below 120.', 'age')
  if (!(restingHeartRate > 0))
    throw new CalcError('Enter a resting heart rate greater than 0.', 'restingHeartRate')

  // Fox formula. Crude but universal, and the basis every Karvonen table uses.
  const maxHeartRate = 220 - age

  if (restingHeartRate >= maxHeartRate)
    throw new CalcError(
      'Resting heart rate must be below your estimated maximum heart rate.',
      'restingHeartRate',
    )

  // Karvonen: target = resting + reserve x intensity, so the zones are anchored
  // to your own floor instead of to zero.
  const reserve = maxHeartRate - restingHeartRate
  /** @param percent whole percent of heart rate reserve, 0–100. */
  const target = (percent: number) => restingHeartRate + (reserve * percent) / 100

  const zoneStats: Quantity[] = ZONES.map((zone) => ({
    label: `${zone.name} (${zone.from}–${zone.to}%)`,
    value: `${Math.round(target(zone.from))}–${Math.round(target(zone.to))} bpm`,
    format: { style: 'raw' },
  }))

  return {
    primary: {
      label: 'Estimated maximum heart rate',
      value: maxHeartRate,
      format: { style: 'decimal', decimals: 0, unit: 'bpm' },
    },
    // The meter reads resting heart rate, which is the input with a genuine
    // good/bad axis — a maximum heart rate is neither good nor bad, it is age.
    scaleValue: restingHeartRate,
    stats: zoneStats,
    steps: [
      { label: 'Age', value: age, format: { style: 'decimal', decimals: 0, unit: 'years' } },
      {
        label: 'Maximum heart rate = 220 − age',
        value: maxHeartRate,
        format: { style: 'decimal', decimals: 0, unit: 'bpm' },
      },
      {
        label: 'Resting heart rate',
        value: restingHeartRate,
        format: { style: 'decimal', decimals: 0, unit: 'bpm' },
      },
      {
        label: 'Heart rate reserve = max − resting',
        value: reserve,
        format: { style: 'decimal', decimals: 0, unit: 'bpm' },
      },
      { rule: true },
      {
        label: 'Easy end of the aerobic base (60% of reserve)',
        value: target(60),
        format: { style: 'decimal', decimals: 0, unit: 'bpm' },
      },
      {
        label: 'Lactate threshold estimate (85% of reserve)',
        value: target(85),
        format: { style: 'decimal', decimals: 0, unit: 'bpm' },
      },
      {
        label: 'One percent of reserve',
        value: reserve / 100,
        format: { style: 'decimal', decimals: 2, unit: 'bpm' },
      },
    ],
    notes: [
      'The 220 − age formula carries a standard deviation of roughly 10–12 bpm, so these zones are a starting point, not a measurement. A lab test or a hard field effort gives a far better maximum.',
      'Medications such as beta blockers lower both resting and maximum heart rate, which shifts every zone downward.',
    ],
  }
}

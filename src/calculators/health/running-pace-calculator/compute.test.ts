import { describe, expect, test } from 'vitest'
import compute from './compute'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'

const KM_PER_MILE = 1.609344

const base = {
  distance: 5,
  distanceUnit: 'km',
  hours: 0,
  minutes: 25,
  seconds: 0,
} as const

const stat = (r: ReturnType<typeof compute>, label: string, index = 0) =>
  Number(r.stats!.filter((s) => s.label === label)[index]!.value)

describe('running pace', () => {
  test('5 km in 25:00 is a 5:00/km pace', () => {
    const r = compute(base)
    // 25 minutes = 1500 s over 5 km.
    expect(Number(r.primary.value)).toBeCloseTo(300, 9)
    expect(r.primary.format).toEqual({ style: 'duration', from: 'seconds' })
  })

  test('the reported speed reproduces the run when simulated second by second', () => {
    // Independent check: run forward at the reported km/h in 1-second ticks and
    // see how long 5 km takes. It must come back to the entered 25 minutes.
    const kmh = stat(compute(base), 'Speed', 0)
    const perTick = kmh / 3600
    let covered = 0
    let ticks = 0
    while (covered < 5 - 1e-12) {
      covered += perTick
      ticks++
    }
    expect(ticks).toBe(25 * 60)
  })

  test('mph and per-mile pace follow the exact mile definition', () => {
    const r = compute(base)
    expect(stat(r, 'Pace per mile')).toBeCloseTo(300 * KM_PER_MILE, 9) // ≈ 482.80 s
    expect(stat(r, 'Speed', 1)).toBeCloseTo(12 / KM_PER_MILE, 9)
    expect(stat(r, 'Speed', 0)).toBeCloseTo(12, 9)
  })

  test('the same run entered in miles gives an identical per-km pace', () => {
    const inMiles = compute({ ...base, distance: 5 / KM_PER_MILE, distanceUnit: 'mi' })
    expect(stat(inMiles, 'Pace per kilometre')).toBeCloseTo(300, 9)
    // …and the primary flips to the per-mile figure when miles are selected.
    expect(Number(inMiles.primary.value)).toBeCloseTo(300 * KM_PER_MILE, 9)
    expect(inMiles.primary.label).toBe('Pace per mile')
  })

  test('predicted marathon time matches kilometre-by-kilometre accumulation', () => {
    const r = compute(base)
    const secPerKm = 300
    let remaining = 42.195
    let total = 0
    while (remaining > 0) {
      const leg = Math.min(1, remaining)
      total += leg * secPerKm
      remaining -= leg
    }
    expect(stat(r, 'Marathon finish')).toBeCloseTo(total, 6)
    expect(stat(r, 'Marathon finish')).toBeCloseTo(12658.5, 6) // 3:30:58.5
    // Half is exactly half a marathon, 10K exactly twice the 5K.
    expect(stat(r, 'Half marathon finish')).toBeCloseTo(stat(r, 'Marathon finish') / 2, 6)
    expect(stat(r, '10K finish')).toBeCloseTo(2 * stat(r, '5K finish'), 9)
    expect(stat(r, '5K finish')).toBeCloseTo(1500, 9)
  })

  test('a boundary time of 59 minutes 59 seconds is accepted', () => {
    const r = compute({ ...base, distance: 10, minutes: 59, seconds: 59 })
    expect(Number(r.primary.value)).toBeCloseTo(3599 / 10, 9)
  })

  test('hours are added on top of minutes and seconds', () => {
    const r = compute({ ...base, distance: 42.195, hours: 3, minutes: 30, seconds: 58.5 })
    expect(Number(r.primary.value)).toBeCloseTo(300, 6)
  })

  test('nudging the first number field to 1.1x stays valid and changes the result', () => {
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('distance')
    const nudged = first.default * 1.1
    expect(nudged).toBeGreaterThanOrEqual(first.min!)
    expect(nudged).toBeLessThanOrEqual(first.max!)
    const changed = compute({ ...base, distance: nudged })
    expect(Number(changed.primary.value)).toBeCloseTo(1500 / 5.5, 9)
    expect(Number(changed.primary.value)).not.toBeCloseTo(Number(compute(base).primary.value), 6)
  })

  test.each([
    ['zero distance', { distance: 0 }, 'distance'],
    ['negative distance', { distance: -5 }, 'distance'],
    ['negative hours', { hours: -1 }, 'hours'],
    ['minutes at 60', { minutes: 60 }, 'minutes'],
    ['negative seconds', { seconds: -1 }, 'seconds'],
    ['seconds at 60', { seconds: 60 }, 'seconds'],
    ['a total time of zero', { hours: 0, minutes: 0, seconds: 0 }, 'minutes'],
    ['a non-numeric distance', { distance: Number.NaN }, 'distance'],
  ])('rejects %s', (_label, patch, fieldId) => {
    let thrown: unknown
    try {
      compute({ ...base, ...patch })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
  })

  test('the predicted-finish series is ordered by distance', () => {
    for (const input of [base, { ...base, distance: 10, minutes: 55 }, { ...base, hours: 1 }]) {
      const series = compute(input).series!
      expect(series).toHaveLength(1)
      expect(series[0]!.label).toBe('Predicted finish')
      const points = series[0]!.points
      expect(points.length).toBeGreaterThanOrEqual(2)
      expect(points.length).toBeLessThanOrEqual(45)
      points.forEach(([x, y], i) => {
        expect(Number.isFinite(x)).toBe(true)
        expect(Number.isFinite(y)).toBe(true)
        if (i > 0) expect(x).toBeGreaterThan(points[i - 1]![0])
      })
      expect(points.map(([x]) => x)).toEqual([5, 10, 21.0975, 42.195])
    }
  })

  test('the series repeats the race stats exactly, so chart and grid agree', () => {
    const labels = ['5K finish', '10K finish', 'Half marathon finish', 'Marathon finish']
    for (const input of [base, { ...base, distance: 8, minutes: 40, seconds: 12 }]) {
      const r = compute(input)
      const points = r.series![0]!.points
      labels.forEach((label, i) => {
        // Exact equality, not closeness: both come from the same expression.
        expect(points[i]![1]).toBe(stat(r, label))
      })
    }
  })

  test('predicted times grow with distance at the held pace', () => {
    const points = compute(base).series![0]!.points
    points.forEach(([, y], i) => {
      if (i > 0) expect(y).toBeGreaterThan(points[i - 1]![1])
    })
    // 5 km at 5:00/km is 1500 s, and the marathon is 42.195 times that pace.
    expect(points[0]![1]).toBeCloseTo(1500, 9)
    expect(points[3]![1]).toBeCloseTo(12658.5, 6)
  })

  test('never returns NaN for any quantity', () => {
    const r = compute(base)
    const all = [r.primary, ...r.stats!, ...r.steps!.filter((s) => 'value' in s)]
    for (const q of all) expect(Number.isFinite(Number((q as { value: number }).value))).toBe(true)
  })
})

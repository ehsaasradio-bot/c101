import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'

const base = {
  watts: 1500,
  hoursPerDay: 5,
  daysPerMonth: 30,
  ratePerKwh: 0.2,
} as const

const stat = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)

describe('electricity cost', () => {
  test('a 1500 W heater, 5 h/day, 30 days at $0.20/kWh costs $45 a month', () => {
    // 1.5 kW × 5 h = 7.5 kWh/day; × 30 = 225 kWh; × $0.20 = $45.00
    const r = compute(base)
    expect(Number(r.primary.value)).toBeCloseTo(45, 10)
    expect(stat(r, 'kWh per month')).toBeCloseTo(225, 10)
  })

  test('the closed form matches a day-by-day accumulation', () => {
    // Independent method: no kWh-per-month shortcut, just add up each day.
    const v = { watts: 1234, hoursPerDay: 3.5, daysPerMonth: 31, ratePerKwh: 0.1734 }
    let kwh = 0
    let cost = 0
    for (let day = 0; day < v.daysPerMonth; day++) {
      const dayKwh = (v.watts / 1000) * v.hoursPerDay
      kwh += dayKwh
      cost += dayKwh * v.ratePerKwh
    }
    const r = compute(v)
    expect(stat(r, 'kWh per month')).toBeCloseTo(kwh, 9)
    expect(Number(r.primary.value)).toBeCloseTo(cost, 9)
    // and the annual figures are exactly twelve of the monthly ones
    expect(stat(r, 'Cost per year')).toBeCloseTo(cost * 12, 9)
    expect(stat(r, 'kWh per year')).toBeCloseTo(kwh * 12, 9)
  })

  test('energy is what matters, not how it is split between watts and hours', () => {
    const fast = compute({ ...base, watts: 2000, hoursPerDay: 3 })
    const slow = compute({ ...base, watts: 3000, hoursPerDay: 2 })
    expect(Number(fast.primary.value)).toBeCloseTo(Number(slow.primary.value), 10)
    expect(stat(fast, 'kWh per month')).toBeCloseTo(stat(slow, 'kWh per month'), 10)
    // but the per-running-hour cost does distinguish them
    expect(stat(fast, 'Cost per running hour')).toBeLessThan(stat(slow, 'Cost per running hour'))
  })

  test('an appliance that is never switched on costs nothing', () => {
    const r = compute({ ...base, hoursPerDay: 0 })
    expect(Number(r.primary.value)).toBe(0)
    expect(stat(r, 'Cost per day')).toBe(0)
    expect(stat(r, 'kWh per year')).toBe(0)
  })

  test('a free tariff still reports energy used', () => {
    const r = compute({ ...base, ratePerKwh: 0 })
    expect(Number(r.primary.value)).toBe(0)
    expect(stat(r, 'kWh per month')).toBeCloseTo(225, 10)
  })

  test('cost is linear in each input', () => {
    const once = Number(compute(base).primary.value)
    expect(Number(compute({ ...base, watts: 3000 }).primary.value)).toBeCloseTo(once * 2, 10)
    expect(Number(compute({ ...base, hoursPerDay: 10 }).primary.value)).toBeCloseTo(once * 2, 10)
    expect(Number(compute({ ...base, ratePerKwh: 0.4 }).primary.value)).toBeCloseTo(once * 2, 10)
  })

  test('the boundary values 24 hours and 31 days are accepted', () => {
    const r = compute({ ...base, hoursPerDay: 24, daysPerMonth: 31 })
    expect(Number(r.primary.value)).toBeCloseTo(1.5 * 24 * 31 * 0.2, 10)
  })

  test('nudging the first number field to 1.1x stays valid and moves the result', () => {
    // The e2e suite does exactly this, so assert the invariant here too.
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('watts')
    const numberDefault = (id: string) => {
      const f = fields.find((f) => f.id === id)!
      return f.default as number
    }
    const defaults = {
      watts: numberDefault('watts'),
      hoursPerDay: numberDefault('hoursPerDay'),
      daysPerMonth: numberDefault('daysPerMonth'),
      ratePerKwh: numberDefault('ratePerKwh'),
    }
    const before = Number(compute(defaults).primary.value)
    const after = Number(compute({ ...defaults, watts: defaults.watts * 1.1 }).primary.value)
    expect(after).toBeCloseTo(before * 1.1, 9)
    expect(after).not.toBe(before)
  })

  test('every declared stat exists and is a finite number', () => {
    const r = compute(base)
    for (const s of r.stats!) expect(Number.isFinite(Number(s.value))).toBe(true)
    expect(Number.isFinite(Number(r.primary.value))).toBe(true)
  })

  test('the cumulative-cost series runs month 1 to 12 with increasing x', () => {
    for (const input of [base, { ...base, ratePerKwh: 0 }, { ...base, hoursPerDay: 0 }]) {
      const series = compute(input).series!
      expect(series).toHaveLength(1)
      expect(series[0]!.label).toBe('Cumulative cost')
      const points = series[0]!.points
      expect(points).toHaveLength(12)
      expect(points.length).toBeLessThanOrEqual(45)
      points.forEach(([x, y], i) => {
        expect(Number.isFinite(x)).toBe(true)
        expect(Number.isFinite(y)).toBe(true)
        if (i > 0) expect(x).toBeGreaterThan(points[i - 1]![0])
      })
      expect(points.map(([x]) => x)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    }
  })

  test('the last cumulative point is exactly the reported annual cost', () => {
    for (const input of [
      base,
      { watts: 1234, hoursPerDay: 3.5, daysPerMonth: 31, ratePerKwh: 0.1734 },
      { watts: 7, hoursPerDay: 24, daysPerMonth: 30.4, ratePerKwh: 0.083 },
      { watts: 100_000, hoursPerDay: 24, daysPerMonth: 31, ratePerKwh: 5 },
      { ...base, ratePerKwh: 0 },
    ]) {
      const r = compute(input)
      const points = r.series![0]!.points
      // Exact, not close: the chart's endpoint and the stat are one value.
      expect(points[11]![1]).toBe(stat(r, 'Cost per year'))
    }
  })

  test('the running total accumulates a month of cost at a time', () => {
    const r = compute(base)
    const monthly = Number(r.primary.value)
    const points = r.series![0]!.points
    expect(points[0]![1]).toBeCloseTo(monthly, 10)
    points.forEach(([x, y], i) => {
      expect(y).toBeCloseTo(monthly * x, 8)
      if (i > 0) expect(y).toBeGreaterThan(points[i - 1]![1])
    })
  })

  test('the definition declares no scale, so compute need not return one', () => {
    expect('scale' in def).toBe(false)
    expect(compute(base).scaleValue).toBeUndefined()
  })

  test.each([
    ['zero wattage', { watts: 0 }, 'watts'],
    ['negative wattage', { watts: -5 }, 'watts'],
    ['negative hours', { hoursPerDay: -1 }, 'hoursPerDay'],
    ['more than 24 hours a day', { hoursPerDay: 25 }, 'hoursPerDay'],
    ['negative days', { daysPerMonth: -1 }, 'daysPerMonth'],
    ['more than 31 days a month', { daysPerMonth: 32 }, 'daysPerMonth'],
    ['a negative rate', { ratePerKwh: -0.1 }, 'ratePerKwh'],
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

  // The form layer coerces an unparseable entry to a raw NaN and hands it
  // straight to compute (src/lib/view.ts coerceValues), so every field must
  // reject non-finite input with a CalcError rather than returning NaN.
  const nonFinite = [
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ] as const
  const fieldIds = ['watts', 'hoursPerDay', 'daysPerMonth', 'ratePerKwh'] as const

  test.each(
    fieldIds.flatMap((fieldId) =>
      nonFinite.map(([label, value]) => [fieldId, label, value] as const),
    ),
  )('rejects %s = %s with a CalcError, never a NaN result', (fieldId, _label, value) => {
    let thrown: unknown
    try {
      const r = compute({ ...base, [fieldId]: value })
      // If it did not throw, make the failure say exactly what leaked.
      throw new Error(`expected a CalcError, got primary.value = ${String(r.primary.value)}`)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
  })

  test('no input combination inside the declared field ranges can produce NaN', () => {
    for (const watts of [0.001, 1, 100_000]) {
      for (const hoursPerDay of [0, 24]) {
        for (const daysPerMonth of [0, 31]) {
          for (const ratePerKwh of [0, 5]) {
            const r = compute({ watts, hoursPerDay, daysPerMonth, ratePerKwh })
            expect(Number.isFinite(Number(r.primary.value))).toBe(true)
            for (const s of r.stats!) expect(Number.isFinite(Number(s.value))).toBe(true)
          }
        }
      }
    }
  })
})

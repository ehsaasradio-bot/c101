import { describe, expect, test } from 'vitest'
import compute from './compute'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'

const base = {
  amount: 25,
  payPeriod: 'hourly',
  hoursPerWeek: 40,
  weeksPerYear: 52,
} as const

const stat = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)

describe('salary', () => {
  test('$25/hr at 40 hours over 52 weeks is $52,000 a year', () => {
    // Cross-checked by accumulation rather than by restating the formula:
    // add up 52 weeks of 40 hourly shifts one at a time.
    let byLoop = 0
    for (let week = 0; week < 52; week++) byLoop += 25 * 40
    expect(byLoop).toBe(52_000)
    expect(Number(compute(base).primary.value)).toBeCloseTo(byLoop, 6)
  })

  test('each emitted period multiplied back out returns the annual total', () => {
    const r = compute(base)
    const annual = Number(r.primary.value)
    // Independent of the implementation's own division: multiply each stat by
    // the count of that period a year holds and expect the annual figure back.
    const countPerYear: Record<string, number> = {
      Hourly: 40 * 52,
      Daily: 5 * 52,
      Weekly: 52,
      Biweekly: 26,
      'Semi-monthly': 24,
      Monthly: 12,
    }
    for (const [label, count] of Object.entries(countPerYear)) {
      expect(stat(r, label) * count).toBeCloseTo(annual, 6)
    }
  })

  test('every pay period round-trips: feeding a stat back in reproduces the salary', () => {
    const annual = Number(compute(base).primary.value)
    const pairs = [
      ['hourly', 'Hourly'],
      ['daily', 'Daily'],
      ['weekly', 'Weekly'],
      ['biweekly', 'Biweekly'],
      ['monthly', 'Monthly'],
      ['annual', 'Annual salary'],
    ] as const
    const r = compute(base)
    for (const [period, label] of pairs) {
      const amount = label === 'Annual salary' ? annual : stat(r, label)
      const back = compute({ ...base, payPeriod: period, amount })
      expect(Number(back.primary.value)).toBeCloseTo(annual, 6)
    }
  })

  test('unpaid weeks cut the annual total but leave the hourly rate alone', () => {
    const fullYear = compute(base)
    const short = compute({ ...base, weeksPerYear: 48 })
    expect(Number(short.primary.value)).toBeCloseTo((52_000 * 48) / 52, 6)
    expect(stat(short, 'Hourly')).toBeCloseTo(stat(fullYear, 'Hourly'), 9)
    expect(stat(short, 'Weekly')).toBeCloseTo(stat(fullYear, 'Weekly'), 9)
    expect(short.notes!.length).toBeGreaterThan(fullYear.notes!.length)
  })

  test('a boundary week of 168 hours is accepted, 169 is not', () => {
    expect(() => compute({ ...base, hoursPerWeek: 168 })).not.toThrow()
    expect(() => compute({ ...base, hoursPerWeek: 169 })).toThrow(CalcError)
  })

  test('the first number field nudged to 1.1x stays valid and moves the result', () => {
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('amount')
    const nudged = compute({ ...base, amount: first.default * 1.1 })
    expect(Number(nudged.primary.value)).toBeCloseTo(
      Number(compute({ ...base, amount: first.default }).primary.value) * 1.1,
      6,
    )
    expect(Number(nudged.primary.value)).not.toBe(
      Number(compute({ ...base, amount: first.default }).primary.value),
    )
  })

  test.each([
    ['zero pay', { amount: 0 }, 'amount'],
    ['negative pay', { amount: -10 }, 'amount'],
    ['zero hours', { hoursPerWeek: 0 }, 'hoursPerWeek'],
    ['more than 168 hours a week', { hoursPerWeek: 200 }, 'hoursPerWeek'],
    ['zero paid weeks', { weeksPerYear: 0 }, 'weeksPerYear'],
    ['more than 52 weeks', { weeksPerYear: 60 }, 'weeksPerYear'],
    ['an unknown pay period', { payPeriod: 'fortnightly' }, 'payPeriod'],
  ])('rejects %s', (_label, patch, fieldId) => {
    let thrown: unknown
    try {
      compute({ ...base, ...patch })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
    expect(Number.isNaN(Number((thrown as CalcError).message))).toBe(true)
  })
})

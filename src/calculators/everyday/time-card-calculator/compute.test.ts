import { describe, expect, test } from 'vitest'
import compute from './compute'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'

type Input = Parameters<typeof compute>[0]

const DEFAULT_DAYS = fields[1].default

const base: Input = {
  payRate: 22,
  days: DEFAULT_DAYS,
  overtimeRule: 'weekly',
  overtimeMultiplier: 1.5,
}

const run = (over: Partial<Input> = {}) => compute({ ...base, ...over })

const stat = (r: ReturnType<typeof compute>, label: string) =>
  r.stats!.find((s) => s.label === label)

const num = (r: ReturnType<typeof compute>, label: string) => Number(stat(r, label)!.value)
const text = (r: ReturnType<typeof compute>, label: string) => String(stat(r, label)!.value)

const thrownBy = (input: Partial<Input>): CalcError => {
  let caught: unknown
  try {
    compute({ ...base, ...input })
  } catch (err) {
    caught = err
  }
  expect(caught).toBeInstanceOf(CalcError)
  return caught as CalcError
}

/**
 * VERIFICATION 1 — an independent parse-and-sum, written differently.
 *
 * `compute` tokenises the line and walks a small state machine. This pulls every
 * "HH:MM-HH:MM [break]" triple out with one global regex instead, and wraps
 * midnight with its own arithmetic. Two implementations that share no code
 * agreeing on the total is worth far more than one implementation agreeing with
 * a literal somebody typed.
 */
function refWorkedMinutes(line: string): number {
  const re = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})(?:[\s,;]+(\d+)(?![:\d]))?/g
  let total = 0
  for (const m of line.matchAll(re)) {
    const start = Number(m[1]) * 60 + Number(m[2])
    const end = Number(m[3]) * 60 + Number(m[4])
    // Deliberately spelled out rather than reusing compute's wrap.
    let span: number
    if (end > start) span = end - start
    else if (end === start) span = 0
    else span = end + 24 * 60 - start
    total += span - Number(m[5] ?? 0)
  }
  return total
}

/** VERIFICATION 2 — "40h 45m" back into minutes, so the two forms must agree. */
function minutesFromHm(display: string): number {
  const m = /^(\d+)h (\d{2})m$/.exec(display)
  expect(m, `unparseable h:mm display "${display}"`).not.toBeNull()
  return Number(m![1]) * 60 + Number(m![2])
}

describe('time-card', () => {
  describe('the default week', () => {
    /*
     * Derived from the field default, day by day, in whole minutes:
     *   Mon  8:00-16:30  span 510 − 30 break = 480
     *   Tue  8:00-17:00  span 540 − 30       = 510
     *   Wed  8:00-16:30  span 510 − 30       = 480
     *   Thu  8:00-17:30  span 570 − 45       = 525
     *   Fri  8:00-16:00  span 480 − 30       = 450
     *                             total      = 2445 min = 40.75 h
     * Weekly overtime (FLSA) = 2445 − 2400 = 45 min = 0.75 h.
     *   regular  40 × 22           = 880.00
     *   overtime 0.75 × 22 × 1.5   =  24.75
     *   gross                      = 904.75
     */
    test('headline gross pay is $904.75 on 40h 45m', () => {
      const r = run()
      expect(Number(r.primary.value)).toBeCloseTo(904.75, 10)
      expect(num(r, 'Total hours worked')).toBeCloseTo(40.75, 12)
      expect(text(r, 'Total, hours and minutes')).toBe('40h 45m')
      expect(num(r, 'Regular hours')).toBe(40)
      expect(num(r, 'Overtime hours')).toBeCloseTo(0.75, 12)
      expect(num(r, 'Regular pay')).toBeCloseTo(880, 10)
      expect(num(r, 'Overtime pay')).toBeCloseTo(24.75, 10)
      expect(num(r, 'Days worked')).toBe(5)
      expect(text(r, 'Unpaid breaks deducted')).toBe('2h 45m')
    })

    test('the independent parse-and-sum reaches the same 2445 minutes', () => {
      expect(refWorkedMinutes(DEFAULT_DAYS)).toBe(2445)
      const r = run()
      expect(num(r, 'Total hours worked') * 60).toBeCloseTo(refWorkedMinutes(DEFAULT_DAYS), 9)
    })

    test('parts sum exactly to the headline and neither is negative', () => {
      const r = run()
      const sum = r.parts!.reduce((acc, p) => acc + p.value, 0)
      expect(sum).toBe(Number(r.primary.value))
      for (const p of r.parts!) expect(p.value).toBeGreaterThanOrEqual(0)
    })

    test('gross pay is exactly linear in the pay rate', () => {
      // What the e2e nudge relies on: 1.1x the rate must be valid and different.
      expect(Number(run({ payRate: 24.2 }).primary.value)).toBeCloseTo(904.75 * 1.1, 8)
    })
  })

  describe('the decimal and the h:mm forms never disagree', () => {
    const cases: Array<[string, string]> = [
      ['the default week', DEFAULT_DAYS],
      ['an overnight shift', 'Night 22:00-06:00 30'],
      ['awkward thirds', 'A 9:00-17:20, B 9:00-17:20, C 9:00-17:20'],
      ['a single minute', 'Mon 9:00-9:01'],
      ['a full 24 hours', 'Mon 00:00-24:00 60'],
    ]

    test.each(cases)('%s', (_label, days) => {
      const r = compute({ ...base, days })
      const decimalMinutes = num(r, 'Total hours worked') * 60
      const displayMinutes = minutesFromHm(text(r, 'Total, hours and minutes'))
      // Same integer count of minutes, reached three separate ways.
      expect(displayMinutes).toBe(refWorkedMinutes(days))
      expect(decimalMinutes).toBeCloseTo(displayMinutes, 9)
      expect(Number.isInteger(displayMinutes)).toBe(true)
    })

    test('minutes do not drift: six 8h20m days are exactly 50.00 hours', () => {
      // 8h20m is 8.3333... in decimal. Rounding each day and adding loses a
      // minute across the week; totalling in minutes cannot.
      const days = ['A', 'B', 'C', 'D', 'E', 'F'].map((d) => `${d} 9:00-17:20`).join(', ')
      const r = compute({ ...base, days })
      expect(num(r, 'Total hours worked')).toBe(50)
      expect(text(r, 'Total, hours and minutes')).toBe('50h 00m')
      expect(refWorkedMinutes(days)).toBe(3000)
    })
  })

  describe('shifts that cross midnight', () => {
    test('22:00-06:00 is 8 hours, not minus 16', () => {
      const r = compute({ ...base, days: 'Night 22:00-06:00' })
      expect(num(r, 'Total hours worked')).toBe(8)
      expect(text(r, 'Total, hours and minutes')).toBe('8h 00m')
      expect(Number(r.primary.value)).toBeCloseTo(8 * 22, 10)
    })

    test('the unpaid break still comes off the wrapped span', () => {
      const r = compute({ ...base, days: 'Night 22:00-06:00 30' })
      expect(num(r, 'Total hours worked')).toBeCloseTo(7.5, 12)
      expect(text(r, 'Total, hours and minutes')).toBe('7h 30m')
    })

    test('the overnight day is flagged in the per-day detail and the notes', () => {
      const r = compute({ ...base, days: 'Night 22:00-06:00' })
      expect(text(r, 'Night')).toContain('overnight')
      expect(r.notes!.some((n) => n.includes('past midnight'))).toBe(true)
    })

    test('12-hour and four-digit clocks wrap identically', () => {
      const a = compute({ ...base, days: 'N 22:00-06:00' })
      const b = compute({ ...base, days: 'N 10pm-6am' })
      const c = compute({ ...base, days: 'N 2200-0600' })
      expect(num(b, 'Total hours worked')).toBe(num(a, 'Total hours worked'))
      expect(num(c, 'Total hours worked')).toBe(num(a, 'Total hours worked'))
    })

    test('a week of nights totals correctly rather than going negative', () => {
      const days = 'Mon 22:00-06:00 30, Tue 22:00-06:00 30, Wed 22:00-06:00 30'
      const r = compute({ ...base, days })
      expect(num(r, 'Total hours worked')).toBeCloseTo(22.5, 12)
      expect(refWorkedMinutes(days)).toBe(1350)
      expect(Number(r.primary.value)).toBeGreaterThan(0)
    })
  })

  describe('degenerate shifts', () => {
    test('clock-out equal to clock-in is zero hours, not 24', () => {
      const r = compute({ ...base, days: 'Mon 9:00-9:00, Tue 9:00-17:00' })
      expect(text(r, 'Mon')).toContain('0h 00m')
      expect(num(r, 'Total hours worked')).toBe(8)
      expect(r.notes!.some((n) => n.includes('zero hours'))).toBe(true)
    })

    test('a whole card of zero-length shifts pays zero without a NaN', () => {
      const r = compute({ ...base, days: 'Mon 9:00-9:00, Tue 13:00-13:00' })
      expect(num(r, 'Total hours worked')).toBe(0)
      expect(Number(r.primary.value)).toBe(0)
      expect(r.parts!.reduce((acc, p) => acc + p.value, 0)).toBe(0)
    })

    test('a break longer than the shift is an error, never negative hours', () => {
      const err = thrownBy({ days: 'Mon 9:00-9:30 60' })
      expect(err.fieldId).toBe('days')
      expect(err.message).toContain('Mon 9:00-9:30 60')
      expect(err.message).toContain('longer than')
    })

    test('a break exactly equal to the shift is allowed and pays nothing', () => {
      const r = compute({ ...base, days: 'Mon 9:00-9:30 30, Tue 9:00-17:00' })
      expect(text(r, 'Mon')).toContain('0h 00m')
      expect(num(r, 'Total hours worked')).toBe(8)
    })
  })

  describe('overtime rules', () => {
    // 36-hour week with one 12-hour Monday: the case that separates the two
    // rules. FLSA 29 U.S.C. 207(a)(1) counts the week and sees no overtime at
    // all; a California-style daily rule sees four hours of it.
    const lopsided = 'Mon 8:00-20:00, Tue 9:00-15:00, Wed 9:00-15:00, Thu 9:00-15:00, Fri 9:00-15:00'

    test('the week totals 36 hours either way', () => {
      expect(refWorkedMinutes(lopsided)).toBe(2160)
      for (const rule of ['weekly', 'daily', 'none'] as const) {
        const r = compute({ ...base, days: lopsided, overtimeRule: rule })
        expect(num(r, 'Total hours worked'), rule).toBe(36)
      }
    })

    test('the weekly FLSA rule finds no overtime in a 36-hour week', () => {
      const r = compute({ ...base, days: lopsided, overtimeRule: 'weekly' })
      expect(num(r, 'Overtime hours')).toBe(0)
      expect(num(r, 'Regular hours')).toBe(36)
      expect(Number(r.primary.value)).toBeCloseTo(36 * 22, 10)
      expect(text(r, 'Overtime rule applied')).toContain('40 hours')
    })

    test('the daily rule finds four hours of it on the same card', () => {
      const r = compute({ ...base, days: lopsided, overtimeRule: 'daily' })
      expect(num(r, 'Overtime hours')).toBe(4)
      expect(num(r, 'Regular hours')).toBe(32)
      expect(Number(r.primary.value)).toBeCloseTo(32 * 22 + 4 * 22 * 1.5, 10)
      expect(text(r, 'Overtime rule applied')).toContain('8 hours')
    })

    test('no overtime rule pays every hour at the base rate', () => {
      const r = compute({ ...base, days: DEFAULT_DAYS, overtimeRule: 'none' })
      expect(num(r, 'Overtime hours')).toBe(0)
      expect(Number(r.primary.value)).toBeCloseTo(40.75 * 22, 10)
      expect(r.parts![1]!.value).toBe(0)
    })

    test('the multiplier only touches the overtime slice', () => {
      const at1 = run({ overtimeMultiplier: 1 })
      const at2 = run({ overtimeMultiplier: 2 })
      expect(at1.parts![0]!.value).toBeCloseTo(at2.parts![0]!.value, 10)
      expect(at2.parts![1]!.value).toBeCloseTo(2 * at1.parts![1]!.value, 10)
      // At 1x the whole card is simply hours times rate.
      expect(Number(at1.primary.value)).toBeCloseTo(40.75 * 22, 10)
    })

    test('regular and overtime always re-add to the total hours', () => {
      for (const rule of ['weekly', 'daily', 'none'] as const) {
        const r = compute({ ...base, days: DEFAULT_DAYS, overtimeRule: rule })
        expect(num(r, 'Regular hours') + num(r, 'Overtime hours')).toBeCloseTo(
          num(r, 'Total hours worked'),
          10,
        )
      }
    })
  })

  describe('parsing the single-line day list', () => {
    test('separators, clock styles and break styles are interchangeable', () => {
      const variants = [
        'Mon 9:00-17:30 30',
        'Mon 9:00-17:30 30m',
        'Mon 9:00 - 17:30 30',
        'Mon 9:00 to 17:30 0:30',
        'Mon 9am-5:30pm 30',
        'Mon 9 a.m.-5:30 p.m. 30',
        'Mon 0900-1730 30',
        'Mon 9:00-17:30 0.5h',
      ]
      for (const days of variants) {
        const r = compute({ ...base, days })
        expect(num(r, 'Total hours worked'), days).toBe(8)
      }
    })

    test('commas, semicolons and bare spaces all separate days', () => {
      const a = compute({ ...base, days: 'Mon 9:00-17:00, Tue 9:00-17:00' })
      const b = compute({ ...base, days: 'Mon 9:00-17:00; Tue 9:00-17:00' })
      // A pasted spreadsheet column arrives with its newlines already flattened.
      const c = compute({ ...base, days: 'Mon 9:00-17:00 Tue 9:00-17:00' })
      expect(num(a, 'Total hours worked')).toBe(16)
      expect(num(b, 'Total hours worked')).toBe(16)
      expect(num(c, 'Total hours worked')).toBe(16)
    })

    test('day names are optional and fall back to a position label', () => {
      const r = compute({ ...base, days: '9:00-17:00 30, 9:00-17:00 30' })
      expect(stat(r, 'Day 1')).toBeDefined()
      expect(stat(r, 'Day 2')).toBeDefined()
      expect(num(r, 'Total hours worked')).toBe(15)
    })

    test('an omitted break is zero, not an error', () => {
      const r = compute({ ...base, days: 'Mon 9:00-17:00' })
      expect(num(r, 'Total hours worked')).toBe(8)
      expect(text(r, 'Unpaid breaks deducted')).toBe('0h 00m')
    })

    test('a single day is enough, and still charts', () => {
      const r = compute({ ...base, days: 'Mon 9:00-17:00' })
      expect(r.series![0]!.points.length).toBe(2)
      expect(r.parts).toHaveLength(2)
    })
  })

  describe('rejecting bad input', () => {
    test.each([
      ['an empty list', '   '],
      ['only separators', ', ; ,'],
      ['no clock range at all', 'Mon Tue Wed'],
    ])('%s is refused against the days field', (_label, days) => {
      expect(thrownBy({ days }).fieldId).toBe('days')
    })

    test('an unreadable entry is named in the message', () => {
      const err = thrownBy({ days: 'Mon 9:00-17:30 30, Tue banana' })
      expect(err.fieldId).toBe('days')
      expect(err.message).toContain('Tue banana')
    })

    test('an impossible clock time names its own entry', () => {
      const err = thrownBy({ days: 'Mon 25:00-17:30' })
      expect(err.message).toContain('25:00')
      expect(err.message).toContain('Mon 25:00-17:30')
    })

    test('a 12-hour clock hour outside 1-12 is refused', () => {
      expect(thrownBy({ days: 'Mon 15pm-17:30' }).message).toContain('15pm')
    })

    test.each([
      ['NaN', Number.NaN],
      ['zero', 0],
      ['negative', -999999],
      ['infinite', Number.POSITIVE_INFINITY],
    ])('a pay rate of %s is refused against the payRate field', (_label, payRate) => {
      expect(thrownBy({ payRate }).fieldId).toBe('payRate')
    })

    test.each([
      ['NaN', Number.NaN],
      ['below 1', 0.5],
      ['above 3', 4],
    ])('an overtime multiplier of %s is refused', (_label, overtimeMultiplier) => {
      expect(thrownBy({ overtimeMultiplier }).fieldId).toBe('overtimeMultiplier')
    })

    test('an unknown overtime rule is refused', () => {
      expect(thrownBy({ overtimeRule: 'fortnightly' }).fieldId).toBe('overtimeRule')
    })
  })

  describe('result shape', () => {
    test('the decomposition is fixed at two parts and one series whatever the day count', () => {
      for (const dayCount of [1, 3, 5, 7, 14]) {
        const days = Array.from({ length: dayCount }, (_, i) => `D${i + 1} 9:00-17:30 30`).join(', ')
        const r = compute({ ...base, days })
        expect(r.parts, `${dayCount} days`).toHaveLength(2)
        expect(r.series, `${dayCount} days`).toHaveLength(1)
        // Day count is an input, so it may only move the POINT count.
        expect(r.series![0]!.points.length).toBe(dayCount + 1)
      }
    })

    test('the cumulative series is anchored at zero and never decreases', () => {
      const r = run()
      const points = r.series![0]!.points
      expect(points[0]).toEqual([0, 0])
      points.forEach((p, i) => {
        expect(Number.isFinite(p[0])).toBe(true)
        expect(Number.isFinite(p[1])).toBe(true)
        if (i > 0) {
          expect(p[0]).toBeGreaterThan(points[i - 1]![0])
          expect(p[1]).toBeGreaterThanOrEqual(points[i - 1]![1])
        }
      })
      // The last point is the headline total, so curve and number agree.
      expect(points[points.length - 1]![1]).toBeCloseTo(num(r, 'Total hours worked'), 12)
    })

    test('nothing in the result is ever NaN', () => {
      const r = run()
      for (const s of r.stats!) {
        if (typeof s.value === 'number') expect(Number.isFinite(s.value)).toBe(true)
        else expect(s.value).not.toContain('NaN')
      }
      for (const p of r.parts!) expect(Number.isFinite(p.value)).toBe(true)
      expect(Number.isFinite(Number(r.primary.value))).toBe(true)
    })

    test('the rule actually applied is stated plainly', () => {
      expect(text(run(), 'Overtime rule applied')).toContain('FLSA')
      expect(run().notes!.some((n) => n.includes('Fair Labor Standards Act'))).toBe(true)
      expect(run().notes!.some((n) => n.includes('Gross pay only'))).toBe(true)
    })
  })
})

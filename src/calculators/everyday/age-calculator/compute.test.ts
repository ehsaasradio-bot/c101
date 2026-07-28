import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { CalcError } from '../../../lib/types'
import type { CalculatorDef } from '../../../lib/types'

// `def` is inferred through `satisfies`, so optional keys it omits are absent
// from its literal type. Widening to the interface is how the test can ask
// whether a scale was declared at all.
const definition: CalculatorDef = def

const stat = (r: ReturnType<typeof compute>, label: string): number =>
  Number(r.stats!.find((s) => s.label === label)!.value)

const age = (birthDate: string, asOfDate: string) => {
  const r = compute({ birthDate, asOfDate })
  return {
    years: Number(r.primary.value),
    months: stat(r, 'Months past that birthday'),
    days: stat(r, 'Days past that'),
    result: r,
  }
}

/**
 * An independent check, deliberately not sharing a line of code with compute:
 * walk the calendar forward from the birth date by the reported years, then
 * months, then days using the platform's own UTC date arithmetic, and demand we
 * land exactly on the as-of date. If the borrowing logic is wrong in any way
 * that still produces plausible-looking numbers, this fails.
 *
 * The month step keeps the birth day of the month and lets Date roll an
 * impossible one over ("31 February 2000" becomes 2 March 2000). That rollover
 * is the exact inverse of borrowing the preceding month's length, which is what
 * compute does — clamping to the last day of the month instead would be a
 * different convention and would not invert.
 */
function reconstruct(birthDate: string, years: number, months: number, days: number): string {
  const [by, bm, bd] = birthDate.split('-').map(Number) as [number, number, number]
  const totalMonths = bm - 1 + years * 12 + months
  const ty = by + Math.floor(totalMonths / 12)
  const tm = (totalMonths % 12) + 1
  const anchor = Date.UTC(ty, tm - 1, bd)
  return new Date(anchor + days * 86_400_000).toISOString().slice(0, 10)
}

/** Days between two ISO dates, counted one day at a time. */
function walkDays(from: string, to: string): number {
  const end = Date.parse(`${to}T00:00:00Z`)
  let cursor = Date.parse(`${from}T00:00:00Z`)
  let n = 0
  while (cursor < end) {
    cursor += 86_400_000
    n += 1
  }
  return n
}

describe('age calculator', () => {
  test('born 1995-06-15, measured on 2026-07-28', () => {
    // 1995-06-15 + 31 years = 2026-06-15, + 1 month = 2026-07-15, + 13 days = 2026-07-28.
    const a = age('1995-06-15', '2026-07-28')
    expect([a.years, a.months, a.days]).toEqual([31, 1, 13])
  })

  test.each([
    ['1995-06-15', '2026-07-28'],
    ['2000-01-31', '2000-03-01'],
    ['2000-01-31', '2000-03-30'],
    ['1980-12-31', '2026-01-01'],
    ['2024-02-29', '2025-02-28'],
    ['2024-02-29', '2028-02-29'],
    ['1970-01-01', '2026-07-27'],
    ['2026-07-27', '2026-07-27'],
    ['1999-08-30', '2026-02-28'],
  ])('%s → %s round-trips through independent calendar arithmetic', (birth, asOf) => {
    const a = age(birth, asOf)
    expect(a.years).toBeGreaterThanOrEqual(0)
    expect(a.months).toBeGreaterThanOrEqual(0)
    expect(a.months).toBeLessThan(12)
    expect(a.days).toBeGreaterThanOrEqual(0)
    expect(reconstruct(birth, a.years, a.months, a.days)).toBe(asOf)
  })

  test('borrowing across a short month never yields a negative day count', () => {
    // 31 January to 1 March 2000: one borrow of February (29 days) is still not
    // enough, so January must be borrowed too.
    const a = age('2000-01-31', '2000-03-01')
    expect([a.years, a.months, a.days]).toEqual([0, 0, 30])
    expect(walkDays('2000-01-31', '2000-03-01')).toBe(30)
  })

  test('an end-of-month birth day follows the borrow convention, not a clamp', () => {
    // 31 January to 30 March 2000. Borrowing February's 29 days gives
    // 1 month 28 days. The other common convention — "31 January + 1 month =
    // 29 February", clamped — would report 1 month 30 days. Both are defensible;
    // this pins which one this calculator uses, and it is the one that inverts.
    const a = age('2000-01-31', '2000-03-30')
    expect([a.years, a.months, a.days]).toEqual([0, 1, 28])
    expect(reconstruct('2000-01-31', 0, 1, 28)).toBe('2000-03-30')
  })

  test('total days matches a day-by-day walk, leap day included', () => {
    const r = compute({ birthDate: '2024-01-01', asOfDate: '2025-01-01' })
    expect(stat(r, 'Days lived')).toBe(366)
    expect(stat(r, 'Days lived')).toBe(walkDays('2024-01-01', '2025-01-01'))
    // A leap year is exactly 52 weeks and 2 days.
    expect(stat(r, 'Age in weeks')).toBe(52)
    expect(stat(r, 'Age in months')).toBe(12)
  })

  test('age in months equals years times twelve plus the month component', () => {
    const a = age('1995-06-15', '2026-07-28')
    expect(stat(a.result, 'Age in months')).toBe(a.years * 12 + a.months)
    expect(stat(a.result, 'Age in weeks')).toBe(
      Math.floor(stat(a.result, 'Days lived') / 7),
    )
  })

  test('the same day is an age of zero and a birthday today', () => {
    const r = compute({ birthDate: '2026-07-27', asOfDate: '2026-07-27' })
    expect(Number(r.primary.value)).toBe(0)
    expect(stat(r, 'Days lived')).toBe(0)
    expect(stat(r, 'Days to next birthday')).toBe(0)
    expect(stat(r, 'Turning')).toBe(0)
    expect(r.notes!.some((n) => n.includes('birthday'))).toBe(true)
  })

  test('the day before a birthday counts one day to go and a year not yet gained', () => {
    const before = age('1995-06-15', '2026-06-14')
    expect(before.years).toBe(30)
    expect(stat(before.result, 'Days to next birthday')).toBe(1)
    expect(stat(before.result, 'Turning')).toBe(31)

    const on = age('1995-06-15', '2026-06-15')
    expect(on.years).toBe(31)
    expect([on.months, on.days]).toEqual([0, 0])
    expect(stat(on.result, 'Days to next birthday')).toBe(0)
  })

  test('a leap-day birthday falls back to 1 March in a common year', () => {
    // 2026 is not a leap year, so the anniversary is 2026-03-01: 1 day after
    // 2026-02-28 and exactly 366 days later than the 2025 one.
    const r = compute({ birthDate: '2004-02-29', asOfDate: '2026-02-28' })
    expect(stat(r, 'Days to next birthday')).toBe(1)
    expect(stat(r, 'Turning')).toBe(22)
    expect(r.notes!.some((n) => n.includes('29 February'))).toBe(true)

    // In a leap year the real date is used.
    const leap = compute({ birthDate: '2004-02-29', asOfDate: '2028-02-01' })
    expect(stat(leap, 'Days to next birthday')).toBe(28)
  })

  test('the next birthday is always in the future or today, never behind', () => {
    for (const asOf of ['2026-01-01', '2026-06-14', '2026-06-15', '2026-06-16', '2026-12-31']) {
      const d = stat(compute({ birthDate: '1995-06-15', asOfDate: asOf }), 'Days to next birthday')
      expect(d).toBeGreaterThanOrEqual(0)
      expect(d).toBeLessThanOrEqual(366)
    }
  })

  test('rejects a birth date after the as-of date', () => {
    let thrown: unknown
    try {
      compute({ birthDate: '2026-07-28', asOfDate: '2026-07-27' })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe('birthDate')
  })

  test.each([
    ['unparseable birth date', { birthDate: '15/06/1995' }, 'birthDate'],
    ['empty birth date', { birthDate: '' }, 'birthDate'],
    ['month 13', { birthDate: '1995-13-01' }, 'birthDate'],
    ['a day that does not exist', { asOfDate: '2026-02-30' }, 'asOfDate'],
    ['29 February in a common year', { asOfDate: '2026-02-29' }, 'asOfDate'],
    ['unparseable as-of date', { asOfDate: 'today' }, 'asOfDate'],
  ])('rejects %s with a CalcError naming the field', (_label, patch, fieldId) => {
    let thrown: unknown
    try {
      compute({ birthDate: '1995-06-15', asOfDate: '2026-07-27', ...patch })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
  })

  test('never returns NaN for any component', () => {
    const r = compute({ birthDate: '1995-06-15', asOfDate: '2026-07-27' })
    for (const q of [r.primary, ...r.stats!]) expect(Number.isNaN(Number(q.value))).toBe(false)
  })

  test('the definition declares no scale, so compute owes no scaleValue', () => {
    expect(definition.scale).toBeUndefined()
    expect(compute({ birthDate: '1995-06-15', asOfDate: '2026-07-27' }).scaleValue).toBeUndefined()
  })
})

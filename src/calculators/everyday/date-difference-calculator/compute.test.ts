import { describe, expect, test } from 'vitest'
import compute from './compute'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'
import { defaultValues } from '../../../lib/view'
import { formatValue } from '../../../lib/format'

const base = {
  startDate: '2026-01-01',
  endDate: '2026-07-28',
  includeEndDate: false,
} as const

const stat = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)

/**
 * Independent reference implementations. These walk the calendar one day at a
 * time instead of reusing the closed-form arithmetic under test, so a mistake in
 * the week-block business-day formula cannot hide behind a matching mistake here.
 */
function walkDays(startIso: string, endIso: string): { total: number; business: number } {
  const end = Date.parse(`${endIso}T00:00:00Z`)
  let cursor = Date.parse(`${startIso}T00:00:00Z`)
  let total = 0
  let business = 0
  while (cursor < end) {
    const dow = new Date(cursor).getUTCDay()
    if (dow !== 0 && dow !== 6) business++
    total++
    cursor += 86_400_000
  }
  return { total, business }
}

describe('date difference', () => {
  test('2026-01-01 to 2026-07-28 is 208 days', () => {
    // Jan 31 + Feb 28 + Mar 31 + Apr 30 + May 31 + Jun 30 = 181 to July 1,
    // plus 27 more to July 28.
    const r = compute(base)
    expect(Number(r.primary.value)).toBe(208)
    expect(walkDays('2026-01-01', '2026-07-28').total).toBe(208)
  })

  test('the day-by-day walk agrees with the closed form across many spans', () => {
    const ends = [
      '2026-01-02',
      '2026-01-08',
      '2026-02-28',
      '2026-03-01',
      '2026-06-30',
      '2027-01-01',
      '2030-12-31',
    ]
    for (const endDate of ends) {
      const r = compute({ ...base, endDate })
      const reference = walkDays(base.startDate, endDate)
      expect(Number(r.primary.value)).toBe(reference.total)
      expect(stat(r, 'Business days')).toBe(reference.business)
    }
  })

  test('business days plus weekend days always equal the total', () => {
    for (const endDate of ['2026-01-01', '2026-01-05', '2026-09-13', '2031-02-14']) {
      for (const includeEndDate of [false, true]) {
        const r = compute({ ...base, endDate, includeEndDate })
        expect(stat(r, 'Business days') + stat(r, 'Weekend days')).toBe(Number(r.primary.value))
      }
    }
  })

  test('parts are the business/weekend split of the total days', () => {
    const r = compute(base)
    expect(r.parts!.map((p) => p.label)).toEqual(['Business days', 'Weekend days'])
    expect(r.parts![0]!.value).toBe(stat(r, 'Business days'))
    expect(r.parts![1]!.value).toBe(stat(r, 'Weekend days'))
    expect(r.partsTotal!.label).toBe('Total days')
    expect(Number(r.partsTotal!.value)).toBe(Number(r.primary.value))
  })

  test('parts sum to the total for spans starting on every weekday, both toggle states', () => {
    // 2026-03-01 is a Sunday, so offsetting 0–6 starts a span on each day of the
    // week in turn; several lengths cover the partial-week remainder branch.
    for (let offset = 0; offset < 7; offset++) {
      for (const length of [0, 1, 3, 5, 7, 10, 31, 366]) {
        for (const includeEndDate of [false, true]) {
          const startDate = new Date(Date.UTC(2026, 2, 1 + offset)).toISOString().slice(0, 10)
          const endDate = new Date(Date.UTC(2026, 2, 1 + offset + length))
            .toISOString()
            .slice(0, 10)
          const r = compute({ startDate, endDate, includeEndDate })
          const sum = r.parts!.reduce((acc, p) => acc + p.value, 0)
          expect(sum).toBeCloseTo(Number(r.partsTotal!.value), 4)
          expect(sum).toBe(Number(r.primary.value))
          // Cross-check the business slice against the day-by-day walk.
          const walkEnd = new Date(
            Date.UTC(2026, 2, 1 + offset + length + (includeEndDate ? 1 : 0)),
          )
            .toISOString()
            .slice(0, 10)
          expect(r.parts![0]!.value).toBe(walkDays(startDate, walkEnd).business)
          for (const p of r.parts!) {
            expect(Number.isFinite(p.value)).toBe(true)
            expect(p.value).toBeGreaterThanOrEqual(0)
          }
        }
      }
    }
  })

  test('a Monday-to-Friday working week is 4 elapsed days and 5 inclusive days', () => {
    // 2026-01-05 is a Monday; 2026-01-09 is the Friday of the same week.
    expect(new Date('2026-01-05T00:00:00Z').getUTCDay()).toBe(1)
    const elapsed = compute({ startDate: '2026-01-05', endDate: '2026-01-09', includeEndDate: false })
    expect(Number(elapsed.primary.value)).toBe(4)
    expect(stat(elapsed, 'Business days')).toBe(4)
    expect(stat(elapsed, 'Weekend days')).toBe(0)

    const inclusive = compute({ startDate: '2026-01-05', endDate: '2026-01-09', includeEndDate: true })
    expect(Number(inclusive.primary.value)).toBe(5)
    expect(stat(inclusive, 'Business days')).toBe(5)
  })

  test('a full week always contains exactly five business days', () => {
    for (let offset = 0; offset < 7; offset++) {
      const day = new Date(Date.UTC(2026, 2, 1 + offset)).toISOString().slice(0, 10)
      const end = new Date(Date.UTC(2026, 2, 8 + offset)).toISOString().slice(0, 10)
      const r = compute({ startDate: day, endDate: end, includeEndDate: false })
      expect(Number(r.primary.value)).toBe(7)
      expect(stat(r, 'Business days')).toBe(5)
    }
  })

  test('the same date is zero days elapsed, or one day when the end date counts', () => {
    const zero = compute({ startDate: '2026-03-10', endDate: '2026-03-10', includeEndDate: false })
    expect(Number(zero.primary.value)).toBe(0)
    expect(stat(zero, 'Weeks')).toBe(0)
    expect(stat(zero, 'Complete months')).toBe(0)

    const one = compute({ startDate: '2026-03-10', endDate: '2026-03-10', includeEndDate: true })
    expect(Number(one.primary.value)).toBe(1)
  })

  test('a leap year is 366 days and a common year is 365', () => {
    expect(
      Number(compute({ startDate: '2024-01-01', endDate: '2025-01-01', includeEndDate: false }).primary.value),
    ).toBe(366)
    expect(
      Number(compute({ startDate: '2025-01-01', endDate: '2026-01-01', includeEndDate: false }).primary.value),
    ).toBe(365)
    // 1900 was not a leap year despite being divisible by 4.
    expect(
      Number(compute({ startDate: '1900-01-01', endDate: '1901-01-01', includeEndDate: false }).primary.value),
    ).toBe(365)
    expect(
      Number(compute({ startDate: '2000-01-01', endDate: '2001-01-01', includeEndDate: false }).primary.value),
    ).toBe(366)
  })

  test('the calendar breakdown borrows the correct month length', () => {
    // 2026-01-31 to 2026-03-01: one whole month to Feb 28 leaves 1 day over,
    // because the month borrowed from is February.
    const r = compute({ startDate: '2026-01-31', endDate: '2026-03-01', includeEndDate: false })
    expect(Number(r.primary.value)).toBe(29)
    expect(stat(r, 'Complete months')).toBe(1)
    const breakdown = r.steps!.find((s) => 'label' in s && s.label === 'Years, months and days')
    expect(breakdown).toMatchObject({ value: '0y 1m 1d' })
  })

  test('complete years and months match a calendar reading', () => {
    const r = compute({ startDate: '2020-02-29', endDate: '2026-07-28', includeEndDate: false })
    expect(stat(r, 'Complete years')).toBe(6)
    // 76 whole months lands on 2026-06-29, leaving 29 days to 2026-07-28.
    expect(stat(r, 'Complete months')).toBe(6 * 12 + 4)
  })

  test('weeks are the day count divided by seven', () => {
    const r = compute({ startDate: '2026-01-01', endDate: '2026-01-11', includeEndDate: false })
    expect(stat(r, 'Weeks')).toBeCloseTo(10 / 7, 10)
  })

  test('is pure — the same input gives the same output', () => {
    expect(compute(base)).toEqual(compute(base))
  })

  test.each([
    ['a malformed start date', { startDate: '01/01/2026' }, 'startDate'],
    ['a malformed end date', { endDate: 'tomorrow' }, 'endDate'],
    ['a date that does not exist', { startDate: '2026-02-30' }, 'startDate'],
    ['a non-leap February 29', { endDate: '2026-02-29' }, 'endDate'],
    ['an end date before the start date', { endDate: '2025-12-31' }, 'endDate'],
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

  test('every rendering of the span agrees with every other', () => {
    // The regression: the stat used a `duration` spec, which the shared
    // formatter approximates as 365-day years and 30-day months. For the old
    // default span that printed "6 months 28 days" beside a step reading
    // "0y 6m 27d" — two contradicting breakdowns of one span on one page.
    for (const endDate of ['2026-07-28', '2026-03-01', '2027-11-30', '2031-02-14']) {
      const r = compute({ ...base, endDate })
      const span = r.stats!.find((s) => s.label === 'Calendar span')!
      const step = r.steps!.find((s) => 'label' in s && s.label === 'Years, months and days')!
      expect(formatValue(span.value, span.format)).toBe(
        formatValue((step as typeof span).value, (step as typeof span).format),
      )
    }

    // And the breakdown itself is exact: start + m months + d days === end.
    const r = compute(base)
    const span = r.stats!.find((s) => s.label === 'Calendar span')!
    const parsed = String(span.value).match(/^(\d+)y (\d+)m (\d+)d$/)!
    const [y, m, d] = parsed.slice(1).map(Number) as [number, number, number]
    const start = new Date(Date.parse(`${base.startDate}T00:00:00Z`))
    const landed = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + y * 12 + m, start.getUTCDate()),
    )
    landed.setUTCDate(landed.getUTCDate() + d)
    expect(landed.toISOString().slice(0, 10)).toBe(base.endDate)
  })

  test('the calculator accepts its own default inputs', () => {
    // A hardcoded start date next to an end date of `today` means the shipped
    // defaults are only valid on some calendar days. Whatever "today" is when
    // the page is built, the starting state must compute rather than throw.
    const defaults = defaultValues({ fields }) as Parameters<typeof compute>[0]
    expect(() => compute(defaults)).not.toThrow()
    expect(Number(compute(defaults).primary.value)).toBe(1)

    // Confirm it holds for an arbitrary "today", not just the machine clock:
    // both date defaults resolve to the same day, so ordering can never fail.
    const dateDefaults = fields.filter((f) => f.kind === 'date').map((f) => f.default)
    expect(dateDefaults).toEqual(['today', 'today'])
    expect(defaults.startDate).toBe(defaults.endDate)
  })

  test('never returns NaN for a valid span', () => {
    const r = compute(base)
    // Numeric quantities must be real numbers; the 'raw' ones are text by
    // design, so assert on what actually reaches the page — the rendered
    // string — which is where a NaN would be visible.
    for (const q of [r.primary, ...r.stats!, ...r.steps!]) {
      if (!('label' in q)) continue
      if (q.format.style !== 'raw') expect(Number.isFinite(Number(q.value))).toBe(true)
      expect(formatValue(q.value, q.format)).not.toMatch(/NaN|Infinity|—/)
    }
  })
})

import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { CalcError } from '../../../lib/types'
import type { CalculatorDef } from '../../../lib/types'
import { defaultValues, toResultView } from '../../../lib/view'
import { formatValue } from '../../../lib/format'
import { fields } from './fields'

/**
 * The headline is written for a person ("22 October 2026"), so the tests convert
 * it back to ISO before doing date arithmetic on it. Parsing it here is
 * deliberate: it pins the display format as well as the maths, so a malformed
 * long date fails rather than silently passing through a lenient Date parse.
 */
const LONG_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const longToIso = (value: unknown): string => {
  const m = /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(String(value))
  if (!m) throw new Error(`not a long-form date: ${String(value)}`)
  const month = LONG_MONTHS.indexOf(m[2]!)
  if (month < 0) throw new Error(`unknown month: ${m[2]}`)
  return `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[1]!.padStart(2, '0')}`
}

type Input = Parameters<typeof compute>[0]

// `def` is inferred through `satisfies`, so widening is how the test can ask
// about optional keys at all.
const definition: CalculatorDef = def

const base: Input = { cycleLength: 28, lmpDate: '2026-01-15', asOfDate: '2026-04-09' }

const stat = (r: ReturnType<typeof compute>, label: string) =>
  r.stats!.find((s) => s.label === label)!.value

const step = (r: ReturnType<typeof compute>, label: string) =>
  (r.steps!.find((s) => 'label' in s && s.label === label) as { value: number | string }).value

/**
 * An independent calendar, deliberately sharing nothing with compute — no
 * `Date`, no epoch arithmetic, just a month-length table and a day-at-a-time
 * walk. If the UTC epoch maths in compute is wrong in a way that still produces
 * plausible dates, this disagrees with it.
 */
const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

function walkForward(iso: string, n: number): string {
  let [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  for (let i = 0; i < n; i++) {
    const len = m === 2 && isLeap(y) ? 29 : MONTH_LENGTHS[m - 1]!
    if (d < len) d += 1
    else if (m < 12) {
      m += 1
      d = 1
    } else {
      y += 1
      m = 1
      d = 1
    }
  }
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Days from `from` up to `to`, counted one at a time by the same walk. */
function walkBetween(from: string, to: string): number {
  let cursor = from
  let n = 0
  while (cursor !== to) {
    cursor = walkForward(cursor, 1)
    n += 1
    if (n > 40_000) throw new Error('walkBetween ran away')
  }
  return n
}

/** Contains 29 February, so a 280-day span crossing it lands a day earlier. */
const containsLeapDay = (from: string, days: number): boolean => {
  for (let i = 0; i <= days; i++) if (walkForward(from, i).slice(5) === '02-29') return true
  return false
}

describe('due date (Naegele’s rule)', () => {
  test('280 days after 2026-01-15 is 2026-10-22, confirmed three ways', () => {
    // 1. By hand, month by month from 15 January to 15 October 2026:
    //    Jan 31 + Feb 28 + Mar 31 + Apr 30 + May 31 + Jun 30 + Jul 31 + Aug 31
    //    + Sep 30 = 273 days, leaving 280 − 273 = 7 → 22 October 2026.
    const monthly = [31, 28, 31, 30, 31, 30, 31, 31, 30]
    expect(monthly.reduce((a, b) => a + b, 0)).toBe(273)

    // 2. By day-of-year: 15 January is day 15, and 15 + 280 = 295. Day 295 of a
    //    common year is 295 − 273 (days to 30 September) = 22 October.
    expect(31 + 28 + 31 + 30 + 31 + 30 + 31 + 31 + 30).toBe(273)
    expect(15 + 280 - 273).toBe(22)

    // 3. By the independent day-at-a-time walk.
    expect(walkForward('2026-01-15', 280)).toBe('2026-10-22')

    expect(longToIso(compute(base).primary.value)).toBe('2026-10-22')
  })

  test('a span crossing 29 February lands one calendar day earlier', () => {
    // 2024 is a leap year, so 15 January + 280 days passes through 29 February
    // and reaches 21 October rather than the 22nd it reaches in 2026.
    expect(containsLeapDay('2024-01-15', 280)).toBe(true)
    expect(containsLeapDay('2026-01-15', 280)).toBe(false)

    // Month by month, 15 Jan → 15 Oct 2024: 31 + 29 + 31 + 30 + 31 + 30 + 31 +
    // 31 + 30 = 274, leaving 6 days → 21 October 2024.
    expect([31, 29, 31, 30, 31, 30, 31, 31, 30].reduce((a, b) => a + b, 0)).toBe(274)
    expect(walkForward('2024-01-15', 280)).toBe('2024-10-21')

    const r = compute({ ...base, lmpDate: '2024-01-15', asOfDate: '2024-04-09' })
    expect(longToIso(r.primary.value)).toBe('2024-10-21')
    expect(walkBetween('2024-01-15', longToIso(r.primary.value))).toBe(280)
  })

  test('the due date is exactly 280 days after the adjusted start, for many starts', () => {
    const starts = [
      '2026-01-15',
      '2026-02-28',
      '2024-02-29',
      '2025-12-31',
      '2027-06-01',
      '2023-03-10',
      '1999-12-25',
      '2100-01-01', // 2100 is not a leap year despite dividing by 4
    ]
    for (const lmpDate of starts) {
      for (const cycleLength of [20, 24, 28, 31, 35, 45]) {
        const r = compute({ cycleLength, lmpDate, asOfDate: lmpDate })
        const adjustedStart = walkForward(lmpDate, Math.max(0, cycleLength - 28))
        const due = longToIso(r.primary.value)
        // Walk forward from the LMP itself, so a wrong adjustment cannot hide.
        expect(walkBetween(lmpDate, due)).toBe(280 + (cycleLength - 28))
        if (cycleLength >= 28) expect(walkBetween(adjustedStart, due)).toBe(280)
        expect(String(step(r, 'Estimated due date (40 weeks)'))).toBe(due)
      }
    }
  })

  test('cycle length shifts every date day for day', () => {
    const at = (cycleLength: number) => longToIso(compute({ ...base, cycleLength }).primary.value)
    expect(at(28)).toBe('2026-10-22')
    // +7 days for a 35-day cycle, −7 for a 21-day one.
    expect(at(35)).toBe(walkForward('2026-10-22', 7))
    expect(at(35)).toBe('2026-10-29')
    expect(walkBetween(at(21), '2026-10-22')).toBe(7)
    expect(at(21)).toBe('2026-10-15')

    // A fractional cycle rounds to whole days: a due date is a calendar day.
    expect(at(30.8)).toBe(at(31))
    expect(at(30.8)).not.toBe(at(28))
  })

  test('the end-to-end nudge of the first number field changes the result', () => {
    // tests/calculators.spec.ts fills the first number field with 1.1x its
    // default and requires a different, valid headline. 28 × 1.1 = 30.8.
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('cycleLength')
    const bumped = Number((first.default * 1.1).toFixed(4))
    const values = defaultValues({ fields }) as Input
    expect(compute({ ...values, cycleLength: bumped }).primary.value).not.toBe(
      compute(values).primary.value,
    )
  })

  test('gestational age is written in completed weeks plus days', () => {
    // 15 January to 9 April 2026: Jan 16 + Feb 28 + Mar 31 + Apr 9 = 84 days,
    // which is exactly 12 weeks.
    expect(16 + 28 + 31 + 9).toBe(84)
    expect(walkBetween('2026-01-15', '2026-04-09')).toBe(84)
    const r = compute(base)
    expect(stat(r, 'Gestational age')).toBe('12w 0d')
    expect(step(r, 'Days since the adjusted start')).toBe(84)
    expect(stat(r, 'Weeks completed')).toBe(12)
    expect(r.scaleValue).toBe(84)
  })

  test.each([
    [0, '0w 0d', 'First'],
    [1, '0w 1d', 'First'],
    [97, '13w 6d', 'First'],
    [98, '14w 0d', 'Second'],
    [195, '27w 6d', 'Second'],
    [196, '28w 0d', 'Third'],
    [279, '39w 6d', 'Third'],
    [280, '40w 0d', 'Third'],
    [294, '42w 0d', 'Third'],
  ])('day %i of gestation reads %s in the %s trimester', (days, age, trimester) => {
    const r = compute({ ...base, asOfDate: walkForward('2026-01-15', days) })
    expect(stat(r, 'Gestational age')).toBe(age)
    expect(stat(r, 'Trimester')).toBe(trimester)
    expect(r.scaleValue).toBe(days)
  })

  test('the due date is always 40w 0d of gestational age', () => {
    for (const cycleLength of [20, 28, 33, 45]) {
      const due = longToIso(compute({ ...base, cycleLength }).primary.value)
      const onTheDay = compute({ ...base, cycleLength, asOfDate: due })
      expect(stat(onTheDay, 'Gestational age')).toBe('40w 0d')
      expect(Number(stat(onTheDay, 'Days to the due date'))).toBe(0)
      expect(onTheDay.scaleValue).toBe(280)
    }
  })

  test('the countdown relabels itself once the due date has passed', () => {
    const before = compute({ ...base, asOfDate: '2026-10-12' })
    expect(before.stats!.some((s) => s.label === 'Days to the due date')).toBe(true)
    expect(Number(stat(before, 'Days to the due date'))).toBe(walkBetween('2026-10-12', '2026-10-22'))
    expect(Number(stat(before, 'Days to the due date'))).toBe(10)

    const after = compute({ ...base, asOfDate: '2026-10-27' })
    expect(after.stats!.some((s) => s.label === 'Days past the due date')).toBe(true)
    expect(Number(stat(after, 'Days past the due date'))).toBe(5)
    expect(after.notes!.some((n) => n.includes('post-term'))).toBe(false)
  })

  test('milestone dates sit at their stated gestational ages', () => {
    const r = compute(base)
    const expected: ReadonlyArray<readonly [string, number]> = [
      ['Estimated conception (day 14)', 14],
      ['Second trimester begins (14 weeks)', 98],
      ['Anatomy scan window opens (18 weeks)', 126],
      ['Third trimester begins (28 weeks)', 196],
      ['Early term begins (37 weeks)', 259],
      ['Full term begins (39 weeks)', 273],
      ['Estimated due date (40 weeks)', 280],
      ['Late term begins (41 weeks)', 287],
      ['Post-term begins (42 weeks)', 294],
    ]
    for (const [label, days] of expected) {
      expect(String(step(r, label)), label).toBe(walkForward('2026-01-15', days))
      // And the same date read back as a gestational age agrees.
      const back = compute({ ...base, asOfDate: String(step(r, label)) })
      expect(back.scaleValue, label).toBe(days)
    }
    expect(stat(r, 'Estimated conception')).toBe(step(r, 'Estimated conception (day 14)'))
    expect(stat(r, 'Full term begins')).toBe(step(r, 'Full term begins (39 weeks)'))
  })

  test('milestones move with the cycle adjustment, not just the due date', () => {
    const r = compute({ ...base, cycleLength: 35, asOfDate: '2026-04-09' })
    expect(String(step(r, 'Adjusted start of dating'))).toBe('2026-01-22')
    expect(step(r, 'Cycle adjustment (length − 28)')).toBe(7)
    expect(String(step(r, 'Estimated conception (day 14)'))).toBe(walkForward('2026-01-22', 14))
    // 84 days after the LMP is only 77 days after the adjusted start.
    expect(r.scaleValue).toBe(77)
    expect(stat(r, 'Gestational age')).toBe('11w 0d')
  })

  test('a cycle longer than the gap since the period clamps the age at zero', () => {
    // 45-day cycle, checked on the day of the period: dating has not started.
    const r = compute({ cycleLength: 45, lmpDate: '2026-01-15', asOfDate: '2026-01-15' })
    expect(r.scaleValue).toBe(0)
    expect(stat(r, 'Gestational age')).toBe('0w 0d')
    expect(r.notes!.some((n) => n.includes('before the cycle-adjusted start'))).toBe(true)
    expect(formatValue(r.stats![3]!.value, r.stats![3]!.format)).not.toMatch(/NaN|-/)
  })

  test('parts are two fixed slices of the 280-day whole', () => {
    for (const days of [0, 1, 84, 279, 280, 300, 322]) {
      const r = compute({ ...base, asOfDate: walkForward('2026-01-15', days) })
      expect(r.parts).toHaveLength(2)
      expect(r.parts!.map((p) => p.label)).toEqual(['Days completed', 'Days remaining'])
      const sum = r.parts!.reduce((acc, p) => acc + p.value, 0)
      expect(sum).toBeCloseTo(Number(r.partsTotal!.value), 4)
      expect(sum).toBe(280)
      for (const p of r.parts!) {
        expect(Number.isFinite(p.value)).toBe(true)
        expect(p.value).toBeGreaterThanOrEqual(0)
      }
      expect(r.parts![0]!.value).toBe(Math.min(days, 280))
    }
  })

  test('the scale is declared, banded, and always reachable by the scale value', () => {
    expect(definition.scale).toBeDefined()
    const scale = definition.scale!
    // The last band is the fallback in resolveBand, so nothing compute returns
    // may sit below the first band's floor.
    for (const days of [0, 1, 97, 98, 196, 280, 294, 322]) {
      const r = compute({ ...base, asOfDate: walkForward('2026-01-15', days) })
      expect(r.scaleValue).toBeGreaterThanOrEqual(scale.bands[0]!.from)
      const view = toResultView(r, scale)
      expect(view.band).toBeDefined()
      expect(view.scalePercent!).toBeGreaterThanOrEqual(0)
      expect(view.scalePercent!).toBeLessThanOrEqual(100)
    }
    expect(toResultView(compute({ ...base, asOfDate: '2026-01-15' }), scale).bandLabel).toContain(
      'First trimester',
    )
    expect(
      toResultView(compute({ ...base, asOfDate: walkForward('2026-01-15', 300) }), scale).bandLabel,
    ).toContain('Post-term')
  })

  test('the calculator accepts its own defaults, whatever today is', () => {
    // Both dates default to 'today', so the shipped starting state is day zero
    // on every possible build date — never an out-of-order pair, never a span
    // that has drifted past 46 weeks. Nothing here assumes a fixed today.
    expect(fields.filter((f) => f.kind === 'date').map((f) => f.default)).toEqual([
      'today',
      'today',
    ])
    const values = defaultValues({ fields }) as Input
    expect(values.lmpDate).toBe(values.asOfDate)

    const r = compute(values)
    expect(r.scaleValue).toBe(0)
    expect(stat(r, 'Gestational age')).toBe('0w 0d')
    expect(stat(r, 'Trimester')).toBe('First')
    expect(Number(stat(r, 'Days to the due date'))).toBe(280)
    expect(longToIso(r.primary.value)).toBe(walkForward(String(values.lmpDate), 280))
    expect(r.parts!.map((p) => p.value)).toEqual([0, 280])
  })

  test('is pure — the same input gives the same output', () => {
    expect(compute(base)).toEqual(compute(base))
  })

  test.each([
    ['a cycle length that will not parse', { cycleLength: Number.NaN }, 'cycleLength'],
    ['a cycle shorter than 20 days', { cycleLength: 19 }, 'cycleLength'],
    ['a cycle longer than 45 days', { cycleLength: 46 }, 'cycleLength'],
    ['an infinite cycle length', { cycleLength: Number.POSITIVE_INFINITY }, 'cycleLength'],
    ['a malformed last period', { lmpDate: '15/01/2026' }, 'lmpDate'],
    ['an empty last period', { lmpDate: '' }, 'lmpDate'],
    ['a last period that is not a real day', { lmpDate: '2026-02-30' }, 'lmpDate'],
    ['29 February in a common year', { lmpDate: '2026-02-29' }, 'lmpDate'],
    ['a month of 13', { lmpDate: '2026-13-01' }, 'lmpDate'],
    ['an absurd year', { lmpDate: '0001-01-01' }, 'lmpDate'],
    ['a malformed as-of date', { asOfDate: 'today' }, 'asOfDate'],
    ['an as-of date that is not a real day', { asOfDate: '2026-04-31' }, 'asOfDate'],
    ['a last period in the future', { lmpDate: '2026-04-10' }, 'lmpDate'],
    ['a last period 47 weeks ago', { asOfDate: '2026-12-31' }, 'lmpDate'],
  ])('rejects %s against the offending field', (_label, patch, fieldId) => {
    let thrown: unknown
    try {
      compute({ ...base, ...patch })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
    expect((thrown as CalcError).message.length).toBeGreaterThan(10)
  })

  test('a future last period is refused even by one day', () => {
    expect(() => compute({ ...base, lmpDate: '2026-04-09' })).not.toThrow()
    expect(() => compute({ ...base, lmpDate: '2026-04-10' })).toThrow(CalcError)
  })

  test('46 weeks of gestation is the last accepted span', () => {
    const edge = walkForward('2026-01-15', 322)
    expect(() => compute({ ...base, asOfDate: edge })).not.toThrow()
    expect(compute({ ...base, asOfDate: edge }).scaleValue).toBe(322)
    expect(() => compute({ ...base, asOfDate: walkForward(edge, 1) })).toThrow(CalcError)
  })

  test('both declared cycle bounds are values compute accepts', () => {
    const field = fields.find((f) => f.kind === 'number')!
    for (const cycleLength of [field.min!, field.max!, field.default]) {
      const values = { ...(defaultValues({ fields }) as Input), cycleLength }
      expect(() => compute(values)).not.toThrow()
    }
  })

  test('never renders NaN, Infinity or an em dash', () => {
    for (const patch of [
      {},
      { cycleLength: 20 },
      { cycleLength: 45 },
      { asOfDate: '2026-10-22' },
      { asOfDate: walkForward('2026-01-15', 322) },
    ]) {
      const r = compute({ ...base, ...patch })
      for (const q of [r.primary, ...r.stats!, ...r.steps!]) {
        if (!('label' in q)) continue
        if (q.format.style !== 'raw') expect(Number.isFinite(Number(q.value))).toBe(true)
        expect(formatValue(q.value, q.format)).not.toMatch(/NaN|Infinity|—/)
      }
      for (const p of r.parts!) expect(Number.isFinite(p.value)).toBe(true)
    }
  })

  test('the copy fits a search result and the standard is named', () => {
    expect(def.description.length).toBeGreaterThan(50)
    expect(def.description.length).toBeLessThanOrEqual(160)
    expect(def.seoTitle.length).toBeLessThanOrEqual(70)
    expect(def.faqs.length).toBeGreaterThanOrEqual(3)
    expect(def.disclaimer).toBe('health')
    expect(def.intro).toContain('Naegele')
    // The estimate is stated as an estimate, on the page and in the result.
    expect(def.intro).toContain('4%')
    expect(compute(base).notes!.some((n) => n.includes('4%'))).toBe(true)
  })
})

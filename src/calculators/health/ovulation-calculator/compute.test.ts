import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { CalcError } from '../../../lib/types'
import type { CalculatorDef } from '../../../lib/types'
import { defaultValues, toResultView } from '../../../lib/view'
import { formatValue } from '../../../lib/format'
import { fields } from './fields'

type Input = Parameters<typeof compute>[0]

// `def` is inferred through `satisfies`, so widening is how the test can ask
// about optional keys at all.
const definition: CalculatorDef = def

const base: Input = { cycleLength: 28, lmpDate: '2026-01-15' }

const stat = (r: ReturnType<typeof compute>, label: string) =>
  r.stats!.find((s) => s.label === label)!.value

const step = (r: ReturnType<typeof compute>, label: string) =>
  (r.steps!.find((s) => 'label' in s && s.label === label) as { value: number | string }).value

/**
 * The headline is written for a person ("28 January 2026"), so the tests convert
 * it back to ISO before doing any date arithmetic on it. Parsing it here is
 * deliberate: it pins the display format as well as the maths, so a malformed
 * long date fails rather than slipping through a lenient `Date` parse.
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

/**
 * VERIFICATION METHOD ONE: an independent calendar that shares nothing with
 * compute — no `Date`, no epoch arithmetic, just its own month-length table and
 * a day-at-a-time walk. If the UTC epoch maths in compute is wrong in a way that
 * still produces plausible dates, this disagrees with it.
 *
 * VERIFICATION METHOD TWO is the arithmetic shortcut used inline in the tests
 * below: day-of-month plus offset, carried across month lengths by hand and
 * written out in the comments so the number can be checked by eye.
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

const containsLeapDay = (from: string, n: number): boolean => {
  for (let i = 0; i <= n; i++) if (walkForward(from, i).slice(5) === '02-29') return true
  return false
}

describe('ovulation (calendar method, counted back from the next period)', () => {
  test('a 28-day cycle from 15 January 2026 ovulates on 28 January, confirmed two ways', () => {
    // THE PHYSIOLOGY: the luteal phase is fixed at 14 days, so ovulation sits on
    // cycle day 28 − 14 = 14. Cycle day 1 is the LMP itself, so cycle day 14 is
    // 13 days after it.
    expect(28 - 14).toBe(14)

    // 1. Arithmetic shortcut: 15 January + 13 days = 28 January, no month
    //    boundary crossed (January has 31 days and 15 + 13 = 28 ≤ 31).
    expect(15 + 13).toBe(28)

    // 2. The independent day-at-a-time walk, which knows nothing about compute.
    expect(walkForward('2026-01-15', 13)).toBe('2026-01-28')

    const r = compute(base)
    expect(longToIso(r.primary.value)).toBe('2026-01-28')
    expect(walkBetween('2026-01-15', longToIso(r.primary.value))).toBe(13)
    expect(step(r, 'Cycle day of ovulation')).toBe(14)
  })

  test('the fertile window is the six days ending on ovulation', () => {
    const r = compute(base)
    // Opens five days before ovulation: 28 − 5 = 23 January.
    expect(28 - 5).toBe(23)
    expect(walkForward('2026-01-15', 8)).toBe('2026-01-23')
    expect(longToIso(stat(r, 'Fertile window opens'))).toBe('2026-01-23')
    // Closes ON the day of ovulation, not after it.
    expect(stat(r, 'Fertile window closes')).toBe(r.primary.value)

    // Six days inclusive: 23, 24, 25, 26, 27, 28.
    expect(walkBetween(longToIso(stat(r, 'Fertile window opens')), longToIso(r.primary.value)) + 1).toBe(6)
    expect(step(r, 'Fertile window length')).toBe(6)
  })

  test('the next period is one whole cycle on, and ovulation 15 calendar days before it', () => {
    const r = compute(base)
    // 15 January + 28 days: January has 31, so 15 + 28 = 43 → 43 − 31 = 12 Feb.
    expect(15 + 28 - 31).toBe(12)
    expect(walkForward('2026-01-15', 28)).toBe('2026-02-12')
    expect(longToIso(stat(r, 'Next period expected'))).toBe('2026-02-12')

    // 14 days of the cycle REMAIN after ovulation day (cycle days 15–28), which
    // makes the next period begin 15 calendar days after ovulation. The step
    // states that outright so the off-by-one is never left to be inferred.
    expect(walkBetween('2026-01-28', '2026-02-12')).toBe(15)
    expect(step(r, 'Days from ovulation to that period')).toBe(15)
  })

  test('a 35-day cycle does not ovulate on day 14', () => {
    const r = compute({ ...base, cycleLength: 35 })
    expect(35 - 14).toBe(21)
    expect(step(r, 'Cycle day of ovulation')).toBe(21)
    // Cycle day 21 = 20 days after 15 January = 4 February (15 + 20 = 35, 35 − 31 = 4).
    expect(15 + 20 - 31).toBe(4)
    expect(walkForward('2026-01-15', 20)).toBe('2026-02-04')
    expect(longToIso(r.primary.value)).toBe('2026-02-04')
    // Seven days later than the 28-day answer, exactly the extra follicular week.
    expect(walkBetween(longToIso(compute(base).primary.value), longToIso(r.primary.value))).toBe(7)
    // The luteal phase has not moved.
    expect(stat(r, 'Luteal phase')).toBe(14)
    expect(step(r, 'Days from ovulation to that period')).toBe(15)
  })

  test('a short 21-day cycle ovulates on day 7, with the window opening on day 2', () => {
    const r = compute({ ...base, cycleLength: 21 })
    expect(21 - 14).toBe(7)
    expect(step(r, 'Cycle day of ovulation')).toBe(7)
    // Cycle day 7 = 6 days after 15 January = 21 January.
    expect(walkForward('2026-01-15', 6)).toBe('2026-01-21')
    expect(longToIso(r.primary.value)).toBe('2026-01-21')
    // Opens five days earlier — cycle day 2, which overlaps the period itself.
    expect(longToIso(stat(r, 'Fertile window opens'))).toBe('2026-01-16')
    expect(walkBetween('2026-01-15', longToIso(stat(r, 'Fertile window opens')))).toBe(1)
  })

  test('the 20-day floor is exactly where the window opens on cycle day 1', () => {
    // Below 20 the fertile window would open before the period it is counted
    // from, which is why the field floor is 20 rather than something rounder.
    const r = compute({ ...base, cycleLength: 20 })
    expect(step(r, 'Cycle day of ovulation')).toBe(6)
    expect(longToIso(stat(r, 'Fertile window opens'))).toBe('2026-01-15')
    expect(walkBetween('2026-01-15', longToIso(stat(r, 'Fertile window opens')))).toBe(0)
  })

  test('a span crossing 29 February lands a calendar day earlier than the same span in a common year', () => {
    // 2024 is a leap year. A 45-day cycle from 20 February ovulates on cycle day
    // 31, i.e. 30 days later, and that span crosses 29 February.
    expect(containsLeapDay('2024-02-20', 30)).toBe(true)
    expect(containsLeapDay('2026-02-20', 30)).toBe(false)

    // Arithmetic: February 2024 has 29 days, so 20 + 30 = 50 → 50 − 29 = 21 March.
    expect(20 + 30 - 29).toBe(21)
    expect(walkForward('2024-02-20', 30)).toBe('2024-03-21')
    const leap = compute({ cycleLength: 45, lmpDate: '2024-02-20' })
    expect(longToIso(leap.primary.value)).toBe('2024-03-21')

    // The same cycle in 2026: February has 28, so 20 + 30 = 50 → 50 − 28 = 22 March.
    expect(20 + 30 - 28).toBe(22)
    expect(walkForward('2026-02-20', 30)).toBe('2026-03-22')
    const common = compute({ cycleLength: 45, lmpDate: '2026-02-20' })
    expect(longToIso(common.primary.value)).toBe('2026-03-22')

    // The next period likewise: 20 Feb + 45 days is 5 April 2024, 6 April 2026.
    expect(longToIso(stat(leap, 'Next period expected'))).toBe(walkForward('2024-02-20', 45))
    expect(longToIso(stat(leap, 'Next period expected'))).toBe('2024-04-05')
    expect(longToIso(stat(common, 'Next period expected'))).toBe('2026-04-06')

    // And 29 February is itself a valid start.
    const onLeapDay = compute({ cycleLength: 28, lmpDate: '2024-02-29' })
    expect(longToIso(onLeapDay.primary.value)).toBe(walkForward('2024-02-29', 13))
    expect(longToIso(onLeapDay.primary.value)).toBe('2024-03-13')
  })

  test(
    'every date is exactly its own offset from the period, for many starts and cycles',
    () => {
      const starts = [
        '2026-01-15',
        '2026-02-28',
        '2024-02-29',
        '2025-12-31', // crosses a year boundary
        '2023-03-10',
        '1999-12-25', // crosses a century boundary
        '2100-01-01', // 2100 divides by 4 but is NOT a leap year
      ]
      for (const lmpDate of starts) {
        for (let cycleLength = 20; cycleLength <= 45; cycleLength += 1) {
          const r = compute({ cycleLength, lmpDate })
          const ovulation = longToIso(r.primary.value)

          // Method one: the independent walk, counting a day at a time.
          expect(walkBetween(lmpDate, ovulation)).toBe(cycleLength - 14 - 1)
          expect(walkBetween(lmpDate, longToIso(stat(r, 'Fertile window opens')))).toBe(
            cycleLength - 14 - 6,
          )
          expect(walkBetween(lmpDate, longToIso(stat(r, 'Next period expected')))).toBe(cycleLength)

          // Method two: the same dates rebuilt by walking forward by the offset.
          expect(ovulation).toBe(walkForward(lmpDate, cycleLength - 15))
          expect(longToIso(stat(r, 'Next period expected'))).toBe(walkForward(lmpDate, cycleLength))

          // The window is always six days, and always ends on ovulation.
          expect(
            walkBetween(longToIso(stat(r, 'Fertile window opens')), ovulation) + 1,
          ).toBe(6)
          expect(stat(r, 'Fertile window closes')).toBe(r.primary.value)
          expect(step(r, 'Cycle day of ovulation')).toBe(cycleLength - 14)
        }
      }
    },
    30_000,
  )

  test('the projected cycles repeat at exactly one cycle length', () => {
    for (const cycleLength of [20, 28, 31, 45]) {
      const r = compute({ ...base, cycleLength })
      for (let i = 1; i <= 3; i += 1) {
        const shift = (i - 1) * cycleLength
        expect(String(step(r, `Cycle ${i} — period begins`))).toBe(walkForward('2026-01-15', shift))
        expect(String(step(r, `Cycle ${i} — estimated ovulation (window closes)`))).toBe(
          walkForward('2026-01-15', shift + cycleLength - 15),
        )
        expect(String(step(r, `Cycle ${i} — fertile window opens`))).toBe(
          walkForward('2026-01-15', shift + cycleLength - 20),
        )
        expect(String(step(r, `Cycle ${i} — next period expected`))).toBe(
          walkForward('2026-01-15', shift + cycleLength),
        )
      }
      // Cycle n+1's period begins on cycle n's expected next period.
      expect(step(r, 'Cycle 2 — period begins')).toBe(step(r, 'Cycle 1 — next period expected'))
      expect(step(r, 'Cycle 3 — period begins')).toBe(step(r, 'Cycle 2 — next period expected'))
    }
  })

  test('the parts and step counts never vary with input', () => {
    const shape = (cycleLength: number) => {
      const r = compute({ ...base, cycleLength })
      return { parts: r.parts!.length, steps: r.steps!.length, series: r.series?.length ?? 0 }
    }
    const reference = shape(28)
    // 5 opening steps + 3 projected cycles × (1 rule + 4 dates) + 1 rule + 2 = 23.
    expect(5 + 3 * 5 + 1 + 2).toBe(23)
    expect(reference).toEqual({ parts: 2, steps: 23, series: 0 })
    for (let cycleLength = 20; cycleLength <= 45; cycleLength += 1) {
      expect(shape(cycleLength), String(cycleLength)).toEqual(reference)
    }
  })

  test('the two phases sum exactly to the cycle, and neither is negative', () => {
    for (let cycleLength = 20; cycleLength <= 45; cycleLength += 1) {
      const r = compute({ ...base, cycleLength })
      expect(r.parts!.map((p) => p.label)).toEqual([
        'Follicular phase (to ovulation)',
        'Luteal phase (after ovulation)',
      ])
      const sum = r.parts!.reduce((acc, p) => acc + p.value, 0)
      expect(sum).toBeCloseTo(Number(r.partsTotal!.value), 4)
      expect(sum).toBe(cycleLength)
      expect(r.parts![1]!.value).toBe(14)
      expect(r.parts![0]!.value).toBe(cycleLength - 14)
      for (const p of r.parts!) {
        expect(Number.isFinite(p.value)).toBe(true)
        expect(p.value).toBeGreaterThanOrEqual(0)
      }
    }
  })

  test('a fractional cycle rounds to whole days — a cycle day is a calendar day', () => {
    const at = (cycleLength: number) => longToIso(compute({ ...base, cycleLength }).primary.value)
    expect(at(30.8)).toBe(at(31))
    expect(at(30.8)).not.toBe(at(28))
    // Rounded, not truncated: 30.8 is a 31-day cycle, not a 30-day one.
    expect(at(30.8)).not.toBe(at(30))
  })

  test('the end-to-end nudge of the first number field changes the result', () => {
    // tests/calculators.spec.ts fills the first number field with 1.1x its
    // default and requires a different, valid headline. 28 × 1.1 = 30.8.
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('cycleLength')
    expect(fields[0]!.id).toBe('cycleLength')
    const bumped = Number((first.default * 1.1).toFixed(4))
    const values = defaultValues({ fields }) as Input
    expect(() => compute({ ...values, cycleLength: bumped })).not.toThrow()
    expect(compute({ ...values, cycleLength: bumped }).primary.value).not.toBe(
      compute(values).primary.value,
    )
  })

  test('the default sits on min + n × step, and both bounds compute accepts', () => {
    const field = fields.find((f) => f.kind === 'number')!
    expect((field.default - field.min!) % field.step!).toBe(0)
    for (const cycleLength of [field.min!, field.max!, field.default]) {
      expect(() => compute({ ...(defaultValues({ fields }) as Input), cycleLength })).not.toThrow()
    }
  })

  test('the calculator accepts its own defaults, whatever today is', () => {
    // The date defaults to 'today', which is why registry.test.ts skips this
    // calculator's stability snapshot — and why every other test above pins an
    // explicit date rather than relying on the clock.
    expect(fields.filter((f) => f.kind === 'date').map((f) => f.default)).toEqual(['today'])
    const values = defaultValues({ fields }) as Input
    const r = compute(values)
    expect(r.scaleValue).toBe(28)
    expect(step(r, 'Cycle day of ovulation')).toBe(14)
    expect(longToIso(r.primary.value)).toBe(walkForward(String(values.lmpDate), 13))
    expect(r.parts!.map((p) => p.value)).toEqual([14, 14])
    // Drawable at the defaults: the donut is server-rendered from this result.
    expect(r.parts!.length).toBe(2)
  })

  test('is pure — the same input gives the same output', () => {
    expect(compute(base)).toEqual(compute(base))
  })

  test('the scale is declared, banded, and always reachable by the scale value', () => {
    expect(definition.scale).toBeDefined()
    const scale = definition.scale!
    // The last band is resolveBand's fallback, so nothing compute returns may
    // sit below the first band's floor.
    for (let cycleLength = 20; cycleLength <= 45; cycleLength += 1) {
      const r = compute({ ...base, cycleLength })
      expect(r.scaleValue).toBe(cycleLength)
      expect(r.scaleValue!).toBeGreaterThanOrEqual(scale.bands[0]!.from)
      const view = toResultView(r, scale)
      expect(view.band).toBeDefined()
      expect(view.scalePercent!).toBeGreaterThanOrEqual(0)
      expect(view.scalePercent!).toBeLessThanOrEqual(100)
    }
    // The bands are contiguous and start at the field floor.
    expect(scale.bands[0]!.from).toBe(20)
    for (let i = 1; i < scale.bands.length; i += 1) {
      expect(scale.bands[i]!.from).toBe(scale.bands[i - 1]!.to)
    }
    expect(toResultView(compute({ ...base, cycleLength: 20 }), scale).band).toBe('warn')
    expect(toResultView(compute({ ...base, cycleLength: 28 }), scale).band).toBe('good')
    expect(toResultView(compute({ ...base, cycleLength: 35 }), scale).band).toBe('good')
    expect(toResultView(compute({ ...base, cycleLength: 36 }), scale).band).toBe('warn')
  })

  test('an out-of-typical-range cycle says so, and a typical one does not', () => {
    const outside = compute({ ...base, cycleLength: 40 })
    expect(outside.notes!.some((n) => n.includes('outside the typical'))).toBe(true)
    const inside = compute(base)
    expect(inside.notes!.some((n) => n.includes('outside the typical'))).toBe(false)
  })

  test.each([
    ['a cycle length that will not parse', { cycleLength: Number.NaN }, 'cycleLength'],
    ['an infinite cycle length', { cycleLength: Number.POSITIVE_INFINITY }, 'cycleLength'],
    ['a negative infinite cycle length', { cycleLength: Number.NEGATIVE_INFINITY }, 'cycleLength'],
    ['a cycle shorter than 20 days', { cycleLength: 19 }, 'cycleLength'],
    ['a zero cycle length', { cycleLength: 0 }, 'cycleLength'],
    ['a negative cycle length', { cycleLength: -28 }, 'cycleLength'],
    ['a cycle longer than 45 days', { cycleLength: 46 }, 'cycleLength'],
    ['a malformed last period', { lmpDate: '15/01/2026' }, 'lmpDate'],
    ['an empty last period', { lmpDate: '' }, 'lmpDate'],
    ['the literal string today', { lmpDate: 'today' }, 'lmpDate'],
    ['a last period that is not a real day', { lmpDate: '2026-02-30' }, 'lmpDate'],
    ['29 February in a common year', { lmpDate: '2026-02-29' }, 'lmpDate'],
    ['a month of 13', { lmpDate: '2026-13-01' }, 'lmpDate'],
    ['an absurd year', { lmpDate: '0001-01-01' }, 'lmpDate'],
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

  test('NaN is caught by the finiteness guard, not by a magnitude test', () => {
    // `Number.NaN < 20` is false, so an ordering check alone would let NaN reach
    // the date arithmetic and emit an "Invalid Date" headline.
    expect(Number.NaN < 20).toBe(false)
    expect(Number.NaN > 45).toBe(false)
    expect(() => compute({ ...base, cycleLength: Number.NaN })).toThrow(CalcError)
  })

  test('never renders NaN, Infinity or an em dash', () => {
    for (const cycleLength of [20, 28, 30.8, 35, 45]) {
      for (const lmpDate of ['2026-01-15', '2024-02-29', '1999-12-25', '2100-01-01']) {
        const r = compute({ cycleLength, lmpDate })
        for (const q of [r.primary, ...r.stats!, ...r.steps!]) {
          if (!('label' in q)) continue
          if (q.format.style !== 'raw') expect(Number.isFinite(Number(q.value))).toBe(true)
          expect(formatValue(q.value, q.format)).not.toMatch(/NaN|Infinity|Invalid|—/)
        }
        for (const p of r.parts!) expect(Number.isFinite(p.value)).toBe(true)
      }
    }
  })

  test('the copy fits a search result and says the things it must say', () => {
    expect(def.description.length).toBeGreaterThan(50)
    expect(def.description.length).toBeLessThanOrEqual(160)
    expect(def.seoTitle.length).toBeLessThanOrEqual(70)
    expect(def.faqs.length).toBeGreaterThanOrEqual(3)
    for (const faq of def.faqs) expect(faq.a.length).toBeGreaterThan(120)
    expect(def.disclaimer).toBe('health')

    // The physiology that makes this calculable is stated up front.
    expect(def.intro).toContain('luteal')
    expect(def.intro).toContain('14')

    // The three honesty points, on the page and in the result.
    const notes = compute(base).notes!.join(' ')
    expect(notes).toContain('not a contraceptive method')
    expect(def.intro).toContain('not a contraceptive method')
    expect(notes).toContain('population averages')
    expect(notes).toMatch(/vary|varies/)

    // The fertile-window source is cited where the window is defined.
    expect(notes).toContain('Wilcox')
    expect(notes).toContain('1995')
    expect(def.faqs.some((f) => f.a.includes('Wilcox'))).toBe(true)
    expect(def.faqs.some((f) => f.a.includes('not a contraceptive method'))).toBe(true)
  })
})

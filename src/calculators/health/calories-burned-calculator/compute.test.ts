import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { ACTIVITIES } from './fields'
import { CalcError } from '../../../lib/types'

/**
 * The defaults: brisk walking at 4.3 METs, 70 kg, 45 minutes.
 *
 * Widened away from `as const` so `{ ...base, weight: 77 }` type-checks — with
 * the literal types pinned, an override of a different number is a type error.
 */
const base: {
  units: string
  activity: string
  weight: number
  duration: number
} = { units: 'metric', activity: 'walkBrisk', weight: 70, duration: 45 }

const primary = (v: typeof base) => Number(compute(v).primary.value)
const stat = (v: typeof base, label: string) =>
  Number(compute(v).stats!.find((s) => s.label.startsWith(label))!.value)

/*
 * THE DEFAULT, DERIVED BY HAND.
 *
 *   kcal/min = MET x 3.5 x kg / 200
 *            = 4.3 x 3.5 x 70 / 200
 *            = 4.3 x 245 / 200
 *            = 4.3 x 1.225
 *            = 5.2675 kcal/min
 *   kcal     = 5.2675 x 45 = 237.0375
 *
 * CONFIRMED A SECOND, INDEPENDENT WAY — through the oxygen the equation is
 * actually a shorthand for, never touching the constant 200:
 *
 *   uptake        = 4.3 METs x 3.5 ml/kg/min      = 15.05 ml/kg/min
 *   per minute    = 15.05 x 70 kg                 = 1053.5 ml/min
 *   over 45 min   = 1053.5 x 45                   = 47407.5 ml = 47.4075 L
 *   energy        = 47.4075 L x 5 kcal/L          = 237.0375 kcal
 *
 * The two agree exactly, which is the point: 200 is 1000 ml/L divided by
 * 5 kcal/L, so a misplaced constant would show up as a mismatch here.
 */
const DEFAULT_GROSS = 237.0375
/** Resting over the same 45 minutes: 1 x 3.5 x 70 / 200 x 45 = 55.125 kcal. */
const DEFAULT_RESTING = 55.125
/** Net: (4.3 - 1) x 3.5 x 70 / 200 x 45 = 3.3 x 1.225 x 45 = 181.9125 kcal. */
const DEFAULT_NET = 181.9125

describe('calories-burned', () => {
  test('the default headline is the hand-derived MET figure', () => {
    expect(primary(base)).toBeCloseTo(DEFAULT_GROSS, 9)
  })

  test('and the oxygen route confirms it independently of the /200 constant', () => {
    const uptake = 4.3 * 3.5 // ml of O2 per kg per minute
    const litres = (uptake * 70 * 45) / 1000
    expect(litres).toBeCloseTo(47.4075, 9)
    expect(litres * 5).toBeCloseTo(primary(base), 9)
  })

  test('gross splits into resting plus net, both hand-derived', () => {
    expect(stat(base, 'Resting share')).toBeCloseTo(DEFAULT_RESTING, 9)
    expect(stat(base, 'Net —')).toBeCloseTo(DEFAULT_NET, 9)
    expect(DEFAULT_RESTING + DEFAULT_NET).toBeCloseTo(DEFAULT_GROSS, 9)
  })

  test('net uses (MET − 1), so the resting share is exactly 1/MET of the gross', () => {
    for (const { value, met } of ACTIVITIES) {
      const v = { ...base, activity: value }
      const gross = primary(v)
      const resting = stat(v, 'Resting share')
      expect(resting / gross, value).toBeCloseTo(1 / met, 12)
      expect(stat(v, 'Net —'), value).toBeCloseTo(gross * (1 - 1 / met), 9)
    }
  })

  test('parts decompose the headline exactly and stay non-negative', () => {
    const result = compute(base)
    const sum = result.parts!.reduce((acc, p) => acc + p.value, 0)
    expect(sum).toBeCloseTo(Number(result.primary.value), 9)
    for (const part of result.parts!) expect(part.value).toBeGreaterThanOrEqual(0)
  })

  // The equation is linear in both weight and time. A misplaced constant — a
  // squared term, an added rather than multiplied duration — breaks one of
  // these two even while the default value still looks plausible.
  test('doubling the duration doubles the calories', () => {
    expect(primary({ ...base, duration: 90 })).toBeCloseTo(2 * primary(base), 9)
    expect(primary({ ...base, duration: 15 })).toBeCloseTo(primary(base) / 3, 9)
  })

  test('doubling the weight doubles the calories', () => {
    expect(primary({ ...base, weight: 140 })).toBeCloseTo(2 * primary(base), 9)
    expect(primary({ ...base, weight: 35 })).toBeCloseTo(primary(base) / 2, 9)
  })

  test('the burn rate is the headline per minute', () => {
    expect(stat(base, 'Burn rate')).toBeCloseTo(5.2675, 9)
    expect(stat(base, 'Burn rate') * 45).toBeCloseTo(primary(base), 9)
  })

  // Same physical person, stated two ways. The imperial path divides by
  // 2.2046226218487757 before touching the equation, so the answer must match to
  // floating-point noise rather than merely being close.
  test('metric and imperial describe the same burn', () => {
    const lb = 70 * 2.2046226218487757
    const imperial = { ...base, units: 'imperial', weight: lb }
    expect(primary(imperial)).toBeCloseTo(DEFAULT_GROSS, 9)
    expect(stat(imperial, 'Net —')).toBeCloseTo(DEFAULT_NET, 9)
  })

  test('a 200 lb runner matches the same person entered as 90.72 kg', () => {
    const pounds = { ...base, units: 'imperial', weight: 200, activity: 'runModerate' }
    const kilos = { ...base, weight: 200 / 2.2046226218487757, activity: 'runModerate' }
    expect(primary(pounds)).toBeCloseTo(primary(kilos), 9)
    // And by hand: 9.8 x 3.5 x (200/2.2046226218487757) / 200 x 45.
    expect(primary(pounds)).toBeCloseTo(
      (9.8 * 3.5 * (200 / 2.2046226218487757) * 45) / 200,
      9,
    )
  })

  test('every offered activity computes and lands in MET order', () => {
    const sorted = [...ACTIVITIES].sort((a, b) => a.met - b.met)
    let previous = -1
    for (const { value } of sorted) {
      const kcal = primary({ ...base, activity: value })
      expect(Number.isFinite(kcal)).toBe(true)
      expect(kcal).toBeGreaterThanOrEqual(previous)
      previous = kcal
    }
  })

  test('the part and stat counts do not vary with input', () => {
    const shapes = new Set(
      ACTIVITIES.map(({ value }) => {
        const r = compute({ ...base, activity: value, weight: 55, duration: 200 })
        return `${r.parts!.length}/${r.stats!.length}/${r.steps!.length}`
      }),
    )
    expect(shapes.size).toBe(1)
  })

  test('rejects a weight of zero against the weight field', () => {
    let thrown: unknown
    try {
      compute({ ...base, weight: 0 })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe('weight')
  })

  test('rejects a duration of zero against the duration field', () => {
    let thrown: unknown
    try {
      compute({ ...base, duration: 0 })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe('duration')
  })

  test('rejects an activity that is not in the compendium list', () => {
    let thrown: unknown
    try {
      compute({ ...base, activity: 'jetpacking' })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe('activity')
  })

  test('never returns NaN for unparseable input', () => {
    expect(() => compute({ ...base, weight: Number.NaN })).toThrow(CalcError)
    expect(() => compute({ ...base, duration: Number.NaN })).toThrow(CalcError)
    expect(() => compute({ ...base, weight: Number.POSITIVE_INFINITY })).toThrow(CalcError)
  })

  test('refuses a weight far beyond what the form can offer', () => {
    expect(() => compute({ ...base, weight: 900 })).toThrow(CalcError)
  })

  // The registry-wide conformance suite checks these too, but only once the
  // calculator is in the barrel. Keeping them here means the copy is checked
  // from the moment it is written.
  test('the copy fits a search result', () => {
    expect(def.description.length).toBeGreaterThan(50)
    expect(def.description.length).toBeLessThanOrEqual(160)
    expect(def.seoTitle.length).toBeLessThanOrEqual(70)
    expect(def.faqs.length).toBeGreaterThanOrEqual(3)
    for (const faq of def.faqs) {
      expect(faq.q.endsWith('?')).toBe(true)
      expect(faq.a.length).toBeGreaterThan(40)
    }
  })

  test('accepts both ends of both sliders, in both unit systems', () => {
    for (const [units, lo, hi] of [
      ['metric', 30, 300],
      ['imperial', 66, 660],
    ] as const) {
      for (const weight of [lo, hi]) {
        for (const duration of [1, 720]) {
          expect(() => compute({ ...base, units, weight, duration })).not.toThrow()
        }
      }
    }
  })
})

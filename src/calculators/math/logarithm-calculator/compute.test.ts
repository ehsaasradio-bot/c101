import { describe, expect, test } from 'vitest'
import compute from './compute'
import { fields } from './fields'
import def from './index'
import { CalcError } from '../../../lib/types'
import { formatValue } from '../../../lib/format'
import { defaultValues, toResultView } from '../../../lib/view'

type Input = { x: number; base: number; logValue: number }

const DEFAULTS: Input = { x: 1000, base: 10, logValue: 3 }
const at = (over: Partial<Input> = {}) => compute({ ...DEFAULTS, ...over })

/** The value of a named stat, which may legitimately be a string. */
const stat = (r: ReturnType<typeof compute>, label: string): string | number => {
  const found = r.stats!.find((s) => s.label === label)
  if (!found) throw new Error(`no stat labelled ${label}`)
  return found.value
}

/** The rendered text of a named stat, i.e. what a visitor actually reads. */
const statText = (r: ReturnType<typeof compute>, label: string): string => {
  const view = toResultView(r)
  const found = view.stats.find((s) => s.label === label)
  if (!found) throw new Error(`no stat labelled ${label}`)
  return found.text
}

const stepValue = (r: ReturnType<typeof compute>, startsWith: string): string => {
  const found = r
    .steps!.filter((s): s is Extract<typeof s, { label: string }> => !('rule' in s))
    .find((s) => s.label.startsWith(startsWith))
  if (!found) throw new Error(`no step starting ${startsWith}`)
  return String(found.value)
}

/** The headline logarithm, as a number. */
const logOf = (x: number, base: number) => Number(at({ x, base }).primary.value)

/**
 * A logarithm found with no logarithm function at all: bisect for the exponent
 * y that satisfies b^y = x. Independent of change of base, of Math.log10 and
 * Math.log2, and of every shortcut compute takes — so when this and compute
 * agree, the agreement means something.
 *
 * Bases below 1 invert the direction of f, so the bracket grows symmetrically
 * outward from zero until the sign flips rather than in one direction.
 */
function bisectLog(x: number, base: number): number {
  const f = (y: number) => Math.pow(base, y) - x
  let lo = -1
  let hi = 1
  while (Math.sign(f(lo)) === Math.sign(f(hi)) && hi < 4096) {
    lo *= 2
    hi *= 2
  }
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2
    if (Math.sign(f(mid)) === Math.sign(f(lo))) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** Bases and values swept by the round-trip, identity and shape checks. */
const BASES = [0.1, 0.5, 1.5, 2, Math.E, 3, 7, 10, 60, 1000]
const VALUES = [0.001, 0.01, 0.125, 0.5, 1, 1.5, 2, 7, 10, 64, 100, 343, 1000, 1024, 123456, 1e9]

describe('logarithm-calculator', () => {
  // ── Anchors ─────────────────────────────────────────────────────────────
  // Exact powers, where the right answer is a whole number and admits no
  // rounding argument. Each is the definition of a logarithm read backwards:
  // 2^10 = 1024, 10^-3 = 0.001, e^1 = e, 10^3 = 1000, 7^3 = 343, 0.5^3 = 0.125.

  test('the textbook anchors come out exact, not nearly exact', () => {
    expect(logOf(1024, 2)).toBe(10)
    expect(logOf(0.001, 10)).toBe(-3)
    expect(logOf(Math.E, Math.E)).toBe(1)
    expect(logOf(1000, 10)).toBe(3)
    expect(logOf(343, 7)).toBe(3)
    expect(logOf(0.125, 0.5)).toBe(3)
    expect(logOf(1e9, 10)).toBe(9)
    expect(logOf(1, 10)).toBe(0)
  })

  test('the naive change-of-base division really is wrong on these inputs', () => {
    // Guards the guard. If a future engine made these exact, the special casing
    // in compute would be dead code and this test would say so.
    expect(Math.log(1000) / Math.log(10)).toBe(2.9999999999999996)
    expect(Math.log(343) / Math.log(7)).not.toBe(3)
    // The unretouched division is still reported, next to the corrected answer,
    // so the page shows what the formula literally produces.
    expect(stat(at(), 'Change of base: ln(x) ÷ ln(b)')).toBe(2.9999999999999996)
  })

  // ── Floating-point presentation ─────────────────────────────────────────
  // Getting the value right is only half of it: a formatter that prints
  // "3.000000" for an exact answer looks just as broken as 2.9999999999999996.

  test('an exact power renders as a whole number, and an inexact one keeps decimals', () => {
    const exact = at()
    expect(exact.primary.format).toEqual({ style: 'decimal', decimals: 0 })
    expect(formatValue(exact.primary.value, exact.primary.format)).toBe('3')
    expect(toResultView(exact).primary.text).toBe('3')

    const inexact = at({ x: 999 })
    expect(inexact.primary.format).toEqual({ style: 'decimal', decimals: 6 })
    expect(toResultView(inexact).primary.text).toBe('2.999565')

    expect(toResultView(at({ x: 1024, base: 2 })).primary.text).toBe('10')
    expect(toResultView(at({ x: 0.001, base: 10 })).primary.text).toBe('-3')
    expect(toResultView(at({ x: 343, base: 7 })).primary.text).toBe('3')
  })

  test('a near-integer that is not a power is left exactly where the arithmetic put it', () => {
    // log10(999) is 2.99956..., which must not be snapped to 3.
    expect(logOf(999, 10)).not.toBe(3)
    expect(logOf(999, 10)).toBeCloseTo(2.9995654882259823, 12)
    expect(stat(at({ x: 999 }), 'Is x an exact power of b?')).toBe('No')
    // And one that is a power, in a base with no dedicated routine, is snapped.
    expect(stat(at({ x: 343, base: 7 }), 'Is x an exact power of b?')).toBe('Yes — b^3 = 343')
  })

  test('log of 1 is a plain zero in every base, never a negative zero', () => {
    // ln(1) / ln(0.5) is -0 in IEEE 754, and Intl renders -0 as "-0". A
    // logarithm calculator answering "-0" looks broken, and the answer is
    // simply 0: any base to the power 0 is 1.
    for (const base of BASES) {
      const y = logOf(1, base)
      expect(y).toBe(0)
      expect(Object.is(y, -0), `b=${base}`).toBe(false)
      expect(toResultView(at({ x: 1, base })).primary.text, `b=${base}`).toBe('0')
      expect(statText(at({ x: 1, base }), 'Change of base: ln(x) ÷ ln(b)'), `b=${base}`).toBe(
        '0.000000',
      )
    }
  })

  test('exact figures elsewhere in the result read as whole numbers too', () => {
    const r = at()
    // 10^3 is 1000, not 1,000.000000, in both the check and the inverse.
    expect(statText(r, 'Check: b raised to the answer')).toBe('1,000')
    expect(statText(r, 'Inverse: x when the logarithm is y')).toBe('1,000')
    // The three named logarithms of 1000: log10 is exactly 3, the other two are not.
    expect(statText(r, 'Common logarithm log₁₀(x)')).toBe('3')
    expect(statText(r, 'Natural logarithm ln(x)')).toBe('6.907755')
    expect(statText(r, 'Binary logarithm log₂(x)')).toBe('9.965784')
  })

  // ── Confirmation, two independent ways ──────────────────────────────────

  test(
    'first confirmation — round trip: b^(log_b(x)) returns x across a sweep',
    () => {
      for (const base of BASES) {
        for (const x of VALUES) {
          const y = logOf(x, base)
          expect(Number.isFinite(y), `b=${base} x=${x}`).toBe(true)
          const back = Math.pow(base, y)
          // Relative: log and pow are each correctly rounded at best, so the
          // trip closes to within a few ulps rather than exactly. The worst
          // case observed across this sweep is 1.8e-15.
          expect(Math.abs(back - x) / x, `b=${base} x=${x}`).toBeLessThan(1e-13)
        }
      }
    },
    30_000,
  )

  test(
    'second confirmation — bisection: the same answers with no logarithm function',
    () => {
      for (const base of BASES) {
        for (const x of VALUES) {
          const y = logOf(x, base)
          const bisected = bisectLog(x, base)
          expect(Math.abs(y - bisected), `b=${base} x=${x}`).toBeLessThan(
            1e-9 * Math.max(1, Math.abs(y)),
          )
        }
      }
    },
    30_000,
  )

  // ── Identities ──────────────────────────────────────────────────────────

  test('log(xy) = log(x) + log(y) in every base', () => {
    for (const base of BASES) {
      for (const [p, q] of [
        [2, 3],
        [7, 13],
        [0.5, 400],
        [1.25, 6.4],
        [1000, 1000],
      ] as const) {
        const sum = logOf(p, base) + logOf(q, base)
        const product = logOf(p * q, base)
        expect(Math.abs(product - sum), `b=${base} ${p}×${q}`).toBeLessThan(
          1e-12 * Math.max(1, Math.abs(product)),
        )
      }
    }
  })

  test('log(x ÷ y) = log(x) − log(y), and log(x^k) = k·log(x)', () => {
    for (const base of [0.5, 2, Math.E, 3, 10]) {
      expect(logOf(1000 / 8, base)).toBeCloseTo(logOf(1000, base) - logOf(8, base), 12)
      expect(logOf(Math.pow(5, 4), base)).toBeCloseTo(4 * logOf(5, base), 12)
    }
  })

  test('change of base agrees with a directly computed logarithm', () => {
    for (const x of VALUES) {
      // The three bases with dedicated routines, against the division.
      expect(Math.abs(logOf(x, 10) - Math.log(x) / Math.log(10)), `x=${x}`).toBeLessThan(1e-12)
      expect(Math.abs(logOf(x, 2) - Math.log(x) / Math.log(2)), `x=${x}`).toBeLessThan(1e-12)
      expect(logOf(x, Math.E)).toBe(Math.log(x))
      // And a base with no dedicated routine, against the same division.
      expect(Math.abs(logOf(x, 7) - Math.log(x) / Math.log(7)), `x=${x}`).toBeLessThan(1e-12)
      // The identity behind the formula: log2(x) = log10(x) ÷ log10(2).
      if (x !== 1) expect(logOf(x, 2) / logOf(x, 10)).toBeCloseTo(1 / Math.log10(2), 9)
    }
  })

  test('the reported common, natural and binary logs are the standard functions', () => {
    for (const x of VALUES) {
      const r = at({ x })
      expect(stat(r, 'Common logarithm log₁₀(x)'), `x=${x}`).toBe(Math.log10(x))
      expect(stat(r, 'Natural logarithm ln(x)'), `x=${x}`).toBe(Math.log(x))
      expect(stat(r, 'Binary logarithm log₂(x)'), `x=${x}`).toBe(Math.log2(x))
    }
  })

  test('the change-of-base step spells the formula out with real numbers', () => {
    expect(stepValue(at(), 'Change of base')).toBe('6.907755279 ÷ 2.302585093 = 3')
    // Those two printed logarithms really do divide to the stated answer.
    expect(6.907755279 / 2.302585093).toBeCloseTo(3, 8)
    expect(stepValue(at({ x: 1024, base: 2 }), 'Change of base')).toBe(
      '6.931471806 ÷ 0.6931471806 = 10',
    )
  })

  // ── The inverse direction ───────────────────────────────────────────────

  test('the antilogarithm recovers the x a logarithm came from', () => {
    // At the defaults the two directions close the loop: log10(1000) = 3, 10^3 = 1000.
    expect(stat(at(), 'Inverse: x when the logarithm is y')).toBe(1000)

    for (const base of BASES) {
      for (const y of [-7, -1.5, 0, 0.5, 1, 4.25, 9]) {
        const antilog = Number(stat(at({ base, logValue: y }), 'Inverse: x when the logarithm is y'))
        expect(Number.isFinite(antilog), `b=${base} y=${y}`).toBe(true)
        expect(antilog, `b=${base} y=${y}`).toBeGreaterThan(0)
        // Straight back in: log_b(b^y) must be y again.
        expect(logOf(antilog, base), `b=${base} y=${y}`).toBeCloseTo(y, 9)
      }
    }
  })

  test('the round-trip check stat reproduces x', () => {
    for (const base of [0.5, 2, Math.E, 7, 10, 1000]) {
      for (const x of [0.01, 1, 42, 1024, 1e9]) {
        const back = Number(stat(at({ x, base }), 'Check: b raised to the answer'))
        expect(Math.abs(back - x) / x, `b=${base} x=${x}`).toBeLessThan(1e-13)
      }
    }
  })

  // ── Refusals ────────────────────────────────────────────────────────────

  test.each([
    ['x of zero', { x: 0 }, 'x'],
    ['a negative x', { x: -8 }, 'x'],
    ['a non-finite x', { x: Number.NaN }, 'x'],
    ['an infinite x', { x: Number.POSITIVE_INFINITY }, 'x'],
    ['a base of zero', { base: 0 }, 'base'],
    ['a negative base', { base: -2 }, 'base'],
    ['a base of exactly 1', { base: 1 }, 'base'],
    ['a non-finite base', { base: Number.NaN }, 'base'],
    ['an infinite base', { base: Number.POSITIVE_INFINITY }, 'base'],
    ['a non-finite known logarithm', { logValue: Number.NaN }, 'logValue'],
    ['an antilogarithm that overflows', { base: 1000, logValue: 500 }, 'logValue'],
    ['an antilogarithm that underflows', { base: 1000, logValue: -500 }, 'logValue'],
  ])('rejects %s against the offending field', (_label, over, fieldId) => {
    let thrown: unknown
    try {
      at(over as Partial<Input>)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
    // A refusal has to explain itself: the form prints this next to the field,
    // and "invalid" tells a visitor nothing they did not already know.
    const message = (thrown as CalcError).message
    expect(message.length, message).toBeGreaterThan(40)
    expect(message.trim().endsWith('.'), message).toBe(true)
  })

  test('the refusals say WHY, in the domain', () => {
    const message = (over: Partial<Input>) => {
      try {
        at(over)
      } catch (err) {
        return (err as CalcError).message
      }
      throw new Error('expected a refusal')
    }
    // x <= 0: no real power of a positive base is ever zero or negative.
    expect(message({ x: 0 })).toMatch(/positive/i)
    expect(message({ x: -8 })).toMatch(/no real logarithm/i)
    // base <= 0 and base === 1 are invalid for two different reasons.
    expect(message({ base: -2 })).toMatch(/greater than zero/i)
    expect(message({ base: 1 })).toMatch(/1 raised to any power/i)
    // Unparseable input arrives as NaN from coerceValues, not as a magnitude.
    expect(message({ x: Number.NaN })).toMatch(/number/i)
  })

  test('the finiteness guard runs before the magnitude guard', () => {
    // `x <= 0` is false for NaN, so a magnitude-first ordering would let NaN
    // straight through to Math.log and return NaN. The message proves which
    // guard fired: it must be the "enter a number" one, not the "must be
    // greater than zero" one.
    const caught = (() => {
      try {
        at({ x: Number.NaN })
      } catch (err) {
        return err as CalcError
      }
      throw new Error('expected a refusal')
    })()
    expect(caught.message).not.toMatch(/greater than zero/i)
  })

  test('base 1 is refused even for x = 1, where every exponent would work', () => {
    // log base 1 of 1 is not 0 — it is every number at once, which is why the
    // base is rejected rather than special-cased into an answer.
    expect(() => at({ x: 1, base: 1 })).toThrow(CalcError)
  })

  test('never renders NaN, an em dash, or a negative zero, across the input space', () => {
    for (const base of BASES) {
      for (const x of VALUES) {
        for (const logValue of [-3, 0, 3]) {
          const view = toResultView(at({ x, base, logValue }))
          const where = `b=${base} x=${x} y=${logValue}`
          const texts = [
            view.primary.text,
            ...view.stats.map((s) => s.text),
            ...view.steps.flatMap((s) => ('rule' in s ? [] : [s.text])),
            ...view.notes,
          ]
          for (const text of texts) {
            expect(text, where).not.toContain('NaN')
            expect(text, where).not.toBe('—')
            expect(text, where).not.toMatch(/^-0(\.0+)?$/)
            expect(text.length, where).toBeGreaterThan(0)
          }
        }
      }
    }
  }, 30_000)

  // ── Shape ───────────────────────────────────────────────────────────────

  test('the stat and step counts do not vary with the input', () => {
    const shapes = new Set<string>()
    for (const base of BASES) {
      for (const x of VALUES) {
        for (const logValue of [-3, 0, 3]) {
          const r = at({ x, base, logValue })
          shapes.add(`${r.stats!.length}/${r.steps!.length}`)
          // Nothing here decomposes into components or runs along an axis, so
          // there is deliberately no donut and no chart — at the defaults or
          // anywhere else, which is the rule the registry sweep enforces.
          expect(r.parts).toBeUndefined()
          expect(r.series).toBeUndefined()
        }
      }
    }
    expect([...shapes]).toEqual([`${at().stats!.length}/${at().steps!.length}`])
  }, 30_000)

  // ── Fields ──────────────────────────────────────────────────────────────

  test('computes from its own declared defaults, and at both bounds of every field', () => {
    const defaults = defaultValues({ fields }) as unknown as Input
    expect(defaults).toEqual(DEFAULTS)
    expect(Number(compute(defaults).primary.value)).toBe(3)

    for (const field of fields) {
      for (const bound of [field.min, field.max]) {
        // Every number field renders as a slider spanning min..max, so both
        // ends are one drag away and must be values compute accepts.
        expect(
          () => at({ [field.id]: bound } as Partial<Input>),
          `${field.id}=${bound}`,
        ).not.toThrow()
      }
      // And every default sits on the slider's own grid, min + n × step.
      const n = (field.default - field.min) / field.step
      expect(Math.abs(n - Math.round(n)), field.id).toBeLessThan(1e-9)
      expect(field.default, field.id).toBeGreaterThanOrEqual(field.min)
      expect(field.default, field.id).toBeLessThanOrEqual(field.max)
    }
  })

  test('nudging the first number field to 1.1× its default stays valid and moves the answer', () => {
    // tests/calculators.spec.ts does exactly this and expects a different,
    // valid result — so the first field has to tolerate it.
    const first = fields[0]
    expect(first.id).toBe('x')
    const bumped = first.default * 1.1
    expect(bumped).toBeLessThanOrEqual(first.max)
    expect(bumped).toBeGreaterThanOrEqual(first.min)

    const nudged = at({ x: bumped })
    expect(Number(nudged.primary.value)).toBeCloseTo(Math.log10(1100), 12)
    expect(toResultView(nudged).primary.text).toBe('3.041393')
    expect(toResultView(nudged).primary.text).not.toBe(toResultView(at()).primary.text)
  })

  // ── Copy ────────────────────────────────────────────────────────────────

  test('the definition copy stays inside the conformance limits', () => {
    expect(def.description.length).toBeGreaterThanOrEqual(51)
    expect(def.description.length).toBeLessThanOrEqual(160)
    expect(def.seoTitle.length).toBeLessThanOrEqual(70)
    expect(def.title.length).toBeGreaterThan(0)
    expect(def.intro.length).toBeGreaterThan(40)

    expect(def.faqs.length).toBeGreaterThanOrEqual(3)
    for (const faq of def.faqs) {
      expect(faq.q.endsWith('?'), faq.q).toBe(true)
      // "More than a line" — a one-clause answer is not an explanation.
      expect(faq.a.length, faq.q).toBeGreaterThan(120)
    }

    expect(def.related).not.toContain(def.slug)
    expect(new Set(def.related).size).toBe(def.related.length)
    expect(def.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    expect(def.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    // THE ORGANIZING RULE: no colours, class names, or markup in a definition.
    const serialized = JSON.stringify(def, (_k, v) => (typeof v === 'function' ? undefined : v))
    expect(serialized).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(serialized).not.toMatch(/<\/?[a-z][\s\S]*>/i)
  })
})

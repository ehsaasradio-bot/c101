import { describe, expect, test } from 'vitest'
import compute, { asSimpleFraction, power, scientific, tidyDecimals } from './compute'
import { fields } from './fields'
import def from './index'
import { CalcError } from '../../../lib/types'
import { toResultView } from '../../../lib/view'

type Input = { base: number; exponent: number }

const DEFAULTS: Input = { base: 2, exponent: 10 }
const at = (over: Partial<Input> = {}) => compute({ ...DEFAULTS, ...over })

/** The headline value as a number, for the cases where it is one. */
const valueOf = (b: number, n: number): number => {
  const v = at({ base: b, exponent: n }).primary.value
  if (typeof v !== 'number') throw new Error(`primary is a string for ${b}^${n}: ${v}`)
  return v
}

/**
 * The computed value as a plain number, whatever form the page chooses to print
 * it in. The presentation switches to scientific notation outside 1e-6..1e15,
 * so the law and sweep checks below — which are about the arithmetic, not the
 * rendering — read the shared routine directly.
 */
const rawValue = (b: number, n: number): number => {
  const p = power(b, n)
  if (!p) throw new Error(`no real value for ${b}^${n}`)
  return p.value
}

/**
 * Agreement to within a RELATIVE tolerance. `toBeCloseTo` is absolute, which is
 * meaningless out at 9.3e11: 12.25^11 by repeated multiplication is
 * 932173978944.5371 and exactly 932173978944.5372, a difference of one part in
 * 1e16 that an absolute check calls a failure.
 */
const expectRelative = (actual: number, expected: number, label: string, rel = 1e-9) => {
  const scale = Math.max(Math.abs(expected), Math.abs(actual), Number.MIN_VALUE)
  expect(Math.abs(actual - expected) / scale, label).toBeLessThan(rel)
}

/** The headline exactly as a visitor reads it. */
const headline = (over: Partial<Input> = {}) => toResultView(at(over)).primary.text

const stat = (r: ReturnType<typeof compute>, startsWith: string): string | number => {
  const found = r.stats!.find((s) => s.label.startsWith(startsWith))
  if (!found) throw new Error(`no stat starting ${startsWith}`)
  return found.value
}

const stepValue = (r: ReturnType<typeof compute>, startsWith: string): string => {
  const found = r
    .steps!.filter((s): s is Extract<typeof s, { label: string }> => !('rule' in s))
    .find((s) => s.label.startsWith(startsWith))
  if (!found) throw new Error(`no step starting ${startsWith}`)
  return String(found.value)
}

const thrownBy = (over: Partial<Input>): CalcError => {
  let thrown: unknown
  try {
    at(over)
  } catch (err) {
    thrown = err
  }
  expect(thrown).toBeInstanceOf(CalcError)
  return thrown as CalcError
}

/**
 * THE INDEPENDENT CHECK.
 *
 * b^n by repeated multiplication, sharing no code at all with `Math.pow`, with
 * the exact-integer path, or with the log-space magnitude. For integer
 * exponents this is the definition of exponentiation, so it is the right thing
 * to hold the implementation against.
 */
function byRepeatedMultiplication(b: number, n: number): number {
  const k = Math.abs(n)
  let acc = 1
  for (let i = 0; i < k; i += 1) acc *= b
  return n >= 0 ? acc : 1 / acc
}

describe('exponent — exact anchors', () => {
  test('2^10 = 1024, the default headline', () => {
    // Ten twos: 2 4 8 16 32 64 128 256 512 1024.
    expect(valueOf(2, 10)).toBe(1024)
    expect(byRepeatedMultiplication(2, 10)).toBe(1024)
    expect(headline()).toBe('1,024')
    expect(at().primary.label).toBe('2^10')
  })

  test('10^-3 = 0.001 — a negative exponent is a reciprocal', () => {
    expect(valueOf(10, -3)).toBe(0.001)
    expect(valueOf(10, -3)).toBe(1 / byRepeatedMultiplication(10, 3))
    expect(headline({ base: 10, exponent: -3 })).toBe('0.001')
  })

  test('5^0 = 1, and every other base to the zero as well', () => {
    expect(valueOf(5, 0)).toBe(1)
    for (const b of [-7.5, -1, 0.25, 1, 3, 999]) expect(valueOf(b, 0)).toBe(1)
  })

  test('2^0.5 is the square root of 2', () => {
    expect(valueOf(2, 0.5)).toBe(Math.SQRT2)
    // Squaring it returns 2, which is the definition rather than the formula.
    expect(valueOf(2, 0.5) * valueOf(2, 0.5)).toBeCloseTo(2, 12)
    expect(headline({ base: 2, exponent: 0.5 })).toBe('1.414214')
  })

  test('the e2e nudge — the first field at 1.1x still gives a different answer', () => {
    // tests/calculators.spec.ts sets the first number field to 1.1x its default.
    const nudged = fields[0].default * 1.1
    expect(nudged).toBe(2.2)
    expect(valueOf(2.2, 10)).toBe(2655.9922791424)
    expect(valueOf(2.2, 10)).not.toBe(valueOf(2, 10))
  })
})

describe('exponent — cross-checked against repeated multiplication', () => {
  test('every integer exponent in a wide sweep agrees with multiplying it out', () => {
    const bases = [-9, -4.5, -3, -2, -1, -0.5, 0.5, 1, 1.5, 2, 3, 7, 10, 12.25]
    for (const b of bases) {
      for (let n = -12; n <= 12; n += 1) {
        const expected = byRepeatedMultiplication(b, n)
        const actual = rawValue(b, n)
        // Relative, because repeated multiplication accumulates its own error —
        // 12.25^11 by loop is 932173978944.5371 and exactly 932173978944.5372.
        // The point of the check is that the two routes agree, not that the loop
        // is authoritative to the last bit.
        expectRelative(actual, expected, `${b}^${n}`)
        expect(Math.sign(actual), `sign of ${b}^${n}`).toBe(Math.sign(expected))
      }
    }
  }, 30_000)

  test('zero to a positive power is zero, by both routes', () => {
    for (let n = 1; n <= 8; n += 1) {
      expect(valueOf(0, n)).toBe(0)
      expect(byRepeatedMultiplication(0, n)).toBe(0)
    }
  })
})

describe('exponent — the laws hold', () => {
  const bases = [-6, -2, -1.5, 0.5, 1.25, 2, 3, 9.5]

  test('product law: b^m x b^n = b^(m+n)', () => {
    for (const b of bases) {
      for (let m = -6; m <= 6; m += 1) {
        for (let n = -6; n <= 6; n += 1) {
          const left = rawValue(b, m) * rawValue(b, n)
          const right = rawValue(b, m + n)
          expectRelative(left, right, `${b}: ${m} + ${n}`)
        }
      }
    }
  }, 30_000)

  test('power law: (b^m)^n = b^(mn)', () => {
    for (const b of [0.5, 1.25, 2, 3, 9.5]) {
      for (let m = -4; m <= 4; m += 1) {
        for (let n = -4; n <= 4; n += 1) {
          const left = rawValue(rawValue(b, m), n)
          const right = rawValue(b, m * n)
          expectRelative(left, right, `${b}: (^${m})^${n}`)
        }
      }
    }
  }, 30_000)

  test('reciprocal law: b^-n = 1 / b^n', () => {
    for (const b of bases) {
      for (let n = -8; n <= 8; n += 1) {
        expectRelative(rawValue(b, -n), 1 / rawValue(b, n), `${b}^-${n}`)
      }
    }
  }, 30_000)

  test('the page shows those checks with the visitor’s own numbers', () => {
    const r = at()
    // 2^10 x 2^3 = 2^13 = 8192, and (2^10)^2 = 2^20 = 1,048,576.
    expect(stepValue(r, 'Check — b^n x b^3')).toBe('1,024 x 8 = 8,192')
    expect(stepValue(r, 'Check — (b^n)^2')).toBe('1,048,576 = 1,048,576')
    expect(stepValue(r, 'Check — b^-n')).toBe('1 / 1,024 = 0.0009765625')
  })
})

// ── The four traps ───────────────────────────────────────────────────────────

describe('exponent — 0^0', () => {
  test('answers 1, the discrete-maths convention', () => {
    expect(valueOf(0, 0)).toBe(1)
    expect(headline({ base: 0, exponent: 0 })).toBe('1')
  })

  test('says so in a note rather than leaving the choice unremarked', () => {
    const notes = at({ base: 0, exponent: 0 }).notes!.join(' ')
    expect(notes).toContain('0^0 = 1')
    expect(notes).toContain('convention')
    // The dispute itself is named, not hidden.
    expect(notes).toContain('indeterminate')
  })

  test('a nonzero base to the zero gets the ordinary note, not the 0^0 one', () => {
    const notes = at({ base: 7, exponent: 0 }).notes!.join(' ')
    expect(notes).not.toContain('indeterminate')
    expect(notes).toContain('power 0 is 1')
  })

  test('0 to a negative power is refused against the base field', () => {
    const err = thrownBy({ base: 0, exponent: -3 })
    expect(err.fieldId).toBe('base')
    expect(err.message).toContain('undefined')
  })
})

describe('exponent — negative base with a fractional exponent', () => {
  test('returns the real cube root of -8 where JavaScript returns NaN', () => {
    expect(Number.isNaN((-8) ** (1 / 3))).toBe(true)
    expect(valueOf(-8, 1 / 3)).toBeCloseTo(-2, 12)
    // Cubing it returns -8, which is what "cube root" means.
    const root = valueOf(-8, 1 / 3)
    expect(root * root * root).toBeCloseTo(-8, 10)
  })

  test('an odd denominator typed as a decimal is recognised too', () => {
    // 0.2 is exactly one fifth, and (-32)^(1/5) = -2 because (-2)^5 = -32.
    expect(valueOf(-32, 0.2)).toBeCloseTo(-2, 12)
    expect(byRepeatedMultiplication(-2, 5)).toBe(-32)
    // 0.4 is two fifths: the fifth root is -2, and (-2)^2 = 4.
    expect(valueOf(-32, 0.4)).toBeCloseTo(4, 12)
  })

  test('an even numerator over an odd denominator comes back positive', () => {
    // (-8)^(2/3) = ((-8)^(1/3))^2 = (-2)^2 = 4.
    expect(valueOf(-8, 2 / 3)).toBeCloseTo(4, 12)
  })

  test('an even denominator is refused with an explanation, never NaN', () => {
    const err = thrownBy({ base: -4, exponent: 0.5 })
    expect(err.fieldId).toBe('exponent')
    expect(err.message).toContain('square root')
    expect(err.message).toContain('real')
    for (const n of [0.5, 1.5, 2.5, 0.25, -0.5]) {
      expect(() => at({ base: -4, exponent: n }), `-4^${n}`).toThrow(CalcError)
    }
  })

  test('a decimal too far from any simple fraction is refused rather than guessed', () => {
    // 0.333333 is not one third: they differ by 3.3e-7. Reading it as 1/3 would
    // be answering a question nobody asked.
    expect(asSimpleFraction(0.333333)).toBeNull()
    expect(asSimpleFraction(0.3333333333)).toEqual({ p: 1, q: 3 })
    const err = thrownBy({ base: -8, exponent: 0.333333 })
    expect(err.fieldId).toBe('exponent')
  })

  test('a negative base with a whole exponent alternates sign as it should', () => {
    expect(valueOf(-2, 3)).toBe(-8)
    expect(valueOf(-2, 4)).toBe(16)
    expect(valueOf(-2, -3)).toBe(-0.125)
    expect(String(stat(at({ base: -2, exponent: 3 }), 'Sign of the result'))).toContain('Negative')
    expect(String(stat(at({ base: -2, exponent: 4 }), 'Sign of the result'))).toContain('Positive')
  })

  test('the note explains what was done, so the answer is not a silent choice', () => {
    const notes = at({ base: -8, exponent: 1 / 3 }).notes!.join(' ')
    expect(notes).toContain('NaN')
    expect(notes).toContain('cube root')
  })
})

describe('exponent — overflow and underflow', () => {
  test('1000^1000 reports its magnitude instead of a dash', () => {
    // 1000^1000 = (10^3)^1000 = 10^3000, well past the 1.8e308 a double holds.
    expect(Math.pow(1000, 1000)).toBe(Number.POSITIVE_INFINITY)
    expect(at({ base: 1000, exponent: 1000 }).primary.value).toBe('about 1.000 x 10^3000')
    expect(headline({ base: 1000, exponent: 1000 })).toBe('about 1.000 x 10^3000')
  })

  test('the top of the exponent slider overflows and is still answered', () => {
    // 1000^400 = 10^1200. Reachable from the form, so it must not be a dash.
    expect(at({ base: 1000, exponent: 400 }).primary.value).toBe('about 1.000 x 10^1200')
    const notes = at({ base: 1000, exponent: 400 }).notes!.join(' ')
    expect(notes).toContain('1.8e308')
  })

  test('a negative base keeps its sign past the overflow point', () => {
    // (-1000)^999 is negative: an odd power of a negative number.
    expect(at({ base: -1000, exponent: 999 }).primary.value).toBe('about -1.000 x 10^2997')
    expect(at({ base: -1000, exponent: 1000 }).primary.value).toBe('about 1.000 x 10^3000')
  })

  test('underflow is reported the same way rather than collapsing to zero', () => {
    // 0.001^200 = 10^-600, below the ~5e-324 floor.
    expect(Math.pow(0.001, 200)).toBe(0)
    expect(at({ base: 0.001, exponent: 200 }).primary.value).toBe('about 1.000 x 10^-600')
    expect(at({ base: 0.001, exponent: 200 }).notes!.join(' ')).toContain('5e-324')
  })

  test('the magnitude is right for a value that is NOT a round power of ten', () => {
    // 7^500: log10 = 500 x log10(7) = 422.54902…, so the leading digits
    // are 10^0.54902… = 3.540.
    const log10 = 500 * Math.log10(7)
    expect(log10).toBeCloseTo(422.54902, 4)
    expect(at({ base: 7, exponent: 500 }).primary.value).toBe(`about ${scientific(log10)}`)
    expect(String(at({ base: 7, exponent: 500 }).primary.value)).toBe('about 3.540 x 10^422')
  })

  test('scientific() never prints a mantissa of 10', () => {
    // 9.9997 rounds to 10.00 at four figures, which is not a mantissa.
    expect(scientific(Math.log10(9.9999) + 5)).toBe('1.000 x 10^6')
    expect(scientific(3)).toBe('1.000 x 10^3')
  })
})

describe('exponent — floating point presentation', () => {
  test('1.1^2 is 1.21, not 1.2100000000000002', () => {
    expect(1.1 ** 2).toBe(1.2100000000000002)
    expect(valueOf(1.1, 2)).toBe(1.21)
    expect(headline({ base: 1.1, exponent: 2 })).toBe('1.21')
  })

  test('the exact integer route holds for other terminating decimals', () => {
    expect(valueOf(1.1, 3)).toBe(1.331)
    expect(valueOf(0.1, 2)).toBe(0.01)
    expect(valueOf(2.5, 4)).toBe(39.0625)
    expect(valueOf(-1.2, 3)).toBe(-1.728)
    // Confirmed independently: 12^3 = 1728, and three decimals of 1.2 make three
    // decimal places in the answer.
    expect(byRepeatedMultiplication(12, 3)).toBe(1728)
  })

  test('an endless value is left where the arithmetic put it', () => {
    // No snapping here: 2^0.5 genuinely is 1.4142135623730951.
    expect(valueOf(2, 0.5)).toBe(1.4142135623730951)
    expect(valueOf(3, 0.5)).toBe(Math.sqrt(3))
  })

  test('tidyDecimals asks for the fewest places that still print exactly', () => {
    expect(tidyDecimals(1024)).toBe(0)
    expect(tidyDecimals(1.21)).toBe(2)
    expect(tidyDecimals(0.001)).toBe(3)
    expect(tidyDecimals(Math.SQRT2)).toBe(6)
  })

  test('nothing a visitor can reach ever renders as NaN', () => {
    for (let b = -20; b <= 20; b += 0.5) {
      for (let n = -20; n <= 20; n += 0.5) {
        let view
        try {
          view = toResultView(compute({ base: b, exponent: n }))
        } catch (err) {
          expect(err, `${b}^${n}`).toBeInstanceOf(CalcError)
          expect((err as CalcError).fieldId, `${b}^${n}`).toBeTruthy()
          continue
        }
        expect(view.primary.text, `${b}^${n}`).not.toContain('NaN')
        expect(view.primary.text, `${b}^${n}`).not.toBe('')
        expect(view.primary.text, `${b}^${n}`).not.toBe('—')
        for (const s of view.stats) expect(s.text, `${b}^${n} / ${s.label}`).not.toContain('NaN')
        for (const s of view.steps) {
          if ('rule' in s) continue
          expect(s.text, `${b}^${n} / ${s.label}`).not.toContain('NaN')
        }
      }
    }
  }, 60_000)
})

describe('exponent — input guards', () => {
  test('a non-finite base is refused before anything else', () => {
    expect(thrownBy({ base: Number.NaN }).fieldId).toBe('base')
    expect(thrownBy({ base: Number.POSITIVE_INFINITY }).fieldId).toBe('base')
  })

  test('a non-finite exponent is refused against its own field', () => {
    expect(thrownBy({ exponent: Number.NaN }).fieldId).toBe('exponent')
    expect(thrownBy({ exponent: Number.NEGATIVE_INFINITY }).fieldId).toBe('exponent')
  })

  test('every declared bound is a value compute accepts', () => {
    for (const field of fields) {
      for (const bound of [field.min, field.max, field.default]) {
        const values = { ...DEFAULTS, [field.id]: bound }
        expect(() => compute(values as Input), `${field.id} = ${bound}`).not.toThrow()
      }
    }
  })

  test('every default lands on min + n x step', () => {
    for (const field of fields) {
      const n = (field.default - field.min) / field.step
      expect(Math.abs(n - Math.round(n)), field.id).toBeLessThan(1e-9)
    }
  })
})

describe('exponent — result shape and copy', () => {
  test('the shape does not change with the input', () => {
    const shapes = [
      at(),
      at({ base: -8, exponent: 1 / 3 }),
      at({ base: 0, exponent: 0 }),
      at({ base: 1000, exponent: 1000 }),
      at({ base: 0.001, exponent: 200 }),
      at({ base: 10, exponent: -3 }),
    ]
    for (const r of shapes) {
      expect(r.stats).toHaveLength(6)
      expect(r.steps).toHaveLength(12)
      // No donut and no chart: an exponent has no components and no trend, so
      // there is nothing honest to draw.
      expect(r.parts).toBeUndefined()
      expect(r.series).toBeUndefined()
    }
  })

  test('copy fits the conformance rules', () => {
    expect(def.description.length).toBeGreaterThan(50)
    expect(def.description.length).toBeLessThanOrEqual(160)
    expect(def.seoTitle.length).toBeLessThanOrEqual(70)
    expect(def.faqs.length).toBeGreaterThanOrEqual(3)
    for (const faq of def.faqs) {
      expect(faq.q.endsWith('?')).toBe(true)
      expect(faq.a.length).toBeGreaterThan(40)
    }
    // The 0^0 choice is stated in the copy, not only in a note.
    expect(`${def.intro} ${def.faqs.map((f) => f.a).join(' ')}`).toContain('0^0')
  })

  test('power() is the shared routine, and reports no real value rather than NaN', () => {
    expect(power(-8, 0.5)).toBeNull()
    expect(power(0, -1)).toBeNull()
    expect(power(2, 10)!.value).toBe(1024)
    expect(power(2, 10)!.log10).toBeCloseTo(3.010299956639812, 12)
    expect(power(0, 5)!.sign).toBe(0)
  })
})

import { describe, expect, test } from 'vitest'
import compute from './compute'
import { fields } from './fields'
import def from './index'
import { CalcError } from '../../../lib/types'
import { toResultView } from '../../../lib/view'

type Input = { value: number; degree: number }

const DEFAULTS: Input = { value: 72, degree: 2 }
const at = (over: Partial<Input> = {}) => compute({ ...DEFAULTS, ...over })

const stat = (r: ReturnType<typeof compute>, label: string): string | number => {
  const found = r.stats!.find((s) => s.label === label)
  if (!found) throw new Error(`no stat labelled ${label}`)
  return found.value
}

const statStartingWith = (r: ReturnType<typeof compute>, prefix: string): string => {
  const found = r.stats!.find((s) => s.label.startsWith(prefix))
  if (!found) throw new Error(`no stat starting ${prefix}`)
  return String(found.value)
}

const stepValue = (r: ReturnType<typeof compute>, startsWith: string): string => {
  const found = r
    .steps!.filter((s): s is Extract<typeof s, { label: string }> => !('rule' in s))
    .find((s) => s.label.startsWith(startsWith))
  if (!found) throw new Error(`no step starting ${startsWith}`)
  return String(found.value)
}

/** The headline root, as a number. Throws if the answer was imaginary. */
const rootOf = (value: number, degree = 2) => {
  const primary = at({ value, degree }).primary.value
  if (typeof primary === 'string') throw new Error(`imaginary: ${primary}`)
  return primary
}

/**
 * A root found with no root function at all: bisect for the r that satisfies
 * rⁿ = a, using nothing but repeated multiplication. Independent of Math.sqrt,
 * of Math.pow with a fractional exponent, of the Newton step and of the integer
 * snap — so when this and compute agree, the agreement means something.
 */
function bisectRoot(a: number, n: number): number {
  if (a === 0) return 0
  const power = (r: number) => {
    let out = 1
    for (let i = 0; i < n; i += 1) out *= r
    return out
  }
  let lo = 0
  let hi = Math.max(1, a)
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2
    if (power(mid) < a) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

describe('exact anchors', () => {
  test('the perfect squares render exactly, with no floating-point tail', () => {
    expect(rootOf(144)).toBe(12)
    expect(rootOf(49)).toBe(7)
    expect(rootOf(0)).toBe(0)
    expect(rootOf(1)).toBe(1)
    expect(rootOf(1_000_000)).toBe(1000)
  })

  test('exactly representable fractions are exact too', () => {
    expect(rootOf(0.25)).toBe(0.5)
    expect(rootOf(6.25)).toBe(2.5)
  })

  test('odd and even higher roots are exact on perfect powers', () => {
    expect(rootOf(27, 3)).toBe(3)
    expect(rootOf(1000, 3)).toBe(10)
    expect(rootOf(64, 3)).toBe(4)
    expect(rootOf(64, 6)).toBe(2)
    expect(rootOf(16, 4)).toBe(2)
    expect(rootOf(243, 5)).toBe(3)
    expect(rootOf(1024, 10)).toBe(2)
    expect(rootOf(59049, 10)).toBe(3)
  })

  test('a whole answer is formatted with no decimals at all', () => {
    // Getting the value right is pointless if the formatter prints 12.000000.
    const view = toResultView(at({ value: 144 }))
    expect(view.primary.text).toBe('12')
    expect(toResultView(at({ value: 27, degree: 3 })).primary.text).toBe('3')
  })

  test('an irrational root keeps its decimals', () => {
    expect(rootOf(72)).toBeCloseTo(8.48528137423857, 12)
    expect(toResultView(at()).primary.text).toBe('8.485281')
  })

  test('every anchor also survives the view layer without a NaN', () => {
    for (const [value, degree] of [
      [144, 2],
      [0, 2],
      [-72, 2],
      [-8, 3],
      [0.25, 2],
      [999_983, 2],
    ] as const) {
      const view = toResultView(at({ value, degree }))
      expect(view.primary.text).not.toContain('NaN')
      for (const s of view.stats) expect(s.text).not.toContain('NaN')
      for (const s of view.steps) if (!('rule' in s)) expect(s.text).not.toContain('NaN')
    }
  })
})

describe('simplified radical form', () => {
  test('the headline case', () => {
    const r = at()
    expect(stat(r, 'Simplified radical form')).toBe('6√2')
    expect(r.primary.value).toBeCloseTo(8.485281, 6)
  })

  test('the textbook square roots', () => {
    const form = (value: number, degree = 2) =>
      stat(at({ value, degree }), 'Simplified radical form')
    expect(form(8)).toBe('2√2')
    expect(form(12)).toBe('2√3')
    expect(form(18)).toBe('3√2')
    expect(form(20)).toBe('2√5')
    expect(form(32)).toBe('4√2')
    expect(form(50)).toBe('5√2')
    expect(form(75)).toBe('5√3')
    expect(form(98)).toBe('7√2')
    expect(form(300)).toBe('10√3')
  })

  test('a perfect square collapses to the whole number, with no radical left', () => {
    expect(stat(at({ value: 144 }), 'Simplified radical form')).toBe('12')
    expect(stat(at({ value: 1 }), 'Simplified radical form')).toBe('1')
    expect(stat(at({ value: 0 }), 'Simplified radical form')).toBe('0')
  })

  test('a root with nothing to pull out is left alone', () => {
    expect(stat(at({ value: 70 }), 'Simplified radical form')).toBe('√70')
    expect(stat(at({ value: 13 }), 'Simplified radical form')).toBe('√13')
    expect(at({ value: 70 }).notes!.join(' ')).toContain('already in its simplest radical form')
  })

  test('higher degrees group by n rather than by pairs', () => {
    expect(stat(at({ value: 54, degree: 3 }), 'Simplified radical form')).toBe('3∛2')
    expect(stat(at({ value: 24, degree: 3 }), 'Simplified radical form')).toBe('2∛3')
    expect(stat(at({ value: 32, degree: 5 }), 'Simplified radical form')).toBe('2')
    expect(stat(at({ value: 96, degree: 5 }), 'Simplified radical form')).toBe('2⁵√3')
  })

  test('a decimal has no radical form, and says so rather than inventing one', () => {
    expect(String(stat(at({ value: 79.2 }), 'Simplified radical form'))).toContain(
      'Only whole numbers simplify',
    )
  })

  test('the extraction appears in the steps, not just in the answer', () => {
    const r = at()
    expect(stepValue(r, 'Prime factorisation')).toBe('72 = 2³ × 3²')
    expect(stepValue(r, 'Largest perfect square factor')).toBe('36 = 6²')
    expect(stepValue(r, 'Split it out')).toBe('√72 = √(36 × 2) = 6√2')
    expect(stepValue(r, 'Confirm the factorisation')).toBe('6² × 2 = 72')
  })

  /**
   * The independent check the decimal cannot give: the factorisation is pure
   * integer arithmetic, so `coefficient ** n * radicand === x` holds EXACTLY or
   * the extraction is wrong. Nothing here consults Math.sqrt.
   */
  test(
    'coefficient^n x radicand equals x exactly, across a sweep',
    () => {
      for (let n = 2; n <= 6; n += 1) {
        for (let x = 1; x <= 4000; x += 1) {
          const form = String(stat(at({ value: x, degree: n }), 'Simplified radical form'))
          const sign = radicalSign(n)
          // Parse the rendered form back into its two integers, so the parsing
          // exercises exactly the string a visitor reads.
          const [head, tail] = form.split(sign)
          const coefficient = head === '' ? 1 : Number(head)
          const radicand = tail === undefined ? 1 : Number(tail)
          expect(Number.isInteger(coefficient), `${x} deg ${n}: ${form}`).toBe(true)
          expect(Number.isInteger(radicand), `${x} deg ${n}: ${form}`).toBe(true)
          expect(coefficient ** n * radicand, `${x} deg ${n}: ${form}`).toBe(x)
          // Fully reduced: no perfect nth power may remain under the radical.
          for (let p = 2; p ** n <= radicand; p += 1)
            expect(radicand % p ** n, `${x} deg ${n}: ${form} is not reduced`).not.toBe(0)
        }
      }
    },
    30_000,
  )
})

/** Mirrors compute's own glyph choice, so the parser above reads what is written. */
function radicalSign(n: number): string {
  const sup = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹']
  if (n === 2) return '√'
  if (n === 3) return '∛'
  if (n === 4) return '∜'
  return `${String(n)
    .split('')
    .map((d) => sup[Number(d)])
    .join('')}√`
}

describe('round-tripping: root^n must return x', () => {
  test(
    'across a sweep of values and degrees',
    () => {
      for (let n = 2; n <= 12; n += 1) {
        for (let x = 0; x <= 2000; x += 1) {
          const r = rootOf(x, n)
          expect(Number.isFinite(r), `${n}th root of ${x}`).toBe(true)
          const back = r ** n
          // Exact when the answer is a whole number — that is the whole point of
          // the snap. Otherwise the residue belongs to `pow`, not to the root.
          if (Number.isInteger(r)) expect(back, `${n}th root of ${x} = ${r}`).toBe(x)
          else expect(back).toBeCloseTo(x, 6)
        }
      }
    },
    30_000,
  )

  test(
    'and agrees with a bisection that uses no root function at all',
    () => {
      for (let n = 2; n <= 9; n += 1) {
        for (let x = 1; x <= 1500; x += 1) {
          const mine = rootOf(x, n)
          const theirs = bisectRoot(x, n)
          expect(mine, `${n}th root of ${x}`).toBeCloseTo(theirs, 9)
        }
      }
    },
    30_000,
  )

  test('every perfect nth power in range snaps to its exact integer', () => {
    for (let n = 2; n <= 12; n += 1) {
      for (let base = 0; base <= 40; base += 1) {
        const x = base ** n
        if (x > 1_000_000_000) break
        expect(rootOf(x, n), `${n}th root of ${base}^${n}`).toBe(base)
      }
    }
  })

  test('negative odd roots round-trip too, sign and all', () => {
    for (const n of [3, 5, 7, 9]) {
      for (let base = 1; base <= 12; base += 1) {
        const x = -(base ** n)
        if (Math.abs(x) > 1_000_000_000) break
        expect(rootOf(x, n)).toBe(-base)
        expect(rootOf(x, n) ** n).toBe(x)
      }
    }
  })
})

describe('negative numbers', () => {
  test('an odd root of a negative is real and negative', () => {
    expect(rootOf(-8, 3)).toBe(-2)
    expect(rootOf(-27, 3)).toBe(-3)
    expect(rootOf(-32, 5)).toBe(-2)
    expect(rootOf(-72, 3)).toBeCloseTo(-4.160167646, 8)
  })

  test('Math.pow would have returned NaN for exactly these', () => {
    // The trap this guards: Math.pow(-8, 1/3) is NaN, not -2.
    expect(Number.isNaN(Math.pow(-8, 1 / 3))).toBe(true)
    expect(at({ value: -8, degree: 3 }).primary.value).toBe(-2)
  })

  test('an even root of a negative is never reported as a real number', () => {
    const r = at({ value: -72 })
    expect(typeof r.primary.value).toBe('string')
    expect(r.primary.value).toBe('8.485281374i')
    expect(stat(r, 'Simplified radical form')).toBe('6i√2')
    expect(r.notes!.join(' ')).toContain('no real square root')
  })

  test('the imaginary radical form matches the textbook cases', () => {
    const form = (value: number) => stat(at({ value }), 'Simplified radical form')
    expect(form(-4)).toBe('2i')
    expect(form(-9)).toBe('3i')
    expect(form(-2)).toBe('i√2')
    expect(form(-1)).toBe('i')
    expect(form(-18)).toBe('3i√2')
    expect(form(-50)).toBe('5i√2')
  })

  test('a negative is never called a perfect square', () => {
    expect(statStartingWith(at({ value: -49 }), 'Is ')).toContain('nothing squares to a negative')
    expect(statStartingWith(at({ value: -49 }), 'Is ')).toContain('7i')
  })

  test('an even root above degree 2 of a negative is refused, not faked', () => {
    // (2i)^4 is +16, so there is no purely imaginary fourth root of -16 to print.
    expect(() => at({ value: -16, degree: 4 })).toThrow(CalcError)
    expect(() => at({ value: -16, degree: 4 })).toThrow(/no simple imaginary one/)
    try {
      at({ value: -16, degree: 4 })
    } catch (e) {
      expect((e as CalcError).fieldId).toBe('value')
    }
    expect((2 * 1) ** 4).toBe(16) // the arithmetic behind the refusal
  })

  test('zero is neither positive nor a problem', () => {
    expect(rootOf(0)).toBe(0)
    expect(rootOf(0, 7)).toBe(0)
    expect(Object.is(rootOf(0), -0)).toBe(false)
  })
})

describe('rejects bad input rather than returning NaN', () => {
  test('non-finite values are caught first, before any magnitude test', () => {
    expect(() => compute({ value: NaN, degree: 2 })).toThrow(CalcError)
    expect(() => compute({ value: Infinity, degree: 2 })).toThrow(CalcError)
    expect(() => compute({ value: 72, degree: NaN })).toThrow(CalcError)
    try {
      compute({ value: NaN, degree: 2 })
    } catch (e) {
      expect((e as CalcError).fieldId).toBe('value')
    }
    try {
      compute({ value: 72, degree: NaN })
    } catch (e) {
      expect((e as CalcError).fieldId).toBe('degree')
    }
  })

  test('a degree below 2 or an oversized number is refused', () => {
    expect(() => at({ degree: 1 })).toThrow(/2 or more/)
    expect(() => at({ degree: 0 })).toThrow(CalcError)
    expect(() => at({ degree: 25 })).toThrow(CalcError)
    expect(() => at({ value: 2e9 })).toThrow(/1,000,000,000/)
    expect(() => at({ value: -2e9 })).toThrow(CalcError)
  })

  test('a fractional degree is rounded rather than rejected', () => {
    expect(rootOf(27, 3.4)).toBe(3)
  })

  test('no reachable input produces NaN in the rendered output', () => {
    const probes = [-1_000_000, -72, -8, -1, 0, 1, 2, 72, 144, 500_000, 1_000_000, 0.25, 79.2]
    for (const value of probes) {
      for (let degree = 2; degree <= 20; degree += 1) {
        let r: ReturnType<typeof compute>
        try {
          r = compute({ value, degree })
        } catch (e) {
          expect(e, `${value} deg ${degree}`).toBeInstanceOf(CalcError)
          expect((e as CalcError).message.length).toBeGreaterThan(20)
          continue
        }
        const view = toResultView(r)
        expect(view.primary.text, `${value} deg ${degree}`).not.toContain('NaN')
        expect(view.primary.text).not.toBe('')
        for (const s of view.stats) expect(s.text, `${value} deg ${degree}`).not.toContain('NaN')
        for (const s of view.steps)
          if (!('rule' in s)) expect(s.text, `${value} deg ${degree}`).not.toContain('NaN')
      }
    }
  })
})

describe('shape and copy', () => {
  test('the stat and step counts do not vary with input', () => {
    const shapes = new Set<string>()
    for (const [value, degree] of [
      [72, 2],
      [144, 2],
      [0, 2],
      [-72, 2],
      [-8, 3],
      [79.2, 2],
      [70, 2],
      [1, 2],
      [1_000_000, 20],
    ] as const) {
      const r = at({ value, degree })
      shapes.add(`${r.stats!.length}/${r.steps!.length}`)
    }
    expect([...shapes]).toEqual(['7/12'])
  })

  test('draws no donut and no chart, because there is no proportion or trend', () => {
    const r = at()
    expect(r.parts).toBeUndefined()
    expect(r.series).toBeUndefined()
  })

  test('the e2e nudge of the first number field gives a different valid result', () => {
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('value')
    const bumped = Number((first.default * 1.1).toFixed(4))
    expect(bumped).toBe(79.2)
    const before = toResultView(at()).primary.text
    const after = toResultView(at({ value: bumped })).primary.text
    expect(after).not.toBe(before)
    expect(after).not.toContain('NaN')
  })

  test('every number default lands on min + n x step', () => {
    for (const field of fields) {
      if (field.kind !== 'number') continue
      const n = (field.default - field.min) / field.step
      expect(Math.abs(n - Math.round(n)), field.id).toBeLessThan(1e-9)
    }
  })

  test('both ends of every slider are values compute accepts', () => {
    const defaults = Object.fromEntries(fields.map((f) => [f.id, f.default])) as unknown as Input
    for (const field of fields) {
      if (field.kind !== 'number') continue
      for (const bound of [field.min, field.max]) {
        expect(
          () => compute({ ...defaults, [field.id]: bound } as Input),
          `${field.id} = ${bound}`,
        ).not.toThrow()
      }
    }
  })

  test('the copy fits a search result and answers real questions', () => {
    expect(def.description.length).toBeGreaterThan(50)
    expect(def.description.length).toBeLessThanOrEqual(160)
    expect(def.seoTitle.length).toBeLessThanOrEqual(70)
    expect(def.faqs.length).toBeGreaterThanOrEqual(3)
    for (const faq of def.faqs) {
      expect(faq.q.endsWith('?')).toBe(true)
      expect(faq.a.length).toBeGreaterThan(40)
    }
    expect(def.intro.length).toBeGreaterThan(40)
  })

  test('the copy states what it does with negatives', () => {
    const copy = `${def.intro} ${def.faqs.map((f) => f.a).join(' ')}`
    expect(copy).toContain('6i√2')
    expect(copy).toContain('cube root of −8 is −2')
  })
})

import { describe, expect, test } from 'vitest'
import compute, { binomial, falling, powerCount, factorialCount } from './compute'
import type { Count } from './compute'
import { fields } from './fields'
import def from './index'
import probability from '../probability-calculator'
import gcdLcm from '../gcd-lcm-calculator'
import percentage from '../percentage-calculator'
import { toResultView } from '../../../lib/view'
import { CalcError } from '../../../lib/types'
import type { Quantity } from '../../../lib/types'

/*
 * The oracle is BigInt, computed here from the definition and nothing else.
 *
 * This is the right check for a counting calculator: the answers are integers,
 * BigInt holds integers of any size exactly, and the naive factorial form — the
 * one compute deliberately does NOT use — is perfectly safe in BigInt. So the
 * test can afford to be the textbook formula while the implementation is the
 * numerically careful one, and any disagreement is a real bug rather than two
 * copies of the same mistake.
 */

const factCache: bigint[] = [1n]
function factorial(n: number): bigint {
  for (let i = factCache.length; i <= n; i += 1) factCache[i] = factCache[i - 1]! * BigInt(i)
  return factCache[n]!
}

/** C(n, r) = n! / (r! (n − r)!), exactly. */
function chooseBig(n: number, r: number): bigint {
  if (r < 0 || r > n) return 0n
  return factorial(n) / (factorial(r) * factorial(n - r))
}

/** P(n, r) = n! / (n − r)!, exactly. */
function permuteBig(n: number, r: number): bigint {
  if (r < 0 || r > n) return 0n
  return factorial(n) / factorial(n - r)
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER)

type Values = Parameters<typeof compute>[0]
const DEFAULTS: Values = { order: 'ignored', repetition: 'no', n: 10, r: 3 }
const at = (over: Partial<Values>): Values => ({ ...DEFAULTS, ...over })

const stat = (r: ReturnType<typeof compute>, label: string) =>
  r.stats!.find((s) => s.label.startsWith(label))!.value

/** The mantissa and exponent out of an "about 1.183 × 10^17" string. */
function parseApprox(text: string): { mantissa: number; exponent: number } {
  const m = /^about (\d\.\d+) × 10\^(-?\d+)$/.exec(text)
  expect(m, `not an approximate count: ${text}`).not.toBeNull()
  return { mantissa: Number(m![1]), exponent: Number(m![2]) }
}

/** Compare an inexact count against the exact BigInt answer, honestly. */
function expectApproximates(value: number | string, exact: bigint) {
  const { mantissa, exponent } = parseApprox(String(value))
  const digits = exact.toString()
  // The exponent is the number of digits minus one, by definition of log10.
  expect(exponent).toBe(digits.length - 1)
  // Four significant figures, allowing the final one to be off by a unit: the
  // magnitude comes from a sum of logs, not from the integer itself.
  const leading = Number(`${digits[0]}.${digits.slice(1, 6)}`)
  expect(mantissa).toBeCloseTo(leading, 2)
}

describe('combination & permutation', () => {
  // ── Anchors the outside world already agrees on ─────────────────────────

  test('C(52, 5) = 2,598,960 — the number of 5-card poker hands', () => {
    const r = compute(at({ n: 52, r: 5 }))
    expect(r.primary.value).toBe(2_598_960)
    expect(chooseBig(52, 5)).toBe(2_598_960n)
    // And the ordered count is exactly 5! times larger.
    expect(Number(stat(r, 'Permutations — order matters'))).toBe(2_598_960 * 120)
    expect(permuteBig(52, 5)).toBe(311_875_200n)
  })

  test('C(49, 6) = 13,983,816 — the 6-from-49 lottery', () => {
    const r = compute(at({ n: 49, r: 6 }))
    expect(r.primary.value).toBe(13_983_816)
    expect(chooseBig(49, 6)).toBe(13_983_816n)
  })

  test('the defaults give C(10, 3) = 120', () => {
    // 10·9·8 / (1·2·3) = 720/6 = 120, and 10!/(3!·7!) = 3,628,800/(6·5,040) = 120.
    const r = compute(DEFAULTS)
    expect(r.primary.value).toBe(120)
    expect(chooseBig(10, 3)).toBe(120n)
    expect(r.primary.label).toBe('Combinations — C(10, 3)')
  })

  // ── The four cases ──────────────────────────────────────────────────────

  test('each of the four selectors picks the formula it claims', () => {
    const n = 10
    const r = 3
    expect(compute(at({ order: 'ignored', repetition: 'no', n, r })).primary.value).toBe(120)
    // P(10,3) = 10·9·8 = 720.
    expect(compute(at({ order: 'matters', repetition: 'no', n, r })).primary.value).toBe(720)
    // Multiset: C(10+3−1, 3) = C(12,3) = 220.
    expect(compute(at({ order: 'ignored', repetition: 'yes', n, r })).primary.value).toBe(220)
    // 10^3 = 1000 — every 3-digit PIN.
    expect(compute(at({ order: 'matters', repetition: 'yes', n, r })).primary.value).toBe(1000)
  })

  test('the four stats do not depend on which case is selected', () => {
    const a = compute(at({ order: 'ignored', repetition: 'no', n: 12, r: 4 }))
    const b = compute(at({ order: 'matters', repetition: 'yes', n: 12, r: 4 }))
    for (const label of [
      'Combinations — order ignored',
      'Permutations — order matters',
      'Combinations with repetition',
      'Permutations with repetition',
    ]) {
      expect(stat(a, label)).toBe(stat(b, label))
    }
    // And each headline is the stat for its own case.
    expect(a.primary.value).toBe(stat(a, 'Combinations — order ignored'))
    expect(b.primary.value).toBe(stat(b, 'Permutations with repetition'))
  })

  test('P(n, r) = C(n, r) × r! — the relationship between the two', () => {
    for (let n = 0; n <= 18; n += 1) {
      for (let r = 0; r <= n; r += 1) {
        const c = binomial(n, r)
        const p = falling(n, r)
        const f = factorialCount(r)
        expect(c.exact && p.exact && f.exact).toBe(true)
        expect(p.value).toBe(c.value * f.value)
      }
    }
  })

  // ── Identities, against the BigInt oracle ───────────────────────────────

  test('exact counts match the BigInt oracle across a wide sweep', () => {
    for (let n = 0; n <= 120; n += 1) {
      for (let r = 0; r <= n; r += 1) {
        const c = binomial(n, r)
        const truth = chooseBig(n, r)

        // The one guarantee that matters: `exact` is never a lie.
        if (c.exact) {
          expect(BigInt(c.value), `C(${n},${r})`).toBe(truth)
          expect(truth <= MAX_SAFE, `C(${n},${r}) claimed exact but exceeds 2^53`).toBe(true)
        } else {
          // Never flagged inexact for something small enough to have been exact
          // by a wide margin: the flag trips at most a factor of n early,
          // because the largest intermediate product is k × the answer.
          expect(truth * BigInt(n) > MAX_SAFE, `C(${n},${r}) flagged inexact too early`).toBe(true)
        }

        // The log-derived magnitude is right whether or not the double is.
        if (truth > 0n) {
          expect(c.log10, `log10 C(${n},${r})`).toBeCloseTo(
            Number(truth.toString().length - 1) +
              Math.log10(Number(`${truth.toString()[0]}.${truth.toString().slice(1, 15)}`)),
            6,
          )
        }
      }
    }
  }, 30_000)

  test("Pascal's identity C(n,r) = C(n−1,r−1) + C(n−1,r) holds across the triangle", () => {
    for (let n = 1; n <= 90; n += 1) {
      for (let r = 1; r < n; r += 1) {
        const whole = binomial(n, r)
        const left = binomial(n - 1, r - 1)
        const right = binomial(n - 1, r)
        if (!whole.exact || !left.exact || !right.exact) continue
        expect(whole.value, `C(${n},${r})`).toBe(left.value + right.value)
      }
    }
  }, 30_000)

  test('C(n, r) = C(n, n − r) — the symmetry the implementation relies on', () => {
    for (let n = 0; n <= 200; n += 1) {
      for (let r = 0; r <= n; r += 1) {
        const a = binomial(n, r)
        const b = binomial(n, n - r)
        expect(a.exact).toBe(b.exact)
        if (a.exact) expect(a.value, `C(${n},${r})`).toBe(b.value)
        expect(a.log10).toBeCloseTo(b.log10, 9)
      }
    }
  }, 30_000)

  test('row n of the triangle sums to 2^n', () => {
    for (let n = 0; n <= 50; n += 1) {
      let sum = 0
      for (let r = 0; r <= n; r += 1) sum += binomial(n, r).value
      expect(sum, `row ${n}`).toBeCloseTo(Math.pow(2, n), Math.max(0, 6 - n))
    }
  })

  test('permutations and powers match their own oracles', () => {
    for (let n = 1; n <= 60; n += 1) {
      for (let r = 0; r <= n; r += 1) {
        const p = falling(n, r)
        if (p.exact) expect(BigInt(p.value), `P(${n},${r})`).toBe(permuteBig(n, r))
      }
      for (let r = 0; r <= 20; r += 1) {
        const pow = powerCount(n, r)
        if (pow.exact) expect(BigInt(pow.value), `${n}^${r}`).toBe(BigInt(n) ** BigInt(r))
      }
    }
  }, 30_000)

  // ── INTEGER OVERFLOW: the thing this calculator exists to get right ──────

  test('the naive factorial formula is already wrong where this one is exact', () => {
    // 21! = 51,090,942,171,709,440,000 — past 2^53, so a Number cannot hold it.
    const naiveFactorial = (n: number) => {
      let f = 1
      for (let i = 2; i <= n; i += 1) f *= i
      return f
    }
    expect(Number.isSafeInteger(naiveFactorial(21))).toBe(false)

    // C(30, 15) fits comfortably in a double, but the textbook route to it does
    // not: 30! / (15! · 15!) loses the last digits on the way.
    const truth = chooseBig(30, 15)
    expect(truth).toBe(155_117_520n)
    const naive = naiveFactorial(30) / (naiveFactorial(15) * naiveFactorial(15))
    expect(Number.isInteger(naive)).toBe(false)

    const ours = binomial(30, 15)
    expect(ours.exact).toBe(true)
    expect(BigInt(ours.value)).toBe(truth)
  })

  test('the exactness boundary is detected, not crossed silently', () => {
    // C(60, 30) = 118,264,581,564,861,424 — thirteen times past 2^53.
    const truth = chooseBig(60, 30)
    expect(truth > MAX_SAFE).toBe(true)

    const c = binomial(60, 30)
    expect(c.exact).toBe(false)

    const result = compute(at({ n: 60, r: 30 }))
    // It must NOT be a number: a formatted integer here would read as precise.
    expect(typeof result.primary.value).toBe('string')
    expect(result.primary.format.style).toBe('raw')
    expectApproximates(result.primary.value, truth)
    expect(result.notes!.some((note) => note.includes('9,007,199,254,740,991'))).toBe(true)
  })

  test('walks the boundary one step at a time and never claims a false exact', () => {
    // Along row n = 52, C(52, r) climbs past 2^53 somewhere in the middle. Find
    // the crossing from the oracle and check the flag agrees on both sides.
    let lastExact = -1
    let firstInexact = -1
    for (let r = 0; r <= 52; r += 1) {
      const c = binomial(52, r)
      if (c.exact) {
        expect(BigInt(c.value), `C(52,${r})`).toBe(chooseBig(52, r))
        if (firstInexact === -1) lastExact = r
      } else if (firstInexact === -1) {
        firstInexact = r
      }
    }
    expect(firstInexact).toBeGreaterThan(0)
    expect(lastExact).toBe(firstInexact - 1)
    // Exactness really is lost there, not merely reported lost.
    expect(chooseBig(52, firstInexact) * 52n > MAX_SAFE).toBe(true)
  })

  test('a count too large for a double at all is still described', () => {
    // 1000^1000 overflows to Infinity, but 10^3000 is a perfectly good answer.
    const huge = compute(at({ order: 'matters', repetition: 'yes', n: 1000, r: 1000 }))
    expect(String(huge.primary.value)).toBe('about 1.000 × 10^3000')
    const view = String(huge.primary.value)
    expect(view).not.toContain('Infinity')
    expect(view).not.toContain('NaN')
  })

  test('no reachable input produces NaN, Infinity or an unlabelled figure', () => {
    for (const order of ['ignored', 'matters'] as const) {
      for (const repetition of ['no', 'yes'] as const) {
        for (const n of [1, 2, 5, 52, 500, 1000]) {
          for (const r of [0, 1, 3, 6, 20, 100, 1000]) {
            const result = compute({ order, repetition, n, r })
            const texts = [result.primary, ...result.stats!].map((q) => String(q.value))
            for (const text of texts) {
              expect(text, `${order}/${repetition} n=${n} r=${r}`).not.toContain('NaN')
              expect(text).not.toContain('Infinity')
              expect(text).not.toBe('')
            }
            expect(result.steps!.length).toBeGreaterThan(0)
          }
        }
      }
    }
  }, 30_000)

  // ── Edge cases ──────────────────────────────────────────────────────────

  test('the working is written out the way a person would write it', () => {
    const step = (res: ReturnType<typeof compute>, label: string) => {
      const found = res.steps!.find((s) => 'label' in s && s.label === label) as Quantity
      return String(found.value)
    }

    // C(10, 3) cancels to (10 × 9 × 8) / (3 × 2 × 1), descending, as taught.
    const c = compute(DEFAULTS)
    expect(step(c, 'Multiplied out')).toBe('(10 × 9 × 8) / (3 × 2 × 1)')
    expect(step(c, 'Substituted')).toBe('10! / (3! × 7!)')

    // C(12, 3) = 220 for the multiset case: (12 × 11 × 10) / (3 × 2 × 1).
    const m = compute(at({ repetition: 'yes' }))
    expect(step(m, 'Multiplied out')).toBe('(12 × 11 × 10) / (3 × 2 × 1)')

    // P(10, 3) is a plain falling product.
    expect(step(compute(at({ order: 'matters' })), 'Multiplied out')).toBe('10 × 9 × 8')

    // No step may ever print a factorial of a negative number: (n − r)! does not
    // exist when r > n, and "5! / (8! × -3!)" is worse than saying so.
    const impossible = compute(at({ n: 5, r: 8 }))
    for (const s of impossible.steps!) {
      if ('rule' in s) continue
      expect(String(s.value)).not.toMatch(/-\d+!/)
    }
    for (const s of impossible.stats!) expect(String(s.value)).not.toMatch(/-\d+!/)
    expect(step(impossible, 'Substituted')).toContain('larger than')
  })

  test('choosing more than exists is zero ways, not an error', () => {
    expect(compute(at({ n: 5, r: 8 })).primary.value).toBe(0)
    expect(compute(at({ order: 'matters', n: 5, r: 8 })).primary.value).toBe(0)
    expect(compute(at({ n: 5, r: 8 })).notes!.some((s) => s.includes('Zero ways'))).toBe(true)
    // But with repetition it is an ordinary question with an ordinary answer.
    expect(compute(at({ order: 'matters', repetition: 'yes', n: 5, r: 8 })).primary.value).toBe(
      Math.pow(5, 8),
    )
    // C(5+8−1, 8) = C(12, 8) = 495.
    expect(compute(at({ order: 'ignored', repetition: 'yes', n: 5, r: 8 })).primary.value).toBe(495)
  })

  test('choosing none, or all, or one', () => {
    // Exactly one way to choose nothing, and one way to choose everything.
    expect(compute(at({ n: 7, r: 0 })).primary.value).toBe(1)
    expect(compute(at({ n: 7, r: 7 })).primary.value).toBe(1)
    // C(n, 1) = n, and P(n, 1) = n.
    expect(compute(at({ n: 7, r: 1 })).primary.value).toBe(7)
    expect(compute(at({ order: 'matters', n: 7, r: 1 })).primary.value).toBe(7)
    // P(7, 7) = 7! = 5040.
    expect(compute(at({ order: 'matters', n: 7, r: 7 })).primary.value).toBe(5040)
  })

  test('the bounds the form offers are all values compute accepts', () => {
    // Mirrors field-bounds.test.ts: every slider end, other fields at default.
    for (const field of fields) {
      if (field.kind !== 'number') continue
      for (const bound of [field.min, field.max]) {
        expect(bound, `${field.id} declares both bounds`).toBeTypeOf('number')
        expect(() => compute(at({ [field.id]: bound } as Partial<Values>))).not.toThrow()
      }
    }
  })

  test('nudging the first number field to 1.1x its default stays valid and moves the answer', () => {
    // tests/calculators.spec.ts does exactly this. n = 10 → 11, still a whole
    // number, which matters because non-integers are rejected rather than rounded.
    const n = fields[2].default
    expect(Number.isInteger(n * 1.1)).toBe(true)
    const before = compute(DEFAULTS).primary.value
    const after = compute(at({ n: n * 1.1 })).primary.value
    expect(before).toBe(120)
    expect(after).toBe(165) // C(11, 3) = 11·10·9 / 6
    expect(after).not.toBe(before)
  })

  test.each([
    ['a non-finite n', { n: Number.NaN }, 'n'],
    ['an infinite n', { n: Number.POSITIVE_INFINITY }, 'n'],
    ['a non-finite r', { r: Number.NaN }, 'r'],
    ['a fractional n', { n: 10.5 }, 'n'],
    ['a fractional r', { r: 2.5 }, 'r'],
    ['a negative n', { n: -4 }, 'n'],
    ['a zero pool', { n: 0 }, 'n'],
    ['a negative r', { r: -1 }, 'r'],
    ['an n past the accepted range', { n: 1001 }, 'n'],
    ['an r past the accepted range', { r: 1001 }, 'r'],
    ['an unknown order option', { order: 'sometimes' }, 'order'],
    ['an unknown repetition option', { repetition: 'maybe' }, 'repetition'],
  ])('rejects %s against the offending field', (_label, over, fieldId) => {
    let thrown: unknown
    try {
      compute(at(over as Partial<Values>))
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
    expect((thrown as CalcError).message.length).toBeGreaterThan(10)
  })

  test('never returns NaN for unparseable input', () => {
    expect(() => compute(at({ n: Number.NaN }))).toThrow(CalcError)
    expect(() => compute(at({ r: Number.NaN }))).toThrow(CalcError)
  })

  // ── Shape ───────────────────────────────────────────────────────────────

  test('the reported counts never vary in number, and there is nothing to draw', () => {
    const shapes = new Set<string>()
    for (const order of ['ignored', 'matters'] as const) {
      for (const repetition of ['no', 'yes'] as const) {
        for (const n of [1, 10, 1000]) {
          for (const r of [0, 3, 1000]) {
            const result = compute({ order, repetition, n, r })
            shapes.add(`${result.stats!.length}`)
            // parts and series are absent everywhere, so the server never
            // renders a donut or chart the island would then have to fill.
            expect(result.parts).toBeUndefined()
            expect(result.series).toBeUndefined()
            expect(result.notes!.length).toBeGreaterThan(0)
          }
        }
      }
    }
    expect(shapes).toEqual(new Set(['6']))
  })

  test('the worked steps stay readable when r is large', () => {
    const result = compute(at({ order: 'matters', repetition: 'yes', n: 1000, r: 1000 }))
    for (const step of result.steps!) {
      if ('rule' in step) continue
      expect(String(step.value).length).toBeLessThan(120)
    }
  })

  test('a Count is inert data: value, exactness, magnitude', () => {
    const c: Count = binomial(10, 3)
    expect(c).toEqual({ value: 120, exact: true, log10: expect.closeTo(Math.log10(120), 9) })
  })
})

/*
 * The conformance rules from src/calculators/registry.test.ts, applied here.
 *
 * That suite derives its cases from the registry barrel, which this calculator
 * is not in yet — registration is a central edit. Checking the same invariants
 * locally means the line can be added without discovering a 161-character
 * description at that point.
 */
describe('definition', () => {
  test('meta description fits in a search result', () => {
    expect(def.description.length).toBeGreaterThan(50)
    expect(def.description.length).toBeLessThanOrEqual(160)
  })

  test('titles and intro are the right shape', () => {
    expect(def.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    expect(def.category).toBe('math')
    expect(def.title.length).toBeGreaterThan(0)
    expect(def.seoTitle.length).toBeLessThanOrEqual(70)
    expect(def.intro.length).toBeGreaterThan(40)
    expect(def.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('has at least three FAQs, each properly answered', () => {
    expect(def.faqs.length).toBeGreaterThanOrEqual(3)
    for (const faq of def.faqs) {
      expect(faq.q.endsWith('?'), faq.q).toBe(true)
      expect(faq.a.length, faq.q).toBeGreaterThan(40)
    }
  })

  test('every related slug resolves to a calculator that already exists', () => {
    const existing = [probability.slug, gcdLcm.slug, percentage.slug]
    for (const slug of def.related) {
      expect(existing, `${def.slug} → ${slug}`).toContain(slug)
      expect(slug).not.toBe(def.slug)
    }
    expect(new Set(def.related).size).toBe(def.related.length)
  })

  test('contains no colours, class names, or HTML', () => {
    const serialized = JSON.stringify(def, (_k, v) => (typeof v === 'function' ? undefined : v))
    expect(serialized).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(serialized).not.toMatch(/\b(bg|text|border|rounded|shadow)-[a-z]+-\d{2,3}\b/)
    expect(serialized).not.toMatch(/<\/?[a-z][\s\S]*>/i)
  })

  test('field ids are unique and camelCase, and select defaults are offered', () => {
    const ids = def.fields.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z][a-zA-Z0-9]*$/)
    for (const field of def.fields) {
      if (field.kind === 'select') {
        expect(field.options.map((o) => o.value)).toContain(field.default)
        expect(field.options.length).toBeGreaterThan(1)
      }
    }
  })

  test('every number default sits on min + n × step, and inside its bounds', () => {
    for (const field of def.fields) {
      if (field.kind !== 'number') continue
      expect(field.default).toBeGreaterThanOrEqual(field.min)
      expect(field.default).toBeLessThanOrEqual(field.max)
      // An HTML range snaps to min + n × step; a default off that grid shifts
      // silently the moment the slider is touched.
      const notches = (field.default - field.min) / field.step
      expect(Math.abs(notches - Math.round(notches)), field.id).toBeLessThan(1e-9)
    }
  })

  test('renders to a complete view with no NaN anywhere', () => {
    const view = toResultView(def.compute(DEFAULTS))
    expect(view.primary.text).not.toBe('')
    expect(view.primary.text).not.toContain('NaN')
    for (const s of view.stats) expect(s.text).not.toContain('NaN')
    expect(view.primary.text).toBe('120')
    expect(view.parts).toHaveLength(0)
    expect(view.series).toHaveLength(0)
  })
})

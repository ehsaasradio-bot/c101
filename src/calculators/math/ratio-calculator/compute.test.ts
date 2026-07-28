import { describe, expect, test } from 'vitest'
import compute from './compute'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'
import { formatValue } from '../../../lib/format'
import type { Quantity, StepRule } from '../../../lib/types'

const base = { termA: 3, termB: 4, termC: 9 } as const

const stat = (r: ReturnType<typeof compute>, label: string) =>
  r.stats!.find((s) => s.label === label)!.value

const isRule = (s: Quantity | StepRule): s is StepRule => 'rule' in s

/** Every displayed quantity, stats and steps alike, primary included. */
const quantities = (r: ReturnType<typeof compute>): Quantity[] => [
  r.primary,
  ...(r.stats ?? []),
  ...(r.steps ?? []).filter((s): s is Quantity => !isRule(s)),
]

/** Independent, deliberately dumb GCD: scan downwards for a common divisor. */
function bruteGcd(a: number, b: number): number {
  for (let d = Math.min(a, b); d >= 1; d--) {
    if (a % d === 0 && b % d === 0) return d
  }
  return 1
}

/**
 * A second, independent simplifier written straight from the definition and
 * sharing no code with compute: turn each term into an exact fraction over a
 * power of ten by string surgery on its decimal form, put both over a common
 * denominator, and divide out the BigInt GCD.
 */
function referenceSimplify(a: number, b: number): string {
  const asFraction = (n: number): [bigint, bigint] => {
    // Expand exponential notation by hand so the digits are literal.
    let s = n.toExponential(14)
    const [mantissa, exp] = s.split('e')
    const digits = mantissa.replace('.', '').replace(/0+$/, '') || '0'
    const shift = Number(exp) - (mantissa.split('.')[1]?.length ?? 0)
    let numerator = BigInt(digits.padEnd(1, '0'))
    let denominator = 1n
    // Re-derive the exponent for the trimmed digit string.
    const trimmedShift = shift + (mantissa.replace('.', '').length - digits.length)
    if (trimmedShift >= 0) numerator *= 10n ** BigInt(trimmedShift)
    else denominator = 10n ** BigInt(-trimmedShift)
    return [numerator, denominator]
  }
  const [na, da] = asFraction(a)
  const [nb, db] = asFraction(b)
  // a : b === na/da : nb/db === na*db : nb*da
  let x = na * db
  let y = nb * da
  const g = (p: bigint, q: bigint): bigint => (q === 0n ? p : g(q, p % q))
  const d = g(x, y)
  return `${x / d}:${y / d}`
}

describe('ratio', () => {
  test('3 : 4 = 9 : X solves to 12', () => {
    const r = compute(base)
    expect(Number(r.primary.value)).toBeCloseTo(12, 10)
  })

  test('the solved X satisfies the cross-multiplication it was derived from', () => {
    for (const c of [1, 2.5, 7, 100]) {
      const x = Number(compute({ termA: 7, termB: 11, termC: c }).primary.value)
      // A × X === B × C is the definition of the proportion, checked without
      // reusing the closed form.
      expect(7 * x).toBeCloseTo(11 * c, 8)
    }
  })

  test('simplification matches a brute-force common-divisor search', () => {
    for (const [a, b] of [
      [18, 24],
      [100, 75],
      [17, 51],
      [9, 4],
    ] as const) {
      const g = bruteGcd(a, b)
      expect(stat(compute({ termA: a, termB: b, termC: 1 }), 'Simplified ratio')).toBe(
        `${a / g}:${b / g}`,
      )
    }
  })

  test('decimal terms reduce like their scaled-up integer twins', () => {
    expect(stat(compute({ termA: 1.5, termB: 2, termC: 1 }), 'Simplified ratio')).toBe('3:4')
    expect(stat(compute({ termA: 0.25, termB: 0.75, termC: 1 }), 'Simplified ratio')).toBe('1:3')
    // 0.001 : 123.456 needs six decimal places cleared, 1e-7 : 2e-7 needs seven,
    // which is past the point where String() switches to exponential notation.
    expect(stat(compute({ termA: 0.001, termB: 123.456, termC: 1 }), 'Simplified ratio')).toBe(
      '1:123456',
    )
  })

  test('terms far below 1e-6 still reduce, on one side or on both', () => {
    // Both sides tiny: 1e-7 : 2e-7 is 1 : 2, since scaling a ratio by a common
    // factor leaves it unchanged.
    expect(stat(compute({ termA: 0.0000001, termB: 0.0000002, termC: 1 }), 'Simplified ratio')).toBe(
      '1:2',
    )
    // Only one side tiny: 1e-7 : 2 needs 1e7 to clear, giving 1 : 20000000.
    expect(stat(compute({ termA: 0.0000001, termB: 2, termC: 1 }), 'Simplified ratio')).toBe(
      '1:20000000',
    )
    expect(stat(compute({ termA: 5, termB: 0.0000004, termC: 1 }), 'Simplified ratio')).toBe(
      '12500000:1',
    )
  })

  test('the simplified pair agrees with an independent BigInt reduction', () => {
    for (const [a, b] of [
      [3, 4],
      [1.5, 2],
      [0.25, 0.75],
      [0.001, 123.456],
      [0.0000001, 0.0000002],
      [0.0000001, 2],
      [18, 24],
      [1e-9, 7.5],
      [2.4, 0.0000009],
    ] as const) {
      expect(stat(compute({ termA: a, termB: b, termC: 1 }), 'Simplified ratio')).toBe(
        referenceSimplify(a, b),
      )
    }
  })

  test('the simplified pair is a true, fully reduced restatement of A : B', () => {
    for (const [a, b] of [
      [0.0000001, 2],
      [1.5, 2],
      [0.001, 123.456],
      [7, 0.0000003],
      [999.999, 0.5],
    ] as const) {
      const text = String(stat(compute({ termA: a, termB: b, termC: 1 }), 'Simplified ratio'))
      const [sa, sb] = text.split(':').map(BigInt)
      // Neither side may be zero — a ratio with a zero side is the state the
      // calculator refuses on input, so it must never be produced on output.
      expect(sa > 0n && sb > 0n).toBe(true)
      // Fully reduced: no common divisor left.
      const g = (p: bigint, q: bigint): bigint => (q === 0n ? p : g(q, p % q))
      expect(g(sa, sb)).toBe(1n)
      // Equivalent to the input: sa/sb === a/b, compared relatively because the
      // quotient itself can be large.
      expect(Number(sa) / Number(sb) / (a / b)).toBeCloseTo(1, 10)
    }
  })

  test('representation noise in a double does not leak into the ratio', () => {
    // 0.1 + 0.2 is 0.30000000000000004 as a double; reduced literally that would
    // give a sixteen-digit pair instead of 3 : 10.
    expect(stat(compute({ termA: 0.1 + 0.2, termB: 1, termC: 1 }), 'Simplified ratio')).toBe('3:10')
  })

  test('a large term with decimals reduces without integer-overflow garbage', () => {
    // 123456789.123 : 1e12 scaled by 1e3 is 123456789123 : 1e15, which is past
    // Number.MAX_SAFE_INTEGER and must therefore be reduced exactly, not in a
    // double. gcd(123456789123, 1e15) = 3, checked below by construction.
    const text = String(
      stat(compute({ termA: 123456789.123, termB: 1e12, termC: 1 }), 'Simplified ratio'),
    )
    const [sa, sb] = text.split(':').map(BigInt)
    expect(sa * 10n ** 15n).toBe(sb * 123456789123n)
    const g = (p: bigint, q: bigint): bigint => (q === 0n ? p : g(q, p % q))
    expect(g(sa, sb)).toBe(1n)
  })

  test('scaling both known terms leaves the solved X unchanged', () => {
    const plain = Number(compute(base).primary.value)
    const scaled = Number(compute({ termA: 30, termB: 40, termC: 9 }).primary.value)
    expect(scaled).toBeCloseTo(plain, 10)
  })

  test('the percentage split sums to 100 and matches 3/7 of the whole', () => {
    const r = compute(base)
    const a = Number(stat(r, 'Share of A'))
    const b = Number(stat(r, 'Share of B'))
    expect(a + b).toBeCloseTo(100, 10)
    expect(a).toBeCloseTo((3 / 7) * 100, 10)
  })

  test('the parts are the two terms and sum exactly to their declared total', () => {
    const inputs = [
      base,
      { termA: 0.5, termB: 0.5, termC: 0 },
      { termA: 1000, termB: 0.5, termC: 1000 },
      { termA: 0.1 + 0.2, termB: 123.456, termC: 7 },
      { termA: 0.0000001, termB: 2, termC: 3 },
      { termA: 999.999, termB: 0.5, termC: 1 },
    ]
    for (const input of inputs) {
      const r = compute(input)
      expect(r.parts!.map((p) => p.label)).toEqual(['Term A', 'Term B'])
      expect(r.parts![0]!.value).toBe(input.termA)
      expect(r.parts![1]!.value).toBe(input.termB)
      expect(r.partsTotal!.label).toBe('A + B')
      expect(r.partsTotal!.format).toEqual({ style: 'decimal', decimals: 4 })
      const sum = r.parts!.reduce((acc, p) => acc + p.value, 0)
      expect(sum).toBeCloseTo(Number(r.partsTotal!.value), 4)
      for (const p of r.parts!) {
        expect(Number.isFinite(p.value)).toBe(true)
        expect(p.value).toBeGreaterThanOrEqual(0)
      }
    }
  })

  test('the parts split is the same one the stats report as percentages', () => {
    for (const input of [base, { termA: 7, termB: 11, termC: 2 }, { termA: 0.25, termB: 0.75, termC: 1 }]) {
      const r = compute(input)
      const total = Number(r.partsTotal!.value)
      expect((r.parts![0]!.value / total) * 100).toBeCloseTo(Number(stat(r, 'Share of A')), 10)
      expect((r.parts![1]!.value / total) * 100).toBeCloseTo(Number(stat(r, 'Share of B')), 10)
    }
  })

  test('every number field declares a max its default sits inside', () => {
    for (const f of fields) {
      if (f.kind !== 'number') continue
      expect(f.max).toBe(1000)
      expect(f.default).toBeGreaterThanOrEqual(f.min!)
      expect(f.default).toBeLessThanOrEqual(f.max!)
      // The stepper's own bounds must both be input compute accepts.
      expect(() => compute({ ...base, [f.id]: f.min })).not.toThrow()
      expect(() => compute({ ...base, [f.id]: f.max })).not.toThrow()
    }
  })

  test('a zero third term is legal and gives X = 0', () => {
    const r = compute({ ...base, termC: 0 })
    expect(Number(r.primary.value)).toBe(0)
    expect(Number(stat(r, 'Scale factor (C ÷ A)'))).toBe(0)
  })

  test('the common factor removed reconstructs both original terms', () => {
    for (const [a, b] of [
      [18, 24],
      [1.5, 2],
      [0.25, 0.75],
      [0.0000001, 2],
    ] as const) {
      const r = compute({ termA: a, termB: b, termC: 1 })
      const factor = Number(
        (r.steps!.find((s) => !isRule(s) && s.label === 'Common factor removed') as Quantity).value,
      )
      const [sa, sb] = String(stat(r, 'Simplified ratio')).split(':').map(Number)
      expect(sa * factor).toBeCloseTo(a, 12)
      expect(sb * factor).toBeCloseTo(b, 12)
    }
  })

  test('nudging the first number field by 10% stays valid and moves the answer', () => {
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('termA')
    const nudged = compute({ ...base, termA: first.default * 1.1 })
    // 4 × 9 ÷ 3.3
    expect(Number(nudged.primary.value)).toBeCloseTo(36 / 3.3, 10)
    expect(Number(nudged.primary.value)).not.toBeCloseTo(Number(compute(base).primary.value), 6)
  })

  test('the declared field minimums are values compute actually accepts', () => {
    for (const f of fields) {
      if (f.kind !== 'number' || f.min === undefined) continue
      expect(() => compute({ ...base, [f.id]: f.min })).not.toThrow()
    }
  })

  test.each([
    ['zero first term', { termA: 0 }, 'termA'],
    ['zero second term', { termB: 0 }, 'termB'],
    ['negative first term', { termA: -3 }, 'termA'],
    ['negative third term', { termC: -1 }, 'termC'],
    ['an unsimplifiably large term', { termB: 1e15 }, 'termB'],
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

  test('no displayed value renders as NaN or Infinity, string or number', () => {
    const inputs = [
      { termA: 0.001, termB: 123.456, termC: 7 },
      { termA: 0.0000001, termB: 0.0000002, termC: 1 },
      { termA: 0.0000001, termB: 2, termC: 3 },
      { termA: 1e-12, termB: 1e12, termC: 0 },
      { termA: 1e12, termB: 1e-9, termC: 1e12 },
      { termA: 0.1 + 0.2, termB: 0.3, termC: 0.7 },
    ]
    for (const input of inputs) {
      const r = compute(input)
      expect(Number.isFinite(Number(r.primary.value))).toBe(true)
      for (const q of quantities(r)) {
        // Formatting is where a raw-style string escapes the em-dash fallback,
        // so assert on the rendered text rather than only on numeric values.
        const text = formatValue(q.value, q.format)
        expect(text, `${q.label} of ${JSON.stringify(input)}`).not.toMatch(/NaN|Infinity|—/)
      }
    }
  })

  test('a term small enough to overflow the solved X is refused, not rendered', () => {
    let thrown: unknown
    try {
      compute({ termA: 5e-324, termB: 1e12, termC: 1e12 })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe('termA')
  })
})

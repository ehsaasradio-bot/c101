import { describe, expect, test } from 'vitest'
import compute, { factorial, primeExponent, trailingZeros } from './compute'
import { CalcError } from '../../../lib/types'

/**
 * The oracle: the definition itself, written as naively as possible.
 *
 * `factorial` in compute.ts uses binary splitting for speed, which reassociates
 * the multiplications. Multiplication of integers is associative, so the two
 * must agree exactly — and an independent naive loop is the only honest way to
 * show that the clever version did not lose anything.
 */
function naiveFactorial(n: number): bigint {
  let result = 1n
  for (let i = 2n; i <= BigInt(n); i += 1n) result *= i
  return result
}

/** Counts the zeros on the end of the actual digits — no formula involved. */
function countTrailingZerosOfDigits(digits: string): number {
  let zeros = 0
  for (let i = digits.length - 1; i >= 0 && digits[i] === '0'; i -= 1) zeros += 1
  return zeros
}

const stat = (n: number, label: string) => {
  const found = compute({ n }).stats?.find((s) => s.label === label)
  if (!found) throw new Error(`no stat "${label}"`)
  return found.value
}

describe('factorial', () => {
  // ── Anchors the outside world already agrees on ────────────────────────────

  test('the published anchors', () => {
    expect(factorial(0).toString()).toBe('1')
    expect(factorial(1).toString()).toBe('1')
    expect(factorial(5).toString()).toBe('120')
    // 10! = 3,628,800.
    expect(factorial(10).toString()).toBe('3628800')
    // 20! = 2,432,902,008,176,640,000 — the largest factorial that fits in a
    // signed 64-bit integer (21! = 51,090,942,171,709,440,000 does not).
    expect(factorial(20).toString()).toBe('2432902008176640000')
    expect(factorial(20) <= 2n ** 63n - 1n).toBe(true)
    expect(factorial(21).toString()).toBe('51090942171709440000')
    expect(factorial(21) > 2n ** 63n - 1n).toBe(true)
  })

  /**
   * Where doubles actually fail — measured against BigInt rather than asserted
   * from folklore, because the folklore is wrong in both directions. 18! is the
   * last factorial that is a safe integer, but 21! and 22! still land exactly
   * because factorials collect factors of 2 that a binary mantissa gets free.
   * 23! is the first one a double genuinely gets wrong. Every claim the copy
   * makes about doubles is pinned here.
   */
  test('the exact boundaries of double arithmetic', () => {
    const SAFE = BigInt(Number.MAX_SAFE_INTEGER)
    const survivesAsDouble = (n: number) => {
      const digits = factorial(n).toString()
      const asDouble = Number(digits)
      return Number.isFinite(asDouble) && BigInt(asDouble) === factorial(n)
    }

    // Largest factorial that is a safe integer: 18!.
    expect(factorial(18).toString()).toBe('6402373705728000')
    expect(factorial(18) <= SAFE).toBe(true)
    expect(factorial(19) > SAFE).toBe(true)

    // Last factorial a double stores exactly: 22!. First it gets wrong: 23!.
    for (let n = 0; n <= 22; n += 1) expect(survivesAsDouble(n)).toBe(true)
    for (let n = 23; n <= 60; n += 1) expect(survivesAsDouble(n)).toBe(false)
    expect(factorial(23).toString()).toBe('25852016738884976640000')
    // BigInt(double) is the exact integer that double actually holds.
    expect(BigInt(Number(factorial(23).toString())).toString()).toBe('25852016738884978212864')

    // Largest finite double: 170!.
    expect(Number.isFinite(Number(factorial(170).toString()))).toBe(true)
    expect(Number.isFinite(Number(factorial(171).toString()))).toBe(false)
  })

  test('100! is 158 digits and ends in exactly 24 zeros', () => {
    const digits = factorial(100).toString()
    expect(digits.length).toBe(158)
    expect(countTrailingZerosOfDigits(digits)).toBe(24)
    expect(trailingZeros(100)).toBe(24)
    // The published value of 100!, digit for digit.
    expect(digits).toBe(
      '93326215443944152681699238856266700490715968264381621468592963895217599993229915608941463976156518286253697920827223758251185210916864000000000000000000000000',
    )
  })

  // ── Verification one: the naive BigInt loop as an exact oracle ─────────────

  test(
    'binary splitting agrees with a naive loop at every n up to 400',
    () => {
      for (let n = 0; n <= 400; n += 1) {
        expect(factorial(n)).toBe(naiveFactorial(n))
      }
    },
    30_000,
  )

  test(
    'binary splitting agrees with a naive loop at the top of the range',
    () => {
      for (const n of [999, 1000, 2001, 5000, 9999, 10_000]) {
        expect(factorial(n)).toBe(naiveFactorial(n))
      }
    },
    60_000,
  )

  // ── Verification two: Legendre's count against the real digits ─────────────

  test(
    'the trailing-zero formula matches the zeros actually present',
    () => {
      for (let n = 0; n <= 600; n += 1) {
        const digits = factorial(n).toString()
        expect(trailingZeros(n)).toBe(countTrailingZerosOfDigits(digits))
      }
      // And well past the range a brute-force check would be comfortable in.
      for (const n of [1000, 2500, 5000, 10_000]) {
        expect(trailingZeros(n)).toBe(countTrailingZerosOfDigits(factorial(n).toString()))
      }
    },
    60_000,
  )

  test('the factors of 2 outnumber the factors of 5, which is why fives bind', () => {
    for (let n = 2; n <= 2000; n += 1) {
      expect(primeExponent(n, 2)).toBeGreaterThan(primeExponent(n, 5))
    }
    // Legendre's worked example from the FAQ: 1000! ends in 249 zeros.
    expect(trailingZeros(1000)).toBe(200 + 40 + 8 + 1)
    expect(trailingZeros(1000)).toBe(249)
    expect(primeExponent(100, 2)).toBe(97)
    expect(primeExponent(100, 5)).toBe(24)
  })

  // ── The result as the page shows it ────────────────────────────────────────

  test('the default result gives all 158 digits of 100!, in the exact-value stat', () => {
    const result = compute({ n: 100 })
    expect(result.primary.label).toBe('100!')
    expect(result.primary.format).toEqual({ style: 'raw' })

    // The HEADLINE is elided past 44 digits, because the primary slot is styled
    // for "$2,022.62" and 158 unbroken digits pushed the document 2,899px wider
    // than the viewport. The promise of exactness is kept by the stat below,
    // which wraps — not by breaking the page.
    expect(String(result.primary.value)).toContain('…')
    expect(String(result.primary.value).length).toBeLessThan(100)

    // Every digit, exactly, still on the page and still copy-pasteable.
    expect(stat(100, 'Exact value')).toBe(factorial(100).toString())
    expect(String(stat(100, 'Exact value'))).not.toContain('…')
    expect(stat(100, 'Number of digits')).toBe(158)
    expect(stat(100, 'Trailing zeros')).toBe(24)
    expect(stat(100, 'Scientific notation')).toBe('9.33262 × 10^157')
  })

  test('a long result is elided in the middle, never rounded', () => {
    const result = compute({ n: 10_000 })
    const shown = String(result.primary.value)
    const digits = factorial(10_000).toString()
    expect(digits.length).toBe(35_660)
    expect(stat(10_000, 'Number of digits')).toBe(35_660)
    expect(shown).toContain('…')
    // Both ends are the real digits — the elision hides, it does not approximate.
    // 16 either side, sized so the headline fits its slot; the stat carries far
    // more, and the steps carry the working.
    expect(shown.startsWith(digits.slice(0, 16))).toBe(true)
    expect(shown.endsWith(digits.slice(-16))).toBe(true)

    // The stat elides too at this size — 35,660 digits in the DOM on every
    // keystroke is its own kind of broken — but far later, and from real ends.
    const inStat = String(stat(10_000, 'Exact value'))
    expect(inStat.startsWith(digits.slice(0, 600))).toBe(true)
    expect(inStat.endsWith(digits.slice(-600))).toBe(true)

    expect(result.notes?.some((note) => note.includes('35,660'))).toBe(true)
  })

  test('0! and 1! are 1, and say why', () => {
    for (const n of [0, 1]) {
      const result = compute({ n })
      expect(result.primary.value).toBe('1')
      expect(stat(n, 'Number of digits')).toBe(1)
      expect(stat(n, 'Trailing zeros')).toBe(0)
      expect(result.notes?.some((note) => note.includes('Both 0! and 1! are 1'))).toBe(true)
    }
  })

  test('the exactness note appears exactly where safe-integer arithmetic stops', () => {
    const mentionsBigInt = (n: number) =>
      compute({ n }).notes?.some((note) => note.includes('BigInt')) ?? false
    expect(mentionsBigInt(18)).toBe(false)
    expect(mentionsBigInt(19)).toBe(true)
  })

  test('the double verdict tracks the four regimes', () => {
    expect(stat(18, 'As a JavaScript number')).toContain('safe integer')
    expect(stat(19, 'As a JavaScript number')).toContain('past 2^53')
    expect(stat(22, 'As a JavaScript number')).toContain('past 2^53')
    expect(stat(23, 'As a JavaScript number')).toContain('Wrong')
    expect(stat(170, 'As a JavaScript number')).toContain('Wrong')
    expect(stat(171, 'As a JavaScript number')).toContain('Infinity')
    expect(stat(171, 'Nearest double')).toBe('Infinity (overflowed)')
  })

  test('scientific notation is read off the exact digits', () => {
    expect(stat(0, 'Scientific notation')).toBe('1.00000 × 10^0')
    expect(stat(10, 'Scientific notation')).toBe('3.62880 × 10^6')
    expect(stat(20, 'Scientific notation')).toBe('2.43290 × 10^18')
    // The mantissa must agree with the digits it was derived from.
    for (const n of [7, 23, 99, 100, 500, 1234]) {
      const digits = factorial(n).toString()
      const shown = String(stat(n, 'Scientific notation'))
      const [mantissa, exponentPart] = shown.split(' × 10^')
      expect(Number(exponentPart)).toBe(digits.length - 1)
      expect(Number(mantissa)).toBeCloseTo(Number(`${digits[0]}.${digits.slice(1, 12)}`), 4)
    }
  })

  // ── Refusals ──────────────────────────────────────────────────────────────

  test('never returns NaN for unparseable input', () => {
    let thrown: unknown
    try {
      compute({ n: Number.NaN })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe('n')
    expect(() => compute({ n: Number.POSITIVE_INFINITY })).toThrow(CalcError)
  })

  test('rejects non-integers, and explains gamma rather than just refusing', () => {
    let thrown: unknown
    try {
      compute({ n: 4.5 })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe('n')
    expect((thrown as Error).message).toContain('gamma')
  })

  test('rejects negative numbers, naming the poles', () => {
    let thrown: unknown
    try {
      compute({ n: -3 })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe('n')
    expect((thrown as Error).message).toContain('poles')
  })

  test('rejects n above the measured cap, and accepts the cap itself', () => {
    expect(() => compute({ n: 10_001 })).toThrow(CalcError)
    expect(() => compute({ n: 10_000 })).not.toThrow()
    // Both declared field bounds are values compute accepts.
    expect(() => compute({ n: 0 })).not.toThrow()
  })

  test('the e2e nudge of the first number field survives integer rejection', () => {
    // tests/calculators.spec.ts sets the first number field to 1.1x its default
    // and rounds with toFixed(4) before filling. 100 x 1.1 is 110.00000000000001
    // in floating point, which would be rejected as a non-integer — the rounding
    // is what saves it, so assert the exact value the suite would type.
    const nudged = Number((100 * 1.1).toFixed(4))
    expect(nudged).toBe(110)
    const result = compute({ n: nudged })
    expect(result.primary.label).toBe('110!')
    // The headline elides; the exact-value stat is where the digits live.
    expect(stat(110, 'Exact value')).toBe(factorial(110).toString())
    // ...and different from the default, which is what the suite checks.
    expect(result.primary.value).not.toBe(compute({ n: 100 }).primary.value)
  })

  test('the raw pre-rounding nudge is refused rather than silently rounded', () => {
    expect(() => compute({ n: 100 * 1.1 })).toThrow(CalcError)
  })

  // ── Shape ─────────────────────────────────────────────────────────────────

  test('no parts or series at any input, so nothing is drawn only sometimes', () => {
    for (const n of [0, 1, 2, 100, 110, 2500, 10_000]) {
      const result = compute({ n })
      expect(result.parts).toBeUndefined()
      expect(result.series).toBeUndefined()
      expect(result.stats).toHaveLength(7)
    }
  })

  test('the working leads to the answer it prints', () => {
    const result = compute({ n: 100 })
    const labels = (result.steps ?? []).map((s) => ('rule' in s ? '—' : s.label))
    expect(labels).toContain('Exact value of 100!')
    expect(labels).toContain('floor(100 / 5)')
    expect(labels).toContain('floor(100 / 25)')
    expect(labels).not.toContain('floor(100 / 125)')
    const zeroStep = (result.steps ?? []).find((s) => !('rule' in s) && s.label === 'Trailing zeros')
    expect(zeroStep && !('rule' in zeroStep) ? zeroStep.value : null).toBe(24)
  })
})

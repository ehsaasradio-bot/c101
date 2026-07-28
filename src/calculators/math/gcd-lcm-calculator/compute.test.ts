import { describe, expect, test } from 'vitest'
import compute from './compute'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'

/** Independent check: the largest k dividing both, found by brute force. */
function bruteGcd(a: number, b: number): number {
  const x = Math.abs(a)
  const y = Math.abs(b)
  if (x === 0) return y
  if (y === 0) return x
  for (let k = Math.min(x, y); k >= 1; k -= 1) {
    if (x % k === 0 && y % k === 0) return k
  }
  return 1
}

/** Independent check: walk the multiples of the larger number until the smaller divides one. */
function bruteLcm(a: number, b: number): number {
  const x = Math.abs(a)
  const y = Math.abs(b)
  if (x === 0 || y === 0) return 0
  const big = Math.max(x, y)
  const small = Math.min(x, y)
  for (let m = big; ; m += big) {
    if (m % small === 0) return m
  }
}

const stat = (r: ReturnType<typeof compute>, label: string) =>
  r.stats!.find((s) => s.label === label)!.value

describe('gcd-lcm', () => {
  test('48 and 180 give GCD 12 and LCM 720', () => {
    // 48 = 2^4·3, 180 = 2^2·3^2·5 → shared 2^2·3 = 12; 48·180/12 = 720.
    const r = compute({ numberA: 48, numberB: 180 })
    expect(Number(r.primary.value)).toBe(12)
    expect(Number(stat(r, 'Least common multiple'))).toBe(720)
    expect(stat(r, 'Coprime?')).toBe('No')
  })

  test('agrees with brute force across a grid of pairs', () => {
    for (let a = 1; a <= 40; a += 1) {
      for (let b = 1; b <= 40; b += 1) {
        const r = compute({ numberA: a, numberB: b })
        expect(Number(r.primary.value)).toBe(bruteGcd(a, b))
        expect(Number(stat(r, 'Least common multiple'))).toBe(bruteLcm(a, b))
      }
    }
  })

  test('GCD × LCM equals |a × b| — the defining identity', () => {
    for (const [a, b] of [
      [12, 18],
      [270, 192],
      [1071, 462],
      [123456, 7890],
    ]) {
      const r = compute({ numberA: a, numberB: b })
      expect(Number(r.primary.value) * Number(stat(r, 'Least common multiple'))).toBe(
        Math.abs(a * b),
      )
    }
  })

  test('signs are ignored and decimals are rounded to whole numbers', () => {
    const plain = compute({ numberA: 48, numberB: 180 })
    const negative = compute({ numberA: -48, numberB: 180 })
    const decimal = compute({ numberA: 47.6, numberB: 179.8 })
    expect(Number(negative.primary.value)).toBe(Number(plain.primary.value))
    expect(Number(negative.primary.value)).toBe(12)
    // 47.6 → 48 and 179.8 → 180, so the rounded pair matches the plain one.
    expect(Number(decimal.primary.value)).toBe(Number(plain.primary.value))
    expect(Number(stat(decimal, 'Least common multiple'))).toBe(720)
  })

  test('zero paired with n gives GCD n and LCM 0', () => {
    const r = compute({ numberA: 0, numberB: 7 })
    expect(Number(r.primary.value)).toBe(7)
    expect(Number(stat(r, 'Least common multiple'))).toBe(0)
    expect(r.steps!.length).toBeGreaterThan(0)
  })

  test('coprime inputs report GCD 1 and an LCM equal to the product', () => {
    const r = compute({ numberA: 35, numberB: 64 })
    expect(Number(r.primary.value)).toBe(1)
    expect(Number(stat(r, 'Least common multiple'))).toBe(35 * 64)
    expect(stat(r, 'Coprime?')).toBe('Yes')
    expect(r.notes).toHaveLength(1)
  })

  test('the prime factorisation multiplies back to the input', () => {
    const r = compute({ numberA: 360, numberB: 97 })
    const parse = (text: string) =>
      text
        .split(' × ')
        .map((part) => {
          const [base, power] = part.split('^')
          return Math.pow(Number(base), power === undefined ? 1 : Number(power))
        })
        .reduce((acc, n) => acc * n, 1)
    expect(parse(String(stat(r, 'Factors of the first number')))).toBe(360)
    // 97 is prime, so its factorisation is the number itself.
    expect(String(stat(r, 'Factors of the second number'))).toBe('97')
    expect(parse(String(stat(r, 'Factors of the second number')))).toBe(97)
  })

  test('the Euclidean trace is a valid division chain ending at the GCD', () => {
    const r = compute({ numberA: 1071, numberB: 462 })
    const lines = r
      .steps!.flatMap((s) => ('label' in s && s.label.startsWith('Step ') ? [String(s.value)] : []))
    expect(lines.length).toBeGreaterThan(1)
    let lastRemainder = -1
    for (const line of lines) {
      const m = /^(\d+) = (\d+) × (\d+) \+ (\d+)$/.exec(line)!
      const [x, q, y, rem] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]
      expect(q * y + rem).toBe(x)
      expect(rem).toBeLessThan(y)
      lastRemainder = rem
    }
    expect(lastRemainder).toBe(0)
    expect(Number(r.primary.value)).toBe(bruteGcd(1071, 462))
  })

  test('common-divisor count matches an enumeration of shared divisors', () => {
    const r = compute({ numberA: 48, numberB: 180 })
    let count = 0
    for (let k = 1; k <= 48; k += 1) if (48 % k === 0 && 180 % k === 0) count += 1
    expect(Number(stat(r, 'Common divisors'))).toBe(count)
  })

  test('nudging the first field to 1.1x its default stays valid and moves the answer', () => {
    const a = fields[0].default
    const b = fields[1].default
    const base = compute({ numberA: a, numberB: b })
    const nudged = compute({ numberA: a * 1.1, numberB: b })
    expect(Number(nudged.primary.value)).not.toBe(Number(base.primary.value))
  })

  test.each([
    ['zero and zero', { numberA: 0, numberB: 0 }, 'numberA'],
    ['a non-finite first number', { numberA: Number.NaN, numberB: 4 }, 'numberA'],
    ['a non-finite second number', { numberA: 4, numberB: Number.POSITIVE_INFINITY }, 'numberB'],
    ['an out-of-range first number', { numberA: 2e9, numberB: 4 }, 'numberA'],
    ['an out-of-range second number', { numberA: 4, numberB: -2e9 }, 'numberB'],
    ['an LCM too large to represent', { numberA: 999_999_937, numberB: 999_999_893 }, 'numberB'],
  ])('rejects %s', (_label, values, fieldId) => {
    let thrown: unknown
    try {
      compute(values)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
  })

  test('never returns NaN for any in-range pair', () => {
    for (const [a, b] of [
      [1, 1],
      [0, 1_000_000_000],
      [-7, -21],
      [2, 3],
      [1_000_000_000, 1_048_576],
    ]) {
      const r = compute({ numberA: a, numberB: b })
      expect(Number.isFinite(Number(r.primary.value))).toBe(true)
      expect(Number.isFinite(Number(stat(r, 'Least common multiple')))).toBe(true)
    }
  })
})

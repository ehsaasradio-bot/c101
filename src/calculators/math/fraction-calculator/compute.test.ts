import { describe, expect, test } from 'vitest'
import compute from './compute'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'

/** Parse "7/12", "-2" etc. back into a numerator/denominator pair. */
function parse(text: string): [number, number] {
  const [n, d] = text.split('/')
  return [Number(n), d === undefined ? 1 : Number(d)]
}

/** Independent, deliberately naive reduction check: no divisor above 1 may divide both. */
function isLowestTerms(n: number, d: number): boolean {
  const limit = Math.min(Math.abs(n) || Infinity, Math.abs(d))
  for (let k = 2; k <= limit; k++) {
    if (n % k === 0 && d % k === 0) return false
  }
  return true
}

function primaryOf(v: Parameters<typeof compute>[0]): string {
  return String(compute(v).primary.value)
}

describe('fraction calculator', () => {
  test('10/20 + 1/3 = 5/6, cross-checked against float arithmetic', () => {
    const r = compute({
      numeratorA: 10,
      denominatorA: 20,
      operation: 'add',
      numeratorB: 1,
      denominatorB: 3,
    })
    const [n, d] = parse(String(r.primary.value))
    // Derived, not asserted: the value must equal 10/20 + 1/3 whatever form it takes.
    expect(n / d).toBeCloseTo(10 / 20 + 1 / 3, 12)
    expect(isLowestTerms(n, d)).toBe(true)
    expect(d).toBeGreaterThan(0)
    expect(String(r.primary.value)).toBe('5/6')
    expect(Number(r.stats!.find((s) => s.label === 'Decimal value')!.value)).toBeCloseTo(
      10 / 20 + 1 / 3,
      12,
    )
    expect(r.stats!.find((s) => s.label === 'Before simplifying')!.value).toBe('50/60')
  })

  test('every operation agrees with float arithmetic and stays in lowest terms', () => {
    const ops = ['add', 'subtract', 'multiply', 'divide'] as const
    const expected: Record<(typeof ops)[number], (a: number, b: number) => number> = {
      add: (a, b) => a + b,
      subtract: (a, b) => a - b,
      multiply: (a, b) => a * b,
      divide: (a, b) => a / b,
    }
    for (const nA of [-7, -1, 3, 8]) {
      for (const dA of [-4, 2, 6]) {
        for (const nB of [-5, 2, 9]) {
          for (const dB of [-3, 4, 12]) {
            for (const op of ops) {
              const r = compute({
                numeratorA: nA,
                denominatorA: dA,
                operation: op,
                numeratorB: nB,
                denominatorB: dB,
              })
              const [n, d] = parse(String(r.primary.value))
              expect(d).toBeGreaterThan(0)
              expect(isLowestTerms(n, d)).toBe(true)
              expect(n / d).toBeCloseTo(expected[op](nA / dA, nB / dB), 10)
            }
          }
        }
      }
    }
  })

  test('improper results render as mixed numbers, whole results collapse', () => {
    const improper = compute({
      numeratorA: 7,
      denominatorA: 3,
      operation: 'multiply',
      numeratorB: 1,
      denominatorB: 1,
    })
    expect(improper.primary.value).toBe('7/3')
    expect(improper.stats!.find((s) => s.label === 'Mixed number')!.value).toBe('2 1/3')

    const negative = compute({
      numeratorA: -7,
      denominatorA: 3,
      operation: 'multiply',
      numeratorB: 1,
      denominatorB: 1,
    })
    expect(negative.stats!.find((s) => s.label === 'Mixed number')!.value).toBe('-2 1/3')

    // 3/4 + 1/4 is exactly 1, so no denominator should survive.
    const whole = compute({
      numeratorA: 3,
      denominatorA: 4,
      operation: 'add',
      numeratorB: 1,
      denominatorB: 4,
    })
    expect(whole.primary.value).toBe('1')
  })

  test('a zero result and sign placement are canonical', () => {
    expect(
      primaryOf({
        numeratorA: 2,
        denominatorA: 5,
        operation: 'subtract',
        numeratorB: 4,
        denominatorB: 10,
      }),
    ).toBe('0')
    // 1/-2 and -1/2 describe the same number, so they must print identically.
    expect(
      primaryOf({
        numeratorA: 1,
        denominatorA: -2,
        operation: 'multiply',
        numeratorB: 1,
        denominatorB: 1,
      }),
    ).toBe('-1/2')
    expect(
      primaryOf({
        numeratorA: -1,
        denominatorA: 2,
        operation: 'multiply',
        numeratorB: 1,
        denominatorB: 1,
      }),
    ).toBe('-1/2')
  })

  test('nudging the first number field keeps valid input and moves the answer', () => {
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('numeratorA')
    const base = {
      numeratorA: fields[0].default as number,
      denominatorA: 20,
      operation: 'add',
      numeratorB: 1,
      denominatorB: 3,
    }
    const nudged = { ...base, numeratorA: (fields[0].default as number) * 1.1 }
    expect(primaryOf(nudged)).not.toBe(primaryOf(base))
    expect(primaryOf(nudged)).toBe('53/60')
  })

  test('rejects zero denominators, division by a zero fraction, and non-integers', () => {
    const base = {
      numeratorA: 1,
      denominatorA: 2,
      operation: 'add',
      numeratorB: 1,
      denominatorB: 3,
    }
    expect(() => compute({ ...base, denominatorA: 0 })).toThrow(CalcError)
    expect(() => compute({ ...base, denominatorB: 0 })).toThrow(CalcError)
    expect(() => compute({ ...base, operation: 'divide', numeratorB: 0 })).toThrow(CalcError)
    expect(() => compute({ ...base, numeratorA: 1.5 })).toThrow(CalcError)

    try {
      compute({ ...base, denominatorB: 0 })
      throw new Error('should have thrown')
    } catch (e) {
      expect((e as CalcError).fieldId).toBe('denominatorB')
    }
    try {
      compute({ ...base, operation: 'divide', numeratorB: 0 })
      throw new Error('should have thrown')
    } catch (e) {
      expect((e as CalcError).fieldId).toBe('numeratorB')
    }
    // Dividing by a zero fraction is the only rejection unique to division.
    expect(() =>
      compute({ ...base, operation: 'multiply', numeratorB: 0 }),
    ).not.toThrow()
  })
})

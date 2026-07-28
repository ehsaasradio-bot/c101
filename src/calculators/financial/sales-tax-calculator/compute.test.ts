import { describe, expect, test } from 'vitest'
import compute from './compute'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'

const base = { amount: 100, taxRate: 8.25, mode: 'add' } as const

const stat = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)

/**
 * An independent solver for the pre-tax amount: find `net` such that
 * net × (1 + rate) equals the tax-inclusive total, by bisection. It never uses
 * the closed-form division under test, so agreement is real evidence.
 */
function netByBisection(total: number, ratePercent: number): number {
  let lo = 0
  let hi = total
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (mid * (1 + ratePercent / 100) < total) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

describe('sales tax', () => {
  test('adds 8.25% to a $100 price', () => {
    const r = compute(base)
    expect(Number(r.primary.value)).toBeCloseTo(8.25, 10)
    expect(stat(r, 'Pre-tax amount')).toBeCloseTo(100, 10)
    expect(stat(r, 'Total with tax')).toBeCloseTo(108.25, 10)
  })

  test('extract is the exact inverse of add, for many rates and amounts', () => {
    for (const amount of [1, 19.99, 250, 100_000]) {
      for (const taxRate of [0, 2.5, 6, 8.25, 20, 100]) {
        const added = compute({ amount, taxRate, mode: 'add' })
        const total = stat(added, 'Total with tax')

        const extracted = compute({ amount: total, taxRate, mode: 'extract' })
        expect(stat(extracted, 'Pre-tax amount')).toBeCloseTo(amount, 8)
        expect(Number(extracted.primary.value)).toBeCloseTo(Number(added.primary.value), 8)
        expect(stat(extracted, 'Total with tax')).toBeCloseTo(total, 8)
      }
    }
  })

  test('the extracted pre-tax amount matches a bisection solve', () => {
    for (const [total, taxRate] of [
      [108.25, 8.25],
      [21.4, 7],
      [999.99, 12.375],
    ] as const) {
      const r = compute({ amount: total, taxRate, mode: 'extract' })
      expect(stat(r, 'Pre-tax amount')).toBeCloseTo(netByBisection(total, taxRate), 8)
      expect(Number(r.primary.value)).toBeCloseTo(total - netByBisection(total, taxRate), 8)
    }
  })

  test('multiplying the gross by the rate is NOT the answer in extract mode', () => {
    const r = compute({ amount: 108.25, taxRate: 8.25, mode: 'extract' })
    const naive = 108.25 * 0.0825
    expect(Number(r.primary.value)).toBeCloseTo(8.25, 8)
    expect(Number(r.primary.value)).toBeLessThan(naive)
    // The tax is a smaller slice of the gross than the nominal rate.
    expect(stat(r, 'Tax as a share of the total')).toBeLessThan(8.25)
    expect(stat(r, 'Tax as a share of the total')).toBeCloseTo((8.25 / 108.25) * 100, 8)
  })

  test('a 0% rate leaves the amount untouched in both directions', () => {
    for (const mode of ['add', 'extract'] as const) {
      const r = compute({ amount: 42.5, taxRate: 0, mode })
      expect(Number(r.primary.value)).toBe(0)
      expect(stat(r, 'Pre-tax amount')).toBeCloseTo(42.5, 10)
      expect(stat(r, 'Total with tax')).toBeCloseTo(42.5, 10)
    }
  })

  test('a zero amount is valid and taxes to zero', () => {
    const r = compute({ ...base, amount: 0 })
    expect(Number(r.primary.value)).toBe(0)
    expect(stat(r, 'Total with tax')).toBe(0)
    expect(stat(r, 'Tax as a share of the total')).toBe(0)
  })

  test('at a 100% rate, extract splits the total exactly in half', () => {
    const r = compute({ amount: 200, taxRate: 100, mode: 'extract' })
    expect(stat(r, 'Pre-tax amount')).toBeCloseTo(100, 10)
    expect(Number(r.primary.value)).toBeCloseTo(100, 10)
  })

  test('tax scales linearly with the amount', () => {
    const one = compute({ ...base, amount: 100 })
    const ten = compute({ ...base, amount: 1000 })
    expect(Number(ten.primary.value)).toBeCloseTo(Number(one.primary.value) * 10, 8)
  })

  test('the first number field nudged to 1.1x stays valid and moves the result', () => {
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('amount')
    const nudged = first.default * 1.1
    expect(nudged).toBeLessThanOrEqual(first.max!)
    expect(nudged).toBeGreaterThanOrEqual(first.min!)
    expect(Number(compute({ ...base, amount: nudged }).primary.value)).not.toBe(
      Number(compute(base).primary.value),
    )
  })

  test.each([
    ['a negative amount', { amount: -1 }, 'amount'],
    ['a negative rate', { taxRate: -0.5 }, 'taxRate'],
    ['a rate above 100%', { taxRate: 150 }, 'taxRate'],
    ['a non-numeric amount', { amount: Number.NaN }, 'amount'],
    ['an unknown mode', { mode: 'subtract' }, 'mode'],
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
})


/**
 * The shared invariant, asserted the same way everywhere: every slice is finite
 * and non-negative, and the slices add up to the stated whole to 4dp.
 */
function expectPartsSum(r: ReturnType<typeof compute>) {
  const parts = r.parts!
  expect(parts.length).toBeGreaterThan(0)
  for (const p of parts) {
    expect(Number.isFinite(p.value)).toBe(true)
    expect(p.value).toBeGreaterThanOrEqual(0)
  }
  const whole = Number((r.partsTotal ?? r.primary).value)
  expect(parts.reduce((s, p) => s + p.value, 0)).toBeCloseTo(whole, 4)
  return parts
}

describe('sales tax parts', () => {
  test("in 'add' mode the parts are the entered amount and the tax on it", () => {
    const r = compute(base)
    const parts = expectPartsSum(r)
    expect(parts.map((p) => p.label)).toEqual(['Pre-tax amount', 'Sales tax'])
    expect(parts[0]!.value).toBeCloseTo(100, 10)
    expect(parts[1]!.value).toBeCloseTo(8.25, 10)
    expect(Number(r.partsTotal!.value)).toBeCloseTo(108.25, 10)
  })

  test("in 'extract' mode the parts split the entered total, which stays the whole", () => {
    const r = compute({ amount: 108.25, taxRate: 8.25, mode: 'extract' })
    const parts = expectPartsSum(r)
    expect(parts[0]!.value).toBeCloseTo(100, 8)
    expect(parts[1]!.value).toBeCloseTo(8.25, 8)
    // The whole is the amount the user typed in, untouched.
    expect(Number(r.partsTotal!.value)).toBeCloseTo(108.25, 10)
  })

  test('the two modes are inverses, and both keep the invariant', () => {
    const added = compute({ amount: 250, taxRate: 6, mode: 'add' })
    const extracted = compute({ amount: Number(added.partsTotal!.value), taxRate: 6, mode: 'extract' })
    expectPartsSum(added)
    expectPartsSum(extracted)
    expect(extracted.parts![0]!.value).toBeCloseTo(250, 8)
    expect(extracted.parts![1]!.value).toBeCloseTo(added.parts![1]!.value, 8)
  })

  test('a zero rate puts everything in the pre-tax slice', () => {
    for (const mode of ['add', 'extract'] as const) {
      const r = compute({ amount: 100, taxRate: 0, mode })
      const parts = expectPartsSum(r)
      expect(parts[0]!.value).toBeCloseTo(100, 10)
      expect(parts[1]!.value).toBeCloseTo(0, 10)
    }
  })

  test('a zero amount leaves a whole of zero in both modes', () => {
    for (const mode of ['add', 'extract'] as const) {
      const r = compute({ amount: 0, taxRate: 8.25, mode })
      const parts = expectPartsSum(r)
      expect(parts.every((p) => p.value === 0)).toBe(true)
      expect(Number(r.partsTotal!.value)).toBe(0)
    }
  })

  test('the invariant holds across a sweep of amounts, rates and modes', () => {
    for (const mode of ['add', 'extract'] as const) {
      for (const amount of [0, 0.01, 19.99, 100, 100_000_000]) {
        for (const taxRate of [0, 0.5, 8.25, 25, 100]) {
          expectPartsSum(compute({ amount, taxRate, mode }))
        }
      }
    }
  })
})

import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'
import { resolveBand } from '../../../lib/view'

const base = {
  originalPrice: 100,
  discountPercent: 25,
  taxRate: 8.25,
  taxBasis: 'afterDiscount',
} as const

const stat = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)

describe('discount', () => {
  test('$100 at 25% off with 8.25% tax', () => {
    const r = compute(base)
    // 25 off leaves 75; tax on 75 is 6.1875; total 81.1875.
    expect(stat(r, 'You save')).toBeCloseTo(25, 10)
    expect(stat(r, 'Price before tax')).toBeCloseTo(75, 10)
    expect(stat(r, 'Sales tax')).toBeCloseTo(6.1875, 10)
    expect(Number(r.primary.value)).toBeCloseTo(81.1875, 10)
  })

  test('the discount matches a slice-by-slice sum, an independent derivation', () => {
    // A percentage discount is linear, so taking 1% off 37 separate times must
    // remove exactly as much as taking 37% off once. Summing the slices never
    // touches the closed-form expression under test.
    const originalPrice = 249.99
    const discountPercent = 37
    let sliced = 0
    for (let i = 0; i < discountPercent; i++) sliced += originalPrice * 0.01

    const r = compute({ ...base, originalPrice, discountPercent, taxRate: 0 })
    expect(stat(r, 'You save')).toBeCloseTo(sliced, 8)
    expect(Number(r.primary.value)).toBeCloseTo(originalPrice - sliced, 8)
  })

  test('savings and the discounted price always reconstruct the original', () => {
    for (const discountPercent of [0, 1, 12.5, 33.3, 99, 100]) {
      const r = compute({ ...base, originalPrice: 1234.56, discountPercent, taxRate: 0 })
      expect(stat(r, 'You save') + stat(r, 'Price before tax')).toBeCloseTo(1234.56, 8)
    }
  })

  test('0% off is just the price plus tax; 100% off is free', () => {
    const none = compute({ ...base, discountPercent: 0 })
    expect(Number(none.primary.value)).toBeCloseTo(108.25, 10)
    expect(stat(none, 'Total saved vs full price')).toBeCloseTo(0, 10)

    const all = compute({ ...base, discountPercent: 100 })
    expect(Number(all.primary.value)).toBeCloseTo(0, 10)
    expect(stat(all, 'Sales tax')).toBeCloseTo(0, 10)
    expect(stat(all, 'Total saved vs full price')).toBeCloseTo(108.25, 10)
  })

  test('taxing the ticket price costs more than taxing the sale price', () => {
    const after = compute(base)
    const before = compute({ ...base, taxBasis: 'beforeDiscount' })
    // Tax on the full 100 is 8.25, so the total is 75 + 8.25.
    expect(Number(before.primary.value)).toBeCloseTo(83.25, 10)
    expect(Number(before.primary.value)).toBeGreaterThan(Number(after.primary.value))
    // The difference is exactly the tax on the discounted-away 25.
    expect(Number(before.primary.value) - Number(after.primary.value)).toBeCloseTo(
      25 * 0.0825,
      10,
    )
    expect(before.notes).toHaveLength(1)
    expect(after.notes).toHaveLength(0)
  })

  test('with no tax the two bases agree', () => {
    const after = compute({ ...base, taxRate: 0 })
    const before = compute({ ...base, taxRate: 0, taxBasis: 'beforeDiscount' })
    expect(Number(before.primary.value)).toBeCloseTo(Number(after.primary.value), 12)
  })

  test('raising the price raises the final price (the nudged-input path)', () => {
    const nudged = compute({ ...base, originalPrice: 110 })
    expect(Number(nudged.primary.value)).toBeGreaterThan(Number(compute(base).primary.value))
    expect(Number(nudged.primary.value)).toBeCloseTo(110 * 0.75 * 1.0825, 10)
  })

  test('scaleValue is the discount percentage and lands in the right band', () => {
    expect(compute(base).scaleValue).toBe(25)
    expect(resolveBand(def.scale, compute({ ...base, discountPercent: 5 }).scaleValue!)!.id).toBe(
      'neutral',
    )
    expect(resolveBand(def.scale, compute({ ...base, discountPercent: 10 }).scaleValue!)!.id).toBe(
      'good',
    )
    expect(resolveBand(def.scale, compute(base).scaleValue!)!.id).toBe('excellent')
  })

  test('parts split the ticket price into what you pay and what you save', () => {
    const r = compute(base)
    expect(r.parts!.map((p) => p.label)).toEqual(['You pay', 'You save'])
    // Pre-tax on purpose: the two slices have to reconstruct the original price.
    expect(r.parts![0]!.value).toBeCloseTo(75, 10)
    expect(r.parts![1]!.value).toBeCloseTo(25, 10)
    expect(r.partsTotal!.label).toBe('Original price')
    expect(Number(r.partsTotal!.value)).toBeCloseTo(100, 10)
    // Tax stays in the stats, and the headline still carries it.
    expect(stat(r, 'Sales tax')).toBeCloseTo(6.1875, 10)
    expect(Number(r.primary.value)).toBeCloseTo(81.1875, 10)
  })

  test('a non-zero tax rate never disturbs the parts sum, on either tax basis', () => {
    for (const taxRate of [0, 8.25, 20, 50]) {
      for (const taxBasis of ['afterDiscount', 'beforeDiscount'] as const) {
        for (const originalPrice of [0.01, 19.99, 100, 100_000]) {
          for (const discountPercent of [0, 25, 33.3, 100]) {
            const r = compute({ originalPrice, discountPercent, taxRate, taxBasis })
            const sum = r.parts!.reduce((acc, p) => acc + p.value, 0)
            expect(sum).toBeCloseTo(originalPrice, 4)
            expect(sum).toBeCloseTo(Number(r.partsTotal!.value), 4)
            for (const p of r.parts!) {
              expect(Number.isFinite(p.value)).toBe(true)
              expect(p.value).toBeGreaterThanOrEqual(0)
            }
          }
        }
      }
    }
  })

  test('originalPrice declares a max that its own default sits inside', () => {
    const field = fields.find((f) => f.id === 'originalPrice')!
    expect(field.kind).toBe('number')
    expect(field.max).toBe(100_000)
    expect(field.default).toBeGreaterThanOrEqual(field.min)
    expect(field.default).toBeLessThanOrEqual(field.max)
  })

  test.each([
    ['zero price', { originalPrice: 0 }, 'originalPrice'],
    ['negative price', { originalPrice: -5 }, 'originalPrice'],
    ['negative discount', { discountPercent: -1 }, 'discountPercent'],
    ['discount above 100%', { discountPercent: 101 }, 'discountPercent'],
    ['negative tax rate', { taxRate: -0.5 }, 'taxRate'],
    ['non-numeric price', { originalPrice: Number.NaN }, 'originalPrice'],
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

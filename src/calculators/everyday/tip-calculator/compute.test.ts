import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'
import type { CalculatorDef } from '../../../lib/types'

const base = {
  billAmount: 85,
  tipPercent: 18,
  people: 2,
  roundUp: false,
} as const

const stat = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)

describe('tip', () => {
  test('$85 at 18% split two ways is $50.15 each', () => {
    // Derived independently: 18% of 85 is 85/100*18 = 15.30, total 100.30, half is 50.15.
    const tip = (85 / 100) * 18
    const r = compute(base)
    expect(tip).toBeCloseTo(15.3, 10)
    expect(Number(r.primary.value)).toBeCloseTo((85 + tip) / 2, 10)
    expect(Number(r.primary.value)).toBeCloseTo(50.15, 10)
    expect(stat(r, 'Tip amount')).toBeCloseTo(15.3, 10)
    expect(stat(r, 'Total with tip')).toBeCloseTo(100.3, 10)
  })

  test('the shares always reconstruct the total that is handed over', () => {
    // Cross-check by summing the per-person shares one at a time rather than
    // trusting the closed form.
    for (const people of [1, 2, 3, 5, 7, 13]) {
      for (const roundUp of [false, true]) {
        const r = compute({ ...base, people, roundUp })
        let summed = 0
        for (let i = 0; i < people; i++) summed += Number(r.primary.value)
        expect(summed).toBeCloseTo(stat(r, 'Total with tip'), 8)
        expect(stat(r, 'Tip amount')).toBeCloseTo(summed - base.billAmount, 8)
      }
    }
  })

  test('rounding up raises the share to the next whole unit and the effective rate with it', () => {
    const r = compute({ ...base, roundUp: true })
    // 50.15 rounds up to 51 each, so the table pays 102 on an 85 bill: a $17
    // tip, which is exactly 20%.
    expect(Number(r.primary.value)).toBe(51)
    expect(stat(r, 'Total with tip')).toBeCloseTo(102, 10)
    expect(stat(r, 'Tip amount')).toBeCloseTo(17, 10)
    expect(stat(r, 'Effective tip rate')).toBeCloseTo(20, 10)
    expect(r.notes).toHaveLength(1)
  })

  test('rounding up is a no-op when the share is already whole', () => {
    // 100 at 20% is 120, split four ways is exactly 30 — a float-error guard.
    const plain = compute({ billAmount: 100, tipPercent: 20, people: 4, roundUp: false })
    const rounded = compute({ billAmount: 100, tipPercent: 20, people: 4, roundUp: true })
    expect(Number(plain.primary.value)).toBeCloseTo(30, 10)
    expect(Number(rounded.primary.value)).toBe(30)
    expect(rounded.notes).toHaveLength(0)
  })

  test('a zero tip leaves each person paying their share of the bill alone', () => {
    const r = compute({ ...base, tipPercent: 0 })
    expect(stat(r, 'Tip amount')).toBe(0)
    expect(Number(r.primary.value)).toBeCloseTo(85 / 2, 10)
    expect(stat(r, 'Effective tip rate')).toBe(0)
  })

  test('a zero bill does not produce NaN for the effective rate', () => {
    const r = compute({ ...base, billAmount: 0 })
    expect(Number(r.primary.value)).toBe(0)
    expect(stat(r, 'Effective tip rate')).toBe(0)
    expect(Number.isNaN(stat(r, 'Effective tip rate'))).toBe(false)
  })

  test('one person pays the whole total', () => {
    const r = compute({ ...base, people: 1 })
    expect(Number(r.primary.value)).toBeCloseTo(100.3, 10)
  })

  test('the effective rate equals the entered rate when not rounding', () => {
    const r = compute({ ...base, tipPercent: 22.5 })
    expect(stat(r, 'Effective tip rate')).toBeCloseTo(22.5, 8)
  })

  test.each([
    ['a negative bill', { billAmount: -1 }, 'billAmount'],
    ['a negative tip rate', { tipPercent: -5 }, 'tipPercent'],
    ['zero people', { people: 0 }, 'people'],
    ['a fractional party size', { people: 2.5 }, 'people'],
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

  test('the first number field nudged to 1.1x stays valid and moves the result', () => {
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('billAmount')
    const nudged = first.default * 1.1
    expect(nudged).toBeGreaterThanOrEqual(first.min!)
    expect(nudged).toBeLessThanOrEqual(first.max!)
    expect(Number(compute({ ...base, billAmount: nudged }).primary.value)).not.toBeCloseTo(
      Number(compute(base).primary.value),
      6,
    )
  })

  test('parts split the total paid, not the per-person headline', () => {
    const r = compute(base)
    expect(r.parts!.map((p) => p.label)).toEqual(['Bill', 'Tip'])
    expect(r.parts![0]!.value).toBeCloseTo(85, 10)
    expect(r.parts![1]!.value).toBeCloseTo(15.3, 10)
    // The headline is per person, so the parts need their own declared whole.
    expect(r.partsTotal!.label).toBe('Total')
    expect(Number(r.partsTotal!.value)).toBeCloseTo(100.3, 10)
    expect(Number(r.partsTotal!.value)).not.toBeCloseTo(Number(r.primary.value), 4)
  })

  test('parts sum to partsTotal and stay non-negative across inputs, rounding included', () => {
    for (const billAmount of [0, 12.37, 85, 999.99]) {
      for (const tipPercent of [0, 15, 18, 100]) {
        for (const people of [1, 2, 3, 7]) {
          for (const roundUp of [false, true]) {
            const r = compute({ billAmount, tipPercent, people, roundUp })
            const sum = r.parts!.reduce((acc, p) => acc + p.value, 0)
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

  test('with round-up on, the parts sum to the rounded total really handed over', () => {
    const r = compute({ ...base, roundUp: true })
    // 50.15 each rounds to 51, so the table pays 102: an 85 bill and a 17 tip.
    expect(r.parts![0]!.value).toBeCloseTo(85, 10)
    expect(r.parts![1]!.value).toBeCloseTo(17, 10)
    expect(Number(r.partsTotal!.value)).toBeCloseTo(102, 10)
    expect(Number(r.partsTotal!.value)).toBeCloseTo(stat(r, 'Total with tip'), 10)
    expect(r.parts!.reduce((a, p) => a + p.value, 0)).toBeCloseTo(
      Number(r.primary.value) * base.people,
      4,
    )
  })

  test('the definition declares no scale, so compute need not return one', () => {
    // A per-person amount has no good/bad axis, so there is nothing to band.
    const asDef: CalculatorDef = def
    expect(asDef.scale).toBeUndefined()
    expect(compute(base).scaleValue).toBeUndefined()
  })
})

import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'
import { resolveBand } from '../../../lib/view'

const stat = (r: ReturnType<typeof compute>, label: string) =>
  r.stats!.find((s) => s.label === label)!.value

describe('percentage change', () => {
  test('50 to 75 is a 50% increase', () => {
    const r = compute({ oldValue: 50, newValue: 75 })
    expect(Number(r.primary.value)).toBeCloseTo(50, 10)
    expect(stat(r, 'Direction')).toBe('Increase')
    expect(Number(stat(r, 'Absolute difference'))).toBeCloseTo(25, 10)
    expect(Number(stat(r, 'Multiplier'))).toBeCloseTo(1.5, 10)
  })

  test('cross-checked against repeated application of the multiplier', () => {
    // Independent method: applying the reported multiplier to the original must
    // reproduce the new value exactly, for a spread of sign combinations.
    const cases: Array<[number, number]> = [
      [50, 75],
      [200, 50],
      [7, 7],
      [-50, -25],
      [-20, 30],
      [80, -40],
      [0.004, 0.005],
    ]
    for (const [oldValue, newValue] of cases) {
      const r = compute({ oldValue, newValue })
      const multiplier = Number(stat(r, 'Multiplier'))
      expect(oldValue * multiplier).toBeCloseTo(newValue, 10)
      // And the percentage must agree with the multiplier via the identity
      // change% = (multiplier − 1) × 100 × sign(oldValue).
      const viaMultiplier = (multiplier - 1) * 100 * Math.sign(oldValue)
      expect(Number(r.primary.value)).toBeCloseTo(viaMultiplier, 8)
    }
  })

  test('a 50% fall needs a 100% rise to undo, and the pair is not symmetric', () => {
    const down = compute({ oldValue: 100, newValue: 50 })
    const up = compute({ oldValue: 50, newValue: 100 })
    expect(Number(down.primary.value)).toBeCloseTo(-50, 10)
    expect(Number(up.primary.value)).toBeCloseTo(100, 10)
    expect(Number(down.primary.value)).not.toBeCloseTo(-Number(up.primary.value), 6)
  })

  test('identical values are a zero change with no direction', () => {
    const r = compute({ oldValue: 42, newValue: 42 })
    expect(Number(r.primary.value)).toBe(0)
    expect(stat(r, 'Direction')).toBe('No change')
    expect(Number(stat(r, 'Multiplier'))).toBe(1)
    expect(resolveBand(def.scale, r.scaleValue!)!.id).toBe('neutral')
  })

  test('a negative original still reports the true direction of the move', () => {
    const r = compute({ oldValue: -50, newValue: -25 })
    expect(Number(r.primary.value)).toBeCloseTo(50, 10)
    expect(stat(r, 'Direction')).toBe('Increase')
    expect(r.notes!.length).toBeGreaterThan(0)
  })

  test('crossing below zero exceeds a 100% decrease', () => {
    const r = compute({ oldValue: 80, newValue: -40 })
    expect(Number(r.primary.value)).toBeCloseTo(-150, 10)
    expect(resolveBand(def.scale, r.scaleValue!)!.id).toBe('critical')
  })

  test('the steps reconstruct the primary result', () => {
    const r = compute({ oldValue: 120, newValue: 138 })
    const step = (label: string) =>
      Number((r.steps!.find((s) => 'label' in s && s.label === label) as { value: number }).value)
    expect(step('New − original')).toBeCloseTo(18, 10)
    expect(step('Divided by |original|') * 100).toBeCloseTo(Number(r.primary.value), 10)
    expect(Number(r.primary.value)).toBeCloseTo(15, 10)
  })

  test('scaleValue is the percentage change itself', () => {
    const r = compute({ oldValue: 200, newValue: 220 })
    expect(r.scaleValue).toBeCloseTo(Number(r.primary.value), 12)
    expect(resolveBand(def.scale, r.scaleValue!)!.id).toBe('good')
  })

  test('the end-to-end nudge of the first number field stays valid and moves the result', () => {
    const first = fields.find((f) => f.kind === 'number')!
    const base = Object.fromEntries(fields.map((f) => [f.id, f.default])) as {
      oldValue: number
      newValue: number
    }
    const nudged = { ...base, [first.id]: (first.default as number) * 1.1 }
    expect(Number(compute(nudged).primary.value)).not.toBeCloseTo(
      Number(compute(base).primary.value),
      6,
    )
  })

  test('rejects a zero original value, naming the field', () => {
    let thrown: unknown
    try {
      compute({ oldValue: 0, newValue: 10 })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe('oldValue')
  })

  test('rejects non-numeric input instead of returning NaN', () => {
    for (const [patch, fieldId] of [
      [{ oldValue: Number.NaN }, 'oldValue'],
      [{ newValue: Number.NaN }, 'newValue'],
      [{ newValue: Number.POSITIVE_INFINITY }, 'newValue'],
    ] as const) {
      let thrown: unknown
      try {
        compute({ oldValue: 50, newValue: 75, ...patch })
      } catch (err) {
        thrown = err
      }
      expect(thrown).toBeInstanceOf(CalcError)
      expect((thrown as CalcError).fieldId).toBe(fieldId)
    }
  })
})

import { describe, expect, test } from 'vitest'
import compute from './compute'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'

describe('bmi', () => {
  test('70kg at 175cm is 22.9', () => {
    const r = compute({ units: 'metric', weight: 70, height: 175 })
    expect(Number(r.primary.value)).toBeCloseTo(22.86, 2)
  })

  test('imperial and metric agree for the same body', () => {
    const metric = compute({ units: 'metric', weight: 70, height: 175 })
    const imperial = compute({ units: 'imperial', weight: 154.324, height: 68.8976 })
    expect(Number(imperial.primary.value)).toBeCloseTo(Number(metric.primary.value), 2)
  })

  test('healthy weight range brackets a healthy BMI', () => {
    const r = compute({ units: 'metric', weight: 70, height: 175 })
    const low = Number(r.stats!.find((s) => s.label === 'Healthy range (low)')!.value)
    const high = Number(r.stats!.find((s) => s.label === 'Healthy range (high)')!.value)
    expect(low).toBeLessThan(70)
    expect(high).toBeGreaterThan(70)
    expect(low).toBeCloseTo(56.7, 1)
    expect(high).toBeCloseTo(76.3, 1)
  })

  test('difference from healthy is zero inside the band', () => {
    const r = compute({ units: 'metric', weight: 70, height: 175 })
    expect(Number(r.stats!.find((s) => s.label === 'Difference from healthy')!.value)).toBe(0)
  })

  test('scaleValue is the BMI itself', () => {
    const r = compute({ units: 'metric', weight: 100, height: 175 })
    expect(r.scaleValue).toBeCloseTo(Number(r.primary.value), 6)
  })

  test('rejects non-positive measurements', () => {
    expect(() => compute({ units: 'metric', weight: 0, height: 175 })).toThrow(CalcError)
    expect(() => compute({ units: 'metric', weight: 70, height: 0 })).toThrow(CalcError)
  })

  test('catches cm entered while imperial is selected', () => {
    expect(() => compute({ units: 'imperial', weight: 154, height: 175 })).toThrow(CalcError)
  })

  test('BMI claims no proportion, so it emits no parts', () => {
    const r = compute({ units: 'metric', weight: 70, height: 175 })
    expect(r.parts).toBeUndefined()
  })

  describe('field bounds', () => {
    const bound = (id: string) => {
      const f = fields.find((x) => x.id === id)!
      if (f.kind !== 'number') throw new Error(`${id} is not a number field`)
      return f
    }

    test('defaults sit inside their own min and max', () => {
      for (const id of ['weight', 'height']) {
        const f = bound(id)
        expect(f.default).toBeGreaterThanOrEqual(f.min!)
        expect(f.default).toBeLessThanOrEqual(f.max!)
      }
    })

    test('each unit system gets its own caps', () => {
      // A single pair of caps could not serve both systems: 300 lb is only 136
      // kg, so a metric-shaped cap stopped an imperial user short of their own
      // range, while a cap wide enough for pounds made the metric slider
      // useless. Each unit now carries its own bounds instead.
      const weight = bound('weight').variants!.cases
      const height = bound('height').variants!.cases
      expect(weight.metric!.max).toBe(300)
      expect(weight.imperial!.max).toBe(660)
      expect(height.metric!.max).toBe(250)
      expect(height.imperial!.max).toBe(98)
      // 660 lb is 299 kg, so the two caps describe the same real body.
      expect(Math.abs(660 / 2.20462 - weight.metric!.max!)).toBeLessThan(1)

      // The extremes each variant allows must still compute rather than trip
      // the unit-confusion guard.
      expect(() => compute({ units: 'metric', weight: 300, height: 250 })).not.toThrow()
      expect(() => compute({ units: 'imperial', weight: 660, height: 98 })).not.toThrow()
      // And the top-level pair stays the union of the two, since it remains the
      // absolute accepted range.
      expect(bound('weight').max).toBe(660)
      expect(bound('height').max).toBe(250)
    })

    test('a large imperial user is still inside the caps', () => {
      // 300 lb is 136 kg and 78 in is 198 cm — comfortably reachable.
      const r = compute({ units: 'imperial', weight: 300, height: 78 })
      expect(Number(r.primary.value)).toBeCloseTo(34.66, 1)
    })
  })
})

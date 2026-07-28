import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { CalcError } from '../../../lib/types'
import { resolveBand } from '../../../lib/view'

const male = {
  units: 'metric',
  sex: 'male',
  height: 178,
  neck: 38,
  waist: 92,
  hip: 100,
  weight: 80,
} as const
const female = { ...male, sex: 'female' } as const

const bf = (r: ReturnType<typeof compute>) => Number(r.primary.value)

/**
 * An INDEPENDENT check, not a restatement of the implementation.
 *
 * The Navy method also circulates as a body-density regression fed through the
 * Siri equation, with a completely different set of fitted coefficients that
 * take CENTIMETRES rather than inches:
 *
 *   men   D = 1.0324 − 0.19077·log10(waist − neck)        + 0.15456·log10(height)
 *   women D = 1.29579 − 0.35004·log10(waist + hip − neck) + 0.22100·log10(height)
 *   %BF = 495/D − 450
 *
 * Different constants, different units, different algebraic shape — so if both
 * land on the same percentage, the inch-native implementation is right. They are
 * separate fits of the same data, so they agree to within a few tenths of a
 * point rather than exactly.
 *
 * (This is also the trap in the two forms: applying the cm coefficients above to
 * inches produces ~15% for the default male body instead of ~21.7%.)
 */
function viaDensityCm(
  sex: 'male' | 'female',
  heightCm: number,
  neckCm: number,
  waistCm: number,
  hipCm: number,
): number {
  const density =
    sex === 'female'
      ? 1.29579 - 0.35004 * Math.log10(waistCm + hipCm - neckCm) + 0.221 * Math.log10(heightCm)
      : 1.0324 - 0.19077 * Math.log10(waistCm - neckCm) + 0.15456 * Math.log10(heightCm)
  return 495 / density - 450
}

describe('body fat (US Navy)', () => {
  test('178cm, 38cm neck, 92cm waist male reads 21.7%', () => {
    expect(bf(compute(male))).toBeCloseTo(21.68, 2)
  })

  test('the same body under the female equation reads 32.3%', () => {
    expect(bf(compute(female))).toBeCloseTo(32.27, 2)
  })

  test.each([
    ['male', male],
    ['female', female],
    ['male, tall', { ...male, height: 195.8 }],
    ['female, larger waist', { ...female, waist: 100, hip: 105, height: 170, neck: 36 }],
  ])('agrees with the centimetre density regression for %s', (_label, v) => {
    const independent = viaDensityCm(v.sex, v.height, v.neck, v.waist, v.hip)
    expect(bf(compute(v))).toBeCloseTo(independent, 0)
    // Tighter than toBeCloseTo(x, 0) alone: two separate fits, under half a point.
    expect(Math.abs(bf(compute(v)) - independent)).toBeLessThan(0.5)
  })

  test('metric and imperial describe the same body', () => {
    const metric = compute(male)
    const imperial = compute({
      units: 'imperial',
      sex: 'male',
      height: 178 / 2.54,
      neck: 38 / 2.54,
      waist: 92 / 2.54,
      hip: 100 / 2.54,
      weight: 80 * 2.20462,
    })
    expect(bf(imperial)).toBeCloseTo(bf(metric), 10)
  })

  test('the hip measurement moves the female result and is ignored for men', () => {
    expect(bf(compute({ ...male, hip: 130 }))).toBeCloseTo(bf(compute(male)), 10)
    expect(bf(compute({ ...female, hip: 130 }))).toBeGreaterThan(bf(compute(female)) + 5)
  })

  test('a bigger waist raises body fat, a taller frame lowers it', () => {
    expect(bf(compute({ ...male, waist: 102 }))).toBeGreaterThan(bf(compute(male)))
    // The height field is nudged 1.1x by the e2e suite: still valid, still moves.
    const nudged = compute({ ...male, height: 178 * 1.1 })
    expect(bf(nudged)).toBeLessThan(bf(compute(male)) - 1)
  })

  test('lean mass share is the complement of body fat', () => {
    const r = compute(male)
    const lean = Number(r.stats!.find((s) => s.label === 'Lean mass share')!.value)
    expect(lean + bf(r)).toBeCloseTo(100, 10)
  })

  test('scaleValue is the percentage itself and lands in the average band', () => {
    const r = compute(male)
    expect(r.scaleValue).toBeCloseTo(bf(r), 10)
    expect(resolveBand(def.scale!, r.scaleValue!)!.id).toBe('neutral')
  })

  test('a lean athlete lands in the athletic band', () => {
    const r = compute({ ...male, waist: 79, neck: 39 })
    expect(bf(r)).toBeLessThan(14)
    expect(resolveBand(def.scale!, r.scaleValue!)!.id).toBe('excellent')
  })

  test.each([
    ['zero height', { height: 0 }, 'height'],
    ['zero neck', { neck: 0 }, 'neck'],
    ['zero waist', { waist: 0 }, 'waist'],
    ['a waist no bigger than the neck', { neck: 92, waist: 92 }, 'waist'],
    ['cm entered while imperial is selected', { units: 'imperial' as const }, 'height'],
    ['inches entered while metric is selected', { height: 70 }, 'height'],
    ['measurements implying zero body fat', { waist: 60, neck: 45 }, 'waist'],
  ])('rejects %s', (_label, patch, fieldId) => {
    let thrown: unknown
    try {
      compute({ ...male, ...patch })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
  })

  describe('fat and lean mass parts', () => {
    // Every branch that could change the split: both equations, both unit
    // systems, and a body at each end of the plausible range.
    test.each([
      ['male defaults', male],
      ['female defaults', female],
      ['imperial', { ...male, units: 'imperial' as const, height: 70, neck: 15, waist: 36, weight: 176 }],
      ['female imperial', { ...female, units: 'imperial' as const, height: 65, neck: 13, waist: 30, hip: 40, weight: 140 }],
      ['very lean', { ...male, waist: 79, neck: 39, weight: 68 }],
      ['heavy', { ...male, waist: 130, weight: 150 }],
    ])('sum to the body weight and stay non-negative for %s', (_label, v) => {
      const r = compute(v)
      expect(r.partsTotal).toBeDefined()
      expect(r.partsTotal!.label).toBe('Body weight')
      expect(Number(r.partsTotal!.value)).toBe(v.weight)

      const sum = r.parts!.reduce((acc, p) => acc + p.value, 0)
      expect(sum).toBeCloseTo(v.weight, 4)
      for (const part of r.parts!) {
        expect(part.value).toBeGreaterThanOrEqual(0)
        expect(Number.isFinite(part.value)).toBe(true)
      }
    })

    test('fat mass is the percentage of body weight, lean mass the remainder', () => {
      const r = compute(male)
      const fat = r.parts!.find((p) => p.label === 'Fat mass')!.value
      const lean = r.parts!.find((p) => p.label === 'Lean mass')!.value
      expect(fat).toBeCloseTo((80 * bf(r)) / 100, 10)
      expect(lean).toBeCloseTo(80 - fat, 10)
      // The default male body is ~21.7%, so roughly 17.3 kg of 80.
      expect(fat).toBeCloseTo(17.34, 1)
    })

    test('weight scales the masses but never the percentage', () => {
      const light = compute({ ...male, weight: 60 })
      const heavy = compute({ ...male, weight: 120 })
      expect(bf(light)).toBeCloseTo(bf(heavy), 10)
      expect(heavy.parts![0]!.value).toBeCloseTo(light.parts![0]!.value * 2, 10)
    })

    test('a missing weight is rejected against its own field', () => {
      let thrown: unknown
      try {
        compute({ ...male, weight: 0 })
      } catch (err) {
        thrown = err
      }
      expect(thrown).toBeInstanceOf(CalcError)
      expect((thrown as CalcError).fieldId).toBe('weight')
    })
  })

  test('the female equation demands a hip measurement, the male one does not', () => {
    expect(() => compute({ ...female, hip: 0 })).toThrow(CalcError)
    expect(() => compute({ ...male, hip: 0 })).not.toThrow()
  })
})

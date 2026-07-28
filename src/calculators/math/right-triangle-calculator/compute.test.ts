import { describe, expect, test } from 'vitest'
import compute from './compute'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'

const val = (r: ReturnType<typeof compute>) => Number(r.primary.value)
const stat = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)

/** Heron's formula — an independent route to the area from the three sides alone. */
const heron = (a: number, b: number, c: number) => {
  const s = (a + b + c) / 2
  return Math.sqrt(s * (s - a) * (s - b) * (s - c))
}

describe('right triangle calculator', () => {
  test('the 3-4-5 triangle comes out exactly, with area cross-checked by Heron', () => {
    const r = compute({ sideA: 3, sideB: 4 })
    expect(val(r)).toBeCloseTo(5, 12)
    expect(stat(r, 'Perimeter')).toBeCloseTo(12, 12)
    expect(stat(r, 'Area')).toBeCloseTo(6, 12)
    // Independent method: Heron's formula on the three sides.
    expect(stat(r, 'Area')).toBeCloseTo(heron(3, 4, 5), 10)
    // 3-4-5 is the smallest Pythagorean triple, so the sides square exactly.
    expect(3 ** 2 + 4 ** 2).toBe(5 ** 2)
  })

  test('angles are consistent with the sides via sine and cosine, and sum to 90', () => {
    const r = compute({ sideA: 3, sideB: 4 })
    const A = stat(r, 'Angle A (opposite leg a)')
    const B = stat(r, 'Angle B (opposite leg b)')
    const c = val(r)

    expect(A + B).toBeCloseTo(90, 10)
    // Independent check: recover each leg from the hypotenuse and the reported angle.
    expect(c * Math.sin((A * Math.PI) / 180)).toBeCloseTo(3, 10)
    expect(c * Math.cos((A * Math.PI) / 180)).toBeCloseTo(4, 10)
    expect(c * Math.sin((B * Math.PI) / 180)).toBeCloseTo(4, 10)
    // 3-4-5 angles are the well-known 36.87° / 53.13° pair.
    expect(A).toBeCloseTo(36.8698976458, 8)
    expect(B).toBeCloseTo(53.1301023542, 8)
  })

  test('equal legs give a 45-45-90 triangle with hypotenuse a√2', () => {
    const r = compute({ sideA: 1, sideB: 1 })
    expect(val(r)).toBeCloseTo(Math.SQRT2, 12)
    expect(stat(r, 'Angle A (opposite leg a)')).toBeCloseTo(45, 10)
    expect(stat(r, 'Angle B (opposite leg b)')).toBeCloseTo(45, 10)
    expect(stat(r, 'Area')).toBeCloseTo(0.5, 12)
  })

  test('scaling both legs scales lengths linearly, area quadratically, angles not at all', () => {
    const base = compute({ sideA: 3, sideB: 7 })
    const big = compute({ sideA: 30, sideB: 70 })
    expect(val(big)).toBeCloseTo(val(base) * 10, 8)
    expect(stat(big, 'Perimeter')).toBeCloseTo(stat(base, 'Perimeter') * 10, 8)
    expect(stat(big, 'Area')).toBeCloseTo(stat(base, 'Area') * 100, 8)
    expect(stat(big, 'Angle A (opposite leg a)')).toBeCloseTo(
      stat(base, 'Angle A (opposite leg a)'),
      10,
    )
  })

  test('swapping the legs keeps c, area and perimeter but exchanges the angles', () => {
    const r = compute({ sideA: 5, sideB: 12 })
    const swapped = compute({ sideA: 12, sideB: 5 })
    expect(val(swapped)).toBeCloseTo(val(r), 12)
    expect(val(r)).toBeCloseTo(13, 12) // 5-12-13 triple
    expect(stat(swapped, 'Area')).toBeCloseTo(stat(r, 'Area'), 12)
    expect(stat(swapped, 'Angle A (opposite leg a)')).toBeCloseTo(
      stat(r, 'Angle B (opposite leg b)'),
      10,
    )
  })

  test('altitude and inradius satisfy their standard identities', () => {
    const r = compute({ sideA: 8, sideB: 15 }) // 8-15-17 triple
    expect(val(r)).toBeCloseTo(17, 12)
    // Altitude h to the hypotenuse: area = c × h ÷ 2, an independent relation.
    const h = stat(r, 'Altitude to the hypotenuse')
    expect((val(r) * h) / 2).toBeCloseTo(stat(r, 'Area'), 10)
    // Inradius r: area = r × semiperimeter, true for every triangle.
    const inr = stat(r, 'Inradius')
    expect(inr * (stat(r, 'Perimeter') / 2)).toBeCloseTo(stat(r, 'Area'), 10)
  })

  test('very lopsided and very large legs stay finite and obey the triangle inequality', () => {
    const thin = compute({ sideA: 0.000001, sideB: 1000 })
    expect(val(thin)).toBeCloseTo(1000, 6)
    expect(stat(thin, 'Angle A (opposite leg a)')).toBeGreaterThan(0)
    expect(stat(thin, 'Angle A (opposite leg a)')).toBeLessThan(0.001)

    const huge = compute({ sideA: 1e9, sideB: 1e9 })
    expect(Number.isFinite(val(huge))).toBe(true)
    expect(val(huge)).toBeCloseTo(1e9 * Math.SQRT2, 0)
    // c must be shorter than a + b and longer than either leg.
    expect(val(huge)).toBeLessThan(2e9)
    expect(val(huge)).toBeGreaterThan(1e9)
  })

  test('rejects zero, negative and non-finite legs with a CalcError naming the field', () => {
    expect(() => compute({ sideA: 0, sideB: 4 })).toThrow(CalcError)
    expect(() => compute({ sideA: 3, sideB: 0 })).toThrow(CalcError)
    expect(() => compute({ sideA: -3, sideB: 4 })).toThrow(CalcError)
    expect(() => compute({ sideA: 3, sideB: NaN })).toThrow(CalcError)
    expect(() => compute({ sideA: Infinity, sideB: 4 })).toThrow(CalcError)

    const grab = (a: number, b: number) => {
      try {
        compute({ sideA: a, sideB: b })
      } catch (e) {
        return (e as CalcError).fieldId
      }
      return undefined
    }
    expect(grab(0, 4)).toBe('sideA')
    expect(grab(3, -1)).toBe('sideB')
    expect(grab(3, NaN)).toBe('sideB')
  })

  test('the first number field nudged to 1.1x its default stays valid and moves the answer', () => {
    const defaults = Object.fromEntries(fields.map((f) => [f.id, f.default])) as Parameters<
      typeof compute
    >[0]
    const firstNumber = fields.find((f) => f.kind === 'number')!
    expect(firstNumber.id).toBe('sideA')

    const base = compute(defaults)
    const nudged = compute({ ...defaults, sideA: firstNumber.default * 1.1 })
    expect(val(base)).toBeCloseTo(5, 12)
    expect(val(nudged)).toBeCloseTo(Math.hypot(3.3, 4), 12)
    expect(val(nudged)).not.toBeCloseTo(val(base), 6)
    // 1.1 × default is inside the declared bounds.
    expect(firstNumber.default * 1.1).toBeGreaterThanOrEqual(firstNumber.min!)
    expect(firstNumber.default * 1.1).toBeLessThanOrEqual(firstNumber.max!)
  })
})

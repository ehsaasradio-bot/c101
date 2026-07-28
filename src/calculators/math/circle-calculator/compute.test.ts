import { describe, expect, test } from 'vitest'
import compute from './compute'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'

const val = (r: ReturnType<typeof compute>) => Number(r.primary.value)
const stat = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)

/**
 * Independent checks that never touch the πr² / 2πr closed forms:
 * a regular n-gon inscribed in a circle of radius r has
 *   area      = (n/2) r² sin(2π/n)
 *   perimeter = 2 n r sin(π/n)
 * and the circumscribed n-gon has area = n r² tan(π/n). The true circle is
 * strictly bracketed between them, and both bounds converge as n grows.
 */
const inscribedArea = (r: number, n: number) => (n / 2) * r * r * Math.sin((2 * Math.PI) / n)
const circumscribedArea = (r: number, n: number) => n * r * r * Math.tan(Math.PI / n)
const inscribedPerimeter = (r: number, n: number) => 2 * n * r * Math.sin(Math.PI / n)

describe('circle calculator', () => {
  test('radius 10 gives an area bracketed by inscribed and circumscribed polygons', () => {
    const r = compute({ value: 10, knownAs: 'radius' })

    const lower = inscribedArea(10, 200_000)
    const upper = circumscribedArea(10, 200_000)
    expect(lower).toBeLessThan(val(r))
    expect(val(r)).toBeLessThan(upper)
    // The bracket is tight enough to pin the answer to several decimals.
    expect(val(r)).toBeCloseTo(lower, 4)
    expect(val(r)).toBeCloseTo(314.159265, 5)

    // Circumference confirmed the same way, by a polygon perimeter.
    expect(stat(r, 'Circumference')).toBeGreaterThan(inscribedPerimeter(10, 200_000))
    expect(stat(r, 'Circumference')).toBeCloseTo(inscribedPerimeter(10, 200_000), 5)
    expect(stat(r, 'Diameter')).toBe(20)
    expect(stat(r, 'Radius')).toBe(10)
  })

  test('all four modes describe the identical circle (unit equivalence)', () => {
    const fromRadius = compute({ value: 10, knownAs: 'radius' })
    const fromDiameter = compute({ value: stat(fromRadius, 'Diameter'), knownAs: 'diameter' })
    const fromCircumference = compute({
      value: stat(fromRadius, 'Circumference'),
      knownAs: 'circumference',
    })
    const fromArea = compute({ value: val(fromRadius), knownAs: 'area' })

    for (const r of [fromDiameter, fromCircumference, fromArea]) {
      expect(stat(r, 'Radius')).toBeCloseTo(10, 9)
      expect(stat(r, 'Diameter')).toBeCloseTo(20, 9)
      expect(stat(r, 'Circumference')).toBeCloseTo(stat(fromRadius, 'Circumference'), 9)
      expect(val(r)).toBeCloseTo(val(fromRadius), 9)
    }
  })

  test('scaling laws hold: doubling the radius quadruples area and doubles circumference', () => {
    const a = compute({ value: 3, knownAs: 'radius' })
    const b = compute({ value: 6, knownAs: 'radius' })
    expect(val(b) / val(a)).toBeCloseTo(4, 9)
    expect(stat(b, 'Circumference') / stat(a, 'Circumference')).toBeCloseTo(2, 9)

    // Ratio identities that hold for every circle, checked at an awkward size.
    const c = compute({ value: 0.037, knownAs: 'radius' })
    expect(stat(c, 'Circumference') / stat(c, 'Diameter')).toBeCloseTo(Math.PI, 12)
    expect((4 * val(c)) / (stat(c, 'Diameter') * stat(c, 'Circumference'))).toBeCloseTo(1, 12)
  })

  test('a tiny boundary-legal input still produces finite, consistent numbers', () => {
    const min = fields[0].min
    const r = compute({ value: min, knownAs: 'radius' })
    expect(Number.isFinite(val(r))).toBe(true)
    expect(val(r)).toBeGreaterThan(0)
    expect(stat(r, 'Radius')).toBe(min)
    // Round-tripping through area recovers the same radius.
    const back = compute({ value: val(r), knownAs: 'area' })
    expect(stat(back, 'Radius')).toBeCloseTo(min, 12)
  })

  test('rejects non-positive and non-finite measurements with the right fieldId', () => {
    for (const bad of [0, -1, -0.0001]) {
      expect(() => compute({ value: bad, knownAs: 'radius' })).toThrow(CalcError)
      try {
        compute({ value: bad, knownAs: 'area' })
      } catch (e) {
        expect((e as CalcError).fieldId).toBe('value')
      }
    }
    expect(() => compute({ value: NaN, knownAs: 'radius' })).toThrow(CalcError)
    expect(() => compute({ value: Infinity, knownAs: 'radius' })).toThrow(CalcError)
  })

  test('rejects an unknown measurement type', () => {
    expect(() => compute({ value: 10, knownAs: 'perimeter' })).toThrow(CalcError)
    try {
      compute({ value: 10, knownAs: 'perimeter' })
    } catch (e) {
      expect((e as CalcError).fieldId).toBe('knownAs')
    }
  })

  test('the first number field nudged to 1.1x its default stays valid and moves the answer', () => {
    const defaults = Object.fromEntries(fields.map((f) => [f.id, f.default])) as Parameters<
      typeof compute
    >[0]
    const firstNumber = fields.find((f) => f.kind === 'number')!
    expect(firstNumber.id).toBe('value')

    const base = compute(defaults)
    const nudged = compute({ ...defaults, value: firstNumber.default * 1.1 })
    expect(val(nudged)).not.toBeCloseTo(val(base), 6)
    // Radius 11 rather than 10 ⇒ area up by exactly 1.21x.
    expect(val(nudged) / val(base)).toBeCloseTo(1.21, 9)
  })
})

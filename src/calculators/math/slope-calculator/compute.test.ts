import { describe, expect, test } from 'vitest'
import compute from './compute'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'

type Result = ReturnType<typeof compute>

const primary = (r: Result) => r.primary.value
const stat = (r: Result, label: string) => r.stats!.find((s) => s.label === label)!.value
const statNum = (r: Result, label: string) => Number(stat(r, label))
const statText = (r: Result, label: string) => String(stat(r, label))

const DEG = Math.PI / 180

/**
 * An independent route to the slope that never divides rise by run: fit the
 * line by ordinary least squares through the two points. For two points the
 * regression line IS the line, so Sxy / Sxx must reproduce m exactly.
 */
function slopeByLeastSquares(x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const sxy = (x1 - mx) * (y1 - my) + (x2 - mx) * (y2 - my)
  const sxx = (x1 - mx) ** 2 + (x2 - mx) ** 2
  return sxy / sxx
}

describe('slope calculator', () => {
  test('the defaults are a 6-8-10 triangle: slope 0.75, distance exactly 10', () => {
    const r = compute({ x1: 4, y1: 5, x2: 12, y2: 11 })

    // rise 6, run 8 → m = 6/8 = 3/4. Confirmed a second way by least squares,
    // which never forms the quotient rise ÷ run.
    expect(Number(primary(r))).toBe(0.75)
    expect(Number(primary(r))).toBeCloseTo(slopeByLeastSquares(4, 5, 12, 11), 12)

    // 6-8-10 is the 3-4-5 triple doubled, so the distance is an exact integer.
    expect(statNum(r, 'Distance between the points')).toBe(10)
    expect(6 ** 2 + 8 ** 2).toBe(10 ** 2)

    // b = y₁ − m·x₁ = 5 − 0.75×4 = 2. Confirmed by evaluating the equation at
    // both x coordinates and recovering the original y values.
    const m = Number(primary(r))
    const b = statNum(r, 'Y-intercept b')
    expect(b).toBe(2)
    expect(m * 4 + b).toBeCloseTo(5, 12)
    expect(m * 12 + b).toBeCloseTo(11, 12)
    expect(statText(r, 'Line equation')).toBe('y = 0.75x + 2')

    expect(statText(r, 'Midpoint')).toBe('(8, 8)')
    expect(statNum(r, 'Grade')).toBe(75)
    expect(statText(r, 'Rise : run ratio')).toBe('3 : 4')
    expect(statNum(r, 'Angle of inclination')).toBeCloseTo(36.86989764584402, 10)
    // atan(3/4) is the smaller acute angle of a 3-4-5 triangle. Confirmed by
    // rebuilding the rise and run from the reported angle and distance.
    const angle = statNum(r, 'Angle of inclination')
    expect(10 * Math.sin(angle * DEG)).toBeCloseTo(6, 10)
    expect(10 * Math.cos(angle * DEG)).toBeCloseTo(8, 10)
  })

  test('a 3-4-5 triangle gives a distance of exactly 5', () => {
    const r = compute({ x1: 1, y1: 2, x2: 4, y2: 6 })
    expect(statNum(r, 'Distance between the points')).toBe(5)
    expect(Number(primary(r))).toBeCloseTo(4 / 3, 12)
    expect(statText(r, 'Rise : run ratio')).toBe('4 : 3')
    // The midpoint is equidistant from both ends — half the distance each.
    expect(statText(r, 'Midpoint')).toBe('(2.5, 4)')
    expect(Math.hypot(2.5 - 1, 4 - 2)).toBeCloseTo(2.5, 12)
    expect(Math.hypot(4 - 2.5, 6 - 4)).toBeCloseTo(2.5, 12)
  })

  test('slope 1 is exactly 45 degrees, and slope -1 is exactly -45', () => {
    const up = compute({ x1: 0, y1: 0, x2: 1, y2: 1 })
    expect(Number(primary(up))).toBe(1)
    expect(statNum(up, 'Angle of inclination')).toBeCloseTo(45, 12)
    expect(Math.tan(45 * DEG)).toBeCloseTo(1, 12)
    expect(statText(up, 'Line equation')).toBe('y = x')
    expect(statNum(up, 'Y-intercept b')).toBe(0)
    expect(statNum(up, 'Distance between the points')).toBeCloseTo(Math.SQRT2, 12)
    expect(statText(up, 'Rise : run ratio')).toBe('1 : 1')
    expect(statNum(up, 'Grade')).toBe(100)

    const down = compute({ x1: 0, y1: 0, x2: 1, y2: -1 })
    expect(Number(primary(down))).toBe(-1)
    expect(statNum(down, 'Angle of inclination')).toBeCloseTo(-45, 12)
    expect(statText(down, 'Line equation')).toBe('y = -x')
  })

  test('tan(angle) reproduces the slope at awkward, non-special values', () => {
    for (const [x1, y1, x2, y2] of [
      [-7.5, 3, 2.5, -11],
      [0.5, 0.5, 100, 3],
      [-1000, -1000, 1000, 1000],
    ] as const) {
      const r = compute({ x1, y1, x2, y2 })
      const m = Number(primary(r))
      const angle = statNum(r, 'Angle of inclination')
      expect(Math.tan(angle * DEG)).toBeCloseTo(m, 9)
      expect(m).toBeCloseTo(slopeByLeastSquares(x1, y1, x2, y2), 9)
      // Grade is just the slope in percentage points.
      expect(statNum(r, 'Grade')).toBeCloseTo(m * 100, 9)
      // The midpoint always sits on the line.
      const b = statNum(r, 'Y-intercept b')
      expect(m * ((x1 + x2) / 2) + b).toBeCloseTo((y1 + y2) / 2, 6)
    }
  })

  // ── The vertical line: an answer, not an error ──────────────────────────
  test('a vertical line has UNDEFINED slope, reported as a raw-string answer', () => {
    const r = compute({ x1: 3, y1: 1, x2: 3, y2: 7 })

    expect(typeof r.primary.value).toBe('string')
    expect(r.primary.format).toEqual({ style: 'raw' })
    expect(r.primary.value).toBe('Undefined — the line is vertical (x = 3)')
    // Never Infinity, never NaN, never a throw.
    expect(Number.isFinite(Number(r.primary.value))).toBe(false)
    expect(String(r.primary.value)).not.toContain('Infinity')
    expect(String(r.primary.value)).not.toContain('NaN')

    // The equation is x = k, not y = mx + b.
    expect(statText(r, 'Line equation')).toBe('x = 3')
    expect(statText(r, 'Y-intercept b')).toBe('None — a vertical line never crosses the y-axis')
    expect(statText(r, 'Grade')).toContain('Undefined')
    expect(statText(r, 'Rise : run ratio')).toContain('Undefined')

    // Everything that does not need the slope is still a real number.
    expect(statNum(r, 'Angle of inclination')).toBe(90)
    expect(statNum(r, 'Distance between the points')).toBe(6)
    expect(statText(r, 'Midpoint')).toBe('(3, 4)')

    // Negative and fractional vertical lines report the same way.
    expect(compute({ x1: -2.5, y1: 4, x2: -2.5, y2: -4 }).primary.value).toBe(
      'Undefined — the line is vertical (x = -2.5)',
    )
    // The y-axis itself is the one vertical line that does meet the y-axis.
    expect(statText(compute({ x1: 0, y1: -1, x2: 0, y2: 1 }), 'Y-intercept b')).toContain(
      'y-axis itself',
    )
  })

  test('a horizontal line is slope 0 — a real number, not the vertical case', () => {
    const r = compute({ x1: 2, y1: 5, x2: 9, y2: 5 })

    expect(typeof r.primary.value).toBe('number')
    expect(Number(primary(r))).toBe(0)
    expect(String(r.primary.value)).not.toContain('Undefined')
    expect(statText(r, 'Line equation')).toBe('y = 5') // no 0x term
    expect(statNum(r, 'Y-intercept b')).toBe(5)
    expect(statNum(r, 'Angle of inclination')).toBe(0)
    expect(statNum(r, 'Distance between the points')).toBe(7)
    expect(statText(r, 'Midpoint')).toBe('(5.5, 5)')
    expect(statNum(r, 'Grade')).toBe(0)
    expect(statText(r, 'Rise : run ratio')).toBe('0 : 1')

    // The two degenerate cases are genuinely different shapes of result.
    const vertical = compute({ x1: 5, y1: 2, x2: 5, y2: 9 })
    expect(typeof vertical.primary.value).not.toBe(typeof r.primary.value)
  })

  test('two copies of the same point are rejected — no line is determined', () => {
    let thrown: unknown
    try {
      compute({ x1: 2, y1: 3, x2: 2, y2: 3 })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe('x2')
    expect((thrown as CalcError).message).toMatch(/same/i)

    // Including at the origin and at negative coordinates.
    expect(() => compute({ x1: 0, y1: 0, x2: 0, y2: 0 })).toThrow(CalcError)
    expect(() => compute({ x1: -7.5, y1: -7.5, x2: -7.5, y2: -7.5 })).toThrow(CalcError)
    // But sharing only one coordinate is fine: those are the vertical and
    // horizontal lines, both of which answer.
    expect(() => compute({ x1: 2, y1: 3, x2: 2, y2: 4 })).not.toThrow()
    expect(() => compute({ x1: 2, y1: 3, x2: 3, y2: 3 })).not.toThrow()
  })

  test('non-finite input is refused before anything else, naming the field', () => {
    const grab = (v: Parameters<typeof compute>[0]) => {
      try {
        compute(v)
      } catch (e) {
        return (e as CalcError).fieldId
      }
      return undefined
    }
    const base = { x1: 4, y1: 5, x2: 12, y2: 11 }
    expect(grab({ ...base, x1: Number.NaN })).toBe('x1')
    expect(grab({ ...base, y1: Number.NaN })).toBe('y1')
    expect(grab({ ...base, x2: Number.POSITIVE_INFINITY })).toBe('x2')
    expect(grab({ ...base, y2: Number.NEGATIVE_INFINITY })).toBe('y2')
    // NaN === NaN is false, so an unguarded NaN would slip past the vertical
    // branch and produce a NaN slope rather than an error.
    expect(() => compute({ x1: Number.NaN, y1: 5, x2: Number.NaN, y2: 11 })).toThrow(CalcError)
  })

  test('the slope does not depend on which point is entered first', () => {
    const forward = compute({ x1: -3, y1: 2, x2: 5, y2: -6 })
    const backward = compute({ x1: 5, y1: -6, x2: -3, y2: 2 })
    expect(Number(primary(backward))).toBeCloseTo(Number(primary(forward)), 12)
    expect(Number(primary(forward))).toBe(-1)
    expect(statNum(backward, 'Y-intercept b')).toBeCloseTo(statNum(forward, 'Y-intercept b'), 12)
    expect(statNum(backward, 'Distance between the points')).toBeCloseTo(
      statNum(forward, 'Distance between the points'),
      12,
    )
    expect(statText(backward, 'Midpoint')).toBe(statText(forward, 'Midpoint'))
    // The ratio is oriented so the run is positive, so it reads the same too.
    expect(statText(backward, 'Rise : run ratio')).toBe(statText(forward, 'Rise : run ratio'))
  })

  test('grade and ratio match the real-world figures builders quote', () => {
    // ADA / Part M wheelchair ramp: 1 unit of rise per 12 of run.
    const ramp = compute({ x1: 0, y1: 0, x2: 12, y2: 1 })
    expect(statText(ramp, 'Rise : run ratio')).toBe('1 : 12')
    expect(statNum(ramp, 'Grade')).toBeCloseTo(100 / 12, 10)
    expect(statNum(ramp, 'Grade')).toBeCloseTo(8.3333333333, 8)
    expect(statNum(ramp, 'Angle of inclination')).toBeCloseTo(4.7636416907, 8)

    // A 4-in-12 roof pitch reduces to 1 : 3, a slope of one third.
    const roof = compute({ x1: 0, y1: 0, x2: 12, y2: 4 })
    expect(Number(primary(roof))).toBeCloseTo(1 / 3, 12)
    expect(statText(roof, 'Rise : run ratio')).toBe('1 : 3')

    // A 6% descending road grade.
    const road = compute({ x1: 0, y1: 100, x2: 100, y2: 94 })
    expect(statNum(road, 'Grade')).toBeCloseTo(-6, 10)
    expect(statText(road, 'Rise : run ratio')).toBe('-3 : 50')
    expect(statNum(road, 'Angle of inclination')).toBeLessThan(0)

    // A half-step coordinate cannot reduce as integers, so it falls back to the
    // "one rise per k of run" form.
    const halfStep = compute({ x1: 0, y1: 0, x2: 3, y2: 1.5 })
    expect(statText(halfStep, 'Rise : run ratio')).toBe('1 : 2')
  })

  test('negative coordinates work throughout and stay on the step grid', () => {
    const r = compute({ x1: -2, y1: 6, x2: 2, y2: -6 })
    expect(Number(primary(r))).toBe(-3)
    expect(statNum(r, 'Y-intercept b')).toBe(0)
    expect(statText(r, 'Line equation')).toBe('y = -3x')
    expect(statText(r, 'Midpoint')).toBe('(0, 0)')
    expect(statText(r, 'Rise : run ratio')).toBe('-3 : 1')
    expect(statNum(r, 'Distance between the points')).toBeCloseTo(Math.hypot(4, 12), 12)

    // A negative coordinate still lands on min + n × step, which is what the
    // range input snaps to.
    const grid = (v: number, min: number, step: number) => (v - min) / step
    expect(grid(-2, -1000, 0.5) % 1).toBe(0)
    expect(grid(-3.5, -1000, 0.5) % 1).toBe(0)
  })

  test('both declared bounds compute for every field, at both ends', () => {
    const base = { x1: 4, y1: 5, x2: 12, y2: 11 }
    for (const field of fields) {
      for (const bound of [field.min, field.max]) {
        const r = compute({ ...base, [field.id]: bound } as Parameters<typeof compute>[0])
        expect(r.primary).toBeDefined()
        expect(Number.isFinite(Number(r.primary.value))).toBe(true)
      }
    }
  })

  test('every default lands on min + n × step, and inside its own bounds', () => {
    for (const field of fields) {
      const n = (field.default - field.min) / field.step
      expect(Math.abs(n - Math.round(n)), field.id).toBeLessThan(1e-9)
      expect(field.default).toBeGreaterThanOrEqual(field.min)
      expect(field.default).toBeLessThanOrEqual(field.max)
      // Bounds are signed, so a negative coordinate is reachable by the slider.
      expect(field.min).toBeLessThan(0)
    }
  })

  test('the stats count is fixed, and nothing drawable is claimed', () => {
    const cases: Parameters<typeof compute>[0][] = [
      { x1: 4, y1: 5, x2: 12, y2: 11 }, // defaults
      { x1: 3, y1: 1, x2: 3, y2: 7 }, // vertical
      { x1: 2, y1: 5, x2: 9, y2: 5 }, // horizontal
      { x1: -1000, y1: -1000, x2: 1000, y2: 1000 }, // extremes
    ]
    for (const c of cases) {
      const r = compute(c)
      expect(r.stats).toHaveLength(7)
      // No proportion to split and no ordered axis to plot, so neither is
      // offered — and therefore neither can appear off-default either.
      expect(r.parts).toBeUndefined()
      expect(r.series).toBeUndefined()
      expect(r.scaleValue).toBeUndefined()
      expect(r.notes!.length).toBeGreaterThan(0)
    }
  })

  test('the first number field nudged to 1.1x its default moves the slope', () => {
    const defaults = Object.fromEntries(fields.map((f) => [f.id, f.default])) as Parameters<
      typeof compute
    >[0]
    const firstNumber = fields.find((f) => f.kind === 'number')!
    expect(firstNumber.id).toBe('x1')
    expect(firstNumber.default).not.toBe(0) // 1.1 × 0 would not move at all

    const nudgedValue = firstNumber.default * 1.1
    expect(nudgedValue).toBeGreaterThanOrEqual(firstNumber.min)
    expect(nudgedValue).toBeLessThanOrEqual(firstNumber.max)

    const base = compute(defaults)
    const nudged = compute({ ...defaults, x1: nudgedValue })
    expect(Number(primary(base))).toBe(0.75)
    // x₁ 4 → 4.4 shortens the run from 8 to 7.6 while the rise stays 6.
    expect(Number(primary(nudged))).toBeCloseTo(6 / 7.6, 12)
    expect(Number(primary(nudged))).not.toBeCloseTo(Number(primary(base)), 6)
    expect(Number.isFinite(Number(primary(nudged)))).toBe(true)
  })
})

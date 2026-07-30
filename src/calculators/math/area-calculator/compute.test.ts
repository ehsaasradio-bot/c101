import { describe, expect, test } from 'vitest'
import compute from './compute'
import { fields } from './fields'
import def from './index'
import { CalcError } from '../../../lib/types'
import { defaultValues, toResultView } from '../../../lib/view'

type Input = Parameters<typeof compute>[0]
type Result = ReturnType<typeof compute>

/** Deliberately not `as const`: pinned literals make every override a type error. */
const base: Input = { shape: 'rectangle', lengthUnit: 'foot', a: 16, b: 12, h: 8 }

const val = (r: Result) => Number(r.primary.value)
const stat = (r: Result, label: string) => Number(r.stats!.find((s) => s.label === label)!.value)
const stepLabels = (r: Result) => (r.steps ?? []).flatMap((s) => ('rule' in s ? [] : [s.label]))

/**
 * Independent checks that never touch the formulas under test.
 *
 * `shoelace` is the surveyor's formula for the area of any simple polygon; run
 * over a fine parametrisation of a circle or an ellipse it converges on the true
 * area from below without ever mentioning π·r² or π·a·b. `heron` gives a
 * triangle's area from its three SIDES, so it cannot share an error with
 * ½ × base × height.
 */
const shoelace = (points: ReadonlyArray<readonly [number, number]>): number => {
  let sum = 0
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i]!
    const [x2, y2] = points[(i + 1) % points.length]!
    sum += x1 * y2 - x2 * y1
  }
  return Math.abs(sum) / 2
}
const ellipsePolygon = (a: number, b: number, n: number) =>
  Array.from({ length: n }, (_, i): readonly [number, number] => {
    const t = (2 * Math.PI * i) / n
    return [a * Math.cos(t), b * Math.sin(t)]
  })
const heron = (x: number, y: number, z: number): number => {
  const s = (x + y + z) / 2
  return Math.sqrt(s * (s - x) * (s - y) * (s - z))
}

describe('area calculator', () => {
  test('the defaults are a 16 ft by 12 ft room: 192 sq ft, cross-checked three ways', () => {
    const r = compute(base)

    // 1. Straight from the rectangle formula.
    expect(val(r)).toBeCloseTo(16 * 12, 12)
    expect(val(r)).toBe(192)
    expect(r.primary.format).toMatchObject({ unit: 'ft²' })

    // 2. Independently, by converting each SIDE to metres first and multiplying
    //    there — 16 ft = 4.8768 m, 12 ft = 3.6576 m — rather than converting the
    //    finished area. The two routes only agree if the ft²→m² factor is the
    //    square of the ft→m factor.
    expect(stat(r, 'Square metres')).toBeCloseTo(4.8768 * 3.6576, 12)
    expect(stat(r, 'Square metres')).toBeCloseTo(17.83738368, 10)

    // 3. Against the published conversions, none of which the code uses in this
    //    form: 9 ft² per yd², 144 in² per ft², 43,560 ft² per acre.
    expect(stat(r, 'Square feet')).toBeCloseTo(192, 9)
    expect(stat(r, 'Square yards')).toBeCloseTo(192 / 9, 9)
    expect(stat(r, 'Square inches')).toBeCloseTo(192 * 144, 6)
    expect(stat(r, 'Acres')).toBeCloseTo(192 / 43_560, 12)
    expect(stat(r, 'Hectares')).toBeCloseTo(stat(r, 'Square metres') / 10_000, 12)
  })

  test('an acre and a hectare come out exactly right', () => {
    // A chain by a furlong — 66 ft × 660 ft — is the historical definition of an
    // acre, and 43,560 ft² is the figure every US land record uses.
    const acre = compute({ ...base, a: 660, b: 66 })
    expect(val(acre)).toBe(43_560)
    expect(stat(acre, 'Acres')).toBeCloseTo(1, 10)
    // 4840 yd² × 0.9144² m²/yd², the SI definition the code's literal stands in for.
    expect(stat(acre, 'Square metres')).toBeCloseTo(4840 * 0.9144 * 0.9144, 6)

    // 100 m × 100 m is a hectare by definition.
    const hectare = compute({ ...base, lengthUnit: 'metre', a: 100, b: 100 })
    expect(val(hectare)).toBe(10_000)
    expect(stat(hectare, 'Square metres')).toBe(10_000)
    expect(stat(hectare, 'Hectares')).toBe(1)
    // The published figure: 1 ha ≈ 2.47105 acres.
    expect(stat(hectare, 'Acres')).toBeCloseTo(10_000 / (4840 * 0.9144 * 0.9144), 9)
    expect(stat(hectare, 'Acres')).toBeCloseTo(2.4710538, 6)
  })

  test('a 3-4-5 triangle has area 6, confirmed by Heron from the three sides', () => {
    const r = compute({ ...base, shape: 'triangle', a: 3, b: 4 })
    expect(val(r)).toBe(6)
    // Heron never sees the base/height split, so it is a genuinely separate route.
    expect(heron(3, 4, 5)).toBeCloseTo(6, 12)
    expect(val(r)).toBeCloseTo(heron(3, 4, 5), 12)

    // Half of the rectangle on the same two dimensions, which is the other way
    // of seeing ½ab and is computed by a different branch of the same function.
    expect(val(r)).toBeCloseTo(val(compute({ ...base, a: 3, b: 4 })) / 2, 12)
  })

  test('a unit circle has area π, bracketed by inscribed and circumscribed polygons', () => {
    const r = compute({ ...base, shape: 'circle', a: 1 })
    expect(val(r)).toBe(Math.PI)

    const n = 200_000
    const inscribed = shoelace(ellipsePolygon(1, 1, n))
    const circumscribed = n * Math.tan(Math.PI / n) // n triangles of base 2tan(π/n), height 1
    expect(inscribed).toBeLessThan(val(r))
    expect(val(r)).toBeLessThan(circumscribed)
    expect(val(r)).toBeCloseTo(inscribed, 8)

    // Area goes with the square of the radius, so doubling it quadruples the area.
    const twice = compute({ ...base, shape: 'circle', a: 2 })
    expect(val(twice) / val(r)).toBeCloseTo(4, 12)
    // `b` and `h` are not part of a circle and must not be able to move it.
    expect(val(compute({ ...base, shape: 'circle', a: 1, b: 999, h: 999 }))).toBe(Math.PI)
  })

  test('an ellipse with semi-axes 3 and 2 has area 6π, confirmed by the shoelace formula', () => {
    const r = compute({ ...base, shape: 'ellipse', a: 3, b: 2 })
    expect(val(r)).toBeCloseTo(6 * Math.PI, 12)

    const polygon = shoelace(ellipsePolygon(3, 2, 50_000))
    expect(polygon).toBeLessThan(val(r)) // an inscribed polygon is always smaller
    expect(val(r)).toBeCloseTo(polygon, 5)

    // A circle is the ellipse whose semi-axes are equal.
    expect(val(compute({ ...base, shape: 'ellipse', a: 7, b: 7 }))).toBeCloseTo(
      val(compute({ ...base, shape: 'circle', a: 7 })),
      12,
    )
  })

  test('a trapezoid decomposes into a rectangle plus a triangle', () => {
    const r = compute({ ...base, shape: 'trapezoid', a: 8, b: 4, h: 5 })
    expect(val(r)).toBe(30) // ½ × (8 + 4) × 5

    // Cut the trapezoid at the shorter parallel side: a 4 × 5 rectangle, plus a
    // triangle of base (8 − 4) and height 5. Both halves are worked out by other
    // branches of the same function, so this is an independent route to 30.
    const rectangle = val(compute({ ...base, a: 4, b: 5 }))
    const triangle = val(compute({ ...base, shape: 'triangle', a: 8 - 4, b: 5 }))
    expect(rectangle).toBe(20)
    expect(triangle).toBe(10)
    expect(val(r)).toBeCloseTo(rectangle + triangle, 12)

    // Midsegment × height is the third standard statement of the same formula.
    expect(val(r)).toBeCloseTo(((8 + 4) / 2) * 5, 12)

    // Equal parallel sides degenerate to a rectangle.
    expect(val(compute({ ...base, shape: 'trapezoid', a: 6, b: 6, h: 5 }))).toBeCloseTo(
      val(compute({ ...base, a: 6, b: 5 })),
      12,
    )
  })

  test('a parallelogram equals the rectangle on the same base and height', () => {
    // Cavalieri: shearing a rectangle into a parallelogram preserves its area.
    const p = compute({ ...base, shape: 'parallelogram', a: 6, b: 4 })
    expect(val(p)).toBe(24)
    expect(val(p)).toBe(val(compute({ ...base, a: 6, b: 4 })))
    // And it is exactly two of the triangles it is built from.
    expect(val(p)).toBeCloseTo(2 * val(compute({ ...base, shape: 'triangle', a: 6, b: 4 })), 12)
  })

  test('the same physical room gives the same area in every input unit', () => {
    // 16 ft × 12 ft restated five ways — exactly what the unit selector does to
    // the typed values when it is switched.
    const restated: ReadonlyArray<readonly [string, number, number]> = [
      ['foot', 16, 12],
      ['metre', 16 * 0.3048, 12 * 0.3048],
      ['yard', 16 / 3, 12 / 3],
      ['inch', 16 * 12, 12 * 12],
      ['centimetre', 16 * 30.48, 12 * 30.48],
    ]

    for (const [lengthUnit, a, b] of restated) {
      const r = compute({ ...base, lengthUnit, a, b })
      expect(stat(r, 'Square metres'), lengthUnit).toBeCloseTo(4.8768 * 3.6576, 9)
      expect(stat(r, 'Square feet'), lengthUnit).toBeCloseTo(192, 8)
      expect(stat(r, 'Acres'), lengthUnit).toBeCloseTo(192 / 43_560, 12)
    }

    // The headline, by contrast, is in the unit that was typed in.
    expect(val(compute({ ...base, lengthUnit: 'yard', a: 16 / 3, b: 4 }))).toBeCloseTo(192 / 9, 9)
    expect(compute({ ...base, lengthUnit: 'centimetre' }).primary.format).toMatchObject({
      unit: 'cm²',
    })
  })

  test('the working names each dimension by its role in the selected shape', () => {
    expect(stepLabels(compute({ ...base, shape: 'circle' }))).toEqual([
      'Shape',
      'Radius (a)',
      'Area = π × a²',
      'Square metres = ft² × 0.09290304',
      'Square feet = m² ÷ 0.09290304',
      'Acres = m² ÷ 4046.8564224',
    ])
    expect(stepLabels(compute(base))).toContain('Length (a)')
    expect(stepLabels(compute(base))).toContain('Width (b)')
    expect(stepLabels(compute({ ...base, shape: 'trapezoid' }))).toContain(
      'Height between the parallel sides (h)',
    )
    // Unused dimensions are named as ignored rather than silently dropped.
    expect(compute({ ...base, shape: 'circle' }).notes![0]).toContain(
      'Inputs b and h are ignored',
    )
    expect(compute(base).notes![0]).toContain('Input h is ignored')
    expect(compute({ ...base, shape: 'trapezoid' }).notes![0]).not.toContain('ignored')
  })

  test('the result shape never varies: six unit conversions, no parts, no series', () => {
    const shapes = ['rectangle', 'triangle', 'circle', 'trapezoid', 'parallelogram', 'ellipse']
    const units = ['foot', 'metre', 'yard', 'inch', 'centimetre']
    for (const shape of shapes) {
      for (const lengthUnit of units) {
        const r = compute({ ...base, shape, lengthUnit })
        expect(r.stats!.length, `${shape}/${lengthUnit}`).toBe(6)
        expect(r.parts).toBeUndefined()
        expect(r.series).toBeUndefined()
        expect(Number.isFinite(val(r))).toBe(true)
        expect(val(r)).toBeGreaterThan(0)
      }
    }
  })

  test('every bound the sliders offer is a value compute accepts', () => {
    // The registry-wide field-bounds sweep only covers registered calculators;
    // this is the same check applied locally, across every unit variant.
    const cases = Object.entries(fields[2].variants.cases)
    for (const [lengthUnit, bounds] of cases) {
      for (const edge of [bounds.min, bounds.max]) {
        for (const shape of ['rectangle', 'circle', 'trapezoid', 'ellipse']) {
          const r = compute({ ...base, shape, lengthUnit, a: edge, b: edge, h: edge })
          expect(Number.isFinite(val(r)), `${shape}/${lengthUnit}/${edge}`).toBe(true)
          expect(val(r)).toBeGreaterThan(0)
          expect(Number.isFinite(stat(r, 'Square metres'))).toBe(true)
        }
      }
    }
  })

  test('rejects a non-positive or unparseable dimension against the offending field', () => {
    const thrownBy = (input: Input): CalcError => {
      try {
        compute(input)
      } catch (err) {
        return err as CalcError
      }
      throw new Error('expected a CalcError')
    }

    for (const bad of [0, -1, -0.0001, Number.NaN, Number.POSITIVE_INFINITY]) {
      const err = thrownBy({ ...base, a: bad })
      expect(err).toBeInstanceOf(CalcError)
      expect(err.fieldId).toBe('a')
    }

    expect(thrownBy({ ...base, b: 0 }).fieldId).toBe('b')
    expect(thrownBy({ ...base, b: Number.NaN }).fieldId).toBe('b')
    expect(thrownBy({ ...base, shape: 'trapezoid', h: 0 }).fieldId).toBe('h')
    expect(thrownBy({ ...base, shape: 'triangle', b: -2 }).fieldId).toBe('b')
    expect(thrownBy({ ...base, shape: 'ellipse', b: 0 }).fieldId).toBe('b')

    // A shape that does not use a dimension must not be blocked by it — the form
    // still shows the field, so a leftover 0 there is not an error.
    expect(() => compute({ ...base, shape: 'circle', b: 0, h: 0 })).not.toThrow()
    expect(() => compute({ ...base, h: 0 })).not.toThrow()
    expect(() => compute({ ...base, shape: 'triangle', h: Number.NaN })).not.toThrow()
  })

  test('rejects a shape or unit it does not know', () => {
    const attempt = (input: Input) => {
      try {
        compute(input)
      } catch (err) {
        return err as CalcError
      }
      throw new Error('expected a CalcError')
    }
    expect(attempt({ ...base, shape: 'hexagon' }).fieldId).toBe('shape')
    expect(attempt({ ...base, shape: '' }).fieldId).toBe('shape')
    expect(attempt({ ...base, lengthUnit: 'furlong' }).fieldId).toBe('lengthUnit')
  })

  test('the first number field nudged to 1.1x its default moves the answer', () => {
    const defaults = Object.fromEntries(fields.map((f) => [f.id, f.default])) as Input
    const firstNumber = fields.find((f) => f.kind === 'number')!
    expect(firstNumber.id).toBe('a')

    const before = compute(defaults)
    const after = compute({ ...defaults, a: firstNumber.default * 1.1 })
    expect(val(after)).not.toBeCloseTo(val(before), 6)
    // A rectangle's area is linear in its length, so it moves by exactly 1.1x.
    expect(val(after) / val(before)).toBeCloseTo(1.1, 12)
    expect(val(after)).toBeCloseTo(211.2, 9)
  })
})

/**
 * The registry-wide conformance suite only sees calculators that are in the
 * barrel, so the parts of it that this definition can check on its own are
 * checked here — copy that has to fit a search result, variant bounds that a
 * slider will actually offer, and a default result that formats without a NaN.
 */
describe('area calculator definition', () => {
  test('copy fits where it has to fit', () => {
    expect(def.description.length).toBeGreaterThan(50)
    expect(def.description.length).toBeLessThanOrEqual(160)
    expect(def.seoTitle.length).toBeLessThanOrEqual(70)
    expect(def.intro.length).toBeGreaterThan(40)
    expect(def.faqs.length).toBeGreaterThanOrEqual(3)
    for (const faq of def.faqs) {
      expect(faq.q.endsWith('?')).toBe(true)
      expect(faq.a.length).toBeGreaterThan(40)
    }
    expect(def.related).not.toContain(def.slug)
    const serialized = JSON.stringify(def, (_k, v) => (typeof v === 'function' ? undefined : v))
    expect(serialized).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(serialized).not.toMatch(/<\/?[a-z][\s\S]*>/i)
  })

  test('every unit variant is a legal narrowing of the union bounds', () => {
    for (const field of fields) {
      if (field.kind !== 'number') continue
      const cases = Object.values(field.variants.cases)
      const [baseCase] = cases
      // The first case listed is the base: factor 1, and the default is typed
      // in its unit, so the form cannot open on a value its own control rejects.
      expect('factor' in baseCase!).toBe(false)
      expect(field.default).toBeGreaterThanOrEqual(baseCase!.min)
      expect(field.default).toBeLessThanOrEqual(baseCase!.max)
      for (const variant of cases) {
        expect(variant.min).toBeGreaterThanOrEqual(field.min)
        expect(variant.max).toBeLessThanOrEqual(field.max)
        expect(variant.min).toBeGreaterThan(0) // compute demands a positive dimension
      }
    }
  })

  test('the default result and every single-field variation format without a NaN', () => {
    const defaults = defaultValues(def)
    const view = toResultView(def.compute(defaults as never))
    expect(view.primary.text).toBe('192.00 ft²')
    expect(view.stats.map((s) => s.text)).toEqual([
      '17.8374 m²',
      '192.00 ft²',
      '21.3333 yd²',
      '27,648.00 in²',
      '0.004408 acres',
      '0.001784 ha',
    ])
    // Nothing here is a proportion or a trend, so there is no donut and no chart
    // to render — and therefore nothing that could appear off-default only.
    expect(view.parts).toEqual([])
    expect(view.series).toEqual([])

    for (const field of fields) {
      const values: unknown[] =
        field.kind === 'select'
          ? field.options.map((o) => o.value)
          : [field.min, field.max, field.default, 1, 2, 1000]
      for (const value of values) {
        let result
        try {
          result = def.compute({ ...defaults, [field.id]: value } as never)
        } catch {
          continue // a refusal is not an answer; there is nothing to format
        }
        const v = toResultView(result)
        const where = `${field.id}=${String(value)}`
        expect(v.primary.text, where).not.toContain('NaN')
        for (const s of v.stats) expect(s.text, where).not.toContain('NaN')
      }
    }
  })
})

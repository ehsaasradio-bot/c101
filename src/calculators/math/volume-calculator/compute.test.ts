import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'
import type { Values } from '../../../lib/types'

type Input = Values<typeof fields>

const defaults = Object.fromEntries(fields.map((f) => [f.id, f.default])) as unknown as Input

const run = (patch: Partial<Input> = {}) => compute({ ...defaults, ...patch })
const litres = (patch: Partial<Input> = {}) => Number(run(patch).primary.value)
const stat = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)
const cubicMetres = (patch: Partial<Input> = {}) => stat(run(patch), 'Cubic metres')

/**
 * The independent method used throughout: integrate the cross-section area
 * along the axis with composite Simpson's rule, which never touches the closed
 * forms in compute.ts.
 *
 * Simpson is EXACT for any integrand of degree three or below, and every solid
 * here has a cross-section area that is constant (cylinder), a square of a
 * linear taper (cone, pyramid) or a plain quadratic (sphere, capsule cap). So
 * agreement to twelve decimal places is expected rather than lucky — a
 * disagreement means the closed form is wrong, not that the quadrature is coarse.
 */
function simpson(f: (x: number) => number, a: number, b: number, n = 100): number {
  const steps = n % 2 === 0 ? n : n + 1
  const h = (b - a) / steps
  let total = f(a) + f(b)
  for (let i = 1; i < steps; i += 1) total += f(a + i * h) * (i % 2 === 0 ? 2 : 4)
  return (total * h) / 3
}

/**
 * A second independent method for anything circular: a circle's area is
 * strictly bracketed by the inscribed and circumscribed regular n-gons,
 *   (n/2)·r²·sin(2π/n)  less than  πr²  less than  n·r²·tan(π/n),
 * and both bounds converge as n grows. Multiplying by the height brackets a
 * prism around the cylinder without writing π at all.
 */
const inscribedArea = (r: number, n: number) => (n / 2) * r * r * Math.sin((2 * Math.PI) / n)
const circumscribedArea = (r: number, n: number) => n * r * r * Math.tan(Math.PI / n)

describe('volume calculator — the headline case', () => {
  test('the default 1.2 m by 1.5 m tank holds exactly 540π litres', () => {
    // V = π·(1.2/2)²·1.5 = π·0.36·1.5 = 0.54π m³, so 540π litres. Exact, not decimal.
    expect(cubicMetres()).toBeCloseTo(0.54 * Math.PI, 12)
    expect(litres()).toBeCloseTo(540 * Math.PI, 9)
    expect(litres()).toBeCloseTo(1696.4600329384882, 9)
  })

  test('the same tank confirmed by integration, and again by polygonal prisms', () => {
    const r = 0.6
    const h = 1.5

    // Method two: integrate the constant disc area up the axis.
    expect(cubicMetres()).toBeCloseTo(simpson(() => Math.PI * r * r, 0, h), 12)

    // Method three: bracket it between inscribed and circumscribed prisms,
    // which never uses π.
    expect(cubicMetres()).toBeGreaterThan(inscribedArea(r, 200_000) * h)
    expect(cubicMetres()).toBeLessThan(circumscribedArea(r, 200_000) * h)
    expect(cubicMetres()).toBeCloseTo(inscribedArea(r, 200_000) * h, 8)
  })

  test('all four reported units describe the same physical volume', () => {
    const r = run()
    const m3 = stat(r, 'Cubic metres')
    expect(litres()).toBeCloseTo(m3 * 1000, 9)
    expect(stat(r, 'Cubic feet') * 0.3048 ** 3).toBeCloseTo(m3, 12)
    expect(stat(r, 'US gallons') * 231 * 0.0254 ** 3).toBeCloseTo(m3, 12)
    expect(stat(r, 'Imperial gallons') * 0.00454609).toBeCloseTo(m3, 12)
  })
})

describe('volume calculator — exact reference solids', () => {
  const box = { shape: 'box' } as const

  test('a 1 m cube is 1 m³, 1000 litres, and the published NIST conversions', () => {
    const r = run({ ...box, dim1: 1, dim2: 1, dim3: 1 })
    expect(Number(r.primary.value)).toBe(1000)
    expect(stat(r, 'Cubic metres')).toBe(1)
    // Figures the outside world already agrees on.
    expect(stat(r, 'Cubic feet')).toBeCloseTo(35.3146667, 5)
    expect(stat(r, 'US gallons')).toBeCloseTo(264.172052, 5)
    expect(stat(r, 'Imperial gallons')).toBeCloseTo(219.969248, 5)
  })

  test('a 231 by 1 by 1 inch box is exactly one US gallon, by definition', () => {
    // The US liquid gallon IS 231 cubic inches. A rounded 3.785 litres in place
    // of the exact 0.003785411784 m³ would miss this.
    const r = run({ ...box, lengthUnit: 'inch', dim1: 231, dim2: 1, dim3: 1 })
    expect(stat(r, 'US gallons')).toBeCloseTo(1, 12)
    expect(Number(r.primary.value)).toBeCloseTo(3.785411784, 9)
  })

  test('a one-foot cube is 28.316846592 litres and 7.48051948 US gallons', () => {
    const r = run({ ...box, lengthUnit: 'foot', dim1: 1, dim2: 1, dim3: 1 })
    expect(stat(r, 'Cubic feet')).toBeCloseTo(1, 12)
    expect(Number(r.primary.value)).toBeCloseTo(28.316846592, 9)
    expect(stat(r, 'US gallons')).toBeCloseTo(7.48051948, 6)
  })

  test('the imperial gallon is exactly 4.54609 litres', () => {
    const r = run({ ...box, dim1: 0.454609, dim2: 0.01, dim3: 1 })
    expect(Number(r.primary.value)).toBeCloseTo(4.54609, 9)
    expect(stat(r, 'Imperial gallons')).toBeCloseTo(1, 9)
  })

  test('a sphere of radius 1 m is 4π/3 m³, confirmed by quadrature', () => {
    const v = cubicMetres({ shape: 'sphere', dim1: 2 })
    expect(v).toBeCloseTo((4 / 3) * Math.PI, 12)

    // Independent: the integral of π(r² − x²) from −r to r. Simpson is exact here.
    const r = 1
    expect(v).toBeCloseTo(
      simpson((x) => Math.PI * (r * r - x * x), -r, r),
      12,
    )
  })
})

describe('volume calculator — each solid against an independent integration', () => {
  const at = (patch: Partial<Input>) => cubicMetres({ dim1: 1.4, dim2: 0.9, dim3: 2.2, ...patch })
  const r = 0.7
  const h = 2.2

  test('box: l·w·h, and doubling every edge multiplies it by eight', () => {
    expect(at({ shape: 'box' })).toBeCloseTo(1.4 * 0.9 * 2.2, 12)
    const doubled = cubicMetres({ shape: 'box', dim1: 2.8, dim2: 1.8, dim3: 4.4 })
    expect(doubled / at({ shape: 'box' })).toBeCloseTo(8, 9)
  })

  test('cylinder: matches the integral of a constant disc', () => {
    expect(at({ shape: 'cylinder' })).toBeCloseTo(simpson(() => Math.PI * r * r, 0, h), 12)
  })

  test('cone: matches the integral of a linearly shrinking disc', () => {
    expect(at({ shape: 'cone' })).toBeCloseTo(
      simpson((x) => Math.PI * (r * (1 - x / h)) ** 2, 0, h),
      12,
    )
  })

  test('pyramid: matches the integral of a linearly shrinking rectangle', () => {
    expect(at({ shape: 'pyramid' })).toBeCloseTo(
      simpson((x) => 1.4 * 0.9 * (1 - x / h) ** 2, 0, h),
      12,
    )
  })

  test('capsule: matches the integral over its two caps and straight middle', () => {
    // Three exact Simpson pieces: bottom cap, cylinder, top cap. Inside a cap
    // the radius² is r² − (r − x)² = 2rx − x², a quadratic, so this stays exact.
    const bottom = simpson((x) => Math.PI * (2 * r * x - x * x), 0, r)
    const middle = simpson(() => Math.PI * r * r, r, r + h)
    const top = simpson((x) => Math.PI * (r * r - (x - r - h) ** 2), r + h, h + 2 * r)
    expect(at({ shape: 'capsule' })).toBeCloseTo(bottom + middle + top, 12)
  })

  test('the classic ratios between the solids hold exactly', () => {
    // Cone is a third of its circumscribing cylinder; pyramid a third of its box.
    expect(at({ shape: 'cone' }) / at({ shape: 'cylinder' })).toBeCloseTo(1 / 3, 12)
    expect(at({ shape: 'pyramid' }) / at({ shape: 'box' })).toBeCloseTo(1 / 3, 12)
    // A capsule is exactly its cylinder plus one whole sphere of the same diameter.
    expect(at({ shape: 'capsule' })).toBeCloseTo(
      at({ shape: 'cylinder' }) + at({ shape: 'sphere' }),
      12,
    )
    // Archimedes: a sphere is two thirds of the cylinder that just encloses it.
    const enclosing = cubicMetres({ shape: 'cylinder', dim1: 1.4, dim3: 1.4 })
    expect(cubicMetres({ shape: 'sphere', dim1: 1.4 }) / enclosing).toBeCloseTo(2 / 3, 12)
  })
})

describe('volume calculator — units', () => {
  const SAME_TANK: Array<[string, number, number]> = [
    ['metre', 1.2, 1.5],
    ['centimetre', 120, 150],
    ['foot', 1.2 / 0.3048, 1.5 / 0.3048],
    ['inch', 1.2 / 0.0254, 1.5 / 0.0254],
  ]

  test.each(SAME_TANK)('the same tank measured in %s gives the same litres', (unit, d, h) => {
    expect(litres({ lengthUnit: unit, dim1: d, dim3: h })).toBeCloseTo(540 * Math.PI, 6)
  })

  test('the metres-per-unit step matches the exact 1959 definitions', () => {
    const step = (unit: string) => {
      const found = run({ lengthUnit: unit }).steps!.find(
        (s) => 'label' in s && s.label.startsWith('1 '),
      )
      return Number((found as { value: number }).value)
    }
    expect(step('centimetre')).toBe(0.01)
    expect(step('foot')).toBe(0.3048)
    expect(step('inch')).toBe(0.0254)
    // Metres need no conversion line at all.
    expect(run().steps!.some((s) => 'label' in s && s.label.startsWith('1 '))).toBe(false)
  })
})

describe('volume calculator — dimensions a solid does not use', () => {
  test('the width is ignored for every round solid', () => {
    for (const shape of ['cylinder', 'sphere', 'cone', 'capsule']) {
      expect(litres({ shape, dim2: 0.8 })).toBeCloseTo(litres({ shape, dim2: 40 }), 9)
      // ...and a zero there is not an error, because it is not part of the solid.
      expect(() => run({ shape, dim2: 0 })).not.toThrow()
    }
  })

  test('the height is ignored for a sphere but not for anything else', () => {
    expect(litres({ shape: 'sphere', dim3: 1.5 })).toBeCloseTo(
      litres({ shape: 'sphere', dim3: 9 }),
      9,
    )
    for (const shape of ['box', 'cylinder', 'cone', 'capsule', 'pyramid']) {
      expect(litres({ shape, dim3: 3 })).toBeGreaterThan(litres({ shape, dim3: 1.5 }))
    }
  })

  test('every solid shows its working and ends on the headline litres', () => {
    for (const shape of ['box', 'cylinder', 'sphere', 'cone', 'capsule', 'pyramid']) {
      const r = run({ shape })
      const last = r.steps![r.steps!.length - 1] as { label: string; value: number }
      expect(last.label).toContain('Litres')
      expect(last.value).toBeCloseTo(Number(r.primary.value), 9)
      expect(r.notes![0].length).toBeGreaterThan(40)
    }
  })
})

describe('volume calculator — invalid input', () => {
  const cases: Array<[string, Partial<Input>, string]> = [
    ['a zero diameter', { dim1: 0 }, 'dim1'],
    ['a negative diameter', { dim1: -1.2 }, 'dim1'],
    ['a zero height on a cylinder', { dim3: 0 }, 'dim3'],
    ['a negative height on a cone', { shape: 'cone', dim3: -0.5 }, 'dim3'],
    ['a zero width on a box', { shape: 'box', dim2: 0 }, 'dim2'],
    ['a negative width on a pyramid', { shape: 'pyramid', dim2: -3 }, 'dim2'],
    ['an unparseable diameter', { dim1: Number.NaN }, 'dim1'],
    ['an infinite height', { dim3: Number.POSITIVE_INFINITY }, 'dim3'],
    ['a diameter of two kilometres', { dim1: 2000 }, 'dim1'],
    ['a solid that is not on the list', { shape: 'torus' }, 'shape'],
    ['a unit that is not on the list', { lengthUnit: 'furlong' }, 'lengthUnit'],
  ]

  test.each(cases)('rejects %s against the right field', (_label, patch, fieldId) => {
    let thrown: unknown
    try {
      compute({ ...defaults, ...patch } as Input)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
    expect((thrown as CalcError).message.length).toBeGreaterThan(10)
  })

  test('never returns NaN or a non-positive volume for accepted input', () => {
    for (const shape of ['box', 'cylinder', 'sphere', 'cone', 'capsule', 'pyramid']) {
      for (const unit of ['metre', 'centimetre', 'foot', 'inch']) {
        const v = litres({ shape, lengthUnit: unit })
        expect(Number.isFinite(v)).toBe(true)
        expect(v).toBeGreaterThan(0)
      }
    }
  })
})

describe('volume calculator — the form can only offer values compute accepts', () => {
  const dims = fields.filter((f) => f.kind === 'number')
  const units = ['metre', 'centimetre', 'foot', 'inch'] as const

  test.each(units)('both ends of every slider are valid in %s', (unit) => {
    for (const field of dims) {
      const variant = field.variants.cases[unit]
      for (const bound of [variant.min, variant.max]) {
        for (const shape of ['box', 'cylinder', 'sphere', 'cone', 'capsule', 'pyramid']) {
          const v = litres({ shape, lengthUnit: unit, dim1: bound, dim2: bound, dim3: bound })
          expect(Number.isFinite(v), `${field.id} ${unit} ${bound} ${shape}`).toBe(true)
          expect(v).toBeGreaterThan(0)
        }
      }
    }
  })

  test('the declared union bounds really do contain every variant', () => {
    for (const field of dims) {
      for (const variant of Object.values(field.variants.cases)) {
        expect(variant.min).toBeGreaterThanOrEqual(field.min)
        expect(variant.max).toBeLessThanOrEqual(field.max)
      }
      // The first case listed is the base, so the default is read in its unit.
      const base = Object.values(field.variants.cases)[0]!
      expect(field.default).toBeGreaterThanOrEqual(base.min)
      expect(field.default).toBeLessThanOrEqual(base.max)
    }
  })
})

describe('volume calculator — defaults', () => {
  test('the declared defaults compute without throwing', () => {
    expect(() => compute(defaults)).not.toThrow()
  })

  test('the first number field is dim1, and nudging it to 1.1x moves the answer', () => {
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('dim1')

    const nudged = litres({ dim1: first.default * 1.1 })
    expect(nudged).not.toBeCloseTo(litres(), 6)
    // The default solid is a cylinder, where dim1 is the diameter, so the
    // volume moves by the square of the nudge: 1.1² = 1.21.
    expect(nudged / litres()).toBeCloseTo(1.21, 9)
  })

  test('no parts or series are claimed, so nothing can appear only off-default', () => {
    // A volume has no proportion to split and no ordered axis to plot, so
    // neither a donut nor a chart would carry information. Declaring nothing
    // also makes the count trivially input-independent.
    const r = run()
    expect(r.parts).toBeUndefined()
    expect(r.series).toBeUndefined()
    for (const shape of ['box', 'cylinder', 'sphere', 'cone', 'capsule', 'pyramid']) {
      expect(run({ shape }).parts).toBeUndefined()
      expect(run({ shape }).series).toBeUndefined()
    }
  })
})

/**
 * The registry-wide conformance suite covers these once the calculator is in
 * the barrel; pinning them here catches a bad edit in the fast loop instead.
 */
describe('volume calculator — copy', () => {
  test('the meta description fits a search result', () => {
    expect(def.description.length).toBeGreaterThan(50)
    expect(def.description.length).toBeLessThanOrEqual(160)
  })

  test('the SEO title fits in 70 characters and the intro answers the question', () => {
    expect(def.seoTitle.length).toBeLessThanOrEqual(70)
    expect(def.intro.length).toBeGreaterThan(40)
    expect(def.resultLabel.length).toBeGreaterThan(0)
  })

  test('there are at least three real FAQs, each answered at length', () => {
    expect(def.faqs.length).toBeGreaterThanOrEqual(3)
    for (const faq of def.faqs) {
      expect(faq.q.endsWith('?')).toBe(true)
      expect(faq.a.length).toBeGreaterThan(40)
    }
  })

  test('the definition holds no colours, class names, or markup', () => {
    const serialized = JSON.stringify(def, (_k, v) => (typeof v === 'function' ? undefined : v))
    expect(serialized).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(serialized).not.toMatch(/\b(bg|text|border|rounded|shadow)-[a-z]+-\d{2,3}\b/)
    expect(serialized).not.toMatch(/<\/?[a-z][\s\S]*>/i)
  })

  test('related points at three other calculators, never at itself', () => {
    expect(def.related.length).toBeGreaterThanOrEqual(2)
    for (const slug of def.related) expect(slug).not.toBe(def.slug)
  })
})

import { describe, expect, test } from 'vitest'
import compute from './compute'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'

const stat = (r: ReturnType<typeof compute>, label: string) =>
  r.stats!.find((s) => s.label === label)!.value

/** Pulls the numeric part out of a `x = 4` style root string. */
const rootNumber = (text: unknown) => Number(String(text).replace('x = ', ''))

describe('quadratic-calculator', () => {
  test('x² − 3x − 4 = 0 factors as (x − 4)(x + 1), so the roots are 4 and −1', () => {
    const r = compute({ a: 1, b: -3, c: -4 })
    expect(r.primary.value).toBe('x = 4 or x = -1')
    expect(stat(r, 'Discriminant (b² − 4ac)')).toBe(25)
    expect(stat(r, 'Real roots')).toBe(2)
    // Vertex of x² − 3x − 4: x = 1.5, y = 2.25 − 4.5 − 4 = −6.25.
    expect(stat(r, 'Vertex x')).toBeCloseTo(1.5, 12)
    expect(stat(r, 'Vertex y')).toBeCloseTo(-6.25, 12)
    expect(stat(r, 'Axis of symmetry')).toBe('x = 1.5')
  })

  test('reported roots satisfy the equation and Vieta, cross-checked by bisection', () => {
    // Independent method: never use the quadratic formula here. Evaluate the
    // polynomial at each reported root (residual must vanish), confirm Vieta's
    // relations, and locate the larger root again by bisection.
    const cases = [
      { a: 2, b: -7, c: 3 },
      { a: 1, b: 1000001, c: 1 }, // ill-conditioned: catastrophic cancellation
      { a: -3, b: 0.5, c: 9 },
      { a: 0.25, b: -1, c: -12 },
    ]
    for (const { a, b, c } of cases) {
      const r = compute({ a, b, c })
      const hi = rootNumber(stat(r, 'First root'))
      const lo = rootNumber(stat(r, 'Second root'))
      const f = (x: number) => a * x * x + b * x + c

      expect(Math.abs(f(hi))).toBeLessThan(1e-5 * Math.max(1, Math.abs(b * hi)))
      expect(Math.abs(f(lo))).toBeLessThan(1e-5 * Math.max(1, Math.abs(b * lo)))
      // Tolerances are relative: the reported roots are rounded to six decimals
      // for display, which costs relative precision when the two roots differ by
      // six orders of magnitude (the b = 1000001 case).
      expect(Math.abs(hi + lo - -b / a)).toBeLessThan(1e-5 * Math.max(1, Math.abs(b / a)))
      expect(Math.abs(hi * lo - c / a)).toBeLessThan(1e-5 * Math.max(1, Math.abs(c / a)))

      // Bisect for the larger root on a bracket that straddles it.
      let loB = hi - 1
      let hiB = hi + 1
      expect(Math.sign(f(loB))).not.toBe(Math.sign(f(hiB)))
      for (let i = 0; i < 200; i++) {
        const mid = (loB + hiB) / 2
        if (Math.sign(f(mid)) === Math.sign(f(loB))) loB = mid
        else hiB = mid
      }
      expect((loB + hiB) / 2).toBeCloseTo(hi, 6)
    }
  })

  test('a zero discriminant gives a single repeated root at the vertex', () => {
    // (2x − 3)² = 4x² − 12x + 9, so the double root is x = 1.5 and the vertex
    // sits on the x-axis.
    const r = compute({ a: 4, b: -12, c: 9 })
    expect(stat(r, 'Discriminant (b² − 4ac)')).toBe(0)
    expect(stat(r, 'Real roots')).toBe(1)
    expect(r.primary.value).toBe('x = 1.5 (double root)')
    expect(stat(r, 'First root')).toBe(stat(r, 'Second root'))
    expect(stat(r, 'Vertex y')).toBeCloseTo(0, 12)
  })

  test('a negative discriminant reports a complex conjugate pair', () => {
    // x² + 2x + 5: (−1 + 2i)² + 2(−1 + 2i) + 5 = (1 − 4 − 4i) + (−2 + 4i) + 5 = 0.
    const r = compute({ a: 1, b: 2, c: 5 })
    expect(stat(r, 'Discriminant (b² − 4ac)')).toBe(-16)
    expect(stat(r, 'Real roots')).toBe(0)
    expect(stat(r, 'First root')).toBe('x = -1 + 2i')
    expect(stat(r, 'Second root')).toBe('x = -1 - 2i')
    expect(r.notes!.length).toBe(1)

    // Verify the pair by complex arithmetic on (re, im), independent of the
    // string formatting: a(z² ) + b z + c must be 0 + 0i.
    const re = -1
    const im = 2
    const sqRe = re * re - im * im
    const sqIm = 2 * re * im
    expect(1 * sqRe + 2 * re + 5).toBeCloseTo(0, 12)
    expect(1 * sqIm + 2 * im).toBeCloseTo(0, 12)
  })

  test('a = 0 is not a quadratic and throws CalcError on field a', () => {
    expect(() => compute({ a: 0, b: 2, c: 1 })).toThrow(CalcError)
    try {
      compute({ a: 0, b: 2, c: 1 })
    } catch (e) {
      expect((e as CalcError).fieldId).toBe('a')
    }
  })

  test('non-finite input throws CalcError naming the offending field', () => {
    for (const id of ['a', 'b', 'c'] as const) {
      const input = { a: 1, b: -3, c: -4, [id]: Number.NaN }
      try {
        compute(input)
        throw new Error('expected a CalcError')
      } catch (e) {
        expect(e).toBeInstanceOf(CalcError)
        expect((e as CalcError).fieldId).toBe(id)
      }
    }
  })

  test('nudging the first number field to 1.1x its default stays valid and moves the result', () => {
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('a')
    const base = { a: 1, b: -3, c: -4 }
    const nudged = { ...base, a: first.default * 1.1 }
    expect(nudged.a).toBeGreaterThanOrEqual(first.min!)
    expect(nudged.a).toBeLessThanOrEqual(first.max!)
    expect(compute(nudged).primary.value).not.toBe(compute(base).primary.value)
  })

  test('the definition copy stays inside the conformance limits', async () => {
    const def = (await import('./index')).default
    expect(def.description.length).toBeGreaterThanOrEqual(51)
    expect(def.description.length).toBeLessThanOrEqual(160)
    expect(def.seoTitle.length).toBeLessThanOrEqual(70)
    expect(def.intro.length).toBeGreaterThan(40)
    expect(def.faqs.length).toBeGreaterThanOrEqual(3)
    for (const f of def.faqs) {
      expect(f.q.endsWith('?')).toBe(true)
      expect(f.a.length).toBeGreaterThan(40)
    }
    expect(def.related).not.toContain(def.slug)
    expect(def.related.length).toBeGreaterThanOrEqual(2)
    // No tight upper bound: `registry.test.ts` owns the real rule, which is
    // only that every slug resolves. A local cap of 3 was invented here and is
    // contradicted by 26 calculators carrying 4 or 5 — a page gains inbound
    // links as siblings are added, so this can only grow. Kept loose purely as
    // a guard against an accidental runaway.
    expect(def.related.length).toBeLessThanOrEqual(8)
  })
})

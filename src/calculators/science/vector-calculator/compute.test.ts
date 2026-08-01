import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'
import type { Field, NumberField, Quantity } from '../../../lib/types'
import { formatValue } from '../../../lib/format'
import { defaultValues } from '../../../lib/view'

type Input = Parameters<typeof compute>[0]
type Result = ReturnType<typeof compute>

/**
 * Not `as const`: the fixture is spread with numeric overrides throughout, and
 * literal-pinned types would reject `{ ax: 0 }` because the type would be the
 * literal 3.
 */
const base: Input = {
  operation: 'dot',
  dimensions: '3d',
  ax: 3,
  ay: 4,
  az: 0,
  bx: 1,
  by: 2,
  bz: 2,
}

const OPERATIONS = ['dot', 'cross', 'angle', 'magnitude', 'projection', 'add', 'subtract'] as const
const DIMENSIONS = ['3d', '2d'] as const

const numberFields = (fields as readonly Field[]).filter(
  (f): f is NumberField => f.kind === 'number',
)

const stat = (r: Result, label: string) => Number(r.stats!.find((s) => s.label === label)!.value)
const hasStat = (r: Result, label: string) => r.stats!.some((s) => s.label === label)
const primary = (r: Result) => Number(r.primary.value)

const thrownBy = (input: Input): unknown => {
  try {
    compute(input)
    return undefined
  } catch (err) {
    return err
  }
}

/**
 * An INDEPENDENT reimplementation used only by the tests, deliberately written
 * from the textbook definitions rather than shared with compute — squaring and
 * adding where compute uses `Math.hypot`, and `acos` where compute uses `atan2`.
 * Agreement between the two is therefore evidence, not tautology.
 */
const naive = {
  dot: (p: number[], q: number[]) => p[0]! * q[0]! + p[1]! * q[1]! + p[2]! * q[2]!,
  norm: (p: number[]) => Math.sqrt(p[0]! * p[0]! + p[1]! * p[1]! + p[2]! * p[2]!),
  cross: (p: number[], q: number[]) => [
    p[1]! * q[2]! - p[2]! * q[1]!,
    p[2]! * q[0]! - p[0]! * q[2]!,
    p[0]! * q[1]! - p[1]! * q[0]!,
  ],
}

describe('vector: the anchor', () => {
  /*
   * a = (3, 4, 0) and b = (1, 2, 2) are chosen so that every headline is an
   * integer or a clean surd:
   *   |a|     = √(9 + 16 + 0) = 5        (the 3-4-5 triangle)
   *   |b|     = √(1 + 4 + 4)  = 3        (the 1-2-2 triple)
   *   a · b   = 3 + 8 + 0     = 11
   *   a × b   = (8, −6, 2), so |a × b| = √104
   * All exact in binary floating point, so they are asserted with strict
   * equality where they can be.
   */
  test('the dot product of the defaults is exactly 11', () => {
    const r = compute(base)
    expect(r.primary.label).toBe('Dot product a · b')
    expect(r.primary.value).toBe(11)
    expect(def.resultLabel).toBe(r.primary.label)
    expect(stat(r, 'Magnitude |a|')).toBe(5)
    expect(stat(r, 'Magnitude |b|')).toBe(3)
  })

  test('the defaults compute the same way through the registry helper', () => {
    const r = compute(defaultValues(def) as Input)
    expect(r.primary.value).toBe(11)
    expect(formatValue(r.primary.value, r.primary.format)).toBe('11.000000')
  })

  test('the cross product of the defaults is (8, −6, 2)', () => {
    const r = compute({ ...base, operation: 'cross' })
    expect(stat(r, '(a × b) x component')).toBe(8)
    expect(stat(r, '(a × b) y component')).toBe(-6)
    expect(stat(r, '(a × b) z component')).toBe(2)
    expect(primary(r)).toBeCloseTo(Math.sqrt(104), 12)
  })

  test('the angle between the defaults is acos(11/15) = 42.8334°', () => {
    const r = compute({ ...base, operation: 'angle' })
    expect(primary(r)).toBeCloseTo((Math.acos(11 / 15) * 180) / Math.PI, 10)
    expect(primary(r)).toBeCloseTo(42.83342806606726, 10)
    expect(stat(r, 'cos θ')).toBeCloseTo(11 / 15, 15)
  })

  test('the magnitude, projection, sum and difference of the defaults', () => {
    expect(primary(compute({ ...base, operation: 'magnitude' }))).toBe(5)
    // comp_b a = (a · b) ÷ |b| = 11 ÷ 3.
    expect(primary(compute({ ...base, operation: 'projection' }))).toBeCloseTo(11 / 3, 15)
    // a + b = (4, 6, 2), |a + b| = √56.
    expect(primary(compute({ ...base, operation: 'add' }))).toBeCloseTo(Math.sqrt(56), 12)
    // a − b = (2, 2, −2), |a − b| = √12.
    expect(primary(compute({ ...base, operation: 'subtract' }))).toBeCloseTo(Math.sqrt(12), 12)
  })
})

describe('vector: identities that cross-check the arithmetic', () => {
  /** A spread of vectors, including zero, negative and lopsided components. */
  const vectors: number[][] = [
    [3, 4, 0],
    [1, 2, 2],
    [-7, 0.5, 13],
    [0, 0, 1],
    [1000, -1000, 1000],
    [0.5, -0.5, 0],
    [-2.5, -3.5, 6],
    [12, 0, -9],
  ]

  const inputFor = (operation: Input['operation'], a: number[], b: number[]): Input => ({
    ...base,
    operation,
    ax: a[0]!,
    ay: a[1]!,
    az: a[2]!,
    bx: b[0]!,
    by: b[1]!,
    bz: b[2]!,
  })

  test("Lagrange's identity holds: |a × b|² + (a · b)² = |a|²|b|²", () => {
    // A genuinely independent relation between the two products. If either the
    // dot or the cross were subtly wrong, this would not balance.
    for (const a of vectors) {
      for (const b of vectors) {
        const cross = compute(inputFor('cross', a, b))
        const dot = compute(inputFor('dot', a, b))
        const crossMag = primary(cross)
        const dotValue = primary(dot)
        const left = crossMag * crossMag + dotValue * dotValue
        const right = naive.norm(a) ** 2 * naive.norm(b) ** 2
        const scale = Math.max(1, Math.abs(right))
        expect(Math.abs(left - right) / scale, `${a} × ${b}`).toBeLessThan(1e-12)
      }
    }
  })

  test('the cross product is perpendicular to both of its arguments', () => {
    for (const a of vectors) {
      for (const b of vectors) {
        const r = compute(inputFor('cross', a, b))
        const c = [
          stat(r, '(a × b) x component'),
          stat(r, '(a × b) y component'),
          stat(r, '(a × b) z component'),
        ]
        const scale = Math.max(1, naive.norm(c) * naive.norm(a), naive.norm(c) * naive.norm(b))
        expect(Math.abs(naive.dot(c, a)) / scale, `${a} × ${b} ⟂ a`).toBeLessThan(1e-12)
        expect(Math.abs(naive.dot(c, b)) / scale, `${a} × ${b} ⟂ b`).toBeLessThan(1e-12)
        // …and it agrees with a textbook implementation component for component.
        expect(c).toEqual(naive.cross(a, b))
      }
    }
  })

  test('the atan2 angle reproduces the cosine exactly, and matches acos within acos’s own error', () => {
    for (const a of vectors) {
      for (const b of vectors) {
        if (naive.norm(a) === 0 || naive.norm(b) === 0) continue
        const r = compute(inputFor('angle', a, b))
        const degrees = primary(r)
        expect(degrees, `${a} to ${b}`).toBeGreaterThanOrEqual(0)
        expect(degrees, `${a} to ${b}`).toBeLessThanOrEqual(180)

        const cosine = Math.min(1, Math.max(-1, naive.dot(a, b) / (naive.norm(a) * naive.norm(b))))
        // Taking the cosine back off the reported angle must return the number
        // it came from, to full double precision. This is the tight check.
        expect(Math.cos((degrees * Math.PI) / 180), `${a} to ${b}`).toBeCloseTo(cosine, 12)

        /*
         * The comparison against the textbook acos is deliberately LOOSE, and
         * the reason is the whole argument for using atan2. acos has a vertical
         * tangent at ±1, so near-parallel vectors lose about half their
         * significant digits: for a = b here, acos returns 8.5e-7 degrees where
         * the true answer is exactly zero, and atan2 returns exactly zero. A
         * tight tolerance would be asserting that this page reproduces acos's
         * error rather than the angle.
         */
        const viaAcos = (Math.acos(cosine) * 180) / Math.PI
        expect(Math.abs(degrees - viaAcos), `${a} to ${b}`).toBeLessThan(1e-3)
      }
    }
  })

  test('a vector makes an angle of exactly zero with itself', () => {
    for (const a of vectors) {
      if (naive.norm(a) === 0) continue
      const r = compute(inputFor('angle', a, a))
      // atan2(|a × a|, a · a) = atan2(0, positive) = 0, with no rounding at all.
      expect(primary(r), `${a}`).toBe(0)
    }
  })

  test('atan2 keeps its precision where acos falls apart', () => {
    /*
     * Two almost parallel vectors. acos((a·b)/(|a||b|)) forms a quotient a hair
     * below 1 and then takes an arc cosine with a vertical tangent, so it loses
     * roughly half of its significant digits; at 1e-8 radians the quotient
     * rounds to exactly 1 and acos returns 0. The true angle between (1,0,0) and
     * (1, e, 0) is atan(e), which for a small e is e itself.
     */
    for (const epsilon of [1e-4, 1e-6, 1e-8]) {
      const r = compute({ ...base, operation: 'angle', ax: 1, ay: 0, az: 0, bx: 1, by: epsilon, bz: 0 })
      const expectedDegrees = (Math.atan(epsilon) * 180) / Math.PI
      expect(primary(r), `ε=${epsilon}`).toBeCloseTo(expectedDegrees, 12)
      expect(primary(r), `ε=${epsilon}`).toBeGreaterThan(0)
    }
  })

  test('the projection and the rejection add back up to a, and the rejection is perpendicular to b', () => {
    for (const a of vectors) {
      for (const b of vectors) {
        if (naive.norm(b) === 0) continue
        const r = compute(inputFor('projection', a, b))
        const projection = [
          stat(r, 'Vector projection x'),
          stat(r, 'Vector projection y'),
          stat(r, 'Vector projection z'),
        ]
        const rejection = a.map((component, i) => component - projection[i]!)
        const scale = Math.max(1, naive.norm(a) * naive.norm(b))
        expect(Math.abs(naive.dot(rejection, b)) / scale, `${a} onto ${b}`).toBeLessThan(1e-12)
        expect(stat(r, 'Length of the rejection (the perpendicular part)')).toBeCloseTo(naive.norm(rejection), 9)
        // The scalar projection is the signed length of the vector projection.
        const scalar = primary(r)
        expect(Math.abs(scalar), `${a} onto ${b}`).toBeCloseTo(naive.norm(projection), 9)
        expect(Math.sign(scalar) || 0).toBe(Math.sign(naive.dot(a, b)) || 0)
      }
    }
  })

  test('the triangle inequality holds for every pair', () => {
    for (const a of vectors) {
      for (const b of vectors) {
        const sum = primary(compute(inputFor('add', a, b)))
        const difference = primary(compute(inputFor('subtract', a, b)))
        const bound = naive.norm(a) + naive.norm(b)
        expect(sum, `|${a} + ${b}|`).toBeLessThanOrEqual(bound * (1 + 1e-12))
        expect(difference, `|${a} − ${b}|`).toBeLessThanOrEqual(bound * (1 + 1e-12))
        expect(difference).toBeGreaterThanOrEqual(Math.abs(naive.norm(a) - naive.norm(b)) * (1 - 1e-12))
      }
    }
  })

  test('the unit vector has length 1 and points the same way', () => {
    for (const a of vectors) {
      if (naive.norm(a) === 0) continue
      const r = compute(inputFor('magnitude', a, [1, 2, 2]))
      const unit = [
        stat(r, 'Unit vector x component'),
        stat(r, 'Unit vector y component'),
        stat(r, 'Unit vector z component'),
      ]
      expect(naive.norm(unit), `${a}`).toBeCloseTo(1, 12)
      // Same direction: the angle between a and its unit vector is zero, so
      // their cross product vanishes.
      const parallel = naive.cross(a, unit)
      expect(naive.norm(parallel) / Math.max(1, naive.norm(a)), `${a}`).toBeLessThan(1e-12)
    }
  })
})

describe('vector: two dimensions', () => {
  test('2D zeroes the z components rather than hiding their fields', () => {
    // The z boxes still hold their values; compute simply ignores them.
    const r = compute({ ...base, dimensions: '2d', az: 999, bz: -999 })
    expect(r.primary.value).toBe(11) // 3×1 + 4×2, with no z term
    expect(stat(r, 'Magnitude |a|')).toBe(5)
    expect(stat(r, 'Magnitude |b|')).toBeCloseTo(Math.sqrt(5), 15)
    expect(fields.some((f) => f.id === 'az')).toBe(true)
    expect(fields.some((f) => f.id === 'bz')).toBe(true)
  })

  test('the 2D cross product is the scalar z component, and says so', () => {
    // aₓb_y − a_ybₓ = 3×2 − 4×1 = 2.
    const r = compute({ ...base, operation: 'cross', dimensions: '2d' })
    expect(r.primary.label).toBe('Cross product a × b (scalar)')
    expect(r.primary.value).toBe(2)
    expect(r.notes!.join(' ')).toContain('single signed number')
    expect(r.notes!.join(' ')).toContain('signed area')
  })

  test('the 2D cross product changes sign with the winding order', () => {
    const counterClockwise = compute({ ...base, operation: 'cross', dimensions: '2d', ax: 1, ay: 0, az: 0, bx: 0, by: 1, bz: 0 })
    const clockwise = compute({ ...base, operation: 'cross', dimensions: '2d', ax: 0, ay: 1, az: 0, bx: 1, by: 0, bz: 0 })
    expect(counterClockwise.primary.value).toBe(1)
    expect(clockwise.primary.value).toBe(-1)
    // Parallel vectors span no area at all.
    const parallel = compute({ ...base, operation: 'cross', dimensions: '2d', ax: 2, ay: 4, az: 0, bx: 1, by: 2, bz: 0 })
    expect(parallel.primary.value).toBe(0)
  })

  test('2D drops the z stats and steps rather than printing zeros', () => {
    const r = compute({ ...base, operation: 'add', dimensions: '2d' })
    expect(hasStat(r, 'a + b x component')).toBe(true)
    expect(hasStat(r, 'a + b z component')).toBe(false)
    // a + b = (4, 6) in 2D, so |a + b| = √52.
    expect(primary(r)).toBeCloseTo(Math.sqrt(52), 12)
  })

  test('every operation answers in 2D as well as 3D', () => {
    for (const operation of OPERATIONS) {
      for (const dimensions of DIMENSIONS) {
        const r = compute({ ...base, operation, dimensions })
        expect(r.stats!.length, `${operation}/${dimensions}`).toBeGreaterThan(0)
        expect(r.steps!.length, `${operation}/${dimensions}`).toBeGreaterThan(0)
        expect(r.notes!.length, `${operation}/${dimensions}`).toBeGreaterThan(0)
      }
    }
  })
})

describe('vector: refusals', () => {
  test('a zero vector has no angle, and is refused against its own field', () => {
    const zeroA = thrownBy({ ...base, operation: 'angle', ax: 0, ay: 0, az: 0 })
    expect(zeroA).toBeInstanceOf(CalcError)
    expect((zeroA as CalcError).fieldId).toBe('ax')

    const zeroB = thrownBy({ ...base, operation: 'angle', bx: 0, by: 0, bz: 0 })
    expect(zeroB).toBeInstanceOf(CalcError)
    expect((zeroB as CalcError).fieldId).toBe('bx')
  })

  test('a zero vector defines no direction to project onto', () => {
    const err = thrownBy({ ...base, operation: 'projection', bx: 0, by: 0, bz: 0 })
    expect(err).toBeInstanceOf(CalcError)
    expect((err as CalcError).fieldId).toBe('bx')
    // Projecting the zero vector ONTO something is fine — the answer is zero.
    const r = compute({ ...base, operation: 'projection', ax: 0, ay: 0, az: 0 })
    expect(primary(r)).toBe(0)
  })

  test('2D can make a vector zero that was not zero in 3D, and the refusal follows', () => {
    // (0, 0, 5) is a perfectly good 3D vector and the zero vector in 2D.
    expect(thrownBy({ ...base, operation: 'angle', ax: 0, ay: 0, az: 5 })).toBeUndefined()
    const err = thrownBy({ ...base, operation: 'angle', dimensions: '2d', ax: 0, ay: 0, az: 5 })
    expect(err).toBeInstanceOf(CalcError)
    expect((err as CalcError).fieldId).toBe('ax')
  })

  test('the zero vector still has a magnitude — it just has no direction', () => {
    const r = compute({ ...base, operation: 'magnitude', ax: 0, ay: 0, az: 0 })
    expect(r.primary.value).toBe(0)
    expect(hasStat(r, 'Unit vector x component')).toBe(false)
    expect(r.notes!.join(' ')).toContain('cannot be normalised')
  })

  /*
   * `coerceValues` in src/lib/view.ts turns an unparseable entry into a raw NaN
   * and hands it straight to compute, and every ordinary comparison against NaN
   * is false — so a magnitude check alone would let it through.
   */
  const nonFinite = [
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ] as const

  test.each(
    numberFields.flatMap((field) =>
      OPERATIONS.flatMap((operation) =>
        nonFinite.map(([label, value]) => [field.id, operation, label, value] as const),
      ),
    ),
  )('rejects %s = %s in the %s operation with a CalcError', (fieldId, operation, _label, value) => {
    const err = thrownBy({ ...base, operation, [fieldId]: value })
    expect(err, `${fieldId} in ${operation}`).toBeInstanceOf(CalcError)
    expect((err as CalcError).fieldId).toBe(fieldId)
  })

  test('an unknown operation or dimension count is refused against its select', () => {
    expect((thrownBy({ ...base, operation: 'curl' }) as CalcError).fieldId).toBe('operation')
    expect((thrownBy({ ...base, dimensions: '4d' }) as CalcError).fieldId).toBe('dimensions')
  })
})

describe('vector: bounds and shape', () => {
  test('every declared bound is a value compute accepts, in every operation and dimension', () => {
    // The same rule field-bounds.test.ts enforces registry-wide, asserted here
    // so it fails in this directory's fast loop rather than only in a full run.
    for (const field of numberFields) {
      for (const bound of [field.min, field.max]) {
        if (bound === undefined) continue
        for (const operation of OPERATIONS) {
          for (const dimensions of DIMENSIONS) {
            const where = `${field.id}=${bound} in ${operation}/${dimensions}`
            expect(thrownBy({ ...base, operation, dimensions, [field.id]: bound }), where).toBeUndefined()
          }
        }
      }
    }
  })

  test('every number default lands on min + n × step', () => {
    for (const field of numberFields) {
      if (field.min === undefined || field.step === undefined) continue
      const n = (field.default - field.min) / field.step
      expect(Math.abs(n - Math.round(n)), field.id).toBeLessThan(1e-9)
      expect(field.variants, `${field.id} declares no unit variants`).toBeUndefined()
    }
  })

  test('nudging the first number field 1.1× stays valid and moves the result', () => {
    // The e2e suite does exactly this in the DEFAULT operation, so pin it.
    const firstNumber = fields.find((f) => f.kind === 'number')!
    expect(firstNumber.id).toBe('ax')
    expect((firstNumber as { default: number }).default).not.toBe(0)

    const defaults = defaultValues(def) as Input
    expect(defaults.operation).toBe('dot')
    const before = compute(defaults)
    const after = compute({ ...defaults, ax: (firstNumber as { default: number }).default * 1.1 })

    expect(primary(after)).not.toBe(primary(before))
    // a · b becomes 3.3×1 + 4×2 + 0×2 = 11.3.
    expect(primary(after)).toBeCloseTo(11.3, 9)
  })

  test('no parts, no series and no scale, because none of them would say anything', () => {
    // Nothing here is a proportion of a whole and nothing runs over an ordered
    // axis, so drawing either would be decoration pretending to be information.
    expect('scale' in def).toBe(false)
    for (const operation of OPERATIONS) {
      for (const dimensions of DIMENSIONS) {
        const r = compute({ ...base, operation, dimensions })
        expect(r.parts, `${operation}/${dimensions}`).toBeUndefined()
        expect(r.series, `${operation}/${dimensions}`).toBeUndefined()
        expect(r.scaleValue).toBeUndefined()
      }
    }
  })

  test('nothing anywhere in the reachable space formats as NaN', () => {
    const componentValues = [-1000, -2.5, 0, 1, 1000]
    for (const operation of OPERATIONS) {
      for (const dimensions of DIMENSIONS) {
        for (const ax of componentValues) {
          for (const by of componentValues) {
            for (const bz of componentValues) {
              let r: Result
              try {
                r = compute({ ...base, operation, dimensions, ax, by, bz })
              } catch (err) {
                expect(err).toBeInstanceOf(CalcError)
                expect((err as CalcError).fieldId).toBeDefined()
                continue
              }
              const shown: Quantity[] = [
                r.primary,
                ...r.stats!,
                ...r.steps!.filter((s): s is Quantity => !('rule' in s)),
              ]
              const where = `${operation}/${dimensions} ${ax}/${by}/${bz}`
              for (const q of shown) {
                const text = formatValue(q.value, q.format)
                expect(text, where).not.toContain('NaN')
                expect(text, where).not.toContain('Infinity')
                expect(text, where).not.toBe('')
              }
            }
          }
        }
      }
    }
  }, 30_000)

  test('the copy fits a search result and states the boundary with its neighbours', () => {
    expect(def.description.length).toBeGreaterThan(50)
    expect(def.description.length).toBeLessThanOrEqual(160)
    expect(def.seoTitle.length).toBeLessThanOrEqual(70)
    expect(def.intro.length).toBeGreaterThan(40)
    expect(def.faqs.length).toBeGreaterThanOrEqual(3)
    for (const faq of def.faqs) {
      expect(faq.q.endsWith('?')).toBe(true)
      expect(faq.a.length).toBeGreaterThan(40)
    }
    expect(new Set(def.related).size).toBe(def.related.length)
    expect(def.related).not.toContain(def.slug)
    expect(def.category).toBe('science')
    // distance-calculator already owns 3D "how far apart" and slope-calculator
    // owns 2D distance and midpoint; the overlap has to be stated, not ignored.
    expect(def.intro).toContain('distance calculator')
    expect(def.intro).toContain('slope calculator')
    expect(def.faqs.some((f) => f.a.includes('distance calculator'))).toBe(true)
  })
})

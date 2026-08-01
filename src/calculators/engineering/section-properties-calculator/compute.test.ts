import { describe, expect, test } from 'vitest'
import compute from './compute'
import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity } from '../../../lib/types'

/**
 * The closed forms are checked two ways throughout.
 *
 * The first is arithmetic worked out by hand from the formula. The second is
 * NUMERICAL INTEGRATION over the same shape — a fine grid of strips summed
 * directly — which shares no code with the closed form it is checking. A sign
 * error or a transposed exponent survives one of those, never both.
 */

const base = {
  shape: 'hollowRectangle',
  unit: 'mm',
  a: 200,
  b: 120,
  innerHeight: 160,
  innerWidth: 90,
  // The round pair is always present, because there is no per-mode field
  // visibility here — every field renders whatever the section select holds.
  diameter: 200,
  innerDiameter: 160,
} as const

type Input = Partial<Record<keyof typeof base, string | number>>
const run = (over: Input = {}): CalcResult => compute({ ...base, ...over } as never)

const isQuantity = (s: unknown): s is Quantity =>
  typeof s === 'object' && s !== null && 'label' in s

/** Reads a value back out of the engineering-notation string it is printed as. */
const num = (text: string): number => {
  const m = /^(-?[\d.]+) × 10\^(-?\d+)/.exec(text)
  if (m) return Number(m[1]) * Math.pow(10, Number(m[2]))
  return Number(/^(-?[\d.]+)/.exec(text)?.[1] ?? Number.NaN)
}

const stat = (r: CalcResult, label: string): number =>
  num(String((r.stats ?? []).find((s) => s.label.startsWith(label))?.value ?? ''))

const step = (r: CalcResult, label: string): number =>
  num(String((r.steps ?? []).filter(isQuantity).find((s) => s.label.startsWith(label))?.value ?? ''))

/**
 * Second moment of area about the horizontal centroidal axis, by summing
 * strips. Independent of every closed form in compute.ts.
 */
function ixByIntegration(a: number, b: number, a1: number, b1: number, strips = 200_000): number {
  const dy = a / strips
  let total = 0
  for (let i = 0; i < strips; i++) {
    const y = -a / 2 + (i + 0.5) * dy
    const width = Math.abs(y) < a1 / 2 ? b - b1 : b
    total += width * y * y * dy
  }
  return total
}

/** Plastic modulus by integration: first moment of the area about the centroid. */
function zxByIntegration(a: number, b: number, a1: number, b1: number, strips = 200_000): number {
  const dy = a / strips
  let total = 0
  for (let i = 0; i < strips; i++) {
    const y = -a / 2 + (i + 0.5) * dy
    const width = Math.abs(y) < a1 / 2 ? b - b1 : b
    total += width * Math.abs(y) * dy
  }
  return total
}

describe('section-properties: the worked hollow rectangle', () => {
  /*
   * a = 200, b = 120, a₁ = 160, b₁ = 90, in millimetres.
   * A  = 200·120 − 160·90 = 24,000 − 14,400 = 9,600
   * Ix = (120·200³ − 90·160³)/12 = (960,000,000 − 368,640,000)/12 = 49,280,000
   */
  test('area is the outer rectangle less the hole', () => {
    expect(stat(run(), 'Area')).toBeCloseTo(9_600, 6)
    expect(step(run(), 'A =')).toBeCloseTo(9_600, 6)
  })

  test('Ix matches both the closed form and a numerical integration', () => {
    const ix = num(String(run().primary.value))
    expect(ix).toBeCloseTo(49_280_000, 3)
    // Independent route: sum b·y²·dy over the depth, subtracting the hole.
    expect(ix / ixByIntegration(200, 120, 160, 90)).toBeCloseTo(1, 5)
  })

  test('Iy is the same formula with the axes swapped', () => {
    // (120³·200 − 90³·160)/12 = (345,600,000 − 116,640,000)/12 = 19,080,000
    expect(stat(run(), 'Second moment, Iy')).toBeCloseTo(19_080_000, 3)
    // Swapping a with b and a₁ with b₁ must give the same number.
    expect(num(String(run({ a: 120, b: 200, innerHeight: 90, innerWidth: 160 }).primary.value))).toBeCloseTo(
      19_080_000,
      3,
    )
  })

  test('the parallel-axis shift to the outer edge', () => {
    // Ix₁ = Ix + A·cy² = 49,280,000 + 9,600·100² = 145,280,000
    expect(step(run(), 'Ix₁')).toBeCloseTo(145_280_000, 3)
    // Iy₁ = Iy + A·cx² = 19,080,000 + 9,600·60² = 53,640,000
    expect(step(run(), 'Iy₁')).toBeCloseTo(53_640_000, 3)
  })

  test('polar moments are the sum of the two second moments', () => {
    expect(step(run(), 'Jz =')).toBeCloseTo(68_360_000, 3)
    expect(step(run(), 'Jz₁')).toBeCloseTo(198_920_000, 3)
    // Perpendicular-axis theorem, restated: Jz must equal Ix + Iy exactly.
    expect(step(run(), 'Jz =')).toBeCloseTo(step(run(), 'Ix =') + step(run(), 'Iy ='), 3)
  })

  test('radii of gyration are √(I / A)', () => {
    // √(49,280,000 / 9,600) = √5,133.333… = 71.6473…
    expect(step(run(), 'Kx =')).toBeCloseTo(71.6473, 3)
    expect(step(run(), 'Ky =')).toBeCloseTo(44.5814, 3)
    expect(step(run(), 'Kz =')).toBeCloseTo(84.3850, 3)
    expect(step(run(), 'Kx₁')).toBeCloseTo(123.018, 3)
    expect(step(run(), 'Ky₁')).toBeCloseTo(74.7496, 3)
    expect(step(run(), 'Kz₁')).toBeCloseTo(143.947, 3)
  })

  test('section moduli, elastic and plastic', () => {
    // Sx = Ix / (a/2) = 49,280,000 / 100 = 492,800
    expect(stat(run(), 'Elastic modulus')).toBeCloseTo(492_800, 4)
    expect(step(run(), 'Sy =')).toBeCloseTo(318_000, 4)
    // Zx = (120·200² − 90·160²)/4 = (4,800,000 − 2,304,000)/4 = 624,000
    expect(stat(run(), 'Plastic modulus')).toBeCloseTo(624_000, 4)
    expect(step(run(), 'Zy =')).toBeCloseTo(396_000, 4)
    // And by integration, which knows nothing of the formula above.
    expect(stat(run(), 'Plastic modulus') / zxByIntegration(200, 120, 160, 90)).toBeCloseTo(1, 5)
  })
})

describe('section-properties: the solid rectangle it reduces to', () => {
  const solid = { shape: 'rectangle' as const }

  test('a solid rectangle ignores the inner boxes entirely', () => {
    // Whatever the hole fields say, a solid section is 200 × 120 = 24,000.
    expect(stat(run({ ...solid, innerHeight: 160, innerWidth: 90 }), 'Area')).toBeCloseTo(24_000, 6)
    expect(stat(run({ ...solid, innerHeight: 0, innerWidth: 0 }), 'Area')).toBeCloseTo(24_000, 6)
  })

  test('Ix is ba³/12', () => {
    // 120 · 200³ / 12 = 80,000,000
    expect(num(String(run(solid).primary.value))).toBeCloseTo(80_000_000, 3)
  })

  /*
   * The shape factor of a solid rectangle is exactly 1.5 — plastic ba²/4 over
   * elastic ba²/6 — and it falls off as the section is hollowed, because the
   * material that yielding would have recruited is the material now missing.
   */
  test('the shape factor is exactly 1.5 for a solid rectangle', () => {
    expect(stat(run(solid), 'Shape factor')).toBeCloseTo(1.5, 6)
  })

  test('and is lower once the section is hollow', () => {
    expect(stat(run(), 'Shape factor')).toBeLessThan(1.5)
    expect(stat(run(), 'Shape factor')).toBeGreaterThan(1)
  })

  test('a hollow section with a zero hole equals the solid one', () => {
    const asHollow = run({ innerHeight: 0, innerWidth: 0 })
    expect(num(String(asHollow.primary.value))).toBeCloseTo(80_000_000, 3)
    expect(stat(asHollow, 'Area')).toBeCloseTo(24_000, 6)
  })
})

/**
 * The circle family, checked the same two ways: closed form against arithmetic
 * worked by hand, and against strips summed over the depth. The strip width is
 * the chord 2√(R²−y²), which shares nothing with π(R⁴−r⁴)/4.
 */
function circleByIntegration(D: number, d: number, strips = 400_000) {
  const R = D / 2
  const r = d / 2
  const chord = (y: number, rad: number) => (Math.abs(y) < rad ? 2 * Math.sqrt(rad * rad - y * y) : 0)
  const dy = (2 * R) / strips
  let A = 0
  let Ix = 0
  let Zx = 0
  for (let i = 0; i < strips; i++) {
    const y = -R + (i + 0.5) * dy
    const w = chord(y, R) - chord(y, r)
    A += w * dy
    Ix += w * y * y * dy
    Zx += w * Math.abs(y) * dy
  }
  return { A, Ix, Zx }
}

describe('section-properties: the circle family', () => {
  const tube = { shape: 'hollowCircle' as const, diameter: 200, innerDiameter: 160 }
  const disc = { shape: 'circle' as const, diameter: 200 }

  /*
   * Compared by RATIO throughout, not by absolute difference. Every value here
   * is read back out of the engineering-notation string the page prints, which
   * carries about five significant figures — so an irrational like π·100⁴/4 can
   * never match a full-precision constant exactly, however right the code is.
   * A ratio is the honest test of a number you can only see rounded.
   */
  test('a solid circle is πD⁴/64, and πD²/4 in area', () => {
    // A  = π·100² = 31,415.93
    // Ix = π·100⁴/4 = 78,539,816
    expect(stat(run(disc), 'Area') / (Math.PI * 100 ** 2)).toBeCloseTo(1, 4)
    expect(num(String(run(disc).primary.value)) / ((Math.PI * 100 ** 4) / 4)).toBeCloseTo(1, 4)
  })

  test('a tube subtracts the bore, and agrees with a strip integration', () => {
    const r = run(tube)
    const ref = circleByIntegration(200, 160)
    // A = π(100² − 80²) = π·3,600 = 11,309.73
    expect(stat(r, 'Area') / (Math.PI * (100 ** 2 - 80 ** 2))).toBeCloseTo(1, 4)
    expect(stat(r, 'Area') / ref.A).toBeCloseTo(1, 4)
    // Ix = π(100⁴ − 80⁴)/4 = 46,369,908
    expect(num(String(r.primary.value)) / ref.Ix).toBeCloseTo(1, 4)
    expect(stat(r, 'Plastic modulus') / ref.Zx).toBeCloseTo(1, 4)
  })

  test('a circle is symmetric, so Ix equals Iy exactly', () => {
    const r = run(tube)
    expect(step(r, 'Ix =')).toBeCloseTo(step(r, 'Iy ='), 6)
    // ...and the polar moment is therefore exactly twice either one.
    expect(step(r, 'Jz =')).toBeCloseTo(2 * step(r, 'Ix ='), 6)
  })

  test('the radius of gyration of a tube is √(R² + r²)/2', () => {
    // A classical identity that falls out of √(Ix/A) once the π cancels.
    expect(step(run(tube), 'Kx =')).toBeCloseTo(Math.sqrt(100 ** 2 + 80 ** 2) / 2, 3)
    // A solid circle collapses that to R/2.
    expect(step(run(disc), 'Kx =')).toBeCloseTo(50, 6)
  })

  test('the shape factor of a solid circle is 16/3π', () => {
    // 1.6977…, higher than a rectangle's 1.5 — the classical result.
    expect(stat(run(disc), 'Shape factor')).toBeCloseTo(16 / (3 * Math.PI), 4)
  })

  test('a bore of zero is the solid disc', () => {
    expect(
      num(String(run({ ...tube, innerDiameter: 0 }).primary.value)) / ((Math.PI * 100 ** 4) / 4),
    ).toBeCloseTo(1, 4)
  })

  test('the circle branch ignores the rectangle boxes entirely', () => {
    // Whatever a, b, a₁ and b₁ hold, they cannot change a circle or stop it
    // answering — there is no per-mode field visibility in this codebase.
    const messy = { a: 1, b: 1, innerHeight: 4999, innerWidth: 4999 }
    expect(
      num(String(run({ ...disc, ...messy }).primary.value)) / ((Math.PI * 100 ** 4) / 4),
    ).toBeCloseTo(1, 4)
    expect(() => compute({ ...base, ...tube, ...messy } as never)).not.toThrow()
  })

  test('the formulas shown follow the section, not the last one selected', () => {
    const roundSteps = (run(tube).steps ?? []).filter(isQuantity).map((s) => s.label)
    expect(roundSteps.some((l) => l.includes('π(R⁴ − r⁴)'))).toBe(true)
    expect(roundSteps.some((l) => l.includes('ba³'))).toBe(false)

    const boxSteps = (run().steps ?? []).filter(isQuantity).map((s) => s.label)
    expect(boxSteps.some((l) => l.includes('ba³'))).toBe(true)
    expect(boxSteps.some((l) => l.includes('π'))).toBe(false)
  })

  test('the chart axis names the dimension the sweep actually moved', () => {
    expect(run(tube).chart!.xLabel).toContain('Inner diameter')
    expect(run().chart!.xLabel).toContain('Inner height')
  })

  test('a bore at least as wide as the tube is refused', () => {
    let field: string | undefined
    try {
      compute({ ...base, ...tube, innerDiameter: 200 } as never)
    } catch (err) {
      field = err instanceof CalcError ? err.fieldId : 'wrong-error'
    }
    expect(field).toBe('innerDiameter')
  })
})

describe('section-properties: units are a relabelling, not a recalculation', () => {
  test('the same section in centimetres gives the same numbers', () => {
    // 20 cm × 12 cm with a 16 × 9 hole is the millimetre section, restated.
    const cm = run({ unit: 'cm', a: 20, b: 12, innerHeight: 16, innerWidth: 9 })
    expect(stat(cm, 'Area')).toBeCloseTo(96, 6) // 9,600 mm² = 96 cm²
    expect(num(String(cm.primary.value))).toBeCloseTo(4_928, 3) // 49,280,000 mm⁴ = 4,928 cm⁴
  })

  test('the unit is carried into every label', () => {
    const r = run({ unit: 'in' })
    expect(String(r.primary.value)).toContain('in⁴')
    expect(String(r.stats![0]!.value)).toContain('in²')
  })
})

describe('section-properties: the parts are an honest decomposition', () => {
  test('material plus void is the gross rectangle', () => {
    const r = run()
    const sum = r.parts!.reduce((acc, p) => acc + p.value, 0)
    expect(sum).toBeCloseTo(Number(r.partsTotal!.value), 6)
    expect(Number(r.partsTotal!.value)).toBeCloseTo(24_000, 6)
  })

  test('a solid section has no void slice at all', () => {
    const r = run({ shape: 'rectangle' })
    expect(r.parts).toHaveLength(1)
    expect(r.parts![0]!.label).toBe('Material')
  })
})

describe('section-properties: the efficiency curve', () => {
  test('both curves start at 100% of the solid section', () => {
    const [stiffness, material] = run().series!
    expect(stiffness!.points[0]![1]).toBeCloseTo(100, 6)
    expect(material!.points[0]![1]).toBeCloseTo(100, 6)
  })

  test('stiffness is kept better than material is — the whole point of a box', () => {
    const [stiffness, material] = run().series!
    for (let i = 1; i < stiffness!.points.length; i++) {
      expect(stiffness!.points[i]![1]).toBeGreaterThan(material!.points[i]![1])
    }
  })

  test('both fall monotonically as the hole grows', () => {
    for (const s of run().series!) {
      for (let i = 1; i < s.points.length; i++) {
        expect(s.points[i]![1]).toBeLessThanOrEqual(s.points[i - 1]![1] + 1e-9)
        expect(s.points[i]![0]).toBeGreaterThan(s.points[i - 1]![0])
      }
    }
  })
})

describe('section-properties: refusals', () => {
  const fieldOf = (over: Input): string | undefined => {
    try {
      compute({ ...base, ...over } as never)
    } catch (err) {
      return err instanceof CalcError ? err.fieldId : `not-a-CalcError`
    }
    return undefined
  }

  test('a hole at least as big as the section leaves no material', () => {
    expect(fieldOf({ innerHeight: 200 })).toBe('innerHeight')
    expect(fieldOf({ innerHeight: 250 })).toBe('innerHeight')
    expect(fieldOf({ innerWidth: 120 })).toBe('innerWidth')
  })

  test('either inner dimension at zero is a solid section, not an error', () => {
    // A hole of zero height has zero area. Refusing it would also make the
    // slider lie, since zero is the bottom of the inner field's own track.
    expect(fieldOf({ innerHeight: 0 })).toBeUndefined()
    expect(fieldOf({ innerWidth: 0 })).toBeUndefined()
    expect(stat(run({ innerHeight: 0 }), 'Area')).toBeCloseTo(24_000, 6)
    expect(stat(run({ innerWidth: 0 }), 'Area')).toBeCloseTo(24_000, 6)
  })

  test('non-finite input is blamed on its own field, never returned as NaN', () => {
    // coerceValues emits NaN for unparseable input, and `a > 0` is false for
    // NaN, so a magnitude check alone would let it through.
    expect(fieldOf({ a: Number.NaN })).toBe('a')
    expect(fieldOf({ b: Number.NaN })).toBe('b')
    expect(fieldOf({ innerHeight: Number.NaN })).toBe('innerHeight')
    expect(fieldOf({ a: 0 })).toBe('a')
  })

  test('every declared slider bound is a value compute accepts', () => {
    // field-bounds.test.ts asserts this too; pinning it here keeps the failure
    // local when a bound and the guard drift apart.
    for (const shape of ['hollowRectangle', 'rectangle']) {
      expect(() => compute({ ...base, shape, a: 1, b: 1, innerHeight: 0, innerWidth: 0 } as never)).not.toThrow()
      expect(() =>
        compute({ ...base, shape, a: 5000, b: 5000, innerHeight: 4999, innerWidth: 4999 } as never),
      ).not.toThrow()
    }
  })
})

describe('section-properties: the nudge the end-to-end suite applies', () => {
  test('a at 1.1x its default stays valid and moves every property', () => {
    const nudged = run({ a: 220 })
    expect(num(String(nudged.primary.value))).not.toBeCloseTo(49_280_000, 0)
    // (120·220³ − 90·160³)/12 = (1,277,760,000 − 368,640,000)/12 = 75,760,000
    expect(num(String(nudged.primary.value))).toBeCloseTo(75_760_000, 3)
  })
})

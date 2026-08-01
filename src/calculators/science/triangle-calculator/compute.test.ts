import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { CalcError } from '../../../lib/types'
import { formatValue } from '../../../lib/format'
import { defaultValues } from '../../../lib/view'

type Input = Parameters<typeof compute>[0]
type Result = ReturnType<typeof compute>

/**
 * Not `as const`: the fixture is spread with numeric overrides throughout, and
 * literal-pinned types would reject `{ sideA: 3 }` because the type is the
 * literal 5.
 */
const base: Input = {
  mode: 'sas',
  sideA: 5,
  sideB: 7,
  sideC: 4.95,
  angleA: 45.5817,
  angleB: 89.4183,
  angleC: 45,
}

const MODES = ['sas', 'sss', 'asa', 'aas', 'ssa'] as const

const raw = (r: Result, label: string) => r.stats!.find((s) => s.label === label)!.value
const num = (r: Result, label: string) => Number(raw(r, label))

interface Parts {
  a: number
  b: number
  c: number
  A: number
  B: number
  C: number
}

/** All six parts of the solved triangle, whichever three went in. */
const six = (r: Result): Parts => ({
  a: num(r, 'Side a'),
  b: num(r, 'Side b'),
  c: num(r, 'Side c'),
  A: num(r, 'Angle A'),
  B: num(r, 'Angle B'),
  C: num(r, 'Angle C'),
})

const stepLabels = (r: Result) =>
  r.steps!.filter((s) => !('rule' in s)).map((s) => (s as { label: string }).label)

const thrownBy = (input: Input): unknown => {
  try {
    compute(input)
    return undefined
  } catch (err) {
    return err
  }
}

const fieldOf = (input: Input): string | undefined => {
  const err = thrownBy(input)
  expect(err).toBeInstanceOf(CalcError)
  return (err as CalcError).fieldId
}

/**
 * THE INDEPENDENT CHECK.
 *
 * A triangle built from three plain (x, y) vertices, measured with Pythagoras
 * and atan2 alone. No law of cosines, no law of sines, no shared code with
 * `compute` — so when the two agree it is genuine corroboration rather than the
 * same expression evaluated twice. Area comes from the cross product, which is
 * a third route again, independent of Heron and of ½ab·sin C.
 */
function fromVertices(
  [ax, ay]: readonly [number, number],
  [bx, by]: readonly [number, number],
  [cx, cy]: readonly [number, number],
): Parts & { area: number; perimeter: number } {
  const dist = (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x2 - x1, y2 - y1)
  const vertexAngle = (
    vx: number,
    vy: number,
    px: number,
    py: number,
    qx: number,
    qy: number,
  ) => {
    const ux = px - vx
    const uy = py - vy
    const wx = qx - vx
    const wy = qy - vy
    return Math.abs(Math.atan2(ux * wy - uy * wx, ux * wx + uy * wy)) * (180 / Math.PI)
  }

  const a = dist(bx, by, cx, cy)
  const b = dist(ax, ay, cx, cy)
  const c = dist(ax, ay, bx, by)

  return {
    a,
    b,
    c,
    A: vertexAngle(ax, ay, bx, by, cx, cy),
    B: vertexAngle(bx, by, ax, ay, cx, cy),
    C: vertexAngle(cx, cy, ax, ay, bx, by),
    area: Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2,
    perimeter: a + b + c,
  }
}

describe('triangle: the anchor', () => {
  /*
   * a = 5, b = 7, C = 45°, worked through by hand:
   *
   *   c² = 25 + 49 − 2·5·7·cos 45° = 74 − 70·0.7071067811865476
   *      = 74 − 49.497474683058325 = 24.502525316941675
   *   c  = 4.950002557266175
   *   cos A = (b² + c² − a²) ÷ 2bc = 48.502525316941675 ÷ 69.30003580172645
   *         = 0.6998917786379173
   *   A  = 45.581677969386639°,  B = 180 − 45 − A = 89.418322030613353°
   *
   * Cross-checked below against the law of SINES, which uses none of the same
   * arithmetic: sin A = a·sin C ÷ c = 3.5355339059327378 ÷ 4.950002557266175.
   */
  test('a = 5, b = 7, C = 45° solves to c = 4.950002557266175', () => {
    const r = compute(base)
    expect(num(r, 'Side c')).toBeCloseTo(4.950002557266175, 12)
    expect(num(r, 'Angle A')).toBeCloseTo(45.581677969386639, 10)
    expect(num(r, 'Angle B')).toBeCloseTo(89.418322030613353, 10)
  })

  test('the law of sines agrees with the law of cosines on angle A', () => {
    const { a, c, C, A } = six(compute(base))
    const bySines = Math.asin((a * Math.sin((C * Math.PI) / 180)) / c) * (180 / Math.PI)
    expect(bySines).toBeCloseTo(A, 10)
  })

  test('the headline at the defaults is side c', () => {
    const r = compute(defaultValues(def) as Input)
    expect(r.primary.label).toBe('Side c')
    expect(formatValue(r.primary.value, r.primary.format)).toBe('4.950003 units')
    expect(def.resultLabel).toBe(r.primary.label)
  })

  test('area and perimeter at the defaults', () => {
    const r = compute(base)
    // ½·5·7·sin 45° = 17.5 · 0.7071067811865476
    expect(num(r, 'Area')).toBeCloseTo(12.37436867076458, 12)
    expect(num(r, 'Perimeter')).toBeCloseTo(16.950002557266175, 12)
    expect(raw(r, 'Triangle type')).toBe('Acute scalene')
  })

  /*
   * The defaults are ONE triangle, seeded at the precision each field displays,
   * so every mode reads three parts of the same shape and returns the same
   * other three.
   *
   * The tolerances are not slack, they are the honest consequence of seeding
   * irrational values into decimal fields. Four of the modes land within 1e-5.
   * SSA is looser because it is genuinely ill-conditioned here: this triangle is
   * 0.58° off a right angle at B, where sin B = (b ÷ a)·sin A magnifies an error
   * in A by 96×, so the 2.2e-5° rounding on the angle A seed reappears as
   * 2.1e-3° on B. Tightening it is not a matter of better arithmetic — see the
   * comment in fields.ts.
   */
  test('all five modes return the same triangle from the same defaults', () => {
    const want = six(compute(base))
    for (const mode of MODES) {
      const got = six(compute({ ...base, mode }))
      const tolerance = mode === 'ssa' ? 2 : 4
      for (const key of ['a', 'b', 'c'] as const) {
        expect(got[key], `${mode}.${key}`).toBeCloseTo(want[key], tolerance)
      }
      for (const key of ['A', 'B', 'C'] as const) {
        expect(got[key], `${mode}.${key}`).toBeCloseTo(want[key], tolerance)
      }
      expect(got.A + got.B + got.C, `${mode} angle sum`).toBeCloseTo(180, 10)
    }
  })

  test('each mode names its own headline, and never moves it with the input', () => {
    const expected: Record<(typeof MODES)[number], string> = {
      sas: 'Side c',
      sss: 'Angle A',
      asa: 'Side a',
      aas: 'Side b',
      ssa: 'Angle B',
    }
    for (const mode of MODES) {
      expect(compute({ ...base, mode }).primary.label, mode).toBe(expected[mode])
      // A different, still valid triangle must keep the same label.
      const moved = compute({ ...base, mode, sideA: 4, sideB: 6, sideC: 5, angleA: 40, angleB: 70, angleC: 60 })
      expect(moved.primary.label, `${mode} moved`).toBe(expected[mode])
    }
  })

  test('the formula that ran is the one named in the steps', () => {
    expect(stepLabels(compute({ ...base, mode: 'sas' }))).toContain('c = √(a² + b² − 2ab·cos C)')
    expect(stepLabels(compute({ ...base, mode: 'sss' }))).toContain('B = acos((a² + c² − b²) ÷ 2ac)')
    expect(stepLabels(compute({ ...base, mode: 'asa' }))).toContain('a = c·sin A ÷ sin C')
    expect(stepLabels(compute({ ...base, mode: 'aas' }))).toContain('b = a·sin B ÷ sin A')
    expect(stepLabels(compute({ ...base, mode: 'ssa' }))).toContain('B = asin(b·sin A ÷ a)')
  })

  test('the end-to-end nudge of side a stays valid and changes the answer', () => {
    // tests/calculators.spec.ts sets the first number field to 1.1x its default.
    const before = compute(base)
    const after = compute({ ...base, sideA: 5.5 })
    expect(Number(after.primary.value)).toBeCloseTo(4.980239, 6)
    expect(after.primary.value).not.toBe(before.primary.value)
  })
})

describe('triangle: cross-checked against plain coordinates', () => {
  /** Vertices A, B, C. Deliberately scalene, obtuse, thin and large in turn. */
  const shapes: ReadonlyArray<
    readonly [readonly [number, number], readonly [number, number], readonly [number, number]]
  > = [
    [[0, 0], [6, 0], [2, 5]],
    [[0, 0], [10, 0], [9, 1]],
    [[0, 0], [3, 0], [-4, 2]],
    [[0, 0], [1, 0], [0.5, 12]],
    [[0, 0], [800, 0], [120, 640]],
    [[0, 0], [4, 0], [4, 3]],
    [[-2.5, -1.25], [3.75, 0.5], [0.25, 4.5]],
  ]

  test.each(shapes.map((s, i) => [i, s] as const))(
    'shape %i is recovered identically by every mode',
    (_i, [vA, vB, vC]) => {
      const want = fromVertices(vA, vB, vC)
      const input: Input = {
        mode: 'sas',
        sideA: want.a,
        sideB: want.b,
        sideC: want.c,
        angleA: want.A,
        angleB: want.B,
        angleC: want.C,
      }

      for (const mode of MODES) {
        // SSA is ambiguous exactly when a < b; the first solution is then the
        // acute-B one, which is the shape we handed in only if B < 90.
        if (mode === 'ssa' && want.a < want.b && want.B > 90) continue

        const r = compute({ ...input, mode })
        const got = six(r)
        for (const key of ['a', 'b', 'c'] as const) {
          expect(got[key], `${mode}.${key}`).toBeCloseTo(want[key], 6)
        }
        for (const key of ['A', 'B', 'C'] as const) {
          expect(got[key], `${mode}.${key}`).toBeCloseTo(want[key], 6)
        }
        // The cross product knows nothing of ½ab·sin C or of Heron.
        expect(num(r, 'Area'), `${mode} area`).toBeCloseTo(want.area, 6)
        expect(num(r, 'Perimeter'), `${mode} perimeter`).toBeCloseTo(want.perimeter, 6)
      }
    },
  )

  test('the area also matches Heron’s formula', () => {
    for (const [vA, vB, vC] of shapes) {
      const want = fromVertices(vA, vB, vC)
      const s = want.perimeter / 2
      const heron = Math.sqrt(s * (s - want.a) * (s - want.b) * (s - want.c))
      const r = compute({
        mode: 'sss',
        sideA: want.a,
        sideB: want.b,
        sideC: want.c,
        angleA: 60,
        angleB: 60,
        angleC: 60,
      })
      expect(num(r, 'Area')).toBeCloseTo(heron, 6)
    }
  })
})

describe('triangle: published anchors', () => {
  test('3-4-5 is right-angled, with 36.8699° and 53.1301°', () => {
    const r = compute({ ...base, mode: 'sss', sideA: 3, sideB: 4, sideC: 5 })
    // acos(0.8) and acos(0.6) — the school 3-4-5 angles, to four decimals.
    expect(num(r, 'Angle A')).toBeCloseTo(36.86989764584401, 10)
    expect(num(r, 'Angle B')).toBeCloseTo(53.13010235415599, 10)
    expect(num(r, 'Angle C')).toBeCloseTo(90, 10)
    expect(num(r, 'Area')).toBeCloseTo(6, 10)
    expect(num(r, 'Perimeter')).toBe(12)
    expect(raw(r, 'Triangle type')).toBe('Right scalene')
  })

  test('an equilateral triangle is three 60° angles and s²√3 ÷ 4', () => {
    const r = compute({ ...base, mode: 'sss', sideA: 5, sideB: 5, sideC: 5 })
    expect(num(r, 'Angle A')).toBeCloseTo(60, 10)
    expect(num(r, 'Angle B')).toBeCloseTo(60, 10)
    expect(num(r, 'Angle C')).toBeCloseTo(60, 10)
    expect(num(r, 'Area')).toBeCloseTo(10.825317547305483, 10)
    expect(raw(r, 'Triangle type')).toBe('Equilateral')
  })

  test('the 30-60-90 triangle has sides in the ratio 1 : √3 : 2', () => {
    const r = compute({ ...base, mode: 'aas', angleA: 30, angleB: 60, sideA: 1 })
    expect(num(r, 'Angle C')).toBeCloseTo(90, 10)
    expect(num(r, 'Side b')).toBeCloseTo(Math.sqrt(3), 12)
    expect(num(r, 'Side c')).toBeCloseTo(2, 12)
    expect(raw(r, 'Triangle type')).toBe('Right scalene')
  })

  test('the 45-45-90 triangle has two legs of 1 and a hypotenuse of √2', () => {
    // B is the right angle, so side b is the hypotenuse and a and c are the legs.
    const r = compute({ ...base, mode: 'asa', angleA: 45, angleB: 90, sideC: 1 })
    expect(num(r, 'Angle C')).toBeCloseTo(45, 10)
    expect(num(r, 'Side a')).toBeCloseTo(1, 12)
    expect(num(r, 'Side b')).toBeCloseTo(Math.SQRT2, 12)
    expect(num(r, 'Area')).toBeCloseTo(0.5, 12)
    expect(raw(r, 'Triangle type')).toBe('Right isosceles')
  })

  test('SAS with a 90° included angle reproduces Pythagoras', () => {
    const r = compute({ ...base, mode: 'sas', sideA: 3, sideB: 4, angleC: 90 })
    expect(num(r, 'Side c')).toBeCloseTo(5, 12)
    expect(num(r, 'Area')).toBeCloseTo(6, 12)
    expect(raw(r, 'Triangle type')).toBe('Right scalene')
  })

  test('an obtuse triangle is not mistaken for its acute supplement', () => {
    // 2, 3, 4: cos C = (4 + 9 − 16) ÷ 12 = −0.25, so C = 104.4775°. A law of
    // sines solve would have reported 75.5225° and passed every other check.
    const r = compute({ ...base, mode: 'sss', sideA: 2, sideB: 3, sideC: 4 })
    expect(num(r, 'Angle C')).toBeCloseTo(Math.acos(-0.25) * (180 / Math.PI), 10)
    expect(num(r, 'Angle C')).toBeGreaterThan(90)
    expect(raw(r, 'Triangle type')).toBe('Obtuse scalene')
  })
})

describe('triangle: the SSA ambiguous case', () => {
  const ssa = (sideA: number, sideB: number, angleA: number): Input => ({
    ...base,
    mode: 'ssa',
    sideA,
    sideB,
    angleA,
  })

  test('a = 7, b = 10, A = 30° gives two triangles', () => {
    // sin B = 10·sin 30° ÷ 7 = 5/7 = 0.7142857142857143, so B is 45.5847° or
    // its supplement 134.4153°, and both leave room for a positive angle C.
    const r = compute(ssa(7, 10, 30))
    expect(num(r, 'Angle B')).toBeCloseTo(45.58469140280702, 10)
    expect(num(r, 'Angle C')).toBeCloseTo(104.41530859719299, 10)
    expect(num(r, 'Side c')).toBeCloseTo(13.559233523410743, 10)

    const labels = stepLabels(r)
    expect(labels).toContain('Second solution: B = 180° − B₁')
    const second = r.steps!.filter((s) => !('rule' in s)) as Array<{ label: string; value: number }>
    const byLabel = (label: string) => second.find((s) => s.label === label)!.value
    expect(byLabel('Second solution: B = 180° − B₁')).toBeCloseTo(134.415308597193, 10)
    expect(byLabel('Second solution: C = 180° − A − B')).toBeCloseTo(15.58469140280701, 10)
    expect(byLabel('Second solution: c = a·sin C ÷ sin A')).toBeCloseTo(3.761274552278027, 10)
    expect(r.notes!.some((n) => n.includes('Two different triangles'))).toBe(true)
  })

  test('the two solutions are both genuine triangles, checked back through SSS', () => {
    const r = compute(ssa(7, 10, 30))
    const second = r.steps!.filter((s) => !('rule' in s)) as Array<{ label: string; value: number }>
    const c2 = second.find((s) => s.label === 'Second solution: c = a·sin C ÷ sin A')!.value

    // Feed each candidate's three sides back in as SSS. If the SSA branch had
    // invented a shape, the angle it claims would not come back out.
    const first = compute({ ...base, mode: 'sss', sideA: 7, sideB: 10, sideC: num(r, 'Side c') })
    expect(num(first, 'Angle A')).toBeCloseTo(30, 8)
    const alt = compute({ ...base, mode: 'sss', sideA: 7, sideB: 10, sideC: c2 })
    expect(num(alt, 'Angle A')).toBeCloseTo(30, 8)
    expect(num(alt, 'Angle B')).toBeCloseTo(134.415308597193, 8)
  })

  test('a >= b gives exactly one triangle — the supplement leaves no room for C', () => {
    // a = 10, b = 7, A = 30°: B = 20.4873°, and 180 − B = 159.5127° would take
    // the angle total to 189.51°.
    const r = compute(ssa(10, 7, 30))
    expect(num(r, 'Angle B')).toBeCloseTo(20.487315114722662, 10)
    expect(num(r, 'Angle C')).toBeCloseTo(129.51268488527734, 10)
    expect(num(r, 'Side c')).toBeCloseTo(15.429674824088673, 10)
    expect(stepLabels(r)).not.toContain('Second solution: B = 180° − B₁')
    expect(r.notes!.some((n) => n.includes('Only one triangle fits'))).toBe(true)
  })

  test('a exactly equal to the altitude gives one right-angled triangle', () => {
    // b·sin A = 10·sin 30° = 5 = a. The tangent case: one triangle, B = 90°.
    // sin 30° is 0.49999999999999994 in a double, so this only holds because
    // the tangent case is detected on sin B rather than read back off asin.
    const r = compute(ssa(5, 10, 30))
    expect(num(r, 'Angle B')).toBe(90)
    expect(num(r, 'Angle C')).toBeCloseTo(60, 12)
    expect(num(r, 'Side c')).toBeCloseTo(5 * Math.sqrt(3), 12)
    expect(raw(r, 'Triangle type')).toBe('Right scalene')
    expect(stepLabels(r)).not.toContain('Second solution: B = 180° − B₁')
  })

  test('a shorter than the altitude gives no triangle at all', () => {
    // b·sin A = 5, and side a of 3 can never reach the far side.
    const err = thrownBy(ssa(3, 10, 30)) as CalcError
    expect(err).toBeInstanceOf(CalcError)
    expect(err.fieldId).toBe('sideA')
    expect(err.message).toContain('too short')
  })

  test('an obtuse angle A needs side a to be the longest side', () => {
    expect(fieldOf(ssa(5, 7, 120))).toBe('angleA')
    // Same angle, but now a is the longest side, so it closes.
    const r = compute(ssa(9, 7, 120))
    expect(num(r, 'Angle B')).toBeCloseTo(
      Math.asin((7 * Math.sin((120 * Math.PI) / 180)) / 9) * (180 / Math.PI),
      10,
    )
    expect(num(r, 'Angle A') + num(r, 'Angle B') + num(r, 'Angle C')).toBeCloseTo(180, 10)
  })
})

describe('triangle: refusals', () => {
  test('the triangle inequality is enforced, and blamed on the long side', () => {
    expect(fieldOf({ ...base, mode: 'sss', sideA: 1, sideB: 2, sideC: 9 })).toBe('sideC')
    expect(fieldOf({ ...base, mode: 'sss', sideA: 1, sideB: 9, sideC: 2 })).toBe('sideB')
    expect(fieldOf({ ...base, mode: 'sss', sideA: 9, sideB: 1, sideC: 2 })).toBe('sideA')
  })

  test('sides that exactly touch are refused too — three points on a line', () => {
    expect(fieldOf({ ...base, mode: 'sss', sideA: 2, sideB: 3, sideC: 5 })).toBe('sideC')
    // One thousandth clear of collinear is a real, extremely thin triangle:
    // cos C = (4 + 9 − 4.999²) ÷ 12 = −0.99916675, so C = 177.6609°.
    const r = compute({ ...base, mode: 'sss', sideA: 2, sideB: 3, sideC: 4.999 })
    expect(num(r, 'Angle C')).toBeCloseTo(177.66086411081662, 8)
    expect(num(r, 'Area')).toBeGreaterThan(0)
    expect(num(r, 'Angle A') + num(r, 'Angle B') + num(r, 'Angle C')).toBeCloseTo(180, 10)
  })

  test('two angles cannot spend the whole 180°', () => {
    expect(fieldOf({ ...base, mode: 'asa', angleA: 120, angleB: 60 })).toBe('angleB')
    expect(fieldOf({ ...base, mode: 'aas', angleA: 100, angleB: 95 })).toBe('angleB')
    // 179.9° and 0.0999° leaves a hundredth of a degree, which is fine.
    expect(() => compute({ ...base, mode: 'asa', angleA: 179.9, angleB: 0.09 })).not.toThrow()
  })

  test('non-positive sides and angles are refused against their own field', () => {
    expect(fieldOf({ ...base, mode: 'sas', sideA: 0 })).toBe('sideA')
    expect(fieldOf({ ...base, mode: 'sas', sideB: -3 })).toBe('sideB')
    expect(fieldOf({ ...base, mode: 'sss', sideC: 0 })).toBe('sideC')
    expect(fieldOf({ ...base, mode: 'sas', angleC: 0 })).toBe('angleC')
    expect(fieldOf({ ...base, mode: 'sas', angleC: 180 })).toBe('angleC')
    expect(fieldOf({ ...base, mode: 'asa', angleA: -10 })).toBe('angleA')
    expect(fieldOf({ ...base, mode: 'asa', angleB: 200 })).toBe('angleB')
  })

  test('an unparseable field is a refusal, never a NaN', () => {
    // coerceValues emits a raw NaN, and `value <= 0` is false for NaN — so this
    // is the check that would fall through if finiteness were tested second.
    expect(fieldOf({ ...base, mode: 'sas', sideA: Number.NaN })).toBe('sideA')
    expect(fieldOf({ ...base, mode: 'sas', sideB: Number.NaN })).toBe('sideB')
    expect(fieldOf({ ...base, mode: 'sas', angleC: Number.NaN })).toBe('angleC')
    expect(fieldOf({ ...base, mode: 'sss', sideC: Number.NaN })).toBe('sideC')
    expect(fieldOf({ ...base, mode: 'asa', angleA: Number.NaN })).toBe('angleA')
    expect(fieldOf({ ...base, mode: 'aas', angleB: Number.NaN })).toBe('angleB')
    expect(fieldOf({ ...base, mode: 'ssa', angleA: Number.NaN })).toBe('angleA')
    expect(fieldOf({ ...base, mode: 'sas', sideA: Number.POSITIVE_INFINITY })).toBe('sideA')
  })

  test('an unknown mode is refused against the selector', () => {
    expect(fieldOf({ ...base, mode: 'sxs' })).toBe('mode')
  })

  test('a field the mode does not read is left alone, however broken', () => {
    // SAS reads a, b and C only. The island still holds whatever was last typed
    // in the other four boxes, and refusing over those would be surprising.
    const r = compute({
      ...base,
      mode: 'sas',
      sideC: Number.NaN,
      angleA: -999,
      angleB: Number.NaN,
    })
    expect(num(r, 'Side c')).toBeCloseTo(4.950002557266175, 12)
  })
})

describe('triangle: the result shape', () => {
  test('the three angles are the parts, and they total exactly 180°', () => {
    for (const mode of MODES) {
      const r = compute({ ...base, mode })
      expect(r.parts!.map((p) => p.label)).toEqual(['Angle A', 'Angle B', 'Angle C'])
      expect(Number(r.partsTotal!.value)).toBe(180)
      const sum = r.parts!.reduce((total, p) => total + p.value, 0)
      // Exact by construction: one angle is always derived by subtraction.
      expect(sum, mode).toBeCloseTo(180, 10)
      for (const part of r.parts!) expect(part.value, mode).toBeGreaterThanOrEqual(0)
    }
  })

  test('nothing drawable is missing at the defaults', () => {
    const r = compute(defaultValues(def) as Input)
    expect(r.parts!.length).toBe(3)
    expect(r.stats!.length).toBeGreaterThan(0)
    expect(r.steps!.length).toBeGreaterThan(0)
    // No trend to plot and no band to fall into: neither is declared. `satisfies`
    // keeps the literal type, so an absent `scale` is not a property to read.
    expect(r.series).toBeUndefined()
    expect('scale' in def).toBe(false)
  })

  test('no result anywhere in the input space carries a NaN', () => {
    const values = [0.01, 0.5, 1, 2, 4.95, 5, 7, 12, 100, 1000]
    const angles = [0.0001, 1, 29.5, 45, 60, 89.9, 90, 120, 179.9999]
    let solved = 0
    for (const mode of MODES) {
      for (const s of values) {
        for (const angle of angles) {
          const inputs: Input[] = [
            { ...base, mode, sideA: s, angleA: angle },
            { ...base, mode, sideB: s, angleB: angle },
            { ...base, mode, sideC: s, angleC: angle },
          ]
          for (const input of inputs) {
            let r: Result
            try {
              r = compute(input)
            } catch (err) {
              expect(err).toBeInstanceOf(CalcError)
              expect((err as CalcError).fieldId).toBeTruthy()
              continue
            }
            solved += 1
            for (const s2 of r.stats!) {
              if (typeof s2.value === 'string') continue
              expect(Number.isFinite(s2.value), `${mode} ${s2.label}`).toBe(true)
            }
            const sum = r.parts!.reduce((total, p) => total + p.value, 0)
            expect(sum).toBeCloseTo(180, 8)
          }
        }
      }
    }
    expect(solved).toBeGreaterThan(500)
  }, 30_000)

  test('classification covers both axes', () => {
    const type = (input: Partial<Input>) =>
      raw(compute({ ...base, mode: 'sss', ...input } as Input), 'Triangle type')

    expect(type({ sideA: 5, sideB: 5, sideC: 5 })).toBe('Equilateral')
    expect(type({ sideA: 5, sideB: 5, sideC: 8 })).toBe('Obtuse isosceles')
    expect(type({ sideA: 5, sideB: 5, sideC: 6 })).toBe('Acute isosceles')
    expect(type({ sideA: 1, sideB: 1, sideC: Math.SQRT2 })).toBe('Right isosceles')
    expect(type({ sideA: 3, sideB: 4, sideC: 5 })).toBe('Right scalene')
    expect(type({ sideA: 4, sideB: 5, sideC: 6 })).toBe('Acute scalene')
    expect(type({ sideA: 2, sideB: 3, sideC: 4 })).toBe('Obtuse scalene')
  })
})

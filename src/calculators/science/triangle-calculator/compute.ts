import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, StepRule, Values } from '../../../lib/types'
import type { fields } from './fields'

/*
 * An oblique triangle solver: no right angle assumed, and none needed.
 *
 * Standard lettering throughout — vertex A faces side a, vertex B faces side b,
 * vertex C faces side c — and two classical identities do all the work:
 *
 *   Law of cosines   c² = a² + b² − 2ab·cos C
 *   Law of sines     a ÷ sin A = b ÷ sin B = c ÷ sin C
 *
 * Three parts fix a triangle, provided at least one of them is a side (three
 * angles fix only the SHAPE — every similar triangle satisfies them). That gives
 * exactly the five cases below. `mode` names which three are inputs, and only
 * those three are read: the other boxes keep whatever you last typed, and
 * refusing to answer because of a number nobody asked about would be surprising.
 *
 *   SAS  a, b, C   law of cosines for c, then law of cosines again for A
 *   SSS  a, b, c   law of cosines for A and B
 *   ASA  A, B, c   third angle by subtraction, then law of sines for a and b
 *   AAS  A, B, a   third angle by subtraction, then law of sines for b and c
 *   SSA  a, b, A   law of sines for B — the AMBIGUOUS case, 0, 1 or 2 triangles
 *
 * Angles are found by the law of COSINES wherever there is a choice, because the
 * law of sines cannot tell 30° from 150°: sine is symmetric about 90°, so it
 * silently returns the acute answer for an obtuse angle. That asymmetry is the
 * whole reason SSA is ambiguous and the other four cases are not.
 *
 * Selects arrive as strings — the derived Values type makes forgetting that a
 * compile error rather than a NaN later.
 */

const DEG = 180 / Math.PI
const RAD = Math.PI / 180

const MODES = ['sas', 'sss', 'asa', 'aas', 'ssa'] as const
type Mode = (typeof MODES)[number]

const isMode = (s: string): s is Mode => (MODES as readonly string[]).includes(s)

/** The six parts of a triangle, keyed the way the page letters them. */
type PartId = 'a' | 'b' | 'c' | 'A' | 'B' | 'C'

const LABEL: Readonly<Record<PartId, string>> = {
  a: 'Side a',
  b: 'Side b',
  c: 'Side c',
  A: 'Angle A',
  B: 'Angle B',
  C: 'Angle C',
}

/** Sides in whatever unit was typed; angles in degrees. */
interface Triangle {
  a: number
  b: number
  c: number
  A: number
  B: number
  C: number
}

/**
 * A sliver of slack for "the remaining angle is nothing at all". A triangle
 * whose third angle is zero is three collinear points, not a triangle, and the
 * subtraction that produces it lands a hair either side of zero on round input.
 */
const FLAT = 1e-9

/** acos and asin are undefined a hair outside [-1, 1], which rounding produces. */
const clampUnit = (x: number): number => Math.min(1, Math.max(-1, x))

const sinDeg = (degrees: number): number => Math.sin(degrees * RAD)
const cosDeg = (degrees: number): number => Math.cos(degrees * RAD)

/** The angle opposite `opposite`, from all three sides. Correct when obtuse. */
const angleFromSides = (opposite: number, x: number, y: number): number =>
  Math.acos(clampUnit((x * x + y * y - opposite * opposite) / (2 * x * y))) * DEG

const len = (label: string, value: number): Quantity => ({
  label,
  value,
  format: { style: 'decimal', decimals: 6, unit: 'units' },
})

const deg = (label: string, value: number): Quantity => ({
  label,
  value,
  format: { style: 'decimal', decimals: 4, unit: '°' },
})

const plain = (label: string, value: number): Quantity => ({
  label,
  value,
  format: { style: 'decimal', decimals: 6 },
})

const words = (label: string, value: string): Quantity => ({
  label,
  value,
  format: { style: 'raw' },
})

/** A part of a solved triangle, rendered in the unit that part is measured in. */
const show = (tri: Triangle, id: PartId, label: string = LABEL[id]): Quantity =>
  id === 'a' || id === 'b' || id === 'c' ? len(label, tri[id]) : deg(label, tri[id])

/** Short, readable numbers for error messages. No trailing-zero noise. */
const brief = (value: number): string => String(Number(value.toFixed(4)))

// ── Validation ────────────────────────────────────────────────────────────
// Finiteness is checked BEFORE magnitude, always. `coerceValues` hands compute
// a raw NaN for anything the form could not parse, and every comparison against
// NaN is false — so a bare `value <= 0` would let it through into the
// trigonometry and surface as a NaN on the page.

function guardSide(value: number, id: string, name: string): void {
  if (!Number.isFinite(value)) throw new CalcError(`Enter a number for side ${name}.`, id)
  if (value <= 0) throw new CalcError(`Side ${name} must be greater than zero.`, id)
}

function guardAngle(value: number, id: string, name: string): void {
  if (!Number.isFinite(value)) throw new CalcError(`Enter a number for angle ${name}.`, id)
  if (value <= 0) throw new CalcError(`Angle ${name} must be greater than 0°.`, id)
  if (value >= 180)
    throw new CalcError(
      `Angle ${name} must be under 180° — the three angles of a triangle add up to exactly that.`,
      id,
    )
}

interface Solution {
  tri: Triangle
  /** The three parts the mode was given, in the order it names them. */
  known: readonly PartId[]
  /** The three parts solved for, each with the formula that actually ran. */
  solved: ReadonlyArray<{ id: PartId; formula: string }>
  /** The headline. Fixed per mode, so the label does not move with the input. */
  headline: PartId
  /** SSA only: the second triangle that fits the same three measurements. */
  second?: Triangle
}

export default function compute(v: Values<typeof fields>): CalcResult {
  if (!isMode(v.mode)) throw new CalcError('Choose which three parts you know.', 'mode')
  const mode: Mode = v.mode

  const solution = solve(mode, v)
  const { tri, second } = solution

  // Two sides and the angle between them. Stable for every shape, unlike
  // Heron's formula, which cancels catastrophically on a needle-thin triangle.
  const area = 0.5 * tri.a * tri.b * sinDeg(tri.C)
  const perimeter = tri.a + tri.b + tri.c

  const steps: Array<Quantity | StepRule> = [
    ...solution.known.map((id) => show(tri, id, `${LABEL[id]} (known)`)),
    { rule: true },
    ...solution.solved.map(({ id, formula }) => show(tri, id, formula)),
    { rule: true },
    plain('Area = ½ab·sin C', area),
    len('Perimeter = a + b + c', perimeter),
  ]

  const notes: string[] = [
    'Each side is named after the angle it faces: side a is opposite angle A, and so on. Angles are in degrees; the sides carry whatever unit you used, and the area comes back in that unit squared.',
    'A right angle gets no special treatment here — enter 90° and it is solved like any other triangle. If you already know the angle is 90° and have both legs, the right triangle calculator asks for two numbers instead of four.',
  ]

  if (second) {
    steps.push(
      { rule: true },
      show(second, 'B', 'Second solution: B = 180° − B₁'),
      show(second, 'C', 'Second solution: C = 180° − A − B'),
      show(second, 'c', 'Second solution: c = a·sin C ÷ sin A'),
      plain('Second solution: area', 0.5 * second.a * second.b * sinDeg(second.C)),
    )
    notes.push(
      `Two different triangles fit these three measurements. Angle B could be ${brief(tri.B)}° or ${brief(second.B)}°, because sine gives the same value for an angle and its supplement — that is the ambiguous case, and only more information about the shape can settle which one you have.`,
    )
  } else if (mode === 'ssa') {
    notes.push(
      'Only one triangle fits these three measurements, so the ambiguity that usually haunts side-side-angle does not arise here: the supplement of angle B would push the angle total past 180°.',
    )
  }

  // Exactly one angle is derived by subtraction in every mode, so the three add
  // up to 180° by construction rather than by luck. The donut prints that total
  // in its centre, and a rounding remainder that fell a hair below zero would
  // fail the non-negative check — which is why the derived one is clamped.
  const parts = (['A', 'B', 'C'] as const).map((id) => ({
    label: LABEL[id],
    value: tri[id],
    format: { style: 'decimal' as const, decimals: 4, unit: '°' },
  }))

  return {
    primary: show(tri, solution.headline),
    stats: [
      show(tri, 'a'),
      show(tri, 'b'),
      show(tri, 'c'),
      show(tri, 'A'),
      show(tri, 'B'),
      show(tri, 'C'),
      plain('Area', area),
      len('Perimeter', perimeter),
      words('Triangle type', classify(tri)),
    ],
    steps,
    parts,
    partsTotal: {
      label: 'Interior angles',
      value: 180,
      format: { style: 'decimal', decimals: 0, unit: '°' },
    },
    notes,
  }
}

function solve(mode: Mode, v: Values<typeof fields>): Solution {
  const { sideA, sideB, sideC, angleA, angleB, angleC } = v

  switch (mode) {
    case 'sas': {
      guardSide(sideA, 'sideA', 'a')
      guardSide(sideB, 'sideB', 'b')
      guardAngle(angleC, 'angleC', 'C')

      // Any two positive sides with any angle strictly between 0° and 180°
      // between them close into a triangle, so there is nothing else to reject.
      const c = Math.sqrt(sideA * sideA + sideB * sideB - 2 * sideA * sideB * cosDeg(angleC))
      if (!Number.isFinite(c) || c <= 0)
        throw new CalcError('These sides are too large to square without overflowing.', 'sideA')

      const A = angleFromSides(sideA, sideB, c)
      const B = Math.max(0, 180 - angleC - A)

      return {
        tri: { a: sideA, b: sideB, c, A, B, C: angleC },
        known: ['a', 'b', 'C'],
        solved: [
          { id: 'c', formula: 'c = √(a² + b² − 2ab·cos C)' },
          { id: 'A', formula: 'A = acos((b² + c² − a²) ÷ 2bc)' },
          { id: 'B', formula: 'B = 180° − C − A' },
        ],
        headline: 'c',
      }
    }

    case 'sss': {
      guardSide(sideA, 'sideA', 'a')
      guardSide(sideB, 'sideB', 'b')
      guardSide(sideC, 'sideC', 'c')

      // The triangle inequality, blamed on the side that is too long. Equality
      // is refused as well as excess: three collinear points enclose no area.
      if (sideA + sideB <= sideC)
        throw new CalcError(
          `Side c must be shorter than a + b = ${brief(sideA + sideB)}, or the other two cannot reach across it.`,
          'sideC',
        )
      if (sideA + sideC <= sideB)
        throw new CalcError(
          `Side b must be shorter than a + c = ${brief(sideA + sideC)}, or the other two cannot reach across it.`,
          'sideB',
        )
      if (sideB + sideC <= sideA)
        throw new CalcError(
          `Side a must be shorter than b + c = ${brief(sideB + sideC)}, or the other two cannot reach across it.`,
          'sideA',
        )

      const A = angleFromSides(sideA, sideB, sideC)
      const B = angleFromSides(sideB, sideA, sideC)
      const C = Math.max(0, 180 - A - B)

      return {
        tri: { a: sideA, b: sideB, c: sideC, A, B, C },
        known: ['a', 'b', 'c'],
        solved: [
          { id: 'A', formula: 'A = acos((b² + c² − a²) ÷ 2bc)' },
          { id: 'B', formula: 'B = acos((a² + c² − b²) ÷ 2ac)' },
          { id: 'C', formula: 'C = 180° − A − B' },
        ],
        headline: 'A',
      }
    }

    case 'asa': {
      guardAngle(angleA, 'angleA', 'A')
      guardAngle(angleB, 'angleB', 'B')
      guardSide(sideC, 'sideC', 'c')

      const C = thirdAngle(angleA, angleB, 'angleB')
      // One circumdiameter, shared by all three ratios of the law of sines.
      const scale = sideC / sinDeg(C)

      return {
        tri: {
          a: scale * sinDeg(angleA),
          b: scale * sinDeg(angleB),
          c: sideC,
          A: angleA,
          B: angleB,
          C,
        },
        known: ['A', 'B', 'c'],
        solved: [
          { id: 'C', formula: 'C = 180° − A − B' },
          { id: 'a', formula: 'a = c·sin A ÷ sin C' },
          { id: 'b', formula: 'b = c·sin B ÷ sin C' },
        ],
        headline: 'a',
      }
    }

    case 'aas': {
      guardAngle(angleA, 'angleA', 'A')
      guardAngle(angleB, 'angleB', 'B')
      guardSide(sideA, 'sideA', 'a')

      const C = thirdAngle(angleA, angleB, 'angleB')
      const scale = sideA / sinDeg(angleA)

      return {
        tri: {
          a: sideA,
          b: scale * sinDeg(angleB),
          c: scale * sinDeg(C),
          A: angleA,
          B: angleB,
          C,
        },
        known: ['A', 'B', 'a'],
        solved: [
          { id: 'C', formula: 'C = 180° − A − B' },
          { id: 'b', formula: 'b = a·sin B ÷ sin A' },
          { id: 'c', formula: 'c = a·sin C ÷ sin A' },
        ],
        headline: 'b',
      }
    }

    case 'ssa': {
      guardSide(sideA, 'sideA', 'a')
      guardSide(sideB, 'sideB', 'b')
      guardAngle(angleA, 'angleA', 'A')

      /*
       * The ambiguous case. Angle A is NOT between the two sides, so knowing it
       * does not pin the triangle down: sin B = b·sin A ÷ a has two roots in
       * (0°, 180°) — an acute B and its supplement 180° − B — and both of them
       * can be real triangles.
       *
       * b·sin A is the altitude from C onto the line through A and B. Side a has
       * to reach that line, so the altitude is the shortest a can possibly be:
       *
       *   a <  b·sin A   no triangle at all
       *   a == b·sin A   exactly one, right-angled at B
       *   a >= b         exactly one — the obtuse root leaves no room for C
       *   otherwise      two
       *
       * With A obtuse the swing is different: the side facing the largest angle
       * is the longest side, so a has to beat b outright.
       */
      if (angleA >= 90 && sideA <= sideB)
        throw new CalcError(
          `With angle A at ${brief(angleA)}° it is the largest angle, so side a must be the longest side — longer than b = ${brief(sideB)}. Nothing closes with a = ${brief(sideA)}.`,
          'angleA',
        )

      const altitude = sideB * sinDeg(angleA)
      const sinB = altitude / sideA
      if (sinB > 1 + 1e-12)
        throw new CalcError(
          `Side a is too short to close the triangle: it has to reach at least b·sin A = ${brief(altitude)} to meet the far side, and ${brief(sideA)} falls short.`,
          'sideA',
        )

      /*
       * asin loses about half its digits next to 1 — the derivative is
       * infinite there — so the tangent case is caught on the INPUT instead.
       * sin 30° is 0.49999999999999994 in a double, which makes a = b·sin A
       * land at sinB = 0.9999999999999998 and asin return 89.9999988°: two
       * "solutions" 2.4e-6° apart, where geometry says one right angle. Reading
       * that off sinB gives exactly 90°, and the pair then dedupes itself.
       */
      const first = sinB >= 1 - 1e-12 ? 90 : Math.asin(clampUnit(sinB)) * DEG
      const candidates = [first, 180 - first]
        // A supplement that equals its own partner is the right-angled case:
        // one triangle, counted once.
        .filter((B, i) => i === 0 || Math.abs(B - first) > FLAT)
        .filter((B) => 180 - angleA - B > FLAT)

      if (candidates.length === 0)
        throw new CalcError(
          `No triangle fits a = ${brief(sideA)}, b = ${brief(sideB)} and A = ${brief(angleA)}°: the angles would total more than 180°.`,
          'angleA',
        )

      const build = (B: number): Triangle => {
        const C = Math.max(0, 180 - angleA - B)
        return {
          a: sideA,
          b: sideB,
          c: (sideA * sinDeg(C)) / sinDeg(angleA),
          A: angleA,
          B,
          C,
        }
      }

      return {
        tri: build(candidates[0]!),
        second: candidates.length > 1 ? build(candidates[1]!) : undefined,
        known: ['a', 'b', 'A'],
        solved: [
          { id: 'B', formula: 'B = asin(b·sin A ÷ a)' },
          { id: 'C', formula: 'C = 180° − A − B' },
          { id: 'c', formula: 'c = a·sin C ÷ sin A' },
        ],
        headline: 'B',
      }
    }
  }
}

/**
 * The remaining angle, refused when the two given ones have already spent the
 * whole 180°. Blamed on the second angle, which is the one being moved when the
 * pair stops fitting.
 */
function thirdAngle(first: number, secondAngle: number, blame: string): number {
  const third = 180 - first - secondAngle
  if (third <= FLAT)
    throw new CalcError(
      `Angles A and B already add up to ${brief(first + secondAngle)}°, leaving nothing for angle C. Two angles of a triangle have to total under 180°.`,
      blame,
    )
  return third
}

/**
 * The two classifications every geometry course asks for, combined. Equilateral
 * is reported on its own because it already implies three 60° angles.
 */
function classify(tri: Triangle): string {
  const same = (x: number, y: number): boolean =>
    Math.abs(x - y) <= 1e-9 * Math.max(Math.abs(x), Math.abs(y), 1)

  const equal = [same(tri.a, tri.b), same(tri.b, tri.c), same(tri.a, tri.c)].filter(Boolean).length
  if (equal === 3) return 'Equilateral'

  const largest = Math.max(tri.A, tri.B, tri.C)
  const byAngle = Math.abs(largest - 90) <= 1e-9 ? 'Right' : largest > 90 ? 'Obtuse' : 'Acute'

  return `${byAngle} ${equal > 0 ? 'isosceles' : 'scalene'}`
}

import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, Series, Values } from '../../../lib/types'
import type { fields } from './fields'

/*
 * Section properties of a rectangle, solid or hollow.
 *
 * Every formula here is the classical closed form for a rectangle about its own
 * centroid, and a hollow section is the outer rectangle minus the inner one —
 * valid because the two are concentric, so they share a centroid and the second
 * moments subtract directly. Nothing here comes from a design code: these are
 * geometry, identical in NDS, AISC, Eurocode or a 19th-century textbook.
 *
 *   A   = ab − a₁b₁
 *   Ix  = (ba³ − b₁a₁³) / 12        second moment about the horizontal centroidal axis
 *   Iy  = (b³a − b₁³a₁) / 12
 *   Ix₁ = Ix + A·cy²                parallel-axis shift to the outer edge
 *   Jz  = Ix + Iy                   perpendicular-axis theorem, valid for a plane area
 *   Kx  = √(Ix / A)                 radius of gyration
 *   Sx  = Ix / (a/2)                elastic modulus, to the extreme fibre
 *   Zx  = (ba² − b₁a₁²) / 4         plastic modulus: first moment of both halves
 *
 * Zx is the one worth checking rather than trusting. For a solid rectangle the
 * plastic modulus is ba²/4, which is 1.5 × the elastic ba²/6 — the familiar
 * shape factor of 1.5. A test pins that ratio.
 */

/** Everything is worked in millimetres; the select only says what was typed. */
const TO_MM = { mm: 1, cm: 10, in: 25.4 } as const
type UnitId = keyof typeof TO_MM

const unitOf = (id: string): UnitId => (id in TO_MM ? (id as UnitId) : 'mm')

const len = (u: UnitId) => ({ style: 'decimal', decimals: 4, unit: u }) as const
const area = (u: UnitId) => ({ style: 'decimal', decimals: 2, unit: `${u}²` }) as const

/**
 * Second and fourth powers of a section run to ten digits and more — a 200 mm
 * box already has Ix in the tens of millions of mm⁴ — so they are printed in the
 * engineering form a section table uses rather than as a wall of digits.
 */
function magnitude(value: number, unit: string): Quantity['value'] {
  const abs = Math.abs(value)
  if (abs === 0) return `0 ${unit}`
  const exp = Math.floor(Math.log10(abs) / 3) * 3
  if (exp <= 0) return `${Number(value.toFixed(4))} ${unit}`
  const mantissa = value / Math.pow(10, exp)
  return `${mantissa.toFixed(3)} × 10^${exp} ${unit}`
}

const big = (label: string, value: number, unit: string): Quantity => ({
  label,
  value: magnitude(value, unit),
  format: { style: 'raw' },
})

export default function compute(v: Values<typeof fields>): CalcResult {
  const { shape, a, b, innerHeight, innerWidth, diameter, innerDiameter } = v
  const unit = unitOf(v.unit)
  const round = shape === 'circle' || shape === 'hollowCircle'
  const hollow = shape === 'hollowRectangle' || shape === 'hollowCircle'

  /*
   * Only the primitives below branch on the section. Everything after them —
   * the parallel-axis shift, the polar moments, the radii of gyration and the
   * elastic moduli — is written once against A, cx, cy, Ix and Iy, because
   * those relationships are properties of a plane area and know nothing about
   * whether its edge is straight or curved.
   */
  let gross: number
  let void_: number
  let Po: number
  let Pi: number
  let cx: number
  let cy: number
  let Ix: number
  let Iy: number
  let Zx: number
  let Zy: number

  if (round) {
    // Guard finiteness first: coerceValues emits NaN for unparseable input, and
    // `D <= 0` is false for NaN, so a magnitude test alone would let it through.
    if (!Number.isFinite(diameter) || !(diameter > 0)) {
      throw new CalcError('Enter an outer diameter greater than zero.', 'diameter')
    }
    const d = hollow ? innerDiameter : 0
    if (hollow) {
      if (!Number.isFinite(d) || d < 0) {
        throw new CalcError('Enter an inner diameter of zero or more.', 'innerDiameter')
      }
      if (d >= diameter) {
        throw new CalcError(
          'The inner diameter has to be less than the outer one, or there is no wall left to carry anything.',
          'innerDiameter',
        )
      }
    }

    const R = diameter / 2
    const r = d / 2
    gross = Math.PI * R ** 2
    void_ = Math.PI * r ** 2
    Po = Math.PI * diameter
    Pi = void_ > 0 ? Math.PI * d : 0
    // A circle is its own centroid in both directions, so the distance to the
    // extreme fibre is the radius either way.
    cx = R
    cy = R
    Ix = (Math.PI * (R ** 4 - r ** 4)) / 4
    Iy = Ix
    // First moment of the two halves about the centroid: 2·(πR²/2)·(4R/3π).
    Zx = (4 / 3) * (R ** 3 - r ** 3)
    Zy = Zx
  } else {
    if (!Number.isFinite(a) || !(a > 0)) {
      throw new CalcError('Enter an outer height greater than zero.', 'a')
    }
    if (!Number.isFinite(b) || !(b > 0)) {
      throw new CalcError('Enter an outer width greater than zero.', 'b')
    }

    // A solid section reads the outer pair only, so the inner boxes cannot stop
    // it answering however they are filled in.
    const a1 = hollow ? innerHeight : 0
    const b1 = hollow ? innerWidth : 0

    if (hollow) {
      if (!Number.isFinite(a1) || a1 < 0) {
        throw new CalcError('Enter an inner height of zero or more.', 'innerHeight')
      }
      if (!Number.isFinite(b1) || b1 < 0) {
        throw new CalcError('Enter an inner width of zero or more.', 'innerWidth')
      }
      if (a1 >= a) {
        throw new CalcError(
          'The inner height has to be less than the outer height, or there is no material left to carry anything.',
          'innerHeight',
        )
      }
      if (b1 >= b) {
        throw new CalcError(
          'The inner width has to be less than the outer width, or there is no material left to carry anything.',
          'innerWidth',
        )
      }
      // Either dimension at zero collapses the hole to a line of no area, which
      // is a solid section written the long way round — not an error. Refusing
      // it would make the slider lie, since zero is the bottom of its own track.
    }

    gross = a * b
    void_ = a1 * b1
    Po = 2 * (a + b)
    Pi = void_ > 0 ? 2 * (a1 + b1) : 0
    cx = b / 2
    cy = a / 2
    Ix = (b * a ** 3 - b1 * a1 ** 3) / 12
    Iy = (b ** 3 * a - b1 ** 3 * a1) / 12
    Zx = (b * a ** 2 - b1 * a1 ** 2) / 4
    Zy = (a * b ** 2 - a1 * b1 ** 2) / 4
  }

  const A = gross - void_
  // Parallel axis, from the centroid out to the bottom / left edge.
  const Ix1 = Ix + A * cy ** 2
  const Iy1 = Iy + A * cx ** 2

  const Jz = Ix + Iy
  const Jz1 = Ix1 + Iy1

  const Kx = Math.sqrt(Ix / A)
  const Ky = Math.sqrt(Iy / A)
  const Kz = Math.sqrt(Jz / A)
  const Kx1 = Math.sqrt(Ix1 / A)
  const Ky1 = Math.sqrt(Iy1 / A)
  const Kz1 = Math.sqrt(Jz1 / A)

  const Sx = Ix / cy
  const Sy = Iy / cx

  // The shape factor is the single number that says how much is left in the
  // section after first yield — 1.5 for a solid rectangle, 16/3π for a solid
  // circle, and lower for either once it is hollowed.
  const shapeFactor = Zx / Sx

  const u = unit
  const u2 = `${u}²`
  const u3 = `${u}³`
  const u4 = `${u}⁴`

  /*
   * The efficiency curve, and the reason a box section exists at all.
   *
   * Hollowing the section out removes material fast and stiffness slowly,
   * because the material nearest the centroid was contributing almost nothing
   * to Ix. Both curves are percentages of the solid section, so they share an
   * axis honestly, and the gap between them IS the argument for a box.
   */
  const POINTS = 41
  const stiffness: Array<readonly [number, number]> = []
  const material: Array<readonly [number, number]> = []
  // The outer envelope, and the depth the hole is swept across.
  const outer = round ? diameter : a
  const solidIx = round ? (Math.PI * (outer / 2) ** 4) / 4 : (b * outer ** 3) / 12
  // A rectangular hole keeps the aspect ratio it was given, so the curve stays
  // the family this section belongs to; a round one has only the one dimension.
  const ratio = round ? 1 : innerWidth > 0 && innerHeight > 0 ? innerWidth / innerHeight : b / a
  for (let i = 0; i < POINTS; i++) {
    // Sweep the hole from nothing up to 98% of the outer depth.
    const h = (outer * 0.98 * i) / (POINTS - 1)
    let iH: number
    let aH: number
    if (round) {
      iH = (Math.PI * ((outer / 2) ** 4 - (h / 2) ** 4)) / 4
      aH = gross - Math.PI * (h / 2) ** 2
    } else {
      const hb = Math.min(h * ratio, b * 0.98)
      iH = (b * outer ** 3 - hb * h ** 3) / 12
      aH = gross - h * hb
    }
    stiffness.push([h, (iH / solidIx) * 100])
    material.push([h, (aH / gross) * 100])
  }
  const series: Series[] = [
    { label: 'Stiffness kept', points: stiffness, format: { style: 'percent', decimals: 0 } },
    { label: 'Material kept', points: material, format: { style: 'percent', decimals: 0 } },
  ]

  /*
   * The formula beside each value is the one that produced it, which means it
   * has to follow the section. Printing rectangle algebra next to a tube would
   * be a correct number under a wrong derivation — the harder error to spot,
   * because the number itself checks out.
   */
  const f = round
    ? {
        A: 'A = π(R² − r²)',
        Po: 'Po = πD',
        Pi: 'Pi = πd',
        cx: 'cx = D / 2',
        cy: 'cy = D / 2',
        Ix: 'Ix = π(R⁴ − r⁴) / 4',
        Iy: 'Iy = π(R⁴ − r⁴) / 4',
        Sx: 'Sx = Ix / R',
        Sy: 'Sy = Iy / R',
        Zx: 'Zx = 4(R³ − r³) / 3',
        Zy: 'Zy = 4(R³ − r³) / 3',
      }
    : {
        A: 'A = ab − a₁b₁',
        Po: 'Po = 2(a + b)',
        Pi: 'Pi = 2(a₁ + b₁)',
        cx: 'cx = b / 2',
        cy: 'cy = a / 2',
        Ix: 'Ix = (ba³ − b₁a₁³) / 12',
        Iy: 'Iy = (b³a − b₁³a₁) / 12',
        Sx: 'Sx = Ix / (a / 2)',
        Sy: 'Sy = Iy / (b / 2)',
        Zx: 'Zx = (ba² − b₁a₁²) / 4',
        Zy: 'Zy = (ab² − a₁b₁²) / 4',
      }

  const steps: CalcResult['steps'] = [
    { label: f.A, value: magnitude(A, u2), format: { style: 'raw' } },
    { label: f.Po, value: Number(Po.toFixed(4)), format: len(u) },
    ...(Pi > 0 ? [{ label: f.Pi, value: Number(Pi.toFixed(4)), format: len(u) }] : []),
    { label: f.cx, value: Number(cx.toFixed(4)), format: len(u) },
    { label: f.cy, value: Number(cy.toFixed(4)), format: len(u) },
    { rule: true },
    big(f.Ix, Ix, u4),
    big(f.Iy, Iy, u4),
    big('Ix₁ = Ix + A·cy²', Ix1, u4),
    big('Iy₁ = Iy + A·cx²', Iy1, u4),
    { rule: true },
    big('Jz = Ix + Iy', Jz, u4),
    big('Jz₁ = Ix₁ + Iy₁', Jz1, u4),
    { rule: true },
    { label: 'Kx = √(Ix / A)', value: Number(Kx.toFixed(4)), format: len(u) },
    { label: 'Ky = √(Iy / A)', value: Number(Ky.toFixed(4)), format: len(u) },
    { label: 'Kz = √(Jz / A)', value: Number(Kz.toFixed(4)), format: len(u) },
    { label: 'Kx₁ = √(Ix₁ / A)', value: Number(Kx1.toFixed(4)), format: len(u) },
    { label: 'Ky₁ = √(Iy₁ / A)', value: Number(Ky1.toFixed(4)), format: len(u) },
    { label: 'Kz₁ = √(Jz₁ / A)', value: Number(Kz1.toFixed(4)), format: len(u) },
    { rule: true },
    big(f.Sx, Sx, u3),
    big(f.Sy, Sy, u3),
    big(f.Zx, Zx, u3),
    big(f.Zy, Zy, u3),
  ]

  const notes: string[] = [
    round
      ? 'The bore is concentric with the outside, so both circles share a centroid and the fourth powers subtract directly. A circle is symmetric about every axis through its centre, which is why Ix and Iy are equal and why a tube bends the same way whichever way you roll it.'
      : 'The inner rectangle is concentric with the outer one, so both share a centroid and the second moments subtract directly. An off-centre hole needs the parallel-axis theorem applied to the hole as well.',
    'Subscript 1 marks an axis along the outer edge rather than through the centroid. Design almost always wants the centroidal values; the edge values are what you carry into a further parallel-axis shift.',
  ]
  if (!hollow) {
    notes.push(
      round
        ? 'A solid circle has a shape factor of 16/3π, about 1.70 — higher than a rectangle’s 1.5, because a circle keeps more of its area near the centroid where yielding recruits it last.'
        : 'A solid rectangle has a shape factor of exactly 1.5 — the plastic modulus is half again the elastic one, because yielding spreads from the extreme fibre to the whole depth.',
    )
  }

  return {
    primary: { label: 'Second moment of area, Ix', value: magnitude(Ix, u4), format: { style: 'raw' } },
    stats: [
      big('Area, A', A, u2),
      big('Elastic modulus, Sx', Sx, u3),
      big('Plastic modulus, Zx', Zx, u3),
      { label: 'Radius of gyration, Kx', value: Number(Kx.toFixed(4)), format: len(u) },
      big('Second moment, Iy', Iy, u4),
      { label: 'Shape factor, Zx / Sx', value: Number(shapeFactor.toFixed(4)), format: { style: 'decimal', decimals: 3 } },
    ],
    steps,
    // Material against the hole it surrounds, summing to the outer envelope.
    // For a solid section the void is zero and drops out, leaving one slice.
    parts: [
      { label: 'Material', value: A, format: area(u) },
      { label: 'Void', value: void_, format: area(u) },
    ].filter((p) => p.value > 0),
    partsTotal: {
      label: round ? 'Gross circle, πR²' : 'Gross rectangle, ab',
      value: gross,
      format: area(u),
    },
    series,
    chart: {
      title: 'What hollowing the section costs',
      // The axis names whichever dimension the sweep above actually moved.
      xLabel: round ? `Inner diameter d (${u})` : `Inner height a₁ (${u})`,
    },
    notes,
  }
}

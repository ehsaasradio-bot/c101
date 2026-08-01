import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, Series, Values } from '../../../lib/types'
import type { fields } from './fields'
import { ShapeError } from './shapes'
import type { Dims, Primitives, ShapeFn } from './shapes'
import { CORE_SHAPES } from './core-shapes'
import { BASIC_SHAPES } from './shapes-basic'
import { ANGLE_SHAPES } from './shapes-angle'
import { IBEAM_SHAPES } from './shapes-ibeam'
import { CURVED_SHAPES } from './shapes-curved'

/*
 * Section properties for thirty-six outlines.
 *
 * Each shape supplies only its primitives — area, perimeters, centroid,
 * Ix, Iy, Zx, Zy — and everything below is written once against them. The
 * parallel-axis shift, the polar moments, the radii of gyration and the elastic
 * moduli are properties of ANY plane area and know nothing about whether its
 * edge is straight, curved or notched.
 *
 * All of it is classical geometry. The same closed forms appear in NDS, AISC,
 * Eurocode or an 1870 textbook, so nothing here depends on a licensed
 * design-value table — see the FAQ on the page, which says so out loud.
 */

const SHAPES: Record<string, ShapeFn> = {
  ...CORE_SHAPES,
  ...BASIC_SHAPES,
  ...ANGLE_SHAPES,
  ...IBEAM_SHAPES,
  ...CURVED_SHAPES,
}

/**
 * Which form box feeds `Dims.a`, and what the generic slots carry.
 *
 * A round section is one dimension, not two, so it reads the diameter box; a
 * rolled section reads the depth. Rather than make every label a compromise,
 * the mapping is stated here, once, beside the field ids it names.
 */
const ROUND = new Set([...Object.keys(CURVED_SHAPES), 'circle', 'hollowCircle'])
/** The two that dimension their hole explicitly rather than by wall thickness. */
const EXPLICIT_HOLE = new Set(['hollowRectangle', 'hollowCircle'])

/** Everything is worked in the unit that was typed; the select only says which. */
type UnitId = 'mm' | 'cm' | 'in'
const unitOf = (id: string): UnitId => (id === 'cm' || id === 'in' ? id : 'mm')

const len = (u: UnitId) => ({ style: 'decimal', decimals: 4, unit: u }) as const
const area = (u: UnitId) => ({ style: 'decimal', decimals: 2, unit: `${u}²` }) as const

/**
 * Second and fourth powers run to ten digits and more — a 200 mm box already
 * has Ix in the tens of millions — so they print in the engineering form a
 * section table uses rather than as a wall of digits.
 */
function magnitude(value: number, unit: string): Quantity['value'] {
  const abs = Math.abs(value)
  if (abs === 0) return `0 ${unit}`
  const exp = Math.floor(Math.log10(abs) / 3) * 3
  if (exp <= 0) return `${Number(value.toFixed(4))} ${unit}`
  return `${(value / Math.pow(10, exp)).toFixed(3)} × 10^${exp} ${unit}`
}

const big = (label: string, value: number, unit: string): Quantity => ({
  label,
  value: magnitude(value, unit),
  format: { style: 'raw' },
})

export default function compute(v: Values<typeof fields>): CalcResult {
  const unit = unitOf(v.unit)
  const shapeFn = SHAPES[v.shape]
  if (!shapeFn) throw new CalcError('Choose a section.', 'shape')

  const round = ROUND.has(v.shape)
  const explicitHole = EXPLICIT_HOLE.has(v.shape)

  const dims: Dims = {
    a: round ? v.diameter : v.a,
    b: v.b,
    // The two explicit-hole sections carry their inner dimensions in t1/t2;
    // every other shape reads a wall or web thickness there. core-shapes.ts
    // documents that stretch.
    t1: explicitHole ? (round ? v.innerDiameter : v.innerHeight) : v.webThickness,
    t2: explicitHole ? v.innerWidth : v.flangeThickness,
    n: v.sides,
    angle: v.angle,
  }

  let p: Primitives
  try {
    p = shapeFn(dims)
  } catch (err) {
    // A shape speaks in its own field ids; the form needs a CalcError to
    // highlight the box, so translate rather than leak a second error type.
    if (err instanceof ShapeError) throw new CalcError(err.message, err.fieldId)
    throw err
  }

  const { A, gross, Po, Pi, cx, cy, cTop, cBot, cLeft, cRight, Ix, Iy, Zx, Zy } = p
  if (!Number.isFinite(A) || !(A > 0)) {
    throw new CalcError('Those dimensions leave no material in the section.', 'a')
  }

  // Parallel axis, from the centroid out to the bottom and left edges.
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

  /*
   * The elastic modulus goes to the FURTHER fibre, not to half the depth.
   *
   * On a symmetric section those are the same number and the distinction never
   * shows. On a tee, an angle, a trapezoid or a half circle the centroid sits
   * off-centre, and the face further from it reaches yield first — so dividing
   * by the larger distance is what gives the moment the section can actually
   * carry. Using a/2 would overstate it on exactly the sections where a
   * designer is relying on the number.
   */
  const Sx = Ix / Math.max(cTop, cBot)
  const Sy = Iy / Math.max(cLeft, cRight)
  // Reported alongside, because on an asymmetric section the two faces differ
  // and which one governs is a fact worth seeing rather than inferring.
  const SxTop = Ix / cTop
  const SxBot = Ix / cBot
  const asymmetric = Math.abs(cTop - cBot) > 1e-9

  const shapeFactor = Zx / Sx

  const u = unit
  const u2 = `${u}²`
  const u3 = `${u}³`
  const u4 = `${u}⁴`
  const voidArea = Math.max(0, gross - A)

  /*
   * The efficiency curve: what removing material costs in stiffness.
   *
   * Swept by scaling the section's own hole or wall from nothing up to its
   * current value and beyond, both curves as a percentage of the solid
   * envelope, so they share an axis honestly. The gap between them is the
   * argument for a hollow or flanged section.
   */
  const POINTS = 41
  const stiffness: Array<readonly [number, number]> = []
  const material: Array<readonly [number, number]> = []
  const solid = shapeFn({ ...dims, t1: explicitHole ? 0 : dims.t1, n: dims.n })
  const solidIx = explicitHole ? solid.Ix : gross * 0 + solid.Ix
  for (let i = 0; i < POINTS; i++) {
    const f = i / (POINTS - 1)
    // Only the explicit-hole sections have a hole to sweep; for the rest the
    // curve is flat and the chart is dropped below.
    const t1 = (explicitHole ? dims.t1 : 0) * 0.98 * f * (1 / 0.98)
    let q: Primitives
    try {
      q = shapeFn({ ...dims, t1: Math.min(t1, dims.a * 0.98) })
    } catch {
      continue
    }
    stiffness.push([t1, (q.Ix / solidIx) * 100])
    material.push([t1, (q.A / solid.A) * 100])
  }
  const sweepable = explicitHole && stiffness.length > 1 && dims.t1 > 0
  const series: Series[] = sweepable
    ? [
        { label: 'Stiffness kept', points: stiffness, format: { style: 'percent', decimals: 0 } },
        { label: 'Material kept', points: material, format: { style: 'percent', decimals: 0 } },
      ]
    : []

  const steps: CalcResult['steps'] = [
    { label: p.formulas.A, value: magnitude(A, u2), format: { style: 'raw' } },
    { label: 'Po — outer perimeter', value: Number(Po.toFixed(4)), format: len(u) },
    ...(Pi > 0 ? [{ label: 'Pi — inner perimeter', value: Number(Pi.toFixed(4)), format: len(u) }] : []),
    { label: 'cx — centroid from the left', value: Number(cx.toFixed(4)), format: len(u) },
    { label: 'cy — centroid from the bottom', value: Number(cy.toFixed(4)), format: len(u) },
    { rule: true },
    big(p.formulas.Ix, Ix, u4),
    big(p.formulas.Iy, Iy, u4),
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
    big('Sx = Ix / max(cTop, cBot)', Sx, u3),
    ...(asymmetric
      ? [big('  …to the top fibre, Ix / cTop', SxTop, u3), big('  …to the bottom fibre, Ix / cBot', SxBot, u3)]
      : []),
    big('Sy = Iy / max(cLeft, cRight)', Sy, u3),
    big(p.formulas.Zx, Zx, u3),
    big(p.formulas.Zy, Zy, u3),
  ]

  const notes: string[] = [
    asymmetric
      ? `This section is not symmetric about its horizontal axis — the centroid sits ${cBot.toFixed(2)} ${u} from the bottom and ${cTop.toFixed(2)} ${u} from the top. The elastic modulus above uses the FURTHER face, because that is the one that reaches yield first and so sets the moment the section can carry.`
      : 'This section is symmetric about both axes, so the centroid is at mid-depth and both faces reach yield together.',
    'Subscript 1 marks an axis along the outer edge rather than through the centroid. Design almost always wants the centroidal values; the edge values are what you carry into a further parallel-axis shift.',
    'The plastic modulus Z is taken about the equal-area axis, which on an asymmetric section is a different line from the centroid. Using the centroid instead would return a larger — and unconservative — value.',
  ]

  return {
    primary: { label: 'Second moment of area, Ix', value: magnitude(Ix, u4), format: { style: 'raw' } },
    stats: [
      big('Area, A', A, u2),
      big('Elastic modulus, Sx', Sx, u3),
      big('Plastic modulus, Zx', Zx, u3),
      { label: 'Radius of gyration, Kx', value: Number(Kx.toFixed(4)), format: len(u) },
      big('Second moment, Iy', Iy, u4),
      {
        label: 'Shape factor, Zx / Sx',
        value: Number(shapeFactor.toFixed(4)),
        format: { style: 'decimal', decimals: 3 },
      },
    ],
    steps,
    // Material against the space it does not fill, summing to the envelope that
    // bounds it. A section that fills its box has no void slice.
    parts: [
      { label: 'Material', value: A, format: area(u) },
      { label: 'Void', value: voidArea, format: area(u) },
    ].filter((part) => part.value > 1e-9),
    partsTotal: { label: 'Bounding envelope', value: gross, format: area(u) },
    series,
    chart: {
      title: 'What hollowing the section costs',
      xLabel: round ? `Inner diameter (${u})` : `Inner height (${u})`,
    },
    notes,
  }
}

import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, StepRule, Values } from '../../../lib/types'
import type { fields } from './fields'

/*
 * Vector algebra on two vectors in R² or R³. Standard definitions throughout —
 * nothing here is a convention this site invented:
 *
 *   a · b     = aₓbₓ + a_yb_y + a_zb_z                       (Euclidean inner product)
 *   |a|       = √(a · a)                                     (Euclidean / L2 norm)
 *   a × b     = (a_yb_z − a_zb_y, a_zbₓ − aₓb_z, aₓb_y − a_ybₓ)  (right-handed)
 *   θ         = atan2(|a × b|, a · b)                        (angle between, 0 to 180°)
 *   comp_b a  = (a · b) ÷ |b|                                (scalar projection)
 *   proj_b a  = ((a · b) ÷ |b|²) · b                         (vector projection)
 *
 * ── Why the angle uses atan2 and not acos ───────────────────────────────────
 *
 * The textbook form θ = acos((a·b) ÷ (|a||b|)) is correct and badly conditioned
 * at both ends. acos has a vertical tangent at ±1, so for nearly parallel or
 * nearly antiparallel vectors the handful of bits lost forming the quotient get
 * amplified enormously — and a quotient rounded to 1.0000000000000002 is not
 * merely inaccurate, it is NaN. atan2(|a × b|, a · b) is the same angle built
 * from two quantities that are each computed accurately in their own right, and
 * it stays exact all the way down to a microradian. Both are reported; the
 * cosine is shown because it is what people recognise, and the atan2 value is
 * what the headline uses.
 *
 * ── 2D ──────────────────────────────────────────────────────────────────────
 *
 * The 2D setting zeroes both z components inside this function rather than
 * hiding their fields. The cross product of two plane vectors points straight
 * out of the plane, so only its z component can be non-zero, and in 2D that
 * single signed number IS the answer — the "2D cross product", equal to the
 * signed area of the parallelogram and positive when b is counter-clockwise
 * from a.
 *
 * Selects arrive as strings — the derived Values type makes forgetting that a
 * compile error rather than a NaN later.
 */

const OPERATIONS = ['dot', 'cross', 'angle', 'magnitude', 'projection', 'add', 'subtract'] as const
type Operation = (typeof OPERATIONS)[number]

const isOperation = (s: string): s is Operation => (OPERATIONS as readonly string[]).includes(s)

type Vec3 = readonly [number, number, number]

const dotProduct = (p: Vec3, q: Vec3): number => p[0] * q[0] + p[1] * q[1] + p[2] * q[2]

/**
 * Built from two `Math.hypot` calls rather than squaring and adding, so a
 * component near the floating-point ceiling cannot overflow on the way to a
 * perfectly representable answer.
 */
const norm = (p: Vec3): number => Math.hypot(Math.hypot(p[0], p[1]), p[2])

const crossProduct = (p: Vec3, q: Vec3): Vec3 => [
  p[1] * q[2] - p[2] * q[1],
  p[2] * q[0] - p[0] * q[2],
  p[0] * q[1] - p[1] * q[0],
]

const RAD_TO_DEG = 180 / Math.PI

const dec = (label: string, value: number, decimals = 6, unit?: string): Quantity => ({
  label,
  value,
  format: { style: 'decimal', decimals, ...(unit ? { unit } : {}) },
})

const degrees = (label: string, value: number): Quantity => dec(label, value, 4, '°')
const raw = (label: string, value: string): Quantity => ({ label, value, format: { style: 'raw' } })

/** A component for inclusion in a printed vector, without a trail of zeros. */
function num(n: number): string {
  const rounded = Number(n.toFixed(6)) + 0
  return String(rounded === 0 ? 0 : rounded)
}

const show = (p: Vec3, flat: boolean): string =>
  flat ? `(${num(p[0])}, ${num(p[1])})` : `(${num(p[0])}, ${num(p[1])}, ${num(p[2])})`

const SCOPE_NOTE =
  'This page is the algebra of two vectors — how they combine and how they lie relative to one another. If what you want is how far apart two POINTS are, that is the distance calculator, which covers the 3D straight line, the Manhattan metric and great-circle distance on the Earth. For two points on a plane with the slope, the line equation and the midpoint, use the slope calculator. Subtracting b from a here and reading off the magnitude gives the same straight-line distance, because the displacement between two points is the difference of their position vectors.'

/**
 * Finiteness FIRST, always. `coerceValues` hands compute a raw NaN for anything
 * the form could not parse, and every ordinary comparison against NaN is false,
 * so a magnitude test alone would let it through into the arithmetic and surface
 * as a NaN on the page.
 */
function requireFinite(entries: ReadonlyArray<readonly [string, number, string]>) {
  for (const [id, value, label] of entries) {
    if (!Number.isFinite(value)) throw new CalcError(`Enter a number for ${label}.`, id)
  }
}

export default function compute(v: Values<typeof fields>): CalcResult {
  if (!isOperation(v.operation)) throw new CalcError('Choose an operation.', 'operation')
  const operation: Operation = v.operation

  if (v.dimensions !== '2d' && v.dimensions !== '3d') {
    throw new CalcError('Choose two or three dimensions.', 'dimensions')
  }
  const flat = v.dimensions === '2d'

  requireFinite([
    ['ax', v.ax, 'the x component of a'],
    ['ay', v.ay, 'the y component of a'],
    ['az', v.az, 'the z component of a'],
    ['bx', v.bx, 'the x component of b'],
    ['by', v.by, 'the y component of b'],
    ['bz', v.bz, 'the z component of b'],
  ])

  // 2D is 3D with the third component set aside, not a separate algebra.
  const a: Vec3 = [v.ax, v.ay, flat ? 0 : v.az]
  const b: Vec3 = [v.bx, v.by, flat ? 0 : v.bz]

  const aText = show(a, flat)
  const bText = show(b, flat)
  const preamble: Array<Quantity | StepRule> = [
    raw('Vector a', aText),
    raw('Vector b', bText),
    { rule: true },
  ]

  const ab = dotProduct(a, b)
  const magA = norm(a)
  const magB = norm(b)
  const cross = crossProduct(a, b)
  const crossMag = norm(cross)
  // In 2D the cross product has only a z component, and that signed scalar is
  // the whole answer.
  const crossScalar = cross[2]
  const bothNonZero = magA > 0 && magB > 0
  const angleRad = bothNonZero ? Math.atan2(crossMag, ab) : Number.NaN
  const angleDeg = angleRad * RAD_TO_DEG

  const flatNote =
    'In two dimensions the cross product is a single signed number, not a vector: two plane vectors span a plane, so their cross product points straight out of it and only the z component can be non-zero. That number is the signed area of the parallelogram they span — positive when b lies counter-clockwise from a, negative when it lies clockwise, and zero when the two are parallel.'

  const notes: string[] = []
  if (flat) notes.push('Both z components are being treated as zero. The boxes stay on screen so nothing you typed is lost when you switch back to 3D.')

  switch (operation) {
    case 'dot': {
      const stats: Quantity[] = [dec('Magnitude |a|', magA), dec('Magnitude |b|', magB)]
      if (bothNonZero) {
        stats.push(degrees('Angle between a and b', angleDeg), dec('cos of that angle', ab / (magA * magB)))
      }
      stats.push(
        flat ? dec('Cross product a × b (scalar)', crossScalar) : dec('Magnitude of a × b', crossMag),
        raw('Perpendicular?', ab === 0 ? 'Yes' : 'No'),
      )

      notes.push(
        'The dot product is a number, not a vector. Its sign is the whole point: positive means the two vectors lean the same way (the angle between them is under 90°), negative means they lean opposite ways, and exactly zero means they are perpendicular. That zero test is the reason the dot product turns up everywhere from lighting a 3D scene to checking whether a force does any work.',
        'It is commutative — a · b and b · a are the same number — and it distributes over addition. a · a is |a|², which is where the magnitude formula comes from.',
        SCOPE_NOTE,
      )

      return {
        primary: dec('Dot product a · b', ab),
        stats,
        steps: [
          ...preamble,
          dec('aₓ × bₓ', a[0] * b[0]),
          dec('a_y × b_y', a[1] * b[1]),
          ...(flat ? [] : [dec('a_z × b_z', a[2] * b[2])]),
          dec('a · b, the sum of those', ab),
          { rule: true },
          dec('|a| × |b|', magA * magB),
          ...(bothNonZero ? [dec('cos θ = (a · b) ÷ (|a| |b|)', ab / (magA * magB)), degrees('θ', angleDeg)] : []),
        ],
        notes,
      }
    }

    case 'cross': {
      if (flat) {
        notes.push(
          flatNote,
          'A zero here means the two vectors are parallel or antiparallel, so they span no area at all. The sign is what makes this quantity useful for orientation tests: which side of a line a point falls on, and whether a polygon is wound clockwise.',
          SCOPE_NOTE,
        )
        return {
          primary: dec('Cross product a × b (scalar)', crossScalar),
          stats: [
            dec('Magnitude |a|', magA),
            dec('Magnitude |b|', magB),
            dec('Area of the parallelogram', Math.abs(crossScalar)),
            dec('Area of the triangle a, b', Math.abs(crossScalar) / 2),
            ...(bothNonZero ? [degrees('Angle between a and b', angleDeg), dec('sin of that angle', crossMag / (magA * magB))] : []),
          ],
          steps: [
            ...preamble,
            dec('aₓ × b_y', a[0] * b[1]),
            dec('a_y × bₓ', a[1] * b[0]),
            dec('a × b = aₓb_y − a_ybₓ', crossScalar),
            { rule: true },
            dec('Parallelogram area, |a × b|', Math.abs(crossScalar)),
            dec('Triangle area, half of that', Math.abs(crossScalar) / 2),
          ],
          notes,
        }
      }

      notes.push(
        'The cross product is a vector, and it is perpendicular to both a and b — you can check that here: its dot product with each of them is exactly zero. Its length is |a| |b| sin θ, which is the area of the parallelogram the two vectors span, so a cross product of zero means they are parallel and span nothing.',
        'It is anticommutative: b × a is a × b with every sign flipped. The direction follows the right-hand rule, which is a convention rather than a fact about the vectors, and it only exists in three dimensions.',
        SCOPE_NOTE,
      )
      return {
        primary: dec('Magnitude of a × b', crossMag),
        stats: [
          dec('(a × b) x component', cross[0]),
          dec('(a × b) y component', cross[1]),
          dec('(a × b) z component', cross[2]),
          dec('Area of the triangle a, b', crossMag / 2),
          ...(bothNonZero ? [degrees('Angle between a and b', angleDeg), dec('sin of that angle', crossMag / (magA * magB))] : []),
        ],
        steps: [
          ...preamble,
          dec('x = a_yb_z − a_zb_y', cross[0]),
          dec('y = a_zbₓ − aₓb_z', cross[1]),
          dec('z = aₓb_y − a_ybₓ', cross[2]),
          { rule: true },
          dec('|a × b| = √(x² + y² + z²)', crossMag),
          dec('Area of the parallelogram, the same number', crossMag),
          { rule: true },
          // Lagrange's identity, |a×b|² + (a·b)² = |a|²|b|², is a genuinely
          // independent relation between the two products, so a printed
          // mismatch would mean one of them is wrong.
          dec('Check: |a × b|² + (a · b)²', crossMag * crossMag + ab * ab),
          dec('Check: |a|² × |b|²', magA * magA * magB * magB),
        ],
        notes,
      }
    }

    case 'angle': {
      // A zero vector points nowhere, so there is no angle to measure. This is
      // not a rounding problem to work around; the question has no answer.
      if (magA === 0) {
        throw new CalcError('Vector a has zero length, so it points in no direction and there is no angle to measure. Give at least one of its components a value.', 'ax')
      }
      if (magB === 0) {
        throw new CalcError('Vector b has zero length, so it points in no direction and there is no angle to measure. Give at least one of its components a value.', 'bx')
      }

      notes.push(
        'The angle is measured between the two directions and is always reported between 0° and 180°; vectors have no sense of which way round you sweep, so there is no reflex answer here. 0° means they point the same way, 180° means opposite ways, and 90° means the dot product is zero.',
        'The headline uses atan2(|a × b|, a · b) rather than the textbook acos((a · b) ÷ (|a| |b|)). The two are the same angle, but acos loses precision badly for nearly parallel vectors and can even return NaN when rounding pushes its argument a hair past 1. The cosine is shown alongside because it is the form most people recognise.',
        SCOPE_NOTE,
      )
      return {
        primary: degrees('Angle between a and b', angleDeg),
        stats: [
          dec('Angle in radians', angleRad),
          dec('cos θ', ab / (magA * magB)),
          dec('sin θ', crossMag / (magA * magB)),
          dec('Dot product a · b', ab),
          dec('Magnitude |a|', magA),
          dec('Magnitude |b|', magB),
        ],
        steps: [
          ...preamble,
          dec('a · b', ab),
          dec('|a|', magA),
          dec('|b|', magB),
          { rule: true },
          flat ? dec('|a × b|, the size of the scalar cross product', crossMag) : dec('|a × b|', crossMag),
          dec('θ = atan2(|a × b|, a · b), in radians', angleRad),
          degrees('θ in degrees', angleDeg),
          { rule: true },
          dec('Cross-check: cos θ = (a · b) ÷ (|a| |b|)', ab / (magA * magB)),
          degrees('Cross-check: acos of that', Math.acos(Math.min(1, Math.max(-1, ab / (magA * magB)))) * RAD_TO_DEG),
        ],
        notes,
      }
    }

    case 'magnitude': {
      const sumOfSquares = a[0] * a[0] + a[1] * a[1] + a[2] * a[2]
      const stats: Quantity[] = [dec('Magnitude |b|', magB), dec('a · a, the sum of the squares', sumOfSquares)]
      if (magA > 0) {
        stats.push(
          dec('Unit vector x component', a[0] / magA),
          dec('Unit vector y component', a[1] / magA),
          ...(flat ? [] : [dec('Unit vector z component', a[2] / magA)]),
        )
        notes.push(
          `Dividing a by its own length gives the unit vector ${show([a[0] / magA, a[1] / magA, a[2] / magA], flat)}, which points the same way but has length exactly 1. That is what "normalising" a vector means, and it is how you separate a direction from a speed or a distance.`,
        )
      } else {
        notes.push(
          'The zero vector has a magnitude of exactly 0 — a perfectly good answer — but it has no direction, so it cannot be normalised. Dividing by zero length would produce nothing meaningful, so no unit vector is reported.',
        )
      }
      notes.push(
        'The magnitude is Pythagoras applied twice: √(x² + y²) is the length of the shadow on the floor, and a second right triangle raises that to the height z. With both z components zero it collapses to the familiar √(x² + y²), which is why there is no separate 2D formula.',
        SCOPE_NOTE,
      )

      return {
        primary: dec('Magnitude |a|', magA),
        stats,
        steps: [
          ...preamble,
          dec('aₓ²', a[0] * a[0]),
          dec('a_y²', a[1] * a[1]),
          ...(flat ? [] : [dec('a_z²', a[2] * a[2])]),
          dec('Sum of the squares', sumOfSquares),
          dec('|a| = √(that sum)', magA),
          { rule: true },
          dec('|b|, by the same route', magB),
        ],
        notes,
      }
    }

    case 'projection': {
      if (magB === 0) {
        throw new CalcError('Vector b has zero length, so it defines no direction to project onto. Give at least one of its components a value.', 'bx')
      }
      const scalarProjection = ab / magB
      const factor = ab / (magB * magB)
      const projection: Vec3 = [b[0] * factor, b[1] * factor, b[2] * factor]
      // The rejection is what is left over, and it is perpendicular to b by
      // construction: a = proj + rej, with rej · b = 0.
      const rejection: Vec3 = [a[0] - projection[0], a[1] - projection[1], a[2] - projection[2]]

      notes.push(
        `The scalar projection is how much of a points along b, measured in the same units as a. It is signed: a negative value means a leans away from b rather than along it. The vector projection ${show(projection, flat)} is that shadow written back as a vector, and what is left over, ${show(rejection, flat)}, is the rejection — the part of a perpendicular to b.`,
        'Note that projecting a onto b is not the same as projecting b onto a. The two share a numerator, a · b, but are divided by different lengths, so they agree only when |a| and |b| are equal.',
        'The direction of b matters here; its length does not. Doubling b leaves both the scalar and the vector projection completely unchanged, because b appears once on top and twice underneath.',
        SCOPE_NOTE,
      )

      return {
        primary: dec('Scalar projection of a onto b', scalarProjection),
        stats: [
          dec('Vector projection x', projection[0]),
          dec('Vector projection y', projection[1]),
          ...(flat ? [] : [dec('Vector projection z', projection[2])]),
          dec('Length of the projection', norm(projection)),
          dec('Length of the rejection (the perpendicular part)', norm(rejection)),
          dec('Magnitude |b|', magB),
        ],
        steps: [
          ...preamble,
          dec('a · b', ab),
          dec('|b|', magB),
          dec('comp_b a = (a · b) ÷ |b|', scalarProjection),
          { rule: true },
          dec('|b|²', magB * magB),
          dec('(a · b) ÷ |b|², the scale factor on b', factor),
          dec('proj x', projection[0]),
          dec('proj y', projection[1]),
          ...(flat ? [] : [dec('proj z', projection[2])]),
          { rule: true },
          dec('Check: rejection · b, which must be zero', dotProduct(rejection, b)),
        ],
        notes,
      }
    }

    case 'add':
    case 'subtract': {
      const adding = operation === 'add'
      const sign = adding ? 1 : -1
      const result: Vec3 = [a[0] + sign * b[0], a[1] + sign * b[1], a[2] + sign * b[2]]
      const name = adding ? 'a + b' : 'a − b'
      const resultMag = norm(result)

      if (adding) {
        notes.push(
          'Vectors add component by component, which is the same thing as laying b tip-to-tail on the end of a. The order does not matter — a + b and b + a land in the same place, which is the parallelogram rule.',
          `The magnitude of the sum is not the sum of the magnitudes: |a| + |b| is ${num(magA + magB)} here, while |a + b| is ${num(resultMag)}. The two are equal only when a and b point in exactly the same direction, and the triangle inequality says the sum can never be the larger of the two.`,
        )
      } else {
        notes.push(
          'Subtracting is adding the reverse: a − b is a + (−b), and it is the vector that points from the tip of b to the tip of a. Order matters here in a way it does not for addition — b − a is the same arrow pointing the other way.',
          `If a and b are the position vectors of two points, then a − b is the displacement between them and its magnitude, ${num(resultMag)}, is the straight-line distance separating them. That is the same number the distance calculator reports for those coordinates.`,
        )
      }
      notes.push(SCOPE_NOTE)

      return {
        primary: dec(`Magnitude of ${name}`, resultMag),
        stats: [
          dec(`${name} x component`, result[0]),
          dec(`${name} y component`, result[1]),
          ...(flat ? [] : [dec(`${name} z component`, result[2])]),
          dec('Magnitude |a|', magA),
          dec('Magnitude |b|', magB),
          dec('|a| + |b|, for comparison', magA + magB),
        ],
        steps: [
          ...preamble,
          dec(adding ? 'x: aₓ + bₓ' : 'x: aₓ − bₓ', result[0]),
          dec(adding ? 'y: a_y + b_y' : 'y: a_y − b_y', result[1]),
          ...(flat ? [] : [dec(adding ? 'z: a_z + b_z' : 'z: a_z − b_z', result[2])]),
          raw(name, show(result, flat)),
          { rule: true },
          dec(`|${name}| = √(x² + y² + z²)`, resultMag),
        ],
        notes,
      }
    }
  }
}

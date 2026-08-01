import { ShapeError } from './shapes'
import type { Dims, Primitives, ShapeFn } from './shapes'

/*
 * The nine straight-edged sections, each reduced to the primitives in
 * shapes.ts. Everything here is classical plane geometry — the same closed
 * forms appear in AISC, Eurocode or an 1870 textbook — so nothing depends on a
 * licensed design-value table.
 *
 * Two things are worth stating before the formulas, because both are places a
 * section calculator is usually wrong.
 *
 * 1. cTop and cBot are NOT interchangeable. A triangle's centroid sits a/3 from
 *    its base, so the fibre distances are a/3 and 2a/3 and the elastic modulus
 *    is a different number at each face. An odd-sided polygon has the same
 *    asymmetry: a vertex above, a flat below.
 *
 * 2. Zx is the first moment of both halves about the EQUAL-AREA axis, which
 *    coincides with the centroid only on a section symmetric about it. On a
 *    triangle the two axes are a/3 and a(1 − 1/√2) ≈ 0.293a from the base —
 *    genuinely different lines. Each Zx below is derived about the equal-area
 *    axis and the derivation is written out where it is not one line.
 */

/** Degrees in, radians out — the only place the input unit is undone. */
const RAD = Math.PI / 180

/**
 * Finiteness FIRST. Values arrive from a form, so an unparseable box is NaN,
 * and `x <= 0` is false for NaN — a magnitude test alone lets it straight
 * through and every property downstream comes back NaN.
 */
function positive(x: number, field: string, message: string): number {
  if (!Number.isFinite(x)) throw new ShapeError(message, field)
  if (!(x > 0)) throw new ShapeError(message, field)
  return x
}

/**
 * Bounding-box bookkeeping, written once. The centroid is given as a distance
 * from the left and bottom of the envelope, and the four fibre distances follow
 * from it — which is the whole reason cTop and cBot can disagree.
 */
function envelope(width: number, height: number, cx: number, cy: number) {
  return {
    gross: width * height,
    cx,
    cy,
    cBot: cy,
    cTop: height - cy,
    cLeft: cx,
    cRight: width - cx,
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 * The chord engine, used only by the regular polygons.
 *
 * A polygon's area and second moments have clean closed forms; its PLASTIC
 * modulus does not, because the equal-area axis lands in a different band of
 * the outline for every n. So the polygons alone are integrated exactly rather
 * than in closed form: between two vertex levels a convex outline's chord is a
 * straight line in y, so ∫w dy, ∫w·y dy and ∫w² dy over that band are exact
 * polynomials — no strips, no tolerance, no convergence.
 *
 * It applies to any outline symmetric about its vertical centre-line, which is
 * how the polygons below are oriented.
 * ────────────────────────────────────────────────────────────────────────── */

interface Level {
  /** Height of a vertex, measured from the centroid. */
  y: number
  /** The full chord at that height. */
  w: number
}

/** Exact integrals over one band, where the chord runs w0 → w1 linearly. */
function band(y0: number, w0: number, y1: number, w1: number) {
  const h = y1 - y0
  const area = (h * (w0 + w1)) / 2
  return {
    area,
    /** ∫w·y dy, expanded about y0 so the arithmetic stays exact. */
    moment: y0 * area + (w0 * h * h) / 2 + ((w1 - w0) * h * h) / 3,
    /** ∫w² dy — the width integral the vertical plastic modulus is built on. */
    square: (h * (w0 * w0 + w0 * w1 + w1 * w1)) / 3,
  }
}

function chordProps(levels: Level[]): { A: number; Zx: number; Zy: number } {
  const ls = [...levels].sort((p, q) => p.y - q.y)

  let A = 0
  let squares = 0
  for (let i = 1; i < ls.length; i++) {
    const lo = ls[i - 1]!
    const hi = ls[i]!
    const b = band(lo.y, lo.w, hi.y, hi.w)
    A += b.area
    squares += b.square
  }

  /*
   * The equal-area axis. Walk up until the running area passes half, then solve
   * the partial band exactly: its area in u = y − y0 is w0·u + (w1−w0)u²/2h, a
   * quadratic, so the crossing is a root and not a search.
   */
  const half = A / 2
  let acc = 0
  let yp = ls[0]!.y
  for (let i = 1; i < ls.length; i++) {
    const lo = ls[i - 1]!
    const hi = ls[i]!
    const b = band(lo.y, lo.w, hi.y, hi.w)
    if (acc + b.area >= half) {
      const target = half - acc
      const h = hi.y - lo.y
      const slope = h > 0 ? (hi.w - lo.w) / h : 0
      // A band of constant width is linear, not quadratic, and dividing by its
      // zero slope would be a 0/0.
      const u =
        Math.abs(slope) < 1e-15
          ? lo.w > 0
            ? target / lo.w
            : 0
          : (-lo.w + Math.sqrt(lo.w * lo.w + 2 * slope * target)) / slope
      yp = lo.y + u
      break
    }
    acc += b.area
  }

  /*
   * Zx = ∫|y − yp| dA. Both halves hold exactly A/2 by construction, so the
   * yp·(A/2) terms cancel and the modulus is simply the difference of the two
   * first moments — about any origin at all.
   */
  let above = 0
  let below = 0
  for (let i = 1; i < ls.length; i++) {
    const lo = ls[i - 1]!
    const hi = ls[i]!
    if (hi.y <= yp) {
      below += band(lo.y, lo.w, hi.y, hi.w).moment
    } else if (lo.y >= yp) {
      above += band(lo.y, lo.w, hi.y, hi.w).moment
    } else {
      const wp = lo.w + ((hi.w - lo.w) * (yp - lo.y)) / (hi.y - lo.y)
      below += band(lo.y, lo.w, yp, wp).moment
      above += band(yp, wp, hi.y, hi.w).moment
    }
  }

  // Zy needs no cut: the outline is symmetric about its vertical centre-line,
  // so that line already halves the area. Each chord contributes 2·(w/2)²/2.
  return { A, Zx: above - below, Zy: squares / 4 }
}

/**
 * A regular n-gon of circumradius R, vertex-up.
 *
 * The orientation is not cosmetic. With a vertex on the vertical centre-line
 * the outline is mirror-symmetric about that line for EVERY n, odd n included,
 * so the chord at any vertex level is fixed by that vertex alone — 2R|cos θ| —
 * and the two mirrored vertices at a level can never disagree about it.
 */
function polygonLevels(n: number, R: number): Level[] {
  const levels: Level[] = []
  for (let k = 0; k < n; k++) {
    const t = Math.PI / 2 + (2 * Math.PI * k) / n
    levels.push({ y: R * Math.sin(t), w: 2 * R * Math.abs(Math.cos(t)) })
  }
  return levels
}

/** Shared body of hexagon, octagon and the general polygon. */
function polygon(n: number, R: number, formulas: Primitives['formulas']): Primitives {
  const levels = polygonLevels(n, R)
  const { Zx, Zy } = chordProps(levels)

  let yTop = -Infinity
  let yBot = Infinity
  let width = 0
  for (const l of levels) {
    if (l.y > yTop) yTop = l.y
    if (l.y < yBot) yBot = l.y
    if (l.w > width) width = l.w
  }

  const side = 2 * R * Math.sin(Math.PI / n)
  const A = (n / 2) * R * R * Math.sin((2 * Math.PI) / n)
  /*
   * The second moment of a regular polygon is the same about every centroidal
   * axis — a real theorem, not an approximation — which is why one I serves
   * both directions. It reduces to s⁴/12 at n = 4 and to πR⁴/4 as n grows.
   */
  const I = (A * (6 * R * R - side * side)) / 24

  return {
    A,
    // The polygon is centred on the origin, so its height above the bottom of
    // the envelope is −yBot. On an odd n that is R·cos(π/n), a flat, while the
    // top is R, a vertex: the fibre distances genuinely differ.
    ...envelope(width, yTop - yBot, width / 2, -yBot),
    Po: n * side,
    Pi: 0,
    Ix: I,
    Iy: I,
    Zx,
    Zy,
    formulas,
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 * The nine sections.
 * ────────────────────────────────────────────────────────────────────────── */

/** A square of side a. Every centroidal axis is alike, so one value serves. */
const square: ShapeFn = (d: Dims): Primitives => {
  const a = positive(d.a, 'a', 'Enter a side length greater than zero.')
  return {
    A: a * a,
    ...envelope(a, a, a / 2, a / 2),
    Po: 4 * a,
    Pi: 0,
    Ix: a ** 4 / 12,
    Iy: a ** 4 / 12,
    // Both halves are a × a/2 with their centroids a/4 from the axis.
    Zx: a ** 3 / 4,
    Zy: a ** 3 / 4,
    formulas: {
      A: 'A = a²',
      Ix: 'Ix = a⁴/12',
      Iy: 'Iy = a⁴/12',
      Zx: 'Zx = a³/4',
      Zy: 'Zy = a³/4',
    },
  }
}

/**
 * An isosceles triangle, base b at the bottom, height a.
 *
 * The one asymmetric section here, and the one worth checking hardest.
 *
 *   centroid       a/3 from the base, so cBot = a/3 and cTop = 2a/3
 *   equal-area     a(1 − 1/√2) ≈ 0.293a from the base — a DIFFERENT line
 *
 * The equal-area axis solves b(y − y²/2a) = ab/4, i.e. y² − 2ay + a²/2 = 0,
 * whose root inside the section is y = a(1 − 1/√2). Feeding that back through
 * Zx = ∫|y − yp| dA collapses, after some cancellation, to a²b(2 − √2)/6. The
 * resulting shape factor is 2.343, the classical value for a triangle.
 */
const triangle: ShapeFn = (d: Dims): Primitives => {
  const a = positive(d.a, 'a', 'Enter a height greater than zero.')
  const b = positive(d.b, 'b', 'Enter a base width greater than zero.')
  return {
    A: (a * b) / 2,
    ...envelope(b, a, b / 2, a / 3),
    Po: b + 2 * Math.hypot(a, b / 2),
    Pi: 0,
    Ix: (b * a ** 3) / 36,
    Iy: (a * b ** 3) / 48,
    Zx: (a * a * b * (2 - Math.SQRT2)) / 6,
    // Across the base the section IS symmetric, so the equal-area axis is the
    // centroidal one and Zy is just twice the first moment of the right half.
    Zy: (a * b * b) / 12,
    formulas: {
      A: 'A = ab/2',
      Ix: 'Ix = ba³/36',
      Iy: 'Iy = ab³/48',
      Zx: 'Zx = a²b(2 − √2)/6',
      Zy: 'Zy = ab²/12',
    },
  }
}

/** A regular hexagon, vertex-up, a = circumradius R. */
const hexagon: ShapeFn = (d: Dims): Primitives => {
  const a = positive(d.a, 'a', 'Enter a circumradius greater than zero.')
  return polygon(6, a, {
    A: 'A = 3√3a²/2  (a = circumradius R)',
    Ix: 'Ix = 5√3a⁴/16',
    Iy: 'Iy = 5√3a⁴/16',
    Zx: 'Zx = 7√3a³/12',
    Zy: 'Zy = a³',
  })
}

/** A regular octagon, vertex-up, a = circumradius R. */
const octagon: ShapeFn = (d: Dims): Primitives => {
  const a = positive(d.a, 'a', 'Enter a circumradius greater than zero.')
  return polygon(8, a, {
    A: 'A = 2√2a²  (a = circumradius R)',
    Ix: 'Ix = (2√2 + 1)a⁴/6',
    Iy: 'Iy = (2√2 + 1)a⁴/6',
    // A 90° turn maps the octagon onto itself, so the two plastic moduli are
    // equal — which is NOT true of the hexagon, whose symmetry stops at 60°.
    Zx: 'Zx = (2 + √2)a³/3',
    Zy: 'Zy = (2 + √2)a³/3',
  })
}

/** Any regular polygon: n sides, circumradius a. */
const regularPolygon: ShapeFn = (d: Dims): Primitives => {
  const a = positive(d.a, 'a', 'Enter a circumradius greater than zero.')
  const n = d.n
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 3) {
    throw new ShapeError('A polygon needs at least three whole sides.', 'n')
  }
  if (n > 10_000) {
    throw new ShapeError('Above ten thousand sides this is a circle; use the round section.', 'n')
  }
  return polygon(n, a, {
    A: 'A = nR²sin(2π/n) / 2  (R = a, circumradius)',
    Ix: 'Ix = A(6R² − s²)/24,  s = 2R·sin(π/n)',
    Iy: 'Iy = A(6R² − s²)/24  — equal about every centroidal axis',
    Zx: 'Zx = ∫|y − yp|dA about the equal-area axis yp',
    Zy: 'Zy = ∫w²dy / 4 about the vertical centre-line',
  })
}

/**
 * A cross: a vertical arm t1 × a and a horizontal arm b × t1, sharing a
 * t1 × t1 middle that must not be counted twice. Doubly symmetric, so both
 * equal-area axes are the centroidal ones.
 */
const cross: ShapeFn = (d: Dims): Primitives => {
  const a = positive(d.a, 'a', 'Enter an overall height greater than zero.')
  const b = positive(d.b, 'b', 'Enter an overall width greater than zero.')
  const t = positive(d.t1, 't1', 'Enter an arm width greater than zero.')
  if (t > a || t > b) {
    throw new ShapeError('The arm cannot be wider than the section it crosses.', 't1')
  }
  return {
    A: t * (a + b - t),
    ...envelope(b, a, b / 2, a / 2),
    // Every re-entrant corner gives back exactly what it took: the outline of a
    // cross is the same length as the rectangle around it.
    Po: 2 * (a + b),
    Pi: 0,
    Ix: (t * a ** 3 + (b - t) * t ** 3) / 12,
    Iy: (t * b ** 3 + (a - t) * t ** 3) / 12,
    Zx: (t * a * a + (b - t) * t * t) / 4,
    Zy: (t * b * b + (a - t) * t * t) / 4,
    formulas: {
      A: 'A = t₁(a + b − t₁)',
      Ix: 'Ix = (t₁a³ + (b − t₁)t₁³)/12',
      Iy: 'Iy = (t₁b³ + (a − t₁)t₁³)/12',
      Zx: 'Zx = (t₁a² + (b − t₁)t₁²)/4',
      Zy: 'Zy = (t₁b² + (a − t₁)t₁²)/4',
    },
  }
}

/**
 * An a × b rectangle turned through `angle`.
 *
 * The second moments come from the rotation transform,
 *
 *   Ix′ = Ix·cos²θ + Iy·sin²θ − 2·Ixy·sinθ·cosθ
 *
 * with Ixy = 0, because a rectangle's own axes are principal — the product of
 * inertia of a doubly symmetric section about its centroidal axes vanishes.
 *
 * Zx is the part that has to be derived. A turned rectangle is centrally
 * symmetric, so its chord w(y) is even and the equal-area axis is again the
 * centroid; the outline is a constant chord m between the two middle corners at
 * ±q, tapering to nothing at the outer corners ±p, with
 *
 *   p = (a·cosθ + b·sinθ)/2      q = |a·cosθ − b·sinθ|/2
 *   m = min(b/cosθ, a/sinθ)      the pair of sides that actually cuts the chord
 *
 * and Zx = 2∫₀^p y·w dy = m(p² + pq + q²)/3, which tidies into the single
 * fraction below. It returns ba²/4 at θ = 0 and ab²/4 at θ = 90°, and gives a
 * square on its diagonal a³√2/6.
 */
const rotatedRectangle: ShapeFn = (d: Dims): Primitives => {
  const a = positive(d.a, 'a', 'Enter a height greater than zero.')
  const b = positive(d.b, 'b', 'Enter a width greater than zero.')
  if (!Number.isFinite(d.angle)) {
    throw new ShapeError('Enter a rotation in degrees.', 'angle')
  }
  const th = d.angle * RAD
  // Sign never matters: turning either way gives the same section, so the
  // magnitudes carry every quadrant without a case for each.
  const c = Math.abs(Math.cos(th))
  const s = Math.abs(Math.sin(th))

  const width = b * c + a * s
  const height = a * c + b * s
  const Ix0 = (b * a ** 3) / 12
  const Iy0 = (a * b ** 3) / 12

  // Which pair of sides bounds the middle chord — vertically, then horizontally.
  const Zx = a * c >= b * s ? (b * (3 * a * a * c * c + b * b * s * s)) / (12 * c) : (a * (3 * b * b * s * s + a * a * c * c)) / (12 * s)
  const Zy = b * c >= a * s ? (a * (3 * b * b * c * c + a * a * s * s)) / (12 * c) : (b * (3 * a * a * s * s + b * b * c * c)) / (12 * s)

  return {
    A: a * b,
    // Turning the section leaves the material alone and grows the box around
    // it, so gross is the one thing rotation really changes.
    ...envelope(width, height, width / 2, height / 2),
    Po: 2 * (a + b),
    Pi: 0,
    Ix: Ix0 * c * c + Iy0 * s * s,
    Iy: Ix0 * s * s + Iy0 * c * c,
    Zx,
    Zy,
    formulas: {
      A: 'A = ab',
      Ix: 'Ix = (ba³cos²θ + ab³sin²θ)/12',
      Iy: 'Iy = (ba³sin²θ + ab³cos²θ)/12',
      Zx: 'Zx = b(3a²cos²θ + b²sin²θ)/(12cosθ)',
      Zy: 'Zy = a(3b²cos²θ + a²sin²θ)/(12cosθ)',
    },
  }
}

/**
 * A square of side a stood on its diagonal.
 *
 * Ix is unchanged by the turn — a square has Ix = Iy and Ixy = 0, so the
 * rotation transform returns a⁴/12 at every angle. The envelope and the plastic
 * modulus are not: the box grows to the diagonal a√2 either way, so a diamond
 * wastes half its bounding area, and Zx falls from a³/4 to a³√2/6.
 */
const squareDiamond: ShapeFn = (d: Dims): Primitives => {
  const a = positive(d.a, 'a', 'Enter a side length greater than zero.')
  const dg = a * Math.SQRT2
  return {
    A: a * a,
    ...envelope(dg, dg, dg / 2, dg / 2),
    Po: 4 * a,
    Pi: 0,
    Ix: a ** 4 / 12,
    Iy: a ** 4 / 12,
    // Zx = D³/12 with D = a√2, the triangular-half result.
    Zx: (Math.SQRT2 * a ** 3) / 6,
    Zy: (Math.SQRT2 * a ** 3) / 6,
    formulas: {
      A: 'A = a²',
      Ix: 'Ix = a⁴/12  (unchanged by the turn)',
      Iy: 'Iy = a⁴/12',
      Zx: 'Zx = a³√2/6',
      Zy: 'Zy = a³√2/6',
    },
  }
}

/**
 * A closed box: a × b outside, wall t1 all round, so the bore is
 * (a − 2t1) × (b − 2t1). Concentric, therefore the two rectangles share a
 * centroid and the second moments subtract directly.
 */
const thinWalledRectangle: ShapeFn = (d: Dims): Primitives => {
  const a = positive(d.a, 'a', 'Enter an outer height greater than zero.')
  const b = positive(d.b, 'b', 'Enter an outer width greater than zero.')
  const t = positive(d.t1, 't1', 'Enter a wall thickness greater than zero.')
  if (2 * t >= a || 2 * t >= b) {
    throw new ShapeError(
      'The wall has to be thinner than half the section, or the two walls meet and there is no bore left.',
      't1',
    )
  }
  const ai = a - 2 * t
  const bi = b - 2 * t
  return {
    A: a * b - ai * bi,
    ...envelope(b, a, b / 2, a / 2),
    Po: 2 * (a + b),
    Pi: 2 * (ai + bi),
    Ix: (b * a ** 3 - bi * ai ** 3) / 12,
    Iy: (b ** 3 * a - bi ** 3 * ai) / 12,
    Zx: (b * a * a - bi * ai * ai) / 4,
    Zy: (a * b * b - ai * bi * bi) / 4,
    formulas: {
      A: 'A = ab − a₁b₁,  a₁ = a − 2t₁,  b₁ = b − 2t₁',
      Ix: 'Ix = (ba³ − b₁a₁³)/12',
      Iy: 'Iy = (b³a − b₁³a₁)/12',
      Zx: 'Zx = (ba² − b₁a₁²)/4',
      Zy: 'Zy = (ab² − a₁b₁²)/4',
    },
  }
}

export const BASIC_SHAPES: Record<string, ShapeFn> = {
  square,
  triangle,
  hexagon,
  octagon,
  regularPolygon,
  cross,
  rotatedRectangle,
  squareDiamond,
  thinWalledRectangle,
}

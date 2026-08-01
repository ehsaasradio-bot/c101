import { ShapeError } from './shapes'
import type { Dims, Primitives, ShapeFn } from './shapes'

/*
 * The eleven curved sections: circles cut about, ellipses, and the two
 * parabolic areas.
 *
 * Everything here is classical plane geometry — the same closed forms appear in
 * AISC, Eurocode or an 1870 textbook — so nothing depends on a licensed
 * design-value table.
 *
 * Three things are worth stating before the formulas, because each is a place a
 * section calculator is usually wrong.
 *
 * 1. MOST OF THESE ARE ASYMMETRIC top to bottom, so cTop and cBot are not
 *    interchangeable. A half circle's centroid sits 4R/3π ≈ 0.4244R above the
 *    flat, not R/2, so the elastic modulus at the flat face and at the crown are
 *    different numbers and the smaller one governs first yield. The same is true
 *    of every sector, every segment, both quadrants and both parabolic areas.
 *
 * 2. Zx IS TAKEN ABOUT THE EQUAL-AREA AXIS, the line with half the material
 *    either side, because that is where a fully plastic section must hinge if
 *    the axial force is to balance. On a half circle that axis is at
 *    y ≈ 0.4040R while the centroid is at 0.4244R — genuinely different lines.
 *    And the error is not a wash: Σ A|y − y₀| is minimised at the median, so
 *    reusing the centroid returns a LARGER Zx, which is the unconservative
 *    direction. Every Zx below is derived about the equal-area axis, found from
 *    the areas alone and never from the centroid.
 *
 * 3. FINITENESS IS CHECKED FIRST. Values arrive from a form, so an unparseable
 *    box is NaN, and `NaN <= 0` is false — a magnitude test on its own lets it
 *    straight through and turns every property downstream into NaN.
 *
 * The curved outlines share one piece of machinery: the chord of a circle at
 * height y is 2√(R² − y²), whose first three moments have exact
 * antiderivatives (F0, F1, F2 below). Every ellipse here is a circle stretched
 * along one axis, and an affine stretch by k multiplies A and Ix by k, Iy by k³,
 * Zx by k and Zy by k² while leaving the height geometry — and therefore the
 * equal-area axis — untouched. So the circle is solved once and the ellipses
 * follow from it rather than from a second, independently mistyped table.
 */

/** Degrees in, radians out — the only place the input unit is undone. */
const RAD = Math.PI / 180

/**
 * Finiteness FIRST, magnitude second. `NaN > 0` and `NaN <= 0` are both false,
 * so the order here is load-bearing rather than stylistic.
 */
function positive(x: number, field: string, message: string): number {
  if (!Number.isFinite(x)) throw new ShapeError(message, field)
  if (!(x > 0)) throw new ShapeError(message, field)
  return x
}

/**
 * Bounding-box bookkeeping, written once. The centroid is given as a distance
 * from the left and bottom of the envelope and the four fibre distances follow
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
 * The circular chord, and its exact moments.
 *
 * w(y) = 2√(R² − y²) with y measured from the CENTRE of the circle, so the same
 * three antiderivatives serve the full disc, the half, the quadrant, the sector
 * and the segment — the only thing that changes between them is the pair of
 * limits, and for the sector the straight flanks added underneath.
 * ────────────────────────────────────────────────────────────────────────── */

/** √(R² − y²), clamped, because a limit landing a rounding step past ±R is not an error. */
const chordHalf = (R: number, y: number): number => Math.sqrt(Math.max(R * R - y * y, 0))

/** ∫w dy — area below y. */
const F0 = (R: number, y: number): number =>
  y * chordHalf(R, y) + R * R * Math.asin(Math.min(Math.max(y / R, -1), 1))

/** ∫w·y dy — first moment below y, about the centre. */
const F1 = (R: number, y: number): number => -(2 / 3) * chordHalf(R, y) ** 3

/** ∫w·y² dy — second moment below y, about the centre. */
const F2 = (R: number, y: number): number =>
  (y * (2 * y * y - R * R) * chordHalf(R, y)) / 4 +
  ((R ** 4) / 4) * Math.asin(Math.min(Math.max(y / R, -1), 1))

/**
 * Ramanujan's ellipse perimeter. Exact for a circle and inside one part in 10⁹
 * for every aspect ratio a section calculator will ever be handed — the closed
 * form does not exist, and quoting a wrong one to more digits would be worse.
 */
function ellipsePerimeter(rx: number, ry: number): number {
  const h = ((rx - ry) / (rx + ry)) ** 2
  return Math.PI * (rx + ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)))
}

/** Arc length of y = h(1 − (x/w)²) from the crown out to x = w. */
function parabolaArc(w: number, h: number): number {
  const k = (2 * h) / w
  return (w * Math.sqrt(1 + k * k)) / 2 + (w * Math.asinh(k)) / (2 * k)
}

/**
 * The equal-area axis, by bisection on a monotone area-below function.
 *
 * Bisection rather than Newton because the derivative is the chord, which is
 * zero at the crown of every one of these shapes; and 200 halvings take a
 * double past its last bit long before they run out, so this converges to the
 * representable answer rather than to a tolerance.
 */
function equalAreaAxis(areaBelow: (y: number) => number, y0: number, y1: number, half: number): number {
  let lo = y0
  let hi = y1
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (areaBelow(mid) < half) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/**
 * The plastic modulus about the equal-area axis.
 *
 * Both halves hold exactly A/2 by construction, so the y_p·(A/2) terms cancel
 * and Zx = ∫|y − y_p| dA collapses to the difference of the two first moments —
 * about any origin at all, which is why the caller may measure from wherever
 * suits its own algebra.
 */
function plasticX(
  areaBelow: (y: number) => number,
  momentBelow: (y: number) => number,
  y0: number,
  y1: number,
): { yp: number; Zx: number } {
  const A = areaBelow(y1) - areaBelow(y0)
  const yp = equalAreaAxis((y) => areaBelow(y) - areaBelow(y0), y0, y1, A / 2)
  const below = momentBelow(yp) - momentBelow(y0)
  const above = momentBelow(y1) - momentBelow(yp)
  return { yp, Zx: above - below }
}

/* ────────────────────────────────────────────────────────────────────────── *
 * The disc, halved and quartered — solved once, in a circle, and stretched.
 * ────────────────────────────────────────────────────────────────────────── */

/** The numbers a stretch acts on, before the envelope is wrapped round them. */
interface Core {
  A: number
  /** From the flat edge up. */
  cy: number
  /** From the straight left edge across; half the width on a symmetric shape. */
  cx: number
  Ix: number
  Iy: number
  Zx: number
  Zy: number
}

/**
 * A half disc of radius R, flat side down.
 *
 * The centroid is the classical 4R/3π from the flat. The equal-area axis is
 * NOT: it is the root of y√(R² − y²) + R²asin(y/R) = πR²/4, which lands at
 * about 0.4040R while the centroid sits at 0.4244R. Both are needed and neither
 * substitutes for the other.
 */
function halfDisc(R: number): Core {
  const { Zx } = plasticX(
    (y) => F0(R, y),
    (y) => F1(R, y),
    0,
    R,
  )
  return {
    A: (Math.PI * R * R) / 2,
    cy: (4 * R) / (3 * Math.PI),
    cx: R,
    Ix: R ** 4 * (Math.PI / 8 - 8 / (9 * Math.PI)),
    Iy: (Math.PI * R ** 4) / 8,
    Zx,
    // The vertical centre-line already halves the area, so no cut is needed:
    // each chord contributes 2·(w/2)·(w/4) = w²/4, and ∫(R² − y²)dy over 0…R
    // is 2R³/3 — exactly half the full disc's 4R³/3.
    Zy: (2 / 3) * R ** 3,
  }
}

/**
 * A quarter disc of radius R, straight edges along the bottom and the left.
 *
 * Cutting the half disc down its centre-line halves every area and every
 * moment about a horizontal axis without moving a single height, so the
 * equal-area axis and the centroid height are the half disc's and Zx is simply
 * halved. The 45° diagonal is a symmetry line, so the two directions agree.
 */
function quarterDisc(R: number): Core {
  const half = halfDisc(R)
  return {
    A: half.A / 2,
    cy: half.cy,
    cx: half.cy,
    Ix: half.Ix / 2,
    Iy: half.Ix / 2,
    Zx: half.Zx / 2,
    Zy: half.Zx / 2,
  }
}

/**
 * Stretch a core by k in the x direction — the affine map that turns a circle
 * into an ellipse.
 *
 * Areas and every x-length scale by k; a second moment about a horizontal axis
 * is ∫y²dA, so it scales by k as well, while ∫x²dA picks up two more powers.
 * Zx = ∫|y − y_p|dA scales by k and Zy = ∫|x − x_p|dA by k². Heights are
 * untouched, so the equal-area axis found in the circle is still the right line
 * in the ellipse.
 */
function stretch(core: Core, k: number): Core {
  return {
    A: core.A * k,
    cy: core.cy,
    cx: core.cx * k,
    Ix: core.Ix * k,
    Iy: core.Iy * k ** 3,
    Zx: core.Zx * k,
    Zy: core.Zy * k ** 2,
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 * The sector and the segment.
 *
 * Both are written with the circle's centre at the origin and the axis of
 * symmetry vertical, so `y` below is measured from the centre and the envelope
 * is wrapped round afterwards. Both take the HALF angle α in radians, because
 * every closed form for them is a function of the half angle and converting
 * once at the boundary is cheaper than remembering which is which twice a line.
 * ────────────────────────────────────────────────────────────────────────── */

/** The full shape, with the extra geometry the envelope needs. */
interface Region extends Core {
  /** Bottom and top of the outline, still measured from the circle's centre. */
  yBot: number
  width: number
  Po: number
}

/**
 * A circular sector: apex at the centre, half angle α, radius R.
 *
 * Past 90° the two straight flanks fall BELOW the apex and the outline stops
 * being a triangle capped by an arc — it becomes a disc with a wedge bitten out
 * of the bottom. The area-below function branches on that; the closed forms for
 * A, Ix and Iy do not, because polar integration never saw the distinction.
 */
function sectorRegion(R: number, alpha: number): Region {
  const c = Math.cos(alpha)
  const s = Math.sin(alpha)
  const A = R * R * alpha
  // 2R·sinα/(3α) from the apex, along the bisector — the classical result, and
  // it tends to 2R/3 as the sector closes and to 0 as it becomes a full disc.
  const yc = alpha > 0 ? (2 * R * s) / (3 * alpha) : (2 * R) / 3
  const yBot = alpha <= Math.PI / 2 ? 0 : R * c

  let areaBelow: (y: number) => number
  let momentBelow: (y: number) => number

  if (alpha <= Math.PI / 2) {
    // Two straight flanks up to the chord at y = R·cosα, an arc above it.
    const t = Math.tan(alpha)
    const yc0 = R * c
    areaBelow = (y) =>
      y <= yc0 ? y * y * t : yc0 * yc0 * t + (F0(R, y) - F0(R, yc0))
    momentBelow = (y) =>
      y <= yc0
        ? (2 / 3) * y ** 3 * t
        : (2 / 3) * yc0 ** 3 * t + (F1(R, y) - F1(R, yc0))
  } else {
    // A disc missing a wedge of half angle β about the downward axis. The notch
    // half-width at depth |y| is |y|·tanβ, so w = 2√(R² − y²) − 2|y|tanβ there.
    const beta = Math.PI - alpha
    const m = Math.tan(beta)
    areaBelow = (y) =>
      y <= 0
        ? F0(R, y) - F0(R, yBot) + m * (y * y - yBot * yBot)
        : F0(R, 0) - F0(R, yBot) + m * (0 - yBot * yBot) + (F0(R, y) - F0(R, 0))
    momentBelow = (y) =>
      y <= 0
        ? F1(R, y) - F1(R, yBot) + (2 * m * (y ** 3 - yBot ** 3)) / 3
        : F1(R, 0) - F1(R, yBot) + (2 * m * (0 - yBot ** 3)) / 3 + (F1(R, y) - F1(R, 0))
  }

  const { Zx } = plasticX(areaBelow, momentBelow, yBot, R)

  /*
   * Zy = ∫|x|dA about the bisector, which already halves the area.
   *
   * A row of material running from n to s each side contributes s² − n², NOT
   * (s − n)² — the second is the answer for a strip that starts at the axis,
   * and past 90° the notch means it does not. With n = |y|·tanβ the two terms
   * telescope, and both branches of the outline land on the same single form.
   */
  const Zy = (2 / 3) * R ** 3 * (1 - c)

  return {
    A,
    cy: yc - yBot,
    cx: alpha <= Math.PI / 2 ? R * s : R,
    // ∫y²dA about the apex, then the parallel axis onto the centroid just found.
    Ix: ((R ** 4) / 8) * (2 * alpha + Math.sin(2 * alpha)) - A * yc * yc,
    // The bisector is a symmetry axis through the centroid, so no shift is due.
    Iy: ((R ** 4) / 8) * (2 * alpha - Math.sin(2 * alpha)),
    Zx,
    Zy,
    yBot,
    width: 2 * (alpha <= Math.PI / 2 ? R * s : R),
    Po: 2 * R + 2 * R * alpha,
  }
}

/**
 * A circular segment: everything the chord at y = R·cosα cuts off above it.
 *
 * Sector minus the triangle under the chord, but written from its own limits
 * rather than as a subtraction, so a 360° segment comes out a whole disc
 * without a cancellation of two large numbers.
 */
function segmentRegion(R: number, alpha: number): Region {
  const c = Math.cos(alpha)
  const s = Math.sin(alpha)
  const yBot = R * c

  const A = R * R * (alpha - s * c)
  const M = (2 / 3) * R ** 3 * s ** 3
  const yc = M / A

  const { Zx } = plasticX(
    (y) => F0(R, y),
    (y) => F1(R, y),
    yBot,
    R,
  )

  return {
    A,
    cy: yc - yBot,
    cx: alpha <= Math.PI / 2 ? R * s : R,
    Ix: ((R ** 4) / 4) * (alpha - c * s * (2 * c * c - 1)) - A * yc * yc,
    Iy: R ** 4 * (alpha / 4 - (c * s ** 3) / 6 - (c * s) / 4),
    Zx,
    // ∫w²/4 dy = ∫(R² − y²)dy between the chord and the crown.
    Zy: R ** 3 * (2 / 3 - c + c ** 3 / 3),
    yBot,
    width: 2 * (alpha <= Math.PI / 2 ? R * s : R),
    Po: 2 * R * s + 2 * R * alpha,
  }
}

/** Both angular sections read the same box, and refuse the same values. */
function halfAngle(d: Dims): number {
  if (!Number.isFinite(d.angle) || !(d.angle > 0) || d.angle > 360) {
    throw new ShapeError('Enter an angle greater than zero and no more than 360 degrees.', 'angle')
  }
  return (d.angle * RAD) / 2
}

/* ────────────────────────────────────────────────────────────────────────── *
 * The eleven sections.
 * ────────────────────────────────────────────────────────────────────────── */

/** A pipe: outer diameter a, wall t₁. Doubly symmetric, so both axes are easy. */
const thinWalledCircle: ShapeFn = (d: Dims): Primitives => {
  const a = positive(d.a, 'a', 'Enter an outer diameter greater than zero.')
  const t = positive(d.t1, 't1', 'Enter a wall thickness greater than zero.')
  const R = a / 2
  if (t >= R) {
    throw new ShapeError(
      'The wall is as thick as the radius, so the two walls meet at the middle and there is no bore left. Use the solid round section instead.',
      't1',
    )
  }
  const Ri = R - t
  return {
    A: Math.PI * (R * R - Ri * Ri),
    ...envelope(a, a, R, R),
    Po: 2 * Math.PI * R,
    Pi: 2 * Math.PI * Ri,
    Ix: (Math.PI * (R ** 4 - Ri ** 4)) / 4,
    Iy: (Math.PI * (R ** 4 - Ri ** 4)) / 4,
    // Two half annuli, each with its centroid 4(R³ − Ri³)/(3π(R² − Ri²)) off the
    // axis; the π cancels against the area and leaves the tidy form below.
    Zx: (4 / 3) * (R ** 3 - Ri ** 3),
    Zy: (4 / 3) * (R ** 3 - Ri ** 3),
    formulas: {
      A: 'A = π(R² − Rᵢ²),  R = a/2,  Rᵢ = R − t₁',
      Ix: 'Ix = π(R⁴ − Rᵢ⁴)/4',
      Iy: 'Iy = π(R⁴ − Rᵢ⁴)/4',
      Zx: 'Zx = 4(R³ − Rᵢ³)/3',
      Zy: 'Zy = 4(R³ − Rᵢ³)/3',
    },
  }
}

/** Half a disc of diameter a, flat side down. */
const halfCircle: ShapeFn = (d: Dims): Primitives => {
  const a = positive(d.a, 'a', 'Enter a diameter greater than zero.')
  const R = a / 2
  const core = halfDisc(R)
  return {
    A: core.A,
    ...envelope(a, R, R, core.cy),
    Po: Math.PI * R + a,
    Pi: 0,
    Ix: core.Ix,
    Iy: core.Iy,
    Zx: core.Zx,
    Zy: core.Zy,
    formulas: {
      A: 'A = πR²/2,  R = a/2',
      Ix: 'Ix = R⁴(9π² − 64)/(72π)  — about the centroid at 4R/3π, not at R/2',
      Iy: 'Iy = πR⁴/8',
      Zx: 'Zx = ∫|y − y_p|dA,  y_p ≈ 0.4040R from the flat: the equal-area axis, not the centroid',
      Zy: 'Zy = 2R³/3',
    },
  }
}

/** A quarter disc of diameter a: straight edges along the bottom and the left. */
const quarterCircle: ShapeFn = (d: Dims): Primitives => {
  const a = positive(d.a, 'a', 'Enter a diameter greater than zero.')
  const R = a / 2
  const core = quarterDisc(R)
  return {
    A: core.A,
    ...envelope(R, R, core.cx, core.cy),
    Po: (Math.PI * R) / 2 + 2 * R,
    Pi: 0,
    Ix: core.Ix,
    Iy: core.Iy,
    Zx: core.Zx,
    Zy: core.Zy,
    formulas: {
      A: 'A = πR²/4,  R = a/2',
      Ix: 'Ix = R⁴(9π² − 64)/(144π)  — about the centroid at 4R/3π from each straight edge',
      Iy: 'Iy = R⁴(9π² − 64)/(144π)  — the 45° diagonal makes the two directions alike',
      Zx: 'Zx = ∫|y − y_p|dA about the equal-area axis y_p ≈ 0.4040R',
      Zy: 'Zy = ∫|x − x_p|dA about the equal-area axis x_p ≈ 0.4040R',
    },
  }
}

/** A pie slice: radius a/2, subtending `angle`, apex at the bottom. */
const circularSector: ShapeFn = (d: Dims): Primitives => {
  const a = positive(d.a, 'a', 'Enter a diameter greater than zero.')
  const alpha = halfAngle(d)
  const R = a / 2
  const r = sectorRegion(R, alpha)
  return {
    A: r.A,
    ...envelope(r.width, R - r.yBot, r.width / 2, r.cy),
    Po: r.Po,
    Pi: 0,
    Ix: r.Ix,
    Iy: r.Iy,
    Zx: r.Zx,
    Zy: r.Zy,
    formulas: {
      A: 'A = R²α,  R = a/2,  α the HALF angle in radians',
      Ix: 'Ix = R⁴(2α + sin2α)/8 − Aȳ²,  ȳ = 2R·sinα/(3α) from the apex',
      Iy: 'Iy = R⁴(2α − sin2α)/8',
      Zx: 'Zx = ∫|y − y_p|dA about the equal-area axis y_p — which is not ȳ',
      Zy: 'Zy = 2R³(1 − cosα)/3',
    },
  }
}

/** Everything a chord subtending `angle` cuts off a disc of diameter a. */
const circularSegment: ShapeFn = (d: Dims): Primitives => {
  const a = positive(d.a, 'a', 'Enter a diameter greater than zero.')
  const alpha = halfAngle(d)
  const R = a / 2
  const r = segmentRegion(R, alpha)
  return {
    A: r.A,
    ...envelope(r.width, R - r.yBot, r.width / 2, r.cy),
    Po: r.Po,
    Pi: 0,
    Ix: r.Ix,
    Iy: r.Iy,
    Zx: r.Zx,
    Zy: r.Zy,
    formulas: {
      A: 'A = R²(α − sinα·cosα),  R = a/2,  α the HALF angle in radians',
      Ix: 'Ix = R⁴[α − sinα·cosα(2cos²α − 1)]/4 − Aȳ²,  ȳ = 2R·sin³α/(3(α − sinα·cosα))',
      Iy: 'Iy = R⁴[α/4 − sin³α·cosα/6 − sinα·cosα/4]',
      Zx: 'Zx = ∫|y − y_p|dA about the equal-area axis y_p — which is not ȳ',
      Zy: 'Zy = R³(2/3 − cosα + cos³α/3)',
    },
  }
}

/** A solid ellipse: major axis a vertical, minor axis b across. */
const oval: ShapeFn = (d: Dims): Primitives => {
  const a = positive(d.a, 'a', 'Enter a major axis greater than zero.')
  const b = positive(d.b, 'b', 'Enter a minor axis greater than zero.')
  const ry = a / 2
  const rx = b / 2
  return {
    A: Math.PI * rx * ry,
    ...envelope(b, a, rx, ry),
    Po: ellipsePerimeter(rx, ry),
    Pi: 0,
    Ix: (Math.PI * rx * ry ** 3) / 4,
    Iy: (Math.PI * ry * rx ** 3) / 4,
    Zx: (4 / 3) * rx * ry * ry,
    Zy: (4 / 3) * ry * rx * rx,
    formulas: {
      A: 'A = πab/4',
      Ix: 'Ix = πba³/64',
      Iy: 'Iy = πab³/64',
      Zx: 'Zx = a²b/6',
      Zy: 'Zy = ab²/6',
    },
  }
}

/** The same ellipse with a concentric elliptical bore, wall t₁ all round. */
const hollowOval: ShapeFn = (d: Dims): Primitives => {
  const a = positive(d.a, 'a', 'Enter an outer major axis greater than zero.')
  const b = positive(d.b, 'b', 'Enter an outer minor axis greater than zero.')
  const t = positive(d.t1, 't1', 'Enter a wall thickness greater than zero.')
  const ry = a / 2
  const rx = b / 2
  if (t >= Math.min(rx, ry)) {
    throw new ShapeError(
      'The wall is as thick as the shorter semi-axis, so the walls meet and there is no bore left. Thin the wall or enlarge the section.',
      't1',
    )
  }
  const ryi = ry - t
  const rxi = rx - t
  return {
    A: Math.PI * (rx * ry - rxi * ryi),
    ...envelope(b, a, rx, ry),
    Po: ellipsePerimeter(rx, ry),
    Pi: ellipsePerimeter(rxi, ryi),
    // Concentric, so the two ellipses share a centroid and everything subtracts.
    Ix: (Math.PI * (rx * ry ** 3 - rxi * ryi ** 3)) / 4,
    Iy: (Math.PI * (ry * rx ** 3 - ryi * rxi ** 3)) / 4,
    Zx: (4 / 3) * (rx * ry * ry - rxi * ryi * ryi),
    Zy: (4 / 3) * (ry * rx * rx - ryi * rxi * rxi),
    formulas: {
      A: 'A = π(ab − a₁b₁)/4,  a₁ = a − 2t₁,  b₁ = b − 2t₁',
      Ix: 'Ix = π(ba³ − b₁a₁³)/64',
      Iy: 'Iy = π(ab³ − a₁b₁³)/64',
      Zx: 'Zx = (a²b − a₁²b₁)/6',
      Zy: 'Zy = (ab² − a₁b₁²)/6',
    },
  }
}

/** Half an ellipse, cut across the major axis: full width b, height a/2. */
const halfEllipse: ShapeFn = (d: Dims): Primitives => {
  const a = positive(d.a, 'a', 'Enter a major axis greater than zero.')
  const b = positive(d.b, 'b', 'Enter a minor axis greater than zero.')
  const ry = a / 2
  const rx = b / 2
  const core = stretch(halfDisc(ry), rx / ry)
  return {
    A: core.A,
    ...envelope(b, ry, rx, core.cy),
    Po: ellipsePerimeter(rx, ry) / 2 + b,
    Pi: 0,
    Ix: core.Ix,
    Iy: core.Iy,
    Zx: core.Zx,
    Zy: core.Zy,
    formulas: {
      A: 'A = πab/8',
      Ix: 'Ix = a³b(9π² − 64)/(1152π)  — about the centroid at 2a/3π above the flat',
      Iy: 'Iy = πab³/128',
      Zx: 'Zx = ∫|y − y_p|dA about the equal-area axis, ≈ 0.4040·(a/2) above the flat',
      Zy: 'Zy = ab²/24',
    },
  }
}

/** A quarter ellipse: straight edges along the bottom and the left. */
const ellipticalQuadrant: ShapeFn = (d: Dims): Primitives => {
  const a = positive(d.a, 'a', 'Enter a major axis greater than zero.')
  const b = positive(d.b, 'b', 'Enter a minor axis greater than zero.')
  const ry = a / 2
  const rx = b / 2
  const core = stretch(quarterDisc(ry), rx / ry)
  return {
    A: core.A,
    ...envelope(rx, ry, core.cx, core.cy),
    Po: ellipsePerimeter(rx, ry) / 4 + rx + ry,
    Pi: 0,
    Ix: core.Ix,
    Iy: core.Iy,
    Zx: core.Zx,
    Zy: core.Zy,
    formulas: {
      A: 'A = πab/16',
      Ix: 'Ix = a³b(9π² − 64)/(2304π)  — about the centroid at 2a/3π above the base',
      Iy: 'Iy = ab³(9π² − 64)/(2304π)  — about the centroid at 2b/3π from the left',
      Zx: 'Zx = ∫|y − y_p|dA about the equal-area axis, ≈ 0.4040·(a/2) above the base',
      Zy: 'Zy = ∫|x − x_p|dA about the equal-area axis, ≈ 0.4040·(b/2) from the left',
    },
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 * The parabolic areas.
 *
 * Both are bounded by y = a(1 − (x/w)²) over a base of width b, so the chord is
 * w(y) = b√(1 − y/a) in BOTH cases — the half area is the full one folded, and
 * the two share every property taken in the y direction, including A, c_y, Ix
 * and Zx. They part company only across the base, where one is symmetric and
 * the other is not.
 * ────────────────────────────────────────────────────────────────────────── */

/** ∫₀^y w du, with w = b√(1 − u/a): two thirds of the box, closing on the crown. */
const parabolaArea = (a: number, b: number, y: number) =>
  ((2 * a * b) / 3) * (1 - Math.max(1 - y / a, 0) ** 1.5)

/** ∫₀^y u·w du, expanded in v = 1 − u/a so it stays exact at both ends. */
function parabolaMoment(a: number, b: number, y: number): number {
  const v = Math.max(1 - y / a, 0)
  return a * a * b * (4 / 15 - (2 / 3) * v ** 1.5 + (2 / 5) * v ** 2.5)
}

/** A parabolic area: base b at the bottom, crown at height a, symmetric. */
const parabolicArea: ShapeFn = (d: Dims): Primitives => {
  const a = positive(d.a, 'a', 'Enter a height greater than zero.')
  const b = positive(d.b, 'b', 'Enter a base width greater than zero.')
  const { Zx } = plasticX(
    (y) => parabolaArea(a, b, y),
    (y) => parabolaMoment(a, b, y),
    0,
    a,
  )
  return {
    // Two thirds of the bounding rectangle — Archimedes, and the anchor the
    // tests hold this whole family to.
    A: (2 * a * b) / 3,
    ...envelope(b, a, b / 2, (2 * a) / 5),
    Po: 2 * parabolaArc(b / 2, a) + b,
    Pi: 0,
    Ix: (8 * a ** 3 * b) / 175,
    Iy: (a * b ** 3) / 30,
    Zx,
    Zy: (a * b * b) / 8,
    formulas: {
      A: 'A = 2ab/3  — two thirds of the box that bounds it',
      Ix: 'Ix = 8a³b/175  — about the centroid at 2a/5 above the base, not a/2',
      Iy: 'Iy = ab³/30',
      Zx: 'Zx = ∫|y − y_p|dA,  y_p = a(1 − 2^(−2/3)) ≈ 0.3701a: the equal-area axis',
      Zy: 'Zy = ab²/8',
    },
  }
}

/** Half of it: the crown over the left edge, the base running b to the right. */
const parabolicHalfArea: ShapeFn = (d: Dims): Primitives => {
  const a = positive(d.a, 'a', 'Enter a height greater than zero.')
  const b = positive(d.b, 'b', 'Enter a base width greater than zero.')
  const { Zx } = plasticX(
    (y) => parabolaArea(a, b, y),
    (y) => parabolaMoment(a, b, y),
    0,
    a,
  )
  // Across the base the section is NOT symmetric, so the vertical equal-area
  // axis has to be found the same way the horizontal one was. It solves
  // s³ − 3s + 1 = 0 at s = x_p/b, i.e. x_p ≈ 0.3473b, while the centroid is at
  // 3b/8 = 0.375b — close enough to look like a typo and far enough to matter.
  const { Zx: Zy } = plasticX(
    (x) => a * (x - x ** 3 / (3 * b * b)),
    (x) => a * ((x * x) / 2 - x ** 4 / (4 * b * b)),
    0,
    b,
  )
  return {
    A: (2 * a * b) / 3,
    ...envelope(b, a, (3 * b) / 8, (2 * a) / 5),
    Po: parabolaArc(b, a) + b + a,
    Pi: 0,
    Ix: (8 * a ** 3 * b) / 175,
    Iy: (19 * a * b ** 3) / 480,
    Zx,
    Zy,
    formulas: {
      A: 'A = 2ab/3',
      Ix: 'Ix = 8a³b/175  — about the centroid at 2a/5 above the base',
      Iy: 'Iy = 19ab³/480  — about the centroid at 3b/8 from the crown side',
      Zx: 'Zx = ∫|y − y_p|dA,  y_p = a(1 − 2^(−2/3)) ≈ 0.3701a',
      Zy: 'Zy = ∫|x − x_p|dA,  x_p/b the root of s³ − 3s + 1 = 0, ≈ 0.3473',
    },
  }
}

export const CURVED_SHAPES: Record<string, ShapeFn> = {
  thinWalledCircle,
  halfCircle,
  quarterCircle,
  circularSector,
  circularSegment,
  oval,
  hollowOval,
  halfEllipse,
  ellipticalQuadrant,
  parabolicArea,
  parabolicHalfArea,
}

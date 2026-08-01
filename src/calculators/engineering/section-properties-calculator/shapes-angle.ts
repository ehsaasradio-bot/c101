import { ShapeError } from './shapes'
import type { Dims, Primitives, ShapeFn } from './shapes'

/**
 * The seven sections that are not symmetric about both axes: two angles, two
 * channels, a zed and two trapezoids.
 *
 * A rectangle or a circle can be written down in one line because its centroid
 * is the middle of its bounding box. None of these can. An angle's centroid
 * sits low and to one side, a trapezoid's sits toward its wider end, and the
 * elastic modulus therefore differs between the two faces — Ix/cTop is not
 * Ix/cBot. Reporting one of them for both is the error a designer is actually
 * hurt by, because it overstates the capacity of the governing face.
 *
 * So every shape here is built the same way, and the way is the classical one:
 *
 *   1. Cut the outline into rectangles and right triangles that do not overlap.
 *   2. A = ΣAᵢ, and the centroid is the first-moment average, ΣAᵢxᵢ / ΣAᵢ.
 *   3. Parallel axis to shift each part onto the common centroidal axis:
 *      I = Σ(I₀ᵢ + Aᵢdᵢ²), where dᵢ is that part's own centroid to the section's.
 *   4. The plastic moduli are NOT taken about that centroid. They are taken
 *      about the equal-area axis, which is a different line entirely on an
 *      unsymmetric section — see `plastic` below.
 *
 * All of it is geometry. The same closed forms appear in AISC, Eurocode or an
 * 1870 textbook, so nothing here depends on a licensed design-value table.
 */

/* ── guards ─────────────────────────────────────────────────────────────── */

/**
 * Finiteness first. An unparseable field arrives as NaN, and `NaN > 0` is false
 * while `NaN <= 0` is *also* false — so a magnitude test on its own lets NaN
 * through and every property downstream comes out NaN with no error shown.
 */
function need(x: number, fieldId: string, what: string): number {
  if (!Number.isFinite(x) || !(x > 0)) {
    throw new ShapeError(`Enter ${what} greater than zero.`, fieldId)
  }
  return x
}

/**
 * The same finiteness-first test, for a dimension that is allowed to be zero.
 *
 * Only the general trapezoid's offset needs it: a top edge flush with the left
 * of the base is a right trapezoid, which is a real section and not an error.
 */
function needNonNegative(x: number, fieldId: string, what: string): number {
  if (!Number.isFinite(x) || !(x >= 0)) {
    throw new ShapeError(`Enter ${what} of zero or more.`, fieldId)
  }
  return x
}

function below(x: number, limit: number, fieldId: string, message: string): number {
  if (!(x < limit)) throw new ShapeError(message, fieldId)
  return x
}

function atMost(x: number, limit: number, fieldId: string, message: string): number {
  if (!(x <= limit)) throw new ShapeError(message, fieldId)
  return x
}

const DEG = Math.PI / 180

/**
 * How far a tapering flange's inner face falls across its own overhang.
 *
 * The outer face stays flat — it is the extreme fibre — and the inner face
 * slopes away from the web at `angle`, so the flange is thickest at the root
 * and thinnest at the tip. Zero degrees drops the taper entirely and reproduces
 * the untapered section exactly, which is the property the tests lean on.
 */
function taperDrop(angle: number, run: number, thickness: number): number {
  if (!Number.isFinite(angle) || angle < 0 || angle >= 90) {
    throw new ShapeError('Enter a taper of at least 0 and less than 90 degrees.', 'angle')
  }
  const drop = run * Math.tan(angle * DEG)
  if (drop > thickness) {
    throw new ShapeError(
      'That taper runs the flange out to nothing before it reaches the tip, so the section is no longer as wide as it says. Reduce the angle or thicken the flange.',
      'angle',
    )
  }
  return drop
}

/* ── parts ──────────────────────────────────────────────────────────────── */

/**
 * One rectangle or one right triangle, carrying both what the parallel-axis sum
 * needs (area, own centroid, own second moments) and what the equal-area search
 * needs (how wide it is at each height, how tall it is at each offset).
 *
 * Both profiles are linear over the part's own extent, which is what makes the
 * plastic search exact rather than iterative: a rectangle is constant, a right
 * triangle ramps from its full leg to nothing.
 */
interface Part {
  A: number
  cx: number
  cy: number
  /** Second moments about the part's OWN centroidal axes, before any shift. */
  Ix0: number
  Iy0: number
  /** Width, from the bottom of the part to its top. */
  y0: number
  y1: number
  w0: number
  w1: number
  /** Height, from the left of the part to its right. */
  x0: number
  x1: number
  h0: number
  h1: number
}

/** Lower-left corner at (x, y). */
function rect(x: number, y: number, w: number, h: number): Part {
  return {
    A: w * h,
    cx: x + w / 2,
    cy: y + h / 2,
    Ix0: (w * h ** 3) / 12,
    Iy0: (h * w ** 3) / 12,
    y0: y,
    y1: y + h,
    w0: w,
    w1: w,
    x0: x,
    x1: x + w,
    h0: h,
    h1: h,
  }
}

/**
 * Right angle at (x, y), legs dx and dy — either of which may be negative, so
 * the same call describes all four orientations a taper can take.
 *
 * I₀ = bh³/36 for a triangle about the centroidal axis parallel to a side, and
 * it is unaffected by shearing the apex along that side, which is why it holds
 * for each leg in turn.
 */
function tri(x: number, y: number, dx: number, dy: number): Part {
  const w = Math.abs(dx)
  const h = Math.abs(dy)
  return {
    A: (w * h) / 2,
    cx: x + dx / 3,
    cy: y + dy / 3,
    Ix0: (w * h ** 3) / 36,
    Iy0: (h * w ** 3) / 36,
    // Full leg at the right-angle corner, nothing at the opposite vertex.
    y0: Math.min(y, y + dy),
    y1: Math.max(y, y + dy),
    w0: dy > 0 ? w : 0,
    w1: dy > 0 ? 0 : w,
    x0: Math.min(x, x + dx),
    x1: Math.max(x, x + dx),
    h0: dx > 0 ? h : 0,
    h1: dx > 0 ? 0 : h,
  }
}

/* ── the equal-area axis ────────────────────────────────────────────────── */

/** A stretch over which the material measure varies linearly. */
interface Ramp {
  lo: number
  hi: number
  vLo: number
  vHi: number
}

/**
 * The parts' individual ramps, added into one profile of the whole section.
 *
 * Cutting at every part boundary leaves stretches over which the sum is linear,
 * so two samples fix each one. They are taken strictly inside and extrapolated
 * outward, because the value exactly AT a cut is ambiguous — that is the height
 * where a flange both starts and stops.
 */
function merge(ramps: Ramp[]): Ramp[] {
  const cuts = [...new Set(ramps.flatMap((r) => [r.lo, r.hi]))].sort((m, n) => m - n)
  const at = (t: number) =>
    ramps.reduce(
      (sum, r) =>
        sum + (t <= r.lo || t >= r.hi ? 0 : r.vLo + ((r.vHi - r.vLo) * (t - r.lo)) / (r.hi - r.lo)),
      0,
    )
  const out: Ramp[] = []
  for (let i = 0; i + 1 < cuts.length; i++) {
    const lo = cuts[i]!
    const hi = cuts[i + 1]!
    if (!(hi > lo)) continue
    const p = at(lo + (hi - lo) / 4)
    const q = at(lo + (3 * (hi - lo)) / 4)
    out.push({ lo, hi, vLo: 1.5 * p - 0.5 * q, vHi: 1.5 * q - 0.5 * p })
  }
  return out
}

/** Split a ramp at a coordinate inside it, interpolating the measure there. */
function split(s: Ramp, at: number): Ramp[] {
  if (!(at > s.lo && at < s.hi)) return [s]
  const v = s.vLo + ((s.vHi - s.vLo) * (at - s.lo)) / (s.hi - s.lo)
  return [
    { lo: s.lo, hi: at, vLo: s.vLo, vHi: v },
    { lo: at, hi: s.hi, vLo: v, vHi: s.vHi },
  ]
}

/** ∫(u − axis)·v(u) du across one ramp, with v linear. Exact, not sampled. */
function moment(s: Ramp, axis: number): number {
  const u1 = s.lo - axis
  const u2 = s.hi - axis
  const m = (s.vHi - s.vLo) / (s.hi - s.lo)
  const F = (u: number) => (s.vLo * u ** 2) / 2 + m * (u ** 3 / 3 - (u1 * u ** 2) / 2)
  return F(u2) - F(u1)
}

/**
 * The plastic modulus, about the EQUAL-AREA axis — not about the centroid.
 *
 * At full plasticity every fibre carries the same stress, so equilibrium puts
 * the neutral axis where the areas either side are equal, not where the first
 * moments balance. On a doubly symmetric section those coincide and the
 * distinction never shows; on an angle or a trapezoid they are different lines,
 * and using the centroid instead inflates Z.
 *
 * The profile is piecewise linear, so the axis is found by solving one
 * quadratic in the stretch where the running area crosses A/2, and Z = Σ|∫u·v|
 * over the pieces either side of it.
 */
function plastic(ramps: Ramp[], A: number): number {
  const segs = merge(ramps)
  const half = A / 2
  let acc = 0
  let axis = segs.length > 0 ? segs[segs.length - 1]!.hi : 0

  for (const s of segs) {
    const L = s.hi - s.lo
    const area = ((s.vLo + s.vHi) / 2) * L
    if (!(area > 0)) continue
    if (acc + area >= half) {
      const target = half - acc
      // ∫₀ᵗ v = L(v₀t + kt²) with k half the slope; the + root is the one in
      // [0,1] whether the stretch is widening or narrowing.
      const k = (s.vHi - s.vLo) / 2
      const t =
        Math.abs(k) < 1e-12
          ? target / (s.vLo * L)
          : (-s.vLo + Math.sqrt(Math.max(s.vLo ** 2 + 4 * k * (target / L), 0))) / (2 * k)
      axis = s.lo + Math.min(Math.max(t, 0), 1) * L
      break
    }
    acc += area
  }

  let Z = 0
  for (const s of segs) for (const piece of split(s, axis)) Z += Math.abs(moment(piece, axis))
  return Z
}

/* ── assembly ───────────────────────────────────────────────────────────── */

interface Envelope {
  /** Bounding box, which is what `gross` reports. */
  W: number
  H: number
  Po: number
  formulas: Primitives['formulas']
}

function assemble(all: Part[], env: Envelope): Primitives {
  // A taper of zero, or a trapezoid whose sides match, leaves a part with no
  // area; it would contribute nothing but a degenerate ramp.
  const parts = all.filter((p) => p.A > 0)
  const A = parts.reduce((s, p) => s + p.A, 0)
  const cx = parts.reduce((s, p) => s + p.A * p.cx, 0) / A
  const cy = parts.reduce((s, p) => s + p.A * p.cy, 0) / A

  return {
    A,
    gross: env.W * env.H,
    Po: env.Po,
    // None of these seven encloses a bore: an angle, a channel, a zed and a
    // trapezoid are all open outlines.
    Pi: 0,
    cx,
    cy,
    cTop: env.H - cy,
    cBot: cy,
    cLeft: cx,
    cRight: env.W - cx,
    Ix: parts.reduce((s, p) => s + p.Ix0 + p.A * (p.cy - cy) ** 2, 0),
    Iy: parts.reduce((s, p) => s + p.Iy0 + p.A * (p.cx - cx) ** 2, 0),
    Zx: plastic(
      parts.map((p) => ({ lo: p.y0, hi: p.y1, vLo: p.w0, vHi: p.w1 })),
      A,
    ),
    Zy: plastic(
      parts.map((p) => ({ lo: p.x0, hi: p.x1, vLo: p.h0, vHi: p.h1 })),
      A,
    ),
    formulas: env.formulas,
  }
}

/* ── angles ─────────────────────────────────────────────────────────────── */

/**
 * Two rectangles that meet at the heel and do not overlap: the full horizontal
 * leg, and the vertical one standing on top of it. Cutting them this way rather
 * than as two full legs matters — overlapping parts would count the corner
 * twice, which inflates A and drags the centroid back toward the heel.
 */
const angleParts = (depth: number, width: number, t: number): Part[] => [
  rect(0, 0, width, t),
  rect(0, t, t, depth - t),
]

const equalLegAngle: ShapeFn = (d: Dims): Primitives => {
  // Both legs are the depth. Reading the width as the second leg would let a
  // mismatched pair go on calling itself an equal-leg angle.
  const L = need(d.a, 'a', 'a leg length')
  const t = need(d.t1, 't1', 'a leg thickness')
  below(
    t,
    L,
    't1',
    'The thickness has to be less than the leg length, or the angle closes up into a solid square.',
  )

  return assemble(angleParts(L, L, t), {
    W: L,
    H: L,
    // The outline is the perimeter of the square it fits inside: the two inner
    // faces give back exactly what the two leg tips take away.
    Po: 4 * L,
    formulas: {
      A: 'A = t(2a − t)',
      Ix: 'Ix = (at³ + t(a³ − t³))/3 − A·cy²',
      Iy: 'Iy = (at³ + t(a³ − t³))/3 − A·cx²',
      Zx: 'Zx = Σ|Aᵢ·dᵢ| about the horizontal equal-area axis',
      Zy: 'Zy = Σ|Aᵢ·dᵢ| about the vertical equal-area axis',
    },
  })
}

const rectangularAngle: ShapeFn = (d: Dims): Primitives => {
  const a = need(d.a, 'a', 'a leg depth')
  const b = need(d.b, 'b', 'a leg width')
  const t = need(d.t1, 't1', 'a leg thickness')
  below(t, a, 't1', 'The thickness has to be less than the depth, or the vertical leg vanishes.')
  below(t, b, 't1', 'The thickness has to be less than the width, or the horizontal leg vanishes.')

  return assemble(angleParts(a, b, t), {
    W: b,
    H: a,
    Po: 2 * (a + b),
    formulas: {
      A: 'A = t(a + b − t)',
      // Second moments about the heel, then shifted back to the centroid —
      // which is the parallel-axis theorem run in reverse.
      Ix: 'Ix = (bt³ + t(a³ − t³))/3 − A·cy²',
      Iy: 'Iy = (at³ + t(b³ − t³))/3 − A·cx²',
      Zx: 'Zx = Σ|Aᵢ·dᵢ| about the horizontal equal-area axis',
      Zy: 'Zy = Σ|Aᵢ·dᵢ| about the vertical equal-area axis',
    },
  })
}

/* ── channels ───────────────────────────────────────────────────────────── */

const channel: ShapeFn = (d: Dims): Primitives => {
  const a = need(d.a, 'a', 'a depth')
  const b = need(d.b, 'b', 'a flange width')
  const t1 = need(d.t1, 't1', 'a web thickness')
  const t2 = need(d.t2, 't2', 'a flange thickness')
  below(
    t1,
    b,
    't1',
    'The web has to be thinner than the flange is wide, or nothing projects from it.',
  )
  below(
    2 * t2,
    a,
    't2',
    'Two flanges that thick meet in the middle, leaving no web between them.',
  )

  return assemble(
    [
      // The web runs the whole depth and the flanges start where it ends, so no
      // area is claimed twice.
      rect(0, 0, t1, a),
      rect(t1, 0, b - t1, t2),
      rect(t1, a - t2, b - t1, t2),
    ],
    {
      W: b,
      H: a,
      Po: 2 * a + 4 * b - 2 * t1,
      formulas: {
        A: 'A = a·t₁ + 2t₂(b − t₁)',
        // Equal flanges put the centroid at mid-depth, so Ix needs no shift of
        // the web — but Iy does, because nothing balances the web sideways.
        Ix: 'Ix = t₁a³/12 + 2[(b − t₁)t₂³/12 + (b − t₁)t₂((a − t₂)/2)²]',
        Iy: 'Iy = Σ(hᵢwᵢ³/12 + Aᵢ(xᵢ − cx)²)',
        Zx: 'Zx = Σ|Aᵢ·dᵢ| about the horizontal equal-area axis',
        Zy: 'Zy = Σ|Aᵢ·dᵢ| about the vertical equal-area axis',
      },
    },
  )
}

/**
 * A channel whose flanges thin from the web out to the tip.
 *
 * Each flange keeps its flat outer face — that face is the extreme fibre and
 * has to stay where the depth says it is — and gives back a wedge on the inside.
 * Equal flanges top and bottom keep the centroid at mid-depth however steep the
 * taper, so what the taper actually moves is cx, and with it Iy.
 */
const taperedChannel: ShapeFn = (d: Dims): Primitives => {
  const a = need(d.a, 'a', 'a depth')
  const b = need(d.b, 'b', 'a flange width')
  const t1 = need(d.t1, 't1', 'a web thickness')
  const t2 = need(d.t2, 't2', 'a flange thickness')
  below(
    t1,
    b,
    't1',
    'The web has to be thinner than the flange is wide, or nothing projects from it to taper.',
  )
  below(2 * t2, a, 't2', 'Two flanges that thick meet in the middle, leaving no web between them.')
  // The overhang is the run the taper falls across — from the face of the web
  // out to the tip, not from the centreline as it would be on an I-beam.
  const drop = taperDrop(d.angle, b - t1, t2)

  return assemble(
    [
      rect(0, 0, t1, a),
      // Bottom flange: the slab that survives the taper, and the wedge above it.
      rect(t1, 0, b - t1, t2 - drop),
      tri(t1, t2 - drop, b - t1, drop),
      // Top flange, the same the other way up.
      rect(t1, a - t2 + drop, b - t1, t2 - drop),
      tri(t1, a - t2 + drop, b - t1, -drop),
    ],
    {
      W: b,
      H: a,
      // The two flange tips lose 2Δ of vertical edge and gain two sloping faces.
      Po: 2 * a + 2 * b - 2 * drop + 2 * Math.hypot(b - t1, drop),
      formulas: {
        A: 'A = a·t₁ + 2t₂(b − t₁) − (b − t₁)Δ,  Δ = (b − t₁)·tan θ',
        Ix: 'Ix = Σ(I₀ᵢ + Aᵢ(yᵢ − cy)²),  cy = a/2 — equal flanges, whatever the taper',
        Iy: 'Iy = Σ(I₀ᵢ + Aᵢ(xᵢ − cx)²),  triangles at I₀ = hw³/36',
        Zx: 'Zx = ∫|y − y_p|·w dy,  y_p = a/2 by symmetry about mid-depth',
        Zy: 'Zy = ∫|x − x_p|·h dx,  x_p from ∫₀^x_p h dx = A/2 — not at cx',
      },
    },
  )
}

/* ── the zed ────────────────────────────────────────────────────────────── */

/**
 * A zed: web up the middle, one flange out to the left at the bottom and the
 * other out to the right at the top.
 *
 * It has no axis of mirror symmetry at all, and yet it is symmetric under a
 * half turn about its own centre — which puts the centroid exactly at the
 * middle of the bounding box and makes cTop equal cBot and cLeft equal cRight.
 * That is not the doubly-symmetric shortcut sneaking back in; it is a different
 * symmetry with the same consequence for the centroid and none of the same
 * consequences for the principal axes, which on a zed are rotated off the
 * geometric ones entirely. Ix and Iy here are about the geometric axes, which
 * is what every catalogue tabulates.
 */
const zedBeam: ShapeFn = (d: Dims): Primitives => {
  const a = need(d.a, 'a', 'a depth')
  const b = need(d.b, 'b', 'a flange width')
  const t1 = need(d.t1, 't1', 'a web thickness')
  const t2 = need(d.t2, 't2', 'a flange thickness')
  below(
    t1,
    b,
    't1',
    'The web has to be thinner than the flange, or neither flange projects past it.',
  )
  below(2 * t2, a, 't2', 'Two flanges that thick meet in the middle, leaving no web between them.')

  // Each flange is b wide counting the web it springs from, so the envelope is
  // 2b − t₁: the two flanges overlap across the web and must not be counted twice.
  const W = 2 * b - t1
  return assemble(
    [
      rect(b - t1, 0, t1, a),
      rect(0, 0, b - t1, t2),
      rect(b, a - t2, b - t1, t2),
    ],
    {
      W,
      H: a,
      Po: 2 * a + 4 * b - 2 * t1,
      formulas: {
        A: 'A = a·t₁ + 2t₂(b − t₁)',
        Ix: 'Ix = t₁a³/12 + 2[(b − t₁)t₂³/12 + (b − t₁)t₂((a − t₂)/2)²]',
        Iy: 'Iy = Σ(I₀ᵢ + Aᵢ(xᵢ − cx)²),  cx = (2b − t₁)/2 by the half-turn symmetry',
        Zx: 'Zx = ∫|y − y_p|·w dy about the horizontal equal-area axis',
        Zy: 'Zy = ∫|x − x_p|·h dx about the vertical equal-area axis',
      },
    },
  )
}

/* ── trapezoids ─────────────────────────────────────────────────────────── */

/**
 * The three parts a trapezoid with horizontal parallel sides always cuts into:
 * the rectangle under the top edge, and the wedge left over on each side.
 *
 * `left` is how far in from the base's left end the top edge starts, `top` how
 * long it is. Either wedge may vanish, and `assemble` drops it when it does, so
 * a right trapezoid and a rectangle are the same code path with fewer parts.
 */
const trapezoidParts = (depth: number, base: number, left: number, top: number): Part[] => [
  rect(left, 0, top, depth),
  tri(left, 0, -left, depth),
  tri(left + top, 0, base - left - top, depth),
]

/**
 * The general trapezoid: base `b` along the bottom, top edge `t₂` long starting
 * `t₁` in from the left. Asymmetric both ways — the centroid sits toward the
 * wider end vertically and toward the heavier side horizontally.
 */
const generalTrapezoid: ShapeFn = (d: Dims): Primitives => {
  const a = need(d.a, 'a', 'a depth')
  const b = need(d.b, 'b', 'a base width')
  // Flush left is a right trapezoid, so zero is a value and not a mistake.
  const left = needNonNegative(d.t1, 't1', 'an offset for the top edge')
  const top = need(d.t2, 't2', 'a top width')
  below(left, b, 't1', 'The top edge has to start somewhere along the base, not past its right end.')
  atMost(
    left + top,
    b,
    't2',
    'The top edge overhangs the base. Shorten it, or move it left, so it finishes within the width.',
  )

  return assemble(trapezoidParts(a, b, left, top), {
    W: b,
    H: a,
    // Base, top, and the two sloping sides — each the hypotenuse of its wedge.
    Po: b + top + Math.hypot(left, a) + Math.hypot(b - left - top, a),
    formulas: {
      A: 'A = a(b + t₂)/2',
      Ix: 'Ix = a³(b² + 4bt₂ + t₂²)/(36(b + t₂)),  cy = a(b + 2t₂)/(3(b + t₂))',
      Iy: 'Iy = Σ(I₀ᵢ + Aᵢ(xᵢ − cx)²) over the rectangle and the two wedges',
      Zx: 'Zx = ∫|y − y_p|·w dy,  y_p where the width has halved the area — above cy',
      Zy: 'Zy = ∫|x − x_p|·h dx about the vertical equal-area axis',
    },
  })
}

/**
 * The isosceles trapezoid: base `b`, both sides leaning in at `angle` from the
 * vertical, so the top comes out b − 2a·tan θ.
 *
 * Symmetric left to right and never top to bottom: cTop and cBot differ for
 * every angle but zero, and at zero it is exactly a rectangle.
 */
const isoscelesTrapezoid: ShapeFn = (d: Dims): Primitives => {
  const a = need(d.a, 'a', 'a depth')
  const b = need(d.b, 'b', 'a base width')
  if (!Number.isFinite(d.angle) || d.angle < 0 || d.angle >= 90) {
    throw new ShapeError('Enter a side lean of at least 0 and less than 90 degrees.', 'angle')
  }
  // Each side runs in by a·tan θ over the full depth, and the two together may
  // not eat the whole base — that would be a triangle, or worse, a crossed one.
  const lean = a * Math.tan(d.angle * DEG)
  const top = b - 2 * lean
  if (!(top > 0)) {
    throw new ShapeError(
      'The sides meet before they reach the top, which makes a triangle rather than a trapezoid. Reduce the angle or widen the base.',
      'angle',
    )
  }

  return assemble(trapezoidParts(a, b, lean, top), {
    W: b,
    H: a,
    Po: b + top + 2 * Math.hypot(lean, a),
    formulas: {
      A: 'A = a(b + t)/2,  t = b − 2a·tan θ',
      Ix: 'Ix = a³(b² + 4bt + t²)/(36(b + t)),  cy = a(b + 2t)/(3(b + t)) — not a/2',
      Iy: 'Iy = a(b + t)(b² + t²)/48,  cx = b/2 by symmetry',
      Zx: 'Zx = ∫|y − y_p|·w dy,  y_p from ∫₀^y_p w dy = A/2 — above cy, not at it',
      Zy: 'Zy = ∫|x − b/2|·h dx,  the equal-area axis is the axis of symmetry',
    },
  })
}

/* ── the registry ───────────────────────────────────────────────────────── */

/**
 * The seven sections. Each reads only the dimensions it has — an equal-leg
 * angle never looks at `b`, a plain channel never looks at `angle` — so whatever
 * the other boxes hold cannot stop a section answering.
 */
export const ANGLE_SHAPES: Record<string, ShapeFn> = {
  equalLegAngle,
  rectangularAngle,
  channel,
  taperedChannel,
  zedBeam,
  generalTrapezoid,
  isoscelesTrapezoid,
}

import type { Dims, Primitives, ShapeFn } from './shapes'
import { ShapeError } from './shapes'

/**
 * The I-beam family, and the tees cut out of it.
 *
 * Five sections that share one primitive and one hazard.
 *
 * The primitive: every one of them is a stack of horizontal bands, each a
 * trapezoid of width w₀ at its base growing linearly to w₁ at its top, centred
 * on the vertical axis. A rectangle is the w₀ = w₁ case, a tapered flange the
 * case where the two differ. One primitive covers all five, so the assembly
 * below — first moments for the centroid, parallel axis for Ix, an equal-area
 * sweep for Zx — is written once and cannot drift between shapes.
 *
 * The hazard: three of these five are NOT symmetric about mid-depth. A tee
 * carries its centroid up near the flange that holds most of the area, so cTop
 * and cBot genuinely differ and so do the two elastic moduli Ix/cTop and
 * Ix/cBot. The smaller of the pair is the one that governs first yield. Taking
 * a/2 instead — the shortcut that is right for every symmetric section — can
 * overstate the stem's capacity several times over, and that asymmetry is the
 * entire reason a tee behaves the way it does.
 *
 * The plastic modulus carries a second, independent trap. It is taken about the
 * EQUAL-AREA axis: the line with half the material either side, which is where a
 * fully plastic section must hinge if the axial force is to balance. On a
 * symmetric section that line coincides with the centroid. On a tee it does not
 * — it usually sits up inside the flange while the centroid sits below it. And
 * the mistake is not a wash: the median minimises Σ A|y − y₀|, so reusing the
 * centroid returns a number that is too LARGE, which is the unconservative
 * direction. Both axes are derived separately below.
 *
 * All of it is classical geometry — the same closed forms appear in AISC,
 * Eurocode or an 1870 textbook — so nothing here depends on a licensed
 * design-value table.
 */

const DEG = Math.PI / 180

/**
 * A horizontal slice of the section, centred on the vertical axis.
 *
 * Heights are measured up from the bottom fibre, so y runs 0 → a and the
 * centroid falls out of the first moments rather than being assumed.
 */
interface Band {
  y0: number
  y1: number
  /** Width at the base and at the top; linear in between. */
  w0: number
  w1: number
}

const heightOf = (s: Band): number => s.y1 - s.y0

const areaOf = (s: Band): number => (heightOf(s) * (s.w0 + s.w1)) / 2

/** Centroid height of one band, in the same coordinates as y0 and y1. */
function centroidOf(s: Band): number {
  const sum = s.w0 + s.w1
  // A band of no width has no area to weight; mid-height is as good as any.
  if (sum === 0) return (s.y0 + s.y1) / 2
  return s.y0 + (heightOf(s) * (s.w0 + 2 * s.w1)) / (3 * sum)
}

/** Second moment of one band about its own base: ∫u²w du, u measured from y0. */
const baseMomentOf = (s: Band): number => (heightOf(s) ** 3 * (s.w0 + 3 * s.w1)) / 12

/** Second moment of one band about its own centroid — the parallel axis, backwards. */
function ownMomentOf(s: Band): number {
  const arm = centroidOf(s) - s.y0
  return baseMomentOf(s) - areaOf(s) * arm * arm
}

/**
 * Second moment about the vertical centroidal axis: ∫w³/12 dy.
 *
 * No shift is needed, because every band is centred on that same axis. That is
 * what makes all five of these sections symmetric left to right, and it is why
 * cx lands on half the envelope for every one of them.
 */
function verticalMomentOf(s: Band): number {
  const p = s.w0
  const q = s.w1
  return (heightOf(s) * (p ** 3 + p * p * q + p * q * q + q ** 3)) / 48
}

/** First moment of both halves of one band about the vertical axis: ∫w²/4 dy. */
function verticalPlasticOf(s: Band): number {
  const p = s.w0
  const q = s.w1
  return (heightOf(s) * (p * p + p * q + q * q)) / 12
}

/** Width partway up a band. */
function widthAt(s: Band, y: number): number {
  const h = heightOf(s)
  if (h === 0) return s.w1
  return s.w0 + ((s.w1 - s.w0) * (y - s.y0)) / h
}

/** Cut a band in two at y, or hand it back whole if the cut misses it. */
function splitAt(s: Band, y: number): Band[] {
  if (!(y > s.y0) || !(y < s.y1)) return [s]
  const w = widthAt(s, y)
  return [
    { y0: s.y0, y1: y, w0: s.w0, w1: w },
    { y0: y, y1: s.y1, w0: w, w1: s.w1 },
  ]
}

/**
 * How far up a band you must go to accumulate `target` of its area.
 *
 * Linear while the band is a rectangle, quadratic once it tapers — which is the
 * whole reason this is solved rather than interpolated.
 */
function riseFor(s: Band, target: number): number {
  const h = heightOf(s)
  if (h <= 0) return 0
  const slope = (s.w1 - s.w0) / h
  let rise: number
  if (slope === 0) rise = s.w0 === 0 ? 0 : target / s.w0
  else rise = (Math.sqrt(Math.max(s.w0 * s.w0 + 2 * slope * target, 0)) - s.w0) / slope
  return Math.min(Math.max(rise, 0), h)
}

/**
 * The equal-area axis: the height with half the material either side.
 *
 * Derived here from the areas alone, and deliberately never from the centroid,
 * because on every asymmetric section in this file they are different lines.
 */
function equalAreaAxis(bands: Band[], A: number): number {
  const half = A / 2
  let below = 0
  for (const s of bands) {
    const band = areaOf(s)
    if (below + band >= half) return s.y0 + riseFor(s, half - below)
    below += band
  }
  return bands.length === 0 ? 0 : bands[bands.length - 1].y1
}

/**
 * Outline length: the bottom and top edges, both sides of every band, and the
 * horizontal step wherever one band is wider than the one it sits on.
 */
function perimeterOf(bands: Band[]): number {
  if (bands.length === 0) return 0
  let total = bands[0].w0 + bands[bands.length - 1].w1
  for (let i = 0; i < bands.length; i++) {
    const s = bands[i]
    // Two sides, sloping where the band tapers and vertical where it does not.
    total += 2 * Math.hypot(heightOf(s), (s.w1 - s.w0) / 2)
    const next = bands[i + 1]
    // Half the width change steps out on each side, so the two halves sum whole.
    if (next) total += Math.abs(next.w0 - s.w1)
  }
  return total
}

/**
 * Every primitive, from a stack of bands and the depth they fill.
 *
 * The formulas arrive as a function of the equal-area axis, so a section can
 * print the branch of the algebra that actually produced its Zx rather than a
 * neighbour's — a right number under a wrong derivation is the harder error to
 * spot, because the number itself checks out.
 */
function assemble(
  depth: number,
  bands: Band[],
  formulas: (yp: number) => Primitives['formulas'],
): Primitives {
  // A taper of zero degrees leaves bands of no height. Dropping them keeps the
  // perimeter honest, and makes the zero-taper case identical to the plain one.
  const parts = bands.filter((s) => heightOf(s) > 0)

  const A = parts.reduce((sum, s) => sum + areaOf(s), 0)
  // First moments about the bottom fibre. Nothing here assumes mid-depth, which
  // is the whole reason the tees come out right.
  const cy = parts.reduce((sum, s) => sum + areaOf(s) * centroidOf(s), 0) / A

  // Parallel axis, part by part, onto the centroid just located.
  const Ix = parts.reduce(
    (sum, s) => sum + ownMomentOf(s) + areaOf(s) * (centroidOf(s) - cy) ** 2,
    0,
  )
  const Iy = parts.reduce((sum, s) => sum + verticalMomentOf(s), 0)

  // The widest band is the envelope, which is the flange on four of these five
  // and whichever flange won on an unequal one.
  const width = parts.reduce((w, s) => Math.max(w, s.w0, s.w1), 0)

  const yp = equalAreaAxis(parts, A)
  // First moment of every part about that axis, both sides counted positive —
  // which is what makes Zx a modulus rather than a balance.
  const Zx = parts
    .flatMap((s) => splitAt(s, yp))
    .reduce((sum, s) => sum + areaOf(s) * Math.abs(centroidOf(s) - yp), 0)
  const Zy = parts.reduce((sum, s) => sum + verticalPlasticOf(s), 0)

  return {
    A,
    gross: depth * width,
    Po: perimeterOf(parts),
    // None of these five has a bore; the voids are open notches, already
    // accounted for by the widths the bands were given.
    Pi: 0,
    cx: width / 2,
    cy,
    cTop: depth - cy,
    cBot: cy,
    cLeft: width / 2,
    cRight: width / 2,
    Ix,
    Iy,
    Zx,
    Zy,
    formulas: formulas(yp),
  }
}

/**
 * Finiteness first, magnitude second.
 *
 * `NaN > 0` and `NaN <= 0` are both false, so a magnitude test on its own lets
 * an unparseable box straight through and turns every number downstream to NaN.
 */
function require_(value: number, field: string, message: string): void {
  if (!Number.isFinite(value) || !(value > 0)) throw new ShapeError(message, field)
}

/** The four dimensions every section in this file reads. */
function checkCore(d: Dims): void {
  require_(d.a, 'a', 'Enter an overall depth greater than zero.')
  require_(d.b, 'b', 'Enter a flange width greater than zero.')
  require_(d.t1, 't1', 'Enter a web thickness greater than zero.')
  require_(d.t2, 't2', 'Enter a flange thickness greater than zero.')
  // A web equal to the flange is the limit, not an error: the overhang closes up
  // and the section becomes a solid rectangle, which is a real answer.
  if (d.t1 > d.b) {
    throw new ShapeError(
      'The web cannot be wider than the flange it holds up. Equal is the limit — that section is a solid rectangle.',
      't1',
    )
  }
}

/** Two flanges have to leave a web between them. */
function checkTwoFlanges(d: Dims): void {
  if (2 * d.t2 >= d.a) {
    throw new ShapeError(
      'Two flanges that thick meet in the middle and leave no web. Thin the flange or deepen the section.',
      't2',
    )
  }
}

/**
 * One flange has to leave a stem below it — and only one, so the two-flange
 * limit above would wrongly refuse a perfectly buildable heavy-flanged tee.
 */
function checkOneFlange(d: Dims): void {
  if (d.t2 >= d.a) {
    throw new ShapeError(
      'The flange is as deep as the whole section, so there is no stem left below it.',
      't2',
    )
  }
}

/**
 * How far the flange's inner face falls across one overhang.
 *
 * The outer face stays flat — it is the extreme fibre — and the inner face
 * slopes away from the web at `angle`, so the flange is thickest at the root
 * and thinnest at the tip. Zero degrees drops the taper entirely and reproduces
 * the untapered section exactly, which is the property the tests lean on.
 */
function taperDrop(d: Dims): number {
  if (!Number.isFinite(d.angle) || d.angle < 0 || d.angle >= 90) {
    throw new ShapeError('Enter a flange taper of at least 0 and less than 90 degrees.', 'angle')
  }
  const drop = ((d.b - d.t1) / 2) * Math.tan(d.angle * DEG)
  if (drop > d.t2) {
    throw new ShapeError(
      'That taper runs the flange out to nothing before it reaches the tip, so the flange is no longer as wide as it says. Reduce the angle or thicken the flange.',
      'angle',
    )
  }
  return drop
}

/**
 * The five sections. `n` is read by the unequal I-beam alone and `angle` by the
 * two tapered ones alone, so whatever the other boxes hold cannot stop a section
 * answering — the same courtesy the rectangle and the circle already get.
 */
export const IBEAM_SHAPES: Record<string, ShapeFn> = {
  /** Symmetric I: depth a, flanges b × t₂ top and bottom, web t₁ between. */
  iBeam(d) {
    checkCore(d)
    checkTwoFlanges(d)
    const { a, b, t1, t2 } = d
    return assemble(
      a,
      [
        { y0: 0, y1: t2, w0: b, w1: b },
        { y0: t2, y1: a - t2, w0: t1, w1: t1 },
        { y0: a - t2, y1: a, w0: b, w1: b },
      ],
      () => ({
        A: 'A = 2bt₂ + t₁(a − 2t₂)',
        Ix: 'Ix = [ba³ − (b − t₁)(a − 2t₂)³] / 12',
        Iy: 'Iy = [2t₂b³ + (a − 2t₂)t₁³] / 12',
        Zx: 'Zx = bt₂(a − t₂) + t₁(a − 2t₂)² / 4,  about mid-depth',
        Zy: 'Zy = t₂b² / 2 + (a − 2t₂)t₁² / 4',
      }),
    )
  },

  /** Symmetric I whose flanges thin from the web out to the tip. */
  taperedIBeam(d) {
    checkCore(d)
    checkTwoFlanges(d)
    const drop = taperDrop(d)
    const { a, b, t1, t2 } = d
    return assemble(
      a,
      [
        // Bottom flange: the full-width slab, then the taper closing on the web.
        { y0: 0, y1: t2 - drop, w0: b, w1: b },
        { y0: t2 - drop, y1: t2, w0: b, w1: t1 },
        { y0: t2, y1: a - t2, w0: t1, w1: t1 },
        // Top flange, the same the other way up.
        { y0: a - t2, y1: a - t2 + drop, w0: t1, w1: b },
        { y0: a - t2 + drop, y1: a, w0: b, w1: b },
      ],
      () => ({
        A: 'A = 2bt₂ + t₁(a − 2t₂) − (b − t₁)Δ,  Δ = ((b − t₁)/2)·tan θ',
        Ix: 'Ix = ∫y²w dy − A(a/2)²,  w = b across the slab, t₁ in the web, linear over Δ',
        Iy: 'Iy = ∫w³/12 dy',
        Zx: 'Zx = ∫|y − a/2|·w dy — mid-depth halves the area, by symmetry',
        Zy: 'Zy = ∫w²/4 dy',
      }),
    )
  },

  /**
   * Unequal-flange I: the top flange is b wide, the bottom nb.
   *
   * `n` is the sixth dimension this section needs and the only one left in
   * `Dims`, so it carries the bottom-flange width as a multiple of the top. The
   * section stays symmetric left to right and asymmetric top to bottom, which is
   * the point of it.
   */
  unequalIBeam(d) {
    checkCore(d)
    checkTwoFlanges(d)
    require_(d.n, 'n', 'Enter a bottom-flange width greater than zero, as a multiple of the top flange.')
    const { a, b, t1, t2 } = d
    const bottom = d.n * b
    if (t1 > bottom) {
      throw new ShapeError(
        'The web cannot be wider than the bottom flange it stands on. Raise the multiplier or thin the web.',
        'n',
      )
    }
    return assemble(
      a,
      [
        { y0: 0, y1: t2, w0: bottom, w1: bottom },
        { y0: t2, y1: a - t2, w0: t1, w1: t1 },
        { y0: a - t2, y1: a, w0: b, w1: b },
      ],
      () => ({
        A: 'A = (1 + n)bt₂ + t₁(a − 2t₂)',
        Ix: 'Ix = Σ[Iᵢ + Aᵢ(ȳᵢ − c_y)²],  c_y = ΣAᵢȳᵢ / A — not a/2, the flanges differ',
        Iy: 'Iy = [(1 + n³)t₂b³ + (a − 2t₂)t₁³] / 12',
        Zx: 'Zx = ΣAᵢ|ȳᵢ − y_p|,  y_p the equal-area axis: half the area below it',
        Zy: 'Zy = (1 + n²)t₂b² / 4 + (a − 2t₂)t₁² / 4',
      }),
    )
  },

  /** Tee: flange b × t₂ on top of a stem t₁ × (a − t₂). */
  teeBeam(d) {
    checkCore(d)
    checkOneFlange(d)
    const { a, b, t1, t2 } = d
    // Which branch of the plastic algebra applies is decided by area alone. The
    // axis lies in the flange whenever the flange holds half the section, which
    // is the usual case for a structural tee — and never where the centroid is.
    const inFlange = b * t2 >= (b * t2 + t1 * (a - t2)) / 2
    return assemble(
      a,
      [
        { y0: 0, y1: a - t2, w0: t1, w1: t1 },
        { y0: a - t2, y1: a, w0: b, w1: b },
      ],
      () => ({
        A: 'A = bt₂ + t₁(a − t₂)',
        Ix: 'Ix = t₁(a − t₂)³/12 + t₁(a − t₂)(c_y − (a − t₂)/2)² + bt₂³/12 + bt₂(a − t₂/2 − c_y)²',
        Iy: 'Iy = [t₂b³ + (a − t₂)t₁³] / 12',
        Zx: inFlange
          ? 'Zx = bd²/2 + b(t₂ − d)²/2 + t₁(a − t₂)[(a − t₂)/2 + t₂ − d],  d = A/2b below the top fibre'
          : 'Zx = t₁y_p²/2 + t₁(a − t₂ − y_p)²/2 + bt₂(a − t₂/2 − y_p),  y_p = A/2t₁ above the bottom fibre',
        Zy: 'Zy = t₂b² / 4 + (a − t₂)t₁² / 4',
      }),
    )
  },

  /** Tee whose flange thins from the stem out to the tip. */
  taperedTeeBeam(d) {
    checkCore(d)
    checkOneFlange(d)
    const drop = taperDrop(d)
    const { a, b, t1, t2 } = d
    return assemble(
      a,
      [
        { y0: 0, y1: a - t2, w0: t1, w1: t1 },
        { y0: a - t2, y1: a - t2 + drop, w0: t1, w1: b },
        { y0: a - t2 + drop, y1: a, w0: b, w1: b },
      ],
      () => ({
        A: 'A = bt₂ + t₁(a − t₂) − (b − t₁)Δ/2,  Δ = ((b − t₁)/2)·tan θ',
        Ix: 'Ix = ∫y²w dy − A·c_y²,  w = t₁ in the stem, b across the slab, linear over Δ',
        Iy: 'Iy = ∫w³/12 dy',
        Zx: 'Zx = ∫|y − y_p|·w dy,  y_p from ∫₀^y_p w dy = A/2 — above c_y, not at it',
        Zy: 'Zy = ∫w²/4 dy',
      }),
    )
  },
}

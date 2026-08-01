import { describe, expect, test } from 'vitest'
import { ANGLE_SHAPES } from './shapes-angle'
import { ShapeError } from './shapes'
import type { Dims, Primitives } from './shapes'

/**
 * Every closed form in shapes-angle.ts is checked against NUMERICAL
 * INTEGRATION — a fine grid of strips summed straight through a
 * material-at-coordinate function written here, from what the dimensions MEAN,
 * sharing not one line with the implementation. The implementation cuts each
 * outline into rectangles and triangles and adds parallel-axis terms; this file
 * never forms a part at all. A transposed exponent, a shift applied the wrong
 * way, a taper measured from the wrong face, or a part counted twice survives
 * one of the two and never both.
 *
 * The model is run twice per section, once up the depth and once across the
 * width. Only the total material LENGTH at a coordinate matters for the moments
 * about that coordinate's axis, so one function per direction is the whole of
 * the second opinion — and the two of them agreeing on A is a check on the
 * model itself before it is used to judge anything.
 *
 * On top of that sit the classical degeneracies, which catch the errors an
 * integration would agree with because it was told the same wrong shape: an
 * equal-leg angle's centroid has to be the same distance from both outer faces,
 * a trapezoid whose parallel sides are equal has to become exactly a rectangle,
 * and a taper of zero degrees has to reproduce the untapered channel exactly.
 */

const IDS = [
  'equalLegAngle',
  'rectangularAngle',
  'channel',
  'taperedChannel',
  'zedBeam',
  'generalTrapezoid',
  'isoscelesTrapezoid',
] as const
type Id = (typeof IDS)[number]

const dims = (over: Partial<Dims> = {}): Dims => ({
  a: 300,
  b: 100,
  t1: 10,
  t2: 16,
  n: 1,
  angle: 0,
  ...over,
})

/** One representative of each section, all seven genuinely different shapes. */
const CASES: Record<Id, Dims> = {
  equalLegAngle: dims({ a: 100, t1: 10 }),
  rectangularAngle: dims({ a: 150, b: 100, t1: 12 }),
  channel: dims({ a: 300, b: 100, t1: 10, t2: 16 }),
  // Δ = 90·tan 5° = 7.87 mm, comfortably inside the 16 mm flange.
  taperedChannel: dims({ a: 300, b: 100, t1: 10, t2: 16, angle: 5 }),
  zedBeam: dims({ a: 300, b: 100, t1: 10, t2: 16 }),
  // Top edge 90 long starting 30 in from the left of a 160 base: leaning in on
  // both sides, but by different amounts, so neither axis is one of symmetry.
  generalTrapezoid: dims({ a: 200, b: 160, t1: 30, t2: 90 }),
  isoscelesTrapezoid: dims({ a: 200, b: 160, angle: 15 }),
}

const run = (id: Id, d: Dims = CASES[id]): Primitives => ANGLE_SHAPES[id](d)

// ---------------------------------------------------------------------------
// The independent model.
// ---------------------------------------------------------------------------

const tanOf = (deg: number): number => Math.tan((deg * Math.PI) / 180)

/** The bounding box each section fills, from the dimensions alone. */
function envelope(id: Id, d: Dims): { W: number; H: number } {
  switch (id) {
    case 'equalLegAngle':
      return { W: d.a, H: d.a }
    // A zed's two flanges overlap across the web, so the box is 2b − t₁ wide.
    case 'zedBeam':
      return { W: 2 * d.b - d.t1, H: d.a }
    default:
      return { W: d.b, H: d.a }
  }
}

/**
 * Total width of material at height y above the bottom fibre.
 *
 * Where a section has two separate runs of material at one height they are
 * unioned, not added — a zed's bottom flange and its web share the same strip
 * and the overlap belongs to the section once.
 */
function widthAt(id: Id, d: Dims, y: number): number {
  const { a, b, t1, t2, angle } = d
  switch (id) {
    // Both legs are the depth, so the horizontal one is a wide too.
    case 'equalLegAngle':
      return y < t1 ? a : t1
    case 'rectangularAngle':
      return y < t1 ? b : t1
    case 'channel':
      return y < t2 || y > a - t2 ? b : t1
    case 'taperedChannel': {
      const tan = tanOf(angle)
      // The flange's outer face is flat and its inner face falls at θ, so at a
      // depth v below that face the flange still reaches out to t₁ + (t₂ − v)/tan.
      const reach = (v: number): number => (tan > 0 ? Math.min(b, t1 + (t2 - v) / tan) : b)
      if (y < t2) return Math.max(t1, reach(y))
      if (y > a - t2) return Math.max(t1, reach(a - y))
      return t1
    }
    case 'zedBeam':
      // Each flange is b wide counting the web; the web alone is t₁ between them.
      return y < t2 || y > a - t2 ? b : t1
    case 'generalTrapezoid':
      // Left edge runs out to t₁, right edge in to t₁ + t₂; the difference is
      // linear, so the width closes from b at the base to t₂ at the top.
      return b + ((t2 - b) * y) / a
    case 'isoscelesTrapezoid':
      return b - (2 * a * tanOf(angle) * y) / a
  }
}

/** Total height of material at distance x from the left of the bounding box. */
function heightAt(id: Id, d: Dims, x: number): number {
  const { a, b, t1, t2, angle } = d
  switch (id) {
    case 'equalLegAngle':
      return x < t1 ? a : t1
    case 'rectangularAngle':
      return x < t1 ? a : t1
    case 'channel':
      return x < t1 ? a : 2 * t2
    case 'taperedChannel': {
      const tan = tanOf(angle)
      return x < t1 ? a : 2 * Math.max(0, t2 - (x - t1) * tan)
    }
    case 'zedBeam':
      // Bottom flange out to b − t₁, then the web to b, then the top flange.
      return x < b - t1 ? t2 : x < b ? a : t2
    case 'generalTrapezoid': {
      // Bounded above by whichever sloping side is overhead at this x.
      const leftSlope = t1 > 0 ? (a * x) / t1 : Number.POSITIVE_INFINITY
      const rightRun = b - t1 - t2
      const rightSlope = rightRun > 0 ? (a * (b - x)) / rightRun : Number.POSITIVE_INFINITY
      return Math.min(a, leftSlope, rightSlope)
    }
    case 'isoscelesTrapezoid': {
      const lean = a * tanOf(angle)
      if (!(lean > 0)) return a
      return Math.min(a, (a * x) / lean, (a * (b - x)) / lean)
    }
  }
}

/**
 * Enough strips that the only error left is the sliver of one strip that
 * straddles a step in the outline — parts in a hundred thousand on these.
 */
const STRIPS = 1_000_000

interface Profile {
  /** Area, and the centroid coordinate along this direction. */
  A: number
  c: number
  /** Second moment about the centroidal axis, and the equal-area axis with it. */
  I: number
  axis: number
  /** First moment of both halves about that equal-area axis. */
  Z: number
  /** Σ|u − y|·v du about any axis at all, for the comparisons below. */
  about: (u0: number) => number
}

/**
 * Everything one direction has to say, from a sum of strips of material.
 *
 * Only the total length at each coordinate is needed: a strip at height y
 * contributes v(y)·dy of area at that height whatever its x positions are, so
 * the first and second moments about the horizontal axes fall out of v alone.
 */
function profileOf(measure: (u: number) => number, span: number): Profile {
  const du = span / STRIPS
  const v = new Float64Array(STRIPS)
  for (let i = 0; i < STRIPS; i++) v[i] = measure((i + 0.5) * du)

  let A = 0
  let first = 0
  for (let i = 0; i < STRIPS; i++) {
    A += v[i]! * du
    first += (i + 0.5) * du * v[i]! * du
  }
  const c = first / A

  // Centred on the spot rather than taken about the end and shifted, so the
  // answer never rests on two large numbers nearly cancelling.
  let I = 0
  for (let i = 0; i < STRIPS; i++) I += ((i + 0.5) * du - c) ** 2 * v[i]! * du

  // The equal-area axis: the coordinate with half the material either side.
  // Σ A|u − u₀| is stationary there, so an error of a fraction of a strip in
  // the axis costs second order and nothing in Z.
  let acc = 0
  let axis = span
  for (let i = 0; i < STRIPS; i++) {
    const strip = v[i]! * du
    if (acc + strip >= A / 2) {
      axis = i * du + (v[i]! === 0 ? 0 : (A / 2 - acc) / v[i]!)
      break
    }
    acc += strip
  }

  const about = (u0: number): number => {
    let total = 0
    for (let i = 0; i < STRIPS; i++) total += Math.abs((i + 0.5) * du - u0) * v[i]! * du
    return total
  }

  return { A, c, I, axis, Z: about(axis), about }
}

interface Numeric {
  /** Down the depth: area, cy, Ix, Zx. */
  y: Profile
  /** Across the width: area again, cx, Iy, Zy. */
  x: Profile
}

function byIntegration(id: Id, d: Dims): Numeric {
  const { W, H } = envelope(id, d)
  return {
    y: profileOf((u) => widthAt(id, d, u), H),
    x: profileOf((u) => heightAt(id, d, u), W),
  }
}

/** Computed once per section — two million strips each is not free. */
const NUMERIC: Record<Id, Numeric> = Object.fromEntries(
  IDS.map((id) => [id, byIntegration(id, CASES[id])]),
) as Record<Id, Numeric>

/** Compared as a ratio, so one tolerance covers areas and fourth powers alike. */
const ratio = (got: number, want: number): number => got / want

/** The numeric half of a result, for comparing two sections that must agree. */
function numbersOf(p: Primitives): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(p)) {
    if (typeof value === 'number') out[key] = value
  }
  return out
}

// ---------------------------------------------------------------------------

describe('the registry', () => {
  test('exports exactly the seven sections, and each is a function', () => {
    expect(Object.keys(ANGLE_SHAPES)).toEqual([...IDS])
    for (const id of IDS) expect(typeof ANGLE_SHAPES[id]).toBe('function')
  })
})

describe('the model agrees with itself before it judges anything', () => {
  test.each(IDS)('%s: the depthwise and the widthwise sums give the same area', (id) => {
    const { x, y } = NUMERIC[id]
    expect(ratio(x.A, y.A)).toBeCloseTo(1, 4)
  })
})

describe.each(IDS)('%s, against a sum of strips', (id) => {
  const p = run(id)
  const { x, y } = NUMERIC[id]

  test('area', () => {
    expect(ratio(p.A, y.A)).toBeCloseTo(1, 4)
  })

  test('centroid above the bottom fibre', () => {
    expect(ratio(p.cy, y.c)).toBeCloseTo(1, 4)
  })

  test('centroid from the left of the envelope', () => {
    expect(ratio(p.cx, x.c)).toBeCloseTo(1, 4)
  })

  test('second moment about the horizontal centroidal axis', () => {
    expect(ratio(p.Ix, y.I)).toBeCloseTo(1, 4)
  })

  test('second moment about the vertical centroidal axis', () => {
    expect(ratio(p.Iy, x.I)).toBeCloseTo(1, 4)
  })

  test('plastic modulus about the horizontal equal-area axis', () => {
    expect(ratio(p.Zx, y.Z)).toBeCloseTo(1, 4)
  })

  test('plastic modulus about the vertical equal-area axis', () => {
    expect(ratio(p.Zy, x.Z)).toBeCloseTo(1, 4)
  })
})

describe('every primitive is filled, on every section', () => {
  test.each(IDS)('%s returns a finite number in every field', (id) => {
    const p = run(id)
    for (const [key, value] of Object.entries(p)) {
      if (key === 'formulas') continue
      expect(Number.isFinite(value), `${key} is ${String(value)}`).toBe(true)
      if (key !== 'Pi') expect(value as number, key).toBeGreaterThan(0)
    }
    expect(Object.keys(p.formulas).sort()).toEqual(['A', 'Ix', 'Iy', 'Zx', 'Zy'])
  })

  test.each(IDS)('%s: the extreme-fibre distances span the envelope', (id) => {
    const p = run(id)
    const { W, H } = envelope(id, CASES[id])
    expect(p.cTop + p.cBot).toBeCloseTo(H, 9)
    expect(p.cLeft + p.cRight).toBeCloseTo(W, 9)
    expect(p.cBot).toBeCloseTo(p.cy, 12)
    expect(p.cLeft).toBeCloseTo(p.cx, 12)
  })

  test.each(IDS)('%s: gross is the bounding box and Pi is zero', (id) => {
    const p = run(id)
    const { W, H } = envelope(id, CASES[id])
    expect(p.gross).toBeCloseTo(W * H, 6)
    // Material has to fit inside the box that bounds it, and leave some air.
    expect(p.A).toBeLessThan(p.gross)
    // None of these seven encloses a bore; the voids are open notches.
    expect(p.Pi).toBe(0)
    expect(p.Po).toBeGreaterThan(0)
  })
})

describe('the asymmetry that is the whole point of these seven', () => {
  /** The four whose material is not balanced about mid-depth. */
  const UNEVEN_IN_Y = ['equalLegAngle', 'rectangularAngle', 'generalTrapezoid', 'isoscelesTrapezoid'] as const
  /** The four whose material is not balanced about the mid-width. */
  const UNEVEN_IN_X = ['equalLegAngle', 'rectangularAngle', 'channel', 'taperedChannel', 'generalTrapezoid'] as const

  test.each(UNEVEN_IN_Y)('%s: cTop and cBot genuinely differ', (id) => {
    const p = run(id)
    expect(Math.abs(p.cTop - p.cBot) / envelope(id, CASES[id]).H).toBeGreaterThan(0.02)
    // And the two elastic moduli with them — reporting one for both is the
    // error a designer is actually hurt by.
    expect(p.Ix / p.cTop).not.toBeCloseTo(p.Ix / p.cBot, 3)
  })

  test.each(UNEVEN_IN_X)('%s: cLeft and cRight genuinely differ', (id) => {
    const p = run(id)
    expect(Math.abs(p.cLeft - p.cRight) / envelope(id, CASES[id]).W).toBeGreaterThan(0.02)
  })

  test('all four unbalanced sections carry the centroid toward the heavy end', () => {
    // An angle sits low, toward the leg that lies flat.
    for (const id of ['equalLegAngle', 'rectangularAngle'] as const) {
      expect(run(id).cy).toBeLessThan(CASES[id].a / 2)
      expect(run(id).cx).toBeLessThan(envelope(id, CASES[id]).W / 2)
    }
    // A trapezoid sits toward its wider parallel side, which here is the base.
    for (const id of ['generalTrapezoid', 'isoscelesTrapezoid'] as const) {
      expect(run(id).cy).toBeLessThan(CASES[id].a / 2)
    }
  })

  test('a zed is symmetric under a half turn, and under no reflection at all', () => {
    // The one section here whose centroid IS the centre of its box — not by
    // mirror symmetry, which it has none of, but by the half turn about that
    // centre that maps each flange onto the other.
    const p = run('zedBeam')
    const { W, H } = envelope('zedBeam', CASES.zedBeam)
    expect(p.cy).toBeCloseTo(H / 2, 9)
    expect(p.cx).toBeCloseTo(W / 2, 9)
    expect(p.cTop).toBeCloseTo(p.cBot, 9)
    // Which is not the same as being a channel: the same material, but thrown
    // out to both sides instead of one, so Iy is far larger for no extra area.
    expect(p.A).toBeCloseTo(run('channel').A, 9)
    expect(p.Iy).toBeGreaterThan(run('channel').Iy)
  })

  test('the plastic modulus beats the governing elastic one, on all seven', () => {
    for (const id of IDS) {
      const p = run(id)
      // First yield is reached at the fibre furthest from the centroid, so the
      // elastic modulus that governs is Ix over the LONGER of the two arms.
      const Sx = p.Ix / Math.max(p.cTop, p.cBot)
      expect(p.Zx, id).toBeGreaterThan(Sx)
      // And a shape factor in the range real sections live in.
      expect(p.Zx / Sx, id).toBeLessThan(3)
    }
  })

  test('using the centroid instead of the equal-area axis overstates Zx', () => {
    // Σ A|y − y₀| is minimised at the median of the area, which is the
    // equal-area axis. So taking the first moments about the centroid instead
    // returns a LARGER number — an unconservative Zx, the worst direction for a
    // wrong answer to be wrong in.
    for (const id of UNEVEN_IN_Y) {
      const p = run(id)
      const aboutCentroid = NUMERIC[id].y.about(p.cy)
      expect(p.Zx, id).toBeLessThan(aboutCentroid)
      expect(aboutCentroid / p.Zx, id).toBeGreaterThan(1.001)
      // The two axes are different lines, and the implementation found the
      // right one rather than reusing the centroid it had already computed.
      expect(Math.abs(NUMERIC[id].y.axis - p.cy)).toBeGreaterThan(0.5)
    }
  })

  test('the sections that are balanced about mid-depth are the case where the two axes coincide', () => {
    for (const id of ['channel', 'taperedChannel', 'zedBeam'] as const) {
      const p = run(id)
      expect(ratio(p.Zx, NUMERIC[id].y.about(p.cy))).toBeCloseTo(1, 4)
    }
  })
})

describe('the classical degeneracies', () => {
  test('an equal-leg angle stands the same distance from both outer faces', () => {
    // Reflecting the section in its own 45° diagonal maps the horizontal leg
    // onto the vertical one, so the centroid has to land on that diagonal.
    for (const L of [50, 100, 250]) {
      for (const t of [4, 10, 30]) {
        const p = run('equalLegAngle', dims({ a: L, t1: t }))
        expect(p.cx, `L=${L} t=${t}`).toBeCloseTo(p.cy, 9)
        expect(p.cBot).toBeCloseTo(p.cLeft, 9)
        expect(p.cTop).toBeCloseTo(p.cRight, 9)
        // The same symmetry carries every property about one axis to the other.
        expect(ratio(p.Ix, p.Iy)).toBeCloseTo(1, 12)
        expect(ratio(p.Zx, p.Zy)).toBeCloseTo(1, 12)
        expect(p.A).toBeCloseTo(t * (2 * L - t), 9)
        expect(p.Po).toBeCloseTo(4 * L, 9)
      }
    }
  })

  test('a rectangular angle with equal legs is the equal-leg angle', () => {
    const base = dims({ a: 120, b: 120, t1: 9 })
    expect(numbersOf(run('rectangularAngle', base))).toEqual(
      numbersOf(run('equalLegAngle', dims({ a: 120, t1: 9 }))),
    )
    // And with unequal legs it is not — the centroid leaves the diagonal.
    const oblong = run('rectangularAngle', dims({ a: 200, b: 100, t1: 9 }))
    expect(oblong.cx).not.toBeCloseTo(oblong.cy, 2)
    expect(oblong.A).toBeCloseTo(9 * (200 + 100 - 9), 9)
  })

  test('a trapezoid whose parallel sides are equal is exactly a rectangle', () => {
    const a = 200
    const b = 160
    // Two different ways of saying the same thing: no offset and a top the full
    // width of the base, or no lean on either side.
    const flat = run('generalTrapezoid', dims({ a, b, t1: 0, t2: b }))
    const upright = run('isoscelesTrapezoid', dims({ a, b, angle: 0 }))
    expect(numbersOf(flat)).toEqual(numbersOf(upright))

    for (const p of [flat, upright]) {
      expect(p.A).toBeCloseTo(a * b, 6)
      expect(ratio(p.Ix, (b * a ** 3) / 12)).toBeCloseTo(1, 12)
      expect(ratio(p.Iy, (a * b ** 3) / 12)).toBeCloseTo(1, 12)
      expect(ratio(p.Zx, (b * a ** 2) / 4)).toBeCloseTo(1, 12)
      expect(ratio(p.Zy, (a * b ** 2) / 4)).toBeCloseTo(1, 12)
      expect(p.cy).toBeCloseTo(a / 2, 9)
      expect(p.cx).toBeCloseTo(b / 2, 9)
      expect(p.cTop).toBeCloseTo(p.cBot, 9)
      expect(p.cLeft).toBeCloseTo(p.cRight, 9)
      expect(p.Po).toBeCloseTo(2 * (a + b), 9)
      expect(p.gross).toBeCloseTo(a * b, 6)
      // And with it the shape factor every textbook quotes for a rectangle.
      expect(p.Zx / (p.Ix / p.cBot)).toBeCloseTo(1.5, 9)
    }
  })

  test('a taper of zero degrees reproduces the untapered channel exactly', () => {
    const base = dims({ a: 300, b: 100, t1: 10, t2: 16 })
    expect(numbersOf(run('taperedChannel', { ...base, angle: 0 }))).toEqual(
      numbersOf(run('channel', base)),
    )
  })

  test('a taper takes material away and leaves the envelope alone', () => {
    const base = dims({ a: 300, b: 100, t1: 10, t2: 16 })
    const plain = run('channel', base)
    const tapered = run('taperedChannel', { ...base, angle: 5 })
    expect(tapered.A).toBeLessThan(plain.A)
    expect(tapered.Ix).toBeLessThan(plain.Ix)
    expect(tapered.gross).toBeCloseTo(plain.gross, 6)
    // Thinning the flange tips drags the centroid back toward the web.
    expect(tapered.cx).toBeLessThan(plain.cx)
    // Equal flanges keep it at mid-depth however steep the taper.
    expect(tapered.cy).toBeCloseTo(base.a / 2, 9)
  })

  test('a general trapezoid ignores the offset when it comes to Ix and cy', () => {
    // Shearing the section sideways slides every strip along its own line, so
    // the widths at each height are untouched and so is everything they decide.
    const base = dims({ a: 200, b: 160, t2: 90 })
    const flush = run('generalTrapezoid', { ...base, t1: 0 })
    const shifted = run('generalTrapezoid', { ...base, t1: 40 })
    expect(ratio(shifted.A, flush.A)).toBeCloseTo(1, 12)
    expect(ratio(shifted.cy, flush.cy)).toBeCloseTo(1, 12)
    expect(ratio(shifted.Ix, flush.Ix)).toBeCloseTo(1, 12)
    expect(ratio(shifted.Zx, flush.Zx)).toBeCloseTo(1, 12)
    // Iy is not a shear invariant, and the centroid does move sideways.
    expect(shifted.cx).toBeGreaterThan(flush.cx)
    expect(shifted.Iy).not.toBeCloseTo(flush.Iy, 3)
  })

  test('an isosceles trapezoid is the general one, centred', () => {
    const a = 200
    const b = 160
    const angle = 15
    const lean = a * Math.tan((angle * Math.PI) / 180)
    const same = run('generalTrapezoid', dims({ a, b, t1: lean, t2: b - 2 * lean }))
    const p = run('isoscelesTrapezoid', dims({ a, b, angle }))
    expect(numbersOf(p)).toEqual(numbersOf(same))
    expect(p.cx).toBeCloseTo(b / 2, 9)
  })
})

describe('worked arithmetic, done by hand', () => {
  test('the channel matches the closed forms printed beside it', () => {
    // a = 300, b = 100, t₁ = 10, t₂ = 16.
    // A = 300·10 + 2·16·90 = 3000 + 2880 = 5880.
    const { a, b, t1, t2 } = CASES.channel
    const p = run('channel')
    expect(p.A).toBeCloseTo(5880, 9)
    expect(ratio(p.A, a * t1 + 2 * t2 * (b - t1))).toBeCloseTo(1, 12)
    const Ix =
      (t1 * a ** 3) / 12 +
      2 * (((b - t1) * t2 ** 3) / 12 + (b - t1) * t2 * ((a - t2) / 2) ** 2)
    expect(ratio(p.Ix, Ix)).toBeCloseTo(1, 12)
    // Equal flanges put the centroid at mid-depth; the web puts cx nowhere near
    // mid-width, which is what makes a channel a channel.
    expect(p.cy).toBeCloseTo(a / 2, 9)
    expect(p.cx).toBeLessThan(b / 2)
    // Zx about mid-depth: the full-depth web halved either side of it, plus
    // both flange overhangs at their own lever arms. The web runs the whole
    // depth in this decomposition and the flanges are only what projects past
    // it, so the two must not be sliced the way an I-beam's are.
    const Zx = (t1 * a ** 2) / 4 + (b - t1) * t2 * (a - t2)
    expect(p.Zx).toBeCloseTo(633_960, 6)
    expect(ratio(p.Zx, Zx)).toBeCloseTo(1, 10)
    expect(p.Po).toBeCloseTo(2 * a + 4 * b - 2 * t1, 9)
    expect(p.gross).toBeCloseTo(a * b, 6)
  })

  test('the rectangular angle matches the closed forms printed beside it', () => {
    // a = 150, b = 100, t = 12. A = 12(150 + 100 − 12) = 2856.
    const { a, b, t1: t } = CASES.rectangularAngle
    const p = run('rectangularAngle')
    const A = t * (a + b - t)
    expect(p.A).toBeCloseTo(A, 9)
    expect(p.A).toBeCloseTo(2856, 9)
    // Second moments about the heel, then shifted back to the centroid.
    const cy = (b * t * (t / 2) + t * (a - t) * ((a + t) / 2)) / A
    const cx = (b * t * (b / 2) + t * (a - t) * (t / 2)) / A
    expect(p.cy).toBeCloseTo(cy, 9)
    expect(p.cx).toBeCloseTo(cx, 9)
    expect(ratio(p.Ix, (b * t ** 3 + t * (a ** 3 - t ** 3)) / 3 - A * cy ** 2)).toBeCloseTo(1, 10)
    expect(ratio(p.Iy, (a * t ** 3 + t * (b ** 3 - t ** 3)) / 3 - A * cx ** 2)).toBeCloseTo(1, 10)
    expect(p.Po).toBeCloseTo(2 * (a + b), 9)
  })

  test('the trapezoids match the closed forms every textbook prints', () => {
    for (const id of ['generalTrapezoid', 'isoscelesTrapezoid'] as const) {
      const d = CASES[id]
      const p = run(id)
      const top =
        id === 'generalTrapezoid' ? d.t2 : d.b - 2 * d.a * Math.tan((d.angle * Math.PI) / 180)
      const A = (d.a * (d.b + top)) / 2
      // Both depend on the two parallel sides alone, never on the offset.
      const cy = (d.a * (d.b + 2 * top)) / (3 * (d.b + top))
      const Ix = (d.a ** 3 * (d.b ** 2 + 4 * d.b * top + top ** 2)) / (36 * (d.b + top))
      expect(ratio(p.A, A), id).toBeCloseTo(1, 12)
      expect(ratio(p.cy, cy), id).toBeCloseTo(1, 12)
      expect(ratio(p.Ix, Ix), id).toBeCloseTo(1, 10)
      // A trapezoid narrower at the top carries its centroid below mid-depth.
      expect(p.cy, id).toBeLessThan(d.a / 2)
      expect(p.Po, id).toBeGreaterThan(2 * (d.a + top))
    }
    // The isosceles one has a closed form for Iy too, the general one does not.
    const d = CASES.isoscelesTrapezoid
    const top = d.b - 2 * d.a * Math.tan((d.angle * Math.PI) / 180)
    const p = run('isoscelesTrapezoid')
    expect(ratio(p.Iy, (d.a * (d.b + top) * (d.b ** 2 + top ** 2)) / 48)).toBeCloseTo(1, 10)
  })

  test('the zed and the channel are the same material arranged differently', () => {
    const base = dims({ a: 300, b: 100, t1: 10, t2: 16 })
    const z = run('zedBeam', base)
    const c = run('channel', base)
    // Same A and the same Ix — the flanges sit at the same heights either way.
    expect(ratio(z.A, c.A)).toBeCloseTo(1, 12)
    expect(ratio(z.Ix, c.Ix)).toBeCloseTo(1, 10)
    expect(ratio(z.Zx, c.Zx)).toBeCloseTo(1, 10)
    // The envelope is wider, because the flanges point opposite ways.
    expect(z.gross).toBeGreaterThan(c.gross)
    expect(z.Po).toBeCloseTo(c.Po, 9)
  })
})

describe('impossible input is refused, with the box to blame', () => {
  /** Which boxes each section actually reads, and so may complain about. */
  const READS: Record<Id, readonly string[]> = {
    equalLegAngle: ['a', 't1'],
    rectangularAngle: ['a', 'b', 't1'],
    channel: ['a', 'b', 't1', 't2'],
    taperedChannel: ['a', 'b', 't1', 't2'],
    zedBeam: ['a', 'b', 't1', 't2'],
    generalTrapezoid: ['a', 'b', 't1', 't2'],
    isoscelesTrapezoid: ['a', 'b'],
  }

  function throwsOn(id: Id, over: Partial<Dims>, field: string): void {
    let caught: unknown
    try {
      run(id, { ...CASES[id], ...over })
    } catch (error) {
      caught = error
    }
    expect(caught, `${id} accepted ${JSON.stringify(over)}`).toBeInstanceOf(ShapeError)
    const error = caught as ShapeError
    expect(error.fieldId).toBe(field)
    expect(error.message.length).toBeGreaterThan(10)
  }

  test('NaN is caught by the finiteness guard, not by the magnitude one', () => {
    // Both comparisons are false for NaN, so a magnitude test on its own lets an
    // unparseable box straight through and every number downstream becomes NaN.
    expect(Number.NaN > 0).toBe(false)
    expect(Number.NaN <= 0).toBe(false)
    expect(Number.NaN >= 0).toBe(false)
    for (const id of IDS) {
      for (const field of READS[id]) {
        throwsOn(id, { [field]: Number.NaN } as Partial<Dims>, field)
        throwsOn(id, { [field]: Number.POSITIVE_INFINITY } as Partial<Dims>, field)
      }
    }
  })

  test.each(IDS)('%s: no dimension it reads may be negative', (id) => {
    for (const field of READS[id]) throwsOn(id, { [field]: -1 } as Partial<Dims>, field)
  })

  test.each(IDS)('%s: no dimension it reads may be zero, bar the one that may', (id) => {
    for (const field of READS[id]) {
      // A general trapezoid's t₁ is an offset, not a thickness: flush left is a
      // right trapezoid, which is a section and not a mistake.
      if (id === 'generalTrapezoid' && field === 't1') {
        expect(() => run(id, { ...CASES[id], t1: 0 })).not.toThrow()
        continue
      }
      throwsOn(id, { [field]: 0 } as Partial<Dims>, field)
    }
  })

  test('an angle thick enough to close up is refused', () => {
    throwsOn('equalLegAngle', { t1: 100 }, 't1')
    throwsOn('equalLegAngle', { t1: 140 }, 't1')
    // The rectangular one has two legs to outgrow, and blames the thickness for
    // either, because the thickness is the one box that is wrong in both.
    throwsOn('rectangularAngle', { t1: 150 }, 't1')
    throwsOn('rectangularAngle', { t1: 100 }, 't1')
  })

  test('a channel, a tapered channel and a zed all need a web and two flanges', () => {
    for (const id of ['channel', 'taperedChannel', 'zedBeam'] as const) {
      throwsOn(id, { t1: CASES[id].b }, 't1')
      throwsOn(id, { t1: CASES[id].b * 2 }, 't1')
      throwsOn(id, { t2: CASES[id].a / 2 }, 't2')
      throwsOn(id, { t2: CASES[id].a }, 't2')
    }
  })

  test('the taper has to be a real angle the flange can survive', () => {
    throwsOn('taperedChannel', { angle: Number.NaN }, 'angle')
    throwsOn('taperedChannel', { angle: -1 }, 'angle')
    throwsOn('taperedChannel', { angle: 90 }, 'angle')
    throwsOn('taperedChannel', { angle: 180 }, 'angle')
    // Steep enough that the flange runs out before it reaches the tip, which
    // would leave a section narrower than the b it was asked for.
    throwsOn('taperedChannel', { angle: 45 }, 'angle')
    // A taper that arrives at the tip with exactly nothing left is the limit,
    // and still a section.
    const d = CASES.taperedChannel
    const limit = (Math.atan(d.t2 / (d.b - d.t1)) * 180) / Math.PI
    const p = run('taperedChannel', { ...d, angle: limit })
    expect(p.A).toBeGreaterThan(0)
    expect(Number.isFinite(p.Ix)).toBe(true)
    expect(p.cy).toBeCloseTo(d.a / 2, 9)
  })

  test('a trapezoid whose top will not fit over its base is refused', () => {
    // Past the right-hand end of the base entirely.
    throwsOn('generalTrapezoid', { t1: 160 }, 't1')
    throwsOn('generalTrapezoid', { t1: 200 }, 't1')
    // Or starting inside it and overhanging.
    throwsOn('generalTrapezoid', { t1: 30, t2: 140 }, 't2')
    throwsOn('generalTrapezoid', { t1: 0, t2: 161 }, 't2')
    // Flush and exactly as wide as the base is the rectangle, which is the limit.
    expect(() => run('generalTrapezoid', { ...CASES.generalTrapezoid, t1: 0, t2: 160 })).not.toThrow()
  })

  test('sides that meet before the top make a triangle, not a trapezoid', () => {
    throwsOn('isoscelesTrapezoid', { angle: Number.NaN }, 'angle')
    throwsOn('isoscelesTrapezoid', { angle: -1 }, 'angle')
    throwsOn('isoscelesTrapezoid', { angle: 90 }, 'angle')
    // b = 160, a = 200: the two sides close on each other at 21.8°.
    const closing = (Math.atan(160 / (2 * 200)) * 180) / Math.PI
    throwsOn('isoscelesTrapezoid', { angle: closing }, 'angle')
    throwsOn('isoscelesTrapezoid', { angle: 45 }, 'angle')
    // A hair under it is a very pointed trapezoid, and still a trapezoid.
    const p = run('isoscelesTrapezoid', { ...CASES.isoscelesTrapezoid, angle: closing - 0.5 })
    expect(p.A).toBeGreaterThan(0)
    // On the way to a triangle, whose centroid sits at a third of the depth.
    expect(p.cy).toBeLessThan(0.36 * CASES.isoscelesTrapezoid.a)
    expect(p.cy).toBeGreaterThan(CASES.isoscelesTrapezoid.a / 3)
  })

  test('a section only reads the dimensions it has', () => {
    // Garbage in a box a section never looks at cannot stop it answering — the
    // same courtesy the rectangle and the circle already get.
    const junk = { n: Number.NaN, angle: Number.NaN } as Partial<Dims>
    expect(() =>
      run('equalLegAngle', { ...CASES.equalLegAngle, ...junk, b: Number.NaN, t2: -5 }),
    ).not.toThrow()
    expect(() =>
      run('rectangularAngle', { ...CASES.rectangularAngle, ...junk, t2: Number.NaN }),
    ).not.toThrow()
    expect(() => run('channel', { ...CASES.channel, ...junk })).not.toThrow()
    expect(() => run('zedBeam', { ...CASES.zedBeam, ...junk })).not.toThrow()
    expect(() =>
      run('generalTrapezoid', { ...CASES.generalTrapezoid, ...junk }),
    ).not.toThrow()
    expect(() =>
      run('isoscelesTrapezoid', {
        ...CASES.isoscelesTrapezoid,
        n: Number.NaN,
        t1: Number.NaN,
        t2: -3,
      }),
    ).not.toThrow()
  })
})

describe('the formulas are display-only algebra', () => {
  test.each(IDS)('%s prints strings, not markup', (id) => {
    const formulas = run(id).formulas
    for (const [key, text] of Object.entries(formulas)) {
      expect(typeof text).toBe('string')
      expect(text.trim().length, key).toBeGreaterThan(0)
      // No HTML, no colours, no class names — a calculator holds domain facts.
      expect(text, key).not.toMatch(/[<>]/)
      expect(text, key).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(text, key).not.toMatch(/\b(bg|text|border)-[a-z]+-\d{2,3}\b/)
      expect(text, key).not.toMatch(/class|style=|&[a-z]+;/)
    }
  })

  test('each section prints its own algebra, not a neighbour’s', () => {
    // A right number under a wrong derivation is the harder error to spot,
    // because the number itself checks out.
    const printed = new Set(IDS.map((id) => JSON.stringify(run(id).formulas)))
    expect(printed.size).toBe(IDS.length)
  })

  test('every section says its plastic moduli are about the equal-area axis', () => {
    for (const id of IDS) {
      const { Zx, Zy } = run(id).formulas
      expect(`${Zx} ${Zy}`, id).toMatch(/equal-area axis|y_p|x_p|symmetry|mid-depth/)
    }
    // And the ones whose centroid is not the equal-area axis say so outright.
    expect(run('generalTrapezoid').formulas.Zx).toContain('above cy')
    expect(run('isoscelesTrapezoid').formulas.Ix).toContain('not a/2')
    expect(run('taperedChannel').formulas.Zy).toContain('not at cx')
  })
})

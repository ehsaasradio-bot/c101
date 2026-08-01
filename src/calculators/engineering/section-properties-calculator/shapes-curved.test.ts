import { describe, expect, test } from 'vitest'
import { CURVED_SHAPES } from './shapes-curved'
import { ShapeError } from './shapes'
import type { Dims, Primitives } from './shapes'

/**
 * Every closed form in shapes-curved.ts is checked against NUMERICAL
 * INTEGRATION — a fine grid of horizontal strips summed straight through a
 * "what x does this outline cover at height y" function written here, from the
 * dimensions, sharing not one line with the implementation. A dropped π, a
 * centroid taken at half the depth, a plastic modulus taken about the centroid
 * instead of the equal-area axis: each survives one of the two and never both.
 *
 * On top of that sit the classical degeneracies, which catch the errors an
 * integration would happily agree with because it was told the same wrong
 * shape — a half circle's centroid at 4R/3π, an ellipse with a = b reducing
 * exactly to πD⁴/64, a 360° sector being a whole circle, and a parabolic area
 * being two thirds of the box that bounds it.
 */

const IDS = [
  'thinWalledCircle',
  'halfCircle',
  'quarterCircle',
  'circularSector',
  'circularSegment',
  'oval',
  'hollowOval',
  'halfEllipse',
  'ellipticalQuadrant',
  'parabolicArea',
  'parabolicHalfArea',
] as const
type Id = (typeof IDS)[number]

const dims = (over: Partial<Dims> = {}): Dims => ({
  a: 200,
  b: 120,
  t1: 10,
  t2: 0,
  n: 0,
  angle: 90,
  ...over,
})

/** One representative of each section — eleven genuinely different outlines. */
const CASES: Record<Id, Dims> = {
  thinWalledCircle: dims(),
  halfCircle: dims(),
  quarterCircle: dims(),
  // Past 180° subtended, so the flanks fall below the apex and the outline is a
  // disc with a wedge bitten out — the branch a narrow slice never reaches.
  circularSector: dims({ angle: 260 }),
  circularSegment: dims({ angle: 100 }),
  oval: dims(),
  hollowOval: dims(),
  halfEllipse: dims(),
  ellipticalQuadrant: dims(),
  parabolicArea: dims(),
  parabolicHalfArea: dims(),
}

const run = (id: Id, d: Dims = CASES[id]): Primitives => CURVED_SHAPES[id](d)

// ---------------------------------------------------------------------------
// The independent model.
// ---------------------------------------------------------------------------

/**
 * The x intervals the outline covers at height y above the bottom of the
 * bounding box.
 *
 * A list rather than a single pair, because a pipe and a sector reflexed past
 * 180° both present TWO separate runs of material at some heights, and a model
 * that assumed one interval would quietly fill in the bore.
 *
 * Written from what the dimensions MEAN — a the diameter or major axis, b the
 * minor axis or base, t₁ the wall, the angle subtended at the centre — and from
 * nothing in shapes-curved.ts.
 */
type Span = [number, number]

const circ = (R: number, u: number): number => (Math.abs(u) >= R ? 0 : Math.sqrt(R * R - u * u))

function boxOf(id: Id, d: Dims): { width: number; height: number } {
  const { a, b, angle } = d
  const R = a / 2
  const al = ((angle * Math.PI) / 180) / 2
  switch (id) {
    case 'thinWalledCircle':
    case 'oval':
    case 'hollowOval':
      return { width: id === 'thinWalledCircle' ? a : b, height: a }
    case 'halfCircle':
      return { width: a, height: R }
    case 'quarterCircle':
      return { width: R, height: R }
    case 'halfEllipse':
      return { width: b, height: a / 2 }
    case 'ellipticalQuadrant':
      return { width: b / 2, height: a / 2 }
    case 'circularSector':
      return {
        width: 2 * R * (al <= Math.PI / 2 ? Math.sin(al) : 1),
        height: R - Math.min(0, R * Math.cos(al)),
      }
    case 'circularSegment':
      return {
        width: 2 * R * (al <= Math.PI / 2 ? Math.sin(al) : 1),
        height: R * (1 - Math.cos(al)),
      }
    case 'parabolicArea':
    case 'parabolicHalfArea':
      return { width: b, height: a }
  }
}

function spansAt(id: Id, d: Dims, y: number): Span[] {
  const { a, b, t1, angle } = d
  const R = a / 2
  const ry = a / 2
  const rx = b / 2
  const al = ((angle * Math.PI) / 180) / 2
  const W = boxOf(id, d).width

  switch (id) {
    case 'thinWalledCircle': {
      const u = y - R
      const o = circ(R, u)
      const i = circ(R - t1, u)
      return i > 0 ? [[R - o, R - i], [R + i, R + o]] : [[R - o, R + o]]
    }
    case 'halfCircle': {
      const h = circ(R, y)
      return [[R - h, R + h]]
    }
    case 'quarterCircle':
      return [[0, circ(R, y)]]
    case 'oval': {
      // The chord of an ellipse: 2·(b/2)·√(1 − (2y/a)²) about its own centre.
      const h = rx * Math.sqrt(Math.max(1 - ((y - ry) / ry) ** 2, 0))
      return [[rx - h, rx + h]]
    }
    case 'hollowOval': {
      const u = y - ry
      const h = rx * Math.sqrt(Math.max(1 - (u / ry) ** 2, 0))
      const ryi = ry - t1
      const rxi = rx - t1
      const hi = Math.abs(u) >= ryi ? 0 : rxi * Math.sqrt(Math.max(1 - (u / ryi) ** 2, 0))
      return hi > 0 ? [[rx - h, rx - hi], [rx + hi, rx + h]] : [[rx - h, rx + h]]
    }
    case 'halfEllipse': {
      const h = rx * Math.sqrt(Math.max(1 - (y / ry) ** 2, 0))
      return [[rx - h, rx + h]]
    }
    case 'ellipticalQuadrant':
      return [[0, rx * Math.sqrt(Math.max(1 - (y / ry) ** 2, 0))]]
    case 'circularSector': {
      // Circle centred on the apex; y in the box is offset by however far the
      // flanks reach below it.
      const Y = y + Math.min(0, R * Math.cos(al))
      const s = circ(R, Y)
      if (Y >= 0) {
        // The wedge |ψ| ≤ α cuts |x| ≤ y·tanα above the centre, and nothing at
        // all once the sector has opened past a right angle.
        const hw = al >= Math.PI / 2 ? s : Math.min(s, Y * Math.tan(al))
        return [[W / 2 - hw, W / 2 + hw]]
      }
      if (al <= Math.PI / 2) return []
      const notch = -Y * Math.tan(Math.PI - al)
      if (notch >= s) return []
      return [[W / 2 - s, W / 2 - notch], [W / 2 + notch, W / 2 + s]]
    }
    case 'circularSegment': {
      const Y = y + R * Math.cos(al)
      const s = circ(R, Y)
      return [[W / 2 - s, W / 2 + s]]
    }
    case 'parabolicArea': {
      const w = b * Math.sqrt(Math.max(1 - y / a, 0))
      return [[(b - w) / 2, (b + w) / 2]]
    }
    case 'parabolicHalfArea':
      return [[0, b * Math.sqrt(Math.max(1 - y / a, 0))]]
  }
}

/**
 * Enough strips that the only error left is the sliver at a crown, where the
 * outline turns through a vertical tangent — parts in ten million here.
 */
const STRIPS = 400_000

/** Sum f over the strips, midpoint rule, y running up the bounding box. */
function integrate(id: Id, d: Dims, f: (y: number, s: Span[]) => number, strips = STRIPS): number {
  const dy = boxOf(id, d).height / strips
  let total = 0
  for (let i = 0; i < strips; i++) {
    const y = (i + 0.5) * dy
    total += f(y, spansAt(id, d, y)) * dy
  }
  return total
}

const spanWidth = (s: Span[]): number => s.reduce((t, [l, r]) => t + (r - l), 0)

/** ∫|x − p|dx across a run of material — the first moment one strip contributes. */
function armOf([l, r]: Span, p: number): number {
  if (r <= p) return p * (r - l) - (r * r - l * l) / 2
  if (l >= p) return (r * r - l * l) / 2 - p * (r - l)
  return armOf([l, p], p) + armOf([p, r], p)
}

interface Numeric {
  A: number
  cx: number
  cy: number
  Ix: number
  Iy: number
  Zx: number
  Zy: number
}

function byIntegration(id: Id, d: Dims): Numeric {
  const A = integrate(id, d, (_, s) => spanWidth(s))
  const cy = integrate(id, d, (y, s) => y * spanWidth(s)) / A
  const cx = integrate(id, d, (_, s) => s.reduce((t, [l, r]) => t + (r * r - l * l) / 2, 0)) / A
  // Centred on the spot rather than taken about an edge and shifted, so the
  // answer never rests on two large numbers nearly cancelling.
  const Ix = integrate(id, d, (y, s) => (y - cy) ** 2 * spanWidth(s))
  const Iy = integrate(id, d, (_, s) =>
    s.reduce((t, [l, r]) => t + ((r - cx) ** 3 - (l - cx) ** 3) / 3, 0),
  )

  // The horizontal equal-area axis, found by walking the same strips: the height
  // with half the material below it. Σ A|y − y₀| is stationary there, so a
  // fraction of a strip's error in the axis costs second order and nothing here.
  const height = boxOf(id, d).height
  const dy = height / STRIPS
  let below = 0
  let yp = 0
  for (let i = 0; i < STRIPS; i++) {
    const y = (i + 0.5) * dy
    const w = spanWidth(spansAt(id, d, y))
    if (below + w * dy >= A / 2) {
      yp = y - dy / 2 + (w === 0 ? 0 : (A / 2 - below) / w)
      break
    }
    below += w * dy
  }
  const Zx = integrate(id, d, (y, s) => Math.abs(y - yp) * spanWidth(s))

  // The vertical one needs a search rather than a walk, because the strips run
  // the wrong way for it. Coarser, and still four figures better than needed.
  const COARSE = 40_000
  const areaLeftOf = (x: number): number =>
    integrate(
      id,
      d,
      (_, s) => s.reduce((t, [l, r]) => t + Math.max(0, Math.min(r, x) - l), 0),
      COARSE,
    )
  const width = boxOf(id, d).width
  let lo = 0
  let hi = width
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (areaLeftOf(mid) < A / 2) lo = mid
    else hi = mid
  }
  const xp = (lo + hi) / 2
  const Zy = integrate(id, d, (_, s) => s.reduce((t, span) => t + armOf(span, xp), 0), COARSE)

  return { A, cx, cy, Ix, Iy, Zx, Zy }
}

/** Computed once per section — seven sweeps each is not free. */
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
  test('exports exactly the eleven sections, and each is a function', () => {
    expect(Object.keys(CURVED_SHAPES)).toEqual([...IDS])
    for (const id of IDS) expect(typeof CURVED_SHAPES[id]).toBe('function')
  })
})

describe.each(IDS)('%s, against a sum of strips', (id) => {
  const p = run(id)
  const numeric = NUMERIC[id]

  test('area', () => {
    expect(ratio(p.A, numeric.A)).toBeCloseTo(1, 4)
  })

  test('centroid, both ways', () => {
    expect(ratio(p.cy, numeric.cy)).toBeCloseTo(1, 4)
    expect(ratio(p.cx, numeric.cx)).toBeCloseTo(1, 4)
  })

  test('second moment about the horizontal centroidal axis', () => {
    expect(ratio(p.Ix, numeric.Ix)).toBeCloseTo(1, 4)
  })

  test('second moment about the vertical centroidal axis', () => {
    expect(ratio(p.Iy, numeric.Iy)).toBeCloseTo(1, 4)
  })

  test('plastic modulus about the horizontal equal-area axis', () => {
    expect(ratio(p.Zx, numeric.Zx)).toBeCloseTo(1, 4)
  })

  test('plastic modulus about the vertical equal-area axis', () => {
    expect(ratio(p.Zy, numeric.Zy)).toBeCloseTo(1, 4)
  })
})

describe('the same, for angles that reach the other branch of the outline', () => {
  // A sector under 180° subtended is a triangle capped by an arc; over it, a
  // disc with a wedge removed. A segment's chord sits above the centre in one
  // case and below it in the other. Both branches get the same second opinion.
  const extras: Array<[Id, Dims]> = [
    ['circularSector', dims({ angle: 60 })],
    ['circularSector', dims({ angle: 170 })],
    ['circularSector', dims({ angle: 340 })],
    ['circularSegment', dims({ angle: 45 })],
    ['circularSegment', dims({ angle: 200 })],
    ['circularSegment', dims({ angle: 330 })],
  ]

  test.each(extras)('%s at %o', (id, d) => {
    const p = run(id, d)
    const numeric = byIntegration(id, d)
    expect(ratio(p.A, numeric.A)).toBeCloseTo(1, 4)
    expect(ratio(p.cy, numeric.cy)).toBeCloseTo(1, 4)
    expect(ratio(p.Ix, numeric.Ix)).toBeCloseTo(1, 4)
    expect(ratio(p.Iy, numeric.Iy)).toBeCloseTo(1, 4)
    expect(ratio(p.Zx, numeric.Zx)).toBeCloseTo(1, 4)
    expect(ratio(p.Zy, numeric.Zy)).toBeCloseTo(1, 4)
  })
})

describe('every primitive is filled, on every section', () => {
  test.each(IDS)('%s returns a finite number in every field', (id) => {
    const p = run(id)
    for (const [key, value] of Object.entries(p)) {
      if (key === 'formulas') continue
      expect(Number.isFinite(value), `${key} is ${String(value)}`).toBe(true)
    }
    expect(Object.keys(p.formulas).sort()).toEqual(['A', 'Ix', 'Iy', 'Zx', 'Zy'])
  })

  test.each(IDS)('%s: the extreme-fibre distances span the envelope', (id) => {
    const p = run(id)
    const box = boxOf(id, CASES[id])
    expect(p.cTop + p.cBot).toBeCloseTo(box.height, 6)
    expect(p.cLeft + p.cRight).toBeCloseTo(box.width, 6)
    expect(p.cBot).toBeCloseTo(p.cy, 12)
    expect(p.cLeft).toBeCloseTo(p.cx, 12)
    expect(p.cTop).toBeGreaterThan(0)
    expect(p.cBot).toBeGreaterThan(0)
    expect(p.gross).toBeCloseTo(box.width * box.height, 3)
    // Curved material never fills the box it is drawn in.
    expect(p.A).toBeLessThan(p.gross)
    expect(p.Po).toBeGreaterThan(0)
  })

  test('only the two bored sections have an inner perimeter', () => {
    for (const id of IDS) {
      const p = run(id)
      if (id === 'thinWalledCircle' || id === 'hollowOval') expect(p.Pi).toBeGreaterThan(0)
      else expect(p.Pi).toBe(0)
    }
  })
})

describe('the classical anchors', () => {
  test('a half circle carries its centroid 4R/3π above the flat, not R/2', () => {
    const R = 100
    const p = run('halfCircle', dims({ a: 2 * R }))
    expect(p.A).toBeCloseTo((Math.PI * R * R) / 2, 6)
    expect(p.cy).toBeCloseTo((4 * R) / (3 * Math.PI), 9)
    expect(p.cy).toBeCloseTo(42.441318157, 6)
    // Which is the whole point: the two fibre distances are not the same number.
    expect(p.cTop).toBeCloseTo(R - (4 * R) / (3 * Math.PI), 9)
    expect(p.cTop / p.cBot).toBeGreaterThan(1.35)
    expect(ratio(p.Ix, (R ** 4 * (9 * Math.PI ** 2 - 64)) / (72 * Math.PI))).toBeCloseTo(1, 12)
    expect(ratio(p.Iy, (Math.PI * R ** 4) / 8)).toBeCloseTo(1, 12)
    expect(p.Po).toBeCloseTo(Math.PI * R + 2 * R, 9)
  })

  test('an ellipse with a = b is a circle, to the last digit of πD⁴/64', () => {
    const D = 140
    const p = run('oval', dims({ a: D, b: D }))
    expect(ratio(p.A, (Math.PI * D * D) / 4)).toBeCloseTo(1, 12)
    expect(ratio(p.Ix, (Math.PI * D ** 4) / 64)).toBeCloseTo(1, 12)
    expect(ratio(p.Iy, (Math.PI * D ** 4) / 64)).toBeCloseTo(1, 12)
    expect(ratio(p.Zx, D ** 3 / 6)).toBeCloseTo(1, 12)
    expect(ratio(p.Zy, D ** 3 / 6)).toBeCloseTo(1, 12)
    expect(p.cy).toBeCloseTo(D / 2, 9)
    expect(ratio(p.Po, Math.PI * D)).toBeCloseTo(1, 12)
    // And the shape factor a round bar is quoted with.
    expect(p.Zx / (p.Ix / p.cBot)).toBeCloseTo(16 / (3 * Math.PI), 9)
  })

  test('a 360° sector and a 360° segment are both the whole circle', () => {
    const D = 200
    for (const id of ['circularSector', 'circularSegment'] as const) {
      const p = run(id, dims({ a: D, angle: 360 }))
      expect(ratio(p.A, (Math.PI * D * D) / 4), id).toBeCloseTo(1, 10)
      expect(ratio(p.Ix, (Math.PI * D ** 4) / 64), id).toBeCloseTo(1, 10)
      expect(ratio(p.Iy, (Math.PI * D ** 4) / 64), id).toBeCloseTo(1, 10)
      expect(ratio(p.Zx, D ** 3 / 6), id).toBeCloseTo(1, 9)
      expect(ratio(p.Zy, D ** 3 / 6), id).toBeCloseTo(1, 9)
      expect(p.cy, id).toBeCloseTo(D / 2, 6)
      expect(p.cTop, id).toBeCloseTo(p.cBot, 6)
    }
  })

  test('a 180° sector and a 180° segment are both the half circle', () => {
    const half = numbersOf(run('halfCircle', dims({ a: 200 })))
    for (const id of ['circularSector', 'circularSegment'] as const) {
      const p = numbersOf(run(id, dims({ a: 200, angle: 180 })))
      for (const key of Object.keys(half)) {
        // Pi is zero on both, and a ratio of zeroes is not a comparison.
        if (half[key] === 0) expect(p[key], `${id}.${key}`).toBe(0)
        else expect(ratio(p[key]!, half[key]!), `${id}.${key}`).toBeCloseTo(1, 8)
      }
    }
  })

  test('a parabolic area is two thirds of the box that bounds it', () => {
    const a = 200
    const b = 120
    for (const id of ['parabolicArea', 'parabolicHalfArea'] as const) {
      const p = run(id, dims({ a, b }))
      expect(ratio(p.A, (2 * a * b) / 3), id).toBeCloseTo(1, 12)
      expect(ratio(p.A, p.gross), id).toBeCloseTo(2 / 3, 12)
      // Centroid 2a/5 above the base — below mid-height, because the section
      // narrows as it rises.
      expect(p.cy, id).toBeCloseTo((2 * a) / 5, 9)
      expect(p.cy, id).toBeLessThan(a / 2)
      expect(ratio(p.Ix, (8 * a ** 3 * b) / 175), id).toBeCloseTo(1, 12)
    }
    // The two share every property taken up the height, and differ across it.
    const full = run('parabolicArea')
    const half = run('parabolicHalfArea')
    expect(ratio(half.A, full.A)).toBeCloseTo(1, 12)
    expect(ratio(half.Ix, full.Ix)).toBeCloseTo(1, 12)
    expect(ratio(half.Zx, full.Zx)).toBeCloseTo(1, 12)
    expect(half.cx).toBeCloseTo((3 * CASES.parabolicHalfArea.b) / 8, 9)
    expect(full.cx).toBeCloseTo(CASES.parabolicArea.b / 2, 9)
    expect(ratio(half.Iy, (19 * 200 * 120 ** 3) / 480)).toBeCloseTo(1, 12)
  })

  test('the ellipse family collapses onto the circle family when a = b', () => {
    const D = 180
    const pairs: Array<[Id, Id]> = [
      ['halfEllipse', 'halfCircle'],
      ['ellipticalQuadrant', 'quarterCircle'],
      ['hollowOval', 'thinWalledCircle'],
    ]
    for (const [curved, round] of pairs) {
      const got = numbersOf(run(curved, dims({ a: D, b: D, t1: 12 })))
      const want = numbersOf(run(round, dims({ a: D, b: D, t1: 12 })))
      for (const key of Object.keys(want)) {
        if (want[key] === 0) expect(got[key], `${curved} vs ${round}: ${key}`).toBe(0)
        else expect(ratio(got[key]!, want[key]!), `${curved} vs ${round}: ${key}`).toBeCloseTo(1, 9)
      }
    }
  })

  test('a quarter circle is symmetric about its own diagonal', () => {
    const p = run('quarterCircle', dims({ a: 200 }))
    expect(p.cx).toBeCloseTo(p.cy, 9)
    expect(p.cx).toBeCloseTo((4 * 100) / (3 * Math.PI), 9)
    expect(ratio(p.Ix, p.Iy)).toBeCloseTo(1, 12)
    expect(ratio(p.Zx, p.Zy)).toBeCloseTo(1, 12)
    // And exactly half of the half circle, which it was cut from.
    const half = run('halfCircle', dims({ a: 200 }))
    expect(ratio(p.A, half.A / 2)).toBeCloseTo(1, 12)
    expect(ratio(p.Ix, half.Ix / 2)).toBeCloseTo(1, 12)
    expect(ratio(p.Zx, half.Zx / 2)).toBeCloseTo(1, 12)
    expect(p.cy).toBeCloseTo(half.cy, 12)
  })

  test('a thin pipe tends to the thin-ring formulas', () => {
    // As t → 0 the annulus becomes a line of material at radius R, where
    // A → 2πRt, I → πR³t and Z → 4R²t.
    const R = 100
    const t = 0.02
    const p = run('thinWalledCircle', dims({ a: 2 * R, t1: t }))
    expect(ratio(p.A, 2 * Math.PI * R * t)).toBeCloseTo(1, 3)
    expect(ratio(p.Ix, Math.PI * R ** 3 * t)).toBeCloseTo(1, 3)
    expect(ratio(p.Zx, 4 * R * R * t)).toBeCloseTo(1, 3)
    // A tube beats a solid bar on shape factor, and by the classical margin.
    expect(p.Zx / (p.Ix / p.cBot)).toBeGreaterThan(1.25)
    expect(p.Zx / (p.Ix / p.cBot)).toBeLessThan(1.3)
  })
})

describe('the asymmetry, and the axis the plastic modulus is really about', () => {
  const ASYMMETRIC: Id[] = [
    'halfCircle',
    'quarterCircle',
    'circularSector',
    'circularSegment',
    'halfEllipse',
    'ellipticalQuadrant',
    'parabolicArea',
    'parabolicHalfArea',
  ]

  test.each(ASYMMETRIC)('%s: cTop and cBot are genuinely different numbers', (id) => {
    const p = run(id)
    const height = boxOf(id, CASES[id]).height
    expect(Math.abs(p.cTop - p.cBot) / height).toBeGreaterThan(0.02)
    expect(p.cy).not.toBeCloseTo(height / 2, 2)
  })

  test.each(ASYMMETRIC)('%s: the equal-area axis is not the centroid', (id) => {
    // Σ A|y − y₀| is minimised at the median of the area, so taking the first
    // moments about the centroid instead returns a LARGER number — an
    // unconservative Zx, the worst direction for a wrong answer to be wrong in.
    const p = run(id)
    const d = CASES[id]
    const aboutCentroid = integrate(id, d, (y, s) => Math.abs(y - p.cy) * spanWidth(s))
    expect(p.Zx).toBeLessThan(aboutCentroid)
    // Well clear of the strips' own error, though the margin narrows to parts
    // in ten thousand on the 260° sector, which is nearly a whole disc.
    expect(aboutCentroid / p.Zx).toBeGreaterThan(1.00001)
  })

  test('the doubly symmetric sections are the case where the two axes coincide', () => {
    for (const id of ['thinWalledCircle', 'oval', 'hollowOval'] as const) {
      const p = run(id)
      const height = boxOf(id, CASES[id]).height
      expect(p.cy, id).toBeCloseTo(height / 2, 9)
      expect(p.cTop, id).toBeCloseTo(p.cBot, 9)
      const aboutCentroid = integrate(id, CASES[id], (y, s) => Math.abs(y - p.cy) * spanWidth(s))
      expect(ratio(p.Zx, aboutCentroid), id).toBeCloseTo(1, 4)
    }
  })

  test('a half circle puts the equal-area axis below its centroid', () => {
    // The chord widens towards the flat, so half the area is reached before the
    // centroid is: y_p ≈ 0.4040R against ȳ = 4R/3π ≈ 0.4244R.
    const R = 100
    const p = run('halfCircle', dims({ a: 2 * R }))
    // Zx = (4/3)(R² − y_p²)^{3/2} − (2/3)R³ at the equal-area axis; solving
    // y_p√(R² − y_p²) + R²asin(y_p/R) = πR²/4 gives y_p = 40.397…
    const yp = 40.39718
    const Zx = (4 / 3) * (R * R - yp * yp) ** 1.5 - (2 / 3) * R ** 3
    expect(ratio(p.Zx, Zx)).toBeCloseTo(1, 5)
    expect(yp).toBeLessThan(p.cy)
    // Taking it about the centroid would overstate Zx, and this is by how much.
    const aboutCentroid = integrate('halfCircle', dims({ a: 2 * R }), (y, s) =>
      Math.abs(y - p.cy) * spanWidth(s),
    )
    expect(aboutCentroid / p.Zx).toBeGreaterThan(1.001)
  })

  test('a parabolic area puts it below the centroid too, at a(1 − 2^(−2/3))', () => {
    const a = 200
    const b = 120
    const p = run('parabolicArea', dims({ a, b }))
    const yp = a * (1 - Math.pow(2, -2 / 3))
    expect(yp).toBeLessThan(p.cy)
    expect(yp / a).toBeCloseTo(0.37004, 5)
    const Zx = integrate('parabolicArea', dims({ a, b }), (y, s) => Math.abs(y - yp) * spanWidth(s))
    expect(ratio(p.Zx, Zx)).toBeCloseTo(1, 4)
  })

  test('the plastic modulus beats the governing elastic one, on all eleven', () => {
    for (const id of IDS) {
      const p = run(id)
      // First yield is reached at the fibre furthest from the centroid, so the
      // elastic modulus that governs is Ix over the LONGER of the two arms.
      const Sx = p.Ix / Math.max(p.cTop, p.cBot)
      expect(p.Zx, id).toBeGreaterThan(Sx)
      expect(p.Zx / Sx, id).toBeLessThan(3)
    }
  })

  test('the three quadrant-and-half sections are asymmetric across the base as well', () => {
    for (const id of ['quarterCircle', 'ellipticalQuadrant', 'parabolicHalfArea'] as const) {
      const p = run(id)
      expect(p.cLeft, id).not.toBeCloseTo(p.cRight, 2)
    }
    // While every other section here has its centroid on the vertical mid-line.
    for (const id of IDS) {
      if (id === 'quarterCircle' || id === 'ellipticalQuadrant' || id === 'parabolicHalfArea') continue
      const p = run(id)
      expect(p.cLeft, id).toBeCloseTo(p.cRight, 6)
    }
  })
})

describe('impossible input is refused, with the box to blame', () => {
  function throwsOn(id: Id, over: Partial<Dims>, field: string): void {
    let caught: unknown
    try {
      run(id, dims({ ...CASES[id], ...over }))
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
    for (const id of IDS) throwsOn(id, { a: Number.NaN }, 'a')
  })

  test.each(IDS)('%s: the primary dimension may not be zero, negative or infinite', (id) => {
    throwsOn(id, { a: 0 }, 'a')
    throwsOn(id, { a: -200 }, 'a')
    throwsOn(id, { a: Number.POSITIVE_INFINITY }, 'a')
  })

  test('the sections that read a width refuse a bad one', () => {
    for (const id of ['oval', 'hollowOval', 'halfEllipse', 'ellipticalQuadrant', 'parabolicArea', 'parabolicHalfArea'] as const) {
      throwsOn(id, { b: 0 }, 'b')
      throwsOn(id, { b: -120 }, 'b')
      throwsOn(id, { b: Number.NaN }, 'b')
    }
  })

  test('a wall has to leave a bore behind it', () => {
    for (const id of ['thinWalledCircle', 'hollowOval'] as const) {
      throwsOn(id, { t1: 0 }, 't1')
      throwsOn(id, { t1: -10 }, 't1')
      throwsOn(id, { t1: Number.NaN }, 't1')
      throwsOn(id, { t1: 200 }, 't1')
    }
    // The radius is the limit for a pipe, and it is not a legal one: the two
    // walls meet at the middle and there is nothing left to bore.
    throwsOn('thinWalledCircle', { a: 200, t1: 100 }, 't1')
    expect(() => run('thinWalledCircle', dims({ a: 200, t1: 99.9 }))).not.toThrow()
    // A hollow oval is limited by the SHORTER semi-axis, which is the minor one
    // — 60 here, not the 100 the major axis would allow.
    throwsOn('hollowOval', { a: 200, b: 120, t1: 60 }, 't1')
    expect(() => run('hollowOval', dims({ a: 200, b: 120, t1: 59.9 }))).not.toThrow()
  })

  test('an angle has to be an angle a slice can subtend', () => {
    for (const id of ['circularSector', 'circularSegment'] as const) {
      throwsOn(id, { angle: 0 }, 'angle')
      throwsOn(id, { angle: -90 }, 'angle')
      throwsOn(id, { angle: 361 }, 'angle')
      throwsOn(id, { angle: Number.NaN }, 'angle')
      throwsOn(id, { angle: Number.POSITIVE_INFINITY }, 'angle')
      // A full turn is the limit, not an error — that is the whole circle.
      expect(() => run(id, dims({ angle: 360 }))).not.toThrow()
    }
  })

  test('a section only reads the dimensions it has', () => {
    // The angle means nothing to an ellipse and the wall nothing to a half
    // circle, so garbage in either box cannot stop them answering.
    expect(() => run('halfCircle', dims({ b: Number.NaN, t1: Number.NaN, angle: Number.NaN }))).not.toThrow()
    expect(() => run('oval', dims({ t1: Number.NaN, angle: -5 }))).not.toThrow()
    expect(() => run('parabolicArea', dims({ t1: Number.NaN, angle: Number.NaN }))).not.toThrow()
    expect(() => run('circularSector', dims({ b: Number.NaN, t1: Number.NaN, angle: 90 }))).not.toThrow()
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

  test('the asymmetric sections say where their axes are', () => {
    expect(run('halfCircle').formulas.Ix).toContain('4R/3π')
    expect(run('halfCircle').formulas.Zx).toContain('equal-area axis')
    expect(run('parabolicArea').formulas.Ix).toContain('2a/5')
    expect(run('parabolicArea').formulas.Zx).toContain('equal-area axis')
    expect(run('circularSector').formulas.Zx).toContain('equal-area axis')
    expect(run('circularSegment').formulas.Zx).toContain('equal-area axis')
    expect(run('parabolicHalfArea').formulas.Iy).toContain('3b/8')
  })
})

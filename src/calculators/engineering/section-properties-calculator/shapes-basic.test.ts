import { describe, expect, test } from 'vitest'
import { BASIC_SHAPES } from './shapes-basic'
import { ShapeError } from './shapes'
import type { Dims, Primitives } from './shapes'

/**
 * shapes-basic.ts arrived without a single test, so nothing in it is taken on
 * trust. Every closed form is checked against NUMERICAL INTEGRATION written
 * here from the dimension semantics alone — a model that describes each outline
 * as the list of x-intervals the material occupies at a height y, and sums A,
 * ∫y dA, ∫(y−c)² dA, ∫x² dA, ∫|y−y_p| dA and ∫|x| dA straight off it. It shares
 * no line with the implementation: the polygons are rebuilt from their
 * vertices, the rotated rectangle from its rotated corners, the box from its
 * two walls. A transposed exponent, a Zx taken about the centroid instead of
 * the equal-area axis, or a diamond that forgot to grow its envelope survives
 * one of the two and never both.
 *
 * The interval model rather than a plain width function is deliberate: a hollow
 * box holds TWO strips of material at mid-height, and ∫x² dx over one strip of
 * the summed width would silently invent a solid section.
 *
 * On top of the integration sit the classical anchors, which catch the error an
 * integration would happily agree with because it was told the same wrong
 * shape: a⁴/12 and a shape factor of exactly 1.5 for a square, a triangle's
 * centroid at a/3, a polygon converging on πR⁴/4, a diamond that is the square
 * it was cut from, and a rotation of zero that changes nothing at all.
 */

const dims = (over: Partial<Dims> = {}): Dims => ({
  a: 100,
  b: 100,
  t1: 10,
  t2: 10,
  n: 6,
  angle: 0,
  ...over,
})

const IDS = [
  'square',
  'triangle',
  'hexagon',
  'octagon',
  'regularPolygon',
  'cross',
  'rotatedRectangle',
  'squareDiamond',
  'thinWalledRectangle',
] as const
type Id = (typeof IDS)[number]

/** One representative of each section, chosen so no two are the same outline. */
const CASES: Record<Id, Dims> = {
  square: dims({ a: 120 }),
  // Tall and asymmetric on purpose: this is the section where cTop ≠ cBot and
  // where the equal-area axis parts company with the centroid.
  triangle: dims({ a: 300, b: 180 }),
  hexagon: dims({ a: 100 }),
  octagon: dims({ a: 100 }),
  // Five sides: odd, so a vertex above and a flat below — asymmetric top to
  // bottom, which an even-sided polygon would never expose.
  regularPolygon: dims({ a: 100, n: 5 }),
  cross: dims({ a: 300, b: 200, t1: 40 }),
  rotatedRectangle: dims({ a: 300, b: 150, angle: 30 }),
  squareDiamond: dims({ a: 120 }),
  thinWalledRectangle: dims({ a: 300, b: 200, t1: 12 }),
}

const run = (id: Id, d: Dims = CASES[id]): Primitives => BASIC_SHAPES[id]!(d)

// ---------------------------------------------------------------------------
// The independent model.
// ---------------------------------------------------------------------------

/** One run of material at a height: [x_left, x_right], x from the centre-line. */
type Seg = [number, number]

interface Model {
  /** Overall height of the bounding box. */
  H: number
  /** The material at height y above the bottom fibre, left to right. */
  segs: (y: number) => Seg[]
}

type Pt = [number, number]

/**
 * The chord of a convex outline at height y, from its vertices and nothing
 * else: every edge that spans y contributes an x, and the chord runs between
 * the extremes. Used for the polygons, the turned rectangle and the diamond, so
 * those three are described to this file only by where their corners are.
 */
function convexChord(verts: Pt[], y: number): Seg[] {
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < verts.length; i++) {
    const [x1, y1] = verts[i]!
    const [x2, y2] = verts[(i + 1) % verts.length]!
    if (y1 === y2) {
      if (y1 !== y) continue
      lo = Math.min(lo, x1, x2)
      hi = Math.max(hi, x1, x2)
      continue
    }
    if (y < Math.min(y1, y2) || y > Math.max(y1, y2)) continue
    const x = x1 + ((x2 - x1) * (y - y1)) / (y2 - y1)
    lo = Math.min(lo, x)
    hi = Math.max(hi, x)
  }
  return hi > lo ? [[lo, hi]] : []
}

/** Vertices shifted so the lowest sits at y = 0, and the model built on them. */
function fromVertices(verts: Pt[]): Model {
  const yBot = Math.min(...verts.map((v) => v[1]))
  const yTop = Math.max(...verts.map((v) => v[1]))
  const moved: Pt[] = verts.map(([x, y]) => [x, y - yBot])
  return { H: yTop - yBot, segs: (y) => convexChord(moved, y) }
}

/** A regular n-gon of circumradius R, vertex-up — the orientation shapes-basic states. */
function polygonVertices(n: number, R: number): Pt[] {
  const out: Pt[] = []
  for (let k = 0; k < n; k++) {
    const t = Math.PI / 2 + (2 * Math.PI * k) / n
    out.push([R * Math.cos(t), R * Math.sin(t)])
  }
  return out
}

/** The outline of each section, written from what the dimensions MEAN. */
function modelOf(id: Id, d: Dims): Model {
  const { a, b, t1, n, angle } = d
  switch (id) {
    case 'square':
      return { H: a, segs: () => [[-a / 2, a / 2]] }
    case 'triangle': {
      // Base b at the bottom, apex at the top of the centre-line.
      return {
        H: a,
        segs: (y) => {
          const half = (b / 2) * (1 - y / a)
          return half > 0 ? [[-half, half]] : []
        },
      }
    }
    case 'hexagon':
      return fromVertices(polygonVertices(6, a))
    case 'octagon':
      return fromVertices(polygonVertices(8, a))
    case 'regularPolygon':
      return fromVertices(polygonVertices(n, a))
    case 'cross':
      return {
        H: a,
        segs: (y) =>
          Math.abs(y - a / 2) <= t1 / 2 ? [[-b / 2, b / 2]] : [[-t1 / 2, t1 / 2]],
      }
    case 'rotatedRectangle': {
      const th = (angle * Math.PI) / 180
      const c = Math.cos(th)
      const s = Math.sin(th)
      // The four corners of an a-tall, b-wide rectangle, each turned by θ.
      const corners: Pt[] = [
        [b / 2, a / 2],
        [-b / 2, a / 2],
        [-b / 2, -a / 2],
        [b / 2, -a / 2],
      ]
      return fromVertices(corners.map(([x, y]) => [x * c - y * s, x * s + y * c]))
    }
    case 'squareDiamond': {
      const h = (a * Math.SQRT2) / 2
      return fromVertices([
        [0, h],
        [h, 0],
        [0, -h],
        [-h, 0],
      ])
    }
    case 'thinWalledRectangle':
      return {
        H: a,
        segs: (y) =>
          y < t1 || y > a - t1
            ? [[-b / 2, b / 2]]
            : // Two walls with a bore between them — NOT one strip of width 2t₁.
              [
                [-b / 2, -b / 2 + t1],
                [b / 2 - t1, b / 2],
              ],
      }
  }
}

/**
 * Fine enough that the only error left is the sliver of one strip straddling a
 * step in the outline — parts in a million on these sections.
 */
const STRIPS = 400_000

interface Numeric {
  A: number
  width: number
  cy: number
  Ix: number
  Iy: number
  Zx: number
  Zy: number
}

function byIntegration(m: Model): Numeric {
  const dy = m.H / STRIPS
  const widths = new Float64Array(STRIPS)
  let A = 0
  let My = 0
  let Iy = 0
  let Zy = 0
  let width = 0

  for (let i = 0; i < STRIPS; i++) {
    const y = (i + 0.5) * dy
    let w = 0
    for (const [x0, x1] of m.segs(y)) {
      w += x1 - x0
      // ∫x² dx and ∫|x| dx across the run, so a hollow section is two runs and
      // never one fat one. F(x) = x|x|/2 is the antiderivative of |x| for all x.
      Iy += ((x1 ** 3 - x0 ** 3) / 3) * dy
      Zy += ((x1 * Math.abs(x1) - x0 * Math.abs(x0)) / 2) * dy
      if (x1 - x0 > 0) width = Math.max(width, 2 * Math.max(Math.abs(x0), Math.abs(x1)))
    }
    widths[i] = w
    A += w * dy
    My += y * w * dy
  }

  const cy = My / A

  // The equal-area axis: the height with half the material below it. Σ A|y − y₀|
  // is stationary there, so a fraction of a strip of error costs nothing in Zx.
  let below = 0
  let yp = 0
  for (let i = 0; i < STRIPS; i++) {
    const w = widths[i]!
    if (below + w * dy >= A / 2) {
      yp = i * dy + (w === 0 ? 0 : (A / 2 - below) / w)
      break
    }
    below += w * dy
  }

  let Ix = 0
  let Zx = 0
  for (let i = 0; i < STRIPS; i++) {
    const y = (i + 0.5) * dy
    Ix += (y - cy) ** 2 * widths[i]! * dy
    Zx += Math.abs(y - yp) * widths[i]! * dy
  }

  return { A, width, cy, Ix, Iy, Zx, Zy }
}

const numericFor = (id: Id, d: Dims = CASES[id]): Numeric => byIntegration(modelOf(id, d))

/** Computed once per section — the strips are not free. */
const NUMERIC: Record<Id, Numeric> = Object.fromEntries(
  IDS.map((id) => [id, numericFor(id)]),
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
  test('exports exactly the nine sections, and each is a function', () => {
    expect(Object.keys(BASIC_SHAPES)).toEqual([...IDS])
    for (const id of IDS) expect(typeof BASIC_SHAPES[id]).toBe('function')
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
    // Every section here is symmetric left to right, so cx halves the envelope.
    expect(ratio(p.cx, numeric.width / 2)).toBeCloseTo(1, 4)
    expect(ratio(p.gross, numeric.width * modelOf(id, CASES[id]).H)).toBeCloseTo(1, 4)
  })

  test('second moment about the horizontal centroidal axis', () => {
    expect(ratio(p.Ix, numeric.Ix)).toBeCloseTo(1, 4)
  })

  test('second moment about the vertical centroidal axis', () => {
    expect(ratio(p.Iy, numeric.Iy)).toBeCloseTo(1, 4)
  })

  test('plastic modulus about the equal-area axis', () => {
    expect(ratio(p.Zx, numeric.Zx)).toBeCloseTo(1, 4)
  })

  test('plastic modulus about the vertical axis', () => {
    expect(ratio(p.Zy, numeric.Zy)).toBeCloseTo(1, 4)
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

  test.each(IDS)('%s: the extreme-fibre distances span the section', (id) => {
    const p = run(id)
    const H = modelOf(id, CASES[id]).H
    expect(p.cTop + p.cBot).toBeCloseTo(H, 6)
    expect(p.cBot).toBeCloseTo(p.cy, 12)
    expect(p.cLeft + p.cRight).toBeCloseTo(2 * p.cx, 12)
    // All nine are symmetric left to right, so the vertical axis splits the box.
    expect(p.cLeft).toBeCloseTo(p.cRight, 12)
  })

  test.each(IDS)('%s: gross is the bounding envelope, and the material fits in it', (id) => {
    const p = run(id)
    expect(p.gross).toBeCloseTo(2 * p.cx * (p.cTop + p.cBot), 6)
    expect(p.A).toBeLessThanOrEqual(p.gross * (1 + 1e-12))
    expect(p.Po).toBeGreaterThan(0)
  })

  test('only the hollow section has a bore', () => {
    for (const id of IDS) {
      if (id === 'thinWalledRectangle') expect(run(id).Pi).toBeGreaterThan(0)
      else expect(run(id).Pi, id).toBe(0)
    }
  })

  test('the plastic modulus beats the governing elastic one, on all nine', () => {
    for (const id of IDS) {
      // First yield is reached at the fibre furthest from the centroid, so the
      // elastic modulus that governs is Ix over the LONGER of the two arms.
      const p = run(id)
      const Sx = p.Ix / Math.max(p.cTop, p.cBot)
      expect(p.Zx, id).toBeGreaterThan(Sx)
      expect(p.Zx / Sx, id).toBeLessThan(2.5)
    }
  })
})

// ---------------------------------------------------------------------------
// The classical anchors.
// ---------------------------------------------------------------------------

describe('the square, which every other answer is calibrated against', () => {
  const a = 120

  test('a⁴/12 about every centroidal axis, and a shape factor of exactly 1.5', () => {
    const p = run('square', dims({ a }))
    expect(p.A).toBeCloseTo(a * a, 9)
    expect(ratio(p.Ix, a ** 4 / 12)).toBeCloseTo(1, 12)
    expect(ratio(p.Iy, a ** 4 / 12)).toBeCloseTo(1, 12)
    expect(ratio(p.Zx, a ** 3 / 4)).toBeCloseTo(1, 12)
    expect(ratio(p.Zy, a ** 3 / 4)).toBeCloseTo(1, 12)
    // Zx / (Ix/c) = (a³/4) / (a³/6). The one number a rectangle is famous for.
    expect(p.Zx / (p.Ix / p.cBot)).toBeCloseTo(1.5, 12)
    expect(p.cTop).toBeCloseTo(p.cBot, 12)
    expect(p.Po).toBeCloseTo(4 * a, 12)
    expect(p.gross).toBeCloseTo(a * a, 9)
    // A square wastes none of its envelope; every other section here does.
    expect(p.A).toBeCloseTo(p.gross, 9)
  })
})

describe('the triangle, the one asymmetric section here', () => {
  const a = 300
  const b = 180

  test('the centroid sits a/3 from the base, so the two fibres differ', () => {
    const p = run('triangle', dims({ a, b }))
    expect(p.A).toBeCloseTo((a * b) / 2, 9)
    expect(p.cy).toBeCloseTo(a / 3, 9)
    expect(p.cBot).toBeCloseTo(a / 3, 9)
    expect(p.cTop).toBeCloseTo((2 * a) / 3, 9)
    // Not interchangeable, and neither is a/2 — the error a designer gets hurt by.
    expect(p.cTop).not.toBeCloseTo(p.cBot, 3)
    expect(ratio(p.cTop, 2 * p.cBot)).toBeCloseTo(1, 12)
  })

  test('ba³/36 about the base-parallel centroidal axis, ab³/48 across it', () => {
    const p = run('triangle', dims({ a, b }))
    expect(ratio(p.Ix, (b * a ** 3) / 36)).toBeCloseTo(1, 12)
    expect(ratio(p.Iy, (a * b ** 3) / 48)).toBeCloseTo(1, 12)
    // The two elastic moduli a triangle really has.
    expect(ratio(p.Ix / p.cBot, (b * a ** 2) / 12)).toBeCloseTo(1, 12)
    expect(ratio(p.Ix / p.cTop, (b * a ** 2) / 24)).toBeCloseTo(1, 12)
  })

  test('the equal-area axis is NOT the centroid, and the centroid overstates Zx', () => {
    // Σ A|y − y₀| is minimised at the median of the area. Taking the first
    // moments about the centroid instead returns a LARGER number — an
    // unconservative Zx, the worst direction for a wrong answer to be wrong in.
    const d = dims({ a, b })
    const p = run('triangle', d)
    const m = modelOf('triangle', d)
    const dy = m.H / STRIPS
    let aboutCentroid = 0
    for (let i = 0; i < STRIPS; i++) {
      const y = (i + 0.5) * dy
      const w = m.segs(y).reduce((t, [x0, x1]) => t + x1 - x0, 0)
      aboutCentroid += Math.abs(y - p.cy) * w * dy
    }
    expect(p.Zx).toBeLessThan(aboutCentroid)
    expect(aboutCentroid / p.Zx).toBeGreaterThan(1.01)

    // And the equal-area axis itself: b(y − y²/2a) = ab/4 gives y = a(1 − 1/√2),
    // 0.293a, plainly not the 0.333a the centroid sits at.
    const yp = a * (1 - 1 / Math.SQRT2)
    expect(yp / a).toBeCloseTo(0.2928932188, 9)
    expect(ratio(p.Zx, (a * a * b * (2 - Math.SQRT2)) / 6)).toBeCloseTo(1, 12)
    // The classical triangular shape factor, 2.343.
    expect(p.Zx / (p.Ix / p.cTop)).toBeCloseTo(2.3431457506, 8)
  })
})

describe('the regular polygons', () => {
  test('hexagon and octagon are the general polygon at n = 6 and n = 8', () => {
    expect(numbersOf(run('hexagon', dims({ a: 100 })))).toEqual(
      numbersOf(run('regularPolygon', dims({ a: 100, n: 6 }))),
    )
    expect(numbersOf(run('octagon', dims({ a: 100 })))).toEqual(
      numbersOf(run('regularPolygon', dims({ a: 100, n: 8 }))),
    )
  })

  test('the textbook closed forms for a hexagon of circumradius R', () => {
    const R = 100
    const p = run('hexagon', dims({ a: R }))
    expect(ratio(p.A, (3 * Math.sqrt(3) * R * R) / 2)).toBeCloseTo(1, 12)
    expect(ratio(p.Ix, (5 * Math.sqrt(3) * R ** 4) / 16)).toBeCloseTo(1, 12)
    expect(ratio(p.Iy, (5 * Math.sqrt(3) * R ** 4) / 16)).toBeCloseTo(1, 12)
    expect(ratio(p.Zx, (7 * Math.sqrt(3) * R ** 3) / 12)).toBeCloseTo(1, 12)
    expect(ratio(p.Zy, R ** 3)).toBeCloseTo(1, 12)
    // Vertex-up: 2R tall, R√3 across the flats.
    expect(p.cTop + p.cBot).toBeCloseTo(2 * R, 9)
    expect(2 * p.cx).toBeCloseTo(R * Math.sqrt(3), 9)
    expect(p.Po).toBeCloseTo(6 * R, 9)
  })

  test('the textbook closed forms for an octagon of circumradius R', () => {
    const R = 100
    const p = run('octagon', dims({ a: R }))
    expect(ratio(p.A, 2 * Math.SQRT2 * R * R)).toBeCloseTo(1, 12)
    expect(ratio(p.Ix, ((2 * Math.SQRT2 + 1) * R ** 4) / 6)).toBeCloseTo(1, 12)
    expect(ratio(p.Zx, ((2 + Math.SQRT2) * R ** 3) / 3)).toBeCloseTo(1, 12)
    // A 90° turn maps an octagon onto itself, so its two plastic moduli agree —
    // which is NOT true of the hexagon, whose symmetry stops at 60°.
    expect(ratio(p.Zx, p.Zy)).toBeCloseTo(1, 12)
    expect(ratio(run('hexagon', dims({ a: R })).Zx, run('hexagon', dims({ a: R })).Zy)).not.toBeCloseTo(
      1,
      3,
    )
  })

  test('n = 4 is the square standing on its diagonal', () => {
    // Circumradius R gives side R√2, so the polygon engine must land on the
    // closed forms the square and the diamond are written from.
    const R = 100
    const side = R * Math.SQRT2
    const p = run('regularPolygon', dims({ a: R, n: 4 }))
    expect(ratio(p.A, side * side)).toBeCloseTo(1, 12)
    expect(ratio(p.Ix, side ** 4 / 12)).toBeCloseTo(1, 12)
    const diamond = run('squareDiamond', dims({ a: side }))
    expect(ratio(p.Ix, diamond.Ix)).toBeCloseTo(1, 12)
    expect(ratio(p.Zx, diamond.Zx)).toBeCloseTo(1, 12)
    expect(ratio(p.gross, diamond.gross)).toBeCloseTo(1, 12)
  })

  test('a polygon converges on the circle it is becoming', () => {
    const R = 100
    let last = 0
    for (const n of [12, 50, 500, 5000]) {
      const p = run('regularPolygon', dims({ a: R, n }))
      const err = Math.abs(p.Ix / ((Math.PI * R ** 4) / 4) - 1)
      // Monotone improvement, not just closeness at the end.
      if (last) expect(err, `n=${n}`).toBeLessThan(last)
      last = err
      expect(ratio(p.A, Math.PI * R * R), `n=${n}`).toBeCloseTo(1, n >= 500 ? 4 : 1)
    }
    const fine = run('regularPolygon', dims({ a: R, n: 5000 }))
    expect(ratio(fine.Ix, (Math.PI * R ** 4) / 4)).toBeCloseTo(1, 5)
    // And on the circle's plastic modulus, 4R³/3, and shape factor 16/3π.
    expect(ratio(fine.Zx, (4 * R ** 3) / 3)).toBeCloseTo(1, 4)
    expect(fine.Zx / (fine.Ix / fine.cBot)).toBeCloseTo(16 / (3 * Math.PI), 3)
  })

  test('an odd polygon is a vertex above and a flat below, so its fibres differ', () => {
    // n = 5: the top is R, the bottom R·cos(π/5). Not the same distance.
    const R = 100
    const p = run('regularPolygon', dims({ a: R, n: 5 }))
    expect(p.cTop).toBeCloseTo(R, 9)
    expect(p.cBot).toBeCloseTo(R * Math.cos(Math.PI / 5), 9)
    expect(p.cTop).toBeGreaterThan(p.cBot)
    // An even polygon has no such story to tell.
    expect(run('regularPolygon', dims({ a: R, n: 6 })).cTop).toBeCloseTo(
      run('regularPolygon', dims({ a: R, n: 6 })).cBot,
      9,
    )
    // Checked once more against strips, on a second odd case not in CASES.
    const numeric = numericFor('regularPolygon', dims({ a: R, n: 7 }))
    const seven = run('regularPolygon', dims({ a: R, n: 7 }))
    expect(ratio(seven.A, numeric.A)).toBeCloseTo(1, 4)
    expect(ratio(seven.cy, numeric.cy)).toBeCloseTo(1, 4)
    expect(ratio(seven.Ix, numeric.Ix)).toBeCloseTo(1, 4)
    expect(ratio(seven.Zx, numeric.Zx)).toBeCloseTo(1, 4)
  })

  test('the second moment of a regular polygon is the same about every axis', () => {
    // A real theorem, not an approximation — and the reason one I serves both.
    for (const n of [3, 5, 6, 7, 8, 13]) {
      const p = run('regularPolygon', dims({ a: 100, n }))
      expect(ratio(p.Ix, p.Iy), `n=${n}`).toBeCloseTo(1, 12)
    }
  })

  test('n = 3 is the equilateral triangle the triangle section already knows', () => {
    const R = 100
    const p = run('regularPolygon', dims({ a: R, n: 3 }))
    const base = R * Math.sqrt(3)
    const height = (3 * R) / 2
    const t = run('triangle', dims({ a: height, b: base }))
    expect(ratio(p.A, t.A)).toBeCloseTo(1, 12)
    expect(ratio(p.Ix, t.Ix)).toBeCloseTo(1, 12)
    expect(ratio(p.Zx, t.Zx)).toBeCloseTo(1, 10)
    expect(ratio(p.cy, t.cy)).toBeCloseTo(1, 12)
  })
})

describe('the cross', () => {
  test('two arms sharing a middle that is counted once', () => {
    const a = 300
    const b = 200
    const t = 40
    const p = run('cross', dims({ a, b, t1: t }))
    expect(p.A).toBeCloseTo(t * a + t * b - t * t, 9)
    expect(ratio(p.Ix, (t * a ** 3 + (b - t) * t ** 3) / 12)).toBeCloseTo(1, 12)
    expect(ratio(p.Iy, (t * b ** 3 + (a - t) * t ** 3) / 12)).toBeCloseTo(1, 12)
    // Doubly symmetric, so both equal-area axes are the centroidal ones.
    expect(p.cTop).toBeCloseTo(p.cBot, 12)
    expect(p.cy).toBeCloseTo(a / 2, 12)
    // Every re-entrant corner gives back what it took.
    expect(p.Po).toBeCloseTo(2 * (a + b), 12)
  })

  test('an arm as wide as the section is a solid rectangle', () => {
    const a = 300
    const b = 200
    const p = run('cross', dims({ a, b, t1: b }))
    expect(p.A).toBeCloseTo(a * b, 9)
    expect(ratio(p.Ix, (b * a ** 3) / 12)).toBeCloseTo(1, 12)
    expect(ratio(p.Iy, (a * b ** 3) / 12)).toBeCloseTo(1, 12)
    expect(ratio(p.Zx, (b * a ** 2) / 4)).toBeCloseTo(1, 12)
    expect(ratio(p.Zy, (a * b ** 2) / 4)).toBeCloseTo(1, 12)
    expect(p.Zx / (p.Ix / p.cBot)).toBeCloseTo(1.5, 12)
  })

  test('a cross with unequal arms, checked against strips', () => {
    const d = dims({ a: 250, b: 400, t1: 25 })
    const p = run('cross', d)
    const numeric = numericFor('cross', d)
    expect(ratio(p.A, numeric.A)).toBeCloseTo(1, 4)
    expect(ratio(p.Ix, numeric.Ix)).toBeCloseTo(1, 4)
    expect(ratio(p.Iy, numeric.Iy)).toBeCloseTo(1, 4)
    expect(ratio(p.Zx, numeric.Zx)).toBeCloseTo(1, 4)
    expect(ratio(p.Zy, numeric.Zy)).toBeCloseTo(1, 4)
  })
})

describe('the turned rectangle', () => {
  const a = 300
  const b = 150

  test('a rotation of zero reproduces the plain rectangle, exactly', () => {
    const p = run('rotatedRectangle', dims({ a, b, angle: 0 }))
    expect(p.A).toBe(a * b)
    expect(p.Ix).toBe((b * a ** 3) / 12)
    expect(p.Iy).toBe((a * b ** 3) / 12)
    expect(p.Zx).toBe((b * a ** 2) / 4)
    expect(p.Zy).toBe((a * b ** 2) / 4)
    expect(p.gross).toBe(a * b)
    expect(p.cy).toBe(a / 2)
    expect(p.cx).toBe(b / 2)
    expect(p.Zx / (p.Ix / p.cBot)).toBeCloseTo(1.5, 12)
  })

  test('a quarter turn swaps the two second moments and the envelope with them', () => {
    const flat = run('rotatedRectangle', dims({ a, b, angle: 0 }))
    const turned = run('rotatedRectangle', dims({ a, b, angle: 90 }))
    expect(ratio(turned.Ix, flat.Iy)).toBeCloseTo(1, 12)
    expect(ratio(turned.Iy, flat.Ix)).toBeCloseTo(1, 12)
    expect(ratio(turned.Zx, flat.Zy)).toBeCloseTo(1, 12)
    expect(ratio(turned.Zy, flat.Zx)).toBeCloseTo(1, 12)
    expect(turned.A).toBeCloseTo(flat.A, 9)
    expect(2 * turned.cx).toBeCloseTo(a, 9)
    expect(turned.cTop + turned.cBot).toBeCloseTo(b, 9)
    // 180° is the same section again, and the sign of the angle never matters.
    for (const angle of [180, -30, 30, 210]) {
      const p = run('rotatedRectangle', dims({ a, b, angle }))
      const mirror = run('rotatedRectangle', dims({ a, b, angle: Math.abs(angle) % 180 }))
      expect(ratio(p.Ix, mirror.Ix), `${angle}`).toBeCloseTo(1, 12)
      expect(ratio(p.Zx, mirror.Zx), `${angle}`).toBeCloseTo(1, 12)
    }
  })

  test('the rotation transform, at every angle, against strips', () => {
    for (const angle of [5, 15, 26.5651, 45, 63, 75, 85]) {
      const d = dims({ a, b, angle })
      const p = run('rotatedRectangle', d)
      const numeric = numericFor('rotatedRectangle', d)
      expect(ratio(p.A, numeric.A), `${angle}`).toBeCloseTo(1, 4)
      expect(ratio(p.Ix, numeric.Ix), `${angle}`).toBeCloseTo(1, 4)
      expect(ratio(p.Iy, numeric.Iy), `${angle}`).toBeCloseTo(1, 4)
      expect(ratio(p.Zx, numeric.Zx), `${angle}`).toBeCloseTo(1, 4)
      expect(ratio(p.Zy, numeric.Zy), `${angle}`).toBeCloseTo(1, 4)
      expect(ratio(p.cx, numeric.width / 2), `${angle}`).toBeCloseTo(1, 4)
      // The area never changes; only the box around it does.
      expect(p.A, `${angle}`).toBeCloseTo(a * b, 6)
      expect(p.gross, `${angle}`).toBeGreaterThan(a * b)
    }
  })

  test('the branch where the taper is bounded by the other pair of sides', () => {
    // Zx changes hands at a·cosθ = b·sinθ, i.e. θ = atan(a/b). Either side of it
    // a different pair of sides cuts the middle chord, and the two expressions
    // have to meet at the crossing without a step.
    const crossover = (Math.atan(a / b) * 180) / Math.PI
    const below = run('rotatedRectangle', dims({ a, b, angle: crossover - 1e-6 }))
    const above = run('rotatedRectangle', dims({ a, b, angle: crossover + 1e-6 }))
    expect(ratio(above.Zx, below.Zx)).toBeCloseTo(1, 6)
    expect(ratio(above.Zy, below.Zy)).toBeCloseTo(1, 6)
  })

  test('a square turned 45° is the diamond, by another route', () => {
    const s = 120
    const p = run('rotatedRectangle', dims({ a: s, b: s, angle: 45 }))
    const diamond = run('squareDiamond', dims({ a: s }))
    expect(ratio(p.A, diamond.A)).toBeCloseTo(1, 12)
    expect(ratio(p.Ix, diamond.Ix)).toBeCloseTo(1, 12)
    expect(ratio(p.Zx, diamond.Zx)).toBeCloseTo(1, 12)
    expect(ratio(p.gross, diamond.gross)).toBeCloseTo(1, 12)
    expect(ratio(2 * p.cx, s * Math.SQRT2)).toBeCloseTo(1, 12)
  })
})

describe('the square on its diagonal', () => {
  const a = 120

  test('the turn leaves Ix alone and takes half the plastic modulus with it', () => {
    const flat = run('square', dims({ a }))
    const p = run('squareDiamond', dims({ a }))
    // A square has Ix = Iy and Ixy = 0, so the rotation transform returns a⁴/12
    // at every angle. This is the anchor the whole section rests on.
    expect(ratio(p.Ix, flat.Ix)).toBeCloseTo(1, 12)
    expect(ratio(p.Ix, a ** 4 / 12)).toBeCloseTo(1, 12)
    expect(p.A).toBeCloseTo(flat.A, 9)
    expect(p.Po).toBeCloseTo(flat.Po, 12)
    // Zx falls from a³/4 to a³√2/6 = D³/12 with D = a√2 — a real loss, not a
    // rounding one, and the number a diamond is designed on.
    expect(ratio(p.Zx, (Math.SQRT2 * a ** 3) / 6)).toBeCloseTo(1, 12)
    expect(ratio(p.Zx, (a * Math.SQRT2) ** 3 / 12)).toBeCloseTo(1, 12)
    expect(p.Zx / flat.Zx).toBeCloseTo((2 * Math.SQRT2) / 3, 9)
    expect(p.Zx).toBeLessThan(flat.Zx)
  })

  test('the envelope grows to the diagonal, so half the box is air', () => {
    const p = run('squareDiamond', dims({ a }))
    expect(p.cTop + p.cBot).toBeCloseTo(a * Math.SQRT2, 9)
    expect(2 * p.cx).toBeCloseTo(a * Math.SQRT2, 9)
    expect(p.gross).toBeCloseTo(2 * a * a, 6)
    expect(ratio(p.A, p.gross)).toBeCloseTo(0.5, 9)
    // The diamond's shape factor, 2 — twice the square's 1.5.
    expect(p.Zx / (p.Ix / p.cBot)).toBeCloseTo(2, 9)
  })
})

describe('the hollow box', () => {
  const a = 300
  const b = 200

  test('the bore subtracts, term by term', () => {
    const t = 12
    const ai = a - 2 * t
    const bi = b - 2 * t
    const p = run('thinWalledRectangle', dims({ a, b, t1: t }))
    expect(p.A).toBeCloseTo(a * b - ai * bi, 9)
    expect(ratio(p.Ix, (b * a ** 3 - bi * ai ** 3) / 12)).toBeCloseTo(1, 12)
    expect(ratio(p.Iy, (a * b ** 3 - ai * bi ** 3) / 12)).toBeCloseTo(1, 12)
    expect(ratio(p.Zx, (b * a ** 2 - bi * ai ** 2) / 4)).toBeCloseTo(1, 12)
    expect(ratio(p.Zy, (a * b ** 2 - ai * bi ** 2) / 4)).toBeCloseTo(1, 12)
    expect(p.Po).toBeCloseTo(2 * (a + b), 12)
    expect(p.Pi).toBeCloseTo(2 * (ai + bi), 12)
    expect(p.gross).toBeCloseTo(a * b, 6)
    // A tube is stiffer per unit of material than the solid it came from.
    expect(p.Ix / p.A).toBeGreaterThan((b * a ** 3) / 12 / (a * b))
  })

  test('a wall thick enough to close the bore is the solid section', () => {
    // The bore closes at t₁ = min(a, b)/2, so a square section is where the wall
    // can be pushed furthest. Every property has to walk back to the solid one's.
    const a = 300
    const b = 300
    const solid = { A: a * b, Ix: (b * a ** 3) / 12, Zx: (b * a ** 2) / 4 }
    let last = Infinity
    for (const t of [40, 80, 120, 145, 149.9]) {
      const p = run('thinWalledRectangle', dims({ a, b, t1: t }))
      const err = Math.abs(p.Ix / solid.Ix - 1)
      expect(err, `t=${t}`).toBeLessThan(last)
      last = err
    }
    const nearly = run('thinWalledRectangle', dims({ a, b, t1: 149.9999 }))
    expect(ratio(nearly.A, solid.A)).toBeCloseTo(1, 5)
    expect(ratio(nearly.Ix, solid.Ix)).toBeCloseTo(1, 5)
    expect(ratio(nearly.Zx, solid.Zx)).toBeCloseTo(1, 5)
    expect(nearly.Zx / (nearly.Ix / nearly.cBot)).toBeCloseTo(1.5, 4)
    // A thin wall goes the other way: the shape factor of a box tends to 1.
    const thin = run('thinWalledRectangle', dims({ a, b, t1: 0.05 }))
    expect(thin.Zx / (thin.Ix / thin.cBot)).toBeLessThan(1.2)
  })

  test('a square tube, checked against strips at two thicknesses', () => {
    for (const t of [5, 60]) {
      const d = dims({ a: 250, b: 250, t1: t })
      const p = run('thinWalledRectangle', d)
      const numeric = numericFor('thinWalledRectangle', d)
      expect(ratio(p.A, numeric.A), `t=${t}`).toBeCloseTo(1, 4)
      expect(ratio(p.Ix, numeric.Ix), `t=${t}`).toBeCloseTo(1, 4)
      // Iy is where a hollow section catches a model that summed the two walls
      // into one strip, because ∫x²dx is not linear in the width.
      expect(ratio(p.Iy, numeric.Iy), `t=${t}`).toBeCloseTo(1, 4)
      expect(ratio(p.Zy, numeric.Zy), `t=${t}`).toBeCloseTo(1, 4)
      expect(ratio(p.Ix, p.Iy), `t=${t}`).toBeCloseTo(1, 12)
    }
  })
})

// ---------------------------------------------------------------------------
// Refusals.
// ---------------------------------------------------------------------------

/** The boxes each section actually reads, and therefore has to police. */
const REQUIRED: Record<Id, string[]> = {
  square: ['a'],
  triangle: ['a', 'b'],
  hexagon: ['a'],
  octagon: ['a'],
  regularPolygon: ['a'],
  cross: ['a', 'b', 't1'],
  rotatedRectangle: ['a', 'b'],
  squareDiamond: ['a'],
  thinWalledRectangle: ['a', 'b', 't1'],
}

describe('impossible input is refused, with the box to blame', () => {
  function throwsOn(id: Id, over: Partial<Dims>, field: string): void {
    let caught: unknown
    try {
      run(id, { ...CASES[id], ...over })
    } catch (error) {
      caught = error
    }
    expect(caught, `${id} accepted ${JSON.stringify(over)}`).toBeInstanceOf(ShapeError)
    const error = caught as ShapeError
    expect(error.fieldId, `${id} ${JSON.stringify(over)}`).toBe(field)
    expect(error.message.length).toBeGreaterThan(10)
  }

  test('NaN is caught by the finiteness guard, not by the magnitude one', () => {
    // Both comparisons are false for NaN, so a magnitude test on its own lets an
    // unparseable box straight through and every number downstream becomes NaN.
    expect(Number.NaN > 0).toBe(false)
    expect(Number.NaN <= 0).toBe(false)
    for (const id of IDS) {
      for (const field of REQUIRED[id]) throwsOn(id, { [field]: Number.NaN }, field)
    }
  })

  test.each(IDS)('%s: no dimension it reads may be zero, negative or infinite', (id) => {
    for (const field of REQUIRED[id]) {
      throwsOn(id, { [field]: 0 }, field)
      throwsOn(id, { [field]: -1 }, field)
      throwsOn(id, { [field]: Number.POSITIVE_INFINITY }, field)
      throwsOn(id, { [field]: Number.NEGATIVE_INFINITY }, field)
    }
  })

  test('a polygon needs at least three whole sides, and not too many', () => {
    for (const n of [Number.NaN, Number.POSITIVE_INFINITY, 0, 2, -6, 2.5, 6.5, 10_001]) {
      throwsOn('regularPolygon', { n }, 'n')
    }
    // Three is the limit, not an error.
    expect(() => run('regularPolygon', dims({ a: 100, n: 3 }))).not.toThrow()
    expect(() => run('regularPolygon', dims({ a: 100, n: 10_000 }))).not.toThrow()
  })

  test('a turned rectangle needs a real angle', () => {
    throwsOn('rotatedRectangle', { angle: Number.NaN }, 'angle')
    throwsOn('rotatedRectangle', { angle: Number.POSITIVE_INFINITY }, 'angle')
    // Any finite angle is a section, in either direction and past a full turn.
    for (const angle of [-720, -45, 0, 45, 90, 137, 360, 1000]) {
      expect(() => run('rotatedRectangle', dims({ a: 300, b: 150, angle })), `${angle}`).not.toThrow()
    }
  })

  test('a cross arm cannot be wider than the section it crosses', () => {
    throwsOn('cross', { a: 300, b: 200, t1: 201 }, 't1')
    throwsOn('cross', { a: 100, b: 200, t1: 150 }, 't1')
    // Equal is the limit — that is the solid rectangle above.
    expect(() => run('cross', dims({ a: 300, b: 200, t1: 200 }))).not.toThrow()
  })

  test('a box wall has to leave a bore', () => {
    throwsOn('thinWalledRectangle', { a: 300, b: 200, t1: 100 }, 't1')
    throwsOn('thinWalledRectangle', { a: 300, b: 200, t1: 150 }, 't1')
    throwsOn('thinWalledRectangle', { a: 300, b: 200, t1: 400 }, 't1')
    expect(() => run('thinWalledRectangle', dims({ a: 300, b: 200, t1: 99.999 }))).not.toThrow()
  })

  test('a section only reads the dimensions it has', () => {
    // Garbage in a box a section ignores cannot stop it answering.
    const junk = { t1: Number.NaN, t2: Number.NaN, n: Number.NaN, angle: Number.NaN }
    expect(() => run('square', dims({ a: 100, ...junk }))).not.toThrow()
    expect(() => run('triangle', dims({ a: 100, b: 80, ...junk }))).not.toThrow()
    expect(() => run('hexagon', dims({ a: 100, ...junk }))).not.toThrow()
    expect(() => run('octagon', dims({ a: 100, ...junk }))).not.toThrow()
    expect(() => run('squareDiamond', dims({ a: 100, ...junk }))).not.toThrow()
    expect(() => run('regularPolygon', dims({ a: 100, ...junk, n: 5 }))).not.toThrow()
    expect(() => run('cross', dims({ a: 300, b: 200, t1: 40, t2: Number.NaN, n: Number.NaN, angle: Number.NaN }))).not.toThrow()
    expect(() =>
      run('thinWalledRectangle', dims({ a: 300, b: 200, t1: 12, t2: Number.NaN, n: Number.NaN, angle: Number.NaN })),
    ).not.toThrow()
    expect(() =>
      run('rotatedRectangle', dims({ a: 300, b: 150, angle: 30, t1: Number.NaN, t2: Number.NaN, n: Number.NaN })),
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
    // because the number itself checks out. The three polygons share a body and
    // are told apart by the strings they are handed.
    const printed = new Set(IDS.map((id) => JSON.stringify(run(id).formulas)))
    expect(printed.size).toBe(IDS.length)
  })
})

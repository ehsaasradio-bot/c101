import { describe, expect, test } from 'vitest'
import { IBEAM_SHAPES } from './shapes-ibeam'
import { ShapeError } from './shapes'
import type { Dims, Primitives } from './shapes'

/**
 * Every closed form in shapes-ibeam.ts is checked against NUMERICAL
 * INTEGRATION — a fine grid of strips summed straight through a width-at-height
 * function written here, from the dimensions, sharing not one line with the
 * implementation. A transposed exponent, a parallel-axis shift applied the wrong
 * way, or a taper running from the wrong face survives one of the two and never
 * both.
 *
 * On top of that sit the classical degeneracies, which catch the errors an
 * integration would agree with because it was told the same wrong shape: an
 * I-beam whose web fills its flange has to become a solid rectangle, a taper of
 * zero degrees has to reproduce the untapered section exactly, and a tee's
 * centroid has to sit above mid-depth.
 */

const dims = (over: Partial<Dims> = {}): Dims => ({
  a: 300,
  b: 150,
  t1: 12,
  t2: 20,
  n: 1,
  angle: 0,
  ...over,
})

const IDS = ['iBeam', 'taperedIBeam', 'unequalIBeam', 'teeBeam', 'taperedTeeBeam'] as const
type Id = (typeof IDS)[number]

/** One representative of each section, all five genuinely different shapes. */
const CASES: Record<Id, Dims> = {
  iBeam: dims(),
  taperedIBeam: dims({ angle: 8 }),
  // A bottom flange narrower than the top: asymmetric about mid-depth on purpose.
  unequalIBeam: dims({ n: 0.6 }),
  // Flange heavier than the stem, which drives the centroid high and pushes the
  // equal-area axis up inside the flange.
  teeBeam: dims({ a: 200, b: 200, t1: 10, t2: 40 }),
  taperedTeeBeam: dims({ a: 200, b: 200, t1: 10, t2: 40, angle: 12 }),
}

const run = (id: Id, d: Dims = CASES[id]): Primitives => IBEAM_SHAPES[id](d)

// ---------------------------------------------------------------------------
// The independent model.
// ---------------------------------------------------------------------------

/**
 * Width of the section at height y above the bottom fibre.
 *
 * Written from what the dimensions MEAN — a is the depth, b the flange width,
 * t₁ the web, t₂ the flange thickness, θ the angle the flange's inner face
 * slopes away from its root — and from nothing in shapes-ibeam.ts. This is the
 * whole of the second opinion; everything below is arithmetic on top of it.
 */
function widthAt(id: Id, d: Dims, y: number): number {
  const { a, b, t1, t2, n, angle } = d
  const tan = Math.tan((angle * Math.PI) / 180)
  const overhang = (b - t1) / 2
  // How far the inner face has fallen by the time it reaches the tip.
  const drop = overhang * tan

  /** Width of a tapering flange at `depth` below its own flat outer face. */
  const tapered = (depth: number): number =>
    depth >= t2 - drop ? t1 + (2 * (t2 - depth)) / tan : b

  switch (id) {
    case 'iBeam':
      return y < t2 || y > a - t2 ? b : t1
    case 'unequalIBeam':
      return y < t2 ? n * b : y > a - t2 ? b : t1
    case 'teeBeam':
      return y > a - t2 ? b : t1
    case 'taperedIBeam':
      if (y < t2) return tapered(y)
      if (y > a - t2) return tapered(a - y)
      return t1
    case 'taperedTeeBeam':
      return y > a - t2 ? tapered(a - y) : t1
  }
}

/**
 * Enough strips that the only error left is the sliver of one strip that
 * straddles a step in the outline — parts in ten million on these sections.
 */
const STRIPS = 600_000

/** Sum f(y, w)·dy up the depth, midpoint rule. */
function integrate(id: Id, d: Dims, f: (y: number, w: number) => number): number {
  const dy = d.a / STRIPS
  let total = 0
  for (let i = 0; i < STRIPS; i++) {
    const y = (i + 0.5) * dy
    total += f(y, widthAt(id, d, y)) * dy
  }
  return total
}

interface Numeric {
  A: number
  cy: number
  Ix: number
  Iy: number
  Zx: number
  Zy: number
}

function byIntegration(id: Id, d: Dims): Numeric {
  const A = integrate(id, d, (_, w) => w)
  const cy = integrate(id, d, (y, w) => y * w) / A
  // Centred on the spot rather than taken about the base and shifted, so the
  // answer never rests on two large numbers nearly cancelling.
  const Ix = integrate(id, d, (y, w) => (y - cy) ** 2 * w)
  // A strip is a horizontal segment of length w centred on the vertical axis,
  // so it contributes ∫x² dx = w³/12 to Iy and 2·(w/2)(w/4) = w²/4 to Zy.
  const Iy = integrate(id, d, (_, w) => w ** 3 / 12)
  const Zy = integrate(id, d, (_, w) => w ** 2 / 4)

  // The equal-area axis, found by walking the same strips: the height with half
  // the material below it. Σ A|y − y₀| is stationary there, so an error of a
  // fraction of a strip in the axis costs second order and nothing in Zx.
  const dy = d.a / STRIPS
  let below = 0
  let yp = 0
  for (let i = 0; i < STRIPS; i++) {
    const y = (i + 0.5) * dy
    const w = widthAt(id, d, y)
    if (below + w * dy >= A / 2) {
      yp = y - dy / 2 + (w === 0 ? 0 : (A / 2 - below) / w)
      break
    }
    below += w * dy
  }
  const Zx = integrate(id, d, (y, w) => Math.abs(y - yp) * w)

  return { A, cy, Ix, Iy, Zx, Zy }
}

/** Computed once per section — six integrations each is not free. */
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
  test('exports exactly the five sections, and each is a function', () => {
    expect(Object.keys(IBEAM_SHAPES)).toEqual([...IDS])
    for (const id of IDS) expect(typeof IBEAM_SHAPES[id]).toBe('function')
  })
})

describe.each(IDS)('%s, against a sum of strips', (id) => {
  const p = run(id)
  const numeric = NUMERIC[id]

  test('area', () => {
    expect(ratio(p.A, numeric.A)).toBeCloseTo(1, 4)
  })

  test('centroid', () => {
    expect(ratio(p.cy, numeric.cy)).toBeCloseTo(1, 4)
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
    }
    expect(Object.keys(p.formulas).sort()).toEqual(['A', 'Ix', 'Iy', 'Zx', 'Zy'])
  })

  test.each(IDS)('%s: the extreme-fibre distances span the section', (id) => {
    const p = run(id)
    const d = CASES[id]
    // cTop and cBot bracket the depth, cLeft and cRight the envelope width.
    expect(p.cTop + p.cBot).toBeCloseTo(d.a, 9)
    expect(p.cBot).toBeCloseTo(p.cy, 12)
    expect(p.cLeft + p.cRight).toBeCloseTo(2 * p.cx, 12)
    expect(p.cTop).toBeGreaterThan(0)
    expect(p.cBot).toBeGreaterThan(0)
    // All five are symmetric left to right, so the vertical axis splits the box.
    expect(p.cLeft).toBeCloseTo(p.cRight, 12)
  })

  test.each(IDS)('%s: gross is the bounding envelope and Pi is zero', (id) => {
    const p = run(id)
    const d = CASES[id]
    const width = 2 * p.cx
    expect(p.gross).toBeCloseTo(d.a * width, 6)
    // Material has to fit inside the box that bounds it, and leave some air.
    expect(p.A).toBeLessThan(p.gross)
    // None of these has a bore; the voids are open notches, not holes.
    expect(p.Pi).toBe(0)
    expect(p.Po).toBeGreaterThan(0)
  })
})

describe('the classical degeneracies', () => {
  const a = 300
  const b = 150

  test('an I-beam whose web fills the flange is a solid rectangle', () => {
    const p = run('iBeam', dims({ a, b, t1: b, t2: 20 }))
    expect(p.A).toBeCloseTo(a * b, 6)
    expect(ratio(p.Ix, (b * a ** 3) / 12)).toBeCloseTo(1, 12)
    expect(ratio(p.Iy, (a * b ** 3) / 12)).toBeCloseTo(1, 12)
    expect(ratio(p.Zx, (b * a ** 2) / 4)).toBeCloseTo(1, 12)
    expect(ratio(p.Zy, (a * b ** 2) / 4)).toBeCloseTo(1, 12)
    expect(p.cy).toBeCloseTo(a / 2, 9)
    expect(p.cTop).toBeCloseTo(p.cBot, 9)
    expect(p.Po).toBeCloseTo(2 * (a + b), 9)
    expect(p.gross).toBeCloseTo(a * b, 6)
    // And with it the shape factor every textbook quotes for a rectangle.
    expect(p.Zx / (p.Ix / p.cBot)).toBeCloseTo(1.5, 9)
  })

  test('a tapered I-beam with no overhang has nowhere to taper', () => {
    // t₁ = b closes the overhang, so the angle can be anything at all and the
    // section is still that same solid rectangle.
    for (const angle of [0, 5, 30, 60, 89]) {
      const p = run('taperedIBeam', dims({ a, b, t1: b, t2: 20, angle }))
      expect(ratio(p.Ix, (b * a ** 3) / 12)).toBeCloseTo(1, 12)
      expect(ratio(p.Zx, (b * a ** 2) / 4)).toBeCloseTo(1, 12)
    }
  })

  test('a taper of zero degrees reproduces the untapered section exactly', () => {
    const base = dims({ a, b, t1: 12, t2: 20 })
    expect(numbersOf(run('taperedIBeam', { ...base, angle: 0 }))).toEqual(
      numbersOf(run('iBeam', base)),
    )
    const tee = dims({ a: 200, b: 200, t1: 10, t2: 40 })
    expect(numbersOf(run('taperedTeeBeam', { ...tee, angle: 0 }))).toEqual(
      numbersOf(run('teeBeam', tee)),
    )
  })

  test('an unequal I-beam with n = 1 is the symmetric one', () => {
    const base = dims({ a, b, t1: 12, t2: 20 })
    expect(numbersOf(run('unequalIBeam', { ...base, n: 1 }))).toEqual(
      numbersOf(run('iBeam', base)),
    )
  })

  test('the symmetric sections put the centroid at mid-depth', () => {
    for (const id of ['iBeam', 'taperedIBeam'] as const) {
      const p = run(id)
      expect(p.cy).toBeCloseTo(CASES[id].a / 2, 9)
      expect(p.cTop).toBeCloseTo(p.cBot, 9)
    }
  })
})

describe('the asymmetry that makes a tee a tee', () => {
  test('a heavy flange carries the centroid well above mid-depth', () => {
    // a = 200, b = 200, t₁ = 10, t₂ = 40, in millimetres.
    // A_w = 10·160 = 1600 at ȳ = 80; A_f = 200·40 = 8000 at ȳ = 180.
    // c_y = (1600·80 + 8000·180) / 9600 = 1,568,000 / 9600 = 163.333…
    const p = run('teeBeam')
    expect(p.A).toBeCloseTo(9600, 9)
    expect(p.cy).toBeGreaterThan(100)
    expect(p.cy).toBeCloseTo(163.3333333333, 8)
    expect(p.cBot).toBeCloseTo(163.3333333333, 8)
    expect(p.cTop).toBeCloseTo(36.6666666667, 8)
    // The two are not interchangeable, and neither is a/2.
    expect(Math.abs(p.cTop - p.cBot)).toBeGreaterThan(100)
  })

  test('a tee sits above mid-depth for every flange wider than its stem', () => {
    // c_y − a/2 = [A_f(a − t₂) − A_w t₂] / 2A, which is positive exactly when
    // b > t₁. So it is not a property of one worked example — it is the shape.
    for (const t2 of [2, 5, 10, 25, 60, 120]) {
      for (const b of [30, 60, 150]) {
        const p = run('teeBeam', dims({ a: 300, b, t1: 12, t2 }))
        expect(p.cy, `b=${b} t2=${t2}`).toBeGreaterThan(150)
      }
    }
    // And exactly at mid-depth in the limit where the stem fills the flange.
    expect(run('teeBeam', dims({ a: 300, b: 12, t1: 12, t2: 30 })).cy).toBeCloseTo(150, 9)
  })

  test('the two elastic moduli of a tee genuinely differ', () => {
    const p = run('teeBeam')
    const top = p.Ix / p.cTop
    const bot = p.Ix / p.cBot
    // Ix / c to the stem is a quarter of the value to the flange. Reading the
    // wrong one — or assuming a/2 — is the error a designer gets hurt by.
    expect(top / bot).toBeGreaterThan(4)
  })

  test('the plastic modulus beats the governing elastic one, on all five', () => {
    for (const id of IDS) {
      const p = run(id)
      // First yield is reached at the fibre furthest from the centroid, so the
      // elastic modulus that governs is Ix over the LONGER of the two arms.
      const Sx = p.Ix / Math.max(p.cTop, p.cBot)
      expect(p.Zx, id).toBeGreaterThan(Sx)
      // And a shape factor in the range real sections live in.
      expect(p.Zx / Sx, id).toBeLessThan(2.5)
    }
  })

  test('the equal-area axis is not the centroid, and using the centroid overstates Zx', () => {
    // Σ A|y − y₀| is minimised at the median of the area, which is the
    // equal-area axis. So taking the first moments about the centroid instead
    // returns a LARGER number — an unconservative Zx, the worst direction for a
    // wrong answer to be wrong in.
    const p = run('teeBeam')
    const d = CASES.teeBeam
    const aboutCentroid = integrate('teeBeam', d, (y, w) => Math.abs(y - p.cy) * w)
    expect(p.Zx).toBeLessThan(aboutCentroid)
    expect(aboutCentroid / p.Zx).toBeGreaterThan(1.1)

    // The symmetric sections are the case where the two axes do coincide.
    const sym = run('iBeam')
    const symAboutCentroid = integrate('iBeam', CASES.iBeam, (y, w) => Math.abs(y - sym.cy) * w)
    expect(ratio(sym.Zx, symAboutCentroid)).toBeCloseTo(1, 4)
  })

  test('an unequal I-beam is asymmetric about mid-depth', () => {
    const p = run('unequalIBeam')
    // The bottom flange is 0.6 of the top, so the centroid rises above a/2.
    expect(p.cy).toBeGreaterThan(CASES.unequalIBeam.a / 2)
    expect(p.cTop).not.toBeCloseTo(p.cBot, 3)
    // Flip which flange is the wide one and the centroid drops the other side.
    const flipped = run('unequalIBeam', dims({ n: 1 / 0.6 }))
    expect(flipped.cy).toBeLessThan(CASES.unequalIBeam.a / 2)
  })

  test('a bottom flange wider than the top widens the envelope', () => {
    // n > 1 makes the bottom flange the widest thing in the section, so the
    // bounding box is a × nb — gross has to follow the section, not the label.
    const d = dims({ a: 300, b: 150, t1: 12, t2: 20, n: 1.4 })
    const p = run('unequalIBeam', d)
    expect(2 * p.cx).toBeCloseTo(1.4 * 150, 9)
    expect(p.gross).toBeCloseTo(300 * 1.4 * 150, 6)
    expect(p.A).toBeLessThan(p.gross)
  })
})

describe('worked arithmetic, done by hand', () => {
  test('the I-beam matches the closed forms printed beside it', () => {
    // a = 300, b = 150, t₁ = 12, t₂ = 20.
    // A  = 2·150·20 + 12·260 = 6000 + 3120 = 9120
    // Ix = [150·300³ − 138·260³] / 12 = [4.05×10⁹ − 2.4255×10⁹] / 12
    const { a, b, t1, t2 } = CASES.iBeam
    const p = run('iBeam')
    expect(p.A).toBeCloseTo(9120, 9)
    expect(ratio(p.A, 2 * b * t2 + t1 * (a - 2 * t2))).toBeCloseTo(1, 12)
    expect(ratio(p.Ix, (b * a ** 3 - (b - t1) * (a - 2 * t2) ** 3) / 12)).toBeCloseTo(1, 12)
    expect(ratio(p.Iy, (2 * t2 * b ** 3 + (a - 2 * t2) * t1 ** 3) / 12)).toBeCloseTo(1, 12)
    expect(ratio(p.Zx, b * t2 * (a - t2) + (t1 * (a - 2 * t2) ** 2) / 4)).toBeCloseTo(1, 12)
    expect(ratio(p.Zy, (t2 * b ** 2) / 2 + ((a - 2 * t2) * t1 ** 2) / 4)).toBeCloseTo(1, 12)
    expect(p.Zx).toBeCloseTo(1_042_800, 6)
    // Outline: 2b across the top and bottom, four flange edges, two web edges,
    // and the two steps in and out — 4b + 2a − 2t₁.
    expect(p.Po).toBeCloseTo(4 * b + 2 * a - 2 * t1, 9)
  })

  test('the tee matches the closed forms printed beside it', () => {
    // a = 200, b = 200, t₁ = 10, t₂ = 40. A = 8000 + 1600 = 9600.
    const { a, b, t1, t2 } = CASES.teeBeam
    const p = run('teeBeam')
    const A = b * t2 + t1 * (a - t2)
    const cy = (t1 * (a - t2) ** 2 / 2 + b * t2 * (a - t2 / 2)) / A
    const Ix =
      (t1 * (a - t2) ** 3) / 12 +
      t1 * (a - t2) * (cy - (a - t2) / 2) ** 2 +
      (b * t2 ** 3) / 12 +
      b * t2 * (a - t2 / 2 - cy) ** 2

    expect(p.A).toBeCloseTo(A, 9)
    expect(p.cy).toBeCloseTo(cy, 9)
    expect(ratio(p.Ix, Ix)).toBeCloseTo(1, 12)
    expect(p.Ix).toBeCloseTo(17_813_333.3333, 3)
    expect(ratio(p.Iy, (t2 * b ** 3 + (a - t2) * t1 ** 3) / 12)).toBeCloseTo(1, 12)
    expect(p.Iy).toBeCloseTo(26_680_000, 6)
    expect(ratio(p.Zy, (t2 * b ** 2) / 4 + ((a - t2) * t1 ** 2) / 4)).toBeCloseTo(1, 12)
    expect(p.Zy).toBeCloseTo(404_000, 6)
    // Outline: stem bottom 10, two stem sides 320, flange underside 190, two
    // flange sides 80, flange top 200.
    expect(p.Po).toBeCloseTo(800, 9)
    expect(p.gross).toBeCloseTo(40_000, 6)
  })

  test('a flange-heavy tee puts the equal-area axis inside the flange', () => {
    // A/2 = 4800 and the flange holds 8000, so the axis lies 4800/200 = 24 mm
    // below the top fibre — at y = 176, up inside the flange and 12.7 mm above
    // the centroid at 163.33.
    const { a, b, t1, t2 } = CASES.teeBeam
    const p = run('teeBeam')
    const A = b * t2 + t1 * (a - t2)
    const d = A / (2 * b)
    expect(d).toBeLessThan(t2)
    const Zx =
      (b * d ** 2) / 2 +
      (b * (t2 - d) ** 2) / 2 +
      t1 * (a - t2) * ((a - t2) / 2 + t2 - d)
    expect(ratio(p.Zx, Zx)).toBeCloseTo(1, 12)
    expect(p.Zx).toBeCloseTo(236_800, 6)
    expect(a - d).toBeGreaterThan(p.cy)
    expect(p.formulas.Zx).toContain('d = A/2b')
  })

  test('a stem-heavy tee puts the equal-area axis down in the stem', () => {
    // a = 300, b = 100, t₁ = 20, t₂ = 10. A = 1000 + 5800 = 6800, and the flange
    // holds well under half, so the axis drops to y_p = 6800/40 = 170.
    const d = dims({ a: 300, b: 100, t1: 20, t2: 10 })
    const p = run('teeBeam', d)
    const A = d.b * d.t2 + d.t1 * (d.a - d.t2)
    const yp = A / (2 * d.t1)
    expect(A).toBeCloseTo(6800, 9)
    expect(yp).toBeLessThan(d.a - d.t2)
    const Zx =
      (d.t1 * yp ** 2) / 2 +
      (d.t1 * (d.a - d.t2 - yp) ** 2) / 2 +
      d.b * d.t2 * (d.a - d.t2 / 2 - yp)
    expect(ratio(p.Zx, Zx)).toBeCloseTo(1, 12)
    expect(p.Zx).toBeCloseTo(558_000, 6)
    // The other branch of the algebra, and the other branch of the printout.
    expect(p.formulas.Zx).toContain('y_p = A/2t₁')
    // Checked once more against strips, since this case is not in CASES.
    const numeric = byIntegration('teeBeam', d)
    expect(ratio(p.Zx, numeric.Zx)).toBeCloseTo(1, 4)
    expect(ratio(p.Ix, numeric.Ix)).toBeCloseTo(1, 4)
    expect(ratio(p.cy, numeric.cy)).toBeCloseTo(1, 4)
  })

  test('the tapered I-beam loses exactly the material the taper cuts away', () => {
    // Each flange gives up two triangles of base (b − t₁)/2 and height Δ, so
    // A = 2bt₂ + t₁(a − 2t₂) − (b − t₁)Δ.
    const { a, b, t1, t2, angle } = CASES.taperedIBeam
    const drop = ((b - t1) / 2) * Math.tan((angle * Math.PI) / 180)
    const p = run('taperedIBeam')
    expect(ratio(p.A, 2 * b * t2 + t1 * (a - 2 * t2) - (b - t1) * drop)).toBeCloseTo(1, 12)
    // Less material than the untapered beam, and less stiffness with it.
    const plain = run('iBeam', dims({ a, b, t1, t2 }))
    expect(p.A).toBeLessThan(plain.A)
    expect(p.Ix).toBeLessThan(plain.Ix)
    // But the same envelope and the same perimeter endpoints.
    expect(p.gross).toBeCloseTo(plain.gross, 6)
    expect(p.cy).toBeCloseTo(a / 2, 9)
  })

  test('the tapered tee loses half as much, having half as many flanges', () => {
    const { a, b, t1, t2, angle } = CASES.taperedTeeBeam
    const drop = ((b - t1) / 2) * Math.tan((angle * Math.PI) / 180)
    const p = run('taperedTeeBeam')
    expect(ratio(p.A, b * t2 + t1 * (a - t2) - ((b - t1) * drop) / 2)).toBeCloseTo(1, 12)
    const plain = run('teeBeam', dims({ a, b, t1, t2 }))
    expect(p.A).toBeLessThan(plain.A)
    // Thinning the flange tips pulls the centroid down towards the stem.
    expect(p.cy).toBeLessThan(plain.cy)
    expect(p.cy).toBeGreaterThan(a / 2)
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
    for (const id of IDS) {
      throwsOn(id, { a: Number.NaN }, 'a')
      throwsOn(id, { b: Number.NaN }, 'b')
      throwsOn(id, { t1: Number.NaN }, 't1')
      throwsOn(id, { t2: Number.NaN }, 't2')
    }
  })

  test.each(IDS)('%s: no dimension may be zero or negative', (id) => {
    throwsOn(id, { a: 0 }, 'a')
    throwsOn(id, { a: -1 }, 'a')
    throwsOn(id, { b: 0 }, 'b')
    throwsOn(id, { b: -150 }, 'b')
    throwsOn(id, { t1: 0 }, 't1')
    throwsOn(id, { t1: -12 }, 't1')
    throwsOn(id, { t2: 0 }, 't2')
    throwsOn(id, { t2: -20 }, 't2')
    throwsOn(id, { a: Number.POSITIVE_INFINITY }, 'a')
  })

  test.each(IDS)('%s: the web may not be wider than the flange', (id) => {
    const { b } = CASES[id]
    throwsOn(id, { t1: b + 1 }, 't1')
    throwsOn(id, { t1: b * 10 }, 't1')
    // Equal is the limit, not an error — that is the solid rectangle above.
    // n = 1 so the unequal beam's other flange is wide enough to take the web.
    expect(() => run(id, dims({ ...CASES[id], t1: b, n: 1 }))).not.toThrow()
  })

  test('an unequal I-beam blames the multiplier when the bottom flange is the narrow one', () => {
    // The web already fits under the top flange, so the box to fix is n.
    throwsOn('unequalIBeam', { b: 150, t1: 150, n: 0.6 }, 'n')
  })

  test('two flanges have to leave a web between them', () => {
    for (const id of ['iBeam', 'taperedIBeam', 'unequalIBeam'] as const) {
      const { a } = CASES[id]
      throwsOn(id, { t2: a / 2 }, 't2')
      throwsOn(id, { t2: a }, 't2')
      throwsOn(id, { t2: a * 2 }, 't2')
    }
  })

  test('one flange only has to leave a stem, so the two-flange limit is not applied to a tee', () => {
    for (const id of ['teeBeam', 'taperedTeeBeam'] as const) {
      const { a } = CASES[id]
      throwsOn(id, { t2: a }, 't2')
      throwsOn(id, { t2: a * 1.5 }, 't2')
      // A flange deeper than half the section is unusual, not impossible, and
      // refusing it would reject a buildable tee.
      const p = run(id, dims({ ...CASES[id], t2: a * 0.6, angle: 0 }))
      expect(p.A).toBeGreaterThan(0)
      expect(p.cTop).toBeGreaterThan(0)
      expect(p.cBot).toBeGreaterThan(0)
    }
  })

  test('the taper angle has to be a real angle the flange can survive', () => {
    for (const id of ['taperedIBeam', 'taperedTeeBeam'] as const) {
      throwsOn(id, { angle: Number.NaN }, 'angle')
      throwsOn(id, { angle: -1 }, 'angle')
      throwsOn(id, { angle: 90 }, 'angle')
      throwsOn(id, { angle: 180 }, 'angle')
      // Steep enough that the flange runs out before it reaches the tip, which
      // would leave a section narrower than the b it was asked for.
      throwsOn(id, { angle: 60 }, 'angle')
    }
    // A taper that arrives at the tip with exactly nothing left is the limit,
    // and still a section.
    const d = dims({ a: 300, b: 150, t1: 12, t2: 20 })
    const angle = (Math.atan(d.t2 / ((d.b - d.t1) / 2)) * 180) / Math.PI
    const p = run('taperedIBeam', { ...d, angle })
    expect(p.A).toBeGreaterThan(0)
    expect(Number.isFinite(p.Ix)).toBe(true)
  })

  test('the unequal I-beam needs a bottom flange that exists', () => {
    throwsOn('unequalIBeam', { n: 0 }, 'n')
    throwsOn('unequalIBeam', { n: -0.6 }, 'n')
    throwsOn('unequalIBeam', { n: Number.NaN }, 'n')
    throwsOn('unequalIBeam', { n: Number.POSITIVE_INFINITY }, 'n')
    // And one at least as wide as the web that stands on it.
    throwsOn('unequalIBeam', { b: 150, t1: 12, n: 0.05 }, 'n')
  })

  test('a section only reads the dimensions it has', () => {
    // n means nothing to an I-beam, angle means nothing to a plain tee, so
    // garbage in either box cannot stop them answering — the same courtesy the
    // rectangle and the circle already get from the boxes they ignore.
    expect(() => run('iBeam', dims({ n: Number.NaN, angle: Number.NaN }))).not.toThrow()
    expect(() => run('teeBeam', dims({ a: 200, b: 200, t1: 10, t2: 40, n: -5, angle: Number.NaN })))
      .not.toThrow()
    expect(() => run('taperedIBeam', dims({ n: Number.NaN, angle: 8 }))).not.toThrow()
    expect(() =>
      run('taperedTeeBeam', dims({ a: 200, b: 200, t1: 10, t2: 40, n: Number.NaN, angle: 12 })),
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

  test('the asymmetric sections say where their axes are', () => {
    // The two things a designer has to know about a tee, in the working itself.
    expect(run('teeBeam').formulas.Ix).toContain('c_y')
    expect(run('taperedTeeBeam').formulas.Zx).toContain('y_p')
    expect(run('unequalIBeam').formulas.Zx).toContain('equal-area axis')
    expect(run('unequalIBeam').formulas.Ix).toContain('not a/2')
    // And the symmetric ones say why they are allowed the shortcut.
    expect(run('iBeam').formulas.Zx).toContain('mid-depth')
    expect(run('taperedIBeam').formulas.Zx).toContain('symmetry')
  })
})

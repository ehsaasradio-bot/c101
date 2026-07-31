import { describe, expect, test } from 'vitest'
import compute, { lawOfCosinesCentralAngle } from './compute'
import { fields } from './fields'
import def from './index'
import { CalcError } from '../../../lib/types'

type Values = Parameters<typeof compute>[0]
type Result = ReturnType<typeof compute>
type Over = Partial<Record<string, number | string>>

const R = 6371.0088 // the same mean Earth radius compute names, restated here on purpose

const DEFAULTS = Object.fromEntries(fields.map((f) => [f.id, f.default])) as unknown as Values

const at = (over: Over): Result => compute({ ...DEFAULTS, ...over } as Values)

const primary = (r: Result) => Number(r.primary.value)
const stat = (r: Result, label: string) => r.stats!.find((s) => s.label === label)!.value
const statNum = (r: Result, label: string) => Number(stat(r, label))

/**
 * The independent second opinion: the SPHERICAL LAW OF COSINES, a different
 * formula for the same central angle. It is not a rearrangement of haversine —
 * it comes from the dot product of the two unit position vectors — so agreement
 * between the two is real evidence rather than the code confirming itself.
 */
const byLawOfCosines = (lat1: number, lon1: number, lat2: number, lon2: number) =>
  R * lawOfCosinesCentralAngle(lat1, lon1, lat2, lon2)

const gc = (lat1: number, lon1: number, lat2: number, lon2: number) =>
  at({ mode: 'greatCircle', lat1, lon1, lat2, lon2 })

describe('distance calculator — great circle (the default mode)', () => {
  test('the headline at the defaults is New York to London, 5,570 km / 3,461 miles', () => {
    const r = at({})

    // ANCHOR: published city-pair tables give New York (40.7128, -74.0060) to
    // London (51.5074, -0.1278) as 5,570 km / 3,461 miles. We land on it.
    expect(primary(r)).toBeCloseTo(5570.229874, 5)
    expect(Math.round(primary(r))).toBe(5570)
    expect(Math.round(statNum(r, 'Distance in miles'))).toBe(3461)

    // CONFIRMATION 1 — a different formula for the same quantity.
    expect(primary(r)).toBeCloseTo(byLawOfCosines(40.7128, -74.006, 51.5074, -0.1278), 9)

    // CONFIRMATION 2 — the central angle and the radius must reproduce the arc,
    // and the chord must satisfy the independent identity chord = 2R sin(c/2).
    const c = (statNum(r, 'Central angle') * Math.PI) / 180
    expect(R * c).toBeCloseTo(primary(r), 9)
    expect(statNum(r, 'Straight chord through the Earth')).toBeCloseTo(2 * R * Math.sin(c / 2), 9)
    expect(statNum(r, 'Straight chord through the Earth')).toBeLessThan(primary(r))

    // Unit conversions are exact definitions, not approximations.
    expect(statNum(r, 'Distance in miles') * 1.609344).toBeCloseTo(primary(r), 9)
    expect(statNum(r, 'Distance in nautical miles') * 1.852).toBeCloseTo(primary(r), 9)

    // A great circle is not a constant heading, so the two bearings differ.
    expect(statNum(r, 'Initial bearing from A')).toBeCloseTo(51.212617, 5)
    expect(statNum(r, 'Final bearing at B')).toBeCloseTo(108.329702, 5)
    expect(r.primary.format).toEqual({ style: 'decimal', decimals: 2, unit: 'km' })
  })

  test('published city pairs are reproduced to well within a percent', () => {
    // Each published figure is the round number the reference tables print.
    const anchors: ReadonlyArray<readonly [string, number, number, number, number, number]> = [
      ['New York – London', 40.7128, -74.006, 51.5074, -0.1278, 5570],
      ['Paris – Berlin', 48.8566, 2.3522, 52.52, 13.405, 878],
      ['Sydney – Los Angeles', -33.8688, 151.2093, 34.0522, -118.2437, 12073],
      ['Tokyo – Honolulu', 35.6895, 139.6917, 21.3069, -157.8583, 6205],
      ['Cape Town – Buenos Aires', -33.9249, 18.4241, -34.6037, -58.3816, 6870],
    ]

    for (const [name, lat1, lon1, lat2, lon2, published] of anchors) {
      const got = primary(gc(lat1, lon1, lat2, lon2))
      // Within 0.1% of the published spherical figure.
      expect(Math.abs(got - published) / published, name).toBeLessThan(0.001)
      // And the law of cosines agrees with our haversine to floating-point noise.
      expect(got, name).toBeCloseTo(byLawOfCosines(lat1, lon1, lat2, lon2), 8)
    }
  })

  // ── THE ANTIMERIDIAN ─────────────────────────────────────────────────────
  test('179° to −179° is two degrees, not 358 — the classic great-circle bug', () => {
    const r = gc(0, 179, 0, -179)

    // Two degrees of arc on the equator: R × 2° in radians.
    const twoDegrees = R * 2 * (Math.PI / 180)
    expect(primary(r)).toBeCloseTo(twoDegrees, 9)
    expect(primary(r)).toBeCloseTo(222.39016, 5)

    // The bug it guards against would have returned 358 degrees of arc — nearly
    // the whole way round the planet — so assert we are nowhere near it.
    const threeFiftyEight = R * 358 * (Math.PI / 180)
    expect(primary(r)).toBeLessThan(threeFiftyEight / 100)

    // The steps must SHOW the wrapped value, or they teach the wrong thing.
    const dLambda = r.steps!.find((s) => 'label' in s && s.label.startsWith('Δλ')) as {
      value: number
    }
    expect(dLambda.value).toBe(2)

    // A real crossing: Nadi, Fiji (177.45 E) to Pago Pago (170.70 W).
    const fiji = primary(gc(-17.75, 177.45, -14.28, -170.7))
    expect(fiji).toBeCloseTo(1323.596742, 5)
    expect(fiji).toBeLessThan(1500) // not the ~38,000 km a naive difference implies
    expect(fiji).toBeCloseTo(byLawOfCosines(-17.75, 177.45, -14.28, -170.7), 9)

    // Symmetric in both directions of travel, and the same however you name the
    // meridian: 180 and -180 are the same line.
    expect(primary(gc(0, -179, 0, 179))).toBeCloseTo(twoDegrees, 9)
    expect(primary(gc(0, 180, 0, 179))).toBeCloseTo(twoDegrees / 2, 9)
    expect(primary(gc(0, -180, 0, 179))).toBeCloseTo(twoDegrees / 2, 9)
  })

  // ── EDGE CASE: identical points ──────────────────────────────────────────
  test('two copies of the same point are exactly zero, never NaN', () => {
    for (const [lat, lon] of [
      [40.7128, -74.006],
      [0, 0],
      [90, 0],
      [-90, 137.5],
      [12.34, 180],
    ] as const) {
      const r = gc(lat, lon, lat, lon)
      expect(primary(r)).toBe(0)
      expect(Number.isNaN(primary(r))).toBe(false)
      expect(statNum(r, 'Central angle')).toBe(0)
      expect(statNum(r, 'Straight chord through the Earth')).toBe(0)
      expect(statNum(r, 'Distance in miles')).toBe(0)
    }
    // Each pole is a single point however you name its longitude.
    expect(primary(gc(90, -74, 90, 121))).toBeCloseTo(0, 9)
    expect(primary(gc(-90, -74, -90, 121))).toBeCloseTo(0, 9)
  })

  // ── EDGE CASE: antipodal points ──────────────────────────────────────────
  test('antipodal points are exactly half the circumference', () => {
    const half = Math.PI * R // 20,015.11 km
    expect(half).toBeCloseTo(20015.114442, 5)

    for (const [lat1, lon1] of [
      [0, 0],
      [45, 0],
      [-33.8688, 151.2093],
      // Near the antimeridian, so the antipode wraps past it. 179.5 is chosen
      // because 179.5 − 180 is exact in binary: an inexact literal would put
      // the "antipode" a few centimetres off true and haversine, correctly,
      // would notice.
      [10, 179.5],
    ] as const) {
      const lat2 = -lat1
      const lon2 = lon1 > 0 ? lon1 - 180 : lon1 + 180
      const r = gc(lat1, lon1, lat2, lon2)
      // Antipodes are the ONE place haversine is ill-conditioned: `a` reaches 1,
      // so 1 − a is computed from cancelling terms and keeps only a handful of
      // significant bits. The residual is around 1e-4 km — 13 centimetres on a
      // 20,015 km arc, or one part in 1.5e8 — which is nine orders of magnitude
      // inside the ~0.5% the spherical model is worth anyway. Asserted to the
      // metre rather than pretended away.
      expect(primary(r)).toBeCloseTo(half, 3)
      expect(Math.abs(primary(r) - half)).toBeLessThan(0.001)
      expect(statNum(r, 'Central angle')).toBeCloseTo(180, 4)
      // At c = 180° the chord is one full diameter, and the arc is π/2 ≈ 1.571
      // times longer than going straight through.
      expect(statNum(r, 'Straight chord through the Earth')).toBeCloseTo(2 * R, 5)
      expect(primary(r) / statNum(r, 'Straight chord through the Earth')).toBeCloseTo(
        Math.PI / 2,
        6,
      )
    }

    // Pole to pole is the same journey by a different route.
    expect(primary(gc(90, 0, -90, 0))).toBeCloseTo(half, 9)
    // Nothing on Earth is farther apart than this.
    expect(primary(gc(51.5074, -0.1278, -51.5074, 179.8722))).toBeCloseTo(half, 6)
  })

  test('a quarter-circle and a meridian degree are exact known arcs', () => {
    // Equator to pole is a quarter of the great circle.
    expect(primary(gc(0, 0, 90, 0))).toBeCloseTo((Math.PI / 2) * R, 9)
    // One degree of latitude on this sphere is R × 1° = 111.195 km.
    const oneDegree = (R * Math.PI) / 180
    expect(oneDegree).toBeCloseTo(111.19508, 6)
    expect(primary(gc(0, 0, 1, 0))).toBeCloseTo(oneDegree, 9)
    expect(primary(gc(45, 30, 46, 30))).toBeCloseTo(oneDegree, 9)
    // A degree of LONGITUDE shrinks with the cosine of the latitude; at 60° it
    // is half what it is on the equator. That is the cos φ term doing its job.
    expect(primary(gc(60, 0, 60, 1))).toBeLessThan(oneDegree * 0.51)
    expect(primary(gc(0, 0, 0, 1))).toBeCloseTo(oneDegree, 9)
  })

  test('haversine keeps its precision where the law of cosines loses it', () => {
    // At ordinary separations the two formulas are indistinguishable.
    for (const dLat of [10, 1, 0.1, 0.01]) {
      const hav = primary(gc(40.7128, -74.006, 40.7128 + dLat, -74.006))
      const loc = byLawOfCosines(40.7128, -74.006, 40.7128 + dLat, -74.006)
      expect(Math.abs(hav - loc) / hav).toBeLessThan(1e-8)
    }

    // Below about a kilometre the cosine form falls apart: acos has a vertical
    // tangent at 1, so the bits lost forming the dot product get amplified.
    // Haversine stays right, which is exactly why it is the one used above.
    const tinyHav = primary(gc(40.7128, -74.006, 40.71281, -74.006))
    const tinyLoc = byLawOfCosines(40.7128, -74.006, 40.71281, -74.006)
    // 0.00001° of latitude is R × that angle — about 1.11 m — and haversine
    // reproduces it to the millimetre.
    expect(tinyHav).toBeCloseTo(R * 0.00001 * (Math.PI / 180), 12)
    expect(Math.abs(tinyLoc - tinyHav) / tinyHav).toBeGreaterThan(1e-3)
  })

  test('the distance does not depend on which point is entered first', () => {
    for (const [a, b, c, d] of [
      [40.7128, -74.006, 51.5074, -0.1278],
      [-33.8688, 151.2093, 34.0522, -118.2437],
      [-17.75, 177.45, -14.28, -170.7],
    ] as const) {
      expect(primary(gc(a, b, c, d))).toBeCloseTo(primary(gc(c, d, a, b)), 9)
    }
  })

  test('the reported route is always the shorter way round', () => {
    // So it can never exceed half the circumference.
    const half = Math.PI * R
    for (let lat = -90; lat <= 90; lat += 15) {
      for (let lon = -180; lon <= 180; lon += 30) {
        const d = primary(gc(lat, lon, -lat / 2, -lon))
        expect(d).toBeLessThanOrEqual(half + 1e-6)
        expect(d).toBeGreaterThanOrEqual(0)
      }
    }
  })

  test('out-of-range coordinates are refused, naming the field', () => {
    const grab = (over: Over) => {
      try {
        at(over)
      } catch (e) {
        return e as CalcError
      }
      return undefined
    }
    expect(grab({ lat1: 90.0001 })!.fieldId).toBe('lat1')
    expect(grab({ lat2: -90.0001 })!.fieldId).toBe('lat2')
    expect(grab({ lon1: 180.0001 })!.fieldId).toBe('lon1')
    expect(grab({ lon2: -180.0001 })!.fieldId).toBe('lon2')
    expect(grab({ lat1: 91 })).toBeInstanceOf(CalcError)
    // The bounds themselves are accepted.
    expect(() => at({ lat1: 90, lat2: -90, lon1: 180, lon2: -180 })).not.toThrow()
  })

  test('non-finite input is refused FIRST, before any range test', () => {
    const grab = (over: Over) => {
      try {
        at(over)
      } catch (e) {
        return (e as CalcError).fieldId
      }
      return undefined
    }
    expect(grab({ lat1: Number.NaN })).toBe('lat1')
    expect(grab({ lon1: Number.NaN })).toBe('lon1')
    expect(grab({ lat2: Number.POSITIVE_INFINITY })).toBe('lat2')
    expect(grab({ lon2: Number.NEGATIVE_INFINITY })).toBe('lon2')
    // `NaN < -90` is false, so a magnitude test alone would let NaN through and
    // return a NaN distance. Ordering the guards is what prevents it.
    expect(Number.NaN < -90).toBe(false)
    expect(grab({ lat1: Number.NaN, lon1: Number.NaN })).toBe('lat1')
    // Cartesian modes guard their own six numbers the same way.
    expect(grab({ mode: 'euclidean3d', x1: Number.NaN })).toBe('x1')
    expect(grab({ mode: 'manhattan', z2: Number.POSITIVE_INFINITY })).toBe('z2')
    // A NaN in a field the selected mode does not read is not an error — the
    // form always renders all eleven inputs, whichever mode is chosen.
    expect(grab({ mode: 'greatCircle', x1: Number.NaN })).toBeUndefined()
    expect(grab({ mode: 'euclidean3d', lat1: Number.NaN })).toBeUndefined()
  })
})

describe('distance calculator — 3D Euclidean', () => {
  const e3 = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) =>
    at({ mode: 'euclidean3d', x1, y1, z1, x2, y2, z2 })

  test('exact cases: the 3-4-5 triangle and the 1-2-2 giving exactly 3', () => {
    // 3-4-5, the canonical right triangle, with z flat.
    expect(primary(e3(0, 0, 0, 3, 4, 0))).toBe(5)
    expect(3 ** 2 + 4 ** 2).toBe(5 ** 2)

    // 1-2-2 is the smallest Pythagorean quadruple: 1 + 4 + 4 = 9 = 3².
    expect(primary(e3(0, 0, 0, 1, 2, 2))).toBe(3)
    expect(1 ** 2 + 2 ** 2 + 2 ** 2).toBe(3 ** 2)

    // 2-3-6 → 7, and 1-4-8 → 9. Both exact integers, both confirmed by the
    // squares rather than by a second call to the same code.
    expect(primary(e3(0, 0, 0, 2, 3, 6))).toBe(7)
    expect(2 ** 2 + 3 ** 2 + 6 ** 2).toBe(7 ** 2)
    expect(primary(e3(0, 0, 0, 1, 4, 8))).toBe(9)
    expect(1 ** 2 + 4 ** 2 + 8 ** 2).toBe(9 ** 2)
  })

  test('the defaults differ by 3, 4 and 12 — a distance of exactly 13', () => {
    const r = at({ mode: 'euclidean3d' })
    expect(primary(r)).toBe(13)
    expect(3 ** 2 + 4 ** 2 + 12 ** 2).toBe(13 ** 2)
    expect(statNum(r, 'Δx')).toBe(3)
    expect(statNum(r, 'Δy')).toBe(4)
    expect(statNum(r, 'Δz')).toBe(12)
    // Ignoring z leaves the 3-4-5 triangle underneath.
    expect(statNum(r, 'Distance in the xy-plane (ignoring z)')).toBe(5)
    expect(statNum(r, 'Manhattan distance for the same points')).toBe(19)
    expect(stat(r, 'Midpoint')).toBe('(3.5, 6, 12)')
  })

  test('with equal z coordinates it collapses to the plain 2D distance', () => {
    // Which is why there is no separate 2D mode: there is no separate formula.
    for (const z of [0, 6, -12.5, 1000]) {
      expect(primary(e3(1, 2, z, 4, 6, z))).toBe(5)
      expect(primary(e3(1, 2, z, 4, 6, z))).toBeCloseTo(Math.hypot(4 - 1, 6 - 2), 12)
    }
    // The same answer the slope calculator reports for its own default points.
    expect(primary(e3(4, 5, 0, 12, 11, 0))).toBe(10)
  })

  test('it is symmetric, translation-invariant, and never negative', () => {
    for (const [x1, y1, z1, x2, y2, z2] of [
      [-7.5, 3, 0.5, 2.5, -11, 40],
      [1000, 1000, 1000, -1000, -1000, -1000],
      [0, 0, 0, 0, 0, 0.5],
    ] as const) {
      const forward = primary(e3(x1, y1, z1, x2, y2, z2))
      expect(primary(e3(x2, y2, z2, x1, y1, z1))).toBeCloseTo(forward, 12)
      // Independent confirmation: the norm of the difference vector, formed
      // without hypot.
      const bySquares = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2 + (z2 - z1) ** 2)
      expect(forward).toBeCloseTo(bySquares, 9)
      // Sliding both points by the same offset changes nothing.
      expect(primary(e3(x1 + 17, y1 + 17, z1 + 17, x2 + 17, y2 + 17, z2 + 17))).toBeCloseTo(
        forward,
        9,
      )
      expect(forward).toBeGreaterThanOrEqual(0)
    }
    expect(primary(e3(0, 0, 0, 0, 0, 0))).toBe(0)
  })
})

describe('distance calculator — Manhattan / taxicab', () => {
  const l1 = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) =>
    at({ mode: 'manhattan', x1, y1, z1, x2, y2, z2 })

  test('exact cases, and it is a different metric rather than a worse one', () => {
    // The 3-4-5 triangle: straight line 5, taxicab 7.
    expect(primary(l1(0, 0, 0, 3, 4, 0))).toBe(7)
    // 1-2-2: straight line exactly 3, taxicab exactly 5.
    expect(primary(l1(0, 0, 0, 1, 2, 2))).toBe(5)
    expect(primary(at({ mode: 'euclidean3d', x1: 0, y1: 0, z1: 0, x2: 1, y2: 2, z2: 2 }))).toBe(3)
    // The defaults: offsets 3, 4, 12 → 19, against a straight line of 13.
    expect(primary(at({ mode: 'manhattan' }))).toBe(19)
    expect(statNum(at({ mode: 'manhattan' }), 'Straight-line distance for the same points')).toBe(13)
  })

  test('absolute values, so direction never subtracts', () => {
    // The bug this catches is summing signed offsets: 5 + (-5) would be 0.
    expect(primary(l1(0, 0, 0, 5, -5, 0))).toBe(10)
    expect(primary(l1(3, 9, -4, -3, -9, 4))).toBe(6 + 18 + 8)
    expect(primary(l1(-2.5, -2.5, -2.5, 2.5, 2.5, 2.5))).toBe(15)
    const r = l1(3, 9, -4, -3, -9, 4)
    expect(statNum(r, '|Δx|')).toBe(6)
    expect(statNum(r, '|Δy|')).toBe(18)
    expect(statNum(r, '|Δz|')).toBe(8)
  })

  test('the detour ratio sits between 1 and √3, its known bounds in 3D', () => {
    const ratio = (r: Result) => statNum(r, 'Detour ratio (taxicab ÷ straight line)')
    // Equal along a single axis: no detour at all.
    expect(ratio(l1(0, 0, 0, 7, 0, 0))).toBe(1)
    // Equal offsets on all three axes: the worst case, exactly √3.
    expect(ratio(l1(0, 0, 0, 4, 4, 4))).toBeCloseTo(Math.sqrt(3), 12)
    // Equal on two axes in a plane: √2.
    expect(ratio(l1(0, 0, 0, 4, 4, 0))).toBeCloseTo(Math.SQRT2, 12)
    // Identical points have no ratio to form; report 1 rather than 0 ÷ 0.
    expect(ratio(l1(2, 2, 2, 2, 2, 2))).toBe(1)
    expect(primary(l1(2, 2, 2, 2, 2, 2))).toBe(0)
  })

  test('L1 ≥ L2 everywhere, and never by more than √3', () => {
    for (let i = -20; i <= 20; i += 3) {
      for (let j = -20; j <= 20; j += 7) {
        const r = l1(0, 0, 0, i, j, i - j)
        const taxi = primary(r)
        const straight = statNum(r, 'Straight-line distance for the same points')
        expect(taxi).toBeGreaterThanOrEqual(straight - 1e-12)
        expect(taxi).toBeLessThanOrEqual(straight * Math.sqrt(3) + 1e-12)
      }
    }
  })
})

describe('distance calculator — shape and conformance', () => {
  test('the stats count is fixed at six in every mode, and nothing drawable is claimed', () => {
    const cases: Over[] = [
      {},
      { mode: 'euclidean3d' },
      { mode: 'manhattan' },
      { lat1: 90, lon1: 180, lat2: -90, lon2: -180 },
      { lat1: 0, lon1: 179, lat2: 0, lon2: -179 },
      { mode: 'euclidean3d', x1: 0, y1: 0, z1: 0, x2: 0, y2: 0, z2: 0 },
      { mode: 'manhattan', x1: -1000, y1: -1000, z1: -1000, x2: 1000, y2: 1000, z2: 1000 },
    ]
    for (const c of cases) {
      const r = at(c)
      expect(r.stats).toHaveLength(6)
      // No proportion to split and no ordered axis to plot, so neither a donut
      // nor a chart is offered — which means neither can appear off-default
      // either, and the server-rendered card can never go missing.
      expect(r.parts).toBeUndefined()
      expect(r.series).toBeUndefined()
      expect(r.scaleValue).toBeUndefined()
      expect(r.notes!.length).toBeGreaterThan(0)
      expect(r.steps!.length).toBeGreaterThan(0)
      for (const s of r.stats!) {
        if (typeof s.value === 'number') expect(Number.isFinite(s.value)).toBe(true)
      }
      expect(Number.isFinite(Number(r.primary.value))).toBe(true)
    }
  })

  test('every default lands on min + n × step, inside its own bounds', () => {
    for (const field of fields) {
      if (field.kind !== 'number') continue
      // A NEGATIVE minimum has to satisfy the grid rule just like a positive one.
      expect(field.min).toBeLessThan(0)
      const n = (field.default - field.min) / field.step
      expect(Math.abs(n - Math.round(n)), field.id).toBeLessThan(1e-9)
      expect(field.default).toBeGreaterThanOrEqual(field.min)
      expect(field.default).toBeLessThanOrEqual(field.max)
    }
  })

  test('both declared bounds compute in every mode', () => {
    for (const mode of ['greatCircle', 'euclidean3d', 'manhattan']) {
      for (const field of fields) {
        if (field.kind !== 'number') continue
        for (const bound of [field.min, field.max]) {
          const r = at({ mode, [field.id]: bound })
          expect(Number.isFinite(Number(r.primary.value)), `${mode}:${field.id}=${bound}`).toBe(true)
        }
      }
    }
  })

  test('the first number field nudged to 1.1x its default moves the DEFAULT mode', () => {
    const firstNumber = fields.find((f) => f.kind === 'number')!
    expect(firstNumber.id).toBe('lat1')
    expect(firstNumber.default).not.toBe(0) // 1.1 × 0 would not move at all

    const nudged = firstNumber.default * 1.1
    expect(nudged).toBeGreaterThanOrEqual(firstNumber.min)
    expect(nudged).toBeLessThanOrEqual(firstNumber.max)
    expect(nudged).toBeCloseTo(44.78408, 9)

    // The nudge lands in the default mode, which is the great-circle one.
    expect(fields[0]!.kind).toBe('select')
    expect(fields[0]!.default).toBe('greatCircle')

    const base = at({})
    const after = at({ lat1: nudged })
    expect(primary(after)).toBeCloseTo(5295.277733, 5)
    expect(primary(after)).not.toBeCloseTo(primary(base), 3)
    expect(Number.isFinite(primary(after))).toBe(true)
    // And the independent formula agrees with the nudged value too.
    expect(primary(after)).toBeCloseTo(byLawOfCosines(nudged, -74.006, 51.5074, -0.1278), 8)
  })

  test('copy fits the search result and the FAQs are substantial', () => {
    expect(def.description.length).toBeGreaterThan(50)
    expect(def.description.length).toBeLessThanOrEqual(160)
    expect(def.seoTitle.length).toBeLessThanOrEqual(70)
    expect(def.intro.length).toBeGreaterThan(40)
    expect(def.faqs.length).toBeGreaterThanOrEqual(3)
    for (const faq of def.faqs) {
      expect(faq.q.endsWith('?')).toBe(true)
      expect(faq.a.length).toBeGreaterThan(40)
    }
    // The definition carries domain facts only — no colours, classes or markup.
    const serialized = JSON.stringify(def, (_k, v) => (typeof v === 'function' ? undefined : v))
    expect(serialized).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(serialized).not.toMatch(/<\/?[a-z][\s\S]*>/i)
    for (const id of fields.map((f) => f.id)) expect(id).toMatch(/^[a-z][a-zA-Z0-9]*$/)
    expect(new Set(fields.map((f) => f.id)).size).toBe(fields.length)
    // The copy has to say that slope-calculator is the two-point-line page.
    expect(def.intro).toContain('slope calculator')
    expect(def.related).toContain('slope-calculator')
    expect(def.related).not.toContain(def.slug)
  })

  /*
   * A wide sweep of the whole globe, cross-checked against the independent
   * formula at every point. It runs in well under a second alone, but vitest's
   * default timeout is 5s and the whole suite runs in parallel, so the timeout
   * is stated explicitly rather than left to chance.
   */
  test(
    'across the whole globe the two formulas agree and nothing is NaN',
    () => {
      let worst = 0
      const half = Math.PI * R
      for (let lat1 = -90; lat1 <= 90; lat1 += 10) {
        for (let lon1 = -180; lon1 <= 180; lon1 += 20) {
          for (let lat2 = -90; lat2 <= 90; lat2 += 30) {
            for (let lon2 = -180; lon2 <= 180; lon2 += 45) {
              const d = primary(gc(lat1, lon1, lat2, lon2))
              expect(Number.isFinite(d)).toBe(true)
              expect(d).toBeGreaterThanOrEqual(0)
              expect(d).toBeLessThanOrEqual(half + 1e-6)
              const other = byLawOfCosines(lat1, lon1, lat2, lon2)
              // Below a kilometre the cosine form is the one losing precision,
              // so only compare where it is trustworthy.
              if (d > 1) worst = Math.max(worst, Math.abs(d - other) / d)
            }
          }
        }
      }
      expect(worst).toBeLessThan(1e-9)
    },
    30_000,
  )

  test(
    'the Cartesian modes stay finite, ordered and symmetric across their range',
    () => {
      for (let a = -1000; a <= 1000; a += 125) {
        for (let b = -1000; b <= 1000; b += 250) {
          const over = { x1: a, y1: b, z1: -a, x2: b, y2: -a, z2: a }
          const e = primary(at({ mode: 'euclidean3d', ...over }))
          const m = primary(at({ mode: 'manhattan', ...over }))
          expect(Number.isFinite(e)).toBe(true)
          expect(Number.isFinite(m)).toBe(true)
          expect(m).toBeGreaterThanOrEqual(e - 1e-9)
          expect(m).toBeLessThanOrEqual(e * Math.sqrt(3) + 1e-9)
          // Swapping the points changes neither metric.
          const swapped = {
            x1: over.x2,
            y1: over.y2,
            z1: over.z2,
            x2: over.x1,
            y2: over.y1,
            z2: over.z1,
          }
          expect(primary(at({ mode: 'euclidean3d', ...swapped }))).toBeCloseTo(e, 9)
          expect(primary(at({ mode: 'manhattan', ...swapped }))).toBeCloseTo(m, 9)
        }
      }
    },
    30_000,
  )
})

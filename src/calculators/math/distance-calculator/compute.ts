import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, Values } from '../../../lib/types'
import type { fields } from './fields'

/**
 * Mean Earth radius R₁ = (2a + b) / 3 of the WGS 84 ellipsoid, as adopted by the
 * IUGG: 6371.0088 km. (WGS 84 has a = 6378.1370 km and b = 6356.752314245 km, so
 * (2 × 6378.1370 + 6356.752314245) / 3 = 6371.00877 km, rounded to 6371.0088.)
 * This is the value the IUGG publishes as the mean radius and the one used by
 * essentially every published great-circle table, so it is what makes our
 * figures comparable with theirs.
 *
 * It is a SINGLE radius standing in for a body that is not a sphere: the Earth
 * is about 21 km wider through the equator than through the poles. Treating it
 * as a sphere is what makes the haversine formula simple, and it is also its
 * whole error budget — see ACCURACY_NOTE below. Do not read more precision into
 * the output than that.
 */
const EARTH_RADIUS_KM = 6371.0088

/** International mile, exactly 1609.344 m since the 1959 yard-and-pound agreement. */
const KM_PER_MILE = 1.609344
/** International nautical mile, defined as exactly 1852 m. */
const KM_PER_NAUTICAL_MILE = 1.852

const DEG = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI

const ACCURACY_NOTE =
  'Great-circle distances here model the Earth as a sphere of mean radius 6371.0088 km. The Earth is an oblate spheroid, so this is an approximation: compared with a geodesic on the WGS 84 ellipsoid (the model GPS uses), a haversine distance is typically within about 0.3% and worst-case around 0.5%. On the 5,570 km between New York and London that is a band of roughly ±20 km. Treat the answer as good to three or four significant figures, not to the metre.'

const dec = (label: string, value: number, decimals = 4, unit?: string): Quantity => ({
  label,
  value,
  format: { style: 'decimal', decimals, ...(unit ? { unit } : {}) },
})

const km = (label: string, value: number): Quantity => dec(label, value, 3, 'km')
const degrees = (label: string, value: number): Quantity => dec(label, value, 4, '°')
const raw = (label: string, value: string): Quantity => ({ label, value, format: { style: 'raw' } })

/** Renders a coordinate for inclusion in a text expression, without a trail of zeros. */
function num(n: number): string {
  const rounded = Number(n.toFixed(6)) + 0
  return String(rounded === 0 ? 0 : rounded)
}

/**
 * Wraps a longitude difference into (−180, 180].
 *
 * THIS IS THE ANTIMERIDIAN CASE. Longitude 179° and longitude −179° are two
 * degrees apart, not 358: the shorter way round is eastward across the date
 * line. Subtracting naively gives −358, and any formula that treats that as an
 * angular separation reports a near-global distance for two points you can see
 * from each other.
 *
 * The haversine formula happens to be immune on its own — it uses sin²(Δλ/2),
 * which has period 360° in Δλ, so sin²(−358°/2) = sin²(−179°) = sin²(1°) and the
 * right answer falls out either way. It is normalised anyway for three reasons:
 * the spherical law of cosines cross-check needs cos(Δλ) (also periodic, but the
 * intent should not depend on luck), the bearing formula's atan2 does not
 * benefit from the accident, and the worked steps must SHOW Δλ = 2°, because a
 * step reading −358° would teach the reader the wrong thing.
 */
function wrapLongitudeDelta(delta: number): number {
  return ((((delta + 180) % 360) + 360) % 360) - 180
}

/**
 * Great-circle central angle by the haversine formula.
 *
 *   a = sin²(Δφ/2) + cos φ₁ · cos φ₂ · sin²(Δλ/2)
 *   c = 2 · atan2(√a, √(1−a))
 *
 * Returns the central angle in radians; multiply by the radius for a distance.
 * The atan2 form is used rather than 2·asin(√a) so that a value of `a` nudged a
 * hair above 1 by rounding at antipodal points cannot produce NaN.
 */
function haversineCentralAngle(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = lat1 * DEG
  const phi2 = lat2 * DEG
  const dPhi = (lat2 - lat1) * DEG
  const dLambda = wrapLongitudeDelta(lon2 - lon1) * DEG

  const a =
    Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2
  return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)))
}

/**
 * The same central angle by the SPHERICAL LAW OF COSINES:
 *
 *   c = acos( sin φ₁ · sin φ₂ + cos φ₁ · cos φ₂ · cos Δλ )
 *
 * A genuinely different formula for the same quantity, exported so the tests can
 * cross-check the headline against it rather than against a second copy of the
 * same arithmetic. The two agree to floating-point noise at any distance worth
 * plotting.
 *
 * They part company at SMALL separations, and that is precisely why haversine is
 * the one used for the answer. For nearly-coincident points the dot product
 * above approaches 1, where acos has a vertical tangent, so the handful of bits
 * lost forming the sum get amplified enormously: at a tenth of a metre this
 * formula is already ~20% out, at 10 m ~0.3%, while haversine — whose Δφ and Δλ
 * are computed as differences before any trigonometry and fed to sin², which is
 * flat at zero — stays exact all the way down.
 */
export function lawOfCosinesCentralAngle(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const phi1 = lat1 * DEG
  const phi2 = lat2 * DEG
  const dLambda = wrapLongitudeDelta(lon2 - lon1) * DEG
  const cosine =
    Math.sin(phi1) * Math.sin(phi2) + Math.cos(phi1) * Math.cos(phi2) * Math.cos(dLambda)
  // Clamp: rounding can push the dot product a hair outside [-1, 1] at identical
  // or antipodal points, and acos of 1.0000000000000002 is NaN.
  return Math.acos(Math.min(1, Math.max(-1, cosine)))
}

/**
 * Initial bearing (forward azimuth) along the great circle, in degrees clockwise
 * from true north, normalised to [0, 360).
 *
 *   θ = atan2( sin Δλ · cos φ₂,  cos φ₁ · sin φ₂ − sin φ₁ · cos φ₂ · cos Δλ )
 *
 * A great circle is not a constant-heading path, so this is the heading you set
 * off on, not the one you hold.
 */
function initialBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = lat1 * DEG
  const phi2 = lat2 * DEG
  const dLambda = wrapLongitudeDelta(lon2 - lon1) * DEG
  const y = Math.sin(dLambda) * Math.cos(phi2)
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda)
  return (Math.atan2(y, x) * RAD_TO_DEG + 360) % 360
}

/** Guards finiteness FIRST — coerceValues emits NaN, and `x < -90` is false for NaN. */
function requireFinite(entries: ReadonlyArray<readonly [string, number, string]>) {
  for (const [id, value, label] of entries) {
    if (!Number.isFinite(value)) throw new CalcError(`Enter a number for ${label}.`, id)
  }
}

function requireRange(id: string, value: number, label: string, min: number, max: number) {
  if (value < min || value > max) {
    throw new CalcError(`${label} must be between ${min}° and ${max}°.`, id)
  }
}

export default function compute(v: Values<typeof fields>): CalcResult {
  const { mode, lat1, lon1, lat2, lon2, x1, y1, z1, x2, y2, z2 } = v

  if (mode === 'greatCircle') return greatCircle(lat1, lon1, lat2, lon2)

  // Both Cartesian modes read the same six numbers; only the metric differs.
  requireFinite([
    ['x1', x1, 'Point A x'],
    ['y1', y1, 'Point A y'],
    ['z1', z1, 'Point A z'],
    ['x2', x2, 'Point B x'],
    ['y2', y2, 'Point B y'],
    ['z2', z2, 'Point B z'],
  ])

  const dx = x2 - x1
  const dy = y2 - y1
  const dz = z2 - z1

  // L2, the ordinary straight line: √(Δx² + Δy² + Δz²). Built with two hypots
  // rather than squaring and adding, so a coordinate near the floating-point
  // ceiling cannot overflow on the way to a representable answer.
  const euclidean = Math.hypot(Math.hypot(dx, dy), dz)
  // L1, the taxicab metric: |Δx| + |Δy| + |Δz|. A DIFFERENT metric, not a
  // variant of the one above — it is the shortest path when you may only travel
  // parallel to the axes, which is why a Manhattan grid is the usual picture.
  const manhattan = Math.abs(dx) + Math.abs(dy) + Math.abs(dz)
  const planar = Math.hypot(dx, dy)
  const midpoint = `(${num((x1 + x2) / 2)}, ${num((y1 + y2) / 2)}, ${num((z1 + z2) / 2)})`

  const pointA = `(${num(x1)}, ${num(y1)}, ${num(z1)})`
  const pointB = `(${num(x2)}, ${num(y2)}, ${num(z2)})`
  // Zero over zero is the one case with no meaningful ratio: identical points.
  const detour = euclidean === 0 ? 1 : manhattan / euclidean

  if (mode === 'manhattan') {
    return {
      primary: {
        label: 'Manhattan distance',
        value: manhattan,
        format: { style: 'decimal', decimals: 6 },
      },
      stats: [
        dec('|Δx|', Math.abs(dx), 6),
        dec('|Δy|', Math.abs(dy), 6),
        dec('|Δz|', Math.abs(dz), 6),
        dec('Straight-line distance for the same points', euclidean, 6),
        dec('Detour ratio (taxicab ÷ straight line)', detour, 6),
        raw('Midpoint', midpoint),
      ],
      steps: [
        raw('Point A (x₁, y₁, z₁)', pointA),
        raw('Point B (x₂, y₂, z₂)', pointB),
        { rule: true },
        dec('|Δx| = |x₂ − x₁|', Math.abs(dx), 6),
        dec('|Δy| = |y₂ − y₁|', Math.abs(dy), 6),
        dec('|Δz| = |z₂ − z₁|', Math.abs(dz), 6),
        dec('d = |Δx| + |Δy| + |Δz|', manhattan, 6),
        { rule: true },
        dec('For comparison, √(Δx² + Δy² + Δz²)', euclidean, 6),
        dec('Detour ratio', detour, 6),
      ],
      notes: [
        'The Manhattan or taxicab distance is the length of the shortest path that only ever moves parallel to the axes — the distance a car covers on a perfect street grid. It is a genuinely different metric from the straight line, not a rounding of it, and it is never shorter: the detour ratio is 1 when the two points share all but one coordinate, and reaches √3 ≈ 1.732 in three dimensions (√2 ≈ 1.414 in two) when the offsets are equal.',
        'Because it never squares anything, every one of the axis offsets counts at full weight. That is what makes it the natural metric for grid movement, for L1 regression, and for image and vector work where large single-axis differences should not dominate.',
        'Leave both z coordinates equal and this is the ordinary 2D taxicab distance |Δx| + |Δy|.',
      ],
    }
  }

  return {
    primary: {
      label: 'Straight-line distance',
      value: euclidean,
      format: { style: 'decimal', decimals: 6 },
    },
    stats: [
      dec('Δx', dx, 6),
      dec('Δy', dy, 6),
      dec('Δz', dz, 6),
      dec('Distance in the xy-plane (ignoring z)', planar, 6),
      dec('Manhattan distance for the same points', manhattan, 6),
      raw('Midpoint', midpoint),
    ],
    steps: [
      raw('Point A (x₁, y₁, z₁)', pointA),
      raw('Point B (x₂, y₂, z₂)', pointB),
      { rule: true },
      dec('Δx = x₂ − x₁', dx, 6),
      dec('Δy = y₂ − y₁', dy, 6),
      dec('Δz = z₂ − z₁', dz, 6),
      dec('Δx² + Δy² + Δz²', dx * dx + dy * dy + dz * dz, 6),
      dec('d = √(Δx² + Δy² + Δz²)', euclidean, 6),
      { rule: true },
      raw('Midpoint = ((x₁+x₂)/2, (y₁+y₂)/2, (z₁+z₂)/2)', midpoint),
    ],
    notes: [
      'This is Pythagoras applied twice: √(Δx² + Δy²) gives the distance across the floor, and a second right triangle raises that to the height Δz. Set both z coordinates equal and Δz is zero, so the same formula collapses to the plain 2D distance √(Δx² + Δy²) — there is no separate 2D mode here because there is no separate formula.',
      'The distance is unchanged if you swap the two points, because each offset is squared. It is also unchanged by sliding both points together, since only the differences appear.',
      'For two-point work on a line — slope, the y-intercept, the equation, the angle of inclination — the slope calculator is the page you want. It reports the 2D distance between the points as well.',
    ],
  }
}

function greatCircle(lat1: number, lon1: number, lat2: number, lon2: number): CalcResult {
  // Finiteness FIRST. `coerceValues` produces NaN for unparseable input, and a
  // magnitude test like `lat1 < -90` is false for NaN, so an unguarded NaN would
  // sail past the range check and come out the far end as a NaN distance.
  requireFinite([
    ['lat1', lat1, 'Point A latitude'],
    ['lon1', lon1, 'Point A longitude'],
    ['lat2', lat2, 'Point B latitude'],
    ['lon2', lon2, 'Point B longitude'],
  ])
  requireRange('lat1', lat1, 'Point A latitude', -90, 90)
  requireRange('lat2', lat2, 'Point B latitude', -90, 90)
  requireRange('lon1', lon1, 'Point A longitude', -180, 180)
  requireRange('lon2', lon2, 'Point B longitude', -180, 180)

  const centralAngle = haversineCentralAngle(lat1, lon1, lat2, lon2)
  const distanceKm = EARTH_RADIUS_KM * centralAngle
  const miles = distanceKm / KM_PER_MILE
  const nauticalMiles = distanceKm / KM_PER_NAUTICAL_MILE
  // The straight chord through the interior of the Earth: 2R·sin(c/2). Always
  // shorter than the surface arc, and dramatically so at long range.
  const chordKm = 2 * EARTH_RADIUS_KM * Math.sin(centralAngle / 2)
  const bearing = initialBearing(lat1, lon1, lat2, lon2)
  // The final bearing is the reverse course from B back to A, turned around.
  const finalBearing = (initialBearing(lat2, lon2, lat1, lon1) + 180) % 360

  const dPhi = lat2 - lat1
  const dLambda = wrapLongitudeDelta(lon2 - lon1)
  const a = Math.sin((dPhi * DEG) / 2) ** 2 +
    Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin((dLambda * DEG) / 2) ** 2
  const crossCheckKm = EARTH_RADIUS_KM * lawOfCosinesCentralAngle(lat1, lon1, lat2, lon2)

  const pointA = `(${num(lat1)}°, ${num(lon1)}°)`
  const pointB = `(${num(lat2)}°, ${num(lon2)}°)`

  return {
    primary: {
      label: 'Great-circle distance',
      value: distanceKm,
      format: { style: 'decimal', decimals: 2, unit: 'km' },
    },
    stats: [
      dec('Distance in miles', miles, 2, 'mi'),
      dec('Distance in nautical miles', nauticalMiles, 2, 'nmi'),
      degrees('Central angle', centralAngle * RAD_TO_DEG),
      degrees('Initial bearing from A', bearing),
      degrees('Final bearing at B', finalBearing),
      km('Straight chord through the Earth', chordKm),
    ],
    steps: [
      raw('Point A (latitude, longitude)', pointA),
      raw('Point B (latitude, longitude)', pointB),
      { rule: true },
      degrees('Δφ = lat₂ − lat₁', dPhi),
      degrees('Δλ = lon₂ − lon₁, wrapped into (−180, 180]', dLambda),
      dec('a = sin²(Δφ/2) + cos φ₁ · cos φ₂ · sin²(Δλ/2)', a, 10),
      degrees('c = 2 · atan2(√a, √(1−a))', centralAngle * RAD_TO_DEG),
      { rule: true },
      dec('d = R · c, with R = 6371.0088 km', distanceKm, 3, 'km'),
      dec('d ÷ 1.609344', miles, 3, 'mi'),
      dec('d ÷ 1.852', nauticalMiles, 3, 'nmi'),
      { rule: true },
      km('Cross-check by the spherical law of cosines', crossCheckKm),
      km('Straight chord through the Earth, 2R · sin(c/2)', chordKm),
    ],
    notes: [
      ACCURACY_NOTE,
      'Longitude wraps: 179° and −179° are two degrees apart, so a hop across the antimeridian near Fiji is a short flight, not a trip most of the way round the planet. The longitude difference is folded into (−180, 180] before use, and the shorter of the two ways round is always the one reported.',
      'The initial bearing is the heading you leave on, not one you hold. A great circle continuously changes its true heading — that is why the final bearing at B is a different number — and it is also why great-circle routes look curved on a Mercator map.',
      'This is a surface distance between two points on the globe. For the geometry of a line through two points on a graph — slope, y-intercept, the equation, the angle — use the slope calculator, which also reports the plain 2D distance between them.',
    ],
  }
}

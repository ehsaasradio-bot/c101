import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, Series, StepRule, Values } from '../../../lib/types'
import type { fields } from './fields'

/*
 * The four equations of motion for constant acceleration in a straight line —
 * the SUVAT equations, taught from Galileo's kinematics onward and derivable in
 * two lines from the definitions a = dv/dt and v = ds/dt:
 *
 *     (1)  v = u + a·t
 *     (2)  s = u·t + ½·a·t²
 *     (3)  s = ((u + v) ÷ 2) · t
 *     (4)  v² = u² + 2·a·s
 *
 * u is the velocity at t = 0, v the velocity at time t, a the (constant)
 * acceleration, s the displacement over that interval. Equation (3) is just the
 * average velocity times the time, which is only equal to (u + v)/2 BECAUSE the
 * acceleration is constant — that assumption is the whole content of this page.
 *
 * Any three of {u, v, a, t, s} fix the other two. `solveFor` names the one you
 * want and the three read to get it:
 *
 *     displacement   u, a, t  →  (2), then (1) for v
 *     finalVelocity  u, a, t  →  (1), then (2) for s
 *     acceleration   u, v, t  →  (1) rearranged, then (3) for s
 *     time           u, a, s  →  (2) rearranged, a QUADRATIC in t, then (1)
 *
 * Selects arrive as strings — the derived Values type makes forgetting that a
 * compile error rather than a NaN later.
 */

const MODES = ['displacement', 'finalVelocity', 'acceleration', 'time'] as const
type Mode = (typeof MODES)[number]

const isMode = (s: string): s is Mode => (MODES as readonly string[]).includes(s)

const dec = (label: string, value: number, decimals = 4, unit?: string): Quantity => ({
  label,
  value,
  format: { style: 'decimal', decimals, ...(unit ? { unit } : {}) },
})

const metres = (label: string, value: number): Quantity => dec(label, value, 4, 'm')
const mps = (label: string, value: number): Quantity => dec(label, value, 4, 'm/s')
const mps2 = (label: string, value: number): Quantity => dec(label, value, 4, 'm/s²')
const seconds = (label: string, value: number): Quantity => dec(label, value, 4, 's')
const raw = (label: string, value: string): Quantity => ({ label, value, format: { style: 'raw' } })

/** A number for inclusion in a sentence, without a trail of zeros. */
function num(n: number): string {
  const rounded = Number(n.toFixed(6)) + 0
  return String(rounded === 0 ? 0 : rounded)
}

/**
 * The x axis here is a stopwatch, not a calendar. Named once and reused by both
 * returns, so the "never reached" answer captions its chart the same way the
 * ordinary one does.
 */
const CHART = { title: 'Displacement and velocity over time', xLabel: 'Seconds' }

const CONSTANT_ACCELERATION_NOTE =
  'Every figure here assumes the acceleration is constant for the whole interval and the motion is along a straight line. That covers free fall in a vacuum, a car braking at a steady rate, and a trolley on a ramp. It does not cover air resistance, a changing thrust, a spring, or a curved path — for those the acceleration is a function of time or position and these five numbers no longer determine each other.'

const SIGN_NOTE =
  'One direction is positive and the opposite one is negative; which is which is your choice, but it has to be the same choice for all five quantities. A ball thrown upward at 20 m/s with "up" positive has u = 20 and a = −9.81. Displacement is not distance travelled: an object that goes out and comes back has a displacement of zero while its odometer says otherwise.'

interface TimeSolution {
  /** The chosen root. NaN when the displacement is never reached. */
  t: number
  /** The root not chosen, when the quadratic has two distinct ones. */
  otherRoot?: number
  /**
   * Set when no non-negative time satisfies the equation: the object turns back
   * before it gets there, or never sets off toward it at all. Carries the
   * furthest point it does reach going forward, which is the useful answer.
   */
  unreachable?: { turningTime: number; turningDisplacement: number }
}

/**
 * Solves s = u·t + ½·a·t² for t.
 *
 * With a ≠ 0 this is a quadratic, written here as a·t² + 2u·t − 2s = 0 so the
 * standard coefficients are A = a, B = 2u, C = −2s. It is solved by the
 * NUMERICALLY STABLE form rather than the schoolbook one: computing
 * (−B + √(B² − 4AC)) / 2A subtracts two nearly equal numbers whenever 4AC is
 * small against B², and for a small acceleration that is exactly the case — the
 * root that matters is the one that loses all its significant digits. Taking
 *
 *     q = −(B + sign(B)·√(B² − 4AC)) / 2,  then  t = q/A  and  t = C/q
 *
 * always adds two same-signed quantities, so neither root is formed by
 * cancellation. At a = 1e-9 the schoolbook form is wrong in the third digit;
 * this one is exact to the last bit and tends smoothly to the a = 0 answer.
 *
 * a = 0 is branched separately rather than left to the limit: there is no
 * quadratic then, only constant velocity and s = u·t.
 */
function solveTime(u: number, a: number, s: number): TimeSolution {
  if (a === 0) {
    if (u === 0) {
      if (s === 0) {
        throw new CalcError(
          'With no starting velocity and no acceleration the object never moves, so every time there is satisfies a displacement of 0 m and none of them is the answer. Give it a velocity or an acceleration.',
          'initialVelocity',
        )
      }
      return { t: Number.NaN, unreachable: { turningTime: 0, turningDisplacement: 0 } }
    }
    const t = s / u
    if (!(t >= 0)) return { t: Number.NaN, unreachable: { turningTime: 0, turningDisplacement: 0 } }
    return { t: t === 0 ? 0 : t }
  }

  const A = a
  const B = 2 * u
  const C = -2 * s
  const discriminant = B * B - 4 * A * C

  /*
   * Where the object stops and turns round: v = u + a·t is zero at t = −u/a, and
   * the displacement there is −u²/(2a). Under a deceleration that is the
   * furthest forward it ever gets. A turning time at or before zero means it was
   * already heading away when the clock started, so the furthest forward point
   * is simply where it began.
   */
  const turningTime = -u / a
  const turningDisplacement = -(u * u) / (2 * a)
  const turningPoint =
    turningTime > 0
      ? { turningTime, turningDisplacement }
      : { turningTime: 0, turningDisplacement: 0 }

  if (!(discriminant >= 0)) return { t: Number.NaN, unreachable: turningPoint }

  const root = Math.sqrt(discriminant)
  let first: number
  let second: number
  if (root === 0) {
    // A repeated root: the object arrives exactly as it turns round.
    first = -B / (2 * A)
    second = first
  } else {
    const q = -(B + (B >= 0 ? root : -root)) / 2
    first = q / A
    second = C / q
  }

  // Floating point lands an exact zero a hair either side of it; -1e-17 is 0.
  const clean = (r: number) => (Math.abs(r) < 1e-12 ? 0 : r)
  const roots = [clean(first), clean(second)].sort((x, y) => x - y)
  const nonNegative = roots.filter((r) => r >= 0)
  if (nonNegative.length === 0) return { t: Number.NaN, unreachable: turningPoint }

  const t = nonNegative[0]!
  return { t, otherRoot: roots.find((r) => r !== t) }
}

/**
 * Position and velocity sampled over the whole interval, both from the SAME
 * closed forms as the headline — s(τ) = u·τ + ½·a·τ² and v(τ) = u + a·τ — so the
 * curve and the number can never disagree at the right-hand end.
 *
 * Returns nothing rather than a degenerate line when the interval has no length:
 * a chart of one instant is not a chart.
 */
function motionSeries(u: number, a: number, total: number): Series[] | undefined {
  if (!Number.isFinite(total) || !(total > 1e-9)) return undefined

  const STEPS = 40
  const position: Array<readonly [number, number]> = []
  const velocity: Array<readonly [number, number]> = []
  for (let i = 0; i <= STEPS; i += 1) {
    // Pin the last sample exactly on the reported end point rather than letting
    // the division land near it.
    const tau = i === STEPS ? total : (total * i) / STEPS
    position.push([tau, u * tau + 0.5 * a * tau * tau])
    velocity.push([tau, u + a * tau])
  }

  const usable = (points: ReadonlyArray<readonly [number, number]>) =>
    points.every(
      ([x, y], i) =>
        Number.isFinite(x) && Number.isFinite(y) && (i === 0 || x > points[i - 1]![0]),
    )
  if (!usable(position) || !usable(velocity)) return undefined

  return [
    { label: 'Displacement', points: position, format: { style: 'decimal', decimals: 2, unit: 'm' } },
    { label: 'Velocity', points: velocity, format: { style: 'decimal', decimals: 2, unit: 'm/s' } },
  ]
}

/**
 * Finiteness FIRST, always. `coerceValues` hands compute a raw NaN for anything
 * the form could not parse, and every ordinary comparison against NaN is false —
 * so a bare `t > 0` would let it through into the arithmetic and surface as a
 * NaN on the page.
 */
function requireFinite(entries: ReadonlyArray<readonly [string, number, string]>) {
  for (const [id, value, label] of entries) {
    if (!Number.isFinite(value)) throw new CalcError(`Enter a number for ${label}.`, id)
  }
}

export default function compute(v: Values<typeof fields>): CalcResult {
  if (!isMode(v.solveFor)) throw new CalcError('Choose which quantity to solve for.', 'solveFor')
  const mode: Mode = v.solveFor

  const u = v.initialVelocity
  const a = v.acceleration
  const inputTime = v.time
  const inputFinal = v.finalVelocity
  const inputDisplacement = v.displacement

  // Only the three boxes this mode actually reads are validated. The other two
  // are still on screen holding whatever they held, and refusing to answer
  // because of a number nobody asked about would be surprising.
  requireFinite([['initialVelocity', u, 'the initial velocity']])

  if (mode !== 'time') {
    requireFinite([['time', inputTime, 'the time']])
    if (!(inputTime > 0)) {
      throw new CalcError('Enter a time greater than 0 seconds — an interval of no duration has no motion in it.', 'time')
    }
  }
  if (mode === 'acceleration') {
    requireFinite([['finalVelocity', inputFinal, 'the final velocity']])
  } else {
    requireFinite([['acceleration', a, 'the acceleration']])
  }
  if (mode === 'time') {
    requireFinite([['displacement', inputDisplacement, 'the displacement']])
  }

  const steps: Array<Quantity | StepRule> = []
  const notes: string[] = []

  let velocityFinal: number
  let acceleration: number
  let time: number
  let displacement: number
  let primary: Quantity

  if (mode === 'acceleration') {
    // a = (v − u) ÷ t, equation (1) rearranged. Guarded above: t is finite and
    // strictly positive, so this division is always defined.
    acceleration = (inputFinal - u) / inputTime
    time = inputTime
    velocityFinal = inputFinal
    // Equation (3). Identical to u·t + ½·a·t² once a is substituted back, but it
    // is the form that uses only the numbers the visitor actually supplied.
    displacement = ((u + velocityFinal) / 2) * time
    primary = mps2('Acceleration', acceleration)

    steps.push(
      mps('Initial velocity u (known)', u),
      mps('Final velocity v (known)', velocityFinal),
      seconds('Time t (known)', time),
      { rule: true },
      mps('Change in velocity, v − u', velocityFinal - u),
      mps2('a = (v − u) ÷ t', acceleration),
      { rule: true },
      mps('Average velocity, (u + v) ÷ 2', (u + velocityFinal) / 2),
      metres('s = ((u + v) ÷ 2) × t', displacement),
    )
  } else if (mode === 'time') {
    const solution = solveTime(u, a, inputDisplacement)
    acceleration = a
    displacement = inputDisplacement

    if (solution.unreachable) {
      const { turningTime, turningDisplacement } = solution.unreachable
      notes.push(
        a === 0
          ? `With zero acceleration the object holds ${num(u)} m/s for ever, so its displacement is ${num(u)} × t. That line never reaches ${num(inputDisplacement)} m: it is heading the other way, or not moving at all.`
          : `The object decelerates, stops after ${num(turningTime)} s having covered ${num(turningDisplacement)} m, and then accelerates back the way it came. ${num(inputDisplacement)} m is further than it ever gets, so no time satisfies s = u·t + ½·a·t². Algebraically the quadratic has a negative discriminant, u² + 2·a·s = ${num(u * u + 2 * a * inputDisplacement)}, and therefore no real root.`,
        CONSTANT_ACCELERATION_NOTE,
        SIGN_NOTE,
      )
      return {
        primary: raw('Time', 'Never reached'),
        stats: [
          mps('Initial velocity (u)', u),
          mps2('Acceleration (a)', acceleration),
          metres('Displacement asked for (s)', inputDisplacement),
          metres('Furthest it actually gets', turningDisplacement),
          seconds('Time at that furthest point', turningTime),
        ],
        steps: [
          mps('Initial velocity u (known)', u),
          mps2('Acceleration a (known)', acceleration),
          metres('Displacement s (known)', inputDisplacement),
          { rule: true },
          ...(a === 0
            ? [
                raw('a = 0, so s = u·t', 'constant velocity'),
                raw('t = s ÷ u has no non-negative solution', 'no answer'),
              ]
            : [
                dec('Discriminant, u² + 2·a·s', u * u + 2 * a * inputDisplacement, 4),
                seconds('Time to stop, −u ÷ a', turningTime),
                metres('Displacement at that moment, −u² ÷ (2a)', turningDisplacement),
              ]),
        ],
        notes,
        series: motionSeries(u, acceleration, turningTime),
        chart: CHART,
      }
    }

    time = solution.t
    velocityFinal = u + acceleration * time
    primary = seconds('Time', time)

    steps.push(
      mps('Initial velocity u (known)', u),
      mps2('Acceleration a (known)', acceleration),
      metres('Displacement s (known)', displacement),
      { rule: true },
    )
    if (acceleration === 0) {
      notes.push(
        `The acceleration is zero, so this is not a quadratic at all: the velocity never changes and s = u·t solves in one division. At ${num(u)} m/s, ${num(displacement)} m takes ${num(time)} s.`,
      )
      steps.push(
        raw('a = 0, so ½·a·t² vanishes and s = u·t', 'constant velocity'),
        seconds('t = s ÷ u', time),
      )
    } else {
      steps.push(
        dec('Rearranged to a·t² + 2u·t − 2s = 0, discriminant u² + 2·a·s', u * u + 2 * acceleration * displacement, 4),
        dec('√(u² + 2·a·s)', Math.sqrt(Math.max(0, u * u + 2 * acceleration * displacement)), 4),
        seconds('Smallest root that is not negative', time),
      )
      if (solution.otherRoot !== undefined) {
        steps.push(seconds('The other root', solution.otherRoot))
        notes.push(
          solution.otherRoot < 0
            ? `A quadratic has two roots, and the other one here is ${num(solution.otherRoot)} s. It is the moment before the clock started at which the object would also have been at ${num(displacement)} m, had it been moving this way all along. Negative times are discarded, which is why the smallest non-negative root is the answer.`
            : `A quadratic has two roots, and the other one here is ${num(solution.otherRoot)} s. Both are real journeys: the object passes ${num(displacement)} m on the way out at ${num(time)} s, turns round, and passes the same point again on the way back. The first crossing is reported as the answer.`,
        )
      }
    }
    steps.push({ rule: true }, mps('v = u + a·t', velocityFinal))
  } else {
    // displacement and finalVelocity read the same three numbers and differ only
    // in which of the two results is the headline.
    acceleration = a
    time = inputTime
    velocityFinal = u + acceleration * time
    displacement = u * time + 0.5 * acceleration * time * time
    primary = mode === 'displacement' ? metres('Displacement', displacement) : mps('Final velocity', velocityFinal)

    steps.push(
      mps('Initial velocity u (known)', u),
      mps2('Acceleration a (known)', acceleration),
      seconds('Time t (known)', time),
      { rule: true },
    )
    if (mode === 'displacement') {
      steps.push(
        metres('Distance at constant u, u × t', u * time),
        metres('Extra from accelerating, ½ × a × t²', 0.5 * acceleration * time * time),
        metres('s = u·t + ½·a·t²', displacement),
        { rule: true },
        mps('v = u + a·t', velocityFinal),
      )
    } else {
      steps.push(
        mps('Change in velocity, a × t', acceleration * time),
        mps('v = u + a·t', velocityFinal),
        { rule: true },
        metres('s = u·t + ½·a·t²', displacement),
      )
    }
  }

  /*
   * The timeless equation (4), which uses no time at all and is therefore a
   * genuinely independent check on whatever route got us here rather than the
   * same expression evaluated twice. It holds to floating-point noise for every
   * mode; a printed mismatch would mean one of the four branches is wrong.
   */
  const timelessCheck = u * u + 2 * acceleration * displacement

  steps.push(
    { rule: true },
    dec('Check: v² = u² + 2·a·s, left side', velocityFinal * velocityFinal, 4),
    dec('Check: right side', timelessCheck, 4),
  )

  notes.push(CONSTANT_ACCELERATION_NOTE, SIGN_NOTE)

  return {
    primary,
    stats: [
      mps('Initial velocity (u)', u),
      mps('Final velocity (v)', velocityFinal),
      mps2('Acceleration (a)', acceleration),
      seconds('Time (t)', time),
      metres('Displacement (s)', displacement),
      mps('Average velocity', time === 0 ? u : displacement / time),
    ],
    steps,
    notes,
    series: motionSeries(u, acceleration, time),
    chart: CHART,
  }
}

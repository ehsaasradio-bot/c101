import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, Series, Values } from '../../../lib/types'
import type { fields } from './fields'

/*
 * The unit-circle definitions, which are the ones that hold for every angle
 * rather than only for the acute angles of a right triangle:
 *
 *     P = (cos θ, sin θ)    the point one unit from the origin, θ from the +x axis
 *
 *     sin θ = y             csc θ = 1 / sin θ
 *     cos θ = x             sec θ = 1 / cos θ
 *     tan θ = y / x         cot θ = x / y
 *
 * SOH-CAH-TOA is the same statement restricted to 0 < θ < 90°, where x and y are
 * the adjacent and opposite sides of a right triangle whose hypotenuse is 1.
 *
 * The inverses return a PRINCIPAL value — the one angle in a chosen window that
 * has the given ratio, since infinitely many angles share it:
 *
 *     arcsin: −90° ≤ θ ≤ 90°     domain −1 ≤ r ≤ 1
 *     arccos:   0° ≤ θ ≤ 180°    domain −1 ≤ r ≤ 1
 *     arctan: −90° < θ < 90°     domain all real r
 *
 * Selects arrive as strings — the derived Values type makes forgetting that a
 * compile error rather than a NaN later.
 */

const MODES = ['ratios', 'arcsin', 'arccos', 'arctan'] as const
type Mode = (typeof MODES)[number]
const isMode = (s: string): s is Mode => (MODES as readonly string[]).includes(s)

const ANGLE_UNITS = ['degrees', 'radians', 'gradians'] as const
type AngleUnit = (typeof ANGLE_UNITS)[number]
const isAngleUnit = (s: string): s is AngleUnit => (ANGLE_UNITS as readonly string[]).includes(s)

/**
 * Radians per one unit of each, applied directly rather than by way of degrees
 * so a radian entry is handed to `Math.sin` exactly as typed.
 */
const RADIANS_PER_UNIT: Readonly<Record<AngleUnit, number>> = {
  degrees: Math.PI / 180,
  radians: 1,
  gradians: Math.PI / 200,
}

/** Degrees per one unit of each. Mirrors the `factor` on the field's variants. */
const DEGREES_PER_UNIT: Readonly<Record<AngleUnit, number>> = {
  degrees: 1,
  radians: 180 / Math.PI,
  gradians: 0.9,
}

/** One degree expressed in each unit — the inverse of the table above. */
const PER_DEGREE: Readonly<Record<AngleUnit, number>> = {
  degrees: 1,
  radians: Math.PI / 180,
  gradians: 10 / 9,
}

const SYMBOL: Readonly<Record<AngleUnit, string>> = {
  degrees: '°',
  radians: 'rad',
  gradians: 'grad',
}

/** A radian is 57 degrees, so it needs more decimals to say the same thing. */
const ANGLE_DECIMALS: Readonly<Record<AngleUnit, number>> = {
  degrees: 4,
  radians: 6,
  gradians: 4,
}

const FULL_TURN_DEGREES = 360

/**
 * Beyond this the argument to `Math.sin` carries fewer significant bits than the
 * answer needs, and the result stops meaning anything. Far outside anything the
 * form can offer — the slider stops at one full turn — so this only ever catches
 * a hand-typed value.
 */
const MAX_DEGREES = 1e9

/**
 * Floating point does not know that sine and cosine have exact values at the
 * angles everyone checks first. `Math.sin(Math.PI)` is 1.2246e-16, not 0, and
 * `Math.sin(Math.PI / 6)` is 0.49999999999999994, not 0.5. Printed raw, a table
 * of trig values reads as noise, and `1 / 1.2246e-16` becomes 8.2e15 where the
 * honest answer is "undefined".
 *
 * Two rules, in order:
 *
 *  1. Anything under 1e-12 is residue from an exact zero. The smallest angle the
 *     form can express is a hundredth of a gradian, whose sine is 1.6e-4, so
 *     nothing a visitor can enter has a genuine ratio that small.
 *  2. Otherwise round to twelve significant figures and keep the rounding only
 *     if it moved the value by less than one part in 1e15 — the last ulp or two.
 *     cos 30° stays 0.8660254037844387 rather than being truncated, because that
 *     value needs every digit it has.
 */
const NEAR_ZERO = 1e-12

function snap(x: number): number {
  if (!Number.isFinite(x)) return x
  // Also normalises -0, which would otherwise print as "-0.000000": tan 180° is
  // 0 / −1, and IEEE 754 gives that a sign.
  if (Math.abs(x) < NEAR_ZERO) return 0
  const rounded = Number(x.toPrecision(12))
  return Math.abs(x - rounded) <= 1e-15 * Math.abs(x) ? rounded : x
}

/*
 * A pole is a statement about the function, not a number, and printing
 * 16,331,239,353,195,370 for tan 90° would be worse than useless — note that
 * `Number.isFinite` is perfectly happy with it, so a finiteness check cannot
 * catch this. The poles are found from the snapped sine and cosine instead: a
 * ratio whose denominator is exactly zero has no value at all.
 */
const UNDEFINED_AT_COS_ZERO = 'Undefined (cos θ = 0)'
const UNDEFINED_AT_SIN_ZERO = 'Undefined (sin θ = 0)'

/** `null` means the ratio has a pole here; `why` is what the reader sees instead. */
function ratioStat(label: string, value: number | null, why: string): Quantity {
  if (value === null) return { label, value: why, format: { style: 'raw' } }
  return {
    label,
    value,
    // A tangent near vertical runs to five and six figures; six decimals on top
    // of that is precision the double no longer has.
    format: { style: 'decimal', decimals: Math.abs(value) >= 1000 ? 3 : 6 },
  }
}

function angleStat(label: string, degrees: number, unit: AngleUnit): Quantity {
  return {
    label,
    value: snap(degrees * PER_DEGREE[unit]),
    format: { style: 'decimal', decimals: ANGLE_DECIMALS[unit], unit: SYMBOL[unit] },
  }
}

/**
 * Which quadrant the terminal side falls in, read off the signs of the snapped
 * coordinates rather than off the angle — so it can never disagree with the
 * ratios printed beside it. The parenthetical is the CAST rule: which of the
 * three primary ratios are positive there.
 */
function quadrantOf(sin: number, cos: number): string {
  if (sin === 0) return cos > 0 ? 'On the positive x-axis' : 'On the negative x-axis'
  if (cos === 0) return sin > 0 ? 'On the positive y-axis' : 'On the negative y-axis'
  if (sin > 0) return cos > 0 ? 'I — sin, cos and tan all positive' : 'II — only sin is positive'
  return cos < 0 ? 'III — only tan is positive' : 'IV — only cos is positive'
}

/**
 * Sine and cosine over one full turn, on the x axis the visitor is already
 * reading — degrees if that is what they typed, radians if not.
 *
 * Tangent is deliberately absent. Its asymptotes reach 1.6e16 at 90°, which
 * would flatten both waves onto the zero line and make the chart useless; the
 * six values are in the stats, where a pole can say so in words.
 */
const CHART_STEP_DEGREES = 10

function waves(unit: AngleUnit): Series[] {
  const sinPoints: Array<readonly [number, number]> = []
  const cosPoints: Array<readonly [number, number]> = []
  for (let deg = 0; deg <= FULL_TURN_DEGREES; deg += CHART_STEP_DEGREES) {
    const x = snap(deg * PER_DEGREE[unit])
    const rad = deg * RADIANS_PER_UNIT.degrees
    sinPoints.push([x, snap(Math.sin(rad))])
    cosPoints.push([x, snap(Math.cos(rad))])
  }
  return [
    { label: 'sin θ', points: sinPoints, format: { style: 'decimal', decimals: 3 } },
    { label: 'cos θ', points: cosPoints, format: { style: 'decimal', decimals: 3 } },
  ]
}

export default function compute(v: Values<typeof fields>): CalcResult {
  if (!isMode(v.mode)) throw new CalcError('Choose what you already know.', 'mode')
  const mode: Mode = v.mode

  if (!isAngleUnit(v.angleUnit)) throw new CalcError('Choose an angle unit.', 'angleUnit')
  const unit: AngleUnit = v.angleUnit

  /*
   * Finiteness is checked BEFORE magnitude, always. `coerceValues` hands compute
   * a raw NaN for anything the form could not parse, and every ordinary
   * comparison against NaN is false — so `Math.abs(x) > MAX_DEGREES` would be
   * false too, and the NaN would walk straight into Math.sin and surface on the
   * page.
   *
   * Only the box the chosen mode actually reads is validated. The other one is
   * still on screen holding whatever it held, and refusing to answer because of
   * a number nobody asked about would be surprising.
   */
  let radians: number
  if (mode === 'ratios') {
    if (!Number.isFinite(v.angle)) throw new CalcError('Enter the angle as a number.', 'angle')
    if (Math.abs(v.angle * DEGREES_PER_UNIT[unit]) > MAX_DEGREES) {
      throw new CalcError(
        'That angle is too large to evaluate accurately — keep it within a billion degrees.',
        'angle',
      )
    }
    radians = v.angle * RADIANS_PER_UNIT[unit]
  } else {
    if (!Number.isFinite(v.ratio)) throw new CalcError('Enter the ratio as a number.', 'ratio')
    if (mode !== 'arctan' && Math.abs(v.ratio) > 1) {
      const name = mode === 'arcsin' ? 'sine' : 'cosine'
      throw new CalcError(
        `The ${name} of an angle is never outside −1 to 1, so there is no angle with that ${name}.`,
        'ratio',
      )
    }
    radians =
      mode === 'arcsin'
        ? Math.asin(v.ratio)
        : mode === 'arccos'
          ? Math.acos(v.ratio)
          : Math.atan(v.ratio)
  }

  const degrees = snap(radians * DEGREES_PER_UNIT.radians)

  // The coordinates of the point on the unit circle. Everything below is these
  // two numbers and nothing else, which is what keeps the six ratios, the
  // quadrant and the coordinates from ever disagreeing with one another.
  const sin = snap(Math.sin(radians))
  const cos = snap(Math.cos(radians))

  const tan = cos === 0 ? null : snap(sin / cos)
  const sec = cos === 0 ? null : snap(1 / cos)
  const csc = sin === 0 ? null : snap(1 / sin)
  const cot = sin === 0 ? null : snap(cos / sin)

  // A coterminal angle has identical ratios, so 400° is answered as 40°.
  const coterminal = ((degrees % FULL_TURN_DEGREES) + FULL_TURN_DEGREES) % FULL_TURN_DEGREES
  // The acute angle to the x axis, which is what a reference-angle table is
  // indexed by: every ratio of θ is the ratio of its reference angle, up to sign.
  const reference =
    coterminal <= 90
      ? coterminal
      : coterminal <= 180
        ? 180 - coterminal
        : coterminal <= 270
          ? coterminal - 180
          : FULL_TURN_DEGREES - coterminal

  const INVERSE_STEP: Readonly<Record<Exclude<Mode, 'ratios'>, string>> = {
    arcsin: 'θ = arcsin(r)',
    arccos: 'θ = arccos(r)',
    arctan: 'θ = arctan(r)',
  }

  const given: Quantity[] =
    mode === 'ratios'
      ? [angleStat('Angle θ (given)', degrees, unit)]
      : [
          { label: 'Ratio r (given)', value: v.ratio, format: { style: 'decimal', decimals: 6 } },
          angleStat(INVERSE_STEP[mode], degrees, unit),
        ]

  const notes: string[] = [
    'Every value here is read off the unit circle: sin θ is the y-coordinate of the point θ from the positive x-axis, cos θ is the x-coordinate, and tan θ is y ÷ x. On an acute angle that is exactly SOH-CAH-TOA, with the hypotenuse scaled to 1.',
  ]
  if (mode !== 'ratios') {
    notes.push(
      'An inverse function returns the principal value — one angle out of infinitely many, because θ and θ + 360°k share every ratio. arcsin and arctan answer in −90° to 90°; arccos answers in 0° to 180°. The second solution in a full turn is 180° − θ for a sine, −θ for a cosine, and θ + 180° for a tangent.',
    )
  }
  if (tan === null) {
    notes.push(
      'The terminal side is vertical here, so the point on the unit circle has x = 0. Tangent is y ÷ x and secant is 1 ÷ x, and neither has a value when x is zero — they do not merely get large, they have a pole. A calculator that prints 1.6e16 for tan 90° is reporting the rounding error in π ÷ 2, not a tangent.',
    )
  }
  if (csc === null) {
    notes.push(
      'The terminal side lies along the x-axis here, so the point on the unit circle has y = 0. Cosecant is 1 ÷ y and cotangent is x ÷ y, and neither has a value when y is zero. Sine, cosine, tangent and secant are all perfectly ordinary at this angle.',
    )
  }

  return {
    primary:
      mode === 'ratios'
        ? ratioStat('sin θ', sin, UNDEFINED_AT_SIN_ZERO)
        : angleStat(`Angle (${mode})`, degrees, unit),
    // Always all six, in the same order, whichever direction you came from —
    // that completeness is the point of the table.
    stats: [
      ratioStat('sin θ', sin, UNDEFINED_AT_SIN_ZERO),
      ratioStat('cos θ', cos, UNDEFINED_AT_COS_ZERO),
      ratioStat('tan θ', tan, UNDEFINED_AT_COS_ZERO),
      ratioStat('csc θ', csc, UNDEFINED_AT_SIN_ZERO),
      ratioStat('sec θ', sec, UNDEFINED_AT_COS_ZERO),
      ratioStat('cot θ', cot, UNDEFINED_AT_SIN_ZERO),
    ],
    steps: [
      ...given,
      { rule: true },
      angleStat('θ in degrees', degrees, 'degrees'),
      angleStat('θ in radians', degrees, 'radians'),
      angleStat('θ in gradians', degrees, 'gradians'),
      { rule: true },
      { label: 'Quadrant', value: quadrantOf(sin, cos), format: { style: 'raw' } },
      angleStat('Coterminal angle in one turn', coterminal, unit),
      angleStat('Reference angle', reference, unit),
      { rule: true },
      ratioStat('Unit circle x = cos θ', cos, UNDEFINED_AT_COS_ZERO),
      ratioStat('Unit circle y = sin θ', sin, UNDEFINED_AT_SIN_ZERO),
    ],
    series: waves(unit),
    // `waves` plots the turn in whichever unit was selected, so the axis has to
    // be named the same way — a curve labelled "Angle (°)" that runs to 400 grad
    // would be a lie the moment the select moved.
    chart: {
      title: 'Sine and cosine through one full turn',
      xLabel: `Angle (${SYMBOL[unit]})`,
    },
    notes,
  }
}

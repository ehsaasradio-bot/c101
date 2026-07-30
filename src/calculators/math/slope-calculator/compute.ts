import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, Values } from '../../../lib/types'
import type { fields } from './fields'

const RAD_TO_DEG = 180 / Math.PI

/**
 * Renders a coordinate or a coefficient for inclusion in a text expression.
 * Trimmed to a sane precision and with `-0` normalised away, so an equation
 * reads `y = 0.75x + 2` rather than `y = 0.750000x + 2.000000`.
 */
function num(n: number): string {
  const rounded = Number(n.toFixed(6)) + 0
  return String(rounded === 0 ? 0 : rounded)
}

const dec = (label: string, value: number, decimals = 6): Quantity => ({
  label,
  value,
  format: { style: 'decimal', decimals },
})

const raw = (label: string, value: string): Quantity => ({
  label,
  value,
  format: { style: 'raw' },
})

const degrees = (label: string, value: number): Quantity => ({
  label,
  value,
  format: { style: 'decimal', decimals: 4, unit: '°' },
})

/** Euclid's algorithm on absolute values, used to put rise:run in lowest terms. */
function gcd(a: number, b: number): number {
  let x = Math.abs(a)
  let y = Math.abs(b)
  while (y !== 0) {
    const t = x % y
    x = y
    y = t
  }
  return x === 0 ? 1 : x
}

/**
 * Slope-intercept form, written the way a person writes it: no `1x`, no
 * `+ -3`, and no `0x` term on a horizontal line.
 */
function equationText(m: number, b: number): string {
  if (m === 0) return `y = ${num(b)}`
  const slopePart = m === 1 ? 'x' : m === -1 ? '-x' : `${num(m)}x`
  if (b === 0) return `y = ${slopePart}`
  return `y = ${slopePart} ${b < 0 ? '-' : '+'} ${num(Math.abs(b))}`
}

/**
 * Rise : run, the form a roofer or a ramp builder actually reads.
 *
 * The line is traversed so the run is positive — a slope is unchanged by
 * walking the line backwards, and "3 : -4" would read as a different line.
 * Whole-number coordinates reduce exactly (6 and 8 become 3 : 4); anything else
 * is stated as one unit of rise per k of run, which is the 1:12 convention used
 * for accessible ramps.
 */
function ratioText(rise: number, run: number): string {
  let r = rise
  let n = run
  if (n < 0) {
    r = -r
    n = -n
  }
  if (r === 0) return '0 : 1'
  if (Number.isInteger(r) && Number.isInteger(n)) {
    const g = gcd(r, n)
    return `${num(r / g)} : ${num(n / g)}`
  }
  const perUnitRise = n / Math.abs(r)
  return `${r > 0 ? '1' : '-1'} : ${num(perUnitRise)}`
}

export default function compute(v: Values<typeof fields>): CalcResult {
  const { x1, y1, x2, y2 } = v

  // Guard finiteness FIRST: coerceValues emits NaN for unparseable input, and a
  // comparison like `x1 === x2` is false for NaN, so an unguarded NaN would sail
  // past the vertical-line branch and produce a NaN slope.
  for (const [id, value] of [
    ['x1', x1],
    ['y1', y1],
    ['x2', x2],
    ['y2', y2],
  ] as const) {
    if (!Number.isFinite(value)) throw new CalcError(`Enter a number for ${id}.`, id)
  }

  const rise = y2 - y1
  const run = x2 - x1

  // Two copies of the same point name a location, not a line: every line
  // through it is equally valid, so there is no slope to report. This is a
  // genuine refusal, unlike the vertical case below which has a real answer.
  if (run === 0 && rise === 0) {
    throw new CalcError(
      'Both points are the same, so they do not pick out a single line. Move one of them.',
      'x2',
    )
  }

  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const midpoint = `(${num(midX)}, ${num(midY)})`

  // A VERTICAL LINE IS AN ANSWER, NOT AN ERROR. The run is zero, so rise ÷ run
  // is undefined — not Infinity, which would claim a limit the two points do not
  // establish, and not a thrown error, which would hide a perfectly good line.
  // Every figure that still exists is reported: the line is x = x1, its
  // inclination is exactly 90°, and the distance is the bare rise.
  if (run === 0) {
    const lineEquation = `x = ${num(x1)}`
    const distance = Math.abs(rise)

    return {
      primary: {
        label: 'Slope',
        value: `Undefined — the line is vertical (${lineEquation})`,
        format: { style: 'raw' },
      },
      stats: [
        raw('Line equation', lineEquation),
        raw(
          'Y-intercept b',
          x1 === 0
            ? 'This line is the y-axis itself, so it meets the axis everywhere'
            : 'None — a vertical line never crosses the y-axis',
        ),
        degrees('Angle of inclination', 90),
        dec('Distance between the points', distance),
        raw('Midpoint', midpoint),
        raw('Grade', 'Undefined — the run is zero'),
        raw('Rise : run ratio', 'Undefined — there is no run'),
      ],
      steps: [
        raw('First point (x₁, y₁)', `(${num(x1)}, ${num(y1)})`),
        raw('Second point (x₂, y₂)', `(${num(x2)}, ${num(y2)})`),
        { rule: true },
        dec('Rise = y₂ − y₁', rise),
        dec('Run = x₂ − x₁', run),
        raw('Slope m = rise ÷ run', 'Undefined — dividing by a run of zero has no value'),
        { rule: true },
        raw('Line equation', lineEquation),
        degrees('Angle of inclination', 90),
        dec('Distance = |rise|', distance),
        raw('Midpoint', midpoint),
      ],
      notes: [
        'A vertical line has undefined slope. It is not infinitely steep in any usable sense — rise ÷ run divides by zero, so no number describes it — and it cannot be written as y = mx + b at all. Its equation is x = a constant.',
        'This is a different thing from a horizontal line, which has a slope of exactly 0: there the rise is zero and the run is not, so the division is perfectly ordinary and the answer is a real number.',
        'The distance and the midpoint survive because both come from the coordinates directly rather than from the slope.',
      ],
    }
  }

  const slope = rise / run
  // b is read straight off the point-slope form y − y₁ = m(x − x₁) at x = 0.
  const intercept = y1 - slope * x1
  // Angle of inclination, measured from the positive x-axis: (-90°, 90°).
  // Downhill lines report a negative angle rather than an obtuse one.
  const angle = Math.atan(slope) * RAD_TO_DEG
  const distance = Math.hypot(run, rise)
  const grade = slope * 100
  const lineEquation = equationText(slope, intercept)

  return {
    primary: {
      label: 'Slope',
      value: slope,
      format: { style: 'decimal', decimals: 6 },
    },
    stats: [
      raw('Line equation', lineEquation),
      dec('Y-intercept b', intercept),
      degrees('Angle of inclination', angle),
      dec('Distance between the points', distance),
      raw('Midpoint', midpoint),
      { label: 'Grade', value: grade, format: { style: 'percent', decimals: 2 } },
      raw('Rise : run ratio', ratioText(rise, run)),
    ],
    steps: [
      raw('First point (x₁, y₁)', `(${num(x1)}, ${num(y1)})`),
      raw('Second point (x₂, y₂)', `(${num(x2)}, ${num(y2)})`),
      { rule: true },
      dec('Rise = y₂ − y₁', rise),
      dec('Run = x₂ − x₁', run),
      dec('Slope m = rise ÷ run', slope),
      { rule: true },
      dec('b = y₁ − m × x₁', intercept),
      raw('Equation y = mx + b', lineEquation),
      { rule: true },
      degrees('Angle = atan(m)', angle),
      dec('Distance = √(rise² + run²)', distance),
      raw('Midpoint = ((x₁+x₂)/2, (y₁+y₂)/2)', midpoint),
      { label: 'Grade = m × 100', value: grade, format: { style: 'percent', decimals: 2 } },
      raw('Rise : run', ratioText(rise, run)),
    ],
    notes: [
      'The slope is the same whichever point you enter first: swapping them negates both the rise and the run, and the two minus signs cancel.',
      'Grade is the slope written as a percentage, so a slope of 0.08 is an 8% grade — the figure on a road sign. The rise:run ratio says the same thing the way a builder does, with 1:12 being the usual maximum for a wheelchair ramp.',
      'A slope of exactly 0 means a horizontal line, y = a constant. That is a real number and quite different from a vertical line, whose slope is undefined because its run is zero.',
    ],
  }
}

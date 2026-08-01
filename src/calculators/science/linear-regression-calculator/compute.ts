import { CalcError } from '../../../lib/types'
import type { CalcResult, Part, Quantity, Series, StepRule, Values } from '../../../lib/types'
import type { fields } from './fields'

/**
 * Ordinary least squares for a single predictor — the line that minimises the
 * sum of the squared vertical distances from the points to it.
 *
 * The normal equations give it in closed form:
 *
 *   b = Sxy / Sxx,  a = ȳ − b·x̄
 *
 * where Sxx = Σ(x − x̄)², Sxy = Σ(x − x̄)(y − ȳ) and Syy = Σ(y − ȳ)². The
 * centred sums are used rather than the algebraically identical Σxy − nx̄ȳ form,
 * which subtracts two large nearly-equal numbers and loses most of its
 * significant digits on data far from the origin. `average-calculator` avoids
 * the same trap for the variance.
 *
 * The variance decomposition SST = SSR + SSE then follows, with SSR = b·Sxy, and
 * R² = SSR / SST is the share of the variation in y the line accounts for.
 */

const DEC = { style: 'decimal', decimals: 6 } as const
const SS = { style: 'decimal', decimals: 4 } as const

/** Trims to a sane precision and normalises -0, so an equation reads `ŷ = 0.19 + 1.95x`. */
function num(n: number): string {
  const rounded = Number(n.toFixed(6)) + 0
  return String(rounded === 0 ? 0 : rounded)
}

const dec = (label: string, value: number): Quantity => ({ label, value, format: DEC })
const ss = (label: string, value: number): Quantity => ({ label, value, format: SS })
const raw = (label: string, value: string): Quantity => ({ label, value, format: { style: 'raw' } })

const RULE: StepRule = { rule: true }

/**
 * Splits on commas, semicolons, and any run of whitespace — the three ways
 * people actually paste a column of numbers out of a spreadsheet. `kind: 'text'`
 * is a single-line input, so the newlines in such a paste may already have been
 * flattened to spaces by the time this sees it; both cases parse the same.
 */
function parseList(input: string, fieldId: string, name: string): number[] {
  const tokens = input.split(/[\s,;]+/).filter((token) => token.length > 0)
  const values: number[] = []
  for (const token of tokens) {
    const value = Number(token)
    // Number('') is 0 and Number('3kg') is NaN — the filter above handles the
    // first, and anything still not finite is genuinely not a number.
    if (!Number.isFinite(value)) {
      throw new CalcError(`"${token}" in the ${name} is not a number. Separate values with commas or spaces.`, fieldId)
    }
    values.push(value)
  }
  if (values.length === 0) throw new CalcError(`Enter the ${name}.`, fieldId)
  return values
}

/** `ŷ = a + bx`, written the way a person writes it: no `1x`, no `+ -3`. */
function equationText(intercept: number, slope: number): string {
  const magnitude = Math.abs(slope)
  const slopePart = magnitude === 1 ? 'x' : `${num(magnitude)}x`
  const sign = slope < 0 ? '−' : '+'
  if (slope === 0) return `ŷ = ${num(intercept)}`
  if (intercept === 0) return `ŷ = ${slope < 0 ? '−' : ''}${slopePart}`
  return `ŷ = ${num(intercept)} ${sign} ${slopePart}`
}

/** Points on the fitted line, spanning the data and the prediction. */
const LINE_POINTS = 41

export default function compute(v: Values<typeof fields>): CalcResult {
  const { predictX } = v

  // Guard finiteness FIRST: coerceValues emits NaN for unparseable input, and a
  // magnitude test like `predictX < min` is false for NaN, so an unguarded NaN
  // would sail through and land in the headline.
  if (!Number.isFinite(predictX)) {
    throw new CalcError('Enter a number for the x value to predict at.', 'predictX')
  }

  const xs = parseList(v.xValues, 'xValues', 'x values')
  const ys = parseList(v.yValues, 'yValues', 'y values')

  if (xs.length !== ys.length) {
    throw new CalcError(
      `Every x needs a y. There are ${xs.length} x value${xs.length === 1 ? '' : 's'} and ${ys.length} y value${ys.length === 1 ? '' : 's'}.`,
      'yValues',
    )
  }
  const n = xs.length
  if (n < 2) {
    throw new CalcError('A line needs at least two points. Enter more data.', 'xValues')
  }

  const meanX = xs.reduce((sum, x) => sum + x, 0) / n
  const meanY = ys.reduce((sum, y) => sum + y, 0) / n

  let sxx = 0
  let sxy = 0
  let syy = 0
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i]! - meanX
    const dy = ys[i]! - meanY
    sxx += dx * dx
    sxy += dx * dy
    syy += dy * dy
  }

  // A vertical scatter has no least-squares line: b = Sxy / Sxx divides by zero,
  // and no straight line of the form y = a + bx can be fitted to it at all. This
  // is a refusal rather than an answer, unlike slope-calculator's vertical case
  // where x = a constant is still a perfectly good line through two points.
  if (!(sxx > 0)) {
    throw new CalcError(
      'Every x value is the same, so the points sit on a vertical line and there is no least-squares slope. Vary the x values.',
      'xValues',
    )
  }

  const slope = sxy / sxx
  const intercept = meanY - slope * meanX
  const prediction = intercept + slope * predictX

  const sst = syy
  const ssr = slope * sxy

  // Derived by subtraction and clamped, so the two parts sum to SST by
  // construction rather than by luck. An independently computed Σ(y − ŷ)² lands
  // a hair either side on round numbers — a perfect fit produced -5.7e-17 in a
  // sibling calculator, which fails the non-negative check on `parts`.
  const explained = Math.min(Math.max(0, ssr), sst)
  const unexplained = Math.max(0, sst - explained)

  const hasSpreadInY = sst > 0
  const rSquared = hasSpreadInY ? explained / sst : undefined
  const r = hasSpreadInY ? sxy / Math.sqrt(sxx * syy) : undefined
  // n − 2 degrees of freedom: two were spent estimating the slope and the
  // intercept. With exactly two points there are none left, and the residual
  // standard error is undefined rather than zero.
  const standardError = n > 2 ? Math.sqrt(unexplained / (n - 2)) : undefined
  const slopeError = standardError === undefined ? undefined : standardError / Math.sqrt(sxx)

  const equation = equationText(intercept, slope)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const extrapolating = predictX < minX || predictX > maxX

  /*
   * THE FITTED LINE, NEVER THE RAW POINTS.
   *
   * The conformance suite requires strictly increasing x in a series, and
   * duplicate x values are perfectly ordinary regression data — measuring three
   * plants at week 2 is the normal case, not an edge one. Sorting the scatter
   * would not save it, because a repeat would still tie. The fitted line's x is
   * monotone by construction, and it is also the thing worth drawing: the answer,
   * over the range that includes the prediction.
   */
  const lo = Math.min(minX, predictX)
  const hi = Math.max(maxX, predictX)
  const points: Array<readonly [number, number]> = []
  for (let i = 0; i < LINE_POINTS; i += 1) {
    const x = i === LINE_POINTS - 1 ? hi : lo + ((hi - lo) * i) / (LINE_POINTS - 1)
    // Strictly increasing, even if lo and hi are close enough that the steps
    // round onto one another.
    if (points.length > 0 && !(x > points[points.length - 1]![0])) continue
    points.push([x, intercept + slope * x])
  }
  const series: Series[] = points.length > 1 ? [{ label: 'Fitted line', points, format: DEC }] : []

  const stats: Quantity[] = [
    raw('Equation of the line', equation),
    dec('Slope b', slope),
    dec('Intercept a', intercept),
    r === undefined
      ? raw('Correlation r', 'Undefined — every y value is identical')
      : dec('Correlation r', r),
    rSquared === undefined
      ? raw('R² (variation explained)', 'Undefined — y has no variation to explain')
      : dec('R² (variation explained)', rSquared),
    standardError === undefined
      ? raw('Standard error of the estimate', 'Undefined — two points leave no degrees of freedom')
      : dec('Standard error of the estimate', standardError),
    slopeError === undefined
      ? raw('Standard error of the slope', 'Undefined — needs at least three points')
      : dec('Standard error of the slope', slopeError),
    { label: 'Points used', value: n, format: { style: 'decimal', decimals: 0 } },
  ]

  const steps: (Quantity | StepRule)[] = [
    { label: 'Points used (n)', value: n, format: { style: 'decimal', decimals: 0 } },
    dec('Mean of x (x̄)', meanX),
    dec('Mean of y (ȳ)', meanY),
    RULE,
    ss('Sxx = Σ(x − x̄)²', sxx),
    ss('Sxy = Σ(x − x̄)(y − ȳ)', sxy),
    ss('Syy = Σ(y − ȳ)² — this is SST', syy),
    RULE,
    dec('Slope b = Sxy ÷ Sxx', slope),
    dec('Intercept a = ȳ − b × x̄', intercept),
    raw('Least-squares line', equation),
    RULE,
    ss('SSR (explained) = b × Sxy', explained),
    ss('SSE (unexplained) = SST − SSR', unexplained),
  ]
  if (rSquared !== undefined) steps.push(dec('R² = SSR ÷ SST', rSquared))
  if (r !== undefined) steps.push(dec('r = Sxy ÷ √(Sxx × Syy)', r))
  if (standardError !== undefined) {
    steps.push(RULE, dec('Standard error s = √(SSE ÷ (n − 2))', standardError))
  }
  steps.push(
    RULE,
    dec(`ŷ at x = ${num(predictX)} is a + b × ${num(predictX)}`, prediction),
  )

  // No proportion to draw when y does not vary: two zero slices adding to zero
  // is not a decomposition, it is an empty ring.
  const parts: Part[] = hasSpreadInY
    ? [
        { label: 'Explained by the line (SSR)', value: explained, format: SS },
        { label: 'Unexplained residual (SSE)', value: unexplained, format: SS },
      ]
    : []

  const notes: string[] = [
    'This fits one line through every point you enter, by least squares — the line that makes the total of the squared vertical gaps as small as possible. That is a different job from the slope calculator, which draws the exact line through two given points and needs no fitting at all. With exactly two points here, the two agree: the least-squares line passes through both, and the residuals are zero.',
  ]
  if (extrapolating) {
    notes.push(
      `Your x values run from ${num(minX)} to ${num(maxX)}, so a prediction at ${num(predictX)} sits outside the data. The line is only evidence about the range it was fitted over; beyond that it is an assumption that the same straight relationship continues.`,
    )
  }
  if (rSquared !== undefined) {
    notes.push(
      'R² says how much of the variation in y the line accounts for, and nothing about whether x causes y. A high R² on a badly chosen model is common — always look at whether the points actually lie along a line rather than a curve.',
    )
  }
  if (!hasSpreadInY) {
    notes.push(
      'Every y value is identical, so there is no variation for a line to explain. The best fit is the flat line at that value, and r and R² are undefined rather than zero because both divide by a spread of zero.',
    )
  }

  return {
    primary: {
      label: `Predicted y at x = ${num(predictX)}`,
      value: prediction,
      format: { style: 'decimal', decimals: 4 },
    },
    stats,
    steps,
    parts,
    partsTotal: { label: 'Total variation in y (SST)', value: sst, format: SS },
    series,
    // The predictor, whatever it happens to measure — this calculator is handed
    // two bare columns of numbers and is never told what they are.
    chart: { title: 'The fitted line through your data', xLabel: 'x' },
    notes,
  }
}

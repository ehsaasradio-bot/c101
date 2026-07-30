import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, StepRule, Values } from '../../../lib/types'
import type { fields } from './fields'

/**
 * The standard score, z = (x − μ) / σ, plus where that lands under the standard
 * normal curve.
 *
 * The z-score itself is one subtraction and one division. The interesting half
 * is Φ(z), the cumulative distribution function of the standard normal — the
 * area to the left of z, which is the percentile. Φ has no elementary closed
 * form, so it has to be approximated.
 */

// ── The normal CDF ────────────────────────────────────────────────────────
//
// Abramowitz & Stegun, *Handbook of Mathematical Functions* (1964), formula
// 26.2.17:
//
//   Q(x) = 1 − Φ(x) ≈ φ(x)·(b₁t + b₂t² + b₃t³ + b₄t⁴ + b₅t⁵),
//   t = 1 / (1 + px),   x ≥ 0
//
// with the stated error bound |ε(x)| < 7.5 × 10⁻⁸. That bound is asserted in
// compute.test.ts two independent ways — against published z-table values and
// against Simpson's rule over the density — so the accuracy here is pinned
// rather than assumed. The observed maximum deviation is 7.45e-8, at z ≈ −0.72.
//
// The published coefficients, unrounded:
const P = 0.2316419
const B1 = 0.319381530
const B2 = -0.356563782
const B3 = 1.781477937
const B4 = -1.821255978
const B5 = 1.330274429

/** 1 / √(2π), the normalising constant of the standard normal density. */
const INV_SQRT_TWO_PI = 0.3989422804014327

/** φ(x), the standard normal probability density. */
export function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) * INV_SQRT_TWO_PI
}

/**
 * The upper tail Q(x) = 1 − Φ(x), for x ≥ 0 only — which is the half A&S
 * 26.2.17 is stated for.
 *
 * Computing the tail directly rather than as `1 - cdf(x)` keeps the small
 * probabilities that matter (a two-tailed p of 0.0027 at z = 3) from being
 * ground away by cancellation against 1.
 *
 * At large x, `normalPdf` underflows to exactly 0 and this returns 0 — the
 * right answer, and never a NaN.
 */
export function normalUpperTail(x: number): number {
  const t = 1 / (1 + P * x)
  // Horner form: b₁t + b₂t² + ... + b₅t⁵ = t(b₁ + t(b₂ + t(b₃ + t(b₄ + t·b₅))))
  const poly = t * (B1 + t * (B2 + t * (B3 + t * (B4 + t * B5))))
  return normalPdf(x) * poly
}

/**
 * Φ(z): the area under the standard normal curve to the left of z.
 *
 * Reflected through |z| rather than approximated separately on each side, which
 * makes Φ(−z) = 1 − Φ(z) true by construction and not merely to within the
 * approximation's error.
 */
export function normalCdf(z: number): number {
  const tail = normalUpperTail(Math.abs(z))
  return z >= 0 ? 1 - tail : tail
}

// ── Copy helpers ──────────────────────────────────────────────────────────

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st. */
function ordinal(n: number): string {
  const lastTwo = n % 100
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`
  const last = n % 10
  return `${n}${last === 1 ? 'st' : last === 2 ? 'nd' : last === 3 ? 'rd' : 'th'}`
}

/**
 * A number as a person would write it: no trailing zeros, no locale lookup.
 * `toLocaleString` is avoided deliberately — compute runs once in Node at build
 * time and again in the browser, and the two strings have to match.
 */
function plain(n: number): string {
  return String(Number(n.toFixed(4)))
}

const NUM = { style: 'decimal', decimals: 4 } as const
const PCT = { style: 'percent', decimals: 2 } as const

export default function compute(v: Values<typeof fields>): CalcResult {
  const { value, mean, standardDeviation } = v

  // Guard finiteness first: coerceValues emits NaN for unparseable input, and a
  // magnitude test like `standardDeviation <= 0` is false for NaN, so it would
  // slip straight through to a NaN result.
  if (!Number.isFinite(value)) throw new CalcError('Enter a number for your value.', 'value')
  if (!Number.isFinite(mean)) throw new CalcError('Enter a number for the mean.', 'mean')
  if (!Number.isFinite(standardDeviation))
    throw new CalcError('Enter a number for the standard deviation.', 'standardDeviation')

  // A spread of zero means every observation equals the mean, so "how many
  // standard deviations away" has no answer — the division is 0/0 for a value
  // at the mean and infinite for any other. Negative spread is not a quantity.
  if (standardDeviation <= 0)
    throw new CalcError(
      'Standard deviation must be greater than 0. A spread of zero leaves no scale to measure distance against.',
      'standardDeviation',
    )

  const deviation = value - mean
  const z = deviation / standardDeviation

  // Percentages are carried as percentage points (91.92 → "91.92%"), which is
  // what `format.ts` expects for style: 'percent'.
  const percentile = normalCdf(z)
  const areaRight = 1 - percentile
  // Both tails of |z|. Taken from the tail function directly rather than as
  // 2 × (1 − percentile), which would lose precision for large positive z.
  const twoTailedP = 2 * normalUpperTail(Math.abs(z))

  const stats: Quantity[] = [
    { label: 'Percentile (area to the left)', value: percentile * 100, format: PCT },
    { label: 'Area to the right', value: areaRight * 100, format: PCT },
    { label: 'Two-tailed p-value', value: twoTailedP, format: NUM },
    { label: 'Distance from the mean', value: deviation, format: NUM },
    { label: 'Standard deviations away', value: Math.abs(z), format: NUM },
  ]

  const steps: Array<Quantity | StepRule> = [
    { label: 'Your value (x)', value, format: NUM },
    { label: 'Mean (μ)', value: mean, format: NUM },
    { label: 'Deviation (x − μ)', value: deviation, format: NUM },
    { label: 'Standard deviation (σ)', value: standardDeviation, format: NUM },
    { label: 'z = (x − μ) ÷ σ', value: z, format: NUM },
    // Everything below the rule comes from the normal curve rather than from
    // arithmetic on the inputs.
    { rule: true },
    { label: 'Φ(z), area to the left', value: percentile * 100, format: PCT },
    { label: '1 − Φ(z), area to the right', value: areaRight * 100, format: PCT },
    { label: 'Two-tailed p = 2 × (1 − Φ(|z|))', value: twoTailedP, format: NUM },
  ]

  // The sentence that makes the page useful: not "z = 1.4" but "you scored
  // higher than 92% of the group".
  const pct = percentile * 100
  const rank = Math.round(pct)
  const place =
    rank >= 1 && rank <= 99
      ? `, which is the ${ordinal(rank)} percentile`
      : rank < 1
        ? ', which is the bottom 1% of the distribution'
        : ', which is the top 1% of the distribution'

  const headline =
    z === 0
      ? `${plain(value)} is exactly the mean, so it sits at the 50th percentile — half the distribution is above it and half below.`
      : `${plain(value)} is ${plain(Math.abs(z))} standard deviations ${z > 0 ? 'above' : 'below'} the mean. About ${pct.toFixed(1)}% of a normal distribution falls below it${place}.`

  return {
    primary: { label: 'Z-score', value: z, format: NUM },
    stats,
    steps,
    scaleValue: z,
    notes: [
      headline,
      'The percentile, the tail areas, and the p-value all assume the underlying data is normally distributed. The z-score itself does not — it is just a distance, measured in standard deviations.',
    ],
  }
}

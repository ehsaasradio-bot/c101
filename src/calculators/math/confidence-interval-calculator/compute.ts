import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, Series, StepRule, Values } from '../../../lib/types'
import type { fields } from './fields'

/**
 * A confidence interval for a population mean:
 *
 *   x̄ ± c × (s / √n)
 *
 * where c is the critical value that puts (1 − α)/… of the distribution's mass
 * between −c and +c. Everything on this page is the arithmetic around that one
 * line, plus the part almost every calculator gets wrong: **which distribution
 * c comes from**.
 *
 * ── z or t ────────────────────────────────────────────────────────────────
 *
 * If σ is genuinely known — measured elsewhere, fixed by the instrument, given
 * by the problem — then (x̄ − μ)/(σ/√n) is exactly standard normal and c is a z
 * critical value: 1.9600 at 95%, whatever n happens to be.
 *
 * If σ is estimated from the same sample, it is not. Substituting s for σ adds
 * a second source of variation, and (x̄ − μ)/(s/√n) follows Student's t with
 * n − 1 degrees of freedom instead. t is heavier-tailed, so its critical value
 * is always LARGER than z's, and it only approaches z as n grows:
 *
 *     n =   8   t* = 2.3646   z* = 1.9600   the interval is 20.6% wider
 *     n =  30   t* = 2.0452   z* = 1.9600                    4.4% wider
 *     n = 120   t* = 1.9799   z* = 1.9600                    1.0% wider
 *
 * Using z on a sample of 8 therefore understates the interval by a fifth. That
 * is not a rounding difference, it is the difference between a claim that holds
 * 95% of the time and one that does not — so this page implements both, the
 * selector says which is in force, and the result states it in words.
 *
 * The default is t, because "I computed s from my data" is what almost everyone
 * actually has.
 */

// ── The normal distribution ───────────────────────────────────────────────
//
// The same Abramowitz & Stegun approximation the sibling z-score calculator
// uses, with the same published coefficients, deliberately: two normal CDFs in
// one codebase that disagreed in the seventh decimal would be worse than one
// that is approximate and pinned. Calculators here import nothing from each
// other — only from lib/ — so the formula is restated rather than shared, and
// compute.test.ts re-derives its accuracy from scratch against published
// z-tables and against Simpson's rule over the density.
//
// Abramowitz & Stegun, *Handbook of Mathematical Functions* (1964), 26.2.17:
//
//   Q(x) = 1 − Φ(x) ≈ φ(x)·(b₁t + b₂t² + b₃t³ + b₄t⁴ + b₅t⁵),
//   t = 1 / (1 + px),   x ≥ 0,   |ε(x)| < 7.5 × 10⁻⁸
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
 * The upper tail Q(x) = 1 − Φ(x), for x ≥ 0 only — the half A&S 26.2.17 is
 * stated for. Computed directly rather than as `1 − Φ(x)` so the small tail
 * probabilities that set the critical values are not ground away by
 * cancellation against 1.
 */
export function normalUpperTail(x: number): number {
  // Horner form: b₁t + b₂t² + … + b₅t⁵ = t(b₁ + t(b₂ + t(b₃ + t(b₄ + t·b₅))))
  const t = 1 / (1 + P * x)
  return normalPdf(x) * (t * (B1 + t * (B2 + t * (B3 + t * (B4 + t * B5)))))
}

/** Φ(z), reflected through |z| so Φ(−z) = 1 − Φ(z) holds by construction. */
export function normalCdf(z: number): number {
  const tail = normalUpperTail(Math.abs(z))
  return z >= 0 ? 1 - tail : tail
}

/**
 * z*, the two-sided critical value: the z with Q(z) = α/2.
 *
 * Found by bisecting the tail function, which is strictly decreasing on x ≥ 0,
 * so the bracket [0, 40] is guaranteed and the search cannot stall. Bisection
 * converges to the root of the *approximation*, which is not quite the root of
 * the true Φ:
 *
 *     |Δz| ≈ |ε| / φ(z)   —   the CDF error divided by the local density
 *
 * At 95% that is 7.5e-8 / 0.0584 ≈ 1.3e-6, and the observed error against the
 * published 1.9599640 is 1.2e-6. It grows as the tail thins — 2.0e-6 at 99%,
 * and 3.3e-5 at 99.9%, which is why the field stops at 99%. Over the levels
 * this page offers, every z* printed to four decimals equals the table value.
 * compute.test.ts asserts exactly that, level by level.
 */
export function zCritical(alpha: number): number {
  const target = alpha / 2
  let lo = 0
  let hi = 40
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2
    if (normalUpperTail(mid) > target) lo = mid
    else hi = mid
    if (hi - lo < 1e-14 * Math.max(1, lo)) break
  }
  return (lo + hi) / 2
}

// ── Student's t ───────────────────────────────────────────────────────────
//
// t has no closed-form quantile either, and the usual dodge — a polynomial fit
// such as A&S 26.7.5 — is good to about three decimals near the middle and
// visibly wrong at small ν, which is precisely where t matters. So the tail is
// computed exactly instead, from the identity
//
//   P(|T| > t) = I_x(ν/2, 1/2),   x = ν / (ν + t²)
//
// (Abramowitz & Stegun 26.7.1), with I the regularized incomplete beta
// function, and the quantile is recovered by bisecting that. The incomplete
// beta comes out at roughly 1e-15, so the critical values are exact to every
// digit a t-table publishes — t(0.975, 1) = 12.7062047, t(0.975, 10) = 2.2281389
// — rather than approximate to three.

/** Lanczos approximation to ln Γ(x), g = 7, n = 9. Accurate to about 1e-15. */
const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
] as const

export function logGamma(x: number): number {
  // Reflection, for the half-plane the series does not cover. Not reached by
  // this page's own arguments (ν/2 ≥ 0.5 always) but keeps the function total.
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x)
  const z = x - 1
  let a = 0.99999999999980993
  for (let i = 0; i < LANCZOS.length; i += 1) a += LANCZOS[i]! / (z + i + 1)
  const t = z + LANCZOS.length - 0.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a)
}

/**
 * The continued fraction for the incomplete beta, evaluated by the modified
 * Lentz algorithm. Converges fastest for x < (a+1)/(a+b+2); `regularizedBeta`
 * below flips to the complement outside that, which is what keeps the whole
 * thing to a few dozen iterations.
 */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const TINY = 1e-300
  const qab = a + b
  const qap = a + 1
  const qam = a - 1
  let c = 1
  let d = 1 - (qab * x) / qap
  if (Math.abs(d) < TINY) d = TINY
  d = 1 / d
  let h = d
  for (let m = 1; m <= 300; m += 1) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < TINY) d = TINY
    c = 1 + aa / c
    if (Math.abs(c) < TINY) c = TINY
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    if (Math.abs(d) < TINY) d = TINY
    c = 1 + aa / c
    if (Math.abs(c) < TINY) c = TINY
    d = 1 / d
    const delta = d * c
    h *= delta
    if (Math.abs(delta - 1) < 3e-16) break
  }
  return h
}

/** I_x(a, b), the regularized incomplete beta function. */
export function regularizedBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const front = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x),
  )
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinuedFraction(a, b, x)) / a
    : 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b
}

/** P(T > t) for t ≥ 0, ν degrees of freedom. Half the two-sided tail. */
export function tUpperTail(t: number, df: number): number {
  return 0.5 * regularizedBeta(df / 2, 0.5, df / (df + t * t))
}

/**
 * t*, the two-sided critical value with ν degrees of freedom.
 *
 * Bisection again, on a strictly decreasing function, bracketed by [0, 1e6] —
 * comfortably above the largest value reachable here (t(0.995, 1) = 63.66).
 * The loop stops on a relative width of 1e-13, which is 45-odd iterations, and
 * the whole thing costs about 30 µs.
 */
export function tCritical(alpha: number, df: number): number {
  const target = alpha / 2
  let lo = 0
  let hi = 1e6
  for (let i = 0; i < 300; i += 1) {
    const mid = (lo + hi) / 2
    if (tUpperTail(mid, df) > target) lo = mid
    else hi = mid
    if (hi - lo < 1e-13 * Math.max(1, lo)) break
  }
  return (lo + hi) / 2
}

// ── Presentation helpers ──────────────────────────────────────────────────

/**
 * How many decimals to show, chosen from the size of the margin of error so the
 * interval reads like a person would write it. A margin of 5.6 wants two
 * decimals; a margin of 0.004 wants six, or the interval would print as two
 * identical numbers.
 */
function decimalsFor(margin: number): number {
  if (!(margin > 0)) return 2
  if (margin >= 1000) return 0
  if (margin >= 100) return 1
  if (margin >= 1) return 2
  if (margin >= 0.1) return 3
  if (margin >= 0.01) return 4
  return 6
}

/**
 * A fixed-decimal string. `toFixed`, never `toLocaleString`: compute runs at
 * build time in Node and again in the browser, and the two have to produce the
 * same characters or the first client repaint would flicker.
 */
const fixed = (n: number, d: number) => n.toFixed(d)

const NUM4 = { style: 'decimal', decimals: 4 } as const
const INT = { style: 'decimal', decimals: 0 } as const
const PCT = { style: 'percent', decimals: 1 } as const
const PCT0 = { style: 'percent', decimals: 0 } as const

export default function compute(v: Values<typeof fields>): CalcResult {
  const { sampleMean, standardDeviation, sampleSize, confidenceLevel, distribution } = v

  // Finiteness first, always. `coerceValues` deliberately produces NaN for
  // unparseable input, and every magnitude test below — `< 2`, `<= 0` — is
  // FALSE for NaN, so a magnitude guard alone would let NaN through into the
  // arithmetic and out to the page.
  if (!Number.isFinite(sampleMean))
    throw new CalcError('Enter a number for the sample mean.', 'sampleMean')
  if (!Number.isFinite(standardDeviation))
    throw new CalcError('Enter a number for the standard deviation.', 'standardDeviation')
  if (!Number.isFinite(sampleSize))
    throw new CalcError('Enter a whole number for the sample size.', 'sampleSize')

  if (standardDeviation <= 0)
    throw new CalcError(
      'Standard deviation must be greater than 0. A spread of zero leaves nothing to be uncertain about, so the interval would collapse to a point.',
      'standardDeviation',
    )

  if (!Number.isInteger(sampleSize))
    throw new CalcError('Sample size must be a whole number of observations.', 'sampleSize')

  // n = 1 gives n − 1 = 0 degrees of freedom: one observation cannot tell you
  // how spread out the data is, so there is no interval to report. n = 0 is not
  // a sample at all. Both are refused against the field that caused it.
  if (sampleSize < 2)
    throw new CalcError(
      'Sample size must be at least 2. With a single observation there are n − 1 = 0 degrees of freedom and no interval exists.',
      'sampleSize',
    )

  const level = Number(confidenceLevel)
  if (!Number.isFinite(level) || level <= 0 || level >= 100)
    throw new CalcError('Choose a confidence level between 0 and 100%.', 'confidenceLevel')

  const usesT = distribution !== 'population'
  const alpha = 1 - level / 100
  const df = sampleSize - 1

  // The standard error of the mean: how much x̄ itself moves from sample to
  // sample. This is the 1/√n that makes a bigger sample a tighter interval.
  const standardError = standardDeviation / Math.sqrt(sampleSize)

  const zStar = zCritical(alpha)
  const critical = usesT ? tCritical(alpha, df) : zStar
  const margin = critical * standardError
  const lower = sampleMean - margin
  const upper = sampleMean + margin

  const decimals = decimalsFor(margin)
  const BOUND = { style: 'decimal', decimals } as const

  // What the t correction is actually buying, as a ratio. 1.0435 at n = 30 says
  // the interval is 4.35% wider than the naive z interval would have been; with
  // a known σ it is exactly 1, because z IS what is being used.
  const widening = critical / zStar

  const stats: Quantity[] = [
    { label: 'Lower bound', value: lower, format: BOUND },
    { label: 'Upper bound', value: upper, format: BOUND },
    { label: 'Margin of error (±)', value: margin, format: BOUND },
    {
      label: usesT ? `Critical value t*(${df} df)` : 'Critical value z*',
      value: critical,
      format: NUM4,
    },
    { label: 'Standard error of the mean', value: standardError, format: NUM4 },
    { label: 'Interval width', value: 2 * margin, format: BOUND },
  ]
  if (usesT) {
    // The teaching stat: what the same data would have claimed under z. On a
    // small sample the gap is the whole point of the page.
    stats.push({ label: 'Margin if z were used (too narrow)', value: zStar * standardError, format: BOUND })
    stats.push({ label: 'How much wider t makes it', value: (widening - 1) * 100, format: PCT })
  }

  const steps: Array<Quantity | StepRule> = [
    { label: 'Sample mean (x̄)', value: sampleMean, format: BOUND },
    { label: usesT ? 'Sample standard deviation (s)' : 'Population σ', value: standardDeviation, format: BOUND },
    { label: 'Sample size (n)', value: sampleSize, format: INT },
    { label: '√n', value: Math.sqrt(sampleSize), format: NUM4 },
    { label: usesT ? 'Standard error = s ÷ √n' : 'Standard error = σ ÷ √n', value: standardError, format: NUM4 },
    // Below the rule, everything comes from the distribution rather than from
    // arithmetic on the inputs.
    { rule: true },
    { label: 'Confidence level', value: level, format: PCT0 },
    { label: 'α (the area left outside)', value: alpha * 100, format: PCT0 },
  ]
  if (usesT) steps.push({ label: 'Degrees of freedom (n − 1)', value: df, format: INT })
  steps.push(
    {
      label: usesT ? `t* at ${level}%, ${df} df` : `z* at ${level}%`,
      value: critical,
      format: NUM4,
    },
    { label: 'Margin of error = critical × standard error', value: margin, format: BOUND },
    { label: 'Lower = x̄ − margin', value: lower, format: BOUND },
    { label: 'Upper = x̄ + margin', value: upper, format: BOUND },
  )

  // ── The chart ───────────────────────────────────────────────────────────
  //
  // Both bounds against sample size, holding the mean, the spread and the level
  // fixed: the two curves close in on x̄ as n grows, which is the 1/√n law made
  // visible — and, on the t setting, the extra flare at small n that z would
  // have missed entirely.
  //
  // Exactly 45 points on each line, always. The x range moves with n, but the
  // COUNT never does, so the chart the server rendered at the defaults is
  // always the same shape the island redraws.
  //
  // It starts at n = 5 rather than n = 2 on purpose: at n = 2 the t interval is
  // some twenty times wider than at n = 60, and plotting it would squash the
  // whole informative part of the curve into a flat line at the bottom.
  const CHART_POINTS = 45
  const chartFrom = 5
  const chartTo = Math.min(500, Math.max(60, Math.round(sampleSize * 2)))
  // The stride is never below 1 (the span is at least 55 over 44 gaps), so
  // rounding each x to a whole sample size keeps them strictly increasing,
  // which the chart path requires.
  const stride = (chartTo - chartFrom) / (CHART_POINTS - 1)
  const lowerPoints: Array<readonly [number, number]> = []
  const upperPoints: Array<readonly [number, number]> = []
  for (let i = 0; i < CHART_POINTS; i += 1) {
    const n = Math.round(chartFrom + i * stride)
    const se = standardDeviation / Math.sqrt(n)
    const c = usesT ? tCritical(alpha, n - 1) : zStar
    const m = c * se
    lowerPoints.push([n, sampleMean - m])
    upperPoints.push([n, sampleMean + m])
  }

  const series: Series[] = [
    { label: 'Lower bound', points: lowerPoints, format: BOUND },
    { label: 'Upper bound', points: upperPoints, format: BOUND },
  ]

  const interval = `${fixed(lower, decimals)} to ${fixed(upper, decimals)}`
  const between = `${fixed(lower, decimals)} and ${fixed(upper, decimals)}`
  const method = usesT
    ? `Student's t with ${df} degrees of freedom, because the standard deviation was estimated from the sample`
    : 'the standard normal (z), because the population standard deviation is being taken as known'

  const notes = [
    `The ${level}% confidence interval for the mean is ${interval} — that is ${fixed(sampleMean, decimals)} give or take ${fixed(margin, decimals)}. The critical value ${fixed(critical, 4)} comes from ${method}.`,
    // The single most common misreading of a confidence interval, corrected
    // rather than left to the reader.
    `It does not mean there is a ${level}% probability that the true mean lies between ${between}. The true mean is a fixed number; it is either in this interval or it is not. What is ${level}% is the METHOD: if you repeated the whole exercise on fresh samples, about ${level} intervals in every 100 built this way would contain it.`,
    usesT
      ? `Because s is an estimate, t* = ${fixed(critical, 4)} is used rather than z* = ${fixed(zStar, 4)}, which makes the interval ${((widening - 1) * 100).toFixed(1)}% wider. Reaching for z here is the usual mistake, and it is worst exactly where it matters most: at n = 8 the z interval is about 17% too narrow.`
      : `With σ known, the t correction is not needed and z* = ${fixed(zStar, 4)} is exact at any n. Only choose this when the spread genuinely comes from outside this sample — using it with an s you computed from your own data understates the interval.`,
    'The formula assumes a random sample, and either a roughly normal population or a sample large enough for the central limit theorem to carry the mean. It is an interval for the MEAN, not a range that 95% of individual observations fall in — that range is far wider.',
  ]

  return {
    // The headline is the interval itself, as text: it is the answer the page
    // exists to give, and a single number could not carry it.
    primary: { label: `${level}% confidence interval`, value: interval, format: { style: 'raw' } },
    stats,
    steps,
    series,
    chart: { title: 'How the interval narrows with sample size', xLabel: 'Sample size' },
    // The gauge tracks how far t has had to stretch beyond z — which is the
    // question this calculator is really about. It sits at exactly 1 whenever z
    // is in use, and climbs as the sample shrinks.
    scaleValue: widening,
    notes,
  }
}

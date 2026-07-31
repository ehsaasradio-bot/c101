import { CalcError } from '../../../lib/types'
import type {
  CalcResult,
  FormatSpec,
  Part,
  Quantity,
  Series,
  StepRule,
  Values,
} from '../../../lib/types'
import type { fields } from './fields'

/**
 * Exponential decay, solved in any of four directions.
 *
 * One identity underlies the whole page — the amount left after a time t, given
 * a starting amount N0 and a half-life T:
 *
 *     N(t) = N0 x (1/2)^(t / T)
 *
 * Rearranged, that is every mode this calculator offers:
 *
 *     t  = T x log2(N0 / N)          solve for elapsed time
 *     T  = t / log2(N0 / N)          solve for half-life, equivalently
 *                                    T = t x ln2 / ln(N0 / N)
 *     N0 = N x 2^(t / T)             solve for the initial amount
 *
 * Two derived constants turn the answer into understanding, and both fall out of
 * the same identity written in base e, N(t) = N0 x e^(-lambda x t):
 *
 *     lambda = ln2 / T               the decay constant, a rate per unit time
 *     tau    = 1 / lambda = T / ln2  the mean lifetime, the average time an
 *                                    individual atom or molecule survives
 *
 * lambda x T = ln 2 is therefore not an approximation but the definition, and
 * lambda is computed here as `Math.LN2 / T` precisely so that multiplying it
 * back by T returns `Math.LN2` itself rather than something near it.
 *
 * The maths is indifferent to what is decaying. Rutherford and Soddy set it out
 * for radioactive matter in "The Cause and Nature of Radioactivity" (Phil. Mag.
 * 4, 1902), and the identical first-order law governs drug elimination and
 * radiocarbon dating — which is why the time unit here is a label rather than a
 * conversion, and why the amounts are unitless.
 */

/** Wording for the chosen time unit. Labels only; no arithmetic depends on it. */
const TIME_UNITS = {
  seconds: { plural: 'seconds', singular: 'second' },
  minutes: { plural: 'minutes', singular: 'minute' },
  hours: { plural: 'hours', singular: 'hour' },
  days: { plural: 'days', singular: 'day' },
  years: { plural: 'years', singular: 'year' },
} as const

type TimeUnitId = keyof typeof TIME_UNITS

function timeUnitOf(id: string): (typeof TIME_UNITS)[TimeUnitId] {
  return TIME_UNITS[id as TimeUnitId] ?? TIME_UNITS.hours
}

/**
 * THE FLOATING-POINT PROBLEM, and the single rule used against it.
 *
 * The number of half-lives elapsed is `t / T`, and that division is not exact.
 * A half-life of 0.1 and an elapsed time of 0.3 — both perfectly ordinary values
 * the sliders land on, since 0.1 is the step — give
 * `0.3 / 0.1 === 2.9999999999999996`, because neither 0.1 nor 0.3 is
 * representable in binary. Left alone the residue propagates:
 * `100 * Math.pow(2, -2.9999999999999996)` is 12.500000000000004, so the page
 * would report "3.0000 half-lives" and "12.500000000000004 remaining" for what
 * is plainly three half-lives and 12.5.
 *
 * The other direction has the same shape. Change of base,
 * `Math.log(x) / Math.log(2)`, carries the error of two inexact logarithms
 * through a division: `Math.log(343) / Math.log(7)` is 3.0000000000000004.
 *
 * `logarithm-calculator` settled the rule and it is followed here: **snap only
 * after back-substitution.** Round to the nearest integer, then put that integer
 * back through the inverse operation and keep it only if the original input
 * reappears. A value merely close to a whole number — 2.9 half-lives is a real
 * answer — is left exactly where the arithmetic put it.
 *
 * The tolerance is relative on both sides. `Number.EPSILON` is the gap at 1.0
 * and means nothing out at 20,000 half-lives.
 */
function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))
}

/** `t / T`, snapped to a whole number of half-lives only when `k x T` recovers `t`. */
export function halfLivesFromTimes(t: number, halfLife: number): number {
  const raw = t / halfLife
  if (!Number.isFinite(raw)) return raw
  const k = Math.round(raw)
  if (k === raw) return raw
  if (Math.abs(raw - k) > 1e-9 * Math.max(1, Math.abs(raw))) return raw
  return nearlyEqual(k * halfLife, t) ? k : raw
}

/**
 * `log2(N0 / N)`, snapped the same way — only when `2^k` reproduces the ratio.
 *
 * `Math.log2` is used rather than the change-of-base division because it is a
 * dedicated routine and is exact on exact powers of two, which removes most of
 * the error before the snap has to deal with it. The snap catches the rest.
 */
export function halfLivesFromRatio(ratio: number): number {
  const raw = Math.log2(ratio)
  if (!Number.isFinite(raw)) return raw
  const k = Math.round(raw)
  if (k === raw) return raw
  if (Math.abs(raw - k) > 1e-9 * Math.max(1, Math.abs(raw))) return raw
  const back = Math.pow(2, k)
  return Number.isFinite(back) && back !== 0 && nearlyEqual(back, ratio) ? k : raw
}

/** The surviving fraction after `h` half-lives. Exact for a whole `h`. */
function fractionAfter(h: number): number {
  return Math.pow(2, -h)
}

/**
 * A number for embedding in a worked step. Whole numbers print bare so an exact
 * answer reads as `3` rather than `3.000000`; everything else is trimmed to ten
 * significant figures, which is well inside a double's honest precision.
 */
function show(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n)
  return String(Number(n.toPrecision(10)))
}

/**
 * Display precision for a figure that is often exactly a whole number.
 *
 * Recovering 12.5 rather than 12.500000000000004 is only half the job: printing
 * it as `13`, or as `12.5000`, would throw the correction away again. So this
 * asks for the FEWEST decimals that still reproduce the number, capped by
 * magnitude, rather than picking a fixed precision per size band.
 *
 * The comparison is relative, and deliberately looser than exact equality: a
 * nudged input of 100 x 1.1 is 110.00000000000001, and two half-lives of it is
 * 27.500000000000004. Nothing about that trailing 4 is information — it is the
 * residue of a decimal the input could not hold — so one decimal place is both
 * the shortest and the honest rendering. A tolerance of zero would print all
 * fourteen digits; an absolute tolerance would flatten a genuinely tiny
 * remainder to `0`, which is the one thing this page must never say.
 */
function decimalsFor(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return 0
  const magnitude = Math.abs(n)
  const cap = magnitude >= 1000 ? 2 : magnitude >= 1 ? 4 : 6
  for (let d = 0; d < cap; d++) {
    if (Math.abs(Number(n.toFixed(d)) - n) <= 1e-10 * magnitude) return d
  }
  return cap
}

function amountFormat(n: number): FormatSpec {
  return { style: 'decimal', decimals: decimalsFor(n) }
}

function timeFormat(n: number, unit: string): FormatSpec {
  return { style: 'decimal', decimals: decimalsFor(n), unit }
}

/** How many points the decay curve carries. Fixed, so the chart never restructures. */
const CURVE_POINTS = 41

interface Solution {
  initial: number
  remaining: number
  elapsed: number
  halfLife: number
  /** t / T, carried from whichever branch derived it so no drift creeps back in. */
  halfLives: number
}

// Finiteness FIRST. `coerceValues` deliberately produces NaN for unparseable
// input, and a magnitude test like `value <= 0` is false for NaN, so it would
// slip straight through into Math.log and come back out as NaN.
function requireFinite(value: number, fieldId: string, message: string): void {
  if (!Number.isFinite(value)) throw new CalcError(message, fieldId)
}

function requirePositive(value: number, fieldId: string, message: string): void {
  if (value <= 0) throw new CalcError(message, fieldId)
}

const BLANK_INITIAL =
  'Enter a finite starting amount. Decay is measured as a ratio to what you began with, so a blank or unreadable N0 leaves nothing to compare against.'
const BLANK_REMAINING =
  'Enter a finite remaining amount. It is the other half of the ratio the decay is measured by, so it has to be an actual number.'
const BLANK_ELAPSED =
  'Enter a finite elapsed time. It is the interval the decay has been running for, and an infinite or unreadable value has no decay to describe.'
const BLANK_HALFLIFE =
  'Enter a finite half-life. It sets the entire timescale of the decay, and every figure on this page is divided by it.'

const ZERO_INITIAL =
  'The initial amount must be greater than zero. Decay works on a ratio, and there is nothing to take a fraction of when you start from zero or below.'
const ZERO_REMAINING =
  'The remaining amount must be greater than zero. Exponential decay halves what is left over and over, approaching zero without ever arriving, so a remaining amount of zero or less never occurs in finite time.'
const ZERO_ELAPSED =
  'The elapsed time must be greater than zero. With no time on the clock nothing has decayed yet, so there is no decay to measure.'
const ZERO_HALFLIFE =
  'The half-life must be greater than zero. It is the time taken for half the material to disappear, and everything here is divided by it.'

const GREATER_THAN_INITIAL =
  'The remaining amount is larger than the initial amount, which is growth rather than decay. Half-life describes a quantity that falls, so what is left has to be smaller than what you started with.'

function solve(v: Values<typeof fields>): Solution {
  const { mode, initialAmount, remainingAmount, elapsedTime, halfLife } = v

  if (mode === 'remaining') {
    requireFinite(initialAmount, 'initialAmount', BLANK_INITIAL)
    requireFinite(elapsedTime, 'elapsedTime', BLANK_ELAPSED)
    requireFinite(halfLife, 'halfLife', BLANK_HALFLIFE)
    requirePositive(initialAmount, 'initialAmount', ZERO_INITIAL)
    requirePositive(elapsedTime, 'elapsedTime', ZERO_ELAPSED)
    requirePositive(halfLife, 'halfLife', ZERO_HALFLIFE)

    const halfLives = halfLivesFromTimes(elapsedTime, halfLife)
    return {
      initial: initialAmount,
      remaining: initialAmount * fractionAfter(halfLives),
      elapsed: elapsedTime,
      halfLife,
      halfLives,
    }
  }

  if (mode === 'halfLife') {
    requireFinite(initialAmount, 'initialAmount', BLANK_INITIAL)
    requireFinite(remainingAmount, 'remainingAmount', BLANK_REMAINING)
    requireFinite(elapsedTime, 'elapsedTime', BLANK_ELAPSED)
    requirePositive(initialAmount, 'initialAmount', ZERO_INITIAL)
    requirePositive(remainingAmount, 'remainingAmount', ZERO_REMAINING)
    requirePositive(elapsedTime, 'elapsedTime', ZERO_ELAPSED)

    // Guard the logarithm BEFORE dividing by it. ln(1) is 0, so an unchanged
    // amount would make the half-life Infinity; a ratio below 1 makes it
    // negative, which is growth wearing a decay label.
    if (remainingAmount > initialAmount)
      throw new CalcError(GREATER_THAN_INITIAL, 'remainingAmount')
    if (remainingAmount === initialAmount)
      throw new CalcError(
        'Nothing has decayed — the remaining amount equals the initial amount — so no half-life follows from it. Every half-life at all is consistent with no loss, which is another way of saying these numbers do not pin one down.',
        'remainingAmount',
      )

    const halfLives = halfLivesFromRatio(initialAmount / remainingAmount)
    return {
      initial: initialAmount,
      remaining: remainingAmount,
      elapsed: elapsedTime,
      halfLife: elapsedTime / halfLives,
      halfLives,
    }
  }

  if (mode === 'time') {
    requireFinite(initialAmount, 'initialAmount', BLANK_INITIAL)
    requireFinite(remainingAmount, 'remainingAmount', BLANK_REMAINING)
    requireFinite(halfLife, 'halfLife', BLANK_HALFLIFE)
    requirePositive(initialAmount, 'initialAmount', ZERO_INITIAL)
    requirePositive(remainingAmount, 'remainingAmount', ZERO_REMAINING)
    requirePositive(halfLife, 'halfLife', ZERO_HALFLIFE)

    if (remainingAmount > initialAmount)
      throw new CalcError(GREATER_THAN_INITIAL, 'remainingAmount')

    // An unchanged amount is legitimate here and simply means t = 0, so it is
    // NOT rejected: log2(1) is 0, not a division by it.
    const halfLives = halfLivesFromRatio(initialAmount / remainingAmount)
    return {
      initial: initialAmount,
      remaining: remainingAmount,
      elapsed: halfLife * halfLives,
      halfLife,
      halfLives,
    }
  }

  if (mode === 'initial') {
    requireFinite(remainingAmount, 'remainingAmount', BLANK_REMAINING)
    requireFinite(elapsedTime, 'elapsedTime', BLANK_ELAPSED)
    requireFinite(halfLife, 'halfLife', BLANK_HALFLIFE)
    requirePositive(remainingAmount, 'remainingAmount', ZERO_REMAINING)
    requirePositive(elapsedTime, 'elapsedTime', ZERO_ELAPSED)
    requirePositive(halfLife, 'halfLife', ZERO_HALFLIFE)

    const halfLives = halfLivesFromTimes(elapsedTime, halfLife)
    const initial = remainingAmount * Math.pow(2, halfLives)
    // Running the decay backwards doubles the amount every half-life, so a long
    // enough interval overflows a double. Reporting Infinity as a starting
    // amount would be a lie dressed as an answer.
    if (!Number.isFinite(initial))
      throw new CalcError(
        `Working back through ${show(halfLives)} half-lives doubles the amount that many times, which overflows past the largest number a computer can hold. Shorten the elapsed time or lengthen the half-life.`,
        'elapsedTime',
      )
    return { initial, remaining: remainingAmount, elapsed: elapsedTime, halfLife, halfLives }
  }

  throw new CalcError('Choose which of the four quantities you want worked out.', 'mode')
}

export default function compute(v: Values<typeof fields>): CalcResult {
  const { mode } = v
  const unit = timeUnitOf(v.timeUnit)
  const { initial, remaining, elapsed, halfLife, halfLives } = solve(v)

  const lambda = Math.LN2 / halfLife
  const meanLifetime = halfLife / Math.LN2 // identical to 1 / lambda, one rounding fewer
  const fraction = remaining / initial

  // Derive the decayed part by subtraction from a remaining part already clamped
  // into [0, initial], so the two sum to the initial amount exactly by
  // construction rather than by luck. The donut prints that total in its centre,
  // so a mismatch would be slices that visibly do not add up.
  const remainingPart = Math.min(Math.max(remaining, 0), initial)
  const decayedPart = initial - remainingPart

  // The identity the page rests on, run forwards from the answer. In every mode
  // this has to come back as the remaining amount.
  const check = initial * fractionAfter(halfLivesFromTimes(elapsed, halfLife))

  const primary: Quantity =
    mode === 'halfLife'
      ? { label: 'Half-life', value: halfLife, format: timeFormat(halfLife, unit.plural) }
      : mode === 'time'
        ? { label: 'Elapsed time', value: elapsed, format: timeFormat(elapsed, unit.plural) }
        : mode === 'initial'
          ? { label: 'Initial amount', value: initial, format: amountFormat(initial) }
          : {
              label: `Remaining after ${show(elapsed)} ${elapsed === 1 ? unit.singular : unit.plural}`,
              value: remaining,
              format: amountFormat(remaining),
            }

  const stats: Quantity[] = [
    { label: 'Initial amount', value: initial, format: amountFormat(initial) },
    { label: 'Remaining amount', value: remaining, format: amountFormat(remaining) },
    { label: 'Amount decayed', value: decayedPart, format: amountFormat(decayedPart) },
    {
      label: 'Fraction remaining',
      value: fraction * 100,
      format: { style: 'percent', decimals: decimalsFor(fraction * 100) },
    },
    {
      label: 'Half-lives elapsed',
      value: halfLives,
      format: { style: 'decimal', decimals: decimalsFor(halfLives) },
    },
    { label: 'Half-life', value: halfLife, format: timeFormat(halfLife, unit.plural) },
    {
      label: 'Decay constant lambda = ln 2 / T',
      value: lambda,
      format: { style: 'decimal', decimals: 8, unit: `per ${unit.singular}` },
    },
    {
      label: 'Mean lifetime 1 / lambda',
      value: meanLifetime,
      format: timeFormat(meanLifetime, unit.plural),
    },
    {
      label: 'Time until 96.875% has gone (5 half-lives)',
      value: 5 * halfLife,
      format: timeFormat(5 * halfLife, unit.plural),
    },
    {
      label: 'Check: lambda x half-life = ln 2',
      value: lambda * halfLife,
      format: { style: 'decimal', decimals: 8 },
    },
  ]

  const steps: (Quantity | StepRule)[] = [
    { label: 'Initial amount N0', value: initial, format: amountFormat(initial) },
    { label: 'Half-life T', value: halfLife, format: timeFormat(halfLife, unit.plural) },
    { label: 'Elapsed time t', value: elapsed, format: timeFormat(elapsed, unit.plural) },
    { rule: true },
    {
      label: 'Half-lives elapsed: t / T',
      value: `${show(elapsed)} / ${show(halfLife)} = ${show(halfLives)}`,
      format: { style: 'raw' },
    },
    {
      label: 'Surviving fraction: one half to that power',
      value: `(1/2)^${show(halfLives)} = ${show(Number(fraction.toPrecision(10)))}`,
      format: { style: 'raw' },
    },
    {
      label: 'Remaining: N = N0 x (1/2)^(t/T)',
      value: `${show(initial)} x ${show(Number(fraction.toPrecision(10)))} = ${show(Number(remaining.toPrecision(10)))}`,
      format: { style: 'raw' },
    },
    { rule: true },
    {
      label: 'Decay constant: lambda = ln 2 / T',
      value: `${show(Number(Math.LN2.toPrecision(10)))} / ${show(halfLife)} = ${show(Number(lambda.toPrecision(10)))}`,
      format: { style: 'raw' },
    },
    {
      label: 'Mean lifetime: 1 / lambda = T / ln 2',
      value: `${show(halfLife)} / ${show(Number(Math.LN2.toPrecision(10)))} = ${show(Number(meanLifetime.toPrecision(10)))}`,
      format: { style: 'raw' },
    },
    { rule: true },
    {
      label: 'Check by running the decay forwards again',
      value: `${show(initial)} x (1/2)^(${show(elapsed)} / ${show(halfLife)}) = ${show(Number(check.toPrecision(10)))}`,
      format: { style: 'raw' },
    },
  ]

  const parts: Part[] = [
    { label: 'Still present', value: remainingPart, format: amountFormat(remainingPart) },
    { label: 'Decayed away', value: decayedPart, format: amountFormat(decayedPart) },
  ]

  // The curve: always two lines, always CURVE_POINTS points, so it is drawable
  // at the defaults and never restructures under a recompute. Both lines come
  // from the same closed form as the headline, so they cannot drift away from
  // it, and they cross at exactly one half-life — which is the point of drawing
  // them together.
  const horizon = Math.max(elapsed, 5 * halfLife)
  const survivingPoints: [number, number][] = []
  const decayedPoints: [number, number][] = []
  for (let i = 0; i < CURVE_POINTS; i++) {
    const x = (horizon * i) / (CURVE_POINTS - 1)
    const left = initial * fractionAfter(halfLivesFromTimes(x, halfLife))
    survivingPoints.push([x, left])
    decayedPoints.push([x, initial - left])
  }
  const series: Series[] = [
    { label: 'Still present', points: survivingPoints, format: amountFormat(initial) },
    { label: 'Decayed away', points: decayedPoints, format: amountFormat(initial) },
  ]

  const notes: string[] = []
  if (Number.isInteger(halfLives) && halfLives > 0 && halfLives <= 20)
    notes.push(
      `Exactly ${show(halfLives)} half-${halfLives === 1 ? 'life has' : 'lives have'} elapsed, so the surviving fraction is the exact fraction 1/${show(Math.pow(2, halfLives))} — halving ${show(halfLives)} time${halfLives === 1 ? '' : 's'} over.`,
    )
  if (fraction > 0 && fraction < 1e-6)
    notes.push(
      `The surviving fraction is about ${fraction.toExponential(3)} of the original, small enough that the amount rounds away to zero at ordinary display precision.`,
    )
  if (fraction === 0)
    notes.push(
      'After this many half-lives the surviving amount has fallen below the smallest number a double can represent, so it prints as zero. It is not truly zero: exponential decay halves what is left forever and never reaches nothing.',
    )
  notes.push(
    'The half-life does not depend on how much you started with. Doubling the initial amount doubles what is left at every moment, but changes neither the half-life nor the fraction remaining.',
  )
  notes.push(
    'After 5 half-lives 96.875% has gone and after 7 half-lives 99.2% has, which is where the clinical rule of thumb that a drug is effectively cleared in about five half-lives comes from.',
  )

  return {
    primary,
    stats,
    steps,
    notes,
    parts,
    partsTotal: { label: 'Initial amount', value: initial, format: amountFormat(initial) },
    series,
  }
}

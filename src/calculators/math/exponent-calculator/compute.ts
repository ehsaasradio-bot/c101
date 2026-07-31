import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, StepRule, Values } from '../../../lib/types'
import { formatValue } from '../../../lib/format'
import type { fields } from './fields'

/*
 * b^n — a base raised to a power, for any real base and any real exponent this
 * page can honestly answer for.
 *
 * The three laws the page teaches, and the three that make the answer:
 *
 *   b^0 = 1                       every nonzero base, because b^n / b^n = b^0
 *   b^-n = 1 / b^n                a negative exponent is a reciprocal
 *   b^(p/q) = (q-th root of b)^p  a fractional exponent is a root
 *
 * Four things go wrong here, and each is handled deliberately rather than left
 * to `Math.pow`.
 *
 * ── 1. 0^0 ───────────────────────────────────────────────────────────────────
 *
 * This calculator answers 0^0 = 1, which is also what IEEE 754 `pow` and
 * therefore JavaScript answer. It is a convention, not a theorem, and the page
 * says so: the empty product is 1, C(n, 0) = 1, the binomial theorem and every
 * power series with a constant term need x^0 = 1 at x = 0. The competing view
 * comes from limits — x^y has no single limit as (x, y) approaches (0, 0),
 * since 0^y is 0 for every positive y while x^0 is 1 for every nonzero x — so
 * analysis usually calls it indeterminate. Discrete maths wins here because
 * that is the setting a calculator is used in, and a note states the choice.
 *
 * ── 2. A NEGATIVE base with a FRACTIONAL exponent ────────────────────────────
 *
 * `(-8) ** (1/3)` is NaN in JavaScript, even though the real cube root of -8 is
 * exactly -2. `Math.pow` refuses because for an arbitrary real exponent the
 * principal value is complex; it cannot tell 1/3 from 0.3333333333333333.
 *
 * The decision here is to RETURN THE REAL VALUE where one exists, and refuse
 * with an explanation where one does not. The exponent is matched against the
 * simplest rational p/q with q <= 1000 that agrees with it to within 1e-9
 * (continued fractions). If q is ODD the real q-th root of a negative number
 * exists and
 *
 *     (-|b|)^(p/q) = ((-|b|)^(1/q))^p = (-1)^p x |b|^(p/q)
 *
 * so the answer is the ordinary magnitude with a sign decided by the parity of
 * p. If q is EVEN — 0.5, 2.5, 1/4 — there is no real q-th root of a negative
 * number at all, and the calculator refuses against the exponent field rather
 * than returning NaN. The rational is then confirmed by back-substitution in
 * log space before it is used.
 *
 * ── 3. OVERFLOW and UNDERFLOW ────────────────────────────────────────────────
 *
 * Anything past about 1.8e308 becomes Infinity, and anything under about
 * 5e-324 becomes 0. The magnitude is therefore carried SEPARATELY as
 * n x log10(|b|), which stays meaningful either side of those limits, exactly
 * as `math/combination-calculator` carries a count as a sum of logs. So
 * 1000^400 reports `about 1.000 x 10^1200` rather than a dash, and 2^-400
 * reports `about 3.872 x 10^-121`. The same scientific form is used for every
 * figure outside 1e-6 .. 1e15, so there is one convention on the page rather
 * than one for ordinary numbers and another for enormous ones.
 *
 * ── 4. FLOATING POINT ────────────────────────────────────────────────────────
 *
 * `1.1 ** 2` is 1.2100000000000002. The fix is not to round and hope: an
 * integer power of a terminating decimal is computed EXACTLY in integer
 * arithmetic — 1.1 is 11/10, so 1.1^2 is 11^2 / 10^2 = 121/100 — and the exact
 * value replaces `Math.pow`'s only after back-substitution confirms the two
 * agree to within 1e-9 relative. That is the same discipline
 * `math/logarithm-calculator` uses to snap log_7(343) to 3. Where no exact
 * integer form fits (2^0.5), the double is left exactly where the arithmetic
 * put it and displayed to a sensible number of digits.
 */

// ── Exact integer powers of a terminating decimal ────────────────────────────

/**
 * A finite decimal as an integer mantissa and a digit count: 1.1 -> 11 x 10^-1.
 * Returns null for anything that does not print as a plain decimal, or whose
 * mantissa is already past exact integer range.
 */
function decimalParts(x: number): { mantissa: number; decimals: number } | null {
  if (!Number.isFinite(x)) return null
  const s = String(x)
  // 1e-7 and larger magnitudes print in exponential form; there is no exact
  // small-integer mantissa to recover from those cheaply.
  if (s.includes('e') || s.includes('E')) return null
  const dot = s.indexOf('.')
  const decimals = dot === -1 ? 0 : s.length - dot - 1
  if (decimals > 15) return null
  const mantissa = Number(s.replace('.', ''))
  if (!Number.isSafeInteger(mantissa)) return null
  return { mantissa, decimals }
}

/**
 * b^n computed in exact integer arithmetic, for an integer n and a base that is
 * a terminating decimal. Returns null the moment exactness cannot be
 * guaranteed — a mantissa power past 2^53, or a power of ten past what a double
 * holds — so the caller falls back to `Math.pow` rather than to a lie.
 *
 * (m x 10^-d)^n  =  m^n / 10^(d n)   for n >= 0
 *                =  10^(d |n|) / m^|n|  for n < 0
 */
function exactDecimalPow(base: number, n: number): number | null {
  if (!Number.isInteger(n)) return null
  const parts = decimalParts(base)
  if (!parts) return null
  const k = Math.abs(n)
  if (k > 400) return null

  let mantissaPower = 1
  for (let i = 0; i < k; i += 1) {
    mantissaPower *= parts.mantissa
    // The exact point where exactness would be lost: the running product no
    // longer fits in 53 bits of mantissa.
    if (!Number.isSafeInteger(mantissaPower)) return null
  }

  const scale = parts.decimals * k
  if (scale > 300) return null
  const tenPower = Math.pow(10, scale)
  if (!Number.isFinite(tenPower)) return null

  const value = n >= 0 ? mantissaPower / tenPower : tenPower / mantissaPower
  if (!Number.isFinite(value) || value === 0) return null
  return value
}

// ── Rational exponents ───────────────────────────────────────────────────────

export interface Fraction {
  p: number
  q: number
}

/**
 * The simplest fraction p/q, q <= maxDenominator, that agrees with x to within
 * a relative tolerance — the continued-fraction convergents, which are exactly
 * the best rational approximations at each denominator.
 *
 * This is what lets 0.3333333333 be read as 1/3 (they differ by 3.3e-11) while
 * 0.333333 is left alone (they differ by 3.3e-7, which is a different number).
 * Convergents are produced in increasing denominator order, so the first one
 * inside tolerance is the simplest, and it is already in lowest terms — which
 * matters, because the whole decision below turns on the parity of q.
 */
export function asSimpleFraction(x: number, maxDenominator = 1000, tolerance = 1e-9): Fraction | null {
  if (!Number.isFinite(x)) return null
  const sign = x < 0 ? -1 : 1
  const target = Math.abs(x)

  let hPrev = 0
  let h = 1
  let kPrev = 1
  let k = 0
  let rest = target

  for (let i = 0; i < 40; i += 1) {
    const whole = Math.floor(rest)
    const hNext = whole * h + hPrev
    const kNext = whole * k + kPrev
    if (kNext > maxDenominator || !Number.isFinite(kNext)) return null
    hPrev = h
    h = hNext
    kPrev = k
    k = kNext
    if (k > 0 && Math.abs(target - h / k) <= tolerance * Math.max(1, target)) {
      return { p: sign * h, q: k }
    }
    const fractional = rest - whole
    if (fractional === 0) return null
    rest = 1 / fractional
  }
  return null
}

// ── A power, magnitude carried independently of the double ───────────────────

export interface Power {
  /** Best available double. May be Infinity on overflow or 0 on underflow. */
  value: number
  /** log10 of |value|, computed as n x log10(|b|). -Infinity for a true zero. */
  log10: number
  /** Sign of the result: 0 only when the result is exactly zero. */
  sign: -1 | 0 | 1
  /** True when `value` is a faithful, displayable double rather than a limit. */
  representable: boolean
  /** The rational read out of the exponent, when the exponent was not an integer. */
  fraction: Fraction | null
}

const ZERO: Power = {
  value: 0,
  log10: Number.NEGATIVE_INFINITY,
  sign: 0,
  representable: true,
  fraction: null,
}

/**
 * b^n, or null when no real value exists (a negative base with an
 * even-denominator fractional exponent, or zero to a negative power).
 */
export function power(base: number, exponent: number): Power | null {
  if (!Number.isFinite(base) || !Number.isFinite(exponent)) return null

  // The convention, stated once: 0^0 = 1, alongside b^0 = 1 for every b.
  if (exponent === 0) return { value: 1, log10: 0, sign: 1, representable: true, fraction: null }
  if (base === 0) {
    if (exponent > 0) return ZERO
    return null // 1 / 0
  }

  const magnitudeBase = Math.abs(base)
  let sign: -1 | 1 = 1
  let effective = exponent
  let fraction: Fraction | null = null

  if (!Number.isInteger(exponent)) {
    fraction = asSimpleFraction(exponent)
    if (fraction) {
      // Back-substitution in log space: (p/q) must reproduce the exponent, and
      // raising the base to it must reproduce b^p under q-th powers. Logs keep
      // the check honest where b^p would overflow.
      const ratio = fraction.p / fraction.q
      if (Math.abs(ratio - exponent) > 1e-9 * Math.max(1, Math.abs(exponent))) fraction = null
    }
  }

  if (base < 0) {
    if (Number.isInteger(exponent)) {
      sign = Math.abs(exponent) % 2 === 1 ? -1 : 1
    } else {
      // No usable rational, or an even denominator: there is no real q-th root
      // of a negative number, so there is no real answer to give.
      if (!fraction || fraction.q % 2 === 0) return null
      sign = Math.abs(fraction.p) % 2 === 1 ? -1 : 1
      effective = fraction.p / fraction.q
    }
  }

  const log10 = effective * Math.log10(magnitudeBase)

  const approx = Math.pow(magnitudeBase, effective)
  const exact = exactDecimalPow(magnitudeBase, effective)
  let magnitude = approx
  if (
    exact !== null &&
    Number.isFinite(approx) &&
    approx !== 0 &&
    Math.abs(exact - approx) <= 1e-9 * Math.abs(approx)
  ) {
    magnitude = exact
  }

  /*
   * A near-whole magnitude is snapped, but only once back-substitution confirms
   * it — the same discipline `math/logarithm-calculator` uses to snap
   * log_7(343) to 3. (-8)^(10/3) is exactly 1024, and `Math.pow` returns
   * 1024.0000000000002; taking the effective-th root of 1024 gives 8 back, so
   * the whole number is verified rather than merely nearby. A value that is
   * only close to an integer, and does not reproduce the base, is left alone.
   */
  if (Number.isFinite(magnitude) && magnitude > 0 && magnitude < 1e15) {
    const rounded = Math.round(magnitude)
    if (rounded !== magnitude && rounded > 0 && Math.abs(magnitude - rounded) <= 1e-9 * magnitude) {
      const back = Math.pow(rounded, 1 / effective)
      if (Number.isFinite(back) && Math.abs(back - magnitudeBase) <= 1e-9 * magnitudeBase) {
        magnitude = rounded
      }
    }
  }

  const representable = Number.isFinite(magnitude) && magnitude !== 0
  return { value: sign * magnitude, log10, sign, representable, fraction }
}

// ── Presentation ─────────────────────────────────────────────────────────────

/**
 * The band inside which a plain decimal is the readable form. Outside it,
 * scientific notation is — 8.882e-16 formatted as a decimal is "0.000000", and
 * a 30-digit integer formatted with separators is unreadable and, past 2^53,
 * partly invented.
 */
const SMALL = 1e-6
const LARGE = 1e15

/**
 * Scientific notation to four significant figures, derived from the LOG rather
 * than from the double, so it still works once the double has become Infinity
 * or collapsed to zero. Same convention as `math/combination-calculator`.
 */
export function scientific(log10: number): string {
  if (!Number.isFinite(log10)) return '0'
  const exponent = Math.floor(log10)
  const mantissa = Math.pow(10, log10 - exponent)
  // Rounding 9.9997 to four figures gives 10.00, which is not a mantissa.
  if (mantissa >= 9.9995) return `1.000 x 10^${exponent + 1}`
  return `${mantissa.toFixed(3)} x 10^${exponent}`
}

function signedScientific(p: Power): string {
  if (p.sign === 0) return '0'
  return `${p.sign < 0 ? '-' : ''}${scientific(p.log10)}`
}

/**
 * The fewest decimal places that still print the value exactly.
 *
 * This is the other half of the floating-point answer: computing 1.1^2 as
 * 121/100 is pointless if the formatter then prints "1.210000" for it. 1024
 * needs none, 1.21 needs two, 0.001 needs three.
 *
 * An endless value — sqrt(2), or 2^0.3 — has no exact number of places, so it
 * falls back to seven significant figures rather than to a fixed count of
 * decimals: six places is right for 1.414214 and would print 0.000014 for a
 * value out at 1.4e-5, throwing away every digit that distinguishes it.
 */
export function tidyDecimals(n: number): number {
  if (!Number.isFinite(n) || n === 0) return 0
  for (let d = 0; d <= 15; d += 1) {
    if (Number(n.toFixed(d)) === n) return d
  }
  return Math.min(15, Math.max(0, 6 - Math.floor(Math.log10(Math.abs(n)))))
}

/** A power as a display Quantity, in whichever of the two forms fits. */
export function quantityFor(label: string, p: Power | null): Quantity {
  if (!p) return { label, value: 'no real value', format: { style: 'raw' } }
  if (p.sign === 0) return { label, value: 0, format: { style: 'decimal', decimals: 0 } }
  const magnitude = Math.abs(p.value)
  if (p.representable && magnitude >= SMALL && magnitude < LARGE) {
    return { label, value: p.value, format: { style: 'decimal', decimals: tidyDecimals(p.value) } }
  }
  return { label, value: `about ${signedScientific(p)}`, format: { style: 'raw' } }
}

/** The same figure as text, for embedding inside a worked step. */
function text(p: Power | null): string {
  const q = quantityFor('', p)
  return formatValue(q.value, q.format)
}

/** A number for embedding in prose: whole numbers bare, everything else trimmed. */
function show(n: number): string {
  if (!Number.isFinite(n)) return '-'
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n)
  return String(Number(n.toPrecision(12)))
}

const raw = (label: string, value: string): Quantity => ({ label, value, format: { style: 'raw' } })

/**
 * `b^n` written the way a reader parses it: a negative base or exponent is
 * bracketed, because "-1000^10" reads as the negative of 1000^10 — a different
 * number from (-1000)^10 — and a recognised fraction is shown as a fraction,
 * because "(-8)^(1/3)" is the thing being asked about and
 * "(-8)^0.333333333333" is a 12-digit distraction.
 */
function powerLabel(base: number, n: number): string {
  const b = base < 0 ? `(${show(base)})` : show(base)
  const f = asSimpleFraction(n)
  if (f && f.q > 1) return `${b}^(${f.p}/${f.q})`
  return n < 0 ? `${b}^(${show(n)})` : `${b}^${show(n)}`
}

/** An ordinal-ish name for a small root, so "the 3rd root" reads as "cube root". */
function rootName(q: number): string {
  if (q === 2) return 'square root'
  if (q === 3) return 'cube root'
  return `${q}th root`
}

/** b x b x b ... written out, elided once it stops being readable. */
function expansion(base: number, k: number): string {
  // Bracketed while negative: "-2 x -2" is ambiguous, "(-2) x (-2)" is not.
  const b = base < 0 ? `(${show(base)})` : show(base)
  if (k <= 6) return Array.from({ length: k }, () => b).join(' x ')
  return `${b} x ${b} x ${b} x ... x ${b}`
}

export default function compute(v: Values<typeof fields>): CalcResult {
  const { base, exponent } = v

  // Finiteness FIRST. `coerceValues` deliberately produces NaN for unparseable
  // input, and every magnitude test below is false for NaN, so a bare range
  // check would let it through and hand back a NaN from a "valid" result.
  if (!Number.isFinite(base))
    throw new CalcError(
      'Enter a finite number for the base. The base is the number being multiplied by itself, so a blank, a word, or infinity has no power to raise.',
      'base',
    )
  if (!Number.isFinite(exponent))
    throw new CalcError(
      'Enter a finite number for the exponent. The exponent says how many times the base is used as a factor, so it has to be an actual value.',
      'exponent',
    )

  if (base === 0 && exponent < 0)
    throw new CalcError(
      'Zero cannot be raised to a negative power. A negative exponent means a reciprocal — 0^-3 is 1 divided by 0^3, which is 1 divided by 0, and that is undefined. Use a nonzero base, or a positive exponent.',
      'base',
    )

  const result = power(base, exponent)
  if (!result) {
    const fraction = asSimpleFraction(exponent)
    const denominator = fraction ? fraction.q : null
    throw new CalcError(
      denominator
        ? `A negative base has no real ${rootName(denominator)}. The exponent ${show(exponent)} is ${show(fraction!.p)}/${denominator}, and taking an even root of a negative number leaves the real numbers entirely — no real number squared gives a negative. The answer exists only among the complex numbers, which this calculator does not report. Use an odd denominator such as 1/3 or 0.2, or a positive base.`
        : `A negative base only has a real power when the exponent is a whole number or a fraction with an odd denominator. ${show(exponent)} is neither close enough to a simple fraction to read as one nor a whole number, so there is no real answer to give. Try a whole exponent, or a positive base.`,
      'exponent',
    )
  }

  const isInteger = Number.isInteger(exponent)
  const fraction = result.fraction
  const rootQ = fraction && fraction.q > 1 ? fraction.q : null

  // The three companion powers, each one a law made checkable rather than
  // asserted. Every one of them is real whenever the answer itself is: if q is
  // odd for n, it is odd for -n, for n + 3 and for 2n too.
  const reciprocal = power(base, -exponent)
  const plusThree = power(base, exponent + 3)
  const cubed = power(base, 3)
  const doubled = power(base, 2 * exponent)
  // (b^n)^2 squared from the ANSWER rather than from the base, so the check is
  // an independent route to b^(2n). Built by hand rather than through `power`
  // because the answer itself may already be Infinity, which `power` refuses.
  const squared: Power =
    (Number.isFinite(result.value) && result.value !== 0 ? power(result.value, 2) : null) ?? {
      value: result.value * result.value,
      log10: 2 * result.log10,
      sign: result.sign === 0 ? 0 : 1,
      representable: Number.isFinite(result.value * result.value) && result.value !== 0,
      fraction: null,
    }

  const bt = base < 0 ? `(${show(base)})` : show(base)
  const expression = powerLabel(base, exponent)

  const meaning = isInteger
    ? exponent === 0
      ? base === 0
        ? 'Zero to the power zero. This calculator answers 1, the discrete-maths convention: the empty product is 1.'
        : 'Any nonzero number to the power zero is 1, because b^n divided by b^n is both 1 and b^0.'
      : exponent > 0
        ? `Multiply ${bt} by itself, using it as a factor ${show(exponent)} times.`
        : `A negative exponent is a reciprocal: ${expression} = 1 / ${bt}^${show(Math.abs(exponent))}.`
    : rootQ
      ? fraction!.p === 1
        ? `A fractional exponent is a root: ${expression} is exactly the ${rootName(rootQ)} of ${bt}.`
        : `A fractional exponent is a root: ${expression} = the ${rootName(rootQ)} of ${bt}, raised to the power ${show(Math.abs(fraction!.p))}${fraction!.p < 0 ? ', then reciprocated' : ''}.`
      : `A fractional exponent is a root. ${expression} is ${bt} raised to a non-whole power, evaluated as e^(${show(exponent)} x ln ${show(base)}).`

  const written = isInteger
    ? exponent === 0
      ? '1 (the empty product — nothing is multiplied at all)'
      : exponent > 0
        ? `${expansion(base, Math.min(Math.abs(exponent), 7))}${Math.abs(exponent) > 6 ? `  (${show(Math.abs(exponent))} factors)` : ''}`
        : `1 / (${expansion(base, Math.min(Math.abs(exponent), 7))})${Math.abs(exponent) > 6 ? `  (${show(Math.abs(exponent))} factors)` : ''}`
    : rootQ
      ? fraction!.p === 1
        ? `the ${rootName(rootQ)} of ${bt}`
        : `(${rootName(rootQ)} of ${bt})^${show(fraction!.p)}`
      : `exp(${show(exponent)} x ln ${show(Math.abs(base))})`

  const stats: Quantity[] = [
    raw('Scientific notation', result.sign === 0 ? '0' : signedScientific(result)),
    raw(
      'Order of magnitude — log₁₀ of the size',
      result.sign === 0
        ? 'undefined (the result is exactly zero)'
        : show(Number(result.log10.toPrecision(12))),
    ),
    quantityFor(`Reciprocal — ${powerLabel(base, -exponent)}`, reciprocal),
    quantityFor(`Product law — b^n x b^3 = ${powerLabel(base, exponent + 3)}`, plusThree),
    quantityFor(`Power law — (b^n)^2 = ${powerLabel(base, 2 * exponent)}`, doubled),
    raw(
      'Sign of the result',
      result.sign === 0
        ? 'Zero'
        : result.sign < 0
          ? 'Negative — a negative base raised to an odd power stays negative'
          : base < 0
            ? 'Positive — a negative base raised to an even power turns positive'
            : 'Positive — a positive base is positive at every power',
    ),
  ]

  const steps: (Quantity | StepRule)[] = [
    { label: 'Base (b)', value: base, format: { style: 'decimal', decimals: tidyDecimals(base) } },
    {
      label: 'Exponent (n)',
      value: exponent,
      format: { style: 'decimal', decimals: tidyDecimals(exponent) },
    },
    { rule: true },
    raw('Expression', expression),
    raw('The law that applies', meaning),
    raw('Written out', written),
    raw('Answer', text(result)),
    { rule: true },
    raw('Scientific notation', result.sign === 0 ? '0' : signedScientific(result)),
    raw(
      `Check — b^n x b^3 = b^(n+3)`,
      `${text(result)} x ${text(cubed)} = ${text(plusThree)}`,
    ),
    raw(
      `Check — (b^n)^2 = b^(2n)`,
      `${text(squared)} = ${text(doubled)}`,
    ),
    raw(
      `Check — b^-n = 1 / b^n`,
      `1 / ${text(result)} = ${text(reciprocal)}`,
    ),
  ]

  const notes: string[] = []

  if (base === 0 && exponent === 0)
    notes.push(
      'This calculator answers 0^0 = 1. That is a convention, not a theorem, and it is the one algebra and combinatorics use: the empty product is 1, there is exactly one way to choose nothing, and the binomial theorem and every power series need x^0 = 1 at x = 0. Analysis usually calls 0^0 indeterminate instead, because x^y has no single limit as x and y both approach 0 — 0^y is 0 for every positive y, while x^0 is 1 for every nonzero x. Both camps are describing something real; this page picks the discrete one, which is also what JavaScript, Python and IEEE 754 pow return.',
    )
  else if (exponent === 0)
    notes.push(
      `Any nonzero base to the power 0 is 1, ${bt} included. It follows from the division law: b^n divided by b^n is 1, and is also b^(n-n) = b^0.`,
    )

  if (base < 0 && rootQ)
    notes.push(
      `A negative base with a fractional exponent is NaN in most programming languages, including JavaScript, because for an arbitrary real exponent the principal value is complex. Here the exponent ${show(exponent)} was read as the fraction ${show(fraction!.p)}/${rootQ}, and an odd denominator means the real ${rootName(rootQ)} does exist: the ${rootName(rootQ)} of ${bt} is negative, and raising it to the power ${show(fraction!.p)} gives the answer above.`,
    )

  if (exponent < 0)
    notes.push(
      `The negative exponent makes this a reciprocal: ${expression} = 1 divided by ${bt}^${show(Math.abs(exponent))}. That is why the answer is smaller than 1 whenever the base is bigger than 1.`,
    )

  if (!result.representable && result.sign !== 0)
    notes.push(
      result.log10 > 0
        ? 'This result is past 1.8e308, the largest number a double can hold, so the exact value is not available as a number here. The magnitude is still exact arithmetic — it is carried as n x log10(b) rather than by multiplying the base out — so the power of ten above is right even though the digits after the first four are unknown.'
        : 'This result is smaller than about 5e-324, the smallest number a double can hold, so it collapses to zero as a plain number. The magnitude above is carried as n x log10(b) instead, which stays meaningful below that floor.',
    )

  if (Math.abs(base) < 1 && base !== 0 && exponent > 1)
    notes.push(
      'A base between -1 and 1 shrinks as the exponent grows: multiplying by a fraction repeatedly makes the result smaller, not larger.',
    )

  return {
    primary: quantityFor(`${expression}`, result),
    stats,
    steps,
    notes,
  }
}

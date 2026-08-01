import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, StepRule, Values } from '../../../lib/types'
import type { fields } from './fields'

/*
 * Scientific notation — a number as a coefficient times a power of ten, and the
 * arithmetic that goes with it.
 *
 * ── Why the coefficient and the exponent stay apart ──────────────────────────
 *
 * Because multiplying them together throws the answer away. 6.02 x 10^300 times
 * 3 x 10^300 is 1.806 x 10^601, a number a double cannot hold: evaluate it and
 * you get Infinity, and every digit of a perfectly well-defined answer is gone.
 * Kept apart, the exponent arithmetic is addition on two integers and stays
 * exact however large it gets, while the coefficient arithmetic happens on
 * numbers between 1 and 10, where a double is at its most accurate. So this
 * page reports 2 x 10^601 rather than a dash. It is the same discipline
 * `math/exponent-calculator` uses when it carries a magnitude as n x log10(b).
 *
 * ── Why the significant-figure rules are the point ───────────────────────────
 *
 * Without them this page is a two-line utility with nothing to show. With them
 * it answers the question a student is actually stuck on, and the two rules are
 * genuinely different from each other:
 *
 *   MULTIPLY and DIVIDE keep the COUNT. The answer gets as many significant
 *   figures as whichever input had the fewest. It is a statement about RELATIVE
 *   error: multiplying multiplies the relative errors, so the sloppiest factor
 *   sets the precision of the product, whatever the exponents are doing.
 *
 *   ADD and SUBTRACT keep the PLACE. Line the numbers up by their decimal
 *   points and the answer stops where the coarser input stopped. It is a
 *   statement about ABSOLUTE error: adding adds the absolute errors, so a
 *   figure known only to the nearest thousand keeps the sum honest at the
 *   nearest thousand no matter how precise the other term was.
 *
 * The consequence that surprises people is subtraction. 1.5 x 10^5 minus
 * 1.49 x 10^5 is 1 x 10^3 as plain arithmetic, but both inputs stop at the 10^4
 * place, so nothing about that answer is significant — the digits that survived
 * the cancellation were exactly the uncertain ones. The page says so rather
 * than reporting a confident 1000.
 *
 * ── Where floating point still gets in ───────────────────────────────────────
 *
 * Only through the coefficient. 1.5 - 1.4 is 0.09999999999999987 in a double,
 * and reading that string would report fifteen nines as significant digits. So
 * every computed coefficient goes through `toPrecision(12)` before its digits
 * are read — the same trick `math/exponent-calculator` uses to print a number
 * for a human — which restores 0.1 and caps what this page will ever claim at
 * twelve figures. The rounding itself then happens on the digit string, so a
 * dropped 5 rounds up as taught rather than as the binary value happens to sit.
 */

// ── A number in scientific notation ──────────────────────────────────────────

interface Sci {
  sign: -1 | 1
  /** Significant digits, the first one non-zero. Empty only for zero. */
  digits: string
  /** Power of ten of the FIRST digit, so the value is d1.d2... x 10^exp. */
  exp: number
  zero: boolean
}

const ZERO: Sci = { sign: 1, digits: '', exp: 0, zero: true }

/** The most digits a double is worth trusting for, and this page's ceiling. */
const CLEAN = 12

/**
 * A double as significant digits and a power of ten, read off its own decimal
 * representation rather than through logarithms.
 *
 * `Math.log10` is the obvious route and the wrong one: one bit of error in a
 * logarithm shifts the whole answer by a factor of ten. `String(n)` gives the
 * shortest decimal that round-trips to the same double, so reading it is exact
 * and involves no arbitrary precision choice.
 *
 * Trailing zeros are stripped, which is also the honest significant-figure
 * reading of a number that arrived through a numeric input: 250 keeps two
 * figures and 3 keeps one, because nothing in a double records whether zeros
 * were written after them.
 */
function fromNumber(n: number): Sci {
  if (n === 0 || !Number.isFinite(n)) return ZERO
  const [mantissa, suffix] = String(Math.abs(n)).split('e')
  const [intPart, fracPart] = mantissa!.split('.')
  const allDigits = (intPart ?? '') + (fracPart ?? '')
  const first = allDigits.search(/[1-9]/)
  return {
    sign: n < 0 ? -1 : 1,
    digits: allDigits.slice(first).replace(/0+$/, ''),
    exp: (intPart ?? '').length - 1 - first + (suffix ? Number(suffix) : 0),
    zero: false,
  }
}

/** The coefficient alone, always in [1, 10) and so always a well-behaved double. */
function coefficientOf(sci: Sci): number {
  if (sci.zero) return 0
  const { digits } = sci
  return sci.sign * Number(digits.length === 1 ? digits : `${digits[0]}.${digits.slice(1)}`)
}

/** A raw coefficient and exponent, cleaned of floating-point noise and restated. */
function normalise(coefficient: number, exponent: number): Sci {
  if (!Number.isFinite(coefficient) || coefficient === 0) return ZERO
  const cleaned = Number(coefficient.toPrecision(CLEAN))
  if (cleaned === 0) return ZERO
  const base = fromNumber(cleaned)
  return { ...base, exp: base.exp + exponent }
}

const sigFigsOf = (sci: Sci): number => sci.digits.length

/**
 * The power of ten of the LAST significant digit — where the number stops
 * making a claim. 6.02 x 10^23 has three figures starting at 10^23, so its last
 * one sits at 10^21 and it says nothing about the 10^20 place at all.
 */
const lastPlaceOf = (sci: Sci): number => sci.exp - sigFigsOf(sci) + 1

// ── Rounding, on the digits ──────────────────────────────────────────────────

/** digits + 1 in decimal. `carried` means it grew a place: 999 becomes 100 at 10x. */
function increment(digits: string): { digits: string; carried: boolean } {
  const out = digits.split('')
  for (let i = out.length - 1; i >= 0; i -= 1) {
    if (out[i] === '9') {
      out[i] = '0'
      continue
    }
    out[i] = String(Number(out[i]) + 1)
    return { digits: out.join(''), carried: false }
  }
  return { digits: `1${out.join('')}`.slice(0, -1), carried: true }
}

/**
 * Round half up to `keep` significant figures, on the digit string.
 *
 * The result is exactly `keep` digits long, trailing zeros included — those
 * zeros ARE the claim of precision, and stripping them would delete the answer
 * to the question the page was asked.
 */
function roundTo(sci: Sci, keep: number): Sci {
  if (sci.zero) return ZERO
  if (keep >= sci.digits.length) return { ...sci, digits: sci.digits.padEnd(keep, '0') }
  const kept = sci.digits.slice(0, keep)
  if (sci.digits[keep]! < '5') return { ...sci, digits: kept }
  const { digits, carried } = increment(kept)
  return { ...sci, digits, exp: sci.exp + (carried ? 1 : 0) }
}

// ── Rendering ────────────────────────────────────────────────────────────────

/** The longest plain decimal worth printing before it stops being readable. */
const READABLE = 36

/** sign x d1.d2...dn x 10^exponent, written out as an ordinary decimal. */
function plain(sign: -1 | 1, digits: string, exponent: number): string {
  const body =
    exponent >= digits.length - 1
      ? digits + '0'.repeat(exponent - digits.length + 1)
      : exponent >= 0
        ? `${digits.slice(0, exponent + 1)}.${digits.slice(exponent + 1)}`
        : `0.${'0'.repeat(-exponent - 1)}${digits}`
  return sign < 0 ? `-${body}` : body
}

/** The digits with a decimal point inserted after `after` of them. */
function withPoint(sign: -1 | 1, digits: string, after: number): string {
  const tail = digits.slice(after)
  return `${sign < 0 ? '-' : ''}${digits.slice(0, after)}${tail ? `.${tail}` : ''}`
}

/** Standard form: exactly one digit before the point. */
const standard = (sci: Sci): string =>
  sci.zero ? '0' : `${withPoint(sci.sign, sci.digits, 1)} × 10^${sci.exp}`

/**
 * Engineering notation: the same number with the exponent forced to a multiple
 * of three, so it lines up with the SI prefixes. The coefficient then sits
 * somewhere in [1, 1000) rather than [1, 10).
 */
function engineering(sci: Sci): string {
  if (sci.zero) return '0'
  const exponent = Math.floor(sci.exp / 3) * 3
  const shift = sci.exp - exponent
  return `${withPoint(sci.sign, sci.digits.padEnd(shift + 1, '0'), shift + 1)} × 10^${exponent}`
}

/** Written out in full, or an honest refusal when that would be unreadable. */
function expanded(sci: Sci): string {
  if (sci.zero) return '0'
  const text = plain(sci.sign, sci.digits, sci.exp)
  if (text.length <= READABLE) return text
  const digitCount = sci.exp >= 0 ? sci.exp + 1 : sci.digits.length - sci.exp - 1
  return `too long to write out — ${digitCount} digits`
}

/*
 * The SI prefixes, as they stand after the 27th CGPM (2022) added ronna, quetta,
 * ronto and quecto. They are the reason engineering notation exists: 602 x 10^21
 * is 602 zetta-something, where 6.02 x 10^23 is not any named quantity at all.
 */
const SI_PREFIXES: Readonly<Record<string, string>> = {
  '30': 'quetta (Q)',
  '27': 'ronna (R)',
  '24': 'yotta (Y)',
  '21': 'zetta (Z)',
  '18': 'exa (E)',
  '15': 'peta (P)',
  '12': 'tera (T)',
  '9': 'giga (G)',
  '6': 'mega (M)',
  '3': 'kilo (k)',
  '0': 'none — the coefficient is the number itself',
  '-3': 'milli (m)',
  '-6': 'micro (µ)',
  '-9': 'nano (n)',
  '-12': 'pico (p)',
  '-15': 'femto (f)',
  '-18': 'atto (a)',
  '-21': 'zepto (z)',
  '-24': 'yocto (y)',
  '-27': 'ronto (r)',
  '-30': 'quecto (q)',
}

function siPrefix(sci: Sci): string {
  if (sci.zero) return 'none — the number is zero'
  const exponent = Math.floor(sci.exp / 3) * 3
  return SI_PREFIXES[String(exponent)] ?? `none — 10^${exponent} is past the named prefixes`
}

const raw = (label: string, value: string): Quantity => ({ label, value, format: { style: 'raw' } })
const whole = (label: string, value: number): Quantity => ({
  label,
  value,
  format: { style: 'decimal', decimals: 0 },
})

const figures = (n: number): string =>
  n === 1 ? '1 significant figure' : `${n} significant figures`

/** A number for embedding in prose: whole numbers bare, everything else trimmed. */
function show(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n)
  return String(Number(n.toPrecision(CLEAN)))
}

/** An operand named for a step, with what it does and does not claim. */
const describe = (sci: Sci): string =>
  sci.zero
    ? '0 — zero states no digits at all'
    : `${standard(sci)}  (${figures(sigFigsOf(sci))}, the last at 10^${lastPlaceOf(sci)})`

/** The coefficient restated against a different power of ten, for lining up. */
function alignedTo(sci: Sci, exponent: number): string {
  if (sci.zero) return '0'
  const shift = sci.exp - exponent
  const text = plain(sci.sign, sci.digits, shift)
  return text.length <= READABLE ? text : `(${withPoint(sci.sign, sci.digits, 1)} × 10^${shift})`
}

// ── Reading the form ─────────────────────────────────────────────────────────

const MAX_EXPONENT = 350

const RESULT_LABEL: Readonly<Record<string, string>> = {
  normalise: 'Standard form',
  multiply: 'Product',
  divide: 'Quotient',
  add: 'Sum',
  subtract: 'Difference',
}

function readOperand(
  coefficient: number,
  exponent: number,
  coefficientField: string,
  exponentField: string,
  name: string,
): Sci {
  // Finiteness FIRST. `coerceValues` emits NaN for unparseable input, and every
  // magnitude test below is false for NaN, so a bare range check would let it
  // straight through and hand back a result built out of NaN.
  if (!Number.isFinite(coefficient))
    throw new CalcError(
      `Enter a finite coefficient for ${name}. It is the number in front of the power of ten, so it has to be an actual value.`,
      coefficientField,
    )
  if (!Number.isFinite(exponent))
    throw new CalcError(
      `Enter a finite exponent for ${name}. It counts how many places the decimal point moves, so it has to be an actual value.`,
      exponentField,
    )
  if (!Number.isInteger(exponent))
    throw new CalcError(
      `The exponent of ${name} counts places, so it has to be a whole number. 10^${show(exponent)} is a perfectly good number, but it is a root rather than a power of ten and cannot be written in scientific notation.`,
      exponentField,
    )
  if (Math.abs(exponent) > MAX_EXPONENT)
    throw new CalcError(
      `Keep the exponent of ${name} within ${MAX_EXPONENT}. Past that the notation has stopped describing anything measured — the observable universe is about 10^27 metres across and the Planck length is about 10^-35 metres.`,
      exponentField,
    )
  return normalise(coefficient, exponent)
}

// ── The calculator ───────────────────────────────────────────────────────────

export default function compute(v: Values<typeof fields>): CalcResult {
  const { operation, coefficientA, exponentA, coefficientB, exponentB } = v

  const usesB = operation !== 'normalise'
  const a = readOperand(coefficientA, exponentA, 'coefficientA', 'exponentA', 'A')
  const b = usesB ? readOperand(coefficientB, exponentB, 'coefficientB', 'exponentB', 'B') : ZERO

  if (operation === 'divide' && b.zero)
    throw new CalcError(
      'B is zero, and nothing can be divided by zero. A coefficient of zero makes the whole of B zero however large its exponent is, because 0 × 10^n is 0.',
      'coefficientB',
    )

  const notes: string[] = []
  const steps: (Quantity | StepRule)[] = []

  // A number input has nowhere to keep the trailing zero of 3.0, so a whole
  // coefficient always reads as fewer figures than a textbook wrote. Say so,
  // rather than quietly rounding the answer harder than the source did.
  const rounded = [
    { sci: a, typed: coefficientA, name: 'A' },
    ...(usesB ? [{ sci: b, typed: coefficientB, name: 'B' }] : []),
  ].filter((operand) => !operand.sci.zero && Number.isInteger(operand.typed))
  if (rounded.length > 0)
    notes.push(
      `${rounded
        .map(
          (operand) =>
            `The coefficient of ${operand.name} is ${show(operand.typed)}, which reads as ${figures(sigFigsOf(operand.sci))}`,
        )
        .join('. ')}. A number box has nowhere to record a trailing zero, so a textbook's 3.0 arrives here as 3 and its 2.50 as 2.5, and the rule below is applied to the shorter count. Where those zeros were measured, count the figures yourself — the significant figures calculator takes the number as text and keeps them.`,
    )

  let result: Sci
  let unrounded: Sci
  /** Figures the precision rule asked for, before the twelve-digit ceiling. */
  let asked: number | null = null
  let keep: number | null = null

  if (operation === 'normalise') {
    // Restating a number changes nothing about it, so nothing is rounded and
    // the figures the input carried are the figures the answer carries.
    unrounded = a
    result = a
    const places = a.exp - exponentA
    steps.push(
      raw('Number as entered', `${show(coefficientA)} × 10^${show(exponentA)}`),
      raw(
        'Is the coefficient between 1 and 10?',
        a.zero
          ? 'The coefficient is zero, so the whole number is zero however large the exponent'
          : places === 0
            ? `Yes — ${show(coefficientA)} is already in range, so nothing moves`
            : `No — ${show(coefficientA)} is ${Math.abs(coefficientA) >= 10 ? '10 or more' : 'below 1'}, so the point has to move`,
      ),
      raw(
        'Move the decimal point',
        a.zero
          ? 'not applicable'
          : places === 0
            ? 'no places — it is already in standard form'
            : `${Math.abs(places)} place${Math.abs(places) === 1 ? '' : 's'} to the ${places > 0 ? 'left, so the exponent goes UP' : 'right, so the exponent goes DOWN'} by ${Math.abs(places)}: ${show(exponentA)} becomes ${a.exp}`,
      ),
      { rule: true },
      raw('Standard form', standard(a)),
      raw('Engineering notation', engineering(a)),
      raw('Written out', expanded(a)),
      raw(
        'Significant figures',
        a.zero
          ? 'none — zero states no digits'
          : `${sigFigsOf(a)} — restating a number cannot change what it claims`,
      ),
    )
  } else if (operation === 'multiply' || operation === 'divide') {
    const isProduct = operation === 'multiply'
    const coefficient = isProduct
      ? coefficientOf(a) * coefficientOf(b)
      : coefficientOf(a) / coefficientOf(b)
    const exponent = isProduct ? a.exp + b.exp : a.exp - b.exp
    unrounded = normalise(coefficient, exponent)

    // Zero has no figures to offer, so it cannot be what sets the count. The
    // answer is zero either way.
    asked = Math.min(sigFigsOf(a) || CLEAN, sigFigsOf(b) || CLEAN)
    keep = Math.max(1, Math.min(asked, CLEAN))
    result = roundTo(unrounded, keep)

    steps.push(
      raw('A', describe(a)),
      raw('B', describe(b)),
      { rule: true },
      raw(
        isProduct ? 'Multiply the coefficients' : 'Divide the coefficients',
        `${show(coefficientOf(a))} ${isProduct ? '×' : '÷'} ${show(coefficientOf(b))} = ${show(coefficient)}`,
      ),
      raw(
        isProduct ? 'Add the exponents' : 'Subtract the exponents',
        `${a.exp} ${isProduct ? '+' : '−'} ${b.exp} = ${exponent}`,
      ),
      raw(
        'Back into standard form',
        `${show(coefficient)} × 10^${exponent} = ${standard(unrounded)}`,
      ),
      { rule: true },
      raw(
        `${isProduct ? 'Multiplying' : 'Dividing'} keeps the FEWER significant figures`,
        `A states ${sigFigsOf(a) || 'none'}, B states ${sigFigsOf(b) || 'none'}, so the answer keeps ${keep}`,
      ),
      raw(`Rounded to ${figures(keep)}`, standard(result)),
    )
  } else {
    const sign = operation === 'add' ? 1 : -1
    // Line both numbers up on the LARGER exponent. Neither is ever materialised
    // as a full double, so 10^300 alongside 10^-300 is a shift that underflows
    // to zero — the right answer to the precision being kept — rather than an
    // Infinity or a silent loss of the large term.
    const exponent = a.zero && b.zero ? 0 : a.zero ? b.exp : b.zero ? a.exp : Math.max(a.exp, b.exp)
    const alignedA = a.zero ? 0 : coefficientOf(a) * Math.pow(10, a.exp - exponent)
    const alignedB = b.zero ? 0 : sign * coefficientOf(b) * Math.pow(10, b.exp - exponent)
    const coefficient = alignedA + alignedB
    unrounded = normalise(coefficient, exponent)

    // The answer stops where the COARSER input stopped: absolute precision, not
    // relative. A last place only exists for a number with digits in it, so a
    // zero operand contributes none.
    const places = [a, b].filter((operand) => !operand.zero).map(lastPlaceOf)
    const lastPlace = places.length > 0 ? Math.max(...places) : 0
    asked = unrounded.zero ? 0 : unrounded.exp - lastPlace + 1
    keep = Math.min(asked, CLEAN)
    result = keep >= 1 ? roundTo(unrounded, keep) : ZERO

    steps.push(
      raw('A', describe(a)),
      raw('B', describe(b)),
      { rule: true },
      raw(
        'Line the exponents up on the larger one',
        `(${alignedTo(a, exponent)} ${sign > 0 ? '+' : '−'} ${alignedTo(b, exponent)}) × 10^${exponent}`,
      ),
      raw(
        operation === 'add' ? 'Add the coefficients' : 'Subtract the coefficients',
        `${alignedTo(a, exponent)} ${sign > 0 ? '+' : '−'} ${alignedTo(b, exponent)} = ${show(coefficient)}`,
      ),
      raw('Back into standard form', standard(unrounded)),
      { rule: true },
      raw(
        `${operation === 'add' ? 'Adding' : 'Subtracting'} keeps the COARSER last place`,
        a.zero || b.zero
          ? `Only one of the two states any digits, so the answer stops where it does: 10^${lastPlace}`
          : `A stops at 10^${lastPlaceOf(a)} and B stops at 10^${lastPlaceOf(b)}, so the answer stops at 10^${lastPlace}`,
      ),
      raw(
        'Which is how many figures here',
        unrounded.zero
          ? 'None — the two numbers cancel exactly'
          : asked >= 1
            ? `${standard(unrounded)} starts at 10^${unrounded.exp} and stops at 10^${lastPlace}, so ${asked}`
            : `None at all — the answer is smaller than the 10^${lastPlace} place the inputs stop at`,
      ),
      raw(keep >= 1 ? `Rounded to ${figures(keep)}` : 'At that precision', standard(result)),
    )

    if (unrounded.zero)
      notes.push(
        'The two numbers are equal, so they cancel exactly and the answer is zero. Zero states no significant figures of its own — what it is a zero to is set by the inputs, which stop at the place named above.',
      )
    else if (asked < 1)
      notes.push(
        `Catastrophic cancellation. As plain arithmetic the answer is ${standard(unrounded)}, but both inputs stop making claims at the 10^${lastPlace} place and the answer is smaller than that, so not one of its digits is significant. Subtracting two nearby numbers destroys precision: the leading digits agree and cancel, leaving only the digits that were uncertain to begin with. It is why measurements meant to be subtracted are taken to more figures than the difference itself needs.`,
      )
  }

  if (asked !== null && asked > CLEAN)
    notes.push(
      `The rule asks for ${asked} significant figures here, but the coefficient arithmetic runs in double precision, which stops being trustworthy at about fifteen digits, so the answer is capped at ${CLEAN}. The exponent is unaffected: that part is exact integer arithmetic at any size.`,
    )

  if (!result.zero && Math.abs(result.exp) > 308)
    notes.push(
      `10^${result.exp} is past what a double-precision number can hold, so evaluated as an ordinary number this answer would come out as ${result.exp > 0 ? 'Infinity' : 'zero'}. It is right anyway, because the coefficient and the exponent were never multiplied together — the exponent came from adding two integers, which is exact at any size.`,
    )

  return {
    primary: {
      label: RESULT_LABEL[operation] ?? 'Standard form',
      // `raw` prints the string exactly as built. Every other style parses the
      // value back into a double, and the whole point of this page is answers
      // that no double can hold.
      value: standard(result),
      format: { style: 'raw' },
    },
    stats: [
      raw('Written out in full', expanded(result)),
      raw('Engineering notation', engineering(result)),
      raw(
        'Significant figures in the answer',
        result.zero
          ? 'none — zero states no digits'
          : keep === null
            ? `${sigFigsOf(result)}, carried straight over from the number you entered`
            : `${keep}, set by the ${
                operation === 'multiply' || operation === 'divide'
                  ? 'fewer-figures rule'
                  : 'coarser-place rule'
              }`,
      ),
      raw('SI prefix for this power of ten', siPrefix(result)),
      raw('Coefficient', result.zero ? '0' : withPoint(result.sign, result.digits, 1)),
      whole('Exponent (power of ten)', result.exp),
    ],
    steps,
    notes,
  }
}

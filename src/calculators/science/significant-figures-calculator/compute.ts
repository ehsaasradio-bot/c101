import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, Values } from '../../../lib/types'
import type { fields } from './fields'

/*
 * Significant figures — the digits of a written number that carry measured
 * information, as opposed to the zeros that only place the decimal point.
 *
 * The four rules, which are the same in every textbook and behind the guidance
 * in NIST SP 811:
 *
 *   1. Every NON-ZERO digit is significant.
 *   2. A zero BETWEEN two significant digits is significant. 505 has three;
 *      the middle zero is a measurement, not a placeholder.
 *   3. A LEADING zero is never significant. It exists only to position the
 *      decimal point, which is why it disappears in scientific notation:
 *      0.0045 is 4.5 x 10^-3, two figures written either way.
 *   4. A TRAILING zero is significant only when a decimal point is written.
 *      0.004500 has four. 1200 has two by the usual convention — and that
 *      convention is a guess, which this page says out loud rather than
 *      pretending the question has a single answer.
 *
 * ── Why every line below works on a STRING ───────────────────────────────────
 *
 * Because a double cannot hold the question. 0.004500 and 0.0045 parse to the
 * same double, so the four significant figures of the first are gone before any
 * arithmetic could start. The digits have to arrive, and stay, as text.
 *
 * Rounding has the same problem from the other end. `(1.005).toFixed(2)` is
 * '1.00', not '1.01', because 1.005 is stored as 1.00499999999999989 and the
 * rounding is therefore correct about the wrong number. Rounding the digit
 * string is exact by construction: no binary representation stands in the way,
 * so a 5 is a 5 and round-half-up means what it says. Nothing here ever
 * constructs a double from the input.
 *
 * ── Round half up ────────────────────────────────────────────────────────────
 *
 * "Look at the first digit dropped; if it is 5 or more, add one to the last
 * digit kept." That IS round-half-up rather than an approximation of it: a
 * dropped 5 followed by anything non-zero is more than half and rounds up too,
 * and a dropped 5 followed by nothing but zeros is exactly half and rounds up
 * by the rule. It is the convention taught alongside significant figures.
 * Metrology and IEEE 754 prefer round-half-to-even, which sends 0.0045 to
 * 0.004 rather than 0.005; a note says so on the exact ties where they differ.
 */

// ── Parsing ──────────────────────────────────────────────────────────────────

interface Written {
  sign: -1 | 1
  /** Digits before the decimal point, as typed. Empty for '.5'. */
  intPart: string
  /** Digits after the decimal point, as typed. Empty for '12.'. */
  fracPart: string
  /** Whether a decimal point was actually written. Rule 4 turns on this. */
  hasPoint: boolean
  /** The exponent from any scientific-notation suffix. */
  inputExponent: number
}

/** The largest power of ten accepted, so no rendering can run away. */
const MAX_EXPONENT = 400

const EXAMPLES = 'Enter one number, such as 0.004500, 1200, or 4.500e-3.'

function parseWritten(raw: string): Written {
  const trimmed = raw.trim()
  if (trimmed.length === 0)
    throw new CalcError(`Enter a number, written with every digit you recorded. ${EXAMPLES}`, 'value')

  // Thousands separators and spaces are noise. `x 10^`, `× 10^` and `*10^` all
  // mean the same thing as the `e` that replaces them.
  const cleaned = trimmed.replace(/[\s,_]/g, '').replace(/[x×*]10\^?/gi, 'e')

  const match = /^([+-]?)(\d*)(\.(\d*))?(?:e([+-]?\d+))?$/i.exec(cleaned)
  if (!match) throw new CalcError(`"${trimmed}" is not a number this page can read. ${EXAMPLES}`, 'value')

  const intPart = match[2] ?? ''
  const fracPart = match[4] ?? ''
  if (intPart.length + fracPart.length === 0)
    throw new CalcError(`"${trimmed}" has no digits in it. ${EXAMPLES}`, 'value')

  const inputExponent = match[5] ? Number(match[5]) : 0
  if (!Number.isFinite(inputExponent) || Math.abs(inputExponent) > MAX_EXPONENT)
    throw new CalcError(
      `Keep the power of ten within ${MAX_EXPONENT}. Significant figures are a question about the digits, and past that the placeholder zeros stop being printable.`,
      'value',
    )

  return {
    sign: match[1] === '-' ? -1 : 1,
    intPart,
    fracPart,
    hasPoint: match[3] !== undefined,
    inputExponent,
  }
}

// ── Classifying every digit ──────────────────────────────────────────────────

type Role = 'leading' | 'nonZero' | 'embedded' | 'trailingCounted' | 'trailingPlaceholder'

interface Reading {
  /** Every digit typed, integer part then fraction, decimal point removed. */
  allDigits: string
  /** What each of those digits is doing, in the same order. */
  roles: readonly Role[]
  /** Index of the first non-zero digit, or -1 when the number is zero. */
  first: number
  /** Digits from the first non-zero one onward, exactly as typed. */
  mantissa: string
  /** Power of ten of the first significant digit. 0.0045 gives -3. */
  exponent: number
  /** The count the four rules produce. */
  sigFigs: number
  /** True when trailing zeros in a whole number made that count a convention. */
  ambiguous: boolean
  isZero: boolean
}

function read(written: Written): Reading {
  const { intPart, fracPart, hasPoint, inputExponent } = written
  const allDigits = intPart + fracPart
  const first = allDigits.search(/[1-9]/)

  if (first === -1) {
    // Every digit is a zero, so rule 3 would count nothing at all — which is no
    // use as an answer. Zero is the one case the rules leave open; the usual
    // reading is that the decimals recorded are the claim of precision, so 0.00
    // states two figures and a bare 0 states one.
    return {
      allDigits,
      roles: allDigits.split('').map(() => 'leading' as Role),
      first: -1,
      mantissa: '0',
      exponent: 0,
      sigFigs: Math.max(1, fracPart.length),
      ambiguous: false,
      isZero: true,
    }
  }

  const roles: Role[] = []
  for (let i = 0; i < allDigits.length; i += 1) {
    if (i < first) roles.push('leading')
    else if (allDigits[i] !== '0') roles.push('nonZero')
    // A zero with a significant digit still to come is sandwiched, so it counts
    // however the number is written.
    else if (/[1-9]/.test(allDigits.slice(i + 1))) roles.push('embedded')
    else roles.push(hasPoint ? 'trailingCounted' : 'trailingPlaceholder')
  }

  return {
    allDigits,
    roles,
    first,
    mantissa: allDigits.slice(first),
    // The digit at index i has place value 10^(intPart.length - 1 - i).
    exponent: intPart.length - 1 - first + inputExponent,
    sigFigs: roles.filter((r) => r !== 'leading' && r !== 'trailingPlaceholder').length,
    ambiguous: roles.includes('trailingPlaceholder'),
    isZero: false,
  }
}

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
  // Every digit was a nine. 999 becomes 1000, one digit more than was asked
  // for, so drop the last and report the extra power of ten to the caller.
  return { digits: `1${out.join('')}`.slice(0, -1), carried: true }
}

interface Rounded {
  digits: string
  /** 0, or 1 when a carry pushed the leading digit up a place. */
  bump: 0 | 1
  /** The first digit thrown away, or null when nothing was dropped. */
  droppedFirst: string | null
  /** True when zeros had to be added to reach the requested count. */
  padded: boolean
  roundedUp: boolean
}

function roundToFigures(mantissa: string, keep: number): Rounded {
  if (keep >= mantissa.length)
    return {
      digits: mantissa.padEnd(keep, '0'),
      bump: 0,
      droppedFirst: null,
      padded: keep > mantissa.length,
      roundedUp: false,
    }

  const kept = mantissa.slice(0, keep)
  const droppedFirst = mantissa[keep]!
  if (droppedFirst < '5')
    return { digits: kept, bump: 0, droppedFirst, padded: false, roundedUp: false }

  const { digits, carried } = increment(kept)
  return { digits, bump: carried ? 1 : 0, droppedFirst, padded: false, roundedUp: true }
}

// ── Rendering ────────────────────────────────────────────────────────────────

/**
 * sign x d1.d2...dn x 10^exponent, written out in full.
 *
 * Exact string work in every branch — no double is ever constructed, so a
 * fifty-digit input survives intact and binary rounding never gets a say.
 */
function plain(sign: -1 | 1, digits: string, exponent: number): string {
  const body =
    exponent >= digits.length - 1
      ? digits + '0'.repeat(exponent - digits.length + 1)
      : exponent >= 0
        ? `${digits.slice(0, exponent + 1)}.${digits.slice(exponent + 1)}`
        : `0.${'0'.repeat(-exponent - 1)}${digits}`
  return sign < 0 ? `-${body}` : body
}

function scientific(sign: -1 | 1, digits: string, exponent: number): string {
  const coefficient = digits.length === 1 ? digits : `${digits[0]}.${digits.slice(1)}`
  return `${sign < 0 ? '-' : ''}${coefficient} × 10^${exponent}`
}

/** The longest plain decimal worth printing before scientific notation wins. */
const READABLE = 34

/** The digits playing one role, listed for a step: "4, 5". */
function listing(reading: Reading, role: Role): string {
  const picked = reading.allDigits.split('').filter((_, i) => reading.roles[i] === role)
  return picked.length === 0 ? 'none' : picked.join(', ')
}

const raw = (label: string, value: string): Quantity => ({ label, value, format: { style: 'raw' } })
const whole = (label: string, value: number): Quantity => ({
  label,
  value,
  format: { style: 'decimal', decimals: 0 },
})

const figures = (n: number): string => (n === 1 ? '1 figure' : `${n} figures`)

/** The convention this page uses for a number with no significant digits at all. */
const ZERO_NOTE =
  'Zero is the one number the rules leave open: every digit in it is a leading zero, so counting them the usual way gives none at all. The reading here is that the decimals you recorded are the claim of precision, so 0.00 states two significant figures and a bare 0 states one. If the zero is a measured result, say what it is a zero to — 0.00 g is a different statement from 0 g.'

// ── The calculator ───────────────────────────────────────────────────────────

export default function compute(v: Values<typeof fields>): CalcResult {
  const { mode, value, sigFigs } = v

  const written = parseWritten(value)
  const reading = read(written)

  // Echoed from the parsed parts rather than re-rendered from the digits, so a
  // written decimal point survives: 1200. states four figures and 1200 states
  // two, and the difference between them is the whole page.
  const echo = `${written.sign < 0 ? '-' : ''}${written.intPart === '' ? '0' : written.intPart}${
    written.hasPoint ? `.${written.fracPart}` : ''
  }${written.inputExponent === 0 ? '' : ` × 10^${written.inputExponent}`}`

  const scientificForm = reading.isZero
    ? '0'
    : scientific(
        written.sign,
        // Scientific notation states the significant digits and nothing else,
        // so the placeholder zeros of a 1200 are dropped rather than shown.
        reading.mantissa.slice(0, reading.sigFigs),
        reading.exponent,
      )

  const notes: string[] = []
  if (reading.ambiguous)
    notes.push(
      `${echo} is written with no decimal point and ends in a zero, so its trailing zeros are ambiguous: nothing on the page says whether they were measured or are only holding the place. The usual convention, used above, is that they do NOT count, giving ${figures(reading.sigFigs)}. Write it as ${scientificForm} to claim exactly that. To claim the zeros instead, write the decimal point — ${echo}. states ${figures(reading.allDigits.length - reading.first)}.`,
    )
  if (reading.isZero) notes.push(ZERO_NOTE)

  // ── Counting ───────────────────────────────────────────────────────────────

  if (mode === 'count') {
    if (reading.isZero)
      return {
        primary: { label: 'Significant figures', value: reading.sigFigs, format: { style: 'raw' } },
        stats: [
          raw('Number as written', echo),
          raw('Why it is a special case', 'Every digit is a leading zero, so no rule counts any of them'),
          whole('Decimal places written', written.fracPart.length),
          raw('Convention used here', 'The recorded decimal places are the claim of precision'),
          raw('Scientific notation', '0'),
          raw('Trailing zeros', 'None — there is no non-zero digit for a zero to trail'),
        ],
        steps: [
          raw('Number as written', echo),
          { rule: true },
          raw('Rule 1 — every non-zero digit counts', 'none — the number has no non-zero digit'),
          raw('Rule 3 — a leading zero never counts', `all ${reading.allDigits.length} of them ignored`),
          { rule: true },
          raw('Total', figures(reading.sigFigs)),
        ],
        notes,
      }

    const nonZero = reading.roles.filter((r) => r === 'nonZero').length
    const embedded = reading.roles.filter((r) => r === 'embedded').length
    const trailing = reading.roles.filter((r) => r === 'trailingCounted').length
    const leading = reading.roles.filter((r) => r === 'leading').length
    const placeholders = reading.roles.filter((r) => r === 'trailingPlaceholder').length

    return {
      primary: { label: 'Significant figures', value: reading.sigFigs, format: { style: 'raw' } },
      stats: [
        raw('Scientific notation', scientificForm),
        raw('Place of the first significant digit', `10^${reading.exponent}`),
        raw(
          'Place of the last significant digit',
          `10^${reading.exponent - reading.sigFigs + 1}`,
        ),
        whole('Decimal places written', written.fracPart.length),
        raw(
          'Trailing zeros',
          placeholders > 0
            ? `${placeholders} read as placeholders, not measurements`
            : trailing > 0
              ? `${trailing} counted — the written decimal point makes them significant`
              : 'none',
        ),
        raw(
          'Is the count certain?',
          reading.ambiguous
            ? 'No — the trailing zeros could go either way'
            : 'Yes — the rules settle every digit',
        ),
      ],
      steps: [
        raw('Number as written', echo),
        raw('Digits recorded', reading.allDigits.split('').join(' ')),
        { rule: true },
        raw('Rule 1 — every non-zero digit counts', `${nonZero} counted (${listing(reading, 'nonZero')})`),
        raw(
          'Rule 2 — a zero between significant digits counts',
          `${embedded} counted (${listing(reading, 'embedded')})`,
        ),
        raw(
          'Rule 3 — a leading zero never counts, it only places the point',
          `${leading} ignored (${listing(reading, 'leading')})`,
        ),
        raw(
          'Rule 4 — a trailing zero counts only with a decimal point written',
          written.hasPoint
            ? `${trailing} counted (${listing(reading, 'trailingCounted')}) — the decimal point is written, so they are measured digits`
            : `${placeholders} ignored (${listing(reading, 'trailingPlaceholder')}) — no decimal point is written, so they are read as placeholders`,
        ),
        { rule: true },
        raw('Total', `${nonZero} + ${embedded} + ${trailing} = ${figures(reading.sigFigs)}`),
        raw('Scientific notation, where only significant digits survive', scientificForm),
      ],
      notes,
    }
  }

  // ── Rounding ───────────────────────────────────────────────────────────────

  // Finiteness first: `coerceValues` emits NaN for unparseable input, and every
  // magnitude test below is false for NaN, so a bare range check lets it slip
  // through and hands back a rounding to NaN figures.
  if (!Number.isFinite(sigFigs))
    throw new CalcError('Enter how many significant figures to keep, as a whole number.', 'sigFigs')
  if (!Number.isInteger(sigFigs))
    throw new CalcError(
      `Significant figures are counted, so ${sigFigs} is not a number of them. Use a whole number, such as ${Math.min(15, Math.max(1, Math.round(sigFigs)))}.`,
      'sigFigs',
    )
  if (sigFigs < 1 || sigFigs > 15)
    throw new CalcError(
      'Keep between 1 and 15 significant figures. Below one there is no digit left to state, and past fifteen a double-precision number has no more digits to give.',
      'sigFigs',
    )

  if (reading.isZero)
    return {
      primary: { label: `Rounded to ${figures(sigFigs)}`, value: '0', format: { style: 'raw' } },
      stats: [
        raw('Number as written', echo),
        raw('Significant figures the input states', String(reading.sigFigs)),
        whole('Significant figures requested', sigFigs),
        raw('Scientific notation', '0'),
        raw('Digits dropped', 'none'),
        raw('Rounded up or down?', 'Neither — zero rounds to zero at every precision'),
      ],
      steps: [
        raw('Number as written', echo),
        { rule: true },
        raw(
          'Rounding zero',
          'Zero has no non-zero digit to keep or drop, so it stays zero however many significant figures are asked for.',
        ),
        raw('Answer', '0'),
      ],
      notes,
    }

  const rounded = roundToFigures(reading.mantissa, sigFigs)
  const exponent = reading.exponent + rounded.bump
  const plainForm = plain(written.sign, rounded.digits, exponent)
  const answerScientific = scientific(written.sign, rounded.digits, exponent)
  const usePlain = plainForm.length <= READABLE
  const answer = usePlain ? plainForm : answerScientific
  const dropped = Math.max(0, reading.mantissa.length - sigFigs)

  // A rounded whole number that needs placeholder zeros to reach its own
  // magnitude — 1234 to two figures is 1200 — recreates the exact ambiguity
  // rule 4 describes, this time manufactured by the rounding.
  if (usePlain && exponent >= sigFigs)
    notes.push(
      `Written plainly, ${answer} ends in zeros that are only holding places, and a reader has no way to tell them from measured digits. ${answerScientific} states ${figures(sigFigs)} and nothing else, which is why scientific notation is the honest form for a rounded whole number.`,
    )
  if (rounded.padded) {
    const added = sigFigs - reading.mantissa.length
    notes.push(
      `${echo} carries ${figures(reading.sigFigs)}, so reaching ${figures(sigFigs)} meant writing ${added} more zero${added === 1 ? '' : 's'} on the end. Those zeros are formatting, not measurement: rounding can throw precision away, but it cannot create any.`,
    )
  }
  if (rounded.droppedFirst === '5' && !/[1-9]/.test(reading.mantissa.slice(sigFigs + 1)))
    notes.push(
      `The part dropped here is exactly half, and round-half-up sends it up, giving ${answer}. Round-half-to-even — the rule most measurement standards and IEEE 754 use — would round to whichever leaves the last kept digit even, so a long column of ties does not drift upward. The two rules disagree only on this exact case.`,
    )

  return {
    primary: {
      label: `Rounded to ${figures(sigFigs)}`,
      value: answer,
      // `raw` prints the string untouched. The `decimal` style would parse it
      // back into a double and re-pad it to a fixed number of DECIMAL places,
      // which is the one thing this page must never do: 0.004500000000 would
      // come back as 0.00, and the digits are the answer.
      format: { style: 'raw' },
    },
    stats: [
      raw('Significant figures the input states', String(reading.sigFigs)),
      raw('Scientific notation', answerScientific),
      raw('Place of the last digit kept', `10^${exponent - sigFigs + 1}`),
      whole('Decimal places in the answer', Math.max(0, sigFigs - 1 - exponent)),
      raw('Digits dropped', dropped > 0 ? String(dropped) : 'none'),
      raw(
        'Rounded up or down?',
        rounded.droppedFirst === null ? 'Neither — nothing was dropped' : rounded.roundedUp ? 'Up' : 'Down',
      ),
    ],
    steps: [
      raw('Number as written', echo),
      raw(
        'Significant figures it already states',
        `${figures(reading.sigFigs)} — the digits ${reading.mantissa.slice(0, reading.sigFigs).split('').join(' ')}`,
      ),
      { rule: true },
      raw('Keeping', figures(sigFigs)),
      raw(
        'Digits kept',
        rounded.padded
          ? `${reading.mantissa}, then padded with zeros to ${sigFigs}`
          : reading.mantissa.slice(0, sigFigs),
      ),
      raw(
        'First digit dropped',
        rounded.droppedFirst === null
          ? rounded.padded
            ? 'none — the number runs out of digits first'
            : 'none — every digit written is kept'
          : `${rounded.droppedFirst}${dropped > 1 ? `, then ${dropped - 1} more` : ''}`,
      ),
      raw(
        'Round half up',
        rounded.droppedFirst === null
          ? 'Nothing is dropped, so nothing rounds'
          : rounded.roundedUp
            ? `${rounded.droppedFirst} is 5 or more, so the last kept digit goes up: ${reading.mantissa.slice(0, sigFigs)} becomes ${rounded.digits}${rounded.bump ? ', and the carry lifts the power of ten by one' : ''}`
            : `${rounded.droppedFirst} is below 5, so the kept digits stay as they are`,
      ),
      { rule: true },
      raw('Answer', answer),
      raw('Scientific notation', answerScientific),
    ],
    notes,
  }
}

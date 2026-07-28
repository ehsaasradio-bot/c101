import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

/**
 * Largest term we accept. The reduction below is exact at any magnitude because
 * it runs on BigInt, so this cap is about keeping x = b × c ÷ a inside the range
 * where a double still carries a meaningful answer, not about the GCD.
 */
const MAX_TERM = 1e12

/**
 * Significant digits kept from each term before reducing. A double's decimal
 * form can carry representation noise in its last couple of digits (0.1 + 0.2
 * prints as 0.30000000000000004), and reducing that literally would return
 * 7500000000000001 : 25000000000000000 instead of 3 : 10. Rounding to
 * significant digits — not to decimal places — never turns a positive term into
 * zero, which is what the old fixed 10^-6 scaling did to small inputs.
 */
const MAX_SIGNIFICANT = 15

/** An exact decimal: `mantissa × 10^exponent`, with no float rounding. */
interface Decimal {
  mantissa: bigint
  exponent: number
}

function normalize(d: Decimal): Decimal {
  let { mantissa, exponent } = d
  if (mantissa === 0n) return { mantissa: 0n, exponent: 0 }
  while (mantissa % 10n === 0n) {
    mantissa /= 10n
    exponent += 1
  }
  return { mantissa, exponent }
}

/**
 * Reads a non-negative finite double's shortest decimal form exactly, including
 * the exponential notation JS switches to below 1e-6 and above 1e21.
 */
function toDecimal(n: number): Decimal {
  const parts = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(String(n))
  if (!parts) return { mantissa: 0n, exponent: 0 }
  const whole = parts[1]
  const fraction = parts[2] ?? ''
  const exponent = parts[3] ? Number.parseInt(parts[3], 10) : 0
  return normalize({
    mantissa: BigInt(whole + fraction),
    exponent: exponent - fraction.length,
  })
}

/** Half-up rounding to at most `digits` significant digits. Stays positive. */
function roundSignificant(d: Decimal, digits: number): Decimal {
  if (d.mantissa === 0n) return d
  const length = d.mantissa.toString().length
  if (length <= digits) return d
  const drop = length - digits
  const power = 10n ** BigInt(drop)
  let quotient = d.mantissa / power
  if ((d.mantissa % power) * 2n >= power) quotient += 1n
  return normalize({ mantissa: quotient, exponent: d.exponent + drop })
}

/** Euclid's algorithm on non-negative integers. gcd(n, 0) === n. */
function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a
  let y = b < 0n ? -b : b
  while (y > 0n) {
    const t = x % y
    x = y
    y = t
  }
  return x
}

function toNumber(d: Decimal): number {
  return Number(`${d.mantissa}e${d.exponent}`)
}

function checkTerm(value: number, id: string, label: string): void {
  if (!Number.isFinite(value)) throw new CalcError(`${label} must be a number.`, id)
  if (value < 0) throw new CalcError(`${label} cannot be negative.`, id)
  if (value > MAX_TERM) throw new CalcError(`${label} is too large to simplify exactly.`, id)
}

export default function compute(v: Values<typeof fields>): CalcResult {
  const { termA, termB, termC } = v

  checkTerm(termA, 'termA', 'Term A')
  checkTerm(termB, 'termB', 'Term B')
  checkTerm(termC, 'termC', 'Term C')

  // A is the divisor in x = B × C ÷ A, and a 0 side has no meaningful share of
  // the whole, so both sides of the known ratio must be strictly positive.
  if (!(termA > 0)) throw new CalcError('Term A must be greater than 0.', 'termA')
  if (!(termB > 0)) throw new CalcError('Term B must be greater than 0.', 'termB')

  // Put both terms over one common power of ten so they become whole numbers,
  // then reduce those integers — 1.5 : 2 becomes 15 : 20 becomes 3 : 4. The
  // shared exponent is whichever term needs more decimal places, so neither
  // side can be scaled below one whole unit and collapse to zero.
  const decA = roundSignificant(toDecimal(termA), MAX_SIGNIFICANT)
  const decB = roundSignificant(toDecimal(termB), MAX_SIGNIFICANT)
  const shared = Math.min(decA.exponent, decB.exponent)
  const intA = decA.mantissa * 10n ** BigInt(decA.exponent - shared)
  const intB = decB.mantissa * 10n ** BigInt(decB.exponent - shared)
  // Both terms are strictly positive, so both integers are too, so the divisor
  // is at least 1 and neither side of the reduced ratio can be 0 or NaN.
  const divisor = gcd(intA, intB)
  const simpleA = (intA / divisor).toString()
  const simpleB = (intB / divisor).toString()
  const simplified = `${simpleA}:${simpleB}`
  const commonFactor = toNumber(normalize({ mantissa: divisor, exponent: shared }))

  const solvedX = (termB * termC) / termA
  if (!Number.isFinite(solvedX)) {
    throw new CalcError('Term A is too small to solve this proportion.', 'termA')
  }
  const total = termA + termB

  return {
    primary: {
      label: 'Missing term X',
      value: solvedX,
      format: { style: 'decimal', decimals: 4 },
    },
    stats: [
      { label: 'Simplified ratio', value: simplified, format: { style: 'raw' } },
      {
        label: 'Decimal ratio (A ÷ B)',
        value: termA / termB,
        format: { style: 'decimal', decimals: 4 },
      },
      { label: 'Share of A', value: (termA / total) * 100, format: { style: 'percent' } },
      { label: 'Share of B', value: (termB / total) * 100, format: { style: 'percent' } },
      {
        label: 'Scale factor (C ÷ A)',
        value: termC / termA,
        format: { style: 'decimal', decimals: 4 },
      },
    ],
    steps: [
      { label: 'Term A', value: termA, format: { style: 'decimal', decimals: 4 } },
      { label: 'Term B', value: termB, format: { style: 'decimal', decimals: 4 } },
      { label: 'Term C', value: termC, format: { style: 'decimal', decimals: 4 } },
      { rule: true },
      {
        label: 'Common factor removed',
        value: commonFactor,
        format: { style: 'decimal', decimals: 4 },
      },
      { label: 'A : B simplified', value: simplified, format: { style: 'raw' } },
      { rule: true },
      {
        label: 'Scale factor C ÷ A',
        value: termC / termA,
        format: { style: 'decimal', decimals: 4 },
      },
      { label: 'X = B × C ÷ A', value: solvedX, format: { style: 'decimal', decimals: 4 } },
      { label: 'Solved proportion', value: `${termC}:${solvedX}`, format: { style: 'raw' } },
    ],
    // The same split the stats report as 'Share of A' / 'Share of B', given as
    // the raw terms rather than percentages. Both are strictly positive (the
    // guards above refuse 0 and negatives), and they sum to `total` by
    // construction, so the proportion can never disagree with the percentages.
    parts: [
      { label: 'Term A', value: termA, format: { style: 'decimal', decimals: 4 } },
      { label: 'Term B', value: termB, format: { style: 'decimal', decimals: 4 } },
    ],
    partsTotal: { label: 'A + B', value: total, format: { style: 'decimal', decimals: 4 } },
    notes: [
      'A ratio compares parts to each other, not to the whole: 3 : 4 means seven parts in total, of which three are A.',
      'A : B and C : X are equivalent ratios, so cross-multiplying gives A × X = B × C, and therefore X = B × C ÷ A.',
      'Terms are read to 15 significant digits before reducing, so a value typed with more precision than a decimal number can hold is rounded before the common factor is taken.',
    ],
  }
}

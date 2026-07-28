import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

const OPERATOR_SYMBOL: Record<string, string> = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
}

/** Euclid's algorithm on absolute values. gcd(0, 0) is defined as 1 here so a zero result stays 0/1. */
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

/** Inputs arrive as numbers; a fraction only makes sense over whole numbers. */
function whole(value: number, fieldId: string, label: string): number {
  if (!Number.isFinite(value)) throw new CalcError(`Enter a whole number for the ${label}.`, fieldId)
  const rounded = Math.round(value)
  if (Math.abs(value - rounded) > 1e-9) {
    throw new CalcError(`The ${label} must be a whole number.`, fieldId)
  }
  return rounded
}

function fractionText(numerator: number, denominator: number): string {
  return denominator === 1 ? String(numerator) : `${numerator}/${denominator}`
}

/** e.g. -7/3 becomes "-2 1/3"; proper fractions and integers are returned unchanged. */
function mixedText(numerator: number, denominator: number): string {
  if (denominator === 1) return String(numerator)
  const magnitude = Math.abs(numerator)
  if (magnitude < denominator) return fractionText(numerator, denominator)
  const wholePart = Math.floor(magnitude / denominator)
  const remainder = magnitude % denominator
  const sign = numerator < 0 ? '-' : ''
  if (remainder === 0) return `${sign}${wholePart}`
  return `${sign}${wholePart} ${remainder}/${denominator}`
}

export default function compute(v: Values<typeof fields>): CalcResult {
  const nA = whole(v.numeratorA, 'numeratorA', 'first numerator')
  const dA = whole(v.denominatorA, 'denominatorA', 'first denominator')
  const nB = whole(v.numeratorB, 'numeratorB', 'second numerator')
  const dB = whole(v.denominatorB, 'denominatorB', 'second denominator')

  if (dA === 0) throw new CalcError('A denominator cannot be zero.', 'denominatorA')
  if (dB === 0) throw new CalcError('A denominator cannot be zero.', 'denominatorB')

  const op = v.operation

  let rawNumerator: number
  let rawDenominator: number

  if (op === 'add') {
    rawNumerator = nA * dB + nB * dA
    rawDenominator = dA * dB
  } else if (op === 'subtract') {
    rawNumerator = nA * dB - nB * dA
    rawDenominator = dA * dB
  } else if (op === 'multiply') {
    rawNumerator = nA * nB
    rawDenominator = dA * dB
  } else if (op === 'divide') {
    if (nB === 0) throw new CalcError('You cannot divide by a fraction equal to zero.', 'numeratorB')
    rawNumerator = nA * dB
    rawDenominator = dA * nB
  } else {
    throw new CalcError('Choose an operation.', 'operation')
  }

  if (!Number.isSafeInteger(rawNumerator) || !Number.isSafeInteger(rawDenominator)) {
    throw new CalcError('Those numbers are too large to combine exactly.', 'numeratorA')
  }

  // Keep the sign on the numerator so the displayed fraction is canonical.
  if (rawDenominator < 0) {
    rawNumerator = -rawNumerator
    rawDenominator = -rawDenominator
  }

  const divisor = gcd(rawNumerator, rawDenominator)
  const numerator = rawNumerator / divisor
  const denominator = rawDenominator / divisor
  const decimal = numerator / denominator

  return {
    primary: {
      label: 'Simplified fraction',
      value: fractionText(numerator, denominator),
      format: { style: 'raw' },
    },
    stats: [
      { label: 'Decimal value', value: decimal, format: { style: 'decimal', decimals: 6 } },
      { label: 'Mixed number', value: mixedText(numerator, denominator), format: { style: 'raw' } },
      {
        label: 'Before simplifying',
        value: fractionText(rawNumerator, rawDenominator),
        format: { style: 'raw' },
      },
      { label: 'Divided top and bottom by', value: divisor, format: { style: 'raw' } },
    ],
    steps: [
      { label: 'First fraction', value: fractionText(nA, dA), format: { style: 'raw' } },
      { label: 'Operation', value: OPERATOR_SYMBOL[op] ?? op, format: { style: 'raw' } },
      { label: 'Second fraction', value: fractionText(nB, dB), format: { style: 'raw' } },
      { rule: true },
      {
        label: 'Combined result',
        value: `${rawNumerator}/${rawDenominator}`,
        format: { style: 'raw' },
      },
      { label: 'Greatest common divisor', value: divisor, format: { style: 'raw' } },
      {
        label: 'Simplified',
        value: fractionText(numerator, denominator),
        format: { style: 'raw' },
      },
    ],
    notes: [
      'Addition and subtraction use the product of the two denominators as a common denominator, then the answer is reduced with the Euclidean algorithm, so the result is always in lowest terms.',
      'A negative sign is carried on the numerator, so -1/2 and 1/-2 give the same answer.',
    ],
  }
}

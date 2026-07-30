import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

/**
 * Simple interest, the textbook definition used everywhere from a Treasury
 * bill's day-count convention to a car dealer's flat-rate quote:
 *
 *   I = P · r · t            interest, charged on the principal only
 *   A = P (1 + r · t)        the total owed or held at the end
 *
 * with r the nominal annual rate as a decimal and t the term in years. Nothing
 * here is compounded: the interest for year five is the same as for year one,
 * because it is always computed against P and never against the balance.
 *
 * The comparison figure is the ordinary compound-interest closed form,
 *
 *   A_c = P (1 + r/n)^(n·t)
 *
 * evaluated at the same P, r and t, so the two differ only in how interest is
 * credited. That difference is the point of this page.
 *
 * Fixed shape: two `parts` and two `series` on every input, so whatever the
 * page can ever draw it also draws at the defaults.
 */
export default function compute(v: Values<typeof fields>): CalcResult {
  const { principal, annualRate, years } = v
  // `compoundsPerYear` is a select, so it arrives as a string.
  const n = Number(v.compoundsPerYear)

  // Finiteness first: coerceValues emits NaN for unparseable input, and a
  // magnitude test like `principal <= 0` is false for NaN, so it would slip past.
  if (!Number.isFinite(principal) || principal <= 0)
    throw new CalcError('Enter a principal greater than $0.', 'principal')
  if (!Number.isFinite(annualRate) || annualRate < 0)
    throw new CalcError('Interest rate cannot be negative.', 'annualRate')
  if (annualRate > 100)
    throw new CalcError('Enter an annual rate of 100% or less.', 'annualRate')
  if (!Number.isFinite(years) || years <= 0)
    throw new CalcError('Enter a term longer than zero.', 'years')
  if (years > 100) throw new CalcError('Enter a term of 100 years or less.', 'years')
  if (!Number.isFinite(n) || n <= 0)
    throw new CalcError('Choose a compounding frequency to compare against.', 'compoundsPerYear')

  const r = annualRate / 100

  // I = P·r·t, and A = P + I. Deriving the total by addition rather than by
  // P(1 + rt) makes `principal + interest === total` exact in floating point,
  // which is what the donut's slices have to add up to.
  const simpleInterest = principal * r * years
  const simpleTotal = principal + simpleInterest
  const interestPerYear = principal * r

  // The same money under compounding, for contrast.
  const compoundTotal = principal * Math.pow(1 + r / n, n * years)
  const compoundInterest = compoundTotal - principal
  const compoundingGap = compoundInterest - simpleInterest

  // The headline contrast, as a share of the simple-interest figure. At a 0%
  // rate both methods earn nothing and the ratio is 0/0, so state the limit
  // rather than emitting NaN.
  const gapPercent = simpleInterest > 0 ? (compoundingGap / simpleInterest) * 100 : 0

  // Total return on the principal, which for simple interest is just r·t.
  const totalReturnPercent = r * years * 100
  const months = Math.round(years * 12)

  // Both curves come from the same two closed forms as the headline, so the
  // chart cannot drift away from the numbers beside it. A fixed sample count
  // keeps the point count independent of the term — 41 points whether the term
  // is three months or forty years, comfortably inside the ~45 the chart wants.
  const SAMPLES = 40
  const simplePoints: Array<readonly [number, number]> = []
  const compoundPoints: Array<readonly [number, number]> = []
  for (let i = 0; i <= SAMPLES; i++) {
    const t = (years * i) / SAMPLES
    simplePoints.push([t, principal + principal * r * t])
    compoundPoints.push([t, principal * Math.pow(1 + r / n, n * t)])
  }
  // Pin the last point to the headline figures rather than trusting the loop's
  // rounding to land on them.
  simplePoints[SAMPLES] = [years, simpleTotal]
  compoundPoints[SAMPLES] = [years, compoundTotal]

  const notes: string[] = [
    'Simple interest never earns interest on interest, so the amount added each year is identical from the first year to the last.',
    'Both figures assume the same nominal rate, no fees or tax, and no payments or withdrawals during the term.',
  ]
  if (compoundingGap < 0)
    notes.push(
      'Over a term shorter than one compounding period, simple interest actually comes out ahead — compounding has not had a full period in which to act.',
    )

  return {
    primary: { label: 'Total interest', value: simpleInterest, format: { style: 'currency' } },
    scaleValue: gapPercent,
    stats: [
      { label: 'Total amount', value: simpleTotal, format: { style: 'currency', decimals: 0 } },
      { label: 'Interest per year', value: interestPerYear, format: { style: 'currency', decimals: 0 } },
      {
        label: 'Compound interest, same terms',
        value: compoundInterest,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Extra from compounding',
        value: compoundingGap,
        format: { style: 'currency', decimals: 0 },
      },
      { label: 'Term', value: months, format: { style: 'duration', from: 'months' } },
    ],
    steps: [
      { label: 'Principal (P)', value: principal, format: { style: 'currency', decimals: 0 } },
      { label: 'Annual rate (r)', value: annualRate, format: { style: 'percent', decimals: 2 } },
      { label: 'Term in years (t)', value: years, format: { style: 'decimal', decimals: 2, unit: 'yr' } },
      { rule: true },
      { label: 'r × t', value: totalReturnPercent, format: { style: 'percent', decimals: 2 } },
      {
        label: 'Simple interest, P × r × t',
        value: simpleInterest,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Total amount, P(1 + rt)',
        value: simpleTotal,
        format: { style: 'currency', decimals: 0 },
      },
      { rule: true },
      {
        label: 'Compounded total, P(1 + r/n)^nt',
        value: compoundTotal,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Interest under compounding',
        value: compoundInterest,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Difference',
        value: compoundingGap,
        format: { style: 'currency', decimals: 0 },
      },
    ],
    // What the final balance is made of. Always two components, never filtered,
    // so the donut exists at the defaults and at every other input.
    parts: [
      { label: 'Principal', value: principal, format: { style: 'currency', decimals: 0 } },
      { label: 'Simple interest', value: simpleInterest, format: { style: 'currency', decimals: 0 } },
    ],
    partsTotal: { label: 'Total amount', value: simpleTotal, format: { style: 'currency' } },
    series: [
      { label: 'Simple interest', points: simplePoints, format: { style: 'currency', decimals: 0 } },
      { label: 'Compounded', points: compoundPoints, format: { style: 'currency', decimals: 0 } },
    ],
    notes,
  }
}

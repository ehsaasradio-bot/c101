import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

/** The 28/36 rule: housing ≤ 28% of gross income, all debt ≤ 36%. */
const FRONT_END = 0.28
const BACK_END = 0.36

export default function compute(v: Values<typeof fields>): CalcResult {
  const { annualIncome, monthlyDebts, downPayment, annualRate } = v
  // `years` is a select, so it arrives as a string.
  const years = Number(v.years)

  if (!(annualIncome > 0))
    throw new CalcError('Enter a gross annual income greater than 0.', 'annualIncome')
  if (!(monthlyDebts >= 0)) throw new CalcError('Monthly debts cannot be negative.', 'monthlyDebts')
  if (!(downPayment >= 0)) throw new CalcError('Down payment cannot be negative.', 'downPayment')
  if (!(annualRate >= 0)) throw new CalcError('Interest rate cannot be negative.', 'annualRate')
  if (!(years > 0)) throw new CalcError('Loan term must be at least 1 year.', 'years')

  const grossMonthly = annualIncome / 12
  const frontEndCap = grossMonthly * FRONT_END
  const backEndCap = grossMonthly * BACK_END - monthlyDebts
  const maxHousing = Math.min(frontEndCap, backEndCap)

  if (!(maxHousing > 0))
    throw new CalcError(
      'Existing debt payments already reach 36% of gross income, leaving nothing for housing.',
      'monthlyDebts',
    )

  const monthlyRate = annualRate / 100 / 12
  const payments = Math.round(years * 12)

  // Invert the amortization formula: the principal a given payment supports.
  // At 0% the payment simply repays principal evenly, and the closed form
  // divides by zero.
  const maxLoan =
    monthlyRate === 0
      ? maxHousing * payments
      : (maxHousing * (Math.pow(1 + monthlyRate, payments) - 1)) /
        (monthlyRate * Math.pow(1 + monthlyRate, payments))

  const maxPrice = maxLoan + downPayment
  const totalRepaid = maxHousing * payments
  const totalInterest = totalRepaid - maxLoan
  const debtRatio = (monthlyDebts / grossMonthly) * 100
  const downPercent = maxPrice > 0 ? (downPayment / maxPrice) * 100 : 0
  const priceToIncome = maxPrice / annualIncome
  const limitedByDebts = backEndCap < frontEndCap

  const notes: string[] = [
    'This treats the whole 28% as principal and interest. Property tax, homeowners insurance, PMI, and HOA dues come out of the same budget, so your realistic price is lower — often 15–25% lower.',
  ]
  if (limitedByDebts)
    notes.push(
      'Your existing debt payments, not your income, are the binding constraint: the 36% total-debt limit bites before the 28% housing limit does.',
    )
  if (downPercent < 20)
    notes.push(
      'A down payment under 20% of the purchase price usually means paying private mortgage insurance until you reach 20% equity.',
    )

  return {
    primary: {
      label: 'Maximum home price',
      value: maxPrice,
      format: { style: 'currency', decimals: 0 },
    },
    // This model treats the whole 28% as one housing payment — it does not
    // break out property tax, insurance, or PMI (see the note below), so there
    // is no principal/tax/insurance split to show. What it does model is the
    // 36% back-end budget, which is exactly housing plus existing debt.
    // `maxHousing` is guarded positive above and `monthlyDebts` is guarded
    // non-negative, so both slices stay ≥ 0.
    parts: [
      { label: 'Housing payment', value: maxHousing, format: { style: 'currency' } },
      { label: 'Other debt', value: monthlyDebts, format: { style: 'currency' } },
    ],
    partsTotal: {
      label: 'Monthly obligations',
      value: maxHousing + monthlyDebts,
      format: { style: 'currency' },
    },
    scaleValue: debtRatio,
    stats: [
      { label: 'Max monthly housing payment', value: maxHousing, format: { style: 'currency' } },
      { label: 'Maximum loan amount', value: maxLoan, format: { style: 'currency', decimals: 0 } },
      { label: 'Down payment', value: downPayment, format: { style: 'currency', decimals: 0 } },
      { label: 'Down payment share', value: downPercent, format: { style: 'percent' } },
      { label: 'Existing debt-to-income', value: debtRatio, format: { style: 'percent' } },
      {
        label: 'Price as a multiple of income',
        value: priceToIncome,
        format: { style: 'decimal', decimals: 2, unit: '×' },
      },
    ],
    steps: [
      { label: 'Gross monthly income', value: grossMonthly, format: { style: 'currency' } },
      { rule: true },
      { label: '28% housing limit', value: frontEndCap, format: { style: 'currency' } },
      { label: 'Other monthly debts', value: monthlyDebts, format: { style: 'currency' } },
      { label: '36% total-debt limit, less debts', value: backEndCap, format: { style: 'currency' } },
      { label: 'Payment budget (the lower one)', value: maxHousing, format: { style: 'currency' } },
      { rule: true },
      { label: 'Monthly rate', value: annualRate / 12, format: { style: 'percent', decimals: 4 } },
      { label: 'Number of payments', value: payments, format: { style: 'decimal', decimals: 0 } },
      { label: 'Loan that payment supports', value: maxLoan, format: { style: 'currency', decimals: 0 } },
      { label: 'Plus down payment', value: downPayment, format: { style: 'currency', decimals: 0 } },
      { label: 'Maximum home price', value: maxPrice, format: { style: 'currency', decimals: 0 } },
      { rule: true },
      { label: 'Total repaid over the term', value: totalRepaid, format: { style: 'currency', decimals: 0 } },
      { label: 'Total interest', value: totalInterest, format: { style: 'currency', decimals: 0 } },
    ],
    notes,
  }
}

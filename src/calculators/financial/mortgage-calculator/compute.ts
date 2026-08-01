import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

/** PMI is conventionally ~0.8%/yr of the loan while equity is under 20%. */
const PMI_ANNUAL_RATE = 0.008

export default function compute(v: Values<typeof fields>): CalcResult {
  const { homePrice, downPayment, rate, propertyTax, insurance } = v
  // `years` is a select, so it arrives as a string — the derived Values type
  // makes forgetting this a compile error rather than a NaN at runtime.
  const years = Number(v.years)

  if (!(homePrice > 0)) throw new CalcError('Enter a home price greater than 0.', 'homePrice')
  if (downPayment < 0) throw new CalcError('Down payment cannot be negative.', 'downPayment')
  if (downPayment >= homePrice)
    throw new CalcError('Down payment must be less than the home price.', 'downPayment')
  if (rate < 0) throw new CalcError('Interest rate cannot be negative.', 'rate')
  if (!(years > 0)) throw new CalcError('Loan term must be at least 1 year.', 'years')

  const principal = homePrice - downPayment
  const monthlyRate = rate / 100 / 12
  const payments = Math.round(years * 12)

  // A 0% loan is just the principal spread evenly; the amortization formula
  // divides by zero there.
  const principalAndInterest =
    monthlyRate === 0
      ? principal / payments
      : (principal * monthlyRate * Math.pow(1 + monthlyRate, payments)) /
        (Math.pow(1 + monthlyRate, payments) - 1)

  const totalRepaid = principalAndInterest * payments
  const totalInterest = totalRepaid - principal

  const ltv = (principal / homePrice) * 100
  const downPercent = (downPayment / homePrice) * 100
  const monthlyPmi = ltv > 80 ? (principal * PMI_ANNUAL_RATE) / 12 : 0
  const monthlyTax = propertyTax / 12
  const monthlyInsurance = insurance / 12
  const piti = principalAndInterest + monthlyTax + monthlyInsurance + monthlyPmi

  // Components of the monthly payment. Zero-valued lines are dropped rather
  // than drawn as invisible slices; dropping a zero leaves the sum untouched,
  // so the slices still add up to PITI exactly.
  const parts = [
    { label: 'Principal & interest', value: principalAndInterest },
    { label: 'Property tax', value: monthlyTax },
    { label: 'Home insurance', value: monthlyInsurance },
    { label: 'PMI', value: monthlyPmi },
  ]
    .filter((p) => p.value > 0)
    .map((p) => ({ ...p, format: { style: 'currency' } as const }))

  // Standard amortization balance after m payments, using the same principal,
  // rate and payment as the headline figure:
  //   B(m) = P(1+r)^m − PMT((1+r)^m − 1)/r,  and P − PMT·m when r = 0.
  const balanceAfter = (m: number) => {
    const raw =
      monthlyRate === 0
        ? principal - principalAndInterest * m
        : principal * Math.pow(1 + monthlyRate, m) -
          (principalAndInterest * (Math.pow(1 + monthlyRate, m) - 1)) / monthlyRate
    return Math.min(principal, Math.max(0, raw))
  }

  // Yearly samples, 0..term. The longest offered term is 30 years, so this is
  // at most 31 points; the stride keeps that true if longer terms are added.
  const stride = Math.max(1, Math.ceil(years / 40))
  const balancePoints: Array<readonly [number, number]> = []
  const equityPoints: Array<readonly [number, number]> = []
  const pushYear = (t: number, m: number) => {
    const b = balanceAfter(m)
    balancePoints.push([t, b])
    equityPoints.push([t, homePrice - b])
  }
  for (let t = 0; t <= years; t += stride) pushYear(t, Math.round(t * 12))
  if (balancePoints[balancePoints.length - 1]![0] !== years) pushYear(years, payments)

  return {
    primary: {
      label: 'Monthly principal & interest',
      value: principalAndInterest,
      format: { style: 'currency' },
    },
    scaleValue: ltv,
    stats: [
      { label: 'Total monthly (PITI)', value: piti, format: { style: 'currency', decimals: 0 } },
      { label: 'Loan amount', value: principal, format: { style: 'currency', decimals: 0 } },
      { label: 'Total interest', value: totalInterest, format: { style: 'currency', decimals: 0 } },
      { label: 'Total repaid', value: totalRepaid, format: { style: 'currency', decimals: 0 } },
      { label: 'Down payment', value: downPercent, format: { style: 'percent' } },
      { label: 'Loan-to-value', value: ltv, format: { style: 'percent' } },
    ],
    steps: [
      { label: 'Home price', value: homePrice, format: { style: 'currency', decimals: 0 } },
      { label: 'Down payment', value: downPayment, format: { style: 'currency', decimals: 0 } },
      { label: 'Amount borrowed', value: principal, format: { style: 'currency', decimals: 0 } },
      { rule: true },
      { label: 'Annual rate', value: rate, format: { style: 'percent', decimals: 3 } },
      { label: 'Monthly rate', value: rate / 12, format: { style: 'percent', decimals: 4 } },
      { label: 'Number of payments', value: payments, format: { style: 'decimal', decimals: 0 } },
      { rule: true },
      {
        label: 'Principal & interest',
        value: principalAndInterest,
        format: { style: 'currency' },
      },
      { label: 'Property tax', value: monthlyTax, format: { style: 'currency' } },
      { label: 'Home insurance', value: monthlyInsurance, format: { style: 'currency' } },
      { label: 'PMI', value: monthlyPmi, format: { style: 'currency' } },
      { label: 'Total monthly payment', value: piti, format: { style: 'currency' } },
      { rule: true },
      {
        label: 'Interest as a share of the loan',
        value: (totalInterest / principal) * 100,
        format: { style: 'percent' },
      },
    ],
    parts,
    partsTotal: { label: 'Total monthly payment', value: piti, format: { style: 'currency' } },
    series: [
      {
        label: 'Remaining balance',
        points: balancePoints,
        format: { style: 'currency', decimals: 0 },
      },
      { label: 'Equity', points: equityPoints, format: { style: 'currency', decimals: 0 } },
    ],
    chart: { title: 'Balance and equity over the term', xLabel: 'Years' },
    notes:
      monthlyPmi > 0
        ? ['PMI is estimated at 0.8%/yr and normally drops off once you reach 20% equity.']
        : [],
  }
}

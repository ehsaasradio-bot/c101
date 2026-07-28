import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

export default function compute(v: Values<typeof fields>): CalcResult {
  const { principal, annualRate, years, monthlyContribution } = v
  // `compoundsPerYear` is a select, so it arrives as a string.
  const n = Number(v.compoundsPerYear)

  if (!Number.isFinite(principal) || principal < 0)
    throw new CalcError('Starting balance cannot be negative.', 'principal')
  if (!Number.isFinite(annualRate) || annualRate < 0)
    throw new CalcError('Interest rate cannot be negative.', 'annualRate')
  if (!Number.isFinite(years) || years <= 0)
    throw new CalcError('Enter a time horizon of at least 1 year.', 'years')
  if (!Number.isFinite(monthlyContribution) || monthlyContribution < 0)
    throw new CalcError('Monthly contribution cannot be negative.', 'monthlyContribution')
  if (!(n > 0)) throw new CalcError('Choose a compounding frequency.', 'compoundsPerYear')
  if (principal === 0 && monthlyContribution === 0)
    throw new CalcError('Enter a starting balance or a monthly contribution.', 'principal')

  const r = annualRate / 100
  const periodRate = r / n
  const months = Math.round(years * 12)

  // A = P(1 + r/n)^(nt)
  const lumpSum = principal * Math.pow(1 + periodRate, n * years)

  // Contributions are monthly, so they must grow at the monthly-equivalent of
  // the chosen compounding — not at r/12, which would only be right for n = 12.
  const monthlyRate = Math.pow(1 + periodRate, n / 12) - 1

  // Ordinary annuity: FV = PMT × ((1 + i)^N − 1) / i. At i = 0 the ratio's limit
  // is simply N, and the closed form would be 0/0.
  const contributionsFv =
    monthlyRate === 0
      ? monthlyContribution * months
      : (monthlyContribution * (Math.pow(1 + monthlyRate, months) - 1)) / monthlyRate

  const finalBalance = lumpSum + contributionsFv
  const totalContributed = principal + monthlyContribution * months
  const totalInterest = finalBalance - totalContributed
  const growthPercent = (totalInterest / totalContributed) * 100
  const effectiveAnnualRate = (Math.pow(1 + periodRate, n) - 1) * 100

  // Year-by-year trajectory, using the same two closed forms as above so the
  // curve and the headline can never disagree. Sampled yearly, and thinned for
  // long horizons so a 100-year run does not ship 100 points to the browser.
  const stride = Math.max(1, Math.ceil(years / 40))
  const balanceAt = (t: number) => {
    const m = Math.round(t * 12)
    const grown = principal * Math.pow(1 + periodRate, n * t)
    const added =
      monthlyRate === 0
        ? monthlyContribution * m
        : (monthlyContribution * (Math.pow(1 + monthlyRate, m) - 1)) / monthlyRate
    return grown + added
  }

  const balancePoints: Array<readonly [number, number]> = []
  const contributedPoints: Array<readonly [number, number]> = []
  for (let t = 0; t <= years; t += stride) {
    balancePoints.push([t, balanceAt(t)])
    contributedPoints.push([t, principal + monthlyContribution * Math.round(t * 12)])
  }
  if (balancePoints[balancePoints.length - 1]![0] !== years) {
    balancePoints.push([years, finalBalance])
    contributedPoints.push([years, totalContributed])
  }

  const notes: string[] = []
  if (monthlyContribution > 0)
    notes.push(
      'Contributions are assumed to arrive at the end of each month and to earn the same rate from then on.',
    )
  if (annualRate > 0)
    notes.push('The rate is assumed constant. Real returns vary, and taxes and inflation are ignored.')

  return {
    primary: { label: 'Final balance', value: finalBalance, format: { style: 'currency' } },
    scaleValue: growthPercent,
    stats: [
      {
        label: 'Total contributed',
        value: totalContributed,
        format: { style: 'currency', decimals: 0 },
      },
      { label: 'Total interest', value: totalInterest, format: { style: 'currency', decimals: 0 } },
      {
        label: 'Growth on what you put in',
        value: growthPercent,
        format: { style: 'percent', decimals: 1 },
      },
      {
        label: 'Effective annual rate',
        value: effectiveAnnualRate,
        format: { style: 'percent', decimals: 3 },
      },
      { label: 'Time horizon', value: months, format: { style: 'duration', from: 'months' } },
    ],
    steps: [
      { label: 'Starting balance', value: principal, format: { style: 'currency', decimals: 0 } },
      { label: 'Nominal annual rate', value: annualRate, format: { style: 'percent', decimals: 3 } },
      { label: 'Compounding periods per year', value: n, format: { style: 'decimal', decimals: 0 } },
      { label: 'Rate per period', value: periodRate * 100, format: { style: 'percent', decimals: 4 } },
      { rule: true },
      {
        label: 'Starting balance grown alone',
        value: lumpSum,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Monthly contributions grown',
        value: contributionsFv,
        format: { style: 'currency', decimals: 0 },
      },
      { label: 'Final balance', value: finalBalance, format: { style: 'currency', decimals: 0 } },
      { rule: true },
      {
        label: 'Contributed over the period',
        value: monthlyContribution * months,
        format: { style: 'currency', decimals: 0 },
      },
      { label: 'Interest earned', value: totalInterest, format: { style: 'currency', decimals: 0 } },
    ],
    // Components of the final balance. No colours, no chart type — a theme
    // decides whether this becomes a donut, a stacked bar, or nothing at all.
    parts: [
      { label: 'Starting balance', value: principal, format: { style: 'currency', decimals: 0 } },
      {
        label: 'Contributions',
        value: monthlyContribution * months,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Interest earned',
        value: Math.max(0, totalInterest),
        format: { style: 'currency', decimals: 0 },
      },
    ],
    series: [
      { label: 'Balance', points: balancePoints, format: { style: 'currency', decimals: 0 } },
      {
        label: 'Contributed',
        points: contributedPoints,
        format: { style: 'currency', decimals: 0 },
      },
    ],
    notes,
  }
}

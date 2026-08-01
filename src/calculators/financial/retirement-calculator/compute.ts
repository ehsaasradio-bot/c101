import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

export default function compute(v: Values<typeof fields>): CalcResult {
  const { currentAge, retirementAge, currentSavings, monthlyContribution, annualReturn } = v
  // `withdrawalRate` is a select, so it arrives as a string.
  const withdrawalRate = Number(v.withdrawalRate)

  // Every numeric guard tests finiteness first: an unparseable form entry arrives
  // here as NaN, and a bare magnitude comparison such as `x < 0` is false for NaN,
  // which would let it fall through to the arithmetic and surface as a NaN result.
  if (!Number.isFinite(currentAge) || !(currentAge > 0))
    throw new CalcError('Enter an age greater than 0.', 'currentAge')
  if (!Number.isFinite(retirementAge) || !(retirementAge > currentAge))
    throw new CalcError('Retirement age must be greater than your current age.', 'retirementAge')
  if (!Number.isFinite(currentSavings) || currentSavings < 0)
    throw new CalcError('Current savings cannot be negative.', 'currentSavings')
  if (!Number.isFinite(monthlyContribution) || monthlyContribution < 0)
    throw new CalcError('Monthly contribution cannot be negative.', 'monthlyContribution')
  if (!Number.isFinite(annualReturn) || annualReturn < 0)
    throw new CalcError('Expected return cannot be negative.', 'annualReturn')
  if (!Number.isFinite(withdrawalRate) || !(withdrawalRate > 0))
    throw new CalcError('Withdrawal rate must be greater than 0.', 'withdrawalRate')

  const years = retirementAge - currentAge
  const months = Math.round(years * 12)
  const monthlyRate = annualReturn / 100 / 12

  // Future value of what is already invested, compounded monthly.
  const growthFactor = Math.pow(1 + monthlyRate, months)
  const fvCurrent = currentSavings * growthFactor

  // Future value of an ordinary annuity: contributions land at each month's end,
  // so the final deposit earns nothing. A 0% return makes the closed form divide
  // by zero, where the answer is simply the sum of the deposits.
  const fvContributions =
    monthlyRate === 0
      ? monthlyContribution * months
      : monthlyContribution * ((growthFactor - 1) / monthlyRate)

  const nestEgg = fvCurrent + fvContributions
  const totalContributed = monthlyContribution * months
  const investmentGrowth = nestEgg - currentSavings - totalContributed

  const annualIncome = nestEgg * (withdrawalRate / 100)
  const monthlyIncome = annualIncome / 12

  // Year-by-year trajectory, from the same two closed forms as the headline so
  // the curve and the number cannot disagree. Thinned for long horizons: a
  // 16-to-100 run would otherwise ship 85 points to the browser.
  const balanceAt = (m: number) => {
    const factor = Math.pow(1 + monthlyRate, m)
    const grown = currentSavings * factor
    const added =
      monthlyRate === 0 ? monthlyContribution * m : monthlyContribution * ((factor - 1) / monthlyRate)
    return grown + added
  }

  const stride = Math.max(1, Math.ceil(years / 40))
  const balancePoints: Array<readonly [number, number]> = []
  for (let t = 0; t < years; t += stride) balancePoints.push([currentAge + t, balanceAt(Math.round(t * 12))])
  balancePoints.push([retirementAge, nestEgg])

  return {
    primary: {
      label: 'Projected savings at retirement',
      value: nestEgg,
      format: { style: 'currency', decimals: 0 },
    },
    stats: [
      {
        label: 'Annual retirement income',
        value: annualIncome,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Monthly retirement income',
        value: monthlyIncome,
        format: { style: 'currency', decimals: 0 },
      },
      { label: 'Years until retirement', value: years, format: { style: 'decimal', decimals: 0 } },
      {
        label: 'Total contributed',
        value: totalContributed,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Investment growth',
        value: investmentGrowth,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Growth as a share of the total',
        value: nestEgg === 0 ? 0 : (investmentGrowth / nestEgg) * 100,
        format: { style: 'percent' },
      },
    ],
    steps: [
      {
        label: 'Starting balance',
        value: currentSavings,
        format: { style: 'currency', decimals: 0 },
      },
      { label: 'Months of saving', value: months, format: { style: 'duration', from: 'months' } },
      { label: 'Monthly return rate', value: annualReturn / 12, format: { style: 'percent', decimals: 4 } },
      { rule: true },
      {
        label: 'Growth of existing savings',
        value: fvCurrent,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Growth of future contributions',
        value: fvContributions,
        format: { style: 'currency', decimals: 0 },
      },
      { label: 'Nest egg at retirement', value: nestEgg, format: { style: 'currency', decimals: 0 } },
      { rule: true },
      { label: 'Safe withdrawal rate', value: withdrawalRate, format: { style: 'percent', decimals: 1 } },
      {
        label: 'First-year withdrawal',
        value: annualIncome,
        format: { style: 'currency', decimals: 0 },
      },
    ],
    // Components of the nest egg, which is not the primary's own decomposition
    // target only because the primary IS the nest egg — the split is stated
    // explicitly so the three slices are read against the figure they build.
    partsTotal: {
      label: 'Nest egg at retirement',
      value: nestEgg,
      format: { style: 'currency', decimals: 0 },
    },
    parts: [
      {
        label: 'Current savings grown',
        value: fvCurrent,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Contributions',
        value: totalContributed,
        format: { style: 'currency', decimals: 0 },
      },
      // The remainder, so the three always sum to the nest egg exactly. With a
      // non-negative return the annuity's future value never falls below the
      // deposits that built it, so this cannot go negative.
      {
        label: 'Investment growth',
        value: Math.max(0, nestEgg - fvCurrent - totalContributed),
        format: { style: 'currency', decimals: 0 },
      },
    ],
    series: [
      {
        label: 'Projected balance',
        points: balancePoints,
        format: { style: 'currency', decimals: 0 },
      },
    ],
    chart: { title: 'Projected balance by age', xLabel: 'Age' },
    notes: [
      'Figures are in future dollars and are not adjusted for inflation. At 3% inflation, money loses roughly half its purchasing power over 24 years.',
      'The 4% rule comes from historical US market data over 30-year retirements. It assumes a diversified portfolio and annual inflation adjustments, and it is a starting point rather than a guarantee.',
    ],
  }
}

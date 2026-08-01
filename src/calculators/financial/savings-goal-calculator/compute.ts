import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

/** 100 years of monthly steps. Past this the answer is "never" in practice. */
const MAX_MONTHS = 1200

export default function compute(v: Values<typeof fields>): CalcResult {
  const { goalAmount, currentSavings, monthlyDeposit, annualRate } = v

  if (!Number.isFinite(goalAmount) || !(goalAmount > 0))
    throw new CalcError('Enter a savings goal greater than 0.', 'goalAmount')
  if (!Number.isFinite(currentSavings) || currentSavings < 0)
    throw new CalcError('Current savings cannot be negative.', 'currentSavings')
  if (!Number.isFinite(monthlyDeposit) || monthlyDeposit < 0)
    throw new CalcError('Monthly deposit cannot be negative.', 'monthlyDeposit')
  if (!Number.isFinite(annualRate) || annualRate < 0)
    throw new CalcError('Annual return cannot be negative.', 'annualRate')

  const monthlyRate = annualRate / 100 / 12

  // Month by month: interest first on the opening balance, then the deposit.
  // Simulated rather than solved so a 0% return needs no special case and the
  // closing balance is exact rather than an inverted logarithm.
  let balance = currentSavings
  let months = 0
  // The same walk feeds the chart, so the line and the closing balance are one
  // computation rather than two that might drift apart.
  const history: number[] = [balance]
  while (balance < goalAmount && months < MAX_MONTHS) {
    balance = balance * (1 + monthlyRate) + monthlyDeposit
    months += 1
    history.push(balance)
  }

  if (balance < goalAmount)
    throw new CalcError(
      'This goal is not reachable within 100 years. Increase the monthly deposit.',
      'monthlyDeposit',
    )

  const totalDeposited = monthlyDeposit * months
  const interestEarned = balance - currentSavings - totalDeposited
  const contributed = currentSavings + totalDeposited
  const interestShare = balance > 0 ? (interestEarned / balance) * 100 : 0
  const alreadyThere = months === 0

  // Thinned to at most 45 points: 100 years of monthly steps is 1201 of them.
  const stride = Math.max(1, Math.ceil(months / 44))
  const balancePoints: Array<readonly [number, number]> = []
  for (let m = 0; m < months; m += stride) balancePoints.push([m, history[m]!])
  balancePoints.push([months, balance])

  return {
    primary: {
      label: 'Time to reach your goal',
      value: months,
      format: { style: 'duration', from: 'months' },
    },
    scaleValue: months,
    stats: [
      { label: 'Balance when you get there', value: balance, format: { style: 'currency', decimals: 0 } },
      { label: 'Total deposited', value: totalDeposited, format: { style: 'currency', decimals: 0 } },
      { label: 'Interest earned', value: interestEarned, format: { style: 'currency', decimals: 0 } },
      { label: 'Out of pocket', value: contributed, format: { style: 'currency', decimals: 0 } },
      { label: 'Growth as a share of the final balance', value: interestShare, format: { style: 'percent' } },
      { label: 'Months of deposits', value: months, format: { style: 'decimal', decimals: 0 } },
    ],
    steps: [
      { label: 'Savings goal', value: goalAmount, format: { style: 'currency', decimals: 0 } },
      { label: 'Starting balance', value: currentSavings, format: { style: 'currency', decimals: 0 } },
      { label: 'Still to find', value: Math.max(0, goalAmount - currentSavings), format: { style: 'currency', decimals: 0 } },
      { rule: true },
      { label: 'Monthly deposit', value: monthlyDeposit, format: { style: 'currency', decimals: 0 } },
      { label: 'Annual return', value: annualRate, format: { style: 'percent', decimals: 2 } },
      { label: 'Monthly return', value: annualRate / 12, format: { style: 'percent', decimals: 4 } },
      { rule: true },
      { label: 'Months required', value: months, format: { style: 'decimal', decimals: 0 } },
      { label: 'Deposits over that time', value: totalDeposited, format: { style: 'currency', decimals: 0 } },
      { label: 'Interest earned', value: interestEarned, format: { style: 'currency', decimals: 0 } },
      { label: 'Closing balance', value: balance, format: { style: 'currency', decimals: 0 } },
    ],
    // The headline is a duration, so the slices decompose the closing balance
    // instead and say so.
    partsTotal: {
      label: 'Balance at goal',
      value: balance,
      format: { style: 'currency', decimals: 0 },
    },
    parts: [
      { label: 'Starting savings', value: currentSavings, format: { style: 'currency', decimals: 0 } },
      { label: 'Deposits', value: totalDeposited, format: { style: 'currency', decimals: 0 } },
      // The remainder, so the three sum to the closing balance exactly. Interest
      // cannot be negative here because the rate cannot be.
      {
        label: 'Interest earned',
        value: Math.max(0, balance - currentSavings - totalDeposited),
        format: { style: 'currency', decimals: 0 },
      },
    ],
    // Omitted when the goal is already met: a single point is not a line.
    ...(months > 0
      ? {
          series: [
            { label: 'Balance', points: balancePoints, format: { style: 'currency' as const, decimals: 0 } },
          ],
          chart: { title: 'Balance until you reach the goal', xLabel: 'Months' },
        }
      : {}),
    notes: alreadyThere
      ? ['Your current savings already meet this goal, so no further deposits are needed.']
      : [
          'Deposits are added at the end of each month and interest compounds monthly.',
          'The final month usually overshoots the goal slightly, because deposits land in whole months.',
        ],
  }
}

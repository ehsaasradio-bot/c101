import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

/** Anything slower than a century is not a payoff plan; we refuse to model it. */
const MAX_MONTHS = 1200

export default function compute(v: Values<typeof fields>): CalcResult {
  const { balance, apr, monthlyPayment } = v

  if (!(balance > 0)) throw new CalcError('Enter a balance greater than 0.', 'balance')
  if (apr < 0) throw new CalcError('APR cannot be negative.', 'apr')
  if (!(monthlyPayment > 0))
    throw new CalcError('Enter a monthly payment greater than 0.', 'monthlyPayment')

  const monthlyRate = apr / 100 / 12
  const firstMonthInterest = balance * monthlyRate

  // A payment that only covers the interest leaves the balance exactly where it
  // started — the loop below would never terminate.
  if (monthlyPayment <= firstMonthInterest)
    throw new CalcError(
      'That payment does not cover the first month of interest, so the balance would never fall.',
      'monthlyPayment',
    )

  let remaining = balance
  let totalInterest = 0
  let months = 0
  let finalPayment = monthlyPayment
  // balances[k] is what is still owed after k payments, so balances[0] is the
  // opening balance. The chart is sampled straight out of this loop, so it can
  // never drift from the payoff time and interest reported beside it.
  const balances: number[] = [balance]

  while (remaining > 0) {
    if (months >= MAX_MONTHS)
      throw new CalcError(
        'This balance takes over 100 years to clear at that payment. Increase the payment.',
        'monthlyPayment',
      )
    const interest = remaining * monthlyRate
    totalInterest += interest
    const due = remaining + interest
    // The last month only ever charges what is actually left.
    finalPayment = Math.min(monthlyPayment, due)
    remaining = due - finalPayment
    months += 1
    balances.push(Math.max(0, remaining))
  }

  const totalPaid = balance + totalInterest
  const years = months / 12

  // Monthly balances, thinned so a 1200-month worst case still ships ~42
  // points. x is in months, matching the headline figure's unit.
  const stride = Math.max(1, Math.ceil(months / 40))
  const balancePoints: Array<readonly [number, number]> = []
  for (let m = 0; m <= months; m += stride) balancePoints.push([m, balances[m]!])
  if (balancePoints[balancePoints.length - 1]![0] !== months)
    balancePoints.push([months, balances[months]!])

  return {
    primary: {
      label: 'Time to pay off',
      value: months,
      format: { style: 'duration', from: 'months' },
    },
    scaleValue: months,
    stats: [
      { label: 'Total interest', value: totalInterest, format: { style: 'currency' } },
      { label: 'Total paid', value: totalPaid, format: { style: 'currency' } },
      { label: 'Number of payments', value: months, format: { style: 'decimal', decimals: 0 } },
      {
        label: 'Interest as a share of the balance',
        value: (totalInterest / balance) * 100,
        format: { style: 'percent' },
      },
      { label: 'Final payment', value: finalPayment, format: { style: 'currency' } },
    ],
    steps: [
      { label: 'Starting balance', value: balance, format: { style: 'currency' } },
      { label: 'APR', value: apr, format: { style: 'percent', decimals: 2 } },
      {
        label: 'Monthly periodic rate',
        value: apr / 12,
        format: { style: 'percent', decimals: 4 },
      },
      { rule: true },
      {
        label: 'First month interest',
        value: firstMonthInterest,
        format: { style: 'currency' },
      },
      {
        label: 'First month principal',
        value: monthlyPayment - firstMonthInterest,
        format: { style: 'currency' },
      },
      { rule: true },
      { label: 'Months to clear', value: months, format: { style: 'decimal', decimals: 0 } },
      { label: 'Years to clear', value: years, format: { style: 'decimal', decimals: 1 } },
      { label: 'Total interest', value: totalInterest, format: { style: 'currency' } },
      { label: 'Total paid', value: totalPaid, format: { style: 'currency' } },
    ],
    parts: [
      { label: 'Principal', value: balance, format: { style: 'currency' } },
      { label: 'Interest', value: totalInterest, format: { style: 'currency' } },
    ],
    partsTotal: { label: 'Total paid', value: totalPaid, format: { style: 'currency' } },
    series: [
      {
        label: 'Remaining balance',
        points: balancePoints,
        format: { style: 'currency', decimals: 0 },
      },
    ],
    notes: [
      'This assumes a fixed payment every month and no new purchases on the card. Adding spending restarts the arithmetic.',
      'Card issuers compound daily in practice, so a real statement may differ by a few dollars from this monthly model.',
    ],
  }
}

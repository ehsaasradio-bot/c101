import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

/** Amortizes month by month so extra payments can shorten the term. */
function payoff(principal: number, monthlyRate: number, payment: number, maxMonths: number) {
  let balance = principal
  let interestPaid = 0
  let months = 0
  // balances[k] is what is still owed after k payments, so balances[0] is the
  // full loan. Clamped at 0 because the last payment usually overshoots.
  const balances: number[] = [principal]
  while (balance > 0 && months < maxMonths) {
    const interest = balance * monthlyRate
    const principalPart = payment - interest
    if (principalPart <= 0) return null // payment never covers the interest
    balance -= principalPart
    interestPaid += interest
    months += 1
    balances.push(Math.max(0, balance))
  }
  // The final payment is usually partial; `balance` goes slightly negative.
  return { months, interestPaid: interestPaid + Math.min(balance, 0), balances }
}

export default function compute(v: Values<typeof fields>): CalcResult {
  const { amount, rate, months, extra } = v

  if (!(amount > 0)) throw new CalcError('Enter a loan amount greater than 0.', 'amount')
  if (rate < 0) throw new CalcError('Interest rate cannot be negative.', 'rate')
  if (!(months >= 1)) throw new CalcError('Term must be at least 1 month.', 'months')
  if (extra < 0) throw new CalcError('Extra payment cannot be negative.', 'extra')

  const monthlyRate = rate / 100 / 12
  const n = Math.round(months)

  const scheduled =
    monthlyRate === 0
      ? amount / n
      : (amount * monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1)

  const baseInterest = scheduled * n - amount

  // Amortize month by month at the payment actually being made. This is the
  // same schedule the headline payment implies, so the curve below and the
  // totals beside it are read off one simulation.
  const sim = payoff(amount, monthlyRate, scheduled + extra, n)
  if (!sim) throw new CalcError('That payment never covers the interest.', 'extra')

  const accelerated = extra > 0 ? sim : { months: n, interestPaid: baseInterest }

  const monthsSaved = n - accelerated.months
  const interestSaved = baseInterest - accelerated.interestPaid

  // Rounding can leave the closed-form interest a hair below zero on a 0% loan;
  // a negative slice is not a slice.
  const totalInterest = Math.max(0, accelerated.interestPaid)
  const totalRepaid = amount + totalInterest

  // Remaining balance by year over the ACTUAL payoff term, sampled from the
  // simulation above. 480 months is the field maximum, so at most 42 points.
  const termYears = accelerated.months / 12
  const yearStride = Math.max(1, Math.ceil(termYears / 40))
  const balanceAt = (m: number) => sim.balances[Math.min(m, sim.balances.length - 1)] ?? 0
  const balancePoints: Array<readonly [number, number]> = []
  for (let t = 0; t <= termYears; t += yearStride) balancePoints.push([t, balanceAt(Math.round(t * 12))])
  if (balancePoints[balancePoints.length - 1]![0] !== termYears)
    balancePoints.push([termYears, balanceAt(accelerated.months)])

  return {
    primary: {
      label: 'Monthly payment',
      value: scheduled + extra,
      format: { style: 'currency' },
    },
    scaleValue: (accelerated.interestPaid / amount) * 100,
    stats: [
      { label: 'Total interest', value: accelerated.interestPaid, format: { style: 'currency', decimals: 0 } },
      {
        label: 'Total repaid',
        value: amount + accelerated.interestPaid,
        format: { style: 'currency', decimals: 0 },
      },
      { label: 'Payoff time', value: accelerated.months, format: { style: 'duration', from: 'months' } },
      { label: 'Interest saved', value: interestSaved, format: { style: 'currency', decimals: 0 } },
      { label: 'Time saved', value: monthsSaved, format: { style: 'duration', from: 'months' } },
    ],
    steps: [
      { label: 'Amount borrowed', value: amount, format: { style: 'currency', decimals: 0 } },
      { label: 'Annual rate', value: rate, format: { style: 'percent', decimals: 2 } },
      { label: 'Scheduled term', value: n, format: { style: 'duration', from: 'months' } },
      { rule: true },
      { label: 'Scheduled payment', value: scheduled, format: { style: 'currency' } },
      { label: 'Extra payment', value: extra, format: { style: 'currency' } },
      { label: 'Actual payment', value: scheduled + extra, format: { style: 'currency' } },
      { rule: true },
      { label: 'Interest without extra', value: baseInterest, format: { style: 'currency', decimals: 0 } },
      {
        label: 'Interest with extra',
        value: accelerated.interestPaid,
        format: { style: 'currency', decimals: 0 },
      },
    ],
    parts: [
      { label: 'Principal', value: amount, format: { style: 'currency', decimals: 0 } },
      { label: 'Interest', value: totalInterest, format: { style: 'currency', decimals: 0 } },
    ],
    partsTotal: { label: 'Total repaid', value: totalRepaid, format: { style: 'currency' } },
    series: [
      {
        label: 'Remaining balance',
        points: balancePoints,
        format: { style: 'currency', decimals: 0 },
      },
    ],
    notes:
      extra > 0
        ? [`Paying $${extra.toLocaleString('en-US')} extra each month clears the loan ${monthsSaved} months early.`]
        : ['Add an extra monthly payment to see how much interest it saves.'],
  }
}

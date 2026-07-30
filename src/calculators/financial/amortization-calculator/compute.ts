import { CalcError } from '../../../lib/types'
import type { CalcResult, Part, Quantity, Series, Values } from '../../../lib/types'
import type { fields } from './fields'

/**
 * Standard fixed-rate amortization. The level payment comes from the annuity
 * formula used by every lender:
 *
 *   M = P · i / (1 − (1 + i)^−n)      i = APR/12, n = term in months
 *
 * At 0% that expression is 0/0, so it degrades to P/n — an interest-free
 * instalment plan, which is a real product rather than an edge case to reject.
 *
 * The schedule itself is simulated month by month rather than taken from a
 * closed form. It has to be: the final payment is trimmed to whatever balance
 * remains, and the cent-level rounding a lender applies each month is what makes
 * the last row differ from the other 359. A closed form would disagree with the
 * table by a few cents and the page would contradict itself.
 */

/** Round to cents the way a payment schedule does, avoiding 0.1 + 0.2 drift. */
const cents = (n: number) => Math.round(n * 1e2) / 1e2

interface Row {
  interest: number
  principal: number
  balance: number
}

export default function compute(v: Values<typeof fields>): CalcResult {
  const { amount, rate, years, focusYear } = v

  // Finiteness first: coerceValues emits NaN for unparseable input, and a
  // magnitude test like `amount <= 0` is false for NaN, so it would slip past.
  if (!Number.isFinite(amount) || !(amount > 0)) {
    throw new CalcError('Enter a loan amount greater than 0.', 'amount')
  }
  if (!Number.isFinite(rate) || rate < 0) {
    throw new CalcError('Enter an interest rate of 0% or more.', 'rate')
  }
  if (!Number.isFinite(years) || !(years >= 1)) {
    throw new CalcError('Enter a term of at least one year.', 'years')
  }
  if (!Number.isFinite(focusYear) || !(focusYear >= 1)) {
    throw new CalcError('Pick a year of 1 or later.', 'focusYear')
  }

  const termYears = Math.round(years)
  const n = termYears * 12
  const i = rate / 100 / 12

  const payment =
    i === 0 ? cents(amount / n) : cents((amount * i) / (1 - Math.pow(1 + i, -n)))

  // ── The schedule ────────────────────────────────────────────────────────
  const rows: Row[] = []
  let balance = amount
  let totalInterest = 0

  for (let month = 1; month <= n; month++) {
    const interest = cents(balance * i)
    // The final payment settles the balance outright. Rounding the level
    // payment to whole cents means 360 identical payments do not amortize the
    // principal exactly — at the defaults they leave $4.71 outstanding — and a
    // lender clears that on the last payment rather than carrying it. Capping
    // at `balance` alone only guards the overshoot, never the shortfall.
    const principal = month === n ? balance : Math.min(cents(payment - interest), balance)
    balance = cents(balance - principal)
    totalInterest = cents(totalInterest + interest)
    rows.push({ interest, principal, balance })
    if (balance <= 0) break
  }

  const paidMonths = rows.length
  const totalPaid = cents(amount + totalInterest)

  // ── Where the money goes, and when that flips ───────────────────────────
  // The month principal first exceeds interest. Algebraically this is where the
  // balance falls below M/(2i), but it is read off the schedule so it can never
  // disagree with the table beneath it. At 0% interest is always 0, so it is
  // month 1 — correct, not a special case.
  const crossoverIndex = rows.findIndex((r) => r.principal > r.interest)
  const crossoverMonth = crossoverIndex === -1 ? paidMonths : crossoverIndex + 1

  // ── The year the visitor asked about ────────────────────────────────────
  const lastYear = Math.ceil(paidMonths / 12)
  const year = Math.min(Math.round(focusYear), lastYear)
  const slice = rows.slice((year - 1) * 12, year * 12)
  const yearInterest = cents(slice.reduce((a, r) => a + r.interest, 0))
  const yearPrincipal = cents(slice.reduce((a, r) => a + r.principal, 0))
  const yearEndBalance = slice.length ? slice[slice.length - 1]!.balance : 0
  const yearInterestShare =
    yearInterest + yearPrincipal > 0
      ? (yearInterest / (yearInterest + yearPrincipal)) * 100
      : 0

  // ── Parts: always exactly two, whatever the inputs ──────────────────────
  // Principal is the amount borrowed by definition, so interest is the
  // remainder and the two sum to the total repaid exactly by construction.
  const parts: Part[] = [
    { label: 'Principal', value: amount, format: { style: 'currency', decimals: 0 } },
    {
      label: 'Interest',
      // Clamped because a 0% loan lands this at exactly 0, and floating point
      // can put a subtraction a hair below it.
      value: Math.max(0, cents(totalPaid - amount)),
      format: { style: 'currency', decimals: 0 },
    },
  ]

  // ── Series: always exactly two, thinned to keep the chart readable ──────
  const stride = Math.max(1, Math.ceil(paidMonths / 45))
  const balancePoints: Array<readonly [number, number]> = [[0, amount]]
  const interestPoints: Array<readonly [number, number]> = [[0, 0]]
  let runningInterest = 0
  for (let k = 0; k < paidMonths; k++) {
    runningInterest = cents(runningInterest + rows[k]!.interest)
    const month = k + 1
    if (month % stride === 0 || month === paidMonths) {
      balancePoints.push([month, rows[k]!.balance])
      interestPoints.push([month, runningInterest])
    }
  }

  const series: Series[] = [
    {
      label: 'Balance remaining',
      points: balancePoints,
      format: { style: 'currency', decimals: 0 },
    },
    {
      label: 'Interest paid so far',
      points: interestPoints,
      format: { style: 'currency', decimals: 0 },
    },
  ]

  const first = rows[0]!
  const stats: Quantity[] = [
    // The crossover is the schedule's most striking fact, but it makes a poor
    // headline: it depends only on the rate and term, so it does not move when
    // you change the loan amount — the field most people reach for first, which
    // would read as a broken page. It leads the stats instead.
    {
      label: 'Principal overtakes interest at',
      value: crossoverMonth,
      format: { style: 'duration', from: 'months' },
    },
    { label: 'Monthly payment', value: payment, format: { style: 'currency' } },
    { label: 'Total interest', value: totalInterest, format: { style: 'currency' } },
    { label: 'Total repaid', value: totalPaid, format: { style: 'currency' } },
    {
      label: 'Interest as a share of what you repay',
      value: (totalInterest / totalPaid) * 100,
      format: { style: 'percent', decimals: 1 },
    },
    // Interest for this year is the headline; the contrast is what belongs here.
    { label: `Principal in year ${year}`, value: yearPrincipal, format: { style: 'currency' } },
    {
      label: `Still owed after year ${year}`,
      value: yearEndBalance,
      format: { style: 'currency' },
    },
    {
      label: `Share of year ${year} going to interest`,
      value: yearInterestShare,
      format: { style: 'percent', decimals: 1 },
    },
  ]

  return {
    primary: {
      label: `Interest in year ${year}`,
      value: yearInterest,
      format: { style: 'currency' },
    },
    stats,
    steps: [
      { label: 'Amount borrowed', value: amount, format: { style: 'currency' } },
      { label: 'Monthly rate = APR ÷ 12', value: i * 100, format: { style: 'percent', decimals: 4 } },
      { label: 'Payments = years × 12', value: n, format: { style: 'decimal', decimals: 0 } },
      { label: 'Level payment M = P·i ÷ (1 − (1+i)⁻ⁿ)', value: payment, format: { style: 'currency' } },
      { rule: true },
      { label: 'Payment 1 — interest = balance × i', value: first.interest, format: { style: 'currency' } },
      { label: 'Payment 1 — principal = M − interest', value: first.principal, format: { style: 'currency' } },
      { label: 'Balance after payment 1', value: first.balance, format: { style: 'currency' } },
      { rule: true },
      {
        label: 'Principal first exceeds interest at payment',
        value: crossoverMonth,
        format: { style: 'decimal', decimals: 0 },
      },
    ],
    parts,
    partsTotal: { label: 'Total repaid', value: totalPaid, format: { style: 'currency' } },
    series,
    notes: [
      'Assumes a fixed rate and equal monthly payments, with interest charged on the balance remaining at the start of each month.',
      'The final payment settles whatever is left, so it differs from the others by a few dollars — rounding each payment to whole cents never divides the principal exactly.',
    ],
  }
}

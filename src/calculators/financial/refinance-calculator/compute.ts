import { CalcError } from '../../../lib/types'
import type { CalcResult, Part, Quantity, Values } from '../../../lib/types'
import type { fields } from './fields'

/**
 * Refinance break-even, and the thing most refinance calculators leave out.
 *
 * Both loans are ordinary fixed-rate annuities, so each one's level payment is
 * the standard formula every lender uses:
 *
 *   M = P · i / (1 − (1 + i)^−n)      i = APR / 12, n = term in months
 *
 * At 0% that expression is 0/0, so it degrades to P/n — an interest-free plan
 * is a real product rather than an edge case to reject.
 *
 * The headline is the break-even month: closing costs ÷ the monthly saving,
 * rounded up, because you are only ahead once a whole payment has been made.
 *
 * The part that matters more, and that a payment-only comparison hides: the new
 * loan restarts the clock. Twenty-two years left refinanced into a fresh thirty
 * is eight extra years of interest, which a one-point rate cut does not come
 * close to paying for. So the meter is driven by the change in LIFETIME cost,
 * not by the break-even — a page whose gauge went green the moment the payment
 * fell would be telling the exact lie this calculator exists to correct.
 *
 * Both loans are compared on the same principal. Closing costs are treated as
 * cash paid up front, not rolled into the balance, which is the assumption the
 * break-even figure only makes sense under.
 */

/** Level payment on an annuity of `months` payments. 0% is a straight division. */
function levelPayment(principal: number, monthlyRate: number, months: number): number {
  return monthlyRate === 0
    ? principal / months
    : (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months))
}

/** Whole dollars with separators, for note text. The locale is pinned in
 * format.ts for the same reason it is pinned here: compute runs at build time in
 * Node and again in the browser, and the two must produce the same string. */
const usd = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString('en-US')}`

/** No mortgage carries a rate near this; past it the input is a typo. */
const MAX_RATE = 40
/** Longer than any consumer loan term, and past it the annuity maths is noise. */
const MAX_YEARS = 50

// The meter's span, in percent change of lifetime cost. These MUST match
// `scale.min` / `scale.max` in index.ts, which cannot be imported here without a
// cycle (index → compute → index), so the compute.test.ts case
// "the meter never resolves the wrong way round at the extremes" asserts the two
// against each other instead.
//
// The clamp is not cosmetic. `resolveBand` in lib/view.ts falls back to the LAST
// band when no band matches, so an unclamped −77% would sail past the first band
// and be reported as "costs much more over the life of the loan" — the best case
// on the page rendered as the worst.
const SCALE_MIN = -40
const SCALE_MAX = 40

/** Roughly the point budget for the chart; long horizons are thinned to it. */
const CHART_POINTS = 44

export default function compute(v: Values<typeof fields>): CalcResult {
  const { balance, currentRate, remainingYears, newRate, newYears, closingCosts } = v

  // Finiteness first, every time: coerceValues deliberately emits NaN for
  // unparseable input, and a magnitude test like `balance <= 0` is false for
  // NaN, so it would slip straight past a guard written the other way round.
  if (!Number.isFinite(balance) || !(balance > 0)) {
    throw new CalcError('Enter the balance you still owe, greater than 0.', 'balance')
  }
  if (!Number.isFinite(currentRate) || currentRate < 0 || currentRate > MAX_RATE) {
    throw new CalcError(`Enter your current rate as a percentage from 0 to ${MAX_RATE}.`, 'currentRate')
  }
  if (!Number.isFinite(remainingYears) || !(remainingYears >= 1) || remainingYears > MAX_YEARS) {
    throw new CalcError(`Enter between 1 and ${MAX_YEARS} years left on the loan.`, 'remainingYears')
  }
  if (!Number.isFinite(newRate) || newRate < 0 || newRate > MAX_RATE) {
    throw new CalcError(`Enter the new rate as a percentage from 0 to ${MAX_RATE}.`, 'newRate')
  }
  if (!Number.isFinite(newYears) || !(newYears >= 1) || newYears > MAX_YEARS) {
    throw new CalcError(`Enter a new term between 1 and ${MAX_YEARS} years.`, 'newYears')
  }
  if (!Number.isFinite(closingCosts) || closingCosts < 0) {
    throw new CalcError('Closing costs cannot be negative.', 'closingCosts')
  }

  const currentMonths = Math.round(remainingYears * 12)
  const newMonths = Math.round(newYears * 12)
  const currentMonthlyRate = currentRate / 100 / 12
  const newMonthlyRate = newRate / 100 / 12

  const currentPayment = levelPayment(balance, currentMonthlyRate, currentMonths)
  const newPayment = levelPayment(balance, newMonthlyRate, newMonths)
  const monthlySaving = currentPayment - newPayment

  // Interest is what you repay beyond the principal. Clamped because a 0% loan
  // lands the subtraction on exactly zero and floating point can put it a hair
  // below, which would make a donut slice negative.
  const currentInterest = Math.max(0, currentPayment * currentMonths - balance)
  const newInterest = Math.max(0, newPayment * newMonths - balance)

  // Built by addition from the same three numbers the donut shows, so the
  // slices sum to the total in its centre by construction rather than by luck.
  const currentTotalCost = balance + currentInterest
  const newTotalCost = balance + newInterest + closingCosts

  const interestChange = newInterest - currentInterest
  const costChange = newTotalCost - currentTotalCost

  // Rounded UP: you are only ahead once a whole payment has been made. Zero
  // closing costs break even immediately, which is the honest answer for a
  // genuinely no-cost refinance.
  const breakEvenMonths = monthlySaving > 0 ? Math.ceil(closingCosts / monthlySaving) : null

  const percentChange = (costChange / currentTotalCost) * 100
  const scaleValue = Math.min(SCALE_MAX, Math.max(SCALE_MIN, percentChange))

  // ── Where every dollar of the new loan goes ─────────────────────────────
  // Named because `.filter` strips the contextual typing an inline literal would
  // get from the `Part[]` annotation, widening `style` to plain `string`.
  const WHOLE_DOLLARS = { style: 'currency', decimals: 0 } as const
  // A zero-valued slice is dropped rather than drawn as an invisible arc — the
  // no-cost refinance case. Dropping a zero leaves the sum untouched, so the
  // slices still add up to the total printed in the donut's centre.
  const parts: Part[] = [
    { label: 'Principal you still owe', value: balance, format: WHOLE_DOLLARS },
    { label: 'Interest on the new loan', value: newInterest, format: WHOLE_DOLLARS },
    { label: 'Closing costs', value: closingCosts, format: WHOLE_DOLLARS },
  ].filter((p) => p.value > 0)

  // ── The break-even curve, and what happens after it ─────────────────────
  // Cash position against simply keeping the current loan: every month you pay
  // the old payment instead of the new one you are that much better off, less
  // the closing costs you paid on day one. It starts negative, crosses zero at
  // the break-even month — and then falls again once the old loan would have
  // been paid off but the new one still has years to run. That second crossing
  // is the whole point of the page.
  const horizon = Math.max(currentMonths, newMonths)
  const netAt = (m: number) =>
    currentPayment * Math.min(m, currentMonths) -
    (closingCosts + newPayment * Math.min(m, newMonths))

  const stride = Math.max(1, Math.ceil(horizon / CHART_POINTS))
  const netPoints: Array<readonly [number, number]> = []
  for (let m = 0; m < horizon; m += stride) netPoints.push([m, netAt(m)])
  // The final point is pinned to the headline arithmetic rather than left to
  // the loop, so the end of the curve and "lifetime cost change" cannot differ.
  netPoints.push([horizon, -costChange])

  // ── Figures ─────────────────────────────────────────────────────────────
  const stats: Quantity[] = [
    { label: 'New monthly payment', value: newPayment, format: { style: 'currency' } },
    // Deliberately adjacent: the saving people come for, and the number that
    // decides whether it was worth having.
    { label: 'Monthly saving', value: monthlySaving, format: { style: 'currency' } },
    {
      label: 'Lifetime interest change',
      value: interestChange,
      format: { style: 'currency', decimals: 0 },
    },
    {
      label: 'Interest left on your current loan',
      value: currentInterest,
      format: { style: 'currency', decimals: 0 },
    },
    {
      label: 'Interest on the new loan',
      value: newInterest,
      format: { style: 'currency', decimals: 0 },
    },
    {
      label: 'Lifetime cost change, closing costs included',
      value: costChange,
      format: { style: 'currency', decimals: 0 },
    },
    { label: 'Current payoff time', value: currentMonths, format: { style: 'duration', from: 'months' } },
    { label: 'New payoff time', value: newMonths, format: { style: 'duration', from: 'months' } },
  ]

  // ── Notes: the honesty, spelled out for whichever case this is ──────────
  const notes: string[] = []
  if (monthlySaving > 0 && costChange > 0) {
    notes.push(
      `A lower payment is not the same as a cheaper loan. This refinance saves ${usd(monthlySaving)} a month, but you repay ${usd(costChange)} MORE in total once the longer term and the closing costs are counted.`,
    )
  } else if (monthlySaving > 0) {
    notes.push(
      `This one wins on both counts: ${usd(monthlySaving)} lower each month, and ${usd(costChange)} less repaid over the life of the loan after closing costs.`,
    )
  } else if (costChange < 0) {
    notes.push(
      `The payment goes UP by ${usd(monthlySaving)} a month, so there is no break-even to reach — but you repay ${usd(costChange)} less overall. That is the trade a shorter term buys.`,
    )
  } else {
    notes.push(
      `The payment goes up by ${usd(monthlySaving)} a month AND you repay ${usd(costChange)} more overall. On these numbers there is nothing to gain.`,
    )
  }

  if (newMonths > currentMonths) {
    notes.push(
      `The new term runs ${newMonths - currentMonths} months longer than what you have left. Restarting the clock lowers the payment on its own, even with no change in rate at all — compare a ${Math.round(currentMonths / 12)}-year term to see the rate cut by itself.`,
    )
  }

  notes.push(
    'Assumes closing costs are paid up front rather than rolled into the new balance, that both loans are fixed-rate, and that you keep the loan to the end of its term.',
  )

  return {
    primary:
      breakEvenMonths === null
        ? { label: 'Time to break even', value: 'No monthly saving', format: { style: 'raw' } }
        : {
            label: 'Time to break even',
            value: breakEvenMonths,
            format: { style: 'duration', from: 'months' },
          },
    scaleValue,
    stats,
    steps: [
      { label: 'Balance still owed', value: balance, format: { style: 'currency', decimals: 0 } },
      { label: 'Current rate ÷ 12', value: currentMonthlyRate * 100, format: { style: 'percent', decimals: 4 } },
      { label: 'Payments left', value: currentMonths, format: { style: 'decimal', decimals: 0 } },
      {
        label: 'Current payment M = P·i ÷ (1 − (1+i)⁻ⁿ)',
        value: currentPayment,
        format: { style: 'currency' },
      },
      { rule: true },
      { label: 'New rate ÷ 12', value: newMonthlyRate * 100, format: { style: 'percent', decimals: 4 } },
      { label: 'New payments', value: newMonths, format: { style: 'decimal', decimals: 0 } },
      { label: 'New payment, same formula', value: newPayment, format: { style: 'currency' } },
      { label: 'Monthly saving = old − new', value: monthlySaving, format: { style: 'currency' } },
      { rule: true },
      { label: 'Closing costs', value: closingCosts, format: { style: 'currency', decimals: 0 } },
      {
        label: 'Break-even = costs ÷ monthly saving',
        value: breakEvenMonths ?? 'never — the payment does not fall',
        format: breakEvenMonths === null ? { style: 'raw' } : { style: 'duration', from: 'months' },
      },
      { rule: true },
      {
        label: 'Total repaid if you keep the loan',
        value: currentTotalCost,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Total repaid if you refinance',
        value: newTotalCost,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Difference over the life of the loan',
        value: costChange,
        format: { style: 'currency', decimals: 0 },
      },
    ],
    parts,
    partsTotal: {
      label: 'Total cost of the new loan',
      value: newTotalCost,
      format: { style: 'currency', decimals: 0 },
    },
    series: [
      {
        label: 'Cumulative saving vs keeping your loan',
        points: netPoints,
        format: { style: 'currency', decimals: 0 },
      },
    ],
    notes,
  }
}

import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

/**
 * The 50/30/20 rule, as set out by Elizabeth Warren and Amelia Warren Tyagi in
 * "All Your Worth" (2005): of take-home pay, at most 50% to needs, at most 30%
 * to wants, and at least 20% to savings and debt repayment beyond the minimums.
 * The three targets are shares of income, not of spending, which is why every
 * percentage below is divided by take-home pay rather than by what was spent.
 *
 * The headline is the GAP, not a restatement of the inputs: the smallest amount
 * of money that would have to change category each month for the budget to land
 * exactly on 50/30/20.
 *
 * Deriving it needs a fourth bucket. Take-home pay that has not been assigned to
 * needs, wants or savings is real money with a target share of 0%, so the four
 * shares always sum to 100% and the four deviations from target always sum to
 * zero. Money therefore has to leave the over-target buckets in exactly the
 * amount the under-target buckets are short by, and the sum of the positive
 * deviations is that amount — the standard total-variation distance between the
 * actual split and the target one.
 *
 * Overspending is the same arithmetic, not a special case: budgeting more than
 * you take home makes the unallocated bucket negative, which is a deviation like
 * any other. Nothing here divides by a spending total, so nothing breaks.
 */
const NEEDS_TARGET = 0.5
const WANTS_TARGET = 0.3
const SAVINGS_TARGET = 0.2

/** The scale is a share of income and is unbounded above, so it is capped. */
const DRIFT_CEILING = 100

/**
 * Notes are prose, so they carry their own numbers. Both formatters are pinned
 * rather than locale-dependent: compute runs in Node at build time and again in
 * the browser, and the two must produce the same string.
 */
function money(amount: number): string {
  const digits = String(Math.round(Math.abs(amount))).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${amount < 0 ? '-' : ''}$${digits}`
}

/** One decimal place, with a bare integer left bare: 13, not 13.0. */
function round1(share: number): string {
  return String(Math.round(share * 10) / 10)
}

const pct = (share: number) => `${round1(share)}%`

/**
 * The distance between two percentages is measured in percentage points, not in
 * percent — 63% against a 50% guideline is 13 points over, not 13% over.
 */
const points = (gap: number) => `${round1(gap)} ${Math.round(gap * 10) / 10 === 1 ? 'point' : 'points'}`

export default function compute(v: Values<typeof fields>): CalcResult {
  const { income, housing, transport, food, otherNeeds, wants, savings } = v

  // Finiteness first: coerceValues emits NaN for unparseable input, and a
  // magnitude test like `x < 0` is false for NaN, so it would slip through.
  if (!Number.isFinite(income)) throw new CalcError('Enter your monthly take-home pay.', 'income')
  if (!(income > 0))
    throw new CalcError('Take-home pay must be greater than 0.', 'income')

  const spending = [
    ['housing', housing],
    ['transport', transport],
    ['food', food],
    ['otherNeeds', otherNeeds],
    ['wants', wants],
    ['savings', savings],
  ] as const

  for (const [id, amount] of spending) {
    if (!Number.isFinite(amount)) throw new CalcError('Enter a number.', id)
    // Every line is a positive monthly amount. A minus sign means the figure is
    // in the wrong box, so it is rejected rather than quietly flipped — and it
    // keeps the three donut slices non-negative by construction.
    if (amount < 0) throw new CalcError('Enter zero or a positive amount.', id)
  }

  const needs = housing + transport + food + otherNeeds
  const budgeted = needs + wants + savings
  // Negative when the budget spends more than it takes in. That is a real
  // answer — an overspend — not an error.
  const unallocated = income - budgeted

  const needsShare = (needs / income) * 100
  const wantsShare = (wants / income) * 100
  const savingsShare = (savings / income) * 100
  const unallocatedShare = (unallocated / income) * 100

  const needsTarget = NEEDS_TARGET * income
  const wantsTarget = WANTS_TARGET * income
  const savingsTarget = SAVINGS_TARGET * income

  // Actual minus target, in dollars. Positive means the bucket holds more than
  // the guideline allows; for savings that is good, for the others it is not.
  const needsGap = needs - needsTarget
  const wantsGap = wants - wantsTarget
  const savingsGap = savings - savingsTarget
  // Unassigned pay has a target share of 0%, so its deviation is itself.
  const deviations = [needsGap, wantsGap, savingsGap, unallocated]

  // The four deviations sum to zero, so the positives and the negatives are
  // equal in size: this is both "how much is over" and "how much is short".
  const drift = deviations.reduce((sum, d) => sum + Math.max(0, d), 0)
  const driftShare = (drift / income) * 100

  const notes: string[] = []

  if (needsGap > 0)
    notes.push(
      `Needs are ${pct(needsShare)} of take-home pay, ${points(needsShare - 50)} above the 50% guideline — ${money(needsGap)} a month. Housing is usually the line to attack, because it is the largest and the only one a move or a refinance changes permanently.`,
    )
  else
    notes.push(
      `Needs are ${pct(needsShare)} of take-home pay, inside the 50% guideline with ${money(-needsGap)} a month to spare.`,
    )

  if (wantsGap > 0)
    notes.push(
      `Wants are ${pct(wantsShare)}, ${points(wantsShare - 30)} above the 30% guideline — ${money(wantsGap)} a month. This is the fastest category to change, because nothing here is contractual.`,
    )

  if (savingsGap < 0)
    notes.push(
      `Savings are ${pct(savingsShare)}, ${points(20 - savingsShare)} short of the 20% target — ${money(-savingsGap)} a month. Raising it by that amount is what closes the gap; everything else is where the money comes from.`,
    )
  else
    notes.push(
      `Savings are ${pct(savingsShare)}, meeting the 20% target with ${money(savingsGap)} a month to spare.`,
    )

  if (unallocated > 0)
    notes.push(
      `${money(unallocated)} a month is not assigned to anything. Unassigned money is usually spent, so counting it as savings would take savings to ${pct(savingsShare + unallocatedShare)}${savingsShare + unallocatedShare >= 20 ? ', which clears the 20% target.' : '.'}`,
    )
  else if (unallocated < 0)
    notes.push(
      `This budget commits ${money(-unallocated)} a month more than you take home. The shortfall has to come from savings, credit, or a cut somewhere — the split below is what you have planned, not what is affordable.`,
    )

  if (drift === 0)
    notes.push('Every category is exactly on its 50/30/20 share. Nothing needs to move.')

  if (driftShare > DRIFT_CEILING)
    notes.push('The gap is larger than a month of take-home pay, so the gauge is shown capped.')

  return {
    // The smallest total that has to change category. Because the deviations
    // sum to zero, this is simultaneously the amount over and the amount short.
    primary: {
      label: 'Off the 50/30/20 split by',
      value: drift,
      format: { style: 'currency', decimals: 0 },
    },
    // A fixed three-way split of what has been budgeted. It is not the primary —
    // the headline is a gap, not a total — so the whole is stated explicitly.
    // Every input is non-negative, so no slice can be, and the three add to the
    // stated total by construction rather than by rounding luck.
    parts: [
      { label: 'Needs', value: needs, format: { style: 'currency', decimals: 0 } },
      { label: 'Wants', value: wants, format: { style: 'currency', decimals: 0 } },
      { label: 'Savings', value: savings, format: { style: 'currency', decimals: 0 } },
    ],
    partsTotal: {
      label: 'Total budgeted',
      value: budgeted,
      format: { style: 'currency', decimals: 0 },
    },
    scaleValue: Math.min(driftShare, DRIFT_CEILING),
    stats: [
      { label: 'Needs share of take-home', value: needsShare, format: { style: 'percent' } },
      { label: 'Wants share of take-home', value: wantsShare, format: { style: 'percent' } },
      { label: 'Savings share of take-home', value: savingsShare, format: { style: 'percent' } },
      {
        label: 'Needs vs the 50% target',
        value: needsGap,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Wants vs the 30% target',
        value: wantsGap,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Savings vs the 20% target',
        value: savingsGap,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Unallocated each month',
        value: unallocated,
        format: { style: 'currency', decimals: 0 },
      },
    ],
    steps: [
      { label: 'Housing', value: housing, format: { style: 'currency', decimals: 0 } },
      { label: 'Transport', value: transport, format: { style: 'currency', decimals: 0 } },
      { label: 'Groceries', value: food, format: { style: 'currency', decimals: 0 } },
      { label: 'Other essentials', value: otherNeeds, format: { style: 'currency', decimals: 0 } },
      { label: 'Needs subtotal', value: needs, format: { style: 'currency', decimals: 0 } },
      { rule: true },
      { label: 'Wants', value: wants, format: { style: 'currency', decimals: 0 } },
      { label: 'Savings', value: savings, format: { style: 'currency', decimals: 0 } },
      { label: 'Total budgeted', value: budgeted, format: { style: 'currency', decimals: 0 } },
      { rule: true },
      { label: 'Monthly take-home pay', value: income, format: { style: 'currency', decimals: 0 } },
      { label: 'Unallocated', value: unallocated, format: { style: 'currency', decimals: 0 } },
      { rule: true },
      { label: 'Needs target (50%)', value: needsTarget, format: { style: 'currency', decimals: 0 } },
      { label: 'Wants target (30%)', value: wantsTarget, format: { style: 'currency', decimals: 0 } },
      {
        label: 'Savings target (20%)',
        value: savingsTarget,
        format: { style: 'currency', decimals: 0 },
      },
      { rule: true },
      { label: 'Over target, added up', value: drift, format: { style: 'currency', decimals: 0 } },
      { label: 'Share of take-home pay out of place', value: driftShare, format: { style: 'percent' } },
    ],
    notes,
  }
}

import { CalcError } from '../../../lib/types'
import type { CalcResult, Part, Quantity, Values } from '../../../lib/types'
import type { fields } from './fields'

/**
 * Discount points: what they cost, what they save, and when — if ever — the two
 * meet.
 *
 * A discount point is a prepaid finance charge of 1% of the LOAN amount, paid at
 * closing, in exchange for a lower note rate for the life of the loan. Both the
 * loan you would have taken and the loan you actually take are ordinary
 * fixed-rate annuities, so each one's level payment is the standard formula:
 *
 *   M = P · i / (1 − (1 + i)^−n)       i = rate / 1200, n = term in months
 *
 * At a 0% rate that expression is 0/0 and degrades to P/n. The rate paid is the
 * par rate less `points × reductionPerPoint`; a quarter of a percentage point
 * per point is the common rate-sheet shape, but it is a convention, so it is an
 * input rather than a constant baked in here.
 *
 *   up-front cost      C = points/100 × P
 *   monthly saving     S = M(par) − M(paid)
 *   break-even         ceil(C ÷ S) months
 *
 * THE HALF-TRUTH THIS PAGE REFUSES TO TELL. Break-even on its own is the number
 * every points calculator prints, and on its own it is close to useless: it
 * says when the deal turns positive, not whether you will still be there. Points
 * are the most illiquid part of a mortgage — sell, refinance, or pay the loan
 * off early and the unrecovered part of that cheque is simply gone, because a
 * discount point buys a rate, and the rate dies with the loan. So the meter here
 * is NOT driven by the break-even month. It is driven by how far past break-even
 * you expect to still be holding the loan, which is the question that actually
 * decides the answer. `refinance-calculator` makes the same move for the same
 * reason: a gauge that goes green the moment a payment falls is telling the
 * exact lie the page exists to correct.
 *
 * WHAT IS NOT MODELLED, said plainly rather than buried. The cost is paid in
 * today's money and the saving arrives a month at a time over years, so a strict
 * comparison would discount those future dollars back to the present. This
 * calculator does NOT discount: the break-even it reports is the plain
 * undiscounted one every lender and every rate sheet quotes, so it is
 * comparable with the figure you will be shown elsewhere. Discounting is not a
 * rounding error, though — at a 4% real opportunity cost a break-even near five
 * years lands roughly half a year later, and the gap widens the longer the
 * recovery takes. Nor is tax modelled: points on a purchase of a main home are
 * often deductible in the year paid, which shortens real break-even for anyone
 * who itemises, while the mortgage interest they save is itself deductible,
 * which lengthens it.
 */

/** Level payment on an annuity of `months` payments. 0% is a straight division. */
function levelPayment(principal: number, monthlyRate: number, months: number): number {
  return monthlyRate === 0
    ? principal / months
    : (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months))
}

/**
 * Balance still owed after `k` payments, in closed form:
 *
 *   B(k) = P(1+i)^k − M((1+i)^k − 1)/i
 *
 * Derived from the same annuity identity as `levelPayment`, so the two cannot
 * drift: B(n) is zero by construction. At 0% it is P − M·k.
 *
 * This exists because "sell after nine years" is not just nine years of smaller
 * payments. The cheaper loan also amortizes very slightly faster, so you owe a
 * little less on the day you sell, and ignoring that understates what the points
 * bought you.
 */
function balanceAfter(principal: number, monthlyRate: number, payment: number, k: number): number {
  if (monthlyRate === 0) return principal - payment * k
  const growth = Math.pow(1 + monthlyRate, k)
  return principal * growth - (payment * (growth - 1)) / monthlyRate
}

/** Whole dollars with separators, for note text. The locale is pinned for the
 * same reason format.ts pins its own: compute runs at build time in Node and
 * again in the browser, and the two must produce the same string. */
const usd = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString('en-US')}`

/** Plural-safe month count for note text. */
const months = (n: number) => `${n} month${n === 1 ? '' : 's'}`

/** No mortgage carries a rate near this; past it the input is a typo. */
const MAX_RATE = 40
/** Longer than any consumer mortgage term, and past it the annuity maths is noise. */
const MAX_YEARS = 50
/** Four points is already an unusual buy-down; past eight it is not a rate sheet. */
const MAX_POINTS = 8

// The meter's span, in MONTHS of holding the loan beyond the break-even point.
// These MUST match `scale.min` / `scale.max` in index.ts, which cannot be
// imported here without a cycle (index → compute → index), so the compute.test
// case "the meter never resolves the wrong way round at the extremes" asserts
// the two against each other instead.
//
// The clamp is not cosmetic. `resolveBand` in lib/view.ts falls back to the LAST
// band when nothing matches, so an unclamped −300 would sail past the first band
// and be reported as the BEST outcome on the page — the worst case rendered as
// the best.
const SCALE_MIN = -120
const SCALE_MAX = 120

/** Roughly the point budget for the chart; long horizons are thinned to it. */
const CHART_POINTS = 44

export default function compute(v: Values<typeof fields>): CalcResult {
  const { points, loanAmount, baseRate, reductionPerPoint, termYears, keepYears } = v

  // Finiteness first, every time: coerceValues deliberately emits NaN for
  // unparseable input, and a magnitude test like `points < 0` is false for NaN,
  // so it would slip straight past a guard written the other way round.
  if (!Number.isFinite(points) || points < 0 || points > MAX_POINTS) {
    throw new CalcError(`Enter between 0 and ${MAX_POINTS} discount points.`, 'points')
  }
  if (!Number.isFinite(loanAmount) || !(loanAmount > 0)) {
    throw new CalcError('Enter a loan amount greater than 0.', 'loanAmount')
  }
  if (!Number.isFinite(baseRate) || baseRate < 0 || baseRate > MAX_RATE) {
    throw new CalcError(`Enter the no-points rate as a percentage from 0 to ${MAX_RATE}.`, 'baseRate')
  }
  if (!Number.isFinite(reductionPerPoint) || reductionPerPoint < 0) {
    throw new CalcError('The rate cut per point cannot be negative.', 'reductionPerPoint')
  }
  if (!Number.isFinite(termYears) || !(termYears >= 1) || termYears > MAX_YEARS) {
    throw new CalcError(`Enter a loan term between 1 and ${MAX_YEARS} years.`, 'termYears')
  }
  if (!Number.isFinite(keepYears) || !(keepYears >= 0)) {
    throw new CalcError('Enter how many years you expect to keep the loan.', 'keepYears')
  }

  const rateWithPoints = baseRate - points * reductionPerPoint
  if (rateWithPoints < 0) {
    throw new CalcError(
      `${points} points at ${reductionPerPoint}% each would cut the rate below zero. Lower the cut per point or the number of points.`,
      'reductionPerPoint',
    )
  }

  const n = Math.round(termYears * 12)
  // You cannot keep a loan past its own payoff, so a 40-year horizon on a
  // 30-year loan is 30 years, not an error. Rounded to whole payments because
  // the saving arrives one payment at a time.
  const keepMonths = Math.min(Math.round(keepYears * 12), n)

  const iPar = baseRate / 1200
  const iPaid = rateWithPoints / 1200

  const paymentNoPoints = levelPayment(loanAmount, iPar, n)
  const paymentWithPoints = levelPayment(loanAmount, iPaid, n)
  const monthlySaving = paymentNoPoints - paymentWithPoints

  const upFrontCost = (loanAmount * points) / 100

  // Interest is what you repay beyond the principal. Clamped because a 0% loan
  // lands the subtraction on exactly zero and floating point can put it a hair
  // below, which would make a donut slice negative.
  const interestNoPoints = Math.max(0, paymentNoPoints * n - loanAmount)
  const interestWithPoints = Math.max(0, paymentWithPoints * n - loanAmount)
  const lifetimeInterestSaved = interestNoPoints - interestWithPoints

  // Rounded UP: you are only ahead once a whole payment has been made. Buying no
  // points costs nothing and so breaks even at once, which is the honest answer
  // rather than a special case to hide. A rate cut of zero saves nothing and
  // never repays anything at all, which is reported as such.
  const breakEvenMonths =
    upFrontCost === 0 ? 0 : monthlySaving > 0 ? Math.ceil(upFrontCost / monthlySaving) : null

  // ── The verdict input: how long past break-even you are still holding ────
  // Not the break-even itself. See the header comment.
  const marginMonths = breakEvenMonths === null ? SCALE_MIN : keepMonths - breakEvenMonths
  const scaleValue = Math.min(SCALE_MAX, Math.max(SCALE_MIN, marginMonths))

  // ── What you are actually ahead by, on the day you leave ─────────────────
  // Payment savings banked, less the cheque you wrote — plus the fact that the
  // cheaper loan has paid down slightly more principal, so you owe less on the
  // day you sell. The closed forms above make that second term exact.
  const savedByKeepDate = monthlySaving * keepMonths
  const balanceNoPoints = balanceAfter(loanAmount, iPar, paymentNoPoints, keepMonths)
  const balanceWithPoints = balanceAfter(loanAmount, iPaid, paymentWithPoints, keepMonths)
  const equityEdge = balanceNoPoints - balanceWithPoints
  const netAtKeepDate = savedByKeepDate + equityEdge - upFrontCost

  // ── Where every dollar of the discounted loan goes ───────────────────────
  // Named because `.filter` strips the contextual typing an inline literal would
  // get from the `Part[]` annotation, widening `style` to plain `string`.
  const WHOLE_DOLLARS = { style: 'currency', decimals: 0 } as const
  // A zero-valued slice is dropped rather than drawn as an invisible arc — the
  // no-points case. Dropping a zero leaves the sum untouched, so the slices
  // still add up to the total printed in the donut's centre.
  const parts: Part[] = [
    { label: 'Principal', value: loanAmount, format: WHOLE_DOLLARS },
    { label: 'Interest at the bought-down rate', value: interestWithPoints, format: WHOLE_DOLLARS },
    { label: 'Cost of the points', value: upFrontCost, format: WHOLE_DOLLARS },
  ].filter((p) => p.value > 0)
  const totalWithPoints = loanAmount + interestWithPoints + upFrontCost

  // ── The recovery curve ───────────────────────────────────────────────────
  // Cash position against simply taking the par rate: you start the cheque's
  // worth in the hole and climb by the monthly saving. It crosses zero at the
  // break-even month, which is the same arithmetic as the headline rather than a
  // second simulation that could drift from it.
  const stride = Math.max(1, Math.ceil(n / CHART_POINTS))
  const recovery: Array<readonly [number, number]> = []
  for (let m = 0; m < n; m += stride) recovery.push([m, monthlySaving * m - upFrontCost])
  // The final point is pinned to the headline arithmetic rather than left to the
  // loop, so the end of the curve and "lifetime interest saved" cannot disagree.
  recovery.push([n, lifetimeInterestSaved - upFrontCost])

  // ── Figures ──────────────────────────────────────────────────────────────
  const stats: Quantity[] = [
    { label: 'Monthly saving', value: monthlySaving, format: { style: 'currency' } },
    { label: 'Cost of the points, paid at closing', value: upFrontCost, format: WHOLE_DOLLARS },
    { label: 'Rate you actually pay', value: rateWithPoints, format: { style: 'percent', decimals: 3 } },
    { label: 'Payment with no points', value: paymentNoPoints, format: { style: 'currency' } },
    { label: 'Payment with points', value: paymentWithPoints, format: { style: 'currency' } },
    { label: 'Lifetime interest with no points', value: interestNoPoints, format: WHOLE_DOLLARS },
    { label: 'Lifetime interest with points', value: interestWithPoints, format: WHOLE_DOLLARS },
    { label: 'Lifetime interest saved', value: lifetimeInterestSaved, format: WHOLE_DOLLARS },
    {
      label: `Net position if you leave after ${keepMonths === n ? 'the full term' : `${keepYears} years`}`,
      value: netAtKeepDate,
      format: WHOLE_DOLLARS,
    },
  ]

  // ── Notes: the verdict, spelled out for whichever case this is ───────────
  const notes: string[] = []

  if (upFrontCost === 0) {
    notes.push(
      'With no points bought there is nothing to recover: you pay the par rate and keep your cash. Drag the points up to see what a buy-down would cost and how long it would take to repay itself.',
    )
  } else if (breakEvenMonths === null) {
    notes.push(
      `These points buy no rate cut at all, so ${usd(upFrontCost)} would buy nothing. Check the rate cut per point against your own two quotes — the par rate minus the rate at one point.`,
    )
  } else if (marginMonths < 0) {
    notes.push(
      `On these numbers the points do NOT pay off. They take ${months(breakEvenMonths)} to repay ${usd(upFrontCost)}, and you expect to be gone after ${months(keepMonths)} — leaving ${usd(netAtKeepDate)} of that cheque unrecovered. A discount point buys a rate, and the rate dies with the loan.`,
    )
  } else {
    notes.push(
      `The points repay themselves after ${months(breakEvenMonths)}, and you expect to hold the loan ${months(marginMonths)} longer than that. By the time you leave you are about ${usd(netAtKeepDate)} ahead, counting both the smaller payments and the slightly smaller balance the cheaper loan leaves behind.`,
    )
  }

  if (breakEvenMonths !== null && breakEvenMonths > 0 && keepMonths < n) {
    notes.push(
      `The ${usd(lifetimeInterestSaved)} of lifetime interest saved is the figure a rate sheet advertises, and it only arrives if you keep this loan all ${Math.round(n / 12)} years. Sell or refinance earlier and you get the part you stayed for and nothing more.`,
    )
  }

  notes.push(
    'Break-even here is undiscounted: the cost is paid today while the saving arrives a month at a time, and a strict comparison would discount those future dollars. At a 4% opportunity cost a five-year break-even lands roughly half a year later. Tax is not modelled either — points on a main-home purchase are often deductible in the year paid.',
  )

  return {
    primary:
      breakEvenMonths === null
        ? { label: 'Time to break even', value: 'Never — no rate cut', format: { style: 'raw' } }
        : {
            label: 'Time to break even',
            value: breakEvenMonths,
            format: { style: 'duration', from: 'months' },
          },
    scaleValue,
    stats,
    steps: [
      { label: 'Loan amount', value: loanAmount, format: WHOLE_DOLLARS },
      { label: 'Points bought', value: points, format: { style: 'decimal', decimals: 3 } },
      { label: 'Cost = points ÷ 100 × loan', value: upFrontCost, format: WHOLE_DOLLARS },
      { rule: true },
      { label: 'Rate with no points', value: baseRate, format: { style: 'percent', decimals: 3 } },
      {
        label: 'Rate paid = par − points × cut per point',
        value: rateWithPoints,
        format: { style: 'percent', decimals: 3 },
      },
      { label: 'Payments over the term', value: n, format: { style: 'decimal', decimals: 0 } },
      {
        label: 'Payment M = P·i ÷ (1 − (1+i)⁻ⁿ), no points',
        value: paymentNoPoints,
        format: { style: 'currency' },
      },
      { label: 'Same formula at the bought-down rate', value: paymentWithPoints, format: { style: 'currency' } },
      { label: 'Monthly saving = difference', value: monthlySaving, format: { style: 'currency' } },
      { rule: true },
      {
        label: 'Break-even = cost ÷ monthly saving, rounded up',
        value: breakEvenMonths ?? 'never — the rate does not fall',
        format: breakEvenMonths === null ? { style: 'raw' } : { style: 'duration', from: 'months' },
      },
      { label: 'Months you expect to hold the loan', value: keepMonths, format: { style: 'decimal', decimals: 0 } },
      { rule: true },
      { label: 'Payments saved by the day you leave', value: savedByKeepDate, format: WHOLE_DOLLARS },
      { label: 'Less balance owed, cheaper loan pays down faster', value: equityEdge, format: WHOLE_DOLLARS },
      { label: 'Less the cost of the points', value: -upFrontCost, format: WHOLE_DOLLARS },
      { label: 'Net position when you leave', value: netAtKeepDate, format: WHOLE_DOLLARS },
    ],
    parts,
    partsTotal: {
      label: 'Total cost of the bought-down loan',
      value: totalWithPoints,
      format: WHOLE_DOLLARS,
    },
    series: [
      {
        label: 'Cumulative position vs taking the par rate',
        points: recovery,
        format: WHOLE_DOLLARS,
      },
    ],
    notes,
  }
}

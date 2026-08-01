import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

/**
 * The APR of a closed-end instalment loan, as Regulation Z (12 CFR 1026.22 and
 * appendix J) defines it: the nominal annual rate, compounded monthly, at which
 * the stream of scheduled payments discounts back to the amount the borrower
 * actually receives — the loan amount less the prepaid finance charges.
 *
 *   payment  M = P·i / (1 − (1+i)^−n)          the note rate's own amortization
 *   advanced N = P − points·P/100 − fees       what actually reaches the borrower
 *   solve    M · (1 − (1+a)^−n) / a = N        for the monthly APR rate a
 *   APR      = 12·a, expressed as a percentage
 *
 * With no points and no fees, N = P and the equation is the payment formula
 * read backwards, so a = i and the APR is exactly the quoted rate. That
 * identity is the anchor the solver is tested against.
 */

/**
 * Present value of `months` payments of `payment`, plus a balloon repayment at
 * month `months`, discounted at the monthly rate `a`.
 *
 * The annuity factor (1 − (1+a)^−m)/a is 0/0 at a = 0, where the limit is
 * simply m undiscounted payments.
 */
function presentValue(payment: number, months: number, balloon: number, a: number): number {
  const annuity = a === 0 ? payment * months : (payment * (1 - Math.pow(1 + a, -months))) / a
  return annuity + balloon / Math.pow(1 + a, months)
}

/**
 * Solves presentValue(a) = advanced for the monthly rate a, by BISECTION.
 *
 * Bisection rather than Newton: present value is continuous and strictly
 * decreasing in a over [0, ∞), so a sign change brackets exactly one root and
 * every step halves the interval — no derivative, no starting guess, and no way
 * to diverge on the near-vertical region a short term produces. About 60 halvings
 * take the bracket below the double-precision gap, so the loop exits on
 * `mid === lo` well before its iteration cap.
 *
 * The bracket starts at [0, 1] — a monthly rate of 1 is a 1200% APR — and
 * doubles the top end while the residual there is still positive, which only
 * happens when the fees are so large next to the advance that the true rate is
 * astronomical. Returns null rather than a non-converged number if it cannot
 * bracket the root or the residual does not settle; the caller turns that into
 * a CalcError.
 */
function solveMonthlyRate(
  payment: number,
  months: number,
  balloon: number,
  advanced: number,
): number | null {
  const residual = (a: number) => presentValue(payment, months, balloon, a) - advanced

  // At a = 0 the present value is the undiscounted total repaid. If that is no
  // more than the advance there is no finance charge at all and the rate is 0 —
  // an interest-free loan with no fees, which is the only way to get here.
  if (residual(0) <= 0) return 0

  let lo = 0
  let hi = 1
  for (let expand = 0; residual(hi) > 0; expand += 1) {
    if (expand >= 40) return null
    lo = hi
    hi *= 2
  }

  for (let step = 0; step < 200; step += 1) {
    const mid = lo + (hi - lo) / 2
    if (mid <= lo || mid >= hi) break
    if (residual(mid) > 0) lo = mid
    else hi = mid
  }

  const root = lo + (hi - lo) / 2
  // Convergence is asserted, never assumed: a root that does not zero the
  // equation to within a millionth of the advance is not an answer.
  if (!Number.isFinite(root) || Math.abs(residual(root)) > 1e-6 * Math.max(1, advanced)) return null
  return root
}

export default function compute(v: Values<typeof fields>): CalcResult {
  const { amount, rate, years, points, fees } = v

  // Guard finiteness first: coerceValues emits NaN for unparseable input, and
  // `amount < 0` is false for NaN, so a magnitude test alone lets it through.
  for (const [id, value] of [
    ['amount', amount],
    ['rate', rate],
    ['years', years],
    ['points', points],
    ['fees', fees],
  ] as const) {
    if (!Number.isFinite(value)) throw new CalcError('Enter a number.', id)
  }

  if (!(amount > 0)) throw new CalcError('Enter a loan amount greater than 0.', 'amount')
  if (rate < 0) throw new CalcError('The quoted rate cannot be negative.', 'rate')
  if (points < 0) throw new CalcError('Discount points cannot be negative.', 'points')
  if (fees < 0) throw new CalcError('Upfront fees cannot be negative.', 'fees')

  const n = Math.round(years * 12)
  // Two months, not one: the early-payoff curve below needs at least two
  // holding periods to be a line rather than a dot, and a single-payment loan
  // is a different instrument anyway.
  if (!(n >= 2)) throw new CalcError('The term must be at least two months.', 'years')
  const i = rate / 100 / 12

  const pointsCost = (amount * points) / 100
  const upfront = pointsCost + fees
  if (upfront >= amount)
    throw new CalcError(
      'Upfront costs must be less than the loan amount — otherwise nothing is actually advanced.',
      'fees',
    )
  const advanced = amount - upfront

  // The scheduled payment comes from the QUOTED rate. A 0% loan is the balance
  // spread evenly; the amortization formula divides by zero there.
  const payment = i === 0 ? amount / n : (amount * i) / (1 - Math.pow(1 + i, -n))

  const monthlyApr = solveMonthlyRate(payment, n, 0, advanced)
  if (monthlyApr === null)
    throw new CalcError(
      'The upfront costs are too large next to the amount advanced for an APR to be meaningful.',
      'fees',
    )
  const apr = monthlyApr * 1200
  const premium = apr - rate

  const totalPayments = payment * n
  // Derived by subtraction from the parts that are exact, and clamped: on a 0%
  // loan the closed form lands a hair either side of zero, and a negative slice
  // is not a slice.
  const interest = Math.max(0, totalPayments - amount)
  const totalCost = amount + upfront + interest

  /**
   * Remaining balance after m payments at the quoted rate:
   *   B(m) = P(1+i)^m − M((1+i)^m − 1)/i,  and P − M·m when i = 0.
   * Read from the same closed form as the headline payment, so the curve below
   * cannot drift away from the number beside it.
   */
  const balanceAfter = (m: number) => {
    const raw =
      i === 0
        ? amount - payment * m
        : amount * Math.pow(1 + i, m) - (payment * (Math.pow(1 + i, m) - 1)) / i
    return Math.min(amount, Math.max(0, raw))
  }

  /**
   * The APR you would actually have paid had you sold or refinanced after m
   * months: the same equation, with m payments and the outstanding balance as a
   * balloon. Fees spread over a short life cost far more per year, which is the
   * one thing a single headline APR hides.
   */
  const effectiveApr = (m: number) => {
    const solved = solveMonthlyRate(payment, m, balanceAfter(m), advanced)
    if (solved === null)
      throw new CalcError(
        'The upfront costs are too large next to the amount advanced for an APR to be meaningful.',
        'fees',
      )
    return solved * 1200
  }

  // Holding periods to chart. Whole years once the term is long enough to give
  // at least two of them, otherwise month by month, so a one-year loan still
  // gets a curve. The stride keeps the longest term (40 years) at 40 points.
  const months: number[] = []
  if (n > 40) {
    const stride = Math.max(1, Math.ceil(n / 12 / 40)) * 12
    for (let m = stride; m < n; m += stride) months.push(m)
  } else {
    for (let m = 1; m < n; m += 1) months.push(m)
  }
  months.push(n)

  const aprPoints: Array<readonly [number, number]> = months.map((m) => [
    m / 12,
    // Pin the last point to the headline rather than re-solving it, so the end
    // of the curve and the number above it are the same figure.
    m === n ? apr : effectiveApr(m),
  ])
  const quotedPoints: Array<readonly [number, number]> = aprPoints.map(([x]) => [x, rate])

  const notes: string[] = [
    upfront > 0
      ? `$${Math.round(upfront).toLocaleString('en-US')} of points and fees adds ${premium.toFixed(2)} percentage points to the cost of this loan, taking the ${rate}% you were quoted to an APR of ${apr.toFixed(3)}%.`
      : 'With no points and no upfront fees, the APR is simply the quoted rate.',
  ]
  if (points > 0)
    notes.push(
      'Points are only worth buying if you keep the loan long enough — the curve shows how much worse the effective APR is if you sell or refinance early.',
    )
  notes.push(
    'APR assumes you hold the loan for its full term and make every payment on schedule. Lenders may also classify fees differently, so compare quotes on the same list of charges.',
  )

  return {
    primary: {
      label: 'APR',
      value: apr,
      format: { style: 'percent', decimals: 3 },
    },
    scaleValue: premium,
    stats: [
      { label: 'Quoted rate', value: rate, format: { style: 'percent', decimals: 2 } },
      { label: 'APR premium', value: premium, format: { style: 'percent', decimals: 3 } },
      { label: 'Monthly payment', value: payment, format: { style: 'currency' } },
      { label: 'Upfront costs', value: upfront, format: { style: 'currency', decimals: 0 } },
      { label: 'Amount advanced', value: advanced, format: { style: 'currency', decimals: 0 } },
      { label: 'Total interest', value: interest, format: { style: 'currency', decimals: 0 } },
      {
        label: 'Total cost of credit',
        value: interest + upfront,
        format: { style: 'currency', decimals: 0 },
      },
    ],
    steps: [
      { label: 'Loan amount', value: amount, format: { style: 'currency', decimals: 0 } },
      { label: 'Quoted annual rate', value: rate, format: { style: 'percent', decimals: 2 } },
      { label: 'Number of payments', value: n, format: { style: 'decimal', decimals: 0 } },
      { label: 'Monthly payment at that rate', value: payment, format: { style: 'currency' } },
      { rule: true },
      { label: 'Discount points', value: pointsCost, format: { style: 'currency', decimals: 0 } },
      { label: 'Other upfront fees', value: fees, format: { style: 'currency', decimals: 0 } },
      { label: 'Total upfront costs', value: upfront, format: { style: 'currency', decimals: 0 } },
      { label: 'Amount actually advanced', value: advanced, format: { style: 'currency', decimals: 0 } },
      { rule: true },
      { label: 'Monthly APR rate', value: monthlyApr * 100, format: { style: 'percent', decimals: 4 } },
      { label: 'APR (12 × the monthly rate)', value: apr, format: { style: 'percent', decimals: 3 } },
      { label: 'Premium over the quoted rate', value: premium, format: { style: 'percent', decimals: 3 } },
    ],
    // What the loan costs you in total: the money borrowed, the fees handed
    // over at closing, and the interest. Derived so the three add up exactly to
    // the figure printed in the middle of the donut.
    parts: [
      { label: 'Principal', value: amount, format: { style: 'currency', decimals: 0 } },
      { label: 'Interest', value: interest, format: { style: 'currency', decimals: 0 } },
      { label: 'Upfront costs', value: upfront, format: { style: 'currency', decimals: 0 } },
    ],
    partsTotal: { label: 'Total cost of the loan', value: totalCost, format: { style: 'currency' } },
    series: [
      {
        label: 'Effective APR if repaid early',
        points: aprPoints,
        format: { style: 'percent', decimals: 2 },
      },
      { label: 'Quoted rate', points: quotedPoints, format: { style: 'percent', decimals: 2 } },
    ],
    chart: { title: 'Effective APR by the month you repay', xLabel: 'Months' },
    notes,
  }
}

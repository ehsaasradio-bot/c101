import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

/**
 * The constant that makes a money factor legible.
 *
 *   APR (%) = money factor x 2400        money factor = APR (%) / 2400
 *
 * It is not a convention pulled out of the air, and it is worth stating because
 * the whole point of quoting a factor instead of a rate is that nobody checks.
 * The rent charge on a lease is
 *
 *   (adjusted cap cost + residual) x MF
 *
 * and the balance falls in a straight line from the adjusted cap cost to the
 * residual, so its average over the term is (adjCap + residual) / 2. Charging
 * interest at a monthly rate `i` on that average balance gives
 * (adjCap + residual) / 2 x i. Setting the two equal gives i = 2 x MF, so the
 * annual rate is 24 x MF and the same number as a percentage is 2400 x MF.
 *
 * Anchors: 0.00125 is exactly 3% APR, and 0.00375 is exactly 9%.
 */
const MONEY_FACTOR_TO_APR = 2400

/**
 * Finiteness first, then magnitude. `coerceValues` deliberately yields NaN for
 * unparseable input, and `value < lo` is false for NaN, so a magnitude-only
 * guard lets it straight through into the arithmetic.
 */
function check(value: number, id: string, label: string, lo: number, hi: number) {
  if (!Number.isFinite(value)) throw new CalcError(`Enter a number for ${label}.`, id)
  if (value < lo) throw new CalcError(`${label} cannot be below ${lo}.`, id)
  if (value > hi) throw new CalcError(`${label} cannot be above ${hi}.`, id)
}

/**
 * A lease is not a loan, and this is the line that separates this page from
 * `auto-loan-calculator`. You are not borrowing the price of the car and paying
 * it back; you are buying the slice of the car you use up, and renting the
 * bank's money for the part you do not.
 *
 *   monthly = (adjCapCost - residual) / term      <- depreciation
 *           + (adjCapCost + residual) x MF        <- rent charge
 *
 * There is no amortization, no exponent, and no division by the rate — which is
 * why a zero money factor degrades cleanly to pure depreciation rather than
 * blowing up the way a 0% APR loan would.
 *
 * Note what the rent charge is charged on: the SUM of the two ends, not the
 * difference. That is the piece people misread. Paying a big residual down does
 * not cut the rent charge — a high residual raises it, even though it lowers the
 * depreciation, which is why a high-residual car is cheap to lease but the
 * finance charge inside the payment is larger than you would guess.
 */
export default function compute(v: Values<typeof fields>): CalcResult {
  const { capCost, msrp, downPayment, residualValue, moneyFactor } = v
  // `term` is a select, so it arrives as a string — the derived Values type
  // makes forgetting this a compile error rather than a NaN at runtime.
  const term = Number(v.term)

  check(capCost, 'capCost', 'Negotiated price', 1, 1e9)
  check(msrp, 'msrp', 'Sticker price', 1, 1e9)
  check(downPayment, 'downPayment', 'Cash down', 0, 1e9)
  check(residualValue, 'residualValue', 'Residual value', 0, 1e9)
  // A money factor is tiny by construction. 0.05 would be 120% APR; anything
  // above that is someone who typed the dealer's "125" shorthand unscaled.
  check(moneyFactor, 'moneyFactor', 'Money factor', 0, 0.05)
  if (!Number.isFinite(term) || term < 1)
    throw new CalcError('Lease term must be at least one month.', 'term')

  // A residual at or above what you are leasing is not a lease: the car would be
  // worth more when you hand it back than the amount being financed, so there is
  // nothing to depreciate. Rejected against the residual, which is the field
  // holding the implausible number.
  if (residualValue >= capCost)
    throw new CalcError(
      'The residual value must be below the negotiated price — a car worth more at the end of the lease than the start has nothing to depreciate.',
      'residualValue',
    )

  const adjCapCost = capCost - downPayment

  // Cash down comes off the cap cost, so enough of it drags the amount being
  // leased below the residual. Same impossibility as above, different culprit.
  if (adjCapCost <= residualValue)
    throw new CalcError(
      'Your cash down already covers the whole depreciation — put less down, or you are simply prepaying the car.',
      'downPayment',
    )

  // ── The payment, in its two halves ──────────────────────────────────────
  const totalDepreciation = adjCapCost - residualValue
  const monthlyDepreciation = totalDepreciation / term
  // No division by moneyFactor anywhere: MF = 0 gives a rent charge of exactly
  // 0 and a payment of pure depreciation.
  const monthlyRentCharge = (adjCapCost + residualValue) * moneyFactor
  const monthlyPayment = monthlyDepreciation + monthlyRentCharge

  const totalPayments = monthlyPayment * term
  // Derived by subtraction so the two parts sum to the total by construction
  // rather than by luck; clamped because floating point lands a zero-rent lease
  // a hair below zero on round numbers.
  const totalRentCharge = Math.max(0, totalPayments - totalDepreciation)

  const effectiveApr = moneyFactor * MONEY_FACTOR_TO_APR
  // The reverse conversion, computed rather than asserted, so the steps show the
  // round trip closing instead of just restating the input.
  const factorFromApr = effectiveApr / MONEY_FACTOR_TO_APR

  const residualShare = Math.min(100, Math.max(0, (residualValue / msrp) * 100))
  const totalOutOfPocket = totalPayments + downPayment

  // ── The two curves ──────────────────────────────────────────────────────
  // A lease depreciates in a straight line by definition — that is what the
  // residual is a statement about — so the balance falls linearly from the
  // adjusted cap cost to the residual while the money you have handed over
  // climbs linearly to the total of payments. Both come from the same figures as
  // the headline, so the chart cannot drift away from the number above it.
  const stride = Math.max(1, Math.ceil(term / 44))
  const balancePoints: Array<readonly [number, number]> = []
  const paidPoints: Array<readonly [number, number]> = []
  const push = (m: number) => {
    balancePoints.push([m, adjCapCost - monthlyDepreciation * m])
    paidPoints.push([m, monthlyPayment * m])
  }
  for (let m = 0; m < term; m += stride) push(m)
  push(term)

  const notes: string[] = []
  if (moneyFactor === 0)
    notes.push(
      'A money factor of zero is a 0% lease: there is no rent charge at all, so the payment is pure depreciation spread over the term.',
    )
  if (effectiveApr > 9)
    notes.push(
      'This money factor works out above 9% APR. Dealers routinely mark the factor up over the bank’s buy rate, and that markup is negotiable — ask for the buy rate by name.',
    )
  if (downPayment > 0)
    notes.push(
      'Cash down on a lease buys no equity. If the car is stolen or written off in month two, gap cover pays the bank and your cap cost reduction is gone with it.',
    )
  if (residualShare < 45)
    notes.push(
      'A residual under 45% of MSRP means the car is expected to lose most of its value during the lease, and you are paying for all of it.',
    )

  return {
    primary: {
      label: 'Monthly payment',
      value: monthlyPayment,
      format: { style: 'currency' },
    },
    scaleValue: residualShare,
    stats: [
      { label: 'Monthly depreciation', value: monthlyDepreciation, format: { style: 'currency' } },
      { label: 'Monthly rent charge', value: monthlyRentCharge, format: { style: 'currency' } },
      { label: 'Equivalent APR', value: effectiveApr, format: { style: 'percent', decimals: 2 } },
      { label: 'Total of payments', value: totalPayments, format: { style: 'currency', decimals: 0 } },
      { label: 'Total depreciation', value: totalDepreciation, format: { style: 'currency', decimals: 0 } },
      { label: 'Total rent charge', value: totalRentCharge, format: { style: 'currency', decimals: 0 } },
      { label: 'Residual as a share of MSRP', value: residualShare, format: { style: 'percent' } },
      { label: 'Adjusted capitalized cost', value: adjCapCost, format: { style: 'currency', decimals: 0 } },
      { label: 'Total out of pocket', value: totalOutOfPocket, format: { style: 'currency', decimals: 0 } },
      { label: 'Lease term', value: term, format: { style: 'duration', from: 'months' } },
    ],
    steps: [
      { label: 'Negotiated price (cap cost)', value: capCost, format: { style: 'currency', decimals: 0 } },
      { label: 'Less cash down', value: -downPayment, format: { style: 'currency', decimals: 0 } },
      { label: 'Adjusted capitalized cost', value: adjCapCost, format: { style: 'currency', decimals: 0 } },
      { label: 'Less residual value', value: -residualValue, format: { style: 'currency', decimals: 0 } },
      { label: 'Depreciation over the lease', value: totalDepreciation, format: { style: 'currency', decimals: 0 } },
      { label: 'Divided by the term in months', value: term, format: { style: 'decimal', decimals: 0 } },
      { label: 'Monthly depreciation', value: monthlyDepreciation, format: { style: 'currency' } },
      { rule: true },
      // The conversion, both ways, on the page rather than in a footnote. A
      // money factor is an APR wearing a disguise, and the disguise is the
      // reason it is quoted.
      { label: 'Money factor as quoted', value: moneyFactor, format: { style: 'decimal', decimals: 5 } },
      { label: 'Money factor × 2400 = APR', value: effectiveApr, format: { style: 'percent', decimals: 2 } },
      { label: 'APR ÷ 2400 = money factor', value: factorFromApr, format: { style: 'decimal', decimals: 5 } },
      { rule: true },
      { label: 'Adjusted cap cost + residual', value: adjCapCost + residualValue, format: { style: 'currency', decimals: 0 } },
      { label: '× money factor', value: moneyFactor, format: { style: 'decimal', decimals: 5 } },
      { label: 'Monthly rent charge', value: monthlyRentCharge, format: { style: 'currency' } },
      { rule: true },
      { label: 'Monthly payment before tax', value: monthlyPayment, format: { style: 'currency' } },
      { label: 'Total of payments', value: totalPayments, format: { style: 'currency', decimals: 0 } },
      {
        label: 'Rent charge as a share of the payments',
        value: (totalRentCharge / totalPayments) * 100,
        format: { style: 'percent' },
      },
    ],
    // The fixed two-part split a lease is made of. It is exactly two components
    // at every input — there is no third thing a lease payment can be — and the
    // second is derived by subtraction so the arcs cannot disagree with the
    // total printed inside them.
    parts: [
      { label: 'Depreciation', value: totalDepreciation, format: { style: 'currency', decimals: 0 } },
      { label: 'Rent charge', value: totalRentCharge, format: { style: 'currency', decimals: 0 } },
    ],
    partsTotal: { label: 'Total of payments', value: totalPayments, format: { style: 'currency' } },
    series: [
      {
        label: 'Lease balance',
        points: balancePoints,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Paid to date',
        points: paidPoints,
        format: { style: 'currency', decimals: 0 },
      },
    ],
    chart: { title: 'Lease balance over the term', xLabel: 'Months' },
    notes,
  }
}

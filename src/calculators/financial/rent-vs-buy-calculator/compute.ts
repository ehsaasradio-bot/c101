import { CalcError } from '../../../lib/types'
import type { CalcResult, Part, Quantity, Values } from '../../../lib/types'
import type { fields } from './fields'

/**
 * Selling costs: agent commission plus title, escrow and transfer fees. The
 * long-standing US convention is 5–6% of the sale price, and the higher end is
 * the honest default because it is what most sellers still pay.
 */
const SELLING_COST_RATE = 0.06
/** Buying costs: lender fees, appraisal, inspection, title and escrow, ~2–5%. */
const BUYING_COST_RATE = 0.02
/** A 30-year fixed loan, and the same 30 years as the comparison horizon. */
const LOAN_MONTHS = 360
const HORIZON_YEARS = LOAN_MONTHS / 12

/** Every input is a percentage or a price; none of them may be absurd. */
function check(value: number, id: string, label: string, lo: number, hi: number) {
  // Finiteness first: coerceValues emits NaN for unparseable input, and a
  // magnitude test like `value < lo` is false for NaN, so it would slip through.
  if (!Number.isFinite(value)) throw new CalcError(`Enter a number for ${label}.`, id)
  if (value < lo) throw new CalcError(`${label} cannot be below ${lo}.`, id)
  if (value > hi) throw new CalcError(`${label} cannot be above ${hi}.`, id)
}

/**
 * Renting versus buying, compared as two cumulative-cost curves over 30 years.
 *
 * RENTING costs the rent, and nothing else. Rent steps up once a year, the way
 * a lease renewal actually works.
 *
 * BUYING costs the upfront cash, every mortgage payment and every ownership
 * cost, plus the investment return that upfront cash did not earn, minus what
 * you walk away with if you sell on that date — sale price less selling costs
 * less the outstanding loan.
 *
 * Those two definitions rearrange into an exact identity that is worth stating,
 * because it is the whole argument for buying in one line:
 *
 *   cost of buying = interest + ownership costs + opportunity cost
 *                  + buying and selling costs − appreciation
 *
 * The principal drops out entirely: you get it back as equity. Only the four
 * positive terms are money that owning genuinely consumes, which is what the
 * donut splits. `compute.test.ts` checks the simulation against this identity
 * at every month, so a mistake in one has to be a matching mistake in the other.
 *
 * The break-even is the first month at which the buying curve falls to or below
 * the renting curve, interpolated between that month and the one before it. It
 * may not happen at all within 30 years, and when it does not this says so
 * rather than reporting the horizon as if it were an answer.
 */
export default function compute(v: Values<typeof fields>): CalcResult {
  const {
    homePrice,
    monthlyRent,
    downPayment,
    mortgageRate,
    rentIncrease,
    homeAppreciation,
    annualCosts,
    investmentReturn,
  } = v

  check(homePrice, 'homePrice', 'Home price', 1, 1e12)
  check(monthlyRent, 'monthlyRent', 'Rent', 1, 1e9)
  check(downPayment, 'downPayment', 'Down payment', 0, 100)
  check(mortgageRate, 'mortgageRate', 'Mortgage rate', 0, 100)
  check(rentIncrease, 'rentIncrease', 'Rent increase', 0, 100)
  // Below −100%/yr the home is worth less than nothing, which is not a house.
  check(homeAppreciation, 'homeAppreciation', 'Home appreciation', -99, 100)
  check(annualCosts, 'annualCosts', 'Ownership costs', 0, 100)
  check(investmentReturn, 'investmentReturn', 'Investment return', 0, 100)

  const deposit = homePrice * (downPayment / 100)
  const loan = homePrice - deposit
  const upfront = deposit + BUYING_COST_RATE * homePrice

  const monthlyRate = mortgageRate / 100 / 12
  const growth = 1 + homeAppreciation / 100
  const rentGrowth = 1 + rentIncrease / 100
  const investGrowth = 1 + investmentReturn / 100
  const costRate = annualCosts / 100

  // Standard fixed-rate amortization. A 0% loan is just the principal spread
  // evenly; the closed form divides by zero there. A 100% down payment leaves
  // nothing to finance, and the formula would return 0/0.
  const payment =
    loan === 0
      ? 0
      : monthlyRate === 0
        ? loan / LOAN_MONTHS
        : (loan * monthlyRate * Math.pow(1 + monthlyRate, LOAN_MONTHS)) /
          (Math.pow(1 + monthlyRate, LOAN_MONTHS) - 1)

  // B(m) = L(1+r)^m − PMT((1+r)^m − 1)/r, and L − PMT·m when r = 0.
  const balanceAfter = (m: number) => {
    const raw =
      monthlyRate === 0
        ? loan - payment * m
        : loan * Math.pow(1 + monthlyRate, m) -
          (payment * (Math.pow(1 + monthlyRate, m) - 1)) / monthlyRate
    return Math.min(loan, Math.max(0, raw))
  }

  const valueAt = (m: number) => homePrice * Math.pow(growth, m / 12)

  // One walk down the months produces both curves, so the chart, the break-even
  // and the totals can never come from different arithmetic.
  const rentCurve: number[] = []
  const buyCurve: number[] = []
  let cumulativeRent = 0
  let cumulativeOwnership = 0
  let cumulativePayments = 0

  for (let m = 0; m <= LOAN_MONTHS; m += 1) {
    if (m > 0) {
      // Rent and the tax/insurance/upkeep bill are both set once a year, off the
      // value at the start of that year — a lease renewal and a tax assessment.
      const year = Math.floor((m - 1) / 12)
      cumulativeRent += monthlyRent * Math.pow(rentGrowth, year)
      cumulativeOwnership += (costRate * homePrice * Math.pow(growth, year)) / 12
      cumulativePayments += payment
    }
    const equityOnSale = valueAt(m) * (1 - SELLING_COST_RATE) - balanceAfter(m)
    const opportunityCost = upfront * (Math.pow(investGrowth, m / 12) - 1)

    rentCurve.push(cumulativeRent)
    buyCurve.push(
      upfront + cumulativePayments + cumulativeOwnership + opportunityCost - equityOnSale,
    )
  }

  // At month 0 buying is behind by exactly the buying and selling costs, which
  // are always positive, so the first crossing is always a real sign change.
  let breakEvenYears: number | null = null
  for (let m = 1; m <= LOAN_MONTHS; m += 1) {
    const before = buyCurve[m - 1]! - rentCurve[m - 1]!
    const now = buyCurve[m]! - rentCurve[m]!
    if (now <= 0) {
      breakEvenYears = (m - 1 + before / (before - now)) / 12
      break
    }
  }

  const finalValue = valueAt(LOAN_MONTHS)
  const totalRent = rentCurve[LOAN_MONTHS]!
  const totalBuy = buyCurve[LOAN_MONTHS]!

  // The four terms of the identity above. Each is clamped at zero because each
  // is non-negative by construction and floating point lands the degenerate
  // cases — a 0% rate, a 100% deposit — a hair either side of it.
  const interestPaid = Math.max(0, cumulativePayments - (loan - balanceAfter(LOAN_MONTHS)))
  const ownershipCosts = Math.max(0, cumulativeOwnership)
  const opportunityCost = Math.max(0, upfront * (Math.pow(investGrowth, HORIZON_YEARS) - 1))
  const transactionCosts = Math.max(
    0,
    BUYING_COST_RATE * homePrice + SELLING_COST_RATE * finalValue,
  )
  const appreciation = finalValue - homePrice

  const money = { style: 'currency', decimals: 0 } as const
  // Zero-valued slices are dropped rather than drawn invisibly; dropping an
  // exact zero leaves the sum untouched, so the four still add up.
  const parts: Part[] = [
    { label: 'Mortgage interest', value: interestPaid, format: money },
    { label: 'Tax, insurance & upkeep', value: ownershipCosts, format: money },
    { label: 'Opportunity cost of your cash', value: opportunityCost, format: money },
    { label: 'Buying & selling costs', value: transactionCosts, format: money },
  ].filter((p) => p.value > 0)
  // Summed from the surviving slices, so the donut's centre is their total by
  // construction rather than by a second calculation that could disagree.
  const owningCost = parts.reduce((sum, p) => sum + p.value, 0)

  const yearlyPoints = (curve: number[]): Array<readonly [number, number]> =>
    Array.from({ length: HORIZON_YEARS + 1 }, (_, t) => [t, curve[t * 12]!] as const)

  const primary: Quantity =
    breakEvenYears === null
      ? {
          label: 'Years until buying costs less',
          value: `Not within ${HORIZON_YEARS} years`,
          format: { style: 'raw' },
        }
      : {
          label: 'Years until buying costs less',
          value: breakEvenYears,
          format: { style: 'decimal', decimals: 1, unit: 'years' },
        }

  const notes = [
    'Break-even is the point where the running cost of owning — after selling the home, paying the agent and clearing the mortgage — first falls below the running cost of renting.',
    'Your down payment and closing costs are charged an opportunity cost at the return you set, because money in a house is money not in the market.',
    'Fixed assumptions: a 30-year fixed mortgage held to the end, 2% of the price in closing costs to buy, and 6% of the sale price to sell.',
    'Not modelled: mortgage interest and property-tax deductions, PMI on a deposit under 20%, HOA or condo fees, moving costs, rent deposits, inflation, or investing the month-to-month difference between rent and the cost of owning.',
  ]
  if (breakEvenYears === null) {
    notes.unshift(
      `On these assumptions buying never costs less than renting within ${HORIZON_YEARS} years — renting is the cheaper path over this whole horizon.`,
    )
  }

  return {
    primary,
    // No break-even inside the horizon sits at the far end of the scale, which
    // is the honest position for it: the last band is "renting stays cheaper".
    scaleValue: breakEvenYears ?? HORIZON_YEARS,
    stats: [
      { label: 'Monthly mortgage payment', value: payment, format: { style: 'currency' } },
      {
        label: 'Year-1 monthly cost of owning',
        value: payment + (costRate * homePrice) / 12,
        format: { style: 'currency' },
      },
      { label: 'Upfront cash to buy', value: upfront, format: money },
      { label: `Cost of renting for ${HORIZON_YEARS} years`, value: totalRent, format: money },
      { label: `Cost of buying for ${HORIZON_YEARS} years`, value: totalBuy, format: money },
      {
        label: `Buying saves you over ${HORIZON_YEARS} years`,
        value: totalRent - totalBuy,
        format: money,
      },
    ],
    steps: [
      { label: 'Home price', value: homePrice, format: money },
      { label: 'Down payment', value: deposit, format: money },
      { label: 'Closing costs to buy', value: BUYING_COST_RATE * homePrice, format: money },
      { label: 'Upfront cash', value: upfront, format: money },
      { label: 'Amount borrowed', value: loan, format: money },
      { rule: true },
      { label: 'Monthly mortgage payment', value: payment, format: { style: 'currency' } },
      { label: 'Year-1 tax, insurance & upkeep', value: costRate * homePrice, format: money },
      { label: 'Year-1 rent', value: monthlyRent * 12, format: money },
      { rule: true },
      { label: `Mortgage interest over ${HORIZON_YEARS} years`, value: interestPaid, format: money },
      { label: 'Tax, insurance & upkeep', value: ownershipCosts, format: money },
      { label: 'Opportunity cost of your cash', value: opportunityCost, format: money },
      { label: 'Buying & selling costs', value: transactionCosts, format: money },
      { label: `Home value in ${HORIZON_YEARS} years`, value: finalValue, format: money },
      { label: 'Less appreciation', value: -appreciation, format: money },
      { rule: true },
      { label: 'Total cost of buying', value: totalBuy, format: money },
      { label: 'Total cost of renting', value: totalRent, format: money },
    ],
    parts,
    partsTotal: {
      label: `What owning consumes over ${HORIZON_YEARS} years`,
      value: owningCost,
      format: money,
    },
    // Always exactly two lines, always 31 points each: the chart is the whole
    // point of the comparison and must never be missing at the defaults.
    series: [
      { label: 'Cumulative cost of renting', points: yearlyPoints(rentCurve), format: money },
      { label: 'Cumulative cost of buying', points: yearlyPoints(buyCurve), format: money },
    ],
    notes,
  }
}

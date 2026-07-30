import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

/**
 * Private mortgage insurance is conventionally quoted as an annual percentage of
 * the loan balance while equity is under 20%. 0.8%/yr sits mid-range for the
 * 0.46%-1.5% band lenders actually charge, and is the same figure the mortgage
 * calculator here uses, so the two pages agree.
 */
const PMI_ANNUAL_RATE = 0.008

/** Below this much equity, lenders add PMI. 20% down is the textbook threshold. */
const PMI_EQUITY_THRESHOLD = 20

/**
 * Months of saving to plot. Long enough for a realistic haul, short enough that
 * an extreme slider position does not produce a 3,000-year chart.
 */
const MAX_CHART_MONTHS = 600

export default function compute(v: Values<typeof fields>): CalcResult {
  const {
    homePrice,
    downPercent,
    closingCostPercent,
    movingCosts,
    cashOnHand,
    monthlySaving,
    rate,
  } = v
  // `years` is a select, so it arrives as a string — the derived Values type
  // makes forgetting this a compile error rather than a NaN at runtime.
  const years = Number(v.years)

  // Finiteness first: coerceValues emits NaN for unparseable input, and a
  // magnitude test like `x < 0` is false for NaN, so it would slip straight past.
  if (!Number.isFinite(homePrice) || !(homePrice > 0))
    throw new CalcError('Enter a home price greater than 0.', 'homePrice')
  if (!Number.isFinite(downPercent) || downPercent < 0 || downPercent > 100)
    throw new CalcError('Down payment must be between 0% and 100% of the price.', 'downPercent')
  if (!Number.isFinite(closingCostPercent) || closingCostPercent < 0)
    throw new CalcError('Closing costs cannot be negative.', 'closingCostPercent')
  if (!Number.isFinite(movingCosts) || movingCosts < 0)
    throw new CalcError('Moving and setup costs cannot be negative.', 'movingCosts')
  if (!Number.isFinite(cashOnHand) || cashOnHand < 0)
    throw new CalcError('Cash saved so far cannot be negative.', 'cashOnHand')
  if (!Number.isFinite(monthlySaving) || !(monthlySaving > 0))
    throw new CalcError('Enter a monthly saving amount greater than 0.', 'monthlySaving')
  if (!Number.isFinite(rate) || rate < 0)
    throw new CalcError('Interest rate cannot be negative.', 'rate')
  if (!Number.isFinite(years) || !(years > 0))
    throw new CalcError('Loan term must be at least 1 year.', 'years')

  // ── The cash ─────────────────────────────────────────────────────────────
  const downPayment = (homePrice * downPercent) / 100
  const closingCosts = (homePrice * closingCostPercent) / 100
  const cashNeeded = downPayment + closingCosts + movingCosts

  const shortfall = Math.max(0, cashNeeded - cashOnHand)
  // Savings land in whole months, so the answer is the ceiling. `monthlySaving`
  // is guarded strictly positive above, so this cannot divide by zero.
  const monthsToSave = Math.ceil(shortfall / monthlySaving)
  const coverage = cashNeeded > 0 ? Math.min(100, (cashOnHand / cashNeeded) * 100) : 100

  // ── What that does to the loan ───────────────────────────────────────────
  const loanAmount = homePrice - downPayment
  const ltv = (loanAmount / homePrice) * 100
  const monthlyRate = rate / 100 / 12
  const payments = Math.round(years * 12)

  // Standard amortization: PMT = P·i(1+i)^n / ((1+i)^n − 1). A 0% loan is just
  // the principal spread evenly, where the closed form divides by zero.
  const principalAndInterest =
    monthlyRate === 0
      ? loanAmount / payments
      : (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, payments)) /
        (Math.pow(1 + monthlyRate, payments) - 1)

  const pmiApplies = downPercent < PMI_EQUITY_THRESHOLD
  const monthlyPmi = pmiApplies ? (loanAmount * PMI_ANNUAL_RATE) / 12 : 0
  const monthlyPayment = principalAndInterest + monthlyPmi
  const totalInterest = principalAndInterest * payments - loanAmount

  // The extra cash it would take to reach 20% down and shed PMI entirely.
  const cashToAvoidPmi = Math.max(0, ((PMI_EQUITY_THRESHOLD - downPercent) * homePrice) / 100)

  // ── Chart: the saving run, against the target that ends it ───────────────
  // A fixed pair of lines rather than a conditional one, so the chart is drawn
  // at the defaults and at every slider position. The server renders the figure
  // from the DEFAULT result, and no client redraw can conjure back a container
  // that was never there.
  const horizon = Math.min(MAX_CHART_MONTHS, Math.max(12, monthsToSave))
  const stride = Math.max(1, Math.ceil(horizon / 40))
  const months: number[] = []
  for (let m = 0; m <= horizon; m += stride) months.push(m)
  if (months[months.length - 1] !== horizon) months.push(horizon)

  const savedPoints = months.map((m) => [m, cashOnHand + m * monthlySaving] as const)
  const targetPoints = months.map((m) => [m, cashNeeded] as const)

  const notes: string[] = [
    'Closing costs are estimated as a share of the price. Lender fees, title insurance, transfer taxes and prepaid escrow vary by state; 2% to 5% is the usual band.',
  ]
  notes.push(
    pmiApplies
      ? 'Below 20% down you also pay private mortgage insurance, estimated here at 0.8%/yr of the loan. It normally comes off once you reach 20% equity.'
      : 'At 20% or more down there is no private mortgage insurance to pay.',
  )
  if (shortfall === 0)
    notes.push('Your savings already cover the full amount, so there is nothing left to save.')
  notes.push(
    'The monthly figure is principal, interest and PMI only. Property tax, homeowners insurance and HOA dues sit on top of it.',
  )

  return {
    primary: {
      label: 'Cash needed up front',
      value: cashNeeded,
      format: { style: 'currency', decimals: 0 },
    },
    scaleValue: downPercent,
    stats: [
      { label: 'Down payment', value: downPayment, format: { style: 'currency', decimals: 0 } },
      { label: 'Cash still to save', value: shortfall, format: { style: 'currency', decimals: 0 } },
      {
        label: 'Time to save it',
        value: monthsToSave,
        format: { style: 'duration', from: 'months' },
      },
      { label: 'Loan amount', value: loanAmount, format: { style: 'currency', decimals: 0 } },
      {
        label: 'Monthly payment (P&I + PMI)',
        value: monthlyPayment,
        format: { style: 'currency' },
      },
      { label: 'Monthly PMI', value: monthlyPmi, format: { style: 'currency' } },
    ],
    steps: [
      { label: 'Home price', value: homePrice, format: { style: 'currency', decimals: 0 } },
      { label: 'Down payment share', value: downPercent, format: { style: 'percent', decimals: 2 } },
      { label: 'Down payment', value: downPayment, format: { style: 'currency', decimals: 0 } },
      { rule: true },
      { label: 'Closing costs', value: closingCosts, format: { style: 'currency', decimals: 0 } },
      {
        label: 'Moving & setup costs',
        value: movingCosts,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Cash needed up front',
        value: cashNeeded,
        format: { style: 'currency', decimals: 0 },
      },
      { rule: true },
      { label: 'Cash saved so far', value: cashOnHand, format: { style: 'currency', decimals: 0 } },
      { label: 'Share of the cash already saved', value: coverage, format: { style: 'percent' } },
      { label: 'Cash still to save', value: shortfall, format: { style: 'currency', decimals: 0 } },
      { label: 'Saving per month', value: monthlySaving, format: { style: 'currency', decimals: 0 } },
      { label: 'Months of saving', value: monthsToSave, format: { style: 'decimal', decimals: 0 } },
      { rule: true },
      { label: 'Amount borrowed', value: loanAmount, format: { style: 'currency', decimals: 0 } },
      { label: 'Loan-to-value', value: ltv, format: { style: 'percent' } },
      { label: 'Monthly rate', value: rate / 12, format: { style: 'percent', decimals: 4 } },
      { label: 'Number of payments', value: payments, format: { style: 'decimal', decimals: 0 } },
      { label: 'Principal & interest', value: principalAndInterest, format: { style: 'currency' } },
      { label: 'PMI', value: monthlyPmi, format: { style: 'currency' } },
      { label: 'Total monthly payment', value: monthlyPayment, format: { style: 'currency' } },
      { rule: true },
      {
        label: 'Total interest over the term',
        value: totalInterest,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Extra down payment to reach 20%',
        value: cashToAvoidPmi,
        format: { style: 'currency', decimals: 0 },
      },
    ],
    // A fixed three-way split of the cash needed, so the donut is drawn at every
    // input rather than appearing only below some threshold. The last slice is
    // the remainder rather than `movingCosts` itself, so the three sum to the
    // headline exactly by construction; the clamp catches the floating-point
    // hair below zero that round numbers can produce.
    parts: [
      { label: 'Down payment', value: downPayment, format: { style: 'currency', decimals: 0 } },
      { label: 'Closing costs', value: closingCosts, format: { style: 'currency', decimals: 0 } },
      {
        label: 'Moving & setup',
        value: Math.max(0, cashNeeded - downPayment - closingCosts),
        format: { style: 'currency', decimals: 0 },
      },
    ],
    series: [
      { label: 'Savings balance', points: savedPoints, format: { style: 'currency', decimals: 0 } },
      { label: 'Cash needed', points: targetPoints, format: { style: 'currency', decimals: 0 } },
    ],
    notes,
  }
}

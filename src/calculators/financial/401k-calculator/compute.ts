import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

/**
 * IRS elective deferral limit for the **2026 tax year**: $24,500.
 *
 * Source: IRS Notice 2025-67, announced as "401(k) limit increases to $24,500
 * for 2026" (irs.gov). The same notice sets the age-50 catch-up at $8,000 and
 * the age 60-63 catch-up at $11,250 for 2026; neither is modelled here, they
 * are quoted in the FAQ and carry the same tax year.
 *
 * REVIEW EVERY AUTUMN. The IRS re-indexes this each November, and the year
 * named in `index.ts` — the intro, the FAQ and the note below — must move with
 * this constant or the page starts quoting a stale figure as current.
 */
const DEFERRAL_LIMIT = 24_500
const DEFERRAL_LIMIT_TAX_YEAR = 2026
/**
 * Written out rather than produced by `toLocaleString`, because compute runs
 * once in Node at build time and again in the browser, and the two must emit
 * byte-identical text. Keep it in step with the constant above.
 */
const DEFERRAL_LIMIT_TEXT = '24,500'

/**
 * Future value of a growing annuity: t end-of-year payments, the first equal to
 * 1, each later one (1 + g) times the one before, everything earning r.
 *
 *   FV = ((1 + r)^t - (1 + g)^t) / (r - g)
 *
 * At r = g the closed form is 0/0; its limit there is t(1 + r)^(t-1), which is
 * simply every payment ending up the same size once growth and return cancel.
 * The two branches are compared against each other in `compute.test.ts`.
 */
function growingAnnuityFactor(r: number, g: number, t: number): number {
  if (t <= 0) return 0
  // Number.EPSILON is the gap at 1.0, which is far too tight a tolerance for
  // rates near 0.07; 1e-12 is a deliberate, absolute "these rates are equal".
  if (Math.abs(r - g) < 1e-12) return t * Math.pow(1 + r, t - 1)
  return (Math.pow(1 + r, t) - Math.pow(1 + g, t)) / (r - g)
}

/** Sum of (1 + g)^0 .. (1 + g)^(t-1) — the nominal dollars paid in, ungrown. */
function growthSum(g: number, t: number): number {
  if (t <= 0) return 0
  if (g === 0) return t
  return (Math.pow(1 + g, t) - 1) / g
}

export default function compute(v: Values<typeof fields>): CalcResult {
  const {
    currentAge,
    retirementAge,
    currentBalance,
    annualSalary,
    contributionPercent,
    employerMatchRate,
    employerMatchCap,
    annualReturn,
    salaryGrowth,
  } = v

  // Finiteness first, every time. `coerceValues` deliberately emits NaN for an
  // unparseable entry, and a bare magnitude test such as `x < 0` is false for
  // NaN, so it would slip straight through into the arithmetic.
  if (!Number.isFinite(currentAge) || !(currentAge > 0))
    throw new CalcError('Enter an age greater than 0.', 'currentAge')
  if (!Number.isFinite(retirementAge) || !(retirementAge > currentAge))
    throw new CalcError('Retirement age must be greater than your current age.', 'retirementAge')
  if (!Number.isFinite(currentBalance) || currentBalance < 0)
    throw new CalcError('Current balance cannot be negative.', 'currentBalance')
  if (!Number.isFinite(annualSalary) || !(annualSalary > 0))
    throw new CalcError('Enter an annual salary greater than 0.', 'annualSalary')
  if (!Number.isFinite(contributionPercent) || contributionPercent < 0)
    throw new CalcError('Your contribution cannot be negative.', 'contributionPercent')
  if (contributionPercent > 100)
    throw new CalcError('You cannot defer more than 100% of your pay.', 'contributionPercent')
  if (!Number.isFinite(employerMatchRate) || employerMatchRate < 0)
    throw new CalcError('Match rate cannot be negative.', 'employerMatchRate')
  if (!Number.isFinite(employerMatchCap) || employerMatchCap < 0)
    throw new CalcError('Match cap cannot be negative.', 'employerMatchCap')
  if (employerMatchCap > 100)
    throw new CalcError('A match cap above 100% of pay is not possible.', 'employerMatchCap')
  if (!Number.isFinite(annualReturn) || annualReturn < 0)
    throw new CalcError('Expected return cannot be negative.', 'annualReturn')
  if (!Number.isFinite(salaryGrowth) || salaryGrowth < 0)
    throw new CalcError('Annual pay rise cannot be negative.', 'salaryGrowth')

  const years = retirementAge - currentAge
  const months = Math.round(years * 12)
  const r = annualReturn / 100
  const g = salaryGrowth / 100

  // The elective deferral limit expressed as a share of THIS year's pay. A
  // $750,000 earner hits $24,500 at 3.27% of pay, so the deferral percentage the
  // plan can actually accept is capped there however high the slider is set.
  //
  // Both pay and the limit are then held at that share for the whole horizon:
  // the IRS indexes the limit to inflation and pay tends to rise with it too, so
  // a percentage that is legal today stays roughly legal later. Modelling pay
  // growth without limit growth would wrongly push everyone into the cap.
  const limitPercent = (DEFERRAL_LIMIT / annualSalary) * 100
  const cappedByLimit = contributionPercent > limitPercent
  const effectivePercent = Math.min(contributionPercent, limitPercent)

  // Year-one dollars. The employer matches the pay you actually deferred, so
  // the limit binds the match too.
  const employeeFirstYear = (annualSalary * effectivePercent) / 100
  const matchedPercent = Math.min(effectivePercent, employerMatchCap)
  const employerFirstYear = (annualSalary * matchedPercent * employerMatchRate) / 10_000

  // THE POINT OF THIS PAGE. The match you would collect if you contributed right
  // up to the cap — and the gap between that and what you are collecting now.
  const fullMatchPercent = Math.min(employerMatchCap, limitPercent)
  const fullEmployerFirstYear = (annualSalary * fullMatchPercent * employerMatchRate) / 10_000
  const missedFirstYear = Math.max(0, fullEmployerFirstYear - employerFirstYear)
  const shortfallPercent = Math.max(0, fullMatchPercent - effectivePercent)
  // What catching the whole match would cost you out of pocket, before tax
  // relief — the number that makes the trade obvious.
  const extraMonthlyCost = (annualSalary * shortfallPercent) / 100 / 12
  const matchCaptured =
    fullEmployerFirstYear <= 0 ? 100 : (employerFirstYear / fullEmployerFirstYear) * 100

  const annuityFactor = growingAnnuityFactor(r, g, years)
  const compounding = Math.pow(1 + r, years)

  const fvBalance = currentBalance * compounding
  const fvEmployee = employeeFirstYear * annuityFactor
  const fvEmployer = employerFirstYear * annuityFactor
  const finalBalance = fvBalance + fvEmployee + fvEmployer

  // The compounded cost of stopping short of the cap: the same growing annuity
  // applied to the match you never collect.
  const missedAtRetirement = missedFirstYear * annuityFactor

  // What is left if the employer contributes nothing — the second chart line, so
  // the gap between the curves is the match, drawn rather than asserted.
  const withoutMatch = fvBalance + fvEmployee

  // Nominal dollars paid in, ungrown, for the donut.
  const paidInFactor = growthSum(g, years)
  const totalEmployee = employeeFirstYear * paidInFactor
  const totalEmployer = employerFirstYear * paidInFactor

  // Growth by subtraction, so the four slices sum to the balance by
  // construction. Clamped because floating point lands it a hair below zero on
  // round inputs (a zero-return, zero-contribution case).
  const investmentGrowth = Math.max(
    0,
    finalBalance - currentBalance - totalEmployee - totalEmployer,
  )

  // Both curves come from the same closed forms as the headline, so the chart
  // and the number cannot drift apart. Thinned to about 30 points at the longest
  // horizon a visitor can select (18 to 75).
  const stride = Math.max(1, Math.ceil(years / 40))
  const balancePoints: Array<readonly [number, number]> = []
  const withoutMatchPoints: Array<readonly [number, number]> = []
  for (let t = 0; t < years; t += stride) {
    const grown = currentBalance * Math.pow(1 + r, t)
    const factor = growingAnnuityFactor(r, g, t)
    balancePoints.push([currentAge + t, grown + (employeeFirstYear + employerFirstYear) * factor])
    withoutMatchPoints.push([currentAge + t, grown + employeeFirstYear * factor])
  }
  // Pin the last point to the headline rather than letting the loop land near it.
  balancePoints.push([retirementAge, finalBalance])
  withoutMatchPoints.push([retirementAge, withoutMatch])

  const notes: string[] = [
    `Contributions are capped at the IRS elective deferral limit of $${DEFERRAL_LIMIT_TEXT} for the ${DEFERRAL_LIMIT_TAX_YEAR} tax year (IRS Notice 2025-67). Pay and that limit are both assumed to rise together, so the share of pay you defer stays legal for the whole projection.`,
    'Deposits are treated as arriving at the end of each year, so the final year of contributions earns no return. Real payroll deferrals land monthly and would finish a little higher.',
    'Figures are in future dollars with no inflation adjustment, and no tax is deducted. Withdrawals from a traditional 401(k) are taxed as ordinary income.',
  ]
  if (cappedByLimit)
    notes.push(
      `At this salary the deferral limit is reached at ${effectivePercent.toFixed(2)}% of pay, so the contribution above that is ignored — and so is any match it would have earned.`,
    )
  if (missedFirstYear > 0)
    notes.push(
      'Employer contributions are commonly subject to a vesting schedule. Money matched but not yet vested is forfeited if you leave early, which is worth checking before you count it.',
    )

  return {
    primary: {
      label: 'Projected 401(k) balance at retirement',
      value: finalBalance,
      format: { style: 'currency', decimals: 0 },
    },
    scaleValue: Math.max(0, Math.min(100, matchCaptured)),
    stats: [
      {
        label: 'Employer match left on the table',
        value: missedAtRetirement,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Match forgone each year',
        value: missedFirstYear,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Extra per month to capture it all',
        value: extraMonthlyCost,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Share of the match captured',
        value: matchCaptured,
        format: { style: 'percent', decimals: 1 },
      },
      {
        label: 'Employer match collected',
        value: totalEmployer,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Your total contributions',
        value: totalEmployee,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Investment growth',
        value: investmentGrowth,
        format: { style: 'currency', decimals: 0 },
      },
      { label: 'Years of contributions', value: months, format: { style: 'duration', from: 'months' } },
    ],
    steps: [
      { label: 'Annual salary', value: annualSalary, format: { style: 'currency', decimals: 0 } },
      {
        label: 'You defer',
        value: effectivePercent,
        format: { style: 'percent', decimals: 2 },
      },
      {
        label: 'Employer matches, up to a cap of',
        value: employerMatchCap,
        format: { style: 'percent', decimals: 2 },
      },
      { label: 'at a rate of', value: employerMatchRate, format: { style: 'percent', decimals: 0 } },
      { rule: true },
      {
        label: 'Your contribution, year one',
        value: employeeFirstYear,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Employer match, year one',
        value: employerFirstYear,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Employer match available, year one',
        value: fullEmployerFirstYear,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Match you forgo, year one',
        value: missedFirstYear,
        format: { style: 'currency', decimals: 0 },
      },
      { rule: true },
      { label: 'Years of growth', value: years, format: { style: 'decimal', decimals: 0 } },
      {
        label: 'Growing-annuity factor',
        value: annuityFactor,
        format: { style: 'decimal', decimals: 4 },
      },
      {
        label: 'Existing balance grown',
        value: fvBalance,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Your contributions grown',
        value: fvEmployee,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Employer match grown',
        value: fvEmployer,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Balance at retirement',
        value: finalBalance,
        format: { style: 'currency', decimals: 0 },
      },
    ],
    // A fixed four-way split of the balance, never filtered: a slice that
    // disappears at one input and returns at another makes the donut jump, and
    // the starting balance has to be here or the four cannot sum to the whole.
    parts: [
      {
        label: 'Starting balance',
        value: currentBalance,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Your contributions',
        value: totalEmployee,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Employer match',
        value: totalEmployer,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Investment growth',
        value: investmentGrowth,
        format: { style: 'currency', decimals: 0 },
      },
    ],
    series: [
      {
        label: 'Projected balance',
        points: balancePoints,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Without the employer match',
        points: withoutMatchPoints,
        format: { style: 'currency', decimals: 0 },
      },
    ],
    chart: { title: 'Projected balance by age', xLabel: 'Age' },
    notes,
  }
}

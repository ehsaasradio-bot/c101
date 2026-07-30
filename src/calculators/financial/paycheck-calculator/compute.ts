import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

/*
 * United States federal take-home pay, TAX YEAR 2026.
 *
 * EVERY NUMBER BELOW IS DATED. They are re-set by statute or by inflation
 * indexing each year, so treat this whole block as expiring on 31 December 2026
 * and re-check each figure against the cited source before reusing it.
 *
 * Sources:
 *   - Brackets and standard deductions: IRS Rev. Proc. 2025-32 (tax year 2026),
 *     as tabulated by the Tax Foundation, "2026 Tax Brackets and Federal Income
 *     Tax Rates", and IR-2025-103.
 *   - Social Security wage base $184,500: SSA announcement of 24 October 2025
 *     (up from $176,100 in 2025). At 6.2% that caps the employee's Social
 *     Security tax at $11,439 for the year — a published figure, which the
 *     tests anchor on.
 *   - Medicare 1.45% with no wage cap, plus the Additional Medicare Tax of 0.9%
 *     on wages above $200,000 (single and head of household), $250,000 (married
 *     filing jointly), $125,000 (married filing separately). Those thresholds
 *     come from IRC 3101(b)(2), added by the Affordable Care Act in 2013, and
 *     are NOT indexed — they have not moved since.
 *   - 401(k) elective deferral limit $24,500: IRS Notice 2025-67 / IR-2025-113.
 *
 * WHAT THIS DELIBERATELY DOES NOT MODEL: state income tax, county or city
 * income tax, state disability or paid-family-leave levies, itemised
 * deductions, tax credits, dependants, other household income, and the
 * employer's matching half of FICA. The first of those is the big one, and the
 * copy says so in the intro, the notes and an FAQ.
 */
const TAX_YEAR = 2026

/** SSA, effective 1 January 2026. Wages above this pay no more Social Security. */
const SOCIAL_SECURITY_WAGE_BASE = 184_500
const SOCIAL_SECURITY_RATE = 0.062
const MEDICARE_RATE = 0.0145
const ADDITIONAL_MEDICARE_RATE = 0.009
/** IRS Notice 2025-67: elective deferrals to a 401(k), under age 50. */
const ELECTIVE_DEFERRAL_LIMIT = 24_500

/**
 * IRC 3101(b)(2). Statutory, unindexed since 2013.
 *
 * The spelled-out form sits beside the number rather than being produced by
 * `toLocaleString`: compute runs once in Node at build time and again in the
 * browser, and the two must emit byte-identical note text.
 */
const ADDITIONAL_MEDICARE_THRESHOLD = {
  single: { amount: 200_000, text: '$200,000' },
  married: { amount: 250_000, text: '$250,000' },
  head: { amount: 200_000, text: '$200,000' },
} as const

/** Rev. Proc. 2025-32, tax year 2026. */
const STANDARD_DEDUCTION = {
  single: 16_100,
  married: 32_200,
  head: 24_150,
} as const

/**
 * Marginal brackets for tax year 2026, as `[top of band, rate]` on TAXABLE
 * income. The last band is open-ended.
 */
const BRACKETS = {
  single: [
    [12_400, 0.1],
    [50_400, 0.12],
    [105_700, 0.22],
    [201_775, 0.24],
    [256_225, 0.32],
    [640_600, 0.35],
    [Infinity, 0.37],
  ],
  married: [
    [24_800, 0.1],
    [100_800, 0.12],
    [211_400, 0.22],
    [403_550, 0.24],
    [512_450, 0.32],
    [768_700, 0.35],
    [Infinity, 0.37],
  ],
  head: [
    [17_700, 0.1],
    [67_450, 0.12],
    [105_700, 0.22],
    // $201,750, NOT the single filer's $201,775. Rev. Proc. 2025-32 Table 2
    // ends the head-of-household 24% band $25 below Table 3's, the same way its
    // 32% band ends at $256,200 against $256,225. Tax Foundation publishes
    // $201,775 here and is wrong; this is read off the IRS table itself.
    [201_750, 0.24],
    [256_200, 0.32],
    [640_600, 0.35],
    [Infinity, 0.37],
  ],
} as const satisfies Record<string, ReadonlyArray<readonly [number, number]>>

export type FilingStatus = keyof typeof BRACKETS

/** Paychecks per year. Semi-monthly and monthly follow the calendar, not weeks. */
const PAYCHECKS_PER_YEAR = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
} as const

/** Beyond any real salary; the field's own max is well inside it. */
const MAX_SALARY = 25_000_000

/** Tax on `taxable` under the given schedule, band by band. */
export function federalTax(taxable: number, status: FilingStatus): number {
  let tax = 0
  let floor = 0
  for (const [top, rate] of BRACKETS[status]) {
    if (taxable <= floor) break
    tax += (Math.min(taxable, top) - floor) * rate
    floor = top
  }
  return tax
}

/** The rate the next dollar of taxable income would attract. */
function marginalRate(taxable: number, status: FilingStatus): number {
  let rate = 0.1
  for (const band of BRACKETS[status]) {
    rate = band[1]
    if (taxable < band[0]) break
  }
  return rate
}

export default function compute(v: Values<typeof fields>): CalcResult {
  const { grossSalary, retirementPercent, healthPremium, postTaxDeductions } = v
  // Selects arrive as strings; the derived Values type makes forgetting that a
  // compile error rather than a NaN later.
  const payFrequency = v.payFrequency
  const filingStatus = v.filingStatus

  // Finiteness first. `coerceValues` emits NaN for unparseable input, and a
  // magnitude test like `x < 0` is false for NaN, so it would slip straight
  // through a bare comparison.
  if (!Number.isFinite(grossSalary) || !(grossSalary > 0))
    throw new CalcError('Enter a gross annual salary greater than 0.', 'grossSalary')
  if (grossSalary > MAX_SALARY)
    throw new CalcError('Enter a salary under 25 million dollars.', 'grossSalary')
  if (!Number.isFinite(retirementPercent) || retirementPercent < 0)
    throw new CalcError('A 401(k) contribution cannot be negative.', 'retirementPercent')
  if (retirementPercent > 100)
    throw new CalcError('You cannot defer more than 100% of your pay.', 'retirementPercent')
  if (!Number.isFinite(healthPremium) || healthPremium < 0)
    throw new CalcError('A health premium cannot be negative.', 'healthPremium')
  if (!Number.isFinite(postTaxDeductions) || postTaxDeductions < 0)
    throw new CalcError('Post-tax deductions cannot be negative.', 'postTaxDeductions')

  if (!Object.prototype.hasOwnProperty.call(PAYCHECKS_PER_YEAR, payFrequency))
    throw new CalcError('Choose a pay frequency.', 'payFrequency')
  if (!Object.prototype.hasOwnProperty.call(BRACKETS, filingStatus))
    throw new CalcError('Choose a federal filing status.', 'filingStatus')

  const status = filingStatus as FilingStatus
  const periods = PAYCHECKS_PER_YEAR[payFrequency as keyof typeof PAYCHECKS_PER_YEAR]

  const annualHealth = healthPremium * periods
  const annualPostTax = postTaxDeductions * periods

  // The elective deferral is a percentage of gross, capped at the statutory
  // annual limit — a plan will simply stop the deferral once you hit it.
  const uncapped401k = (grossSalary * retirementPercent) / 100
  const annual401k = Math.min(uncapped401k, ELECTIVE_DEFERRAL_LIMIT)
  const deferralCapped = uncapped401k > annual401k + 1e-9

  if (annualHealth + annual401k >= grossSalary)
    throw new CalcError(
      'Pre-tax deductions use up the whole salary. Lower the health premium.',
      'healthPremium',
    )

  /*
   * FICA and income tax do NOT share a base, and this is the detail people get
   * wrong:
   *
   *   - Section 125 cafeteria-plan premiums (medical, dental, vision) come out
   *     before BOTH federal income tax and FICA.
   *   - A traditional 401(k) deferral comes out before federal income tax but
   *     is STILL subject to Social Security and Medicare. Deferring more does
   *     not shrink your FICA bill by a cent.
   */
  const ficaWages = grossSalary - annualHealth

  const socialSecurity = Math.min(ficaWages, SOCIAL_SECURITY_WAGE_BASE) * SOCIAL_SECURITY_RATE
  const cappedBySocialSecurityBase = ficaWages > SOCIAL_SECURITY_WAGE_BASE

  const medicareBase = ficaWages * MEDICARE_RATE
  const surtax = ADDITIONAL_MEDICARE_THRESHOLD[status]
  const additionalMedicare = Math.max(0, ficaWages - surtax.amount) * ADDITIONAL_MEDICARE_RATE
  const medicare = medicareBase + additionalMedicare
  const fica = socialSecurity + medicare

  const standardDeduction = STANDARD_DEDUCTION[status]
  const taxableIncome = Math.max(0, grossSalary - annualHealth - annual401k - standardDeduction)
  const federal = federalTax(taxableIncome, status)

  const totalDeductions = annual401k + annualHealth + annualPostTax
  const takeHomeRaw = grossSalary - federal - fica - totalDeductions
  // Cannot happen inside the declared field bounds; the guard is here so the
  // clamp below can never quietly break the parts decomposition.
  if (!(takeHomeRaw > -1e-6))
    throw new CalcError(
      'Taxes and deductions exceed this salary. Lower a deduction.',
      'postTaxDeductions',
    )

  const annualTakeHome = Math.max(0, takeHomeRaw)
  const perPeriod = (annual: number) => annual / periods
  const totalTax = federal + fica
  const effectiveRate = (totalTax / grossSalary) * 100

  return {
    primary: {
      label: 'Take-home pay per paycheck',
      value: perPeriod(annualTakeHome),
      format: { style: 'currency' },
    },
    stats: [
      { label: 'Gross per paycheck', value: perPeriod(grossSalary), format: { style: 'currency' } },
      {
        label: 'Federal income tax',
        value: perPeriod(federal),
        format: { style: 'currency' },
      },
      { label: 'Social Security', value: perPeriod(socialSecurity), format: { style: 'currency' } },
      { label: 'Medicare', value: perPeriod(medicare), format: { style: 'currency' } },
      { label: 'Deductions', value: perPeriod(totalDeductions), format: { style: 'currency' } },
      {
        label: 'Annual take-home',
        value: annualTakeHome,
        format: { style: 'currency', decimals: 0 },
      },
      { label: 'Effective federal rate', value: effectiveRate, format: { style: 'percent' } },
    ],
    steps: [
      { label: 'Gross annual salary', value: grossSalary, format: { style: 'currency', decimals: 0 } },
      { label: 'Traditional 401(k)', value: annual401k, format: { style: 'currency', decimals: 0 } },
      {
        label: 'Pre-tax health premiums',
        value: annualHealth,
        format: { style: 'currency', decimals: 0 },
      },
      { rule: true },
      {
        label: 'Wages subject to FICA',
        value: ficaWages,
        format: { style: 'currency', decimals: 0 },
      },
      { label: 'Social Security at 6.2%', value: socialSecurity, format: { style: 'currency' } },
      { label: 'Medicare at 1.45%', value: medicareBase, format: { style: 'currency' } },
      {
        label: 'Additional Medicare at 0.9%',
        value: additionalMedicare,
        format: { style: 'currency' },
      },
      { rule: true },
      {
        label: 'Standard deduction',
        value: standardDeduction,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Federal taxable income',
        value: taxableIncome,
        format: { style: 'currency', decimals: 0 },
      },
      { label: 'Federal income tax', value: federal, format: { style: 'currency', decimals: 0 } },
      {
        label: 'Top marginal bracket',
        value: marginalRate(taxableIncome, status) * 100,
        format: { style: 'percent', decimals: 0 },
      },
      { rule: true },
      {
        label: 'Post-tax deductions',
        value: annualPostTax,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Annual take-home',
        value: annualTakeHome,
        format: { style: 'currency', decimals: 0 },
      },
      { label: 'Paychecks per year', value: periods, format: { style: 'decimal', decimals: 0 } },
      {
        label: 'Take-home per paycheck',
        value: perPeriod(annualTakeHome),
        format: { style: 'currency' },
      },
    ],
    /*
     * A FIXED four-way split of the gross salary, so the donut never gains or
     * loses a slice and always adds up. Take-home is derived by SUBTRACTION
     * rather than restated, which makes the sum exact by construction; the
     * clamp only absorbs floating-point dust, since a genuinely negative
     * remainder threw above.
     */
    parts: [
      {
        label: 'Take-home pay',
        value: annualTakeHome,
        format: { style: 'currency', decimals: 0 },
      },
      { label: 'Federal income tax', value: federal, format: { style: 'currency', decimals: 0 } },
      {
        label: 'Social Security & Medicare',
        value: fica,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Deductions',
        value: totalDeductions,
        format: { style: 'currency', decimals: 0 },
      },
    ],
    partsTotal: {
      label: 'Gross annual salary',
      value: grossSalary,
      format: { style: 'currency', decimals: 0 },
    },
    notes: [
      `Federal taxes only, for tax year ${TAX_YEAR}. State, county and city income taxes are NOT included, and in the forty-one states that levy one your real take-home pay will be lower than the figure above.`,
      'Assumes the standard deduction, no dependants, no tax credits, and no other household income. Employer payroll taxes are not shown; the 6.2% and 1.45% here are your half only.',
      cappedBySocialSecurityBase
        ? `Social Security stops at the ${TAX_YEAR} wage base of $184,500, so it is capped at $11,439 for the year. Medicare has no ceiling.`
        : `Social Security applies to every dollar here: the ${TAX_YEAR} wage base of $184,500 is above these wages.`,
      ...(additionalMedicare > 0
        ? [
            `The 0.9% Additional Medicare Tax applies above ${surtax.text} of wages for this filing status. That threshold is fixed in statute and has not been adjusted for inflation since 2013.`,
          ]
        : []),
      ...(deferralCapped
        ? [`The 401(k) deferral is capped at the ${TAX_YEAR} elective limit of $24,500, so a higher percentage changes nothing.`]
        : []),
      'Pre-tax health premiums escape both income tax and FICA. A traditional 401(k) escapes income tax only, so deferring more never lowers your Social Security or Medicare.',
    ],
  }
}

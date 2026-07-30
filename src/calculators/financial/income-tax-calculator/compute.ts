import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

/*
 * US FEDERAL INCOME TAX — TAX YEAR 2026 (the return filed in 2027).
 *
 * Source: IRS Revenue Procedure 2025-32, section 4.01 "Tax Rate Tables"
 * (tables 1-3) and section 4.14 "Standard Deduction", which set the inflation
 * adjustments for taxable years beginning in 2026 as amended by the One Big
 * Beautiful Bill Act. https://www.irs.gov/pub/irs-drop/rp-25-32.pdf
 *
 * THIS DATA GOES STALE. A new revenue procedure lands every autumn, so these
 * thresholds are wrong the moment the 2027 one is published. They are written
 * out in full, per filing status, precisely so the next reader can lay them
 * beside a published table rather than trust this file.
 *
 * Each row is [marginal rate, top of the band in TAXABLE income]. The bands are
 * the excess-over form of the IRS tables: a rate applies only to the slice of
 * taxable income inside its own band, never to the whole.
 *
 * The cross-check for the next editor: stacking these bands must reproduce the
 * IRS's own "plus" constants — a single filer with $50,400 of taxable income
 * owes exactly the $5,800 that table 3 quotes before its 22% excess term.
 * `compute.test.ts` asserts all eighteen of those published constants.
 */
const TAX_YEAR = 2026

type Bracket = readonly [rate: number, upTo: number]

const BRACKETS: Readonly<Record<string, readonly Bracket[]>> = {
  // Rev. Proc. 2025-32 table 3 — Unmarried Individuals.
  single: [
    [0.1, 12_400],
    [0.12, 50_400],
    [0.22, 105_700],
    [0.24, 201_775],
    [0.32, 256_225],
    [0.35, 640_600],
    [0.37, Number.POSITIVE_INFINITY],
  ],
  // Rev. Proc. 2025-32 table 1 — Married Individuals Filing Joint Returns and
  // Surviving Spouses.
  married: [
    [0.1, 24_800],
    [0.12, 100_800],
    [0.22, 211_400],
    [0.24, 403_550],
    [0.32, 512_450],
    [0.35, 768_700],
    [0.37, Number.POSITIVE_INFINITY],
  ],
  // Rev. Proc. 2025-32 table 2 — Heads of Households. The 24% and 32% bands end
  // $25 below the single filer's, which is not a typo.
  headOfHousehold: [
    [0.1, 17_700],
    [0.12, 67_450],
    [0.22, 105_700],
    [0.24, 201_750],
    [0.32, 256_200],
    [0.35, 640_600],
    [0.37, Number.POSITIVE_INFINITY],
  ],
}

/** Rev. Proc. 2025-32 section 4.14 — basic standard deduction for 2026. */
const STANDARD_DEDUCTION: Readonly<Record<string, number>> = {
  single: 16_100,
  married: 32_200,
  headOfHousehold: 24_150,
}

const STATUS_LABEL: Readonly<Record<string, string>> = {
  single: 'single',
  married: 'married filing jointly',
  headOfHousehold: 'head of household',
}

/** No income above this is plausible; it also keeps the chart loop bounded. */
const MAX_INCOME = 1_000_000_000

/** How many points the rate chart carries. Fixed, whatever the income. */
const CHART_INTERVALS = 40

/**
 * Whole dollars with thousands separators, built by hand rather than with
 * `toLocaleString`: compute runs at build time in Node and again in the
 * browser, and the two must produce byte-identical step labels.
 */
function money(n: number): string {
  return '$' + String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** A band label: 0.22 becomes '22%'. */
function ratePercent(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`
}

/**
 * The whole bracket table for one status, spelled out in prose, so the figure
 * on the page can be checked against a published table without opening the
 * source. Rendered from the same constant the arithmetic uses, so the copy
 * cannot drift away from the maths the way a hand-written sentence would.
 */
function bandSummary(brackets: readonly Bracket[]): string {
  return brackets
    .map(([rate, upTo], i) => {
      const from = i === 0 ? 0 : brackets[i - 1]![1]
      return Number.isFinite(upTo)
        ? `${ratePercent(rate)} up to ${money(upTo)}`
        : `${ratePercent(rate)} above ${money(from)}`
    })
    .join(', ')
}

interface BandSlice {
  rate: number
  /** Bottom of the band in taxable income. */
  from: number
  /** Taxable income falling inside this band. */
  amount: number
  tax: number
}

/**
 * The progressive stack: walk the bands in order, tax only the slice of taxable
 * income that lands inside each one, stop when the income runs out.
 */
function stackTax(taxable: number, brackets: readonly Bracket[]) {
  const slices: BandSlice[] = []
  let tax = 0
  let floor = 0

  for (const [rate, upTo] of brackets) {
    if (taxable <= floor) break
    const amount = Math.min(taxable, upTo) - floor
    const bandTax = amount * rate
    tax += bandTax
    slices.push({ rate, from: floor, amount, tax: bandTax })
    floor = upTo
  }

  return { tax, slices }
}

/**
 * The rate the NEXT dollar of taxable income would meet. At a band boundary the
 * next dollar has already crossed it, so taxable income of exactly $12,400 has
 * a 12% marginal rate, not 10% — which is the boundary the whole misconception
 * lives on.
 */
function marginalRateAt(taxable: number, brackets: readonly Bracket[]): number {
  for (const [rate, upTo] of brackets) {
    if (taxable < upTo) return rate
  }
  return brackets[brackets.length - 1]![0]
}

export default function compute(v: Values<typeof fields>): CalcResult {
  const { grossIncome, preTaxDeductions } = v
  // `filingStatus` is a select, so it arrives as a string.
  const filingStatus = v.filingStatus

  // Guard finiteness first: coerceValues emits NaN for unparseable input, and
  // `grossIncome < 0` is false for NaN, so a magnitude test alone lets it past.
  if (!Number.isFinite(grossIncome))
    throw new CalcError('Enter your gross annual income.', 'grossIncome')
  if (grossIncome < 0) throw new CalcError('Gross income cannot be negative.', 'grossIncome')
  if (grossIncome > MAX_INCOME)
    throw new CalcError('Enter a gross income below $1 billion.', 'grossIncome')

  const brackets = BRACKETS[filingStatus]
  const standardDeduction = STANDARD_DEDUCTION[filingStatus]
  if (!brackets || standardDeduction === undefined)
    throw new CalcError('Choose a filing status.', 'filingStatus')

  if (!Number.isFinite(preTaxDeductions))
    throw new CalcError('Enter your pre-tax deductions, or 0.', 'preTaxDeductions')
  if (preTaxDeductions < 0)
    throw new CalcError('Pre-tax deductions cannot be negative.', 'preTaxDeductions')
  if (preTaxDeductions > grossIncome)
    throw new CalcError('Pre-tax deductions cannot exceed your gross income.', 'preTaxDeductions')

  // Adjusted gross income, then the standard deduction. Itemising is out of
  // scope: this always applies the standard deduction for the chosen status.
  const agi = grossIncome - preTaxDeductions
  const taxable = Math.max(0, agi - standardDeduction)

  const { tax, slices } = stackTax(taxable, brackets)

  // The rate on the next dollar of gross income. Below the standard deduction
  // that dollar is still shielded, so the marginal rate is genuinely 0% — not
  // the 10% that reading the bracket table on its own would suggest.
  const marginalRate = agi < standardDeduction ? 0 : marginalRateAt(taxable, brackets)

  // The whole point of the page: what you actually pay, averaged over every
  // dollar earned. It sits below the marginal rate whenever any income falls in
  // a lower band, which is to say nearly always.
  const effectiveOnGross = grossIncome > 0 ? (tax / grossIncome) * 100 : 0
  const effectiveOnTaxable = taxable > 0 ? (tax / taxable) * 100 : 0

  // A fixed three-way split of gross income, so the donut has the same slice
  // count at every input. How many BRACKETS an income reaches does vary; that
  // detail lives in `stats` and `steps`, where a varying row count is fine.
  const shielded = Math.min(grossIncome, preTaxDeductions + standardDeduction)
  // Derived by subtraction so the three sum to gross exactly, then clamped:
  // floating point can land a remainder a hair below zero on round numbers.
  const keptFromTaxed = Math.max(0, grossIncome - tax - shielded)

  // Both rates across a span of incomes, with the visitor's own income at the
  // midpoint. Two series of 41 points, always — never a line per bracket.
  const chartTop = Math.max(grossIncome * 2, 50_000)
  const chartStep = chartTop / CHART_INTERVALS
  const effectivePoints: Array<readonly [number, number]> = []
  const marginalPoints: Array<readonly [number, number]> = []
  for (let i = 0; i <= CHART_INTERVALS; i++) {
    const x = i * chartStep
    const xAgi = Math.max(0, x - preTaxDeductions)
    const xTaxable = Math.max(0, xAgi - standardDeduction)
    effectivePoints.push([x, x > 0 ? (stackTax(xTaxable, brackets).tax / x) * 100 : 0])
    marginalPoints.push([
      x,
      (xAgi < standardDeduction ? 0 : marginalRateAt(xTaxable, brackets)) * 100,
    ])
  }

  return {
    primary: {
      label: 'Federal income tax',
      value: tax,
      format: { style: 'currency', decimals: 0 },
    },
    parts: [
      { label: 'Federal income tax', value: tax, format: { style: 'currency', decimals: 0 } },
      {
        label: 'Income shielded by deductions',
        value: shielded,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Taxed income you keep',
        value: keptFromTaxed,
        format: { style: 'currency', decimals: 0 },
      },
    ],
    partsTotal: {
      label: 'Gross income',
      value: grossIncome,
      format: { style: 'currency', decimals: 0 },
    },
    series: [
      {
        label: 'Effective rate',
        points: effectivePoints,
        format: { style: 'percent', decimals: 1 },
      },
      { label: 'Marginal rate', points: marginalPoints, format: { style: 'percent', decimals: 0 } },
    ],
    stats: [
      {
        label: 'Marginal tax rate',
        value: marginalRate * 100,
        format: { style: 'percent', decimals: 0 },
      },
      {
        label: 'Effective tax rate',
        value: effectiveOnGross,
        format: { style: 'percent', decimals: 2 },
      },
      { label: 'Taxable income', value: taxable, format: { style: 'currency', decimals: 0 } },
      {
        label: 'Standard deduction',
        value: standardDeduction,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Income after federal tax',
        value: grossIncome - tax,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Effective rate on taxable income',
        value: effectiveOnTaxable,
        format: { style: 'percent', decimals: 2 },
      },
      // One row per bracket actually reached. The row count varies here — the
      // theme clones its own template per stat — unlike `parts` and `series`.
      ...slices.map((s) => ({
        label: `Tax in the ${ratePercent(s.rate)} bracket`,
        value: s.tax,
        format: { style: 'currency' as const, decimals: 0 },
      })),
    ],
    steps: [
      { label: 'Gross income', value: grossIncome, format: { style: 'currency', decimals: 0 } },
      {
        label: 'Less pre-tax deductions',
        value: preTaxDeductions,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: `Less the ${TAX_YEAR} standard deduction (${STATUS_LABEL[filingStatus]})`,
        value: standardDeduction,
        format: { style: 'currency', decimals: 0 },
      },
      { label: 'Taxable income', value: taxable, format: { style: 'currency', decimals: 0 } },
      { rule: true },
      ...slices.map((s) => ({
        label: `${ratePercent(s.rate)} on the ${money(s.amount)} between ${money(s.from)} and ${money(s.from + s.amount)}`,
        value: s.tax,
        format: { style: 'currency' as const, decimals: 0 },
      })),
      { rule: true },
      { label: 'Total federal income tax', value: tax, format: { style: 'currency', decimals: 0 } },
      {
        label: 'Effective rate, tax divided by gross income',
        value: effectiveOnGross,
        format: { style: 'percent', decimals: 2 },
      },
    ],
    notes: [
      `Tax year ${TAX_YEAR}, the return filed in 2027, from IRS Revenue Procedure 2025-32. Filing ${STATUS_LABEL[filingStatus]}, the standard deduction is ${money(standardDeduction)} and taxable income is banded ${bandSummary(brackets)}. Check those figures against the published table before using them for any other year.`,
      'Federal income tax only. It leaves out Social Security and Medicare payroll tax (FICA, 7.65% of most wages), state and local income tax, the alternative minimum tax, and every credit, the child tax credit and earned income credit included. This figure is not your total tax bill and not your take-home pay.',
      'The standard deduction is applied automatically for the filing status chosen. Itemised deductions, dependants, and income taxed at capital-gains rates are not modelled.',
      marginalRate > 0
        ? `Your last dollar is taxed at ${ratePercent(marginalRate)}, while the tax averaged over every dollar you earned is ${effectiveOnGross.toFixed(2)}%. Earning one dollar more is taxed at the marginal rate and always leaves you with more money, never less.`
        : 'Income after pre-tax deductions is below the standard deduction, so no federal income tax is due and the next dollar earned is not taxed either.',
    ],
  }
}

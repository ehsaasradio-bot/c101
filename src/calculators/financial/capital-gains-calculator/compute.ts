import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

/*
 * US FEDERAL CAPITAL GAINS TAX — TAX YEAR 2026 (the return filed in 2027).
 *
 * PRIMARY SOURCE, read as the IRS published it rather than as anyone summarised
 * it: IRS Revenue Procedure 2025-32, https://www.irs.gov/pub/irs-drop/rp-25-32.pdf
 *
 *   - section 4.03 "Maximum Capital Gains Rate" (§ 1(h), § 1(j)(5)) — the
 *     maximum zero rate amount and maximum 15 percent rate amount per filing
 *     status. Quoted verbatim into MAX_ZERO_RATE / MAX_FIFTEEN_RATE below.
 *   - section 4.01 "Tax Rate Tables" (tables 1-4) — the ordinary rate bands a
 *     SHORT-term gain is taxed in.
 *   - section 4.14 "Standard Deduction".
 *
 * Going to the document itself is not pedantry here. A widely-syndicated
 * secondary table published the 2026 head-of-household 24% ceiling as $201,775;
 * the IRS's own table 2 says $201,750, and two calculators in this project
 * disagreed by $25 because one of them trusted the summary. Every figure below
 * was transcribed from the revenue procedure's text.
 *
 * The ordinary bands and the standard deduction are deliberately identical to
 * `financial/income-tax-calculator`, which cites the same sections. If you edit
 * one, edit both — `compute.test.ts` here pins the IRS's own published "plus"
 * constants so a drift between the two files fails a test rather than shipping.
 *
 * THIS DATA GOES STALE. A new revenue procedure lands every autumn.
 */
const TAX_YEAR = 2026

type Bracket = readonly [rate: number, upTo: number]

/** Ordinary income bands, Rev. Proc. 2025-32 section 4.01. [rate, top of band]. */
const BRACKETS: Readonly<Record<string, readonly Bracket[]>> = {
  // Table 3 — Unmarried Individuals (other than Surviving Spouses and Heads of
  // Households).
  single: [
    [0.1, 12_400],
    [0.12, 50_400],
    [0.22, 105_700],
    [0.24, 201_775],
    [0.32, 256_225],
    [0.35, 640_600],
    [0.37, Number.POSITIVE_INFINITY],
  ],
  // Table 1 — Married Individuals Filing Joint Returns and Surviving Spouses.
  married: [
    [0.1, 24_800],
    [0.12, 100_800],
    [0.22, 211_400],
    [0.24, 403_550],
    [0.32, 512_450],
    [0.35, 768_700],
    [0.37, Number.POSITIVE_INFINITY],
  ],
  // Table 4 — Married Individuals Filing Separate Returns. Identical to table 3
  // up to the 35% band, which ends at $384,350 rather than $640,600.
  marriedSeparate: [
    [0.1, 12_400],
    [0.12, 50_400],
    [0.22, 105_700],
    [0.24, 201_775],
    [0.32, 256_225],
    [0.35, 384_350],
    [0.37, Number.POSITIVE_INFINITY],
  ],
  // Table 2 — Heads of Households. The 24% and 32% bands end $25 below the
  // single filer's, which is not a typo — it is what the IRS table says.
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

/**
 * Rev. Proc. 2025-32 section 4.03, "Maximum Zero Rate Amount" column.
 *
 * Read as taxable income: long-term gain stacked on top of ordinary taxable
 * income is taxed at 0% for the part of it below this figure.
 */
const MAX_ZERO_RATE: Readonly<Record<string, number>> = {
  married: 98_900,
  marriedSeparate: 49_450,
  headOfHousehold: 66_200,
  single: 49_450, // "All Other Individuals"
}

/** Rev. Proc. 2025-32 section 4.03, "Maximum 15% Rate Amount" column. */
const MAX_FIFTEEN_RATE: Readonly<Record<string, number>> = {
  married: 613_700,
  marriedSeparate: 306_850,
  headOfHousehold: 579_600,
  single: 545_500, // "All Other Individuals"
}

/** Rev. Proc. 2025-32 section 4.14(1) — basic standard deduction for 2026. */
const STANDARD_DEDUCTION: Readonly<Record<string, number>> = {
  single: 16_100,
  married: 32_200,
  marriedSeparate: 16_100,
  headOfHousehold: 24_150,
}

const STATUS_LABEL: Readonly<Record<string, string>> = {
  single: 'single',
  married: 'married filing jointly',
  marriedSeparate: 'married filing separately',
  headOfHousehold: 'head of household',
}

/**
 * IRC § 1211(b): a net capital loss offsets capital gains in full, then up to
 * $3,000 of ordinary income per year — $1,500 for a married taxpayer filing
 * separately. Whatever is left carries forward indefinitely. That statutory cap
 * is not inflation-adjusted and so does not appear in the revenue procedure.
 */
const LOSS_OFFSET_LIMIT: Readonly<Record<string, number>> = {
  single: 3_000,
  married: 3_000,
  marriedSeparate: 1_500,
  headOfHousehold: 3_000,
}

/**
 * IRC § 1222: "more than 1 year" is long-term. Expressed in whole days, so the
 * one-day cliff the page is built around is actually reachable on the slider.
 * A holding period that straddles a leap day needs 366 days to clear a calendar
 * year; the notes say so rather than the code guessing which year you sold in.
 */
const LONG_TERM_DAYS = 365

/** No sale above this is plausible; it also keeps every loop bounded. */
const MAX_AMOUNT = 1_000_000_000

/** Points on the comparison chart. Fixed, whatever the input. */
const CHART_INTERVALS = 40

/**
 * Whole dollars with thousands separators, built by hand rather than with
 * `toLocaleString`: compute runs at build time in Node and again in the browser,
 * and the two must produce byte-identical strings.
 */
function money(n: number): string {
  return '$' + num(n)
}

/** The same, without the currency symbol. Never `toLocaleString`, same reason. */
function num(n: number): string {
  return String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * The progressive ordinary-income stack: each band taxes only the slice of
 * taxable income inside it, never the whole.
 */
function ordinaryTax(taxable: number, brackets: readonly Bracket[]): number {
  let tax = 0
  let floor = 0
  for (const [rate, upTo] of brackets) {
    if (taxable <= floor) break
    tax += (Math.min(taxable, upTo) - floor) * rate
    floor = upTo
  }
  return tax
}

interface GainTax {
  /** Tax attributable to the sale if the gain is short-term. */
  shortTerm: number
  /** Tax attributable to the sale if the gain is long-term. */
  longTerm: number
  /** How the long-term gain splits across the 0% / 15% / 20% rates. */
  at0: number
  at15: number
  at20: number
  /** Loss deducted against ordinary income this year, and what carries forward. */
  lossUsed: number
  lossCarried: number
}

/**
 * Tax caused by ONE sale, both ways, on top of everything else.
 *
 * Always a difference of two whole-return figures — tax with the sale minus tax
 * without it — rather than a rate applied to the gain. That is the only form
 * that stays right when the standard deduction partly shields the gain, or when
 * the gain straddles a bracket boundary.
 *
 * The long-term half follows the stacking rule of § 1(h), which is what the
 * IRS's own Qualified Dividends and Capital Gain Tax Worksheet implements:
 * ordinary income fills the brackets first, the net capital gain sits on top of
 * it, and the 0% / 15% / 20% rates are read off where that stacked slice lands.
 */
function taxOnSale(gain: number, otherIncome: number, status: string): GainTax {
  const brackets = BRACKETS[status]!
  const deduction = STANDARD_DEDUCTION[status]!
  const zeroTop = MAX_ZERO_RATE[status]!
  const fifteenTop = MAX_FIFTEEN_RATE[status]!

  // The return without the sale on it. Everything below is measured from here.
  const taxableWithout = Math.max(0, otherIncome - deduction)
  const taxWithout = ordinaryTax(taxableWithout, brackets)

  if (gain < 0) {
    // § 1211(b). With no other capital gains entered, the whole allowance goes
    // against ordinary income; the excess carries forward. Both holding periods
    // give the same answer, because the deduction is against ordinary income
    // either way — the character of the loss only matters for netting it
    // against other gains, which is out of scope.
    const loss = -gain
    const lossUsed = Math.min(loss, LOSS_OFFSET_LIMIT[status]!)
    const saving = taxWithout - ordinaryTax(Math.max(0, taxableWithout - lossUsed), brackets)
    return {
      shortTerm: -saving,
      longTerm: -saving,
      at0: 0,
      at15: 0,
      at20: 0,
      lossUsed,
      lossCarried: loss - lossUsed,
    }
  }

  // Short-term: the gain is ordinary income, added on top.
  const taxableWith = Math.max(0, otherIncome + gain - deduction)
  const shortTerm = ordinaryTax(taxableWith, brackets) - taxWithout

  // Long-term. `taxableWith` is the same total either way — the character of the
  // income does not change what the standard deduction shields — but it now
  // splits into an ordinary part taxed in the bands and a capital part taxed at
  // 0/15/20. When other income is below the standard deduction the remainder of
  // that deduction eats into the gain itself, which `min(gain, taxableWith)`
  // handles: the ordinary part falls to zero and the capital part shrinks.
  const capital = Math.min(gain, taxableWith)
  const ordinaryPart = taxableWith - capital

  const at0 = Math.max(0, Math.min(taxableWith, zeroTop) - ordinaryPart)
  const at15 = Math.max(0, Math.min(taxableWith, fifteenTop) - Math.max(ordinaryPart, zeroTop))
  const at20 = Math.max(0, capital - at0 - at15)

  const longTerm = ordinaryTax(ordinaryPart, brackets) + at15 * 0.15 + at20 * 0.2 - taxWithout

  return { shortTerm, longTerm, at0, at15, at20, lossUsed: 0, lossCarried: 0 }
}

export default function compute(v: Values<typeof fields>): CalcResult {
  const { salePrice, costBasis, sellingCosts, holdingDays, otherIncome } = v
  // `filingStatus` is a select, so it arrives as a string.
  const filingStatus = v.filingStatus

  // Guard finiteness FIRST. `coerceValues` deliberately emits NaN for
  // unparseable input, and a magnitude test like `salePrice < 0` is false for
  // NaN, so it would slip straight through to a NaN headline.
  if (!Number.isFinite(salePrice)) throw new CalcError('Enter the sale price.', 'salePrice')
  if (salePrice < 0) throw new CalcError('The sale price cannot be negative.', 'salePrice')
  if (salePrice > MAX_AMOUNT)
    throw new CalcError('Enter a sale price below $1 billion.', 'salePrice')

  if (!Number.isFinite(costBasis)) throw new CalcError('Enter your cost basis.', 'costBasis')
  if (costBasis < 0) throw new CalcError('Cost basis cannot be negative.', 'costBasis')
  if (costBasis > MAX_AMOUNT)
    throw new CalcError('Enter a cost basis below $1 billion.', 'costBasis')

  if (!Number.isFinite(sellingCosts))
    throw new CalcError('Enter your selling costs, or 0.', 'sellingCosts')
  if (sellingCosts < 0) throw new CalcError('Selling costs cannot be negative.', 'sellingCosts')
  if (sellingCosts > MAX_AMOUNT)
    throw new CalcError('Enter selling costs below $1 billion.', 'sellingCosts')

  if (!Number.isFinite(holdingDays))
    throw new CalcError('Enter how many days you held the asset.', 'holdingDays')
  if (holdingDays < 1) throw new CalcError('Enter a holding period of at least one day.', 'holdingDays')
  if (holdingDays > 100 * 366)
    throw new CalcError('Enter a holding period under 100 years.', 'holdingDays')

  if (!Number.isFinite(otherIncome))
    throw new CalcError('Enter your other annual income, or 0.', 'otherIncome')
  if (otherIncome < 0) throw new CalcError('Other income cannot be negative.', 'otherIncome')
  if (otherIncome > MAX_AMOUNT)
    throw new CalcError('Enter an other income below $1 billion.', 'otherIncome')

  const brackets = BRACKETS[filingStatus]
  if (!brackets) throw new CalcError('Choose a filing status.', 'filingStatus')

  const deduction = STANDARD_DEDUCTION[filingStatus]!
  const zeroTop = MAX_ZERO_RATE[filingStatus]!
  const fifteenTop = MAX_FIFTEEN_RATE[filingStatus]!

  // Net proceeds less what the asset cost you. Negative is a capital loss, which
  // is a real answer this calculator gives rather than an error it throws.
  const netProceeds = salePrice - sellingCosts
  const gain = netProceeds - costBasis
  const isLoss = gain < 0

  const longTermHeld = holdingDays > LONG_TERM_DAYS
  const both = taxOnSale(gain, otherIncome, filingStatus)
  const tax = longTermHeld ? both.longTerm : both.shortTerm

  // The headline comparison. Positive means holding past the one-year mark is
  // worth this much; it is zero for a loss, where the character does not matter.
  const savingFromHolding = both.shortTerm - both.longTerm

  const taxableWithout = Math.max(0, otherIncome - deduction)
  const taxableWith = isLoss
    ? Math.max(0, otherIncome - deduction - both.lossUsed)
    : Math.max(0, otherIncome + gain - deduction)

  // Rate paid on the gain itself — or, for a loss, the rate of RELIEF, which is
  // reported positive against a negative headline tax. Undefined at a zero gain,
  // so report 0 there rather than dividing by it.
  const effectiveRate = gain === 0 ? 0 : ((isLoss ? -tax : tax) / Math.abs(gain)) * 100

  /*
   * Two lines, always — never one per rate band, which would make the series
   * count depend on how much income you have and leave the chart missing at
   * some inputs. The x axis is the size of the gain, running from your own
   * figure (or zero, whichever is lower) to roughly twice it, so the gap between
   * the two lines at your own number is the picture. A loss puts your figure at
   * x = 0 of the chart, where both lines are the same flat § 1211(b) relief.
   */
  const xLow = Math.min(0, gain)
  const xHigh = Math.max(gain * 2, xLow + 25_000)
  const xStep = (xHigh - xLow) / CHART_INTERVALS
  const shortPoints: Array<readonly [number, number]> = []
  const longPoints: Array<readonly [number, number]> = []
  for (let i = 0; i <= CHART_INTERVALS; i++) {
    const x = xLow + i * xStep
    const at = taxOnSale(x, otherIncome, filingStatus)
    shortPoints.push([x, at.shortTerm])
    longPoints.push([x, at.longTerm])
  }

  const rateSummary = `0% up to ${money(zeroTop)} of taxable income, 15% up to ${money(fifteenTop)}, 20% above that`

  const stats: CalcResult['stats'] = [
    {
      label: 'Tax if short-term (held 1 year or less)',
      value: both.shortTerm,
      format: { style: 'currency', decimals: 0 },
    },
    {
      label: 'Tax if long-term (held more than 1 year)',
      value: both.longTerm,
      format: { style: 'currency', decimals: 0 },
    },
    {
      label: 'Saved by holding past one year',
      value: savingFromHolding,
      format: { style: 'currency', decimals: 0 },
    },
    {
      label: isLoss ? 'Net capital loss' : 'Net capital gain',
      value: Math.abs(gain),
      format: { style: 'currency', decimals: 0 },
    },
    {
      label: isLoss ? 'Effective rate of relief on the loss' : 'Effective rate on the gain',
      value: effectiveRate,
      format: { style: 'percent', decimals: 2 },
    },
    {
      label: isLoss ? 'Loss carried to future years' : 'Profit kept after tax',
      value: isLoss ? both.lossCarried : gain - tax,
      format: { style: 'currency', decimals: 0 },
    },
    { label: 'Holding period', value: holdingDays, format: { style: 'duration', from: 'days' } },
    {
      label: 'Taxable income including this sale',
      value: taxableWith,
      format: { style: 'currency', decimals: 0 },
    },
  ]

  const steps: CalcResult['steps'] = [
    { label: 'Sale price', value: salePrice, format: { style: 'currency', decimals: 0 } },
    { label: 'Less selling costs', value: sellingCosts, format: { style: 'currency', decimals: 0 } },
    { label: 'Less cost basis', value: costBasis, format: { style: 'currency', decimals: 0 } },
    {
      label: isLoss ? 'Net capital loss' : 'Net capital gain',
      value: Math.abs(gain),
      format: { style: 'currency', decimals: 0 },
    },
    { rule: true },
    {
      label: `Other income less the ${TAX_YEAR} standard deduction (${money(deduction)})`,
      value: taxableWithout,
      format: { style: 'currency', decimals: 0 },
    },
    ...(isLoss
      ? [
          {
            label: 'Loss deducted against ordinary income this year (capped by law)',
            value: both.lossUsed,
            format: { style: 'currency' as const, decimals: 0 },
          },
          {
            label: 'Loss carried forward to future years',
            value: both.lossCarried,
            format: { style: 'currency' as const, decimals: 0 },
          },
        ]
      : [
          {
            label: `Gain taxed at 0% (long-term, stacked below ${money(zeroTop)})`,
            value: both.at0,
            format: { style: 'currency' as const, decimals: 0 },
          },
          {
            label: `Gain taxed at 15% (long-term, up to ${money(fifteenTop)})`,
            value: both.at15,
            format: { style: 'currency' as const, decimals: 0 },
          },
          {
            label: 'Gain taxed at 20% (long-term, above that)',
            value: both.at20,
            format: { style: 'currency' as const, decimals: 0 },
          },
        ]),
    { rule: true },
    {
      label: 'Tax on this sale if short-term',
      value: both.shortTerm,
      format: { style: 'currency', decimals: 0 },
    },
    {
      label: 'Tax on this sale if long-term',
      value: both.longTerm,
      format: { style: 'currency', decimals: 0 },
    },
    {
      label: `Held ${num(holdingDays)} days, so this sale is ${longTermHeld ? 'long-term' : 'short-term'}`,
      value: tax,
      format: { style: 'currency', decimals: 0 },
    },
  ]

  const notes: string[] = [
    `Tax year ${TAX_YEAR}, filing ${STATUS_LABEL[filingStatus]}. Long-term rates come from IRS Revenue Procedure 2025-32 section 4.03, "Maximum Capital Gains Rate": ${rateSummary}. The ordinary bands a short-term gain is taxed in, and the ${money(deduction)} standard deduction, come from sections 4.01 and 4.14 of the same document. Check them against the published revenue procedure before using them for any other year.`,
    'Federal tax only, and only on this one sale. It excludes state and local capital gains tax, the 3.8% net investment income tax on investment income above $200,000 single or $250,000 married filing jointly, the wash-sale rule, capital loss carryovers from earlier years, and netting against your other gains and losses for the year.',
    'It also leaves out the special rates and exclusions: 28% on collectibles, 25% unrecaptured section 1250 gain on depreciated real estate, the section 121 exclusion on a main home, qualified small business stock, and installment sales. Itemised deductions, credits and dependants are not modelled either — the standard deduction for your filing status is applied automatically.',
    isLoss
      ? `You sold at a loss of ${money(gain)}. That is an answer, not an error: a net capital loss offsets capital gains first, then up to ${money(LOSS_OFFSET_LIMIT[filingStatus]!)} of ordinary income a year, and the rest carries forward indefinitely. Here ${money(both.lossUsed)} is deducted this year, cutting your bill by ${money(-tax)}, and ${money(both.lossCarried)} carries forward. The headline is shown as a negative tax for that reason.`
      : longTermHeld
        ? `Held ${num(holdingDays)} days — more than a year — so this gain is long-term and costs ${money(both.longTerm)}. Selling one day before the anniversary would have made it short-term and cost ${money(both.shortTerm)}, a difference of ${money(savingFromHolding)}.`
        : `Held ${num(holdingDays)} days, so this gain is short-term and taxed as ordinary income: ${money(both.shortTerm)}. Holding it to day 366 would make it long-term and cost ${money(both.longTerm)} instead, a difference of ${money(savingFromHolding)}.`,
    'The holding period runs from the day after you acquired the asset to the day you sold it, and the line is more than one year, not a round 365 days. This calculator uses 365 days as that line, so a period spanning a leap day is one day out.',
  ]

  return {
    primary: {
      label: 'Federal capital gains tax',
      value: tax,
      format: { style: 'currency', decimals: 0 },
    },
    series: [
      {
        label: 'Tax if short-term',
        points: shortPoints,
        format: { style: 'currency', decimals: 0 },
      },
      { label: 'Tax if long-term', points: longPoints, format: { style: 'currency', decimals: 0 } },
    ],
    stats,
    steps,
    notes,
  }
}

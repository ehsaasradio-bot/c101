import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

/**
 * IRA contribution limit for the **2026 tax year**: $7,500, with an extra
 * $1,100 from age 50, so $8,600.
 *
 * Source: IRS Notice 2025-67, "2026 Amounts Relating to Retirement Plans and
 * IRAs, as Adjusted for Changes in Cost-of-Living", page 4: the deductible
 * amount under section 219(b)(5)(A) "is increased from $7,000 to $7,500", and
 * the amount under section 219(b)(5)(B)(ii) for individuals who have attained
 * age 50 "is increased from $1,000 to $1,100". Read from the notice itself
 * rather than a summary table, because summaries of this document have been
 * wrong by small amounts before.
 *
 * The same notice, page 5, sets the 2026 Roth AGI phase-out under section
 * 408A(c)(3)(A) at $153,000-$168,000 for singles and heads of household and
 * $242,000-$252,000 for married couples filing jointly; those are quoted in the
 * notes and the FAQ and carry the same tax year.
 *
 * REVIEW EVERY AUTUMN. The IRS re-indexes these each November, and the year
 * named in `index.ts` and in the notes below must move with these constants or
 * the page starts quoting a stale figure as current.
 */
const IRA_LIMIT = 7_500
const IRA_LIMIT_OVER_50 = 8_600
const IRA_LIMIT_TAX_YEAR = 2026

/**
 * Thousands separators without `toLocaleString`. Compute runs once in Node at
 * build time and again in the browser, and the two must emit byte-identical
 * text; `format.ts` pins its locale for exactly this reason, and a note built
 * here has to do the same.
 */
function dollars(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * Future value of an ordinary annuity of 1 per year, n end-of-year payments all
 * earning r:
 *
 *   s = ((1 + r)^n - 1) / r
 *
 * At r = 0 the closed form is 0/0 and the answer is simply n, because nothing
 * grows. Both branches are checked against a year-by-year loop in the tests.
 */
function annuityFactor(r: number, n: number): number {
  if (n <= 0) return 0
  if (r === 0) return n
  return (Math.pow(1 + r, n) - 1) / r
}

/**
 * THE POINT OF THIS PAGE.
 *
 * A Roth is funded with money that has already been taxed and comes out
 * untouched; a traditional is funded before tax and is taxed on the way out. Put
 * $A of after-tax money into a Roth each year and you end with
 *
 *   Roth = A x s                                          (nothing further owed)
 *
 * Funding that $A costs A / (1 - t0) of gross pay, because you paid t0 on it
 * first. A deductible contribution costs nothing in tax today, so the SAME gross
 * pay buys a traditional contribution of G = A / (1 - t0), and at retirement
 *
 *   Traditional = G x s x (1 - t1) = A x s x (1 - t1) / (1 - t0)
 *
 * Divide one by the other and the account balance, the return and the horizon
 * all cancel:
 *
 *   Roth / Traditional = (1 - t0) / (1 - t1)
 *
 * So the Roth wins exactly when t1 > t0, loses when t1 < t0, and at t1 = t0 the
 * two are identical to the cent — multiplication does not care what order you
 * apply the factors in. The break-even retirement tax rate is therefore your
 * rate today, and no assumption about markets or time can move it. Almost no
 * calculator says this out loud.
 *
 * The comparison chosen here is equal GROSS cost, not equal deposit. Putting
 * $7,500 into each account is not an equal sacrifice: the Roth one costs $7,500
 * of take-home pay while the traditional one costs $7,500 of pre-tax pay, which
 * is less money out of your pocket. The equal-deposit figure is reported too, as
 * a stat, because it is the comparison most people arrive expecting — and it
 * flatters the Roth by construction.
 */
export default function compute(v: Values<typeof fields>): CalcResult {
  const {
    currentAge,
    retirementAge,
    annualContribution,
    annualReturn,
    taxRateNow,
    taxRateRetirement,
  } = v

  // Finiteness first, every time. `coerceValues` deliberately emits NaN for an
  // unparseable entry, and a bare magnitude test such as `x < 0` is false for
  // NaN, so it would slip straight through into the arithmetic.
  if (!Number.isFinite(currentAge) || !(currentAge > 0))
    throw new CalcError('Enter an age greater than 0.', 'currentAge')
  if (!Number.isFinite(retirementAge) || !(retirementAge > currentAge))
    throw new CalcError('Retirement age must be greater than your current age.', 'retirementAge')
  if (!Number.isFinite(annualContribution) || !(annualContribution > 0))
    throw new CalcError('Enter an annual contribution greater than 0.', 'annualContribution')
  if (!Number.isFinite(annualReturn) || annualReturn < 0)
    throw new CalcError('Expected return cannot be negative.', 'annualReturn')
  if (!Number.isFinite(taxRateNow) || taxRateNow < 0)
    throw new CalcError('Your tax rate cannot be negative.', 'taxRateNow')
  // A 100% rate would leave no take-home pay to fund a Roth at all, and the
  // gross cost A / (1 - t0) would divide by zero.
  if (taxRateNow >= 100)
    throw new CalcError('Your tax rate must be below 100%.', 'taxRateNow')
  if (!Number.isFinite(taxRateRetirement) || taxRateRetirement < 0)
    throw new CalcError('Your retirement tax rate cannot be negative.', 'taxRateRetirement')
  if (taxRateRetirement >= 100)
    throw new CalcError('Your retirement tax rate must be below 100%.', 'taxRateRetirement')

  const years = retirementAge - currentAge
  const months = Math.round(years * 12)
  const r = annualReturn / 100
  const t0 = taxRateNow / 100
  const t1 = taxRateRetirement / 100

  const factor = annuityFactor(r, years)

  // The Roth. After-tax money in, nothing owed on the way out.
  const rothValue = annualContribution * factor

  // The traditional funded from the same gross pay. Nothing is deducted today,
  // so the whole gross amount is invested.
  const grossCost = annualContribution / (1 - t0)
  const traditionalPreTax = grossCost * factor

  /**
   * The whole claim of this page, written as one number:
   *
   *   Traditional / Roth = (1 - t1) / (1 - t0)
   *
   * The after-tax traditional balance is deliberately derived from the Roth
   * balance THROUGH THIS RATIO rather than as `grossCost * factor * (1 - t1)`.
   * Algebraically the two are the same product; in IEEE-754 they are not. Written
   * the long way, `(A / (1 - t0)) * s * (1 - t0)` lands one ulp away from `A * s`
   * for most rates — 1,036,776.5876373698 against ...96 — so the page's central
   * claim, that equal rates give identical accounts, would have been true only to
   * a tolerance and visibly false in a "difference: $0.0000000002" sense.
   *
   * Division of a number by itself is exact in IEEE-754, so when t1 === t0 this
   * ratio is exactly 1.0, and multiplying by exactly 1.0 is the identity. The
   * equivalence is therefore bit-exact for every rate, return, amount and
   * horizon, which is what the tests assert with `toBe` rather than
   * `toBeCloseTo`.
   */
  const afterTaxRatio = (1 - t1) / (1 - t0)
  const traditionalAfterTax = rothValue * afterTaxRatio
  const deferredTax = Math.max(0, traditionalPreTax - traditionalAfterTax)

  // The comparison most people arrive expecting: the same cash into each
  // account. It ignores that the Roth deposit is the more expensive one, and so
  // hands the Roth a win it has not earned whenever any tax is due later.
  const equalDepositAfterTax = rothValue * (1 - t1)

  const rothAdvantage = rothValue - traditionalAfterTax
  // Computed from the two balances rather than from the rates, so the headline
  // figures and this percentage cannot drift apart. The tests assert it equals
  // ((1 - t0) / (1 - t1) - 1) x 100 exactly, which is the algebraic identity
  // above stated a second way.
  const advantagePercent =
    traditionalAfterTax > 0 ? (rothValue / traditionalAfterTax - 1) * 100 : 0

  // Set Roth = Traditional and solve: (1 - t1) / (1 - t0) = 1, so t1 = t0. The
  // rate at which the two accounts are worth exactly the same is the rate you
  // pay today, whatever the return and however long the horizon.
  const breakEvenRate = taxRateNow

  const totalContributed = annualContribution * years
  const totalGrossCost = grossCost * years
  const taxPaidUpFront = totalGrossCost - totalContributed

  // Both curves come from the same closed form as the headline, so the chart and
  // the numbers cannot disagree. Thinned to about 33 points at the longest
  // horizon the form allows (18 to 75).
  const stride = Math.max(1, Math.ceil(years / 40))
  const rothPoints: Array<readonly [number, number]> = []
  const traditionalPoints: Array<readonly [number, number]> = []
  for (let t = 0; t < years; t += stride) {
    const f = annuityFactor(r, t)
    const rothAt = annualContribution * f
    rothPoints.push([currentAge + t, rothAt])
    // Through the same ratio as the headline, so at equal rates the two curves
    // are identical point for point rather than merely indistinguishable.
    traditionalPoints.push([currentAge + t, rothAt * afterTaxRatio])
  }
  // Pin the last point to the headline rather than letting the loop land near it.
  rothPoints.push([retirementAge, rothValue])
  traditionalPoints.push([retirementAge, traditionalAfterTax])

  const ratesMatch = Math.abs(taxRateRetirement - taxRateNow) < 1e-9

  const notes: string[] = [
    `The two accounts are compared at the same GROSS cost, not the same deposit. Funding a $${dollars(annualContribution)} Roth contribution takes $${dollars(grossCost)} of pre-tax pay at a ${taxRateNow}% rate, so the traditional side is credited with the whole $${dollars(grossCost)} — a deductible contribution costs nothing in tax today. Comparing $${dollars(annualContribution)} against $${dollars(annualContribution)} would quietly ask the Roth saver for the larger sacrifice.`,
    'At the same tax rate the two accounts are mathematically identical, because taxing before growth and taxing after growth remove exactly the same share. Everything on this page follows from which way you expect your rate to move, and from nothing else — not the return, not the horizon, not the amount.',
    `Both accounts share one annual limit: $${dollars(IRA_LIMIT)} for the ${IRA_LIMIT_TAX_YEAR} tax year, or $${dollars(IRA_LIMIT_OVER_50)} from age 50 (IRS Notice 2025-67, section 219(b)(5)). Because that limit is a cash figure rather than a pre-tax one, filling it with after-tax money shelters more: maxing a Roth is the larger real contribution.`,
    'Contributions are treated as arriving at the end of each year, so the final one earns no return, and the projection is in future dollars with no inflation adjustment. The rate you enter for retirement is applied as a single flat rate, though withdrawals are actually taxed on a graduated schedule.',
  ]

  if (grossCost > IRA_LIMIT)
    notes.push(
      `At this contribution and tax rate the equal-cost traditional contribution is $${dollars(grossCost)}, which is above the $${dollars(IRA_LIMIT)} limit, so no traditional IRA would accept it. Beyond the limit an honest comparison has to put the difference in a taxable account, which this page does not model.`,
    )

  if (ratesMatch)
    notes.push(
      'Your two rates are equal, which is why the two curves lie exactly on top of each other and the difference is zero. This is the identity, not a rounding accident.',
    )
  else if (taxRateRetirement > taxRateNow)
    notes.push(
      'You expect to pay more tax in retirement than you do now, which is the case the Roth exists for: you settle the bill at the lower of your two rates.',
    )
  else
    notes.push(
      'You expect to pay less tax in retirement than you do now, so the deduction is worth more than the exemption and the traditional wins on these numbers. Note that the rate you save today is your marginal one, while retirement withdrawals fill the low brackets first — which is why the retirement rate is often lower than people assume.',
    )

  notes.push(
    `Roth contributions phase out on income: for ${IRA_LIMIT_TAX_YEAR} the range is $153,000 to $168,000 for single filers and heads of household, and $242,000 to $252,000 for married couples filing jointly (IRS Notice 2025-67, section 408A(c)(3)(A)). Above the top of the range direct Roth contributions are not allowed at all.`,
  )

  return {
    primary: {
      label: 'Tax-free Roth balance at retirement',
      value: rothValue,
      format: { style: 'currency', decimals: 0 },
    },
    // The Roth's lead over an equal-cost traditional, as a percentage. It
    // depends on the two tax rates and on nothing else, which is the finding.
    // Clamped to the declared scale: the sliders stop at 50% but the number
    // input accepts the full validated range.
    scaleValue: Math.max(-50, Math.min(100, advantagePercent)),
    stats: [
      {
        label: 'Traditional IRA, same cost, after tax',
        value: traditionalAfterTax,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Break-even retirement tax rate',
        value: breakEvenRate,
        format: { style: 'percent', decimals: 1 },
      },
      {
        label: 'Roth advantage',
        value: rothAdvantage,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Roth advantage, as a percentage',
        value: advantagePercent,
        format: { style: 'percent', decimals: 2 },
      },
      {
        label: 'Gross pay each contribution costs',
        value: grossCost,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Tax paid up front, in total',
        value: taxPaidUpFront,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Tax deferred on the traditional',
        value: deferredTax,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Traditional at the same deposit, after tax',
        value: equalDepositAfterTax,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Years of contributions',
        value: months,
        format: { style: 'duration', from: 'months' },
      },
    ],
    steps: [
      {
        label: 'Annual Roth contribution, after tax',
        value: annualContribution,
        format: { style: 'currency', decimals: 0 },
      },
      { label: 'Your tax rate now', value: taxRateNow, format: { style: 'percent', decimals: 1 } },
      {
        label: 'Gross pay it takes to fund that',
        value: grossCost,
        format: { style: 'currency', decimals: 0 },
      },
      { rule: true },
      { label: 'Years of growth', value: years, format: { style: 'decimal', decimals: 0 } },
      { label: 'Annuity factor', value: factor, format: { style: 'decimal', decimals: 4 } },
      {
        label: 'Roth at retirement, nothing owed',
        value: rothValue,
        format: { style: 'currency', decimals: 0 },
      },
      { rule: true },
      {
        label: 'Traditional contribution, same gross cost',
        value: grossCost,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Traditional at retirement, before tax',
        value: traditionalPreTax,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Tax at your retirement rate',
        value: taxRateRetirement,
        format: { style: 'percent', decimals: 1 },
      },
      {
        label: 'Traditional at retirement, after tax',
        value: traditionalAfterTax,
        format: { style: 'currency', decimals: 0 },
      },
      { rule: true },
      {
        label: 'Retirement rate that makes them equal',
        value: breakEvenRate,
        format: { style: 'percent', decimals: 1 },
      },
      {
        label: 'Roth advantage',
        value: rothAdvantage,
        format: { style: 'currency', decimals: 0 },
      },
    ],
    // The traditional pot split into the half you keep and the half the tax
    // authority is holding for you — the thing a raw balance comparison hides.
    // Stated against its own total, because the headline is the Roth figure.
    partsTotal: {
      label: 'Traditional IRA at retirement, before tax',
      value: traditionalPreTax,
      format: { style: 'currency', decimals: 0 },
    },
    parts: [
      {
        label: 'Yours after tax',
        value: traditionalAfterTax,
        format: { style: 'currency', decimals: 0 },
      },
      // By subtraction, so the two sum to the pre-tax pot exactly rather than by
      // luck, and clamped because floating point can land it a hair below zero
      // when the retirement rate is zero.
      {
        label: 'Income tax at withdrawal',
        value: deferredTax,
        format: { style: 'currency', decimals: 0 },
      },
    ],
    series: [
      {
        label: 'Roth, tax-free',
        points: rothPoints,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Traditional, after tax',
        points: traditionalPoints,
        format: { style: 'currency', decimals: 0 },
      },
    ],
    notes,
  }
}

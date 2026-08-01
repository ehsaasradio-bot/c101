import { CalcError } from '../../../lib/types'
import type { CalcResult, Part, Quantity, Series, Values } from '../../../lib/types'
import type { fields } from './fields'

/**
 * Time value of money — one formula read in two directions.
 *
 * With a periodic rate i = (annual rate / 100) / m and n = years x m periods:
 *
 *   growth factor    f    = (1 + i)^n
 *   discount factor  1/f  = (1 + i)^-n
 *
 *   PV of a future lump sum   PV  = FV / (1 + i)^n
 *   FV of a present lump sum  FV  = PV x (1 + i)^n
 *
 * and for a level ordinary annuity — one payment at the END of every period,
 * the convention behind every standard mortgage and pension table:
 *
 *   PV = PMT x (1 - (1 + i)^-n) / i
 *   FV = PMT x ((1 + i)^n - 1) / i
 *
 * Both annuity forms are 0/0 at i = 0. The limit is simply PMT x n — with no
 * interest, n payments are worth exactly n payments — so that case is branched
 * rather than divided.
 *
 * The two modes share a single growth factor and use its reciprocal as the
 * discount factor, so discounting is the exact arithmetic inverse of
 * compounding rather than a separate power that could drift from it.
 *
 * Anchor: at 5% compounded monthly over 20 years the annuity factor
 * (1 - (1 + i)^-n) / i is 151.5253, so a $100,000 20-year loan at 5% costs
 * 100000 / 151.5253 = $659.96 a month, the figure standard mortgage tables
 * print. Getting that number right is what pins the annuity form here.
 */

const MODES = ['pv', 'fv'] as const
type Mode = (typeof MODES)[number]

const isMode = (s: string): s is Mode => (MODES as readonly string[]).includes(s)

const money = (label: string, value: number, decimals = 0): Quantity => ({
  label,
  value,
  format: { style: 'currency', decimals },
})

export default function compute(v: Values<typeof fields>): CalcResult {
  const { amount, payment, annualRate, years } = v
  // `mode` and `frequency` are selects, so they arrive as strings.
  const mode = v.mode
  const m = Number(v.frequency)

  if (!isMode(mode)) throw new CalcError('Choose present value or future value.', 'mode')

  // Finiteness first: coerceValues emits NaN for unparseable input, and a
  // magnitude test like `amount < 0` is false for NaN, so it would slip through.
  if (!Number.isFinite(amount) || amount < 0)
    throw new CalcError('The lump sum cannot be negative.', 'amount')
  if (!Number.isFinite(payment) || payment < 0)
    throw new CalcError('The recurring payment cannot be negative.', 'payment')
  if (!Number.isFinite(annualRate) || annualRate < 0)
    throw new CalcError('The rate cannot be negative.', 'annualRate')
  if (!Number.isFinite(years) || years <= 0)
    throw new CalcError('Enter a horizon of at least 1 year.', 'years')
  if (!(m > 0)) throw new CalcError('Choose a payment frequency.', 'frequency')
  if (amount === 0 && payment === 0)
    throw new CalcError('Enter a lump sum, a recurring payment, or both.', 'amount')

  const discounting = mode === 'pv'
  const i = annualRate / 100 / m
  const n = Math.round(years * m)

  const factorAt = (periods: number) => Math.pow(1 + i, periods)
  const growthFactor = factorAt(n)
  const discountFactor = 1 / growthFactor

  /**
   * The annuity factor for `periods` level payments of 1 — (1 - (1 + i)^-n) / i
   * when discounting, ((1 + i)^n - 1) / i when growing. Two readings of the same
   * geometric series from opposite ends.
   *
   * Written with log1p/expm1 rather than by taking the power and subtracting
   * one: at a rate of 0.0000001% the two terms agree to fifteen digits, and the
   * naive subtraction cancels almost all of them away. The identity is exact —
   * (1 + i)^n - 1 IS expm1(n x log1p(i)) — this form simply keeps the digits.
   */
  const annuityFactor = (periods: number) => {
    if (i === 0) return periods // the 0/0 limit, not a division
    const exponent = periods * Math.log1p(i)
    return (discounting ? -Math.expm1(-exponent) : Math.expm1(exponent)) / i
  }

  const annuity = (periods: number) => payment * annuityFactor(periods)

  const lumpValue = discounting ? amount * discountFactor : amount * growthFactor
  const paymentsValue = annuity(n)
  const total = lumpValue + paymentsValue

  // Every dollar that actually changes hands, undiscounted.
  const nominal = amount + payment * n
  const timeEffect = discounting ? nominal - total : total - nominal

  const lumpLabel = discounting ? 'Lump sum, discounted' : 'Lump sum, grown'
  const paymentsLabel = discounting ? 'Payments, discounted' : 'Payments, grown'

  // ── Components of the headline ────────────────────────────────────────────
  // The two pieces ARE the headline by construction, so the total printed in
  // the middle of a donut can never disagree with its slices. A zero-valued
  // piece is dropped; both are present at the defaults, which is what makes the
  // donut render at all.
  const parts: Part[] = []
  if (lumpValue > 0)
    parts.push({ label: lumpLabel, value: lumpValue, format: { style: 'currency', decimals: 0 } })
  if (paymentsValue > 0)
    parts.push({
      label: paymentsLabel,
      value: paymentsValue,
      format: { style: 'currency', decimals: 0 },
    })

  // ── The same two closed forms, sampled over the horizon ───────────────────
  // Derived from the formulas above rather than re-simulated, so the curves and
  // the headline cannot drift apart. Thinned so a 50-year run stays inside the
  // ~45-point budget.
  const stride = Math.max(1, Math.ceil(years / 40))
  const sampleYears: number[] = []
  for (let t = 0; t <= years; t += stride) sampleYears.push(t)
  if (sampleYears[sampleYears.length - 1] !== years) sampleYears.push(years)

  // Discounting: "what the lump is worth today if it arrives in t years", which
  // decays. Growing: "what today's lump has become after t years", which rises.
  const lumpAt = (t: number) => {
    const f = factorAt(Math.round(t * m))
    return discounting ? amount / f : amount * f
  }
  const paymentsAt = (t: number) => annuity(Math.round(t * m))

  const series: Series[] = []
  if (amount > 0)
    series.push({
      label: lumpLabel,
      points: sampleYears.map((t) => [t, lumpAt(t)] as const),
      format: { style: 'currency', decimals: 0 },
    })
  if (payment > 0)
    series.push({
      label: paymentsLabel,
      points: sampleYears.map((t) => [t, paymentsAt(t)] as const),
      format: { style: 'currency', decimals: 0 },
    })

  const notes: string[] = [
    'Payments are treated as an ordinary annuity: one arrives at the end of every period, never at the start.',
  ]
  if (annualRate === 0)
    notes.push(
      'At a 0% rate nothing is discounted or grown, so the answer is simply the sum of the cash flows.',
    )
  notes.push(
    'The rate is assumed constant for the whole horizon, and tax, fees and inflation are ignored.',
  )

  return {
    primary: {
      label: discounting ? 'Present value' : 'Future value',
      value: total,
      format: { style: 'currency' },
    },
    stats: [
      money(discounting ? 'Total cash flows, undiscounted' : 'Total paid in', nominal),
      money(discounting ? 'Value lost to waiting' : 'Growth earned', timeEffect),
      {
        label: discounting ? 'What $1 at the end is worth now' : 'What $1 today becomes',
        value: discounting ? discountFactor : growthFactor,
        format: { style: 'currency', decimals: 4 },
      },
      { label: 'Periods', value: n, format: { style: 'decimal', decimals: 0 } },
      { label: 'Rate per period', value: i * 100, format: { style: 'percent', decimals: 4 } },
    ],
    steps: [
      money('Lump sum', amount),
      money('Payment per period', payment, 2),
      { label: 'Annual rate', value: annualRate, format: { style: 'percent', decimals: 2 } },
      { label: 'Periods per year', value: m, format: { style: 'decimal', decimals: 0 } },
      { label: 'Periods in total (n)', value: n, format: { style: 'decimal', decimals: 0 } },
      { rule: true },
      {
        label: discounting ? 'Discount factor (1 + i)^-n' : 'Growth factor (1 + i)^n',
        value: discounting ? discountFactor : growthFactor,
        format: { style: 'decimal', decimals: 6 },
      },
      {
        label: discounting
          ? 'Annuity factor (1 - (1 + i)^-n) / i'
          : 'Annuity factor ((1 + i)^n - 1) / i',
        value: annuityFactor(n),
        format: { style: 'decimal', decimals: 6 },
      },
      { rule: true },
      money(lumpLabel, lumpValue, 2),
      money(paymentsLabel, paymentsValue, 2),
      money(discounting ? 'Present value' : 'Future value', total, 2),
    ],
    parts,
    series,
    // The horizon is years in both directions, but the caption is not: the same
    // two curves fall towards today when discounting and rise away from it when
    // growing, so the title follows the mode the way the series labels do.
    chart: {
      title: discounting ? 'Value discounted back to today' : 'Value grown to the end of the term',
      xLabel: 'Years',
    },
    notes,
  }
}

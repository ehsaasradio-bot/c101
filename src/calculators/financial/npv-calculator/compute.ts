import { CalcError } from '../../../lib/types'
import type { CalcResult, Part, Quantity, Series, StepRule, Values } from '../../../lib/types'
import type { fields } from './fields'

/**
 * Net present value of a project, the textbook discounted-cash-flow definition
 * (Brealey, Myers & Allen, *Principles of Corporate Finance*, ch. 2):
 *
 *   NPV = −C₀ + Σ_{t=1..n} CFₜ / (1 + r)^t
 *
 * with the cash flow of year t assumed to arrive at the END of year t, which is
 * the ordinary convention and the one Excel's own NPV() uses.
 *
 * Three companion figures come out of the same cash-flow vector:
 *
 *   IRR   the discount rate at which NPV = 0 — "what does this actually earn".
 *   PI    the profitability index, PV of the money in ÷ PV of the money out.
 *         PI = 1 exactly when NPV = 0, so the two never disagree.
 *   DPP   the discounted payback period: the moment the cumulative discounted
 *         cash flow first turns non-negative, interpolated within the year.
 *
 * IRR is the delicate one, and this file is deliberately conservative about it.
 * NPV(r) is a polynomial in 1/(1+r), so by Descartes' rule it can have as many
 * roots as the cash flows have sign changes. A conventional project — one
 * outflow followed by inflows — changes sign once and has exactly one IRR. A
 * project that needs money again part-way through can have two or more, and
 * then "the" IRR does not exist: any single figure printed would be one
 * arbitrary root out of several, each equally true and each implying a
 * different decision. Cash flows that never turn NPV positive have none at all.
 *
 * So the search below BRACKETS rather than iterates from a guess: it walks a
 * grid of discount rates looking for sign changes, bisects each one it finds,
 * and reports the count honestly — a rate when there is exactly one, and a
 * plain-English refusal when there are none or several. It never returns a
 * half-solved number. This mirrors `apr-calculator`, which solves Regulation Z
 * the same way and returns null rather than a non-converged rate.
 */

// ── The cash-flow vector ──────────────────────────────────────────────────

/** More periods than this and the page is a spreadsheet, not a calculator. */
const MAX_PERIODS = 100

/**
 * Splits the single-line cash-flow field into numbers.
 *
 * Commas, semicolons and any run of whitespace all separate — those are the
 * three ways people actually paste a column of figures out of a spreadsheet,
 * and the newlines of a pasted column arrive flattened to spaces in a
 * single-line input.
 *
 * A comma is ambiguous: it separates values AND groups thousands, and it cannot
 * be doing both in the same string. The rule here is deterministic. A comma
 * wedged between a digit and exactly three more digits ("25,000") is treated as
 * a thousands mark only when the string offers some other separator as well —
 * whitespace or a semicolon — or when the whole entry is a SINGLE grouped
 * number, one comma and no more ("120,000").
 *
 * Two or more commas with nothing else to separate on read as separate values:
 * "100,200,300" is three years, which is the only reading that makes sense of a
 * field whose separator is the comma. The narrow single-comma exception exists
 * so that a lone "120,000" is not silently torn into 120 and 0 — the one case
 * where the value reading produces an obviously absurd 3-digit tail.
 */
function parseCashFlows(raw: string): number[] {
  // Currency symbols are noise, never data.
  let text = raw.replace(/[$£€¥]/g, '').trim()

  const hasOtherSeparator = /[\s;]/.test(text)
  // One comma group and no more. `(,\d{3})+` here would also match
  // "100,200,300", which the rule above says is three values, not one.
  const isOneGroupedNumber = /^\(?\s*-?\d{1,3},\d{3}(\.\d+)?\s*\)?$/.test(text)
  if (hasOtherSeparator || isOneGroupedNumber) {
    // Repeated because the groups overlap: "1,234,567" needs two passes.
    let previous: string
    do {
      previous = text
      text = text.replace(/(\d),(\d{3})(?!\d)/g, '$1$2')
    } while (text !== previous)
  }

  const tokens = text.split(/[\s,;]+/).filter((t) => t.length > 0)
  const flows: number[] = []
  for (const token of tokens) {
    // Accounting notation: a year in brackets is a year that lost money.
    const bracketed = /^\((.*)\)$/.exec(token)
    const body = bracketed ? bracketed[1]!.trim() : token
    // Number('') is 0, so an empty bracket pair has to be rejected explicitly.
    const n = body.length === 0 ? Number.NaN : Number(body)
    if (!Number.isFinite(n))
      throw new CalcError(
        `"${token}" is not a number. Separate the years with commas, spaces or semicolons.`,
        'cashFlows',
      )
    flows.push(bracketed ? -Math.abs(n) : n)
  }

  if (flows.length === 0)
    throw new CalcError('Enter at least one year of cash flow after the investment.', 'cashFlows')
  if (flows.length > MAX_PERIODS)
    throw new CalcError(`Enter at most ${MAX_PERIODS} years of cash flow.`, 'cashFlows')
  return flows
}

// ── NPV and the root search ───────────────────────────────────────────────

/**
 * NPV of the whole vector, `cf[0]` being the year-0 flow (negative for an
 * investment). Summed term by term, which is also exactly how the worked steps
 * below present it, so the headline and the working cannot drift apart.
 */
function npvAtRate(cf: readonly number[], rate: number): number {
  let sum = 0
  for (let t = 0; t < cf.length; t += 1) sum += cf[t]! / Math.pow(1 + rate, t)
  return sum
}

/**
 * The rates the root search samples, built once. Fine near the rates real
 * projects produce and progressively coarser out in the tail, spanning −99% to
 * +10,000%. Integer counters rather than an accumulating `+= 0.01`, so the grid
 * is exactly reproducible and strictly increasing.
 *
 * Stopping short of −100% is not a limitation to apologise for: at r = −1 the
 * discount factor is a division by zero and every future dollar is worth
 * infinitely much, so no rate at or below it is an answer to anything.
 */
function buildGrid(): number[] {
  const rates: number[] = []
  for (let i = -99; i < 100; i += 1) rates.push(i / 100) // −0.99 … 0.99, step 0.01
  for (let i = 20; i < 200; i += 1) rates.push(i / 20) // 1.00 … 9.95, step 0.05
  for (let i = 20; i <= 200; i += 1) rates.push(i / 2) // 10 … 100, step 0.5
  return rates
}
const GRID = buildGrid()

/**
 * Solves npv(rate) = 0 inside a bracket [lo, hi] by BISECTION.
 *
 * Bisection rather than Newton because the caller has already established a
 * sign change: every step then halves an interval that provably contains a
 * root, with no derivative, no starting guess, and no way to shoot off to a
 * different root — which is precisely the failure a multiple-IRR cash flow
 * provokes in a secant or Newton solver. About 60 halvings take the bracket
 * below the double-precision gap, so the loop exits on `mid === lo` well before
 * its cap.
 *
 * Returns null rather than a half-solved number when the residual does not
 * settle; the caller treats that as "no root here" rather than as an answer.
 */
function bisect(
  f: (rate: number) => number,
  lo: number,
  hi: number,
  tolerance: number,
): number | null {
  let a = lo
  let b = hi
  let fa = f(a)
  let fb = f(b)
  if (!Number.isFinite(fa) || !Number.isFinite(fb)) return null
  if (fa === 0) return a
  if (fb === 0) return b
  if (fa > 0 === fb > 0) return null

  for (let step = 0; step < 200; step += 1) {
    const mid = a + (b - a) / 2
    if (mid <= a || mid >= b) break
    const fm = f(mid)
    if (!Number.isFinite(fm)) return null
    if (fm === 0) return mid
    if (fm > 0 === fa > 0) {
      a = mid
      fa = fm
    } else {
      b = mid
      fb = fm
    }
  }

  const root = a + (b - a) / 2
  // Convergence is asserted, never assumed.
  if (!Number.isFinite(root) || Math.abs(f(root)) > tolerance) return null
  return root
}

/**
 * Every discount rate on the grid at which NPV crosses zero, in increasing
 * order. Zero of them means there is no IRR; more than one means the IRR is
 * ambiguous and must not be reported as a single figure.
 *
 * Two roots closer together than one grid step would be seen as none at all,
 * and a curve that merely touches zero without crossing is invisible to a
 * sign-change search. Both are pathological rather than merely unusual, and the
 * honest failure in each case is to under-report — which the caller renders as
 * "no IRR", not as a number.
 */
function findRoots(cf: readonly number[]): number[] {
  const gross = cf.reduce((sum, c) => sum + Math.abs(c), 0)
  const tolerance = 1e-7 * Math.max(1, gross)
  const f = (rate: number) => npvAtRate(cf, rate)

  const roots: number[] = []
  const add = (root: number) => {
    if (roots.some((existing) => Math.abs(existing - root) < 1e-9)) return
    roots.push(root)
  }

  let previousRate = GRID[0]!
  let previousValue = f(previousRate)
  for (let i = 1; i < GRID.length; i += 1) {
    const rate = GRID[i]!
    const value = f(rate)
    if (Number.isFinite(previousValue) && Number.isFinite(value)) {
      if (previousValue === 0) add(previousRate)
      if (value === 0) add(rate)
      else if (previousValue !== 0 && previousValue > 0 !== value > 0) {
        const root = bisect(f, previousRate, rate, tolerance)
        if (root !== null) add(root)
      }
    }
    previousRate = rate
    previousValue = value
  }
  return roots.sort((x, y) => x - y)
}

/** Sign changes in the cash-flow vector — the ceiling on the number of IRRs. */
function signChanges(cf: readonly number[]): number {
  let changes = 0
  let last = 0
  for (const c of cf) {
    if (c === 0) continue
    const sign = c > 0 ? 1 : -1
    if (last !== 0 && sign !== last) changes += 1
    last = sign
  }
  return changes
}

// ── Presentation helpers ─────────────────────────────────────────────────

const MONEY = { style: 'currency', decimals: 0 } as const
const RATE = { style: 'percent', decimals: 2 } as const
const YEARS = { style: 'decimal', decimals: 2, unit: 'years' } as const
const RAW = { style: 'raw' } as const

const percentText = (rate: number) => `${(rate * 100).toFixed(2)}%`
const moneyText = (amount: number) =>
  `${amount < 0 ? '−' : ''}$${Math.round(Math.abs(amount)).toLocaleString('en-US')}`

/** How many worked lines to show one at a time before aggregating the tail. */
const STEP_DETAIL_LIMIT = 20

// ── Compute ──────────────────────────────────────────────────────────────

export default function compute(v: Values<typeof fields>): CalcResult {
  const { initialInvestment, cashFlows, discountRate } = v

  // Guard finiteness FIRST: coerceValues emits NaN for unparseable input, and a
  // magnitude test like `initialInvestment < 0` is false for NaN, so it would
  // otherwise slip straight through to produce a NaN headline.
  if (!Number.isFinite(initialInvestment))
    throw new CalcError('Enter an upfront investment as a number.', 'initialInvestment')
  if (!Number.isFinite(discountRate))
    throw new CalcError('Enter a required rate of return as a number.', 'discountRate')
  if (!(initialInvestment > 0))
    throw new CalcError('Enter an upfront investment greater than 0.', 'initialInvestment')
  if (discountRate < 0)
    throw new CalcError('The required rate of return cannot be negative.', 'discountRate')

  const flows = parseCashFlows(cashFlows)
  const n = flows.length
  const r = discountRate / 100

  // Year 0 is the investment, spent today and therefore undiscounted.
  const cf = [-initialInvestment, ...flows]

  // Discounted flow of each year, computed once and reused everywhere below so
  // the headline, the steps, the payback and the parts are all the same numbers.
  const discounted = flows.map((c, i) => c / Math.pow(1 + r, i + 1))

  const pvFuture = discounted.reduce((sum, d) => sum + d, 0)
  const npv = pvFuture - initialInvestment

  // The two halves of the project, each a present value and each non-negative:
  // the money that comes in, and the money that goes out (the upfront cost plus
  // any later year that loses money). NPV is exactly their difference, and the
  // profitability index is exactly their ratio.
  const pvIn = discounted.reduce((sum, d) => sum + Math.max(0, d), 0)
  const pvOut = initialInvestment + discounted.reduce((sum, d) => sum + Math.max(0, -d), 0)
  const profitabilityIndex = pvIn / pvOut

  const grossIn = flows.reduce((sum, c) => sum + Math.max(0, c), 0)
  const undiscountedNet = flows.reduce((sum, c) => sum + c, 0) - initialInvestment
  const discountingCost = Math.max(0, grossIn - pvIn)

  // ── IRR ────────────────────────────────────────────────────────────────
  const roots = findRoots(cf)
  const changes = signChanges(cf)
  // One root and only one is an IRR. Anything else is reported as prose.
  const irr = roots.length === 1 ? roots[0]! : null

  let irrText: string
  if (irr !== null) {
    irrText = percentText(irr)
  } else if (roots.length > 1) {
    irrText = `Ambiguous — ${roots.length} rates give NPV of zero (${roots.map(percentText).join(', ')})`
  } else if (grossIn === 0) {
    irrText = 'Undefined — nothing ever comes back in'
  } else {
    irrText = 'Undefined — no discount rate from −99% to 10,000% brings NPV to zero'
  }

  // ── Payback ────────────────────────────────────────────────────────────
  /**
   * The year the running total first turns non-negative, interpolated inside
   * that year: the deficit still outstanding divided by the year's own inflow.
   * Whichever flows are handed in — discounted or not — the arithmetic is the
   * same, so one function serves both figures.
   */
  const paybackYear = (byYear: readonly number[]): number | null => {
    let cumulative = -initialInvestment
    for (let t = 0; t < byYear.length; t += 1) {
      const flow = byYear[t]!
      if (cumulative + flow >= 0) {
        // `cumulative` is strictly negative here (year 0 starts it below zero
        // and any earlier year that cleared it would have returned already), so
        // `flow` is strictly positive and this division is safe.
        return t + -cumulative / flow
      }
      cumulative += flow
    }
    return null
  }
  const discountedPayback = paybackYear(discounted)
  const simplePayback = paybackYear(flows)

  const neverRepaid = `Not repaid within the ${n} year${n === 1 ? '' : 's'} entered`

  // ── Parts ──────────────────────────────────────────────────────────────
  // ALWAYS two slices, whatever the input. The number of cash flows is itself
  // an input, so one slice per year would make the donut's shape depend on the
  // horizon — and a component that only appears for some inputs is never
  // server-rendered at all. The decomposition is fixed; the per-year detail
  // lives in the worked steps instead.
  //
  // A proportion needs non-negative components, and NPV goes either way, so the
  // two directions split two different wholes:
  //
  //  · A worthwhile project splits what the future is worth today: the present
  //    value it takes to fund it, plus the surplus left over.
  //  · A value-destroying one splits what it costs in today's money: the part
  //    the returns cover, plus the part they never do.
  //
  // The second slice is derived by subtraction in both branches, so the sum is
  // exact by construction rather than by luck, and clamped at zero because
  // floating point lands a hair below on round numbers.
  const money = MONEY
  let parts: Part[]
  let partsTotal: Quantity
  if (npv >= 0) {
    const surplus = Math.max(0, pvIn - pvOut)
    parts = [
      { label: 'Present value of the costs', value: pvOut, format: money },
      { label: 'Net present value', value: surplus, format: money },
    ]
    partsTotal = {
      label: 'Present value of the returns',
      value: pvOut + surplus,
      format: money,
    }
  } else {
    const shortfall = Math.max(0, pvOut - pvIn)
    parts = [
      { label: 'Covered by the returns', value: pvIn, format: money },
      { label: 'Shortfall', value: shortfall, format: money },
    ]
    partsTotal = {
      label: 'Present value of the costs',
      value: pvIn + shortfall,
      format: money,
    }
  }

  // ── Series ─────────────────────────────────────────────────────────────
  // ALWAYS two lines, whatever the input: the NPV profile, and the zero line it
  // has to cross for the project to be worth doing. The profile is the picture
  // of everything above — its crossing IS the IRR, and a curve that crosses
  // more than once is what "multiple IRRs" looks like.
  //
  // The span reaches past the furthest crossing so none is cut off, and past
  // the required rate so the visitor's own number is on the chart.
  const furthestCrossing = roots.length > 0 ? Math.max(...roots) * 100 : 0
  const rateCeiling = Math.min(
    600,
    Math.max(20, Math.ceil((Math.max(discountRate, furthestCrossing) * 1.4) / 5) * 5),
  )
  const PROFILE_POINTS = 41
  const xs: number[] = []
  for (let i = 0; i < PROFILE_POINTS; i += 1) xs.push((rateCeiling * i) / (PROFILE_POINTS - 1))

  // Move the NEAREST sample onto the visitor's own rate and pin its value to the
  // headline, so the curve passes exactly through the number printed above it.
  // An evenly spaced grid almost never lands on the rate by itself — at the
  // defaults it runs 0, 0.75, 1.5 … and steps straight over 10 — so a test for
  // equality here would be a pin that never fires.
  //
  // Ordering survives: the displaced sample moves by at most half a step, and
  // the rate is by construction strictly inside its two neighbours (were it
  // equal to one of them, that one would have been the nearest instead).
  let nearest = 0
  for (let i = 1; i < xs.length; i += 1)
    if (Math.abs(xs[i]! - discountRate) < Math.abs(xs[nearest]! - discountRate)) nearest = i
  xs[nearest] = discountRate

  const profile: Array<readonly [number, number]> = xs.map((x, i) => [
    x,
    i === nearest ? npv : npvAtRate(cf, x / 100),
  ])
  const zeroLine: Array<readonly [number, number]> = xs.map((x) => [x, 0])
  const series: Series[] = [
    { label: 'Net present value', points: profile, format: money },
    { label: 'Break-even (NPV = 0)', points: zeroLine, format: money },
  ]

  // ── Steps ──────────────────────────────────────────────────────────────
  const steps: Array<Quantity | StepRule> = [
    { label: 'Upfront investment (year 0)', value: -initialInvestment, format: money },
    { label: 'Discount rate', value: discountRate, format: RATE },
    { label: 'Years of cash flow', value: n, format: { style: 'decimal', decimals: 0 } },
    { rule: true },
  ]
  const detailed = Math.min(n, STEP_DETAIL_LIMIT)
  for (let t = 0; t < detailed; t += 1) {
    steps.push({
      label: `Year ${t + 1} cash flow, discounted ${t + 1} year${t === 0 ? '' : 's'}`,
      value: discounted[t]!,
      format: money,
    })
  }
  if (n > detailed) {
    const tail = discounted.slice(detailed).reduce((sum, d) => sum + d, 0)
    steps.push({
      label: `Years ${detailed + 1}–${n}, discounted`,
      value: tail,
      format: money,
    })
  }
  steps.push(
    { rule: true },
    { label: 'Present value of every future year', value: pvFuture, format: money },
    { label: 'Less the upfront investment', value: -initialInvestment, format: money },
    { rule: true },
    { label: 'Net present value', value: npv, format: money },
    irr !== null
      ? { label: 'Internal rate of return (the rate where NPV is 0)', value: irr * 100, format: RATE }
      : { label: 'Internal rate of return (the rate where NPV is 0)', value: irrText, format: RAW },
  )

  // ── Notes ──────────────────────────────────────────────────────────────
  const notes: string[] = []
  if (irr !== null) {
    const spread = irr * 100 - discountRate
    notes.push(
      spread >= 0
        ? `The project earns ${percentText(irr)} a year, ${spread.toFixed(2)} percentage points above the ${discountRate}% you require, which is why the NPV is positive.`
        : `The project earns only ${percentText(irr)} a year, ${Math.abs(spread).toFixed(2)} percentage points short of the ${discountRate}% you require, which is why the NPV is negative.`,
    )
  } else if (roots.length > 1) {
    notes.push(
      `These cash flows change direction ${changes} times, so ${roots.length} different discount rates each bring the NPV to zero: ${roots.map(percentText).join(' and ')}. There is no single internal rate of return to quote, and picking one of them would be arbitrary — judge the project on its NPV instead.`,
    )
  } else if (grossIn === 0) {
    notes.push(
      'Every year after the investment is an outflow, so the NPV is negative at any discount rate and there is no rate of return to find.',
    )
  } else {
    notes.push(
      'No discount rate between −99% and 10,000% brings the NPV to zero, so this project has no internal rate of return. That happens when the money coming back is too small next to the investment for any rate to close the gap.',
    )
  }

  if (changes > 1 && roots.length === 1)
    notes.push(
      `The cash flows change direction ${changes} times, which usually allows more than one internal rate of return. Only one exists here, but treat the figure with care and rank projects on NPV.`,
    )

  if (discountedPayback === null)
    notes.push(
      `The discounted cash flows never add back up to the ${moneyText(initialInvestment)} invested, so the money is not paid back within the ${n} year${n === 1 ? '' : 's'} entered.`,
    )

  notes.push(
    'Cash flows are assumed to arrive at the end of each year, and the discount rate is assumed to hold for the whole horizon. Change either assumption and the NPV moves.',
  )

  return {
    primary: { label: 'Net present value', value: npv, format: { style: 'currency', decimals: 0 } },
    // The profitability index, clamped onto the declared scale. The reported
    // index in the stats below is never clamped.
    scaleValue: Math.min(Math.max(profitabilityIndex, 0), 3),
    stats: [
      irr !== null
        ? { label: 'Internal rate of return', value: irr * 100, format: RATE }
        : { label: 'Internal rate of return', value: irrText, format: RAW },
      discountedPayback !== null
        ? { label: 'Discounted payback', value: discountedPayback, format: YEARS }
        : { label: 'Discounted payback', value: neverRepaid, format: RAW },
      simplePayback !== null
        ? { label: 'Simple payback (undiscounted)', value: simplePayback, format: YEARS }
        : { label: 'Simple payback (undiscounted)', value: neverRepaid, format: RAW },
      { label: 'Present value of the returns', value: pvIn, format: money },
      { label: 'Present value of the costs', value: pvOut, format: money },
      { label: 'Profitability index', value: profitabilityIndex, format: { style: 'decimal', decimals: 3 } },
      { label: 'Undiscounted net cash flow', value: undiscountedNet, format: money },
      { label: 'Value lost to discounting', value: discountingCost, format: money },
      { label: 'Years of cash flow', value: n, format: { style: 'decimal', decimals: 0 } },
    ],
    steps,
    parts,
    partsTotal,
    series,
    notes,
  }
}

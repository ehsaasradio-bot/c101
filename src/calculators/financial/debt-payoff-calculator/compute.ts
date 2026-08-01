import { CalcError } from '../../../lib/types'
import type { CalcResult, Part, Quantity, Series, Values } from '../../../lib/types'
import type { fields } from './fields'

/**
 * Debt snowball vs debt avalanche, on one fixed monthly budget.
 *
 * Both methods spend exactly the same money each month. Every debt gets its
 * required minimum, and whatever is left of the budget — the "snowball" — goes
 * to a single target debt. The methods differ only in which debt that is:
 *
 *   avalanche — highest interest rate first (ties broken by smaller balance)
 *   snowball  — smallest balance first (ties broken by higher rate)
 *
 * When a target clears, its minimum is freed and the whole surplus rolls onto
 * the next debt in the same order, which is why the payoff accelerates.
 *
 * Avalanche minimises total interest: with the same dollars applied each month,
 * putting the surplus where the rate is highest removes the most future
 * interest. Snowball clears individual accounts sooner, and the point of this
 * calculator is to show how small the price of that usually is.
 *
 * Minimum payments, where you do not state one, follow the standard US card
 * rule: 1% of the balance plus that month's interest, with a $25 floor, capped
 * at the amount actually owed. Installment loans (car, student, personal) have
 * a fixed contractual payment instead — type it as "min 265".
 */

/** The $25 minimum-payment floor almost every US issuer applies. */
const MIN_FLOOR = 25
/** 1% of principal, the other half of the standard card minimum. */
const MIN_PRINCIPAL_RATE = 0.01
/** 50 years. Anything slower is not a payoff plan; we refuse to model it. */
const MAX_MONTHS = 600
/** More than this and the text field has stopped being a list of debts. */
const MAX_DEBTS = 20
/** A single consumer debt beyond this is a data-entry slip, not a balance. */
const MAX_BALANCE = 10_000_000
/** Balances below this are floating-point dust from the final payment. */
const ZERO = 1e-7

interface Debt {
  name: string
  balance: number
  rate: number
  /** The contractual minimum, when the visitor supplied one. */
  minimum?: number
}

interface Plan {
  months: number
  interest: number
  /** `totals[k]` is everything still owed after k payments; `totals[0]` is the start. */
  totals: number[]
  /** Month each debt hit zero, in the order the debts were entered. */
  clearedAt: number[]
}

/**
 * Splits the single-line list into records, then reads each one.
 *
 * Records are separated by a semicolon, a comma, or a newline — never by a
 * space, because "Credit card: 6200" would be torn in half. Thousands
 * separators are stripped first so "6,200" survives the comma split.
 *
 * A record is `name: balance at rate% min payment`. The documented fallback,
 * for anything we cannot read as words, is positional: the first number is the
 * balance, the second is the annual rate, and an optional third is the required
 * minimum payment. Everything before the colon — or before the first digit when
 * there is no colon — is the name.
 */
function parseDebts(raw: string): Debt[] {
  // "6,200" → "6200", but "Visa: 6200, Car: 9800" keeps its separator, because
  // that comma is not sitting between digits.
  const cleaned = raw.replace(/(\d),(?=\d{3}(?!\d))/g, '$1')
  const records = cleaned
    .split(/[;\n,]+/)
    .map((r) => r.trim())
    .filter((r) => r.length > 0)

  if (records.length === 0)
    throw new CalcError(
      'List at least one debt, like "Credit card: 6200 at 24.99%".',
      'debts',
    )
  if (records.length > MAX_DEBTS)
    throw new CalcError(`That is more than ${MAX_DEBTS} debts. Combine the small ones.`, 'debts')

  return records.map((record, i) => {
    const colon = record.indexOf(':')
    let rawName: string
    let rest: string
    if (colon >= 0) {
      rawName = record.slice(0, colon)
      rest = record.slice(colon + 1)
    } else {
      // Everything up to the first digit is the name; "$" and the like fall out
      // in the tidy-up below.
      const lead = /^[^\d-]*/.exec(record)![0]
      rawName = lead
      rest = record.slice(lead.length)
    }

    const name =
      rawName
        .replace(/[^A-Za-z0-9 &'/-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || `Debt ${i + 1}`

    const numbers = (rest.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
    if (numbers.length < 2)
      throw new CalcError(
        `"${record}" needs a balance and a rate, like "Credit card: 6200 at 24.99%".`,
        'debts',
      )

    const [balance, rate, minimum] = numbers as [number, number, number | undefined]

    // Finiteness first: a magnitude test like `balance <= 0` is false for NaN,
    // so an unparseable figure would slip straight through it.
    if (!Number.isFinite(balance) || !(balance > 0))
      throw new CalcError(`${name} needs a balance greater than 0.`, 'debts')
    if (balance > MAX_BALANCE)
      throw new CalcError(`${name} has an implausibly large balance.`, 'debts')
    if (!Number.isFinite(rate) || rate < 0 || rate > 100)
      throw new CalcError(`${name} needs an annual rate between 0% and 100%.`, 'debts')
    if (minimum !== undefined && (!Number.isFinite(minimum) || minimum < 0))
      throw new CalcError(`${name} has a minimum payment that is not a positive amount.`, 'debts')

    return minimum === undefined ? { name, balance, rate } : { name, balance, rate, minimum }
  })
}

/** The minimum this debt demands this month, given the interest just charged. */
function requiredPayment(debt: Debt, openingBalance: number, interest: number): number {
  return debt.minimum ?? Math.max(interest + MIN_PRINCIPAL_RATE * openingBalance, MIN_FLOOR)
}

/**
 * Runs the whole plan month by month for one payoff order.
 *
 * `order` is a list of indices into `debts`, highest priority first. It is
 * fixed for the whole run: neither method re-sorts as balances change.
 */
function simulate(debts: readonly Debt[], budget: number, order: readonly number[]): Plan {
  const balances = debts.map((d) => d.balance)
  const monthlyRates = debts.map((d) => d.rate / 100 / 12)
  const clearedAt = debts.map(() => 0)
  const totals = [balances.reduce((acc, b) => acc + b, 0)]

  let interest = 0
  let months = 0
  let outstanding = totals[0]!

  while (outstanding > ZERO) {
    if (months >= MAX_MONTHS)
      throw new CalcError(
        'These debts take over 50 years to clear on that budget. Increase the monthly budget.',
        'monthlyBudget',
      )

    // 1. Charge a month of interest and work out what each debt demands.
    const required = balances.map(() => 0)
    for (let i = 0; i < balances.length; i += 1) {
      const opening = balances[i]!
      if (opening <= 0) continue
      const charge = opening * monthlyRates[i]!
      interest += charge
      balances[i] = opening + charge
      required[i] = Math.min(balances[i]!, requiredPayment(debts[i]!, opening, charge))
    }

    // 2. Pay every minimum. Both methods do this identically.
    let pool = budget
    for (let i = 0; i < balances.length; i += 1) {
      if (required[i]! <= 0) continue
      const payment = Math.min(required[i]!, balances[i]!, Math.max(0, pool))
      balances[i] = balances[i]! - payment
      pool -= payment
    }
    if (pool < -ZERO)
      throw new CalcError(
        'The minimum payments on these debts now add up to more than your budget, so the balances would keep growing.',
        'monthlyBudget',
      )

    // 3. Everything left goes to the target, cascading down the order when the
    //    target clears with money still in hand.
    for (const i of order) {
      if (pool <= ZERO) break
      if (balances[i]! <= 0) continue
      const payment = Math.min(pool, balances[i]!)
      balances[i] = balances[i]! - payment
      pool -= payment
    }

    months += 1
    for (let i = 0; i < balances.length; i += 1) {
      if (balances[i]! < ZERO) {
        balances[i] = 0
        if (clearedAt[i] === 0) clearedAt[i] = months
      }
    }
    outstanding = balances.reduce((acc, b) => acc + b, 0)
    totals.push(outstanding)
  }

  return { months, interest, totals, clearedAt }
}

/** Monthly totals, thinned so even a 600-month worst case ships ~41 points. */
function toPoints(plan: Plan, stride: number): Array<readonly [number, number]> {
  const points: Array<readonly [number, number]> = []
  for (let m = 0; m <= plan.months; m += stride) points.push([m, plan.totals[m]!])
  const last = points[points.length - 1]!
  if (last[0] !== plan.months) points.push([plan.months, plan.totals[plan.months]!])
  return points
}

export default function compute(v: Values<typeof fields>): CalcResult {
  const { debts: debtText, monthlyBudget } = v

  if (!Number.isFinite(monthlyBudget) || !(monthlyBudget > 0))
    throw new CalcError('Enter a monthly budget greater than 0.', 'monthlyBudget')

  const debts = parseDebts(debtText)
  const principal = debts.reduce((acc, d) => acc + d.balance, 0)
  const openingInterest = debts.reduce((acc, d) => acc + (d.balance * d.rate) / 1200, 0)
  const openingMinimums = debts.reduce(
    (acc, d) => acc + Math.min(d.balance, requiredPayment(d, d.balance, (d.balance * d.rate) / 1200)),
    0,
  )

  // Two cheap, specific refusals before the loop, so the common mistakes get a
  // useful message rather than the generic 50-year cap.
  if (monthlyBudget + ZERO < openingMinimums)
    throw new CalcError(
      'Your budget is less than the minimum payments these debts require, so this plan cannot start.',
      'monthlyBudget',
    )
  if (monthlyBudget <= openingInterest)
    throw new CalcError(
      'Your budget is smaller than the interest these debts accrue each month, so the total would never fall.',
      'monthlyBudget',
    )

  const indices = debts.map((_, i) => i)
  // Highest rate first; a tie goes to the smaller balance, which clears sooner.
  const avalancheOrder = [...indices].sort(
    (a, b) => debts[b]!.rate - debts[a]!.rate || debts[a]!.balance - debts[b]!.balance,
  )
  // Smallest balance first; a tie goes to the higher rate.
  const snowballOrder = [...indices].sort(
    (a, b) => debts[a]!.balance - debts[b]!.balance || debts[b]!.rate - debts[a]!.rate,
  )

  const avalanche = simulate(debts, monthlyBudget, avalancheOrder)
  const snowball = simulate(debts, monthlyBudget, snowballOrder)

  // Clamped because avalanche is never dearer in practice, and because floating
  // point can land an identical pair of runs a hair either side of zero.
  const interestSaved = Math.max(0, snowball.interest - avalanche.interest)
  const monthsSooner = Math.max(0, snowball.months - avalanche.months)
  const savedShare = snowball.interest > 0 ? (interestSaved / snowball.interest) * 100 : 0

  const stats: Quantity[] = [
    {
      label: 'Debt-free with snowball',
      value: snowball.months,
      format: { style: 'duration', from: 'months' },
    },
    {
      label: 'Months sooner with avalanche',
      value: monthsSooner,
      format: { style: 'decimal', decimals: 0, unit: monthsSooner === 1 ? 'month' : 'months' },
    },
    { label: 'Interest saved with avalanche', value: interestSaved, format: { style: 'currency' } },
    {
      label: 'Saved as a share of snowball interest',
      value: savedShare,
      format: { style: 'percent' },
    },
    { label: 'Total interest (avalanche)', value: avalanche.interest, format: { style: 'currency' } },
    { label: 'Total interest (snowball)', value: snowball.interest, format: { style: 'currency' } },
    { label: 'Total debt today', value: principal, format: { style: 'currency' } },
    {
      label: 'Total paid (avalanche)',
      value: principal + avalanche.interest,
      format: { style: 'currency' },
    },
    {
      label: 'First debt gone (snowball)',
      value: Math.min(...snowball.clearedAt),
      format: { style: 'duration', from: 'months' },
    },
    {
      label: 'First debt gone (avalanche)',
      value: Math.min(...avalanche.clearedAt),
      format: { style: 'duration', from: 'months' },
    },
  ]

  // Per-debt figures live here, where the count is free to follow the input.
  // `parts` and `series` below are deliberately fixed, because the debt count is
  // itself an input and the donut and chart are server-rendered once.
  for (let i = 0; i < debts.length; i += 1) {
    stats.push({
      label: `${debts[i]!.name} cleared`,
      value: `Month ${avalanche.clearedAt[i]} with avalanche, month ${snowball.clearedAt[i]} with snowball`,
      format: { style: 'raw' },
    })
  }

  const orderNames = (order: readonly number[]) => order.map((i) => debts[i]!.name).join(' → ')

  const steps: Array<Quantity | { rule: true }> = [
    { label: 'Debts entered', value: debts.length, format: { style: 'decimal', decimals: 0 } },
    { label: 'Total owed', value: principal, format: { style: 'currency' } },
    { label: 'Interest in the first month', value: openingInterest, format: { style: 'currency' } },
    { label: 'Minimum payments due', value: openingMinimums, format: { style: 'currency' } },
    { label: 'Monthly budget', value: monthlyBudget, format: { style: 'currency' } },
    {
      label: 'Left for the target debt',
      value: monthlyBudget - openingMinimums,
      format: { style: 'currency' },
    },
    { rule: true },
    { label: 'Avalanche order (rate first)', value: orderNames(avalancheOrder), format: { style: 'raw' } },
    { label: 'Snowball order (balance first)', value: orderNames(snowballOrder), format: { style: 'raw' } },
    { rule: true },
    {
      label: 'Avalanche: months to clear',
      value: avalanche.months,
      format: { style: 'decimal', decimals: 0 },
    },
    { label: 'Avalanche: total interest', value: avalanche.interest, format: { style: 'currency' } },
    {
      label: 'Snowball: months to clear',
      value: snowball.months,
      format: { style: 'decimal', decimals: 0 },
    },
    { label: 'Snowball: total interest', value: snowball.interest, format: { style: 'currency' } },
    { rule: true },
    { label: 'Interest avalanche saves', value: interestSaved, format: { style: 'currency' } },
  ]

  // Always three slices, whatever the debt count, so the donut the server
  // renders at the defaults is the donut every later result reconciles against.
  // The last is derived by subtraction from the snowball total, so the three
  // sum exactly by construction rather than by luck.
  const snowballTotalPaid = principal + avalanche.interest + interestSaved
  const parts: Part[] = [
    { label: 'The debt itself', value: principal, format: { style: 'currency', decimals: 0 } },
    {
      label: 'Interest with avalanche',
      value: avalanche.interest,
      format: { style: 'currency', decimals: 0 },
    },
    {
      label: 'Extra interest with snowball',
      value: interestSaved,
      format: { style: 'currency', decimals: 0 },
    },
  ]

  // Always two lines, for the same reason. The gap between them is the whole
  // argument, and both are read straight out of the simulation that produced
  // the headline, so the curves cannot drift from the numbers beside them.
  const stride = Math.max(1, Math.ceil(Math.max(avalanche.months, snowball.months) / 40))
  const series: Series[] = [
    {
      label: 'Balance with avalanche',
      points: toPoints(avalanche, stride),
      format: { style: 'currency', decimals: 0 },
    },
    {
      label: 'Balance with snowball',
      points: toPoints(snowball, stride),
      format: { style: 'currency', decimals: 0 },
    },
  ]

  return {
    primary: {
      label: 'Debt-free in',
      value: avalanche.months,
      format: { style: 'duration', from: 'months' },
    },
    scaleValue: avalanche.months,
    stats,
    steps,
    parts,
    partsTotal: {
      label: 'Total paid with snowball',
      value: snowballTotalPaid,
      format: { style: 'currency', decimals: 0 },
    },
    series,
    chart: { title: 'Balance under each strategy', xLabel: 'Months' },
    notes: [
      'Both methods spend the same amount every month. Only the order changes, so the difference between them is interest, not effort.',
      'Where you did not state a minimum payment, this uses the standard card rule: 1% of the balance plus that month’s interest, with a $25 floor. Give a car or student loan its real fixed payment as "min 265".',
      'Snowball clears its first account sooner, and that visible win is why many people stick with it. Compare the saving above against how much you value crossing a debt off the list.',
      'This assumes fixed rates, no new borrowing on these accounts, and no missed payments. A 0% promotional rate that expires needs re-entering at its new rate.',
    ],
  }
}

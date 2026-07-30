import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'
import type { Values } from '../../../lib/types'
import { defaultValues, resolveBand, toResultView } from '../../../lib/view'

const DEFAULT_DEBTS = fields[0].default
const base: Values<typeof fields> = { debts: DEFAULT_DEBTS, monthlyBudget: 950 }

const monthsOf = (r: ReturnType<typeof compute>) => Number(r.primary.value)
const statOf = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)

/**
 * An independent re-implementation, deliberately shaped differently from
 * `compute.ts`: it keeps one object per debt rather than parallel arrays, and it
 * derives total interest as (everything paid − the opening principal) instead of
 * summing the monthly charges. Two ways of getting the same number that share no
 * code, so agreement is evidence rather than a tautology.
 */
function reference(
  input: ReadonlyArray<{ balance: number; rate: number; minimum?: number }>,
  budget: number,
  method: 'avalanche' | 'snowball',
) {
  const book = input.map((d, i) => ({ i, balance: d.balance, rate: d.rate, minimum: d.minimum }))
  const principal = book.reduce((acc, d) => acc + d.balance, 0)
  const order = [...book].sort((a, b) =>
    method === 'avalanche' ? b.rate - a.rate || a.balance - b.balance : a.balance - b.balance || b.rate - a.rate,
  )

  let paid = 0
  let months = 0
  const clearedAt = book.map(() => 0)

  while (book.some((d) => d.balance > 1e-7)) {
    if (months > 1000) throw new Error('reference did not terminate')
    let spend = 0
    for (const d of book) {
      if (d.balance <= 0) continue
      const charge = (d.balance * d.rate) / 1200
      const due = d.minimum ?? Math.max(charge + d.balance / 100, 25)
      d.balance += charge
      const pay = Math.min(due, d.balance, Math.max(0, budget - spend))
      d.balance -= pay
      spend += pay
    }
    for (const d of order) {
      const room = budget - spend
      if (room <= 1e-7 || d.balance <= 0) continue
      const pay = Math.min(room, d.balance)
      d.balance -= pay
      spend += pay
    }
    paid += spend
    months += 1
    for (const d of book) {
      if (d.balance < 1e-7) {
        d.balance = 0
        if (clearedAt[d.i] === 0) clearedAt[d.i] = months
      }
    }
  }
  return { months, interest: paid - principal, paid, clearedAt }
}

const DEFAULT_BOOK = [
  { balance: 1400, rate: 0 },
  { balance: 6200, rate: 24.99 },
  { balance: 9800, rate: 6.9, minimum: 265 },
  { balance: 11500, rate: 5.5, minimum: 125 },
]

/**
 * The closed form for a single debt paid at a fixed amount: with
 * b(k+1) = b(k)(1+r) − P the balance reaches zero at
 * n* = −ln(1 − rB/P) / ln(1 + r), and the payoff month is ceil(n*).
 * A one-debt plan degenerates to exactly this, because every dollar of the
 * budget lands on the same balance whichever order you claim to be using.
 */
function monthsClosedForm(balance: number, apr: number, payment: number): number {
  const r = apr / 100 / 12
  if (r === 0) return Math.ceil(balance / payment)
  return Math.ceil(-Math.log(1 - (r * balance) / payment) / Math.log(1 + r))
}

describe('debt payoff at the defaults', () => {
  test('the four default debts clear in 34 months on the avalanche', () => {
    const r = compute(base)
    expect(monthsOf(r)).toBe(34)
    // Same month count from the independent simulator.
    expect(monthsOf(r)).toBe(reference(DEFAULT_BOOK, 950, 'avalanche').months)
  })

  test('the snowball takes one month longer and costs about $479 more', () => {
    const r = compute(base)
    expect(statOf(r, 'Debt-free with snowball')).toBe(35)
    expect(statOf(r, 'Months sooner with avalanche')).toBe(1)
    expect(statOf(r, 'Total interest (avalanche)')).toBeCloseTo(3183.77, 2)
    expect(statOf(r, 'Total interest (snowball)')).toBeCloseTo(3662.56, 2)
    expect(statOf(r, 'Interest saved with avalanche')).toBeCloseTo(478.79, 2)
  })

  test('both interest totals match the independent simulator', () => {
    const r = compute(base)
    expect(statOf(r, 'Total interest (avalanche)')).toBeCloseTo(
      reference(DEFAULT_BOOK, 950, 'avalanche').interest,
      6,
    )
    expect(statOf(r, 'Total interest (snowball)')).toBeCloseTo(
      reference(DEFAULT_BOOK, 950, 'snowball').interest,
      6,
    )
    expect(statOf(r, 'Debt-free with snowball')).toBe(reference(DEFAULT_BOOK, 950, 'snowball').months)
  })

  test('the two methods really do choose different targets first', () => {
    // The 0% medical bill is the smallest balance and the cheapest debt, so the
    // snowball opens on it and the avalanche leaves it for last. Without that
    // the comparison would have nothing to show.
    const r = compute(base)
    const avalanche = r.steps!.find(
      (s) => 'label' in s && s.label === 'Avalanche order (rate first)',
    ) as { value: string }
    const snowball = r.steps!.find(
      (s) => 'label' in s && s.label === 'Snowball order (balance first)',
    ) as { value: string }
    expect(avalanche.value.startsWith('Credit card')).toBe(true)
    expect(avalanche.value.endsWith('Medical bill')).toBe(true)
    expect(snowball.value.startsWith('Medical bill')).toBe(true)
    expect(statOf(r, 'First debt gone (snowball)')).toBeLessThan(
      statOf(r, 'First debt gone (avalanche)'),
    )
  })
})

describe('conservation and cross-checks', () => {
  const cases: Array<[string, number]> = [
    [DEFAULT_DEBTS, 950],
    [DEFAULT_DEBTS, 650],
    [DEFAULT_DEBTS, 2500],
    ['A: 500 at 19.9%; B: 900 at 12%; C: 3000 at 7%', 400],
    ['Loan: 22000 at 9.5% min 480; Card: 3100 at 27.99%', 900],
    ['One: 1000 at 0%; Two: 2000 at 0%; Three: 3000 at 0%', 500],
  ]

  test.each(cases)('total paid is principal plus interest for %s at $%d', (debts, budget) => {
    const r = compute({ debts, monthlyBudget: budget })
    const principal = statOf(r, 'Total debt today')
    const interest = statOf(r, 'Total interest (avalanche)')
    expect(statOf(r, 'Total paid (avalanche)')).toBeCloseTo(principal + interest, 8)
  })

  test.each(cases)('every month but the last spends the whole budget: %s at $%d', (debts, budget) => {
    const r = compute({ debts, monthlyBudget: budget })
    const months = monthsOf(r)
    const totalPaid = statOf(r, 'Total paid (avalanche)')
    // Nothing is held back, so the plan cannot finish a month early...
    expect(totalPaid).toBeGreaterThan((months - 1) * budget)
    // ...and it never spends more than the budget in any month.
    expect(totalPaid).toBeLessThanOrEqual(months * budget + 1e-6)
  })

  test.each(cases)('the avalanche is never dearer than the snowball: %s at $%d', (debts, budget) => {
    const r = compute({ debts, monthlyBudget: budget })
    expect(statOf(r, 'Total interest (avalanche)')).toBeLessThanOrEqual(
      statOf(r, 'Total interest (snowball)') + 1e-9,
    )
    expect(monthsOf(r)).toBeLessThanOrEqual(statOf(r, 'Debt-free with snowball'))
  })

  test('a single debt degenerates to the closed-form payoff formula', () => {
    // With one debt there is no ordering left to make, so this must agree with
    // the standard fixed-payment amortisation solved for n.
    for (const [balance, apr, payment] of [
      [5000, 22.9, 250],
      [12_500, 19.99, 400],
      [800, 29.99, 45],
      // $700, not less: a $25,000 card demands $562.50 of minimum on its own.
      [25_000, 15, 700],
      [3200, 0.9, 120],
    ] as const) {
      const r = compute({ debts: `Card: ${balance} at ${apr}%`, monthlyBudget: payment })
      expect(monthsOf(r)).toBe(monthsClosedForm(balance, apr, payment))
      expect(statOf(r, 'Debt-free with snowball')).toBe(monthsOf(r))
      expect(statOf(r, 'Interest saved with avalanche')).toBe(0)
    }
  })

  test('a single 0% debt is just the balance divided by the budget', () => {
    const r = compute({ debts: 'Medical: 4800 at 0%', monthlyBudget: 400 })
    expect(monthsOf(r)).toBe(12)
    expect(statOf(r, 'Total interest (avalanche)')).toBe(0)
    expect(statOf(r, 'Total paid (avalanche)')).toBeCloseTo(4800, 10)
  })

  test('a bigger budget always clears sooner and costs less interest', () => {
    const slow = compute({ ...base, monthlyBudget: 700 })
    const fast = compute({ ...base, monthlyBudget: 1800 })
    expect(monthsOf(fast)).toBeLessThan(monthsOf(slow))
    expect(statOf(fast, 'Total interest (avalanche)')).toBeLessThan(
      statOf(slow, 'Total interest (avalanche)'),
    )
  })

  test('nudging the first number field stays valid and moves the answer', () => {
    // The e2e suite bumps the first number field to 1.1x its default.
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('monthlyBudget')
    const nudged = compute({ ...base, monthlyBudget: first.default * 1.1 })
    expect(monthsOf(nudged)).toBeLessThan(monthsOf(compute(base)))
  })

  test('both declared budget bounds are values compute accepts', () => {
    // field-bounds.test.ts drags every slider to each end with the other fields
    // left at their defaults, so both of these must answer rather than throw.
    const budget = fields[1]
    expect(monthsOf(compute({ ...base, monthlyBudget: budget.min }))).toBeGreaterThan(0)
    expect(monthsOf(compute({ ...base, monthlyBudget: budget.max }))).toBeGreaterThan(0)
  })
})

describe('parsing the debt list', () => {
  const balancesOf = (debts: string, budget = 1500) =>
    statOf(compute({ debts, monthlyBudget: budget }), 'Total debt today')

  test('reads the documented "name: balance at rate%" form', () => {
    expect(balancesOf('Credit card: 6200 at 24.99%; Car loan: 9800 at 6.9%')).toBeCloseTo(16_000, 6)
  })

  test('accepts commas, semicolons and newlines as separators', () => {
    for (const sep of [';', ',', '\n', ' ; ', ', ']) {
      expect(balancesOf(`A: 1000 at 5%${sep}B: 2000 at 6%`)).toBeCloseTo(3000, 6)
    }
  })

  test('thousands separators survive the comma split', () => {
    expect(balancesOf('Card: 6,200 at 24.99%; Loan: 11,500 at 5.5%')).toBeCloseTo(17_700, 6)
  })

  test('currency and percent symbols are ignored', () => {
    expect(balancesOf('Card: $4,800 at 22.9%; Loan: $2,000 at 6%')).toBeCloseTo(6800, 6)
  })

  test('falls back to positional numbers when there are no words', () => {
    // First number is the balance, second the rate, third the minimum.
    const withWords = compute({
      debts: 'Card: 4000 at 20%; Loan: 8000 at 6% min 200',
      monthlyBudget: 900,
    })
    const positional = compute({ debts: '4000 20; 8000 6 200', monthlyBudget: 900 })
    expect(monthsOf(positional)).toBe(monthsOf(withWords))
    expect(statOf(positional, 'Total interest (avalanche)')).toBeCloseTo(
      statOf(withWords, 'Total interest (avalanche)'),
      8,
    )
  })

  test('unnamed debts still get a label of their own', () => {
    const r = compute({ debts: '4000 20; 8000 6', monthlyBudget: 900 })
    expect(r.stats!.some((s) => s.label === 'Debt 1 cleared')).toBe(true)
    expect(r.stats!.some((s) => s.label === 'Debt 2 cleared')).toBe(true)
  })

  test('a stated minimum is honoured rather than the 1%-plus-interest rule', () => {
    // A $600 contractual payment on the car forces money away from the card, so
    // the card takes longer and the whole plan costs more interest.
    const loose = compute({ debts: 'Card: 5000 at 25%; Car: 9000 at 5%', monthlyBudget: 800 })
    const forced = compute({
      debts: 'Card: 5000 at 25%; Car: 9000 at 5% min 600',
      monthlyBudget: 800,
    })
    expect(statOf(forced, 'Total interest (avalanche)')).toBeGreaterThan(
      statOf(loose, 'Total interest (avalanche)'),
    )
  })

  test('the default minimum follows the standard card rule', () => {
    // 1% of the balance plus the month's interest, floored at $25:
    // 6200 × 1% = 62.00, plus 6200 × 24.99% ÷ 12 = 129.12, so 191.12.
    // Alongside the $25 floor on the 0% bill and the two stated minimums, the
    // first month's minimums come to 606.12.
    const r = compute(base)
    const due = r.steps!.find((s) => 'label' in s && s.label === 'Minimum payments due') as {
      value: number
    }
    expect(due.value).toBeCloseTo(25 + 191.12 + 265 + 125, 2)
  })

  test('whitespace and trailing separators are forgiven', () => {
    expect(balancesOf('  Card: 1000 at 5% ;; Loan: 2000 at 6% ; ')).toBeCloseTo(3000, 6)
  })
})

describe('rejecting bad input', () => {
  const throwsFor = (values: Values<typeof fields>) => {
    let thrown: unknown
    try {
      compute(values)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    return thrown as CalcError
  }

  test.each([
    ['an empty list', { debts: '   ' }],
    ['a debt with no rate', { debts: 'Credit card: 6200' }],
    ['a zero balance', { debts: 'Card: 0 at 20%' }],
    ['a negative balance', { debts: 'Card: -500 at 20%' }],
    ['a rate above 100%', { debts: 'Card: 5000 at 250%' }],
    ['an implausible balance', { debts: 'Card: 99000000 at 5%' }],
    ['a negative minimum', { debts: 'Card: 5000 at 20% min -30' }],
    ['more than twenty debts', { debts: Array.from({ length: 21 }, (_, i) => `D${i}: 100 at 5%`).join(';') }],
  ])('rejects %s against the debts field', (_label, patch) => {
    expect(throwsFor({ ...base, ...patch }).fieldId).toBe('debts')
  })

  test.each([
    ['a zero budget', { monthlyBudget: 0 }],
    ['a negative budget', { monthlyBudget: -999_999 }],
    ['NaN', { monthlyBudget: Number.NaN }],
    ['a budget below the minimum payments', { monthlyBudget: 500 }],
  ])('rejects %s against the budget field', (_label, patch) => {
    expect(throwsFor({ ...base, ...patch }).fieldId).toBe('monthlyBudget')
  })

  test('a budget below the monthly interest is refused, not looped forever', () => {
    // $80,000 at 24% accrues $1,600 a month; the stated minimums are only $200,
    // so the budget clears them and still never touches the principal.
    const err = throwsFor({
      debts: 'Card: 80000 at 24% min 100; Other: 20000 at 24% min 100',
      monthlyBudget: 300,
    })
    expect(err.fieldId).toBe('monthlyBudget')
    expect(err.message).toMatch(/never/i)
  })

  test('a payoff beyond the 50-year cap is refused', () => {
    const err = throwsFor({ debts: 'Card: 900000 at 0% min 10', monthlyBudget: 1000 })
    expect(err.fieldId).toBe('monthlyBudget')
    expect(err.message).toMatch(/50 years/)
  })

  test('never returns NaN for an unparseable figure', () => {
    expect(() => compute({ ...base, debts: 'Card: many at lots%' })).toThrow(CalcError)
  })
})

describe('parts, series and the scale', () => {
  const sumParts = (r: ReturnType<typeof compute>) => r.parts!.reduce((acc, p) => acc + p.value, 0)

  test('parts are always the same three slices and sum exactly', () => {
    const r = compute(base)
    expect(r.parts!.map((p) => p.label)).toEqual([
      'The debt itself',
      'Interest with avalanche',
      'Extra interest with snowball',
    ])
    expect(r.partsTotal!.label).toBe('Total paid with snowball')
    expect(sumParts(r)).toBeCloseTo(Number(r.partsTotal!.value), 6)
    // The whole really is what the snowball costs: principal plus its interest.
    expect(Number(r.partsTotal!.value)).toBeCloseTo(
      statOf(r, 'Total debt today') + statOf(r, 'Total interest (snowball)'),
      6,
    )
  })

  test.each([
    ['two debts', 'Card: 4000 at 22%; Loan: 9000 at 6%'],
    ['three debts', 'A: 1200 at 26%; B: 4000 at 22%; C: 9000 at 6%'],
    ['five debts', 'A: 700 at 0%; B: 1200 at 26%; C: 4000 at 22%; D: 9000 at 6% min 220; E: 15000 at 5% min 160'],
    ['one debt', 'Only: 5000 at 18%'],
    ['the defaults', DEFAULT_DEBTS],
  ])('the count of parts and series does not follow the debt count: %s', (_label, debts) => {
    const r = compute({ debts, monthlyBudget: 950 })
    // THE point: the debt count is an input, and the donut and chart are
    // server-rendered once from the default result. One slice per debt would
    // make their number vary with input.
    expect(r.parts).toHaveLength(3)
    expect(r.series).toHaveLength(2)
    expect(sumParts(r)).toBeCloseTo(Number(r.partsTotal!.value), 4)
    for (const p of r.parts!) expect(p.value).toBeGreaterThanOrEqual(0)
    // Per-debt figures live in stats, where the count is free to vary.
    const perDebt = r.stats!.filter((s) => s.label.endsWith(' cleared'))
    expect(perDebt.length).toBe(debts.split(';').length)
  })

  test('both curves start at the full debt and end at zero', () => {
    const r = compute(base)
    const [avalanche, snowball] = r.series!
    expect(avalanche!.label).toBe('Balance with avalanche')
    expect(snowball!.label).toBe('Balance with snowball')
    for (const s of [avalanche!, snowball!]) {
      expect(s.points[0]).toEqual([0, 28_900])
      expect(s.points[s.points.length - 1]![1]).toBeCloseTo(0, 6)
    }
    // Each line ends on the month its own method reports.
    expect(avalanche!.points[avalanche!.points.length - 1]![0]).toBe(monthsOf(r))
    expect(snowball!.points[snowball!.points.length - 1]![0]).toBe(
      statOf(r, 'Debt-free with snowball'),
    )
  })

  test('the month-12 points match an independent month-by-month simulation', () => {
    const r = compute(base)
    for (const [label, method] of [
      ['Balance with avalanche', 'avalanche'],
      ['Balance with snowball', 'snowball'],
    ] as const) {
      // Re-run the reference for exactly 12 months and total what is left.
      const book = DEFAULT_BOOK.map((d) => ({ ...d }))
      const order = [...book].sort((a, b) =>
        method === 'avalanche'
          ? b.rate - a.rate || a.balance - b.balance
          : a.balance - b.balance || b.rate - a.rate,
      )
      for (let m = 0; m < 12; m += 1) {
        let spend = 0
        for (const d of book) {
          if (d.balance <= 0) continue
          const charge = (d.balance * d.rate) / 1200
          const due = d.minimum ?? Math.max(charge + d.balance / 100, 25)
          d.balance += charge
          const pay = Math.min(due, d.balance, Math.max(0, 950 - spend))
          d.balance -= pay
          spend += pay
        }
        for (const d of order) {
          const room = 950 - spend
          if (room <= 1e-7 || d.balance <= 0) continue
          const pay = Math.min(room, d.balance)
          d.balance -= pay
          spend += pay
        }
      }
      const expected = book.reduce((acc, d) => acc + Math.max(0, d.balance), 0)
      const charted = r.series!.find((s) => s.label === label)!.points.find((p) => p[0] === 12)!
      expect(charted[1]).toBeCloseTo(expected, 6)
    }
  })

  test('series stay ordered, finite and chartable across the input space', () => {
    for (const values of [
      base,
      { debts: DEFAULT_DEBTS, monthlyBudget: 650 },
      { debts: DEFAULT_DEBTS, monthlyBudget: 20_000 },
      // ~495 months, close to the 600-month cap, so the stride really thins.
      { debts: 'Loan: 240000 at 4% min 100', monthlyBudget: 1000 },
    ]) {
      for (const s of compute(values).series!) {
        expect(s.points.length).toBeGreaterThan(1)
        expect(s.points.length).toBeLessThanOrEqual(45)
        s.points.forEach((p, i) => {
          expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true)
          expect(p[1]).toBeGreaterThanOrEqual(0)
          if (i > 0) expect(p[0]).toBeGreaterThan(s.points[i - 1]![0])
        })
      }
    }
  })

  test('scaleValue is the avalanche month count and lands in the declared bands', () => {
    const r = compute(base)
    expect(r.scaleValue).toBe(monthsOf(r))
    expect(resolveBand(def.scale, r.scaleValue!)!.id).toBe('neutral')
    expect(resolveBand(def.scale, compute({ ...base, monthlyBudget: 3000 }).scaleValue!)!.id).toBe(
      'excellent',
    )
    expect(resolveBand(def.scale, compute({ ...base, monthlyBudget: 650 }).scaleValue!)!.id).toBe(
      'warn',
    )
  })
})

/**
 * The registry-wide conformance suite only sees this calculator once it is in
 * `src/calculators/index.ts`. Until then, these repeat its checks locally, so
 * registering the file cannot be the thing that discovers a broken shape.
 */
describe('conformance, ahead of registration', () => {
  test('copy fits a search result', () => {
    expect(def.description.length).toBeGreaterThan(50)
    expect(def.description.length).toBeLessThanOrEqual(160)
    expect(def.seoTitle.length).toBeLessThanOrEqual(70)
    expect(def.intro.length).toBeGreaterThan(40)
    expect(def.faqs.length).toBeGreaterThanOrEqual(3)
    for (const faq of def.faqs) {
      expect(faq.q.endsWith('?')).toBe(true)
      expect(faq.a.length).toBeGreaterThan(40)
    }
  })

  test('holds no colour, class name, or markup', () => {
    const serialized = JSON.stringify(def, (_k, v) => (typeof v === 'function' ? undefined : v))
    expect(serialized).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(serialized).not.toMatch(/\b(bg|text|border|rounded|shadow)-[a-z]+-\d{2,3}\b/)
    expect(serialized).not.toMatch(/<\/?[a-z][\s\S]*>/i)
  })

  test('fields and scale are well formed', () => {
    const ids = def.fields.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z][a-zA-Z0-9]*$/)
    for (const f of def.fields) {
      if (f.kind !== 'number') continue
      expect(f.default).toBeGreaterThanOrEqual(f.min)
      expect(f.default).toBeLessThanOrEqual(f.max)
    }
    def.scale.bands.forEach((band, i) => {
      expect(band.from).toBeLessThan(band.to)
      if (i > 0) expect(band.from).toBe(def.scale.bands[i - 1]!.to)
    })
    expect(def.related).not.toContain(def.slug)
  })

  test('renders to a complete view with no NaN and a resolved band', () => {
    const view = toResultView(compute(defaultValues(def as never) as never), def.scale)
    expect(view.primary.text).not.toContain('NaN')
    for (const s of view.stats) expect(s.text).not.toContain('NaN')
    for (const s of view.steps) if ('text' in s) expect(s.text).not.toContain('NaN')
    expect(view.band).toBeDefined()
    expect(view.scalePercent).toBeGreaterThanOrEqual(0)
    expect(view.scalePercent).toBeLessThanOrEqual(100)
  })

  test('anything drawable off-default is already drawable at the defaults', () => {
    // registry.test.ts sweeps every field across its range; this is the same
    // sweep, restricted to this calculator's own fields.
    const budget = def.fields[1]
    const probes: Array<Values<typeof fields>> = []
    for (const v of [budget.min, budget.max, budget.default, 1, 2, 5000, 10_000]) {
      probes.push({ debts: DEFAULT_DEBTS, monthlyBudget: v })
    }
    probes.push({ debts: DEFAULT_DEBTS, monthlyBudget: budget.default })

    const atDefault = compute(base)
    expect(atDefault.parts!.length).toBeGreaterThan(0)
    expect(atDefault.series!.length).toBeGreaterThan(0)

    for (const values of probes) {
      let result: ReturnType<typeof compute>
      try {
        result = compute(values)
      } catch {
        continue // a refusal is not an answer; there is no shape to check
      }
      expect(result.parts).toHaveLength(3)
      expect(result.series).toHaveLength(2)
      const whole = Number(result.partsTotal!.value)
      expect(result.parts!.reduce((acc, p) => acc + p.value, 0)).toBeCloseTo(whole, 4)
      for (const p of result.parts!) expect(p.value).toBeGreaterThanOrEqual(0)
      for (const s of result.series!) expect(s.points.length).toBeGreaterThan(1)
    }
  })
})

import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'
import { resolveBand } from '../../../lib/view'

type Input = Parameters<typeof compute>[0]
type Result = ReturnType<typeof compute>

// Not `as const`: that pins every property to its literal type and makes a
// spread override like `{ downPercent: 20 }` a compile error.
const base: Input = {
  homePrice: 400_000,
  downPercent: 15,
  closingCostPercent: 3,
  movingCosts: 3000,
  cashOnHand: 20_000,
  monthlySaving: 1200,
  rate: 6.5,
  years: '30',
}

const cash = (r: Result) => Number(r.primary.value)
const stat = (r: Result, label: string) => Number(r.stats!.find((s) => s.label === label)!.value)
// `'label' in s` narrows the Quantity | StepRule union, so no cast is needed.
const step = (r: Result, label: string) =>
  Number(r.steps!.flatMap((s) => ('label' in s && s.label === label ? [s.value] : []))[0])

/**
 * Independent amortization, month by month, from the same principal and rate but
 * a payment supplied by the caller. Ending on a zero balance after n payments is
 * the definition of the correct payment, so this checks the closed form without
 * reusing it.
 */
function balanceAfterAll(principal: number, annualRate: number, n: number, payment: number): number {
  const i = annualRate / 100 / 12
  let b = principal
  for (let k = 0; k < n; k++) b = b * (1 + i) - payment
  return b
}

describe('down payment — the cash', () => {
  test('the headline at the defaults is $75,000', () => {
    // 15% of $400,000 = $60,000 down; 3% = $12,000 closing; plus $3,000 moving.
    const r = compute(base)
    expect(cash(r)).toBe(75_000)

    // Second, independent derivation: one combined 18% of the price, computed in
    // integer cents so no floating point is involved, plus the flat moving cost.
    const cents = Math.round(400_000 * 100 * 18) / 100 + 3000 * 100
    expect(cents / 100).toBe(75_000)
  })

  test('the pieces are the ones the steps claim', () => {
    const r = compute(base)
    expect(step(r, 'Down payment')).toBe(60_000)
    expect(step(r, 'Closing costs')).toBe(12_000)
    expect(step(r, 'Moving & setup costs')).toBe(3000)
    expect(step(r, 'Cash needed up front')).toBe(75_000)
    // Share already saved: 20,000 / 75,000.
    expect(step(r, 'Share of the cash already saved')).toBeCloseTo((20_000 / 75_000) * 100, 9)
  })

  test('saving $1,200/mo closes a $55,000 gap in 46 months, and not in 45', () => {
    const r = compute(base)
    expect(stat(r, 'Cash still to save')).toBe(55_000)
    expect(stat(r, 'Time to save it')).toBe(46)
    // Independent check by multiplication rather than division.
    expect(45 * 1200).toBeLessThan(55_000)
    expect(46 * 1200).toBeGreaterThanOrEqual(55_000)
  })

  test('cash already covering the bill leaves nothing to save', () => {
    const r = compute({ ...base, cashOnHand: 90_000 })
    expect(stat(r, 'Cash still to save')).toBe(0)
    expect(stat(r, 'Time to save it')).toBe(0)
    expect(r.notes!.some((n) => n.includes('nothing left to save'))).toBe(true)
  })

  test('cash needed scales exactly with the price', () => {
    for (const homePrice of [50_000, 250_000, 400_000, 2_000_000]) {
      const r = compute({ ...base, homePrice, movingCosts: 0 })
      expect(cash(r)).toBeCloseTo(homePrice * 0.18, 6)
    }
  })
})

describe('down payment — the loan', () => {
  test('the monthly principal and interest amortizes to zero over the term', () => {
    const r = compute(base)
    const pi = step(r, 'Principal & interest')
    expect(stat(r, 'Loan amount')).toBe(340_000)
    // PMT = P·i(1+i)^n / ((1+i)^n − 1) at 6.5%/12 over 360 payments.
    expect(pi).toBeCloseTo(2149.031279876082, 9)
    // Independent confirmation: run the loan month by month at that payment and
    // the balance must land on zero.
    expect(balanceAfterAll(340_000, 6.5, 360, pi)).toBeCloseTo(0, 6)
    // And a payment one cent smaller must not clear it.
    expect(balanceAfterAll(340_000, 6.5, 360, pi - 0.01)).toBeGreaterThan(0)
  })

  test.each([
    ['30', 360],
    ['20', 240],
    ['15', 180],
    ['10', 120],
  ])('every offered term amortizes to zero: %s years', (years, n) => {
    const r = compute({ ...base, years })
    expect(step(r, 'Number of payments')).toBe(n)
    expect(balanceAfterAll(340_000, base.rate, n, step(r, 'Principal & interest'))).toBeCloseTo(0, 6)
  })

  test('a 0% loan is the principal spread evenly, with no division by zero', () => {
    const r = compute({ ...base, rate: 0 })
    expect(step(r, 'Principal & interest')).toBeCloseTo(340_000 / 360, 9)
    expect(step(r, 'Total interest over the term')).toBeCloseTo(0, 6)
  })

  test('total interest matches payment × count minus the loan', () => {
    const r = compute(base)
    const pi = step(r, 'Principal & interest')
    expect(step(r, 'Total interest over the term')).toBeCloseTo(pi * 360 - 340_000, 6)
  })

  test('loan-to-value is the complement of the down payment share', () => {
    for (const downPercent of [0, 3.5, 15, 20, 50, 100]) {
      expect(step(compute({ ...base, downPercent }), 'Loan-to-value')).toBeCloseTo(
        100 - downPercent,
        9,
      )
    }
  })

  test('paying the whole price in cash leaves no loan and no payment', () => {
    const r = compute({ ...base, downPercent: 100 })
    expect(stat(r, 'Loan amount')).toBe(0)
    expect(stat(r, 'Monthly payment (P&I + PMI)')).toBe(0)
    expect(stat(r, 'Monthly PMI')).toBe(0)
    expect(step(r, 'Total interest over the term')).toBe(0)
    for (const s of r.stats!) expect(Number.isFinite(Number(s.value))).toBe(true)
  })
})

describe('down payment — PMI', () => {
  test('PMI is 0.8%/yr of the loan while the down payment is under 20%', () => {
    const r = compute(base)
    expect(stat(r, 'Monthly PMI')).toBeCloseTo((340_000 * 0.008) / 12, 9)
    // Second way: 0.8% of 340,000 is 2,720 a year, so 226.66… a month.
    expect(stat(r, 'Monthly PMI')).toBeCloseTo(2720 / 12, 9)
    expect(stat(r, 'Monthly payment (P&I + PMI)')).toBeCloseTo(
      step(r, 'Principal & interest') + 2720 / 12,
      9,
    )
  })

  test('exactly 20% down is PMI-free, and a hair under is not', () => {
    expect(stat(compute({ ...base, downPercent: 20 }), 'Monthly PMI')).toBe(0)
    expect(stat(compute({ ...base, downPercent: 19.5 }), 'Monthly PMI')).toBeGreaterThan(0)
    expect(stat(compute({ ...base, downPercent: 25 }), 'Monthly PMI')).toBe(0)
  })

  test('the band agrees with the PMI charge at the 20% boundary', () => {
    expect(resolveBand(def.scale!, compute(base).scaleValue!)!.id).toBe('neutral')
    expect(resolveBand(def.scale!, 20)!.id).toBe('good')
    expect(resolveBand(def.scale!, 19.99)!.id).toBe('neutral')
    expect(resolveBand(def.scale!, 3)!.id).toBe('critical')
    expect(resolveBand(def.scale!, 35)!.id).toBe('excellent')
  })

  test('the extra down payment quoted to reach 20% actually reaches it', () => {
    const r = compute(base)
    const extra = step(r, 'Extra down payment to reach 20%')
    expect(extra).toBe(20_000)
    // Put that extra in and PMI goes away: 60,000 + 20,000 = 80,000 = 20% of 400,000.
    const lifted = compute({ ...base, downPercent: ((60_000 + extra) / 400_000) * 100 })
    expect(stat(lifted, 'Monthly PMI')).toBe(0)
    expect(step(compute({ ...base, downPercent: 30 }), 'Extra down payment to reach 20%')).toBe(0)
  })
})

describe('down payment — monotonicity and the e2e nudge', () => {
  test('nudging the first number field to 1.1x stays valid and moves the answer', () => {
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('homePrice')
    const nudged = compute({ ...base, homePrice: base.homePrice * 1.1 })
    // 400,000 × 1.1 is 440000.00000000006 in binary floating point, so this is
    // close-to rather than exact — the point is that the answer moved, not that
    // it landed on a round number.
    expect(cash(nudged)).toBeCloseTo(0.18 * 440_000 + 3000, 6)
    expect(cash(nudged)).not.toBe(cash(compute(base)))
  })

  test('more down means more cash up front and a smaller loan', () => {
    let previousCash = -Infinity
    let previousLoan = Infinity
    for (const downPercent of [0, 3.5, 10, 15, 20, 35, 100]) {
      const r = compute({ ...base, downPercent })
      expect(cash(r)).toBeGreaterThan(previousCash)
      expect(stat(r, 'Loan amount')).toBeLessThan(previousLoan)
      previousCash = cash(r)
      previousLoan = stat(r, 'Loan amount')
    }
  })

  test('saving more per month never takes longer', () => {
    let previous = Infinity
    for (const monthlySaving of [50, 200, 600, 1200, 5000, 20_000]) {
      const months = stat(compute({ ...base, monthlySaving }), 'Time to save it')
      expect(months).toBeLessThanOrEqual(previous)
      previous = months
    }
  })
})

describe('down payment — parts and series', () => {
  const inputs: Array<[string, Input]> = [
    ['the defaults', base],
    ['zero down', { ...base, downPercent: 0 }],
    ['all cash', { ...base, downPercent: 100 }],
    ['no closing costs or moving', { ...base, closingCostPercent: 0, movingCosts: 0 }],
    ['a cheap home, already funded', { ...base, homePrice: 50_000, cashOnHand: 500_000 }],
    ['the expensive end, saving slowly', { ...base, homePrice: 2_000_000, monthlySaving: 50 }],
    ['a 0% loan', { ...base, rate: 0 }],
  ]

  test.each(inputs)('parts are a fixed three-way split summing to the headline: %s', (_l, input) => {
    const r = compute(input)
    expect(r.parts).toHaveLength(3)
    expect(r.parts!.map((p) => p.label)).toEqual(['Down payment', 'Closing costs', 'Moving & setup'])
    const sum = r.parts!.reduce((s, p) => s + p.value, 0)
    expect(sum).toBeCloseTo(cash(r), 4)
    for (const p of r.parts!) {
      expect(p.value).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(p.value)).toBe(true)
    }
    // The parts decompose the primary, so no separate partsTotal is claimed.
    expect(r.partsTotal).toBeUndefined()
  })

  test.each(inputs)('two series, aligned, ordered, finite and thinned: %s', (_l, input) => {
    const r = compute(input)
    expect(r.series).toHaveLength(2)
    const [saved, target] = r.series!
    expect(saved!.label).toBe('Savings balance')
    expect(target!.label).toBe('Cash needed')
    expect(saved!.points.length).toBe(target!.points.length)
    expect(saved!.points.length).toBeGreaterThan(1)
    expect(saved!.points.length).toBeLessThanOrEqual(45)
    for (const s of r.series!) {
      s.points.forEach((p, i) => {
        expect(Number.isFinite(p[0])).toBe(true)
        expect(Number.isFinite(p[1])).toBe(true)
        if (i > 0) expect(p[0]).toBeGreaterThan(s.points[i - 1]![0])
      })
    }
    // The target line is the headline at every x — the chart cannot disagree
    // with the number printed above it.
    for (const [, y] of target!.points) expect(y).toBe(cash(r))
  })

  test('the savings line is the deposit schedule, and crosses the target on the reported month', () => {
    const r = compute(base)
    const saved = r.series![0]!
    for (const [x, y] of saved.points) expect(y).toBeCloseTo(20_000 + x * 1200, 6)
    const months = stat(r, 'Time to save it')
    expect(20_000 + months * 1200).toBeGreaterThanOrEqual(cash(r))
    expect(20_000 + (months - 1) * 1200).toBeLessThan(cash(r))
    // The horizon is the goal month itself once it is past the 12-month floor.
    expect(saved.points[saved.points.length - 1]![0]).toBe(months)
  })

  test('an already-funded purchase still charts a full twelve months', () => {
    const saved = compute({ ...base, cashOnHand: 500_000 }).series![0]!
    expect(saved.points[0]![1]).toBe(500_000)
    expect(saved.points[saved.points.length - 1]![0]).toBe(12)
  })

  test('a very long haul is capped and thinned rather than plotted per month', () => {
    // 2M home, 15% down + 3% + 3,000 moving = 363,000; from zero at $50/mo that
    // is 7,260 months, far past the 600-month chart horizon.
    const r = compute({ ...base, homePrice: 2_000_000, cashOnHand: 0, monthlySaving: 50 })
    expect(stat(r, 'Time to save it')).toBe(Math.ceil(363_000 / 50))
    const saved = r.series![0]!
    expect(saved.points[saved.points.length - 1]![0]).toBe(600)
    expect(saved.points.length).toBeLessThanOrEqual(45)
  })
})

describe('down payment — rejected input', () => {
  test.each([
    ['a zero home price', { homePrice: 0 }, 'homePrice'],
    ['a negative home price', { homePrice: -1 }, 'homePrice'],
    ['an unparseable home price', { homePrice: Number.NaN }, 'homePrice'],
    ['a negative down payment share', { downPercent: -1 }, 'downPercent'],
    ['more than 100% down', { downPercent: 101 }, 'downPercent'],
    ['an unparseable down payment share', { downPercent: Number.NaN }, 'downPercent'],
    ['negative closing costs', { closingCostPercent: -0.1 }, 'closingCostPercent'],
    ['negative moving costs', { movingCosts: -1 }, 'movingCosts'],
    ['negative savings', { cashOnHand: -1 }, 'cashOnHand'],
    ['saving nothing each month', { monthlySaving: 0 }, 'monthlySaving'],
    ['negative monthly saving', { monthlySaving: -100 }, 'monthlySaving'],
    ['an unparseable monthly saving', { monthlySaving: Number.NaN }, 'monthlySaving'],
    ['a negative rate', { rate: -1 }, 'rate'],
    ['an unparseable rate', { rate: Number.NaN }, 'rate'],
    ['a non-numeric term', { years: 'forever' }, 'years'],
    ['a zero term', { years: '0' }, 'years'],
  ])('rejects %s against the offending field', (_label, patch: Partial<Input>, fieldId) => {
    let thrown: unknown
    try {
      compute({ ...base, ...patch })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
  })

  test('never returns a NaN anywhere in the result', () => {
    for (const [, input] of [
      ['defaults', base],
      ['zero everything optional', { ...base, downPercent: 0, closingCostPercent: 0, movingCosts: 0, cashOnHand: 0, rate: 0 }],
    ] as Array<[string, Input]>) {
      const r = compute(input)
      expect(Number.isFinite(cash(r))).toBe(true)
      for (const s of r.stats!) expect(Number.isFinite(Number(s.value))).toBe(true)
      for (const s of r.steps!) if ('label' in s) expect(Number.isFinite(Number(s.value))).toBe(true)
      expect(Number.isFinite(r.scaleValue!)).toBe(true)
    }
  })
})

describe('down payment — every declared field bound computes', () => {
  // The form renders each number field as a slider, so both ends are one drag
  // away. Mirrors the registry-wide field-bounds sweep for this calculator only,
  // since it is not yet wired into the barrel.
  const numberFields = fields.filter((f) => f.kind === 'number')

  test.each(
    numberFields.flatMap((f) =>
      (['min', 'max'] as const)
        .filter((b) => f[b] !== undefined)
        .map((b) => [`${f.id}:${b}`, f.id, f[b]!] as const),
    ),
  )('%s is a value compute accepts', (_key, id, value) => {
    const r = compute({ ...base, [id]: value } as Input)
    expect(Number.isFinite(cash(r))).toBe(true)
  })

  test.each(def.fields.filter((f) => f.kind === 'select').flatMap((f) => f.options.map((o) => o.value)))(
    'the %s-year term computes',
    (years) => {
      expect(Number.isFinite(cash(compute({ ...base, years })))).toBe(true)
    },
  )
})

describe('down payment — copy conformance', () => {
  test('description, seo title and intro fit their slots', () => {
    expect(def.description.length).toBeGreaterThan(50)
    expect(def.description.length).toBeLessThanOrEqual(160)
    expect(def.seoTitle.length).toBeLessThanOrEqual(70)
    expect(def.intro.length).toBeGreaterThan(40)
  })

  test('at least three answered FAQs, and related slugs that are not itself', () => {
    expect(def.faqs.length).toBeGreaterThanOrEqual(3)
    for (const faq of def.faqs) {
      expect(faq.q.endsWith('?')).toBe(true)
      expect(faq.a.length).toBeGreaterThan(40)
    }
    expect(def.related).not.toContain(def.slug)
    expect(def.related.length).toBeGreaterThanOrEqual(2)
  })

  test('scale bands are ordered and contiguous', () => {
    const { bands, min, max } = def.scale!
    expect(min).toBeLessThan(max)
    bands.forEach((b, i) => {
      expect(b.from).toBeLessThan(b.to)
      if (i > 0) expect(b.from).toBe(bands[i - 1]!.to)
    })
    expect(bands[0]!.from).toBe(min)
    expect(bands[bands.length - 1]!.to).toBe(max)
  })
})

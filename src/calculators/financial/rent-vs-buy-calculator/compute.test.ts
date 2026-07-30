import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { CalcError } from '../../../lib/types'
import type { Quantity } from '../../../lib/types'
import { defaultValues, resolveBand } from '../../../lib/view'

type Input = Parameters<typeof compute>[0]

const base: Input = {
  homePrice: 400_000,
  monthlyRent: 2000,
  downPayment: 20,
  mortgageRate: 6.5,
  rentIncrease: 3,
  homeAppreciation: 3.5,
  annualCosts: 2.5,
  investmentReturn: 5,
}

const stat = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)

const seriesNamed = (r: ReturnType<typeof compute>, label: string) =>
  r.series!.find((s) => s.label === label)!

/**
 * An independent restatement of the whole model, deliberately built the other
 * way round from `compute.ts`:
 *
 *  - rent and ownership costs come from a closed-form geometric sum rather than
 *    a running total;
 *  - the loan balance comes from a month-by-month recursion rather than the
 *    closed-form amortization identity.
 *
 * Anything that agrees with both implementations has survived two different
 * arrangements of the same arithmetic, which is the point.
 */
function reference(v: Input, months: number) {
  const price = v.homePrice
  const deposit = price * (v.downPayment / 100)
  const loan = price - deposit
  const upfront = deposit + 0.02 * price
  const r = v.mortgageRate / 100 / 12
  const g = 1 + v.homeAppreciation / 100
  const ri = 1 + v.rentIncrease / 100
  const inv = 1 + v.investmentReturn / 100
  const c = v.annualCosts / 100

  const payment =
    loan === 0
      ? 0
      : r === 0
        ? loan / 360
        : (loan * r * Math.pow(1 + r, 360)) / (Math.pow(1 + r, 360) - 1)

  // Σ q^k for k = 0..n-1, with the removable singularity at q = 1 spelled out.
  const geom = (q: number, n: number) => (q === 1 ? n : (Math.pow(q, n) - 1) / (q - 1))
  const wholeYears = Math.floor(months / 12)
  const spareMonths = months % 12

  const rent =
    12 * v.monthlyRent * geom(ri, wholeYears) +
    spareMonths * v.monthlyRent * Math.pow(ri, wholeYears)
  const ownership =
    c * price * geom(g, wholeYears) + (spareMonths * c * price * Math.pow(g, wholeYears)) / 12

  let balance = loan
  for (let m = 0; m < months; m += 1) balance = balance * (1 + r) - payment
  balance = Math.min(loan, Math.max(0, balance))

  const value = price * Math.pow(g, months / 12)
  const buy =
    upfront +
    payment * months +
    ownership +
    upfront * (Math.pow(inv, months / 12) - 1) -
    (value * (1 - 0.06) - balance)

  return { payment, rent, buy, balance, value, ownership, loan, upfront }
}

describe('rent vs buy — the headline', () => {
  test('the mortgage payment matches the site’s own mortgage calculator', () => {
    // $400,000 at 6.5% over 30 years is $2,528.27/mo there; the loan here is 80%
    // of the price, and a fixed-rate payment is linear in the principal.
    expect(compute(base).stats![0]!.label).toBe('Monthly mortgage payment')
    expect(stat(compute(base), 'Monthly mortgage payment')).toBeCloseTo(2528.27 * 0.8, 2)
  })

  test('break-even at the defaults is 6.82 years', () => {
    expect(Number(compute(base).primary.value)).toBeCloseTo(6.8196, 4)
  })

  test('that break-even is where the independent reference crosses too', () => {
    // Bracket the crossing month by month using the reference implementation,
    // then interpolate exactly as compute does.
    let crossing: number | null = null
    for (let m = 1; m <= 360; m += 1) {
      const before = reference(base, m - 1)
      const now = reference(base, m)
      const gapBefore = before.buy - before.rent
      const gapNow = now.buy - now.rent
      if (gapNow <= 0) {
        crossing = (m - 1 + gapBefore / (gapBefore - gapNow)) / 12
        break
      }
    }
    expect(crossing).not.toBeNull()
    expect(crossing!).toBeCloseTo(Number(compute(base).primary.value), 8)
  })

  test('the crossing month really is the first one where buying is behind', () => {
    const years = Number(compute(base).primary.value)
    // 6.8196 years is 81.8 months, so month 81 must still favour renting and
    // month 82 must already favour buying.
    expect(Math.floor(years * 12)).toBe(81)
    const before = reference(base, 81)
    const after = reference(base, 82)
    expect(before.buy - before.rent).toBeGreaterThan(0)
    expect(after.buy - after.rent).toBeLessThanOrEqual(0)
  })

  test('the default lands in a band, and not on its edge', () => {
    const result = compute(defaultValues(def) as Input)
    expect(resolveBand(def.scale!, result.scaleValue!)!.id).toBe('good')
  })

  test('a 10% higher price pushes break-even years out — the e2e nudge', () => {
    const nudged = compute({ ...base, homePrice: 440_000 })
    expect(Number(nudged.primary.value)).toBeCloseTo(9.2851, 4)
    expect(Number(nudged.primary.value)).toBeGreaterThan(Number(compute(base).primary.value))
  })
})

describe('rent vs buy — the two curves', () => {
  test('renting starts at nothing and buying starts 8% of the price behind', () => {
    const r = compute(base)
    const rent = seriesNamed(r, 'Cumulative cost of renting')
    const buy = seriesNamed(r, 'Cumulative cost of buying')
    expect(rent.points[0]).toEqual([0, 0])
    // 2% to buy plus 6% to sell, with no time for anything else to happen.
    expect(buy.points[0]![1]).toBeCloseTo(0.08 * 400_000, 6)
  })

  test('every charted point matches the independent reference', () => {
    const r = compute(base)
    const rent = seriesNamed(r, 'Cumulative cost of renting')
    const buy = seriesNamed(r, 'Cumulative cost of buying')
    for (let t = 0; t <= 30; t += 1) {
      const ref = reference(base, t * 12)
      expect(rent.points[t]![1]).toBeCloseTo(ref.rent, 4)
      expect(buy.points[t]![1]).toBeCloseTo(ref.buy, 4)
    }
  })

  test('30 years of rent matches the closed-form geometric sum', () => {
    // 12 × 2000 × ((1.03^30 − 1) / 0.03)
    const expected = 12 * 2000 * ((Math.pow(1.03, 30) - 1) / 0.03)
    expect(expected).toBeCloseTo(1_141_809.98, 2)
    expect(stat(compute(base), 'Cost of renting for 30 years')).toBeCloseTo(expected, 4)
  })

  test('there are always exactly two series of 31 ordered points', () => {
    for (const patch of [
      {},
      { homeAppreciation: -5 },
      { mortgageRate: 0 },
      { downPayment: 100 },
      { investmentReturn: 0 },
      { annualCosts: 0 },
      { rentIncrease: 0 },
      { homePrice: 2_000_000 },
      { monthlyRent: 200 },
    ] as Array<Partial<Input>>) {
      const r = compute({ ...base, ...patch })
      expect(r.series).toHaveLength(2)
      for (const s of r.series!) {
        expect(s.points).toHaveLength(31)
        s.points.forEach((p, i) => {
          expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true)
          if (i > 0) expect(p[0]).toBeGreaterThan(s.points[i - 1]![0])
        })
      }
    }
  })
})

describe('rent vs buy — the cost identity', () => {
  /*
   * cost of buying = interest + ownership + opportunity + transaction − appreciation
   *
   * The principal cancels out because it comes back as equity. This is the same
   * quantity the simulation produces by a completely different route, so the two
   * agreeing is a real check rather than a restatement.
   */
  const step = (r: ReturnType<typeof compute>, label: string) => {
    const found = r.steps!.find(
      (s): s is Quantity => 'label' in s && s.label === label,
    )
    return Number(found!.value)
  }

  const decomposed = (r: ReturnType<typeof compute>) =>
    Number(r.partsTotal!.value) + step(r, 'Less appreciation')

  test('the parts plus appreciation reconstruct the 30-year cost of buying', () => {
    for (const patch of [
      {},
      { homeAppreciation: 0 },
      { homeAppreciation: -5 },
      { downPayment: 0 },
      { downPayment: 100 },
      { mortgageRate: 0 },
      { investmentReturn: 0 },
      { annualCosts: 0 },
      { homePrice: 1_250_000, monthlyRent: 4500, downPayment: 12, mortgageRate: 7.25 },
    ] as Array<Partial<Input>>) {
      const r = compute({ ...base, ...patch })
      expect(decomposed(r)).toBeCloseTo(stat(r, 'Cost of buying for 30 years'), 4)
    }
  })

  test('the parts sum exactly to their stated total and none is negative', () => {
    const r = compute(base)
    expect(r.parts!.map((p) => p.label)).toEqual([
      'Mortgage interest',
      'Tax, insurance & upkeep',
      'Opportunity cost of your cash',
      'Buying & selling costs',
    ])
    expect(r.parts!.reduce((s, p) => s + p.value, 0)).toBeCloseTo(Number(r.partsTotal!.value), 4)
    for (const p of r.parts!) expect(p.value).toBeGreaterThanOrEqual(0)
  })

  test('a zero component drops out without breaking the sum', () => {
    // A 100% deposit borrows nothing, so there is no interest slice at all.
    const r = compute({ ...base, downPayment: 100 })
    expect(r.parts!.map((p) => p.label)).not.toContain('Mortgage interest')
    expect(r.parts!).toHaveLength(3)
    expect(r.parts!.reduce((s, p) => s + p.value, 0)).toBeCloseTo(Number(r.partsTotal!.value), 4)
  })

  test('ownership costs match the closed-form geometric sum', () => {
    // 2.5% of a value growing at 3.5%: 0.025 × 400,000 × ((1.035^30 − 1)/0.035)
    const expected = 0.025 * 400_000 * ((Math.pow(1.035, 30) - 1) / 0.035)
    expect(expected).toBeCloseTo(516_226.77, 2)
    const r = compute(base)
    expect(r.parts!.find((p) => p.label === 'Tax, insurance & upkeep')!.value).toBeCloseTo(
      expected,
      4,
    )
  })

  test('the opportunity cost is the growth the upfront cash gave up', () => {
    // ($80,000 deposit + $8,000 closing) × (1.05^30 − 1)
    const expected = 88_000 * (Math.pow(1.05, 30) - 1)
    expect(expected).toBeCloseTo(292_330.93, 2)
    const r = compute(base)
    expect(r.parts!.find((p) => p.label === 'Opportunity cost of your cash')!.value).toBeCloseTo(
      expected,
      4,
    )
    expect(stat(r, 'Upfront cash to buy')).toBeCloseTo(88_000, 6)
  })

  test('mortgage interest is 360 payments less the principal', () => {
    const r = compute(base)
    const payment = stat(r, 'Monthly mortgage payment')
    expect(r.parts!.find((p) => p.label === 'Mortgage interest')!.value).toBeCloseTo(
      payment * 360 - 320_000,
      4,
    )
  })
})

describe('rent vs buy — when buying never wins', () => {
  test('a falling market gives a plain answer, not a misleading number', () => {
    const r = compute({ ...base, homeAppreciation: -5 })
    expect(r.primary.value).toBe('Not within 30 years')
    expect(r.primary.format).toEqual({ style: 'raw' })
    expect(r.scaleValue).toBe(30)
    expect(resolveBand(def.scale!, r.scaleValue!)!.id).toBe('critical')
    expect(r.notes![0]).toContain('never costs less than renting')
  })

  test('the reference agrees that no crossing exists in 30 years', () => {
    const v: Input = { ...base, homeAppreciation: -5 }
    for (let m = 1; m <= 360; m += 1) {
      const ref = reference(v, m)
      expect(ref.buy - ref.rent).toBeGreaterThan(0)
    }
  })

  test('renting costs less over the horizon in that case', () => {
    const r = compute({ ...base, homeAppreciation: -5 })
    expect(stat(r, 'Buying saves you over 30 years')).toBeLessThan(0)
  })

  test('the note is absent whenever there is a break-even', () => {
    const r = compute(base)
    expect(r.notes!.some((n) => n.includes('never costs less than renting'))).toBe(false)
    expect(stat(r, 'Buying saves you over 30 years')).toBeCloseTo(572_464.35, 1)
  })
})

describe('rent vs buy — degenerate inputs', () => {
  test('a 0% mortgage spreads the loan evenly instead of dividing by zero', () => {
    const r = compute({ ...base, mortgageRate: 0 })
    expect(stat(r, 'Monthly mortgage payment')).toBeCloseTo(320_000 / 360, 6)
    expect(r.parts!.map((p) => p.label)).not.toContain('Mortgage interest')
    expect(Number(r.primary.value)).toBeCloseTo(1.3966, 4)
  })

  test('a 100% deposit borrows nothing and pays no interest', () => {
    const r = compute({ ...base, downPayment: 100 })
    expect(stat(r, 'Monthly mortgage payment')).toBe(0)
    expect(stat(r, 'Upfront cash to buy')).toBeCloseTo(408_000, 6)
    expect(Number(r.primary.value)).toBeCloseTo(5.061, 3)
  })

  test('a 0% deposit still carries the closing costs as tied-up cash', () => {
    const r = compute({ ...base, downPayment: 0 })
    expect(stat(r, 'Upfront cash to buy')).toBeCloseTo(8000, 6)
    expect(Number(r.primary.value)).toBeCloseTo(7.0883, 4)
  })

  test('flat rent and no growth still produce a finite, ordered answer', () => {
    const r = compute({
      ...base,
      rentIncrease: 0,
      homeAppreciation: 0,
      investmentReturn: 0,
      annualCosts: 0,
    })
    expect(Number.isFinite(Number(r.primary.value))).toBe(true)
    expect(Number(r.primary.value)).toBeGreaterThan(0)
  })

  test('every slider end computes with the other fields at their defaults', () => {
    for (const field of def.fields) {
      if (field.kind !== 'number') continue
      for (const bound of [field.min, field.max]) {
        if (bound === undefined) continue
        const r = compute({ ...base, [field.id]: bound } as Input)
        const value = r.primary.value
        expect(
          typeof value === 'string' || Number.isFinite(value),
          `${field.id} = ${bound}`,
        ).toBe(true)
      }
    }
  })
})

describe('rent vs buy — rejected input', () => {
  test.each([
    ['a home price of zero', { homePrice: 0 }, 'homePrice'],
    ['a rent of zero', { monthlyRent: 0 }, 'monthlyRent'],
    ['a deposit over 100%', { downPayment: 101 }, 'downPayment'],
    ['a negative deposit', { downPayment: -1 }, 'downPayment'],
    ['a negative mortgage rate', { mortgageRate: -0.5 }, 'mortgageRate'],
    ['a negative rent increase', { rentIncrease: -1 }, 'rentIncrease'],
    ['a home worth less than nothing', { homeAppreciation: -100 }, 'homeAppreciation'],
    ['negative ownership costs', { annualCosts: -1 }, 'annualCosts'],
    ['a negative investment return', { investmentReturn: -1 }, 'investmentReturn'],
  ] as Array<[string, Partial<Input>, string]>)('rejects %s', (_label, patch, fieldId) => {
    let thrown: unknown
    try {
      compute({ ...base, ...patch })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
  })

  test.each([
    'homePrice',
    'monthlyRent',
    'downPayment',
    'mortgageRate',
    'rentIncrease',
    'homeAppreciation',
    'annualCosts',
    'investmentReturn',
  ])('never returns NaN when %s is unparseable', (id) => {
    // coerceValues emits NaN rather than throwing, and `x < 0` is false for NaN,
    // so the finiteness guard has to come first in every case.
    let thrown: unknown
    try {
      compute({ ...base, [id]: Number.NaN } as Input)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(id)
  })
})

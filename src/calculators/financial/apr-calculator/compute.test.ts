import { describe, expect, test } from 'vitest'
import compute from './compute'
import { CalcError } from '../../../lib/types'

const base = { amount: 250_000, rate: 6.5, years: 30, points: 1, fees: 2500 }

type Result = ReturnType<typeof compute>
const stat = (r: Result, label: string) => Number(r.stats!.find((s) => s.label === label)!.value)
const series = (r: Result, label: string) => r.series!.find((s) => s.label === label)!.points

/**
 * The reference solver for the tests: NEWTON on the same Regulation Z equation
 * the calculator bisects. A different algorithm reaching the same root is the
 * independent confirmation — bisection cannot agree with Newton by sharing a
 * bug, only by both being right.
 */
function newtonApr(payment: number, months: number, balloon: number, advanced: number, guess = 0.005) {
  let a = guess
  for (let k = 0; k < 200; k += 1) {
    const disc = Math.pow(1 + a, -months)
    const f = (payment * (1 - disc)) / a + balloon * disc - advanced
    const fp =
      payment * ((months * Math.pow(1 + a, -months - 1)) / a - (1 - disc) / (a * a)) -
      balloon * months * Math.pow(1 + a, -months - 1)
    const step = f / fp
    a -= step
    if (Math.abs(step) < 1e-16) break
  }
  return a * 1200
}

describe('apr', () => {
  test('$250k at 6.5% over 30 years with 1 point and $2,500 of fees', () => {
    const r = compute(base)
    // Confirmed two ways. (1) Newton on the same equation lands on the same
    // root to ten decimal places. (2) Discounting the 360 payments one at a
    // time at that monthly rate — no annuity formula anywhere — returns the
    // $245,000 actually advanced; see the test below.
    expect(Number(r.primary.value)).toBeCloseTo(6.6953169492, 8)
    expect(newtonApr(stat(r, 'Monthly payment'), 360, 0, 245_000)).toBeCloseTo(6.6953169492, 8)
    expect(stat(r, 'APR premium')).toBeCloseTo(0.1953169492, 8)
  })

  test('the scheduled payment is the ordinary amortization of the QUOTED rate', () => {
    const r = compute(base)
    // $1,580.17 is the published payment on a $250,000 30-year loan at 6.5%.
    expect(stat(r, 'Monthly payment')).toBeCloseTo(1580.170059, 6)
    // Independently: 360 payments of it drive the balance to zero.
    let balance = 250_000
    for (let m = 0; m < 360; m += 1) balance = balance * (1 + 6.5 / 1200) - 1580.1700587324
    expect(balance).toBeCloseTo(0, 6)
  })

  test('the solved rate discounts the payments back to the amount advanced', () => {
    const r = compute(base)
    const monthly = Number(r.primary.value) / 1200
    const payment = stat(r, 'Monthly payment')
    let pv = 0
    for (let m = 1; m <= 360; m += 1) pv += payment / Math.pow(1 + monthly, m)
    expect(pv).toBeCloseTo(stat(r, 'Amount advanced'), 4)
    expect(stat(r, 'Amount advanced')).toBe(245_000)
    expect(stat(r, 'Upfront costs')).toBe(5000)
  })

  test('with no points and no fees the APR is exactly the quoted rate', () => {
    // The closed-form anchor for the root-find: nothing is deducted, so the
    // equation is the payment formula read backwards and a = i identically.
    for (const [rate, years, amount] of [
      [6.5, 30, 250_000],
      [11.25, 7, 40_000],
      [3, 15, 1_000_000],
      [24.99, 2, 25_000],
    ] as const) {
      const r = compute({ amount, rate, years, points: 0, fees: 0 })
      expect(Number(r.primary.value)).toBeCloseTo(rate, 9)
      expect(stat(r, 'APR premium')).toBeCloseTo(0, 9)
    }
  })

  test('a 0% loan with no fees costs nothing and still returns a number', () => {
    const r = compute({ ...base, rate: 0, points: 0, fees: 0 })
    expect(Number(r.primary.value)).toBe(0)
    expect(stat(r, 'Total interest')).toBeCloseTo(0, 6)
    expect(stat(r, 'Monthly payment')).toBeCloseTo(250_000 / 360, 9)
  })

  test('a 0% loan with fees still has an APR above zero', () => {
    const r = compute({ ...base, rate: 0 })
    // Newton agrees: 360 payments of 250000/360, advanced 245000.
    expect(Number(r.primary.value)).toBeCloseTo(newtonApr(250_000 / 360, 360, 0, 245_000, 0.0001), 8)
    expect(Number(r.primary.value)).toBeGreaterThan(0)
  })

  test('more upfront cost means a higher APR, and the premium grows with it', () => {
    const none = Number(compute({ ...base, points: 0, fees: 0 }).primary.value)
    const some = Number(compute(base).primary.value)
    const lots = Number(compute({ ...base, points: 5, fees: 25_000 }).primary.value)
    expect(none).toBeLessThan(some)
    expect(some).toBeLessThan(lots)
    expect(none).toBeCloseTo(6.5, 9)
  })

  test('the same fee spread over a longer term costs less per year', () => {
    const short = Number(compute({ ...base, years: 10 }).primary.value)
    const long = Number(compute({ ...base, years: 30 }).primary.value)
    expect(long).toBeLessThan(short)
  })

  test('rejects input it cannot answer for, and never returns NaN', () => {
    expect(() => compute({ ...base, amount: 0 })).toThrow(CalcError)
    expect(() => compute({ ...base, amount: Number.NaN })).toThrow(CalcError)
    expect(() => compute({ ...base, rate: Number.NaN })).toThrow(CalcError)
    expect(() => compute({ ...base, years: Number.NaN })).toThrow(CalcError)
    expect(() => compute({ ...base, points: Number.NaN })).toThrow(CalcError)
    expect(() => compute({ ...base, fees: Number.NaN })).toThrow(CalcError)
    expect(() => compute({ ...base, rate: -0.5 })).toThrow(CalcError)
    expect(() => compute({ ...base, points: -1 })).toThrow(CalcError)
    expect(() => compute({ ...base, fees: -1 })).toThrow(CalcError)
    expect(() => compute({ ...base, years: 0 })).toThrow(CalcError)
    // Fees at or beyond the loan leave nothing advanced, so there is no rate.
    expect(() => compute({ ...base, fees: 250_000 })).toThrow(CalcError)
    expect(() => compute({ ...base, amount: 25_000, points: 5, fees: 25_000 })).toThrow(CalcError)
  })

  test('the error names the field the form should highlight', () => {
    try {
      compute({ ...base, fees: 250_000 })
      throw new Error('expected a CalcError')
    } catch (e) {
      expect(e).toBeInstanceOf(CalcError)
      expect((e as CalcError).fieldId).toBe('fees')
    }
  })

  test('every declared bound is answerable with the other fields at default', () => {
    const bounds = {
      amount: [25_000, 2_000_000],
      rate: [0, 25],
      years: [1, 40],
      points: [0, 5],
      fees: [0, 25_000],
    } as const
    for (const [id, ends] of Object.entries(bounds)) {
      for (const value of ends) {
        const r = compute({ ...base, [id]: value })
        const apr = Number(r.primary.value)
        expect(Number.isFinite(apr), `${id}=${value}`).toBe(true)
        expect(apr, `${id}=${value}`).toBeGreaterThanOrEqual(0)
      }
    }
  })

  test('the first field nudged 1.1x changes the headline, as the e2e suite demands', () => {
    const at = (amount: number) => Number(compute({ ...base, amount }).primary.value)
    expect(at(275_000).toFixed(3)).not.toBe(at(250_000).toFixed(3))
    // A bigger loan dilutes the fixed $2,500 of fees, so the APR falls.
    expect(at(275_000)).toBeLessThan(at(250_000))
  })
})

describe('apr parts and series', () => {
  const sumParts = (r: Result) => r.parts!.reduce((acc, p) => acc + p.value, 0)

  test('parts split the total cost and sum to it exactly', () => {
    const r = compute(base)
    expect(r.parts!.map((p) => p.label)).toEqual(['Principal', 'Interest', 'Upfront costs'])
    // 360 × 1580.1700587324 = 568,861.22 repaid, of which 318,861.22 is interest.
    expect(r.parts![1]!.value).toBeCloseTo(318_861.221144, 4)
    expect(Number(r.partsTotal!.value)).toBeCloseTo(573_861.221144, 4)
    expect(sumParts(r)).toBeCloseTo(Number(r.partsTotal!.value), 6)
    expect(stat(r, 'Total cost of credit')).toBeCloseTo(318_861.221144 + 5000, 4)
  })

  test('the part and series counts never vary with the input', () => {
    for (const v of [
      base,
      { ...base, rate: 0, points: 0, fees: 0 },
      { ...base, years: 1 },
      { ...base, years: 40 },
      { ...base, amount: 2_000_000, points: 5, fees: 25_000 },
    ]) {
      const r = compute(v)
      expect(r.parts!.length).toBe(3)
      expect(r.series!.length).toBe(2)
      for (const p of r.parts!) expect(p.value).toBeGreaterThanOrEqual(0)
      expect(sumParts(r)).toBeCloseTo(Number(r.partsTotal!.value), 4)
    }
  })

  test('the early-payoff curve starts high and ends on the headline APR', () => {
    const r = compute(base)
    const pts = series(r, 'Effective APR if repaid early')
    expect(pts.length).toBe(30)
    expect(pts[0]![0]).toBe(1)
    // Held one year, the $5,000 of costs is recovered over a thirtieth of the
    // term; Newton on the same one-year cash flows (12 payments plus the
    // $247,205.69 balance) gives 8.6049318079%.
    expect(pts[0]![1]).toBeCloseTo(8.6049318079, 7)
    expect(pts[pts.length - 1]!).toEqual([30, Number(r.primary.value)])
    for (let k = 1; k < pts.length; k += 1) {
      expect(pts[k]![0]).toBeGreaterThan(pts[k - 1]![0])
      expect(pts[k]![1]).toBeLessThan(pts[k - 1]![1])
      expect(pts[k]![1]).toBeGreaterThan(6.5)
    }
  })

  test('the quoted-rate line is flat at the rate typed in, over the same x', () => {
    const r = compute({ ...base, rate: 7.25 })
    const apr = series(r, 'Effective APR if repaid early')
    const quoted = series(r, 'Quoted rate')
    expect(quoted.map((p) => p[0])).toEqual(apr.map((p) => p[0]))
    for (const p of quoted) expect(p[1]).toBe(7.25)
  })

  test('series stay ordered, finite and chartable across the input space', () => {
    for (const v of [
      base,
      { ...base, years: 1 },
      { ...base, years: 3 },
      { ...base, years: 40 },
      { ...base, rate: 0, points: 0, fees: 0 },
      { ...base, amount: 25_000, fees: 0, points: 0 },
    ]) {
      for (const s of compute(v).series!) {
        expect(s.points.length).toBeGreaterThan(1)
        expect(s.points.length).toBeLessThanOrEqual(45)
        s.points.forEach((p, k) => {
          expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true)
          if (k > 0) expect(p[0]).toBeGreaterThan(s.points[k - 1]![0])
        })
      }
    }
  })

  test('a one-year term charts month by month rather than collapsing to a dot', () => {
    const pts = series(compute({ ...base, years: 1 }), 'Effective APR if repaid early')
    expect(pts.length).toBe(12)
    expect(pts[0]![0]).toBeCloseTo(1 / 12, 9)
    expect(pts[11]![0]).toBe(1)
  })

  test('the scale value is the premium the donut and dial both describe', () => {
    const r = compute(base)
    expect(r.scaleValue).toBeCloseTo(0.1953169492, 8)
    expect(r.scaleValue).toBeCloseTo(Number(r.primary.value) - 6.5, 12)
    expect(compute({ ...base, points: 0, fees: 0 }).scaleValue).toBeCloseTo(0, 9)
  })
})

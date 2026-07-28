import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'
import { resolveBand } from '../../../lib/view'

const base = {
  principal: 10_000,
  annualRate: 7,
  years: 20,
  compoundsPerYear: '12',
  monthlyContribution: 200,
} as const

const stat = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)

/** Month-by-month simulation: independent of the closed form under test. */
function simulateMonthly(
  principal: number,
  annualRate: number,
  years: number,
  monthlyContribution: number,
) {
  const monthly = annualRate / 100 / 12
  let balance = principal
  for (let m = 0; m < years * 12; m++) {
    balance = balance * (1 + monthly) + monthlyContribution
  }
  return balance
}

describe('compound interest', () => {
  test('$1,000 at 5% compounded annually for 10 years is $1,628.89', () => {
    // 1000 × 1.05^10, a textbook value: 1628.894626777442
    const r = compute({
      principal: 1000,
      annualRate: 5,
      years: 10,
      compoundsPerYear: '1',
      monthlyContribution: 0,
    })
    expect(Number(r.primary.value)).toBeCloseTo(1628.894627, 6)
    expect(stat(r, 'Total contributed')).toBe(1000)
    expect(stat(r, 'Total interest')).toBeCloseTo(628.894627, 6)
  })

  test('the closed form matches a month-by-month simulation', () => {
    const r = compute(base)
    const simulated = simulateMonthly(10_000, 7, 20, 200)
    expect(Number(r.primary.value)).toBeCloseTo(simulated, 6)
    // and the simulation is nowhere near the no-interest total, so this is a
    // real check rather than a coincidence of small numbers
    expect(simulated).toBeGreaterThan(10_000 + 200 * 240)
  })

  test('a monthly-equivalent rate reproduces annual compounding month by month', () => {
    // With n = 1 the contributions must still grow, at (1 + r)^(1/12) − 1 per
    // month. Simulate at that rate and compare to the closed form.
    const monthly = Math.pow(1.05, 1 / 12) - 1
    let balance = 2000
    for (let m = 0; m < 12 * 8; m++) balance = balance * (1 + monthly) + 100
    const r = compute({
      principal: 2000,
      annualRate: 5,
      years: 8,
      compoundsPerYear: '1',
      monthlyContribution: 100,
    })
    expect(Number(r.primary.value)).toBeCloseTo(balance, 6)
    // The lump sum half must still be exactly P(1 + r)^t.
    expect(stat(r, 'Effective annual rate')).toBeCloseTo(5, 9)
  })

  test('a 0% rate is a plain sum, with no interest and no division by zero', () => {
    const r = compute({ ...base, annualRate: 0 })
    expect(Number(r.primary.value)).toBeCloseTo(10_000 + 200 * 240, 9)
    expect(stat(r, 'Total interest')).toBeCloseTo(0, 9)
    expect(r.scaleValue).toBeCloseTo(0, 9)
    expect(resolveBand(def.scale, r.scaleValue!)!.id).toBe('neutral')
  })

  test('more frequent compounding never loses to less frequent', () => {
    const annual = Number(compute({ ...base, compoundsPerYear: '1' }).primary.value)
    const quarterly = Number(compute({ ...base, compoundsPerYear: '4' }).primary.value)
    const monthly = Number(compute({ ...base, compoundsPerYear: '12' }).primary.value)
    const daily = Number(compute({ ...base, compoundsPerYear: '365' }).primary.value)
    expect(quarterly).toBeGreaterThan(annual)
    expect(monthly).toBeGreaterThan(quarterly)
    expect(daily).toBeGreaterThan(monthly)
    // but the whole spread is small — the point of the FAQ
    expect(daily - annual).toBeLessThan(monthly * 0.05)
  })

  test('scaleValue is total interest as a share of everything paid in', () => {
    const r = compute(base)
    expect(r.scaleValue).toBeCloseTo(
      (stat(r, 'Total interest') / stat(r, 'Total contributed')) * 100,
      9,
    )
    expect(stat(r, 'Growth on what you put in')).toBeCloseTo(r.scaleValue!, 9)
  })

  test('nudging the first number field 1.1x stays valid and moves the result', () => {
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('principal')
    const nudged = { ...base, principal: first.default * 1.1 }
    expect(first.default * 1.1).toBeLessThanOrEqual(first.max!)
    expect(Number(compute(nudged).primary.value)).toBeGreaterThan(
      Number(compute(base).primary.value),
    )
  })

  test.each([
    ['negative principal', { principal: -1 }, 'principal'],
    ['negative rate', { annualRate: -0.5 }, 'annualRate'],
    ['zero years', { years: 0 }, 'years'],
    ['negative contribution', { monthlyContribution: -50 }, 'monthlyContribution'],
    ['nothing invested at all', { principal: 0, monthlyContribution: 0 }, 'principal'],
  ])('rejects %s', (_label, patch, fieldId) => {
    let thrown: unknown
    try {
      compute({ ...base, ...patch })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
  })

  test('never returns NaN for a blank numeric input', () => {
    expect(() => compute({ ...base, principal: Number.NaN })).toThrow(CalcError)
  })
})

describe('parts and series', () => {
  const base = { principal: 10_000, annualRate: 7, years: 20, compoundsPerYear: '12', monthlyContribution: 200 } as const

  test('parts sum to the final balance', () => {
    const r = compute(base)
    const sum = r.parts!.reduce((s, p) => s + p.value, 0)
    expect(sum).toBeCloseTo(Number(r.primary.value), 6)
  })

  test('the balance curve ends exactly on the headline figure', () => {
    const r = compute(base)
    const balance = r.series!.find((s) => s.label === 'Balance')!
    const last = balance.points[balance.points.length - 1]!
    expect(last[0]).toBe(20)
    expect(last[1]).toBeCloseTo(Number(r.primary.value), 6)
  })

  test('the curve starts at the starting balance and never falls', () => {
    const balance = compute(base).series!.find((s) => s.label === 'Balance')!
    expect(balance.points[0]![1]).toBeCloseTo(10_000, 6)
    for (let i = 1; i < balance.points.length; i++) {
      expect(balance.points[i]![1]).toBeGreaterThan(balance.points[i - 1]![1])
    }
  })

  test('balance stays at or above contributed at every point', () => {
    const r = compute(base)
    const bal = r.series!.find((s) => s.label === 'Balance')!.points
    const con = r.series!.find((s) => s.label === 'Contributed')!.points
    expect(bal.length).toBe(con.length)
    bal.forEach((p, i) => expect(p[1]).toBeGreaterThanOrEqual(con[i]![1] - 1e-6))
  })

  test('long horizons stay thinned rather than shipping a point per year', () => {
    const r = compute({ ...base, years: 100 })
    expect(r.series![0]!.points.length).toBeLessThanOrEqual(45)
    expect(r.series![0]!.points[r.series![0]!.points.length - 1]![0]).toBe(100)
  })
})

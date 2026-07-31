import { describe, expect, test } from 'vitest'
import compute from './compute'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'
import type { Values } from '../../../lib/types'
import def from './index'
import { defaultValues, toResultView } from '../../../lib/view'

type Input = Values<typeof fields>
type Result = ReturnType<typeof compute>

/** The declared defaults, read from the field list so the two cannot drift. */
const base: Input = {
  initialInvestment: 100_000,
  cashFlows: '25000, 30000, 35000, 40000, 45000',
  discountRate: 10,
}

const stat = (r: Result, label: string) => r.stats!.find((s) => s.label === label)!.value
const statNumber = (r: Result, label: string) => Number(stat(r, label))
const series = (r: Result, label: string) => r.series!.find((s) => s.label === label)!.points
const sumParts = (r: Result) => r.parts!.reduce((acc, p) => acc + p.value, 0)

// ── Independent reference implementations ────────────────────────────────
// None of these share a line of code with compute.ts. Where they agree, the
// agreement is evidence; where they disagree, one of the two is wrong.

/**
 * NPV by HORNER's method on the polynomial in x = 1/(1+r):
 *
 *   NPV = cf₀ + x(cf₁ + x(cf₂ + … ))
 *
 * Algebraically the same sum as Σ cfₜ(1+r)^−t, but evaluated by repeated
 * multiplication rather than by `Math.pow`, so a wrong exponent or an off-by-one
 * in the year index cannot survive in both.
 */
function npvHorner(cf: readonly number[], rate: number): number {
  const x = 1 / (1 + rate)
  let acc = 0
  for (let t = cf.length - 1; t >= 1; t -= 1) acc = (acc + cf[t]!) * x
  return cf[0]! + acc
}

/** The plain term-by-term definition, the third route to the same number. */
function npvTermByTerm(cf: readonly number[], rate: number): number {
  let sum = 0
  for (let t = 0; t < cf.length; t += 1) sum += cf[t]! / Math.pow(1 + rate, t)
  return sum
}

/**
 * IRR by NEWTON on the same polynomial, in the x = 1/(1+r) variable where it is
 * an ordinary polynomial with an exact derivative. Newton is not bisection: the
 * two cannot agree by sharing a bug, only by both being right.
 */
function newtonIrr(cf: readonly number[], guessRate: number): number {
  let x = 1 / (1 + guessRate)
  for (let k = 0; k < 500; k += 1) {
    let f = 0
    let fp = 0
    for (let t = cf.length - 1; t >= 0; t -= 1) {
      fp = fp * x + f
      f = f * x + cf[t]!
    }
    // f(x) = Σ cfₜ xᵗ evaluated by Horner, fp = f′(x) from the same recurrence.
    if (fp === 0) break
    const step = f / fp
    x -= step
    if (Math.abs(step) < 1e-15) break
  }
  return 1 / x - 1
}

/** The year the running total first covers the investment, simulated. */
function paybackBySimulation(investment: number, byYear: readonly number[]): number | null {
  let cumulative = -investment
  for (let t = 0; t < byYear.length; t += 1) {
    const next = cumulative + byYear[t]!
    if (next >= 0) return t + -cumulative / byYear[t]!
    cumulative = next
  }
  return null
}

const flowsOf = (n: number, amount = 30_000) => Array.from({ length: n }, () => amount).join(' ')

// ── Headline ─────────────────────────────────────────────────────────────

describe('npv at the defaults', () => {
  const cf = [-100_000, 25_000, 30_000, 35_000, 40_000, 45_000]

  test('$100k against five years of cash flow at 10% is worth $29,078.68 today', () => {
    const r = compute(base)

    // (1) Summed ONE DISCOUNTED FLOW AT A TIME, no closed form anywhere:
    //   25000/1.1¹ = 22,727.272727…
    //   30000/1.1² = 24,793.388430…
    //   35000/1.1³ = 26,296.018032…
    //   40000/1.1⁴ = 27,320.538215…
    //   45000/1.1⁵ = 27,941.459538…
    //   ───────────────────────────
    //   PV of the future            129,078.676941
    //   less the 100,000 spent today → NPV 29,078.676941
    const oneAtATime =
      25_000 / 1.1 +
      30_000 / (1.1 * 1.1) +
      35_000 / (1.1 * 1.1 * 1.1) +
      40_000 / (1.1 * 1.1 * 1.1 * 1.1) +
      45_000 / (1.1 * 1.1 * 1.1 * 1.1 * 1.1) -
      100_000
    expect(oneAtATime).toBeCloseTo(29_078.676941, 6)
    expect(Number(r.primary.value)).toBeCloseTo(oneAtATime, 6)

    // (2) The same figure by Horner, which never calls Math.pow.
    expect(npvHorner(cf, 0.1)).toBeCloseTo(29_078.676941, 6)
    expect(Number(r.primary.value)).toBeCloseTo(npvHorner(cf, 0.1), 8)

    expect(r.primary.label).toBe('Net present value')
  })

  test('the worked steps show the same five discounted flows and add to the headline', () => {
    const r = compute(base)
    const numeric = r.steps!.filter((s): s is Extract<typeof s, { label: string }> => 'label' in s)
    const perYear = numeric.filter((s) => /^Year \d+ cash flow/.test(s.label))
    expect(perYear.length).toBe(5)
    expect(perYear.map((s) => Number(s.value))).toEqual([
      25_000 / 1.1,
      30_000 / 1.1 ** 2,
      35_000 / 1.1 ** 3,
      40_000 / 1.1 ** 4,
      45_000 / 1.1 ** 5,
    ])
    const pvFuture = perYear.reduce((acc, s) => acc + Number(s.value), 0)
    expect(pvFuture).toBeCloseTo(129_078.676941, 6)
    expect(pvFuture - 100_000).toBeCloseTo(Number(r.primary.value), 8)
  })

  test('the profitability index drives the scale and agrees with the NPV sign', () => {
    const r = compute(base)
    // PI = PV in ÷ PV out = 129,078.676941 / 100,000.
    expect(statNumber(r, 'Profitability index')).toBeCloseTo(1.290786769, 9)
    expect(r.scaleValue).toBeCloseTo(1.290786769, 9)
    // The invariant that lets the meter and the headline share a page: PI > 1
    // exactly when NPV > 0.
    for (const rate of [0, 5, 10, 19.711108390008, 25, 50]) {
      const x = compute({ ...base, discountRate: rate })
      const pi = statNumber(x, 'Profitability index')
      const npv = Number(x.primary.value)
      expect(Math.sign(Number((pi - 1).toFixed(9))), `rate ${rate}`).toBe(
        Math.sign(Number(npv.toFixed(4))),
      )
    }
  })

  test('the present values in and out differ by exactly the NPV', () => {
    for (const v of [
      base,
      { ...base, cashFlows: '25000, -30000, 35000, -40000, 45000' },
      { ...base, cashFlows: '-5000 -5000 90000', discountRate: 3 },
      { ...base, discountRate: 0 },
    ]) {
      const r = compute(v)
      expect(statNumber(r, 'Present value of the returns') - statNumber(r, 'Present value of the costs')).toBeCloseTo(
        Number(r.primary.value),
        6,
      )
    }
  })

  test('a zero discount rate is just the undiscounted arithmetic', () => {
    const r = compute({ ...base, discountRate: 0 })
    expect(Number(r.primary.value)).toBeCloseTo(175_000 - 100_000, 9)
    expect(statNumber(r, 'Undiscounted net cash flow')).toBeCloseTo(75_000, 9)
    expect(statNumber(r, 'Value lost to discounting')).toBeCloseTo(0, 9)
  })

  test('raising the required return always lowers the NPV', () => {
    let previous = Number.POSITIVE_INFINITY
    for (let rate = 0; rate <= 50; rate += 0.25) {
      const npv = Number(compute({ ...base, discountRate: rate }).primary.value)
      expect(npv, `rate ${rate}`).toBeLessThan(previous)
      previous = npv
    }
  })

  test('the first field nudged 1.1x gives a different, valid answer', () => {
    const at = (initialInvestment: number) =>
      Number(compute({ ...base, initialInvestment }).primary.value)
    expect(Number.isFinite(at(110_000))).toBe(true)
    expect(at(110_000).toFixed(4)).not.toBe(at(100_000).toFixed(4))
    // A dollar more spent today is a dollar less of NPV, exactly.
    expect(at(100_000) - at(110_000)).toBeCloseTo(10_000, 6)
  })
})

// ── IRR ──────────────────────────────────────────────────────────────────

describe('irr', () => {
  const cf = [-100_000, 25_000, 30_000, 35_000, 40_000, 45_000]

  test('the reported IRR really does set NPV to zero', () => {
    const r = compute(base)
    const irr = statNumber(r, 'Internal rate of return') / 100

    // THE independent check: substitute the answer back into the definition.
    // Two different evaluations of NPV, both at the reported rate, both zero.
    expect(npvTermByTerm(cf, irr)).toBeCloseTo(0, 6)
    expect(npvHorner(cf, irr)).toBeCloseTo(0, 6)

    // And a different ALGORITHM lands on the same root: Newton, not bisection.
    expect(irr).toBeCloseTo(newtonIrr(cf, 0.15), 12)
    expect(irr).toBeCloseTo(0.19711108390008, 12)
  })

  test('the IRR is the rate at which this calculator itself returns zero', () => {
    // Closing the loop through compute rather than through a reference: feed the
    // solved rate back in as the required return and the headline vanishes.
    const irr = statNumber(compute(base), 'Internal rate of return')
    expect(Number(compute({ ...base, discountRate: irr }).primary.value)).toBeCloseTo(0, 6)
    expect(statNumber(compute({ ...base, discountRate: irr }), 'Profitability index')).toBeCloseTo(1, 9)
  })

  test('getting exactly your money back is an IRR of exactly zero', () => {
    // 5 × $20,000 against $100,000 returns the investment and not a cent more,
    // so NPV(0) = 0 identically and the root is 0 with no arithmetic at all.
    const r = compute({ ...base, cashFlows: '20000 20000 20000 20000 20000', discountRate: 0 })
    expect(npvHorner([-100_000, 20_000, 20_000, 20_000, 20_000, 20_000], 0)).toBe(0)
    expect(statNumber(r, 'Internal rate of return')).toBe(0)
    expect(Number(r.primary.value)).toBe(0)
    expect(statNumber(r, 'Profitability index')).toBe(1)
  })

  test('a negative IRR is still an IRR', () => {
    // $90,000 back on a $100,000 project: the money shrinks, so the rate the
    // project earns is genuinely below zero rather than absent.
    const cfLoss = [-100_000, 18_000, 18_000, 18_000, 18_000, 18_000]
    const r = compute({ ...base, cashFlows: '18000 18000 18000 18000 18000', discountRate: 0 })
    const irr = statNumber(r, 'Internal rate of return') / 100
    expect(irr).toBeLessThan(0)
    expect(npvHorner(cfLoss, irr)).toBeCloseTo(0, 6)
    expect(irr).toBeCloseTo(newtonIrr(cfLoss, -0.05), 10)
    expect(Number(r.primary.value)).toBe(-10_000)
  })

  test('a project whose cash flows change direction twice has TWO IRRs and reports neither', () => {
    // The textbook multiple-IRR case (Brealey & Myers): −4,000 then +25,000 then
    // −25,000. In x = 1/(1+r) that is 25000x² − 25000x + 4000 = 0, so
    // x = 0.8 or x = 0.2 exactly, giving r = 25% and r = 400%. Both are true and
    // neither is "the" IRR.
    const r = compute({ initialInvestment: 4000, cashFlows: '25000, -25000', discountRate: 10 })
    const cfTwo = [-4000, 25_000, -25_000]
    expect(npvHorner(cfTwo, 0.25)).toBeCloseTo(0, 9)
    expect(npvHorner(cfTwo, 4)).toBeCloseTo(0, 9)

    const reported = stat(r, 'Internal rate of return')
    expect(typeof reported).toBe('string')
    expect(reported).toContain('25.00%')
    expect(reported).toContain('400.00%')
    expect(Number.isFinite(Number(reported))).toBe(false)
    // The prose must say so too, rather than leaving the page silently confident.
    expect(r.notes!.join(' ')).toMatch(/no single internal rate of return/i)
  })

  test('a project with no IRR at all says so instead of printing a number', () => {
    // The last flow is a big outflow, so NPV is negative at every rate above
    // −100%: nothing to solve. Confirmed independently by sampling the curve.
    const v = { ...base, cashFlows: '1000, -500000' }
    const cfNone = [-100_000, 1000, -500_000]
    for (let rate = -0.99; rate < 100; rate = rate < 1 ? rate + 0.01 : rate * 1.05) {
      expect(npvHorner(cfNone, rate), `rate ${rate}`).toBeLessThan(0)
    }
    const r = compute(v)
    const reported = stat(r, 'Internal rate of return')
    expect(typeof reported).toBe('string')
    expect(reported).toMatch(/^Undefined/)
    expect(Number(r.primary.value)).toBeLessThan(0)
  })

  test('a project that never pays anything back has no rate of return to find', () => {
    const r = compute({ ...base, cashFlows: '-1000 -2000 -3000' })
    expect(String(stat(r, 'Internal rate of return'))).toMatch(/nothing ever comes back in/i)
    expect(Number(r.primary.value)).toBeLessThan(-100_000)
  })

  test('the IRR is invariant to scaling the whole project', () => {
    // Doubling every figure doubles the NPV and leaves the rate untouched — a
    // property of the root that no arithmetic slip preserves by accident.
    const one = compute(base)
    const two = compute({
      ...base,
      initialInvestment: 200_000,
      cashFlows: '50000, 60000, 70000, 80000, 90000',
    })
    expect(statNumber(two, 'Internal rate of return')).toBeCloseTo(
      statNumber(one, 'Internal rate of return'),
      9,
    )
    expect(Number(two.primary.value)).toBeCloseTo(2 * Number(one.primary.value), 6)
  })

  test('an IRR that exists is always reported as a number, across a wide sweep', () => {
    for (let years = 1; years <= 12; years += 1) {
      for (const annual of [5_000, 12_500, 30_000, 90_000]) {
        for (const investment of [1000, 25_000, 100_000, 400_000]) {
          const cfv = [-investment, ...Array.from({ length: years }, () => annual)]
          const r = compute({
            initialInvestment: investment,
            cashFlows: flowsOf(years, annual),
            discountRate: 10,
          })
          const reported = stat(r, 'Internal rate of return')
          // One sign change, so Descartes guarantees at most one root, and the
          // flows are all positive so NPV → +∞ as r → −100%: exactly one exists.
          expect(typeof reported, `${investment}/${annual}x${years}`).toBe('number')
          expect(npvHorner(cfv, Number(reported) / 100), `${investment}/${annual}x${years}`).toBeCloseTo(
            0,
            4,
          )
        }
      }
    }
  }, 30_000)
})

// ── Payback ──────────────────────────────────────────────────────────────

describe('payback', () => {
  test('discounted payback lands inside year 4, simple payback inside year 4 too', () => {
    const r = compute(base)
    const discounted = [1, 2, 3, 4, 5].map((t) => [25_000, 30_000, 35_000, 40_000, 45_000][t - 1]! / 1.1 ** t)

    // Cumulative discounted: −100,000 → −77,272.73 → −52,479.34 → −26,183.32 →
    // +1,137.22. The deficit clears 26,183.32/27,320.54 of the way through the
    // fourth year, so 3.958375 years.
    expect(statNumber(r, 'Discounted payback')).toBeCloseTo(3.958375, 6)
    expect(statNumber(r, 'Discounted payback')).toBeCloseTo(
      paybackBySimulation(100_000, discounted)!,
      12,
    )

    // Undiscounted: 25+30+35 = 90k short by 10k, cleared a quarter of the way
    // into the 40k year.
    expect(statNumber(r, 'Simple payback (undiscounted)')).toBeCloseTo(3.25, 12)
    expect(statNumber(r, 'Simple payback (undiscounted)')).toBeCloseTo(
      paybackBySimulation(100_000, [25_000, 30_000, 35_000, 40_000, 45_000])!,
      12,
    )
  })

  test('discounting always makes the payback later, never earlier', () => {
    for (const rate of [0, 1, 5, 10, 20]) {
      const r = compute({ ...base, discountRate: rate })
      const dpp = stat(r, 'Discounted payback')
      const spp = stat(r, 'Simple payback (undiscounted)')
      if (typeof dpp !== 'number') continue
      expect(dpp, `rate ${rate}`).toBeGreaterThanOrEqual(Number(spp) - 1e-12)
    }
  })

  test('a payback inside the first year is a fraction of a year, not a whole one', () => {
    const r = compute({ ...base, cashFlows: '200000', discountRate: 0 })
    expect(statNumber(r, 'Simple payback (undiscounted)')).toBeCloseTo(0.5, 12)
  })

  test('money that never comes back is said in words, not left as a number', () => {
    const r = compute({ ...base, cashFlows: '1000 1000 1000' })
    expect(String(stat(r, 'Discounted payback'))).toMatch(/Not repaid within the 3 years/)
    expect(r.notes!.join(' ')).toMatch(/not paid back/i)
  })
})

// ── Parts and series: the counts the page is built around ────────────────

describe('parts and series', () => {
  test('the part and series counts do NOT vary with the number of cash flows', () => {
    for (const n of [1, 2, 3, 5, 10, 25, 100]) {
      const r = compute({ ...base, cashFlows: flowsOf(n) })
      expect(r.parts!.length, `${n} flows`).toBe(2)
      expect(r.series!.length, `${n} flows`).toBe(2)
      expect(r.series![0]!.points.length, `${n} flows`).toBe(r.series![1]!.points.length)
    }
  })

  test('the counts do not vary with the other fields either', () => {
    for (const v of [
      base,
      { ...base, discountRate: 0 },
      { ...base, discountRate: 50 },
      { ...base, initialInvestment: 1000 },
      { ...base, initialInvestment: 10_000_000 },
      { ...base, cashFlows: '25000, -25000' },
      { ...base, cashFlows: '-1000 -2000' },
      { ...base, cashFlows: '0 0 0' },
    ]) {
      const r = compute(v)
      expect(r.parts!.length, JSON.stringify(v)).toBe(2)
      expect(r.series!.length, JSON.stringify(v)).toBe(2)
    }
  })

  test('parts are non-negative and sum EXACTLY to the total they claim', () => {
    for (const v of [
      base,
      { ...base, discountRate: 0 },
      { ...base, discountRate: 50 },
      { ...base, initialInvestment: 1000 },
      { ...base, initialInvestment: 10_000_000 },
      { ...base, cashFlows: '25000, -25000, 60000' },
      { ...base, cashFlows: '0 0 0' },
      { ...base, cashFlows: flowsOf(100) },
    ]) {
      const r = compute(v)
      for (const p of r.parts!) {
        expect(Number.isFinite(p.value), `${JSON.stringify(v)} / ${p.label}`).toBe(true)
        expect(p.value, `${JSON.stringify(v)} / ${p.label}`).toBeGreaterThanOrEqual(0)
      }
      expect(sumParts(r), JSON.stringify(v)).toBeCloseTo(Number(r.partsTotal!.value), 6)
    }
  })

  test('the surplus slice IS the headline when the project is worth doing', () => {
    const r = compute(base)
    expect(r.parts![1]!.value).toBeCloseTo(Number(r.primary.value), 9)
    expect(Number(r.partsTotal!.value)).toBeCloseTo(129_078.676941, 6)
  })

  test('the shortfall slice IS the headline when it is not', () => {
    const r = compute({ ...base, initialInvestment: 200_000 })
    expect(r.parts![1]!.value).toBeCloseTo(-Number(r.primary.value), 9)
    expect(r.parts![0]!.value).toBeCloseTo(129_078.676941, 6)
  })

  test('the NPV profile is the same curve the headline sits on', () => {
    const r = compute(base)
    const profile = series(r, 'Net present value')
    const cf = [-100_000, 25_000, 30_000, 35_000, 40_000, 45_000]
    expect(profile.length).toBeGreaterThan(1)
    for (const [x, y] of profile) expect(y, `x=${x}`).toBeCloseTo(npvHorner(cf, x / 100), 6)
    // Strictly increasing x, or the chart path doubles back on itself.
    for (let i = 1; i < profile.length; i += 1)
      expect(profile[i]![0]).toBeGreaterThan(profile[i - 1]![0])
    // The zero line shares the x axis exactly.
    expect(series(r, 'Break-even (NPV = 0)').map((p) => p[0])).toEqual(profile.map((p) => p[0]))
    for (const p of series(r, 'Break-even (NPV = 0)')) expect(p[1]).toBe(0)
  })

  test('the curve passes through the visitor’s own rate, at the headline figure', () => {
    // Otherwise the chart and the number printed above it disagree by a hair, and
    // the crossing the visitor is invited to read off is not the one they typed.
    for (const rate of [0, 7.5, 10, 22.25, 50]) {
      const r = compute({ ...base, discountRate: rate })
      const profile = series(r, 'Net present value')
      const hit = profile.find(([x]) => Math.abs(x - rate) < 1e-12)
      expect(hit, `rate ${rate}`).toBeDefined()
      expect(hit![1], `rate ${rate}`).toBe(Number(r.primary.value))
    }
  })

  test('the profile spans far enough to show every crossing', () => {
    const r = compute(base)
    const profile = series(r, 'Net present value')
    const irr = statNumber(r, 'Internal rate of return')
    const last = profile[profile.length - 1]!
    expect(last[0]).toBeGreaterThan(irr)
    // Which means the curve genuinely crosses zero on screen.
    expect(profile[0]![1]).toBeGreaterThan(0)
    expect(last[1]).toBeLessThan(0)
  })
})

// ── Parsing the single-line cash-flow field ──────────────────────────────

describe('cash-flow parsing', () => {
  const npvOf = (cashFlows: string) => Number(compute({ ...base, cashFlows }).primary.value)
  const expected = npvOf('25000, 30000, 35000, 40000, 45000')

  test('commas, spaces, semicolons and a space-flattened paste all read the same', () => {
    for (const text of [
      '25000, 30000, 35000, 40000, 45000',
      '25000,30000,35000,40000,45000',
      '25000 30000 35000 40000 45000',
      '25000;30000;35000;40000;45000',
      '  25000 ; 30000 , 35000   40000\t45000  ',
    ]) {
      expect(npvOf(text), text).toBeCloseTo(expected, 9)
    }
  })

  test('a spreadsheet column pasted into a single-line input arrives space-flattened', () => {
    // `kind: 'text'` is one line, so the newlines are already spaces by the time
    // compute sees them. Both spellings must work.
    expect(npvOf('25000\n30000\n35000\n40000\n45000')).toBeCloseTo(expected, 9)
    expect(npvOf('25000 30000 35000 40000 45000')).toBeCloseTo(expected, 9)
  })

  test('thousands separators are read as grouping when something else separates', () => {
    expect(npvOf('25,000 30,000 35,000 40,000 45,000')).toBeCloseTo(expected, 9)
    expect(npvOf('25,000; 30,000; 35,000; 40,000; 45,000')).toBeCloseTo(expected, 9)
    expect(npvOf('$25,000 $30,000 $35,000 $40,000 $45,000')).toBeCloseTo(expected, 9)
  })

  test('with nothing but commas to go on, commas separate values', () => {
    // "100,200,300" cannot be both three grouped numbers and one value; in a
    // field whose separator IS the comma there is only one sensible reading.
    const r = compute({ ...base, cashFlows: '100,200,300', discountRate: 0 })
    expect(Number(r.primary.value)).toBeCloseTo(600 - 100_000, 9)
    expect(statNumber(r, 'Years of cash flow')).toBe(3)
  })

  test('a single grouped number on its own is one value, not three', () => {
    const r = compute({ ...base, cashFlows: '120,000', discountRate: 0 })
    expect(Number(r.primary.value)).toBeCloseTo(20_000, 9)
    expect(statNumber(r, 'Years of cash flow')).toBe(1)
  })

  test('accounting brackets mean a year that lost money', () => {
    const bracketed = compute({ ...base, cashFlows: '25000 (30000) 35000', discountRate: 0 })
    const signed = compute({ ...base, cashFlows: '25000 -30000 35000', discountRate: 0 })
    expect(Number(bracketed.primary.value)).toBeCloseTo(Number(signed.primary.value), 9)
    expect(Number(signed.primary.value)).toBeCloseTo(30_000 - 100_000, 9)
  })

  test('decimals and exponent-free fractions survive', () => {
    const r = compute({ ...base, cashFlows: '1000.50 2000.25', discountRate: 0 })
    expect(Number(r.primary.value)).toBeCloseTo(3000.75 - 100_000, 9)
  })
})

// ── Refusals ─────────────────────────────────────────────────────────────

describe('input it will not answer for', () => {
  const fieldOf = (fn: () => unknown): string | undefined => {
    try {
      fn()
    } catch (e) {
      expect(e).toBeInstanceOf(CalcError)
      return (e as CalcError).fieldId
    }
    throw new Error('expected a CalcError')
  }

  test('non-finite numbers are caught before any magnitude test', () => {
    // coerceValues emits NaN for unparseable input, and `x < 0` is false for NaN,
    // so a magnitude-first guard would let it through to a NaN headline.
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(fieldOf(() => compute({ ...base, initialInvestment: bad }))).toBe('initialInvestment')
      expect(fieldOf(() => compute({ ...base, discountRate: bad }))).toBe('discountRate')
    }
  })

  test('an investment of zero or less has no project to value', () => {
    expect(fieldOf(() => compute({ ...base, initialInvestment: 0 }))).toBe('initialInvestment')
    expect(fieldOf(() => compute({ ...base, initialInvestment: -1 }))).toBe('initialInvestment')
  })

  test('a negative required return is refused', () => {
    expect(fieldOf(() => compute({ ...base, discountRate: -0.5 }))).toBe('discountRate')
  })

  test('cash flows that are not numbers name the cash-flow field', () => {
    for (const bad of ['', '   ', 'abc', '25000, abc', '25000, ()', ',,,', '25000 12e']) {
      expect(fieldOf(() => compute({ ...base, cashFlows: bad })), bad).toBe('cashFlows')
    }
  })

  test('more than a hundred years is a spreadsheet, not a calculator', () => {
    expect(Number.isFinite(Number(compute({ ...base, cashFlows: flowsOf(100) }).primary.value))).toBe(true)
    expect(fieldOf(() => compute({ ...base, cashFlows: flowsOf(101) }))).toBe('cashFlows')
  })

  test('nothing anywhere in a result is ever NaN', () => {
    for (const v of [
      base,
      { ...base, discountRate: 0 },
      { ...base, discountRate: 50 },
      { ...base, initialInvestment: 1000 },
      { ...base, initialInvestment: 10_000_000 },
      { ...base, cashFlows: '0 0 0' },
      { ...base, cashFlows: '25000, -25000' },
      { ...base, cashFlows: '-1000 -2000 -3000' },
      { ...base, cashFlows: '1000, -500000' },
    ]) {
      const r = compute(v)
      const label = JSON.stringify(v)
      expect(String(r.primary.value)).not.toMatch(/NaN/)
      expect(Number.isFinite(Number(r.primary.value)), label).toBe(true)
      expect(Number.isFinite(r.scaleValue!), label).toBe(true)
      for (const s of r.stats!) expect(String(s.value), `${label} / ${s.label}`).not.toMatch(/NaN/)
      for (const s of r.steps!)
        if ('value' in s) expect(String(s.value), `${label} / ${s.label}`).not.toMatch(/NaN/)
      for (const p of r.parts!) expect(Number.isFinite(p.value), label).toBe(true)
      for (const s of r.series!)
        for (const [x, y] of s.points)
          expect(Number.isFinite(x) && Number.isFinite(y), `${label} / ${s.label}`).toBe(true)
      for (const n of r.notes!) expect(n, label).not.toMatch(/NaN|undefined/)
    }
  })
})

// ── The definition and the rendered page ─────────────────────────────────
// The conformance suite covers all of this once the calculator is in the
// registry barrel, which is done centrally. Until then these stand in for it,
// so a copy or bounds mistake does not wait on that one line to surface.

describe('the definition', () => {
  test('the fixture in this file IS the declared set of defaults', () => {
    expect(defaultValues(def)).toEqual(base)
  })

  test('every number default lands on min + n x step, or the slider shifts it', () => {
    for (const field of def.fields) {
      if (field.kind !== 'number' || field.min === undefined || field.step === undefined) continue
      const n = (field.default - field.min) / field.step
      expect(Math.abs(n - Math.round(n)), field.id).toBeLessThan(1e-9)
    }
  })

  test('both ends of every slider are values compute accepts', () => {
    for (const field of def.fields) {
      if (field.kind !== 'number') continue
      for (const bound of [field.min, field.max]) {
        if (bound === undefined) continue
        const r = compute({ ...base, [field.id]: bound })
        expect(Number.isFinite(Number(r.primary.value)), `${field.id}=${bound}`).toBe(true)
      }
    }
  })

  test('the copy fits a search result and answers real questions', () => {
    expect(def.description.length).toBeGreaterThan(50)
    expect(def.description.length).toBeLessThanOrEqual(160)
    expect(def.seoTitle.length).toBeLessThanOrEqual(70)
    expect(def.faqs.length).toBeGreaterThanOrEqual(3)
    for (const faq of def.faqs) {
      expect(faq.q.endsWith('?'), faq.q).toBe(true)
      expect(faq.a.length, faq.q).toBeGreaterThan(40)
    }
    expect(new Set(def.related).size).toBe(def.related.length)
    expect(def.related).not.toContain(def.slug)
  })

  test('the FAQ worked example is the number this calculator actually returns', () => {
    // A worked example in the copy is a claim the code has to honour.
    const r = compute(base)
    const answer = def.faqs.find((f) => f.q === 'How is net present value calculated?')!.a
    expect(answer).toContain('$129,079')
    expect(answer).toContain('$29,079')
    expect(Math.round(129_078.676941).toLocaleString('en-US')).toBe('129,079')
    expect(Math.round(Number(r.primary.value)).toLocaleString('en-US')).toBe('29,079')
  })

  test('the scale bands are contiguous and the defaults do not sit on a boundary', () => {
    const { bands, min, max } = def.scale!
    expect(min).toBeLessThan(max)
    bands.forEach((b, i) => {
      expect(b.from).toBeLessThan(b.to)
      if (i > 0) expect(b.from).toBe(bands[i - 1]!.to)
    })
    for (const b of bands) expect(compute(base).scaleValue).not.toBe(b.from)
  })

  test('renders to a complete view with a resolved band and no NaN anywhere', () => {
    const view = toResultView(compute(base), def.scale)
    expect(view.primary.text).toBe('$29,079')
    expect(view.band).toBe('good')
    expect(view.scalePercent).toBeGreaterThan(0)
    expect(view.scalePercent).toBeLessThan(100)
    for (const s of [...view.stats, ...view.steps]) {
      if (!('text' in s)) continue
      expect(s.text, s.label).not.toContain('NaN')
      expect(s.text, s.label).not.toBe('—')
    }
    expect(view.stats.find((s) => s.label === 'Internal rate of return')!.text).toBe('19.71%')
    expect(view.stats.find((s) => s.label === 'Discounted payback')!.text).toBe('3.96 years')
    expect(view.parts.reduce((a, p) => a + p.percent, 0)).toBeCloseTo(100, 6)
  })

  test('the view survives every corner the form can reach', () => {
    for (const v of [
      { ...base, initialInvestment: 1000 },
      { ...base, initialInvestment: 10_000_000 },
      { ...base, discountRate: 0 },
      { ...base, discountRate: 50 },
      { ...base, cashFlows: '25000, -25000' },
      { ...base, cashFlows: '-1000 -2000 -3000' },
      { ...base, cashFlows: '0 0 0' },
    ]) {
      const view = toResultView(compute(v), def.scale)
      const label = JSON.stringify(v)
      expect(view.primary.text, label).not.toContain('NaN')
      expect(view.band, label).toBeDefined()
      for (const s of view.stats) expect(s.text, `${label} / ${s.label}`).not.toContain('NaN')
    }
  })
})

// ── The sweep ────────────────────────────────────────────────────────────

describe('across the input space', () => {
  test('every reachable result is finite, ordered and honest', () => {
    const flowSets = [
      '25000, 30000, 35000, 40000, 45000',
      '50000',
      '10000 10000',
      '0 0 0 0',
      '-5000 -5000 200000',
      '25000, -25000',
      '90000, 90000, -100000, 50000',
      flowsOf(40),
      flowsOf(100, 1500),
    ]
    for (const cashFlows of flowSets) {
      for (const initialInvestment of [1000, 100_000, 2_500_750, 10_000_000]) {
        for (const discountRate of [0, 0.25, 10, 25, 50]) {
          const label = `${initialInvestment}/${cashFlows}/${discountRate}`
          const r = compute({ initialInvestment, cashFlows, discountRate })

          expect(Number.isFinite(Number(r.primary.value)), label).toBe(true)
          expect(r.parts!.length, label).toBe(2)
          expect(r.series!.length, label).toBe(2)
          expect(sumParts(r), label).toBeCloseTo(Number(r.partsTotal!.value), 4)
          for (const p of r.parts!) expect(p.value, label).toBeGreaterThanOrEqual(0)

          for (const s of r.series!) {
            expect(s.points.length, label).toBeGreaterThan(1)
            expect(s.points.length, label).toBeLessThanOrEqual(45)
            s.points.forEach((p, i) => {
              expect(Number.isFinite(p[0]) && Number.isFinite(p[1]), label).toBe(true)
              if (i > 0) expect(p[0], label).toBeGreaterThan(s.points[i - 1]![0])
            })
          }

          const irr = stat(r, 'Internal rate of return')
          if (typeof irr === 'number') {
            const flows = cashFlows.split(/[\s,;]+/).map(Number)
            const cf = [-initialInvestment, ...flows]
            const gross = cf.reduce((a, c) => a + Math.abs(c), 0)
            // A reported rate is always a genuine root, never a stalled iterate.
            expect(Math.abs(npvHorner(cf, irr / 100)), label).toBeLessThan(1e-6 * gross)
          } else {
            expect(String(irr), label).toMatch(/Undefined|Ambiguous/)
          }

          expect(r.scaleValue!, label).toBeGreaterThanOrEqual(0)
          expect(r.scaleValue!, label).toBeLessThanOrEqual(3)
        }
      }
    }
  }, 60_000)
})

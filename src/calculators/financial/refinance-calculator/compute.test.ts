import { describe, expect, test } from 'vitest'
import compute from './compute'
import { CalcError } from '../../../lib/types'
import type { Scale } from '../../../lib/types'
import def from './index'
import { resolveBand } from '../../../lib/view'

const scale: Scale = def.scale

/**
 * A 30-year loan taken out a few years ago, 22 years still to run at 6.75%,
 * against today's offer of 5.75% over a fresh 30 years. It is the case the page
 * exists for: the payment falls by $361 and the total repaid rises by $49,166.
 */
const base = {
  balance: 250_000,
  currentRate: 6.75,
  remainingYears: 22,
  newRate: 5.75,
  newYears: 30,
  closingCosts: 4_500,
}
const run = (over: Partial<typeof base> = {}) => compute({ ...base, ...over })

const stat = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)

/**
 * The level payment, found WITHOUT the annuity formula: guess a payment, roll
 * the balance forward month by month, and bisect on the guess that lands the
 * final balance on zero. It shares no algebra with `compute`, so agreement
 * between the two is real evidence rather than the same expression checked twice.
 */
function paymentByBisection(principal: number, monthlyRate: number, months: number): number {
  const finalBalance = (pay: number) => {
    let balance = principal
    for (let m = 0; m < months; m++) balance = balance * (1 + monthlyRate) - pay
    return balance
  }
  let lo = 0
  let hi = principal * (1 + monthlyRate) // one payment settles it outright
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2
    if (finalBalance(mid) > 0) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** Total interest accrued over a schedule, summed month by month. */
function interestBySimulation(principal: number, monthlyRate: number, pay: number, months: number) {
  let balance = principal
  let interest = 0
  for (let m = 0; m < months; m++) {
    const charge = balance * monthlyRate
    interest += charge
    balance = balance + charge - pay
  }
  return interest
}

describe('refinance', () => {
  test('both payments match the annuity formula, cross-checked by bisection and an anchor', () => {
    // Worked from M = P·i / (1 − (1+i)^−n) before running the code.
    // Current: i = 0.0675/12 = 0.005625, n = 264, (1+i)^264 = 4.39662,
    //          M = 1406.25 / 0.7725532 = 1820.26.
    // New:     i = 0.0575/12 = 0.00479167, n = 360, (1+i)^360 = 5.58944,
    //          M = 1197.9167 / 0.821091 = 1458.93.
    const r = run()
    expect(stat(r, 'New monthly payment')).toBeCloseTo(1458.93, 2)
    expect(stat(r, 'Monthly saving')).toBeCloseTo(361.33, 2)

    // Confirmation 1: the same two payments found by simulating the schedule and
    // bisecting, with no closed form anywhere in sight.
    const currentPayment = paymentByBisection(250_000, 0.0675 / 12, 264)
    const newPayment = paymentByBisection(250_000, 0.0575 / 12, 360)
    expect(currentPayment).toBeCloseTo(1820.262929, 4)
    expect(newPayment).toBeCloseTo(stat(r, 'New monthly payment'), 6)
    expect(currentPayment - newPayment).toBeCloseTo(stat(r, 'Monthly saving'), 6)

    // Confirmation 2: an outside anchor. $100,000 over 30 years at 6% is the
    // textbook $599.55 a month — a figure the world already agrees on, so a
    // plausible-but-wrong formula cannot hide behind self-consistency.
    const anchored = run({ balance: 100_000, newRate: 6, newYears: 30 })
    expect(stat(anchored, 'New monthly payment')).toBeCloseTo(599.55, 2)
  })

  test('the headline break-even is 13 months, reached by accumulating cash month by month', () => {
    const r = run()
    // Rounded up: you are only ahead once a whole payment has been made.
    // 4500 / 361.330788 = 12.454 payments.
    expect(r.primary.value).toBe(13)
    expect(r.primary.format).toEqual({ style: 'duration', from: 'months' })

    // Independently: start $4,500 in the hole and add the saving each month
    // until the balance turns positive. No division, no rounding rule.
    const saving =
      paymentByBisection(250_000, 0.0675 / 12, 264) - paymentByBisection(250_000, 0.0575 / 12, 360)
    let cash = -4_500
    let month = 0
    while (cash < 0) {
      month += 1
      cash += saving
    }
    expect(month).toBe(13)
  })

  test('the trap: the payment falls and the lifetime cost rises', () => {
    const r = run()

    // Interest, checked against a month-by-month accrual rather than payment × n.
    const currentInterest = interestBySimulation(
      250_000,
      0.0675 / 12,
      paymentByBisection(250_000, 0.0675 / 12, 264),
      264,
    )
    const newInterest = interestBySimulation(
      250_000,
      0.0575 / 12,
      paymentByBisection(250_000, 0.0575 / 12, 360),
      360,
    )
    expect(stat(r, 'Interest left on your current loan')).toBeCloseTo(currentInterest, 4)
    expect(stat(r, 'Interest on the new loan')).toBeCloseTo(newInterest, 4)
    expect(currentInterest).toBeCloseTo(230_549.41, 2)
    expect(newInterest).toBeCloseTo(275_215.57, 2)

    // The two figures the page must never let drift apart.
    expect(stat(r, 'Monthly saving')).toBeGreaterThan(0)
    expect(stat(r, 'Lifetime interest change')).toBeCloseTo(newInterest - currentInterest, 4)
    expect(stat(r, 'Lifetime interest change')).toBeCloseTo(44_666.16, 2)
    expect(stat(r, 'Lifetime cost change, closing costs included')).toBeCloseTo(49_166.16, 2)

    // And the meter reports the lifetime cost, not the payment. 49,166 / 480,549.
    expect(r.scaleValue).toBeCloseTo(10.2312, 3)
    expect(resolveBand(scale, r.scaleValue!)!.id).toBe('warn')

    // A lower payment must never be described as an unqualified win.
    expect(r.notes!.join(' ')).toContain('$49,166 MORE')
  })

  test('matching the new term to the years left isolates the rate cut', () => {
    // 22 years at 5.75% instead of 22 at 6.75%: the payment is $1,670.95, the
    // saving smaller ($149.31, not $361.33) and the break-even longer (31 months,
    // not 13) — but the lifetime cost now genuinely falls. This is the
    // comparison the page tells you to make, and the one the trap hides.
    const r = run({ newYears: 22 })
    expect(stat(r, 'New monthly payment')).toBeCloseTo(1670.95, 2)
    expect(stat(r, 'Monthly saving')).toBeCloseTo(149.31, 2)
    expect(r.primary.value).toBe(31)
    expect(stat(r, 'Lifetime cost change, closing costs included')).toBeCloseTo(-34_918.12, 2)
    expect(r.scaleValue).toBeCloseTo(-7.266, 3)
    expect(resolveBand(scale, r.scaleValue!)!.id).toBe('good')
    // No term reset, so no note about restarting the clock.
    expect(r.notes!.join(' ')).not.toContain('longer than what you have left')
  })

  test('a shorter term raises the payment, has no break-even, and still wins on cost', () => {
    const r = run({ newYears: 15 })
    // 15 years at 5.75% on $250,000 is $2,076.03 — $255.76 MORE per month.
    expect(stat(r, 'New monthly payment')).toBeCloseTo(2076.03, 2)
    expect(stat(r, 'Monthly saving')).toBeCloseTo(-255.76, 2)

    // There is nothing for the closing costs to be repaid out of, so the
    // break-even is stated as absent rather than faked or thrown.
    expect(r.primary.value).toBe('No monthly saving')
    expect(r.primary.format).toEqual({ style: 'raw' })

    // But it is the cheapest option on the page, and the meter says so.
    expect(stat(r, 'Lifetime cost change, closing costs included')).toBeCloseTo(-102_364.87, 2)
    expect(resolveBand(scale, r.scaleValue!)!.id).toBe('excellent')
    expect(r.notes!.join(' ')).toContain('less overall')
  })

  test('zero closing costs break even immediately', () => {
    const r = run({ closingCosts: 0 })
    expect(r.primary.value).toBe(0)
    // Nothing to repay, so the whole monthly saving is a lifetime saving too.
    expect(stat(r, 'Lifetime cost change, closing costs included')).toBeCloseTo(
      stat(r, 'Lifetime interest change'),
      6,
    )
  })

  test('parts sum exactly to the total the donut prints, and never go negative', () => {
    const cases: Array<Partial<typeof base>> = [
      {},
      { closingCosts: 0 },
      { newRate: 0 },
      { currentRate: 0 },
      { newYears: 10 },
      { balance: 10_000 },
      { balance: 2_000_000 },
      { newRate: 20, currentRate: 20 },
    ]
    for (const over of cases) {
      const r = run(over)
      const sum = r.parts!.reduce((a, p) => a + p.value, 0)
      expect(sum, JSON.stringify(over)).toBeCloseTo(Number(r.partsTotal!.value), 4)
      for (const p of r.parts!) expect(p.value, JSON.stringify(over)).toBeGreaterThanOrEqual(0)
    }
  })

  test('the donut and the chart are drawable at the defaults', () => {
    // Server-rendered from the DEFAULT result: anything that can ever be drawn
    // must be drawable here, or no client redraw can conjure the container back.
    const r = run()
    expect(r.parts).toHaveLength(3)
    expect(r.series).toHaveLength(1)
    expect(r.series![0]!.points.length).toBeGreaterThan(1)
    // 360 months thinned by a stride of 9, plus the pinned final point.
    expect(r.series![0]!.points).toHaveLength(41)
  })

  test('the curve tells the same story as the numbers', () => {
    const r = run()
    const points = r.series![0]!.points

    // Strictly increasing x, all finite — what the chart path requires.
    points.forEach((p, i) => {
      expect(Number.isFinite(p[0])).toBe(true)
      expect(Number.isFinite(p[1])).toBe(true)
      if (i > 0) expect(p[0]).toBeGreaterThan(points[i - 1]![0])
    })

    // Starts exactly one closing-cost payment in the hole.
    expect(points[0]).toEqual([0, -4_500])
    // Climbs above water — that is the break-even the headline reports.
    expect(Math.max(...points.map((p) => p[1]))).toBeGreaterThan(0)
    // And ends below it again, pinned to the lifetime cost change so the end of
    // the curve and the stat beside it cannot disagree.
    const last = points[points.length - 1]!
    expect(last[0]).toBe(360)
    expect(last[1]).toBeCloseTo(-stat(r, 'Lifetime cost change, closing costs included'), 6)
  })

  test('an interest-free loan is a straight division, not a division by zero', () => {
    const r = run({ currentRate: 0, newRate: 0, newYears: 30 })
    // 250,000 over 264 months, versus over 360.
    expect(stat(r, 'New monthly payment')).toBeCloseTo(250_000 / 360, 6)
    expect(stat(r, 'Monthly saving')).toBeCloseTo(250_000 / 264 - 250_000 / 360, 6)
    expect(stat(r, 'Interest on the new loan')).toBeCloseTo(0, 6)
    // The only cost of refinancing is then the closing costs themselves.
    expect(stat(r, 'Lifetime cost change, closing costs included')).toBeCloseTo(4_500, 6)
  })

  test('the meter never resolves the wrong way round at the extremes', () => {
    // resolveBand falls back to the LAST band when nothing matches, so an
    // unclamped scaleValue below the scale minimum would report a huge saving as
    // "costs much more". Both extremes are checked because only one is guarded
    // by the fallback happening to be correct.
    // Raw −77.2%, clamped to the scale floor rather than dropping through the
    // fallback and reporting the best case on the page as the worst.
    // This also pins compute's own SCALE_MIN/SCALE_MAX to the band edges declared
    // in index.ts, which it cannot import without a cycle.
    const huge = run({ currentRate: 20, newRate: 0, newYears: 10 })
    expect(huge.scaleValue).toBe(scale.min)
    expect(resolveBand(scale, huge.scaleValue!)!.id).toBe('excellent')

    // Raw +702%, clamped to the ceiling.
    const awful = run({ currentRate: 0, newRate: 20, newYears: 40 })
    expect(awful.scaleValue).toBe(scale.max)
    expect(resolveBand(scale, awful.scaleValue!)!.id).toBe('critical')
  })

  test('every bound the sliders offer is a value compute accepts', () => {
    // The same probe the central field-bounds suite runs, kept here so a bad
    // bound fails in this directory rather than only after registration. Every
    // number field renders as a slider, so both ends are one drag away.
    for (const field of def.fields) {
      if (field.kind !== 'number') continue
      for (const bound of [field.min, field.max]) {
        if (bound === undefined) continue
        expect(
          () => run({ [field.id]: bound } as Partial<typeof base>),
          `${field.id}=${bound}`,
        ).not.toThrow()
      }
    }
  })

  test('every number default lands on min + n x step, so a drag cannot shift it', () => {
    for (const field of def.fields) {
      if (field.kind !== 'number' || field.min === undefined || field.step === undefined) continue
      const n = (field.default - field.min) / field.step
      expect(Math.abs(n - Math.round(n)), field.id).toBeLessThan(1e-9)
    }
  })

  test('rejects invalid input against the offending field', () => {
    const cases: Array<[Partial<typeof base>, string]> = [
      [{ balance: 0 }, 'balance'],
      [{ balance: -999_999 }, 'balance'],
      [{ currentRate: -1 }, 'currentRate'],
      [{ currentRate: 41 }, 'currentRate'],
      [{ remainingYears: 0 }, 'remainingYears'],
      [{ remainingYears: 51 }, 'remainingYears'],
      [{ newRate: -1 }, 'newRate'],
      [{ newRate: 41 }, 'newRate'],
      [{ newYears: 0 }, 'newYears'],
      [{ newYears: 51 }, 'newYears'],
      [{ closingCosts: -1 }, 'closingCosts'],
    ]
    for (const [over, fieldId] of cases) {
      let thrown: unknown
      try {
        run(over)
      } catch (err) {
        thrown = err
      }
      expect(thrown, JSON.stringify(over)).toBeInstanceOf(CalcError)
      expect((thrown as CalcError).fieldId, JSON.stringify(over)).toBe(fieldId)
    }
  })

  test('never returns NaN for unparseable input', () => {
    // coerceValues emits NaN rather than throwing, and `x < 0` is false for NaN,
    // so every guard has to test finiteness before magnitude.
    for (const field of def.fields) {
      if (field.kind !== 'number') continue
      let thrown: unknown
      try {
        run({ [field.id]: Number.NaN } as Partial<typeof base>)
      } catch (err) {
        thrown = err
      }
      expect(thrown, field.id).toBeInstanceOf(CalcError)
      expect((thrown as CalcError).fieldId, field.id).toBe(field.id)
    }
  })
})

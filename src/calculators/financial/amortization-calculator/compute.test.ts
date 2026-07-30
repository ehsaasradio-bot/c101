import { describe, expect, test } from 'vitest'
import compute from './compute'
import { CalcError } from '../../../lib/types'

const base = { amount: 300_000, rate: 6.5, years: 30, focusYear: 1 }
const run = (over: Partial<typeof base> = {}) => compute({ ...base, ...over })

const stat = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)

/** Interest for the focus year is the headline, not a stat. */
const yearInterest = (r: ReturnType<typeof compute>) => Number(r.primary.value)

describe('amortization', () => {
  test('the level payment matches the annuity formula, computed independently', () => {
    // Worked by hand from M = P·i / (1 − (1+i)^−n) before running the code:
    // i = 0.065/12 = 0.005416667, (1+i)^360 = 6.99167, so M = 1625 / 0.856972.
    expect(stat(run(), 'Monthly payment')).toBeCloseTo(1896.2, 2)

    // And again from the formula itself, sharing no code with compute.
    const i = 0.065 / 12
    const expected = (300_000 * i) / (1 - Math.pow(1 + i, -360))
    expect(stat(run(), 'Monthly payment')).toBeCloseTo(expected, 1)
  })

  test('principal overtakes interest at the month algebra predicts', () => {
    // The split flips when M − b·i > b·i, i.e. once the balance falls below
    // M/(2i). Solving b_k = (P − M/i)(1+i)^k + M/i for that threshold gives
    // k ≈ 231.7, so the first month whose OPENING balance is under it is 233.
    const i = 0.065 / 12
    const M = (300_000 * i) / (1 - Math.pow(1 + i, -360))
    const threshold = M / (2 * i)
    const openingBalance = (k: number) => (300_000 - M / i) * Math.pow(1 + i, k - 1) + M / i

    let predicted = 1
    while (openingBalance(predicted) >= threshold) predicted++

    expect(predicted).toBe(233)
    expect(stat(run(), 'Principal overtakes interest at')).toBe(predicted)
  })

  test('the schedule clears the balance exactly, and interest is its by-product', () => {
    const r = run()
    const totalPaid = stat(r, 'Total repaid')
    const totalInterest = stat(r, 'Total interest')

    // Every dollar repaid is either principal or interest, and principal is the
    // amount borrowed by definition.
    expect(totalPaid - totalInterest).toBeCloseTo(300_000, 2)

    // The balance series must end at zero — the loan is actually paid off.
    const balance = r.series!.find((s) => s.label === 'Balance remaining')!
    expect(balance.points[balance.points.length - 1]![1]).toBe(0)
  })

  test('parts sum exactly to the total they claim', () => {
    for (const over of [{}, { rate: 0 }, { years: 1 }, { amount: 1_000 }, { rate: 25 }]) {
      const r = run(over)
      const sum = r.parts!.reduce((a, p) => a + p.value, 0)
      expect(sum, JSON.stringify(over)).toBeCloseTo(Number(r.partsTotal!.value), 2)
      for (const p of r.parts!) expect(p.value, JSON.stringify(over)).toBeGreaterThanOrEqual(0)
    }
  })

  test('parts and series counts never depend on input', () => {
    // The donut and chart are server-rendered from the defaults; a count that
    // varies would be reconciled, but one that appears only off-default would
    // have no container at all. Two of each, always.
    for (const over of [{}, { rate: 0 }, { years: 1 }, { years: 40 }, { focusYear: 40 }]) {
      const r = run(over)
      expect(r.parts, JSON.stringify(over)).toHaveLength(2)
      expect(r.series, JSON.stringify(over)).toHaveLength(2)
      for (const s of r.series!) expect(s.points.length).toBeGreaterThan(1)
    }
  })

  test('an interest-free loan is a straight division, not an error', () => {
    const r = run({ rate: 0 })
    expect(stat(r, 'Monthly payment')).toBeCloseTo(300_000 / 360, 2)
    expect(stat(r, 'Total interest')).toBe(0)
    // With no interest, principal exceeds it from the very first payment.
    expect(stat(r, 'Principal overtakes interest at')).toBe(1)
  })

  test('the focus year reports that year, and clamps past the end of the term', () => {
    // Year 1 of a 30-year loan at 6.5% is almost all interest.
    const y1 = run({ focusYear: 1 })
    expect(yearInterest(y1)).toBeGreaterThan(stat(y1, 'Principal in year 1'))

    // Year 30 is the mirror image.
    const y30 = run({ focusYear: 30 })
    expect(stat(y30, 'Principal in year 30')).toBeGreaterThan(yearInterest(y30))
    expect(stat(y30, 'Still owed after year 30')).toBe(0)

    // Asking for year 40 of a 30-year loan reports year 30 rather than throwing.
    expect(yearInterest(run({ focusYear: 40 }))).toBe(yearInterest(y30))
  })

  test('each year of interest is smaller than the last', () => {
    // A monotonic fall is the defining property of an amortizing loan, and it
    // would catch a schedule that charged interest on the original balance.
    let previous = Number.POSITIVE_INFINITY
    for (let year = 1; year <= 30; year++) {
      const interest = yearInterest(run({ focusYear: year }))
      expect(interest, `year ${year}`).toBeLessThan(previous)
      previous = interest
    }
  })

  test('rejects invalid input against the offending field', () => {
    const cases: Array<[Partial<typeof base>, string]> = [
      [{ amount: 0 }, 'amount'],
      [{ rate: -1 }, 'rate'],
      [{ years: 0 }, 'years'],
      [{ focusYear: 0 }, 'focusYear'],
      [{ amount: Number.NaN }, 'amount'],
      [{ rate: Number.NaN }, 'rate'],
    ]
    for (const [over, fieldId] of cases) {
      let thrown: unknown
      try {
        run(over)
      } catch (err) {
        thrown = err
      }
      expect(thrown, JSON.stringify(over)).toBeInstanceOf(CalcError)
      expect((thrown as CalcError).fieldId).toBe(fieldId)
    }
  })
})

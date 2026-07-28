import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'
import { resolveBand } from '../../../lib/view'

const base = {
  goalAmount: 25_000,
  currentSavings: 5000,
  monthlyDeposit: 300,
  annualRate: 4,
} as const

const monthsOf = (r: ReturnType<typeof compute>) => Number(r.primary.value)
const stat = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)

/**
 * Independent check, by algebra rather than iteration: with deposits at the end
 * of each month, FV(n) = P(1+i)^n + D·((1+i)^n − 1)/i. Setting FV(n) = goal and
 * solving for n gives the closed form below; the answer is the ceiling, since
 * deposits only land in whole months.
 */
function closedFormMonths(p: number, goal: number, d: number, annualRate: number): number {
  const i = annualRate / 100 / 12
  if (p >= goal) return 0
  if (i === 0) return Math.ceil((goal - p) / d)
  return Math.ceil(Math.log((goal * i + d) / (p * i + d)) / Math.log(1 + i))
}

describe('savings goal', () => {
  test('a 0% account is plain division — $12,000 at $1,000/mo takes exactly a year', () => {
    const r = compute({ ...base, currentSavings: 0, goalAmount: 12_000, monthlyDeposit: 1000, annualRate: 0 })
    expect(monthsOf(r)).toBe(12)
    expect(stat(r, 'Interest earned')).toBe(0)
    expect(stat(r, 'Total deposited')).toBe(12_000)
  })

  test('a 0% account rounds up to a whole month when the goal is not a multiple', () => {
    const r = compute({ ...base, currentSavings: 0, goalAmount: 12_500, monthlyDeposit: 1000, annualRate: 0 })
    expect(monthsOf(r)).toBe(13)
    expect(stat(r, 'Balance when you get there')).toBe(13_000)
  })

  test.each([
    ['defaults', base],
    ['no starting balance', { ...base, currentSavings: 0 }],
    ['high rate, long horizon', { ...base, goalAmount: 250_000, monthlyDeposit: 400, annualRate: 7 }],
    ['tiny deposit', { ...base, goalAmount: 60_000, currentSavings: 1234, monthlyDeposit: 25, annualRate: 3.7 }],
    ['growth only, no deposits', { ...base, goalAmount: 20_000, currentSavings: 10_000, monthlyDeposit: 0, annualRate: 5 }],
  ])('the month-by-month loop agrees with the closed-form solution: %s', (_label, v) => {
    expect(monthsOf(compute(v))).toBe(
      closedFormMonths(v.currentSavings, v.goalAmount, v.monthlyDeposit, v.annualRate),
    )
  })

  test('the goal is reached on the reported month and not before', () => {
    const r = compute(base)
    const n = monthsOf(r)
    const i = base.annualRate / 100 / 12
    // Re-simulate to n and to n−1 from the same inputs.
    const balanceAfter = (k: number) => {
      let b = base.currentSavings
      for (let m = 0; m < k; m++) b = b * (1 + i) + base.monthlyDeposit
      return b
    }
    expect(balanceAfter(n)).toBeGreaterThanOrEqual(base.goalAmount)
    expect(balanceAfter(n - 1)).toBeLessThan(base.goalAmount)
    expect(stat(r, 'Balance when you get there')).toBeCloseTo(balanceAfter(n), 6)
  })

  test('the closing balance is exactly the money in plus the interest earned', () => {
    const r = compute(base)
    expect(stat(r, 'Balance when you get there')).toBeCloseTo(
      base.currentSavings + stat(r, 'Total deposited') + stat(r, 'Interest earned'),
      6,
    )
    expect(stat(r, 'Interest earned')).toBeGreaterThan(0)
  })

  test('already at the goal takes zero months and no deposits', () => {
    const r = compute({ ...base, currentSavings: 25_000 })
    expect(monthsOf(r)).toBe(0)
    expect(stat(r, 'Total deposited')).toBe(0)
    expect(stat(r, 'Interest earned')).toBe(0)
    expect(r.notes).toHaveLength(1)
    expect(resolveBand(def.scale, r.scaleValue!)!.id).toBe('excellent')
  })

  test('a better return never takes longer', () => {
    let previous = Infinity
    for (const annualRate of [0, 1, 3, 5, 8, 12]) {
      const months = monthsOf(compute({ ...base, annualRate }))
      expect(months).toBeLessThanOrEqual(previous)
      previous = months
    }
  })

  test('nudging the first number field to 1.1x stays valid and moves the answer', () => {
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('goalAmount')
    const nudged = { ...base, goalAmount: base.goalAmount * 1.1 }
    expect(monthsOf(compute(nudged))).toBeGreaterThan(monthsOf(compute(base)))
  })

  test('an unreachable goal throws rather than returning the 1200-month cap', () => {
    let thrown: unknown
    try {
      compute({ goalAmount: 1_000_000, currentSavings: 0, monthlyDeposit: 0, annualRate: 0 })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe('monthlyDeposit')
    // Also unreachable inside the cap even though the maths converges eventually.
    expect(() => compute({ goalAmount: 1e9, currentSavings: 0, monthlyDeposit: 10, annualRate: 0 })).toThrow(
      CalcError,
    )
  })

  test('a goal just inside the cap still returns a number', () => {
    const r = compute({ goalAmount: 1200, currentSavings: 0, monthlyDeposit: 1, annualRate: 0 })
    expect(monthsOf(r)).toBe(1200)
    expect(Number.isFinite(r.scaleValue!)).toBe(true)
  })

  test.each([
    ['zero goal', { goalAmount: 0 }, 'goalAmount'],
    ['negative goal', { goalAmount: -100 }, 'goalAmount'],
    ['negative current savings', { currentSavings: -1 }, 'currentSavings'],
    ['negative deposit', { monthlyDeposit: -50 }, 'monthlyDeposit'],
    ['negative return', { annualRate: -2 }, 'annualRate'],
    ['a non-numeric goal', { goalAmount: Number.NaN }, 'goalAmount'],
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

  test('never returns NaN for the primary value', () => {
    expect(Number.isFinite(monthsOf(compute(base)))).toBe(true)
  })
})

describe('savings goal parts and series', () => {
  const inputs: Array<[string, { [K in keyof typeof base]: number }]> = [
    ['the defaults', base],
    ['a second input set', { goalAmount: 250_000, currentSavings: 0, monthlyDeposit: 900, annualRate: 6 }],
    ['a zero return', { ...base, annualRate: 0 }],
    ['a long slow haul', { goalAmount: 1_000_000, currentSavings: 100, monthlyDeposit: 1200, annualRate: 3 }],
  ]

  test.each(inputs)('parts sum exactly to the balance at goal for %s', (_label, input) => {
    const r = compute(input)
    const sum = r.parts!.reduce((s, p) => s + p.value, 0)
    expect(r.partsTotal!.label).toBe('Balance at goal')
    expect(sum).toBeCloseTo(Number(r.partsTotal!.value), 4)
    expect(Number(r.partsTotal!.value)).toBeCloseTo(stat(r, 'Balance when you get there'), 6)
    for (const p of r.parts!) expect(p.value).toBeGreaterThanOrEqual(0)
  })

  test.each(inputs)('the balance series ends at the goal month on the closing balance for %s', (_label, input) => {
    const r = compute(input)
    const s = r.series!.find((x) => x.label === 'Balance')!
    const last = s.points[s.points.length - 1]!
    expect(last[0]).toBe(monthsOf(r))
    expect(last[1]).toBeCloseTo(stat(r, 'Balance when you get there'), 6)
    expect(s.points[0]![0]).toBe(0)
    expect(s.points[0]![1]).toBeCloseTo(input.currentSavings, 6)
  })

  test.each(inputs)('series x is strictly increasing and thinned for %s', (_label, input) => {
    for (const s of compute(input).series!) {
      expect(s.points.length).toBeGreaterThan(1)
      expect(s.points.length).toBeLessThanOrEqual(45)
      s.points.forEach((p, i) => {
        expect(Number.isFinite(p[0])).toBe(true)
        expect(Number.isFinite(p[1])).toBe(true)
        if (i > 0) expect(p[0]).toBeGreaterThan(s.points[i - 1]![0])
      })
    }
  })

  test('every plotted point matches an independent month-by-month loop', () => {
    const s = compute(base).series!.find((x) => x.label === 'Balance')!
    const monthlyRate = base.annualRate / 100 / 12
    const walk: number[] = [base.currentSavings]
    for (let m = 1; m <= 200; m++)
      walk.push(walk[m - 1]! * (1 + monthlyRate) + base.monthlyDeposit)
    for (const [x, y] of s.points) expect(y).toBeCloseTo(walk[x]!, 4)
  })

  test('omits the series when the goal is already met', () => {
    const r = compute({ ...base, currentSavings: 30_000 })
    expect(monthsOf(r)).toBe(0)
    expect(r.series ?? []).toHaveLength(0)
    const sum = r.parts!.reduce((s, p) => s + p.value, 0)
    expect(sum).toBeCloseTo(Number(r.partsTotal!.value), 4)
  })
})

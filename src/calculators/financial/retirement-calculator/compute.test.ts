import { describe, expect, test } from 'vitest'
import compute from './compute'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'
import type { Values } from '../../../lib/types'

type Input = Values<typeof fields>

const base: Input = {
  currentAge: 40,
  retirementAge: 65,
  currentSavings: 50_000,
  monthlyContribution: 500,
  annualReturn: 7,
  withdrawalRate: '4',
}

/**
 * Independent check: step the balance forward one month at a time. Interest is
 * credited first, then the deposit lands (an ordinary annuity), so the final
 * contribution earns nothing. If the closed form and this loop disagree, one of
 * them has an off-by-one in the number of compounding periods.
 */
function simulate(v: Input): number {
  const months = (v.retirementAge - v.currentAge) * 12
  const i = v.annualReturn / 100 / 12
  let balance = v.currentSavings
  for (let m = 0; m < months; m += 1) {
    balance = balance * (1 + i) + v.monthlyContribution
  }
  return balance
}

const primary = (v: Input) => Number(compute(v).primary.value)
const stat = (v: Input, label: string) =>
  Number(compute(v).stats!.find((s) => s.label === label)!.value)

describe('retirement', () => {
  test('the closed form matches a month-by-month simulation', () => {
    // 25 years of $500/mo on top of $50k at 7%.
    expect(primary(base)).toBeCloseTo(simulate(base), 4)
  })

  test('the two engines add up to the projected total', () => {
    // Existing savings compounding alone, plus contributions alone, must equal
    // the combined projection — the model is linear in its two inputs.
    const savingsOnly = primary({ ...base, monthlyContribution: 0 })
    const contributionsOnly = primary({ ...base, currentSavings: 0 })
    expect(savingsOnly + contributionsOnly).toBeCloseTo(primary(base), 4)
    // And the savings-only leg is plain monthly compounding.
    expect(savingsOnly).toBeCloseTo(50_000 * Math.pow(1 + 0.07 / 12, 300), 4)
  })

  test('a 0% return is just the deposits, with no division by zero', () => {
    const flat = { ...base, annualReturn: 0 }
    expect(primary(flat)).toBeCloseTo(50_000 + 500 * 300, 6)
    expect(primary(flat)).toBeCloseTo(simulate(flat), 6)
    expect(stat(flat, 'Investment growth')).toBeCloseTo(0, 6)
  })

  test('income is the withdrawal rate applied to the nest egg', () => {
    const nestEgg = primary(base)
    expect(stat(base, 'Annual retirement income')).toBeCloseTo(nestEgg * 0.04, 6)
    expect(stat(base, 'Monthly retirement income')).toBeCloseTo((nestEgg * 0.04) / 12, 6)
    // The select arrives as a string; a 3% rate must be three quarters of a 4% one.
    expect(stat({ ...base, withdrawalRate: '3' }, 'Annual retirement income')).toBeCloseTo(
      stat(base, 'Annual retirement income') * 0.75,
      6,
    )
  })

  test('contributed and growth partition the total', () => {
    const contributed = stat(base, 'Total contributed')
    const growth = stat(base, 'Investment growth')
    expect(contributed).toBeCloseTo(500 * 300, 6)
    expect(50_000 + contributed + growth).toBeCloseTo(primary(base), 4)
    expect(growth).toBeGreaterThan(0)
  })

  test('the shortest horizon a user can actually select is 12 months', () => {
    // retirementAge has step 1 and integer bounds, so one year is the shortest
    // gap the form can produce. Twelve credits of interest, twelve deposits.
    const oneYear = { ...base, currentAge: 64, retirementAge: 65 }
    // Derived by hand outside the implementation: 50000*(1+i)^12 + 500*((1+i)^12-1)/i
    // with i = 0.07/12, cross-checked against a 12-step loop in node.
    expect(primary(oneYear)).toBeCloseTo(59_810.796687632, 6)
    expect(primary(oneYear)).toBeCloseTo(simulate(oneYear), 6)
    expect(stat(oneYear, 'Total contributed')).toBeCloseTo(6_000, 6)
  })

  test('the nudged first number field stays valid and moves the result', () => {
    // An end-to-end test bumps the first number field to 1.1x its default.
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('currentAge')
    const nudged = { ...base, currentAge: first.default * 1.1 }
    expect(nudged.currentAge).toBe(44)
    expect(() => compute(nudged)).not.toThrow()
    // Four fewer years of compounding must lower the projection.
    expect(primary(nudged)).toBeLessThan(primary(base))
  })

  test.each([
    ['a zero current age', { currentAge: 0 }, 'currentAge'],
    ['retiring at the current age', { retirementAge: 40 }, 'retirementAge'],
    ['retiring before the current age', { retirementAge: 30 }, 'retirementAge'],
    ['negative savings', { currentSavings: -1 }, 'currentSavings'],
    ['a negative contribution', { monthlyContribution: -50 }, 'monthlyContribution'],
    ['a negative return', { annualReturn: -2 }, 'annualReturn'],
    ['a zero withdrawal rate', { withdrawalRate: '0' }, 'withdrawalRate'],
    // The island's coerceValues emits NaN for a number field it cannot parse
    // ("abc", "1e999"), on the expectation that compute rejects it rather than
    // quietly propagating NaN into the result.
    ['an unparseable current age', { currentAge: Number.NaN }, 'currentAge'],
    ['an unparseable retirement age', { retirementAge: Number.NaN }, 'retirementAge'],
    ['unparseable savings', { currentSavings: Number.NaN }, 'currentSavings'],
    ['an unparseable contribution', { monthlyContribution: Number.NaN }, 'monthlyContribution'],
    ['an unparseable return', { annualReturn: Number.NaN }, 'annualReturn'],
    ['an unparseable withdrawal rate', { withdrawalRate: 'abc' }, 'withdrawalRate'],
    ['an infinite current age', { currentAge: Number.POSITIVE_INFINITY }, 'currentAge'],
    ['an infinite retirement age', { retirementAge: Number.POSITIVE_INFINITY }, 'retirementAge'],
    ['infinite savings', { currentSavings: Number.POSITIVE_INFINITY }, 'currentSavings'],
    [
      'an infinite contribution',
      { monthlyContribution: Number.POSITIVE_INFINITY },
      'monthlyContribution',
    ],
    ['an infinite return', { annualReturn: Number.POSITIVE_INFINITY }, 'annualReturn'],
  ])('rejects %s', (_label, patch, fieldId) => {
    let thrown: unknown
    try {
      compute({ ...base, ...patch } as Input)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
  })

  test.each<[string, Partial<Input>]>([
    ['the defaults', {}],
    ['a zero return', { annualReturn: 0 }],
    ['no starting balance', { currentSavings: 0 }],
    ['no contributions', { monthlyContribution: 0 }],
    ['nothing saved at all', { currentSavings: 0, monthlyContribution: 0 }],
    ['the shortest horizon', { currentAge: 64, retirementAge: 65 }],
    ['the longest horizon', { currentAge: 16, retirementAge: 100 }],
    ['the nudged first field', { currentAge: 44 }],
  ])('never returns NaN for %s', (_label, patch) => {
    const r = compute({ ...base, ...patch })
    const values = [r.primary, ...(r.stats ?? []), ...(r.steps ?? [])]
      .filter((q): q is Exclude<typeof q, { rule: true }> => !('rule' in q))
      .map((q) => Number(q.value))
    expect(values.every((n) => Number.isFinite(n))).toBe(true)
  })
})

describe('retirement parts and series', () => {
  const inputs: Array<[string, Input]> = [
    ['the defaults', base],
    ['a second input set', { ...base, currentAge: 25, retirementAge: 70, currentSavings: 0, monthlyContribution: 1200, annualReturn: 5.5, withdrawalRate: '3.5' }],
    ['a zero return', { ...base, annualReturn: 0 }],
    ['the longest horizon at the field maxima', { ...base, currentAge: 16, retirementAge: 100, currentSavings: 5_000_000, monthlyContribution: 20_000 }],
  ]

  test.each(inputs)('parts sum exactly to the nest egg for %s', (_label, input) => {
    const r = compute(input)
    const sum = r.parts!.reduce((s, p) => s + p.value, 0)
    expect(r.partsTotal!.label).toBe('Nest egg at retirement')
    expect(sum).toBeCloseTo(Number(r.partsTotal!.value), 4)
    expect(Number(r.partsTotal!.value)).toBeCloseTo(Number(r.primary.value), 4)
    for (const p of r.parts!) expect(p.value).toBeGreaterThanOrEqual(0)
  })

  test('the contributions slice is the raw amount paid in', () => {
    const r = compute(base)
    const months = (base.retirementAge - base.currentAge) * 12
    expect(r.parts!.find((p) => p.label === 'Contributions')!.value).toBeCloseTo(
      base.monthlyContribution * months,
      6,
    )
  })

  test.each(inputs)('the balance series ends on the headline for %s', (_label, input) => {
    const s = compute(input).series!.find((x) => x.label === 'Projected balance')!
    const last = s.points[s.points.length - 1]!
    expect(last[0]).toBe(input.retirementAge)
    expect(last[1]).toBeCloseTo(Number(compute(input).primary.value), 6)
    expect(s.points[0]![0]).toBe(input.currentAge)
    expect(s.points[0]![1]).toBeCloseTo(input.currentSavings, 6)
  })

  test.each(inputs)('series x is strictly increasing and bounded for %s', (_label, input) => {
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

  test('a mid-curve point matches an independent month-by-month loop', () => {
    const r = compute(base)
    const s = r.series!.find((x) => x.label === 'Projected balance')!
    const point = s.points[3]!
    const monthlyRate = base.annualReturn / 100 / 12
    let bal = base.currentSavings
    for (let m = 0; m < (point[0] - base.currentAge) * 12; m++)
      bal = bal * (1 + monthlyRate) + base.monthlyContribution
    expect(point[1]).toBeCloseTo(bal, 4)
  })
})

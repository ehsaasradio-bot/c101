import { describe, expect, test } from 'vitest'
import compute from './compute'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'

type Input = Parameters<typeof compute>[0]

// Deliberately NOT `as const`: pinning the literals would make
// `Partial<typeof base>` reject `{ grossIncome: 30_000 }`.
const base: Input = { grossIncome: 85_000, filingStatus: 'single', preTaxDeductions: 0 }

const run = (patch: Partial<Input> = {}) => compute({ ...base, ...patch })

const stat = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)

const taxOf = (patch: Partial<Input> = {}) => Number(run(patch).primary.value)

/** 2026 standard deduction, Rev. Proc. 2025-32 section 4.14. */
const STD: Record<string, number> = { single: 16_100, married: 32_200, headOfHousehold: 24_150 }

/** Gross income that produces exactly this much taxable income, with no pre-tax deductions. */
const grossFor = (taxable: number, status: string) => taxable + STD[status]!

/**
 * The IRS tax rate tables restated as cumulative "plus" constants: the tax due
 * at the TOP of each band, quoted verbatim from Rev. Proc. 2025-32 tables 1-3.
 *
 * These are the outside world's own numbers, published independently of any
 * arithmetic in this repo, which is what makes them evidence rather than a
 * restatement of the formula. A bracket table transcribed one row out of
 * alignment, or a stack that taxes the whole income at the top rate, fails here
 * even though every self-consistent check would pass.
 */
const IRS_CUMULATIVE: Record<string, ReadonlyArray<readonly [number, number]>> = {
  // Table 3 — Unmarried Individuals.
  single: [
    [12_400, 1_240], // then 12% of the excess
    [50_400, 5_800], // then 22%
    [105_700, 17_966], // then 24%
    [201_775, 41_024], // then 32%
    [256_225, 58_448], // then 35%
    [640_600, 192_979.25], // then 37%
  ],
  // Table 1 — Married Filing Joint Returns and Surviving Spouses.
  married: [
    [24_800, 2_480],
    [100_800, 11_600],
    [211_400, 35_932],
    [403_550, 82_048],
    [512_450, 116_896],
    [768_700, 206_583.5],
  ],
  // Table 2 — Heads of Households.
  headOfHousehold: [
    [17_700, 1_770],
    [67_450, 7_740],
    [105_700, 16_155],
    [201_750, 39_207],
    [256_200, 56_631],
    [640_600, 191_171],
  ],
}

const STATUSES = ['single', 'married', 'headOfHousehold'] as const

describe('income tax at the defaults', () => {
  test('$85,000 single with no pre-tax deductions owes $9,870', () => {
    // Derived from the bracket stack by hand, band by band, on taxable income
    // of 85,000 - 16,100 = 68,900:
    //   10% on the first  12,400              =   1,240
    //   12% on  50,400 - 12,400 = 38,000      =   4,560
    //   22% on  68,900 - 50,400 = 18,500      =   4,070
    const byHand = 0.1 * 12_400 + 0.12 * (50_400 - 12_400) + 0.22 * (68_900 - 50_400)
    expect(byHand).toBeCloseTo(9_870, 9)

    const r = run()
    expect(Number(r.primary.value)).toBeCloseTo(9_870, 6)
    expect(stat(r, 'Taxable income')).toBe(68_900)
    expect(stat(r, 'Marginal tax rate')).toBe(22)
  })

  test('confirmation one: the IRS closed form for the same band agrees', () => {
    // Table 3: "Over $50,400 but not over $105,700 — $5,800 plus 22% of the
    // excess over $50,400". Reached without stacking anything.
    expect(5_800 + 0.22 * (68_900 - 50_400)).toBeCloseTo(9_870, 9)
    expect(taxOf()).toBeCloseTo(5_800 + 0.22 * (68_900 - 50_400), 6)
  })

  test('confirmation two: effective rate x gross income returns the tax', () => {
    const r = run()
    const effective = stat(r, 'Effective tax rate')
    expect(effective).toBeCloseTo((9_870 / 85_000) * 100, 9)
    expect(effective).toBeCloseTo(11.611764705882353, 9)
    // The identity the headline claim rests on, checked in the other direction.
    expect((effective / 100) * 85_000).toBeCloseTo(Number(r.primary.value), 6)
  })

  test('confirmation three: the parts sum to gross income exactly', () => {
    const r = run()
    const parts = r.parts!
    expect(parts.map((p) => p.value)).toEqual([9_870, 16_100, 59_030])
    expect(parts.reduce((s, p) => s + p.value, 0)).toBeCloseTo(85_000, 6)
    expect(Number(r.partsTotal!.value)).toBe(85_000)
  })

  test('the per-bracket detail is in stats and adds up to the total', () => {
    const r = run()
    expect(stat(r, 'Tax in the 10% bracket')).toBeCloseTo(1_240, 6)
    expect(stat(r, 'Tax in the 12% bracket')).toBeCloseTo(4_560, 6)
    expect(stat(r, 'Tax in the 22% bracket')).toBeCloseTo(4_070, 6)
    expect(r.stats!.find((s) => s.label === 'Tax in the 24% bracket')).toBeUndefined()

    const perBracket = r
      .stats!.filter((s) => s.label.startsWith('Tax in the '))
      .reduce((sum, s) => sum + Number(s.value), 0)
    expect(perBracket).toBeCloseTo(9_870, 6)
  })
})

describe('the published IRS tables', () => {
  test.each(STATUSES)('%s: tax at every band ceiling matches the published constant', (status) => {
    for (const [taxable, published] of IRS_CUMULATIVE[status]!) {
      expect(taxOf({ grossIncome: grossFor(taxable, status), filingStatus: status })).toBeCloseTo(
        published,
        6,
      )
    }
  })

  test.each(STATUSES)('%s: the excess-over term above each ceiling also matches', (status) => {
    const table = IRS_CUMULATIVE[status]!
    const nextRate = [0.12, 0.22, 0.24, 0.32, 0.35, 0.37]
    table.forEach(([taxable, published], i) => {
      const excess = 1_000
      const expected = published + nextRate[i]! * excess
      expect(
        taxOf({ grossIncome: grossFor(taxable + excess, status), filingStatus: status }),
      ).toBeCloseTo(expected, 6)
    })
  })

  test('the top 37% band keeps running above the last published constant', () => {
    // Table 3: "$192,979.25 plus 37% of the excess over $640,600".
    const taxable = 700_000
    expect(taxOf({ grossIncome: grossFor(taxable, 'single') })).toBeCloseTo(
      192_979.25 + 0.37 * (taxable - 640_600),
      6,
    )
  })
})

describe('bracket boundaries', () => {
  test.each(STATUSES)('%s: the marginal rate flips exactly at each threshold', (status) => {
    const rates = [0.12, 0.22, 0.24, 0.32, 0.35, 0.37]
    IRS_CUMULATIVE[status]!.forEach(([taxable], i) => {
      const gross = grossFor(taxable, status)
      const below = run({ grossIncome: gross - 1, filingStatus: status })
      const at = run({ grossIncome: gross, filingStatus: status })
      const above = run({ grossIncome: gross + 1, filingStatus: status })

      // One dollar below the ceiling the next dollar is still in the old band;
      // AT the ceiling the next dollar has already crossed.
      expect(stat(below, 'Marginal tax rate')).toBeCloseTo((i === 0 ? 0.1 : rates[i - 1]!) * 100, 9)
      expect(stat(at, 'Marginal tax rate')).toBeCloseTo(rates[i]! * 100, 9)
      expect(stat(above, 'Marginal tax rate')).toBeCloseTo(rates[i]! * 100, 9)
    })
  })

  test.each(STATUSES)('%s: the standard deduction shields the first dollars entirely', (status) => {
    const deduction = STD[status]!
    expect(taxOf({ grossIncome: deduction, filingStatus: status })).toBe(0)
    expect(taxOf({ grossIncome: deduction - 1, filingStatus: status })).toBe(0)
    // Below the deduction the NEXT dollar is not taxed either, so the honest
    // marginal rate is 0% — not the 10% the bracket table alone would suggest.
    expect(stat(run({ grossIncome: deduction - 1, filingStatus: status }), 'Marginal tax rate')).toBe(0)
    expect(stat(run({ grossIncome: deduction, filingStatus: status }), 'Marginal tax rate')).toBe(10)
    // The first taxed dollar is taxed at 10 cents, so a dollar over the line
    // costs a dime, not a bracket.
    expect(taxOf({ grossIncome: deduction + 1, filingStatus: status })).toBeCloseTo(0.1, 9)
  })

  test('pre-tax deductions move the boundaries by their own amount', () => {
    // 6,000 deferred pushes the whole schedule 6,000 further up the gross scale.
    const shifted = run({ grossIncome: 85_000 + 6_000, preTaxDeductions: 6_000 })
    expect(Number(shifted.primary.value)).toBeCloseTo(9_870, 6)
    expect(stat(shifted, 'Taxable income')).toBe(68_900)
    // A dollar deferred saves exactly the marginal rate.
    expect(taxOf() - taxOf({ preTaxDeductions: 1_000 })).toBeCloseTo(0.22 * 1_000, 6)
  })
})

describe('the misconception: crossing a bracket never lowers take-home pay', () => {
  const takeHome = (gross: number, status: string) =>
    gross - taxOf({ grossIncome: gross, filingStatus: status })

  test.each(STATUSES)('%s: a dollar over each threshold leaves you better off', (status) => {
    for (const [taxable] of IRS_CUMULATIVE[status]!) {
      const gross = grossFor(taxable, status)
      for (const extra of [0.01, 1, 100, 1_000, 25_000]) {
        expect(
          takeHome(gross + extra, status),
          `${status}: crossing ${taxable} by ${extra} lost money`,
        ).toBeGreaterThan(takeHome(gross, status))
      }
      // And the extra dollar is never taxed at more than the top rate, so you
      // always keep the majority of it.
      expect(taxOf({ grossIncome: gross + 1, filingStatus: status }) - taxOf({ grossIncome: gross, filingStatus: status })).toBeLessThan(0.4)
    }
  })

  test.each(STATUSES)('%s: take-home is strictly increasing across a dense sweep', (status) => {
    let previous = -1
    for (let gross = 0; gross <= 900_000; gross += 500) {
      const kept = takeHome(gross, status)
      expect(kept, `${status} @ ${gross}`).toBeGreaterThan(previous)
      previous = kept
    }
  })

  test.each(STATUSES)('%s: the effective rate never reaches the marginal rate', (status) => {
    for (const gross of [20_000, 60_000, 120_000, 400_000, 900_000, 5_000_000]) {
      const r = run({ grossIncome: gross, filingStatus: status })
      const marginal = stat(r, 'Marginal tax rate')
      const effective = stat(r, 'Effective tax rate')
      if (Number(r.primary.value) === 0) {
        // Below the standard deduction both rates are honestly 0%: nothing is
        // taxed and the next dollar is not taxed either.
        expect(marginal, `${status} @ ${gross}`).toBe(0)
        expect(effective, `${status} @ ${gross}`).toBe(0)
        continue
      }
      expect(effective, `${status} @ ${gross}`).toBeLessThan(marginal)
      // and the effective rate on gross is below the one on taxable income,
      // because the deduction is in the denominator of only one of them.
      expect(effective).toBeLessThan(stat(r, 'Effective rate on taxable income'))
    }
  })
})

describe('shape stays fixed while the bracket count does not', () => {
  const INCOMES = [0, 500, 15_000, 45_000, 85_000, 250_000, 1_500_000, 5_000_000]

  test.each(STATUSES)('%s: always three parts and two 41-point series', (status) => {
    for (const grossIncome of INCOMES) {
      const r = run({ grossIncome, filingStatus: status })
      expect(r.parts!.length, `${status} @ ${grossIncome}`).toBe(3)
      expect(r.series!.length, `${status} @ ${grossIncome}`).toBe(2)
      for (const s of r.series!) {
        expect(s.points.length, `${status} @ ${grossIncome}`).toBe(41)
        s.points.forEach((p, i) => {
          expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true)
          if (i > 0) expect(p[0]).toBeGreaterThan(s.points[i - 1]![0])
        })
      }
      // The whole is gross income at every input, and no slice is negative.
      const parts = r.parts!
      expect(parts.reduce((sum, p) => sum + p.value, 0)).toBeCloseTo(grossIncome, 4)
      for (const p of parts) expect(p.value).toBeGreaterThanOrEqual(0)
    }
  })

  test('the per-bracket stats DO grow with income — that is where the detail lives', () => {
    const rows = (gross: number) =>
      run({ grossIncome: gross }).stats!.filter((s) => s.label.startsWith('Tax in the ')).length
    expect(rows(10_000)).toBe(0)
    expect(rows(25_000)).toBe(1)
    expect(rows(85_000)).toBe(3)
    expect(rows(5_000_000)).toBe(7)
  })

  test('the chart puts the entered income at the midpoint of the axis', () => {
    const r = run()
    for (const s of r.series!) expect(s.points[20]![0]).toBeCloseTo(85_000, 6)
    // The effective-rate line agrees with the headline at that point.
    expect(r.series![0]!.points[20]![1]).toBeCloseTo(stat(r, 'Effective tax rate'), 9)
    // The marginal line is a staircase that never falls.
    const marginal = r.series![1]!.points.map((p) => p[1])
    for (let i = 1; i < marginal.length; i++) expect(marginal[i]!).toBeGreaterThanOrEqual(marginal[i - 1]!)
  })

  test('a zero income is valid and yields a whole of zero', () => {
    const r = run({ grossIncome: 0 })
    expect(Number(r.primary.value)).toBe(0)
    expect(stat(r, 'Effective tax rate')).toBe(0)
    expect(r.parts!.every((p) => p.value === 0)).toBe(true)
    expect(Number(r.partsTotal!.value)).toBe(0)
  })
})

describe('filing status', () => {
  test('married filing jointly owes less than single on the same income', () => {
    for (const gross of [45_000, 85_000, 250_000, 700_000]) {
      expect(taxOf({ grossIncome: gross, filingStatus: 'married' })).toBeLessThan(
        taxOf({ grossIncome: gross, filingStatus: 'single' }),
      )
      expect(taxOf({ grossIncome: gross, filingStatus: 'headOfHousehold' })).toBeLessThan(
        taxOf({ grossIncome: gross, filingStatus: 'single' }),
      )
    }
  })

  test('below the 22% band, married is exactly two single filers', () => {
    // The joint bands are double the single ones up to the 22% threshold, so a
    // couple on $90,000 owes what two singles on $45,000 owe. It stops being
    // true higher up, which is the marriage penalty.
    const joint = taxOf({ grossIncome: 90_000, filingStatus: 'married' })
    const twoSingles = 2 * taxOf({ grossIncome: 45_000, filingStatus: 'single' })
    expect(joint).toBeCloseTo(twoSingles, 6)
    expect(taxOf({ grossIncome: 1_400_000, filingStatus: 'married' })).toBeGreaterThan(
      2 * taxOf({ grossIncome: 700_000, filingStatus: 'single' }),
    )
  })

  test('the notes name the tax year and its source', () => {
    const notes = run().notes!.join(' ')
    expect(notes).toContain('2026')
    expect(notes).toContain('Revenue Procedure 2025-32')
    expect(notes).toContain('$16,100')
    expect(notes).toContain('10% up to $12,400')
    expect(notes).toContain('37% above $640,600')
    // Federal only, said plainly, because a "your tax" figure without FICA
    // would be actively misleading.
    expect(notes).toContain('FICA')
    expect(notes).toContain('state and local income tax')
  })
})

describe('input handling', () => {
  test('the first number field nudged to 1.1x stays valid and moves the result', () => {
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('grossIncome')
    const nudged = first.default * 1.1
    expect(nudged).toBeGreaterThanOrEqual(first.min!)
    expect(nudged).toBeLessThanOrEqual(first.max!)
    // 93,500 gross is 77,400 taxable: 5,800 + 22% of 27,000 = 11,740.
    expect(taxOf({ grossIncome: nudged })).toBeCloseTo(5_800 + 0.22 * (77_400 - 50_400), 6)
    expect(taxOf({ grossIncome: nudged })).not.toBe(taxOf())
  })

  test('every declared bound computes with the other fields at their defaults', () => {
    for (const field of fields) {
      if (field.kind !== 'number') continue
      for (const bound of [field.min, field.max]) {
        expect(() => run({ [field.id]: bound } as Partial<Input>)).not.toThrow()
      }
    }
  })

  test.each([
    ['a negative income', { grossIncome: -1 }, 'grossIncome'],
    ['an unparseable income', { grossIncome: Number.NaN }, 'grossIncome'],
    ['an absurd income', { grossIncome: 2e9 }, 'grossIncome'],
    ['an unknown filing status', { filingStatus: 'marriedFilingSeparately' }, 'filingStatus'],
    ['negative deductions', { preTaxDeductions: -100 }, 'preTaxDeductions'],
    ['unparseable deductions', { preTaxDeductions: Number.NaN }, 'preTaxDeductions'],
    ['deductions above income', { preTaxDeductions: 90_000 }, 'preTaxDeductions'],
  ])('rejects %s against the offending field', (_label, patch, fieldId) => {
    let thrown: unknown
    try {
      run(patch as Partial<Input>)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
    expect((thrown as CalcError).message.length).toBeGreaterThan(0)
  })

  test('never returns NaN anywhere in the result', () => {
    for (const status of STATUSES) {
      for (const grossIncome of [0, 1_000, 16_100, 85_000, 640_600, 5_000_000]) {
        const r = run({ grossIncome, filingStatus: status })
        const numbers = [
          Number(r.primary.value),
          ...r.stats!.map((s) => Number(s.value)),
          ...r.parts!.map((p) => p.value),
          ...r.series!.flatMap((s) => s.points.flatMap((p) => [p[0], p[1]])),
        ]
        for (const n of numbers) expect(Number.isFinite(n)).toBe(true)
      }
    }
  })
})

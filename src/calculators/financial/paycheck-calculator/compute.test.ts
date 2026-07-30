import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { fields } from './fields'
import { bySlug } from '../../index'
import { CalcError } from '../../../lib/types'
import type { Field } from '../../../lib/types'

type Input = Parameters<typeof compute>[0]

/**
 * Deliberately NOT `as const`: pinning the literals would make a patch of
 * `{ grossSalary: 82_500 }` a type error against the literal type `75000`.
 */
const base: Input = {
  grossSalary: 75_000,
  payFrequency: 'biweekly',
  filingStatus: 'single',
  retirementPercent: 6,
  healthPremium: 150,
  postTaxDeductions: 25,
}

const run = (patch: Partial<Input> = {}) => compute({ ...base, ...patch })

const stat = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)

const step = (r: ReturnType<typeof compute>, label: string) =>
  Number(
    (r.steps!.filter((s) => !('rule' in s)) as { label: string; value: number | string }[]).find(
      (s) => s.label === label,
    )!.value,
  )

const part = (r: ReturnType<typeof compute>, label: string) =>
  r.parts!.find((p) => p.label === label)!.value

/**
 * An INDEPENDENT federal income tax, written as cumulative tax at the floor of
 * each band rather than as a loop over widths. Every entry below was worked out
 * by hand from the Rev. Proc. 2025-32 bracket edges, so agreeing with
 * `compute.ts` means two different arrangements of the same published table
 * agree — not that one function agrees with itself.
 *
 *   single 12% floor: 12,400 x 0.10                      = 1,240
 *   single 22% floor: 1,240 + 38,000 x 0.12              = 5,800
 *   single 24% floor: 5,800 + 55,300 x 0.22              = 17,966
 *   single 32% floor: 17,966 + 96,075 x 0.24             = 41,024
 *   single 35% floor: 41,024 + 54,450 x 0.32             = 58,448
 *   single 37% floor: 58,448 + 384,375 x 0.35            = 192,979.25
 */
const CUMULATIVE: Record<string, ReadonlyArray<readonly [number, number, number]>> = {
  // [floor of band, tax already accrued at that floor, rate within the band]
  single: [
    [0, 0, 0.1],
    [12_400, 1_240, 0.12],
    [50_400, 5_800, 0.22],
    [105_700, 17_966, 0.24],
    [201_775, 41_024, 0.32],
    [256_225, 58_448, 0.35],
    [640_600, 192_979.25, 0.37],
  ],
  married: [
    [0, 0, 0.1],
    [24_800, 2_480, 0.12],
    [100_800, 11_600, 0.22],
    [211_400, 35_932, 0.24],
    [403_550, 82_048, 0.32],
    [512_450, 116_896, 0.35],
    [768_700, 206_583.5, 0.37],
  ],
  // Verbatim from Rev. Proc. 2025-32 Table 2, rather than derived here. These
  // are the IRS's own cumulative "plus" constants, so agreeing with them is
  // outside evidence and not a restatement of the schedule under test. The
  // 24% band ends at $201,750, $25 below the single filer's — Tax Foundation
  // publishes $201,775 for this row and is wrong.
  head: [
    [0, 0, 0.1],
    [17_700, 1_770, 0.12],
    [67_450, 7_740, 0.22],
    [105_700, 16_155, 0.24],
    [201_750, 39_207, 0.32],
    [256_200, 56_631, 0.35],
    [640_600, 191_171, 0.37],
  ],
}

const taxByTable = (taxable: number, status: string) => {
  const bands = CUMULATIVE[status]!
  let chosen = bands[0]!
  for (const band of bands) if (taxable >= band[0]) chosen = band
  return chosen[1] + (taxable - chosen[0]) * chosen[2]
}

const STANDARD_DEDUCTION: Record<string, number> = {
  single: 16_100,
  married: 32_200,
  head: 24_150,
}
const PERIODS: Record<string, number> = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 }

/**
 * A whole second implementation, in integer cents, built from the published
 * rules rather than from `compute.ts`. Nothing here is imported from the
 * calculator except the input.
 */
function independentAnnualTakeHomeCents(v: Input) {
  const c = (x: number) => Math.round(x * 100)
  const periods = PERIODS[v.payFrequency]!
  const gross = c(v.grossSalary)
  const health = c(v.healthPremium) * periods
  const postTax = c(v.postTaxDeductions) * periods
  const deferral = Math.min(Math.round((gross * v.retirementPercent) / 100), c(24_500))

  const ficaWages = gross - health
  const ss = Math.round(Math.min(ficaWages, c(184_500)) * 0.062)
  const medicare = Math.round(ficaWages * 0.0145)
  const surtaxFloor = c(v.filingStatus === 'married' ? 250_000 : 200_000)
  const extra = Math.round(Math.max(0, ficaWages - surtaxFloor) * 0.009)

  const taxable = Math.max(0, ficaWages - deferral - c(STANDARD_DEDUCTION[v.filingStatus]!))
  const federal = Math.round(taxByTable(taxable / 100, v.filingStatus) * 100)

  return gross - federal - ss - medicare - extra - deferral - health - postTax
}

describe('paycheck', () => {
  test('the default paycheck is $2,103.42, worked out line by line', () => {
    /*
     * Derived, not invented. Gross 75,000, single, biweekly, 6% 401(k),
     * $150 health and $25 post-tax per paycheck over 26 paychecks:
     *
     *   401(k)          75,000 x 0.06                    =  4,500
     *   health          150 x 26                         =  3,900
     *   post-tax        25 x 26                          =    650
     *   FICA wages      75,000 - 3,900                   = 71,100   (Section 125 only)
     *   Social Security 71,100 x 0.062                   =  4,408.20
     *   Medicare        71,100 x 0.0145                  =  1,030.95
     *   taxable         75,000 - 3,900 - 4,500 - 16,100  = 50,500
     *   federal         1,240 + 38,000x0.12 + 100x0.22   =  5,822
     *   take-home       75,000 - 5,822 - 5,439.15 - 9,050 = 54,688.85
     *   per paycheck    54,688.85 / 26                    =  2,103.4173...
     */
    const r = run()
    expect(step(r, 'Traditional 401(k)')).toBeCloseTo(4_500, 9)
    expect(step(r, 'Pre-tax health premiums')).toBeCloseTo(3_900, 9)
    expect(step(r, 'Wages subject to FICA')).toBeCloseTo(71_100, 9)
    expect(step(r, 'Social Security at 6.2%')).toBeCloseTo(4_408.2, 9)
    expect(step(r, 'Medicare at 1.45%')).toBeCloseTo(1_030.95, 9)
    expect(step(r, 'Federal taxable income')).toBeCloseTo(50_500, 9)
    expect(step(r, 'Federal income tax')).toBeCloseTo(5_822, 9)
    expect(step(r, 'Annual take-home')).toBeCloseTo(54_688.85, 6)
    expect(Number(r.primary.value)).toBeCloseTo(54_688.85 / 26, 9)
    expect(Number(r.primary.value)).toBeCloseTo(2_103.4173, 4)
  })

  test('the second check: an integer-cent reimplementation agrees', () => {
    // Same published rules, different arrangement and no floating point at all.
    for (const patch of [
      {},
      { filingStatus: 'married' },
      { filingStatus: 'head' },
      { payFrequency: 'weekly' },
      { payFrequency: 'monthly' },
      { grossSalary: 42_000, retirementPercent: 0 },
      { grossSalary: 260_000, healthPremium: 0, postTaxDeductions: 0 },
      { grossSalary: 900_000, retirementPercent: 20 },
    ] as Partial<Input>[]) {
      const annual = step(run(patch), 'Annual take-home')
      expect(annual * 100, JSON.stringify(patch)).toBeCloseTo(
        independentAnnualTakeHomeCents({ ...base, ...patch }),
        1,
      )
    }
  })

  test('the fixed four-way split always adds up to gross, exactly', () => {
    for (const patch of [
      {},
      { grossSalary: 10_000 },
      { grossSalary: 5_000_000 },
      { retirementPercent: 0 },
      { retirementPercent: 50 },
      { healthPremium: 0 },
      { healthPremium: 1_000 },
      { postTaxDeductions: 0 },
      { postTaxDeductions: 1_000 },
      { filingStatus: 'married', grossSalary: 400_000 },
    ] as Partial<Input>[]) {
      const r = run(patch)
      const how = JSON.stringify(patch)
      expect(r.parts, how).toHaveLength(4)
      const sum = r.parts!.reduce((acc, p) => acc + p.value, 0)
      expect(sum, how).toBeCloseTo(Number(r.partsTotal!.value), 6)
      for (const p of r.parts!) expect(p.value, how).toBeGreaterThanOrEqual(0)
      // The slices are the same figures the steps and stats report, not a
      // second, separately rounded set.
      expect(part(r, 'Take-home pay'), how).toBeCloseTo(step(r, 'Annual take-home'), 9)
      expect(part(r, 'Federal income tax'), how).toBeCloseTo(step(r, 'Federal income tax'), 9)
      expect(part(r, 'Social Security & Medicare'), how).toBeCloseTo(
        step(r, 'Social Security at 6.2%') +
          step(r, 'Medicare at 1.45%') +
          step(r, 'Additional Medicare at 0.9%'),
        9,
      )
      expect(part(r, 'Deductions'), how).toBeCloseTo(
        step(r, 'Traditional 401(k)') +
          step(r, 'Pre-tax health premiums') +
          step(r, 'Post-tax deductions'),
        9,
      )
    }
  })

  describe('the Social Security wage base', () => {
    // 2026 base: $184,500 (SSA, 24 October 2025). Probed with no health premium
    // so that FICA wages are exactly the salary.
    const bare = { healthPremium: 0, postTaxDeductions: 0 } as Partial<Input>
    const ss = (grossSalary: number, patch: Partial<Input> = {}) =>
      step(run({ ...bare, grossSalary, ...patch }), 'Social Security at 6.2%')

    test('just under the base, every dollar is taxed', () => {
      expect(ss(184_000)).toBeCloseTo(184_000 * 0.062, 9)
      expect(ss(184_000)).toBeCloseTo(11_408, 9)
    })

    test('exactly at the base, and one dollar over, both hit the published maximum', () => {
      // $11,439 is the figure the SSA and the payroll press publish for 2026 —
      // an outside anchor, not something this codebase can talk itself into.
      expect(ss(184_500)).toBeCloseTo(11_439, 9)
      expect(ss(184_501)).toBeCloseTo(11_439, 9)
    })

    test('just over the base, the extra dollars add exactly nothing', () => {
      expect(ss(185_000)).toBeCloseTo(11_439, 9)
      // Crossing 184,000 -> 185,000 buys only the 500 dollars still under the
      // base: 500 x 0.062 = 31.
      expect(ss(185_000) - ss(184_000)).toBeCloseTo(31, 9)
      expect(ss(1_000_000)).toBeCloseTo(ss(185_000), 9)
      expect(ss(5_000_000)).toBeCloseTo(11_439, 9)
    })

    test('Medicare, unlike Social Security, has no ceiling', () => {
      const r = run({ ...bare, grossSalary: 1_000_000 })
      expect(step(r, 'Medicare at 1.45%')).toBeCloseTo(1_000_000 * 0.0145, 6)
    })

    test('pre-tax health premiums lower the wages the base is measured against', () => {
      // 184,500 salary less 26 x 200 of Section 125 premiums is 179,300 of FICA
      // wages, which is under the base — so the cap no longer binds.
      const r = run({ grossSalary: 184_500, healthPremium: 200, postTaxDeductions: 0 })
      expect(step(r, 'Wages subject to FICA')).toBeCloseTo(179_300, 9)
      expect(step(r, 'Social Security at 6.2%')).toBeCloseTo(179_300 * 0.062, 9)
      expect(step(r, 'Social Security at 6.2%')).toBeLessThan(11_439)
    })
  })

  describe('the 0.9% Additional Medicare surtax', () => {
    // Statutory thresholds, unindexed: 200,000 single and head of household,
    // 250,000 married filing jointly.
    const bare = { healthPremium: 0, postTaxDeductions: 0 } as Partial<Input>
    const surtax = (grossSalary: number, filingStatus = 'single') =>
      step(run({ ...bare, grossSalary, filingStatus }), 'Additional Medicare at 0.9%')

    test('exactly at the single threshold, nothing is due', () => {
      expect(surtax(200_000)).toBe(0)
      expect(surtax(199_999)).toBe(0)
    })

    test('one dollar over the threshold, only that dollar is surtaxed', () => {
      expect(surtax(200_001)).toBeCloseTo(0.009, 9)
      expect(surtax(201_000)).toBeCloseTo(1_000 * 0.009, 9)
      expect(surtax(250_000)).toBeCloseTo(50_000 * 0.009, 9)
    })

    test('married filing jointly moves the threshold to 250,000', () => {
      expect(surtax(250_000, 'married')).toBe(0)
      expect(surtax(250_001, 'married')).toBeCloseTo(0.009, 9)
      expect(surtax(260_000, 'married')).toBeCloseTo(90, 9)
      // Head of household shares the single threshold.
      expect(surtax(201_000, 'head')).toBeCloseTo(surtax(201_000, 'single'), 9)
    })

    test('the surtax is on top of the uncapped 1.45%, not instead of it', () => {
      const r = run({ ...bare, grossSalary: 300_000 })
      expect(step(r, 'Medicare at 1.45%')).toBeCloseTo(300_000 * 0.0145, 6)
      expect(step(r, 'Additional Medicare at 0.9%')).toBeCloseTo(100_000 * 0.009, 6)
      // The stat is per paycheck; the steps are annual.
      expect(stat(r, 'Medicare')).toBeCloseTo((300_000 * 0.0145 + 100_000 * 0.009) / 26, 6)
    })

    test('a Section 125 premium can pull wages back under the threshold', () => {
      // 205,000 less 26 x 500 = 192,000 of FICA wages, under 200,000.
      const r = run({ grossSalary: 205_000, healthPremium: 500, postTaxDeductions: 0 })
      expect(step(r, 'Wages subject to FICA')).toBeCloseTo(192_000, 9)
      expect(step(r, 'Additional Medicare at 0.9%')).toBe(0)
    })
  })

  test('federal tax matches an independently tabulated bracket schedule', () => {
    for (const filingStatus of ['single', 'married', 'head']) {
      for (const grossSalary of [10_000, 30_000, 75_000, 150_000, 400_000, 900_000, 2_000_000]) {
        const r = run({
          filingStatus,
          grossSalary,
          retirementPercent: 0,
          healthPremium: 0,
          postTaxDeductions: 0,
        })
        const taxable = Math.max(0, grossSalary - STANDARD_DEDUCTION[filingStatus]!)
        expect(step(r, 'Federal taxable income')).toBeCloseTo(taxable, 6)
        expect(step(r, 'Federal income tax'), `${filingStatus} @ ${grossSalary}`).toBeCloseTo(
          taxByTable(taxable, filingStatus),
          6,
        )
      }
    }
  })

  test('a 401(k) deferral cuts income tax but never FICA', () => {
    // FICA is blind to the deferral, at any rate at all.
    const none = run({ retirementPercent: 0 })
    for (const percent of [6, 10, 20]) {
      const some = run({ retirementPercent: percent })
      expect(step(some, 'Social Security at 6.2%')).toBeCloseTo(
        step(none, 'Social Security at 6.2%'),
        9,
      )
      expect(step(some, 'Medicare at 1.45%')).toBeCloseTo(step(none, 'Medicare at 1.45%'), 9)
    }

    // Income tax is not. Going 6% -> 10% of 75,000 defers 3,000 more, so
    // taxable income falls from 50,500 to 47,500...
    const six = run({ retirementPercent: 6 })
    const ten = run({ retirementPercent: 10 })
    expect(step(six, 'Federal taxable income')).toBeCloseTo(50_500, 9)
    expect(step(ten, 'Federal taxable income')).toBeCloseTo(47_500, 9)
    // ...crossing the 22% floor at 50,400, so 100 is relieved at 22% and the
    // remaining 2,900 at 12%.
    expect(step(six, 'Federal income tax') - step(ten, 'Federal income tax')).toBeCloseTo(
      100 * 0.22 + 2_900 * 0.12,
      6,
    )
  })

  test('a pre-tax health premium escapes income tax AND FICA', () => {
    const cheap = run({ healthPremium: 0 })
    const dear = run({ healthPremium: 100 })
    const annualDelta = 100 * 26
    expect(step(cheap, 'Wages subject to FICA') - step(dear, 'Wages subject to FICA')).toBeCloseTo(
      annualDelta,
      9,
    )
    expect(
      step(cheap, 'Social Security at 6.2%') - step(dear, 'Social Security at 6.2%'),
    ).toBeCloseTo(annualDelta * 0.062, 9)
    expect(
      step(cheap, 'Federal taxable income') - step(dear, 'Federal taxable income'),
    ).toBeCloseTo(annualDelta, 9)
  })

  test('a post-tax deduction changes take-home dollar for dollar and no tax', () => {
    const none = run({ postTaxDeductions: 0 })
    const some = run({ postTaxDeductions: 100 })
    expect(step(some, 'Federal income tax')).toBeCloseTo(step(none, 'Federal income tax'), 9)
    expect(step(some, 'Social Security at 6.2%')).toBeCloseTo(
      step(none, 'Social Security at 6.2%'),
      9,
    )
    expect(step(none, 'Annual take-home') - step(some, 'Annual take-home')).toBeCloseTo(100 * 26, 6)
  })

  test('the 401(k) deferral stops at the 2026 elective limit of $24,500', () => {
    const capped = run({ grossSalary: 300_000, retirementPercent: 20 })
    expect(step(capped, 'Traditional 401(k)')).toBeCloseTo(24_500, 9)
    // Past the cap, a higher percentage buys nothing.
    const higher = run({ grossSalary: 300_000, retirementPercent: 40 })
    expect(step(higher, 'Traditional 401(k)')).toBeCloseTo(24_500, 9)
    expect(Number(higher.primary.value)).toBeCloseTo(Number(capped.primary.value), 9)
    expect(higher.notes!.some((n) => n.includes('24,500'))).toBe(true)
    // Under the cap it is a plain percentage again.
    const under = run({ grossSalary: 300_000, retirementPercent: 5 })
    expect(step(under, 'Traditional 401(k)')).toBeCloseTo(15_000, 9)
  })

  test('pay frequency only slices the same annual figure, when deductions are flat', () => {
    const bare = { healthPremium: 0, postTaxDeductions: 0 } as Partial<Input>
    const annual = step(run(bare), 'Annual take-home')
    for (const [payFrequency, periods] of Object.entries(PERIODS)) {
      const r = run({ ...bare, payFrequency })
      expect(step(r, 'Annual take-home'), payFrequency).toBeCloseTo(annual, 6)
      expect(Number(r.primary.value), payFrequency).toBeCloseTo(annual / periods, 6)
      expect(step(r, 'Paychecks per year')).toBe(periods)
    }
  })

  test('the notes name the tax year and own the missing state tax', () => {
    const notes = run().notes!.join(' ')
    expect(notes).toContain('2026')
    expect(notes).toContain('State, county and city income taxes are NOT included')
    expect(notes).toContain('184,500')
  })

  test('the first number field nudged to 1.1x stays valid and moves the result', () => {
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('grossSalary')
    const before = Number(run().primary.value)
    const after = Number(run({ grossSalary: first.default * 1.1 }).primary.value)
    expect(Number.isFinite(after)).toBe(true)
    expect(after).toBeGreaterThan(before)
  })

  test('both ends of every slider are values compute accepts', () => {
    for (const field of fields) {
      if (field.kind !== 'number') continue
      for (const bound of [field.min, field.max]) {
        expect(() => run({ [field.id]: bound } as Partial<Input>), `${field.id}=${bound}`).not.toThrow()
      }
    }
  })

  test.each([
    ['a zero salary', { grossSalary: 0 }, 'grossSalary'],
    ['a negative salary', { grossSalary: -50_000 }, 'grossSalary'],
    ['an implausible salary', { grossSalary: 30_000_000 }, 'grossSalary'],
    ['a negative deferral', { retirementPercent: -1 }, 'retirementPercent'],
    ['deferring over 100%', { retirementPercent: 101 }, 'retirementPercent'],
    ['a negative premium', { healthPremium: -10 }, 'healthPremium'],
    ['premiums bigger than the salary', { grossSalary: 20_000, healthPremium: 900 }, 'healthPremium'],
    ['a negative post-tax deduction', { postTaxDeductions: -10 }, 'postTaxDeductions'],
    ['an unknown pay frequency', { payFrequency: 'fortnightly' }, 'payFrequency'],
    ['an unknown filing status', { filingStatus: 'widower' }, 'filingStatus'],
  ] as [string, Partial<Input>, string][])('rejects %s', (_label, patch, fieldId) => {
    let thrown: unknown
    try {
      run(patch)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
    expect((thrown as CalcError).message.length).toBeGreaterThan(10)
  })

  test.each([
    'grossSalary',
    'retirementPercent',
    'healthPremium',
    'postTaxDeductions',
  ])('never returns NaN when %s is unparseable', (id) => {
    // coerceValues emits NaN, and `x < 0` is false for NaN — so a magnitude
    // test alone would let it through and produce a NaN headline.
    expect(() => run({ [id]: Number.NaN } as Partial<Input>)).toThrow(CalcError)
    expect(() => run({ [id]: Number.POSITIVE_INFINITY } as Partial<Input>)).toThrow(CalcError)
  })
})

/**
 * The shared conformance suite in `registry.test.ts` only sees calculators that
 * are in the barrel, and this one is not registered yet. These mirror the rules
 * it applies, so registering the calculator cannot be the moment they are first
 * checked.
 */
describe('conformance, mirrored from registry.test.ts', () => {
  test('copy fits a search result', () => {
    expect(def.description.length).toBeGreaterThan(50)
    expect(def.description.length).toBeLessThanOrEqual(160)
    expect(def.seoTitle.length).toBeLessThanOrEqual(70)
    expect(def.intro.length).toBeGreaterThan(40)
    expect(def.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    expect(def.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('at least three real FAQs, each answered', () => {
    expect(def.faqs.length).toBeGreaterThanOrEqual(3)
    for (const faq of def.faqs) {
      expect(faq.q.endsWith('?')).toBe(true)
      expect(faq.a.length).toBeGreaterThan(40)
    }
  })

  test('every related slug already exists in the registry', () => {
    expect(def.related.length).toBeGreaterThan(0)
    for (const slug of def.related) {
      expect(bySlug.has(slug), `paycheck-calculator -> ${slug}`).toBe(true)
      expect(slug).not.toBe(def.slug)
    }
  })

  test('fields are well formed, and defaults sit on the slider grid', () => {
    const ids = fields.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const field of fields) {
      expect(field.id).toMatch(/^[a-z][a-zA-Z0-9]*$/)
      if (field.kind === 'select') {
        expect(field.options.map((o) => o.value)).toContain(field.default)
        expect(field.options.length).toBeGreaterThan(1)
      }
      if (field.kind === 'number') {
        expect(field.default).toBeGreaterThanOrEqual(field.min)
        expect(field.default).toBeLessThanOrEqual(field.max)
        // An HTML range snaps to min + n x step, so a default off that grid
        // shifts the moment the slider is touched.
        const n = (field.default - field.min) / field.step
        expect(Math.abs(n - Math.round(n)), field.id).toBeLessThan(1e-9)
      }
    }
  })

  test('the definition carries no colour, class name, or markup', () => {
    const serialized = JSON.stringify(def, (_k, v) => (typeof v === 'function' ? undefined : v))
    expect(serialized).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(serialized).not.toMatch(/\b(bg|text|border|rounded|shadow)-[a-z]+-\d{2,3}\b/)
    expect(serialized).not.toMatch(/<\/?[a-z][\s\S]*>/i)
  })

  /** The same sampling `registry.test.ts` uses to sweep the whole input space. */
  function samples(field: Field): unknown[] {
    switch (field.kind) {
      case 'number': {
        const { min, max, default: d } = field
        const interior =
          min !== undefined && max !== undefined
            ? [0.25, 0.5, 0.75].map((f) => min + (max - min) * f)
            : []
        return [min, max, d, 0, 1, 2, ...interior]
          .filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
          .filter((x) => (min === undefined || x >= min) && (max === undefined || x <= max))
          .map((x) => Number(x.toFixed(6)))
      }
      case 'select':
        return field.options.map((o) => o.value)
      default:
        return []
    }
  }

  test('parts stay an honest decomposition across the whole input space', () => {
    let checked = 0
    for (const field of fields) {
      for (const value of samples(field)) {
        let result: ReturnType<typeof compute>
        try {
          result = run({ [field.id]: value } as Partial<Input>)
        } catch {
          continue // a CalcError is a refusal to answer, not a wrong answer
        }
        const how = `${field.id}=${String(value)}`
        expect(result.parts, how).toHaveLength(4)
        const whole = Number(result.partsTotal!.value)
        const sum = result.parts!.reduce((acc, p) => acc + p.value, 0)
        expect(sum, how).toBeCloseTo(whole, 4)
        for (const p of result.parts!) {
          expect(Number.isFinite(p.value), how).toBe(true)
          expect(p.value, how).toBeGreaterThanOrEqual(0)
        }
        checked++
      }
    }
    expect(checked).toBeGreaterThan(20)
  })

  test('both slider ends of every number field are accepted', () => {
    // field-bounds.test.ts drags every slider to each end with the other fields
    // at their defaults, and has no exemption list entry for this calculator.
    for (const field of fields) {
      if (field.kind !== 'number') continue
      for (const bound of [field.min, field.max]) {
        expect(() => run({ [field.id]: bound } as Partial<Input>), `${field.id}=${bound}`).not.toThrow()
      }
    }
  })

  test('anything drawable off-default is drawable at the defaults too', () => {
    // The donut is server-rendered from the DEFAULT result; no client redraw can
    // conjure back a container that was never rendered.
    const atDefault = compute(
      Object.fromEntries(fields.map((f) => [f.id, f.default])) as Input,
    )
    expect(atDefault.parts?.length).toBe(4)
    expect(atDefault.series).toBeUndefined()
  })
})

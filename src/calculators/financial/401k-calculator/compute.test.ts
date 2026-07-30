import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'
import type { Values } from '../../../lib/types'

type Input = Values<typeof fields>

const base: Input = {
  currentAge: 30,
  retirementAge: 65,
  currentBalance: 30_000,
  annualSalary: 70_000,
  contributionPercent: 5,
  employerMatchRate: 50,
  employerMatchCap: 6,
  annualReturn: 7,
  salaryGrowth: 2.5,
}

/** The IRS elective deferral limit for the 2026 tax year (IRS Notice 2025-67). */
const LIMIT = 24_500

/**
 * The independent check: step the account forward one year at a time, with no
 * closed form anywhere in it. Return is credited on the running balance, then
 * the year's deposits land at the end of the year, then pay rises for the next
 * one. If this and the growing-annuity formula in `compute.ts` disagree, one of
 * them has an off-by-one in the number of compounding years.
 *
 * It also accumulates the three secondary series the page reports — the balance
 * with no employer money at all, the compounded value of the match forgone, and
 * the nominal dollars paid in — so every headline figure has a loop behind it.
 */
function simulate(v: Input) {
  const horizon = v.retirementAge - v.currentAge
  const r = v.annualReturn / 100
  const g = v.salaryGrowth / 100

  const limitPercent = (LIMIT / v.annualSalary) * 100
  const effective = Math.min(v.contributionPercent, limitPercent)
  const matched = Math.min(effective, v.employerMatchCap)
  const full = Math.min(v.employerMatchCap, limitPercent)

  let balance = v.currentBalance
  let withoutMatch = v.currentBalance
  let missed = 0
  let paidInByYou = 0
  let paidInByEmployer = 0
  let salary = v.annualSalary

  for (let year = 0; year < horizon; year += 1) {
    const employee = (salary * effective) / 100
    const employer = ((salary * matched) / 100) * (v.employerMatchRate / 100)
    const available = ((salary * full) / 100) * (v.employerMatchRate / 100)

    balance = balance * (1 + r) + employee + employer
    withoutMatch = withoutMatch * (1 + r) + employee
    missed = missed * (1 + r) + (available - employer)

    paidInByYou += employee
    paidInByEmployer += employer
    salary *= 1 + g
  }

  return { balance, withoutMatch, missed, paidInByYou, paidInByEmployer }
}

/**
 * The second, closed-form confirmation, written out here from the textbook
 * definition rather than imported: the future value of a growing annuity,
 *
 *   FV = C0 x ((1 + r)^n - (1 + g)^n) / (r - g)
 *
 * for n end-of-year payments starting at C0 and growing by g, all earning r.
 * Deliberately not the same code path as `compute.ts` — it takes the whole
 * contribution as one payment rather than splitting it into two legs.
 */
function closedForm(v: Input): number {
  const n = v.retirementAge - v.currentAge
  const r = v.annualReturn / 100
  const g = v.salaryGrowth / 100
  const effective = Math.min(v.contributionPercent, (LIMIT / v.annualSalary) * 100)
  const matched = Math.min(effective, v.employerMatchCap)
  const c0 = (v.annualSalary * effective) / 100 + ((v.annualSalary * matched) / 100) * (v.employerMatchRate / 100)
  const factor =
    Math.abs(r - g) < 1e-12
      ? n * Math.pow(1 + r, n - 1)
      : (Math.pow(1 + r, n) - Math.pow(1 + g, n)) / (r - g)
  return v.currentBalance * Math.pow(1 + r, n) + c0 * factor
}

const primary = (v: Input) => Number(compute(v).primary.value)
const stat = (v: Input, label: string) =>
  Number(compute(v).stats!.find((s) => s.label === label)!.value)
const part = (v: Input, label: string) => compute(v).parts!.find((p) => p.label === label)!.value
const line = (v: Input, label: string) => compute(v).series!.find((s) => s.label === label)!

describe('401k projection', () => {
  test('the closed form, the simulation and the implementation all agree', () => {
    // 35 years of 5%-of-pay deferrals plus a 50% match on the first 6%, on top
    // of a $30,000 balance, at 7% with 2.5% pay rises.
    const simulated = simulate(base).balance
    // Pinned literal, derived outside the implementation by the year-by-year
    // loop above and confirmed by the growing-annuity closed form.
    expect(simulated).toBeCloseTo(1_289_024.679369, 5)
    expect(closedForm(base)).toBeCloseTo(simulated, 5)
    expect(primary(base)).toBeCloseTo(simulated, 5)
  })

  test('the three engines are additive', () => {
    // The model is linear in its three money sources, so removing one must
    // remove exactly its own contribution and nothing else.
    const balanceOnly = primary({ ...base, contributionPercent: 0 })
    const contributionsOnly = primary({ ...base, currentBalance: 0 })
    expect(balanceOnly).toBeCloseTo(30_000 * Math.pow(1.07, 35), 6)
    expect(balanceOnly + contributionsOnly).toBeCloseTo(primary(base), 5)
  })

  test('a one-year horizon is one credit of interest and one deposit', () => {
    // The shortest gap the form can produce: currentAge 64 against the default
    // retirement age of 65. Worked by hand: 30000 x 1.07 + 3500 + 1750.
    const oneYear = { ...base, currentAge: 64 }
    expect(primary(oneYear)).toBeCloseTo(37_350, 6)
    expect(primary(oneYear)).toBeCloseTo(simulate(oneYear).balance, 6)
    expect(closedForm(oneYear)).toBeCloseTo(37_350, 6)
  })

  test('the r equals g branch matches the limit of the general formula', () => {
    // At r = g the closed form is 0/0 and compute switches to n(1+r)^(n-1).
    const equal = { ...base, annualReturn: 2.5 }
    expect(primary(equal)).toBeCloseTo(simulate(equal).balance, 5)
    expect(primary(equal)).toBeCloseTo(496_636.597474, 5)
    // Approaching equality from either side must converge on the same answer.
    const below = primary({ ...base, annualReturn: 2.5, salaryGrowth: 2.5 })
    expect(below).toBeCloseTo(primary(equal), 6)
  })

  test('a zero return still grows contributions, because pay grows', () => {
    const flat = { ...base, annualReturn: 0 }
    expect(primary(flat)).toBeCloseTo(simulate(flat).balance, 6)
    expect(primary(flat)).toBeCloseTo(closedForm(flat), 6)
    // With no return, everything in the pot was paid in by someone.
    expect(stat(flat, 'Investment growth')).toBeCloseTo(0, 6)
    expect(
      30_000 + stat(flat, 'Your total contributions') + stat(flat, 'Employer match collected'),
    ).toBeCloseTo(primary(flat), 6)
  })

  test('zero pay growth reduces to a plain ordinary annuity', () => {
    const level = { ...base, salaryGrowth: 0 }
    const i = 0.07
    const deposits = 3_500 + 1_750
    const expected = 30_000 * Math.pow(1 + i, 35) + (deposits * (Math.pow(1 + i, 35) - 1)) / i
    expect(primary(level)).toBeCloseTo(expected, 5)
    expect(primary(level)).toBeCloseTo(simulate(level).balance, 5)
  })
})

describe('401k employer match', () => {
  test('the match is the rate applied to the capped share of pay', () => {
    // 50% of the first 6% on a $70,000 salary is $2,100 a year at the cap; at a
    // 5% deferral only 5 of those 6 points are matched, so $1,750.
    expect(compute(base).steps!.find((s) => 'label' in s && s.label === 'Employer match, year one')).toBeDefined()
    const stepValue = (label: string) =>
      Number(
        (compute(base).steps!.find((s) => 'label' in s && s.label === label) as { value: number })
          .value,
      )
    expect(stepValue('Employer match, year one')).toBeCloseTo(1_750, 9)
    expect(stepValue('Employer match available, year one')).toBeCloseTo(2_100, 9)
    expect(stepValue('Match you forgo, year one')).toBeCloseTo(350, 9)
  })

  test('the cost of under-contributing is the forgone match compounded', () => {
    // $350 a year of employer money, growing with pay at 2.5% and earning 7%
    // for 35 years. Confirmed by the independent loop, which accumulates it
    // separately from the balance.
    expect(stat(base, 'Match forgone each year')).toBeCloseTo(350, 9)
    expect(stat(base, 'Employer match left on the table')).toBeCloseTo(simulate(base).missed, 5)
    expect(stat(base, 'Employer match left on the table')).toBeCloseTo(64_581.815655, 5)
    // And it is exactly the gap between this projection and the one where the
    // deferral is raised to the cap, which is the promise the page makes.
    const atCap = primary({ ...base, contributionPercent: 6 })
    const employeeShare = primary({ ...base, contributionPercent: 6, employerMatchRate: 0 }) -
      primary({ ...base, employerMatchRate: 0 })
    expect(atCap - primary(base) - employeeShare).toBeCloseTo(
      stat(base, 'Employer match left on the table'),
      5,
    )
  })

  test('the extra monthly cost of reaching the cap is one percent of pay', () => {
    // Closing a 1-point gap on $70,000 is $700 a year, or $58.33 a month, and
    // buys $350 a year of employer money — a 50% instant return, by definition.
    expect(stat(base, 'Extra per month to capture it all')).toBeCloseTo(70_000 / 100 / 12, 9)
    expect(stat(base, 'Share of the match captured')).toBeCloseTo((5 / 6) * 100, 9)
  })

  test('contributing at or above the cap captures all of it', () => {
    for (const percent of [6, 10, 20]) {
      const v = { ...base, contributionPercent: percent }
      expect(stat(v, 'Share of the match captured')).toBeCloseTo(100, 9)
      expect(stat(v, 'Employer match left on the table')).toBeCloseTo(0, 9)
      expect(stat(v, 'Extra per month to capture it all')).toBeCloseTo(0, 9)
      expect(compute(v).scaleValue).toBeCloseTo(100, 9)
    }
  })

  test('contributing nothing captures none of it', () => {
    const none = { ...base, contributionPercent: 0 }
    expect(stat(none, 'Share of the match captured')).toBeCloseTo(0, 9)
    expect(stat(none, 'Employer match collected')).toBeCloseTo(0, 9)
    // The whole match is forgone, so the compounded loss equals what the match
    // would have grown to had it been collected in full.
    expect(stat(none, 'Employer match left on the table')).toBeCloseTo(
      primary({ ...base, contributionPercent: 6 }) -
        primary({ ...base, contributionPercent: 6, employerMatchRate: 0 }),
      5,
    )
  })

  test('a plan with no match reports full capture rather than dividing by zero', () => {
    for (const v of [
      { ...base, employerMatchCap: 0 },
      { ...base, employerMatchRate: 0 },
    ]) {
      expect(stat(v, 'Share of the match captured')).toBe(100)
      expect(stat(v, 'Employer match left on the table')).toBe(0)
      expect(Number.isFinite(primary(v))).toBe(true)
    }
  })

  test('the deferral limit caps the contribution and the match with it', () => {
    // At $750,000 of pay the 2026 limit of $24,500 is reached at 3.2667% of
    // pay, below the 6% match cap — so the match is capped too, and the page
    // must not claim the visitor is missing something the IRS forbids.
    const highEarner = { ...base, annualSalary: 750_000 }
    const stepValue = (label: string) =>
      Number(
        (compute(highEarner).steps!.find((s) => 'label' in s && s.label === label) as {
          value: number
        }).value,
      )
    expect(stepValue('Your contribution, year one')).toBeCloseTo(LIMIT, 6)
    expect(stat(highEarner, 'Share of the match captured')).toBeCloseTo(100, 9)
    expect(primary(highEarner)).toBeCloseTo(simulate(highEarner).balance, 4)
    // A salary low enough that the limit never binds is unaffected by it.
    expect(primary({ ...base, annualSalary: 15_000 })).toBeCloseTo(
      simulate({ ...base, annualSalary: 15_000 }).balance,
      6,
    )
  })
})

describe('401k parts and series', () => {
  const inputs: Array<[string, Input]> = [
    ['the defaults', base],
    ['a full-match contributor', { ...base, contributionPercent: 6 }],
    ['no contribution at all', { ...base, contributionPercent: 0 }],
    ['no plan match', { ...base, employerMatchRate: 0, employerMatchCap: 0 }],
    ['a zero return', { ...base, annualReturn: 0 }],
    ['level pay', { ...base, salaryGrowth: 0 }],
    ['return equal to pay growth', { ...base, annualReturn: 2.5 }],
    ['a high earner at the deferral limit', { ...base, annualSalary: 750_000, contributionPercent: 20 }],
    [
      'the longest horizon at the field extremes',
      {
        ...base,
        currentAge: 18,
        retirementAge: 75,
        currentBalance: 0,
        annualSalary: 15_000,
        contributionPercent: 50,
        employerMatchRate: 200,
        employerMatchCap: 15,
        annualReturn: 15,
        salaryGrowth: 10,
      },
    ],
  ]

  test.each(inputs)('the four parts sum exactly to the balance for %s', (_label, input) => {
    const r = compute(input)
    expect(r.parts).toHaveLength(4)
    expect(r.partsTotal).toBeUndefined()
    const sum = r.parts!.reduce((acc, p) => acc + p.value, 0)
    expect(sum).toBeCloseTo(Number(r.primary.value), 4)
    for (const p of r.parts!) expect(p.value).toBeGreaterThanOrEqual(0)
  })

  test('each part is the amount actually paid in by that source', () => {
    const sim = simulate(base)
    expect(part(base, 'Starting balance')).toBe(30_000)
    expect(part(base, 'Your contributions')).toBeCloseTo(sim.paidInByYou, 5)
    expect(part(base, 'Employer match')).toBeCloseTo(sim.paidInByEmployer, 5)
    // Growth is the remainder, so it can only be right if the other three are.
    expect(part(base, 'Investment growth')).toBeCloseTo(
      primary(base) - 30_000 - sim.paidInByYou - sim.paidInByEmployer,
      5,
    )
    // The employer match is half of what you paid in, because it is 50 cents on
    // the dollar for every dollar of a deferral that stays under the cap.
    expect(part(base, 'Employer match')).toBeCloseTo(part(base, 'Your contributions') / 2, 6)
  })

  test.each(inputs)('both curves start on the balance and end on the headline for %s', (
    _label,
    input,
  ) => {
    const balance = line(input, 'Projected balance')
    const withoutMatch = line(input, 'Without the employer match')
    expect(compute(input).series).toHaveLength(2)

    expect(balance.points[0]![0]).toBe(input.currentAge)
    expect(balance.points[0]![1]).toBeCloseTo(input.currentBalance, 6)
    const last = balance.points[balance.points.length - 1]!
    expect(last[0]).toBe(input.retirementAge)
    expect(last[1]).toBeCloseTo(primary(input), 6)

    const lastWithout = withoutMatch.points[withoutMatch.points.length - 1]!
    expect(lastWithout[0]).toBe(input.retirementAge)
    expect(lastWithout[1]).toBeCloseTo(simulate(input).withoutMatch, 4)
    // The match can only ever add, so one curve never crosses below the other.
    balance.points.forEach((p, i) => expect(p[1]).toBeGreaterThanOrEqual(withoutMatch.points[i]![1] - 1e-6))
  })

  test.each(inputs)('series x is strictly increasing, finite and thinned for %s', (_label, input) => {
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

  test('a mid-curve point matches an independent year-by-year loop', () => {
    const s = line(base, 'Projected balance')
    const point = s.points[7]!
    expect(point[1]).toBeCloseTo(
      simulate({ ...base, retirementAge: point[0] }).balance,
      5,
    )
  })

  test('the gap between the curves is what the employer built', () => {
    const withMatch = primary(base)
    const withoutMatch = line(base, 'Without the employer match').points.at(-1)![1]
    expect(withMatch - withoutMatch).toBeCloseTo(
      withMatch - primary({ ...base, employerMatchRate: 0 }),
      5,
    )
  })
})

describe('401k input handling', () => {
  test('the nudged first number field stays valid and moves the result', () => {
    // The end-to-end suite bumps the first number field to 1.1x its default.
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('currentAge')
    const nudged = { ...base, currentAge: first.default * 1.1 }
    expect(nudged.currentAge).toBe(33)
    expect(() => compute(nudged)).not.toThrow()
    // Three fewer years of contributions and compounding must lower the total.
    expect(primary(nudged)).toBeLessThan(primary(base))
    expect(primary(nudged)).toBeCloseTo(simulate(nudged).balance, 5)
  })

  test('every declared bound is a value compute accepts', () => {
    // The form renders each number field as a slider spanning min..max, so both
    // ends are one drag away. The ages are bounded so neither end collides with
    // the other field's default, which is why no exemption is needed.
    for (const field of fields) {
      for (const bound of [field.min, field.max]) {
        expect(() => compute({ ...base, [field.id]: bound })).not.toThrow()
      }
    }
  })

  test.each([
    ['a zero current age', { currentAge: 0 }, 'currentAge'],
    ['retiring at the current age', { retirementAge: 30 }, 'retirementAge'],
    ['retiring before the current age', { retirementAge: 25 }, 'retirementAge'],
    ['a negative balance', { currentBalance: -1 }, 'currentBalance'],
    ['a zero salary', { annualSalary: 0 }, 'annualSalary'],
    ['a negative salary', { annualSalary: -1 }, 'annualSalary'],
    ['a negative contribution', { contributionPercent: -0.5 }, 'contributionPercent'],
    ['deferring more than all of your pay', { contributionPercent: 101 }, 'contributionPercent'],
    ['a negative match rate', { employerMatchRate: -5 }, 'employerMatchRate'],
    ['a negative match cap', { employerMatchCap: -1 }, 'employerMatchCap'],
    ['a match cap above all of pay', { employerMatchCap: 101 }, 'employerMatchCap'],
    ['a negative return', { annualReturn: -1 }, 'annualReturn'],
    ['a negative pay rise', { salaryGrowth: -1 }, 'salaryGrowth'],
    // coerceValues emits NaN for a number field it cannot parse ("abc",
    // "1e999"), on the expectation that compute refuses it rather than letting
    // NaN propagate into the result.
    ['an unparseable current age', { currentAge: Number.NaN }, 'currentAge'],
    ['an unparseable retirement age', { retirementAge: Number.NaN }, 'retirementAge'],
    ['an unparseable balance', { currentBalance: Number.NaN }, 'currentBalance'],
    ['an unparseable salary', { annualSalary: Number.NaN }, 'annualSalary'],
    ['an unparseable contribution', { contributionPercent: Number.NaN }, 'contributionPercent'],
    ['an unparseable match rate', { employerMatchRate: Number.NaN }, 'employerMatchRate'],
    ['an unparseable match cap', { employerMatchCap: Number.NaN }, 'employerMatchCap'],
    ['an unparseable return', { annualReturn: Number.NaN }, 'annualReturn'],
    ['an unparseable pay rise', { salaryGrowth: Number.NaN }, 'salaryGrowth'],
    ['an infinite current age', { currentAge: Number.POSITIVE_INFINITY }, 'currentAge'],
    ['an infinite retirement age', { retirementAge: Number.POSITIVE_INFINITY }, 'retirementAge'],
    ['an infinite balance', { currentBalance: Number.POSITIVE_INFINITY }, 'currentBalance'],
    ['an infinite salary', { annualSalary: Number.POSITIVE_INFINITY }, 'annualSalary'],
    ['an infinite return', { annualReturn: Number.POSITIVE_INFINITY }, 'annualReturn'],
  ])('rejects %s against the right field', (_label, patch, fieldId) => {
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
    ['level pay', { salaryGrowth: 0 }],
    ['no starting balance', { currentBalance: 0 }],
    ['no contribution', { contributionPercent: 0 }],
    ['no plan match', { employerMatchRate: 0, employerMatchCap: 0 }],
    ['nothing saved at all', { currentBalance: 0, contributionPercent: 0 }],
    ['the shortest horizon', { currentAge: 64 }],
    ['the longest horizon', { currentAge: 18, retirementAge: 75 }],
    ['the nudged first field', { currentAge: 33 }],
    ['return equal to pay growth', { annualReturn: 2.5 }],
  ])('never returns NaN for %s', (_label, patch) => {
    const r = compute({ ...base, ...patch })
    const values = [r.primary, ...(r.stats ?? []), ...(r.steps ?? [])]
      .filter((q): q is Exclude<typeof q, { rule: true }> => !('rule' in q))
      .map((q) => Number(q.value))
    expect(values.every((n) => Number.isFinite(n))).toBe(true)
    expect(r.scaleValue).toBeGreaterThanOrEqual(0)
    expect(r.scaleValue).toBeLessThanOrEqual(100)
  })

  test('the notes name the tax year of the deferral limit', () => {
    // Real-world data goes stale. The limit is quoted with its tax year and its
    // source so a reader can tell at a glance whether the page is current.
    const note = compute(base).notes!.find((n) => n.includes('deferral limit'))!
    expect(note).toContain('24,500')
    expect(note).toContain('2026')
    expect(note).toContain('Notice 2025-67')
  })

  test('the limit-reached note appears only when the limit actually binds', () => {
    const hasNote = (v: Input) => compute(v).notes!.some((n) => n.includes('deferral limit is reached'))
    expect(hasNote(base)).toBe(false)
    expect(hasNote({ ...base, annualSalary: 750_000, contributionPercent: 20 })).toBe(true)
  })
})

/**
 * The registry-wide conformance suite only sees this calculator once it is in
 * `src/calculators/index.ts`, and registration here is done centrally. These
 * mirror the checks it will apply, so the definition is known good the moment
 * the import line lands rather than after it breaks someone else's run.
 */
describe('401k definition', () => {
  test('the meta copy fits a search result', () => {
    expect(def.description.length).toBeGreaterThan(50)
    expect(def.description.length).toBeLessThanOrEqual(160)
    expect(def.seoTitle.length).toBeLessThanOrEqual(70)
    expect(def.intro.length).toBeGreaterThan(40)
    expect(def.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    expect(def.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('has at least three real FAQs', () => {
    expect(def.faqs.length).toBeGreaterThanOrEqual(3)
    for (const faq of def.faqs) {
      expect(faq.q.endsWith('?')).toBe(true)
      expect(faq.a.length).toBeGreaterThan(40)
    }
  })

  test('field ids are unique, camelCase, and defaults sit on the slider grid', () => {
    const ids = fields.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const field of fields) {
      expect(field.id).toMatch(/^[a-z][a-zA-Z0-9]*$/)
      expect(field.default).toBeGreaterThanOrEqual(field.min)
      expect(field.default).toBeLessThanOrEqual(field.max)
      // An HTML range snaps to min + n x step, so a default off that grid shifts
      // silently the first time the control is touched.
      const n = (field.default - field.min) / field.step
      expect(Math.abs(n - Math.round(n))).toBeLessThan(1e-9)
    }
  })

  test('scale bands are ordered and contiguous, and the defaults land inside one', () => {
    const { bands, min, max } = def.scale
    expect(min).toBeLessThan(max)
    bands.forEach((band, i) => {
      expect(band.from).toBeLessThan(band.to)
      if (i > 0) expect(band.from).toBe(bands[i - 1]!.to)
    })
    expect(bands[0]!.from).toBe(min)
    expect(bands[bands.length - 1]!.to).toBe(max)
    // 5% of a 6% cap is 83.3% captured — inside the middle band, well away from
    // either boundary, so the label cannot disagree with the number.
    const atDefaults = compute(base).scaleValue!
    expect(atDefaults).toBeCloseTo(83.3333, 3)
    const band = bands.find((b) => atDefaults >= b.from && atDefaults < b.to)!
    expect(band.id).toBe('warn')
  })

  test('related slugs point elsewhere, and the disclaimer is a token', () => {
    expect(def.related.length).toBeGreaterThan(0)
    for (const slug of def.related) expect(slug).not.toBe(def.slug)
    expect(def.disclaimer).toBe('financial')
  })

  /**
   * The same sweep `registry.test.ts` runs: every field moved to each end of its
   * range, its default, the small integers that tend to be special-cased, and a
   * few interior points, one field at a time from the defaults. It exists here
   * because that suite cannot see this calculator until it is registered, and
   * the properties it checks — parts summing, series ordering, nothing drawable
   * only off-default — are exactly the ones a fresh calculator gets wrong.
   */
  test('parts and series stay honest across the whole input space', () => {
    const samples = (field: (typeof fields)[number]) =>
      [field.min, field.max, field.default, 0, 1, 2, ...[0.25, 0.5, 0.75].map((f) => field.min + (field.max - field.min) * f)]
        .filter((v) => v >= field.min && v <= field.max)
        .map((v) => Number(v.toFixed(6)))

    const cases: Array<[string, Input]> = [['defaults', base]]
    for (const field of fields)
      for (const value of samples(field))
        cases.push([`${field.id}=${value}`, { ...base, [field.id]: value }])

    let reached = 0
    for (const [how, input] of cases) {
      let result
      try {
        result = compute(input)
      } catch {
        continue // a CalcError is a refusal to answer, not a bad answer
      }
      reached += 1
      expect(result.parts, how).toHaveLength(4)
      const sum = result.parts!.reduce((acc, p) => acc + p.value, 0)
      expect(sum, how).toBeCloseTo(Number(result.primary.value), 4)
      for (const p of result.parts!) {
        expect(Number.isFinite(p.value), how).toBe(true)
        expect(p.value, how).toBeGreaterThanOrEqual(0)
      }
      expect(result.series, how).toHaveLength(2)
      for (const s of result.series!) {
        expect(s.points.length, how).toBeGreaterThan(1)
        expect(s.points.length, how).toBeLessThanOrEqual(45)
        s.points.forEach((p, i) => {
          expect(Number.isFinite(p[0]), how).toBe(true)
          expect(Number.isFinite(p[1]), how).toBe(true)
          if (i > 0) expect(p[0], how).toBeGreaterThan(s.points[i - 1]![0])
        })
      }
      expect(Number.isFinite(result.scaleValue!), how).toBe(true)
    }
    expect(reached).toBeGreaterThan(50)
  })

  test('the definition holds no colour, class name, or markup', () => {
    const serialized = JSON.stringify(def, (_k, v) => (typeof v === 'function' ? undefined : v))
    expect(serialized).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(serialized).not.toMatch(/\b(bg|text|border|rounded|shadow)-[a-z]+-\d{2,3}\b/)
    expect(serialized).not.toMatch(/<\/?[a-z][\s\S]*>/i)
  })
})

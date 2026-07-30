import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { fields } from './fields'
import { bySlug } from '../../index'
import { CalcError } from '../../../lib/types'
import { defaultValues, resolveBand, toResultView } from '../../../lib/view'

type Input = Parameters<typeof compute>[0]

const base: Input = {
  income: 5000,
  housing: 1600,
  transport: 450,
  food: 600,
  otherNeeds: 500,
  wants: 900,
  savings: 700,
}

const stat = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)

/**
 * The 50/30/20 targets, plus the fourth bucket the rule leaves implicit:
 * take-home pay that has not been assigned anywhere, whose target share is 0.
 * Including it is what makes the four deviations sum to zero.
 */
const TARGETS = [0.5, 0.3, 0.2, 0] as const

function buckets(v: Input) {
  const needs = v.housing + v.transport + v.food + v.otherNeeds
  const budgeted = needs + v.wants + v.savings
  const unallocated = v.income - budgeted
  const actual = [needs, v.wants, v.savings, unallocated]
  const deviations = actual.map((a, i) => a - TARGETS[i]! * v.income)
  return { needs, budgeted, unallocated, actual, deviations }
}

/**
 * FIRST re-derivation of the headline: half the sum of the absolute deviations,
 * the total-variation distance between the actual split and the target one.
 * `compute` sums only the positive half, so this reaches the same figure by a
 * route that never makes that choice — if the two agree, the deviations really
 * do balance and the positive half really is the whole story.
 */
function driftByTotalVariation(v: Input): number {
  return buckets(v).deviations.reduce((sum, d) => sum + Math.abs(d), 0) / 2
}

/**
 * SECOND re-derivation, and an operational one rather than an algebraic one:
 * actually move the money. Repeatedly take from a bucket that is over its target
 * and give to one that is short, counting every dollar that changes category,
 * until nothing is over. That is what "the amount that has to move" means, so
 * this confirms the interpretation and not merely the arithmetic.
 */
function driftBySimulation(v: Input): number {
  const { deviations } = buckets(v)
  const over = deviations.map((d) => Math.max(0, d))
  const short = deviations.map((d) => Math.max(0, -d))
  let moved = 0

  for (let i = 0; i < over.length; i++) {
    for (let j = 0; j < short.length; j++) {
      const amount = Math.min(over[i] ?? 0, short[j] ?? 0)
      if (amount <= 0) continue
      over[i] = (over[i] ?? 0) - amount
      short[j] = (short[j] ?? 0) - amount
      moved += amount
    }
  }
  // Nothing is left over, and nothing is left short: the transfers balanced.
  expect(over.every((x) => x < 1e-9)).toBe(true)
  expect(short.every((x) => x < 1e-9)).toBe(true)
  return moved
}

describe('budget — the headline gap', () => {
  test('the default budget is $900 a month out of place, confirmed three ways', () => {
    const { needs, budgeted, unallocated, deviations } = buckets(base)
    // Worked by hand from the field defaults: 1600 + 450 + 600 + 500 = 3150.
    expect(needs).toBe(3150)
    expect(budgeted).toBe(4750)
    expect(unallocated).toBe(250)
    // Targets on $5,000: 2500 / 1500 / 1000 / 0.
    expect(deviations).toEqual([650, -600, -300, 250])
    // The whole construction rests on this: the four deviations cancel.
    expect(deviations.reduce((s, d) => s + d, 0)).toBe(0)

    // Route 1 — the positive deviations: 650 over on needs, 250 sitting idle.
    expect(650 + 250).toBe(900)
    // Route 2 — the negative ones: 600 short on wants, 300 short on savings.
    expect(600 + 300).toBe(900)
    // Route 3 and 4 — total variation, and simulated transfers.
    expect(driftByTotalVariation(base)).toBe(900)
    expect(driftBySimulation(base)).toBe(900)

    const r = compute(base)
    expect(Number(r.primary.value)).toBe(900)
  })

  test('the headline matches both re-derivations across assorted budgets', () => {
    const cases: Array<Partial<Input>> = [
      {},
      { income: 3200, housing: 1400, transport: 300, food: 400, otherNeeds: 250, wants: 500, savings: 100 },
      { income: 12_000, housing: 2500, transport: 800, food: 900, otherNeeds: 600, wants: 2000, savings: 4000 },
      { income: 5000, housing: 1500, transport: 400, food: 400, otherNeeds: 200, wants: 1500, savings: 1000 },
      { income: 4000 }, // overspent
      { housing: 0, transport: 0, food: 0, otherNeeds: 0, wants: 0, savings: 0 },
      { income: 500 }, // the income slider at its floor, expenses left alone
      { income: 100_000 }, // and at its ceiling
      { income: 4321, housing: 1234.56, transport: 78.9, food: 321.01, otherNeeds: 12.34, wants: 456.78, savings: 90.12 },
    ]
    for (const patch of cases) {
      const v = { ...base, ...patch }
      const r = compute(v)
      const drift = Number(r.primary.value)
      expect(drift, JSON.stringify(patch)).toBeCloseTo(driftByTotalVariation(v), 6)
      expect(drift, JSON.stringify(patch)).toBeCloseTo(driftBySimulation(v), 6)
      // A distance is never negative, whatever the budget looks like.
      expect(drift).toBeGreaterThanOrEqual(0)
    }
  })

  test('a budget already on 50/30/20 has nothing to move', () => {
    const v: Input = {
      income: 5000,
      housing: 1500,
      transport: 400,
      food: 400,
      otherNeeds: 200, // needs = 2500 = 50%
      wants: 1500, // 30%
      savings: 1000, // 20%
    }
    const r = compute(v)
    expect(Number(r.primary.value)).toBe(0)
    expect(r.scaleValue).toBe(0)
    expect(resolveBand(def.scale!, r.scaleValue!)!.id).toBe('excellent')
    expect(r.notes!.some((n) => n.includes('Nothing needs to move'))).toBe(true)
  })

  test('the gap closes by exactly a dollar for every dollar moved to savings', () => {
    // Savings is $300 short and needs is $650 over, so moving money out of a
    // needs line and into savings should reduce the gap dollar for dollar until
    // savings reaches its target.
    for (const step of [1, 50, 150, 300]) {
      const v = { ...base, housing: base.housing - step, savings: base.savings + step }
      expect(Number(compute(v).primary.value)).toBeCloseTo(900 - step, 9)
    }
  })
})

describe('budget — shares and per-category gaps', () => {
  test('the stats state each share of take-home pay and its distance from target', () => {
    const r = compute(base)
    expect(stat(r, 'Needs share of take-home')).toBeCloseTo((3150 / 5000) * 100, 10)
    expect(stat(r, 'Needs share of take-home')).toBe(63)
    expect(stat(r, 'Wants share of take-home')).toBe(18)
    // 700/5000 is 14 in decimal and 14.000000000000002 in binary floating point.
    expect(stat(r, 'Savings share of take-home')).toBeCloseTo(14, 10)
    // The three shares plus the unallocated share must account for the income.
    const shares = [
      stat(r, 'Needs share of take-home'),
      stat(r, 'Wants share of take-home'),
      stat(r, 'Savings share of take-home'),
      (250 / 5000) * 100,
    ]
    expect(shares.reduce((s, x) => s + x, 0)).toBeCloseTo(100, 10)

    expect(stat(r, 'Needs vs the 50% target')).toBe(650)
    expect(stat(r, 'Wants vs the 30% target')).toBe(-600)
    expect(stat(r, 'Savings vs the 20% target')).toBe(-300)
    expect(stat(r, 'Unallocated each month')).toBe(250)
  })

  test('the notes name the gap in points and in dollars, not just the shares', () => {
    const notes = compute(base).notes!.join(' ')
    expect(notes).toContain('Needs are 63% of take-home pay')
    // Points, not percent: 63% against a 50% guideline is 13 points over.
    expect(notes).toContain('13 points above the 50% guideline')
    expect(notes).toContain('$650 a month')
    expect(notes).toContain('Savings are 14%')
    expect(notes).toContain('6 points short of the 20% target')
    expect(notes).toContain('$300 a month')
    expect(notes).toContain('$250 a month is not assigned')
  })

  test('a one-point gap is singular', () => {
    // needs = 2550 of 5000 is 51%, one point over the 50% guideline.
    const v: Input = { ...base, housing: 1600, transport: 450, food: 500, otherNeeds: 0 }
    expect(v.housing + v.transport + v.food + v.otherNeeds).toBe(2550)
    expect(compute(v).notes!.join(' ')).toContain('1 point above the 50% guideline')
  })

  test('a budget inside every guideline says so instead of inventing a problem', () => {
    const v: Input = {
      income: 6000,
      housing: 1500,
      transport: 300,
      food: 450,
      otherNeeds: 350, // needs = 2600, 43.3%
      wants: 1400, // 23.3%
      savings: 1600, // 26.7%
    }
    const r = compute(v)
    const notes = r.notes!.join(' ')
    expect(notes).toContain('inside the 50% guideline')
    expect(notes).toContain('meeting the 20% target')
    expect(stat(r, 'Needs vs the 50% target')).toBe(-400)
    expect(stat(r, 'Savings vs the 20% target')).toBe(400)
    // Still not a clean bill of health: needs and wants are each $400 under, and
    // savings is $400 over, but $400 of the income is unassigned — so $800 is
    // still sitting somewhere other than where the split says it should be.
    expect(stat(r, 'Unallocated each month')).toBe(400)
    expect(Number(r.primary.value)).toBe(800)
    expect(Number(r.primary.value)).toBe(driftByTotalVariation(v))
    expect(Number(r.primary.value)).toBe(driftBySimulation(v))
  })
})

describe('budget — spending more than you earn', () => {
  const overspent: Input = { ...base, income: 4000 }

  test('an overspend is a negative surplus and a correct gap, not a broken result', () => {
    const { unallocated } = buckets(overspent)
    expect(unallocated).toBe(-750) // 4000 taken home, 4750 budgeted

    const r = compute(overspent)
    expect(stat(r, 'Unallocated each month')).toBe(-750)
    // Needs alone are 3150 of 4000 — 78.75% — against a 2000 target.
    expect(stat(r, 'Needs share of take-home')).toBeCloseTo(78.75, 10)
    expect(stat(r, 'Needs vs the 50% target')).toBe(1150)
    // Every route agrees, including the simulation, so the negative bucket is
    // handled as a shortfall rather than silently dropped.
    expect(Number(r.primary.value)).toBe(1150)
    expect(driftByTotalVariation(overspent)).toBe(1150)
    expect(driftBySimulation(overspent)).toBe(1150)
    expect(r.scaleValue).toBeCloseTo((1150 / 4000) * 100, 10)
    expect(resolveBand(def.scale!, r.scaleValue!)!.id).toBe('warn')
  })

  test('the overspend is called out in words with the right amount', () => {
    const notes = compute(overspent).notes!.join(' ')
    expect(notes).toContain('commits $750 a month more than you take home')
  })

  test('the three slices stay non-negative and still sum to what was budgeted', () => {
    const r = compute(overspent)
    for (const part of r.parts!) expect(part.value).toBeGreaterThanOrEqual(0)
    expect(r.parts!.reduce((s, p) => s + p.value, 0)).toBeCloseTo(
      Number(r.partsTotal!.value),
      10,
    )
    // The whole is the budget, which exceeds income. That is the honest total.
    expect(Number(r.partsTotal!.value)).toBe(4750)
    expect(Number(r.partsTotal!.value)).toBeGreaterThan(overspent.income)
  })

  test('nothing renders as NaN, however far the budget overshoots', () => {
    const extreme: Input = { ...base, income: 500, housing: 50_000 }
    const view = toResultView(compute(extreme), def.scale)
    expect(view.primary.text).not.toContain('NaN')
    for (const s of view.stats) expect(s.text).not.toContain('NaN')
    expect(view.band).toBeDefined()
    expect(view.scalePercent).toBeLessThanOrEqual(100)
  })
})

describe('budget — the scale', () => {
  test('scaleValue is the gap as a share of take-home pay', () => {
    const r = compute(base)
    expect(r.scaleValue).toBeCloseTo((900 / 5000) * 100, 10)
    expect(r.scaleValue).toBe(18)
    expect(resolveBand(def.scale!, r.scaleValue!)!.id).toBe('neutral')
  })

  test('the gap is capped at 100% of income rather than running off the scale', () => {
    // Nothing budgeted at all: the entire month's pay is unassigned, which is a
    // deviation of 100% before any overspend is added.
    const nothing: Input = {
      income: 5000,
      housing: 0,
      transport: 0,
      food: 0,
      otherNeeds: 0,
      wants: 0,
      savings: 0,
    }
    const r = compute(nothing)
    expect(Number(r.primary.value)).toBe(5000)
    expect(r.scaleValue).toBe(100)
    expect(resolveBand(def.scale!, r.scaleValue!)!.id).toBe('critical')

    // Far past it: $500 of income against $4,750 of budget is a gap of 850%.
    const wild = { ...base, income: 500 }
    const wildResult = compute(wild)
    expect(Number(wildResult.primary.value)).toBe(4250)
    expect((4250 / 500) * 100).toBe(850)
    expect(wildResult.scaleValue).toBe(100)
    expect(wildResult.notes!.some((n) => n.includes('shown capped'))).toBe(true)
  })

  test('scaleValue always lands inside the declared scale', () => {
    for (const income of [500, 1000, 2500, 5000, 12_000, 100_000]) {
      for (const savings of [0, 700, 5000, 20_000]) {
        const r = compute({ ...base, income, savings })
        expect(Number.isFinite(r.scaleValue!)).toBe(true)
        expect(r.scaleValue!).toBeGreaterThanOrEqual(def.scale!.min)
        expect(r.scaleValue!).toBeLessThanOrEqual(def.scale!.max)
        expect(resolveBand(def.scale!, r.scaleValue!)).toBeDefined()
      }
    }
  })

  test('the bands are ordered, contiguous, and span the scale', () => {
    const { bands, min, max } = def.scale!
    expect(bands[0]!.from).toBe(min)
    expect(bands[bands.length - 1]!.to).toBe(max)
    for (let i = 1; i < bands.length; i++) expect(bands[i]!.from).toBe(bands[i - 1]!.to)
  })
})

describe('budget — the three-way split', () => {
  /** The shared invariant: finite, non-negative, and summing to the stated whole. */
  function expectHonestParts(r: ReturnType<typeof compute>, how: string) {
    const parts = r.parts!
    expect(parts.length, how).toBe(3)
    expect(parts.map((p) => p.label)).toEqual(['Needs', 'Wants', 'Savings'])
    for (const p of parts) {
      expect(Number.isFinite(p.value), how).toBe(true)
      expect(p.value, how).toBeGreaterThanOrEqual(0)
    }
    const whole = Number((r.partsTotal ?? r.primary).value)
    expect(parts.reduce((s, p) => s + p.value, 0), how).toBeCloseTo(whole, 4)
  }

  test('the parts are needs, wants and savings, totalling what was budgeted', () => {
    const r = compute(base)
    expectHonestParts(r, 'defaults')
    expect(r.parts!.map((p) => p.value)).toEqual([3150, 900, 700])
    expect(Number(r.partsTotal!.value)).toBe(4750)
    expect(r.partsTotal!.label).toBe('Total budgeted')
  })

  test('the split is drawable at the defaults, so it is drawable at all', () => {
    // The donut is server-rendered from the DEFAULT result and only when there
    // is something to draw, so a fixed three-way split has to be present here.
    const atDefaults = compute(defaultValues(def) as Input)
    expect(atDefaults.parts!.length).toBe(3)
    expect(atDefaults.series ?? []).toHaveLength(0)
  })

  test('the invariant survives every value each field can be dragged to', () => {
    const defaults = defaultValues(def) as Input
    expectHonestParts(compute(defaults), 'defaults')

    for (const field of fields) {
      const { min, max, default: d } = field
      const interior = [0.25, 0.5, 0.75].map((f) => min + (max - min) * f)
      for (const value of [min, max, d, ...interior]) {
        const how = `${field.id}=${value}`
        const v = { ...defaults, [field.id]: value } as Input
        const r = compute(v)
        expectHonestParts(r, how)
        expect(Number(r.primary.value), how).toBeGreaterThanOrEqual(0)
        expect(Number(r.primary.value), how).toBeCloseTo(driftByTotalVariation(v), 6)
        expect(Number.isFinite(r.scaleValue!), how).toBe(true)
        // Every bound the slider offers is one compute accepts.
        for (const s of r.stats!) expect(Number.isFinite(Number(s.value)), how).toBe(true)
      }
    }
  })
})

describe('budget — input validation', () => {
  test.each([
    ['a non-finite income', { income: Number.NaN }, 'income'],
    ['zero income', { income: 0 }, 'income'],
    ['negative income', { income: -100 }, 'income'],
    ['a non-finite housing cost', { housing: Number.NaN }, 'housing'],
    ['negative housing', { housing: -1 }, 'housing'],
    ['negative transport', { transport: -0.01 }, 'transport'],
    ['negative groceries', { food: -5 }, 'food'],
    ['negative other essentials', { otherNeeds: -1 }, 'otherNeeds'],
    ['negative wants', { wants: -1 }, 'wants'],
    ['negative savings', { savings: -1 }, 'savings'],
    ['an infinite entry', { savings: Number.POSITIVE_INFINITY }, 'savings'],
  ])('rejects %s with a CalcError naming the field', (_label, patch, fieldId) => {
    let thrown: unknown
    try {
      compute({ ...base, ...patch })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
  })

  test('a zeroed expense line is valid input, not an error', () => {
    expect(() => compute({ ...base, savings: 0 })).not.toThrow()
    expect(Number(compute({ ...base, savings: 0 }).primary.value)).toBe(
      driftByTotalVariation({ ...base, savings: 0 }),
    )
  })
})

describe('budget — the definition', () => {
  test('the e2e nudge of the first number field stays valid and moves the result', () => {
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('income')
    const nudged = first.default * 1.1
    expect(nudged).toBe(5500)
    expect(nudged).toBeGreaterThanOrEqual(first.min)
    expect(nudged).toBeLessThanOrEqual(first.max)

    const r = compute({ ...base, income: nudged })
    // Targets move to 2750 / 1650 / 1100, so needs is 400 over and 750 is idle.
    expect(Number(r.primary.value)).toBe(1150)
    expect(Number(r.primary.value)).not.toBe(Number(compute(base).primary.value))
    expect(Number(r.primary.value)).toBe(driftByTotalVariation({ ...base, income: nudged }))
  })

  test('every number default lands on min + n x step, so no slider shifts it', () => {
    for (const field of fields) {
      const steps = (field.default - field.min) / field.step
      expect(Math.abs(steps - Math.round(steps)), field.id).toBeLessThan(1e-9)
      expect(field.default, field.id).toBeGreaterThanOrEqual(field.min)
      expect(field.default, field.id).toBeLessThanOrEqual(field.max)
    }
  })

  test('both ends of every slider are values compute accepts', () => {
    const defaults = defaultValues(def) as Input
    for (const field of fields) {
      for (const bound of [field.min, field.max]) {
        expect(
          () => compute({ ...defaults, [field.id]: bound } as Input),
          `${field.id}=${bound}`,
        ).not.toThrow()
      }
    }
  })

  test('the copy fits a search result and answers real questions', () => {
    expect(def.description.length).toBeGreaterThan(50)
    expect(def.description.length).toBeLessThanOrEqual(160)
    expect(def.seoTitle.length).toBeLessThanOrEqual(70)
    expect(def.intro.length).toBeGreaterThan(40)
    expect(def.faqs.length).toBeGreaterThanOrEqual(3)
    for (const faq of def.faqs) {
      expect(faq.q.endsWith('?')).toBe(true)
      expect(faq.a.length).toBeGreaterThan(40)
    }
  })

  test('holds no colour, class name or markup, and its ids are safe selectors', () => {
    const serialized = JSON.stringify(def, (_k, v) => (typeof v === 'function' ? undefined : v))
    expect(serialized).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(serialized).not.toMatch(/\b(bg|text|border|rounded|shadow)-[a-z]+-\d{2,3}\b/)
    expect(serialized).not.toMatch(/<\/?[a-z][\s\S]*>/i)
    const ids = fields.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z][a-zA-Z0-9]*$/)
    expect(def.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    expect(def.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('every related slug resolves to a calculator that is not this one', () => {
    for (const slug of def.related) {
      expect(bySlug.has(slug), `budget-calculator -> ${slug}`).toBe(true)
      expect(slug).not.toBe(def.slug)
    }
  })

  test('the default result renders to a complete view', () => {
    const view = toResultView(compute(defaultValues(def) as Input), def.scale)
    expect(view.primary.text).toBe('$900')
    expect(view.primary.text).not.toContain('NaN')
    expect(view.band).toBe('neutral')
    expect(view.partsTotal.text).toBe('$4,750')
    expect(view.parts.map((p) => Math.round(p.percent))).toEqual([66, 19, 15])
    for (const s of view.stats) expect(s.text).not.toContain('NaN')
  })
})

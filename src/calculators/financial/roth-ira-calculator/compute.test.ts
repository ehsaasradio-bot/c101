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
  annualContribution: 7_500,
  annualReturn: 7,
  taxRateNow: 22,
  taxRateRetirement: 15,
}

/**
 * Engine one. A year-by-year loop with no closed form anywhere in it: interest
 * is credited on the running balance, then the year's contribution lands at the
 * end of the year, so the final deposit earns nothing. If this and the annuity
 * formula in `compute.ts` disagree, one of them has an off-by-one in the number
 * of compounding years — the classic error on this shape of calculation.
 */
function simulateRoth(v: Input): number {
  const r = v.annualReturn / 100
  let balance = 0
  for (let year = 0; year < v.retirementAge - v.currentAge; year += 1)
    balance = balance * (1 + r) + v.annualContribution
  return balance
}

/**
 * Engine two, deliberately not the same code path as either of the others: take
 * each deposit separately and compound it for the years it actually has. The
 * deposit made at the end of year k (1-indexed) sits for n − k years, so the
 * exponents run 0 … n−1 and the sum is Σ C(1+r)^k. No division by r, so it is
 * also the check that the r = 0 branch of `annuityFactor` is the right limit
 * rather than a special case someone guessed at.
 */
function sumOfDeposits(v: Input): number {
  const r = v.annualReturn / 100
  const n = v.retirementAge - v.currentAge
  let total = 0
  for (let k = 0; k < n; k += 1) total += v.annualContribution * Math.pow(1 + r, k)
  return total
}

/**
 * The traditional arm from first principles, with none of compute's algebra in
 * it. Funding an after-tax contribution of A costs A / (1 − t0) of gross pay; a
 * deductible contribution costs nothing in tax, so that whole gross figure goes
 * in. One flat tax at the end.
 */
function simulateTraditional(v: Input): number {
  const gross = v.annualContribution / (1 - v.taxRateNow / 100)
  const r = v.annualReturn / 100
  let balance = 0
  for (let year = 0; year < v.retirementAge - v.currentAge; year += 1)
    balance = balance * (1 + r) + gross
  return balance * (1 - v.taxRateRetirement / 100)
}

const result = (v: Input) => compute(v)
const primary = (v: Input) => Number(compute(v).primary.value)
const stat = (v: Input, label: string) =>
  Number(compute(v).stats!.find((s) => s.label === label)!.value)
const step = (v: Input, label: string) =>
  Number(
    (compute(v).steps!.find((s) => 'label' in s && s.label === label) as { value: number }).value,
  )
const part = (v: Input, label: string) => compute(v).parts!.find((p) => p.label === label)!.value
const line = (v: Input, label: string) => compute(v).series!.find((s) => s.label === label)!

describe('roth ira: the balances', () => {
  test('the headline is the annuity, confirmed by a loop and by summing each deposit', () => {
    // 35 end-of-year contributions of $7,500 at 7%. The literal is derived by
    // the year-by-year loop below, not copied out of the implementation.
    const simulated = simulateRoth(base)
    expect(simulated).toBeCloseTo(1_036_776.58763737, 4)
    expect(sumOfDeposits(base)).toBeCloseTo(simulated, 4)
    expect(primary(base)).toBeCloseTo(simulated, 4)
    // The annuity factor reported in the steps is the same number divided out.
    expect(step(base, 'Annuity factor')).toBeCloseTo(simulated / 7_500, 6)
  })

  test('the traditional arm matches its own independent simulation', () => {
    // $7,500 of after-tax money costs $9,615.38 of gross pay at 22%, all of
    // which is deductible, so the traditional side invests the larger figure and
    // pays 15% on the whole pot at the end.
    const simulated = simulateTraditional(base)
    expect(simulated).toBeCloseTo(1_129_820.64037406, 4)
    expect(stat(base, 'Traditional IRA, same cost, after tax')).toBeCloseTo(simulated, 4)
    expect(step(base, 'Gross pay it takes to fund that')).toBeCloseTo(7_500 / 0.78, 9)
    expect(step(base, 'Traditional at retirement, before tax')).toBeCloseTo(simulated / 0.85, 4)
  })

  test('the defaults put the traditional ahead, and the stats agree with the balances', () => {
    const r = result(base)
    const roth = Number(r.primary.value)
    const trad = stat(base, 'Traditional IRA, same cost, after tax')
    expect(stat(base, 'Roth advantage')).toBeCloseTo(roth - trad, 6)
    expect(stat(base, 'Roth advantage')).toBeCloseTo(-93_044.05273669, 4)
    // -8.235%: exactly (1 - 0.22) / (1 - 0.15) - 1, which is -0.07/0.85.
    expect(stat(base, 'Roth advantage, as a percentage')).toBeCloseTo((-0.07 / 0.85) * 100, 9)
    expect(r.scaleValue).toBeCloseTo((-0.07 / 0.85) * 100, 9)
  })

  test('a one-year horizon is a single contribution that never grows', () => {
    // The shortest gap the form allows: currentAge 64 against a retirement age
    // of 65. One end-of-year deposit, no time to earn anything.
    // Not `toBe(7_500)`: at n = 1 the closed form evaluates ((1+r)^1 - 1)/r,
    // and (1.07 - 1)/0.07 is 1.0000000000000009 rather than 1 — inherent to
    // representing 0.07 in binary at all, not a fault in the model. The
    // equal-rate identity is unaffected, because both arms share this one
    // factor and it cancels; that is why it can be asserted exactly and this
    // cannot. (Rewriting the factor as expm1(n·log1p(r))/r makes n = 1 exact
    // but is measurably worse at n = 57, so it is not the better formula.)
    const oneYear = { ...base, currentAge: 64 }
    expect(primary(oneYear)).toBeCloseTo(7_500, 9)
    expect(primary(oneYear)).toBeCloseTo(simulateRoth(oneYear), 9)
    expect(stat(oneYear, 'Traditional IRA, same cost, after tax')).toBeCloseTo(
      (7_500 / 0.78) * 0.85,
      6,
    )
  })

  test('a zero return reduces both accounts to plain sums of deposits', () => {
    const flat = { ...base, annualReturn: 0 }
    expect(primary(flat)).toBeCloseTo(7_500 * 35, 9)
    expect(primary(flat)).toBeCloseTo(simulateRoth(flat), 9)
    expect(primary(flat)).toBeCloseTo(sumOfDeposits(flat), 9)
    expect(stat(flat, 'Traditional IRA, same cost, after tax')).toBeCloseTo(
      ((7_500 * 35) / 0.78) * 0.85,
      6,
    )
    // And with no growth the pot is exactly what was paid in.
    expect(step(flat, 'Traditional at retirement, before tax')).toBeCloseTo(
      stat(flat, 'Gross pay each contribution costs') * 35,
      6,
    )
  })

  test('the gross cost and the tax paid up front are what the deposit really costs', () => {
    expect(stat(base, 'Gross pay each contribution costs')).toBeCloseTo(9_615.38461538, 6)
    // 35 years of the gap between gross pay and the deposit it survives as.
    expect(stat(base, 'Tax paid up front, in total')).toBeCloseTo(35 * (7_500 / 0.78 - 7_500), 6)
    expect(stat(base, 'Tax paid up front, in total')).toBeCloseTo(74_038.46153846, 6)
    // At a zero rate today the Roth deposit costs its face value and no more.
    const untaxed = { ...base, taxRateNow: 0 }
    expect(stat(untaxed, 'Gross pay each contribution costs')).toBe(7_500)
    expect(stat(untaxed, 'Tax paid up front, in total')).toBe(0)
  })

  test('the equal-deposit figure is the comparison that flatters the Roth', () => {
    // Same cash into each account, so the traditional pot is the Roth pot taxed
    // on the way out — always the smaller of the two traditional figures, since
    // it silently drops the tax the Roth saver already paid.
    const equalDeposit = stat(base, 'Traditional at the same deposit, after tax')
    expect(equalDeposit).toBeCloseTo(primary(base) * 0.85, 6)
    expect(equalDeposit).toBeCloseTo(881_260.09949176, 4)
    expect(equalDeposit).toBeLessThan(stat(base, 'Traditional IRA, same cost, after tax'))
    // The two comparisons coincide only when there is no tax to pay today.
    const untaxed = { ...base, taxRateNow: 0 }
    expect(stat(untaxed, 'Traditional at the same deposit, after tax')).toBeCloseTo(
      stat(untaxed, 'Traditional IRA, same cost, after tax'),
      9,
    )
  })

  test('the horizon stat is the years of contributions in months', () => {
    expect(stat(base, 'Years of contributions')).toBe(35 * 12)
    expect(step(base, 'Years of growth')).toBe(35)
  })
})

/**
 * The claim the page exists to make. Everything here is asserted with `toBe`,
 * not `toBeCloseTo`: "mathematically identical" is either true to the bit or it
 * is a slogan. The implementation originally computed the traditional balance as
 * `(A / (1 - t0)) * s * (1 - t1)`, which is the same product algebraically but
 * lands one ulp away from `A * s` for most rates, so this suite failed on 1,031
 * of the 1,600 rate/return/horizon combinations below before the fix.
 */
describe('roth ira: the identity at equal tax rates', () => {
  const rates: number[] = []
  for (let t = 0; t <= 50; t += 0.5) rates.push(t)

  test(
    'equal rates give bit-identical accounts for every rate, return, amount and horizon',
    () => {
      for (const rate of rates) {
        for (const annualReturn of [0, 0.25, 7, 15]) {
          for (const annualContribution of [500, 7_500, 30_000]) {
            for (const [currentAge, retirementAge] of [
              [64, 65],
              [30, 65],
              [18, 75],
            ] as const) {
              const v: Input = {
                currentAge,
                retirementAge,
                annualContribution,
                annualReturn,
                taxRateNow: rate,
                taxRateRetirement: rate,
              }
              const how = `${rate}% / ${annualReturn}% / $${annualContribution} / ${currentAge}-${retirementAge}`
              const r = compute(v)
              const roth = Number(r.primary.value)
              // Not "close to". The same number.
              expect(stat(v, 'Traditional IRA, same cost, after tax'), how).toBe(roth)
              expect(stat(v, 'Roth advantage'), how).toBe(0)
              expect(stat(v, 'Roth advantage, as a percentage'), how).toBe(0)
              expect(r.scaleValue, how).toBe(0)
              // And the two curves lie exactly on top of each other, point for
              // point, so the chart cannot contradict the headline.
              const a = line(v, 'Roth, tax-free').points
              const b = line(v, 'Traditional, after tax').points
              expect(b.length, how).toBe(a.length)
              a.forEach((p, i) => {
                expect(b[i]![0], how).toBe(p[0])
                expect(b[i]![1], how).toBe(p[1])
              })
            }
          }
        }
      }
    },
    30_000,
  )

  test('the independent simulation reaches the same conclusion', () => {
    // Not exactly, because the loop accumulates its own rounding — but the two
    // arms of the simulation agree to the cent, which is what rules out the
    // identity being an artefact of how compute happens to be written.
    for (const rate of [0, 12, 22, 37, 49.5]) {
      const v = { ...base, taxRateNow: rate, taxRateRetirement: rate }
      expect(simulateTraditional(v)).toBeCloseTo(simulateRoth(v), 6)
      expect(primary(v)).toBeCloseTo(simulateRoth(v), 4)
    }
  })

  test('the notes say the tie is the identity rather than a rounding accident', () => {
    const tied = { ...base, taxRateRetirement: 22 }
    expect(compute(tied).notes!.some((n) => n.includes('exactly on top of each other'))).toBe(true)
    expect(compute(base).notes!.some((n) => n.includes('exactly on top of each other'))).toBe(false)
  })

  test('a tie lands in the neutral band with its label', () => {
    const tied = { ...base, taxRateRetirement: 22 }
    const v = compute(tied).scaleValue!
    const band = def.scale.bands.find((b) => v >= b.from && v < b.to)!
    expect(band.id).toBe('neutral')
  })
})

describe('roth ira: which account wins', () => {
  test('the advantage is (1 - t0) / (1 - t1) and depends on nothing else', () => {
    // The finding: the ratio has no return, no horizon and no contribution in
    // it. Move every one of those and the percentage does not budge.
    const cases: Array<Partial<Input>> = [
      {},
      { annualReturn: 0 },
      { annualReturn: 15 },
      { annualContribution: 500 },
      { annualContribution: 30_000 },
      { currentAge: 64 },
      { currentAge: 18, retirementAge: 75 },
    ]
    const expected = (0.78 / 0.85 - 1) * 100
    for (const patch of cases) {
      const v = { ...base, ...patch }
      expect(stat(v, 'Roth advantage, as a percentage')).toBeCloseTo(expected, 9)
    }
  })

  test('the ratio holds across the whole grid of rate pairs', () => {
    for (let t0 = 0; t0 <= 50; t0 += 2) {
      for (let t1 = 0; t1 <= 50; t1 += 2) {
        const v = { ...base, taxRateNow: t0, taxRateRetirement: t1 }
        const how = `${t0} -> ${t1}`
        const expected = ((1 - t0 / 100) / (1 - t1 / 100) - 1) * 100
        expect(stat(v, 'Roth advantage, as a percentage'), how).toBeCloseTo(expected, 9)
        // Sign, stated the other way round: strictly higher later means the Roth
        // wins, strictly lower means it loses, and there is no third case.
        if (t1 > t0) expect(stat(v, 'Roth advantage'), how).toBeGreaterThan(0)
        else if (t1 < t0) expect(stat(v, 'Roth advantage'), how).toBeLessThan(0)
        else expect(stat(v, 'Roth advantage'), how).toBe(0)
      }
    }
  })

  test('the break-even retirement rate is your rate today, and it zeroes the gap', () => {
    for (const taxRateNow of [0, 10, 22, 33.5, 50]) {
      const v = { ...base, taxRateNow }
      const breakEven = stat(v, 'Break-even retirement tax rate')
      expect(breakEven).toBe(taxRateNow)
      expect(step(v, 'Retirement rate that makes them equal')).toBe(taxRateNow)
      // Feeding the break-even rate back in must produce the tie it promises.
      const at = { ...v, taxRateRetirement: breakEven }
      expect(stat(at, 'Traditional IRA, same cost, after tax')).toBe(primary(at))
    }
  })

  test('the break-even rate ignores the return and the horizon, as advertised', () => {
    for (const patch of [
      { annualReturn: 0 },
      { annualReturn: 15 },
      { currentAge: 64 },
      { currentAge: 18, retirementAge: 75 },
      { annualContribution: 30_000 },
    ]) {
      expect(stat({ ...base, ...patch }, 'Break-even retirement tax rate')).toBe(22)
    }
  })

  test('the advantage is monotonic in the retirement rate', () => {
    let previous = -Infinity
    for (let t1 = 0; t1 <= 50; t1 += 1) {
      const v = stat({ ...base, taxRateRetirement: t1 }, 'Roth advantage')
      expect(v).toBeGreaterThan(previous)
      previous = v
    }
  })

  test('the scale spans exactly what the ratio can reach inside the field bounds', () => {
    // Rates run 0..50, so the ratio runs from 0.5/1 to 1/0.5 — -50% to +100%,
    // which is the declared scale. Nothing is ever clamped away in practice.
    const best = { ...base, taxRateNow: 0, taxRateRetirement: 50 }
    const worst = { ...base, taxRateNow: 50, taxRateRetirement: 0 }
    expect(compute(best).scaleValue).toBeCloseTo(100, 9)
    expect(compute(worst).scaleValue).toBeCloseTo(-50, 9)
    expect(def.scale.min).toBe(-50)
    expect(def.scale.max).toBe(100)
  })
})

describe('roth ira: parts, series and notes', () => {
  const inputs: Array<[string, Input]> = [
    ['the defaults', base],
    ['equal rates', { ...base, taxRateRetirement: 22 }],
    ['a higher rate later', { ...base, taxRateRetirement: 40 }],
    ['no tax today', { ...base, taxRateNow: 0 }],
    ['no tax in retirement', { ...base, taxRateRetirement: 0 }],
    ['no tax at all', { ...base, taxRateNow: 0, taxRateRetirement: 0 }],
    ['a zero return', { ...base, annualReturn: 0 }],
    ['the shortest horizon', { ...base, currentAge: 64 }],
    ['the longest horizon', { ...base, currentAge: 18, retirementAge: 75 }],
    ['the smallest contribution', { ...base, annualContribution: 500 }],
    ['the largest contribution', { ...base, annualContribution: 30_000 }],
    ['both rates at the top', { ...base, taxRateNow: 50, taxRateRetirement: 50 }],
  ]

  test.each(inputs)('the two parts split the pre-tax traditional pot for %s', (label, input) => {
    const r = compute(input)
    expect(r.parts, label).toHaveLength(2)
    const sum = r.parts!.reduce((acc, p) => acc + p.value, 0)
    expect(sum, label).toBeCloseTo(r.partsTotal!.value as number, 4)
    for (const p of r.parts!) {
      expect(Number.isFinite(p.value), label).toBe(true)
      expect(p.value, label).toBeGreaterThanOrEqual(0)
    }
    // The split is the retirement rate applied to the whole pot.
    const preTax = r.partsTotal!.value as number
    expect(part(input, 'Income tax at withdrawal'), label).toBeCloseTo(
      (preTax * input.taxRateRetirement) / 100,
      4,
    )
    expect(part(input, 'Yours after tax'), label).toBeCloseTo(
      stat(input, 'Traditional IRA, same cost, after tax'),
      6,
    )
  })

  test.each(inputs)('both curves run from zero to their headline for %s', (label, input) => {
    const r = compute(input)
    expect(r.series, label).toHaveLength(2)
    const roth = line(input, 'Roth, tax-free')
    const trad = line(input, 'Traditional, after tax')

    expect(roth.points[0]![0], label).toBe(input.currentAge)
    expect(roth.points[0]![1], label).toBe(0)
    expect(trad.points[0]![1], label).toBe(0)

    const lastRoth = roth.points[roth.points.length - 1]!
    expect(lastRoth[0], label).toBe(input.retirementAge)
    expect(lastRoth[1], label).toBeCloseTo(Number(r.primary.value), 9)

    const lastTrad = trad.points[trad.points.length - 1]!
    expect(lastTrad[0], label).toBe(input.retirementAge)
    expect(lastTrad[1], label).toBeCloseTo(
      stat(input, 'Traditional IRA, same cost, after tax'),
      9,
    )

    for (const s of [roth, trad]) {
      expect(s.points.length, label).toBeGreaterThan(1)
      expect(s.points.length, label).toBeLessThanOrEqual(45)
      s.points.forEach((p, i) => {
        expect(Number.isFinite(p[0]), label).toBe(true)
        expect(Number.isFinite(p[1]), label).toBe(true)
        if (i > 0) expect(p[0], label).toBeGreaterThan(s.points[i - 1]![0])
      })
    }
  })

  test('a mid-curve point is the same calculator run to that age', () => {
    const points = line(base, 'Roth, tax-free').points
    const at = points[9]!
    expect(at[1]).toBeCloseTo(simulateRoth({ ...base, retirementAge: at[0] }), 5)
    const tradAt = line(base, 'Traditional, after tax').points[9]!
    expect(tradAt[1]).toBeCloseTo(simulateTraditional({ ...base, retirementAge: tradAt[0] }), 5)
  })

  test('the notes state plainly which comparison is being made', () => {
    // The comparison chosen is the fair one — equal gross cost, not equal
    // deposit — and the page has to say so, because the other comparison is the
    // one most visitors arrive holding.
    const note = compute(base).notes!.find((n) => n.includes('GROSS cost'))!
    expect(note).toBeDefined()
    expect(note).toContain('9,615')
    expect(note).toContain('7,500')
    expect(note).toContain('22%')
    // And the equal-deposit figure is still reported, labelled for what it is.
    expect(
      compute(base).stats!.some((s) => s.label === 'Traditional at the same deposit, after tax'),
    ).toBe(true)
  })

  test('the notes carry the tax year and the source of every published figure', () => {
    // Read from IRS Notice 2025-67 itself, not a summary: section 219(b)(5)(A)
    // "is increased from $7,000 to $7,500", section 219(b)(5)(B)(ii) "from
    // $1,000 to $1,100" (so $8,600 from age 50), and section 408A(c)(3)(A) puts
    // the 2026 Roth phase-out at $153,000-$168,000 single and head of household,
    // $242,000-$252,000 married filing jointly.
    const notes = compute(base).notes!
    const limit = notes.find((n) => n.includes('annual limit'))!
    expect(limit).toContain('7,500')
    expect(limit).toContain('8,600')
    expect(limit).toContain('2026')
    expect(limit).toContain('Notice 2025-67')

    const phaseOut = notes.find((n) => n.includes('phase out'))!
    expect(phaseOut).toContain('153,000')
    expect(phaseOut).toContain('168,000')
    expect(phaseOut).toContain('242,000')
    expect(phaseOut).toContain('252,000')
    expect(phaseOut).toContain('2026')
    expect(phaseOut).toContain('408A(c)(3)(A)')

    // The same year and the same figures in the copy, so a stale number is
    // visible on the page rather than buried in a constant.
    const faq = def.faqs.find((f) => f.q.includes('2026'))!
    expect(faq.a).toContain('7,500')
    expect(faq.a).toContain('8,600')
    expect(faq.a).toContain('Notice 2025-67')
    expect(def.faqs.some((f) => f.a.includes('153,000') && f.a.includes('252,000'))).toBe(true)
  })

  test('the over-the-limit note appears exactly when the equal-cost contribution exceeds it', () => {
    const hasNote = (v: Input) => compute(v).notes!.some((n) => n.includes('no traditional IRA'))
    // At 22% the equal-cost contribution is $9,615, above the $7,500 limit.
    expect(hasNote(base)).toBe(true)
    // With no tax today the gross cost is the deposit itself, so it fits.
    expect(hasNote({ ...base, annualContribution: 7_500, taxRateNow: 0 })).toBe(false)
    expect(hasNote({ ...base, annualContribution: 500, taxRateNow: 22 })).toBe(false)
  })

  test('the direction note follows the two rates', () => {
    const note = (v: Input) => compute(v).notes!.join(' ')
    expect(note({ ...base, taxRateRetirement: 40 })).toContain('more tax in retirement')
    expect(note(base)).toContain('less tax in retirement')
    expect(note({ ...base, taxRateRetirement: 22 })).toContain('exactly on top of each other')
  })

  test('every note is a plain sentence, not markup', () => {
    for (const note of compute(base).notes!) {
      expect(note.length).toBeGreaterThan(40)
      expect(note).not.toMatch(/<\/?[a-z]/i)
      expect(note).not.toContain('NaN')
      expect(note).not.toContain('undefined')
    }
  })
})

describe('roth ira: input handling', () => {
  test('the nudged first number field stays valid and moves the result', () => {
    // The end-to-end suite bumps the first number field to 1.1x its default and
    // expects a valid, different answer.
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('currentAge')
    const nudged = { ...base, currentAge: first.default * 1.1 }
    expect(nudged.currentAge).toBe(33)
    expect(() => compute(nudged)).not.toThrow()
    // Three fewer years of contributions and compounding.
    expect(primary(nudged)).toBeLessThan(primary(base))
    expect(primary(nudged)).toBeCloseTo(simulateRoth(nudged), 4)
    // But not the verdict: the ratio is untouched by the horizon.
    expect(stat(nudged, 'Roth advantage, as a percentage')).toBeCloseTo(
      stat(base, 'Roth advantage, as a percentage'),
      9,
    )
  })

  test('every declared bound is a value compute accepts', () => {
    // Each number field renders as a slider spanning min..max, so both ends are
    // one drag away. The ages are bounded so neither end collides with the
    // other's default: currentAge stops at 64 below a retirement age of 65, and
    // retirementAge starts at 40 above a current age of 30.
    for (const field of fields) {
      for (const bound of [field.min, field.max]) {
        expect(() => compute({ ...base, [field.id]: bound }), `${field.id}=${bound}`).not.toThrow()
      }
    }
  })

  test('every default sits on the slider grid, min + n x step', () => {
    for (const field of fields) {
      expect(field.default).toBeGreaterThanOrEqual(field.min)
      expect(field.default).toBeLessThanOrEqual(field.max)
      const n = (field.default - field.min) / field.step
      expect(Math.abs(n - Math.round(n)), field.id).toBeLessThan(1e-9)
    }
  })

  test.each([
    ['a zero current age', { currentAge: 0 }, 'currentAge'],
    ['a negative current age', { currentAge: -1 }, 'currentAge'],
    ['retiring at the current age', { retirementAge: 30 }, 'retirementAge'],
    ['retiring before the current age', { retirementAge: 25 }, 'retirementAge'],
    ['a zero contribution', { annualContribution: 0 }, 'annualContribution'],
    ['a negative contribution', { annualContribution: -100 }, 'annualContribution'],
    ['a negative return', { annualReturn: -1 }, 'annualReturn'],
    ['a negative rate today', { taxRateNow: -1 }, 'taxRateNow'],
    ['taking all of your pay in tax', { taxRateNow: 100 }, 'taxRateNow'],
    ['more than all of your pay in tax', { taxRateNow: 120 }, 'taxRateNow'],
    ['a negative retirement rate', { taxRateRetirement: -1 }, 'taxRateRetirement'],
    ['a 100% retirement rate', { taxRateRetirement: 100 }, 'taxRateRetirement'],
    // coerceValues emits NaN for a number field it cannot parse ("abc",
    // "1e999"), on the expectation that compute refuses it rather than letting
    // NaN propagate into the result. The finiteness guard has to come FIRST:
    // `x < 0` is false for NaN, so a magnitude test alone lets it through.
    ['an unparseable current age', { currentAge: Number.NaN }, 'currentAge'],
    ['an unparseable retirement age', { retirementAge: Number.NaN }, 'retirementAge'],
    ['an unparseable contribution', { annualContribution: Number.NaN }, 'annualContribution'],
    ['an unparseable return', { annualReturn: Number.NaN }, 'annualReturn'],
    ['an unparseable rate today', { taxRateNow: Number.NaN }, 'taxRateNow'],
    ['an unparseable retirement rate', { taxRateRetirement: Number.NaN }, 'taxRateRetirement'],
    ['an infinite current age', { currentAge: Number.POSITIVE_INFINITY }, 'currentAge'],
    ['an infinite retirement age', { retirementAge: Number.POSITIVE_INFINITY }, 'retirementAge'],
    ['an infinite contribution', { annualContribution: Number.POSITIVE_INFINITY }, 'annualContribution'],
    ['an infinite return', { annualReturn: Number.POSITIVE_INFINITY }, 'annualReturn'],
    ['an infinite rate today', { taxRateNow: Number.POSITIVE_INFINITY }, 'taxRateNow'],
    ['an infinite retirement rate', { taxRateRetirement: Number.POSITIVE_INFINITY }, 'taxRateRetirement'],
  ])('rejects %s against the right field', (_label, patch, fieldId) => {
    let thrown: unknown
    try {
      compute({ ...base, ...patch } as Input)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
    expect((thrown as CalcError).message.length).toBeGreaterThan(10)
  })

  test('an impossible retirement age is blamed on the retirement age, not the current one', () => {
    // Both fields are involved in the comparison, so the wrong choice here
    // highlights a field the visitor has no reason to change.
    for (const patch of [{ retirementAge: 18 }, { retirementAge: 30 }, { currentAge: 64, retirementAge: 40 }]) {
      let thrown: unknown
      try {
        compute({ ...base, ...patch })
      } catch (err) {
        thrown = err
      }
      expect((thrown as CalcError).fieldId).toBe('retirementAge')
    }
  })

  test.each<[string, Partial<Input>]>([
    ['the defaults', {}],
    ['a zero return', { annualReturn: 0 }],
    ['no tax at all', { taxRateNow: 0, taxRateRetirement: 0 }],
    ['both rates at the cap', { taxRateNow: 50, taxRateRetirement: 50 }],
    ['the shortest horizon', { currentAge: 64 }],
    ['the longest horizon', { currentAge: 18, retirementAge: 75 }],
    ['the nudged first field', { currentAge: 33 }],
    ['the smallest contribution', { annualContribution: 500 }],
  ])('never returns NaN for %s', (label, patch) => {
    const r = compute({ ...base, ...patch })
    const quantities = [r.primary, ...(r.stats ?? []), ...(r.steps ?? [])].filter(
      (q): q is Exclude<typeof q, { rule: true }> => !('rule' in q),
    )
    for (const q of quantities) expect(Number.isFinite(Number(q.value)), `${label}: ${q.label}`).toBe(true)
    expect(Number.isFinite(r.scaleValue!), label).toBe(true)
    expect(r.scaleValue!, label).toBeGreaterThanOrEqual(def.scale.min)
    expect(r.scaleValue!, label).toBeLessThanOrEqual(def.scale.max)
  })
})

/**
 * The registry-wide conformance suite only sees a calculator once it is listed
 * in `src/calculators/index.ts`, and registration is done centrally. These
 * mirror the checks it applies, so the definition is known good the moment that
 * import line lands rather than after it breaks someone else's run.
 */
describe('roth ira: definition', () => {
  test('the meta copy fits a search result', () => {
    expect(def.description.length).toBeGreaterThan(50)
    expect(def.description.length).toBeLessThanOrEqual(160)
    expect(def.seoTitle.length).toBeLessThanOrEqual(70)
    expect(def.intro.length).toBeGreaterThan(40)
    expect(def.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    expect(def.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(def.resultLabel).toBe(compute(base).primary.label)
  })

  test('has at least three real FAQs', () => {
    expect(def.faqs.length).toBeGreaterThanOrEqual(3)
    for (const faq of def.faqs) {
      expect(faq.q.endsWith('?')).toBe(true)
      expect(faq.a.length).toBeGreaterThan(120)
    }
  })

  test('the FAQs state the thesis the page is built on', () => {
    const answers = def.faqs.map((f) => f.a).join(' ')
    expect(answers).toMatch(/same money to the cent|mathematically identical|identical/i)
    expect(def.intro).toContain('mathematically identical')
  })

  test('field ids are unique and camelCase', () => {
    const ids = fields.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const field of fields) expect(field.id).toMatch(/^[a-z][a-zA-Z0-9]*$/)
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
    // -8.24% at the defaults: inside "Traditional ahead", clear of both edges,
    // so the label cannot disagree with the number.
    const atDefaults = compute(base).scaleValue!
    expect(atDefaults).toBeCloseTo(-8.2353, 3)
    expect(bands.find((b) => atDefaults >= b.from && atDefaults < b.to)!.id).toBe('warn')
  })

  test('related slugs point elsewhere, and the disclaimer is a token', () => {
    expect(def.related.length).toBeGreaterThan(0)
    for (const slug of def.related) expect(slug).not.toBe(def.slug)
    expect(def.disclaimer).toBe('financial')
  })

  test('the definition holds no colour, class name, or markup', () => {
    const serialized = JSON.stringify(def, (_k, v) => (typeof v === 'function' ? undefined : v))
    expect(serialized).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(serialized).not.toMatch(/\b(bg|text|border|rounded|shadow)-[a-z]+-\d{2,3}\b/)
    expect(serialized).not.toMatch(/<\/?[a-z][\s\S]*>/i)
  })

  /**
   * The sweep `registry.test.ts` runs: every field moved to each end of its
   * range, its default, the small integers that get special-cased, and a few
   * interior points, one field at a time from the defaults. The property it
   * protects is that nothing drawable appears only off-default — the donut and
   * the chart are server-rendered from the DEFAULT result, so a part or a series
   * that shows up only for some other input gets no container at all and no
   * client-side redraw can conjure one back.
   */
  test(
    'parts and series counts never vary, and are drawable at the defaults',
    () => {
      const samples = (field: (typeof fields)[number]) =>
        [
          field.min,
          field.max,
          field.default,
          0,
          1,
          2,
          ...[0.25, 0.5, 0.75].map((f) => field.min + (field.max - field.min) * f),
        ]
          .filter((v) => v >= field.min && v <= field.max)
          .map((v) => Number(v.toFixed(6)))

      const cases: Array<[string, Input]> = [['defaults', base]]
      for (const field of fields)
        for (const value of samples(field)) cases.push([`${field.id}=${value}`, { ...base, [field.id]: value }])

      // The defaults must draw both figures, or neither is ever rendered.
      const atDefaults = compute(base)
      expect(atDefaults.parts).toHaveLength(2)
      expect(atDefaults.series).toHaveLength(2)

      let reached = 0
      for (const [how, input] of cases) {
        let r
        try {
          r = compute(input)
        } catch {
          continue // a CalcError is a refusal to answer, not a bad answer
        }
        reached += 1
        expect(r.parts, how).toHaveLength(2)
        expect(r.parts!.reduce((acc, p) => acc + p.value, 0), how).toBeCloseTo(
          r.partsTotal!.value as number,
          4,
        )
        for (const p of r.parts!) {
          expect(Number.isFinite(p.value), how).toBe(true)
          expect(p.value, how).toBeGreaterThanOrEqual(0)
        }
        expect(r.series, how).toHaveLength(2)
        for (const s of r.series!) {
          expect(s.points.length, how).toBeGreaterThan(1)
          expect(s.points.length, how).toBeLessThanOrEqual(45)
          s.points.forEach((p, i) => {
            expect(Number.isFinite(p[0]), how).toBe(true)
            expect(Number.isFinite(p[1]), how).toBe(true)
            if (i > 0) expect(p[0], how).toBeGreaterThan(s.points[i - 1]![0])
          })
        }
        expect(Number.isFinite(r.scaleValue!), how).toBe(true)
        expect(r.notes!.length, how).toBeGreaterThan(0)
      }
      expect(reached).toBeGreaterThan(40)
    },
    30_000,
  )
})

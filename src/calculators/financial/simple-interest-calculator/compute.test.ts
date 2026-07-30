import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'
import type { Values } from '../../../lib/types'
import { resolveBand } from '../../../lib/view'

type Input = Values<typeof fields>
type Patch = Partial<Input>

const base: Input = {
  principal: 10_000,
  annualRate: 6,
  years: 5,
  compoundsPerYear: '12',
}

const at = (patch: Patch = {}) => compute({ ...base, ...patch })

const stat = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)

/**
 * Interest accrued month by month WITHOUT compounding: each month adds P·r/12,
 * always measured against the original principal and never against the running
 * balance. Independent of the closed form under test — it never multiplies by
 * the term at all.
 */
function accrueSimple(principal: number, annualRate: number, months: number) {
  const perMonth = (principal * annualRate) / 100 / 12
  let interest = 0
  for (let m = 0; m < months; m++) interest += perMonth
  return interest
}

/** Period-by-period compounding, for the comparison figure. */
function accrueCompound(principal: number, annualRate: number, years: number, n: number) {
  const perPeriod = annualRate / 100 / n
  let balance = principal
  for (let p = 0; p < Math.round(n * years); p++) balance *= 1 + perPeriod
  return balance
}

describe('simple interest', () => {
  test('$10,000 at 6% for 5 years earns exactly $3,000', () => {
    // I = P·r·t = 10000 × 0.06 × 5 = 3000, so A = P + I = 13000.
    const r = at()
    expect(Number(r.primary.value)).toBeCloseTo(3000, 9)
    expect(stat(r, 'Total amount')).toBeCloseTo(13_000, 9)

    // Second, independent derivation: sixty months of $50 accruing on the
    // principal alone. Nothing in here uses P·r·t.
    expect(accrueSimple(10_000, 6, 60)).toBeCloseTo(3000, 9)
    // Third: A = P(1 + rt), the form compute deliberately does NOT use — it adds
    // P + I so the donut's two slices sum to their stated total exactly.
    expect(stat(r, 'Total amount')).toBeCloseTo(10_000 * (1 + 0.06 * 5), 9)
  })

  test('interest is strictly linear in principal, rate and time', () => {
    // The defining property: doubling any one input doubles the interest, and
    // the amount added per year never changes.
    const one = Number(at().primary.value)
    expect(Number(at({ principal: 20_000 }).primary.value)).toBeCloseTo(one * 2, 6)
    expect(Number(at({ annualRate: 12 }).primary.value)).toBeCloseTo(one * 2, 6)
    expect(Number(at({ years: 10 }).primary.value)).toBeCloseTo(one * 2, 6)
    expect(stat(at(), 'Interest per year')).toBeCloseTo(600, 9)
    expect(stat(at({ years: 40 }), 'Interest per year')).toBeCloseTo(600, 9)
  })

  test('a $5,000 bill at 4.5% over 180 days earns $110.96', () => {
    // 180/365 = 0.4931506849315068 years.
    // I = 5000 × 0.045 × 0.4931506849315068 = 110.95890410958904
    const years = 180 / 365
    const r = compute({ principal: 5000, annualRate: 4.5, years, compoundsPerYear: '1' })
    expect(Number(r.primary.value)).toBeCloseTo(110.95890411, 8)
    // Independent check, arranged so the division happens once: 5000 × 45 × 180
    // basis-point-days over 1000 × 365.
    expect(Number(r.primary.value)).toBeCloseTo((5000 * 45 * 180) / (1000 * 365), 8)
  })

  test('the compound comparison matches a period-by-period simulation', () => {
    const r = at()
    // 10000 × 1.005^60 = 13488.501525493075
    expect(stat(r, 'Compound interest, same terms')).toBeCloseTo(3488.5015254931, 8)
    expect(stat(r, 'Compound interest, same terms')).toBeCloseTo(
      accrueCompound(10_000, 6, 5, 12) - 10_000,
      8,
    )
    expect(stat(r, 'Extra from compounding')).toBeCloseTo(488.5015254931, 8)
    // The gap is the whole point of the page, so pin it.
    expect(r.scaleValue).toBeCloseTo((488.5015254931 / 3000) * 100, 8)
    expect(r.scaleValue).toBeCloseTo(16.28338418, 7)
    expect(resolveBand(def.scale, r.scaleValue!)!.id).toBe('neutral')
  })

  test('the compounding gap widens with the term and with the frequency', () => {
    const gap = (patch: Patch) => at(patch).scaleValue!
    expect(gap({ years: 1 })).toBeLessThan(gap({ years: 10 }))
    expect(gap({ years: 10 })).toBeLessThan(gap({ years: 40 }))
    expect(gap({ compoundsPerYear: '1' })).toBeLessThan(gap({ compoundsPerYear: '4' }))
    expect(gap({ compoundsPerYear: '4' })).toBeLessThan(gap({ compoundsPerYear: '12' }))
    expect(gap({ compoundsPerYear: '12' })).toBeLessThan(gap({ compoundsPerYear: '365' }))
    // And it does NOT depend on the principal — both sides scale with P.
    expect(gap({ principal: 250_000 })).toBeCloseTo(gap({}), 6)
  })

  test('simple interest wins over a term shorter than one compounding period', () => {
    // 12% for a quarter: simple pays r·t = 3.00% of the principal, annual
    // compounding pays 1.12^0.25 − 1 = 2.8737…%, so the difference is negative.
    const r = compute({ principal: 10_000, annualRate: 12, years: 0.25, compoundsPerYear: '1' })
    expect(Number(r.primary.value)).toBeCloseTo(300, 9)
    const compounded = 10_000 * (Math.pow(1.12, 0.25) - 1)
    expect(compounded).toBeCloseTo(287.3734, 4)
    expect(stat(r, 'Extra from compounding')).toBeCloseTo(compounded - 300, 8)
    expect(stat(r, 'Extra from compounding')).toBeLessThan(0)
    expect(r.notes!.some((n) => n.includes('comes out ahead'))).toBe(true)
    // A negative gap must still land in the FIRST band. resolveBand falls back
    // to the last band for anything it cannot place, so a scale floor above the
    // true minimum would mislabel this as the most extreme case.
    expect(resolveBand(def.scale, r.scaleValue!)!.id).toBe('good')
  })

  test('nothing inside the declared bounds falls off the bottom of the scale', () => {
    let worst = Infinity
    for (let rate = 0; rate <= 40.0001; rate += 0.25) {
      for (const n of ['1', '2', '4', '12', '365']) {
        for (const years of [0.05, 0.1, 0.25, 0.5, 0.75, 1, 2, 5, 10, 20, 40]) {
          const v = at({ annualRate: rate, years, compoundsPerYear: n }).scaleValue!
          if (v < worst) worst = v
        }
      }
    }
    expect(worst).toBeLessThan(0)
    expect(worst).toBeGreaterThan(def.scale.min)
  })

  test('a 0% rate earns nothing without dividing by zero', () => {
    const r = at({ annualRate: 0 })
    expect(Number(r.primary.value)).toBe(0)
    expect(stat(r, 'Total amount')).toBe(10_000)
    expect(stat(r, 'Extra from compounding')).toBe(0)
    expect(r.scaleValue).toBe(0)
    expect(resolveBand(def.scale, r.scaleValue!)!.id).toBe('good')
  })

  test('nudging the first number field 1.1x stays valid and moves the result', () => {
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('principal')
    expect(first.default * 1.1).toBeLessThanOrEqual(first.max!)
    // 11000 × 0.06 × 5 = 3300, plainly different from the 3000 at the default.
    expect(Number(at({ principal: first.default * 1.1 }).primary.value)).toBeCloseTo(3300, 6)
  })

  test('every bound the form can offer is a value compute accepts', () => {
    expect(() => at({ principal: 100 })).not.toThrow()
    expect(() => at({ principal: 10_000_000 })).not.toThrow()
    expect(() => at({ annualRate: 0 })).not.toThrow()
    expect(() => at({ annualRate: 40 })).not.toThrow()
    expect(() => at({ years: 0.05 })).not.toThrow()
    expect(() => at({ years: 40 })).not.toThrow()
    for (const option of fields[3].options) {
      expect(() => at({ compoundsPerYear: option.value })).not.toThrow()
    }
    // And the declared bounds really are the ones asserted above.
    expect([fields[0].min, fields[0].max]).toEqual([100, 10_000_000])
    expect([fields[1].min, fields[1].max]).toEqual([0, 40])
    expect([fields[2].min, fields[2].max]).toEqual([0.05, 40])
  })

  test('every default and reachable slider stop lands on its own step grid', () => {
    // The range input snaps to min + n x step, so a default off that grid opens
    // the page with the thumb beside the number instead of on it. No test in the
    // suite sees this and no error is raised — it is only visible on the page.
    //
    // The slider is also capped near 4x the default rather than at the declared
    // max (softRange, in the theme — which a calculator may not import), so the
    // capped end has to be on the grid too or the thumb cannot reach the top of
    // its own track. Those caps are $50,000, the field's own 40% max, and 20 yr.
    const softMax: Record<string, number> = { principal: 50_000, annualRate: 40, years: 20 }
    for (const field of fields) {
      if (field.kind !== 'number') continue
      const onGrid = (v: number) => {
        const k = (v - field.min) / field.step
        expect(Math.abs(k - Math.round(k)), `${field.id} @ ${v}`).toBeLessThan(1e-6)
      }
      onGrid(field.default)
      onGrid(field.max)
      onGrid(softMax[field.id]!)
    }
    // The end-to-end nudge lands on the grid too.
    expect((11_000 - fields[0].min) % fields[0].step).toBe(0)
  })

  test.each([
    ['zero principal', { principal: 0 }, 'principal'],
    ['negative principal', { principal: -100 }, 'principal'],
    ['negative rate', { annualRate: -0.25 }, 'annualRate'],
    ['an implausible rate', { annualRate: 250 }, 'annualRate'],
    ['zero term', { years: 0 }, 'years'],
    ['negative term', { years: -1 }, 'years'],
    ['an implausible term', { years: 250 }, 'years'],
    ['no compounding frequency', { compoundsPerYear: '' }, 'compoundsPerYear'],
  ])('rejects %s', (_label, patch: Patch, fieldId) => {
    let thrown: unknown
    try {
      at(patch)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
  })

  test('never returns NaN for a blank numeric input', () => {
    // coerceValues emits NaN for unparseable text, and `x <= 0` is false for
    // NaN, so each guard has to test finiteness first.
    expect(() => at({ principal: Number.NaN })).toThrow(CalcError)
    expect(() => at({ annualRate: Number.NaN })).toThrow(CalcError)
    expect(() => at({ years: Number.NaN })).toThrow(CalcError)
  })
})

describe('parts and series', () => {
  test('parts sum exactly to the total they claim', () => {
    const r = at()
    const sum = r.parts!.reduce((s, p) => s + p.value, 0)
    expect(sum).toBe(Number(r.partsTotal!.value))
    expect(sum).toBeCloseTo(13_000, 9)
    expect(r.parts!.map((p) => p.label)).toEqual(['Principal', 'Simple interest'])
  })

  test('the shape never varies with input, so the defaults can always draw it', () => {
    const shapes = [
      at(),
      at({ annualRate: 0 }),
      at({ years: 0.05 }),
      at({ years: 40 }),
      at({ principal: 100 }),
      at({ principal: 10_000_000 }),
      at({ compoundsPerYear: '365' }),
    ]
    for (const r of shapes) {
      expect(r.parts!.length).toBe(2)
      expect(r.series!.length).toBe(2)
      expect(r.series![0]!.points.length).toBe(41)
      expect(r.series![1]!.points.length).toBe(41)
      for (const part of r.parts!) expect(part.value).toBeGreaterThanOrEqual(0)
      const sum = r.parts!.reduce((s, p) => s + p.value, 0)
      expect(sum).toBeCloseTo(Number(r.partsTotal!.value), 6)
    }
  })

  test('both curves start at the principal and end on the headline figures', () => {
    const r = at()
    const simple = r.series!.find((s) => s.label === 'Simple interest')!
    const compounded = r.series!.find((s) => s.label === 'Compounded')!
    expect(simple.points[0]).toEqual([0, 10_000])
    expect(compounded.points[0]![0]).toBe(0)
    expect(compounded.points[0]![1]).toBeCloseTo(10_000, 9)
    expect(simple.points[40]![0]).toBe(5)
    expect(simple.points[40]![1]).toBeCloseTo(13_000, 9)
    expect(compounded.points[40]![0]).toBe(5)
    expect(compounded.points[40]![1]).toBeCloseTo(13_488.5015254931, 8)
  })

  test('x is strictly increasing, and the simple line is genuinely straight', () => {
    // 40 years over 40 samples means one point per year, so each step must add
    // exactly P·r = $600 — the same amount in year forty as in year one.
    const [simple, compounded] = at({ years: 40 }).series!
    for (let i = 1; i < simple!.points.length; i++) {
      expect(simple!.points[i]![0]).toBeGreaterThan(simple!.points[i - 1]![0])
      expect(compounded!.points[i]![0]).toBeGreaterThan(compounded!.points[i - 1]![0])
      expect(simple!.points[i]![1] - simple!.points[i - 1]![1]).toBeCloseTo(600, 6)
    }
    // The compound curve is convex, so its steps grow instead of repeating.
    const firstStep = compounded!.points[1]![1] - compounded!.points[0]![1]
    const lastStep = compounded!.points[40]![1] - compounded!.points[39]![1]
    expect(lastStep).toBeGreaterThan(firstStep * 5)
  })
})

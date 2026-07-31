import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'
import { resolveBand } from '../../../lib/view'

const base = {
  capCost: 38_000,
  msrp: 42_000,
  downPayment: 2000,
  residualValue: 24_500,
  moneyFactor: 0.00125,
  term: '36',
}

type Input = typeof base
const at = (patch: Partial<Input>) => compute({ ...base, ...patch })

const stat = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)

/**
 * The independent confirmation of the rent charge, and the reason 2400 is the
 * right constant rather than a folk number.
 *
 * This never touches `(adjCap + residual) x MF`. It walks the lease month by
 * month, takes the average of the balance at the start and end of each month —
 * the balance falls in a straight line, so that average is exact, not an
 * approximation — and charges interest on it at the monthly rate the money
 * factor implies, which is `2 x MF` (equivalently APR/1200, since APR = 2400 x MF).
 *
 * Summing that over the term must land on the closed-form total rent charge to
 * the last bit. If it does, the money factor really is an APR in disguise and
 * the formula in `compute.ts` really is amortization-free interest on an
 * average balance.
 */
function accruedRentCharge(adjCapCost: number, residual: number, term: number, mf: number) {
  const monthlyDepreciation = (adjCapCost - residual) / term
  const monthlyRate = 2 * mf
  let total = 0
  for (let m = 1; m <= term; m += 1) {
    const start = adjCapCost - monthlyDepreciation * (m - 1)
    const end = adjCapCost - monthlyDepreciation * m
    total += ((start + end) / 2) * monthlyRate
  }
  return total
}

describe('car lease payment', () => {
  test('the default scenario matches the payment derived by hand', () => {
    // Adjusted cap cost: 38,000 - 2,000 = 36,000. Depreciation: 36,000 - 24,500
    // = 11,500, over 36 months = 319.444.../mo. Rent charge: (36,000 + 24,500)
    // x 0.00125 = 60,500 x 0.00125 = 75.625/mo. Payment = 395.069444...
    const r = at({})
    expect(stat(r, 'Adjusted capitalized cost')).toBe(36_000)
    expect(stat(r, 'Total depreciation')).toBe(11_500)
    expect(stat(r, 'Monthly depreciation')).toBeCloseTo(11_500 / 36, 10)
    expect(stat(r, 'Monthly rent charge')).toBeCloseTo(75.625, 10)
    expect(Number(r.primary.value)).toBeCloseTo(11_500 / 36 + 75.625, 10)
    expect(Number(r.primary.value)).toBeCloseTo(395.069444444, 9)
    expect(stat(r, 'Total of payments')).toBeCloseTo(14_222.5, 8)
  })

  test('an independent month-by-month accrual reproduces the rent charge', () => {
    const r = at({})
    expect(accruedRentCharge(36_000, 24_500, 36, 0.00125)).toBeCloseTo(
      stat(r, 'Total rent charge'),
      8,
    )
    // And the same agreement across the whole grid of terms and factors, so the
    // match at the defaults is not a coincidence of round numbers.
    for (const term of ['24', '27', '30', '36', '39', '42', '48']) {
      for (const moneyFactor of [0, 0.0005, 0.00125, 0.00375, 0.008]) {
        const res = at({ term, moneyFactor })
        expect(accruedRentCharge(36_000, 24_500, Number(term), moneyFactor)).toBeCloseTo(
          stat(res, 'Total rent charge'),
          7,
        )
        // The payment itself, rebuilt from the accrual rather than the formula.
        expect(Number(res.primary.value)).toBeCloseTo(
          (36_000 - 24_500) / Number(term) +
            accruedRentCharge(36_000, 24_500, Number(term), moneyFactor) / Number(term),
          7,
        )
      }
    }
  })

  test('the payment is exactly depreciation plus rent charge, with no amortization', () => {
    // A loan payment on the same numbers would differ; this is the whole point
    // of the page. Every payment is identical, so total = monthly x term
    // exactly, which an amortizing schedule would not give you.
    const r = at({})
    expect(stat(r, 'Monthly depreciation') + stat(r, 'Monthly rent charge')).toBeCloseTo(
      Number(r.primary.value),
      10,
    )
    expect(stat(r, 'Total of payments')).toBeCloseTo(Number(r.primary.value) * 36, 8)
    expect(stat(r, 'Total depreciation') + stat(r, 'Total rent charge')).toBeCloseTo(
      stat(r, 'Total of payments'),
      8,
    )
  })
})

describe('money factor and APR', () => {
  // The anchors. These are exact in IEEE-754 doubles, so they are asserted with
  // toBe rather than a tolerance: a money factor IS an APR over 2400, and any
  // drift here means the constant has been fiddled with.
  test('0.00125 is exactly 3% APR and 0.00375 is exactly 9%', () => {
    expect(stat(at({ moneyFactor: 0.00125 }), 'Equivalent APR')).toBe(3)
    expect(stat(at({ moneyFactor: 0.00375 }), 'Equivalent APR')).toBe(9)
    expect(stat(at({ moneyFactor: 0.0025 }), 'Equivalent APR')).toBe(6)
    expect(stat(at({ moneyFactor: 0 }), 'Equivalent APR')).toBe(0)
  })

  test('the conversion round-trips in both directions on the page', () => {
    // APR / 2400 recovers the factor exactly for the anchors.
    expect(3 / 2400).toBe(0.00125)
    expect(9 / 2400).toBe(0.00375)

    const steps = at({}).steps!.filter((s): s is Exclude<typeof s, { rule: true }> => !('rule' in s))
    const forward = steps.find((s) => s.label === 'Money factor × 2400 = APR')!
    const back = steps.find((s) => s.label === 'APR ÷ 2400 = money factor')!
    expect(forward.value).toBe(3)
    expect(back.value).toBe(0.00125)
    // Both directions are shown, not just the flattering one.
    expect(steps.some((s) => s.label === 'Money factor as quoted')).toBe(true)
  })

  test('APR scales linearly with the factor and drives the high-rate note', () => {
    for (const mf of [0, 0.0005, 0.001, 0.00125, 0.002, 0.00375, 0.005, 0.01]) {
      expect(stat(at({ moneyFactor: mf }), 'Equivalent APR')).toBeCloseTo(mf * 2400, 12)
    }
    expect(at({ moneyFactor: 0.005 }).notes!.some((n) => n.includes('9% APR'))).toBe(true)
    expect(at({ moneyFactor: 0.00125 }).notes!.some((n) => n.includes('9% APR'))).toBe(false)
  })

  test('a zero money factor degrades to pure depreciation, dividing by nothing', () => {
    const r = at({ moneyFactor: 0 })
    expect(stat(r, 'Monthly rent charge')).toBe(0)
    expect(stat(r, 'Total rent charge')).toBe(0)
    expect(Number(r.primary.value)).toBeCloseTo(11_500 / 36, 10)
    expect(Number.isFinite(Number(r.primary.value))).toBe(true)
    // The two-part split survives it: the rent slice is zero, not missing.
    expect(r.parts).toHaveLength(2)
    expect(r.parts![1]!.value).toBe(0)
    expect(r.parts![0]!.value + r.parts![1]!.value).toBeCloseTo(Number(r.partsTotal!.value), 6)
    expect(r.notes!.some((n) => n.includes('0% lease'))).toBe(true)
  })
})

describe('rejected input', () => {
  test.each([
    ['a residual at the cap cost', { residualValue: 38_000 }, 'residualValue'],
    ['a residual above the cap cost', { residualValue: 45_000 }, 'residualValue'],
    ['cash down that swallows the depreciation', { downPayment: 14_000 }, 'downPayment'],
    ['negative cash down', { downPayment: -1 }, 'downPayment'],
    ['a zero price', { capCost: 0 }, 'capCost'],
    ['a zero MSRP', { msrp: 0 }, 'msrp'],
    ['a negative money factor', { moneyFactor: -0.001 }, 'moneyFactor'],
    ['an unscaled money factor of 125', { moneyFactor: 125 }, 'moneyFactor'],
    ['a term of zero', { term: '0' }, 'term'],
  ])('rejects %s', (_label, patch, fieldId) => {
    let thrown: unknown
    try {
      at(patch as Partial<Input>)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
  })

  // Finiteness is guarded BEFORE magnitude: `coerceValues` emits NaN for
  // unparseable input, and `NaN < 0` is false, so a magnitude-only check would
  // let it through and produce a NaN payment on the page.
  test.each([
    ['capCost', 'capCost'],
    ['msrp', 'msrp'],
    ['downPayment', 'downPayment'],
    ['residualValue', 'residualValue'],
    ['moneyFactor', 'moneyFactor'],
  ])('rejects NaN in %s against its own field', (id, fieldId) => {
    let thrown: unknown
    try {
      at({ [id]: Number.NaN } as Partial<Input>)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
    expect((thrown as CalcError).message).toContain('Enter a number')
  })

  test('rejects a non-numeric term', () => {
    expect(() => at({ term: 'abc' })).toThrow(CalcError)
  })
})

describe('the reported figures', () => {
  test('residual share of MSRP drives the scale and the band', () => {
    const r = at({})
    expect(stat(r, 'Residual as a share of MSRP')).toBeCloseTo((24_500 / 42_000) * 100, 10)
    expect(r.scaleValue).toBeCloseTo(58.333333333, 8)
    expect(resolveBand(def.scale, r.scaleValue!)!.id).toBe('good')
    expect(resolveBand(def.scale, at({ residualValue: 27_000 }).scaleValue!)!.id).toBe('excellent')
    expect(resolveBand(def.scale, at({ residualValue: 20_000 }).scaleValue!)!.id).toBe('warn')
    expect(resolveBand(def.scale, at({ residualValue: 15_000 }).scaleValue!)!.id).toBe('critical')
  })

  test('total out of pocket adds the cash down back on', () => {
    const r = at({})
    expect(stat(r, 'Total out of pocket')).toBeCloseTo(stat(r, 'Total of payments') + 2000, 8)
  })

  test('a longer term lowers the payment but raises the rent charge', () => {
    const short = at({ term: '24' })
    const long = at({ term: '48' })
    expect(Number(long.primary.value)).toBeLessThan(Number(short.primary.value))
    expect(stat(long, 'Total rent charge')).toBeGreaterThan(stat(short, 'Total rent charge'))
    // Depreciation is the same money either way — only its pace changes.
    expect(stat(long, 'Total depreciation')).toBeCloseTo(stat(short, 'Total depreciation'), 8)
  })

  test('a higher residual cuts depreciation but raises the rent charge', () => {
    const low = at({ residualValue: 20_000 })
    const high = at({ residualValue: 28_000 })
    expect(stat(high, 'Total depreciation')).toBeLessThan(stat(low, 'Total depreciation'))
    expect(stat(high, 'Total rent charge')).toBeGreaterThan(stat(low, 'Total rent charge'))
    expect(Number(high.primary.value)).toBeLessThan(Number(low.primary.value))
  })

  test('nudging the first number field by 10% keeps the input valid and moves the result', () => {
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('capCost')
    const nudged = at({ capCost: first.default * 1.1 })
    expect(Number.isFinite(Number(nudged.primary.value))).toBe(true)
    expect(Number(nudged.primary.value)).toBeGreaterThan(0)
    expect(Number(nudged.primary.value)).not.toBeCloseTo(Number(at({}).primary.value), 2)
  })
})

describe('parts and series', () => {
  test('the split is exactly two parts and they sum to the total of payments', () => {
    const r = at({})
    expect(r.parts!.map((p) => p.label)).toEqual(['Depreciation', 'Rent charge'])
    expect(r.partsTotal!.label).toBe('Total of payments')
    expect(r.parts!.reduce((a, p) => a + p.value, 0)).toBeCloseTo(Number(r.partsTotal!.value), 6)
    expect(Number(r.partsTotal!.value)).toBeCloseTo(stat(r, 'Total of payments'), 10)
  })

  test('both series are drawable at the defaults', () => {
    const r = at({})
    expect(r.series).toHaveLength(2)
    expect(r.series!.map((s) => s.label)).toEqual(['Lease balance', 'Paid to date'])
    const [balance, paid] = r.series!
    expect(balance!.points[0]![1]).toBeCloseTo(36_000, 8)
    expect(balance!.points[balance!.points.length - 1]!).toEqual([36, 24_500])
    expect(paid!.points[0]!).toEqual([0, 0])
    expect(paid!.points[paid!.points.length - 1]![1]).toBeCloseTo(14_222.5, 6)
  })

  test('the counts never vary with input, and every point stays chartable', () => {
    const cases: Array<Partial<Input>> = [
      {},
      { moneyFactor: 0 },
      { moneyFactor: 0.01 },
      { term: '24' },
      { term: '48' },
      { downPayment: 0 },
      { residualValue: 500 },
      { capCost: 500_000, residualValue: 200_000, msrp: 500_000 },
      { capCost: 1000, residualValue: 500, downPayment: 0, msrp: 1000 },
    ]
    for (const patch of cases) {
      const r = at(patch)
      expect(r.parts, JSON.stringify(patch)).toHaveLength(2)
      expect(r.series, JSON.stringify(patch)).toHaveLength(2)
      for (const s of r.series!) {
        expect(s.points.length).toBeGreaterThan(1)
        expect(s.points.length).toBeLessThanOrEqual(45)
        s.points.forEach((p, i) => {
          expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true)
          if (i > 0) expect(p[0]).toBeGreaterThan(s.points[i - 1]![0])
        })
      }
    }
  })

  test('the balance curve and the paid curve cross at the same numbers as the headline', () => {
    const r = at({ term: '36' })
    const [balance, paid] = r.series!
    // Every point is the linear interpolation the closed form implies, so the
    // chart cannot drift from the figure printed above it.
    for (const [m, y] of balance!.points) expect(y).toBeCloseTo(36_000 - (11_500 / 36) * m, 6)
    for (const [m, y] of paid!.points)
      expect(y).toBeCloseTo(Number(r.primary.value) * m, 6)
  })
})

describe('a wide sweep of the input space', () => {
  // Explicit timeout: vitest defaults to 5 seconds and the whole suite runs in
  // parallel, so a sweep that is comfortable alone can time out under load.
  test(
    'every reachable result is finite, non-negative and an honest decomposition',
    () => {
      const capCosts = [1000, 8000, 20_000, 38_000, 90_000, 250_000, 500_000]
      const downs = [0, 250, 2000, 9000, 40_000]
      const residualFractions = [0.01, 0.2, 0.45, 0.58, 0.75, 0.95]
      const factors = [0, 0.00005, 0.00125, 0.00375, 0.007, 0.01]
      const terms = ['24', '30', '36', '42', '48']

      let ok = 0
      let refused = 0
      for (const capCost of capCosts)
        for (const downPayment of downs)
          for (const f of residualFractions)
            for (const moneyFactor of factors)
              for (const term of terms) {
                const residualValue = Math.round(capCost * f)
                let r: ReturnType<typeof compute>
                try {
                  r = at({ capCost, msrp: capCost, downPayment, residualValue, moneyFactor, term })
                } catch (err) {
                  // A refusal is an answer the theme renders as a message, not a
                  // shape to check. It must always be a CalcError naming a field.
                  expect(err).toBeInstanceOf(CalcError)
                  expect((err as CalcError).fieldId).toBeTruthy()
                  refused += 1
                  continue
                }
                ok += 1
                const payment = Number(r.primary.value)
                expect(Number.isFinite(payment)).toBe(true)
                expect(payment).toBeGreaterThan(0)
                expect(r.parts).toHaveLength(2)
                expect(r.series).toHaveLength(2)
                const sum = r.parts!.reduce((a, p) => a + p.value, 0)
                expect(sum).toBeCloseTo(Number(r.partsTotal!.value), 4)
                for (const p of r.parts!) expect(p.value).toBeGreaterThanOrEqual(0)
                expect(r.scaleValue!).toBeGreaterThanOrEqual(0)
                expect(r.scaleValue!).toBeLessThanOrEqual(100)
                for (const s of r.stats!) expect(Number.isFinite(Number(s.value))).toBe(true)
              }
      expect(ok).toBeGreaterThan(1000)
      expect(refused).toBeGreaterThan(0)
    },
    30_000,
  )
})

describe('definition conformance', () => {
  test('copy fits a search result', () => {
    expect(def.description.length).toBeGreaterThan(50)
    expect(def.description.length).toBeLessThanOrEqual(160)
    expect(def.seoTitle.length).toBeLessThanOrEqual(70)
    expect(def.intro.length).toBeGreaterThan(40)
    expect(def.disclaimer).toBe('financial')
  })

  test('at least three substantial FAQs', () => {
    expect(def.faqs.length).toBeGreaterThanOrEqual(3)
    for (const faq of def.faqs) {
      expect(faq.q.endsWith('?')).toBe(true)
      expect(faq.a.length).toBeGreaterThan(120)
    }
  })

  test('scale bands are contiguous and cover the default', () => {
    const { bands, min, max } = def.scale
    expect(min).toBeLessThan(max)
    bands.forEach((b, i) => {
      expect(b.from).toBeLessThan(b.to)
      if (i > 0) expect(b.from).toBe(bands[i - 1]!.to)
    })
    expect(bands[0]!.from).toBe(min)
    expect(bands[bands.length - 1]!.to).toBe(max)
  })

  test('every number default lands on min + n x step', () => {
    for (const field of fields) {
      if (field.kind !== 'number') continue
      const { min, step, default: d } = field
      if (min === undefined || step === undefined) continue
      const n = (d - min) / step
      expect(Math.abs(n - Math.round(n)), `${field.id} is off the slider grid`).toBeLessThan(1e-9)
      expect(d).toBeGreaterThanOrEqual(min)
      expect(d).toBeLessThanOrEqual(field.max!)
    }
  })

  test('related slugs point outward, never at itself', () => {
    expect(def.related.length).toBeGreaterThan(0)
    for (const slug of def.related) expect(slug).not.toBe(def.slug)
  })

  test('the definition carries no colour, class name or markup', () => {
    const serialized = JSON.stringify(def, (_k, v) => (typeof v === 'function' ? undefined : v))
    expect(serialized).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(serialized).not.toMatch(/\b(bg|text|border|rounded|shadow)-[a-z]+-\d{2,3}\b/)
    expect(serialized).not.toMatch(/<\/?[a-z][\s\S]*>/i)
  })

  test('every declared term option computes', () => {
    const termField = fields.find((f) => f.id === 'term')!
    expect(termField.kind).toBe('select')
    for (const opt of (termField as Extract<typeof termField, { kind: 'select' }>).options) {
      const r = at({ term: opt.value })
      expect(Number(r.primary.value)).toBeGreaterThan(0)
      expect(stat(r, 'Lease term')).toBe(Number(opt.value))
    }
  })
})

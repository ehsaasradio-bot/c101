import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { fields } from './fields'
import { bySlug } from '../../index'
import { CalcError } from '../../../lib/types'
import { defaultValues, toResultView } from '../../../lib/view'

type Input = Parameters<typeof compute>[0]
type Result = ReturnType<typeof compute>

const base: Input = {
  mode: 'pv',
  amount: 100_000,
  payment: 500,
  frequency: '12',
  annualRate: 5,
  years: 20,
}

const val = (r: Result) => Number(r.primary.value)
const stat = (r: Result, label: string) => Number(r.stats!.find((s) => s.label === label)!.value)
const run = (patch: Partial<Input>) => compute({ ...base, ...patch })

/** Relative comparison, so a $10,000,000 figure is not judged by an absolute cent. */
const relError = (a: number, b: number) => Math.abs(a - b) / Math.max(1, Math.abs(b))

describe('present value — anchored values', () => {
  test('the fixture matches the declared defaults', () => {
    expect(defaultValues(def)).toEqual(base)
  })

  test('the annuity factor reproduces the published $659.96 mortgage payment', () => {
    // A $100,000 loan at 5% over 20 years costs $659.96 a month in every
    // standard mortgage table. That payment is 100000 / a(n,i), so the annuity
    // factor this calculator uses must be 100000 / 659.9557... = 151.5253.
    const pvOfPayments = run({ amount: 0, payment: 659.9557392166588 })
    expect(val(pvOfPayments)).toBeCloseTo(100_000, 6)

    // The factor itself, read off a $1 payment.
    const factor = val(run({ amount: 0, payment: 1 }))
    expect(factor).toBeCloseTo(151.5253, 4)
  })

  test('$100,000 in 20 years at 5% monthly is worth $36,864.45 today', () => {
    // 100000 / (1 + 0.05/12)^240. Confirmed independently below by compounding
    // the answer forward one month at a time.
    const r = run({ payment: 0 })
    expect(val(r)).toBeCloseTo(36_864.452886, 6)

    let balance = val(r)
    for (let k = 0; k < 240; k++) balance *= 1 + 0.05 / 12
    expect(balance).toBeCloseTo(100_000, 6)
  })

  test('the headline at the defaults is $112,627.11', () => {
    const r = compute(base)
    expect(val(r)).toBeCloseTo(112_627.109423, 6)
    // = the discounted lump sum plus the discounted payment stream.
    expect(val(r)).toBeCloseTo(36_864.452886 + 75_762.656537, 6)
    expect(r.primary.label).toBe('Present value')
    expect(def.resultLabel).toBe(r.primary.label)
  })

  test('a $500/month pension for 20 years is worth $75,762.66 today', () => {
    const r = run({ amount: 0 })
    expect(val(r)).toBeCloseTo(75_762.656537, 6)
    // It pays out $120,000 in cash, so waiting costs $44,237.34 of value.
    expect(stat(r, 'Total cash flows, undiscounted')).toBeCloseTo(120_000, 9)
    expect(stat(r, 'Value lost to waiting')).toBeCloseTo(120_000 - 75_762.656537, 6)
  })
})

describe('the annuity closed form against a payment-by-payment sum', () => {
  /** PV of n payments, each discounted on its own. No closed form involved. */
  const sumDiscounted = (payment: number, i: number, n: number) => {
    let acc = 0
    for (let k = 1; k <= n; k++) acc += payment / Math.pow(1 + i, k)
    return acc
  }

  /** FV of n payments, each compounded from its own arrival to the horizon. */
  const sumCompounded = (payment: number, i: number, n: number) => {
    let acc = 0
    for (let k = 1; k <= n; k++) acc += payment * Math.pow(1 + i, n - k)
    return acc
  }

  test.each([
    ['monthly, 5%, 20yr', '12', 5, 20, 500],
    ['quarterly, 8%, 30yr', '4', 8, 30, 1200],
    ['annually, 3%, 10yr', '1', 3, 10, 2500],
    ['monthly, 0.25%, 50yr', '12', 0.25, 50, 100],
    ['annually, 25%, 1yr', '1', 25, 1, 900],
  ])('%s matches the term-by-term sum both ways', (_label, frequency, annualRate, years, payment) => {
    const m = Number(frequency)
    const i = annualRate / 100 / m
    const n = years * m
    const patch = { amount: 0, payment, frequency, annualRate, years }

    const pv = val(compute({ ...base, ...patch, mode: 'pv' }))
    const fv = val(compute({ ...base, ...patch, mode: 'fv' }))

    expect(relError(pv, sumDiscounted(payment, i, n))).toBeLessThan(1e-12)
    expect(relError(fv, sumCompounded(payment, i, n))).toBeLessThan(1e-12)
    // And the two sums are themselves one growth factor apart.
    expect(relError(fv, pv * Math.pow(1 + i, n))).toBeLessThan(1e-12)
  })
})

describe('the two modes are exact inverses', () => {
  const AMOUNTS = [1, 250, 7_500, 100_000, 2_400_000, 10_000_000]
  const RATES = [0, 0.25, 1, 3.5, 5, 12, 25]
  const YEARS = [1, 3, 7, 20, 41, 50]
  const FREQUENCIES = ['1', '4', '12']

  test(
    'PV(FV(x)) returns x across a full sweep of rate, horizon and frequency',
    () => {
      let checked = 0
      for (const amount of AMOUNTS)
        for (const annualRate of RATES)
          for (const years of YEARS)
            for (const frequency of FREQUENCIES) {
              const patch = { payment: 0, annualRate, years, frequency }
              const grown = val(compute({ ...base, ...patch, mode: 'fv', amount }))
              const back = val(compute({ ...base, ...patch, mode: 'pv', amount: grown }))
              expect(
                relError(back, amount),
                `PV(FV(${amount})) at ${annualRate}% for ${years}yr x${frequency} gave ${back}`,
              ).toBeLessThan(1e-12)
              checked++
            }
      expect(checked).toBe(
        AMOUNTS.length * RATES.length * YEARS.length * FREQUENCIES.length,
      )
    },
    30_000,
  )

  test(
    'the round trip survives the annuity too',
    () => {
      // Growing a package's present value forward must land on the future lump
      // sum plus the future value of the payment stream:
      //     (A/f + PMT(1 - 1/f)/i) x f  =  A + PMT(f - 1)/i
      // which is the annuity's own inverse stated in terms of compute's output.
      for (const amount of [0, 5_000, 100_000, 2_400_000])
        for (const payment of [0, 50, 500, 9_000])
          for (const annualRate of [0, 1, 5, 12, 25])
            for (const years of [1, 12, 50])
              for (const frequency of ['1', '4', '12']) {
                if (amount === 0 && payment === 0) continue
                const patch = { annualRate, years, frequency }
                const pv = val(compute({ ...base, ...patch, mode: 'pv', amount, payment }))
                const grownBack = val(
                  compute({ ...base, ...patch, mode: 'fv', amount: pv, payment: 0 }),
                )
                const fvOfPayments =
                  payment === 0
                    ? 0
                    : val(compute({ ...base, ...patch, mode: 'fv', amount: 0, payment }))
                expect(
                  relError(grownBack, amount + fvOfPayments),
                  `A=${amount} PMT=${payment} @${annualRate}% ${years}yr x${frequency}`,
                ).toBeLessThan(1e-11)
              }
    },
    30_000,
  )

  test('the discount factor and the growth factor are reciprocals', () => {
    for (const annualRate of [0, 2.5, 5, 25])
      for (const years of [1, 20, 50]) {
        const patch = { annualRate, years, payment: 0 }
        const down = stat(compute({ ...base, ...patch, mode: 'pv' }), 'What $1 at the end is worth now')
        const up = stat(compute({ ...base, ...patch, mode: 'fv' }), 'What $1 today becomes')
        expect(relError(down * up, 1)).toBeLessThan(1e-14)
      }
  })
})

describe('a 0% rate is the limit, not a division by zero', () => {
  test('both modes collapse to the plain sum of the cash flows', () => {
    const pv = run({ annualRate: 0 })
    const fv = run({ annualRate: 0, mode: 'fv' })
    // 100,000 plus 240 payments of 500.
    const nominal = 100_000 + 500 * 240
    expect(val(pv)).toBe(nominal)
    expect(val(fv)).toBe(nominal)
    expect(val(pv)).toBe(val(fv))
    expect(Number.isFinite(val(pv))).toBe(true)
  })

  test('the annuity limit is PMT x n rather than 0/0', () => {
    for (const frequency of ['1', '4', '12'])
      for (const years of [1, 7, 50]) {
        const n = Number(frequency) * years
        const r = compute({ ...base, annualRate: 0, frequency, years, amount: 0, payment: 500 })
        expect(val(r)).toBe(500 * n)
      }
  })

  test('nothing is lost to waiting and no factor degenerates', () => {
    const r = run({ annualRate: 0 })
    expect(stat(r, 'Value lost to waiting')).toBe(0)
    expect(stat(r, 'What $1 at the end is worth now')).toBe(1)
    expect(stat(r, 'Rate per period')).toBe(0)
    for (const step of r.steps!) {
      if ('rule' in step) continue
      expect(Number.isFinite(Number(step.value))).toBe(true)
    }
  })

  test('a rate just above zero is continuous with the limit', () => {
    const zero = val(run({ annualRate: 0, amount: 0 }))
    const tiny = val(run({ annualRate: 1e-7, amount: 0 }))
    expect(relError(tiny, zero)).toBeLessThan(1e-6)
    expect(tiny).toBeLessThan(zero)
  })
})

describe('monotonicity and direction', () => {
  test('a higher rate lowers a present value and raises a future value', () => {
    const rates = [0, 1, 3, 5, 9, 25]
    const pvs = rates.map((annualRate) => val(run({ annualRate })))
    const fvs = rates.map((annualRate) => val(run({ annualRate, mode: 'fv' })))
    for (let k = 1; k < rates.length; k++) {
      expect(pvs[k]!).toBeLessThan(pvs[k - 1]!)
      expect(fvs[k]!).toBeGreaterThan(fvs[k - 1]!)
    }
  })

  test('a present value never exceeds the cash it discounts, and a future value never falls short', () => {
    for (const annualRate of [0, 5, 25])
      for (const years of [1, 20, 50]) {
        const pv = run({ annualRate, years })
        const fv = run({ annualRate, years, mode: 'fv' })
        expect(val(pv)).toBeLessThanOrEqual(stat(pv, 'Total cash flows, undiscounted') + 1e-9)
        expect(val(fv)).toBeGreaterThanOrEqual(stat(fv, 'Total paid in') - 1e-9)
      }
  })
})

describe('parts and series', () => {
  test('parts decompose the headline exactly, at the defaults', () => {
    for (const mode of ['pv', 'fv'] as const) {
      const r = run({ mode })
      expect(r.parts!.length).toBe(2)
      const sum = r.parts!.reduce((acc, p) => acc + p.value, 0)
      expect(sum).toBeCloseTo(val(r), 6)
      for (const part of r.parts!) expect(part.value).toBeGreaterThanOrEqual(0)
    }
  })

  test('both curves are drawn at the defaults, in both modes', () => {
    for (const mode of ['pv', 'fv'] as const) {
      const r = run({ mode })
      expect(r.series!.length).toBe(2)
      for (const s of r.series!) expect(s.points.length).toBeGreaterThan(1)
    }
  })

  test('each curve ends exactly on the part it represents', () => {
    for (const mode of ['pv', 'fv'] as const) {
      const r = run({ mode })
      for (const s of r.series!) {
        const last = s.points[s.points.length - 1]!
        expect(last[0]).toBe(20)
        const part = r.parts!.find((p) => p.label === s.label)!
        expect(last[1]).toBeCloseTo(part.value, 6)
      }
    }
  })

  test('the discounted lump sum decays and the grown lump sum rises', () => {
    const down = run({ mode: 'pv' }).series!.find((s) => s.label === 'Lump sum, discounted')!
    expect(down.points[0]![1]).toBeCloseTo(100_000, 9)
    for (let k = 1; k < down.points.length; k++)
      expect(down.points[k]![1]).toBeLessThan(down.points[k - 1]![1])

    const up = run({ mode: 'fv' }).series!.find((s) => s.label === 'Lump sum, grown')!
    expect(up.points[0]![1]).toBeCloseTo(100_000, 9)
    for (let k = 1; k < up.points.length; k++)
      expect(up.points[k]![1]).toBeGreaterThan(up.points[k - 1]![1])
  })

  test('the payment curve starts at nothing and only accumulates', () => {
    for (const mode of ['pv', 'fv'] as const) {
      const line = run({ mode }).series!.find((s) => s.label.startsWith('Payments'))!
      expect(line.points[0]![1]).toBe(0)
      for (let k = 1; k < line.points.length; k++)
        expect(line.points[k]![1]).toBeGreaterThan(line.points[k - 1]![1])
    }
  })

  test('a 50-year horizon is thinned rather than shipping a point per year', () => {
    const r = run({ years: 50 })
    for (const s of r.series!) {
      expect(s.points.length).toBeLessThanOrEqual(45)
      expect(s.points[s.points.length - 1]![0]).toBe(50)
    }
  })

  test('a component that goes to zero drops out rather than lingering', () => {
    const noLump = run({ amount: 0 })
    expect(noLump.parts!.map((p) => p.label)).toEqual(['Payments, discounted'])
    expect(noLump.series!.map((s) => s.label)).toEqual(['Payments, discounted'])

    const noPayments = run({ payment: 0 })
    expect(noPayments.parts!.map((p) => p.label)).toEqual(['Lump sum, discounted'])
    expect(noPayments.series!.map((s) => s.label)).toEqual(['Lump sum, discounted'])
  })
})

/**
 * The registry-wide conformance suite sweeps every field across its range. This
 * repeats that sweep locally so the same invariants hold here on their own.
 */
describe('across the whole input space', () => {
  const samples = (): Input[] => {
    const out: Input[] = [{ ...base }]
    for (const field of fields) {
      const values: unknown[] =
        field.kind === 'select'
          ? field.options.map((o) => o.value)
          : [field.min, field.max, field.default, 0, 1, 2, (field.min! + field.max!) / 2].filter(
              (x): x is number =>
                typeof x === 'number' && x >= (field.min ?? -Infinity) && x <= (field.max ?? Infinity),
            )
      for (const value of values) out.push({ ...base, [field.id]: value } as Input)
    }
    return out
  }

  test('every reachable result is finite, decomposed and drawable', () => {
    let answered = 0
    for (const input of samples()) {
      let r: Result
      try {
        r = compute(input)
      } catch (err) {
        // A refusal is an answer the theme never draws, so there is no shape.
        expect(err).toBeInstanceOf(CalcError)
        expect((err as CalcError).fieldId).toBeDefined()
        continue
      }
      answered++
      const how = JSON.stringify(input)

      expect(Number.isFinite(val(r)), how).toBe(true)
      expect(val(r), how).toBeGreaterThanOrEqual(0)

      const sum = r.parts!.reduce((acc, p) => acc + p.value, 0)
      expect(sum, how).toBeCloseTo(val(r), 4)
      expect(r.parts!.length, how).toBeGreaterThan(0)
      for (const part of r.parts!) expect(part.value, how).toBeGreaterThanOrEqual(0)

      expect(r.series!.length, how).toBeGreaterThan(0)
      for (const s of r.series!) {
        expect(s.points.length, how).toBeGreaterThan(1)
        s.points.forEach((p, k) => {
          expect(Number.isFinite(p[0]) && Number.isFinite(p[1]), how).toBe(true)
          if (k > 0) expect(p[0], how).toBeGreaterThan(s.points[k - 1]![0])
        })
      }

      // No `scale` is declared: present value and future value pull in opposite
      // directions, so one band set cannot label both honestly.
      const view = toResultView(r)
      expect(view.primary.text, how).not.toContain('NaN')
      for (const s of view.stats) expect(s.text, how).not.toContain('NaN')
    }
    expect(answered).toBeGreaterThan(20)
  })

  test('every declared bound is a value compute accepts', () => {
    // The form draws each number field as a slider spanning min..max, so both
    // ends are one drag away and must not be values the calculator refuses.
    for (const field of fields) {
      if (field.kind !== 'number') continue
      for (const bound of [field.min, field.max]) {
        if (bound === undefined) continue
        expect(() => compute({ ...base, [field.id]: bound } as Input), `${field.id}=${bound}`).not.toThrow()
      }
    }
  })

  test('every number default lands on min + n x step', () => {
    for (const field of fields) {
      if (field.kind !== 'number') continue
      const steps = (field.default - field.min!) / field.step!
      expect(Math.abs(steps - Math.round(steps)), field.id).toBeLessThan(1e-9)
    }
  })
})

describe('input the calculator must refuse', () => {
  test.each([
    ['a negative lump sum', { amount: -1 }, 'amount'],
    ['a negative payment', { payment: -50 }, 'payment'],
    ['a negative rate', { annualRate: -0.25 }, 'annualRate'],
    ['a zero horizon', { years: 0 }, 'years'],
    ['a negative horizon', { years: -5 }, 'years'],
    ['no money at all', { amount: 0, payment: 0 }, 'amount'],
    ['an unknown mode', { mode: 'sideways' }, 'mode'],
    ['an unknown frequency', { frequency: 'fortnightly' }, 'frequency'],
  ])('rejects %s against the offending field', (_label, patch, fieldId) => {
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

  test.each(['amount', 'payment', 'annualRate', 'years'])(
    'never returns NaN when %s is unparseable',
    (fieldId) => {
      let thrown: unknown
      try {
        compute({ ...base, [fieldId]: Number.NaN } as Input)
      } catch (err) {
        thrown = err
      }
      expect(thrown).toBeInstanceOf(CalcError)
      expect((thrown as CalcError).fieldId).toBe(fieldId)
      // A magnitude test alone would let NaN through, so Infinity is checked too.
      expect(() => compute({ ...base, [fieldId]: Infinity } as Input)).toThrow(CalcError)
    },
  )
})

describe('the page contract', () => {
  test('the first number field is the one the end-to-end nudge moves', () => {
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('amount')

    // tests/calculators.spec.ts sets it to 1.1x its default and expects a
    // different, valid result — in the DEFAULT mode, which is present value.
    const nudged = first.default * 1.1
    expect(nudged).toBeLessThanOrEqual(first.max!)
    expect(defaultValues(def).mode).toBe('pv')

    const before = val(compute(base))
    const after = val(run({ amount: nudged }))
    expect(after).toBeGreaterThan(before)
    expect(after - before).toBeGreaterThan(1)
    // and in the other mode too, so the nudge is never a no-op.
    expect(val(run({ mode: 'fv', amount: nudged }))).toBeGreaterThan(val(run({ mode: 'fv' })))
  })

  test('copy fits the search result and every FAQ is answered', () => {
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

  test('every related slug already exists in the registry', () => {
    expect(def.related.length).toBeGreaterThan(0)
    for (const slug of def.related) {
      expect(bySlug.has(slug), `${def.slug} -> ${slug}`).toBe(true)
      expect(slug).not.toBe(def.slug)
    }
  })

  test('the definition holds no colour, class name or markup', () => {
    const serialized = JSON.stringify(def, (_k, v) => (typeof v === 'function' ? undefined : v))
    expect(serialized).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(serialized).not.toMatch(/\b(bg|text|border|rounded|shadow)-[a-z]+-\d{2,3}\b/)
    expect(serialized).not.toMatch(/<\/?[a-z][\s\S]*>/i)
  })
})

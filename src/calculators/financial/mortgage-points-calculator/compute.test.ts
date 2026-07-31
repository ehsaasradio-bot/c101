import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'
import { toResultView } from '../../../lib/view'
import type { CalcResult, Quantity } from '../../../lib/types'

/**
 * The defaults, restated here rather than read off `fields` so that a change to
 * a default breaks these tests loudly instead of quietly re-deriving itself into
 * agreement. `Partial` overrides are typed loosely on purpose: `as const` on the
 * literal would pin `points` to the literal 1 and reject `{ points: 2 }`.
 */
const base: {
  baseRate: number
  reductionPerPoint: number
  points: number
  loanAmount: number
  termYears: number
  keepYears: number
} = {
  baseRate: 6.5,
  reductionPerPoint: 0.25,
  points: 1,
  loanAmount: 400_000,
  termYears: 30,
  keepYears: 9,
}

const at = (over: Partial<typeof base> = {}) => compute({ ...base, ...over })

const stat = (r: CalcResult, label: string): Quantity => {
  const found = r.stats?.find((s) => s.label === label)
  if (!found) throw new Error(`no stat "${label}" — labels: ${r.stats?.map((s) => s.label).join(' | ')}`)
  return found
}
const statValue = (r: CalcResult, label: string) => Number(stat(r, label).value)

/**
 * The annuity formula, written out again independently of compute.ts:
 *
 *   M = P · i / (1 − (1+i)^−n)
 *
 * Used to DERIVE the expectations below rather than to invent them.
 */
const levelPayment = (P: number, monthlyRate: number, n: number) =>
  monthlyRate === 0 ? P / n : (P * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n))

/**
 * The second, independent confirmation: walk the loan a month at a time, adding
 * interest and subtracting the payment. It shares no algebra with the closed
 * form — if the annuity formula above were wrong, this balance would not land on
 * zero at the final payment.
 */
function amortize(P: number, annualRate: number, n: number, payment: number) {
  const i = annualRate / 1200
  let balance = P
  let interest = 0
  for (let m = 0; m < n; m += 1) {
    const charge = balance * i
    interest += charge
    balance = balance + charge - payment
  }
  return { finalBalance: balance, interest }
}

describe('mortgage-points-calculator', () => {
  // ── The headline, derived then confirmed a second way ────────────────────

  test('break-even at the defaults comes from the annuity formula, and the amortization agrees', () => {
    const n = 360
    const paymentPar = levelPayment(400_000, 6.5 / 1200, n)
    const paymentBought = levelPayment(400_000, 6.25 / 1200, n)

    // Confirmation #1: both payments amortize their loan to exactly zero over
    // 360 months. A payment even a cent out leaves hundreds of dollars behind.
    const par = amortize(400_000, 6.5, n, paymentPar)
    const bought = amortize(400_000, 6.25, n, paymentBought)
    expect(par.finalBalance).toBeCloseTo(0, 6)
    expect(bought.finalBalance).toBeCloseTo(0, 6)

    // Confirmation #2: interest summed month by month equals total paid less
    // principal, which is how compute derives it.
    expect(par.interest).toBeCloseTo(paymentPar * n - 400_000, 6)
    expect(bought.interest).toBeCloseTo(paymentBought * n - 400_000, 6)

    const result = at()
    expect(statValue(result, 'Payment with no points')).toBeCloseTo(paymentPar, 9)
    expect(statValue(result, 'Payment with points')).toBeCloseTo(paymentBought, 9)

    const saving = paymentPar - paymentBought
    expect(statValue(result, 'Monthly saving')).toBeCloseTo(saving, 9)
    expect(statValue(result, 'Cost of the points, paid at closing')).toBe(4_000)

    // 4000 / 65.403... = 61.159 payments, so you are ahead from month 62.
    expect(4_000 / saving).toBeCloseTo(61.159, 3)
    expect(result.primary.value).toBe(62)

    // And the advertised lifetime figure, cross-checked against the loop.
    expect(statValue(result, 'Lifetime interest saved')).toBeCloseTo(par.interest - bought.interest, 6)
    expect(statValue(result, 'Lifetime interest saved')).toBeCloseTo(saving * n, 6)
  })

  // ── The identity that anchors the whole thing ────────────────────────────

  test('zero points is exactly the base loan — same payment, same interest, nothing to recover', () => {
    const none = at({ points: 0 })
    const paymentPar = levelPayment(400_000, 6.5 / 1200, 360)

    expect(statValue(none, 'Payment with points')).toBe(statValue(none, 'Payment with no points'))
    expect(statValue(none, 'Payment with points')).toBeCloseTo(paymentPar, 9)
    expect(statValue(none, 'Rate you actually pay')).toBe(6.5)
    expect(statValue(none, 'Cost of the points, paid at closing')).toBe(0)
    expect(statValue(none, 'Monthly saving')).toBe(0)
    expect(statValue(none, 'Lifetime interest saved')).toBe(0)
    // Nothing was spent, so nothing has to be earned back.
    expect(none.primary.value).toBe(0)
    // The points slice is dropped rather than drawn as an invisible arc.
    expect(none.parts?.map((p) => p.label)).toEqual(['Principal', 'Interest at the bought-down rate'])
  })

  // ── The scaling law arithmetic demands ───────────────────────────────────

  test('doubling the point cost at an unchanged rate cut doubles the break-even', () => {
    // Two points at half the cut per point buy the SAME rate — 6.25% either way
    // — for twice the money. The monthly saving is therefore identical and the
    // break-even must be exactly twice as long. Anything else means the cost or
    // the saving is not entering the ratio the way it claims to.
    const one = at({ points: 1, reductionPerPoint: 0.25 })
    const two = at({ points: 2, reductionPerPoint: 0.125 })

    expect(statValue(two, 'Rate you actually pay')).toBeCloseTo(statValue(one, 'Rate you actually pay'), 12)
    expect(statValue(two, 'Monthly saving')).toBeCloseTo(statValue(one, 'Monthly saving'), 12)
    expect(statValue(two, 'Cost of the points, paid at closing')).toBe(
      2 * statValue(one, 'Cost of the points, paid at closing'),
    )

    // 61.159 raw doubles to 122.318, which rounds up to 123 rather than to
    // 2 x 62 = 124: the ceiling is applied once, at the end, as it should be.
    expect(Number(one.primary.value)).toBe(62)
    expect(Number(two.primary.value)).toBe(123)
    expect(122 / 2).toBeLessThan(Number(one.primary.value))
  })

  test('the break-even is independent of loan size, and the cost scales with it', () => {
    // Cost and saving are both linear in the principal, so the ratio is not —
    // which is exactly why `loanAmount` is not the first field.
    const small = at({ loanAmount: 200_000 })
    const large = at({ loanAmount: 800_000 })
    expect(small.primary.value).toBe(large.primary.value)
    expect(statValue(large, 'Cost of the points, paid at closing')).toBe(
      4 * statValue(small, 'Cost of the points, paid at closing'),
    )
    expect(statValue(large, 'Monthly saving')).toBeCloseTo(4 * statValue(small, 'Monthly saving'), 9)
  })

  // ── The keep-the-loan question, which is the point of the page ───────────

  test('the verdict follows how long you keep the loan, not the break-even alone', () => {
    const breakEven = Number(at().primary.value)
    expect(breakEven).toBe(62)

    const mover = at({ keepYears: 3 })
    const stayer = at({ keepYears: 20 })

    // Identical break-even — the deal has not changed, only the reader has.
    expect(mover.primary.value).toBe(breakEven)
    expect(stayer.primary.value).toBe(breakEven)

    // But the meter, and the money, resolve opposite ways.
    expect(mover.scaleValue).toBe(36 - breakEven)
    // 240 − 62 = 178 months of margin, clamped to the top of the meter. The
    // clamp is load-bearing: resolveBand falls back to the LAST band when
    // nothing matches, so an unclamped value past the span would still land on
    // "excellent" here but a value past the BOTTOM would too — see the extremes
    // test below.
    expect(stayer.scaleValue).toBe(def.scale!.max)
    expect(statValue(mover, 'Net position if you leave after 3 years')).toBeLessThan(0)
    expect(statValue(stayer, 'Net position if you leave after 20 years')).toBeGreaterThan(0)
  })

  test('the net position at the horizon counts the smaller balance the cheaper loan leaves', () => {
    const n = 360
    const keep = 108
    const paymentPar = levelPayment(400_000, 6.5 / 1200, n)
    const paymentBought = levelPayment(400_000, 6.25 / 1200, n)

    // Balances confirmed by simulation rather than by the closed form compute
    // uses, so the two derivations are genuinely independent.
    const simulate = (rate: number, payment: number) => {
      let balance = 400_000
      for (let m = 0; m < keep; m += 1) balance = balance * (1 + rate / 1200) - payment
      return balance
    }
    const edge = simulate(6.5, paymentPar) - simulate(6.25, paymentBought)
    expect(edge).toBeGreaterThan(0)

    const expected = (paymentPar - paymentBought) * keep + edge - 4_000
    expect(statValue(at(), 'Net position if you leave after 9 years')).toBeCloseTo(expected, 6)
  })

  test('holding to term makes the net position equal the lifetime interest saved less the cost', () => {
    const full = at({ keepYears: 30 })
    expect(statValue(full, 'Net position if you leave after the full term')).toBeCloseTo(
      statValue(full, 'Lifetime interest saved') - 4_000,
      6,
    )
    // A horizon longer than the loan is clamped to the loan, not rejected.
    const beyond = at({ keepYears: 40 })
    expect(statValue(beyond, 'Net position if you leave after the full term')).toBeCloseTo(
      statValue(full, 'Net position if you leave after the full term'),
      9,
    )
  })

  // ── The chart and the donut agree with the headline ──────────────────────

  test('the recovery curve crosses zero at the break-even month and ends on the lifetime figure', () => {
    const r = at()
    const series = r.series![0]!
    const points = series.points

    expect(points[0]![1]).toBeCloseTo(-4_000, 9)
    points.forEach((p, i) => {
      expect(Number.isFinite(p[0])).toBe(true)
      expect(Number.isFinite(p[1])).toBe(true)
      if (i > 0) expect(p[0]).toBeGreaterThan(points[i - 1]![0])
    })

    const saving = statValue(r, 'Monthly saving')
    const crossing = 4_000 / saving
    expect(Math.ceil(crossing)).toBe(Number(r.primary.value))

    const last = points[points.length - 1]!
    expect(last[0]).toBe(360)
    expect(last[1]).toBeCloseTo(statValue(r, 'Lifetime interest saved') - 4_000, 6)
  })

  test('parts sum exactly to the total in the middle of the donut', () => {
    for (const points of [0, 0.5, 1, 2, 4]) {
      const r = at({ points })
      const sum = r.parts!.reduce((acc, p) => acc + p.value, 0)
      expect(sum).toBeCloseTo(Number(r.partsTotal!.value), 4)
      for (const p of r.parts!) expect(p.value).toBeGreaterThan(0)
    }
  })

  // ── Guards ───────────────────────────────────────────────────────────────

  test('never returns NaN for unparseable input', () => {
    for (const id of Object.keys(base) as Array<keyof typeof base>) {
      expect(() => at({ [id]: Number.NaN }), id).toThrow(CalcError)
    }
  })

  test('rejects invalid input against the offending field', () => {
    const cases: Array<[Partial<typeof base>, string]> = [
      [{ points: -1 }, 'points'],
      [{ points: 9 }, 'points'],
      [{ loanAmount: 0 }, 'loanAmount'],
      [{ baseRate: -0.1 }, 'baseRate'],
      [{ baseRate: 41 }, 'baseRate'],
      [{ reductionPerPoint: -0.1 }, 'reductionPerPoint'],
      [{ termYears: 0 }, 'termYears'],
      [{ termYears: 51 }, 'termYears'],
      [{ keepYears: -1 }, 'keepYears'],
      // A cut deep enough to drive the rate paid below zero is a contradiction,
      // not an answer, and it names the field you can actually change.
      [{ baseRate: 3, reductionPerPoint: 1, points: 4 }, 'reductionPerPoint'],
    ]
    for (const [over, fieldId] of cases) {
      let thrown: unknown
      try {
        at(over)
      } catch (err) {
        thrown = err
      }
      expect(thrown, JSON.stringify(over)).toBeInstanceOf(CalcError)
      expect((thrown as CalcError).fieldId, JSON.stringify(over)).toBe(fieldId)
    }
  })

  test('a rate cut of zero never repays anything, and says so rather than dividing by it', () => {
    const r = at({ reductionPerPoint: 0 })
    expect(statValue(r, 'Monthly saving')).toBe(0)
    expect(typeof r.primary.value).toBe('string')
    expect(r.scaleValue).toBe(def.scale!.min)
  })

  // ── The meter cannot resolve the wrong way round ─────────────────────────

  test('scaleValue stays inside the declared scale at both extremes', () => {
    // compute.ts cannot import index.ts (index → compute → index), so the two
    // copies of the span are asserted against each other here instead.
    const worst = at({ keepYears: 1, points: 4, reductionPerPoint: 0.05 })
    const bestish = at({ keepYears: 40, points: 0.125, reductionPerPoint: 1 })
    for (const r of [worst, bestish, at()]) {
      expect(r.scaleValue!).toBeGreaterThanOrEqual(def.scale!.min)
      expect(r.scaleValue!).toBeLessThanOrEqual(def.scale!.max)
    }
    expect(worst.scaleValue!).toBeLessThan(0)
    expect(bestish.scaleValue!).toBeGreaterThan(0)
  })

  // ── A sweep, with an explicit timeout: vitest's default 5s is not enough
  //    for this under a loaded parallel run, and a test that only fails in CI
  //    teaches people to ignore red.
  test(
    'every value a slider can reach produces a finite, honest result',
    () => {
      const numberFields = fields.filter((f) => f.kind === 'number')
      for (const field of numberFields) {
        const { min, max, step } = field
        const stride = Math.max(step ?? 1, (max! - min!) / 60)
        for (let value = min!; value <= max! + 1e-9; value += stride) {
          const over = { [field.id]: Number(value.toFixed(6)) } as Partial<typeof base>
          let r: CalcResult
          try {
            r = at(over)
          } catch (err) {
            // A refusal is an answer too, as long as it names a field.
            expect(err, `${field.id}=${value}`).toBeInstanceOf(CalcError)
            expect((err as CalcError).fieldId, `${field.id}=${value}`).toBeTruthy()
            continue
          }
          const primary = r.primary.value
          expect(typeof primary === 'string' || Number.isFinite(primary), `${field.id}=${value}`).toBe(true)
          expect(Number.isFinite(r.scaleValue!), `${field.id}=${value}`).toBe(true)
          expect(r.scaleValue!).toBeGreaterThanOrEqual(def.scale!.min)
          expect(r.scaleValue!).toBeLessThanOrEqual(def.scale!.max)
          for (const s of r.stats ?? []) {
            expect(Number.isFinite(Number(s.value)), `${field.id}=${value} → ${s.label}`).toBe(true)
          }
          const sum = r.parts!.reduce((acc, p) => acc + p.value, 0)
          expect(sum, `${field.id}=${value}`).toBeCloseTo(Number(r.partsTotal!.value), 4)
          for (const p of r.parts!) expect(p.value, `${field.id}=${value}`).toBeGreaterThanOrEqual(0)
          const pts = r.series![0]!.points
          expect(pts.length).toBeGreaterThan(1)
          pts.forEach((p, i) => {
            expect(Number.isFinite(p[1]), `${field.id}=${value}`).toBe(true)
            if (i > 0) expect(p[0]).toBeGreaterThan(pts[i - 1]![0])
          })
        }
      }
    },
    30_000,
  )

  // ── Copy, checked here as well as in the registry suite ──────────────────

  test('copy fits a search result', () => {
    expect(def.description.length).toBeGreaterThanOrEqual(51)
    expect(def.description.length).toBeLessThanOrEqual(160)
    expect(def.seoTitle.length).toBeLessThanOrEqual(70)
    expect(def.faqs.length).toBeGreaterThanOrEqual(3)
    for (const faq of def.faqs) {
      expect(faq.q.endsWith('?')).toBe(true)
      expect(faq.a.length).toBeGreaterThan(120)
    }
  })

  // The same render the page does at build time. Worth doing here because the
  // primary switches between a number and a string, and a duration of 0 months
  // is a shape the formatter has to survive.
  test('renders to a complete view, with a band and no NaN anywhere', () => {
    for (const over of [{}, { points: 0 }, { reductionPerPoint: 0 }, { keepYears: 1 }] as Array<
      Partial<typeof base>
    >) {
      const view = toResultView(at(over), def.scale)
      expect(view.primary.text, JSON.stringify(over)).not.toBe('')
      expect(view.primary.text, JSON.stringify(over)).not.toContain('NaN')
      for (const s of view.stats) expect(s.text, `${JSON.stringify(over)} → ${s.label}`).not.toContain('NaN')
      for (const s of view.steps) if ('text' in s) expect(s.text).not.toContain('NaN')
      expect(view.band, JSON.stringify(over)).toBeDefined()
      expect(view.scalePercent!).toBeGreaterThanOrEqual(0)
      expect(view.scalePercent!).toBeLessThanOrEqual(100)
    }

    const defaults = toResultView(at(), def.scale)
    expect(defaults.band).toBe('good')
    expect(defaults.parts).toHaveLength(3)
    expect(defaults.series).toHaveLength(1)
  })

  test('every number default lands on min + n x step', () => {
    for (const field of fields) {
      if (field.kind !== 'number') continue
      const n = (field.default - field.min!) / field.step!
      expect(Math.abs(n - Math.round(n)), field.id).toBeLessThan(1e-9)
    }
  })

  test('every declared bound is one compute accepts', () => {
    for (const field of fields) {
      if (field.kind !== 'number') continue
      for (const bound of [field.min!, field.max!]) {
        expect(() => at({ [field.id]: bound } as Partial<typeof base>), `${field.id}=${bound}`).not.toThrow()
      }
    }
  })
})

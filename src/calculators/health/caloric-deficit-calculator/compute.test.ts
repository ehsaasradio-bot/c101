import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { fields } from './fields'
import { calculators } from '../../index'
import { defaultValues, toResultView } from '../../../lib/view'
import { CalcError } from '../../../lib/types'
import type { Field, NumberField } from '../../../lib/types'

type Input = Parameters<typeof compute>[0]

const base: Input = {
  units: 'metric',
  sex: 'male',
  maintenance: 2500,
  currentWeight: 85,
  targetWeight: 75,
  weeklyRate: 0.4,
  // A fixed date, not the shipped 'today' default, so the expectations below
  // do not change at midnight.
  startDate: '2026-01-01',
}

const LB_PER_KG = 2.2046226218487757
const KCAL_PER_KG = 3500 * LB_PER_KG // 7716.179176470715
const KCAL_PER_DAY_PER_KG = 10 * LB_PER_KG // 22.046226218487757

const stat = (r: ReturnType<typeof compute>, label: string) =>
  r.stats!.find((s) => s.label === label)!
const num = (r: ReturnType<typeof compute>, label: string) => Number(stat(r, label).value)

/**
 * An independent check on the closed form: integrate
 *
 *     dW/dt = (intake - (maintenance + c * (W - W0))) / E
 *
 * forward in small steps and report the day the goal is crossed. This shares no
 * algebra with `compute` — it only shares the two published constants — so it
 * catches a mis-derived exponential rather than confirming one.
 */
function simulateDays(
  maintenance: number,
  intake: number,
  startWeight: number,
  goalWeight: number,
  kcalPerUnit: number,
  slope: number,
): number {
  const dt = 0.001
  const losing = goalWeight < startWeight
  let w = startWeight
  let t = 0
  while (t < 20_000) {
    const maint = maintenance + slope * (w - startWeight)
    w += ((intake - maint) / kcalPerUnit) * dt
    t += dt
    if (losing ? w <= goalWeight : w >= goalWeight) return t
  }
  return Number.POSITIVE_INFINITY
}

describe('caloric-deficit', () => {
  describe('the default plan', () => {
    const r = compute(base)

    test('the headline is 2,059 kcal a day, derived and confirmed a second way', () => {
      // Derivation. 0.4 kg/week x 7,716.179 kcal/kg = 3,086.47 kcal/week, which
      // is 440.9245 kcal/day. 2,500 - 440.9245 = 2,059.0755.
      const deficit = (0.4 * KCAL_PER_KG) / 7
      expect(deficit).toBeCloseTo(440.92452436975, 8)
      expect(Number(r.primary.value)).toBeCloseTo(2500 - deficit, 10)
      expect(Number(r.primary.value)).toBeCloseTo(2059.0754756302, 8)

      // Confirmation, routed entirely through pounds so it never touches the
      // kcal-per-kg constant above: 0.4 kg is 0.8818490 lb, at Wishnofsky's
      // 3,500 kcal/lb that is 3,086.47 kcal a week, or 440.9245 a day.
      const viaPounds = (0.4 * LB_PER_KG * 3500) / 7
      expect(viaPounds).toBeCloseTo(deficit, 10)
      expect(2500 - viaPounds).toBeCloseTo(2059.0754756302, 8)
    })

    test('the deficit and the planned rate match the request', () => {
      expect(num(r, 'Daily deficit')).toBeCloseTo(440.9245243698, 8)
      expect(num(r, 'Planned weekly rate')).toBeCloseTo(0.4, 10)
      expect(num(r, 'Weight to lose')).toBeCloseTo(10, 10)
    })

    test('the 3,500 rule puts the goal at exactly 175 days', () => {
      // 10 kg at 0.4 kg a week is 25 weeks. Independently: 10 x 7,716.179
      // kcal = 77,161.79 kcal of deficit, at 440.9245 a day = 175.0 days.
      expect(num(r, 'Time to goal (3,500 rule)')).toBeCloseTo(175, 6)
      expect((10 * KCAL_PER_KG) / 440.92452436975516).toBeCloseTo(175, 6)
      // 2026-01-01 plus 175 days.
      expect(stat(r, 'Goal date (3,500 rule)').value).toBe('25 June 2026')
    })

    test('with adaptation the same plan takes 350 x ln 2 days', () => {
      // The plateau is gap / slope = 440.9245 / 22.0462 = 20 kg, so the 10 kg
      // goal is exactly half of it and the exponential gives -350 x ln(0.5).
      expect(num(r, 'Plateau at this intake')).toBeCloseTo(65, 10)
      const expected = 350 * Math.LN2
      expect(expected).toBeCloseTo(242.6015, 4)
      expect(num(r, 'Time to goal (with adaptation)')).toBeCloseTo(expected, 6)
      expect(stat(r, 'Goal date (with adaptation)').value).toBe('1 September 2026')
    })

    test('a step-by-step simulation reaches the same adaptive date', () => {
      const days = simulateDays(2500, 2059.0754756302448, 85, 75, KCAL_PER_KG, KCAL_PER_DAY_PER_KG)
      // The Euler step is 0.001 days, so agreement to a hundredth of a day is
      // as much as the integrator can offer.
      expect(days).toBeCloseTo(350 * Math.LN2, 2)
    })

    test('the average realised rate is well below the requested one', () => {
      expect(num(r, 'Average weekly rate to that date')).toBeCloseTo(
        (10 * 7) / (350 * Math.LN2),
        8,
      )
      expect(num(r, 'Average weekly rate to that date')).toBeCloseTo(0.2885, 4)
      expect(num(r, 'Average weekly rate to that date')).toBeLessThan(0.4)
    })

    test('the scale reads the deficit as a share of maintenance', () => {
      expect(r.scaleValue).toBeCloseTo((440.92452436975516 / 2500) * 100, 8)
      expect(r.scaleValue).toBeCloseTo(17.637, 3)
    })
  })

  describe('the divergence between the two projections', () => {
    test('adaptation always arrives later, never earlier', () => {
      const r = compute(base)
      const naive = num(r, 'Time to goal (3,500 rule)')
      const adaptive = num(r, 'Time to goal (with adaptation)')
      expect(adaptive).toBeGreaterThan(naive)
      // 242.6 against 175 — the adaptive projection is 38.6% longer.
      expect(adaptive / naive).toBeCloseTo(2 * Math.LN2, 6)
      expect(adaptive - naive).toBeCloseTo(67.6, 1)
    })

    test('on the date the 3,500 rule promises the goal, 2.1 kg is still to go', () => {
      const r = compute(base)
      // 85 - 20 x (1 - e^-0.5) = 77.1306 kg, against a 75 kg goal.
      const expected = 85 - 20 * (1 - Math.exp(-175 / 350)) - 75
      expect(expected).toBeCloseTo(2.1306, 4)
      expect(num(r, 'Still to go on the 3,500-rule date')).toBeCloseTo(expected, 8)
    })

    test('the gap widens with distance, as the literature describes', () => {
      // Same plan, three goals of increasing size. The ratio of adaptive to
      // naive time grows monotonically: the rules agree on the first kilogram
      // and diverge without limit as the goal approaches the plateau.
      const ratios = [78, 80, 82, 84].map((target) => {
        const r = compute({ ...base, targetWeight: target })
        return num(r, 'Time to goal (with adaptation)') / num(r, 'Time to goal (3,500 rule)')
      })
      // Nearest goal first, so ratios ascend as the goal recedes.
      const ascending = [...ratios].reverse()
      for (let i = 1; i < ascending.length; i++)
        expect(ascending[i]!).toBeGreaterThan(ascending[i - 1]!)
      // One kilogram out, the two are within 3% of each other.
      expect(ascending[0]!).toBeLessThan(1.03)
    })

    test('a goal past the plateau is unreachable, and says so', () => {
      // 0.4 kg a week plateaus after 20 kg; 85 to 60 asks for 25.
      const r = compute({ ...base, targetWeight: 60 })
      expect(num(r, 'Plateau at this intake')).toBeCloseTo(65, 10)
      expect(stat(r, 'Goal date (with adaptation)').value).toBe('Not reached at this intake')
      expect(num(r, 'Time to goal (with adaptation)')).toBe(Number.POSITIVE_INFINITY)
      // The 3,500 rule cheerfully names a date for it anyway. That is the point.
      expect(num(r, 'Time to goal (3,500 rule)')).toBeCloseTo(437.5, 6)
      expect(r.notes!.some((n) => n.includes('never reaches your goal'))).toBe(true)
    })

    test('the plateau is 50 times the weekly rate, in either unit', () => {
      for (const rate of [0.05, 0.2, 0.4, 0.9]) {
        const r = compute({ ...base, weeklyRate: rate })
        expect(85 - num(r, 'Plateau at this intake')).toBeCloseTo(50 * rate, 8)
      }
      for (const rate of [0.1, 1, 1.9]) {
        const r = compute({
          ...base,
          units: 'imperial',
          currentWeight: 187.393,
          targetWeight: 165.347,
          weeklyRate: rate,
        })
        expect(187.393 - num(r, 'Plateau at this intake')).toBeCloseTo(50 * rate, 8)
      }
    })

    test('both series are always drawn, with the adaptive one above the naive', () => {
      const r = compute(base)
      expect(r.series).toHaveLength(2)
      const [naive, adaptive] = r.series!
      expect(naive!.points).toHaveLength(41)
      expect(adaptive!.points).toHaveLength(41)
      // Strictly increasing x, which the chart requires.
      for (let i = 1; i < naive!.points.length; i++)
        expect(naive!.points[i]![0]).toBeGreaterThan(naive!.points[i - 1]![0])
      // Losing weight, so "higher" means "less lost". Every interior point of
      // the adaptive curve sits above the naive line.
      for (let i = 1; i < 41; i++)
        expect(adaptive!.points[i]![1]).toBeGreaterThan(naive!.points[i]![1] - 1e-9)
      // Neither line runs past the goal.
      for (const s of r.series!) for (const [, w] of s.points) expect(w).toBeGreaterThanOrEqual(75)
      // Both start at the current weight.
      expect(naive!.points[0]).toEqual([0, 85])
      expect(adaptive!.points[0]).toEqual([0, 85])
    })
  })

  describe('the safe-intake floor', () => {
    test('a plan below 1,500 kcal for a man is capped, not printed', () => {
      // 0.9 kg a week off 1,800 kcal maintenance would mean 808 kcal a day.
      const r = compute({ ...base, maintenance: 1800, weeklyRate: 0.9 })
      expect(Number(r.primary.value)).toBe(1500)
      expect(num(r, 'Daily deficit')).toBe(300)
      expect(num(r, 'Planned weekly rate')).toBeCloseTo((300 * 7) / KCAL_PER_KG, 10)
      expect(num(r, 'Planned weekly rate')).toBeCloseTo(0.2722, 3)
      // The requested figure appears only inside the refusal.
      const refusal = r.notes![0]!
      expect(refusal).toContain('992')
      expect(refusal).toContain('808')
      expect(refusal).toContain('1500 kcal generally considered the minimum')
    })

    test('women get the 1,200 kcal floor', () => {
      const r = compute({ ...base, sex: 'female', maintenance: 1800, weeklyRate: 0.9 })
      expect(Number(r.primary.value)).toBe(1200)
      expect(num(r, 'Daily deficit')).toBe(600)
      expect(r.notes![0]).toContain('1200 kcal generally considered the minimum')
    })

    test('a plan that clears the floor is left alone', () => {
      const r = compute(base)
      expect(Number(r.primary.value)).toBeGreaterThan(1500)
      expect(r.notes!.some((n) => n.includes('is not shown'))).toBe(false)
    })

    test('every capped figure is recomputed from the capped deficit', () => {
      // The projections must follow the plan actually given, not the one asked
      // for — otherwise the page prints a safe intake beside an unsafe date.
      const r = compute({ ...base, maintenance: 1800, weeklyRate: 0.9 })
      expect(num(r, 'Time to goal (3,500 rule)')).toBeCloseTo((10 * KCAL_PER_KG) / 300, 6)
      expect(85 - num(r, 'Plateau at this intake')).toBeCloseTo(300 / KCAL_PER_DAY_PER_KG, 8)
    })

    test('the floor never applies to a surplus', () => {
      const r = compute({ ...base, currentWeight: 75, targetWeight: 85 })
      expect(Number(r.primary.value)).toBeCloseTo(2500 + 440.92452436975516, 8)
      expect(num(r, 'Daily surplus')).toBeCloseTo(440.9245243698, 8)
      expect(r.scaleValue).toBeLessThan(0)
    })
  })

  describe('metric and imperial describe the same body', () => {
    const metric = compute(base)
    const imperial = compute({
      ...base,
      units: 'imperial',
      currentWeight: 85 * LB_PER_KG,
      targetWeight: 75 * LB_PER_KG,
      weeklyRate: 0.4 * LB_PER_KG,
    })

    test('the calorie figures are identical', () => {
      expect(Number(imperial.primary.value)).toBeCloseTo(Number(metric.primary.value), 8)
      expect(num(imperial, 'Daily deficit')).toBeCloseTo(num(metric, 'Daily deficit'), 8)
    })

    test('both projections land on the same day', () => {
      expect(num(imperial, 'Time to goal (3,500 rule)')).toBeCloseTo(
        num(metric, 'Time to goal (3,500 rule)'),
        6,
      )
      expect(num(imperial, 'Time to goal (with adaptation)')).toBeCloseTo(
        num(metric, 'Time to goal (with adaptation)'),
        6,
      )
      expect(stat(imperial, 'Goal date (3,500 rule)').value).toBe(
        stat(metric, 'Goal date (3,500 rule)').value,
      )
    })

    test('the weights convert back to the metric ones', () => {
      expect(num(imperial, 'Weight to lose') / LB_PER_KG).toBeCloseTo(
        num(metric, 'Weight to lose'),
        8,
      )
      expect(num(imperial, 'Plateau at this intake') / LB_PER_KG).toBeCloseTo(
        num(metric, 'Plateau at this intake'),
        8,
      )
      expect(num(imperial, 'Still to go on the 3,500-rule date') / LB_PER_KG).toBeCloseTo(
        num(metric, 'Still to go on the 3,500-rule date'),
        8,
      )
    })

    test('the 350-day time constant is the same in both', () => {
      // 3,500 / 10 in pounds, and the same ratio scaled by 2.2046 on both sides
      // in kilograms. Reported in the steps, so it is checkable on the page.
      for (const r of [metric, imperial]) {
        const tau = r.steps!.find(
          (s) => 'label' in s && s.label === 'Time constant = 3,500 / 10',
        )!
        expect(Number((tau as { value: number }).value)).toBe(350)
      }
    })
  })

  describe('parts', () => {
    test('a deficit splits maintenance into intake plus deficit', () => {
      const r = compute(base)
      expect(r.parts).toHaveLength(2)
      expect(r.parts!.map((p) => p.label)).toEqual(['Daily calorie target', 'Daily deficit'])
      expect(Number(r.partsTotal!.value)).toBe(2500)
      const sum = r.parts!.reduce((a, p) => a + p.value, 0)
      expect(sum).toBeCloseTo(2500, 10)
      for (const p of r.parts!) expect(p.value).toBeGreaterThanOrEqual(0)
    })

    test('a surplus splits the target into maintenance plus surplus', () => {
      const r = compute({ ...base, currentWeight: 75, targetWeight: 85 })
      expect(r.parts).toHaveLength(2)
      expect(r.parts!.map((p) => p.label)).toEqual(['Maintenance calories', 'Daily surplus'])
      const sum = r.parts!.reduce((a, p) => a + p.value, 0)
      expect(sum).toBeCloseTo(Number(r.partsTotal!.value), 10)
      for (const p of r.parts!) expect(p.value).toBeGreaterThanOrEqual(0)
    })
  })

  describe('refusals', () => {
    const throws = (input: Partial<Input>, fieldId: string) => {
      let thrown: unknown
      try {
        compute({ ...base, ...input })
      } catch (err) {
        thrown = err
      }
      expect(thrown).toBeInstanceOf(CalcError)
      expect((thrown as CalcError).fieldId).toBe(fieldId)
    }

    test('unparseable numbers are refused against their own field', () => {
      throws({ maintenance: Number.NaN }, 'maintenance')
      throws({ currentWeight: Number.NaN }, 'currentWeight')
      throws({ targetWeight: Number.NaN }, 'targetWeight')
      throws({ weeklyRate: Number.NaN }, 'weeklyRate')
    })

    test('non-positive numbers are refused too', () => {
      throws({ maintenance: 0 }, 'maintenance')
      throws({ currentWeight: 0 }, 'currentWeight')
      throws({ targetWeight: -1 }, 'targetWeight')
      throws({ weeklyRate: 0 }, 'weeklyRate')
    })

    test('a goal equal to the current weight has nothing to project', () => {
      throws({ targetWeight: 85 }, 'targetWeight')
    })

    test('a maintenance figure already below the floor leaves no deficit', () => {
      throws({ maintenance: 1400 }, 'maintenance')
      throws({ maintenance: 1500 }, 'maintenance')
      // ...but a woman at 1,400 has 200 kcal of room, so it computes.
      expect(() => compute({ ...base, sex: 'female', maintenance: 1400 })).not.toThrow()
    })

    test('an unknown sex is refused rather than silently defaulted', () => {
      throws({ sex: 'unspecified' }, 'sex')
    })

    test('bad dates are refused against the date field', () => {
      throws({ startDate: 'next tuesday' }, 'startDate')
      throws({ startDate: '2026-02-30' }, 'startDate')
      throws({ startDate: '1200-01-01' }, 'startDate')
    })

    test('an implausible maintenance figure is refused', () => {
      throws({ maintenance: 25_000 }, 'maintenance')
    })
  })

  describe('field bounds', () => {
    // Widened deliberately: `as const` pins each entry to its literal type, so
    // the union member for `maintenance` has no `variants` property at all.
    const numberField = (id: string): NumberField => {
      const f = (fields as readonly Field[]).find((x) => x.id === id)!
      if (f.kind !== 'number') throw new Error(`${id} is not a number field`)
      return f
    }

    test('the first number field is the one the e2e nudge can move', () => {
      const first = fields.find((f) => f.kind === 'number')!
      expect(first.id).toBe('maintenance')
      const nudged = compute({ ...base, maintenance: 2500 * 1.1 })
      expect(Number(nudged.primary.value)).not.toBeCloseTo(Number(compute(base).primary.value), 6)
      expect(Number(nudged.primary.value)).toBeCloseTo(2750 - 440.92452436975516, 8)
    })

    test('every declared bound computes in both unit systems', () => {
      // The form draws a slider spanning each variant's own min..max, so both
      // ends are one drag away. A bound compute refuses is a broken control.
      const states: Record<string, Input> = {
        metric: base,
        imperial: {
          ...base,
          units: 'imperial',
          currentWeight: 85 * LB_PER_KG,
          targetWeight: 75 * LB_PER_KG,
          weeklyRate: 0.4 * LB_PER_KG,
        },
      }

      for (const [caseKey, state] of Object.entries(states)) {
        for (const id of ['maintenance', 'currentWeight', 'targetWeight', 'weeklyRate']) {
          const field = numberField(id)
          const variant = field.variants?.cases[caseKey as 'metric' | 'imperial']
          const min = variant?.min ?? field.min!
          const max = variant?.max ?? field.max!
          for (const sex of ['male', 'female']) {
            for (const bound of [min, max]) {
              expect(
                () => compute({ ...state, sex, [id]: bound } as Input),
                `${caseKey}/${sex}: ${id} = ${bound}`,
              ).not.toThrow()
            }
          }
        }
      }
    })

    test('the metric defaults land on min + n x step', () => {
      // A range input snaps to that grid, so an off-grid default shifts the
      // moment the control is touched. Converting variants are exempt by
      // nature — 85 kg is 187.393 lb and no step lands on that.
      for (const id of ['maintenance', 'currentWeight', 'targetWeight', 'weeklyRate']) {
        const field = numberField(id)
        const variant = field.variants?.cases.metric
        const min = variant?.min ?? field.min!
        const step = variant?.step ?? field.step!
        const n = (field.default - min) / step
        expect(Math.abs(n - Math.round(n)), `${id} is off the slider grid`).toBeLessThan(1e-9)
      }
    })

    test('each variant stays inside the top-level union', () => {
      for (const id of ['currentWeight', 'targetWeight', 'weeklyRate']) {
        const field = numberField(id)
        const cases = field.variants!.cases
        expect(Object.keys(cases)[0]).toBe('metric')
        expect(cases.metric!.factor ?? 1).toBe(1)
        for (const variant of Object.values(cases)) {
          expect(variant.min!).toBeGreaterThanOrEqual(field.min!)
          expect(variant.max!).toBeLessThanOrEqual(field.max!)
        }
      }
      // 660 lb is 299.4 kg and 300 kg is 661.4 lb, so the two weight caps
      // describe the same real body.
      expect(Math.abs(660 / LB_PER_KG - 300)).toBeLessThan(1)
    })
  })

  describe('across the whole input space', () => {
    test(
      'the result stays finite, honest, and drawable',
      () => {
        const sweep = {
          units: ['metric', 'imperial'],
          sex: ['male', 'female'],
          maintenance: [1600, 2000, 2500, 3200, 5000],
          weeklyRate: [0.05, 0.4, 0.9],
          currentWeight: [40, 85, 150, 290],
          targetWeight: [36, 60, 75, 120, 295],
        }
        let seen = 0
        for (const units of sweep.units) {
          const scale = units === 'imperial' ? LB_PER_KG : 1
          for (const sex of sweep.sex)
            for (const maintenance of sweep.maintenance)
              for (const weeklyRate of sweep.weeklyRate)
                for (const currentWeight of sweep.currentWeight)
                  for (const targetWeight of sweep.targetWeight) {
                    if (currentWeight === targetWeight) continue
                    const r = compute({
                      units,
                      sex,
                      maintenance,
                      weeklyRate: weeklyRate * scale,
                      currentWeight: currentWeight * scale,
                      targetWeight: targetWeight * scale,
                      startDate: '2026-01-01',
                    })
                    seen++

                    const intake = Number(r.primary.value)
                    expect(Number.isFinite(intake)).toBe(true)
                    // Never a plan below the floor. This is the invariant the
                    // whole safety cap exists to hold.
                    if (targetWeight < currentWeight)
                      expect(intake).toBeGreaterThanOrEqual(
                        sex === 'male' ? 1500 : 1200,
                      )

                    // Parts stay an exact, non-negative decomposition.
                    const whole = Number(r.partsTotal!.value)
                    expect(r.parts!.reduce((a, p) => a + p.value, 0)).toBeCloseTo(whole, 6)
                    for (const p of r.parts!) expect(p.value).toBeGreaterThanOrEqual(0)

                    // Both series are always present and always drawable.
                    expect(r.series).toHaveLength(2)
                    for (const s of r.series!) {
                      expect(s.points).toHaveLength(41)
                      for (let i = 0; i < s.points.length; i++) {
                        expect(Number.isFinite(s.points[i]![0])).toBe(true)
                        expect(Number.isFinite(s.points[i]![1])).toBe(true)
                        expect(s.points[i]![1]).toBeGreaterThan(0)
                        if (i > 0) expect(s.points[i]![0]).toBeGreaterThan(s.points[i - 1]![0])
                      }
                    }

                    // Adaptation is never optimistic relative to the 3,500 rule.
                    const naive = num(r, 'Time to goal (3,500 rule)')
                    const adaptive = num(r, 'Time to goal (with adaptation)')
                    expect(adaptive).toBeGreaterThan(naive - 1e-6)
                  }
        }
        expect(seen).toBeGreaterThan(1000)
      },
      // Wall clock, not work: this sweep runs in parallel with every other
      // file, so its budget has to cover the whole suite's contention rather
      // than its own ~18s. It began failing at 30s when the registry grew past
      // 90 calculators, having changed not at all. Raise this rather than thin
      // the sweep — coverage is the point of it.
      90_000,
    )
  })

  /**
   * The conformance suite in `registry.test.ts` checks all of this — but only
   * once the calculator is in the barrel, and adding it there is somebody
   * else's commit. Until then these hold the same line locally.
   */
  describe('the definition itself', () => {
    test('the copy fits a search result', () => {
      expect(def.description.length).toBeGreaterThan(50)
      expect(def.description.length).toBeLessThanOrEqual(160)
      expect(def.seoTitle.length).toBeLessThanOrEqual(70)
      expect(def.intro.length).toBeGreaterThan(40)
      expect(def.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    })

    test('there are at least three real FAQs', () => {
      expect(def.faqs.length).toBeGreaterThanOrEqual(3)
      for (const faq of def.faqs) {
        expect(faq.q.endsWith('?')).toBe(true)
        expect(faq.a.length).toBeGreaterThan(40)
      }
    })

    test('every related slug already exists in the registry', () => {
      const slugs = new Set(calculators.map((c) => c.slug))
      for (const slug of def.related) {
        expect(slugs.has(slug), `related → ${slug}`).toBe(true)
        expect(slug).not.toBe(def.slug)
      }
    })

    test('field ids are unique and camelCase', () => {
      const ids = def.fields.map((f) => f.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const id of ids) expect(id).toMatch(/^[a-z][a-zA-Z0-9]*$/)
    })

    test('scale bands are ordered and contiguous, and cover a surplus', () => {
      const { bands, min, max } = def.scale
      expect(min).toBeLessThan(max)
      bands.forEach((band, i) => {
        expect(band.from).toBeLessThan(band.to)
        if (i > 0) expect(band.from).toBe(bands[i - 1]!.to)
      })
      expect(bands[0]!.from).toBeLessThan(-100)
    })

    test('the definition carries no colour, class name, or markup', () => {
      const serialized = JSON.stringify(def, (_k, v) => (typeof v === 'function' ? undefined : v))
      expect(serialized).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(serialized).not.toMatch(/\b(bg|text|border|rounded|shadow)-[a-z]+-\d{2,3}\b/)
      expect(serialized).not.toMatch(/<\/?[a-z][\s\S]*>/i)
    })

    test('the shipped defaults render a complete view with no NaN', () => {
      const view = toResultView(def.compute(defaultValues(def) as never), def.scale)
      expect(view.primary.text).toBe('2,059 kcal/day')
      expect(view.band).toBe('excellent')
      expect(view.bandLabel).toBe('Moderate deficit')
      expect(view.scalePercent).toBeGreaterThanOrEqual(0)
      expect(view.scalePercent).toBeLessThanOrEqual(100)
      for (const s of view.stats) expect(s.text).not.toContain('NaN')
      for (const s of view.steps) if ('text' in s) expect(s.text).not.toContain('NaN')
      // Both rich results are present at the defaults, which is the only way
      // the server ever renders their containers.
      expect(view.parts).toHaveLength(2)
      expect(view.series).toHaveLength(2)
      expect(view.partsTotal.text).toBe('2,500 kcal/day')
    })
  })
})

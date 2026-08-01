import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'
import type { Field, NumberField, Quantity } from '../../../lib/types'
import { formatValue } from '../../../lib/format'
import { defaultValues, resolveBounds } from '../../../lib/view'

type Input = Parameters<typeof compute>[0]
type Result = ReturnType<typeof compute>

/**
 * Not `as const`: the fixture is spread with numeric overrides throughout, and
 * literal-pinned types would reject `{ acceleration: -9.81 }` because the type
 * would be the literal 2.
 */
const base: Input = {
  solveFor: 'displacement',
  initialVelocity: 5,
  acceleration: 2,
  time: 10,
  finalVelocity: 25,
  displacement: 150,
}

const MODES = ['displacement', 'finalVelocity', 'acceleration', 'time'] as const

const numberFields = (fields as readonly Field[]).filter(
  (f): f is NumberField => f.kind === 'number',
)

const rawStat = (r: Result, label: string) => r.stats!.find((s) => s.label === label)!.value
const stat = (r: Result, label: string) => Number(rawStat(r, label))

/** All five quantities, whichever three were the input. */
const suvat = (r: Result) => ({
  u: stat(r, 'Initial velocity (u)'),
  v: stat(r, 'Final velocity (v)'),
  a: stat(r, 'Acceleration (a)'),
  t: stat(r, 'Time (t)'),
  s: stat(r, 'Displacement (s)'),
})

const thrownBy = (input: Input): unknown => {
  try {
    compute(input)
    return undefined
  } catch (err) {
    return err
  }
}

/**
 * The SECOND, independent confirmation of the displacement, by numerical
 * integration of the velocity rather than by the closed form.
 *
 * v(τ) = u + a·τ is linear in τ, and the trapezoidal rule is EXACT for a linear
 * integrand, so this agrees with u·t + ½·a·t² to the last bit rather than
 * approximately — but it gets there by summing 2000 slices of area instead of
 * evaluating a formula, which is what makes it a real cross-check and not the
 * same expression written twice.
 */
function displacementByIntegration(u: number, a: number, t: number, slices = 2000): number {
  const h = t / slices
  let total = 0
  for (let i = 0; i < slices; i += 1) {
    const t0 = (t * i) / slices
    const t1 = (t * (i + 1)) / slices
    total += ((u + a * t0 + (u + a * t1)) / 2) * (t1 - t0)
  }
  // Keep h referenced so the slice width is visible in a failure.
  expect(h).toBeGreaterThan(0)
  return total
}

describe('kinematics: the anchor', () => {
  /*
   * u = 5 m/s, a = 2 m/s², t = 10 s.
   *   v = u + a·t      = 5 + 20   = 25 m/s
   *   s = u·t + ½·a·t² = 50 + 100 = 150 m
   * Both are exact in binary floating point, so they are asserted with strict
   * equality — a toBeCloseTo here would hide a formula that is merely nearly
   * right.
   */
  test('u=5, a=2, t=10 gives v=25 and s=150, exactly', () => {
    const r = compute(base)
    expect(r.primary.label).toBe('Displacement')
    expect(r.primary.value).toBe(150)
    expect(formatValue(r.primary.value, r.primary.format)).toBe('150.0000 m')
    expect(suvat(r)).toEqual({ u: 5, v: 25, a: 2, t: 10, s: 150 })
  })

  test('the defaults are one journey, so all four modes agree', () => {
    for (const solveFor of MODES) {
      const r = compute({ ...base, solveFor })
      expect(suvat(r), solveFor).toEqual({ u: 5, v: 25, a: 2, t: 10, s: 150 })
    }
  })

  test('the headline at the defaults is the displacement, and resultLabel matches', () => {
    const r = compute(defaultValues(def) as Input)
    expect(r.primary.label).toBe('Displacement')
    expect(def.resultLabel).toBe(r.primary.label)
    expect(r.primary.value).toBe(150)
  })

  test('the headline is the quantity the mode was asked for', () => {
    expect(compute({ ...base, solveFor: 'displacement' }).primary.label).toBe('Displacement')
    expect(compute({ ...base, solveFor: 'finalVelocity' }).primary.label).toBe('Final velocity')
    expect(compute({ ...base, solveFor: 'acceleration' }).primary.label).toBe('Acceleration')
    expect(compute({ ...base, solveFor: 'time' }).primary.label).toBe('Time')
  })

  test('the closed form agrees with numerical integration of the velocity', () => {
    for (const u of [-40, -5, 0, 5, 30, 120]) {
      for (const a of [-9.81, -2, 0, 1.5, 2, 12]) {
        for (const t of [0.1, 1, 7.5, 10, 60]) {
          const r = compute({ ...base, solveFor: 'displacement', initialVelocity: u, acceleration: a, time: t })
          const closed = Number(r.primary.value)
          const integrated = displacementByIntegration(u, a, t)
          // Relative, because the sweep spans 0.05 m to 25 km.
          const scale = Math.max(1, Math.abs(closed))
          expect(Math.abs(closed - integrated) / scale, `u=${u} a=${a} t=${t}`).toBeLessThan(1e-9)
        }
      }
    }
  }, 30_000)

  test('the timeless equation v² = u² + 2as holds in every mode across a sweep', () => {
    // Equation (4) contains no time at all, so it is an independent relation
    // between whatever the other three equations produced.
    for (const solveFor of MODES) {
      for (const u of [-100, -5, 0, 5, 40]) {
        for (const a of [-8, -1, 0, 2, 25]) {
          for (const t of [0.1, 3, 10, 100]) {
            let r: Result
            try {
              r = compute({ ...base, solveFor, initialVelocity: u, acceleration: a, time: t })
            } catch (err) {
              expect(err).toBeInstanceOf(CalcError)
              continue
            }
            if (typeof r.primary.value === 'string') continue // "Never reached"
            const q = suvat(r)
            const left = q.v * q.v
            const right = q.u * q.u + 2 * q.a * q.s
            const scale = Math.max(1, Math.abs(left), Math.abs(right))
            expect(Math.abs(left - right) / scale, `${solveFor} u=${u} a=${a} t=${t}`).toBeLessThan(1e-9)
          }
        }
      }
    }
  }, 30_000)
})

describe('kinematics: solving for time', () => {
  /*
   * ½·2·t² + 5·t − 150 = 0, i.e. t² + 5t − 150 = 0.
   * t = (−5 ± √(25 + 600)) / 2 = (−5 ± 25) / 2, so the roots are 10 and −15
   * exactly. The negative one is discarded, and 10 is the answer.
   */
  test('the defaults give exactly 10 s, with −15 s as the discarded root', () => {
    const r = compute({ ...base, solveFor: 'time' })
    expect(r.primary.value).toBe(10)
    expect(r.notes!.join(' ')).toContain('-15')
    expect(r.notes!.join(' ')).toContain('before the clock started')
  })

  test('every solved time actually satisfies s = u·t + ½·a·t²', () => {
    // Substituting the root back in is the independent check: it exercises the
    // forward formula against a root produced by the stable quadratic solver.
    for (const u of [-50, -1, 0, 0.5, 5, 200]) {
      for (const a of [-30, -2, -0.001, 0, 0.001, 2, 50]) {
        for (const s of [0, 0.5, 12, 150, 9000]) {
          let r: Result
          try {
            r = compute({ ...base, solveFor: 'time', initialVelocity: u, acceleration: a, displacement: s })
          } catch (err) {
            expect(err).toBeInstanceOf(CalcError)
            continue
          }
          if (typeof r.primary.value === 'string') continue // "Never reached"
          const t = Number(r.primary.value)
          expect(t, `u=${u} a=${a} s=${s}`).toBeGreaterThanOrEqual(0)
          const back = u * t + 0.5 * a * t * t
          const scale = Math.max(1, Math.abs(s))
          expect(Math.abs(back - s) / scale, `u=${u} a=${a} s=${s} t=${t}`).toBeLessThan(1e-6)
        }
      }
    }
  }, 30_000)

  test('when both roots are non-negative the FIRST crossing is the answer', () => {
    // Thrown up at 5 m/s and decelerating at 1 m/s², an object passes 10 m on
    // the way out and again on the way back. t² − 10t + 20 = 0 gives
    // t = 5 ± √5, so 2.76393 s out and 7.23607 s back.
    const r = compute({ ...base, solveFor: 'time', initialVelocity: 5, acceleration: -1, displacement: 10 })
    expect(Number(r.primary.value)).toBeCloseTo(5 - Math.sqrt(5), 12)
    expect(r.notes!.join(' ')).toContain('passes the same point again')
    // And the other root really is the other crossing.
    const other = 5 + Math.sqrt(5)
    expect(5 * other - 0.5 * other * other).toBeCloseTo(10, 12)
  })

  test('a repeated root is returned once, with no phantom second root', () => {
    // Exactly at the turning point: u = 10, a = -1, s = 50 = u²/(2|a|).
    // t² − 20t + 100 = 0 has the double root t = 10.
    const r = compute({ ...base, solveFor: 'time', initialVelocity: 10, acceleration: -1, displacement: 50 })
    expect(Number(r.primary.value)).toBeCloseTo(10, 9)
    expect(stat(r, 'Final velocity (v)')).toBeCloseTo(0, 9)
  })

  test('zero acceleration branches to constant velocity rather than dividing by zero', () => {
    const r = compute({ ...base, solveFor: 'time', acceleration: 0, initialVelocity: 5, displacement: 150 })
    expect(Number(r.primary.value)).toBe(30) // 150 ÷ 5
    expect(stat(r, 'Final velocity (v)')).toBe(5)
    expect(r.notes!.join(' ')).toContain('not a quadratic')
  })

  test('the stable solver stays exact where the schoolbook formula collapses', () => {
    /*
     * With a tiny acceleration, (−u + √(u² + 2as)) ÷ a subtracts two nearly
     * equal numbers and then divides by something tiny — catastrophic
     * cancellation. The answer must still tend smoothly to the a = 0 limit
     * s ÷ u = 30 s.
     */
    for (const a of [1e-3, 1e-6, 1e-9, 1e-12]) {
      const r = compute({ ...base, solveFor: 'time', acceleration: a, initialVelocity: 5, displacement: 150 })
      const t = Number(r.primary.value)
      /*
       * Perturbation series about the a = 0 answer t₀ = s/u = 30. Writing
       * t = 30 + a·t₁ + a²·t₂ in u·t + ½·a·t² = s and matching powers gives
       * t₁ = −u⁻¹·½·t₀² = −90 and t₂ = +540, so the residual against the
       * first-order estimate must be O(540a²) and no worse. The absolute floor
       * is the rounding noise of a double near 30, about 3.6e-15.
       */
      expect(Math.abs(t - (30 - 90 * a)), `a=${a}`).toBeLessThan(700 * a * a + 1e-13)
      // Substituting the root back is the check that actually matters.
      expect(Math.abs(5 * t + 0.5 * a * t * t - 150), `a=${a}`).toBeLessThan(1e-10)
    }
  })

  test('an unreachable displacement is answered, not refused', () => {
    // Decelerating at 100 m/s² from 5 m/s, the object stops after 0.05 s having
    // covered u²/(2|a|) = 25/200 = 0.125 m. 150 m is never reached, and the
    // discriminant u² + 2as = 25 − 30000 is negative.
    const r = compute({ ...base, solveFor: 'time', acceleration: -100 })
    expect(r.primary.value).toBe('Never reached')
    expect(formatValue(r.primary.value, r.primary.format)).toBe('Never reached')
    expect(stat(r, 'Furthest it actually gets')).toBeCloseTo(0.125, 12)
    expect(stat(r, 'Time at that furthest point')).toBeCloseTo(0.05, 12)
  })

  test('an object heading the wrong way at constant velocity never arrives', () => {
    for (const u of [-5, 0]) {
      const r = compute({ ...base, solveFor: 'time', acceleration: 0, initialVelocity: u, displacement: 150 })
      expect(r.primary.value, `u=${u}`).toBe('Never reached')
    }
  })

  test('standing still with nowhere to go is indeterminate, and says so', () => {
    const err = thrownBy({ ...base, solveFor: 'time', acceleration: 0, initialVelocity: 0, displacement: 0 })
    expect(err).toBeInstanceOf(CalcError)
    expect((err as CalcError).fieldId).toBe('initialVelocity')
  })

  test('a displacement of zero is reached at t = 0', () => {
    const r = compute({ ...base, solveFor: 'time', displacement: 0 })
    expect(Number(r.primary.value)).toBe(0)
    // No interval, so nothing to chart.
    expect(r.series).toBeUndefined()
  })
})

describe('kinematics: free fall, the published anchor', () => {
  /*
   * The standard acceleration due to gravity is defined by the 3rd CGPM (1901)
   * as exactly 9.80665 m/s². Dropped from rest, an object falls
   * s = ½·g·t², so after 1 s it has fallen 4.903325 m and is doing 9.80665 m/s —
   * the figures in every physics textbook's first worked example.
   */
  test('a body dropped from rest falls 4.903 m in the first second', () => {
    const r = compute({ ...base, solveFor: 'displacement', initialVelocity: 0, acceleration: 9.80665, time: 1 })
    expect(Number(r.primary.value)).toBeCloseTo(4.903325, 12)
    expect(stat(r, 'Final velocity (v)')).toBeCloseTo(9.80665, 12)
  })

  test('it takes 2 s to fall 19.6133 m, which the time mode agrees with', () => {
    const r = compute({ ...base, solveFor: 'time', initialVelocity: 0, acceleration: 9.80665, displacement: 4 * 4.903325 })
    expect(Number(r.primary.value)).toBeCloseTo(2, 12)
  })

  test('a ball thrown up at 19.6133 m/s comes back to the hand after 4 s', () => {
    // Up positive: u = 2g, a = −g, s = 0. The roots are 0 and 2u/g = 4 s. The
    // first crossing is the throw itself, so 0 is the correct smallest root.
    const g = 9.80665
    const r = compute({ ...base, solveFor: 'time', initialVelocity: 2 * g, acceleration: -g, displacement: 0 })
    expect(Number(r.primary.value)).toBe(0)
    expect(r.notes!.join(' ')).toContain('passes the same point again')
    expect(r.notes!.join(' ')).toContain('4')
  })
})

describe('kinematics: the chart', () => {
  test('position and velocity are both charted at the defaults', () => {
    const r = compute(defaultValues(def) as Input)
    expect(r.series!.map((s) => s.label)).toEqual(['Displacement', 'Velocity'])
    for (const series of r.series!) {
      expect(series.points.length).toBeGreaterThan(1)
      series.points.forEach((point, i) => {
        expect(Number.isFinite(point[0])).toBe(true)
        expect(Number.isFinite(point[1])).toBe(true)
        if (i > 0) expect(point[0]).toBeGreaterThan(series.points[i - 1]![0])
      })
    }
  })

  test('the curves are drawn from the same closed form as the headline', () => {
    const r = compute(defaultValues(def) as Input)
    const [position, velocity] = r.series!
    // The last point must land on the reported answer, not near it.
    expect(position!.points[position!.points.length - 1]).toEqual([10, 150])
    expect(velocity!.points[velocity!.points.length - 1]).toEqual([10, 25])
    expect(position!.points[0]).toEqual([0, 0])
    expect(velocity!.points[0]).toEqual([0, 5])
    // And an interior point matches u·τ + ½·a·τ² at that τ.
    for (const [tau, value] of position!.points) {
      expect(value, `τ=${tau}`).toBeCloseTo(5 * tau + tau * tau, 9)
    }
  })

  test('deceleration still charts, even where the curves cross zero', () => {
    /*
     * The studio chart's y axis runs from 0 to the peak, so a curve that goes
     * negative leaves the plot at the baseline. That is established behaviour
     * here rather than a reason to withhold the chart: refinance-calculator,
     * npv-calculator and mortgage-points-calculator all plot a "cumulative
     * position versus the alternative" line that is negative AT THEIR OWN
     * DEFAULTS. Withholding it would lose the whole point of a velocity-time
     * graph, which is watching the sign change.
     */
    const r = compute({ ...base, acceleration: -2 })
    expect(r.series).toBeDefined()
    const [position, velocity] = r.series!
    // v = 5 − 2τ crosses zero at τ = 2.5; s = 5τ − τ² crosses at τ = 5.
    expect(velocity!.points.some((p) => p[1] < 0)).toBe(true)
    expect(position!.points.some((p) => p[1] < 0)).toBe(true)
    expect(position!.points[position!.points.length - 1]).toEqual([10, -50])
    expect(velocity!.points[velocity!.points.length - 1]).toEqual([10, -15])
    expect(Number(r.primary.value)).toBe(-50)
  })

  test('a chartable interval at the defaults is what makes the chart renderable at all', () => {
    // The theme server-renders the chart from the DEFAULT result only, so a
    // series that appeared solely off-default could never be drawn.
    expect(compute(defaultValues(def) as Input).series).toBeDefined()
    for (const solveFor of MODES) {
      const r = compute({ ...base, solveFor })
      expect(r.series, solveFor).toBeDefined()
      for (const series of r.series!) expect(series.points.length).toBeGreaterThan(0)
    }
  })
})

describe('kinematics: bounds and refusals', () => {
  test('every declared bound is a value compute accepts, in every mode', () => {
    // The same rule field-bounds.test.ts enforces registry-wide, asserted here
    // so it fails in this directory's fast loop rather than only in a full run.
    for (const field of numberFields) {
      for (const bound of [field.min, field.max]) {
        if (bound === undefined) continue
        for (const solveFor of MODES) {
          const where = `${field.id}=${bound} in ${solveFor}`
          expect(thrownBy({ ...base, solveFor, [field.id]: bound }), where).toBeUndefined()
        }
      }
      // resolveBounds is what the form actually draws the slider from.
      expect(resolveBounds(field, base as unknown as Record<string, unknown>).min).toBe(field.min)
    }
  })

  test('every number default lands on min + n × step', () => {
    for (const field of numberFields) {
      if (field.min === undefined || field.step === undefined) continue
      const n = (field.default - field.min) / field.step
      expect(Math.abs(n - Math.round(n)), field.id).toBeLessThan(1e-9)
      expect(field.variants, `${field.id} declares no unit variants`).toBeUndefined()
    }
  })

  test('a time of zero or less is refused against the time field', () => {
    for (const solveFor of ['displacement', 'finalVelocity', 'acceleration'] as const) {
      for (const time of [0, -1]) {
        const err = thrownBy({ ...base, solveFor, time })
        expect(err, `${solveFor} t=${time}`).toBeInstanceOf(CalcError)
        expect((err as CalcError).fieldId).toBe('time')
      }
    }
  })

  /*
   * `coerceValues` in src/lib/view.ts turns an unparseable entry into a raw NaN
   * and hands it straight to compute, and every ordinary comparison against NaN
   * is false — so a magnitude check alone would let it through into the
   * arithmetic. Every field a mode reads must refuse it by name.
   */
  const nonFinite = [
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ] as const

  const readsField: Record<string, ReadonlyArray<(typeof MODES)[number]>> = {
    initialVelocity: ['displacement', 'finalVelocity', 'acceleration', 'time'],
    acceleration: ['displacement', 'finalVelocity', 'time'],
    time: ['displacement', 'finalVelocity', 'acceleration'],
    finalVelocity: ['acceleration'],
    displacement: ['time'],
  }

  test.each(
    Object.entries(readsField).flatMap(([fieldId, modes]) =>
      modes.flatMap((solveFor) =>
        nonFinite.map(([label, value]) => [fieldId, solveFor, label, value] as const),
      ),
    ),
  )('rejects %s = %s in mode %s with a CalcError, never a NaN result', (fieldId, solveFor, _label, value) => {
    const err = thrownBy({ ...base, solveFor, [fieldId]: value })
    expect(err, `${fieldId} in ${solveFor}`).toBeInstanceOf(CalcError)
    expect((err as CalcError).fieldId).toBe(fieldId)
  })

  test('a field the mode does not read is ignored, however bad it is', () => {
    const r = compute({ ...base, solveFor: 'displacement', finalVelocity: Number.NaN, displacement: Number.NaN })
    expect(Number(r.primary.value)).toBe(150)
  })

  test('an unknown mode is refused against its select', () => {
    expect((thrownBy({ ...base, solveFor: 'sideways' }) as CalcError).fieldId).toBe('solveFor')
  })
})

describe('kinematics: shape', () => {
  test('nudging the first number field 1.1× stays valid and moves the result', () => {
    // The e2e suite does exactly this in the DEFAULT mode, so pin the invariant.
    const firstNumber = fields.find((f) => f.kind === 'number')!
    expect(firstNumber.id).toBe('initialVelocity')
    expect((firstNumber as { default: number }).default).not.toBe(0)

    const defaults = defaultValues(def) as Input
    expect(defaults.solveFor).toBe('displacement')
    const before = compute(defaults)
    const after = compute({ ...defaults, initialVelocity: (firstNumber as { default: number }).default * 1.1 })

    expect(Number(after.primary.value)).not.toBe(Number(before.primary.value))
    // s = 5.5 × 10 + 100 = 155.
    expect(Number(after.primary.value)).toBeCloseTo(155, 9)
    expect(formatValue(after.primary.value, after.primary.format)).toBe('155.0000 m')
  })

  test('there are no parts and no scale, because there is no whole and no band', () => {
    // Nothing here is a proportion of a whole — and ½·a·t² goes NEGATIVE under
    // deceleration, so a parts split of u·t and ½·a·t² could not stay
    // non-negative across the acceleration slider. Omitting it is the correct
    // answer; clamping it would break the sum.
    expect('scale' in def).toBe(false)
    for (const solveFor of MODES) {
      for (const acceleration of [-100, -3, 0, 2, 100]) {
        const r = compute({ ...base, solveFor, acceleration })
        expect(r.parts, `${solveFor} a=${acceleration}`).toBeUndefined()
        expect(r.scaleValue).toBeUndefined()
      }
    }
  })

  test('always reports all five quantities, in the same order, in every mode', () => {
    for (const solveFor of MODES) {
      const r = compute({ ...base, solveFor })
      expect(r.stats!.slice(0, 5).map((s) => s.label)).toEqual([
        'Initial velocity (u)',
        'Final velocity (v)',
        'Acceleration (a)',
        'Time (t)',
        'Displacement (s)',
      ])
      expect(r.steps!.length).toBeGreaterThan(4)
      expect(r.notes!.length).toBeGreaterThan(0)
    }
  })

  test('nothing anywhere in the reachable space formats as NaN', () => {
    for (const solveFor of MODES) {
      for (const initialVelocity of [-1000, -5, 0, 5, 1000]) {
        for (const acceleration of [-100, -9.81, 0, 2, 100]) {
          for (const time of [0.1, 10, 1000]) {
            for (const displacement of [0, 150, 10_000]) {
              let r: Result
              try {
                r = compute({ ...base, solveFor, initialVelocity, acceleration, time, displacement, finalVelocity: 25 })
              } catch (err) {
                expect(err).toBeInstanceOf(CalcError)
                expect((err as CalcError).fieldId).toBeDefined()
                continue
              }
              const shown: Quantity[] = [
                r.primary,
                ...r.stats!,
                ...r.steps!.filter((s): s is Quantity => !('rule' in s)),
              ]
              const where = `${solveFor} ${initialVelocity}/${acceleration}/${time}/${displacement}`
              for (const q of shown) {
                const text = formatValue(q.value, q.format)
                expect(text, where).not.toContain('NaN')
                expect(text, where).not.toContain('Infinity')
                expect(text, where).not.toBe('')
              }
              for (const series of r.series ?? []) {
                expect(series.points.length, where).toBeGreaterThan(0)
                for (const [x, y] of series.points) {
                  expect(Number.isFinite(x), where).toBe(true)
                  expect(Number.isFinite(y), where).toBe(true)
                }
              }
            }
          }
        }
      }
    }
  }, 30_000)

  test('the copy fits a search result', () => {
    expect(def.description.length).toBeGreaterThan(50)
    expect(def.description.length).toBeLessThanOrEqual(160)
    expect(def.seoTitle.length).toBeLessThanOrEqual(70)
    expect(def.intro.length).toBeGreaterThan(40)
    expect(def.faqs.length).toBeGreaterThanOrEqual(3)
    for (const faq of def.faqs) {
      expect(faq.q.endsWith('?')).toBe(true)
      expect(faq.a.length).toBeGreaterThan(40)
    }
    expect(new Set(def.related).size).toBe(def.related.length)
    expect(def.related).not.toContain(def.slug)
    expect(def.category).toBe('science')
  })
})

import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'
import type { NumberField } from '../../../lib/types'
import { resolveBand } from '../../../lib/view'

/** The form's own defaults, as `defaultValues` would build them. */
const base = {
  method: 'cooper',
  units: 'metric',
  distance: 2400,
  runTime: 11.5,
  walkTime: 14,
  walkHeartRate: 120,
  maxHeartRate: 190,
  restingHeartRate: 60,
  age: 30,
  sex: 'male',
  weight: 75,
}

/** Widened deliberately, so a partial override is not pinned to the literals. */
type Input = typeof base
const at = (patch: Partial<Input>) => compute({ ...base, ...patch } as never)
const vo2 = (patch: Partial<Input>) => Number(at(patch).primary.value)

const stat = (r: ReturnType<typeof compute>, label: string) =>
  r.stats!.find((s) => s.label === label)!.value

const numberFields = fields.filter((f) => f.kind === 'number') as unknown as NumberField[]
const numberField = (id: string) => numberFields.find((f) => f.id === id)!

const LB_PER_KG = 2.2046226218487757
const METRES_PER_YARD = 0.9144
const METRES_PER_MILE = 1609.344

describe('vo2 max — published anchors', () => {
  /*
   * Every expectation below is (a) derived from the published coefficients and
   * (b) confirmed a second, independent way — against a figure the outside world
   * already agrees on, against a differently-published form of the same
   * regression, or against an algebraic property the formula must have.
   */

  test('Cooper 1968: 2400 m in 12 minutes is 42.4 ml/kg/min', () => {
    // Derived: (2400 − 504.9) / 44.73 = 1895.1 / 44.73.
    expect(vo2({ distance: 2400 })).toBeCloseTo(1895.1 / 44.73, 12)
    // Published anchors, rounded as sources print them.
    expect(vo2({ distance: 2400 })).toBeCloseTo(42.4, 1)
    expect(vo2({ distance: 2500 })).toBeCloseTo(44.603, 3)
  })

  test('Cooper agrees with its own separately-published per-kilometre form', () => {
    // The same regression is also printed as VO2max = 22.351 x km − 11.288.
    // Two independently rounded publications of one fit: a transposed
    // coefficient in the metre form would diverge by whole units rather than by
    // the 0.014 that rounding explains.
    const kmForm = (km: number) => 22.351 * km - 11.288
    for (const metres of [1200, 1800, 2400, 3000, 3600, 4200]) {
      expect(Math.abs(vo2({ distance: metres }) - kmForm(metres / 1000))).toBeLessThan(0.05)
    }
  })

  test('1.5-mile run: 10:00 is 51.8 and 13:00 is 40.65 ml/kg/min', () => {
    // Derived: 3.5 + 483 / t.
    expect(vo2({ method: 'run15', runTime: 10 })).toBeCloseTo(3.5 + 48.3, 12)
    expect(vo2({ method: 'run15', runTime: 10 })).toBeCloseTo(51.8, 6) // published
    expect(vo2({ method: 'run15', runTime: 13 })).toBeCloseTo(40.65, 2) // published
  })

  test('the 1.5-mile equation inverts cleanly — a second route to the same curve', () => {
    // t = 483 / (VO2 − 3.5). Solving backwards and feeding the time in must
    // return the VO2 that was solved for, right across the range.
    for (const target of [25, 35, 45, 55, 70]) {
      expect(vo2({ method: 'run15', runTime: 483 / (target - 3.5) })).toBeCloseTo(target, 9)
    }
  })

  test('Rockport 1987: a 55-year-old woman, 160 lb, 14:30, HR 145 is 29.19', () => {
    const walker: Partial<Input> = {
      method: 'rockport',
      // Imperial: weight is entered in pounds, so 160 is used as-is.
      units: 'imperial',
      weight: 160,
      age: 55,
      sex: 'female',
      walkTime: 14.5,
      walkHeartRate: 145,
    }

    // Derived term by term from Kline et al.'s published coefficients.
    const derived = 132.853 - 0.0769 * 160 - 0.3877 * 55 + 6.315 * 0 - 3.2649 * 14.5 - 0.1565 * 145
    expect(vo2(walker)).toBeCloseTo(derived, 12)
    // Published worked example.
    expect(vo2(walker)).toBeCloseTo(29.19, 2)

    // Second route: sum the six contributions as an independent list. Restating
    // the same expression proves nothing; a wrong sign or a transposed
    // coefficient does not survive being added up from separately worked terms.
    const contributions = [132.853, -12.304, -21.3235, 0, -47.34105, -22.6925]
    expect(contributions.reduce((a, b) => a + b, 0)).toBeCloseTo(29.19, 2)
    expect(vo2(walker)).toBeCloseTo(
      contributions.reduce((a, b) => a + b, 0),
      9,
    )
  })

  test('Rockport in kilograms reproduces the same pound-based worked example', () => {
    expect(
      vo2({
        method: 'rockport',
        units: 'metric',
        weight: 160 / LB_PER_KG,
        age: 55,
        sex: 'female',
        walkTime: 14.5,
        walkHeartRate: 145,
      }),
    ).toBeCloseTo(29.19, 2)
  })

  test('each Rockport coefficient moves the answer by exactly its published size', () => {
    // One unit of each input must shift the estimate by its own slope. This pins
    // all five slopes and their signs independently of the 132.853 constant.
    const rock: Partial<Input> = { method: 'rockport' }
    const ref = vo2(rock)
    expect(vo2({ ...rock, weight: base.weight + 1 / LB_PER_KG }) - ref).toBeCloseTo(-0.0769, 9)
    expect(vo2({ ...rock, age: base.age + 1 }) - ref).toBeCloseTo(-0.3877, 9)
    expect(vo2({ ...rock, walkTime: base.walkTime + 1 }) - ref).toBeCloseTo(-3.2649, 9)
    expect(vo2({ ...rock, walkHeartRate: base.walkHeartRate + 1 }) - ref).toBeCloseTo(-0.1565, 9)
    expect(ref - vo2({ ...rock, sex: 'female' })).toBeCloseTo(6.315, 9)
  })

  test('Uth 2004: VO2 max is 15.3 times the max-to-resting heart rate ratio', () => {
    // Derived: 15.3 x 190 / 60.
    expect(vo2({ method: 'resting' })).toBeCloseTo(15.3 * (190 / 60), 12)
    expect(vo2({ method: 'resting' })).toBeCloseTo(48.45, 10)

    // Second route: the relation is pure proportionality, so it must be exactly
    // scale-invariant. Holding the ratio while moving both rates cannot change
    // the answer; halving the resting rate must exactly double it; and a ratio
    // of 1 must recover the published factor itself. A stray additive term — the
    // sort of error a single spot value would happily confirm — breaks all three.
    const ref = vo2({ method: 'resting' })
    expect(
      vo2({ method: 'resting', maxHeartRate: 200, restingHeartRate: 200 / (190 / 60) }),
    ).toBeCloseTo(ref, 9)
    expect(vo2({ method: 'resting', restingHeartRate: 30 })).toBeCloseTo(2 * ref, 9)
    // Recovering the constant: VO2 x HRrest / HRmax must be 15.3 everywhere.
    // A ratio of exactly 1 cannot be tested directly — an equal resting and
    // maximum pulse is impossible and compute rightly refuses it — so the
    // constant is read back out of ordinary pairs instead.
    for (const [max, rest] of [
      [190, 60],
      [172, 48],
      [150, 149],
      [205, 88],
    ]) {
      expect(
        (vo2({ method: 'resting', maxHeartRate: max, restingHeartRate: rest }) * rest!) / max!,
      ).toBeCloseTo(15.3, 9)
    }
  })
})

describe('vo2 max — the four methods agree for one consistent athlete', () => {
  /*
   * A fit 30-year-old man of 75 kg with a maximum heart rate of 190. The four
   * tests are given inputs describing THAT person rather than four unrelated
   * efforts:
   *
   *  - he covers 2800 m in the 12-minute Cooper test;
   *  - held at exactly that speed, 1.5 miles (2414.016 m) takes 10:20.7;
   *  - he walks a mile in 13:48 finishing at 120 bpm;
   *  - his resting pulse is 57.
   *
   * Four regressions fitted to four different groups will never coincide, but
   * they should land in the same neighbourhood — they agree to within 1.4% of
   * their mean here. That is the cross-check no single formula can give.
   */
  const cooperMetres = 2800
  const speed = cooperMetres / 12 // metres per minute
  const athlete: Partial<Input> = { age: 30, sex: 'male', weight: 75, maxHeartRate: 190 }

  const inputs: Record<string, Partial<Input>> = {
    cooper: { ...athlete, method: 'cooper', distance: cooperMetres },
    run15: { ...athlete, method: 'run15', runTime: (1.5 * METRES_PER_MILE) / speed },
    rockport: { ...athlete, method: 'rockport', walkTime: 13.8, walkHeartRate: 120 },
    resting: { ...athlete, method: 'resting', restingHeartRate: 57 },
  }

  test('all four land within 5% of their mean', () => {
    const values = Object.values(inputs).map(vo2)
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    expect(mean).toBeGreaterThan(45)
    expect(mean).toBeLessThan(56)
    for (const [name, patch] of Object.entries(inputs)) {
      const value = vo2(patch)
      expect(Math.abs(value - mean) / mean, `${name} = ${value} vs mean ${mean}`).toBeLessThan(0.05)
    }
  })

  test('and every one of them rates him the same way', () => {
    for (const [name, patch] of Object.entries(inputs)) {
      expect(String(stat(at(patch), 'Fitness category')), `${name} = ${vo2(patch)}`).toBe('Superior')
    }
  })
})

describe('vo2 max — defaults and the end-to-end nudge', () => {
  test('the headline at the defaults is the Cooper figure for 2400 m', () => {
    const r = at({})
    expect(Number(r.primary.value)).toBeCloseTo(42.3675385647, 9)
    expect(r.primary.format).toEqual({ style: 'decimal', decimals: 1, unit: 'ml/kg/min' })
    expect(String(stat(r, 'Fitness category'))).toBe('Good')
    expect(String(stat(r, 'Compared against'))).toBe('Men aged 30 to 39')
    expect(String(stat(r, 'That category spans'))).toBe('41.0 to 45.0 ml/kg/min')
    expect(Number(stat(r, 'Aerobic capacity'))).toBeCloseTo(42.3675385647 / 3.5, 9)
    expect(Number(stat(r, 'Absolute oxygen uptake'))).toBeCloseTo((42.3675385647 * 75) / 1000, 9)
    expect(resolveBand(def.scale, r.scaleValue!)!.id).toBe('good')
  })

  test('the first number field is distance, and 1.1x its default moves the headline', () => {
    // tests/calculators.spec.ts nudges the FIRST number field to 1.1x, fixed to
    // four places, and expects a valid, different result — for the DEFAULT
    // method, which is why the Cooper distance is ordered first.
    const first = numberFields[0]!
    expect(first.id).toBe('distance')
    const nudged = Number((first.default * 1.1).toFixed(4))
    expect(nudged).toBe(2640)
    expect(nudged).toBeGreaterThanOrEqual(first.min!)
    expect(nudged).toBeLessThanOrEqual(first.max!)
    expect(vo2({ distance: nudged })).toBeCloseTo((2640 - 504.9) / 44.73, 12)
    expect(vo2({ distance: nudged })).not.toBeCloseTo(vo2({}), 3)
  })
})

describe('vo2 max — unit variants', () => {
  const distanceCases = numberField('distance').variants!.cases
  const weightCases = numberField('weight').variants!.cases

  test('the first case listed is the base, at factor 1', () => {
    for (const cases of [distanceCases, weightCases]) {
      const [baseKey] = Object.keys(cases)
      expect(baseKey).toBe('metric')
      expect(cases[baseKey!]!.factor ?? 1).toBe(1)
    }
  })

  test('the declared factors are exactly the physical conversions', () => {
    expect(distanceCases.imperial!.factor!).toBeCloseTo(1 / METRES_PER_YARD, 12)
    expect(weightCases.imperial!.factor!).toBeCloseTo(LB_PER_KG, 12)
  })

  test('yards and metres describe the same run, so the estimate does not move', () => {
    // Switching units converts what the visitor already typed: 2400 m becomes
    // 2624.672 yd, not 2400 yd. The physical distance is preserved, so the
    // Cooper estimate must be identical.
    const yards = 2400 / METRES_PER_YARD
    expect(yards).toBeCloseTo(2624.6719160105, 6)
    expect(yards).toBeCloseTo(2400 * distanceCases.imperial!.factor!, 9)
    expect(vo2({ units: 'imperial', distance: yards })).toBeCloseTo(vo2({}), 12)
  })

  test('pounds and kilograms describe the same walker', () => {
    const asKg = at({ method: 'rockport' })
    const asLb = at({ method: 'rockport', units: 'imperial', weight: 75 * LB_PER_KG })
    expect(Number(asLb.primary.value)).toBeCloseTo(Number(asKg.primary.value), 9)
    // …including the absolute L/min stat, which reads kilograms either way.
    expect(Number(stat(asLb, 'Absolute oxygen uptake'))).toBeCloseTo(
      Number(stat(asKg, 'Absolute oxygen uptake')),
      9,
    )
  })

  test('the two cases of each variant cover the same real range', () => {
    // Otherwise one unit system is offered a range the other is not — the exact
    // failure a per-unit bound exists to prevent.
    expect(
      Math.abs(distanceCases.imperial!.min! * METRES_PER_YARD - distanceCases.metric!.min!),
    ).toBeLessThan(10)
    expect(
      Math.abs(distanceCases.imperial!.max! * METRES_PER_YARD - distanceCases.metric!.max!),
    ).toBeLessThan(10)
    expect(Math.abs(weightCases.imperial!.min! / LB_PER_KG - weightCases.metric!.min!)).toBeLessThan(
      1,
    )
    expect(Math.abs(weightCases.imperial!.max! / LB_PER_KG - weightCases.metric!.max!)).toBeLessThan(
      1,
    )
  })

  test('the top-level pair is exactly the union of the cases', () => {
    for (const id of ['distance', 'weight']) {
      const field = numberField(id)
      const cases = Object.values(field.variants!.cases)
      expect(field.min).toBe(Math.min(...cases.map((c) => c.min!)))
      expect(field.max).toBe(Math.max(...cases.map((c) => c.max!)))
    }
  })
})

describe('vo2 max — every declared bound is a value compute accepts', () => {
  /*
   * A number field renders as a slider spanning its RESOLVED min..max, so both
   * ends are one drag away. A bound compute rejects is a control offering a
   * value the calculator refuses — the commonest way a unit variant goes wrong,
   * because narrowing a range for one unit can push the other unit's end past a
   * guard.
   *
   * Two rules this follows deliberately:
   *  - each field is probed with the METHOD THAT READS IT selected, since a
   *    bound on a field the current method ignores proves nothing;
   *  - a field with variants is probed only at its per-case bounds, never at its
   *    top-level union, because the form never offers the union as a control.
   *    550 lb is a real weight; 550 kg is not, and nothing draws that slider.
   */
  const owner: Record<string, Partial<Input>> = {
    distance: { method: 'cooper' },
    runTime: { method: 'run15' },
    walkTime: { method: 'rockport' },
    walkHeartRate: { method: 'rockport' },
    maxHeartRate: { method: 'resting' },
    restingHeartRate: { method: 'resting' },
    // age and weight feed the Rockport equation as well as the category norms,
    // so they are probed on the method most sensitive to them.
    age: { method: 'rockport' },
    weight: { method: 'rockport' },
  }

  const probes: Array<[string, Partial<Input>]> = []
  for (const field of numberFields) {
    const cases: Array<[string, string, { min?: number; max?: number }]> = field.variants
      ? Object.entries(field.variants.cases).map(([units, variant]) => [
          `:units=${units}`,
          units,
          variant,
        ])
      : [['', 'metric', field]]

    for (const [suffix, units, bounds] of cases) {
      for (const end of ['min', 'max'] as const) {
        if (bounds[end] === undefined) continue
        probes.push([
          `${field.id}${suffix}:${end}=${bounds[end]}`,
          { ...owner[field.id]!, units, [field.id]: bounds[end] } as Partial<Input>,
        ])
      }
    }
  }

  test('every number field contributes both of its ends', () => {
    expect(probes.length).toBe(20)
  })

  test.each(probes)('%s computes to a finite, positive estimate', (_key, patch) => {
    const result = at(patch)
    const value = Number(result.primary.value)
    expect(Number.isFinite(value)).toBe(true)
    expect(value).toBeGreaterThan(0)
    expect(result.scaleValue!).toBeGreaterThanOrEqual(0)
    expect(result.scaleValue!).toBeLessThanOrEqual(100)
  })

  test('every default sits inside its own bounds, base variant included', () => {
    for (const field of numberFields) {
      expect(field.default).toBeGreaterThanOrEqual(field.min!)
      expect(field.default).toBeLessThanOrEqual(field.max!)
      if (!field.variants) continue
      const [baseKey] = Object.keys(field.variants.cases)
      const baseCase = field.variants.cases[baseKey!]!
      expect(field.default).toBeGreaterThanOrEqual(baseCase.min!)
      expect(field.default).toBeLessThanOrEqual(baseCase.max!)
    }
  })

  test('every default lands on min + n x step in each non-converting variant', () => {
    // A range input snaps to min + n x step, so a default off that grid shifts
    // silently the moment anyone touches the slider. Converting variants are
    // exempt by nature — 75 kg is 165.35 lb and no step lands that on a grid —
    // so it is the base case and the top-level pair that have to line up.
    for (const field of numberFields) {
      const grids: Array<[string, number, number]> = [[field.id, field.min!, field.step!]]
      if (field.variants) {
        const [baseKey] = Object.keys(field.variants.cases)
        const baseCase = field.variants.cases[baseKey!]!
        grids.push([`${field.id}[${baseKey}]`, baseCase.min!, baseCase.step!])
      }
      for (const [key, min, step] of grids) {
        const n = (field.default - min) / step
        expect(Math.abs(n - Math.round(n)), `${key} default is off the slider grid`).toBeLessThan(
          1e-9,
        )
      }
    }
  })
})

describe('vo2 max — the fitness-category scale', () => {
  const edges = [0, 15, 30, 50, 70, 90, 100]

  test('the declared bands are contiguous and cover the whole axis', () => {
    expect(def.scale.min).toBe(0)
    expect(def.scale.max).toBe(100)
    expect(def.scale.bands.map((b) => b.from)).toEqual(edges.slice(0, -1))
    expect(def.scale.bands.map((b) => b.to)).toEqual(edges.slice(1))
    def.scale.bands.forEach((band, i) => {
      expect(band.from).toBeLessThan(band.to)
      if (i > 0) expect(band.from).toBe(def.scale.bands[i - 1]!.to)
    })
  })

  test('the published cut-points land exactly on the declared band edges', () => {
    // Inverting Cooper — metres = VO2 x 44.73 + 504.9 — lets an exact VO2 be
    // requested, so each group's five cut-points can be checked against the axis
    // position `index.ts` claims for it. This is what stops BAND_EDGES in
    // compute.ts and the bands in index.ts from drifting apart.
    const groups: Array<[Partial<Input>, number[]]> = [
      [{ age: 25, sex: 'male' }, [33.0, 36.5, 42.5, 46.5, 52.5]],
      [{ age: 35, sex: 'male' }, [31.5, 35.5, 41.0, 45.0, 49.5]],
      [{ age: 45, sex: 'male' }, [30.2, 33.6, 39.0, 43.8, 48.0]],
      [{ age: 55, sex: 'male' }, [26.1, 31.0, 35.8, 41.0, 45.3]],
      [{ age: 65, sex: 'male' }, [20.5, 26.1, 32.3, 36.5, 44.2]],
      [{ age: 25, sex: 'female' }, [23.6, 29.0, 33.0, 37.0, 41.0]],
      [{ age: 35, sex: 'female' }, [22.8, 27.0, 31.5, 35.7, 41.0]],
      [{ age: 45, sex: 'female' }, [21.0, 24.5, 29.0, 32.9, 37.0]],
      [{ age: 55, sex: 'female' }, [20.2, 22.8, 27.0, 31.5, 35.8]],
      [{ age: 65, sex: 'female' }, [17.5, 20.2, 24.5, 30.3, 31.5]],
    ]

    for (const [who, cuts] of groups) {
      // Strictly increasing, which the piecewise interpolation depends on.
      cuts.forEach((c, i) => {
        if (i > 0) expect(c, `${JSON.stringify(who)} cut ${i}`).toBeGreaterThan(cuts[i - 1]!)
      })
      cuts.forEach((cut, i) => {
        const r = at({ ...who, distance: cut * 44.73 + 504.9 })
        expect(Number(r.primary.value)).toBeCloseTo(cut, 9)
        expect(r.scaleValue!, `${JSON.stringify(who)} @ ${cut}`).toBeCloseTo(edges[i + 1]!, 6)
      })
    }
  })

  test('the reported category always matches the band the meter points at', () => {
    for (const sex of ['male', 'female']) {
      for (let age = 20; age <= 79; age += 1) {
        for (let metres = 1000; metres <= 4500; metres += 100) {
          const r = at({ age, sex, distance: metres })
          const band = resolveBand(def.scale, r.scaleValue!)!
          expect(
            band.label.startsWith(String(stat(r, 'Fitness category'))),
            `${sex} ${age} @ ${metres} m: "${band.label}" vs "${String(stat(r, 'Fitness category'))}"`,
          ).toBe(true)
        }
      }
    }
  })

  test('the score never leaves the axis and never goes backwards', () => {
    let previous = -1
    for (let metres = 1000; metres <= 4500; metres += 25) {
      const score = at({ distance: metres }).scaleValue!
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
      expect(score).toBeGreaterThanOrEqual(previous)
      previous = score
    }
    // …and strictly increases across the interior, where it is not clamped.
    // For a man of 30 the axis runs from 27.5 to 58.5 ml/kg/min, i.e. from
    // 1735 m to 3122 m on the Cooper test.
    let interior = -1
    for (let metres = 1800; metres <= 3100; metres += 25) {
      const score = at({ distance: metres }).scaleValue!
      expect(score).toBeGreaterThan(interior)
      expect(score).toBeGreaterThan(0)
      expect(score).toBeLessThan(100)
      interior = score
    }
  })

  test('the same VO2 max rates differently at different ages, which is the point', () => {
    // 40 ml/kg/min: Fair for a man of 25, Superior for a woman of 65.
    const metres = 40 * 44.73 + 504.9
    const young = at({ age: 25, sex: 'male', distance: metres })
    const older = at({ age: 65, sex: 'female', distance: metres })
    expect(Number(young.primary.value)).toBeCloseTo(Number(older.primary.value), 9)
    expect(String(stat(young, 'Fitness category'))).toBe('Fair')
    expect(String(stat(older, 'Fitness category'))).toBe('Superior')
    expect(older.scaleValue!).toBeGreaterThan(young.scaleValue!)
  })

  test('the open-ended categories print an open-ended range', () => {
    expect(String(stat(at({ age: 25, sex: 'male', distance: 1200 }), 'That category spans'))).toBe(
      'under 33.0 ml/kg/min',
    )
    expect(String(stat(at({ age: 25, sex: 'male', distance: 4000 }), 'That category spans'))).toBe(
      '52.5 ml/kg/min and above',
    )
  })
})

describe('vo2 max — rejections', () => {
  test.each([
    ['a distance of zero', { distance: 0 }, 'distance'],
    ['a negative distance', { distance: -100 }, 'distance'],
    ['an unparseable distance', { distance: Number.NaN }, 'distance'],
    ['a 12-minute distance below the regression floor', { distance: 550 }, 'distance'],
    ['a 12-minute distance nobody has ever run', { distance: 6500 }, 'distance'],
    ['a run time of zero', { method: 'run15', runTime: 0 }, 'runTime'],
    ['an unparseable run time', { method: 'run15', runTime: Number.NaN }, 'runTime'],
    ['a 1.5-mile time faster than the world record', { method: 'run15', runTime: 4 }, 'runTime'],
    ['an hour-long 1.5-mile run', { method: 'run15', runTime: 60 }, 'runTime'],
    ['a walk time of zero', { method: 'rockport', walkTime: 0 }, 'walkTime'],
    ['an unparseable walk time', { method: 'rockport', walkTime: Number.NaN }, 'walkTime'],
    ['a walking heart rate of zero', { method: 'rockport', walkHeartRate: 0 }, 'walkHeartRate'],
    [
      'an unparseable walking heart rate',
      { method: 'rockport', walkHeartRate: Number.NaN },
      'walkHeartRate',
    ],
    ['a maximum heart rate of zero', { method: 'resting', maxHeartRate: 0 }, 'maxHeartRate'],
    [
      'an unparseable resting heart rate',
      { method: 'resting', restingHeartRate: Number.NaN },
      'restingHeartRate',
    ],
    ['an age below the norm tables', { age: 12 }, 'age'],
    ['an unparseable age', { age: Number.NaN }, 'age'],
    ['an age of 100 or more', { age: 120 }, 'age'],
    ['a weight of zero', { weight: 0 }, 'weight'],
    ['an unparseable weight', { weight: Number.NaN }, 'weight'],
    ['pounds typed while kilograms are selected', { units: 'metric', weight: 450 }, 'weight'],
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

  test('a resting pulse at or above the maximum is rejected against the resting field', () => {
    // Not a slow reading — an impossible one. It is the RESTING figure that has
    // to move, so that is the field the form must highlight.
    for (const restingHeartRate of [190, 191, 220]) {
      let thrown: unknown
      try {
        at({ method: 'resting', maxHeartRate: 190, restingHeartRate })
      } catch (err) {
        thrown = err
      }
      expect(thrown).toBeInstanceOf(CalcError)
      expect((thrown as CalcError).fieldId).toBe('restingHeartRate')
    }
    // One beat below is accepted, and gives the floor of the method.
    expect(vo2({ method: 'resting', maxHeartRate: 190, restingHeartRate: 189 })).toBeCloseTo(
      15.3 * (190 / 189),
      9,
    )
  })

  test('a Rockport combination outside the equation is refused, not returned negative', () => {
    // Every one of these is inside its own field bounds; together they take the
    // regression below zero, and a negative VO2 max is not an answer.
    let thrown: unknown
    try {
      at({
        method: 'rockport',
        sex: 'female',
        weight: 250,
        age: 79,
        walkTime: 25,
        walkHeartRate: 200,
      })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe('walkTime')
  })

  test('a field the selected method does not read cannot block the answer', () => {
    // Leaving an unused row blank produces NaN from coerceValues. The Cooper
    // test does not read the walk or heart rate rows, so it must still answer.
    expect(
      vo2({ walkTime: Number.NaN, walkHeartRate: Number.NaN, restingHeartRate: Number.NaN }),
    ).toBeCloseTo(42.3675385647, 9)
  })
})

describe('vo2 max — result shape', () => {
  const everyMethod: Array<[string, Partial<Input>]> = [
    ['cooper', {}],
    ['run15', { method: 'run15' }],
    ['rockport', { method: 'rockport' }],
    ['resting', { method: 'resting' }],
  ]

  test.each(everyMethod)('%s returns no NaN anywhere', (_name, patch) => {
    const r = at(patch)
    const quantities = [r.primary, ...r.stats!, ...r.steps!.filter((s) => 'value' in s)]
    for (const q of quantities) {
      const value = (q as { value: number | string }).value
      if (typeof value === 'string') expect(value).not.toContain('NaN')
      else expect(Number.isFinite(value)).toBe(true)
    }
    expect(Number.isFinite(r.scaleValue!)).toBe(true)
    expect(r.stats).toHaveLength(5)
    expect(r.notes).toHaveLength(3)
  })

  test('neither parts nor series ever appear, for any input', () => {
    // VO2 max decomposes into nothing and trends over nothing, so a donut or a
    // chart here would be decoration pretending to be information. What matters
    // is that the counts never VARY with input: anything drawable off-default
    // but not at the defaults would never be server-rendered at all.
    for (const [, patch] of everyMethod) {
      for (let metres = 1000; metres <= 4500; metres += 250) {
        const r = at({ ...patch, distance: metres })
        expect(r.parts).toBeUndefined()
        expect(r.series).toBeUndefined()
      }
    }
  })

  test('the steps end on the same number as the headline', () => {
    for (const [, patch] of everyMethod) {
      const r = at(patch)
      const last = r.steps![r.steps!.length - 1] as { label: string; value: number }
      expect(last.label).toBe('Estimated VO2 max')
      expect(last.value).toBe(Number(r.primary.value))
    }
  })

  test('the copy fits its search-result budget', () => {
    expect(def.description.length).toBeGreaterThan(50)
    expect(def.description.length).toBeLessThanOrEqual(160)
    expect(def.seoTitle.length).toBeLessThanOrEqual(70)
    expect(def.intro.length).toBeGreaterThan(40)
    expect(def.faqs.length).toBeGreaterThanOrEqual(3)
    for (const faq of def.faqs) {
      expect(faq.q.endsWith('?')).toBe(true)
      expect(faq.a.length).toBeGreaterThan(40)
    }
    expect(def.related).not.toContain(def.slug)
    expect(def.related.length).toBeGreaterThan(0)
  })
})

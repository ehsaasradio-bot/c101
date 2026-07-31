import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'
import { resolveBand } from '../../../lib/view'

type Input = {
  units: string
  sex: string
  weight: number
  height: number
  bodyFat: number
}

const male: Input = { units: 'metric', sex: 'male', weight: 80, height: 178, bodyFat: 21 }
const female: Input = { ...male, sex: 'female' }

const primary = (v: Input) => Number(compute(v).primary.value)
const stat = (v: Input, label: string) =>
  Number(compute(v).stats!.find((s) => s.label === label)!.value)
const part = (v: Input, label: string) => compute(v).parts!.find((p) => p.label === label)!.value

const james = (v: Input) => stat(v, 'James (1976) estimate')
const hume = (v: Input) => stat(v, 'Hume (1966) estimate')

/**
 * INDEPENDENT re-derivations, not restatements of the implementation.
 *
 * James is written in the source as 1.10·W − 128·(W/H_cm)². Because
 * BMI = W / H_m² = 10000·W / H_cm², the term W²/H_cm² equals W·BMI/10000, so
 * the same equation can be written entirely in terms of BMI with no height in
 * it at all:
 *
 *   men    LBM = W · (1.10 − 0.0128 · BMI)
 *   women  LBM = W · (1.07 − 0.0148 · BMI)
 *
 * Different algebraic shape, different intermediate quantities, same answer —
 * so agreement is real evidence rather than a tautology. It also pins the two
 * coefficients to each other: a swapped 128/148 shows up immediately.
 */
function jamesViaBmi(sex: 'male' | 'female', kg: number, cm: number): number {
  const bmi = kg / Math.pow(cm / 100, 2)
  return sex === 'female' ? kg * (1.07 - 0.0148 * bmi) : kg * (1.1 - 0.0128 * bmi)
}

/**
 * Boer and Hume are affine in weight and height, so their coefficients ARE the
 * partial derivatives. A central difference recovers each one exactly (to
 * floating point), which catches a transposed pair — the classic failure where
 * the weight coefficient and the height coefficient are swapped and every
 * self-consistent check still passes.
 */
const dByWeight = (v: Input, read: (x: Input) => number, h = 1) =>
  (read({ ...v, weight: v.weight + h }) - read({ ...v, weight: v.weight - h })) / (2 * h)
const dByHeight = (v: Input, read: (x: Input) => number, h = 1) =>
  (read({ ...v, height: v.height + h }) - read({ ...v, height: v.height - h })) / (2 * h)

describe('lean body mass — published worked examples', () => {
  /*
   * The primary anchor. A 60 kg, 180 cm man is the worked set published
   * alongside these three equations: Boer 53.3 kg, James 51.8 kg, Hume 51.2 kg.
   * All three are checked against it at once, so a single wrong coefficient
   * cannot hide behind the other two.
   */
  const worked: Input = { ...male, weight: 60, height: 180 }

  test('Boer reads 53.3 kg for a 60 kg, 180 cm man', () => {
    expect(primary(worked)).toBeCloseTo(53.28, 2)
    expect(Number(primary(worked).toFixed(1))).toBe(53.3)
  })

  test('James reads 51.8 kg for the same man', () => {
    expect(james(worked)).toBeCloseTo(51.7778, 3)
    expect(Number(james(worked).toFixed(1))).toBe(51.8)
  })

  test('Hume reads 51.2 kg for the same man', () => {
    expect(hume(worked)).toBeCloseTo(51.2246, 3)
    expect(Number(hume(worked).toFixed(1))).toBe(51.2)
  })

  test("Boer's own worked example, 75 kg and 180 cm, gives 59.39 kg", () => {
    expect(primary({ ...male, weight: 75, height: 180 })).toBeCloseTo(59.385, 3)
  })
})

describe('lean body mass — coefficients cross-checked', () => {
  test.each([
    ['male defaults', male, 60.886, 62.1447, 57.10802],
    ['female defaults', female, 56.054, 55.70476, 54.789],
  ])('%s: Boer, James and Hume land where the formulas say', (_l, v, b, j, h) => {
    expect(primary(v)).toBeCloseTo(b, 4)
    expect(james(v)).toBeCloseTo(j, 4)
    expect(hume(v)).toBeCloseTo(h, 4)
  })

  test.each([
    ['male', male],
    ['female', female],
    ['male, light', { ...male, weight: 58 }],
    ['female, tall', { ...female, height: 174 }],
    ['male, heavy', { ...male, weight: 110, height: 190 }],
  ])('the James estimate matches the BMI form of the same equation for %s', (_l, v) => {
    expect(james(v)).toBeCloseTo(jamesViaBmi(v.sex as 'male' | 'female', v.weight, v.height), 9)
  })

  test('Boer differentiates to its published coefficients', () => {
    expect(dByWeight(male, primary)).toBeCloseTo(0.407, 10)
    expect(dByHeight(male, primary)).toBeCloseTo(0.267, 10)
    expect(dByWeight(female, primary)).toBeCloseTo(0.252, 10)
    expect(dByHeight(female, primary)).toBeCloseTo(0.473, 10)
  })

  test('Hume differentiates to its published coefficients', () => {
    expect(dByWeight(male, hume)).toBeCloseTo(0.3281, 10)
    expect(dByHeight(male, hume)).toBeCloseTo(0.33929, 10)
    expect(dByWeight(female, hume)).toBeCloseTo(0.29569, 10)
    expect(dByHeight(female, hume)).toBeCloseTo(0.41813, 10)
  })

  /*
   * The blunt sanity net the skill asks for: three separate fits of the same
   * quantity must land close together for a body inside all three populations.
   * A transposed digit in any coefficient blows this apart long before it
   * blows apart any single-formula expectation.
   */
  test.each([
    ['male, 80 kg / 178 cm', male],
    ['female, 80 kg / 178 cm', female],
    ['male, 60 kg / 180 cm', { ...male, weight: 60, height: 180 }],
    ['female, 60 kg / 165 cm', { ...female, weight: 60, height: 165 }],
    ['male, 70 kg / 170 cm', { ...male, weight: 70, height: 170 }],
  ])('the three formulas agree to within a few percent for %s', (_l, v) => {
    const all = [primary(v), james(v), hume(v)]
    const mean = all.reduce((a, b) => a + b, 0) / 3
    for (const value of all) expect(Math.abs(value - mean) / mean).toBeLessThan(0.06)
    expect((Math.max(...all) - Math.min(...all)) / mean).toBeLessThan(0.1)
  })

  test('the spread stat is exactly the highest estimate minus the lowest', () => {
    for (const v of [male, female, { ...male, weight: 95, height: 165 }]) {
      const all = [primary(v), james(v), hume(v)]
      expect(stat(v, 'Spread across the three formulas')).toBeCloseTo(
        Math.max(...all) - Math.min(...all),
        10,
      )
    }
    // At the defaults the three land about 5 kg apart — the honest error bar.
    expect(stat(male, 'Spread across the three formulas')).toBeCloseTo(5.0367, 3)
  })
})

describe('the body-fat route', () => {
  test('is weight × (1 − body fat) and nothing else', () => {
    expect(stat(male, 'From your body fat')).toBeCloseTo(80 * 0.79, 10)
    expect(stat({ ...male, bodyFat: 12 }, 'From your body fat')).toBeCloseTo(80 * 0.88, 10)
  })

  test('is the ONLY figure body fat moves — the three predictive ones never see it', () => {
    const leaner = { ...male, bodyFat: 10 }
    expect(primary(leaner)).toBeCloseTo(primary(male), 10)
    expect(james(leaner)).toBeCloseTo(james(male), 10)
    expect(hume(leaner)).toBeCloseTo(hume(male), 10)
    expect(stat(leaner, 'From your body fat')).toBeGreaterThan(stat(male, 'From your body fat'))
  })

  test('sex changes the predictive estimates but not the body-fat route', () => {
    expect(primary(female)).not.toBeCloseTo(primary(male), 2)
    expect(stat(female, 'From your body fat')).toBeCloseTo(stat(male, 'From your body fat'), 10)
  })
})

describe('fat-free mass index', () => {
  test('is the Boer lean mass over height in metres squared', () => {
    expect(stat(male, 'Fat-free mass index')).toBeCloseTo(60.886 / 1.78 ** 2, 6)
    expect(stat(male, 'Fat-free mass index')).toBeCloseTo(19.2166, 3)
  })

  test('drives the scale, and the default body reads average', () => {
    const r = compute(male)
    expect(r.scaleValue).toBeCloseTo(stat(male, 'Fat-free mass index'), 10)
    expect(resolveBand(def.scale!, r.scaleValue!)!.id).toBe('neutral')
  })

  test('a heavily muscled frame reaches the athletic band', () => {
    const r = compute({ ...male, weight: 105, height: 178 })
    expect(r.scaleValue).toBeGreaterThan(22)
    expect(resolveBand(def.scale!, r.scaleValue!)!.id).toBe('excellent')
  })

  test('stays in kg/m² for an imperial visitor, like BMI', () => {
    const imperial = {
      ...male,
      units: 'imperial',
      weight: 80 * 2.2046226218487757,
      height: 178 / 2.54,
    }
    expect(stat(imperial, 'Fat-free mass index')).toBeCloseTo(stat(male, 'Fat-free mass index'), 8)
  })
})

describe('units', () => {
  const imperial: Input = {
    units: 'imperial',
    sex: 'male',
    weight: 80 * 2.2046226218487757,
    height: 178 / 2.54,
    bodyFat: 21,
  }

  test('metric and imperial describe the same body', () => {
    expect(primary(imperial) / 2.2046226218487757).toBeCloseTo(primary(male), 8)
    expect(james(imperial) / 2.2046226218487757).toBeCloseTo(james(male), 8)
    expect(hume(imperial) / 2.2046226218487757).toBeCloseTo(hume(male), 8)
  })

  test('results are quoted back in the unit that was typed', () => {
    expect(compute(imperial).primary.format).toMatchObject({ unit: 'lb' })
    expect(compute(male).primary.format).toMatchObject({ unit: 'kg' })
    expect(Number(compute(imperial).partsTotal!.value)).toBe(imperial.weight)
  })
})

describe('the lean-versus-fat split', () => {
  const bodies: Array<readonly [string, Input]> = [
    ['male defaults', male],
    ['female defaults', female],
    ['light', { ...male, weight: 55 }],
    ['heavy', { ...male, weight: 140, height: 190 }],
    ['short', { ...female, weight: 62, height: 152 }],
    ['imperial', { units: 'imperial', sex: 'male', weight: 176, height: 70, bodyFat: 21 }],
    ['imperial female', { units: 'imperial', sex: 'female', weight: 140, height: 65, bodyFat: 30 }],
  ]

  test.each(bodies)('%s: two parts that sum to the entered weight', (_l, v) => {
    const r = compute(v)
    expect(r.parts).toHaveLength(2)
    expect(r.partsTotal!.label).toBe('Body weight')
    expect(Number(r.partsTotal!.value)).toBe(v.weight)
    const sum = r.parts!.reduce((acc, p) => acc + p.value, 0)
    expect(sum).toBeCloseTo(v.weight, 8)
    for (const p of r.parts!) {
      expect(Number.isFinite(p.value)).toBe(true)
      expect(p.value).toBeGreaterThanOrEqual(0)
    }
  })

  test('the parts count never varies with input, so the donut is always drawable', () => {
    const counts = new Set<number>()
    for (const weight of [50, 60, 80, 100, 140, 180])
      for (const height of [130, 155, 178, 200, 220])
        for (const sex of ['male', 'female'])
          for (const bodyFat of [3, 21, 60]) {
            try {
              const r = compute({ units: 'metric', sex, weight, height, bodyFat })
              counts.add(r.parts!.length)
              expect(r.series ?? []).toHaveLength(0)
            } catch (err) {
              expect(err).toBeInstanceOf(CalcError)
            }
          }
    expect([...counts]).toEqual([2])
  })

  test('lean mass is the headline and fat mass is the remainder', () => {
    expect(part(male, 'Lean mass')).toBeCloseTo(primary(male), 10)
    expect(part(male, 'Fat mass')).toBeCloseTo(80 - 60.886, 10)
    expect(stat(male, 'Fat mass')).toBeCloseTo(part(male, 'Fat mass'), 10)
  })
})

describe('rejects impossible input', () => {
  test.each([
    ['a weight of zero', { weight: 0 }, 'weight'],
    ['a height of zero', { height: 0 }, 'height'],
    ['a body fat of zero', { bodyFat: 0 }, 'bodyFat'],
    ['a body fat of 100%', { bodyFat: 100 }, 'bodyFat'],
    ['a negative weight', { weight: -80 }, 'weight'],
    ['an unparseable weight', { weight: Number.NaN }, 'weight'],
    ['an unparseable height', { height: Number.NaN }, 'height'],
    ['an unparseable body fat', { bodyFat: Number.NaN }, 'bodyFat'],
    ['an infinite weight', { weight: Number.POSITIVE_INFINITY }, 'weight'],
    ['centimetres entered while imperial is selected', { units: 'imperial' }, 'height'],
    ['inches entered while metric is selected', { height: 70 }, 'height'],
    // Boer keeps adding 0.267 kg of lean tissue per centimetre regardless of
    // weight, so a very tall, very light frame is predicted to hold more lean
    // mass than the whole person weighs.
    ['lean mass exceeding total body weight', { weight: 50, height: 220 }, 'weight'],
    // James' quadratic term turns the estimate negative at an extreme BMI.
    ['a body the James equation drives below zero', { weight: 180, height: 130 }, 'weight'],
  ])('rejects %s against the right field', (_l, patch, fieldId) => {
    let thrown: unknown
    try {
      compute({ ...male, ...patch })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
  })

  test('never returns a lean mass above body weight, anywhere it answers at all', () => {
    for (const weight of [50, 55, 70, 90, 120, 160, 180])
      for (const height of [130, 150, 170, 190, 210, 220])
        for (const sex of ['male', 'female']) {
          let r
          try {
            r = compute({ units: 'metric', sex, weight, height, bodyFat: 21 })
          } catch (err) {
            expect(err).toBeInstanceOf(CalcError)
            continue
          }
          for (const label of ['James (1976) estimate', 'Hume (1966) estimate']) {
            const value = Number(r.stats!.find((s) => s.label === label)!.value)
            expect(value).toBeGreaterThan(0)
            expect(value).toBeLessThanOrEqual(weight)
          }
          expect(Number(r.primary.value)).toBeLessThanOrEqual(weight)
          expect(Number(r.primary.value)).toBeGreaterThan(0)
        }
  })

  test('the message names the equation that failed', () => {
    expect(() => compute({ ...male, weight: 50, height: 220 })).toThrow(/Boer \(1984\)/)
    expect(() => compute({ ...male, weight: 180, height: 130 })).toThrow(/James \(1976\)/)
  })
})

describe('the bounds the form actually offers', () => {
  /*
   * `field-bounds.test.ts` probes every declared bound with the other fields at
   * their defaults, converting them into the selected unit first. Mirrored here
   * so a bound that compute refuses fails in the fast loop rather than in the
   * full suite — and extended to the female equations, which the registry sweep
   * never reaches because `sex` defaults to male.
   */
  const LB = 2.2046226218487757
  const IN = 0.39370078740157477

  const metric = (patch: Partial<Input>): Input => ({ ...male, ...patch })
  const imperial = (patch: Partial<Input>): Input => ({
    ...male,
    units: 'imperial',
    weight: 80 * LB,
    height: 178 * IN,
    ...patch,
  })

  const probes: Array<readonly [string, Input]> = [
    ['weight metric min', metric({ weight: 50 })],
    ['weight metric max', metric({ weight: 180 })],
    ['weight imperial min', imperial({ weight: 110 })],
    ['weight imperial max', imperial({ weight: 400 })],
    ['height metric min', metric({ height: 130 })],
    ['height metric max', metric({ height: 220 })],
    ['height imperial min', imperial({ height: 52 })],
    ['height imperial max', imperial({ height: 86 })],
    ['body fat min', metric({ bodyFat: 3 })],
    ['body fat max', metric({ bodyFat: 60 })],
  ]

  test.each(probes.flatMap(([label, v]) => [
    [`${label}, male`, v] as const,
    [`${label}, female`, { ...v, sex: 'female' }] as const,
  ]))('%s is a value compute accepts', (_l, v) => {
    const r = compute(v)
    expect(Number.isFinite(Number(r.primary.value))).toBe(true)
    expect(Number(r.primary.value)).toBeGreaterThan(0)
  })

  test('the declared bounds are the ones probed above', () => {
    const byId = Object.fromEntries(fields.map((f) => [f.id, f]))
    expect(byId.weight).toMatchObject({
      variants: { cases: { metric: { min: 50, max: 180 }, imperial: { min: 110, max: 400 } } },
    })
    expect(byId.height).toMatchObject({
      variants: { cases: { metric: { min: 130, max: 220 }, imperial: { min: 52, max: 86 } } },
    })
    expect(byId.bodyFat).toMatchObject({ min: 3, max: 60 })
  })

  test('every number default lands on min + n × step in the base variant', () => {
    for (const field of fields) {
      if (field.kind !== 'number') continue
      const onGrid = (min: number, step: number) => {
        const n = (field.default - min) / step
        expect(Math.abs(n - Math.round(n)), `${field.id}`).toBeLessThan(1e-9)
      }
      onGrid(field.min!, field.step!)
      const base = 'variants' in field ? Object.values(field.variants.cases)[0] : undefined
      if (base && (base.factor ?? 1) === 1) onGrid(base.min ?? field.min!, base.step ?? field.step!)
    }
  })
})

describe('the end-to-end nudge', () => {
  // tests/calculators.spec.ts drives the FIRST number field to 1.1x its default
  // and expects a valid, different result. Weight leads the number fields.
  test('1.1x the default weight is valid and moves every figure', () => {
    const firstNumber = fields.find((f) => f.kind === 'number')!
    expect(firstNumber.id).toBe('weight')

    const nudged = { ...male, weight: male.weight * 1.1 }
    expect(primary(nudged)).toBeCloseTo(64.142, 3)
    expect(primary(nudged)).toBeGreaterThan(primary(male) + 1)
    expect(james(nudged)).toBeGreaterThan(james(male) + 1)
    expect(hume(nudged)).toBeGreaterThan(hume(male) + 1)
    expect(stat(nudged, 'From your body fat')).toBeGreaterThan(stat(male, 'From your body fat'))
  })
})

describe('the definition holds together', () => {
  test('copy fits the search result it is written for', () => {
    expect(def.description.length).toBeGreaterThan(50)
    expect(def.description.length).toBeLessThanOrEqual(160)
    expect(def.seoTitle.length).toBeLessThanOrEqual(70)
    expect(def.faqs.length).toBeGreaterThanOrEqual(3)
    for (const faq of def.faqs) {
      expect(faq.q.endsWith('?')).toBe(true)
      expect(faq.a.length).toBeGreaterThan(40)
    }
    expect(def.disclaimer).toBe('health')
  })

  test('scale bands are ordered and contiguous', () => {
    const { bands, min, max } = def.scale!
    expect(min).toBeLessThan(max)
    bands.forEach((band, i) => {
      expect(band.from).toBeLessThan(band.to)
      if (i > 0) expect(band.from).toBe(bands[i - 1]!.to)
    })
  })

  test('says plainly that these are estimates rather than a measurement', () => {
    const notes = compute(male).notes!.join(' ')
    expect(notes).toMatch(/population estimates, not measurements/)
    expect(notes).toMatch(/DEXA|calipers/)
  })
})

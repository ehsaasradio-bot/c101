import { describe, expect, test } from 'vitest'
import compute from './compute'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'

const base = { mode: 'adult-metric', height: 178, weight: 80 } as const
type Input = { mode: string; height: number; weight: number }

const MODES = ['adult-metric', 'adult-imperial', 'infant-metric', 'infant-imperial'] as const

const bsa = (r: ReturnType<typeof compute>) => Number(r.primary.value)
const stat = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label.startsWith(label))!.value)

/** The headline plus the four shown alongside it, in one array. */
const allFive = (r: ReturnType<typeof compute>) => [
  bsa(r),
  stat(r, 'Du Bois'),
  stat(r, 'Haycock'),
  stat(r, 'Gehan'),
  stat(r, 'Boyd'),
]

describe('body surface area', () => {
  describe('the headline, Mosteller', () => {
    test('178 cm and 80 kg is 1.99 m²', () => {
      // sqrt(178 x 80 / 3600) = sqrt(14240/3600) = sqrt(3.955555...) = 1.98886
      expect(bsa(compute(base))).toBeCloseTo(1.98886, 5)
      expect(bsa(compute(base))).toBeCloseTo(Math.sqrt((178 * 80) / 3600), 12)
    })

    test('matches the published 0.016667 x sqrt(W) x sqrt(H) form of the same rule', () => {
      // Mosteller circulates in two shapes: sqrt(H x W / 3600) and
      // 0.016667 x W^0.5 x H^0.5. They are the same rule, since 1/60 = 0.016666...
      // and 60² = 3600 — so this catches a mistyped divisor (a 360 or a 36000
      // would be out by a factor of ~3.2 or ~10).
      //
      // They are the same rule only through the UNROUNDED 1/60. The published
      // 0.016667 is that constant rounded to five decimal places, so it is high
      // by 3.3333e-7 — a relative error of exactly 2.0e-5, identical for every
      // input because the constant is a plain multiplier. That error grows with
      // the answer (4.0e-5 m² at 2.0 m², 5.2e-5 m² at 2.58 m²), so no fixed
      // absolute tolerance is meaningful here; any that passes at one body size
      // fails at a larger one. The two assertions below are therefore split:
      // exact against 1/60, and relative against the printed constant with the
      // bound set by that constant's own rounding rather than by whatever makes
      // the test go green.
      const CONSTANT_ROUNDING = 2.1e-5 // (0.016667 - 1/60) / (1/60) = 2.0e-5
      for (const [h, w] of [
        [178, 80],
        [150, 45],
        [200, 120],
      ]) {
        const ours = bsa(compute({ ...base, height: h!, weight: w! }))
        expect(ours).toBeCloseTo((1 / 60) * Math.sqrt(w!) * Math.sqrt(h!), 12)
        const published = 0.016667 * Math.sqrt(w!) * Math.sqrt(h!)
        expect(Math.abs(ours / published - 1)).toBeLessThan(CONSTANT_ROUNDING)
      }
    })
  })

  describe('the other four formulas', () => {
    test('each lands on its own hand-worked value at the defaults', () => {
      // Worked from the published coefficients at 178 cm / 80 kg:
      //   Du Bois   0.007184 x 80^0.425 x 178^0.725
      //   Haycock   0.024265 x 178^0.3964 x 80^0.5378
      //   Gehan     0.0235   x 178^0.42246 x 80^0.51456
      //   Boyd      0.0003207 x 178^0.3 x 80000^(0.7285 - 0.0188 log10 80000)
      //
      // Evaluated to 40 significant figures with arbitrary-precision arithmetic
      // outside this codebase, not with the doubles under test, and quoted here
      // to ten decimal places:
      //   Du Bois 1.98031405490282236   Haycock 1.99769222603727195
      //   Gehan   2.00001973090176194   Boyd    2.00063811022439155
      // The earlier five-decimal literals here (1.98026, 1.99765, 1.99997) were
      // hand-rounded a few units in the fifth place and were simply wrong; the
      // implementation was right. Pinned to nine places, roughly a million times
      // tighter than the loosest tolerance that would have hidden that.
      const r = compute(base)
      expect(stat(r, 'Du Bois')).toBeCloseTo(1.9803140549, 9)
      expect(stat(r, 'Haycock')).toBeCloseTo(1.997692226, 9)
      expect(stat(r, 'Gehan')).toBeCloseTo(2.0000197309, 9)
      expect(stat(r, 'Boyd')).toBeCloseTo(2.0006381102, 9)
    })

    /**
     * An INDEPENDENT check of Boyd, not a restatement.
     *
     * Boyd also circulates in a kilogram-native form with entirely different
     * constants: 0.03330 x W^(0.6157 - 0.0188 log10 W) x H^0.3. That is the
     * gram form with Wg = 1000W substituted through — 10^(3 x 0.7285 - ...)
     * folds into the leading coefficient and 3 x 0.0188 = 0.0564 comes off the
     * exponent. Feeding kilograms to the gram-native coefficients (the obvious
     * mistake) reads about 25% low, which this catches and no self-consistent
     * check would.
     */
    test('Boyd agrees with the kilogram-native form of the same equation', () => {
      const boydKg = (h: number, w: number) =>
        0.0333 * Math.pow(w, 0.6157 - 0.0188 * Math.log10(w)) * Math.pow(h, 0.3)
      for (const [h, w] of [
        [178, 80],
        [110, 20],
        [160, 60],
        [250, 300],
      ]) {
        const ours = stat(compute({ ...base, height: h!, weight: w! }), 'Boyd')
        // The published 0.03330 is a rounding of the exact 0.033297, so the two
        // agree to about one part in ten thousand rather than exactly.
        expect(Math.abs(ours / boydKg(h!, w!) - 1)).toBeLessThan(0.0005)
      }
    })

    /**
     * A structural check that touches every exponent at once.
     *
     * Area scales as the square of a linear dimension, and mass as its cube. So
     * scaling height by k and weight by k³ must scale BSA by very nearly k² —
     * which is exactly true for Du Bois (0.725 + 3 x 0.425 = 2.000) and for
     * Mosteller (0.5 + 3 x 0.5 = 2), and true to about 1% for the three fitted
     * later. A transposed digit in any exponent breaks this immediately.
     */
    test('every formula is near-homogeneous of degree two in linear size', () => {
      const at = compute(base)
      for (const k of [0.7, 0.85, 1.2, 1.35]) {
        const scaled = compute({ ...base, height: 178 * k, weight: 80 * k ** 3 })
        allFive(scaled).forEach((value, i) => {
          expect(value / allFive(at)[i]! / (k * k)).toBeCloseTo(1, 1)
        })
      }
    })
  })

  describe('the formulas agree with each other', () => {
    test('within about 1% for the default body', () => {
      const five = allFive(compute(base))
      const lo = Math.min(...five)
      const hi = Math.max(...five)
      // Same arbitrary-precision values as above, to nine places.
      expect(lo).toBeCloseTo(1.9803140549, 9) // Du Bois, the oldest fit, reads lowest
      expect(hi).toBeCloseTo(2.0006381102, 9) // Boyd reads highest
      expect((hi - lo) / ((hi + lo) / 2)).toBeLessThan(0.011)
    })

    test(
      'within 5% across every adult body of healthy weight',
      () => {
        let worst = 0
        for (let h = 155; h <= 195; h += 1) {
          for (let w = 40; w <= 140; w += 1) {
            const bmi = w / (h / 100) ** 2
            if (bmi < 18.5 || bmi > 25) continue
            const five = allFive(compute({ ...base, height: h, weight: w }))
            const lo = Math.min(...five)
            const hi = Math.max(...five)
            worst = Math.max(worst, (hi - lo) / ((hi + lo) / 2))
          }
        }
        // Disagreement beyond a few percent here would mean a wrong coefficient,
        // not a genuine difference of opinion between the sources.
        expect(worst).toBeGreaterThan(0.005)
        expect(worst).toBeLessThan(0.05)
      },
      30_000,
    )

    test('all five sit near the published population averages', () => {
      // Reference figures widely quoted for BSA: about 1.9 m² for an average
      // adult man, 1.6 m² for an average adult woman, 1.1 m² at ten years old.
      const near = (h: number, w: number, expected: number) => {
        for (const value of allFive(compute({ ...base, height: h, weight: w }))) {
          expect(Math.abs(value - expected)).toBeLessThan(0.1)
        }
      }
      near(175, 75, 1.9)
      near(163, 60, 1.6)
      near(140, 32, 1.1)
    })
  })

  describe('the reported spread', () => {
    test('brackets all five and matches their range', () => {
      for (const v of [base, { ...base, height: 160, weight: 55 }, { ...base, weight: 140 }]) {
        const r = compute(v)
        const five = allFive(r)
        const lo = Math.min(...five)
        const hi = Math.max(...five)
        expect(stat(r, 'Lowest to highest')).toBeCloseTo(hi - lo, 12)
        expect(stat(r, 'Disagreement')).toBeCloseTo(((hi - lo) / ((hi + lo) / 2)) * 100, 10)
      }
    })

    test('the note states the range in plain words', () => {
      const r = compute(base)
      expect(r.notes![0]).toContain('1.980')
      expect(r.notes![0]).toContain('2.001')
      expect(r.notes![0]).toContain('0.020')
    })

    test('says plainly that this is not a dosing instrument', () => {
      const notes = compute(base).notes!.join(' ')
      expect(notes).toContain('not a dosing instrument')
      expect(notes.toLowerCase()).toContain('chemotherapy')
    })
  })

  describe('units', () => {
    test('imperial and metric describe the same body', () => {
      const metric = compute(base)
      const imperial = compute({
        mode: 'adult-imperial',
        height: 178 / 2.54,
        weight: 80 * 2.2046226218487757,
      })
      allFive(imperial).forEach((value, i) => {
        expect(value).toBeCloseTo(allFive(metric)[i]!, 10)
      })
    })

    test('the worked steps restate the input in centimetres and kilograms', () => {
      const r = compute({ mode: 'adult-imperial', height: 70, weight: 176 })
      const steps = r.steps!.filter((s): s is Exclude<typeof s, { rule: true }> => !('rule' in s))
      expect(Number(steps.find((s) => s.label === 'Height')!.value)).toBeCloseTo(177.8, 6)
      expect(Number(steps.find((s) => s.label === 'Weight')!.value)).toBeCloseTo(79.8322, 3)
    })
  })

  describe('infants', () => {
    // The reason this mode exists. Before it, the form floored height at 105 cm
    // and compute refused anything under a metre, while the page advertised
    // Haycock — a formula fitted from neonates upward — and quoted a newborn
    // figure in its own FAQ. It described a calculation it would not perform.
    const newborn = { mode: 'infant-metric', height: 50, weight: 3.5 } as const

    test('accepts a term newborn and puts it where the literature does', () => {
      const r = compute(newborn)
      // 50 cm and 3.5 kg: sqrt(50 x 3.5 / 3600) = 0.2205 by Mosteller, and all
      // five land in 0.209-0.234. Checked against the published forms in
      // FORMULAS above, not against a reference site.
      expect(bsa(r)).toBeCloseTo(0.2205, 4)
      for (const value of allFive(r)) {
        expect(value).toBeGreaterThan(0.2)
        expect(value).toBeLessThan(0.24)
      }
    })

    test('the FAQ figure for a newborn agrees with what this computes', () => {
      // The FAQ says 0.21-0.23 and calls the commonly quoted 0.25 high. That
      // claim is only safe while the numbers below hold.
      const five = allFive(compute(newborn))
      // Rounded the way the page prints them, to two decimals. Du Bois is
      // 0.2086, which reads as 0.21 but fails a raw `>= 0.21` — the claim is
      // about what a visitor sees, so the test rounds the same way.
      const round2 = (x: number) => Number(x.toFixed(2))
      expect(round2(Math.min(...five))).toBe(0.21)
      expect(round2(Math.max(...five))).toBe(0.23)
      // And the round 0.25 the FAQ calls high really is above all five.
      expect(Math.max(...five)).toBeLessThan(0.25)
    })

    test('imperial infants describe the same baby', () => {
      const metric = compute(newborn)
      const imperial = compute({
        mode: 'infant-imperial',
        height: 50 / 2.54,
        weight: 3.5 * 2.2046226218487757,
      })
      allFive(imperial).forEach((value, i) => {
        expect(value).toBeCloseTo(allFive(metric)[i]!, 10)
      })
    })

    test('names Haycock in the notes, since that is the one to read here', () => {
      const notes = compute(newborn).notes!.join(' ')
      expect(notes).toContain('Haycock')
      // And the adult wording does not, beyond the passing mention.
      expect(compute(base).notes!.join(' ')).toContain('Mosteller is the headline')
    })

    test('an adult height in infant mode is refused rather than answered', () => {
      // The whole point of asking: 178 cm is not a baby, and silently returning
      // 1.98 m2 for one would be worse than an error.
      expect(() => compute({ mode: 'infant-metric', height: 178, weight: 3.5 })).toThrow(CalcError)
      expect(() => compute({ mode: 'infant-metric', height: 50, weight: 80 })).toThrow(CalcError)
    })

    test('a newborn is still refused in adult mode, so the guard did not just move', () => {
      expect(() => compute({ mode: 'adult-metric', height: 50, weight: 3.5 })).toThrow(CalcError)
    })
  })

  describe('refusals', () => {
    test.each([
      ['an unparseable height', { height: Number.NaN }, 'height'],
      ['an unparseable weight', { weight: Number.NaN }, 'weight'],
      ['a zero height', { height: 0 }, 'height'],
      ['a zero weight', { weight: 0 }, 'weight'],
      ['a negative height', { height: -178 }, 'height'],
      ['centimetres entered while imperial is selected', { mode: 'adult-imperial' }, 'height'],
      ['inches entered while metric is selected', { height: 70 }, 'height'],
      ['a weight no body has ever reached', { weight: 900 }, 'weight'],
    ])('rejects %s against its own field', (_label, patch, fieldId) => {
      let thrown: unknown
      try {
        compute({ ...base, ...patch } as Input)
      } catch (err) {
        thrown = err
      }
      expect(thrown).toBeInstanceOf(CalcError)
      expect((thrown as CalcError).fieldId).toBe(fieldId)
    })

    test('never returns NaN or a non-finite area', () => {
      for (const v of [base, { ...base, height: 105, weight: 20 }, { ...base, height: 250, weight: 300 }]) {
        for (const value of allFive(compute(v))) {
          expect(Number.isFinite(value)).toBe(true)
          expect(value).toBeGreaterThan(0)
        }
      }
    })
  })

  describe('result shape', () => {
    test('the stat and step counts never vary with input', () => {
      const shapes = [
        base,
        { ...base, height: 105, weight: 20 },
        { ...base, height: 250, weight: 300 },
        { mode: 'adult-imperial', height: 70, weight: 176 },
      ].map((v) => {
        const r = compute(v as Input)
        return [r.stats!.length, r.steps!.length, r.notes!.length]
      })
      for (const shape of shapes) expect(shape).toEqual(shapes[0])
    })

    test('claims no proportion and no trend, so emits no parts and no series', () => {
      const r = compute(base)
      expect(r.parts).toBeUndefined()
      expect(r.series).toBeUndefined()
    })
  })

  describe('field bounds', () => {
    const numberField = (id: string) => {
      const f = fields.find((x) => x.id === id)!
      if (f.kind !== 'number') throw new Error(`${id} is not a number field`)
      return f
    }

    test('every bound each variant offers is a value compute accepts', () => {
      const height = numberField('height').variants!.cases
      const weight = numberField('weight').variants!.cases
      for (const mode of MODES) {
        const h = height[mode]!
        const w = weight[mode]!
        for (const hv of [h.min!, h.max!]) {
          for (const wv of [w.min!, w.max!]) {
            expect(() => compute({ mode, height: hv, weight: wv })).not.toThrow()
          }
        }
      }
    })

    test('the two unit systems describe the same real body', () => {
      // 98 in is 248.9 cm and 660 lb is 299.4 kg — each imperial cap is the
      // metric cap in other clothes, not a wider or narrower range. Same for
      // the infant pair: 43 in is 109.2 cm and 66 lb is 29.9 kg.
      expect(Math.abs(98 * 2.54 - 250)).toBeLessThan(2)
      expect(Math.abs(660 / 2.2046226218487757 - 300)).toBeLessThan(1)
      expect(Math.abs(43 * 2.54 - 110)).toBeLessThan(1)
      expect(Math.abs(66 / 2.2046226218487757 - 30)).toBeLessThan(1)
      // And the top-level pair stays the union of all four.
      expect(numberField('height').max).toBe(250)
      expect(numberField('weight').max).toBe(660)
      expect(numberField('height').min).toBe(14)
      expect(numberField('weight').min).toBe(0.5)
    })

    test('defaults land on the slider grid in the base variant', () => {
      for (const id of ['height', 'weight']) {
        const f = numberField(id)
        // Every case, not just the base: an HTML range snaps to min + n x step,
        // so a default off any offered grid shifts on first interaction.
        for (const [min, step] of [
          [f.min!, f.step!],
          ...MODES.map((m) => [f.variants!.cases[m]!.min!, f.variants!.cases[m]!.step!]),
        ]) {
          const n = (f.default - min!) / step!
          expect(Math.abs(n - Math.round(n))).toBeLessThan(1e-9)
        }
      }
    })

    test('the e2e nudge to the first number field stays valid and moves the answer', () => {
      // tests/calculators.spec.ts sets the first number field to 1.1x its default.
      const nudged = compute({ ...base, height: 178 * 1.1 })
      expect(bsa(nudged)).toBeGreaterThan(bsa(compute(base)) + 0.05)
      expect(178 * 1.1).toBeLessThanOrEqual(
        numberField('height').variants!.cases['adult-metric']!.max!,
      )
    })
  })
})

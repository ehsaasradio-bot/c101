import { describe, expect, test } from 'vitest'
import compute, { BAND_EDGES, WHO_WHR_CUTOFF } from './compute'
import def from './index'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'
import type { NumberField } from '../../../lib/types'
import { resolveBand } from '../../../lib/view'

/** The form's own defaults, as `defaultValues` would build them. */
const base = {
  units: 'metric',
  sex: 'male',
  waist: 88,
  hip: 102,
  height: 180,
}

/** Widened deliberately, so a partial override is not pinned to the literals. */
type Input = typeof base
const at = (patch: Partial<Input>) => compute({ ...base, ...patch } as never)
const whr = (patch: Partial<Input>) => Number(at(patch).primary.value)
const share = (patch: Partial<Input>) => at(patch).scaleValue!
const bandOf = (patch: Partial<Input>) => resolveBand(def.scale, at(patch).scaleValue!)!

const stat = (r: ReturnType<typeof compute>, label: string) =>
  r.stats!.find((s) => s.label === label)!.value

const numberFields = fields.filter((f) => f.kind === 'number') as unknown as NumberField[]
const numberField = (id: string) => numberFields.find((f) => f.id === id)!

const IN_PER_CM = 0.39370078740157477
const CM_PER_IN = 2.54

/**
 * A ratio worked out by INTEGER long division, digit by digit, with no floating
 * point anywhere. Restating `a / b` in a test proves nothing — this is a
 * genuinely different route to the same number, so a transposed numerator and
 * denominator or a stray unit conversion cannot survive it.
 */
function longDivide(numerator: number, denominator: number, digits: number): number {
  let remainder = numerator % denominator
  let out = Math.floor(numerator / denominator)
  let place = 1
  for (let i = 0; i < digits; i++) {
    remainder *= 10
    place /= 10
    out += Math.floor(remainder / denominator) * place
    remainder %= denominator
  }
  return out
}

describe('waist-hip — the ratio itself', () => {
  test('the headline is waist divided by hip, confirmed by integer long division', () => {
    // Derived: 88 / 102, which reduces to 44 / 51.
    expect(whr({})).toBeCloseTo(88 / 102, 15)
    expect(whr({})).toBeCloseTo(44 / 51, 15)
    // Second, independent route: long division in integers.
    expect(whr({})).toBeCloseTo(longDivide(88, 102, 12), 11)
    expect(whr({})).toBeCloseTo(0.862745098039, 11)

    // …and a handful more, each checked the same second way.
    for (const [waist, hip] of [
      [80, 100],
      [90, 100],
      [102, 96],
      [74, 99],
      [110, 105],
    ]) {
      expect(whr({ waist, hip })).toBeCloseTo(longDivide(waist!, hip!, 12), 11)
    }
  })

  test('the ratio inverts cleanly — ratio × hip is the waist that was typed', () => {
    for (const waist of [45, 68, 88, 121, 176]) {
      for (const hip of [55, 82, 102, 143, 199]) {
        expect(whr({ waist, hip }) * hip).toBeCloseTo(waist, 9)
      }
    }
  })

  test('the ratio is dimensionless, so it is scale- and unit-invariant', () => {
    // Doubling both measurements cannot move a proportion.
    expect(whr({ waist: 176, hip: 204 })).toBeCloseTo(whr({}), 15)
    // Nor can restating the same body in inches. Switching units converts what
    // the visitor already typed — 88 cm becomes 34.65 in, not 88 in — so the
    // physical body is unchanged and the ratio must be identical.
    expect(
      whr({ units: 'imperial', waist: 88 * IN_PER_CM, hip: 102 * IN_PER_CM, height: 180 * IN_PER_CM }),
    ).toBeCloseTo(whr({}), 15)
  })
})

describe('waist-hip — the WHO cut-offs, exactly and on both sides', () => {
  /*
   * WHO 2008 expert consultation (report published 2011): substantially
   * increased risk of metabolic complications at a waist-hip ratio of 0.90 or
   * more in men, and 0.85 or more in women. The bands are half-open at the
   * bottom — "or more" — so exactly 0.90 is ON the wrong side for a man.
   *
   * A hip of 100 makes the ratio the waist itself divided by 100, which lands
   * exactly on the double the cut-off constant holds, so `scaleValue` comes out
   * as exactly 100 rather than near it. Both sides are then probed with an
   * explicit 1e-6 offset: `Number.EPSILON` is the gap at 1.0 and would vanish
   * entirely when added to a waist of 90.
   */
  const OFFSET = 1e-6

  test('the constants are the published ones', () => {
    expect(WHO_WHR_CUTOFF.male).toBe(0.9)
    expect(WHO_WHR_CUTOFF.female).toBe(0.85)
  })

  test.each([
    ['male', 0.9],
    ['female', 0.85],
  ])('%s: a ratio of exactly the cut-off normalises to exactly 100', (sex, cutoff) => {
    const waist = 100 * cutoff
    expect(whr({ sex, waist, hip: 100 })).toBe(cutoff)
    expect(share({ sex, waist, hip: 100 })).toBe(100)
    expect(bandOf({ sex, waist, hip: 100 }).id).toBe('warn')
    expect(Number(stat(at({ sex, waist, hip: 100 }), 'Share of the WHO cut-off'))).toBe(100)
  })

  test.each([
    ['male', 0.9],
    ['female', 0.85],
  ])('%s: one hair below the cut-off is still below it', (sex, cutoff) => {
    const waist = 100 * cutoff! - OFFSET
    expect(share({ sex, waist, hip: 100 })).toBeLessThan(100)
    expect(share({ sex, waist, hip: 100 })).toBeGreaterThan(99.99)
    expect(bandOf({ sex, waist, hip: 100 }).id).toBe('neutral')
    expect(bandOf({ sex, waist, hip: 100 }).label).toBe('Below the WHO cut-off for your sex')
  })

  test.each([
    ['male', 0.9],
    ['female', 0.85],
  ])('%s: one hair above the cut-off has crossed it', (sex, cutoff) => {
    const waist = 100 * cutoff! + OFFSET
    expect(share({ sex, waist, hip: 100 })).toBeGreaterThan(100)
    expect(bandOf({ sex, waist, hip: 100 }).id).toBe('warn')
    expect(bandOf({ sex, waist, hip: 100 }).label).toContain('substantially increased risk')
  })

  test('the two thresholds really are different — 0.87 straddles them', () => {
    // The whole reason the meter reads a normalised value rather than the raw
    // ratio: one number, two verdicts.
    expect(whr({ waist: 87, hip: 100 })).toBe(0.87)
    expect(share({ sex: 'male', waist: 87, hip: 100 })).toBeCloseTo((0.87 / 0.9) * 100, 12)
    expect(share({ sex: 'female', waist: 87, hip: 100 })).toBeCloseTo((0.87 / 0.85) * 100, 12)
    expect(bandOf({ sex: 'male', waist: 87, hip: 100 }).id).toBe('neutral')
    expect(bandOf({ sex: 'female', waist: 87, hip: 100 }).id).toBe('warn')
  })

  test('the cut-off is reported, and inverted into a waist target', () => {
    const men = at({})
    expect(Number(stat(men, 'WHO cut-off for men'))).toBe(0.9)
    // 102 x 0.90 — the waist that would sit exactly on the line at this hip.
    expect(Number(stat(men, 'Waist that meets the cut-off'))).toBeCloseTo(91.8, 9)
    expect(whr({ waist: Number(stat(men, 'Waist that meets the cut-off')) })).toBeCloseTo(0.9, 12)

    const women = at({ sex: 'female' })
    expect(Number(stat(women, 'WHO cut-off for women'))).toBe(0.85)
    expect(Number(stat(women, 'Waist that meets the cut-off'))).toBeCloseTo(86.7, 9)
    expect(whr({ waist: Number(stat(women, 'Waist that meets the cut-off')) })).toBeCloseTo(0.85, 12)
  })

  test('every ratio either side of both cut-offs is banded consistently', () => {
    // A sweep rather than spot values: the band the meter points at must agree
    // with a plain comparison against the published threshold, everywhere.
    for (const sex of ['male', 'female']) {
      const cutoff = sex === 'female' ? 0.85 : 0.9
      for (let waist = 40; waist <= 200; waist += 0.5) {
        for (const hip of [70, 95, 102, 130]) {
          const ratio = waist / hip
          const band = bandOf({ sex, waist, hip })
          const overTheLine = band.id === 'warn' || band.id === 'critical'
          expect(overTheLine, `${sex} ${waist}/${hip} = ${ratio}`).toBe(ratio >= cutoff)
        }
      }
    }
  }, 30_000)
})

describe('waist-hip — waist-to-height ratio', () => {
  /*
   * The rule of thumb is to keep the waist under half the height, i.e. below
   * 0.5. NICE (NG246, 2025) bands it 0.4-0.49 healthy, 0.5-0.59 increased,
   * 0.6 or more high.
   */
  const whtr = (patch: Partial<Input>) => Number(stat(at(patch), 'Waist-to-height ratio'))
  const whtrBand = (patch: Partial<Input>) => String(stat(at(patch), 'Waist-to-height band'))

  test('it is the waist divided by the height, and dimensionless with it', () => {
    expect(whtr({})).toBeCloseTo(88 / 180, 15)
    expect(whtr({})).toBeCloseTo(longDivide(880, 1800, 12), 11)
    expect(whtr({})).toBeCloseTo(0.488888888889, 11)
    expect(
      whtr({ units: 'imperial', waist: 88 * IN_PER_CM, hip: 102 * IN_PER_CM, height: 180 * IN_PER_CM }),
    ).toBeCloseTo(whtr({}), 12)
  })

  test('"under half your height" is exactly the 0.5 boundary', () => {
    // Half of 180 is 90. A waist of 89.9999 is healthy; 90 is not.
    expect(whtr({ waist: 90 })).toBe(0.5)
    expect(whtrBand({ waist: 90 })).toBe('Increased — waist over half your height')
    expect(whtrBand({ waist: 90 - 1e-6 })).toBe('Healthy — waist under half your height')
    expect(whtrBand({ waist: 90 + 1e-6 })).toBe('Increased — waist over half your height')
  })

  test('the NICE bands sit on 0.4, 0.5 and 0.6', () => {
    // Height 200 makes the boundaries land on whole centimetres: 80, 100, 120.
    expect(whtrBand({ height: 200, waist: 79.9 })).toBe('Under 0.4 — below the healthy band')
    expect(whtrBand({ height: 200, waist: 80 })).toBe('Healthy — waist under half your height')
    expect(whtrBand({ height: 200, waist: 99.9 })).toBe('Healthy — waist under half your height')
    expect(whtrBand({ height: 200, waist: 100 })).toBe('Increased — waist over half your height')
    expect(whtrBand({ height: 200, waist: 119.9 })).toBe('Increased — waist over half your height')
    expect(whtrBand({ height: 200, waist: 120 })).toBe('High — waist at least 0.6 of your height')
  })

  test('half the height is printed in the steps, in whatever unit was typed', () => {
    const metric = at({})
    const half = metric.steps!.find((s) => 'label' in s && s.label === 'Half your height')!
    expect((half as { value: number }).value).toBe(90)
    expect((half as { format: { unit?: string } }).format.unit).toBe('cm')

    const imperialSteps = at({ units: 'imperial', waist: 34.5, hip: 40, height: 70 }).steps!
    const halfIn = imperialSteps.find((s) => 'label' in s && s.label === 'Half your height')!
    expect((halfIn as { value: number }).value).toBe(35)
    expect((halfIn as { format: { unit?: string } }).format.unit).toBe('in')
  })

  test('the height field moves the waist-to-height ratio and nothing else', () => {
    // Height is not part of the waist-hip ratio, so it must not touch the
    // headline or the meter.
    expect(whr({ height: 150 })).toBe(whr({ height: 210 }))
    expect(share({ height: 150 })).toBe(share({ height: 210 }))
    expect(whtr({ height: 150 })).toBeGreaterThan(whtr({ height: 210 }))
  })
})

describe('waist-hip — defaults and the end-to-end nudge', () => {
  test('the headline at the defaults', () => {
    const r = at({})
    expect(Number(r.primary.value)).toBeCloseTo(0.8627450980392157, 15)
    expect(r.primary.label).toBe('Waist-to-hip ratio')
    expect(r.primary.format).toEqual({ style: 'decimal', decimals: 2 })
    // Printed to two places, the headline reads 0.86.
    expect(Number(r.primary.value).toFixed(2)).toBe('0.86')
    expect(r.scaleValue).toBeCloseTo(95.86056644880174, 9)
    expect(resolveBand(def.scale, r.scaleValue!)!.id).toBe('neutral')
    expect(resolveBand(def.scale, r.scaleValue!)!.label).toBe(
      'Below the WHO cut-off for your sex',
    )
    expect(Number(stat(r, 'Waist-to-height ratio'))).toBeCloseTo(0.4888888888888889, 15)
    expect(String(stat(r, 'Waist-to-height band'))).toBe('Healthy — waist under half your height')
  })

  test('the first number field is waist, and 1.1x its default crosses the cut-off', () => {
    // tests/calculators.spec.ts nudges the FIRST number field to 1.1x, fixed to
    // four places, and expects a valid, different result.
    const first = numberFields[0]!
    expect(first.id).toBe('waist')
    const nudged = Number((first.default * 1.1).toFixed(4))
    expect(nudged).toBe(96.8)
    const metric = first.variants!.cases.metric!
    expect(nudged).toBeGreaterThanOrEqual(metric.min!)
    expect(nudged).toBeLessThanOrEqual(metric.max!)
    expect(whr({ waist: nudged })).toBeCloseTo(96.8 / 102, 15)
    expect(whr({ waist: nudged })).not.toBeCloseTo(whr({}), 3)
    // …and it genuinely moves the verdict, not only the number.
    expect(share({ waist: nudged })).toBeCloseTo(105.44662309368192, 9)
    expect(bandOf({ waist: nudged }).id).toBe('warn')
  })

  test('the default is clear of every band boundary', () => {
    // A default sitting on an edge looks broken the moment the label disagrees
    // with the number.
    for (const edge of def.scale.bands.flatMap((b) => [b.from, b.to])) {
      expect(Math.abs(at({}).scaleValue! - edge)).toBeGreaterThan(1)
    }
  })
})

describe('waist-hip — unit variants', () => {
  const varied = ['waist', 'hip', 'height'] as const

  test('the first case listed is the base, at factor 1', () => {
    for (const id of varied) {
      const cases = numberField(id).variants!.cases
      const [baseKey] = Object.keys(cases)
      expect(baseKey).toBe('metric')
      expect(cases[baseKey!]!.factor ?? 1).toBe(1)
    }
  })

  test('the declared factor is exactly inches per centimetre', () => {
    for (const id of varied) {
      expect(numberField(id).variants!.cases.imperial!.factor!).toBeCloseTo(1 / CM_PER_IN, 15)
    }
  })

  test('the top-level pair is exactly the union of the cases', () => {
    for (const id of varied) {
      const field = numberField(id)
      const cases = Object.values(field.variants!.cases)
      expect(field.min).toBe(Math.min(...cases.map((c) => c.min!)))
      expect(field.max).toBe(Math.max(...cases.map((c) => c.max!)))
    }
  })

  test('the two cases of each variant cover the same real range, to a centimetre', () => {
    for (const id of varied) {
      const { metric, imperial } = numberField(id).variants!.cases as Record<
        string,
        { min: number; max: number }
      >
      expect(Math.abs(imperial!.min * CM_PER_IN - metric!.min)).toBeLessThan(1.5)
      expect(Math.abs(imperial!.max * CM_PER_IN - metric!.max)).toBeLessThan(1.5)
    }
  })

  test('the same body measured in inches gives the same everything', () => {
    const metric = at({})
    const inches = at({
      units: 'imperial',
      waist: 88 * IN_PER_CM,
      hip: 102 * IN_PER_CM,
      height: 180 * IN_PER_CM,
    })
    expect(Number(inches.primary.value)).toBeCloseTo(Number(metric.primary.value), 12)
    expect(inches.scaleValue!).toBeCloseTo(metric.scaleValue!, 12)
    expect(String(stat(inches, 'Waist-to-height band'))).toBe(
      String(stat(metric, 'Waist-to-height band')),
    )
    // Lengths are quoted back in the unit that was typed.
    expect(Number(stat(inches, 'Waist that meets the cut-off'))).toBeCloseTo(91.8 * IN_PER_CM, 9)
  })
})

describe('waist-hip — every declared bound is a value compute accepts', () => {
  /*
   * A number field renders as a slider spanning its RESOLVED min..max, so both
   * ends are one drag away. A bound compute rejects is a control offering a
   * value the calculator refuses.
   *
   * A field with variants is probed only at its per-case bounds, never at its
   * top-level union, because the form never draws the union as a control — and
   * here the union would be nonsense in one unit by construction: 39 is a real
   * height in inches and an impossible one in centimetres, which is exactly what
   * the unit-sanity guard exists to catch.
   *
   * The other fields are converted into the unit under test first, so the probe
   * describes a form state that can actually occur.
   */
  const stateFor = (units: string): Partial<Input> =>
    units === 'imperial'
      ? {
          units,
          waist: base.waist * IN_PER_CM,
          hip: base.hip * IN_PER_CM,
          height: base.height * IN_PER_CM,
        }
      : { units }

  const probes: Array<[string, Partial<Input>]> = []
  for (const field of numberFields) {
    for (const [units, variant] of Object.entries(field.variants!.cases)) {
      for (const end of ['min', 'max'] as const) {
        probes.push([
          `${field.id}:units=${units}:${end}=${variant[end]}`,
          { ...stateFor(units), [field.id]: variant[end] } as Partial<Input>,
        ])
      }
    }
  }

  test('every number field contributes both ends of both cases', () => {
    expect(probes.length).toBe(12)
  })

  test.each(probes)('%s computes to a finite, positive ratio', (_key, patch) => {
    const result = at(patch)
    const value = Number(result.primary.value)
    expect(Number.isFinite(value)).toBe(true)
    expect(value).toBeGreaterThan(0)
    expect(Number.isFinite(result.scaleValue!)).toBe(true)
    expect(result.scaleValue!).toBeGreaterThan(0)
    // Every reachable position resolves to a band, so the meter is never blank.
    expect(resolveBand(def.scale, result.scaleValue!)).toBeDefined()
  })

  test('every default sits inside its own bounds, base variant included', () => {
    for (const field of numberFields) {
      expect(field.default).toBeGreaterThanOrEqual(field.min!)
      expect(field.default).toBeLessThanOrEqual(field.max!)
      const [baseKey] = Object.keys(field.variants!.cases)
      const baseCase = field.variants!.cases[baseKey!]!
      expect(field.default).toBeGreaterThanOrEqual(baseCase.min!)
      expect(field.default).toBeLessThanOrEqual(baseCase.max!)
    }
  })

  test('every default lands on min + n x step in each non-converting variant', () => {
    // A range input snaps to min + n x step, so a default off that grid shifts
    // silently the moment anyone touches the slider. The imperial cases convert,
    // and no step lands a converted quantity on a grid, so they are exempt by
    // nature — it is the base case and the top-level pair that must line up.
    for (const field of numberFields) {
      const [baseKey] = Object.keys(field.variants!.cases)
      const baseCase = field.variants!.cases[baseKey!]!
      const grids: Array<[string, number, number]> = [
        [field.id, field.min!, field.step!],
        [`${field.id}[${baseKey}]`, baseCase.min!, baseCase.step!],
      ]
      for (const [key, min, step] of grids) {
        const n = (field.default - min) / step
        expect(Math.abs(n - Math.round(n)), `${key} default is off the slider grid`).toBeLessThan(
          1e-9,
        )
      }
    }
  })

  test('no hip slider can be dragged onto a division by zero', () => {
    const hip = numberField('hip')
    expect(hip.min!).toBeGreaterThan(0)
    for (const variant of Object.values(hip.variants!.cases)) {
      expect(variant.min!).toBeGreaterThan(0)
    }
  })
})

describe('waist-hip — the normalised scale', () => {
  test('the bands declared in index.ts match BAND_EDGES in compute.ts', () => {
    // This is what stops the axis the meter draws and the axis compute scores
    // against from drifting apart.
    expect(def.scale.bands.map((b) => b.from)).toEqual([...BAND_EDGES])
    expect(def.scale.bands.map((b) => b.to)).toEqual([90, 100, 110, 999])
  })

  test('the bands are ordered, contiguous, and cover every reachable value', () => {
    expect(def.scale.min).toBeLessThan(def.scale.max)
    def.scale.bands.forEach((band, i) => {
      expect(band.from).toBeLessThan(band.to)
      if (i > 0) expect(band.from).toBe(def.scale.bands[i - 1]!.to)
    })
    // The widest ratio the sliders can reach in either unit.
    expect(share({ waist: 200, hip: 50 })).toBeCloseTo((200 / 50 / 0.9) * 100, 9)
    expect(share({ waist: 200, hip: 50 })).toBeLessThan(999)
    expect(resolveBand(def.scale, share({ waist: 200, hip: 50 }))!.id).toBe('critical')
    expect(resolveBand(def.scale, share({ waist: 40, hip: 200 }))!.id).toBe('excellent')
  })

  test('the normalised score rises monotonically with the ratio, for both sexes', () => {
    for (const sex of ['male', 'female']) {
      let previous = -1
      for (let waist = 40; waist <= 200; waist += 0.5) {
        const value = share({ sex, waist })
        expect(value).toBeGreaterThan(previous)
        previous = value
      }
    }
  })

  test('the same ratio scores higher for a woman than for a man, always', () => {
    // 0.85 is a smaller number than 0.90, so the same ratio is a larger share of
    // it. That asymmetry IS the sex difference, expressed on one fixed axis.
    for (let waist = 40; waist <= 200; waist += 2.5) {
      expect(share({ sex: 'female', waist })).toBeGreaterThan(share({ sex: 'male', waist }))
      expect(share({ sex: 'female', waist }) / share({ sex: 'male', waist })).toBeCloseTo(
        0.9 / 0.85,
        12,
      )
    }
  })
})

describe('waist-hip — rejections', () => {
  test.each([
    ['a waist of zero', { waist: 0 }, 'waist'],
    ['a negative waist', { waist: -80 }, 'waist'],
    ['an unparseable waist', { waist: Number.NaN }, 'waist'],
    ['a hip of zero, which is a division by zero', { hip: 0 }, 'hip'],
    ['a negative hip', { hip: -100 }, 'hip'],
    ['an unparseable hip', { hip: Number.NaN }, 'hip'],
    ['a height of zero', { height: 0 }, 'height'],
    ['a negative height', { height: -180 }, 'height'],
    ['an unparseable height', { height: Number.NaN }, 'height'],
    ['inches typed while centimetres are selected', { height: 71 }, 'height'],
    ['centimetres typed while inches are selected', { units: 'imperial', height: 180 }, 'height'],
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

  test('the hip guard fires before the division, never as a NaN or an Infinity', () => {
    // `!Number.isFinite` comes first deliberately: `hip <= 0` is FALSE for NaN,
    // so a bare magnitude test would let it through and return NaN.
    for (const hip of [0, -0, Number.NaN, -1e-9]) {
      let thrown: unknown
      try {
        at({ hip })
      } catch (err) {
        thrown = err
      }
      expect(thrown, `hip = ${hip}`).toBeInstanceOf(CalcError)
      expect((thrown as CalcError).fieldId).toBe('hip')
      expect((thrown as CalcError).message).toContain('hip')
    }
  })

  test('a hip a hair above zero is accepted, however extreme the ratio', () => {
    // The guard is a division-by-zero guard, not a plausibility guard — the
    // field bounds are what keep the slider sensible.
    expect(whr({ hip: 0.001 })).toBe(88_000)
    expect(Number.isFinite(share({ hip: 0.001 }))).toBe(true)
  })
})

describe('waist-hip — result shape', () => {
  const everyShape: Array<[string, Partial<Input>]> = [
    ['defaults', {}],
    ['female', { sex: 'female' }],
    ['imperial', { units: 'imperial', waist: 34.5, hip: 40, height: 70.5 }],
    ['over the line', { waist: 110 }],
    ['well under the line', { waist: 70, hip: 105 }],
  ]

  test.each(everyShape)('%s returns no NaN anywhere', (_name, patch) => {
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

  test('the steps restate the headline exactly', () => {
    for (const [, patch] of everyShape) {
      const r = at(patch)
      const step = r.steps!.find(
        (s) => 'label' in s && s.label === 'Waist ÷ hip = waist-to-hip ratio',
      )!
      expect((step as { value: number }).value).toBe(Number(r.primary.value))
    }
  })

  test('neither parts nor series ever appear, for any input', () => {
    // Waist and hip are not components of a whole and one set of measurements
    // trends over nothing, so a donut or a chart here would be decoration
    // pretending to be information. What matters is that the counts never VARY:
    // anything drawable off-default but not at the defaults would never be
    // server-rendered at all, and no client-side redraw can conjure back a
    // container the server never wrote.
    for (const sex of ['male', 'female']) {
      for (const units of ['metric', 'imperial']) {
        for (let waist = 16; waist <= 200; waist += 8) {
          for (const hip of [20, 60, 102, 200]) {
            for (const height of [40, 100, 180, 250]) {
              let r: ReturnType<typeof compute>
              try {
                r = at({ sex, units, waist, hip, height })
              } catch {
                continue
              }
              expect(r.parts).toBeUndefined()
              expect(r.series).toBeUndefined()
            }
          }
        }
      }
    }
  }, 30_000)

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
    expect(def.disclaimer).toBe('health')
  })

  test('the copy says the bands are associations rather than a diagnosis', () => {
    const notes = def.compute({ ...base } as never).notes!.join(' ')
    expect(notes).toContain('not a diagnosis')
    expect(notes).toContain('WHO')
    // …and that this is a different question from the body fat estimate.
    expect(notes.toLowerCase()).toContain('body fat')
    expect(def.related).toContain('body-fat-calculator')
  })
})

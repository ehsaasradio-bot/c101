import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'
import { convertBetween, defaultValues, resolveBounds, toResultView } from '../../../lib/view'
import type { Field, NumberField } from '../../../lib/types'

type Input = Parameters<typeof compute>[0]

const base: Input = {
  units: 'metric',
  roomLength: 5,
  roomWidth: 4,
  wallHeight: 2.4,
  doors: 1,
  windows: 2,
  coats: 2,
  coverage: 10,
  canSize: 2.5,
  pricePerCan: 30,
}

const defaults = defaultValues(def) as Input

const stat = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)

/** 1 ft² = 0.09290304 m² exactly; 1 US gal = 3.785411784 L exactly. */
const M2_PER_FT2 = 0.09290304
const L_PER_GAL = 3.785411784
const FT_PER_M = 3.2808398950131235
/** m²/L → ft²/gal, from those two exact definitions: 3.785411784 / 0.09290304. */
const FT2_PER_GAL_PER_M2_PER_L = 40.74583333333333

/**
 * The same physical room and the same physical tin, restated in feet and US
 * gallons — exactly what the form's unit selector produces when it converts
 * what the visitor already typed.
 */
const imperialPatch = {
  units: 'imperial',
  roomLength: base.roomLength * FT_PER_M,
  roomWidth: base.roomWidth * FT_PER_M,
  wallHeight: base.wallHeight * FT_PER_M,
  coverage: base.coverage * FT2_PER_GAL_PER_M2_PER_L,
  canSize: base.canSize / L_PER_GAL,
} as const
const imperialBase: Input = { ...base, ...imperialPatch }

describe('paint', () => {
  test('the field defaults are exactly the fixture', () => {
    // Everything below is asserted against `base`; if the fields drift the
    // headline in the report and the page would silently disagree.
    expect(defaults).toEqual(base)
  })

  test('a 5 × 4 × 2.4 m room, 1 door, 2 windows, 2 coats needs 7.7109696 L', () => {
    /*
     * Derived, not invented:
     *   perimeter  = 2 × (5 + 4)                = 18 m
     *   gross      = 18 × 2.4                   = 43.2 m²
     *   door       = 20 ft² × 0.09290304        = 1.8580608 m²
     *   window     = 15 ft² × 0.09290304        = 1.3935456 m²
     *   openings   = 1 × 1.8580608 + 2 × 1.3935456 = 4.645152 m²
     *   net        = 43.2 − 4.645152            = 38.554848 m²
     *   two coats  = 38.554848 × 2              = 77.109696 m²
     *   litres     = 77.109696 ÷ 10             = 7.7109696 L
     */
    const r = compute(base)
    expect(Number(r.primary.value)).toBeCloseTo(7.7109696, 9)
    expect(stat(r, 'Wall area to paint')).toBeCloseTo(38.554848, 9)
    expect(stat(r, 'Area over all coats')).toBeCloseTo(77.109696, 9)
  })

  test('the same area falls out of adding the four walls up one at a time', () => {
    // Independent method: no perimeter shortcut. Two walls are 5 m wide and two
    // are 4 m wide, each 2.4 m tall, and the openings come off afterwards.
    const wall = (w: number) => w * 2.4
    const gross = 2 * wall(5) + 2 * wall(4)
    expect(gross).toBeCloseTo(43.2, 12)

    const openings = 1 * (20 * M2_PER_FT2) + 2 * (15 * M2_PER_FT2)
    const litres = ((gross - openings) * 2) / 10

    const r = compute(base)
    expect(Number(r.primary.value)).toBeCloseTo(litres, 12)
    expect(stat(r, 'Wall area to paint')).toBeCloseTo(gross - openings, 12)
  })

  test('the whole job worked in feet and gallons agrees to the litre', () => {
    // A second, fully independent route: convert every input to imperial, let
    // compute run entirely in ft² and US gallons, then convert the answer back.
    // If the deduction constants or the coverage factor were wrong in either
    // path, these two would not meet.
    const metricResult = compute(base)
    const imperialResult = compute(imperialBase)

    const gallons = Number(imperialResult.primary.value)
    expect(gallons * L_PER_GAL).toBeCloseTo(Number(metricResult.primary.value), 9)
    expect(gallons).toBeCloseTo(7.7109696 / L_PER_GAL, 9)

    // Areas match too: 38.554848 m² is 415.00093… ft².
    expect(stat(imperialResult, 'Wall area to paint') * M2_PER_FT2).toBeCloseTo(38.554848, 9)

    // And the counted things — tins, cost — are unit-free, so they are identical.
    expect(stat(imperialResult, 'Tins to buy')).toBe(stat(metricResult, 'Tins to buy'))
    expect(stat(imperialResult, 'Total paint cost')).toBe(stat(metricResult, 'Total paint cost'))
    expect(imperialResult.primary.format).toEqual({ style: 'decimal', decimals: 2, unit: 'gal' })
    expect(metricResult.primary.format).toEqual({ style: 'decimal', decimals: 2, unit: 'L' })
  })

  test('the imperial deduction is the published 20 and 15 square feet', () => {
    // Anchored on the figure the paint brands publish rather than on our own
    // arithmetic: in imperial the constants should appear untouched.
    const withOpenings = stat(compute(imperialBase), 'Wall area to paint')
    const withoutOpenings = stat(
      compute({ ...imperialBase, doors: 0, windows: 0 }),
      'Wall area to paint',
    )
    expect(withoutOpenings - withOpenings).toBeCloseTo(1 * 20 + 2 * 15, 10)

    // And in metric it is the exact conversion of the same holes, not a
    // separately rounded metric constant.
    const metricGap =
      stat(compute({ ...base, doors: 0, windows: 0 }), 'Wall area to paint') -
      stat(compute(base), 'Wall area to paint')
    expect(metricGap).toBeCloseTo(50 * M2_PER_FT2, 12)
    expect(metricGap).toBeCloseTo(4.645152, 12)
  })

  test('3.084 tins is four tins, and you pay for four', () => {
    const r = compute(base)
    // 7.7109696 ÷ 2.5 = 3.08438784, which is 4 tins on any real receipt.
    expect(stat(r, 'Tins to buy')).toBe(4)
    expect(stat(r, 'Paint purchased')).toBeCloseTo(10, 9)
    expect(stat(r, 'Paint left over')).toBeCloseTo(2.2890304, 9)
    expect(stat(r, 'Total paint cost')).toBeCloseTo(120, 9)

    // The rounding is on the page, not just in the number: both the exact
    // fractional tin count and the rounded-up one are shown as steps.
    const stepLabels = r.steps!.flatMap((s) => ('label' in s ? [s.label] : []))
    expect(stepLabels).toContain('Tins needed exactly = paint ÷ tin size')
    expect(stepLabels).toContain('Tins to buy = rounded UP to a whole tin')
    const exact = Number(
      (r.steps!.find((s) => 'label' in s && s.label.startsWith('Tins needed exactly')) as {
        value: number
      }).value,
    )
    expect(exact).toBeCloseTo(3.08438784, 9)
    expect(Math.ceil(exact)).toBe(4)
  })

  test('tin count is a staircase: it only ever steps up, never fractionally', () => {
    let previous = 0
    for (let length = 1; length <= 12; length += 0.25) {
      const r = compute({ ...base, roomLength: length })
      const cans = stat(r, 'Tins to buy')
      expect(Number.isInteger(cans)).toBe(true)
      expect(cans).toBeGreaterThanOrEqual(previous)
      // Never short: what you buy always covers what you need.
      expect(stat(r, 'Paint purchased')).toBeGreaterThanOrEqual(Number(r.primary.value) - 1e-9)
      // Never more than one whole tin of slack.
      expect(stat(r, 'Paint left over')).toBeLessThan(base.canSize)
      previous = cans
    }
  })

  test('a volume that lands exactly on a tin boundary buys no extra tin', () => {
    // Choose the coverage so the litres are exactly 7.5 = 3 × 2.5:
    //   77.109696 m² ÷ 7.5 L = 10.2812928 m²/L
    const r = compute({ ...base, coverage: 77.109696 / 7.5 })
    expect(Number(r.primary.value)).toBeCloseTo(7.5, 9)
    expect(stat(r, 'Tins to buy')).toBe(3)
    expect(stat(r, 'Paint left over')).toBeCloseTo(0, 9)
    // Parts still decompose honestly with a zero slice.
    expect(r.parts!.map((p) => p.value).reduce((a, b) => a + b, 0)).toBeCloseTo(
      Number(r.partsTotal!.value),
      9,
    )
  })

  test('paint needed is linear in the coats and in the wall area', () => {
    const one = Number(compute({ ...base, coats: 1 }).primary.value)
    expect(Number(compute({ ...base, coats: 3 }).primary.value)).toBeCloseTo(one * 3, 9)
    // Doubling the coverage halves the paint.
    expect(Number(compute({ ...base, coverage: 20 }).primary.value)).toBeCloseTo(
      Number(compute(base).primary.value) / 2,
      9,
    )
  })

  test('nudging the first number field to 1.1x stays valid and moves the result', () => {
    // The e2e suite does exactly this, so pin the invariant here too.
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('roomLength')
    const before = Number(compute(defaults).primary.value)
    const after = Number(compute({ ...defaults, roomLength: defaults.roomLength * 1.1 }).primary.value)
    // 2 × (5.5 + 4) × 2.4 = 45.6 m² gross → 40.954848 net → 8.1909696 L
    expect(after).toBeCloseTo(8.1909696, 9)
    expect(after).not.toBe(before)
  })

  test('the parts split what you buy, exactly and without a negative slice', () => {
    for (const patch of [
      {},
      { canSize: 5 },
      { canSize: 0.5 },
      { coats: 1 },
      { coats: 5 },
      { coverage: 77.109696 / 7.5 },
      imperialPatch,
      { roomLength: 30, roomWidth: 30, wallHeight: 6 },
    ]) {
      const r = compute({ ...base, ...patch })
      expect(r.parts).toHaveLength(2)
      const sum = r.parts!.reduce((acc, p) => acc + p.value, 0)
      expect(sum).toBeCloseTo(Number(r.partsTotal!.value), 6)
      for (const part of r.parts!) expect(part.value).toBeGreaterThanOrEqual(0)
    }
  })

  test('the chart always draws two lines over five coats, whatever the input', () => {
    for (const patch of [
      {},
      { coats: 1 },
      { coats: 5 },
      { canSize: 20 },
      imperialPatch,
      { coverage: 1 },
      { coverage: 25 },
    ]) {
      const r = compute({ ...base, ...patch })
      expect(r.series).toHaveLength(2)
      for (const s of r.series!) {
        expect(s.points).toHaveLength(5)
        expect(s.points.map(([x]) => x)).toEqual([1, 2, 3, 4, 5])
        s.points.forEach(([x, y], i) => {
          expect(Number.isFinite(x)).toBe(true)
          expect(Number.isFinite(y)).toBe(true)
          if (i > 0) expect(x).toBeGreaterThan(s.points[i - 1]![0])
        })
      }
      // "Must buy" is never below "needed", and steps in whole tins.
      const needed = r.series![0]!.points
      const bought = r.series![1]!.points
      needed.forEach(([, y], i) => expect(bought[i]![1]).toBeGreaterThanOrEqual(y - 1e-9))
    }
  })

  test('the chart point at the chosen coat count is the headline itself', () => {
    for (const coats of [1, 2, 3, 4, 5]) {
      const r = compute({ ...base, coats })
      const point = r.series![0]!.points.find(([x]) => x === coats)!
      // Exact, not close: the curve and the number above it are one expression.
      expect(point[1]).toBe(Number(r.primary.value))
      const boughtPoint = r.series![1]!.points.find(([x]) => x === coats)!
      expect(boughtPoint[1]).toBe(stat(r, 'Paint purchased'))
    }
  })

  test('the waste scale is a real percentage of what you buy', () => {
    const r = compute(base)
    // 2.2890304 ÷ 10 = 22.890304%
    expect(r.scaleValue).toBeCloseTo(22.890304, 9)
    const view = toResultView(r, def.scale)
    expect(view.band).toBe('good')
    expect(view.scalePercent).toBeGreaterThanOrEqual(0)
    expect(view.scalePercent).toBeLessThanOrEqual(100)
    expect(view.primary.text).not.toContain('NaN')
    for (const s of view.stats) expect(s.text).not.toContain('NaN')
  })

  test('waste stays inside 0–100 across the input space', () => {
    for (const canSize of [0.125, 0.5, 1, 2.5, 5, 20]) {
      for (const coats of [1, 2, 5]) {
        for (const coverage of [1, 10, 25]) {
          const r = compute({ ...base, canSize, coats, coverage })
          expect(r.scaleValue!).toBeGreaterThanOrEqual(0)
          expect(r.scaleValue!).toBeLessThan(100)
        }
      }
    }
  })

  test('openings bigger than the wall are refused, not turned into negative paint', () => {
    // A 1 × 1 m cupboard has 2 × (1 + 1) × 1.5 = 6 m² of wall. Four doors want
    // 7.43 m², so there is nothing left to paint.
    let thrown: unknown
    try {
      compute({ ...base, roomLength: 1, roomWidth: 1, wallHeight: 1.5, doors: 4, windows: 0 })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe('doors')
    expect((thrown as CalcError).message).toMatch(/more wall than the room has/)

    // With no doors at all the blame lands on the windows instead.
    let thrownWindows: unknown
    try {
      compute({ ...base, roomLength: 1, roomWidth: 1, wallHeight: 1.5, doors: 0, windows: 5 })
    } catch (err) {
      thrownWindows = err
    }
    expect(thrownWindows).toBeInstanceOf(CalcError)
    expect((thrownWindows as CalcError).fieldId).toBe('windows')
  })

  test('an exact fit of openings to wall is refused too — zero wall is not a job', () => {
    // 20 ft² of door against exactly 20 ft² of wall: 2 × (2.5 + 2.5) × 2 = 20 ft².
    let thrown: unknown
    try {
      compute({
        ...base,
        units: 'imperial',
        roomLength: 2.5,
        roomWidth: 2.5,
        wallHeight: 2,
        doors: 1,
        windows: 0,
      })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe('doors')
  })

  test.each([
    ['zero length', { roomLength: 0 }, 'roomLength'],
    ['negative length', { roomLength: -5 }, 'roomLength'],
    ['zero width', { roomWidth: 0 }, 'roomWidth'],
    ['zero height', { wallHeight: 0 }, 'wallHeight'],
    ['negative doors', { doors: -1 }, 'doors'],
    ['negative windows', { windows: -1 }, 'windows'],
    ['zero coats', { coats: 0 }, 'coats'],
    ['less than one coat', { coats: 0.5 }, 'coats'],
    ['absurdly many coats', { coats: 21 }, 'coats'],
    ['zero coverage', { coverage: 0 }, 'coverage'],
    ['negative coverage', { coverage: -10 }, 'coverage'],
    ['zero tin size', { canSize: 0 }, 'canSize'],
    ['a negative price', { pricePerCan: -1 }, 'pricePerCan'],
  ])('rejects %s', (_label, patch, fieldId) => {
    let thrown: unknown
    try {
      compute({ ...base, ...patch })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
  })

  // The form layer coerces an unparseable entry to a raw NaN and hands it
  // straight to compute (src/lib/view.ts coerceValues), so every number field
  // must reject non-finite input with a CalcError rather than returning NaN.
  const nonFinite = [
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ] as const
  const numberIds = fields.filter((f) => f.kind === 'number').map((f) => f.id)

  test.each(
    numberIds.flatMap((fieldId) => nonFinite.map(([label, value]) => [fieldId, label, value] as const)),
  )('rejects %s = %s with a CalcError, never a NaN result', (fieldId, _label, value) => {
    let thrown: unknown
    try {
      const r = compute({ ...base, [fieldId]: value })
      throw new Error(`expected a CalcError, got primary.value = ${String(r.primary.value)}`)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
  })

  /*
   * A local copy of `src/calculators/field-bounds.test.ts` for this calculator
   * alone, because that suite only walks the registry and this file is the
   * fastest loop while the bounds are being chosen. Every end of every slider —
   * in both unit systems, with the other fields converted the way the form
   * converts them — must be a value compute accepts.
   */
  describe('declared bounds are values compute accepts', () => {
    // Widened first: `as const` pins each entry to its own literal type, and a
    // `f is NumberField` predicate is not assignable to that union.
    const numberFields = (fields as readonly Field[]).filter(
      (f): f is NumberField => f.kind === 'number',
    )

    const stateFor = (caseKey: string) => {
      const values: Record<string, unknown> = { ...defaults, units: caseKey }
      for (const field of numberFields) {
        if (field.variants?.on !== 'units') continue
        const cases = field.variants.cases
        const baseCase = cases[Object.keys(cases)[0]!]!
        values[field.id] = convertBetween(field.default, baseCase, cases[caseKey]!)
      }
      return values
    }

    const cases = numberFields.flatMap((field) => {
      const states = field.variants
        ? Object.keys(field.variants.cases).map((k) => ({ suffix: `:units=${k}`, values: stateFor(k) }))
        : [{ suffix: '', values: { ...defaults } as Record<string, unknown> }]
      return states.flatMap((state) => {
        const active = resolveBounds(field, state.values)
        return (['min', 'max'] as const).flatMap((bound) => {
          const value = active[bound]
          return value === undefined
            ? []
            : [
                {
                  key: `${field.id}${state.suffix}:${bound}`,
                  fieldId: field.id,
                  value,
                  state: state.values,
                },
              ]
        })
      })
    })

    test('there is something to check in both unit systems', () => {
      expect(cases.length).toBeGreaterThan(20)
      expect(cases.some((c) => c.key.includes('units=imperial'))).toBe(true)
    })

    test.each(cases.map((c) => [c.key, c] as const))('%s is accepted', (_key, { fieldId, value, state }) => {
      const r = compute({ ...state, [fieldId]: value } as Input)
      expect(Number.isFinite(Number(r.primary.value))).toBe(true)
      expect(Number(r.primary.value)).toBeGreaterThan(0)
    })

    test('every default sits inside its own base variant, and variants inside the union', () => {
      for (const field of numberFields) {
        expect(field.default).toBeGreaterThanOrEqual(field.min!)
        expect(field.default).toBeLessThanOrEqual(field.max!)
        if (!field.variants) continue
        const keys = Object.keys(field.variants.cases)
        const baseCase = field.variants.cases[keys[0]!]!
        // The first case listed is the base; its factor is 1 and omitted.
        expect(baseCase.factor ?? 1).toBe(1)
        expect(field.default).toBeGreaterThanOrEqual(baseCase.min!)
        expect(field.default).toBeLessThanOrEqual(baseCase.max!)
        for (const variant of Object.values(field.variants.cases)) {
          expect(variant.min!).toBeGreaterThanOrEqual(field.min!)
          expect(variant.max!).toBeLessThanOrEqual(field.max!)
        }
      }
    })
  })

  describe('copy and definition', () => {
    test('the meta description fits a search result', () => {
      expect(def.description.length).toBeGreaterThan(50)
      expect(def.description.length).toBeLessThanOrEqual(160)
      expect(def.seoTitle.length).toBeLessThanOrEqual(70)
      expect(def.intro.length).toBeGreaterThan(40)
    })

    test('there are at least three real FAQs', () => {
      expect(def.faqs.length).toBeGreaterThanOrEqual(3)
      for (const faq of def.faqs) {
        expect(faq.q.endsWith('?')).toBe(true)
        expect(faq.a.length).toBeGreaterThan(40)
      }
    })

    test('scale bands are ordered and contiguous', () => {
      const { bands, min, max } = def.scale
      expect(min).toBeLessThan(max)
      bands.forEach((band, i) => {
        expect(band.from).toBeLessThan(band.to)
        if (i > 0) expect(band.from).toBe(bands[i - 1]!.to)
      })
      expect(bands[0]!.from).toBe(min)
      expect(bands[bands.length - 1]!.to).toBe(max)
    })

    test('related slugs point elsewhere and are not this page', () => {
      expect(def.related.length).toBeGreaterThanOrEqual(2)
      for (const slug of def.related) expect(slug).not.toBe(def.slug)
      expect(new Set(def.related).size).toBe(def.related.length)
    })

    test('the definition carries no colour, class name or markup', () => {
      const serialized = JSON.stringify(def, (_k, v) => (typeof v === 'function' ? undefined : v))
      expect(serialized).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(serialized).not.toMatch(/\b(bg|text|border|rounded|shadow)-[a-z]+-\d{2,3}\b/)
      expect(serialized).not.toMatch(/<\/?[a-z][\s\S]*>/i)
    })
  })
})

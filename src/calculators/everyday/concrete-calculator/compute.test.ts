import { describe, expect, test } from 'vitest'
import compute from './compute'
import { fields } from './fields'
import def from './index'
import { CalcError } from '../../../lib/types'
import type { CalcResult, Field, NumberField, Quantity, StepRule } from '../../../lib/types'

/**
 * The default pour: one 10 ft by 10 ft slab, 4 in thick, with a 10% allowance.
 *
 * Every expectation below is derived from the formula and then confirmed a
 * second, independent way — the two routes never share an intermediate value.
 */
const base = {
  shape: 'slab',
  units: 'imperial',
  length: 10,
  width: 10,
  thickness: 4,
  diameter: 10,
  height: 3,
  count: 1,
  waste: 10,
}

const at = (over: Record<string, string | number> = {}): CalcResult =>
  compute({ ...base, ...over } as never)

/*
 * DERIVATION, ROUTE 1 — in feet, the way compute works internally (via metres).
 *
 *   net    = 10 ft x 10 ft x (4/12) ft   = 33.333... ft³
 *   total  = 33.333... x 1.10            = 36.666... ft³   = 110/3
 *   yd³    = 36.666... / 27              = 1.358024691...
 *   m³     = 36.666... x 0.028316846592  = 1.03828437504
 *
 * DERIVATION, ROUTE 2 — entirely in yards, touching neither feet nor metres.
 *
 *   10 ft = 10/3 yd and 4 in = 1/9 yd
 *   net   = (10/3) x (10/3) x (1/9) = (100/9) x (1/9) = 100/81 yd³
 *   total = (100/81) x 1.1 = 110/81 = 1.3580246913580247 yd³
 *
 * DERIVATION, ROUTE 3 — entirely in metres, from the exact 1959 definitions.
 *
 *   10 ft = 3.048 m and 4 in = 0.1016 m
 *   net   = 3.048 x 3.048 x 0.1016 = 9.290304 x 0.1016 = 0.9438948864 m³
 *   total = x 1.1                                      = 1.03828437504 m³
 *
 * Routes 2 and 3 agree with route 1, so the number is the pour and not an
 * artefact of one chain of conversions.
 */
const EXPECTED_YD3 = 110 / 81
const EXPECTED_FT3 = 110 / 3
const EXPECTED_M3 = 3.048 * 3.048 * 0.1016 * 1.1

const isQuantity = (s: Quantity | StepRule): s is Quantity => !('rule' in s)

const statValue = (result: CalcResult, label: string): number => {
  const stat = result.stats?.find((s) => s.label === label)
  if (!stat) throw new Error(`no stat labelled ${label}`)
  return Number(stat.value)
}

const stepStartingWith = (result: CalcResult, prefix: string): Quantity => {
  const step = (result.steps ?? []).filter(isQuantity).find((s) => s.label.startsWith(prefix))
  if (!step) throw new Error(`no step starting with ${prefix}`)
  return step
}

const BAG_LABELS = ['40 lb bags', '60 lb bags', '80 lb bags', '20 kg bags', '25 kg bags'] as const
const SHAPES = ['slab', 'footing', 'column', 'posthole'] as const

describe('concrete — the default pour', () => {
  const result = at()

  test('the headline is 1.36 cubic yards, waste included', () => {
    expect(EXPECTED_YD3).toBeCloseTo(1.3580246913580247, 15)
    expect(Number(result.primary.value)).toBeCloseTo(EXPECTED_YD3, 12)
  })

  test('cubic metres agree with the independent metre-side derivation', () => {
    expect(EXPECTED_M3).toBeCloseTo(1.03828437504, 12)
    expect(statValue(result, 'Cubic metres')).toBeCloseTo(EXPECTED_M3, 12)
  })

  test('feet, yards and metres are three readings of one volume', () => {
    const ft3 = statValue(result, 'Cubic feet')
    const yd3 = statValue(result, 'Cubic yards')
    const m3 = statValue(result, 'Cubic metres')
    expect(ft3).toBeCloseTo(EXPECTED_FT3, 10)
    expect(ft3 / 27).toBeCloseTo(yd3, 12)
    expect(ft3 * 0.028316846592).toBeCloseTo(m3, 12)
  })

  /*
   * Bag counts, each worked out here from the published yield and then compared
   * with what compute returns. The exact quotients are asserted alongside the
   * ceilings, so a wrong yield moves a visible literal instead of hiding inside
   * a rounding.
   *
   *   80 lb @ 0.60 ft³  : 36.6667 / 0.60   =  61.111 -> 62
   *   60 lb @ 0.45 ft³  : 36.6667 / 0.45   =  81.481 -> 82
   *   40 lb @ 0.30 ft³  : 36.6667 / 0.30   = 122.222 -> 123
   *   20 kg @ 0.0100 m³ : 1.038284 / 0.0100 = 103.828 -> 104
   *   25 kg @ 0.0125 m³ : 1.038284 / 0.0125 =  83.063 -> 84
   */
  test('bag counts follow the published yields, rounded up', () => {
    expect(EXPECTED_FT3 / 0.6).toBeCloseTo(61.111111, 5)
    expect(EXPECTED_FT3 / 0.45).toBeCloseTo(81.481481, 5)
    expect(EXPECTED_FT3 / 0.3).toBeCloseTo(122.222222, 5)
    expect(EXPECTED_M3 / 0.01).toBeCloseTo(103.828438, 5)
    expect(EXPECTED_M3 / 0.0125).toBeCloseTo(83.06275, 5)

    expect(statValue(result, '80 lb bags')).toBe(62)
    expect(statValue(result, '60 lb bags')).toBe(82)
    expect(statValue(result, '40 lb bags')).toBe(123)
    expect(statValue(result, '20 kg bags')).toBe(104)
    expect(statValue(result, '25 kg bags')).toBe(84)
  })

  test('the steps show the rounding happening, not only its answer', () => {
    expect(Number(stepStartingWith(result, 'Bags needed exactly').value)).toBeCloseTo(61.111111, 5)
    const bought = stepStartingWith(result, 'Bags to buy = rounded UP')
    expect(Number(bought.value)).toBe(62)
    // And what that buys, so the gap between the two is on the page.
    expect(Number(stepStartingWith(result, 'Concrete purchased').value)).toBeCloseTo(62 * 0.6, 10)
    expect(Number(stepStartingWith(result, 'Left over in the last bag').value)).toBeCloseTo(
      62 * 0.6 - EXPECTED_FT3,
      10,
    )
  })

  test('parts split the headline exactly and never go negative', () => {
    const sum = result.parts!.reduce((acc, p) => acc + p.value, 0)
    expect(sum).toBeCloseTo(Number(result.primary.value), 12)
    // The pour is 100/81 yd³ and the allowance is a tenth of it.
    expect(result.parts![0]!.value).toBeCloseTo(100 / 81, 12)
    expect(result.parts![1]!.value).toBeCloseTo(10 / 81, 12)
    for (const part of result.parts!) expect(part.value).toBeGreaterThanOrEqual(0)
  })
})

describe('concrete — metric and imperial describe one pour', () => {
  // 10 ft is exactly 3.048 m and 4 in is exactly 10.16 cm. Typing the same slab
  // either way must give the same cubic metres, or the unit selector is
  // resizing the slab rather than restating it.
  const metric = at({ units: 'metric', length: 3.048, width: 3.048, thickness: 10.16 })

  test('the same slab in metric is the same volume', () => {
    expect(statValue(metric, 'Cubic metres')).toBeCloseTo(EXPECTED_M3, 12)
    expect(statValue(metric, 'Cubic yards')).toBeCloseTo(EXPECTED_YD3, 12)
  })

  test('and therefore the same count of every bag, in both systems', () => {
    for (const label of BAG_LABELS) {
      expect(statValue(metric, label), label).toBe(statValue(at(), label))
    }
  })

  test('the headline changes unit but not size', () => {
    expect(Number(metric.primary.value)).toBeCloseTo(EXPECTED_M3, 12)
    expect(metric.primary.format).toMatchObject({ unit: 'm³' })
    expect(at().primary.format).toMatchObject({ unit: 'yd³' })
  })

  test('a round column matches in both systems too', () => {
    // 10 in diameter and 3 ft tall is 25.4 cm diameter and 0.9144 m tall.
    const imp = at({ shape: 'column' })
    const met = at({ shape: 'column', units: 'metric', diameter: 25.4, height: 0.9144 })
    expect(statValue(met, 'Cubic metres')).toBeCloseTo(statValue(imp, 'Cubic metres'), 12)
    // V = pi x r² x h x 1.10, with r = 0.127 m — worked out here, not by compute.
    const byHand = Math.PI * 0.127 ** 2 * 0.9144 * 1.1
    // pi x 0.016129 x 0.9144 x 1.1 = 0.0509667 m³, which is 1.80 ft³.
    expect(byHand).toBeCloseTo(0.0509667, 7)
    expect(byHand / 0.028316846592).toBeCloseTo(1.79987, 5)
    expect(statValue(imp, 'Cubic metres')).toBeCloseTo(byHand, 12)
  })
})

describe('concrete — the rounding is always upward', () => {
  const YIELDS: ReadonlyArray<readonly [string, number, 'ft³' | 'm³']> = [
    ['40 lb bags', 0.3, 'ft³'],
    ['60 lb bags', 0.45, 'ft³'],
    ['80 lb bags', 0.6, 'ft³'],
    ['20 kg bags', 0.01, 'm³'],
    ['25 kg bags', 0.0125, 'm³'],
  ]

  test(
    'every bag count covers the pour, and one bag fewer would not have',
    () => {
      for (const shape of SHAPES) {
        for (const units of ['imperial', 'metric']) {
          for (const waste of [0, 3, 10, 17, 25]) {
            for (const count of [1, 7, 33]) {
              const r = at({ shape, units, waste, count })
              const need = { 'ft³': statValue(r, 'Cubic feet'), 'm³': statValue(r, 'Cubic metres') }
              for (const [label, y, unit] of YIELDS) {
                const bags = statValue(r, label)
                const where = `${label} ${shape}/${units}/${waste}%/${count}`
                expect(Number.isInteger(bags), where).toBe(true)
                // Never short: what you carry home holds the pour.
                expect(bags * y, where).toBeGreaterThanOrEqual(need[unit] - 1e-9)
                // Never gratuitously long: it really did have to round up.
                expect((bags - 1) * y, where).toBeLessThan(need[unit])
              }
            }
          }
        }
      }
    },
    30_000,
  )

  test('a pour a hair over a whole bag still takes the next one', () => {
    // 80 lb bags yield 0.60 ft³, so 27 ft³ is exactly 45 bags: a 9 by 9 ft slab
    // 4 in thick with no allowance is 9 x 9 x 1/3 = 27 ft³.
    const exact = at({ length: 9, width: 9, waste: 0 })
    expect(statValue(exact, 'Cubic feet')).toBeCloseTo(27, 10)
    expect(statValue(exact, '80 lb bags')).toBe(45)

    // One thousandth of an inch thicker is 45.011 bags, which is 46.
    const hair = at({ length: 9, width: 9, thickness: 4.001, waste: 0 })
    expect(statValue(hair, 'Cubic feet')).toBeGreaterThan(27)
    expect(statValue(hair, '80 lb bags')).toBe(46)
  })

  test('a pour landing exactly on a whole bag does not buy a spare one', () => {
    // 10 m x 10 m x 4 cm is 4 m³; 33 of them with a 10% allowance is exactly
    // 145.2 m³, which is exactly 14,520 20 kg bags — but the division lands on
    // 14520.000000000002 in binary, and a bare ceiling would sell a 14,521st.
    const r = at({ units: 'metric', count: 33 })
    expect(statValue(r, 'Cubic metres')).toBeCloseTo(145.2, 9)
    expect(statValue(r, '20 kg bags')).toBe(14_520)
    // The snap is a few ulps wide, not a rounding rule: 3 cm more on the length
    // makes it 145.6356 m³, or 14,563.56 bags, and that still rounds up.
    const longer = at({ units: 'metric', count: 33, length: 10.03 })
    expect(statValue(longer, 'Cubic metres')).toBeCloseTo(145.6356, 9)
    expect(statValue(longer, '20 kg bags')).toBe(14_564)
  })

  test('bag counts only ever rise as the allowance grows', () => {
    let previous = 0
    for (const waste of [0, 5, 10, 15, 20, 25]) {
      const bags = statValue(at({ waste }), '80 lb bags')
      expect(bags).toBeGreaterThanOrEqual(previous)
      previous = bags
    }
    // And the allowance really does buy more concrete than none at all.
    expect(statValue(at({ waste: 25 }), '80 lb bags')).toBeGreaterThan(
      statValue(at({ waste: 0 }), '80 lb bags'),
    )
  })
})

describe('concrete — only the dimensions a shape uses are validated', () => {
  test('a round pour ignores the rectangular dimensions entirely', () => {
    expect(() =>
      at({ shape: 'column', length: Number.NaN, width: 0, thickness: -5 }),
    ).not.toThrow()
    expect(() => at({ shape: 'posthole', length: 0, width: Number.NaN })).not.toThrow()
  })

  test('a rectangular pour ignores the round dimensions entirely', () => {
    expect(() => at({ shape: 'slab', diameter: Number.NaN, height: 0 })).not.toThrow()
    expect(() => at({ shape: 'footing', diameter: -1, height: Number.NaN })).not.toThrow()
  })

  test('but each shape rejects its own missing dimensions, against that field', () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ['slab', 'length'],
      ['slab', 'width'],
      ['slab', 'thickness'],
      ['footing', 'length'],
      ['footing', 'width'],
      ['footing', 'thickness'],
      ['column', 'diameter'],
      ['column', 'height'],
      ['posthole', 'diameter'],
      ['posthole', 'height'],
    ]
    for (const [shape, field] of cases) {
      let thrown: unknown
      try {
        at({ shape, [field]: 0 })
      } catch (err) {
        thrown = err
      }
      expect(thrown, `${shape}/${field}`).toBeInstanceOf(CalcError)
      expect((thrown as CalcError).fieldId, `${shape}/${field}`).toBe(field)
    }
  })

  test('the working names what each number was read as, and what was ignored', () => {
    const slab = at()
    expect(slab.notes!.some((n) => n.includes('length, width and thickness'))).toBe(true)
    expect(slab.notes!.some((n) => n.includes('diameter and height fields are ignored'))).toBe(true)

    const hole = at({ shape: 'posthole' })
    expect(hole.notes!.some((n) => n.includes('hole diameter and hole depth'))).toBe(true)
    expect(
      hole.notes!.some((n) => n.includes('length, width and thickness fields are ignored')),
    ).toBe(true)

    // A footing reads the same three fields as a slab but calls them its own
    // names, and the steps have to say so.
    const footing = at({ shape: 'footing' })
    const labels = (footing.steps ?? []).filter(isQuantity).map((s) => s.label)
    expect(labels.some((l) => l.startsWith('Run of footing'))).toBe(true)
    expect(labels.some((l) => l.startsWith('Trench width'))).toBe(true)
    expect(labels.some((l) => l.startsWith('Depth of fill'))).toBe(true)
  })
})

describe('concrete — bad input is refused, never returned as NaN', () => {
  test('unparseable input throws against its own field rather than slipping past', () => {
    // NaN fails every magnitude comparison, so this is exactly the case a bare
    // `x <= 0` guard would let through and report as NaN bags.
    for (const field of ['length', 'width', 'thickness', 'count', 'waste']) {
      let thrown: unknown
      try {
        at({ [field]: Number.NaN })
      } catch (err) {
        thrown = err
      }
      expect(thrown, field).toBeInstanceOf(CalcError)
      expect((thrown as CalcError).fieldId, field).toBe(field)
    }
    for (const field of ['diameter', 'height']) {
      let thrown: unknown
      try {
        at({ shape: 'column', [field]: Number.NaN })
      } catch (err) {
        thrown = err
      }
      expect(thrown, field).toBeInstanceOf(CalcError)
      expect((thrown as CalcError).fieldId, field).toBe(field)
    }
  })

  test('a dimension of zero is not a thin pour, it is no pour', () => {
    expect(() => at({ thickness: 0 })).toThrow(CalcError)
    expect(() => at({ length: -1 })).toThrow(CalcError)
    expect(() => at({ shape: 'column', diameter: 0 })).toThrow(CalcError)
  })

  test('a fractional or absent count is refused', () => {
    expect(() => at({ count: 0 })).toThrow(CalcError)
    expect(() => at({ count: 2.5 })).toThrow(CalcError)
    expect(() => at({ count: 1 })).not.toThrow()
    expect(() => at({ count: 200 })).not.toThrow()
  })

  test('a negative waste allowance is refused, and zero is allowed', () => {
    expect(() => at({ waste: -1 })).toThrow(CalcError)
    expect(() => at({ waste: 0 })).not.toThrow()
    expect(statValue(at({ waste: 0 }), 'Cubic feet')).toBeCloseTo(100 / 3, 10)
  })

  test('an unknown shape or unit is refused against its own select', () => {
    let thrown: unknown
    try {
      at({ shape: 'igloo' })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe('shape')

    thrown = undefined
    try {
      at({ units: 'cubits' })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe('units')
  })

  test('a dimension in the wrong unit is caught rather than answered', () => {
    // 400 ft is the top of the imperial slider and must compute; the same
    // number read as metres is a quarter-mile slab and almost certainly a typo.
    expect(() => at({ length: 400 })).not.toThrow()
    expect(() => at({ units: 'metric', length: 400 })).toThrow(CalcError)
  })
})

describe('concrete — the form only offers values compute accepts', () => {
  // Widened to the declared `Field` union first: the `as const` field list has
  // literal types, which no type predicate can narrow to `NumberField`.
  const numberFields = (fields as readonly Field[]).filter(
    (f): f is NumberField => f.kind === 'number',
  )

  /*
   * A local copy of the registry-wide bounds check, because this calculator is
   * not in the barrel yet. Every number field renders as a slider spanning the
   * bounds of the SELECTED variant, so both ends of every variant are one drag
   * away and every one of them has to compute.
   */
  test('every declared bound, in every variant, on every shape, computes', () => {
    for (const field of numberFields) {
      const variants: Array<{ units: string; min?: number; max?: number }> = field.variants
        ? Object.entries(field.variants.cases).map(([units, c]) => ({
            units,
            min: c.min,
            max: c.max,
          }))
        : [{ units: 'imperial', min: field.min, max: field.max }]

      for (const variant of variants) {
        for (const bound of ['min', 'max'] as const) {
          const value = variant[bound] ?? field[bound]
          if (value === undefined) continue
          for (const shape of SHAPES) {
            expect(
              () => at({ shape, units: variant.units, [field.id]: value }),
              `${field.id}[${variant.units}].${bound} = ${value} on a ${shape}`,
            ).not.toThrow()
          }
        }
      }
    }
  })

  test('defaults sit on the slider grid, at top level and in the base variant', () => {
    const onGrid = (id: string, min?: number, step?: number, def_?: number) => {
      if (min === undefined || step === undefined || def_ === undefined) return
      const n = (def_ - min) / step
      expect(Math.abs(n - Math.round(n)), `${id} default is off the step grid`).toBeLessThan(1e-9)
    }

    for (const field of numberFields) {
      onGrid(field.id, field.min, field.step, field.default)
      if (!field.variants) continue

      const entries = Object.entries(field.variants.cases)
      const [baseKey, baseCase] = entries[0]!
      // The first case listed is the base: factor 1, and the default is typed in
      // its unit, so it must sit inside its bounds and on its own grid.
      expect(baseCase.factor ?? 1, `${field.id}: the first case is the base`).toBe(1)
      onGrid(`${field.id}[${baseKey}]`, baseCase.min, baseCase.step, field.default)
      expect(field.default).toBeGreaterThanOrEqual(baseCase.min ?? -Infinity)
      expect(field.default).toBeLessThanOrEqual(baseCase.max ?? Infinity)

      // The top-level pair is the union: no variant may reach outside it.
      for (const [key, variant] of entries) {
        if (variant.min !== undefined && field.min !== undefined)
          expect(variant.min, `${field.id}[${key}].min`).toBeGreaterThanOrEqual(field.min)
        if (variant.max !== undefined && field.max !== undefined)
          expect(variant.max, `${field.id}[${key}].max`).toBeLessThanOrEqual(field.max)
        // A converting variant restates the same quantity, so its converted
        // default cannot be made to land on a grid — only the base is checkable.
        if (key !== baseKey) expect(variant.factor).toBeDefined()
      }
    }
  })

  test('the end-to-end nudge of the first number field moves the default result', () => {
    const first = numberFields[0]!
    expect(first.id).toBe('length')
    // The suite sets it to 1.1x its default and expects a valid, different
    // result. A slab is linear in its length, so the volume moves by exactly
    // that factor — and 11 ft is still on the grid and inside the bounds.
    const nudged = at({ [first.id]: first.default * 1.1 })
    expect(Number(nudged.primary.value)).toBeCloseTo(Number(at().primary.value) * 1.1, 12)
    expect(Number(nudged.primary.value)).toBeGreaterThan(Number(at().primary.value))
  })
})

describe('concrete — parts and series keep their shape', () => {
  const everyReachableResult = (): CalcResult[] => {
    const out: CalcResult[] = []
    for (const shape of SHAPES)
      for (const units of ['imperial', 'metric'])
        for (const waste of [0, 10, 25]) for (const count of [1, 200]) out.push(at({ shape, units, waste, count }))
    return out
  }

  test('always two parts and two series, and both are drawable at the defaults', () => {
    expect(at().parts).toHaveLength(2)
    expect(at().series).toHaveLength(2)
    for (const r of everyReachableResult()) {
      expect(r.parts).toHaveLength(2)
      expect(r.series).toHaveLength(2)
    }
  })

  test('parts stay an honest decomposition across the input space', () => {
    for (const r of everyReachableResult()) {
      const sum = r.parts!.reduce((acc, p) => acc + p.value, 0)
      expect(sum).toBeCloseTo(Number(r.primary.value), 6)
      for (const p of r.parts!) {
        expect(Number.isFinite(p.value)).toBe(true)
        expect(p.value).toBeGreaterThanOrEqual(0)
      }
    }
  })

  test('series x values increase strictly and every point is finite', () => {
    for (const r of everyReachableResult()) {
      for (const s of r.series!) {
        expect(s.points.length).toBeGreaterThan(1)
        s.points.forEach((p, i) => {
          expect(Number.isFinite(p[0])).toBe(true)
          expect(Number.isFinite(p[1])).toBe(true)
          if (i > 0) expect(p[0]).toBeGreaterThan(s.points[i - 1]![0])
        })
      }
    }
  })

  test('the curve reads the headline bag count at the selected allowance', () => {
    // Otherwise the chart and the number above it disagree at the one point a
    // visitor can check.
    const imperial = at()
    expect(imperial.series![1]!.points.find((p) => p[0] === 10)![1]).toBe(
      statValue(imperial, '80 lb bags'),
    )
    const metric = at({ units: 'metric' })
    expect(metric.series![1]!.points.find((p) => p[0] === 10)![1]).toBe(
      statValue(metric, '20 kg bags'),
    )
  })
})

describe('concrete — the definition holds up', () => {
  test('copy fits a search result', () => {
    expect(def.description.length).toBeGreaterThan(50)
    expect(def.description.length).toBeLessThanOrEqual(160)
    expect(def.seoTitle.length).toBeLessThanOrEqual(70)
    expect(def.intro.length).toBeGreaterThan(40)
  })

  test('at least three substantial FAQs, each a real question', () => {
    expect(def.faqs.length).toBeGreaterThanOrEqual(3)
    for (const faq of def.faqs) {
      expect(faq.q.endsWith('?'), faq.q).toBe(true)
      expect(faq.a.length, faq.q).toBeGreaterThan(120)
    }
  })

  test('no colours, class names or markup leak into the definition', () => {
    const serialized = JSON.stringify(def, (_k, v) => (typeof v === 'function' ? undefined : v))
    expect(serialized).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(serialized).not.toMatch(/\b(bg|text|border|rounded|shadow)-[a-z]+-\d{2,3}\b/)
    expect(serialized).not.toMatch(/<\/?[a-z][\s\S]*>/i)
  })

  test('field ids are unique and camelCase, and the fixture names all of them', () => {
    const ids = fields.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z][a-zA-Z0-9]*$/)
    // If the fixture drifts from the field list, every test above is quietly
    // exercising a different input shape from the one the form submits.
    expect(new Set(Object.keys(base))).toEqual(new Set(ids))
  })

  test('select defaults are offered options, and related slugs point elsewhere', () => {
    for (const field of fields) {
      if (field.kind !== 'select') continue
      expect(field.options.map((o) => o.value)).toContain(field.default)
      expect(field.options.length).toBeGreaterThan(1)
    }
    // These resolve against the barrel once this calculator is listed in it;
    // pinned here so a typo is caught before that happens.
    expect(def.related).toEqual(['volume-calculator', 'area-calculator', 'paint-calculator'])
    expect(def.related).not.toContain(def.slug)
    expect(def.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

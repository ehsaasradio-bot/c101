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
 * literal-pinned types would reject `{ voltage: 9 }` because the type is the
 * literal 12.
 */
const base: Input = {
  mode: 'vr',
  voltage: 12,
  current: 3,
  currentUnit: 'A',
  resistance: 4,
  resistanceUnit: 'ohm',
  power: 36,
  powerUnit: 'W',
}

const MODES = ['vr', 'vi', 'ir', 'vp', 'ip', 'rp'] as const

/**
 * `as const satisfies readonly Field[]` keeps every literal, which is what makes
 * a renamed field id a compile error — but it also means the union member for
 * `voltage` has no `variants` key at all. Widening to the declared interface is
 * how the shared tooling (`resolveBounds`, the theme) sees these anyway.
 */
const numberFields = (fields as readonly Field[]).filter(
  (f): f is NumberField => f.kind === 'number',
)

const raw = (r: Result, label: string) => r.stats!.find((s) => s.label === label)!.value
const num = (r: Result, label: string) => Number(raw(r, label))
const text = (r: Result, label: string) => String(raw(r, label))

/** All four quantities in SI base units, whichever pair was the input. */
const four = (r: Result) => ({
  volts: num(r, 'Voltage'),
  amps: num(r, 'Current'),
  ohms: num(r, 'Resistance'),
  watts: num(r, 'Power'),
})

const thrownBy = (input: Input): unknown => {
  try {
    compute(input)
    return undefined
  } catch (err) {
    return err
  }
}

describe('ohms law: the anchor', () => {
  // 12 V across 4 ohms. I = V/R = 12/4 = 3 A exactly; P = V²/R = 144/4 = 36 W
  // exactly, and P = V·I = 12 × 3 = 36 W agrees. Every one of these is exact in
  // binary floating point, so they are asserted with strict equality — a
  // toBeCloseTo here would hide a formula that is merely nearly right.
  test('12 V across 4 ohms is 3 A and 36 W, exactly', () => {
    const r = compute(base)
    expect(num(r, 'Voltage')).toBe(12)
    expect(num(r, 'Current')).toBe(3)
    expect(num(r, 'Resistance')).toBe(4)
    expect(num(r, 'Power')).toBe(36)
  })

  test('the headline at the defaults is the current, 3.000 A', () => {
    const r = compute(defaultValues(def) as Input)
    expect(r.primary.label).toBe('Current')
    expect(r.primary.value).toBe(3)
    expect(formatValue(r.primary.value, r.primary.format)).toBe('3.000 A')
  })

  test('the defaults are one self-consistent circuit, so every mode agrees', () => {
    for (const mode of MODES) {
      const r = compute({ ...base, mode })
      expect(four(r), mode).toEqual({ volts: 12, amps: 3, ohms: 4, watts: 36 })
    }
  })

  test('the two formulas actually used are named in the steps', () => {
    const labels = (mode: string) =>
      compute({ ...base, mode })
        .steps!.filter((s) => !('rule' in s))
        .map((s) => (s as { label: string }).label)

    expect(labels('vr')).toContain('I = V ÷ R')
    expect(labels('vr')).toContain('P = V² ÷ R')
    expect(labels('vi')).toContain('R = V ÷ I')
    expect(labels('vi')).toContain('P = V × I')
    expect(labels('ir')).toContain('V = I × R')
    expect(labels('ir')).toContain('P = I² × R')
    expect(labels('vp')).toContain('I = P ÷ V')
    expect(labels('vp')).toContain('R = V² ÷ P')
    expect(labels('ip')).toContain('V = P ÷ I')
    expect(labels('ip')).toContain('R = P ÷ I²')
    expect(labels('rp')).toContain('I = √(P ÷ R)')
    expect(labels('rp')).toContain('V = √(P × R)')
  })
})

describe('ohms law: the round trip', () => {
  /**
   * The second, independent confirmation. Solve a circuit from one pair, then
   * feed the four answers back in under every OTHER pairing. Each of those runs
   * uses different formulas — a division where the first used a square root, a
   * squaring where it used a multiplication — so agreement across all six is a
   * genuine cross-check rather than the same expression evaluated twice.
   */
  const seeds: ReadonlyArray<readonly [number, number]> = [
    [12, 4],
    [5, 220],
    [230, 57.5],
    [3.3, 470],
    [1.5, 0.75],
    [400, 12_000],
    [0.01, 1_000_000],
    [100_000, 0.1],
  ]

  test.each(seeds)('a %s V supply across %s ohms solves the same way from every pair', (
    volts,
    ohms,
  ) => {
    const start = four(compute({ ...base, mode: 'vr', voltage: volts, resistance: ohms }))
    expect(Number.isFinite(start.amps)).toBe(true)

    for (const mode of MODES) {
      const r = compute({
        ...base,
        mode,
        voltage: start.volts,
        current: start.amps,
        resistance: start.ohms,
        power: start.watts,
      })
      const back = four(r)
      expect(back.volts, `${mode} volts`).toBeCloseTo(start.volts, 8)
      expect(back.amps / start.amps, `${mode} amps`).toBeCloseTo(1, 10)
      expect(back.ohms / start.ohms, `${mode} ohms`).toBeCloseTo(1, 10)
      expect(back.watts / start.watts, `${mode} watts`).toBeCloseTo(1, 10)
    }
  })

  test('the three power forms agree across a sweep', () => {
    // P = V·I, P = I²R and P = V²/R are three different expressions of the same
    // quantity. If the calculator picked one that was subtly wrong, the other
    // two would disagree with it somewhere in here.
    for (const volts of [0.01, 1.5, 5, 12, 24, 120, 230, 400, 1000, 100_000]) {
      for (const ohms of [0.1, 1, 4.7, 47, 470, 4700, 100_000, 1_000_000]) {
        const { amps, watts } = four(compute({ ...base, mode: 'vr', voltage: volts, resistance: ohms }))
        expect(amps).toBeCloseTo(volts / ohms, 12)
        // Relative comparison: absolute closeness is meaningless when the
        // sweep spans 1e-7 W to 1e8 W.
        expect(watts / (volts * amps)).toBeCloseTo(1, 12)
        expect(watts / (amps * amps * ohms)).toBeCloseTo(1, 12)
        expect(watts / ((volts * volts) / ohms)).toBeCloseTo(1, 12)
      }
    }
  }, 30_000)
})

describe('ohms law: units', () => {
  test('5 mA through a 470 ohm resistor is 2.35 V and 11.75 mW', () => {
    // V = I·R = 0.005 × 470 = 2.35 V; P = I²R = 2.5e-5 × 470 = 0.01175 W.
    const r = compute({
      ...base,
      mode: 'ir',
      current: 5,
      currentUnit: 'mA',
      resistance: 470,
      resistanceUnit: 'ohm',
    })
    expect(num(r, 'Voltage')).toBeCloseTo(2.35, 12)
    expect(num(r, 'Power')).toBeCloseTo(0.01175, 12)
    expect(num(r, 'Current')).toBeCloseTo(0.005, 15)
  })

  test('the same physical circuit reads the same in any unit', () => {
    const inOhms = four(compute({ ...base, mode: 'vr', voltage: 9, resistance: 2200, resistanceUnit: 'ohm' }))
    const inKilohms = four(compute({ ...base, mode: 'vr', voltage: 9, resistance: 2.2, resistanceUnit: 'kohm' }))
    const inMegohms = four(compute({ ...base, mode: 'vr', voltage: 9, resistance: 0.0022, resistanceUnit: 'Mohm' }))
    expect(inKilohms.amps).toBeCloseTo(inOhms.amps, 15)
    expect(inMegohms.amps).toBeCloseTo(inOhms.amps, 15)

    const inAmps = four(compute({ ...base, mode: 'ir', current: 0.25, currentUnit: 'A' }))
    const inMilliamps = four(compute({ ...base, mode: 'ir', current: 250, currentUnit: 'mA' }))
    const inKiloamps = four(compute({ ...base, mode: 'ir', current: 0.00025, currentUnit: 'kA' }))
    expect(inMilliamps.volts).toBeCloseTo(inAmps.volts, 12)
    expect(inKiloamps.volts).toBeCloseTo(inAmps.volts, 12)

    const inWatts = four(compute({ ...base, mode: 'vp', power: 60, powerUnit: 'W' }))
    const inMilliwatts = four(compute({ ...base, mode: 'vp', power: 60_000, powerUnit: 'mW' }))
    const inKilowatts = four(compute({ ...base, mode: 'vp', power: 0.06, powerUnit: 'kW' }))
    expect(inMilliwatts.ohms).toBeCloseTo(inWatts.ohms, 10)
    expect(inKilowatts.ohms).toBeCloseTo(inWatts.ohms, 10)
  })

  test('every declared bound is a value compute accepts, in every variant', () => {
    // The same rule field-bounds.test.ts enforces registry-wide, asserted here
    // so it fails in this directory's own fast loop rather than only in a full
    // run — and so it covers the variants against every mode, not one at a time.
    for (const field of numberFields) {
      const cases = field.variants ? Object.keys(field.variants.cases) : ['']
      for (const caseKey of cases) {
        const state: Input = field.variants
          ? { ...base, [field.variants.on]: caseKey }
          : { ...base }
        const bounds = resolveBounds(field, state as unknown as Record<string, unknown>)
        for (const bound of [bounds.min, bounds.max]) {
          if (bound === undefined) continue
          for (const mode of MODES) {
            const where = `${field.id}[${caseKey || 'base'}]=${bound} in ${mode}`
            expect(thrownBy({ ...state, mode, [field.id]: bound }), where).toBeUndefined()
          }
        }
      }
    }
  })

  test('every number default lands on min + n × step in the base variant', () => {
    // An HTML range snaps to the grid, so an off-grid default silently shifts
    // the moment the slider is touched. Converting variants are exempt by
    // nature — 3 A is 3000 mA only because the factor says so.
    const onGrid = (min: number | undefined, step: number | undefined, value: number) => {
      if (min === undefined || step === undefined) return true
      const n = (value - min) / step
      return Math.abs(n - Math.round(n)) < 1e-9
    }
    for (const field of numberFields) {
      expect(onGrid(field.min, field.step, field.default), `${field.id} top level`).toBe(true)
      if (!field.variants) continue
      for (const [name, variant] of Object.entries(field.variants.cases)) {
        if ((variant.factor ?? 1) !== 1) continue
        expect(
          onGrid(variant.min ?? field.min, variant.step ?? field.step, field.default),
          `${field.id}[${name}]`,
        ).toBe(true)
      }
    }
  })

  test('the first variant listed is the base, and variants stay inside the union', () => {
    for (const field of numberFields) {
      if (!field.variants) continue
      const entries = Object.entries(field.variants.cases)
      expect((entries[0]![1].factor ?? 1), `${field.id} base factor`).toBe(1)
      for (const [name, variant] of entries) {
        if (variant.min !== undefined) expect(variant.min, `${field.id}[${name}]`).toBeGreaterThanOrEqual(field.min!)
        if (variant.max !== undefined) expect(variant.max, `${field.id}[${name}]`).toBeLessThanOrEqual(field.max!)
      }
      expect(field.default).toBeGreaterThanOrEqual(entries[0]![1].min ?? field.min!)
      expect(field.default).toBeLessThanOrEqual(entries[0]![1].max ?? field.max!)
    }
  })
})

describe('ohms law: the degenerate circuits', () => {
  test('zero resistance across a live supply is a short circuit, not Infinity', () => {
    const r = compute({ ...base, mode: 'vr', resistance: 0 })
    expect(text(r, 'Current')).toBe('Unlimited (short circuit)')
    expect(text(r, 'Power')).toBe('Unlimited (short circuit)')
    expect(num(r, 'Voltage')).toBe(12)
    expect(num(r, 'Resistance')).toBe(0)
    // Whatever the theme renders, it never shows the word Infinity or a NaN.
    for (const s of r.stats!) {
      const shown = formatValue(s.value, s.format)
      expect(shown).not.toContain('Infinity')
      expect(shown).not.toContain('NaN')
      expect(shown).not.toBe('—')
    }
    expect(r.notes!.some((n) => n.includes('short circuit'))).toBe(true)
  })

  test('the short circuit is reported the same way when power is the known pair', () => {
    // R = 0 with P > 0: I = sqrt(P/0) is unbounded, and V = sqrt(P × 0) is 0.
    const r = compute({ ...base, mode: 'rp', resistance: 0, power: 36 })
    expect(text(r, 'Current')).toBe('Unlimited (short circuit)')
    expect(num(r, 'Voltage')).toBe(0)
    expect(String(r.primary.value)).toBe('Unlimited (short circuit)')
  })

  test('zero current with a voltage across it is an open circuit', () => {
    const r = compute({ ...base, mode: 'vi', current: 0 })
    expect(text(r, 'Resistance')).toBe('Infinite (open circuit)')
    // Nothing is moving, so nothing is dissipated. That is a number, not a word.
    expect(num(r, 'Power')).toBe(0)
    expect(num(r, 'Voltage')).toBe(12)
    expect(num(r, 'Current')).toBe(0)
    expect(r.notes!.some((n) => n.includes('open circuit'))).toBe(true)
  })

  test('zero power at a known voltage is the same open circuit', () => {
    const r = compute({ ...base, mode: 'vp', power: 0 })
    expect(num(r, 'Current')).toBe(0)
    expect(text(r, 'Resistance')).toBe('Infinite (open circuit)')
  })

  test('a zero-resistance, zero-power pair is refused as indeterminate', () => {
    const err = thrownBy({ ...base, mode: 'rp', resistance: 0, power: 0 })
    expect(err).toBeInstanceOf(CalcError)
    expect((err as CalcError).fieldId).toBe('resistance')
  })

  test('zero current cannot carry power, and is refused against the current field', () => {
    for (const power of [36, 0]) {
      const err = thrownBy({ ...base, mode: 'ip', current: 0, power })
      expect(err, `power=${power}`).toBeInstanceOf(CalcError)
      expect((err as CalcError).fieldId).toBe('current')
    }
  })

  test('a square root of a negative number can never arise', () => {
    // Mode 'rp' is the only branch that takes a root. Both radicands are P/R and
    // P·R, and both P and R are guarded non-negative before they get there, so
    // the only way in would be a guard that stopped firing.
    for (const resistance of [-1, -0.0001, -1_000_000]) {
      expect((thrownBy({ ...base, mode: 'rp', resistance }) as CalcError).fieldId).toBe('resistance')
    }
    for (const power of [-1, -0.0001, -1_000_000]) {
      expect((thrownBy({ ...base, mode: 'rp', power }) as CalcError).fieldId).toBe('power')
    }
    for (const resistance of [0, 0.001, 1, 1e6]) {
      for (const power of [0.001, 1, 36, 1e6]) {
        const r = compute({ ...base, mode: 'rp', resistance, power })
        expect(Number.isNaN(Number(raw(r, 'Current'))), `${resistance}/${power}`).toBe(
          resistance === 0,
        )
        expect(Number.isNaN(num(r, 'Voltage'))).toBe(false)
      }
    }
  })
})

describe('ohms law: refusals', () => {
  test('negative power is refused against its own field', () => {
    for (const mode of ['vp', 'ip', 'rp'] as const) {
      const err = thrownBy({ ...base, mode, power: -1 })
      expect(err, mode).toBeInstanceOf(CalcError)
      expect((err as CalcError).fieldId, mode).toBe('power')
      expect((err as CalcError).message).toMatch(/passive/i)
    }
  })

  test('negative current and negative resistance are refused against their own fields', () => {
    for (const mode of ['vi', 'ir', 'ip'] as const) {
      expect((thrownBy({ ...base, mode, current: -0.5 }) as CalcError).fieldId).toBe('current')
    }
    for (const mode of ['vr', 'ir', 'rp'] as const) {
      expect((thrownBy({ ...base, mode, resistance: -5 }) as CalcError).fieldId).toBe('resistance')
    }
    for (const mode of ['vr', 'vi', 'vp'] as const) {
      expect((thrownBy({ ...base, mode, voltage: -12 }) as CalcError).fieldId).toBe('voltage')
      expect((thrownBy({ ...base, mode, voltage: 0 }) as CalcError).fieldId).toBe('voltage')
    }
  })

  test('an unknown mode or unit is refused against its select', () => {
    expect((thrownBy({ ...base, mode: 'nonsense' }) as CalcError).fieldId).toBe('mode')
    expect((thrownBy({ ...base, currentUnit: 'furlongs' }) as CalcError).fieldId).toBe('currentUnit')
    expect((thrownBy({ ...base, resistanceUnit: 'x' }) as CalcError).fieldId).toBe('resistanceUnit')
    expect((thrownBy({ ...base, powerUnit: 'x' }) as CalcError).fieldId).toBe('powerUnit')
  })

  /*
   * `coerceValues` in src/lib/view.ts turns an unparseable entry into a raw NaN
   * and hands it straight to compute, and every ordinary comparison against NaN
   * is false — so a magnitude check alone would let it through into the
   * arithmetic. Every field the mode reads must refuse it by name.
   */
  const nonFinite = [
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ] as const

  const readsField: Record<string, ReadonlyArray<(typeof MODES)[number]>> = {
    voltage: ['vr', 'vi', 'vp'],
    current: ['vi', 'ir', 'ip'],
    resistance: ['vr', 'ir', 'rp'],
    power: ['vp', 'ip', 'rp'],
  }

  test.each(
    Object.entries(readsField).flatMap(([fieldId, modes]) =>
      modes.flatMap((mode) => nonFinite.map(([label, value]) => [fieldId, mode, label, value] as const)),
    ),
  )('rejects %s = %s in mode %s with a CalcError, never a NaN result', (fieldId, mode, _label, value) => {
    const err = thrownBy({ ...base, mode, [fieldId]: value })
    expect(err, `${fieldId} in ${mode}`).toBeInstanceOf(CalcError)
    expect((err as CalcError).fieldId).toBe(fieldId)
  })

  test('a field the mode does not read is ignored, however bad it is', () => {
    // Mode 'vr' reads voltage and resistance only. Whatever is left in the other
    // two boxes must not be able to stop it answering.
    const r = compute({ ...base, mode: 'vr', current: Number.NaN, power: -999 })
    expect(num(r, 'Current')).toBe(3)
    expect(num(r, 'Power')).toBe(36)
  })
})

describe('ohms law: shape', () => {
  test('nudging the first number field 1.1x stays valid and moves the result', () => {
    // The e2e suite does exactly this in the DEFAULT mode, so pin the invariant.
    const firstNumber = fields.find((f) => f.kind === 'number')!
    expect(firstNumber.id).toBe('voltage')

    const defaults = defaultValues(def) as Input
    expect(defaults.mode).toBe('vr')
    const before = compute(defaults)
    const after = compute({ ...defaults, voltage: (firstNumber as { default: number }).default * 1.1 })

    expect(Number(after.primary.value)).not.toBe(Number(before.primary.value))
    expect(Number(after.primary.value)).toBeCloseTo(Number(before.primary.value) * 1.1, 9)
    expect(formatValue(after.primary.value, after.primary.format)).toBe('3.300 A')
    // The power goes as the square of the voltage, so it must move too.
    expect(num(after, 'Power') / num(before, 'Power')).toBeCloseTo(1.21, 9)
  })

  test('the counts of parts and series never vary, because there are none', () => {
    // Nothing here is a proportion of a whole and nothing runs over an axis, so
    // drawing either would be decoration pretending to be information — and a
    // count that appeared only off-default could never be server-rendered.
    for (const mode of MODES) {
      for (const resistance of [0, 4, 1_000_000]) {
        const r = compute({ ...base, mode, resistance, power: 36 })
        expect(r.parts).toBeUndefined()
        expect(r.series).toBeUndefined()
      }
    }
  })

  test('always reports all four quantities, in the same order, in every mode', () => {
    for (const mode of MODES) {
      const r = compute({ ...base, mode })
      expect(r.stats!.map((s) => s.label)).toEqual(['Voltage', 'Current', 'Resistance', 'Power'])
      expect(r.steps!.filter((s) => !('rule' in s))).toHaveLength(4)
    }
  })

  test('the headline is the first quantity the mode had to solve for', () => {
    const primaryLabel = (mode: string) => compute({ ...base, mode }).primary.label
    expect(primaryLabel('vr')).toBe('Current')
    expect(primaryLabel('vi')).toBe('Resistance')
    expect(primaryLabel('ir')).toBe('Voltage')
    expect(primaryLabel('vp')).toBe('Current')
    expect(primaryLabel('ip')).toBe('Voltage')
    expect(primaryLabel('rp')).toBe('Current')
    // The server renders `resultLabel` before the island attaches, so it has to
    // match what the default mode produces or the page changes on hydration.
    expect(def.resultLabel).toBe(primaryLabel('vr'))
  })

  test('nothing anywhere in the reachable space formats as NaN', () => {
    for (const mode of MODES) {
      for (const voltage of [0.01, 12, 100_000]) {
        for (const current of [0, 0.001, 3, 1000]) {
          for (const resistance of [0, 4, 1_000_000]) {
            for (const power of [0, 36, 1_000_000]) {
              let r: Result
              try {
                r = compute({ ...base, mode, voltage, current, resistance, power })
              } catch (err) {
                // A refusal is a refusal, not a broken answer.
                expect(err).toBeInstanceOf(CalcError)
                expect((err as CalcError).fieldId).toBeDefined()
                continue
              }
              const shown: Quantity[] = [
                r.primary,
                ...r.stats!,
                ...r.steps!.filter((s): s is Quantity => !('rule' in s)),
              ]
              for (const q of shown) {
                const s = formatValue(q.value, q.format)
                expect(s, `${mode} ${voltage}/${current}/${resistance}/${power}`).not.toContain('NaN')
                expect(s).not.toContain('Infinity')
                expect(s).not.toBe('')
              }
            }
          }
        }
      }
    }
  }, 30_000)

  test('the definition declares no scale, so compute need not return one', () => {
    expect('scale' in def).toBe(false)
    expect(compute(base).scaleValue).toBeUndefined()
  })

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
  })
})

import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'
import type { Field, NumberField, Quantity } from '../../../lib/types'
import { formatValue } from '../../../lib/format'
import { convertBetween, defaultValues, resolveBounds } from '../../../lib/view'

type Input = Parameters<typeof compute>[0]
type Result = ReturnType<typeof compute>

/**
 * Not `as const`: the fixture is spread with numeric overrides throughout, and
 * literal-pinned types would reject `{ pressure: 2 }` because the type is the
 * literal 1.
 */
const base: Input = {
  solveFor: 'moles',
  pressure: 1,
  pressureUnit: 'atm',
  volume: 22.414,
  volumeUnit: 'L',
  moles: 1,
  temperature: 273.15,
  temperatureUnit: 'K',
}

const MODES = ['moles', 'pressure', 'volume', 'temperature'] as const

/**
 * `as const satisfies readonly Field[]` keeps every literal, which is what makes
 * a renamed field id a compile error — but it also means the union member for
 * `moles` has no `variants` key at all. Widening to the declared interface is
 * how the shared tooling (`resolveBounds`, the theme) sees these anyway.
 */
const numberFields = (fields as readonly Field[]).filter(
  (f): f is NumberField => f.kind === 'number',
)

const num = (r: Result, label: string) => Number(r.stats!.find((s) => s.label === label)!.value)

/** All four quantities as reported, in whatever units the input asked for. */
const four = (r: Result) => ({
  pressure: num(r, 'Pressure'),
  volume: num(r, 'Volume'),
  moles: num(r, 'Amount of gas'),
  temperature: num(r, 'Temperature'),
})

const thrownBy = (input: Input): unknown => {
  try {
    compute(input)
    return undefined
  } catch (err) {
    return err
  }
}

/*
 * The independent check, written from the SI side of the law rather than the
 * litre-atmosphere side compute uses. Nothing here divides by 101.325, so a
 * mistake in that conversion cannot hide inside both.
 *
 * R = N_A x k_B = 6.02214076e23 x 1.380649e-23 = 8.31446261815324 J/mol/K
 * exactly; 8.314462618 is that to ten significant figures, which is what the
 * calculator is specified against.
 */
const R_SI = 8.314462618
const molesFromSI = (atm: number, litres: number, kelvin: number) =>
  (atm * 101_325 * (litres / 1000)) / (R_SI * kelvin)

describe('ideal gas law: the anchor', () => {
  test('the L·atm gas constant is derived from the SI one, not copied', () => {
    // 1 atm is defined as 101325 Pa and 1 L as 1e-3 m³, so 1 L·atm = 101.325 J
    // exactly. The familiar 0.082057366 falls straight out.
    const rLitreAtm = R_SI / 101.325
    expect(rLitreAtm).toBeCloseTo(0.082057366, 9)
    // And the molar volume it implies at STP is the textbook 22.414 L/mol.
    expect(rLitreAtm * 273.15).toBeCloseTo(22.413969545, 8)
  })

  test('the STP defaults give one mole, to four decimal places', () => {
    const r = compute(defaultValues(def) as Input)
    expect(r.primary.label).toBe('Amount of gas')
    expect(formatValue(r.primary.value, r.primary.format)).toBe('1.0000 mol')
    // Not exactly 1: 22.414 is the rounded molar volume, and the exact one is
    // 22.413969545 L, so the defaults close to about 1.4 parts per million.
    expect(Number(r.primary.value)).toBeCloseTo(1.0000013588, 9)
    // Confirmed a second way, entirely in SI units.
    expect(Number(r.primary.value)).toBeCloseTo(molesFromSI(1, 22.414, 273.15), 12)
  })

  test('the defaults are one self-consistent gas sample, so every mode agrees', () => {
    const expected = { pressure: 1, volume: 22.414, moles: 1, temperature: 273.15 }
    for (const mode of MODES) {
      const got = four(compute({ ...base, solveFor: mode }))
      for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
        // Relative, because the four span 1 to 273. Six digits is well inside
        // the 1.4e-6 the rounded 22.414 costs.
        expect(got[key] / expected[key], `${mode} ${key}`).toBeCloseTo(1, 5)
      }
    }
  })

  test('the defaults print the same numbers back in every mode', () => {
    const shown = (mode: string) => {
      const r = compute({ ...base, solveFor: mode })
      return r.stats!.slice(0, 4).map((s) => formatValue(s.value, s.format))
    }
    for (const mode of MODES) {
      expect(shown(mode), mode).toEqual(['1.0000 atm', '22.4140 L', '1.0000 mol', '273.15 K'])
    }
  })

  test('the rearrangement actually used is named in the steps', () => {
    const labels = (mode: string) =>
      compute({ ...base, solveFor: mode })
        .steps!.filter((s) => !('rule' in s))
        .map((s) => (s as { label: string }).label)

    expect(labels('moles')).toContain('n = P × V ÷ (R × T)')
    expect(labels('pressure')).toContain('P = n × R × T ÷ V')
    expect(labels('volume')).toContain('V = n × R × T ÷ P')
    expect(labels('temperature')).toContain('T = P × V ÷ (n × R)')
  })
})

describe('ideal gas law: against published figures', () => {
  /*
   * Values the outside world already agrees on. Each catches a class of
   * plausible-but-wrong formula that self-consistent arithmetic would happily
   * confirm — a molar volume of 22.4 at the wrong reference pressure, for one.
   */
  test('molar volume at STP (0 °C, 1 atm) is 22.414 L/mol', () => {
    const r = compute({ ...base, solveFor: 'volume', moles: 1, pressure: 1, temperature: 273.15 })
    expect(num(r, 'Volume')).toBeCloseTo(22.413969545, 7)
  })

  test('molar volume at IUPAC standard conditions (0 °C, 1 bar) is 22.711 L/mol', () => {
    // IUPAC moved its standard pressure from 1 atm to 1 bar in 1982, and the
    // molar volume it publishes for 273.15 K is 22.711 L/mol.
    const r = compute({
      ...base,
      solveFor: 'volume',
      moles: 1,
      pressure: 1,
      pressureUnit: 'bar',
      temperature: 273.15,
    })
    expect(num(r, 'Volume')).toBeCloseTo(22.711, 3)
  })

  test('molar volume at SATP (25 °C, 1 bar) is 24.7896 L/mol', () => {
    // IUPAC quotes 24.789 L/mol at 100 kPa and 298.15 K; RT/P gives 24.789570.
    const r = compute({
      ...base,
      solveFor: 'volume',
      moles: 1,
      pressure: 1,
      pressureUnit: 'bar',
      temperature: 25,
      temperatureUnit: 'C',
    })
    expect(num(r, 'Volume')).toBeCloseTo(24.78957, 4)
  })

  test('molar volume at 25 °C and 1 atm is 24.465 L/mol', () => {
    const r = compute({
      ...base,
      solveFor: 'volume',
      moles: 1,
      pressure: 1,
      temperature: 25,
      temperatureUnit: 'C',
    })
    expect(num(r, 'Volume')).toBeCloseTo(24.4654, 4)
  })

  test('a worked textbook problem: 0.500 mol in 2.00 L at 300 K', () => {
    // P = nRT/V = 0.5 × 0.08205736608 × 300 ÷ 2 = 6.15430 atm. Confirmed from
    // the SI side: 0.5 × 8.314462618 × 300 ÷ 0.002 m³ = 623 589 Pa, and
    // 623589.1964 ÷ 101325 = 6.15430 atm.
    const r = compute({ ...base, solveFor: 'pressure', moles: 0.5, volume: 2, temperature: 300 })
    expect(num(r, 'Pressure')).toBeCloseTo(6.154302456, 8)
    expect(num(r, 'Pressure')).toBeCloseTo((0.5 * R_SI * 300) / 0.002 / 101_325, 10)
  })
})

describe('ideal gas law: the round trip', () => {
  /**
   * The second, independent confirmation of the whole solver. Fix a state from
   * one mode, then feed the four answers back under every OTHER mode. Each of
   * those runs a different rearrangement — a multiplication where the first did
   * a division — so agreement across all four is a genuine cross-check rather
   * than the same expression evaluated twice.
   */
  const seeds: ReadonlyArray<readonly [number, number, number]> = [
    [1, 22.414, 273.15],
    [2.5, 10, 300],
    [0.001, 100_000, 1000],
    [500, 0.05, 77],
    [1.013, 1, 293.15],
    [10, 5, 5000],
    [0.25, 250, 195],
  ]

  test.each(seeds)('P=%s atm, V=%s L, T=%s K solves the same way from every mode', (
    atm,
    litres,
    kelvin,
  ) => {
    const start = four(
      compute({ ...base, solveFor: 'moles', pressure: atm, volume: litres, temperature: kelvin }),
    )
    expect(start.moles).toBeCloseTo(molesFromSI(atm, litres, kelvin), 10)

    for (const mode of MODES) {
      const back = four(
        compute({
          ...base,
          solveFor: mode,
          pressure: start.pressure,
          volume: start.volume,
          moles: start.moles,
          temperature: start.temperature,
        }),
      )
      expect(back.pressure / start.pressure, `${mode} P`).toBeCloseTo(1, 10)
      expect(back.volume / start.volume, `${mode} V`).toBeCloseTo(1, 10)
      expect(back.moles / start.moles, `${mode} n`).toBeCloseTo(1, 10)
      expect(back.temperature / start.temperature, `${mode} T`).toBeCloseTo(1, 10)
    }
  })

  test('PV = nRT holds across a sweep, whichever variable was the unknown', () => {
    for (const mode of MODES) {
      for (const pressure of [0.001, 1, 10, 1000]) {
        for (const volume of [0.001, 1, 22.414, 100_000]) {
          for (const temperature of [0.01, 77, 273.15, 6000]) {
            for (const moles of [0.001, 1, 10_000]) {
              const r = compute({ ...base, solveFor: mode, pressure, volume, moles, temperature })
              const s = four(r)
              const left = s.pressure * s.volume
              const right = s.moles * (R_SI / 101.325) * s.temperature
              expect(left / right, `${mode} ${pressure}/${volume}/${moles}/${temperature}`).toBeCloseTo(
                1,
                9,
              )
            }
          }
        }
      }
    }
  }, 30_000)

  test('Boyle, Charles and Avogadro all fall out of it', () => {
    // Boyle: at fixed n and T, doubling V halves P.
    const p1 = num(compute({ ...base, solveFor: 'pressure', volume: 10 }), 'Pressure')
    const p2 = num(compute({ ...base, solveFor: 'pressure', volume: 20 }), 'Pressure')
    expect(p1 / p2).toBeCloseTo(2, 12)

    // Charles: at fixed n and P, V is proportional to absolute temperature.
    const v1 = num(compute({ ...base, solveFor: 'volume', temperature: 300 }), 'Volume')
    const v2 = num(compute({ ...base, solveFor: 'volume', temperature: 600 }), 'Volume')
    expect(v2 / v1).toBeCloseTo(2, 12)

    // Avogadro: at fixed P and T, V is proportional to the amount.
    const a1 = num(compute({ ...base, solveFor: 'volume', moles: 1 }), 'Volume')
    const a2 = num(compute({ ...base, solveFor: 'volume', moles: 3 }), 'Volume')
    expect(a2 / a1).toBeCloseTo(3, 12)
  })
})

describe('ideal gas law: units', () => {
  test('one atmosphere expressed five ways is one and the same pressure', () => {
    // 1 atm ≡ 101325 Pa and 1 bar ≡ 100 kPa, both exact; a torr is exactly
    // 1/760 atm; and a psi is 4.4482216152605 N over (0.0254 m)², also exact.
    const molesAt = (value: number, unit: string) =>
      num(compute({ ...base, solveFor: 'moles', pressure: value, pressureUnit: unit }), 'Amount of gas')
    const reference = molesAt(1, 'atm')
    expect(molesAt(101.325, 'kPa') / reference).toBeCloseTo(1, 12)
    expect(molesAt(1.01325, 'bar') / reference).toBeCloseTo(1, 12)
    expect(molesAt(760, 'mmHg') / reference).toBeCloseTo(1, 12)
    expect(molesAt(14.695948775513449, 'psi') / reference).toBeCloseTo(1, 12)
  })

  test('the same physical volume reads the same in L, mL and m³', () => {
    const molesAt = (value: number, unit: string) =>
      num(compute({ ...base, solveFor: 'moles', volume: value, volumeUnit: unit }), 'Amount of gas')
    expect(molesAt(22414, 'mL') / molesAt(22.414, 'L')).toBeCloseTo(1, 12)
    expect(molesAt(0.022414, 'm3') / molesAt(22.414, 'L')).toBeCloseTo(1, 12)
  })

  /*
   * The affine cases. A plain multiplier CANNOT express these — 0 °C is 273.15 K
   * and 0 K is −273.15 °C, so there is no factor f with K = f × °C. Both
   * directions are checked: the value compute reads, and the value it reports.
   */
  test('0 °C, 32 °F and 273.15 K are the same temperature to the solver', () => {
    const molesAt = (value: number, unit: string) =>
      num(
        compute({ ...base, solveFor: 'moles', temperature: value, temperatureUnit: unit }),
        'Amount of gas',
      )
    expect(molesAt(0, 'C') / molesAt(273.15, 'K')).toBeCloseTo(1, 12)
    expect(molesAt(32, 'F') / molesAt(273.15, 'K')).toBeCloseTo(1, 12)
    // And a second, unrelated point on all three scales: body temperature.
    expect(molesAt(37, 'C') / molesAt(310.15, 'K')).toBeCloseTo(1, 12)
    expect(molesAt(98.6, 'F') / molesAt(310.15, 'K')).toBeCloseTo(1, 12)
  })

  test('a solved temperature comes back on the scale that was selected', () => {
    const solved = (unit: string) =>
      num(compute({ ...base, solveFor: 'temperature', temperatureUnit: unit }), 'Temperature')
    // The defaults are STP, so the answer is 273.15 K = 0 °C = 32 °F — within
    // the 1.4 ppm the rounded 22.414 L costs, which on the Fahrenheit scale is
    // a shift of 0.0007 of a degree.
    expect(solved('K')).toBeCloseTo(273.15, 2)
    expect(solved('C')).toBeCloseTo(0, 2)
    expect(solved('F')).toBeCloseTo(32, 2)
    // The three answers are the same temperature as each other, exactly.
    expect(solved('C')).toBeCloseTo(solved('K') - 273.15, 9)
    expect(solved('F')).toBeCloseTo(solved('K') * 1.8 - 459.67, 9)
  })

  test('the affine variants round-trip through the shared converter', () => {
    // The same function the browser calls when the unit selector changes. If
    // fields.ts declared a `factor` instead, 273.15 K would become 273.15 °C.
    const cases = (fields.find((f) => f.id === 'temperature') as NumberField).variants!.cases
    expect(convertBetween(273.15, cases.K, cases.C)).toBeCloseTo(0, 9)
    expect(convertBetween(273.15, cases.K, cases.F)).toBeCloseTo(32, 9)
    expect(convertBetween(0, cases.C, cases.F)).toBeCloseTo(32, 9)
    expect(convertBetween(212, cases.F, cases.C)).toBeCloseTo(100, 9)
    expect(convertBetween(-40, cases.C, cases.F)).toBeCloseTo(-40, 9)
  })

  test('every declared bound is a value compute accepts, in every variant and mode', () => {
    // The same rule field-bounds.test.ts enforces registry-wide, asserted here
    // so it fails in this directory's own fast loop rather than only in a full
    // run — and so it covers each variant against every mode, not one at a time.
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
            expect(thrownBy({ ...state, solveFor: mode, [field.id]: bound }), where).toBeUndefined()
          }
        }
      }
    }
  })

  test('every number default lands on min + n × step in the base variant', () => {
    // An HTML range snaps to the grid, so an off-grid default silently shifts
    // the moment the slider is touched. Converting variants are exempt by
    // nature — 273.15 K is 0 °C only because the affine map says so.
    const onGrid = (min: number | undefined, step: number | undefined, value: number) => {
      if (min === undefined || step === undefined) return true
      const n = (value - min) / step
      return Math.abs(n - Math.round(n)) < 1e-9
    }
    for (const field of numberFields) {
      expect(onGrid(field.min, field.step, field.default), `${field.id} top level`).toBe(true)
      if (!field.variants) continue
      for (const [name, variant] of Object.entries(field.variants.cases)) {
        if ((variant.factor ?? 1) !== 1 || variant.convert) continue
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
      expect(entries[0]![1].factor ?? 1, `${field.id} base factor`).toBe(1)
      expect(entries[0]![1].convert, `${field.id} base conversion`).toBeUndefined()
      for (const [name, variant] of entries) {
        if (variant.min !== undefined)
          expect(variant.min, `${field.id}[${name}]`).toBeGreaterThanOrEqual(field.min!)
        if (variant.max !== undefined)
          expect(variant.max, `${field.id}[${name}]`).toBeLessThanOrEqual(field.max!)
      }
      expect(field.default).toBeGreaterThanOrEqual(entries[0]![1].min ?? field.min!)
      expect(field.default).toBeLessThanOrEqual(entries[0]![1].max ?? field.max!)
    }
  })
})

describe('ideal gas law: refusals', () => {
  test('absolute zero and below are refused on every scale', () => {
    // 0 K, −273.15 °C and −459.67 °F are the same temperature, and nothing is
    // colder. Each must be refused against the temperature field by name.
    for (const [unit, value] of [
      ['K', 0],
      ['K', -1],
      ['C', -273.15],
      ['C', -300],
      ['F', -459.67],
      ['F', -500],
    ] as const) {
      const err = thrownBy({ ...base, temperature: value, temperatureUnit: unit })
      expect(err, `${value} ${unit}`).toBeInstanceOf(CalcError)
      expect((err as CalcError).fieldId).toBe('temperature')
      expect((err as CalcError).message).toMatch(/absolute zero/i)
    }
  })

  test('the smallest temperature each slider offers is still above absolute zero', () => {
    // The bound is not absolute zero itself: −273.1 °C is 0.05 K and −459.6 °F
    // is 0.039 K, both answerable.
    for (const [unit, value] of [
      ['K', 0.01],
      ['C', -273.1],
      ['F', -459.6],
    ] as const) {
      expect(thrownBy({ ...base, temperature: value, temperatureUnit: unit }), unit).toBeUndefined()
    }
  })

  test('zero and negative pressure, volume and amount are refused by name', () => {
    for (const mode of ['moles', 'volume', 'temperature'] as const) {
      expect((thrownBy({ ...base, solveFor: mode, pressure: 0 }) as CalcError).fieldId).toBe('pressure')
      expect((thrownBy({ ...base, solveFor: mode, pressure: -1 }) as CalcError).fieldId).toBe('pressure')
    }
    for (const mode of ['moles', 'pressure', 'temperature'] as const) {
      expect((thrownBy({ ...base, solveFor: mode, volume: 0 }) as CalcError).fieldId).toBe('volume')
      expect((thrownBy({ ...base, solveFor: mode, volume: -5 }) as CalcError).fieldId).toBe('volume')
    }
    for (const mode of ['pressure', 'volume', 'temperature'] as const) {
      expect((thrownBy({ ...base, solveFor: mode, moles: 0 }) as CalcError).fieldId).toBe('moles')
      expect((thrownBy({ ...base, solveFor: mode, moles: -2 }) as CalcError).fieldId).toBe('moles')
    }
  })

  test('an unknown mode or unit is refused against its own select', () => {
    expect((thrownBy({ ...base, solveFor: 'entropy' }) as CalcError).fieldId).toBe('solveFor')
    expect((thrownBy({ ...base, pressureUnit: 'furlongs' }) as CalcError).fieldId).toBe('pressureUnit')
    expect((thrownBy({ ...base, volumeUnit: 'hogsheads' }) as CalcError).fieldId).toBe('volumeUnit')
    expect((thrownBy({ ...base, temperatureUnit: 'rankine' }) as CalcError).fieldId).toBe(
      'temperatureUnit',
    )
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

  const readsField: Record<string, ReadonlyArray<Mode>> = {
    pressure: ['moles', 'volume', 'temperature'],
    volume: ['moles', 'pressure', 'temperature'],
    moles: ['pressure', 'volume', 'temperature'],
    temperature: ['moles', 'pressure', 'volume'],
  }
  type Mode = (typeof MODES)[number]

  test.each(
    Object.entries(readsField).flatMap(([fieldId, modes]) =>
      modes.flatMap((mode) =>
        nonFinite.map(([label, value]) => [fieldId, mode, label, value] as const),
      ),
    ),
  )('rejects %s in mode %s (%s) with a CalcError, never a NaN result', (fieldId, mode, _label, value) => {
    const err = thrownBy({ ...base, solveFor: mode, [fieldId]: value })
    expect(err, `${fieldId} in ${mode}`).toBeInstanceOf(CalcError)
    expect((err as CalcError).fieldId).toBe(fieldId)
  })

  test('the box for the unknown is ignored, however bad it holds', () => {
    // Solving for the amount reads P, V and T only. Whatever is left in the
    // moles box must not be able to stop it answering.
    const r = compute({ ...base, solveFor: 'moles', moles: Number.NaN })
    expect(Number(r.primary.value)).toBeCloseTo(1.0000013588, 9)
    const p = compute({ ...base, solveFor: 'pressure', pressure: -999 })
    expect(num(p, 'Pressure')).toBeCloseTo(0.999998641, 9)
  })
})

describe('ideal gas law: shape', () => {
  test('nudging the first number field 1.1x stays valid and moves the result', () => {
    // The e2e suite does exactly this in the DEFAULT mode, so pin the invariant.
    const firstNumber = fields.find((f) => f.kind === 'number')!
    expect(firstNumber.id).toBe('pressure')

    const defaults = defaultValues(def) as Input
    expect(defaults.solveFor).toBe('moles')
    const before = compute(defaults)
    const after = compute({ ...defaults, pressure: (firstNumber as { default: number }).default * 1.1 })

    expect(Number(after.primary.value)).not.toBe(Number(before.primary.value))
    // n is exactly proportional to P at fixed V and T.
    expect(Number(after.primary.value) / Number(before.primary.value)).toBeCloseTo(1.1, 12)
    expect(formatValue(after.primary.value, after.primary.format)).toBe('1.1000 mol')
  })

  test('the isotherm is drawn in every mode, ordered, finite, and through the answer', () => {
    for (const mode of MODES) {
      const r = compute({ ...base, solveFor: mode })
      expect(r.series, mode).toHaveLength(1)
      const points = r.series![0]!.points
      expect(points.length, mode).toBeGreaterThan(1)
      points.forEach((point, i) => {
        expect(Number.isFinite(point[0]), `${mode} x${i}`).toBe(true)
        expect(Number.isFinite(point[1]), `${mode} y${i}`).toBe(true)
        expect(point[0], `${mode} x${i}`).toBeGreaterThan(0)
        expect(point[1], `${mode} y${i}`).toBeGreaterThan(0)
        // Strictly increasing x, or the chart path doubles back on itself.
        if (i > 0) expect(point[0], `${mode} x${i}`).toBeGreaterThan(points[i - 1]![0])
      })

      // It is an isotherm: P × V is the same at every point on it, and equal to
      // the solved state's own P × V.
      const solved = four(r)
      const pv = solved.pressure * solved.volume
      for (const [x, y] of points) expect((x * y) / pv, mode).toBeCloseTo(1, 9)

      // And it passes exactly through the reported point, not merely near it.
      expect(points.some(([x, y]) => x === solved.volume && y === solved.pressure), mode).toBe(true)
    }
  })

  test('the isotherm is present at the DEFAULTS, so the chart is server-rendered', () => {
    // A series that appeared only off-default would never get a container to
    // redraw into — registry.test.ts enforces this registry-wide.
    const r = compute(defaultValues(def) as Input)
    expect(r.series?.length).toBe(1)
    expect(r.series![0]!.points.length).toBeGreaterThan(1)
  })

  test('there are no parts and no scale, because there is no proportion to draw', () => {
    for (const mode of MODES) {
      for (const pressure of [0.001, 1, 1000]) {
        const r = compute({ ...base, solveFor: mode, pressure })
        expect(r.parts).toBeUndefined()
        expect(r.scaleValue).toBeUndefined()
      }
    }
    expect('scale' in def).toBe(false)
  })

  test('always reports all four quantities, in the same order, in every mode', () => {
    for (const mode of MODES) {
      const r = compute({ ...base, solveFor: mode })
      expect(r.stats!.map((s) => s.label)).toEqual([
        'Pressure',
        'Volume',
        'Amount of gas',
        'Temperature',
        'Molar volume',
      ])
      expect(r.steps!.filter((s) => !('rule' in s))).toHaveLength(4)
    }
  })

  test('the headline is whatever the mode was asked to solve for', () => {
    const primaryLabel = (mode: string) => compute({ ...base, solveFor: mode }).primary.label
    expect(primaryLabel('moles')).toBe('Amount of gas')
    expect(primaryLabel('pressure')).toBe('Pressure')
    expect(primaryLabel('volume')).toBe('Volume')
    expect(primaryLabel('temperature')).toBe('Temperature')
    // The server renders `resultLabel` before the island attaches, so it has to
    // match what the default mode produces or the page changes on hydration.
    expect(def.resultLabel).toBe(primaryLabel('moles'))
  })

  test('nothing anywhere in the reachable space formats as NaN', () => {
    for (const mode of MODES) {
      for (const pressure of [0.001, 1, 100_000]) {
        for (const volume of [0.001, 22.414, 1_000_000]) {
          for (const moles of [0.001, 1, 10_000]) {
            for (const temperature of [0.01, 273.15, 6000]) {
              let r: Result
              try {
                r = compute({ ...base, solveFor: mode, pressure, volume, moles, temperature })
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
                const where = `${mode} ${pressure}/${volume}/${moles}/${temperature}`
                expect(s, where).not.toContain('NaN')
                expect(s, where).not.toContain('Infinity')
                expect(s, where).not.toBe('')
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
  })
})

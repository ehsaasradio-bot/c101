import { describe, expect, test } from 'vitest'
import compute from './compute'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'
import type { Values } from '../../../lib/types'

type Input = Values<typeof fields>

const base: Input = {
  value: 100,
  category: 'length',
  fromUnit: 'kilometre',
  toUnit: 'mile',
}

const out = (patch: Partial<Input>) => Number(compute({ ...base, ...patch }).primary.value)

const LENGTH_UNITS = ['millimetre', 'centimetre', 'metre', 'kilometre', 'inch', 'foot', 'yard', 'mile']
const WEIGHT_UNITS = ['milligram', 'gram', 'kilogram', 'tonne', 'ounce', 'pound', 'stone']

describe('unit converter — length', () => {
  test('100 km in miles, cross-checked against the 1959 yard definition', () => {
    // A mile is 1760 international yards and a yard is exactly 0.9144 m, so the
    // answer must satisfy miles × 1760 × 0.9144 = 100 000 m. Derived, not recited.
    const miles = out({})
    expect(miles * 1760 * 0.9144).toBeCloseTo(100_000, 6)
  })

  test('the exact inch chain holds: 12 in = 1 ft, 3 ft = 1 yd, 1760 yd = 1 mi', () => {
    expect(out({ value: 12, fromUnit: 'inch', toUnit: 'foot' })).toBeCloseTo(1, 12)
    expect(out({ value: 3, fromUnit: 'foot', toUnit: 'yard' })).toBeCloseTo(1, 12)
    expect(out({ value: 1760, fromUnit: 'yard', toUnit: 'mile' })).toBeCloseTo(1, 12)
    expect(out({ value: 1, fromUnit: 'inch', toUnit: 'millimetre' })).toBeCloseTo(25.4, 12)
  })

  test('a two-hop chain equals the direct conversion', () => {
    // Independent method: km → metre → mile, versus the single km → mile call.
    const viaMetres = out({
      value: out({ value: 100, toUnit: 'metre' }),
      fromUnit: 'metre',
      toUnit: 'mile',
    })
    expect(viaMetres).toBeCloseTo(out({}), 9)
  })

  test('every length pair round-trips back to the original value', () => {
    for (const from of LENGTH_UNITS) {
      for (const to of LENGTH_UNITS) {
        const there = out({ value: 7, fromUnit: from, toUnit: to })
        const back = out({ value: there, fromUnit: to, toUnit: from })
        expect(back).toBeCloseTo(7, 9)
      }
    }
  })

  test('converting a unit to itself is the identity', () => {
    for (const u of LENGTH_UNITS) {
      expect(out({ value: 3.25, fromUnit: u, toUnit: u })).toBeCloseTo(3.25, 12)
    }
  })

  test('zero converts to zero', () => {
    expect(out({ value: 0 })).toBe(0)
  })
})

describe('unit converter — weight', () => {
  const w = { category: 'weight' } as const

  test('a stone is fourteen pounds and a pound is sixteen ounces', () => {
    expect(out({ ...w, value: 1, fromUnit: 'stone', toUnit: 'pound' })).toBeCloseTo(14, 12)
    expect(out({ ...w, value: 1, fromUnit: 'pound', toUnit: 'ounce' })).toBeCloseTo(16, 12)
  })

  test('1 kg in pounds satisfies the exact 0.45359237 kg definition', () => {
    const lb = out({ ...w, value: 1, fromUnit: 'kilogram', toUnit: 'pound' })
    expect(lb * 0.45359237).toBeCloseTo(1, 12)
  })

  test('the metric prefixes line up', () => {
    expect(out({ ...w, value: 1, fromUnit: 'tonne', toUnit: 'kilogram' })).toBeCloseTo(1000, 9)
    expect(out({ ...w, value: 1, fromUnit: 'gram', toUnit: 'milligram' })).toBeCloseTo(1000, 9)
  })

  test('every weight pair round-trips back to the original value', () => {
    for (const from of WEIGHT_UNITS) {
      for (const to of WEIGHT_UNITS) {
        const there = out({ ...w, value: 5.5, fromUnit: from, toUnit: to })
        const back = out({ ...w, value: there, fromUnit: to, toUnit: from })
        expect(back).toBeCloseTo(5.5, 9)
      }
    }
  })

  test('the reported factor reproduces the primary result', () => {
    const r = compute({ ...base, ...w, value: 12, fromUnit: 'kilogram', toUnit: 'pound' })
    const factor = Number(r.stats!.find((s) => s.label === '1 kg in lb')!.value)
    expect(Number(r.primary.value)).toBeCloseTo(12 * factor, 9)
  })
})

describe('unit converter — temperature', () => {
  const t = { category: 'temperature' } as const

  test('water boils and freezes at the textbook readings', () => {
    expect(out({ ...t, value: 100, fromUnit: 'celsius', toUnit: 'fahrenheit' })).toBeCloseTo(212, 9)
    expect(out({ ...t, value: 0, fromUnit: 'celsius', toUnit: 'fahrenheit' })).toBeCloseTo(32, 9)
    expect(out({ ...t, value: 98.6, fromUnit: 'fahrenheit', toUnit: 'celsius' })).toBeCloseTo(37, 9)
  })

  test('−40 is the crossing point of the two scales', () => {
    expect(out({ ...t, value: -40, fromUnit: 'celsius', toUnit: 'fahrenheit' })).toBeCloseTo(-40, 9)
    expect(out({ ...t, value: -40, fromUnit: 'fahrenheit', toUnit: 'celsius' })).toBeCloseTo(-40, 9)
  })

  test('kelvin is an offset of Celsius and absolute zero is the boundary', () => {
    expect(out({ ...t, value: 0, fromUnit: 'kelvin', toUnit: 'celsius' })).toBeCloseTo(-273.15, 9)
    expect(out({ ...t, value: -273.15, fromUnit: 'celsius', toUnit: 'kelvin' })).toBeCloseTo(0, 9)
    expect(out({ ...t, value: -459.67, fromUnit: 'fahrenheit', toUnit: 'kelvin' })).toBeCloseTo(0, 9)
  })

  test('a one-degree Celsius step is exactly 1.8 Fahrenheit degrees', () => {
    const a = out({ ...t, value: 20, fromUnit: 'celsius', toUnit: 'fahrenheit' })
    const b = out({ ...t, value: 21, fromUnit: 'celsius', toUnit: 'fahrenheit' })
    expect(b - a).toBeCloseTo(1.8, 9)
  })

  test('all three scales are reported and agree with each other', () => {
    const r = compute({ ...base, ...t, value: 25, fromUnit: 'celsius', toUnit: 'kelvin' })
    const stat = (label: string) => Number(r.stats!.find((s) => s.label === label)!.value)
    expect(stat('Celsius')).toBeCloseTo(25, 9)
    expect(stat('Fahrenheit')).toBeCloseTo(77, 9)
    expect(stat('Kelvin')).toBeCloseTo(298.15, 9)
  })
})

describe('unit converter — invalid input', () => {
  const cases: Array<[string, Partial<Input>, string]> = [
    ['a weight unit in the length category', { fromUnit: 'kilogram' }, 'fromUnit'],
    ['a temperature unit as the target', { toUnit: 'celsius' }, 'toUnit'],
    [
      'a length unit in the weight category',
      { category: 'weight', fromUnit: 'kilogram', toUnit: 'mile' },
      'toUnit',
    ],
    ['a negative length', { value: -5 }, 'value'],
    ['a negative weight', { category: 'weight', fromUnit: 'gram', toUnit: 'kilogram', value: -1 }, 'value'],
    [
      'a temperature below absolute zero',
      { category: 'temperature', fromUnit: 'celsius', toUnit: 'kelvin', value: -300 },
      'value',
    ],
    ['a non-numeric value', { value: Number.NaN }, 'value'],
  ]

  test.each(cases)('rejects %s', (_label, patch, fieldId) => {
    let thrown: unknown
    try {
      compute({ ...base, ...patch } as never)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
  })

  test('never returns NaN for valid input', () => {
    expect(Number.isFinite(out({}))).toBe(true)
  })
})

describe('defaults', () => {
  test('the declared defaults are valid input', () => {
    const defaults = Object.fromEntries(fields.map((f) => [f.id, f.default])) as never
    expect(() => compute(defaults)).not.toThrow()
  })

  test('nudging the first number field by 10% stays valid and moves the result', () => {
    const defaults = Object.fromEntries(fields.map((f) => [f.id, f.default])) as Record<
      string,
      unknown
    >
    const first = fields.find((f) => f.kind === 'number')!
    const bumped = { ...defaults, [first.id]: (first.default as number) * 1.1 } as never
    expect(Number(compute(bumped).primary.value)).not.toBeCloseTo(
      Number(compute(defaults as never).primary.value),
      6,
    )
  })
})

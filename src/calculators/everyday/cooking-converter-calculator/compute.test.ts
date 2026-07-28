import { describe, it, expect } from 'vitest'
import compute from './compute'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'
import type { Values } from '../../../lib/types'

type V = Values<typeof fields>

const base: V = { amount: 1, fromUnit: 'cup', toUnit: 'millilitre' }
const run = (over: Partial<V> = {}): ReturnType<typeof compute> => compute({ ...base, ...over })
const primary = (over: Partial<V> = {}): number => Number(run(over).primary.value)

/**
 * Independent ground truth, from the legal definitions rather than from the
 * calculator's own table: the US liquid gallon is exactly 3.785411784 litres,
 * and the customary sub-units are exact binary/decimal fractions of it.
 */
const GALLON_ML = 3785.411784
const TRUE_ML = {
  quart: GALLON_ML / 4,
  pint: GALLON_ML / 8,
  cup: GALLON_ML / 16,
  fluidOunce: GALLON_ML / 128,
  tablespoon: GALLON_ML / 256,
  teaspoon: GALLON_ML / 768,
  millilitre: 1,
  litre: 1000,
}

describe('cooking-converter-calculator', () => {
  it('matches the legal definition of each US measure, not just its own table', () => {
    for (const [unit, trueMl] of Object.entries(TRUE_ML)) {
      const got = primary({ amount: 1, fromUnit: unit as V['fromUnit'], toUnit: 'millilitre' })
      // Agreement to 1 part in 10^5 — the table rounds at the 6th significant
      // figure, which is orders of magnitude finer than any measuring jug.
      expect(Math.abs(got - trueMl) / trueMl).toBeLessThan(1e-5)
    }
  })

  it('reproduces the ratios every cook knows by heart', () => {
    const close = (got: number, want: number) =>
      expect(Math.abs(got - want) / want).toBeLessThan(1e-5)

    close(primary({ fromUnit: 'cup', toUnit: 'tablespoon' }), 16)
    close(primary({ fromUnit: 'cup', toUnit: 'teaspoon' }), 48)
    close(primary({ fromUnit: 'cup', toUnit: 'fluidOunce' }), 8)
    close(primary({ fromUnit: 'tablespoon', toUnit: 'teaspoon' }), 3)
    close(primary({ fromUnit: 'pint', toUnit: 'cup' }), 2)
    close(primary({ fromUnit: 'quart', toUnit: 'pint' }), 2)
    close(primary({ fromUnit: 'quart', toUnit: 'cup' }), 4)
    close(primary({ fromUnit: 'litre', toUnit: 'millilitre' }), 1000)
  })

  it('is exactly reversible and identity-preserving', () => {
    const units = fields[1].options.map((o) => o.value)
    for (const from of units) {
      // Converting a unit to itself must be a no-op.
      expect(primary({ amount: 3, fromUnit: from, toUnit: from })).toBeCloseTo(3, 12)
      for (const to of units) {
        const there = primary({ amount: 2.5, fromUnit: from, toUnit: to })
        const back = primary({ amount: there, fromUnit: to, toUnit: from })
        expect(back).toBeCloseTo(2.5, 9)
      }
    }
  })

  it('is linear in the amount, so the 1.1x nudge moves the result', () => {
    const one = primary({ amount: 1 })
    const nudged = primary({ amount: 1.1 })
    expect(nudged).not.toBeCloseTo(one, 6)
    expect(nudged).toBeCloseTo(one * 1.1, 9)
    // Chaining through a third unit must agree with the direct conversion.
    const direct = primary({ amount: 7, fromUnit: 'quart', toUnit: 'teaspoon' })
    const viaMl = primary({
      amount: primary({ amount: 7, fromUnit: 'quart', toUnit: 'millilitre' }),
      fromUnit: 'millilitre',
      toUnit: 'teaspoon',
    })
    expect(direct).toBeCloseTo(viaMl, 9)
  })

  it('accepts zero as a boundary rather than throwing', () => {
    const r = run({ amount: 0 })
    expect(Number(r.primary.value)).toBe(0)
    for (const s of r.stats ?? []) expect(Number(s.value)).toBe(0)
  })

  it('reports every other common unit in the stats, and only the others', () => {
    const r = run({ amount: 2, fromUnit: 'cup', toUnit: 'millilitre' })
    const ml = Number(r.primary.value)
    expect(r.stats).toHaveLength(fields[1].options.length - 1)
    expect(r.stats?.some((s) => s.label === 'Millilitres')).toBe(false)

    const LABEL: Record<string, string> = {
      teaspoon: 'Teaspoons',
      tablespoon: 'Tablespoons',
      fluidOunce: 'Fluid ounces',
      cup: 'Cups',
      pint: 'Pints',
      quart: 'Quarts',
      litre: 'Litres',
    }
    const byLabel = new Map(r.stats!.map((s) => [s.label, Number(s.value)]))
    expect(byLabel.get('Cups')).toBeCloseTo(2, 9)
    // Each stat, multiplied back by that unit's legally defined size, must
    // reconstruct the same volume the primary reports.
    for (const [unit, label] of Object.entries(LABEL)) {
      const reconstructed = byLabel.get(label)! * TRUE_ML[unit as keyof typeof TRUE_ML]
      expect(Math.abs(reconstructed - ml) / ml).toBeLessThan(1e-5)
    }
  })

  it('carries no presentation strings and holds raw numeric values', () => {
    const r = run()
    expect(typeof r.primary.value).toBe('number')
    expect(r.primary.format).toEqual({ style: 'decimal', decimals: 1, unit: 'ml' })
    expect(r.scaleValue).toBeUndefined()
  })

  it('throws CalcError with the offending field id', () => {
    expect(() => run({ amount: -1 })).toThrow(CalcError)
    try {
      run({ amount: -1 })
    } catch (e) {
      expect((e as CalcError).fieldId).toBe('amount')
    }

    expect(() => run({ amount: Number.NaN })).toThrow(CalcError)
    try {
      run({ amount: Number.NaN })
    } catch (e) {
      expect((e as CalcError).fieldId).toBe('amount')
    }

    // Unknown unit keys can only arrive from a tampered payload, but they must
    // still surface as a CalcError rather than a silent NaN.
    try {
      compute({ ...base, fromUnit: 'gallon' as V['fromUnit'] })
      throw new Error('expected a throw')
    } catch (e) {
      expect(e).toBeInstanceOf(CalcError)
      expect((e as CalcError).fieldId).toBe('fromUnit')
    }

    try {
      compute({ ...base, toUnit: 'dram' as V['toUnit'] })
      throw new Error('expected a throw')
    } catch (e) {
      expect(e).toBeInstanceOf(CalcError)
      expect((e as CalcError).fieldId).toBe('toUnit')
    }
  })
})

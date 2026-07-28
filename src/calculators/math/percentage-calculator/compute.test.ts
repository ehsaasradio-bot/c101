import { describe, expect, test } from 'vitest'
import compute from './compute'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'

const val = (r: ReturnType<typeof compute>) => Number(r.primary.value)
const stat = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)

describe('percentage calculator', () => {
  test('25% of 200 is 50, cross-checked by repeated addition of one percent', () => {
    const r = compute({ mode: 'of', valueA: 25, valueB: 200 })
    expect(val(r)).toBeCloseTo(50, 10)

    // Independent method: add "one percent of B" twenty-five times.
    let acc = 0
    for (let i = 0; i < 25; i++) acc += 200 / 100
    expect(val(r)).toBeCloseTo(acc, 10)
  })

  test('"of" and "isWhatPercent" are inverses of each other', () => {
    const part = val(compute({ mode: 'of', valueA: 37.5, valueB: 640 }))
    const back = val(compute({ mode: 'isWhatPercent', valueA: part, valueB: 640 }))
    expect(back).toBeCloseTo(37.5, 10)
  })

  test('increase and decrease agree with an independently built factor', () => {
    const up = val(compute({ mode: 'increase', valueA: 15, valueB: 80 }))
    const down = val(compute({ mode: 'decrease', valueA: 15, valueB: 80 }))
    expect(up).toBeCloseTo(80 * 1.15, 10)
    expect(down).toBeCloseTo(80 * 0.85, 10)
    // Their midpoint must be the original base.
    expect((up + down) / 2).toBeCloseTo(80, 10)
  })

  test('a rise then an equal fall does not return to the start', () => {
    const up = val(compute({ mode: 'increase', valueA: 10, valueB: 100 }))
    const roundTrip = val(compute({ mode: 'decrease', valueA: 10, valueB: up }))
    expect(up).toBeCloseTo(110, 10)
    expect(roundTrip).toBeCloseTo(99, 10)
    expect(roundTrip).not.toBeCloseTo(100, 6)
  })

  test('zero percent is a no-op and 100% consumes the whole base', () => {
    expect(val(compute({ mode: 'of', valueA: 0, valueB: 250 }))).toBe(0)
    expect(val(compute({ mode: 'increase', valueA: 0, valueB: 250 }))).toBeCloseTo(250, 10)
    expect(val(compute({ mode: 'of', valueA: 100, valueB: 250 }))).toBeCloseTo(250, 10)
    expect(val(compute({ mode: 'decrease', valueA: 100, valueB: 250 }))).toBeCloseTo(0, 10)
  })

  test('a negative increase equals the matching decrease', () => {
    const negUp = val(compute({ mode: 'increase', valueA: -20, valueB: 500 }))
    const down = val(compute({ mode: 'decrease', valueA: 20, valueB: 500 }))
    expect(negUp).toBeCloseTo(down, 10)
    expect(negUp).toBeCloseTo(400, 10)
  })

  test('stats stay consistent with the primary answer', () => {
    const r = compute({ mode: 'of', valueA: 25, valueB: 200 })
    expect(stat(r, 'Remainder (B − result)')).toBeCloseTo(150, 10)
    expect(stat(r, 'B increased by A%')).toBeCloseTo(250, 10)
    expect(stat(r, 'B decreased by A%')).toBeCloseTo(150, 10)

    const inc = compute({ mode: 'increase', valueA: 15, valueB: 80 })
    expect(stat(inc, 'Amount of change')).toBeCloseTo(12, 10)
    expect(stat(inc, 'Multiplier applied')).toBeCloseTo(1.15, 10)

    const share = compute({ mode: 'isWhatPercent', valueA: 30, valueB: 120 })
    expect(val(share)).toBeCloseTo(25, 10)
    expect(stat(share, 'Remaining share of B')).toBeCloseTo(75, 10)
    expect(stat(share, 'Difference (A − B)')).toBeCloseTo(-90, 10)
  })

  test('rejects a zero base in isWhatPercent, and never returns NaN', () => {
    expect(() => compute({ mode: 'isWhatPercent', valueA: 5, valueB: 0 })).toThrow(CalcError)
    try {
      compute({ mode: 'isWhatPercent', valueA: 5, valueB: 0 })
    } catch (e) {
      expect((e as CalcError).fieldId).toBe('valueB')
    }
    // The same base is fine in every other mode.
    expect(val(compute({ mode: 'of', valueA: 5, valueB: 0 }))).toBe(0)
  })

  test('rejects unknown modes and non-finite numbers', () => {
    expect(() => compute({ mode: 'nonsense', valueA: 1, valueB: 2 })).toThrow(CalcError)
    expect(() => compute({ mode: 'of', valueA: NaN, valueB: 2 })).toThrow(CalcError)
    expect(() => compute({ mode: 'of', valueA: 1, valueB: Infinity })).toThrow(CalcError)
  })

  test('the first number field nudged to 1.1x its default stays valid and moves the answer', () => {
    const defaults = Object.fromEntries(fields.map((f) => [f.id, f.default])) as Parameters<
      typeof compute
    >[0]
    const firstNumber = fields.find((f) => f.kind === 'number')!
    expect(firstNumber.id).toBe('valueA')

    const base = compute(defaults)
    const nudged = compute({ ...defaults, valueA: firstNumber.default * 1.1 })
    expect(val(nudged)).not.toBeCloseTo(val(base), 6)
    expect(val(base)).toBeCloseTo(50, 10)
    expect(val(nudged)).toBeCloseTo(55, 10)
  })
})

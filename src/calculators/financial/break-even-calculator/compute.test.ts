import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { CalcError } from '../../../lib/types'
import { resolveBand } from '../../../lib/view'

const base = {
  fixedCosts: 50_000,
  pricePerUnit: 60,
  variableCostPerUnit: 35,
} as const

const stat = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)

/**
 * Independent check: walk the ledger one unit at a time, starting in the hole by
 * the fixed costs and banking price − variable cost on each sale. The first unit
 * count at which the balance is no longer negative is the break-even volume.
 */
function simulateBreakEven(fixed: number, price: number, variable: number): number {
  let balance = -fixed
  let units = 0
  while (balance < 0) {
    balance += price - variable
    units += 1
    if (units > 1_000_000) throw new Error('simulation did not converge')
  }
  return units
}

describe('break-even', () => {
  test('$50k fixed, $60 price, $35 variable cost', () => {
    const r = compute(base)
    // 50,000 ÷ (60 − 35) = 2,000 units, cross-checked by unit-by-unit simulation.
    expect(Number(r.primary.value)).toBeCloseTo(2000, 6)
    expect(Number(r.primary.value)).toBe(simulateBreakEven(50_000, 60, 35))
  })

  test('simulation agrees on a case that does not divide evenly', () => {
    const v = { fixedCosts: 9_000, pricePerUnit: 25, variableCostPerUnit: 18 }
    const r = compute(v)
    // 9,000 ÷ 7 = 1285.71…, so 1,286 whole sales are needed.
    expect(Number(r.primary.value)).toBeCloseTo(9_000 / 7, 9)
    expect(stat(r, 'Units to clear (whole)')).toBe(simulateBreakEven(9_000, 25, 18))
    expect(stat(r, 'Units to clear (whole)')).toBe(1286)
  })

  test('break-even revenue equals units × price and covers all costs', () => {
    const r = compute(base)
    const units = Number(r.primary.value)
    expect(stat(r, 'Break-even revenue')).toBeCloseTo(units * base.pricePerUnit, 6)
    // Revenue − variable costs − fixed costs = 0 at break-even, by definition.
    const profit =
      stat(r, 'Break-even revenue') - units * base.variableCostPerUnit - base.fixedCosts
    expect(profit).toBeCloseTo(0, 6)
  })

  test('contribution margin per unit and percent', () => {
    const r = compute(base)
    expect(stat(r, 'Contribution margin per unit')).toBeCloseTo(25, 9)
    expect(stat(r, 'Contribution margin')).toBeCloseTo((25 / 60) * 100, 9)
    expect(r.scaleValue).toBeCloseTo((25 / 60) * 100, 9)
  })

  test('zero fixed costs break even at the first unit, not an error', () => {
    const r = compute({ ...base, fixedCosts: 0 })
    expect(Number(r.primary.value)).toBe(0)
    expect(stat(r, 'Break-even revenue')).toBe(0)
  })

  test('a zero variable cost gives a 100% margin and sits in the top band', () => {
    const r = compute({ ...base, variableCostPerUnit: 0 })
    expect(r.scaleValue).toBeCloseTo(100, 9)
    expect(Number(r.primary.value)).toBeCloseTo(50_000 / 60, 9)
    expect(resolveBand(def.scale, r.scaleValue!)!.id).toBe('excellent')
  })

  test('raising fixed costs raises break-even proportionally', () => {
    const r = compute(base)
    const nudged = compute({ ...base, fixedCosts: base.fixedCosts * 1.1 })
    expect(Number(nudged.primary.value)).toBeCloseTo(Number(r.primary.value) * 1.1, 6)
    expect(Number(nudged.primary.value)).not.toBeCloseTo(Number(r.primary.value), 6)
  })

  test('a thin margin lands in the critical band', () => {
    const r = compute({ fixedCosts: 10_000, pricePerUnit: 100, variableCostPerUnit: 90 })
    expect(r.scaleValue).toBeCloseTo(10, 9)
    expect(resolveBand(def.scale, r.scaleValue!)!.id).toBe('critical')
    expect(Number(r.primary.value)).toBe(simulateBreakEven(10_000, 100, 90))
  })

  test.each([
    ['negative fixed costs', { fixedCosts: -1 }, 'fixedCosts'],
    ['zero price', { pricePerUnit: 0 }, 'pricePerUnit'],
    ['negative variable cost', { variableCostPerUnit: -5 }, 'variableCostPerUnit'],
    ['variable cost above price', { variableCostPerUnit: 80 }, 'pricePerUnit'],
    ['variable cost equal to price', { variableCostPerUnit: 60 }, 'pricePerUnit'],
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

  test('never returns NaN for the default inputs', () => {
    const r = compute(base)
    for (const q of [r.primary, ...(r.stats ?? [])]) {
      expect(Number.isFinite(Number(q.value))).toBe(true)
    }
  })
})


/**
 * The shared invariant, asserted the same way everywhere: every slice is finite
 * and non-negative, and the slices add up to the stated whole to 4dp.
 */
function expectPartsSum(r: ReturnType<typeof compute>) {
  const parts = r.parts!
  expect(parts.length).toBeGreaterThan(0)
  for (const p of parts) {
    expect(Number.isFinite(p.value)).toBe(true)
    expect(p.value).toBeGreaterThanOrEqual(0)
  }
  const whole = Number((r.partsTotal ?? r.primary).value)
  expect(parts.reduce((s, p) => s + p.value, 0)).toBeCloseTo(whole, 4)
  return parts
}

describe('break-even parts', () => {
  test('fixed costs plus variable costs at break-even are the break-even revenue', () => {
    const r = compute(base)
    const parts = expectPartsSum(r)
    expect(parts.map((p) => p.label)).toEqual(['Fixed costs', 'Variable costs at break-even'])
    // margin 25/unit → 2,000 units → revenue 120,000, of which 70,000 is variable cost.
    expect(parts[0]!.value).toBeCloseTo(50_000, 10)
    expect(parts[1]!.value).toBeCloseTo(70_000, 10)
    expect(Number(r.partsTotal!.value)).toBeCloseTo(120_000, 10)
    expect(Number(r.partsTotal!.value)).toBeCloseTo(stat(r, 'Break-even revenue'), 6)
  })

  test('the identity holds algebraically, not just at the defaults', () => {
    // units = F / (p − v)  ⇒  units × p = F + units × v.
    for (const fixedCosts of [0, 1, 7_500, 50_000, 1_000_000]) {
      for (const pricePerUnit of [0.5, 60, 1_000, 10_000]) {
        for (const variableCostPerUnit of [0, 0.25, 35, 999]) {
          if (pricePerUnit <= variableCostPerUnit) continue
          const r = compute({ fixedCosts, pricePerUnit, variableCostPerUnit })
          const parts = expectPartsSum(r)
          const units = Number(r.primary.value)
          expect(parts[1]!.value).toBeCloseTo(units * variableCostPerUnit, 6)
          expect(Number(r.partsTotal!.value)).toBeCloseTo(units * pricePerUnit, 4)
        }
      }
    }
  })

  test('zero fixed costs break even at zero units, so both slices are zero', () => {
    const r = compute({ ...base, fixedCosts: 0 })
    const parts = expectPartsSum(r)
    expect(parts[0]!.value).toBe(0)
    expect(parts[1]!.value).toBe(0)
    expect(Number(r.partsTotal!.value)).toBe(0)
  })

  test('a zero variable cost puts the whole of break-even revenue in fixed costs', () => {
    const r = compute({ ...base, variableCostPerUnit: 0 })
    const parts = expectPartsSum(r)
    expect(parts[1]!.value).toBe(0)
    expect(Number(r.partsTotal!.value)).toBeCloseTo(50_000, 10)
  })
})

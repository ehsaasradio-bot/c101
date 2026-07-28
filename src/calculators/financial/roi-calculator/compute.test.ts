import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { CalcError } from '../../../lib/types'
import { resolveBand } from '../../../lib/view'

const base = {
  initialInvestment: 10_000,
  finalValue: 15_000,
  years: 5,
  fees: 200,
} as const

const stat = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)

describe('roi', () => {
  test('$10,000 → $15,000 with $200 of fees is a 48% return', () => {
    // (15000 − 10000 − 200) / 10000 = 0.48
    const r = compute(base)
    expect(Number(r.primary.value)).toBeCloseTo(48, 10)
    expect(stat(r, 'Net profit')).toBeCloseTo(4800, 10)
  })

  test('the annualized rate compounds back to the total return', () => {
    // Independent check: grow the initial investment year by year at the
    // annualized rate and confirm it lands on the net proceeds.
    const r = compute(base)
    const annual = stat(r, 'Annualized return') / 100
    let value = base.initialInvestment
    for (let i = 0; i < base.years; i++) value *= 1 + annual
    expect(value).toBeCloseTo(base.finalValue - base.fees, 6)
    // And it must sit well below the 48% total, since 48% took five years.
    expect(annual * 100).toBeLessThan(48)
    expect(annual * 100).toBeGreaterThan(0)
  })

  test('a one-year hold makes the annualized rate equal the total ROI', () => {
    const r = compute({ ...base, years: 1 })
    expect(stat(r, 'Annualized return')).toBeCloseTo(Number(r.primary.value), 10)
  })

  test('fees only ever reduce the return, dollar for dollar', () => {
    const free = compute({ ...base, fees: 0 })
    const charged = compute({ ...base, fees: 500 })
    expect(Number(free.primary.value)).toBeCloseTo(50, 10)
    // $500 of fees on $10,000 invested is exactly 5 percentage points.
    expect(Number(charged.primary.value)).toBeCloseTo(50 - 5, 10)
    expect(free.notes).toHaveLength(0)
    expect(charged.notes).toHaveLength(1)
  })

  test('breaking even exactly returns 0% and reports the break-even value', () => {
    const r = compute({ ...base, finalValue: base.initialInvestment + base.fees })
    expect(Number(r.primary.value)).toBeCloseTo(0, 10)
    expect(stat(r, 'Annualized return')).toBeCloseTo(0, 10)
    expect(stat(r, 'Break-even final value')).toBe(10_200)
    expect(resolveBand(def.scale, r.scaleValue!)!.id).toBe('warn')
  })

  test('a total wipe-out is −100% and stays on the scale', () => {
    const r = compute({ ...base, finalValue: 0, fees: 0 })
    expect(Number(r.primary.value)).toBeCloseTo(-100, 10)
    expect(stat(r, 'Annualized return')).toBe(-100)
    expect(r.scaleValue).toBe(-100)
    expect(resolveBand(def.scale, r.scaleValue!)!.id).toBe('critical')
  })

  test('losing more than you invested is clamped onto the scale, not the headline', () => {
    // Fees larger than the proceeds: profit is −$1,000 on $1,000 invested plus
    // $500 of fees, i.e. −150%.
    const r = compute({ initialInvestment: 1000, finalValue: 0, fees: 500, years: 2 })
    expect(Number(r.primary.value)).toBeCloseTo(-150, 10)
    expect(r.scaleValue).toBe(-100)
    expect(resolveBand(def.scale, r.scaleValue!)!.id).toBe('critical')
  })

  test('a bigger initial investment for the same outcome lowers the return', () => {
    // The e2e nudge moves the first number field to 1.1× its default; that must
    // stay valid and must move the primary result.
    const nudged = compute({ ...base, initialInvestment: base.initialInvestment * 1.1 })
    expect(Number(nudged.primary.value)).toBeLessThan(Number(compute(base).primary.value))
    expect(Number.isFinite(Number(nudged.primary.value))).toBe(true)
  })

  test('scale bands are ordered and contiguous', () => {
    const bands = def.scale.bands
    expect(bands[0]!.from).toBe(def.scale.min)
    expect(bands[bands.length - 1]!.to).toBe(def.scale.max)
    for (let i = 1; i < bands.length; i++) expect(bands[i]!.from).toBe(bands[i - 1]!.to)
  })

  test.each([
    ['zero initial investment', { initialInvestment: 0 }, 'initialInvestment'],
    ['negative final value', { finalValue: -1 }, 'finalValue'],
    ['negative fees', { fees: -1 }, 'fees'],
    ['zero years', { years: 0 }, 'years'],
    ['non-numeric input', { initialInvestment: Number.NaN }, 'initialInvestment'],
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

describe('roi parts', () => {
  test('a gain splits into the capital and the gain on top', () => {
    const r = compute(base)
    const parts = expectPartsSum(r)
    expect(parts.map((p) => p.label)).toEqual(['Initial investment', 'Net gain'])
    expect(parts[0]!.value).toBeCloseTo(10_000, 10)
    // 15,000 − 200 − 10,000
    expect(parts[1]!.value).toBeCloseTo(4800, 10)
    expect(Number(r.partsTotal!.value)).toBeCloseTo(14_800, 10)
  })

  test('a loss splits the initial investment into what survived and what did not', () => {
    // 10,000 in, 6,000 back, 200 of fees: 5,800 remains, 4,200 lost.
    const r = compute({ ...base, finalValue: 6_000 })
    const parts = expectPartsSum(r)
    expect(parts.map((p) => p.label)).toEqual(['Remaining value', 'Loss'])
    expect(parts[0]!.value).toBeCloseTo(5_800, 10)
    expect(parts[1]!.value).toBeCloseTo(4_200, 10)
    expect(Number(r.partsTotal!.value)).toBeCloseTo(10_000, 10)
  })

  test('a total wipe-out leaves nothing remaining and loses the whole investment', () => {
    const r = compute({ ...base, finalValue: 0, fees: 0 })
    const parts = expectPartsSum(r)
    expect(parts[0]!.value).toBe(0)
    expect(parts[1]!.value).toBeCloseTo(10_000, 10)
  })

  test('fees larger than the final value never push a slice below zero', () => {
    const r = compute({ ...base, finalValue: 100, fees: 900 })
    const parts = expectPartsSum(r)
    // Net proceeds are −800; the remaining value is floored at 0.
    expect(parts[0]!.value).toBe(0)
    expect(parts[1]!.value).toBeCloseTo(10_000, 10)
  })

  test('breaking exactly even is treated as a zero gain, not a zero loss', () => {
    const r = compute({ ...base, finalValue: 10_200, fees: 200 })
    const parts = expectPartsSum(r)
    expect(parts.map((p) => p.label)).toEqual(['Initial investment', 'Net gain'])
    expect(parts[1]!.value).toBeCloseTo(0, 10)
  })

  test('the invariant holds across a sweep of gains and losses', () => {
    for (const finalValue of [0, 1, 500, 9_800, 10_000, 10_200, 50_000, 10_000_000]) {
      for (const fees of [0, 200, 25_000, 1_000_000]) {
        for (const initialInvestment of [1, 10_000, 10_000_000]) {
          expectPartsSum(compute({ ...base, initialInvestment, finalValue, fees }))
        }
      }
    }
  })
})

import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'
import { resolveBand } from '../../../lib/view'

const base = {
  cash: 15_000,
  investments: 85_000,
  propertyValue: 320_000,
  otherAssets: 20_000,
  mortgageBalance: 180_000,
  otherDebts: 20_000,
} as const

type Input = Parameters<typeof compute>[0]

/**
 * Independent re-derivation: accumulate the six line items by sign in a loop
 * rather than reusing compute's expression, so a sign or omission error in the
 * implementation cannot be mirrored here.
 */
const ASSET_KEYS = ['cash', 'investments', 'propertyValue', 'otherAssets'] as const
const DEBT_KEYS = ['mortgageBalance', 'otherDebts'] as const

function tally(v: Input) {
  let assets = 0
  let debts = 0
  for (const k of ASSET_KEYS) assets += v[k]
  for (const k of DEBT_KEYS) debts += v[k]
  return { assets, debts, netWorth: assets - debts }
}

const stat = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)

describe('net worth', () => {
  test('the default household: 440k of assets against 200k of debt', () => {
    const { assets, debts, netWorth } = tally(base)
    expect(assets).toBe(440_000)
    expect(debts).toBe(200_000)

    const r = compute(base)
    expect(Number(r.primary.value)).toBe(netWorth)
    expect(Number(r.primary.value)).toBe(240_000)
    expect(stat(r, 'Total assets')).toBe(assets)
    expect(stat(r, 'Total liabilities')).toBe(debts)
    // 200,000 / 440,000 = 45.4545…%
    expect(stat(r, 'Debt-to-asset ratio')).toBeCloseTo((200_000 / 440_000) * 100, 10)
    expect(stat(r, 'Home equity')).toBe(320_000 - 180_000)
    expect(stat(r, 'Liquid assets')).toBe(100_000)
  })

  test('net worth is additive: every line item moves the total by exactly its own delta', () => {
    const babyStep = 1_000
    for (const k of [...ASSET_KEYS, ...DEBT_KEYS]) {
      const bumped = compute({ ...base, [k]: base[k] + babyStep })
      const expected =
        tally(base).netWorth + ((ASSET_KEYS as readonly string[]).includes(k) ? babyStep : -babyStep)
      expect(Number(bumped.primary.value), `line item ${k}`).toBe(expected)
    }
  })

  test('the e2e nudge of the first number field stays valid and moves the result', () => {
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('cash')
    const nudged = first.default * 1.1
    expect(nudged).toBeGreaterThanOrEqual(first.min!)
    expect(nudged).toBeLessThanOrEqual(first.max!)
    expect(Number(compute({ ...base, cash: nudged }).primary.value)).not.toBe(
      Number(compute(base).primary.value),
    )
  })

  test('negative net worth is a valid answer, not an error', () => {
    const v = { ...base, propertyValue: 100_000, mortgageBalance: 300_000 }
    const r = compute(v)
    expect(Number(r.primary.value)).toBe(tally(v).netWorth)
    expect(Number(r.primary.value)).toBeLessThan(0)
    expect(r.notes!.some((n) => n.includes('negative net worth'))).toBe(true)
    // Underwater mortgage: equity is negative and flagged separately.
    expect(stat(r, 'Home equity')).toBe(-200_000)
    expect(r.notes!.some((n) => n.includes('home equity is negative'))).toBe(true)
  })

  test('an all-zero sheet gives zero net worth and a 0% ratio, never NaN', () => {
    const zero = {
      cash: 0,
      investments: 0,
      propertyValue: 0,
      otherAssets: 0,
      mortgageBalance: 0,
      otherDebts: 0,
    }
    const r = compute(zero)
    expect(Number(r.primary.value)).toBe(0)
    expect(r.scaleValue).toBe(0)
    expect(Number.isNaN(r.scaleValue!)).toBe(false)
  })

  test('debt with no assets clamps the ratio at 100% instead of dividing by zero', () => {
    const r = compute({ ...base, cash: 0, investments: 0, propertyValue: 0, otherAssets: 0 })
    expect(Number.isFinite(r.scaleValue!)).toBe(true)
    expect(r.scaleValue).toBe(100)
    expect(Number(r.primary.value)).toBe(-200_000)
    expect(resolveBand(def.scale, r.scaleValue!)!.id).toBe('critical')
  })

  test('scaleValue is the debt-to-asset ratio and lands in the band its size implies', () => {
    const cases: ReadonlyArray<[number, number, string]> = [
      [1_000_000, 50_000, 'excellent'], // 5%
      [1_000_000, 200_000, 'good'], // 20%
      [1_000_000, 400_000, 'neutral'], // 40%
      [1_000_000, 700_000, 'warn'], // 70%
      [1_000_000, 900_000, 'critical'], // 90%
    ]
    for (const [property, mortgage, band] of cases) {
      const v = {
        cash: 0,
        investments: 0,
        propertyValue: property,
        otherAssets: 0,
        mortgageBalance: mortgage,
        otherDebts: 0,
      }
      const r = compute(v)
      expect(r.scaleValue).toBeCloseTo((mortgage / property) * 100, 10)
      expect(resolveBand(def.scale, r.scaleValue!)!.id, `${(mortgage / property) * 100}%`).toBe(band)
    }
  })

  test('the scale bands are ordered and contiguous', () => {
    const bands = def.scale.bands
    expect(bands[0].from).toBe(def.scale.min)
    expect(bands[bands.length - 1].to).toBe(def.scale.max)
    for (let i = 1; i < bands.length; i++) expect(bands[i].from).toBe(bands[i - 1].to)
  })

  test.each([
    ['negative cash', { cash: -1 }, 'cash'],
    ['negative investments', { investments: -0.01 }, 'investments'],
    ['negative property value', { propertyValue: -5 }, 'propertyValue'],
    ['negative other assets', { otherAssets: -100 }, 'otherAssets'],
    ['negative mortgage balance', { mortgageBalance: -1 }, 'mortgageBalance'],
    ['negative other debts', { otherDebts: -1 }, 'otherDebts'],
    ['a non-finite entry', { cash: Number.NaN }, 'cash'],
  ])('rejects %s with a CalcError naming the field', (_label, patch, fieldId) => {
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

describe('net worth parts', () => {
  test('the parts are the four asset lines and sum to total assets', () => {
    const r = compute(base)
    const parts = expectPartsSum(r)
    expect(parts.map((p) => p.label)).toEqual([
      'Cash & savings',
      'Investments & retirement',
      'Property',
      'Other assets',
    ])
    expect(Number(r.partsTotal!.value)).toBeCloseTo(440_000, 10)
  })

  test('liabilities are excluded from the proportion but stay in the stats', () => {
    const r = compute(base)
    expect(r.parts!.some((p) => /mortgage|debt|liabilit/i.test(p.label))).toBe(false)
    expect(r.stats!.some((s) => s.label === 'Total liabilities')).toBe(true)
  })

  test('the invariant survives a negative net worth', () => {
    // Debts far above assets: net worth is negative, the asset split is not.
    const r = compute({ ...base, mortgageBalance: 900_000, otherDebts: 200_000 })
    expect(Number(r.primary.value)).toBeLessThan(0)
    const parts = expectPartsSum(r)
    expect(Number(r.partsTotal!.value)).toBeCloseTo(440_000, 10)
    expect(parts.every((p) => p.value >= 0)).toBe(true)
  })

  test('a balance sheet with no assets at all yields a zero whole', () => {
    const r = compute({
      cash: 0,
      investments: 0,
      propertyValue: 0,
      otherAssets: 0,
      mortgageBalance: 0,
      otherDebts: 0,
    })
    const parts = expectPartsSum(r)
    expect(parts.every((p) => p.value === 0)).toBe(true)
    expect(Number(r.partsTotal!.value)).toBe(0)
  })

  test('the invariant holds across assorted balance sheets', () => {
    const cases: Array<Partial<Record<keyof typeof base, number>>> = [
      { cash: 0, investments: 0, propertyValue: 1, otherAssets: 0 },
      { cash: 1_000_000, investments: 0, propertyValue: 0, otherAssets: 0 },
      { cash: 250, investments: 3_333.33, propertyValue: 777.77, otherAssets: 0.01 },
      { cash: 100_000_000, investments: 100_000_000, propertyValue: 100_000_000, otherAssets: 100_000_000 },
    ]
    for (const c of cases) {
      const r = compute({ ...base, ...c })
      const parts = expectPartsSum(r)
      const stated = Number(r.stats!.find((s) => s.label === 'Total assets')!.value)
      expect(parts.reduce((s, p) => s + p.value, 0)).toBeCloseTo(stated, 4)
    }
  })
})

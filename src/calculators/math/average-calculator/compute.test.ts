import { describe, expect, test } from 'vitest'
import compute from './compute'
import { CalcError } from '../../../lib/types'

const stat = (r: ReturnType<typeof compute>, label: string) =>
  r.stats!.find((s) => s.label === label)

/** Independent reference implementations, written from the definitions. */
function refMean(xs: number[]): number {
  let total = 0
  for (const x of xs) total += x
  return total / xs.length
}

function refVariance(xs: number[], denominator: number): number {
  const m = refMean(xs)
  let ss = 0
  for (const x of xs) ss += (x - m) * (x - m)
  return ss / denominator
}

describe('average', () => {
  const list = '12, 15, 18, 22, 30'
  const data = [12, 15, 18, 22, 30]

  test('the default list: mean 19.4, median 18, range 18', () => {
    const r = compute({ numbers: list })
    // 12+15+18+22+30 = 97; 97/5 = 19.4 — cross-checked by the loop above.
    expect(Number(r.primary.value)).toBeCloseTo(19.4, 10)
    expect(Number(r.primary.value)).toBeCloseTo(refMean(data), 12)
    expect(Number(stat(r, 'Median')!.value)).toBe(18)
    expect(Number(stat(r, 'Sum')!.value)).toBe(97)
    expect(Number(stat(r, 'Count')!.value)).toBe(5)
    expect(Number(stat(r, 'Minimum')!.value)).toBe(12)
    expect(Number(stat(r, 'Maximum')!.value)).toBe(30)
    expect(Number(stat(r, 'Range')!.value)).toBe(30 - 12)
  })

  test('sample deviation divides by n − 1, population by n', () => {
    const r = compute({ numbers: list })
    // Deviations from 19.4: −7.4, −4.4, −1.4, 2.6, 10.6 → squares sum to 195.2.
    const popVar = refVariance(data, data.length)
    const sampleVar = refVariance(data, data.length - 1)
    expect(popVar).toBeCloseTo(195.2 / 5, 10)
    expect(sampleVar).toBeCloseTo(195.2 / 4, 10)
    expect(Number(stat(r, 'Population std dev')!.value)).toBeCloseTo(Math.sqrt(popVar), 12)
    expect(Number(stat(r, 'Sample std dev')!.value)).toBeCloseTo(Math.sqrt(sampleVar), 12)
    // The sample estimator is always the larger of the two.
    expect(Number(stat(r, 'Sample std dev')!.value)).toBeGreaterThan(
      Number(stat(r, 'Population std dev')!.value),
    )
  })

  test('variance matches the E[x²] − mean² identity as a second method', () => {
    const r = compute({ numbers: list })
    const meanOfSquares = refMean(data.map((x) => x * x))
    const m = refMean(data)
    const popVarByIdentity = meanOfSquares - m * m
    expect(Number(stat(r, 'Population std dev')!.value) ** 2).toBeCloseTo(popVarByIdentity, 10)
  })

  test('an even count medians the two middle values', () => {
    const r = compute({ numbers: '4 1 3 2' })
    // Sorted: 1, 2, 3, 4 → (2 + 3) / 2.
    expect(Number(stat(r, 'Median')!.value)).toBe(2.5)
    expect(Number(r.primary.value)).toBe(2.5)
  })

  test('a single value has zero spread and no sample deviation', () => {
    const r = compute({ numbers: '7' })
    expect(Number(r.primary.value)).toBe(7)
    expect(Number(stat(r, 'Median')!.value)).toBe(7)
    expect(Number(stat(r, 'Range')!.value)).toBe(0)
    expect(Number(stat(r, 'Population std dev')!.value)).toBe(0)
    expect(stat(r, 'Sample std dev')).toBeUndefined()
    expect(r.notes).toHaveLength(1)
  })

  test('separators, whitespace, negatives and decimals all parse the same', () => {
    const a = compute({ numbers: '-2.5, 0, 7' })
    const b = compute({ numbers: '-2.5\n0\n7' })
    const c = compute({ numbers: ' -2.5 ;  0   7 ' })
    expect(Number(a.primary.value)).toBeCloseTo(4.5 / 3, 12)
    expect(Number(b.primary.value)).toBe(Number(a.primary.value))
    expect(Number(c.primary.value)).toBe(Number(a.primary.value))
  })

  test('shifting every value shifts the mean but not the spread', () => {
    const base = compute({ numbers: list })
    const shifted = compute({ numbers: data.map((x) => x + 100).join(' ') })
    expect(Number(shifted.primary.value)).toBeCloseTo(Number(base.primary.value) + 100, 8)
    expect(Number(stat(shifted, 'Sample std dev')!.value)).toBeCloseTo(
      Number(stat(base, 'Sample std dev')!.value),
      8,
    )
  })

  test('mode reports repeats, ties, and their absence', () => {
    expect(stat(compute({ numbers: '1 2 2 3' }), 'Mode')!.value).toBe('2')
    expect(stat(compute({ numbers: '3 1 1 3 5' }), 'Mode')!.value).toBe('1, 3')
    expect(String(stat(compute({ numbers: '1 2 3' }), 'Mode')!.value)).toContain('No mode')
  })

  test.each([
    ['an empty list', '   '],
    ['only separators', ', ,;'],
    ['a non-numeric token', '1, 2, abc'],
    ['a stray unit', '5kg 6kg'],
  ])('rejects %s with a CalcError on the numbers field', (_label, input) => {
    let thrown: unknown
    try {
      compute({ numbers: input })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe('numbers')
  })

  test('never returns NaN for valid input', () => {
    const r = compute({ numbers: '1e3, 0.0001, -5' })
    expect(Number.isFinite(Number(r.primary.value))).toBe(true)
    for (const s of r.stats!) {
      if (typeof s.value === 'number') expect(Number.isNaN(s.value)).toBe(false)
    }
  })
})

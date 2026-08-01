import { describe, expect, test } from 'vitest'
import compute from './compute'
import { CalcError } from '../../../lib/types'

type Input = Parameters<typeof compute>[0]
type Result = ReturnType<typeof compute>

const base: Input = {
  operation: 'determinant',
  size: '2x2',
  matrixA: '4, 7; 2, 6',
  matrixB: '1, 0; 0, 1',
}

const stat = (r: Result, label: string) => r.stats!.find((s) => s.label === label)

const step = (r: Result, fragment: string) =>
  r.steps!.filter((s): s is Extract<typeof s, { label: string }> => 'label' in s)
    .find((s) => s.label.includes(fragment))

const throwsOn = (input: Input): CalcError => {
  let thrown: unknown
  try {
    compute(input)
  } catch (err) {
    thrown = err
  }
  expect(thrown).toBeInstanceOf(CalcError)
  return thrown as CalcError
}

/**
 * Independent reference implementations, written from the definitions rather
 * than lifted from compute.ts — a check that agrees with the code by
 * construction checks nothing.
 */

/** Gaussian elimination without pivoting: det = the product of the pivots. */
function refDetByElimination(rows: number[][]): number {
  const m = rows.map((r) => [...r])
  const n = m.length
  let product = 1
  for (let k = 0; k < n; k += 1) {
    const pivot = m[k]![k]!
    product *= pivot
    if (pivot === 0) return 0
    for (let i = k + 1; i < n; i += 1) {
      const factor = m[i]![k]! / pivot
      for (let j = k; j < n; j += 1) m[i]![j]! -= factor * m[k]![j]!
    }
  }
  return product
}

/** Sarrus's rule: the six diagonal products of a 3 x 3, three added and three subtracted. */
function refDetBySarrus(m: number[][]): number {
  const [[a, b, c], [d, e, f], [g, h, i]] = m as [
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ]
  return a * e * i + b * f * g + c * d * h - c * e * g - b * d * i - a * f * h
}

/**
 * Gauss-Jordan elimination with partial pivoting on [A | I]. Shares no step with
 * adj(A) ÷ det A — no minors, no cofactors, no determinant at all — so agreement
 * between the two is real evidence rather than the same arithmetic twice.
 */
function refInverseByGaussJordan(rows: number[][]): number[][] {
  const n = rows.length
  const m = rows.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))])
  for (let col = 0; col < n; col += 1) {
    let pivot = col
    for (let r = col + 1; r < n; r += 1) {
      if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r
    }
    const swap = m[col]!
    m[col] = m[pivot]!
    m[pivot] = swap
    const p = m[col]![col]!
    for (let j = 0; j < 2 * n; j += 1) m[col]![j]! /= p
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue
      const factor = m[r]![col]!
      for (let j = 0; j < 2 * n; j += 1) m[r]![j]! -= factor * m[col]![j]!
    }
  }
  return m.map((row) => row.slice(n))
}

/** Parses the calculator's own `[a, b; c, d]` output back into numbers. */
function readMatrix(text: string): number[][] {
  return text
    .replace(/[[\]]/g, '')
    .split(';')
    .map((row) => row.split(',').map((t) => Number(t.trim())))
}

const IDENTITY_2 = [
  [1, 0],
  [0, 1],
]

const productOf = (a: number[][], b: number[][]): number[][] =>
  a.map((row, i) => b[0]!.map((_c, j) => row.reduce((s, _x, k) => s + a[i]![k]! * b[k]![j]!, 0)))

describe('matrix', () => {
  describe('determinant', () => {
    test('the default 2 x 2: det [4, 7; 2, 6] = 10', () => {
      // 4 x 6 - 7 x 2 = 24 - 14 = 10, and confirmed a second way by elimination:
      // row2 - 0.5 x row1 leaves [0, 2.5], so det = 4 x 2.5 = 10.
      const r = compute(base)
      expect(Number(r.primary.value)).toBeCloseTo(10, 12)
      expect(refDetByElimination([[4, 7], [2, 6]])).toBeCloseTo(10, 12)
      expect(r.primary.label).toBe('Determinant of A')
    })

    test('the working shown adds up to the answer', () => {
      const r = compute(base)
      const ad = Number(step(r, 'a₁₁ × a₂₂')!.value)
      const bc = Number(step(r, 'a₁₂ × a₂₁')!.value)
      expect(ad).toBe(24)
      expect(bc).toBe(14)
      expect(ad - bc).toBeCloseTo(Number(r.primary.value), 12)
    })

    test('a 3 x 3 determinant matches Sarrus and elimination', () => {
      const rows = [
        [6, 1, 1],
        [4, -2, 5],
        [2, 8, 7],
      ]
      const r = compute({ ...base, size: '3x3', matrixA: '6, 1, 1; 4, -2, 5; 2, 8, 7' })
      // The textbook value is -306; both reference methods reach it independently.
      expect(Number(r.primary.value)).toBeCloseTo(-306, 10)
      expect(refDetBySarrus(rows)).toBe(-306)
      expect(refDetByElimination(rows)).toBeCloseTo(-306, 10)
    })

    test('the 3 x 3 cofactor expansion is shown, and its terms sum to the determinant', () => {
      const r = compute({ ...base, size: '3x3', matrixA: '6, 1, 1; 4, -2, 5; 2, 8, 7' })
      // The MINORS of the first row, unsigned: deleting row 1 and column j leaves
      // [-2, 5; 8, 7], [4, 5; 2, 7] and [4, -2; 2, 8], whose determinants are
      // -14 - 40 = -54, 28 - 10 = 18 and 32 + 4 = 36.
      expect(Number(step(r, 'M₁₁')!.value)).toBeCloseTo(-54, 10)
      expect(Number(step(r, 'M₁₂')!.value)).toBeCloseTo(18, 10)
      expect(Number(step(r, 'M₁₃')!.value)).toBeCloseTo(36, 10)

      // The signs alternate +, -, + across the row, so the three terms are
      // 6 x -54 = -324, -(1 x 18) = -18 and +(1 x 36) = 36. They total -306.
      const terms = r
        .steps!.filter((s): s is Extract<typeof s, { label: string }> => 'label' in s)
        .filter((s) => /^[+−] a₁/.test(s.label))
        .map((s) => Number(s.value))
      expect(terms).toEqual([-324, -18, 36])
      expect(terms.reduce((s, t) => s + t, 0)).toBeCloseTo(Number(r.primary.value), 10)
      expect(Number(r.primary.value)).toBeCloseTo(-306, 10)
    })

    test('det Aᵀ equals det A, computed independently', () => {
      const r = compute({ ...base, size: '3x3', matrixA: '6, 1, 1; 4, -2, 5; 2, 8, 7' })
      expect(Number(stat(r, 'Determinant of Aᵀ (always equal to det A)')!.value)).toBeCloseTo(
        Number(r.primary.value),
        10,
      )
    })

    test('reports whether the matrix is invertible', () => {
      expect(String(stat(compute(base), 'Invertible')!.value)).toContain('Yes')
      expect(
        String(stat(compute({ ...base, matrixA: '1, 2; 2, 4' }), 'Invertible')!.value),
      ).toContain('No')
    })
  })

  describe('inverse', () => {
    test('the default 2 x 2 inverts to [0.6, -0.7; -0.2, 0.4]', () => {
      // adj(A) = [6, -7; -2, 4] and det A = 10, so every entry is one tenth of
      // the adjugate. Checkable by hand, which is why it is the default.
      const r = compute({ ...base, operation: 'inverse' })
      expect(r.primary.value).toBe('[0.6, -0.7; -0.2, 0.4]')
      expect(r.primary.label).toBe('Inverse of A')
    })

    test('A x A⁻¹ comes back as the identity', () => {
      const r = compute({ ...base, operation: 'inverse' })
      const inverse = readMatrix(String(r.primary.value))
      const product = productOf([[4, 7], [2, 6]], inverse)
      product.forEach((row, i) =>
        row.forEach((x, j) => expect(x).toBeCloseTo(IDENTITY_2[i]![j]!, 12)),
      )
      expect(stat(r, 'Check: A × A⁻¹')!.value).toBe('[1, 0; 0, 1]')
    })

    test('a 3 x 3 inverse matches Gauss-Jordan elimination entry for entry', () => {
      const rows = [
        [6, 1, 1],
        [4, -2, 5],
        [2, 8, 7],
      ]
      const r = compute({ ...base, operation: 'inverse', size: '3x3', matrixA: '6, 1, 1; 4, -2, 5; 2, 8, 7' })
      const shown = readMatrix(String(r.primary.value))

      // adj(A)11 = C11 = det [-2, 5; 8, 7] = -54, and det A = -306, so the first
      // entry is -54 / -306 = 3/17 exactly. Every entry is then confirmed against
      // row reduction of [A | I], which shares no code path with adj(A) ÷ det A.
      expect(shown[0]![0]!).toBeCloseTo(3 / 17, 5)
      const reference = refInverseByGaussJordan(rows)
      shown.forEach((row, i) =>
        // The displayed matrix is rounded to six decimals, which is the only
        // reason this is not asserted to machine precision.
        row.forEach((x, j) => expect(x).toBeCloseTo(reference[i]![j]!, 5)),
      )

      // The unrounded product, computed inside compute, is the identity exactly.
      expect(stat(r, 'Check: A × A⁻¹')!.value).toBe('[1, 0, 0; 0, 1, 0; 0, 0, 1]')
    })

    test('the adjugate and the division are both shown', () => {
      const r = compute({ ...base, operation: 'inverse' })
      expect(step(r, 'adj(A)')).toBeDefined()
      expect(step(r, 'A⁻¹ = adj(A) ÷ det A')).toBeDefined()
      // Each entry states its own division, not just the finished matrix.
      expect(Number(step(r, 'A⁻¹₁₁')!.value)).toBeCloseTo(0.6, 12)
    })

    test('det A⁻¹ is 1 ÷ det A', () => {
      const r = compute({ ...base, operation: 'inverse' })
      expect(Number(stat(r, 'det A⁻¹ (equals 1 ÷ det A)')!.value)).toBeCloseTo(1 / 10, 12)
    })

    test.each([
      ['a 2 x 2 with proportional rows', '2x2', '1, 2; 2, 4'],
      ['a 3 x 3 with a dependent row', '3x3', '1, 2, 3; 4, 5, 6; 7, 8, 9'],
      ['a singular matrix written in decimals', '2x2', '0.1, 0.2; 0.2, 0.4'],
      ['the zero matrix', '2x2', '0, 0; 0, 0'],
    ])('refuses to invert %s', (_label, size, matrixA) => {
      const error = throwsOn({ ...base, operation: 'inverse', size, matrixA })
      expect(error.fieldId).toBe('matrixA')
      expect(error.message).toContain('singular')
    })

    test('a genuinely tiny determinant is still invertible', () => {
      // 0.0001 x I has a determinant of 1e-8 — small, but nowhere near singular.
      // A fixed epsilon would refuse it; the tolerance is relative to the entries
      // because a determinant is homogeneous of degree n in them.
      const r = compute({ ...base, operation: 'inverse', matrixA: '0.0001, 0; 0, 0.0001' })
      expect(r.primary.value).toBe('[10000, 0; 0, 10000]')
    })
  })

  describe('transpose, add, subtract and multiply', () => {
    test('the transpose swaps rows for columns', () => {
      const r = compute({ ...base, operation: 'transpose' })
      expect(r.primary.value).toBe('[4, 2; 7, 6]')
      expect(Number(stat(r, 'Trace (also unchanged)')!.value)).toBe(10)
      expect(String(stat(r, 'Symmetric')!.value)).toContain('No')
    })

    test('a symmetric matrix is its own transpose', () => {
      const r = compute({ ...base, operation: 'transpose', matrixA: '1, 2; 2, 3' })
      expect(r.primary.value).toBe('[1, 2; 2, 3]')
      expect(String(stat(r, 'Symmetric')!.value)).toContain('Yes')
    })

    test('adding and subtracting the identity works entry by entry', () => {
      expect(compute({ ...base, operation: 'add' }).primary.value).toBe('[5, 7; 2, 7]')
      expect(compute({ ...base, operation: 'subtract' }).primary.value).toBe('[3, 7; 2, 5]')
    })

    test('multiplying by the identity returns the matrix unchanged', () => {
      const r = compute({ ...base, operation: 'multiply' })
      expect(r.primary.value).toBe('[4, 7; 2, 6]')
      expect(String(stat(r, 'Commutative for this pair')!.value)).toContain('Yes')
    })

    test('multiplication is not commutative, and the page says so', () => {
      // [1, 2; 3, 4] x [0, 1; 0, 0] = [0, 1; 0, 3], while the reverse is [3, 4; 0, 0].
      const r = compute({
        ...base,
        operation: 'multiply',
        matrixA: '1, 2; 3, 4',
        matrixB: '0, 1; 0, 0',
      })
      expect(r.primary.value).toBe('[0, 1; 0, 3]')
      expect(stat(r, 'B × A (not generally the same)')!.value).toBe('[3, 4; 0, 0]')
      expect(String(stat(r, 'Commutative for this pair')!.value)).toContain('No')
    })

    test('det(A x B) equals det A x det B', () => {
      const r = compute({
        ...base,
        operation: 'multiply',
        matrixA: '3, 1; 2, 5',
        matrixB: '4, 0; 7, 2',
      })
      // det A = 15 - 2 = 13, det B = 8 - 0 = 8, so the product's determinant is 104.
      expect(Number(stat(r, 'det A × det B')!.value)).toBeCloseTo(104, 10)
      expect(Number(stat(r, 'det(A × B) — equal to the line above')!.value)).toBeCloseTo(104, 10)
    })

    test('every entry of a 3 x 3 product is shown as its own dot product', () => {
      const r = compute({
        ...base,
        operation: 'multiply',
        size: '3x3',
        matrixA: '1, 2, 3; 4, 5, 6; 7, 8, 9',
        matrixB: '1, 0, 0; 0, 1, 0; 0, 0, 1',
      })
      expect(r.primary.value).toBe('[1, 2, 3; 4, 5, 6; 7, 8, 9]')
      const dots = r
        .steps!.filter((s): s is Extract<typeof s, { label: string }> => 'label' in s)
        .filter((s) => s.label.startsWith('c₁') || s.label.startsWith('c₂') || s.label.startsWith('c₃'))
      expect(dots).toHaveLength(9)
      expect(dots[0]!.label).toContain('1×1 + 2×0 + 3×0')
    })
  })

  describe('parsing', () => {
    test('semicolons, newlines, a flat run and brackets all read the same', () => {
      const semicolons = compute(base)
      // The third case is the one that matters most: `kind: 'text'` is a
      // single-line input, so a column pasted from a spreadsheet arrives with its
      // newlines already flattened to spaces and no row separator left at all.
      for (const matrixA of ['4 7\n2 6', '4 7; 2 6', '4 7 2 6', '[4, 7], [2, 6]', '4,7\n2,6']) {
        expect(Number(compute({ ...base, matrixA }).primary.value)).toBe(
          Number(semicolons.primary.value),
        )
      }
    })

    test('a flat run of nine values is read as a 3 x 3', () => {
      const flat = compute({ ...base, size: '3x3', matrixA: '6 1 1 4 -2 5 2 8 7' })
      const rows = compute({ ...base, size: '3x3', matrixA: '6, 1, 1; 4, -2, 5; 2, 8, 7' })
      expect(Number(flat.primary.value)).toBe(Number(rows.primary.value))
    })

    test.each([
      ['an empty matrix', { matrixA: '   ' }],
      ['a non-numeric entry', { matrixA: '4, seven; 2, 6' }],
      ['a stray unit', { matrixA: '4kg, 7; 2, 6' }],
      ['too few values', { matrixA: '4, 7; 2' }],
      ['a 2 x 2 declared as a 3 x 3', { size: '3x3' }],
      ['a 3 x 3 declared as a 2 x 2', { matrixA: '1, 2, 3; 4, 5, 6; 7, 8, 9' }],
    ])('rejects %s against the matrix A field', (_label, override) => {
      expect(throwsOn({ ...base, ...override }).fieldId).toBe('matrixA')
    })

    test('a bad matrix B is blamed on matrix B, and only when it is used', () => {
      expect(throwsOn({ ...base, operation: 'add', matrixB: '1, 0; nope, 1' }).fieldId).toBe('matrixB')
      // The determinant never reads B, so garbage there must not block an answer.
      expect(Number(compute({ ...base, matrixB: 'nonsense' }).primary.value)).toBe(10)
    })

    test('an unknown size or operation is refused against its own field', () => {
      expect(throwsOn({ ...base, size: '4x4' }).fieldId).toBe('size')
      expect(throwsOn({ ...base, operation: 'eigenvalues' }).fieldId).toBe('operation')
    })
  })

  test('every operation answers at the defaults without a NaN', () => {
    for (const operation of ['determinant', 'inverse', 'transpose', 'multiply', 'add', 'subtract']) {
      const r = compute({ ...base, operation })
      expect(String(r.primary.value)).not.toContain('NaN')
      expect(r.steps!.length).toBeGreaterThan(2)
      expect(r.stats!.length).toBeGreaterThan(2)
      for (const s of r.stats!) {
        if (typeof s.value === 'number') expect(Number.isNaN(s.value)).toBe(false)
      }
      // No proportion and no ordered axis here, so neither is claimed.
      expect(r.parts).toBeUndefined()
      expect(r.series).toBeUndefined()
    }
  })
})

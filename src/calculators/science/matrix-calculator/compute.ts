import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, StepRule, Values } from '../../../lib/types'
import type { fields } from './fields'

/**
 * Matrix arithmetic for 2 × 2 and 3 × 3, done the way it is done on paper.
 *
 * The determinant is a Laplace (cofactor) expansion along the first row, and the
 * inverse is adj(A) ÷ det A, where the adjugate is the transpose of the cofactor
 * matrix. Both are stated in full in `steps` — an LU factorisation would be
 * faster and would answer the same question, but there would be nothing to show,
 * and a black box that emits a number is not what this site is for. At order 2
 * and 3 the exact expansion is also more accurate on the integer matrices people
 * actually type: it is a handful of products and sums with no pivoting error.
 */

type Matrix = readonly (readonly number[])[]

const ORDERS: Readonly<Record<string, number>> = { '2x2': 2, '3x3': 3 }

const SUBSCRIPTS = ['₀', '₁', '₂', '₃'] as const

/** `a₂₃` — the index pair as a reader writes it, one-based. */
const ix = (row: number, col: number): string => `${SUBSCRIPTS[row + 1]}${SUBSCRIPTS[col + 1]}`

/**
 * Renders one entry for inclusion in a text expression. Trimmed to a sane
 * precision with `-0` normalised away, so an inverse reads `[0.6, -0.7; -0.2,
 * 0.4]` rather than `[0.600000, -0.700000; ...]`.
 */
function num(n: number): string {
  const rounded = Number(n.toFixed(6)) + 0
  return String(rounded === 0 ? 0 : rounded)
}

/** `[4, 7; 2, 6]` — the same notation the fields accept, so output can be pasted back in. */
function matrixText(m: Matrix): string {
  return `[${m.map((row) => row.map(num).join(', ')).join('; ')}]`
}

const raw = (label: string, value: string): Quantity => ({ label, value, format: { style: 'raw' } })

const dec = (label: string, value: number): Quantity => ({
  label,
  value,
  format: { style: 'decimal', decimals: 4 },
})

/** For the entries of an inverse, which are fractions and need the extra digits. */
const dec6 = (label: string, value: number): Quantity => ({
  label,
  value,
  format: { style: 'decimal', decimals: 6 },
})

const RULE: StepRule = { rule: true }

/**
 * Splits a typed matrix into rows and values.
 *
 * Rows break on a semicolon OR a newline, and values on commas or any run of
 * whitespace — the notations people actually use. Both row separators matter for
 * a different reason each: `kind: 'text'` renders as a single-line input, so a
 * typed matrix uses semicolons, while a block pasted out of a spreadsheet or a
 * textarea arrives carrying newlines that the field may or may not have
 * flattened. Whichever survives, the parse is the same.
 *
 * Brackets are stripped rather than rejected, so this calculator's own output
 * pastes straight back in, and `[1, 2], [3, 4]` works as readily as `1, 2; 3, 4`.
 */
function parseMatrix(input: string, order: number, fieldId: string, name: string): Matrix {
  const rows: number[][] = []
  for (const line of input.replace(/[[\]()|{}]/g, ' ').split(/[;\n\r]+/)) {
    const tokens = line.split(/[\s,]+/).filter((token) => token.length > 0)
    if (tokens.length === 0) continue
    const parsed: number[] = []
    for (const token of tokens) {
      const value = Number(token)
      // Number('') is 0 and Number('4x') is NaN — the filter above handles the
      // first, and anything still not finite is genuinely not a number.
      if (!Number.isFinite(value)) {
        throw new CalcError(
          `"${token}" in ${name} is not a number. Separate values with commas or spaces and rows with a semicolon.`,
          fieldId,
        )
      }
      parsed.push(value)
    }
    rows.push(parsed)
  }
  const flat = rows.flat()

  if (flat.length === 0) {
    throw new CalcError(`Enter the ${order * order} values of ${name}.`, fieldId)
  }

  // A single-line input receives a pasted column with its newlines already
  // flattened to spaces, which leaves one row holding every value. At a declared
  // size that is a shape, not an ambiguity, so it is reshaped rather than
  // refused — which is the whole reason the size select exists.
  if (rows.length === 1 && flat.length === order * order && order > 1) {
    return Array.from({ length: order }, (_, i) => flat.slice(i * order, i * order + order))
  }

  if (rows.length !== order || rows.some((row) => row.length !== order)) {
    const counts = rows.map((row) => row.length)
    const shape = counts.every((c) => c === counts[0])
      ? `${counts.length} row${counts.length === 1 ? '' : 's'} of ${counts[0]}`
      : `rows of ${counts.join(', ')}`
    throw new CalcError(
      `${name} must be ${order} × ${order} to match the size selected — ${order} rows of ${order} values, separated by semicolons. Read ${shape}.`,
      fieldId,
    )
  }

  return rows
}

const at = (m: Matrix, i: number, j: number): number => m[i]![j]!

/** A with row `row` and column `col` deleted — the minor's underlying matrix. */
function minor(m: Matrix, row: number, col: number): Matrix {
  return m.filter((_, i) => i !== row).map((r) => r.filter((_, j) => j !== col))
}

/** Laplace expansion along the first row. Exact for the 2 × 2 and 3 × 3 cases here. */
function det(m: Matrix): number {
  if (m.length === 1) return at(m, 0, 0)
  if (m.length === 2) return at(m, 0, 0) * at(m, 1, 1) - at(m, 0, 1) * at(m, 1, 0)
  let total = 0
  for (let j = 0; j < m.length; j += 1) {
    total += (j % 2 === 0 ? 1 : -1) * at(m, 0, j) * det(minor(m, 0, j))
  }
  return total
}

/** Cᵢⱼ = (−1)^(i+j) × Mᵢⱼ, the signed minor. */
const cofactor = (m: Matrix, i: number, j: number): number =>
  ((i + j) % 2 === 0 ? 1 : -1) * det(minor(m, i, j))

const transpose = (m: Matrix): Matrix =>
  Array.from({ length: m[0]!.length }, (_, i) => m.map((row) => row[i]!))

/** adj(A) — the transpose of the cofactor matrix. */
const adjugate = (m: Matrix): Matrix =>
  Array.from({ length: m.length }, (_, i) =>
    Array.from({ length: m.length }, (_, j) => cofactor(m, j, i)),
  )

const scale = (m: Matrix, k: number): Matrix => m.map((row) => row.map((x) => x * k))

const combine = (a: Matrix, b: Matrix, f: (x: number, y: number) => number): Matrix =>
  a.map((row, i) => row.map((x, j) => f(x, at(b, i, j))))

const multiply = (a: Matrix, b: Matrix): Matrix =>
  a.map((row, i) =>
    Array.from({ length: b[0]!.length }, (_, j) =>
      row.reduce((sum, _x, k) => sum + at(a, i, k) * at(b, k, j), 0),
    ),
  )

const trace = (m: Matrix): number => m.reduce((sum, _row, i) => sum + at(m, i, i), 0)

const sameMatrix = (a: Matrix, b: Matrix): boolean =>
  a.every((row, i) => row.every((x, j) => Math.abs(x - at(b, i, j)) < 1e-9))

/**
 * The threshold below which a determinant is treated as zero.
 *
 * Not a bare `det === 0`. A matrix that is singular in exact arithmetic can
 * produce a determinant of 4e-16 once its entries are decimals, and dividing the
 * adjugate by that yields an "inverse" with entries of order 1e15 — confidently
 * wrong, which is worse than a refusal. The bound is relative to the entries,
 * because a determinant is homogeneous of degree n in them: scaling every entry
 * by 0.001 scales a 3 × 3 determinant by 1e-9 without making the matrix any
 * closer to singular. A genuinely tiny but invertible matrix therefore still
 * passes.
 */
function singularTolerance(m: Matrix): number {
  const largest = Math.max(...m.flatMap((row) => row.map((x) => Math.abs(x))))
  return Math.max(Number.MIN_VALUE, 1e-12 * m.length * largest ** m.length)
}

/** The dot product spelled out: `4×1 + 7×0`. */
const dotText = (a: Matrix, b: Matrix, i: number, j: number): string =>
  a[i]!.map((_x, k) => `${num(at(a, i, k))}×${num(at(b, k, j))}`).join(' + ')

export default function compute(v: Values<typeof fields>): CalcResult {
  const order = ORDERS[v.size]
  if (order === undefined) {
    throw new CalcError('Choose either a 2 × 2 or a 3 × 3 matrix.', 'size')
  }

  const needsB = v.operation === 'multiply' || v.operation === 'add' || v.operation === 'subtract'

  const a = parseMatrix(v.matrixA, order, 'matrixA', 'Matrix A')
  const b = needsB ? parseMatrix(v.matrixB, order, 'matrixB', 'Matrix B') : undefined

  const size = `${order} × ${order}`
  const unusedB = ['Matrix B is not used by this operation, so whatever it holds is ignored.']

  switch (v.operation) {
    case 'determinant': {
      const value = det(a)
      const steps: (Quantity | StepRule)[] = [raw('Matrix A', matrixText(a)), RULE]

      if (order === 2) {
        // det = a₁₁a₂₂ − a₁₂a₂₁, the 2 × 2 case of the expansion below.
        steps.push(
          dec(`a₁₁ × a₂₂ = ${num(at(a, 0, 0))} × ${num(at(a, 1, 1))}`, at(a, 0, 0) * at(a, 1, 1)),
          dec(`a₁₂ × a₂₁ = ${num(at(a, 0, 1))} × ${num(at(a, 1, 0))}`, at(a, 0, 1) * at(a, 1, 0)),
          RULE,
          dec('det A = a₁₁a₂₂ − a₁₂a₂₁', value),
        )
      } else {
        steps.push(raw('Expand along the first row', 'det A = a₁₁M₁₁ − a₁₂M₁₂ + a₁₃M₁₃'))
        for (let j = 0; j < order; j += 1) {
          steps.push(dec(`M₁${SUBSCRIPTS[j + 1]} = det ${matrixText(minor(a, 0, j))}`, det(minor(a, 0, j))))
        }
        steps.push(RULE)
        for (let j = 0; j < order; j += 1) {
          const term = at(a, 0, j) * det(minor(a, 0, j))
          const sign = j % 2 === 0 ? '+' : '−'
          steps.push(
            dec(
              `${sign} a₁${SUBSCRIPTS[j + 1]} × M₁${SUBSCRIPTS[j + 1]} = ${sign}(${num(at(a, 0, j))} × ${num(det(minor(a, 0, j)))})`,
              (j % 2 === 0 ? 1 : -1) * term,
            ),
          )
        }
        steps.push(RULE, dec('det A = the three terms added', value))
      }

      return {
        primary: { label: 'Determinant of A', value, format: { style: 'decimal', decimals: 4 } },
        stats: [
          raw('Matrix A', matrixText(a)),
          raw('Order', size),
          dec('Trace (sum of the diagonal)', trace(a)),
          dec('Determinant of Aᵀ (always equal to det A)', det(transpose(a))),
          raw(
            'Invertible',
            Math.abs(value) <= singularTolerance(a)
              ? 'No — a determinant of zero means A is singular'
              : 'Yes — the determinant is not zero',
          ),
        ],
        steps,
        notes: [
          'The determinant is the factor by which the matrix scales area (2 × 2) or volume (3 × 3). A negative determinant means the transformation also flips orientation, and a determinant of zero means it collapses space onto a line or a point — which is exactly why such a matrix has no inverse.',
          'Expanding along the first row is a choice, not a rule. Any row or column gives the same number, and picking one containing a zero is how the arithmetic is kept short by hand.',
          ...unusedB,
        ],
      }
    }

    case 'inverse': {
      const value = det(a)
      if (Math.abs(value) <= singularTolerance(a)) {
        throw new CalcError(
          `Matrix A is singular — its determinant is ${num(value)}, and adj(A) ÷ det A divides by zero. A singular matrix has no inverse; change an entry so the rows are not multiples of one another.`,
          'matrixA',
        )
      }

      const adj = adjugate(a)
      const inverse = scale(adj, 1 / value)
      const steps: (Quantity | StepRule)[] = [raw('Matrix A', matrixText(a))]

      if (order === 2) {
        steps.push(
          dec('det A = a₁₁a₂₂ − a₁₂a₂₁', value),
          RULE,
          raw('adj(A): swap the diagonal, negate the off-diagonal', matrixText(adj)),
          RULE,
        )
      } else {
        steps.push(dec('det A (cofactor expansion along the first row)', value), RULE)
        for (let i = 0; i < order; i += 1) {
          for (let j = 0; j < order; j += 1) {
            steps.push(
              dec(
                `C${ix(i, j)} = ${(i + j) % 2 === 0 ? '+' : '−'}det ${matrixText(minor(a, i, j))}`,
                cofactor(a, i, j),
              ),
            )
          }
        }
        steps.push(
          RULE,
          raw('Cofactor matrix', matrixText(transpose(adj))),
          raw('adj(A) = the cofactor matrix transposed', matrixText(adj)),
          RULE,
        )
      }

      for (let i = 0; i < order; i += 1) {
        for (let j = 0; j < order; j += 1) {
          steps.push(
            dec6(
              `A⁻¹${ix(i, j)} = adj(A)${ix(i, j)} ÷ det A = ${num(at(adj, i, j))} ÷ ${num(value)}`,
              at(inverse, i, j),
            ),
          )
        }
      }
      steps.push(RULE, raw('A⁻¹ = adj(A) ÷ det A', matrixText(inverse)))

      return {
        primary: { label: 'Inverse of A', value: matrixText(inverse), format: { style: 'raw' } },
        stats: [
          raw('Matrix A', matrixText(a)),
          dec('Determinant of A', value),
          raw('adj(A)', matrixText(adj)),
          dec('det A⁻¹ (equals 1 ÷ det A)', det(inverse)),
          raw('Check: A × A⁻¹', matrixText(multiply(a, inverse))),
        ],
        steps,
        notes: [
          'A⁻¹ = adj(A) ÷ det A, where the adjugate is the transpose of the cofactor matrix. The check above multiplies A by the result: it must come back as the identity matrix, and any drift from exact 1s and 0s is rounding, not a different answer.',
          'Only a square matrix with a non-zero determinant has an inverse. When the determinant is zero the rows are linearly dependent — one is a combination of the others — so the transformation cannot be undone.',
          ...unusedB,
        ],
      }
    }

    case 'transpose': {
      const result = transpose(a)
      const steps: (Quantity | StepRule)[] = [
        raw('Matrix A', matrixText(a)),
        raw('Rule', 'The entry in row i, column j of A becomes row j, column i of Aᵀ'),
        RULE,
      ]
      for (let i = 0; i < order; i += 1) {
        steps.push(raw(`Row ${i + 1} of A becomes column ${i + 1} of Aᵀ`, a[i]!.map(num).join(', ')))
      }
      steps.push(RULE, raw('Aᵀ', matrixText(result)))

      return {
        primary: { label: 'Transpose of A', value: matrixText(result), format: { style: 'raw' } },
        stats: [
          raw('Matrix A', matrixText(a)),
          raw('Order', size),
          raw('Diagonal (unchanged by transposing)', a.map((_row, i) => num(at(a, i, i))).join(', ')),
          dec('Trace (also unchanged)', trace(a)),
          raw(
            'Symmetric',
            sameMatrix(a, result) ? 'Yes — A equals its own transpose' : 'No — A differs from Aᵀ',
          ),
        ],
        steps,
        notes: [
          'Transposing reflects the matrix across its main diagonal, so the diagonal entries stay where they are and everything else swaps sides. Doing it twice returns the original matrix.',
          'A matrix that equals its own transpose is symmetric. det Aᵀ always equals det A, which is why the determinant can be expanded along a column just as well as along a row.',
          ...unusedB,
        ],
      }
    }

    case 'multiply':
    case 'add':
    case 'subtract': {
      const other = b!
      const result =
        v.operation === 'multiply'
          ? multiply(a, other)
          : combine(a, other, v.operation === 'add' ? (x, y) => x + y : (x, y) => x - y)

      const symbol = v.operation === 'multiply' ? '×' : v.operation === 'add' ? '+' : '−'
      const steps: (Quantity | StepRule)[] = [
        raw('Matrix A', matrixText(a)),
        raw('Matrix B', matrixText(other)),
        RULE,
      ]

      if (v.operation === 'multiply') {
        steps.push(
          raw('Rule', 'Each entry is a row of A dotted with a column of B, term by term'),
        )
        for (let i = 0; i < order; i += 1) {
          for (let j = 0; j < order; j += 1) {
            steps.push(
              dec(
                `c${ix(i, j)} = row ${i + 1} of A · column ${j + 1} of B = ${dotText(a, other, i, j)}`,
                at(result, i, j),
              ),
            )
          }
        }
      } else {
        steps.push(raw('Rule', `Matching entries are combined one at a time: cᵢⱼ = aᵢⱼ ${symbol} bᵢⱼ`))
        for (let i = 0; i < order; i += 1) {
          for (let j = 0; j < order; j += 1) {
            steps.push(
              dec(
                `c${ix(i, j)} = ${num(at(a, i, j))} ${symbol} ${num(at(other, i, j))}`,
                at(result, i, j),
              ),
            )
          }
        }
      }
      steps.push(RULE, raw(`A ${symbol} B`, matrixText(result)))

      const stats: Quantity[] = [
        raw('Matrix A', matrixText(a)),
        raw('Matrix B', matrixText(other)),
      ]
      if (v.operation === 'multiply') {
        const reversed = multiply(other, a)
        stats.push(
          raw('B × A (not generally the same)', matrixText(reversed)),
          raw(
            'Commutative for this pair',
            sameMatrix(result, reversed) ? 'Yes — A × B equals B × A here' : 'No — A × B differs from B × A',
          ),
          dec('det A × det B', det(a) * det(other)),
          dec('det(A × B) — equal to the line above', det(result)),
        )
      } else {
        stats.push(
          dec('Trace of the result', trace(result)),
          dec('Determinant of the result', det(result)),
          dec(`det A ${symbol} det B (not the same thing)`, v.operation === 'add' ? det(a) + det(other) : det(a) - det(other)),
        )
      }

      return {
        primary: { label: `A ${symbol} B`, value: matrixText(result), format: { style: 'raw' } },
        stats,
        steps,
        notes:
          v.operation === 'multiply'
            ? [
                'Matrix multiplication is not commutative: A × B and B × A are usually different matrices, and both are shown above so you can see whether this particular pair happens to agree.',
                'The determinant is multiplicative, so det(A × B) always equals det A × det B. That identity is a useful check on the arithmetic — the two figures above must match.',
              ]
            : [
                `Addition and subtraction are entry by entry, so both matrices must be the same size. Each entry of the answer depends on exactly one entry from A and one from B.`,
                'The determinant is not additive. det(A + B) is generally nothing like det A + det B, which is why both figures are shown above rather than only one.',
              ],
      }
    }

    default:
      throw new CalcError('Choose one of the six operations.', 'operation')
  }
}

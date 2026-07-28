import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, Values } from '../../../lib/types'
import type { fields } from './fields'

/**
 * Renders a number for inclusion in a root expression. Roots are frequently
 * irrational, so they are trimmed to a sane precision and `-0` is normalised
 * away; the raw discriminant and vertex are still exposed as real numbers.
 */
function num(n: number): string {
  const rounded = Number(n.toFixed(6)) + 0
  return String(rounded === 0 ? 0 : rounded)
}

export default function compute(v: Values<typeof fields>): CalcResult {
  const { a, b, c } = v

  for (const [id, value] of [
    ['a', a],
    ['b', b],
    ['c', c],
  ] as const) {
    if (!Number.isFinite(value)) throw new CalcError(`Enter a number for ${id}.`, id)
  }
  if (a === 0)
    throw new CalcError(
      'a cannot be 0 — with no x² term the equation is linear, not quadratic.',
      'a',
    )

  const discriminant = b * b - 4 * a * c
  const vertexX = -b / (2 * a)
  const vertexY = a * vertexX * vertexX + b * vertexX + c

  let rootCount: number
  let rootsText: string
  let root1: string
  let root2: string
  let nature: string

  if (discriminant > 0) {
    // The textbook form loses precision through catastrophic cancellation when
    // b² dominates 4ac; this citardauq-style pairing keeps both roots accurate.
    const sq = Math.sqrt(discriminant)
    const q = -0.5 * (b + (b >= 0 ? sq : -sq))
    const rA = q / a
    const rB = q !== 0 ? c / q : 0
    const hi = Math.max(rA, rB)
    const lo = Math.min(rA, rB)
    rootCount = 2
    root1 = `x = ${num(hi)}`
    root2 = `x = ${num(lo)}`
    rootsText = `x = ${num(hi)} or x = ${num(lo)}`
    nature = 'Two distinct real roots'
  } else if (discriminant === 0) {
    const r = -b / (2 * a)
    rootCount = 1
    root1 = `x = ${num(r)}`
    root2 = `x = ${num(r)}`
    rootsText = `x = ${num(r)} (double root)`
    nature = 'One repeated real root'
  } else {
    const re = -b / (2 * a)
    const im = Math.abs(Math.sqrt(-discriminant) / (2 * a))
    rootCount = 0
    root1 = `x = ${num(re)} + ${num(im)}i`
    root2 = `x = ${num(re)} - ${num(im)}i`
    rootsText = `x = ${num(re)} + ${num(im)}i or x = ${num(re)} - ${num(im)}i`
    nature = 'A complex conjugate pair — no real roots'
  }

  const stats: Quantity[] = [
    { label: 'Discriminant (b² − 4ac)', value: discriminant, format: { style: 'decimal', decimals: 4 } },
    { label: 'Nature of the roots', value: nature, format: { style: 'raw' } },
    { label: 'First root', value: root1, format: { style: 'raw' } },
    { label: 'Second root', value: root2, format: { style: 'raw' } },
    { label: 'Real roots', value: rootCount, format: { style: 'decimal', decimals: 0 } },
    { label: 'Vertex x', value: vertexX, format: { style: 'decimal', decimals: 4 } },
    { label: 'Vertex y', value: vertexY, format: { style: 'decimal', decimals: 4 } },
    { label: 'Axis of symmetry', value: `x = ${num(vertexX)}`, format: { style: 'raw' } },
  ]

  return {
    primary: { label: 'Roots', value: rootsText, format: { style: 'raw' } },
    stats,
    steps: [
      { label: 'a', value: a, format: { style: 'decimal', decimals: 4 } },
      { label: 'b', value: b, format: { style: 'decimal', decimals: 4 } },
      { label: 'c', value: c, format: { style: 'decimal', decimals: 4 } },
      { rule: true },
      { label: 'b²', value: b * b, format: { style: 'decimal', decimals: 4 } },
      { label: '4ac', value: 4 * a * c, format: { style: 'decimal', decimals: 4 } },
      {
        label: 'Discriminant b² − 4ac',
        value: discriminant,
        format: { style: 'decimal', decimals: 4 },
      },
      { rule: true },
      { label: '−b ÷ 2a (vertex x)', value: vertexX, format: { style: 'decimal', decimals: 4 } },
      { label: 'Minimum or maximum value', value: vertexY, format: { style: 'decimal', decimals: 4 } },
      {
        label: 'Opens',
        value: a > 0 ? 'Upward (vertex is the minimum)' : 'Downward (vertex is the maximum)',
        format: { style: 'raw' },
      },
      { rule: true },
      { label: 'Sum of roots (−b ÷ a)', value: -b / a, format: { style: 'decimal', decimals: 4 } },
      { label: 'Product of roots (c ÷ a)', value: c / a, format: { style: 'decimal', decimals: 4 } },
      { label: 'Roots', value: rootsText, format: { style: 'raw' } },
    ],
    notes:
      discriminant < 0
        ? [
            'The parabola never crosses the x-axis, so the two roots are complex conjugates written in the form p + qi.',
          ]
        : [],
  }
}

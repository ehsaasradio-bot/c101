import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, Values } from '../../../lib/types'
import type { fields } from './fields'

const MODES = ['of', 'isWhatPercent', 'increase', 'decrease'] as const
type Mode = (typeof MODES)[number]

const isMode = (s: string): s is Mode => (MODES as readonly string[]).includes(s)

const num = (label: string, value: number, decimals = 4): Quantity => ({
  label,
  value,
  format: { style: 'decimal', decimals },
})

const pct = (label: string, value: number, decimals = 4): Quantity => ({
  label,
  value,
  format: { style: 'percent', decimals },
})

export default function compute(v: Values<typeof fields>): CalcResult {
  const { valueA, valueB } = v
  const mode = v.mode

  if (!isMode(mode)) throw new CalcError('Choose one of the four calculation modes.', 'mode')
  if (!Number.isFinite(valueA)) throw new CalcError('Enter a number for value A.', 'valueA')
  if (!Number.isFinite(valueB)) throw new CalcError('Enter a number for value B.', 'valueB')

  if (mode === 'isWhatPercent') {
    // A/B is undefined when the base is zero — "5 is what percent of 0" has no answer.
    if (valueB === 0)
      throw new CalcError('Value B cannot be zero — nothing can be a percentage of zero.', 'valueB')

    const percent = (valueA / valueB) * 100

    return {
      primary: { label: 'A as a percent of B', value: percent, format: { style: 'percent', decimals: 4 } },
      stats: [
        num('Difference (A − B)', valueA - valueB, 4),
        pct('Remaining share of B', 100 - percent, 4),
        num('One percent of B', valueB / 100, 6),
      ],
      steps: [
        num('Value A', valueA),
        num('Value B', valueB),
        { rule: true },
        num('A ÷ B', valueA / valueB, 6),
        pct('(A ÷ B) × 100', percent, 4),
      ],
    }
  }

  // Every remaining mode treats A as a percentage applied to the base B.
  const part = (valueB * valueA) / 100

  if (mode === 'of') {
    return {
      primary: { label: 'A% of B', value: part, format: { style: 'decimal', decimals: 4 } },
      stats: [
        num('Remainder (B − result)', valueB - part, 4),
        num('B increased by A%', valueB + part, 4),
        num('B decreased by A%', valueB - part, 4),
      ],
      steps: [
        pct('Percentage A', valueA),
        num('Base B', valueB),
        { rule: true },
        num('A ÷ 100', valueA / 100, 6),
        num('(A ÷ 100) × B', part, 4),
      ],
    }
  }

  const result = mode === 'increase' ? valueB + part : valueB - part
  const verb = mode === 'increase' ? 'increased' : 'decreased'
  const factor = mode === 'increase' ? 1 + valueA / 100 : 1 - valueA / 100

  return {
    primary: {
      label: `B ${verb} by A%`,
      value: result,
      format: { style: 'decimal', decimals: 4 },
    },
    stats: [
      num('Amount of change', mode === 'increase' ? part : -part, 4),
      num('Multiplier applied', factor, 6),
      num('Starting value B', valueB, 4),
    ],
    steps: [
      pct('Percentage A', valueA),
      num('Base B', valueB),
      { rule: true },
      num('Change = B × A ÷ 100', part, 4),
      num(`B ${mode === 'increase' ? '+' : '−'} change`, result, 4),
    ],
    notes: [
      'A percent decrease and a percent increase of the same size do not cancel out: 100 raised 10% then cut 10% lands at 99, not 100.',
    ],
  }
}

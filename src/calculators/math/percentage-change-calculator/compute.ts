import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

export default function compute(v: Values<typeof fields>): CalcResult {
  const { oldValue, newValue } = v

  if (!Number.isFinite(oldValue))
    throw new CalcError('Enter a number for the original value.', 'oldValue')
  if (!Number.isFinite(newValue)) throw new CalcError('Enter a number for the new value.', 'newValue')
  if (oldValue === 0)
    throw new CalcError(
      'Percentage change from zero is undefined — any increase is infinitely large.',
      'oldValue',
    )

  const difference = newValue - oldValue
  // Dividing by the magnitude keeps the sign of the change the same as the sign
  // of the difference, so a move from -50 to -25 reads as a +50% increase.
  const changePercent = (difference / Math.abs(oldValue)) * 100
  const multiplier = newValue / oldValue

  const direction = difference > 0 ? 'Increase' : difference < 0 ? 'Decrease' : 'No change'

  const notes: string[] = []
  if (oldValue < 0)
    notes.push(
      'The original value is negative, so the change is measured against its magnitude: moving toward zero counts as an increase.',
    )
  if (oldValue > 0 && newValue < 0)
    notes.push(
      'The value crossed from positive to negative, which is why the decrease is larger than 100%.',
    )

  return {
    primary: {
      label: 'Percentage change',
      value: changePercent,
      format: { style: 'percent', decimals: 2 },
    },
    scaleValue: changePercent,
    stats: [
      {
        label: 'Absolute difference',
        value: Math.abs(difference),
        format: { style: 'decimal', decimals: 4 },
      },
      { label: 'Direction', value: direction, format: { style: 'raw' } },
      { label: 'Multiplier', value: multiplier, format: { style: 'decimal', decimals: 4 } },
      {
        label: 'New as a share of original',
        value: multiplier * 100,
        format: { style: 'percent', decimals: 2 },
      },
    ],
    steps: [
      { label: 'Original value', value: oldValue, format: { style: 'decimal', decimals: 4 } },
      { label: 'New value', value: newValue, format: { style: 'decimal', decimals: 4 } },
      { rule: true },
      {
        label: 'New − original',
        value: difference,
        format: { style: 'decimal', decimals: 4 },
      },
      {
        label: 'Divided by |original|',
        value: difference / Math.abs(oldValue),
        format: { style: 'decimal', decimals: 6 },
      },
      {
        label: 'Times 100',
        value: changePercent,
        format: { style: 'percent', decimals: 2 },
      },
    ],
    notes,
  }
}

import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

const LB_PER_KG = 2.20462
const IN_PER_M = 39.3701

export default function compute(v: Values<typeof fields>): CalcResult {
  const { weight, height, units } = v
  const imperial = units === 'imperial'

  if (!(weight > 0)) throw new CalcError('Enter a weight greater than 0.', 'weight')
  if (!(height > 0)) throw new CalcError('Enter a height greater than 0.', 'height')

  const kg = imperial ? weight / LB_PER_KG : weight
  const metres = imperial ? height / IN_PER_M : height / 100

  if (metres > 2.72) throw new CalcError('That height looks too large — check the units.', 'height')

  const bmi = kg / (metres * metres)

  // The healthy-BMI band (18.5–24.9) mapped back to a weight range at this height.
  const healthyLow = 18.5 * metres * metres
  const healthyHigh = 24.9 * metres * metres
  const toDisplay = (v: number) => (imperial ? v * LB_PER_KG : v)
  const weightUnit = imperial ? 'lb' : 'kg'

  return {
    primary: { label: 'Body mass index', value: bmi, format: { style: 'decimal', decimals: 1 } },
    scaleValue: bmi,
    stats: [
      {
        label: 'Healthy range (low)',
        value: toDisplay(healthyLow),
        format: { style: 'decimal', decimals: 1, unit: weightUnit },
      },
      {
        label: 'Healthy range (high)',
        value: toDisplay(healthyHigh),
        format: { style: 'decimal', decimals: 1, unit: weightUnit },
      },
      {
        label: 'Difference from healthy',
        value: toDisplay(
          bmi < 18.5 ? healthyLow - kg : bmi > 24.9 ? kg - healthyHigh : 0,
        ),
        format: { style: 'decimal', decimals: 1, unit: weightUnit },
      },
    ],
    steps: [
      {
        label: 'Weight',
        value: kg,
        format: { style: 'decimal', decimals: 1, unit: 'kg' },
      },
      { label: 'Height', value: metres, format: { style: 'decimal', decimals: 2, unit: 'm' } },
      { rule: true },
      {
        label: 'Height squared',
        value: metres * metres,
        format: { style: 'decimal', decimals: 3, unit: 'm²' },
      },
      { label: 'BMI = weight ÷ height²', value: bmi, format: { style: 'decimal', decimals: 1 } },
    ],
    notes: [
      'BMI is a population-level screening tool. It does not distinguish muscle from fat, so athletes often read high and older adults often read low.',
    ],
  }
}

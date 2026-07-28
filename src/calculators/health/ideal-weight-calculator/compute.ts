import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

const CM_PER_IN = 2.54
const LB_PER_KG = 2.20462
const BASE_IN = 60 // 5 ft — every classic formula is anchored here.

/** kg at 5ft, then kg added per inch above 5ft. */
const FORMULAS = [
  { name: 'Devine', base: { male: 50, female: 45.5 }, perInch: { male: 2.3, female: 2.3 } },
  { name: 'Robinson', base: { male: 52, female: 49 }, perInch: { male: 1.9, female: 1.7 } },
  { name: 'Miller', base: { male: 56.2, female: 53.1 }, perInch: { male: 1.41, female: 1.36 } },
  { name: 'Hamwi', base: { male: 48, female: 45.5 }, perInch: { male: 2.7, female: 2.2 } },
] as const

export default function compute(v: Values<typeof fields>): CalcResult {
  const { units, sex, height } = v
  const imperial = units === 'imperial'

  if (sex !== 'male' && sex !== 'female') throw new CalcError('Choose a sex.', 'sex')
  if (!(height > 0)) throw new CalcError('Enter a height greater than 0.', 'height')

  const inches = imperial ? height : height / CM_PER_IN
  const cm = inches * CM_PER_IN

  if (imperial && height > 100)
    throw new CalcError('That height looks like centimetres — switch units.', 'height')
  if (cm < 120) throw new CalcError('These formulas apply to adults 120cm and taller.', 'height')
  if (cm > 250) throw new CalcError('That height looks too large — check the units.', 'height')

  const over = inches - BASE_IN

  const results = FORMULAS.map((f) => ({
    name: f.name,
    kg: f.base[sex] + f.perInch[sex] * over,
  }))

  const averageKg = results.reduce((sum, r) => sum + r.kg, 0) / results.length

  const metres = cm / 100
  const healthyLowKg = 18.5 * metres * metres
  const healthyHighKg = 24.9 * metres * metres

  const out = (kg: number) => (imperial ? kg * LB_PER_KG : kg)
  const unit = imperial ? 'lb' : 'kg'
  const dec = (label: string, kg: number) => ({
    label,
    value: out(kg),
    format: { style: 'decimal', decimals: 1, unit } as const,
  })

  return {
    primary: {
      label: 'Ideal body weight',
      value: out(averageKg),
      format: { style: 'decimal', decimals: 1, unit },
    },
    stats: [
      ...results.map((r) => dec(r.name, r.kg)),
      dec('Healthy BMI range (low)', healthyLowKg),
      dec('Healthy BMI range (high)', healthyHighKg),
    ],
    steps: [
      { label: 'Height', value: cm, format: { style: 'decimal', decimals: 1, unit: 'cm' } },
      { label: 'Height', value: inches, format: { style: 'decimal', decimals: 2, unit: 'in' } },
      {
        label: 'Inches above 5 ft',
        value: over,
        format: { style: 'decimal', decimals: 2, unit: 'in' },
      },
      { rule: true },
      ...results.map((r) => dec(`${r.name} formula`, r.kg)),
      { rule: true },
      dec('Average of the four formulas', averageKg),
    ],
    notes: [
      'These formulas were built for drug dosing and insurance tables, not for body composition. They take no account of frame size, muscle mass, or age.',
      'The healthy BMI range is usually the more useful target: any weight inside it is reasonable for your height.',
    ],
  }
}

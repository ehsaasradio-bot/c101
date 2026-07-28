import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, Values } from '../../../lib/types'
import type { fields } from './fields'

/**
 * Length factors are metres per unit; weight factors are grams per unit. Both
 * tables are exact by international definition (the inch has been exactly
 * 25.4mm and the pound exactly 453.59237g since 1959), so every derived unit is
 * exact too: 1 ft = 12 in, 1 mi = 5280 ft, 1 st = 14 lb, 1 oz = 1/16 lb.
 */
const LENGTH: Record<string, number> = {
  millimetre: 0.001,
  centimetre: 0.01,
  metre: 1,
  kilometre: 1000,
  inch: 0.0254,
  foot: 0.3048,
  yard: 0.9144,
  mile: 1609.344,
}

const WEIGHT: Record<string, number> = {
  milligram: 0.001,
  gram: 1,
  kilogram: 1000,
  tonne: 1_000_000,
  ounce: 453.59237 / 16,
  pound: 453.59237,
  stone: 453.59237 * 14,
}

const TEMPERATURE = ['celsius', 'fahrenheit', 'kelvin'] as const

const ABBREV: Record<string, string> = {
  millimetre: 'mm',
  centimetre: 'cm',
  metre: 'm',
  kilometre: 'km',
  inch: 'in',
  foot: 'ft',
  yard: 'yd',
  mile: 'mi',
  milligram: 'mg',
  gram: 'g',
  kilogram: 'kg',
  tonne: 't',
  ounce: 'oz',
  pound: 'lb',
  stone: 'st',
  celsius: '°C',
  fahrenheit: '°F',
  kelvin: 'K',
}

const CATEGORY_LABEL: Record<string, string> = {
  length: 'length',
  weight: 'weight',
  temperature: 'temperature',
}

/** Absolute zero, expressed in each scale. */
const ABSOLUTE_ZERO: Record<string, number> = {
  celsius: -273.15,
  fahrenheit: -459.67,
  kelvin: 0,
}

function toCelsius(value: number, unit: string): number {
  if (unit === 'fahrenheit') return ((value - 32) * 5) / 9
  if (unit === 'kelvin') return value - 273.15
  return value
}

function fromCelsius(celsius: number, unit: string): number {
  if (unit === 'fahrenheit') return (celsius * 9) / 5 + 32
  if (unit === 'kelvin') return celsius + 273.15
  return celsius
}

function unitsFor(category: string): readonly string[] {
  if (category === 'length') return Object.keys(LENGTH)
  if (category === 'weight') return Object.keys(WEIGHT)
  return TEMPERATURE
}

export default function compute(v: Values<typeof fields>): CalcResult {
  const { value, category, fromUnit, toUnit } = v

  if (!Number.isFinite(value)) throw new CalcError('Enter a number to convert.', 'value')
  if (!(category in CATEGORY_LABEL))
    throw new CalcError('Choose length, weight, or temperature.', 'category')

  const allowed = unitsFor(category)
  const name = CATEGORY_LABEL[category]
  if (!allowed.includes(fromUnit))
    throw new CalcError(`That "from" unit is not a unit of ${name}.`, 'fromUnit')
  if (!allowed.includes(toUnit))
    throw new CalcError(`That "to" unit is not a unit of ${name}.`, 'toUnit')

  const fromAbbrev = ABBREV[fromUnit]
  const toAbbrev = ABBREV[toUnit]

  if (category === 'temperature') {
    if (value < ABSOLUTE_ZERO[fromUnit])
      throw new CalcError('That is below absolute zero.', 'value')

    const celsius = toCelsius(value, fromUnit)
    const converted = fromCelsius(celsius, toUnit)

    return {
      primary: {
        label: `Result in ${toAbbrev}`,
        value: converted,
        format: { style: 'decimal', decimals: 2, unit: toAbbrev },
      },
      stats: [
        {
          label: 'Celsius',
          value: celsius,
          format: { style: 'decimal', decimals: 2, unit: '°C' },
        },
        {
          label: 'Fahrenheit',
          value: fromCelsius(celsius, 'fahrenheit'),
          format: { style: 'decimal', decimals: 2, unit: '°F' },
        },
        {
          label: 'Kelvin',
          value: fromCelsius(celsius, 'kelvin'),
          format: { style: 'decimal', decimals: 2, unit: 'K' },
        },
      ],
      steps: [
        {
          label: `Input (${fromAbbrev})`,
          value,
          format: { style: 'decimal', decimals: 2, unit: fromAbbrev },
        },
        { label: 'Converted to Celsius', value: celsius, format: { style: 'decimal', decimals: 4, unit: '°C' } },
        { rule: true },
        {
          label: `Converted to ${toAbbrev}`,
          value: converted,
          format: { style: 'decimal', decimals: 4, unit: toAbbrev },
        },
      ],
      notes: [
        'Temperature scales have different zero points, so they are converted through Celsius rather than by a single multiplier: °F = °C × 9/5 + 32, and K = °C + 273.15.',
      ],
    }
  }

  if (value < 0)
    throw new CalcError(`A ${name} cannot be negative.`, 'value')

  const table = category === 'length' ? LENGTH : WEIGHT
  const baseAbbrev = category === 'length' ? 'm' : 'g'
  const inBase = value * table[fromUnit]
  const converted = inBase / table[toUnit]
  const factor = table[fromUnit] / table[toUnit]

  const stats: Quantity[] = [
    {
      label: `1 ${fromAbbrev} in ${toAbbrev}`,
      value: factor,
      format: { style: 'decimal', decimals: 6, unit: toAbbrev },
    },
    {
      label: `1 ${toAbbrev} in ${fromAbbrev}`,
      value: 1 / factor,
      format: { style: 'decimal', decimals: 6, unit: fromAbbrev },
    },
    {
      label: `Value in ${baseAbbrev}`,
      value: inBase,
      format: { style: 'decimal', decimals: 4, unit: baseAbbrev },
    },
  ]

  return {
    primary: {
      label: `Result in ${toAbbrev}`,
      value: converted,
      format: { style: 'decimal', decimals: 4, unit: toAbbrev },
    },
    stats,
    steps: [
      {
        label: `Input (${fromAbbrev})`,
        value,
        format: { style: 'decimal', decimals: 4, unit: fromAbbrev },
      },
      {
        label: `× ${baseAbbrev} per ${fromAbbrev}`,
        value: table[fromUnit],
        format: { style: 'decimal', decimals: 6 },
      },
      {
        label: `Value in ${baseAbbrev}`,
        value: inBase,
        format: { style: 'decimal', decimals: 4, unit: baseAbbrev },
      },
      { rule: true },
      {
        label: `÷ ${baseAbbrev} per ${toAbbrev}`,
        value: table[toUnit],
        format: { style: 'decimal', decimals: 6 },
      },
      {
        label: `Result in ${toAbbrev}`,
        value: converted,
        format: { style: 'decimal', decimals: 4, unit: toAbbrev },
      },
    ],
    notes: [
      'Conversions run through a single base unit — metres for length, grams for weight — so every pair uses the same exact factor table.',
    ],
  }
}

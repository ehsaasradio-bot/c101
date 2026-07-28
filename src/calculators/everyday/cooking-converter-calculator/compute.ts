import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, Values } from '../../../lib/types'
import type { fields } from './fields'

/**
 * Millilitres per unit, US customary cooking measures.
 *
 * The US legal/nutrition-label cup is exactly 240ml, but recipes use the
 * customary cup, which is 1/16 of a US liquid gallon (3.785411784 l exactly) =
 * 236.5882365ml. Rounded to the 236.588 the domain brief specifies, with the
 * smaller measures rounded consistently from the same chain:
 *   1 cup = 8 fl oz = 16 tbsp = 48 tsp, 1 pint = 2 cups, 1 quart = 2 pints.
 * The rounding leaves the derived ratios accurate to ~1 part in 10^6, far
 * finer than any kitchen can pour.
 */
const ML_PER_UNIT: Record<string, number> = {
  teaspoon: 4.92892,
  tablespoon: 14.7868,
  fluidOunce: 29.5735,
  cup: 236.588,
  pint: 473.176,
  quart: 946.353,
  millilitre: 1,
  litre: 1000,
}

const UNIT_LABEL: Record<string, string> = {
  teaspoon: 'Teaspoons',
  tablespoon: 'Tablespoons',
  fluidOunce: 'Fluid ounces',
  cup: 'Cups',
  pint: 'Pints',
  quart: 'Quarts',
  millilitre: 'Millilitres',
  litre: 'Litres',
}

const UNIT_ABBREV: Record<string, string> = {
  teaspoon: 'tsp',
  tablespoon: 'tbsp',
  fluidOunce: 'fl oz',
  cup: 'cups',
  pint: 'pt',
  quart: 'qt',
  millilitre: 'ml',
  litre: 'l',
}

/** The units shown in the stats grid, in ascending order of size. */
const COMMON: ReadonlyArray<string> = [
  'teaspoon',
  'tablespoon',
  'fluidOunce',
  'cup',
  'pint',
  'quart',
  'millilitre',
  'litre',
]

/** Small quantities need more decimal places to stay useful. */
function decimalsFor(value: number): number {
  const magnitude = Math.abs(value)
  if (magnitude === 0) return 2
  if (magnitude >= 100) return 1
  if (magnitude >= 1) return 3
  return 4
}

function quantity(unit: string, value: number): Quantity {
  return {
    label: UNIT_LABEL[unit],
    value,
    format: { style: 'decimal', decimals: decimalsFor(value), unit: UNIT_ABBREV[unit] },
  }
}

export default function compute(v: Values<typeof fields>): CalcResult {
  const { amount } = v
  // Selects arrive as strings; the derived Values type makes that explicit.
  const fromUnit = v.fromUnit
  const toUnit = v.toUnit

  if (!Number.isFinite(amount)) throw new CalcError('Enter a numeric amount.', 'amount')
  if (amount < 0) throw new CalcError('Amount cannot be negative.', 'amount')

  const fromFactor = ML_PER_UNIT[fromUnit]
  if (fromFactor === undefined)
    throw new CalcError('Choose a unit to convert from.', 'fromUnit')

  const toFactor = ML_PER_UNIT[toUnit]
  if (toFactor === undefined) throw new CalcError('Choose a unit to convert to.', 'toUnit')

  const millilitres = amount * fromFactor
  const converted = millilitres / toFactor

  // Every other common unit, so the cook can read across without re-running it.
  const stats = COMMON.filter((unit) => unit !== toUnit).map((unit) =>
    quantity(unit, millilitres / ML_PER_UNIT[unit]),
  )

  const notes: string[] = [
    'Volume measures only. Converting a volume to a weight depends on the ingredient — a cup of flour and a cup of honey do not weigh the same.',
  ]
  if (fromUnit === 'cup' || toUnit === 'cup')
    notes.push(
      'Uses the US customary cup of 236.588ml. A metric cup is 250ml and an imperial (UK) cup is about 284ml.',
    )

  return {
    primary: {
      label: `${UNIT_LABEL[toUnit]}`,
      value: converted,
      format: { style: 'decimal', decimals: decimalsFor(converted), unit: UNIT_ABBREV[toUnit] },
    },
    stats,
    steps: [
      quantity(fromUnit, amount),
      { rule: true },
      {
        label: `Millilitres per ${UNIT_LABEL[fromUnit].toLowerCase().replace(/s$/, '')}`,
        value: fromFactor,
        format: { style: 'decimal', decimals: 5, unit: 'ml' },
      },
      { label: 'Amount in millilitres', value: millilitres, format: { style: 'decimal', decimals: 4, unit: 'ml' } },
      {
        label: `Millilitres per ${UNIT_LABEL[toUnit].toLowerCase().replace(/s$/, '')}`,
        value: toFactor,
        format: { style: 'decimal', decimals: 5, unit: 'ml' },
      },
      { rule: true },
      quantity(toUnit, converted),
    ],
    notes,
  }
}

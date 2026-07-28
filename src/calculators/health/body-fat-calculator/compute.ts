import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, Values } from '../../../lib/types'
import type { fields } from './fields'

const CM_PER_IN = 2.54

/**
 * The US Navy (Hodgdon–Beckett) circumference equations, in the inch-native
 * form the Navy itself publishes:
 *
 *   men   %BF = 86.010·log10(waist − neck)          − 70.041·log10(height) + 36.760
 *   women %BF = 163.205·log10(waist + hip − neck)   − 97.684·log10(height) − 78.387
 *
 * A second form of the same method circulates as a body-density equation fed
 * through Siri — 495/(1.0324 − 0.19077·log10(waist − neck) + 0.15456·log10(height)) − 450.
 * Those coefficients are the CENTIMETRE fit: feeding them inches understates
 * body fat by roughly six percentage points, because the two log terms have
 * different coefficients and the unit conversion therefore does not cancel.
 * `compute.test.ts` cross-checks this implementation against that cm form.
 */
const MEN = { circ: 86.01, height: 70.041, offset: 36.76 }
const WOMEN = { circ: 163.205, height: 97.684, offset: -78.387 }

export default function compute(v: Values<typeof fields>): CalcResult {
  const { height, neck, waist, hip, weight } = v
  // Selects arrive as strings; the derived Values type makes that explicit.
  const imperial = v.units === 'imperial'
  const female = v.sex === 'female'

  if (!(height > 0)) throw new CalcError('Enter a height greater than 0.', 'height')
  if (!(neck > 0)) throw new CalcError('Enter a neck measurement greater than 0.', 'neck')
  if (!(waist > 0)) throw new CalcError('Enter a waist measurement greater than 0.', 'waist')
  if (!(weight > 0)) throw new CalcError('Enter a body weight greater than 0.', 'weight')
  if (female && !(hip > 0))
    throw new CalcError('The female equation needs a hip measurement.', 'hip')

  const toIn = (value: number) => (imperial ? value : value / CM_PER_IN)
  const heightIn = toIn(height)
  const neckIn = toIn(neck)
  const waistIn = toIn(waist)
  const hipIn = toIn(hip)

  // A height outside roughly 3ft4–9ft means the wrong unit was selected — 178
  // read as inches, or 70 read as centimetres. Without this the equation returns
  // a confident and completely wrong percentage instead of an error.
  if (heightIn > 107) throw new CalcError('That height looks too large — check the units.', 'height')
  if (heightIn < 40) throw new CalcError('That height looks too small — check the units.', 'height')

  // The log argument must be strictly positive, and a waist at or below the
  // neck is anatomically impossible rather than merely out of range.
  const circumference = female ? waistIn + hipIn - neckIn : waistIn - neckIn
  if (!(circumference > 0))
    throw new CalcError(
      female
        ? 'Waist plus hip must be larger than the neck measurement.'
        : 'Waist must be larger than the neck measurement.',
      'waist',
    )

  const k = female ? WOMEN : MEN
  const bodyFat = k.circ * Math.log10(circumference) - k.height * Math.log10(heightIn) + k.offset

  // The regression is fitted to real bodies; outside that range it can return a
  // value at or below zero, which is a measurement error, not a lean physique.
  if (!(bodyFat > 0))
    throw new CalcError(
      'Those measurements give an impossible body fat percentage — re-check the tape.',
      'waist',
    )
  // The same regression runs away above 100% for extreme inputs. Beyond that the
  // lean mass below would be negative, which is not a body.
  if (bodyFat >= 100)
    throw new CalcError(
      'Those measurements give an impossible body fat percentage — re-check the tape.',
      'waist',
    )

  // Fat and lean mass are quoted in whatever unit was typed, so the two always
  // add back to exactly the weight the user entered.
  const fatMass = (weight * bodyFat) / 100
  const leanMass = weight - fatMass
  const weightUnit = imperial ? 'lb' : 'kg'
  const mass = { style: 'decimal', decimals: 1, unit: weightUnit } as const

  const unit = imperial ? 'in' : 'cm'
  const display = (inches: number) => (imperial ? inches : inches * CM_PER_IN)

  const steps: Quantity[] = [
    { label: 'Height', value: heightIn, format: { style: 'decimal', decimals: 2, unit: 'in' } },
    { label: 'Neck', value: neckIn, format: { style: 'decimal', decimals: 2, unit: 'in' } },
    { label: 'Waist', value: waistIn, format: { style: 'decimal', decimals: 2, unit: 'in' } },
  ]
  if (female)
    steps.push({
      label: 'Hip',
      value: hipIn,
      format: { style: 'decimal', decimals: 2, unit: 'in' },
    })

  return {
    primary: {
      label: 'Body fat',
      value: bodyFat,
      format: { style: 'percent', decimals: 1 },
    },
    scaleValue: bodyFat,
    stats: [
      { label: 'Lean mass share', value: 100 - bodyFat, format: { style: 'percent', decimals: 1 } },
      {
        label: 'Waist-to-height ratio',
        value: waistIn / heightIn,
        format: { style: 'decimal', decimals: 2 },
      },
      {
        label: female ? 'Waist + hip − neck' : 'Waist − neck',
        value: display(circumference),
        format: { style: 'decimal', decimals: 1, unit },
      },
    ],
    steps: [
      ...steps,
      { rule: true },
      {
        label: female ? 'Waist + hip − neck' : 'Waist − neck',
        value: circumference,
        format: { style: 'decimal', decimals: 2, unit: 'in' },
      },
      {
        label: 'log₁₀ of that circumference',
        value: Math.log10(circumference),
        format: { style: 'decimal', decimals: 4 },
      },
      {
        label: 'log₁₀ of height',
        value: Math.log10(heightIn),
        format: { style: 'decimal', decimals: 4 },
      },
      { rule: true },
      { label: 'Body fat', value: bodyFat, format: { style: 'percent', decimals: 1 } },
      { rule: true },
      { label: 'Body weight', value: weight, format: mass },
      { label: 'Fat mass = weight × body fat', value: fatMass, format: mass },
      { label: 'Lean mass = weight − fat mass', value: leanMass, format: mass },
    ],
    // The percentage split back into the two masses it describes. They sum to
    // the entered body weight, which is not the headline, hence `partsTotal`.
    parts: [
      { label: 'Fat mass', value: fatMass, format: mass },
      { label: 'Lean mass', value: leanMass, format: mass },
    ],
    partsTotal: { label: 'Body weight', value: weight, format: mass },
    notes: [
      'The Navy tape method estimates body fat to within about 3–4 percentage points of a DEXA scan. Measure at the same time of day, on bare skin, with the tape snug but not compressing.',
      female
        ? 'Women carry more essential fat than men, so a healthy female reading sits roughly 8–10 percentage points above the male figure for the same fitness level.'
        : 'The bands shown are the male reference ranges.',
    ],
  }
}

import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

/** Exact by international agreement. */
const KM_PER_MILE = 1.609344
/** US liquid gallon, exact: 231 in³. */
const LITRES_PER_US_GALLON = 3.785411784
/** Imperial gallon, exact by definition since 1985. ~20% larger than the US one. */
const LITRES_PER_IMPERIAL_GALLON = 4.54609

export default function compute(v: Values<typeof fields>): CalcResult {
  const { distance, efficiency, fuelPrice } = v
  // Selects arrive as strings; the derived Values type makes that explicit.
  const distanceUnit = v.distanceUnit
  const efficiencyUnit = v.efficiencyUnit
  const priceUnit = v.priceUnit

  if (!Number.isFinite(distance) || !(distance > 0))
    throw new CalcError('Enter a trip distance greater than 0.', 'distance')
  if (!Number.isFinite(efficiency) || !(efficiency > 0))
    throw new CalcError('Enter a fuel efficiency greater than 0.', 'efficiency')
  if (!Number.isFinite(fuelPrice) || fuelPrice < 0)
    throw new CalcError('Fuel price cannot be negative.', 'fuelPrice')

  // Normalise the trip to kilometres first, then to litres consumed.
  const distanceKm = distanceUnit === 'mi' ? distance * KM_PER_MILE : distance

  let litres: number
  if (efficiencyUnit === 'l100km') {
    litres = (distanceKm / 100) * efficiency
  } else if (efficiencyUnit === 'kmpl') {
    litres = distanceKm / efficiency
  } else if (efficiencyUnit === 'mpg' || efficiencyUnit === 'mpgImp') {
    const miles = distanceKm / KM_PER_MILE
    const litresPerGallon =
      efficiencyUnit === 'mpgImp' ? LITRES_PER_IMPERIAL_GALLON : LITRES_PER_US_GALLON
    litres = (miles / efficiency) * litresPerGallon
  } else {
    throw new CalcError('Choose a fuel efficiency unit.', 'efficiencyUnit')
  }

  // The pump quotes litres in most of the world and gallons in the US, so the
  // price is normalised the same way the distance and efficiency are, rather
  // than making the visitor divide by 3.785 in their head.
  let pricePerLitre: number
  if (priceUnit === 'perLitre') {
    pricePerLitre = fuelPrice
  } else if (priceUnit === 'perGallon') {
    pricePerLitre = fuelPrice / LITRES_PER_US_GALLON
  } else if (priceUnit === 'perImperialGallon') {
    pricePerLitre = fuelPrice / LITRES_PER_IMPERIAL_GALLON
  } else {
    throw new CalcError('Choose a fuel price unit.', 'priceUnit')
  }

  const priceUnitLabel =
    priceUnit === 'perGallon'
      ? 'US gallon'
      : priceUnit === 'perImperialGallon'
        ? 'imperial gallon'
        : 'litre'

  const cost = litres * pricePerLitre
  const roundTripCost = cost * 2
  // Everything below is expressed against the trip actually entered, so the
  // per-unit figures read in whichever unit the user chose.
  const costPerDistance = cost / distance
  const consumptionPer100Km = (litres / distanceKm) * 100
  const kmPerLitre = distanceKm / litres
  const mpg = distanceKm / KM_PER_MILE / (litres / LITRES_PER_US_GALLON)
  const mpgImperial = distanceKm / KM_PER_MILE / (litres / LITRES_PER_IMPERIAL_GALLON)
  const distanceUnitLabel = distanceUnit === 'mi' ? 'mile' : 'km'

  return {
    primary: { label: 'Trip fuel cost', value: cost, format: { style: 'currency' } },
    scaleValue: consumptionPer100Km,
    stats: [
      { label: 'Fuel used', value: litres, format: { style: 'decimal', decimals: 2, unit: 'L' } },
      {
        label: `Cost per ${distanceUnitLabel}`,
        value: costPerDistance,
        format: { style: 'currency', decimals: 3 },
      },
      { label: 'Round-trip cost', value: roundTripCost, format: { style: 'currency' } },
      {
        label: 'Consumption',
        value: consumptionPer100Km,
        format: { style: 'decimal', decimals: 2, unit: 'L/100km' },
      },
      // Named by the standard rather than three rows all called "Equivalent",
      // which were distinguishable only by the unit tacked onto the number.
      {
        label: 'Metric economy',
        value: kmPerLitre,
        format: { style: 'decimal', decimals: 2, unit: 'km/L' },
      },
      { label: 'US economy', value: mpg, format: { style: 'decimal', decimals: 1, unit: 'mpg' } },
      {
        label: 'Imperial economy',
        value: mpgImperial,
        format: { style: 'decimal', decimals: 1, unit: 'mpg' },
      },
    ],
    steps: [
      {
        label: 'Distance entered',
        value: distance,
        format: { style: 'decimal', decimals: 2, unit: distanceUnit === 'mi' ? 'mi' : 'km' },
      },
      { label: 'Distance in km', value: distanceKm, format: { style: 'decimal', decimals: 2, unit: 'km' } },
      { rule: true },
      {
        label: 'Efficiency as L/100 km',
        value: consumptionPer100Km,
        format: { style: 'decimal', decimals: 2, unit: 'L/100km' },
      },
      { label: 'Litres consumed', value: litres, format: { style: 'decimal', decimals: 3, unit: 'L' } },
      { rule: true },
      {
        label: `Price entered (per ${priceUnitLabel})`,
        value: fuelPrice,
        format: { style: 'currency', decimals: 3 },
      },
      // Only worth a line of its own when it differs from what was typed.
      ...(priceUnit === 'perLitre'
        ? []
        : [
            {
              label: 'Price per litre',
              value: pricePerLitre,
              format: { style: 'currency' as const, decimals: 3 },
            },
          ]),
      { label: 'Fuel cost one way', value: cost, format: { style: 'currency' } },
      { label: 'Fuel cost there and back', value: roundTripCost, format: { style: 'currency' } },
    ],
    // The two gallons are the classic trap here: the same car reads ~20% higher
    // on the imperial scale, so say which one is in play whenever mpg is chosen.
    notes:
      efficiencyUnit === 'mpg'
        ? [
            'This is US mpg (3.785 L per gallon). The same car reads about 20% higher in imperial mpg — switch the unit above if your figure came from the UK.',
          ]
        : efficiencyUnit === 'mpgImp'
          ? [
              'This is imperial mpg (4.546 L per gallon). The same car reads about 20% lower in US mpg — switch the unit above if your figure came from the US.',
            ]
          : [],
  }
}

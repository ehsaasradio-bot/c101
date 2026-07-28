import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its input type from
 * them without importing `index.ts` — which imports `compute.ts` and would cycle.
 *
 * `distance` is deliberately the first number field: the end-to-end test nudges
 * that field to 1.1x its default, and a longer trip is always valid input and
 * always moves the headline cost.
 */
export const fields = [
  {
    kind: 'number',
    id: 'distance',
    label: 'Trip distance',
    default: 100,
    min: 5,
    max: 100_000,
    step: 10,
    unit: 'km',
    variants: {
      on: 'distanceUnit',
      cases: {
        km: { min: 10, max: 5000, step: 10, unit: 'km' },
        mi: { min: 5, max: 3000, step: 5, unit: 'mi', factor: 0.621371192237334 },
      },
    },
    help: 'One-way distance. The round-trip figure is shown alongside.',
  },
  {
    kind: 'select',
    id: 'distanceUnit',
    label: 'Distance unit',
    default: 'km',
    options: [
      { value: 'km', label: 'Kilometres' },
      { value: 'mi', label: 'Miles' },
    ],
  },
  {
    kind: 'number',
    id: 'efficiency',
    label: 'Fuel efficiency',
    default: 8,
    min: 1,
    max: 400,
    step: 0.1,
    unit: 'L/100km',
    /*
     * Fuel economy inverts rather than scales: 8 L/100 km is 12.5 km/L, not a
     * multiple of 8. Consumption (litres per distance) and economy (distance
     * per volume) are reciprocals, so a `factor` cannot express this pair.
     *   km/L  = 100 / (L/100km)
     *   mpg   = 235.214583… / (L/100km)   [100 km/L × 3.785411784 L/gal ÷ 1.609344 km/mi]
     */
    variants: {
      on: 'efficiencyUnit',
      cases: {
        l100km: { min: 1.5, max: 30, step: 0.1, unit: 'L/100km' },
        kmpl: {
          min: 2,
          max: 60,
          step: 0.1,
          unit: 'km/L',
          convert: { kind: 'reciprocal', constant: 100 },
        },
        // 100 × litres-per-gallon ÷ 1.609344. The two gallons differ, so the
        // same car reads about 20% higher on the imperial scale.
        mpg: {
          min: 5,
          max: 140,
          step: 0.1,
          unit: 'mpg (US)',
          convert: { kind: 'reciprocal', constant: 235.21458333333334 },
        },
        mpgImp: {
          min: 6,
          max: 170,
          step: 0.1,
          unit: 'mpg (imp)',
          convert: { kind: 'reciprocal', constant: 282.48093633182214 },
        },
      },
    },
    help: 'Read it off the dashboard, or divide a full tank by the distance it covered.',
  },
  {
    kind: 'select',
    id: 'efficiencyUnit',
    label: 'Efficiency unit',
    default: 'l100km',
    options: [
      { value: 'l100km', label: 'L/100 km (lower is better)' },
      { value: 'kmpl', label: 'km/L (higher is better)' },
      { value: 'mpg', label: 'mpg, US gallons (higher is better)' },
      { value: 'mpgImp', label: 'mpg, imperial gallons (higher is better)' },
    ],
  },
  {
    kind: 'number',
    id: 'fuelPrice',
    label: 'Fuel price',
    default: 1.8,
    min: 0,
    max: 50,
    step: 0.01,
    unit: '/L',
    // A gallon price is simply litres-per-gallon × the per-litre price — an
    // ordinary linear pair, so switching restates the same pump price rather
    // than changing it. Both gallons are exact by definition.
    variants: {
      on: 'priceUnit',
      cases: {
        perLitre: { min: 0, max: 10, step: 0.01, unit: '/L' },
        perGallon: { min: 0, max: 40, step: 0.01, unit: '/gal (US)', factor: 3.785411784 },
        perImperialGallon: {
          min: 0,
          max: 50,
          step: 0.01,
          unit: '/gal (imp)',
          factor: 4.54609,
        },
      },
    },
    help: 'Enter it exactly as it appears on the pump, then pick the unit alongside.',
  },
  {
    kind: 'select',
    id: 'priceUnit',
    label: 'Price unit',
    default: 'perLitre',
    options: [
      { value: 'perLitre', label: 'Per litre' },
      { value: 'perGallon', label: 'Per US gallon' },
      { value: 'perImperialGallon', label: 'Per imperial gallon' },
    ],
  },
] as const satisfies readonly Field[]

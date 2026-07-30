import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * Eight inputs is the ceiling here, and rent-vs-buy has far more than eight
 * moving parts, so three of them are collapsed deliberately:
 *
 *  - property tax, insurance and maintenance become one "annual ownership costs"
 *    percentage of the home's value, which is how those three are quoted anyway;
 *  - the loan is a 30-year fixed and the comparison horizon is the same 30 years;
 *  - buying costs 2% of the price and selling costs 6% of the sale price.
 *
 * `compute.ts` states each of those in its notes rather than hiding them.
 *
 * The first number field is the one the end-to-end suite nudges to 1.1x its
 * default, so it has to tolerate that and still change the result. A 10% higher
 * home price against unchanged rent moves the break-even by years.
 */
export const fields = [
  {
    kind: 'number',
    id: 'homePrice',
    label: 'Home price',
    default: 400_000,
    min: 50_000,
    max: 2_000_000,
    step: 5000,
    unit: '$',
  },
  {
    kind: 'number',
    id: 'monthlyRent',
    label: 'Rent you pay instead',
    default: 2000,
    min: 200,
    max: 10_000,
    step: 25,
    unit: '$/mo',
    help: 'What a comparable place costs to rent today.',
  },
  {
    kind: 'number',
    id: 'downPayment',
    label: 'Down payment',
    default: 20,
    min: 0,
    max: 100,
    step: 1,
    unit: '%',
  },
  {
    kind: 'number',
    id: 'mortgageRate',
    label: 'Mortgage rate',
    default: 6.5,
    min: 0,
    max: 20,
    step: 0.125,
    unit: '%',
    help: '30-year fixed.',
  },
  {
    kind: 'number',
    id: 'rentIncrease',
    label: 'Rent rises by',
    default: 3,
    min: 0,
    max: 15,
    step: 0.1,
    unit: '%/yr',
  },
  {
    kind: 'number',
    id: 'homeAppreciation',
    label: 'Home appreciates by',
    default: 3.5,
    // Housing can and does fall; the model only breaks down at −100%.
    min: -5,
    max: 15,
    step: 0.1,
    unit: '%/yr',
  },
  {
    kind: 'number',
    id: 'annualCosts',
    label: 'Property tax, insurance & upkeep',
    default: 2.5,
    min: 0,
    max: 10,
    step: 0.1,
    unit: '%/yr',
    help: 'As a share of the home value each year. Roughly 1.1% tax + 0.4% insurance + 1% maintenance.',
  },
  {
    kind: 'number',
    id: 'investmentReturn',
    label: 'Return on cash you would invest',
    default: 5,
    min: 0,
    max: 15,
    step: 0.25,
    unit: '%/yr',
    help: 'What your down payment and closing costs would have earned elsewhere.',
  },
] as const satisfies readonly Field[]

import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its input type from
 * them without importing `index.ts` — which imports `compute.ts` and would cycle.
 *
 * `vehiclePrice` is deliberately first: the end-to-end suite nudges the first
 * number field to 1.1x its default, and a 10% pricier car must stay valid input
 * and move the monthly payment.
 */
export const fields = [
  {
    kind: 'number',
    id: 'vehiclePrice',
    label: 'Vehicle price',
    default: 30_000,
    // The floor has to leave something to finance after the default down payment
    // and trade-in, which `compute` rejects a loan without.
    min: 5000,
    max: 500_000,
    step: 500,
    unit: '$',
    help: 'Negotiated out-the-door price before tax, fees, and incentives.',
  },
  {
    kind: 'number',
    id: 'downPayment',
    label: 'Down payment',
    default: 3000,
    min: 0,
    max: 500_000,
    step: 250,
    unit: '$',
  },
  {
    kind: 'number',
    id: 'tradeInValue',
    label: 'Trade-in value',
    default: 2000,
    min: 0,
    max: 500_000,
    step: 250,
    unit: '$',
    help: 'Most states tax only the price left after the trade-in credit.',
  },
  {
    kind: 'number',
    id: 'salesTaxRate',
    label: 'Sales tax rate',
    default: 6.5,
    min: 0,
    max: 25,
    step: 0.1,
    unit: '%',
  },
  {
    kind: 'number',
    id: 'annualRate',
    label: 'Annual interest rate (APR)',
    default: 7.5,
    min: 0,
    max: 40,
    step: 0.05,
    unit: '%',
  },
  {
    kind: 'select',
    id: 'months',
    label: 'Loan term',
    default: '60',
    options: [
      { value: '24', label: '24 months' },
      { value: '36', label: '36 months' },
      { value: '48', label: '48 months' },
      { value: '60', label: '60 months' },
      { value: '72', label: '72 months' },
      { value: '84', label: '84 months' },
    ],
  },
] as const satisfies readonly Field[]

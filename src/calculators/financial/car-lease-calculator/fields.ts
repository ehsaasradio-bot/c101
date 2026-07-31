import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its input type from
 * them without importing `index.ts` — which imports `compute.ts` and would cycle.
 *
 * `capCost` is deliberately first: the end-to-end suite nudges the first number
 * field to 1.1x its default, and a 10% dearer car must stay valid input and move
 * the monthly payment. MSRP cannot take that slot, because it only feeds the
 * residual-share figure and would leave the headline unchanged.
 */
export const fields = [
  {
    kind: 'number',
    id: 'capCost',
    label: 'Negotiated price (capitalized cost)',
    default: 38_000,
    min: 1000,
    max: 500_000,
    step: 500,
    unit: '$',
    help: 'The price you actually agreed, plus any fees rolled into the lease. This, not MSRP, is what the payment is built from.',
  },
  {
    kind: 'number',
    id: 'msrp',
    label: 'Sticker price (MSRP)',
    default: 42_000,
    min: 1000,
    max: 500_000,
    step: 500,
    unit: '$',
    help: 'Used to express the residual as a percentage — the figure the bank publishes and the dealer quotes.',
  },
  {
    kind: 'number',
    id: 'downPayment',
    label: 'Cash down (cap cost reduction)',
    default: 2000,
    min: 0,
    max: 100_000,
    step: 250,
    unit: '$',
    help: 'Comes straight off the capitalized cost. It is not equity — it is prepaid depreciation.',
  },
  {
    kind: 'number',
    id: 'residualValue',
    label: 'Residual value at lease end',
    default: 24_500,
    min: 500,
    max: 500_000,
    step: 100,
    unit: '$',
    help: 'What the bank says the car will be worth when you hand it back. It is also your buyout price.',
  },
  {
    kind: 'number',
    id: 'moneyFactor',
    // 0.00125 is exactly 3% APR. Kept as the default so the page opens on the
    // conversion this calculator exists to expose.
    label: 'Money factor',
    default: 0.00125,
    min: 0,
    max: 0.01,
    step: 0.00005,
    help: 'Multiply by 2400 for the APR: 0.00125 is 3%. Some dealers quote it as "125" — that is the same number.',
  },
  {
    kind: 'select',
    id: 'term',
    label: 'Lease term',
    default: '36',
    options: [
      { value: '24', label: '24 months' },
      { value: '27', label: '27 months' },
      { value: '30', label: '30 months' },
      { value: '36', label: '36 months' },
      { value: '39', label: '39 months' },
      { value: '42', label: '42 months' },
      { value: '48', label: '48 months' },
    ],
  },
] as const satisfies readonly Field[]

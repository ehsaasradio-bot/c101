import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * `homePrice` is deliberately first: the end-to-end suite nudges the first
 * number field to 1.1x its default, and every cash figure here scales with the
 * price, so the result is guaranteed to move.
 */
export const fields = [
  {
    kind: 'number',
    id: 'homePrice',
    label: 'Home price',
    default: 400_000,
    // The slider is sized from the default (about 4x it), not from `max`, so the
    // whole 50k..2M band stays draggable here.
    min: 50_000,
    max: 2_000_000,
    step: 1000,
    unit: '$',
  },
  {
    kind: 'number',
    id: 'downPercent',
    label: 'Down payment',
    // 15% sits inside the 10-20% band rather than on a band edge, and below the
    // 20% threshold, so the default result exercises the PMI line.
    default: 15,
    min: 0,
    max: 100,
    step: 0.5,
    unit: '% of price',
    help: 'Reach 20% and private mortgage insurance drops away.',
  },
  {
    kind: 'number',
    id: 'closingCostPercent',
    label: 'Closing costs',
    default: 3,
    min: 0,
    max: 6,
    step: 0.1,
    unit: '% of price',
    help: 'Lender fees, title, transfer taxes and prepaid escrow. Usually 2-5%.',
  },
  {
    kind: 'number',
    id: 'movingCosts',
    label: 'Moving & setup costs',
    default: 3000,
    min: 0,
    max: 50_000,
    step: 500,
    unit: '$',
    help: 'Movers, immediate repairs, furnishings — cash you need that is not part of closing.',
  },
  {
    kind: 'number',
    id: 'cashOnHand',
    label: 'Cash saved so far',
    default: 20_000,
    min: 0,
    max: 500_000,
    step: 1000,
    unit: '$',
  },
  {
    kind: 'number',
    id: 'monthlySaving',
    label: 'Saving per month',
    default: 1200,
    // Not 0: the shortfall is divided by this and the slider's left end is one
    // drag away. The minimum matches the step so it reads naturally.
    min: 50,
    max: 20_000,
    step: 50,
    unit: '$/mo',
  },
  {
    kind: 'number',
    id: 'rate',
    label: 'Mortgage interest rate',
    default: 6.5,
    min: 0,
    max: 20,
    step: 0.125,
    unit: '%',
  },
  {
    kind: 'select',
    id: 'years',
    label: 'Loan term',
    default: '30',
    options: [
      { value: '30', label: '30 years' },
      { value: '20', label: '20 years' },
      { value: '15', label: '15 years' },
      { value: '10', label: '10 years' },
    ],
  },
] as const satisfies readonly Field[]

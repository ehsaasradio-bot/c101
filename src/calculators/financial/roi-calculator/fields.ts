import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its input type from
 * them without importing `index.ts` — which imports `compute.ts` and would cycle.
 *
 * `initialInvestment` is deliberately first: it is the denominator of every
 * figure this calculator returns, so nudging it always moves the headline ROI.
 */
export const fields = [
  {
    kind: 'number',
    id: 'initialInvestment',
    label: 'Initial investment',
    default: 10_000,
    min: 100,
    max: 10_000_000,
    step: 100,
    unit: '$',
    help: 'The total amount of capital you put in at the start.',
  },
  {
    kind: 'number',
    id: 'finalValue',
    label: 'Final value',
    default: 15_000,
    min: 0,
    max: 10_000_000,
    step: 100,
    unit: '$',
    help: 'What the investment is worth today, including any cash taken out.',
  },
  {
    kind: 'number',
    id: 'years',
    label: 'Holding period',
    default: 5,
    min: 0.5,
    max: 100,
    step: 0.5,
    unit: 'years',
  },
  {
    kind: 'number',
    id: 'fees',
    label: 'Fees and costs',
    default: 200,
    min: 0,
    max: 1_000_000,
    step: 50,
    unit: '$',
    help: 'Commissions, management fees, taxes — anything the return has to cover.',
  },
] as const satisfies readonly Field[]

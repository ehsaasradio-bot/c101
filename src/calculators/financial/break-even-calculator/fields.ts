import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its input type from
 * them without importing `index.ts` — which imports `compute.ts` and would cycle.
 *
 * `fixedCosts` is deliberately first: break-even units scale linearly with it,
 * so nudging it always moves the headline number and can never turn a valid
 * input invalid (the contribution margin does not depend on it).
 */
export const fields = [
  {
    kind: 'number',
    id: 'fixedCosts',
    label: 'Fixed costs',
    default: 50_000,
    min: 0,
    max: 1_000_000,
    step: 1000,
    unit: '$',
    help: 'Costs that do not change with volume: rent, salaries, insurance, software.',
  },
  {
    kind: 'number',
    id: 'pricePerUnit',
    label: 'Price per unit',
    default: 60,
    // Price must beat the variable cost per unit or every sale loses money, so the
    // floor sits one step above that field's default.
    min: 36,
    max: 10_000,
    step: 1,
    unit: '$',
  },
  {
    kind: 'number',
    id: 'variableCostPerUnit',
    label: 'Variable cost per unit',
    default: 35,
    min: 0,
    max: 10_000,
    step: 1,
    unit: '$',
    help: 'Cost incurred for each unit sold: materials, packaging, shipping, card fees.',
  },
] as const satisfies readonly Field[]

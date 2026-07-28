import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its input type from
 * them without importing `index.ts` — which imports `compute.ts` and would cycle.
 *
 * Order matters: the first number field is nudged to 1.1x its default by the
 * end-to-end suite, so it must stay valid and must move the headline number.
 * `cash` does both — 1.1 x 15,000 is inside its min/max and adds 1,500 to net worth.
 */
export const fields = [
  {
    kind: 'number',
    id: 'cash',
    label: 'Cash & savings',
    default: 15_000,
    min: 0,
    max: 100_000_000,
    step: 500,
    unit: '$',
    help: 'Chequing, savings, money market, and cash on hand.',
  },
  {
    kind: 'number',
    id: 'investments',
    label: 'Investments & retirement',
    default: 85_000,
    min: 0,
    max: 100_000_000,
    step: 1000,
    unit: '$',
    help: 'Brokerage accounts, pensions, 401(k), IRA, ISA.',
  },
  {
    kind: 'number',
    id: 'propertyValue',
    label: 'Property market value',
    default: 320_000,
    min: 0,
    max: 100_000_000,
    step: 5000,
    unit: '$',
    help: 'What your home and any other real estate would sell for today.',
  },
  {
    kind: 'number',
    id: 'otherAssets',
    label: 'Other assets',
    default: 20_000,
    min: 0,
    max: 100_000_000,
    step: 500,
    unit: '$',
    help: 'Vehicles, business equity, valuables — resale value, not purchase price.',
  },
  {
    kind: 'number',
    id: 'mortgageBalance',
    label: 'Mortgage balance',
    default: 180_000,
    min: 0,
    max: 100_000_000,
    step: 5000,
    unit: '$',
    help: 'What you still owe, not the original loan amount.',
  },
  {
    kind: 'number',
    id: 'otherDebts',
    label: 'Other debts',
    default: 20_000,
    min: 0,
    max: 100_000_000,
    step: 500,
    unit: '$',
    help: 'Credit cards, car loans, student loans, personal loans.',
  },
] as const satisfies readonly Field[]

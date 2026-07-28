import type { Field } from '../../../lib/types'

export const fields = [
  {
    kind: 'number',
    id: 'originalPrice',
    label: 'Original price',
    default: 100,
    min: 1,
    max: 100_000,
    step: 1,
    unit: '$',
    help: 'The ticket price before any discount.',
  },
  {
    kind: 'number',
    id: 'discountPercent',
    label: 'Discount',
    default: 25,
    min: 0,
    max: 100,
    step: 1,
    unit: '%',
  },
  {
    kind: 'number',
    id: 'taxRate',
    label: 'Sales tax rate',
    default: 8.25,
    min: 0,
    max: 50,
    step: 0.25,
    unit: '%',
    help: 'Set to 0 if the price already includes tax.',
  },
  {
    kind: 'select',
    id: 'taxBasis',
    label: 'Tax is charged on',
    default: 'afterDiscount',
    options: [
      { value: 'afterDiscount', label: 'The discounted price (usual)' },
      { value: 'beforeDiscount', label: 'The original price' },
    ],
  },
] as const satisfies readonly Field[]

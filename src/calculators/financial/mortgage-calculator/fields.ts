import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its input type from
 * them without importing `index.ts` — which imports `compute.ts` and would cycle.
 * Every calculator follows this fields → compute → index chain.
 */
export const fields = [
  {
    kind: 'number',
    id: 'homePrice',
    label: 'Home price',
    default: 400_000,
    // A home price at the slider's left end still has to clear the default down
    // payment, which `compute` requires to be strictly smaller.
    min: 100_000,
    max: 2_000_000,
    step: 1000,
    unit: '$',
  },
  {
    kind: 'number',
    id: 'downPayment',
    label: 'Down payment',
    default: 80_000,
    min: 0,
    max: 1_000_000,
    step: 1000,
    unit: '$',
    help: 'Put down 20% or more to avoid PMI.',
  },
  {
    kind: 'number',
    id: 'rate',
    label: 'Annual interest rate',
    default: 6.5,
    min: 0,
    max: 30,
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
  {
    kind: 'number',
    id: 'propertyTax',
    label: 'Property tax',
    default: 4800,
    min: 0,
    max: 60_000,
    step: 100,
    unit: '$/yr',
  },
  {
    kind: 'number',
    id: 'insurance',
    label: 'Home insurance',
    default: 1800,
    min: 0,
    max: 20_000,
    step: 100,
    unit: '$/yr',
  },
] as const satisfies readonly Field[]

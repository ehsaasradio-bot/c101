import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its input type from
 * them without importing `index.ts` — which imports `compute.ts` and would cycle.
 *
 * `value` is deliberately the first (and only) number field: it scales every
 * output in every mode, so nudging it always moves the answer, and any positive
 * multiple of a valid measurement is itself a valid measurement.
 */
export const fields = [
  {
    kind: 'number',
    id: 'value',
    label: 'Known measurement',
    default: 10,
    min: 0.000001,
    max: 1_000_000_000,
    step: 0.1,
    help: 'The one circle measurement you already have. Must be greater than zero.',
  },
  {
    kind: 'select',
    id: 'knownAs',
    label: 'That measurement is the…',
    default: 'radius',
    options: [
      { value: 'radius', label: 'Radius' },
      { value: 'diameter', label: 'Diameter' },
      { value: 'circumference', label: 'Circumference' },
      { value: 'area', label: 'Area' },
    ],
  },
] as const satisfies readonly Field[]

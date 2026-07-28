import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its input type from
 * them without importing `index.ts` — which imports `compute.ts` and would cycle.
 *
 * `sideA` is deliberately first: it enters the hypotenuse, the area, the
 * perimeter and both angles, so nudging it always moves the primary answer.
 */
export const fields = [
  {
    kind: 'number',
    id: 'sideA',
    label: 'Leg a',
    default: 3,
    min: 0.000001,
    max: 1_000_000_000,
    step: 0.1,
    unit: 'units',
    help: 'One of the two sides that meet at the right angle. Must be greater than zero.',
  },
  {
    kind: 'number',
    id: 'sideB',
    label: 'Leg b',
    default: 4,
    min: 0.000001,
    max: 1_000_000_000,
    step: 0.1,
    unit: 'units',
    help: 'The other side touching the right angle. Use the same unit for both legs.',
  },
] as const satisfies readonly Field[]

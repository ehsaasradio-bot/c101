import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its input type from
 * them without importing `index.ts` — which imports `compute.ts` and would cycle.
 *
 * `valueA` is deliberately the first number field: it appears in every mode's
 * formula, so nudging it always moves the answer.
 */
export const fields = [
  {
    kind: 'select',
    id: 'mode',
    label: 'What do you want to work out?',
    default: 'of',
    options: [
      { value: 'of', label: 'What is A% of B?' },
      { value: 'isWhatPercent', label: 'A is what percent of B?' },
      { value: 'increase', label: 'B increased by A%' },
      { value: 'decrease', label: 'B decreased by A%' },
    ],
  },
  {
    kind: 'number',
    id: 'valueA',
    label: 'Value A',
    default: 25,
    min: -1_000_000_000,
    max: 1_000_000_000,
    step: 1,
    help: 'A percentage in every mode except "A is what percent of B?", where it is a plain amount.',
  },
  {
    kind: 'number',
    id: 'valueB',
    label: 'Value B',
    default: 200,
    min: -1_000_000_000,
    max: 1_000_000_000,
    step: 1,
    help: 'The base amount the percentage is applied to or measured against.',
  },
] as const satisfies readonly Field[]

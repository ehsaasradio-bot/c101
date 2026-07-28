import type { Field } from '../../../lib/types'

/**
 * One text field, deliberately. A list of observations has no fixed arity, so a
 * grid of number inputs would cap the data set at whatever count we guessed.
 * `compute.ts` derives its input type from this module (never from `index.ts`,
 * which imports compute and would cycle).
 */
export const fields = [
  {
    kind: 'text',
    id: 'numbers',
    label: 'Numbers',
    default: '12, 15, 18, 22, 30',
    placeholder: '12, 15, 18, 22, 30',
    help: 'Separate values with commas, spaces, or new lines. Negatives and decimals are fine.',
  },
] as const satisfies readonly Field[]

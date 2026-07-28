import type { Field } from '../../../lib/types'

/**
 * `oldValue` is deliberately first: the end-to-end test nudges the first number
 * field to 1.1x its default, and 55 is both valid (non-zero) and produces a
 * different percentage change than 50 does.
 */
export const fields = [
  {
    kind: 'number',
    id: 'oldValue',
    label: 'Original value',
    default: 50,
    min: -1_000_000_000,
    max: 1_000_000_000,
    step: 1,
    help: 'The starting number. It cannot be zero — percentage change is undefined from zero.',
  },
  {
    kind: 'number',
    id: 'newValue',
    label: 'New value',
    default: 75,
    min: -1_000_000_000,
    max: 1_000_000_000,
    step: 1,
    help: 'The number you are comparing back to the original.',
  },
] as const satisfies readonly Field[]

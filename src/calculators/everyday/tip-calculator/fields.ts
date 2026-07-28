import type { Field } from '../../../lib/types'

/**
 * `billAmount` is deliberately first: the end-to-end test nudges the first
 * number field to 1.1x its default, and that value must stay valid and must
 * move the per-person result.
 */
export const fields = [
  {
    kind: 'number',
    id: 'billAmount',
    label: 'Bill amount',
    default: 85,
    min: 0,
    max: 1_000_000,
    step: 1,
    unit: '$',
    help: 'The pre-tip total on the check.',
  },
  {
    kind: 'number',
    id: 'tipPercent',
    label: 'Tip percentage',
    default: 18,
    min: 0,
    max: 100,
    step: 1,
    unit: '%',
    help: '15–20% is the usual range for table service in the US.',
  },
  {
    kind: 'number',
    id: 'people',
    label: 'Number of people',
    default: 2,
    min: 1,
    max: 100,
    step: 1,
  },
  {
    kind: 'toggle',
    id: 'roundUp',
    label: 'Round each share up to a whole amount',
    default: false,
  },
] as const satisfies readonly Field[]

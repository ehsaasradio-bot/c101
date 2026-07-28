import type { Field } from '../../../lib/types'

/**
 * `age` is deliberately first: it is the field the end-to-end suite nudges to
 * 1.1x its default, and 33 is still a perfectly ordinary age that moves the
 * maximum heart rate (190 -> 187) rather than tripping a validation error.
 */
export const fields = [
  {
    kind: 'number',
    id: 'age',
    label: 'Age',
    default: 30,
    min: 10,
    max: 100,
    step: 1,
    unit: 'years',
  },
  {
    kind: 'number',
    id: 'restingHeartRate',
    label: 'Resting heart rate',
    default: 60,
    min: 25,
    max: 120,
    step: 1,
    unit: 'bpm',
    help: 'Measure your pulse for a full minute before getting out of bed.',
  },
] as const satisfies readonly Field[]

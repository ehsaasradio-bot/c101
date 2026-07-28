import type { Field } from '../../../lib/types'

/**
 * `distance` is deliberately first: the end-to-end test nudges the first number
 * field to 1.1x its default, and distance both stays inside its own min/max at
 * 5.5 and moves the primary result (pace = time ÷ distance).
 */
export const fields = [
  {
    kind: 'number',
    id: 'distance',
    label: 'Distance',
    default: 5,
    // Union of the two variants below; the control shows whichever the unit
    // select currently holds, so 100 km and 62 mi describe the same ceiling.
    min: 0.01,
    max: 100,
    step: 0.01,
    unit: 'km',
    variants: {
      on: 'distanceUnit',
      cases: {
        km: { min: 0.01, max: 100, step: 0.01, unit: 'km' },
        mi: { min: 0.01, max: 62, step: 0.01, unit: 'mi', factor: 0.621371192237334 },
      },
    },
  },
  {
    kind: 'select',
    id: 'distanceUnit',
    label: 'Distance unit',
    default: 'km',
    options: [
      { value: 'km', label: 'Kilometres' },
      { value: 'mi', label: 'Miles' },
    ],
  },
  {
    kind: 'number',
    id: 'hours',
    label: 'Hours',
    default: 0,
    min: 0,
    max: 99,
    step: 1,
    unit: 'h',
  },
  {
    kind: 'number',
    id: 'minutes',
    label: 'Minutes',
    default: 25,
    min: 0,
    max: 59,
    step: 1,
    unit: 'min',
  },
  {
    kind: 'number',
    id: 'seconds',
    label: 'Seconds',
    default: 0,
    min: 0,
    max: 59,
    step: 1,
    unit: 's',
    help: 'Enter the finishing time as hours, minutes and seconds.',
  },
] as const satisfies readonly Field[]

import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * The defaults are caffeine, deliberately: 100 mg, a half-life of about 5 hours,
 * 10 hours later. That is exactly two half-lives, so the default page shows the
 * clean 25 that anyone can check in their head — and all four modes agree on the
 * same picture, because {100, 25, 10, 5} satisfies 25 = 100 x (1/2)^(10/5)
 * exactly in binary floating point.
 *
 * `initialAmount` is deliberately the first NUMBER field: the end-to-end suite
 * nudges that one to 1.1x its default, and 100 -> 110 is still an ordinary decay
 * (25 becomes 27.5) in the default "remaining" mode, so the nudge proves the
 * island recomputed rather than tripping a validation error. `mode` is a select
 * and is skipped by the nudge, so it can sit first where it belongs.
 *
 * Every amount and time minimum is 0.1 rather than 0, because compute divides by
 * the half-life and takes the logarithm of an amount ratio. Every number field
 * renders as a slider, so the left end is one drag away; a min of 0 would be a
 * control that offers a value the calculator has to refuse.
 *
 * Every default sits on `min + n * step`, which an HTML range snaps to:
 * (100 - 0.1) / 0.1 = 999, (25 - 0.1) / 0.1 = 249, (10 - 0.1) / 0.1 = 99 and
 * (5 - 0.1) / 0.1 = 49.
 *
 * `softRange` sizes the visible track from the default rather than the declared
 * max, so these read as roughly 0-400, 0-100, 0-40 and 0-20 on screen with the
 * full validated range still typeable. That is what keeps carbon-14's 5,730 and
 * caffeine's 5 in the same form without one of them pinning the thumb to the far
 * left.
 */
export const fields = [
  {
    kind: 'select',
    id: 'mode',
    label: 'Solve for',
    default: 'remaining',
    options: [
      { value: 'remaining', label: 'Remaining amount' },
      { value: 'halfLife', label: 'Half-life' },
      { value: 'time', label: 'Elapsed time' },
      { value: 'initial', label: 'Initial amount' },
    ],
    help: 'Exponential decay ties four quantities together. Give any three and this returns the fourth.',
  },
  {
    kind: 'number',
    id: 'initialAmount',
    label: 'Initial amount (N0)',
    default: 100,
    min: 0.1,
    max: 100_000,
    step: 0.1,
    help: 'How much you started with, in any unit you like — mg, grams, atoms, becquerels, percent. Only the ratio to the remaining amount matters.',
  },
  {
    kind: 'number',
    id: 'remainingAmount',
    label: 'Remaining amount (N)',
    default: 25,
    min: 0.1,
    max: 100_000,
    step: 0.1,
    help: 'How much is left, in the same unit. It can never exceed the initial amount, and it never reaches zero in finite time.',
  },
  {
    kind: 'select',
    id: 'timeUnit',
    label: 'Time unit',
    default: 'hours',
    options: [
      { value: 'seconds', label: 'Seconds' },
      { value: 'minutes', label: 'Minutes' },
      { value: 'hours', label: 'Hours' },
      { value: 'days', label: 'Days' },
      { value: 'years', label: 'Years' },
    ],
    help: 'Labels only. The elapsed time and the half-life must be in the same unit, and the answer comes back in it.',
  },
  {
    kind: 'number',
    id: 'elapsedTime',
    label: 'Elapsed time (t)',
    default: 10,
    min: 0.1,
    max: 100_000,
    step: 0.1,
    help: 'How long the decay has been running, in the unit chosen above.',
  },
  {
    kind: 'number',
    id: 'halfLife',
    label: 'Half-life (T)',
    default: 5,
    min: 0.1,
    max: 100_000,
    step: 0.1,
    help: 'How long it takes for half of whatever is present to disappear — a constant, independent of how much you started with.',
  },
] as const satisfies readonly Field[]

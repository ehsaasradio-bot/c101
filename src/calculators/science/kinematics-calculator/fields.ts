import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * ── Why all five quantities get a permanent box ──────────────────────────────
 *
 * There is no per-mode field visibility in this codebase: every field declared
 * here is rendered whatever `solveFor` holds. So each of the five SUVAT
 * quantities keeps its own input, and `compute` reads only the three the chosen
 * mode needs, naming them explicitly in its steps. Switching modes therefore
 * never throws away a number you already typed.
 *
 * ── The defaults are ONE journey, not five unrelated numbers ─────────────────
 *
 * u = 5 m/s, a = 2 m/s², t = 10 s, and therefore
 *
 *     v = u + a·t          = 5 + 20   = 25 m/s
 *     s = u·t + ½·a·t²     = 50 + 100 = 150 m
 *
 * which is consistent with the timeless form too: v² = u² + 2·a·s gives
 * 625 = 25 + 600. Every mode agrees at the defaults, so the page reads as one
 * worked example however you choose to enter it.
 *
 * ── Ordering ────────────────────────────────────────────────────────────────
 *
 * `solveFor` is first because it decides which of the boxes below are read.
 *
 * `initialVelocity` is deliberately the FIRST NUMBER field: the end-to-end suite
 * sets that field to 1.1× its default and requires a valid, DIFFERENT result. A
 * default of 0 would be immune to a multiplication, so it is 5, and the default
 * mode (displacement) reads it — 5.5 m/s gives 155 m rather than 150.
 *
 * ── Bounds ──────────────────────────────────────────────────────────────────
 *
 * `acceleration` spans −100 to 100 so deceleration is one drag away rather than
 * something you have to know to type. Braking, free fall measured downwards and
 * a rocket losing speed are all ordinary uses of this page.
 *
 * `time` cannot start at 0: solving for acceleration divides by it, and a
 * journey of no duration is not one. 0.1 s is the smallest the slider offers,
 * matching its own step.
 *
 * `displacement` starts at 0 rather than going negative. It is read only when
 * solving for time, where it is how far the object travels along its line of
 * motion; a negative target under a positive velocity and acceleration is never
 * reached at all, so putting it on a slider would offer an unanswerable
 * question. Typed negatives are still answered — with a plain "never reached".
 *
 * Every default lands on the `min + n × step` grid an HTML range snaps to:
 * (5 − −1000)/0.1, (2 − −100)/0.1, (10 − 0.1)/0.1, (25 − −1000)/0.1 and
 * (150 − 0)/0.5 are all integers.
 */
export const fields = [
  {
    kind: 'select',
    id: 'solveFor',
    label: 'What do you want to find?',
    default: 'displacement',
    options: [
      { value: 'displacement', label: 'Displacement (s)' },
      { value: 'finalVelocity', label: 'Final velocity (v)' },
      { value: 'acceleration', label: 'Acceleration (a)' },
      { value: 'time', label: 'Time (t)' },
    ],
    help: 'Each mode reads three of the five boxes and works out the rest. Boxes a mode does not use are ignored, so whatever they hold cannot stop it answering.',
  },
  {
    kind: 'number',
    id: 'initialVelocity',
    label: 'Initial velocity (u)',
    default: 5,
    min: -1000,
    max: 1000,
    step: 0.1,
    unit: 'm/s',
    help: 'Speed at the moment the clock starts, in metres per second. Negative means it is already moving the other way. Read by every mode.',
  },
  {
    kind: 'number',
    id: 'acceleration',
    label: 'Acceleration (a)',
    default: 2,
    min: -100,
    max: 100,
    step: 0.1,
    unit: 'm/s²',
    help: 'Rate of change of velocity, assumed constant throughout. Negative is deceleration. For an object falling freely near the Earth, use 9.8 measured downwards.',
  },
  {
    kind: 'number',
    id: 'time',
    label: 'Time (t)',
    default: 10,
    min: 0.1,
    max: 1000,
    step: 0.1,
    unit: 's',
    help: 'How long the motion lasts, in seconds. Read when solving for displacement, final velocity or acceleration.',
  },
  {
    kind: 'number',
    id: 'finalVelocity',
    label: 'Final velocity (v)',
    default: 25,
    min: -1000,
    max: 1000,
    step: 0.1,
    unit: 'm/s',
    help: 'Speed at the end of the interval. Read only when solving for acceleration; every other mode works it out for you.',
  },
  {
    kind: 'number',
    id: 'displacement',
    label: 'Displacement (s)',
    default: 150,
    min: 0,
    max: 10_000,
    step: 0.5,
    unit: 'm',
    help: 'How far the object travels along its line of motion. Read only when solving for time; every other mode works it out for you.',
  },
] as const satisfies readonly Field[]

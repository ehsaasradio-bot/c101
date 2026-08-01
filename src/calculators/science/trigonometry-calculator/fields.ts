import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * `mode` says which direction you are working in: from an angle to its six
 * ratios, or from a ratio back to the angle. Every box keeps its own value
 * whatever the mode, so switching direction never throws away what you typed.
 *
 * The defaults are one consistent fact rather than four unrelated numbers:
 * sin 30° = 0.5, so `angle: 30` and `ratio: 0.5` describe the same point on the
 * unit circle, and the arcsin mode returns exactly the angle the default mode
 * started from.
 *
 * `angle` is deliberately the first NUMBER field: the end-to-end suite nudges it
 * to 1.1x its default and expects a different but still valid answer. 30 becomes
 * 33, and sin 33° = 0.544639 — well inside the domain and plainly different from
 * 0.5.
 */
export const fields = [
  {
    kind: 'select',
    id: 'mode',
    label: 'Which do you know?',
    default: 'ratios',
    options: [
      { value: 'ratios', label: 'The angle — find its six ratios' },
      { value: 'arcsin', label: 'The sine — find the angle (arcsin)' },
      { value: 'arccos', label: 'The cosine — find the angle (arccos)' },
      { value: 'arctan', label: 'The tangent — find the angle (arctan)' },
    ],
    help: 'The inverse modes read the ratio box instead of the angle box, then report all six ratios for the angle they found.',
  },
  {
    kind: 'select',
    id: 'angleUnit',
    label: 'Angle unit',
    default: 'degrees',
    options: [
      { value: 'degrees', label: 'Degrees (°)' },
      { value: 'radians', label: 'Radians (rad)' },
      { value: 'gradians', label: 'Gradians (grad)' },
    ],
    help: 'A full turn is 360°, 2π rad, or 400 grad. Switching converts the angle already typed rather than reinterpreting it.',
  },
  {
    kind: 'number',
    id: 'angle',
    label: 'Angle θ',
    default: 30,
    // The union across the three variants: the widest number any of them
    // offers is the 400 grad of a full turn.
    min: -400,
    max: 400,
    step: 1,
    unit: '°',
    variants: {
      on: 'angleUnit',
      cases: {
        // Degrees is the base, so its factor is 1 and omitted. Every other
        // factor is "value in this unit ÷ the same angle in degrees": one
        // degree is π/180 rad and 10/9 grad.
        degrees: { min: -360, max: 360, step: 1, unit: '°' },
        radians: {
          min: -6.283185307179586,
          max: 6.283185307179586,
          step: 0.01,
          unit: 'rad',
          factor: Math.PI / 180,
        },
        gradians: { min: -400, max: 400, step: 1, unit: 'grad', factor: 10 / 9 },
      },
    },
    help: 'One full turn either way. Anything outside it is reduced to a coterminal angle, so 400° is answered as 40°.',
  },
  {
    kind: 'number',
    id: 'ratio',
    label: 'Ratio',
    default: 0.5,
    // The union across the variants below. A tangent has no upper limit at all;
    // ±20 already reaches within three degrees of vertical, and the number box
    // still takes anything typed into it.
    min: -20,
    max: 20,
    step: 0.01,
    variants: {
      on: 'mode',
      // No conversion declared on any case, deliberately. This is a converter's
      // input: choosing arccos instead of arcsin means the number entered is a
      // different ratio of a different pair of sides, not the same quantity
      // restated, so converting it would make the selector feel broken. What
      // does move is the accepted range — a sine or a cosine never leaves −1 to
      // 1, while a tangent runs away to infinity.
      cases: {
        ratios: { min: -1, max: 1, step: 0.01 },
        arcsin: { min: -1, max: 1, step: 0.01 },
        arccos: { min: -1, max: 1, step: 0.01 },
        arctan: { min: -20, max: 20, step: 0.01 },
      },
    },
    help: 'Read by the inverse modes only. Sine and cosine live in −1 to 1; a tangent has no limit.',
  },
] as const satisfies readonly Field[]

import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * `value` is a TEXT field, and that is the whole point of the page rather than
 * an implementation detail. 0.004500 and 0.0045 are the same number and NOT the
 * same measurement: the first claims four significant figures, the second two.
 * A number input cannot tell them apart, because a double has no memory of the
 * zeros it was written with — `Number('0.004500')` is 0.0045 and printing it
 * gives 0.0045 back without them. So the digits arrive here as the visitor typed
 * them, and every rule below is applied to that string.
 *
 * `sigFigs` is the only number field, which makes it the one the end-to-end
 * suite nudges to 1.1x its default. 10 -> 11 is a whole number inside the range
 * and rounds 0.004500 to a genuinely different string, so the nudge proves the
 * island recomputed. A default whose 1.1x lands on a fraction — 5 -> 5.5 —
 * would be refused instead, since half a significant figure is not a thing.
 *
 * The slider covers 1..15 end to end: `softRange` sizes the track at
 * niceCeil(10 x 4) = 50, which the declared max of 15 then caps, so the whole
 * useful range is one drag away.
 */
export const fields = [
  {
    kind: 'select',
    id: 'mode',
    label: 'What to work out',
    default: 'round',
    options: [
      { value: 'round', label: 'Round to a number of significant figures' },
      { value: 'count', label: 'Count the significant figures' },
    ],
  },
  {
    kind: 'text',
    id: 'value',
    label: 'Number, exactly as written',
    default: '0.004500',
    placeholder: '0.004500',
    help: 'Type every digit you wrote down — trailing zeros change the answer. Scientific notation such as 4.500e-3 works too.',
  },
  {
    kind: 'number',
    id: 'sigFigs',
    label: 'Significant figures to keep',
    default: 10,
    // A slider spans these, so both ends must be values compute accepts: one
    // figure is a legitimate rounding, and 15 is about where a double stops
    // holding digits at all.
    min: 1,
    max: 15,
    step: 1,
    help: 'How many significant figures to round to. Ignored when you are only counting.',
  },
] as const satisfies readonly Field[]

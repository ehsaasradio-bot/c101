import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * The two selects come first because they are the actual question: order and
 * repetition between them pick which of the four standard formulas applies, and
 * a visitor who gets that choice wrong gets a confidently wrong number.
 *
 * `n` is deliberately the first NUMBER field. The end-to-end suite nudges that
 * field to 1.1x its default, and 10 x 1.1 = 11 — still a whole number, which
 * matters because non-integer inputs are rejected here rather than rounded.
 *
 * Every default sits on `min + k x step`, so no slider starts between notches.
 */
export const fields = [
  {
    kind: 'select',
    id: 'order',
    label: 'Does the order of the picks matter?',
    default: 'ignored',
    options: [
      { value: 'ignored', label: 'No — a set, so ABC is the same pick as CBA (combination)' },
      { value: 'matters', label: 'Yes — a sequence, so ABC differs from CBA (permutation)' },
    ],
    help: 'A lottery draw ignores order. A gold, silver and bronze podium does not.',
  },
  {
    kind: 'select',
    id: 'repetition',
    label: 'Can the same item be picked more than once?',
    default: 'no',
    options: [
      { value: 'no', label: 'No — each item can be used at most once' },
      { value: 'yes', label: 'Yes — items go back in the pool after each pick' },
    ],
    help: 'Drawing balls without replacement is "no". The digits of a PIN is "yes".',
  },
  {
    kind: 'number',
    id: 'n',
    label: 'Items to choose from (n)',
    default: 10,
    min: 1,
    max: 1000,
    step: 1,
    help: 'The size of the pool. Whole numbers only — half an item cannot be chosen.',
  },
  {
    kind: 'number',
    id: 'r',
    label: 'Items being chosen (r)',
    default: 3,
    min: 0,
    max: 1000,
    step: 1,
    help: 'How many you pick. Asking for more than n without repetition is allowed — the answer is simply zero ways.',
  },
] as const satisfies readonly Field[]

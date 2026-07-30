import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * `probA` is deliberately the first number field: it appears in every figure the
 * calculator reports, so the end-to-end nudge to 1.1x its default always moves
 * the answer, and 30 × 1.1 = 33 stays comfortably inside 0–100.
 *
 * Every default sits on `min + n × step`, so no control starts between notches.
 */
export const fields = [
  {
    kind: 'select',
    id: 'relationship',
    label: 'How are the two events related?',
    default: 'independent',
    options: [
      { value: 'independent', label: 'Independent — one does not affect the other' },
      { value: 'exclusive', label: 'Mutually exclusive — they cannot both happen' },
    ],
    help: 'This assumption changes the answer: independent events can overlap, mutually exclusive ones never do.',
  },
  {
    kind: 'number',
    id: 'probA',
    label: 'Probability of event A',
    default: 30,
    min: 0,
    max: 100,
    step: 1,
    unit: '%',
    help: 'The chance A happens on one try, from 0% (impossible) to 100% (certain).',
  },
  {
    kind: 'number',
    id: 'probB',
    label: 'Probability of event B',
    default: 20,
    min: 0,
    max: 100,
    step: 1,
    unit: '%',
    help: 'The chance B happens on one try. Mutually exclusive events cannot add to more than 100% between them.',
  },
  {
    kind: 'number',
    id: 'trials',
    label: 'Number of independent trials',
    default: 10,
    min: 1,
    max: 100,
    step: 1,
    help: 'How many times the experiment is repeated, for the "at least once" figures. Decimals are rounded.',
  },
] as const satisfies readonly Field[]

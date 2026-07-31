import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * The marks list is ONE text field on purpose: a syllabus has no fixed number of
 * graded items and there is no repeating-field support here, so a grid of number
 * inputs would cap the course at whatever count we guessed. `kind: 'text'`
 * renders as a SINGLE-LINE input, so the help text cannot promise "one per
 * line" — a column pasted out of a spreadsheet arrives with its newlines already
 * flattened to spaces. The parser therefore anchors on the colon rather than on
 * any one separator, which is what keeps `Midterm 1: 84, 20` in one piece.
 *
 * `finalWeight` is the first NUMBER field, which is the one the end-to-end suite
 * nudges to 1.1x its default: 30 becomes 33, still inside 1–100, and the
 * required score genuinely moves because the final's share of the course grows.
 */
export const fields = [
  {
    kind: 'text',
    id: 'marks',
    label: 'Marks so far',
    default: 'Homework: 88, 15; Quizzes: 79, 15; Midterm 1: 84, 20; Midterm 2: 76, 20',
    placeholder: 'Homework: 88, 15; Midterm: 84, 20',
    help: 'One entry per graded item, written as "Name: score, weight" and separated by semicolons. Both numbers are percentages — the score you got, then how much of the course it is worth. A bare list of "score weight" pairs such as "88 15, 79 15" also works.',
  },
  {
    kind: 'number',
    id: 'finalWeight',
    label: 'Weight of the final exam',
    default: 30,
    // Not 0: the final's weight is the divisor in the inversion, so a zero
    // weight makes the question unanswerable rather than merely extreme.
    min: 1,
    max: 100,
    step: 1,
    unit: '%',
    help: 'How much of the whole course grade the final exam is worth.',
  },
  {
    kind: 'number',
    id: 'targetGrade',
    label: 'Grade you want in the course',
    default: 85,
    min: 0,
    max: 100,
    step: 1,
    unit: '%',
    help: 'The overall course grade you are aiming to finish with.',
  },
] as const satisfies readonly Field[]

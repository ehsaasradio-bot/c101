import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * The course list is ONE text field on purpose. A semester has no fixed number
 * of courses and there is no repeating-field support here, so a grid of inputs
 * would cap the transcript at whatever count we guessed. `kind: 'text'` renders
 * as a SINGLE-LINE input, so the help text cannot promise "one per line" — a
 * column pasted out of a spreadsheet arrives with its newlines already
 * flattened to spaces. The parser therefore anchors on the colon rather than on
 * any separator, which is what keeps `Organic Chemistry: A, 4` in one piece.
 *
 * `priorGpa` is the first NUMBER field, which is the one the end-to-end suite
 * nudges to 1.1x its default: 3.42 becomes 3.762, still inside 0–5, and the
 * cumulative headline genuinely moves because `priorCredits` defaults above 0.
 */
export const fields = [
  {
    kind: 'text',
    id: 'courses',
    label: 'Courses',
    default:
      'Organic Chemistry: A-, 4; Honors Calculus II: B+, 4; English Composition: A, 3; Intro Psychology: B, 3; Spanish II: A, 3',
    placeholder: 'Biology: A, 4; English: B+, 3',
    help: 'One entry per course, written as "Name: grade, credit hours" and separated by semicolons or commas. Credit hours may be left off, in which case the course counts as 1. A bare list such as "A 4, B+ 3" also works.',
  },
  {
    kind: 'select',
    id: 'scaleType',
    label: 'Grade scale',
    default: 'unweighted',
    options: [
      { value: 'unweighted', label: 'Unweighted (4.0 scale)' },
      { value: 'weighted', label: 'Weighted (5.0 scale, AP and honours)' },
    ],
    help: 'On the weighted scale a course whose name contains AP or IB earns +1.0 and one containing Honors earns +0.5. A failing grade is never bonused.',
  },
  {
    kind: 'number',
    id: 'priorGpa',
    label: 'GPA before this term',
    default: 3.42,
    // 5.0 is the top of the weighted scale, so one bound serves both cases.
    min: 0,
    max: 5,
    step: 0.01,
    help: 'Your cumulative GPA so far. Set the credits below to 0 if this is your first term.',
  },
  {
    kind: 'number',
    id: 'priorCredits',
    label: 'Credits earned before this term',
    default: 30,
    min: 0,
    max: 300,
    step: 1,
    unit: 'cr',
  },
] as const satisfies readonly Field[]

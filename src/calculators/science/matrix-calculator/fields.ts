import type { Field } from '../../../lib/types'

/**
 * Two selects and two text fields, and deliberately no number field at all.
 *
 * A matrix has no arity a grid of number inputs could capture without guessing —
 * nine inputs for a 3 × 3 that sit empty for a 2 × 2, and a rebuild the day
 * someone wants 4 × 4. `average-calculator` reaches the same conclusion for a
 * list of observations. The consequence is worth stating plainly: with no number
 * field, the end-to-end suite's nudge test and its negative-value validation
 * test both skip this page, and it gets no one-line Quicky row on the homepage.
 * That is the trade, made knowingly.
 *
 * `size` is not decoration. It is what lets a matrix pasted as a flat run of
 * values — which is what a single-line input receives when a spreadsheet column
 * loses its newlines — be reshaped into rows rather than rejected.
 */
export const fields = [
  {
    kind: 'select',
    id: 'operation',
    label: 'Operation',
    default: 'determinant',
    options: [
      { value: 'determinant', label: 'Determinant of A' },
      { value: 'inverse', label: 'Inverse of A' },
      { value: 'transpose', label: 'Transpose of A' },
      { value: 'multiply', label: 'Multiply A × B' },
      { value: 'add', label: 'Add A + B' },
      { value: 'subtract', label: 'Subtract A − B' },
    ],
    help: 'Determinant, inverse and transpose use matrix A alone.',
  },
  {
    kind: 'select',
    id: 'size',
    label: 'Matrix size',
    default: '2x2',
    options: [
      { value: '2x2', label: '2 × 2' },
      { value: '3x3', label: '3 × 3' },
    ],
    help: 'Both matrices are read at this size, so changing it means retyping them.',
  },
  {
    kind: 'text',
    id: 'matrixA',
    label: 'Matrix A',
    default: '4, 7; 2, 6',
    placeholder: '4, 7; 2, 6',
    help: 'Values separated by commas or spaces, rows separated by a semicolon. A plain run of four values is read as a 2 × 2.',
  },
  {
    kind: 'text',
    id: 'matrixB',
    label: 'Matrix B',
    default: '1, 0; 0, 1',
    placeholder: '1, 0; 0, 1',
    help: 'Used by add, subtract and multiply only. The default is the identity matrix.',
  },
] as const satisfies readonly Field[]

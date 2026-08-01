import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'matrix-calculator',
  category: 'science',
  title: 'Matrix Calculator',
  seoTitle: 'Matrix Calculator: Determinant, Inverse, Multiply, Transpose',
  description:
    'Determinant, inverse, transpose, product, sum or difference of a 2 x 2 or 3 x 3 matrix, with the cofactor expansion and the adjugate written out.',
  intro:
    'Enter a matrix as values separated by commas and rows separated by semicolons — 4, 7; 2, 6 — then pick an operation. The answer comes with the working: the determinant is expanded along the first row into its minors, and the inverse is built as the adjugate divided by that determinant, one cofactor at a time. Determinant, inverse and transpose read matrix A alone; add, subtract and multiply use both.',
  fields,
  resultLabel: 'Determinant of A',
  compute,
  faqs: [
    {
      q: 'How do you find the determinant of a 3 x 3 matrix?',
      a: 'Expand along the first row. Each entry is multiplied by the determinant of the 2 x 2 matrix left when you delete that entry’s own row and column — its minor — and the three terms alternate in sign: det A = a11·M11 − a12·M12 + a13·M13. This calculator lists each minor and each signed term separately, so you can check the arithmetic rather than take the total on trust. Any row or column works; expanding along one that contains a zero is how the work is kept short by hand.',
    },
    {
      q: 'Why does my matrix have no inverse?',
      a: 'Because its determinant is zero, which makes the matrix singular. The inverse is the adjugate divided by the determinant, so a determinant of zero asks you to divide by zero and there is no answer to give. Geometrically the matrix has collapsed space onto a line or a point, and no transformation can pull it back out again. It happens whenever one row is a multiple of another, or a combination of the others — [1, 2; 2, 4] is the smallest example.',
    },
    {
      q: 'What is the adjugate, and why divide by the determinant?',
      a: 'The adjugate is the transpose of the cofactor matrix: replace every entry by its signed minor, then flip the result across the diagonal. The reason it works is the identity A · adj(A) = (det A) · I — multiplying a matrix by its adjugate gives the identity scaled by the determinant. Dividing through by det A therefore leaves exactly the matrix that undoes A. The page shows every cofactor, then the division, then multiplies A by the result so you can watch the identity matrix come back.',
    },
    {
      q: 'Is A times B the same as B times A?',
      a: 'Usually not. Matrix multiplication is not commutative, because each entry of the product is a row of the first matrix dotted with a column of the second, and swapping the operands changes which row meets which column. Some pairs do commute — anything multiplied by the identity, and a matrix with its own inverse — so this calculator works out B x A alongside A x B and says plainly whether the two agree for the pair you entered.',
    },
    {
      q: 'How do I type a matrix into a single line?',
      a: 'Separate the values in a row with commas or spaces, and separate rows with a semicolon: 4, 7; 2, 6 is the 2 x 2 with 4 and 7 on the top row. Newlines work too, for anything pasted from a textarea. Square brackets are ignored rather than rejected, so the calculator’s own output pastes straight back in, and a flat run of four values with no separators at all is read as a 2 x 2 — which is what a spreadsheet column becomes once a single-line input flattens it.',
    },
    {
      q: 'What does the determinant actually mean?',
      a: 'It is the factor by which the matrix scales area, for a 2 x 2, or volume, for a 3 x 3. A determinant of 10 means the unit square is mapped to a shape of area 10. A negative determinant means the transformation also reverses orientation, turning the plane over. A determinant of zero means the output is flat — everything is squashed onto a line or a point — which is the same fact as the matrix having no inverse.',
    },
  ],
  related: ['quadratic-calculator', 'slope-calculator', 'average-calculator'],
  lastReviewed: '2026-08-01',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

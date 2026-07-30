import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'right-triangle-calculator',
  category: 'math',
  title: 'Right Triangle Calculator',
  seoTitle: 'Right Triangle Calculator: Hypotenuse, Area & Angles',
  description:
    'Enter the two legs of a right triangle to get the hypotenuse, area, perimeter and both acute angles in degrees, with every step shown.',
  intro:
    'A right triangle is fixed entirely by its two legs: the Pythagorean theorem gives the hypotenuse, half their product gives the area, and the arctangent of their ratio gives the acute angles. Enter leg a and leg b to see all of it, along with the arithmetic behind each figure.',
  fields,
  resultLabel: 'Hypotenuse',
  faqs: [
    {
      q: 'How do I find the hypotenuse from the two legs?',
      a: 'Square each leg, add the squares, and take the square root: c = √(a² + b²). With legs of 3 and 4 that is √(9 + 16) = √25 = 5, the classic 3-4-5 triangle used by builders to check a square corner.',
    },
    {
      q: 'How are the acute angles calculated?',
      a: 'The angle opposite leg a satisfies tan(A) = a ÷ b, so A = atan(a ÷ b) converted from radians to degrees. The other acute angle is simply 90° − A, because the three angles of any triangle add to 180° and one of them is already the right angle.',
    },
    {
      q: 'Why is the area just a × b ÷ 2?',
      a: 'The two legs meet at 90°, so they act as the base and the height directly with no extra trigonometry needed. Two identical right triangles glued along the hypotenuse form a rectangle of area a × b, and each triangle is half of it.',
    },
    {
      q: 'What if I know the hypotenuse and only one leg?',
      a: 'Rearrange the same theorem: the missing leg is √(c² − a²). Work that out first, then enter the two legs here to get the area, the perimeter and both angles. The hypotenuse must be longer than the leg, or no such triangle exists.',
    },
    {
      q: 'Do the legs have to be in any particular unit?',
      a: 'No, but both legs must use the same unit. The hypotenuse and perimeter then come back in that unit, the area in that unit squared, and the angles in degrees regardless of the length unit you chose.',
    },
  ],
  related: ['circle-calculator', 'quadratic-calculator', 'percentage-calculator', 'slope-calculator', 'volume-calculator'],
  compute,
  lastReviewed: '2026-07-27',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

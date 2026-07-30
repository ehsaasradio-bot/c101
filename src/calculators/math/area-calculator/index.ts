import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'area-calculator',
  category: 'math',
  title: 'Area Calculator',
  seoTitle: 'Area Calculator: Square Feet, Square Metres and Acres',
  description:
    'Find the area of a rectangle, triangle, circle, trapezoid, parallelogram or ellipse, converted into square feet, square metres, acres and more.',
  intro:
    'Pick a shape, enter its dimensions in whatever unit you measured with, and this applies the standard formula for that shape — length times width for a rectangle, pi times the radius squared for a circle, the mean of the two parallel sides times the height for a trapezoid. The same area is then reported in square metres, square feet, square yards, square inches, acres and hectares, so a room measured in feet can be read off in square metres and a plot measured in metres can be read off in acres.',
  fields,
  resultLabel: 'Area',
  compute,
  faqs: [
    {
      q: 'How do I work out the square footage of a room?',
      a: 'Measure the length and the width in feet, choose "Rectangle or square" and "Feet", and enter them as a and b. The area is length times width — a room 16 ft by 12 ft is 192 square feet. For an L-shaped or otherwise irregular room, split it into rectangles on paper, run each rectangle through separately, and add the answers together.',
    },
    {
      q: 'Which boxes do I fill in for each shape?',
      a: 'Every input stays on screen whichever shape you pick, so the working under the result always names what each number was read as. Rectangle: a is the length and b the width. Triangle and parallelogram: a is the base and b the perpendicular height. Circle: a is the radius and nothing else is used. Trapezoid: a and b are the two parallel sides and h is the distance between them. Ellipse: a and b are the two semi-axes, which is to say half the long width and half the short width.',
    },
    {
      q: 'How many square feet are in an acre?',
      a: 'Exactly 43,560. An acre is defined as 4,840 square yards, and a yard is exactly 0.9144 metres, so an acre is 4,046.8564224 square metres and a square foot is 0.09290304 square metres — divide one by the other and 43,560 falls out with no rounding. A hectare is a round 10,000 square metres, which works out at about 2.4711 acres.',
    },
    {
      q: 'Is the height of a triangle the same as its slanted side?',
      a: 'No, and it is the most common mistake here. The height must be perpendicular to the base: the straight-line distance from the base to the opposite vertex, measured at a right angle. A slanted side is always longer than that perpendicular distance, so using it inflates the area. The same applies to a parallelogram, where the height is the gap between the two parallel sides rather than the length of the sloping edge.',
    },
    {
      q: 'Why does the area not change when I switch the unit?',
      a: 'Because the dimensions are restated rather than reinterpreted. A room that is 16 feet long is 4.8768 metres long, so switching the unit selector to metres rewrites 16 as 4.8768 and the physical area stays exactly the same — only the number and the label on the headline change. If you want to enter a genuinely different measurement, change the unit first and then type the new figures.',
    },
    {
      q: 'What is the formula for the area of an ellipse?',
      a: 'Pi times the two semi-axes multiplied together, or pi times a times b. A circle is the special case where the two semi-axes are equal, which collapses the formula to pi times the radius squared. So an oval 6 units across one way and 4 units across the other has semi-axes of 3 and 2, and an area of 6 pi, about 18.85 square units.',
    },
  ],
  // Slugs, never hrefs. Every one must resolve or the conformance suite fails.
  related: ['circle-calculator', 'right-triangle-calculator', 'unit-converter-calculator'],
  lastReviewed: '2026-07-30',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

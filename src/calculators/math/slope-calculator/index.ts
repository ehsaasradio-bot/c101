import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'slope-calculator',
  category: 'math',
  title: 'Slope Calculator',
  seoTitle: 'Slope Calculator: Slope, Grade, Angle and Line Equation',
  description:
    'Find the slope between two points, with the line equation, y-intercept, angle, distance, midpoint, and the percentage grade and ratio builders use.',
  intro:
    'The slope between two points is the rise divided by the run: (y₂ − y₁) ÷ (x₂ − x₁). Enter both points to get that number along with the line in y = mx + b form, its y-intercept, its angle of inclination, the distance and midpoint between the points, and the same steepness expressed as a percentage grade and a rise:run ratio. Points sharing an x coordinate give a vertical line, whose slope is undefined rather than infinite, and that is reported as an answer here rather than an error.',
  fields,
  resultLabel: 'Slope',
  faqs: [
    {
      q: 'How do I calculate the slope between two points?',
      a: 'Subtract to get the rise and the run, then divide: m = (y₂ − y₁) ÷ (x₂ − x₁). From (4, 5) to (12, 11) the rise is 6 and the run is 8, so the slope is 6 ÷ 8 = 0.75. The order of the points does not matter, because swapping them flips the sign of both the rise and the run.',
    },
    {
      q: 'What is the slope of a vertical line?',
      a: 'It is undefined, not infinite and not an error. Both points share the same x coordinate, so the run is zero and rise ÷ run divides by zero, which has no value. A vertical line also cannot be written as y = mx + b; its equation is x = a constant, such as x = 4. Its angle of inclination is still exactly 90°, and the distance and midpoint are still ordinary numbers.',
    },
    {
      q: 'Is a horizontal line the same as a vertical one?',
      a: 'No, and confusing the two is the usual mistake. A horizontal line has a rise of zero and a non-zero run, so the division is perfectly ordinary and the slope is exactly 0. Its equation is y = a constant and its angle is 0°. Only the vertical case, where the run is zero, is undefined.',
    },
    {
      q: 'How do I turn a slope into a percentage grade or a ratio?',
      a: 'Multiply the slope by 100 for the grade, so a slope of 0.08 is an 8% grade — the number on a road sign. The ratio form writes the same steepness as rise:run in lowest terms, which is how ramps and roofs are specified: 1:12 is the usual maximum for a wheelchair ramp, and a roof described as 4:12 has a slope of 4 ÷ 12, about 0.333.',
    },
    {
      q: 'How is the angle of inclination worked out?',
      a: 'It is the arctangent of the slope, converted from radians to degrees: angle = atan(m). A slope of 1 gives exactly 45°, because rise and run are equal. Downhill lines have a negative slope and are reported here as a negative angle, so a slope of −1 is −45° rather than 135°.',
    },
    {
      q: 'What happens if I enter the same point twice?',
      a: 'You get an error, because two copies of one point do not pick out a line at all — infinitely many lines pass through a single point, and none of them is more correct than another. Move one of the coordinates and the calculator will answer.',
    },
  ],
  related: ['right-triangle-calculator', 'quadratic-calculator', 'ratio-calculator', 'distance-calculator'],
  compute,
  lastReviewed: '2026-07-30',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

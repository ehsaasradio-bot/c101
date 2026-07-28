import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'quadratic-calculator',
  category: 'math',
  title: 'Quadratic Equation Calculator',
  seoTitle: 'Quadratic Equation Calculator: Roots, Discriminant, Vertex',
  description:
    'Solve any quadratic equation ax² + bx + c = 0 with the quadratic formula. Shows real or complex roots, the discriminant, the vertex, and the axis of symmetry.',
  intro:
    'Enter the three coefficients of ax² + bx + c = 0 and the quadratic formula does the rest. The discriminant b² − 4ac decides the answer: positive gives two real roots, zero gives one repeated root, and negative gives a conjugate pair of complex roots.',
  fields,
  resultLabel: 'Roots',
  compute,
  faqs: [
    {
      q: 'What is the quadratic formula?',
      a: 'For ax² + bx + c = 0 with a not equal to 0, the solutions are x = (−b ± √(b² − 4ac)) ÷ (2a). The expression under the square root, b² − 4ac, is called the discriminant and it determines how many real solutions exist.',
    },
    {
      q: 'What does the discriminant tell you?',
      a: 'If b² − 4ac is positive the parabola crosses the x-axis twice, giving two distinct real roots. If it is exactly zero the parabola touches the axis at one point, a repeated root. If it is negative there is no real solution and the two roots form a complex conjugate pair.',
    },
    {
      q: 'Why must a not be zero?',
      a: 'With a = 0 the x² term disappears and bx + c = 0 is a linear equation, not a quadratic. The quadratic formula also divides by 2a, so a zero leading coefficient makes it undefined. This calculator reports an error instead of returning a meaningless number.',
    },
    {
      q: 'How do you find the vertex of a parabola?',
      a: 'The vertex sits on the axis of symmetry at x = −b ÷ (2a); substitute that back into the equation to get the y value. When a is positive the vertex is the lowest point of the curve, and when a is negative it is the highest point.',
    },
    {
      q: 'What are complex roots written like?',
      a: 'They are written in the form p + qi, where i is the square root of −1. The two roots always come as a matching pair such as −1 + 2i and −1 − 2i, sharing the same real part −b ÷ (2a) and equal but opposite imaginary parts.',
    },
  ],
  related: ['right-triangle-calculator', 'percentage-calculator', 'gcd-lcm-calculator'],
  lastReviewed: '2026-07-27',
  priority: 0.6,
} satisfies CalculatorDef<typeof fields>

export default def

import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'ratio-calculator',
  category: 'math',
  title: 'Ratio Calculator',
  seoTitle: 'Ratio Calculator: Simplify Ratios and Solve for X',
  description:
    'Simplify a ratio to its lowest terms and solve the proportion A : B = C : X for the missing value, with the decimal form and percentage split.',
  intro:
    'Enter a known ratio A : B and one term of a second ratio. This calculator reduces A : B by its greatest common divisor and cross-multiplies to solve A : B = C : X, so X = B × C ÷ A. It also shows the ratio as a decimal and as a percentage split of the whole.',
  fields,
  resultLabel: 'Missing term X',
  compute,
  faqs: [
    {
      q: 'How do you simplify a ratio?',
      a: 'Divide both terms by their greatest common divisor. For 18 : 24 the GCD is 6, so the ratio reduces to 3 : 4. Decimal terms are first scaled up to whole numbers — 1.5 : 2 becomes 15 : 20, which reduces to 3 : 4.',
    },
    {
      q: 'How do you solve a proportion for the missing term?',
      a: 'Two equivalent ratios cross-multiply: if A : B = C : X then A × X = B × C, so X = B × C ÷ A. With 3 : 4 = 9 : X, the missing term is 4 × 9 ÷ 3, which is 12.',
    },
    {
      q: 'What is the difference between a ratio and a fraction?',
      a: 'A ratio compares two parts to each other, while a fraction compares a part to the whole. The ratio 3 : 4 describes seven total parts, so as fractions of the whole the sides are 3/7 and 4/7, or about 42.9% and 57.1%.',
    },
    {
      q: 'Why must the first term be greater than zero?',
      a: 'Solving for X divides by term A, and dividing by zero is undefined, so a zero first term has no solution. A zero second term is also rejected because a side with no parts cannot hold a meaningful share of the whole.',
    },
  ],
  related: ['gcd-lcm-calculator', 'fraction-calculator', 'percentage-calculator'],
  lastReviewed: '2026-07-27',
  priority: 0.6,
} satisfies CalculatorDef<typeof fields>

export default def

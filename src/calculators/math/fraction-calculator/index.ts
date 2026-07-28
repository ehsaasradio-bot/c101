import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'fraction-calculator',
  category: 'math',
  title: 'Fraction Calculator',
  seoTitle: 'Fraction Calculator: Add, Subtract, Multiply & Divide',
  description:
    'Add, subtract, multiply or divide two fractions and see the answer reduced to lowest terms, plus the mixed number and decimal equivalents.',
  intro:
    'Enter two fractions and an operation. Addition and subtraction go over a common denominator, multiplication runs straight across, and division multiplies by the reciprocal. The answer is then reduced to lowest terms using the greatest common divisor of the top and bottom.',
  fields,
  resultLabel: 'Simplified fraction',
  compute,
  faqs: [
    {
      q: 'How do you add two fractions with different denominators?',
      a: 'Rewrite both fractions over a shared denominator, add the numerators, and simplify. Multiplying the two denominators always gives a workable common denominator, and reducing at the end removes any extra factor it introduced.',
    },
    {
      q: 'How do you divide one fraction by another?',
      a: 'Flip the second fraction and multiply. Dividing by 2/3 is the same as multiplying by 3/2, which is why the second fraction cannot be zero: its numerator would end up in the denominator of the answer.',
    },
    {
      q: 'What does simplifying a fraction actually do?',
      a: 'It divides the numerator and denominator by their greatest common divisor, found here with the Euclidean algorithm. The value is unchanged, so 10/20 and 1/2 are the same number written with different sized pieces.',
    },
    {
      q: 'Why can a denominator never be zero?',
      a: 'A fraction means division, and dividing by zero has no defined answer: no number multiplied by zero returns the numerator. The calculator rejects a zero denominator rather than showing an infinite or undefined result.',
    },
    {
      q: 'How do I turn an improper fraction into a mixed number?',
      a: 'Divide the numerator by the denominator. The whole-number part of that division becomes the leading number and the remainder stays over the original denominator, so 7/3 becomes 2 and 1/3.',
    },
  ],
  related: ['gcd-lcm-calculator', 'ratio-calculator', 'percentage-calculator'],
  lastReviewed: '2026-07-27',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

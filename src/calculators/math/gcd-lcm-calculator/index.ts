import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'gcd-lcm-calculator',
  category: 'math',
  title: 'GCD & LCM Calculator',
  seoTitle: 'GCD & LCM Calculator: Greatest Common Divisor',
  description:
    'Find the greatest common divisor and least common multiple of two whole numbers, with the full Euclidean algorithm and prime factorisation shown.',
  intro:
    'The greatest common divisor is the largest number that divides both of your inputs exactly, and the least common multiple is the smallest number both divide into. This calculator finds them with the Euclidean algorithm, then shows every division step and the prime factorisation behind the answer.',
  fields,
  resultLabel: 'Greatest common divisor',
  faqs: [
    {
      q: 'How does the Euclidean algorithm find the GCD?',
      a: 'It repeatedly replaces the larger number with the remainder of dividing it by the smaller one, because any common divisor of two numbers also divides their remainder. When the remainder reaches zero, the last non-zero value left is the greatest common divisor.',
    },
    {
      q: 'What is the relationship between the GCD and the LCM?',
      a: 'For any two integers, the GCD multiplied by the LCM equals the absolute value of their product. That identity is how this calculator derives the LCM: it divides the product of the two numbers by the GCD it has just found.',
    },
    {
      q: 'What does it mean for two numbers to be coprime?',
      a: 'Two numbers are coprime, or relatively prime, when their greatest common divisor is 1 — they share no prime factor at all. Coprime numbers have the largest possible LCM for their size, because their LCM is simply their product.',
    },
    {
      q: 'Can I use zero or negative numbers?',
      a: 'Yes, with one exception. Signs are ignored, since a number and its negative have exactly the same divisors, and the GCD of zero and any number n is n itself. Only the pair 0 and 0 is rejected, because every integer divides zero and no greatest divisor exists.',
    },
    {
      q: 'Why are decimal inputs rounded?',
      a: 'Divisibility is only defined for whole numbers: every non-zero decimal divides every other one evenly, so the greatest common divisor would be meaningless. Any value you type is rounded to the nearest integer before the algorithm runs.',
    },
  ],
  related: ['fraction-calculator', 'ratio-calculator', 'percentage-calculator'],
  compute,
  lastReviewed: '2026-07-27',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

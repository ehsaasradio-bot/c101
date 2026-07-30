import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'percentage-calculator',
  category: 'math',
  title: 'Percentage Calculator',
  seoTitle: 'Percentage Calculator: Percent Of, Increase & Decrease',
  description:
    'Work out what X% of a number is, what percent one number is of another, and any percentage increase or decrease, with every step shown.',
  intro:
    'Percent simply means "per hundred", so every percentage question reduces to multiplying or dividing by 100. Pick a mode, enter two numbers, and this calculator shows the answer along with the arithmetic that produced it.',
  fields,
  resultLabel: 'Result',
  faqs: [
    {
      q: 'How do I calculate a percentage of a number?',
      a: 'Divide the percentage by 100 and multiply by the number. For 25% of 200: 25 ÷ 100 = 0.25, and 0.25 × 200 = 50. That is exactly what the "What is A% of B?" mode does.',
    },
    {
      q: 'How do I work out what percent one number is of another?',
      a: 'Divide the part by the whole, then multiply by 100. If 30 people out of 120 replied, 30 ÷ 120 = 0.25, which is 25%. The whole cannot be zero, because nothing can be a share of nothing.',
    },
    {
      q: 'Why does a 10% rise followed by a 10% fall not return to the start?',
      a: 'Each percentage is taken from a different base. Raising 100 by 10% gives 110, but the 10% cut is then 11 rather than 10, leaving 99. Percentage changes multiply rather than add, so order and base always matter.',
    },
    {
      q: 'Can I use negative numbers in this calculator?',
      a: 'Yes. Negative percentages and negative bases are handled arithmetically, so a -20% increase is the same as a 20% decrease. Only a base of zero in the "A is what percent of B?" mode is rejected, since that division is undefined.',
    },
  ],
  related: ['percentage-change-calculator', 'discount-calculator', 'ratio-calculator', 'probability-calculator', 'gpa-calculator'],
  compute,
  lastReviewed: '2026-07-27',
  priority: 0.8,
} satisfies CalculatorDef<typeof fields>

export default def

import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'compound-interest-calculator',
  category: 'financial',
  title: 'Compound Interest Calculator',
  seoTitle: 'Compound Interest Calculator: Growth With Contributions',
  description:
    'See what your savings grow to with compound interest and monthly contributions. Choose annual, quarterly, monthly, or daily compounding.',
  intro:
    'Compound interest pays you interest on your interest, so a balance grows faster the longer it is left alone. Enter a starting balance, a rate, a time horizon, and any monthly contribution to see the final balance and how much of it is pure growth.',
  fields,
  resultLabel: 'Final balance',
  compute,
  scale: {
    min: 0,
    max: 200,
    unit: '% growth',
    // Total interest as a percentage of every dollar you actually put in.
    bands: [
      { id: 'neutral', label: 'Modest growth — under 25%', from: 0, to: 25 },
      { id: 'good', label: 'Solid growth — 25% to 75%', from: 25, to: 75 },
      { id: 'excellent', label: 'Compounding is doing the work — 75%+', from: 75, to: 200 },
    ],
  },
  faqs: [
    {
      q: 'What is compound interest?',
      a: 'Compound interest is interest calculated on your original balance plus all the interest already earned. Because each period starts from a larger balance, growth accelerates over time instead of staying flat like simple interest.',
    },
    {
      q: 'Does compounding frequency really matter?',
      a: 'Less than most people expect. At 7% a year, monthly compounding beats annual compounding by roughly 0.23 percentage points of effective yield, and daily adds only a sliver more. The rate itself and the number of years matter far more.',
    },
    {
      q: 'How are monthly contributions handled here?',
      a: 'They are treated as an ordinary annuity: each contribution arrives at the end of its month and then earns the same rate for the months remaining. The future value of that stream is added to the growth of your starting balance.',
    },
    {
      q: 'What is the rule of 72?',
      a: 'Divide 72 by your annual percentage rate to estimate the years needed to double your money. At 8% that is about nine years. It is an approximation, but a very quick sanity check on any long-run projection.',
    },
  ],
  related: ['savings-goal-calculator', 'retirement-calculator', 'inflation-calculator'],
  disclaimer: 'financial',
  lastReviewed: '2026-07-27',
  priority: 0.8,
} satisfies CalculatorDef<typeof fields>

export default def

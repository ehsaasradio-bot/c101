import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'inflation-calculator',
  category: 'financial',
  title: 'Inflation Calculator',
  seoTitle: 'Inflation Calculator: Future Cost & Purchasing Power',
  description:
    "See what today's money will cost in the future, and how much purchasing power inflation quietly erases over 5, 10, 20, or 30 years.",
  intro:
    'Inflation compounds, so a steady 3% a year is not 30% over a decade — it is about 34%. Enter an amount, an annual inflation rate, and a number of years to see both what that basket will cost later and what the same dollars will be worth in today’s money.',
  fields,
  resultLabel: 'Future cost',
  compute,
  scale: {
    min: 0,
    max: 100,
    unit: '% purchasing power lost',
    bands: [
      { id: 'excellent', label: 'Barely eroded — under 10%', from: 0, to: 10 },
      { id: 'good', label: 'Mild erosion — 10% to 25%', from: 10, to: 25 },
      { id: 'neutral', label: 'Noticeable — 25% to 40%', from: 25, to: 40 },
      { id: 'warn', label: 'Severe — 40% to 60%', from: 40, to: 60 },
      { id: 'critical', label: 'Money halved or worse — over 60%', from: 60, to: 100 },
    ],
  },
  faqs: [
    {
      q: 'How is the future cost of an amount calculated?',
      a: 'Future cost = amount × (1 + rate / 100) ^ years. Inflation compounds, so each year applies to the already-inflated price rather than to the original amount. At 3% for 20 years the multiplier is about 1.806.',
    },
    {
      q: 'What does purchasing power lost actually mean?',
      a: 'It is the share of value a fixed sum of money gives up if prices rise while it sits still. Dividing the amount by the price multiplier gives what those future dollars buy in today’s money; the gap between the two is the purchasing power lost.',
    },
    {
      q: 'Why does 3% inflation halve my money in about 23 years?',
      a: 'Because of compounding, a rate of r percent roughly halves purchasing power after 70 / r years — the rule of 70. At 3% that is about 23 years, at 5% about 14 years, and at 7% only a decade.',
    },
    {
      q: 'Does this calculator account for interest or investment returns?',
      a: 'No. It shows the effect of inflation alone on a fixed sum. To see whether savings outpace rising prices, compare this result with a compound interest projection, or use a return figure already adjusted for inflation.',
    },
  ],
  related: ['compound-interest-calculator', 'retirement-calculator', 'savings-goal-calculator'],
  disclaimer: 'financial',
  lastReviewed: '2026-07-27',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

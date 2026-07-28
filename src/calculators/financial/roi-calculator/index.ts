import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'roi-calculator',
  category: 'financial',
  title: 'ROI Calculator',
  seoTitle: 'ROI Calculator: Return on Investment & Annualized Rate',
  description:
    'Work out return on investment from what you put in, what it is worth now, and the fees — plus the annualized rate over your holding period.',
  intro:
    'Return on investment is net profit divided by what you invested. Enter the amount you put in, what the position is worth now, the fees it had to cover, and how long you held it to see both the total return and the annualized rate that makes different holding periods comparable.',
  fields,
  resultLabel: 'Return on investment',
  compute,
  scale: {
    min: -100,
    max: 200,
    unit: '% ROI',
    bands: [
      { id: 'critical', label: 'Loss — below 0%', from: -100, to: 0 },
      { id: 'warn', label: 'Barely ahead — 0% to 10%', from: 0, to: 10 },
      { id: 'neutral', label: 'Modest — 10% to 25%', from: 10, to: 25 },
      { id: 'good', label: 'Strong — 25% to 100%', from: 25, to: 100 },
      { id: 'excellent', label: 'Exceptional — 100% or more', from: 100, to: 200 },
    ],
  },
  faqs: [
    {
      q: 'How is ROI calculated?',
      a: 'ROI is net profit divided by the amount invested, expressed as a percentage: (final value − initial investment − fees) ÷ initial investment × 100. A $10,000 investment worth $15,000 after $200 of fees returns 48%.',
    },
    {
      q: 'What is the difference between ROI and annualized return?',
      a: 'ROI is the total return over the whole holding period, no matter how long that is. The annualized return spreads that same gain evenly across each year with compounding, which is the only fair way to compare a two-year holding against a ten-year one.',
    },
    {
      q: 'Should fees be included in an ROI calculation?',
      a: 'Yes. Commissions, management fees, and taxes come straight out of your return, so leaving them out overstates performance. This calculator subtracts them from the final value before working out profit.',
    },
    {
      q: 'What counts as a good ROI?',
      a: 'It depends entirely on the risk taken and how long the money was tied up. A broad stock index has historically returned roughly 7–10% a year before inflation, so compare your annualized figure — not the total ROI — against a benchmark of that kind.',
    },
  ],
  related: ['compound-interest-calculator', 'break-even-calculator', 'inflation-calculator'],
  disclaimer: 'financial',
  lastReviewed: '2026-07-27',
  priority: 0.8,
} satisfies CalculatorDef<typeof fields>

export default def

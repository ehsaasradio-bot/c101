import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'break-even-calculator',
  category: 'financial',
  title: 'Break-Even Calculator',
  seoTitle: 'Break-Even Calculator: Units, Revenue & Margin',
  description:
    'Find how many units you must sell to cover costs. Calculates break-even volume, break-even revenue, and contribution margin per unit and as a percent.',
  intro:
    'Break-even is the point where revenue exactly covers costs. Every unit you sell contributes its price minus its variable cost toward the fixed costs; divide fixed costs by that contribution margin and you have the number of units you need.',
  fields,
  resultLabel: 'Break-even volume',
  compute,
  scale: {
    min: 0,
    max: 100,
    unit: '% contribution margin',
    bands: [
      { id: 'critical', label: 'Very thin — under 20%', from: 0, to: 20 },
      { id: 'warn', label: 'Thin — 20% to 40%', from: 20, to: 40 },
      { id: 'neutral', label: 'Typical — 40% to 60%', from: 40, to: 60 },
      { id: 'good', label: 'Strong — 60% to 80%', from: 60, to: 80 },
      { id: 'excellent', label: 'Very strong — 80% and up', from: 80, to: 100 },
    ],
  },
  faqs: [
    {
      q: 'What is the break-even formula?',
      a: 'Break-even units = fixed costs ÷ (price per unit − variable cost per unit). The denominator is the contribution margin: the slice of each sale left over to pay down fixed costs once the variable cost of making that sale is covered.',
    },
    {
      q: 'What counts as a fixed cost versus a variable cost?',
      a: 'Fixed costs stay the same whether you sell one unit or a thousand — rent, salaried staff, insurance, software subscriptions. Variable costs are incurred per sale: materials, packaging, shipping, payment processing fees, and sales commissions.',
    },
    {
      q: 'Why must the price be higher than the variable cost?',
      a: 'If price is at or below variable cost, each additional sale loses money, so no volume ever covers the fixed costs and break-even does not exist. Raise the price or cut the per-unit cost before volume can help you.',
    },
    {
      q: 'How do I find break-even in revenue rather than units?',
      a: 'Divide fixed costs by the contribution margin ratio, which is the contribution margin per unit divided by the price. It gives the same answer as multiplying break-even units by price, and works when you only track totals rather than unit counts.',
    },
    {
      q: 'What happens after I pass break-even?',
      a: 'Fixed costs are already paid at that point, so every further unit adds its full contribution margin straight to operating profit. That is why profit grows faster than revenue once a business clears its break-even volume.',
    },
  ],
  related: ['roi-calculator', 'percentage-calculator', 'salary-calculator'],
  disclaimer: 'financial',
  lastReviewed: '2026-07-27',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

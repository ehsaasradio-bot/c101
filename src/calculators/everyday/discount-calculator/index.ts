import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'discount-calculator',
  category: 'everyday',
  title: 'Discount Calculator',
  seoTitle: 'Discount Calculator: Sale Price, Savings & Tax',
  description:
    'Work out the sale price after a percentage discount, how much you save, and what sales tax adds. Handles tax charged before or after the discount.',
  intro:
    'A percentage discount takes a slice off the ticket price: pay 100% minus the discount. Enter the original price and the percentage off to see the sale price, the amount saved, and the final total once sales tax is added.',
  fields,
  resultLabel: 'Final price',
  compute,
  scale: {
    min: 0,
    max: 100,
    unit: '% off',
    bands: [
      { id: 'neutral', label: 'Small — under 10% off', from: 0, to: 10 },
      { id: 'good', label: 'Solid — 10% to 25% off', from: 10, to: 25 },
      { id: 'excellent', label: 'Deep — 25% off or more', from: 25, to: 100 },
    ],
  },
  faqs: [
    {
      q: 'How do I calculate a percentage discount?',
      a: 'Multiply the original price by the discount percentage divided by 100 to get the amount off, then subtract it. A shortcut: 25% off means you pay 75% of the price, so multiply by 0.75 directly.',
    },
    {
      q: 'Is sales tax charged before or after the discount?',
      a: 'In most US states tax is charged on the price you actually pay, so a store discount lowers the tax too. Manufacturer coupons are the common exception, because the retailer is reimbursed and tax is often assessed on the full ticket price.',
    },
    {
      q: 'How do stacked discounts like 20% off plus an extra 10% work?',
      a: 'They multiply rather than add. Taking 20% off then 10% off leaves 0.8 x 0.9 = 0.72 of the price, which is 28% off in total, not 30%. Run this calculator twice, feeding the first sale price in as the second original price.',
    },
    {
      q: 'What discount equals buy one get one free?',
      a: 'BOGO free is 50% off across the two items, because you pay full price for one and nothing for the second. Buy one get one half off works out to 25% off the pair, since you save half of one item across two items.',
    },
  ],
  related: ['sales-tax-calculator', 'percentage-calculator', 'tip-calculator'],
  lastReviewed: '2026-07-27',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

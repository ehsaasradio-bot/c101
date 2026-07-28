import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'tip-calculator',
  category: 'everyday',
  title: 'Tip Calculator',
  seoTitle: 'Tip Calculator: Tip Amount, Total and Split Per Person',
  description:
    'Work out the tip, the total, and what each person owes. Enter the bill, a tip percentage, and party size, and optionally round every share up.',
  intro:
    'The tip is the bill multiplied by your chosen percentage, and the total is the two added together. Split that total by the number of people and you have each share — round it up to a whole amount if you want the arithmetic at the table to be easy.',
  fields,
  resultLabel: 'Each person pays',
  compute,
  faqs: [
    {
      q: 'How much should I tip?',
      a: 'In the United States, 15% to 20% of the pre-tax bill is the customary range for sit-down table service, with 20% treated as the normal figure for good service. Counter service, takeaway, and tipping customs elsewhere in the world differ widely.',
    },
    {
      q: 'Should I tip on the pre-tax or post-tax total?',
      a: 'Tipping on the pre-tax amount is the traditional and perfectly acceptable approach, since sales tax is not part of the service. Many people tip on the post-tax total simply because it is the number printed largest on the check; the difference is usually small.',
    },
    {
      q: 'How do I split a bill fairly when people ordered differently?',
      a: 'Split evenly only when the orders were roughly comparable. Otherwise total each person’s own items, then apply the same tip percentage to each subtotal so everyone contributes proportionally to what they actually ordered.',
    },
    {
      q: 'Why does rounding up change my tip percentage?',
      a: 'Rounding each share up to a whole currency unit adds a few cents or a few dollars to what the table hands over, and every extra unit lands in the tip. This calculator shows the resulting effective tip rate so you can see exactly what you ended up leaving.',
    },
  ],
  related: ['percentage-calculator', 'sales-tax-calculator', 'discount-calculator'],
  lastReviewed: '2026-07-27',
  priority: 0.8,
} satisfies CalculatorDef<typeof fields>

export default def

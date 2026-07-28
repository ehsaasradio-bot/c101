import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'sales-tax-calculator',
  category: 'financial',
  title: 'Sales Tax Calculator',
  seoTitle: 'Sales Tax Calculator: Add or Remove Tax From a Price',
  description:
    'Add sales tax to a price, or work backwards to pull the tax out of a tax-inclusive total. Shows the pre-tax amount, the tax, and the final total.',
  intro:
    'Sales tax is charged on top of the ticket price, so the amount you hand over is the price multiplied by one plus the rate. Enter a price and a rate to add tax, or switch to extract mode to split a receipt total back into its pre-tax amount and its tax.',
  fields,
  resultLabel: 'Sales tax',
  compute,
  faqs: [
    {
      q: 'How do I calculate sales tax on a price?',
      a: 'Multiply the pre-tax price by the tax rate expressed as a decimal. At an 8.25% rate a $100 item carries $8.25 of tax, giving a $108.25 total. The same works for any rate: divide the percentage by 100 first.',
    },
    {
      q: 'How do I find the tax inside a total that already includes it?',
      a: 'Divide the tax-inclusive total by one plus the rate to recover the pre-tax price, then subtract that from the total. A $108.25 receipt at 8.25% divides to $100.00 pre-tax, leaving $8.25 of tax.',
    },
    {
      q: 'Why not just multiply the total by the tax rate to get the tax?',
      a: 'Because the rate is applied to the pre-tax price, not to the total. Multiplying the total overstates the tax — at 8.25%, tax is 8.25% of the net but only about 7.62% of the gross, so the shortcut gives the wrong answer.',
    },
    {
      q: 'Why does my receipt differ by a cent from this calculator?',
      a: 'Retailers round tax to the nearest cent, and many round each line item or each taxable group separately before totalling. Those roundings accumulate, so a long receipt can drift a cent or two from a single calculation on the whole basket.',
    },
    {
      q: 'Is sales tax the same everywhere in a country?',
      a: 'Rarely. In the United States the combined rate stacks state, county, city, and special-district levies, and some goods such as groceries or prescription drugs are exempt or taxed at a reduced rate. Check the rate for the exact address of the sale.',
    },
  ],
  related: ['discount-calculator', 'tip-calculator', 'percentage-calculator'],
  disclaimer: 'financial',
  lastReviewed: '2026-07-27',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

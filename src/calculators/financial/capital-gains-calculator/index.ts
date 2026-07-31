import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

/*
 * The tax year is 2026 and it is stated in the copy as well as in `compute.ts`,
 * because a page of tax numbers with no year on it is worse than no page. When
 * the IRS publishes the 2027 revenue procedure, the thresholds in `compute.ts`,
 * the year in this copy, and `lastReviewed` all move together.
 */
const def = {
  slug: 'capital-gains-calculator',
  category: 'financial',
  title: 'Capital Gains Tax Calculator',
  seoTitle: 'Capital Gains Tax Calculator: 2026 Short vs Long-Term',
  description:
    'Work out 2026 federal capital gains tax on a sale and see the short-term and long-term bills side by side, whatever your holding period.',
  intro:
    'How long you held an asset decides which tax it meets. A short-term gain — one year or less — is taxed as ordinary income at your marginal rate, while a long-term gain is taxed at 0%, 15% or 20% depending on where it lands when stacked on top of your other taxable income. This works out tax year 2026 federal tax on one sale from the price, the cost basis, the selling costs, the days held, and your other income, and always shows both bills together so the cost of selling a day early is on the page.',
  fields,
  resultLabel: 'Federal capital gains tax',
  compute,
  faqs: [
    {
      q: 'What is the difference between short-term and long-term capital gains tax?',
      a: 'A gain on an asset held one year or less is short-term and taxed as ordinary income — up to 37% federal in 2026. Held more than one year it is long-term and taxed at 0%, 15% or 20%. A single filer with $85,000 of other income and a $19,500 gain owes $4,290 short-term but $2,925 long-term, so the same profit costs $1,365 less for waiting. The holding period runs from the day after you acquired the asset to the day you sold it, and the line is more than one year, not exactly one year.',
    },
    {
      q: 'What are the 2026 long-term capital gains rate thresholds?',
      a: 'From IRS Revenue Procedure 2025-32 section 4.03, "Maximum Capital Gains Rate", the 2026 maximum zero rate amount is $49,450 for a single filer, $98,900 married filing jointly, $49,450 married filing separately, and $66,200 head of household. The maximum 15% rate amount is $545,500 single, $613,700 married filing jointly, $306,850 married filing separately, and $579,600 head of household. Anything above the 15% figure is taxed at 20%. These are taxable-income thresholds, so the gain is measured after the standard deduction and stacked on top of your ordinary income.',
    },
    {
      q: 'Can a long-term gain ever be taxed more heavily than a short-term one?',
      a: 'Almost never, but there is one narrow window where it is. The 0% band for a single filer stops at $49,450 of taxable income while the ordinary 12% bracket runs to $50,400, so a gain landing in that $950 strip meets 15% as a long-term gain and only 12% as a short-term one. The same overlap exists for every filing status — $1,900 wide married filing jointly, $1,250 head of household. Everywhere else the long-term rate is lower, usually much lower.',
    },
    {
      q: 'What happens if I sell at a loss?',
      a: 'A loss is a real answer, not an error, and this calculator shows it as a negative tax — a reduction in your bill rather than a charge. Under IRC section 1211(b) a net capital loss offsets your capital gains in full, then up to $3,000 of ordinary income a year ($1,500 married filing separately), and anything left carries forward indefinitely to future years. The relief is the same whether the loss was short-term or long-term, because either way it comes off ordinary income at your marginal rate.',
    },
    {
      q: 'Does this include state tax or the 3.8% net investment income tax?',
      a: 'No. This is federal capital gains tax on a single sale and nothing else. Most states tax capital gains too, several of them at ordinary income rates. The 3.8% net investment income tax under IRC section 1411 applies on top once modified adjusted gross income passes $200,000 single or $250,000 married filing jointly, and that threshold is not inflation-adjusted. Wash sales, loss carryovers from earlier years, and netting this sale against your other gains and losses for the year are also outside what is modelled here.',
    },
    {
      q: 'Why does my other income change the tax on my gain?',
      a: 'Because the long-term rate brackets are read off total taxable income, not the gain in isolation. Your ordinary income fills the brackets first and the gain sits on top of it, so the same $19,500 gain is taxed at 0% for someone with $30,000 of other income and at 15% for someone with $85,000. That stacking is exactly what the IRS Qualified Dividends and Capital Gain Tax Worksheet does, and it is why a gain can straddle two rates at once.',
    },
    {
      q: 'Are all long-term gains taxed at 0%, 15% or 20%?',
      a: 'No — several asset types have their own rate and are not modelled here. Collectibles such as art, coins and precious metals are taxed up to 28%. Unrecaptured section 1250 gain on depreciated real estate is taxed up to 25%. A main home may qualify for the section 121 exclusion of $250,000 of gain ($500,000 married filing jointly), and qualified small business stock can be excluded entirely. Treat this as the ordinary-asset case: shares, funds, crypto and a second property.',
    },
  ],
  related: [
    'income-tax-calculator',
    'roi-calculator',
    'compound-interest-calculator',
    'net-worth-calculator',
  ],
  disclaimer: 'financial',
  lastReviewed: '2026-07-31',
  priority: 0.8,
} satisfies CalculatorDef<typeof fields>

export default def

import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

/**
 * What separates this page from `retirement-calculator` and `401k-calculator`
 * is that it is not really a projection at all. Those grow a pot; this one
 * answers a single question — Roth or traditional — and the honest answer is
 * that at the same tax rate the two are the same account wearing different
 * clothes. So the scale is the Roth's lead over an equal-cost traditional, which
 * depends on the two tax rates and on absolutely nothing else, and the
 * break-even retirement rate sits in the stats as the number the whole decision
 * turns on.
 *
 * The 2026 IRA contribution limit and the Roth phase-out ranges live in
 * `compute.ts` with their source; the tax year is repeated in the copy below so
 * a stale figure is visible on the page rather than buried in a constant.
 */
const def = {
  slug: 'roth-ira-calculator',
  category: 'financial',
  title: 'Roth IRA Calculator',
  seoTitle: 'Roth IRA Calculator: Roth vs Traditional Break-Even',
  description:
    'Compare a Roth IRA with a traditional IRA at the same gross cost, and find the retirement tax rate at which the two are worth exactly the same.',
  intro:
    'A Roth IRA is funded with money you have already paid tax on and comes out tax-free; a traditional IRA is deducted now and taxed on the way out. Which wins depends on one thing only: your tax rate today against your tax rate in retirement. At the same rate they are mathematically identical, and this page shows you the retirement rate at which they break even along with what each account is worth if your rate moves.',
  fields,
  resultLabel: 'Tax-free Roth balance at retirement',
  compute,
  scale: {
    min: -50,
    max: 100,
    unit: '% Roth advantage',
    // How far ahead the Roth finishes against a traditional funded from the same
    // gross pay. The ratio is (1 - rate now) / (1 - rate in retirement), so the
    // needle answers "which account", never "how much money" — the amount, the
    // return and the horizon all cancel out of it.
    bands: [
      { id: 'critical', label: 'Traditional clearly ahead', from: -50, to: -15 },
      { id: 'warn', label: 'Traditional ahead', from: -15, to: -2 },
      { id: 'neutral', label: 'Effectively a tie — your rates match', from: -2, to: 2 },
      { id: 'good', label: 'Roth ahead', from: 2, to: 15 },
      { id: 'excellent', label: 'Roth clearly ahead', from: 15, to: 100 },
    ],
  },
  faqs: [
    {
      q: 'Is a Roth IRA better than a traditional IRA?',
      a: 'Only if your tax rate in retirement is higher than it is today. Fund each account from the same gross pay and the Roth ends up ahead by exactly (1 minus your rate now) divided by (1 minus your rate in retirement). If those rates are equal the two accounts produce the same money to the cent, because taking the tax before growth and taking it after growth remove the same share. Neither the return you assume nor the number of years changes that.',
    },
    {
      q: 'What is the break-even retirement tax rate?',
      a: 'It is the rate at which the Roth and the traditional leave you with identical spendable money, and it is simply your current rate. Set the two rates equal on this page and the advantage falls to zero and the two curves lie on top of each other. Expect a higher rate later and the Roth wins; expect a lower one and the deduction is worth more.',
    },
    {
      q: 'Why compare gross cost instead of the same contribution?',
      a: 'Because putting 7,500 dollars into each account is not an equal sacrifice. The Roth deposit is made from take-home pay, so at a 22% rate it costs 9,615 dollars of gross pay; the traditional deposit of 7,500 dollars costs only 7,500 dollars of gross pay, and the tax you did not pay is still in your pocket. This page credits the traditional with the full gross amount so the two arms cost you the same. The equal-deposit figure is shown as a stat, and it flatters the Roth by construction.',
    },
    {
      q: 'How much can I put into a Roth IRA in 2026?',
      a: 'The IRA contribution limit is 7,500 dollars for the 2026 tax year, rising to 8,600 dollars from age 50, set by IRS Notice 2025-67 under section 219(b)(5). That is a combined limit across Roth and traditional IRAs, not one each. Because it is a cash figure rather than a pre-tax one, filling it with after-tax money shelters more, which is a genuine advantage for the Roth if you are contributing at the maximum.',
    },
    {
      q: 'Can I contribute to a Roth IRA at any income?',
      a: 'No. For 2026 the ability to contribute directly phases out between 153,000 and 168,000 dollars of modified adjusted gross income for single filers and heads of household, and between 242,000 and 252,000 dollars for married couples filing jointly, under section 408A(c)(3)(A) of IRS Notice 2025-67. Above the top of your range you cannot contribute directly at all, though a conversion from a traditional IRA is a separate route with its own tax consequences.',
    },
    {
      q: 'Will my tax rate really be lower in retirement?',
      a: 'Often, but by less than people assume in one direction and more in another. The rate you save today is your marginal rate, the tax on your last dollar of pay. In retirement your withdrawals fill the low brackets from the bottom up, so the effective rate on them is usually below your old marginal rate. Pulling the other way: a large traditional balance forces required minimum distributions from age 73, and Social Security becomes taxable as other income rises.',
    },
    {
      q: 'When can I take money out of a Roth IRA?',
      a: 'Your own contributions can be withdrawn at any time without tax or penalty, because the tax on them was settled at the outset. Earnings are different: they come out tax-free once you are 59 and a half and the account has been open five tax years. Withdraw earnings before both conditions are met and you owe income tax plus, in most cases, a 10% penalty.',
    },
  ],
  related: [
    'retirement-calculator',
    '401k-calculator',
    'compound-interest-calculator',
    'income-tax-calculator',
  ],
  disclaimer: 'financial',
  lastReviewed: '2026-07-31',
  priority: 0.9,
} satisfies CalculatorDef<typeof fields>

export default def

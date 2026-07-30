import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'debt-payoff-calculator',
  category: 'financial',
  title: 'Debt Payoff Calculator',
  seoTitle: 'Debt Payoff Calculator: Snowball vs Avalanche',
  description:
    'Compare the debt snowball and the debt avalanche on your own balances. See when you are debt-free either way, and what the cheaper order actually saves.',
  intro:
    'List every debt with its balance and rate, then say what you can put toward them each month. Both methods spend that same budget: the avalanche sends whatever is left after the minimums to the highest rate, the snowball to the smallest balance. This shows the payoff date and the total interest for each, so you can see exactly what choosing the motivating order costs you.',
  fields,
  resultLabel: 'Debt-free in',
  compute,
  scale: {
    min: 0,
    max: 120,
    clampMax: 120,
    unit: ' months',
    bands: [
      { id: 'excellent', label: 'Under a year', from: 0, to: 12 },
      { id: 'good', label: '1 to 2 years', from: 12, to: 24 },
      { id: 'neutral', label: '2 to 3 years', from: 24, to: 36 },
      { id: 'warn', label: '3 to 5 years', from: 36, to: 60 },
      { id: 'critical', label: 'Over 5 years', from: 60, to: 600 },
    ],
  },
  faqs: [
    {
      q: 'What is the difference between the debt snowball and the debt avalanche?',
      a: 'Both pay every minimum every month and throw the rest of the budget at one target debt. The avalanche targets the highest interest rate, which removes the most expensive dollar of debt first and therefore costs the least in total. The snowball targets the smallest balance, which clears whole accounts fastest. When the target is paid off, its minimum is freed and the surplus rolls onto the next debt in the same order.',
    },
    {
      q: 'If the avalanche is cheaper, why would anyone use the snowball?',
      a: 'Because the gap is usually smaller than people expect — often a few hundred dollars and a month or two across a whole plan — while the snowball produces a visible win far sooner. Research on repayment behaviour has repeatedly found that people who close small accounts early are more likely to stay with the plan at all. A method you abandon in month nine costs more than either order on paper, so compare the saving shown here against how much the early win is worth to you.',
    },
    {
      q: 'How are minimum payments worked out here?',
      a: 'If you type a minimum after the rate, that figure is used exactly — do that for car, student and personal loans, which have a fixed contractual payment. Otherwise the standard US credit card rule applies: 1% of the balance plus that month’s interest, with a $25 floor, capped at what is actually owed. Because minimums fall as balances fall, both plans keep spending your full budget every month; only the target changes.',
    },
    {
      q: 'Should I include a 0% balance or an interest-free medical bill?',
      a: 'Yes, and enter it at 0%. It changes the answer in an interesting way: the avalanche leaves it until last, because no interest is accruing, while the snowball may attack it first if the balance is small. That is often where most of the difference between the two methods comes from. If the 0% rate expires on a date, re-run this with the rate that follows it.',
    },
    {
      q: 'What does this not account for?',
      a: 'Fixed rates and no new spending on the accounts. It also ignores fees, late charges, and the daily compounding most card issuers actually use, so a real statement will differ by a few dollars a month. It does not consider balance transfers, consolidation loans, or whether an employer retirement match should come before any of this — it usually should.',
    },
  ],
  related: ['credit-card-payoff-calculator', 'loan-calculator', 'net-worth-calculator'],
  disclaimer: 'financial',
  lastReviewed: '2026-07-30',
  priority: 0.8,
} satisfies CalculatorDef<typeof fields>

export default def

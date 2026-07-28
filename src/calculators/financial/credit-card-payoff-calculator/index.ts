import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'credit-card-payoff-calculator',
  category: 'financial',
  title: 'Credit Card Payoff Calculator',
  seoTitle: 'Credit Card Payoff Calculator: Months and Interest',
  description:
    'See how long a fixed monthly payment takes to clear your credit card balance, and how much of that money goes to interest rather than the debt.',
  intro:
    'Each month your card charges interest on whatever is left, then your payment is applied. Enter the balance, the APR, and what you can pay every month to see the payoff date and the true cost of carrying the debt.',
  fields,
  resultLabel: 'Time to pay off',
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
      { id: 'critical', label: 'Over 5 years', from: 60, to: 1200 },
    ],
  },
  faqs: [
    {
      q: 'How is credit card interest calculated?',
      a: 'The card applies a monthly periodic rate — your APR divided by twelve — to the balance that is still outstanding, then subtracts your payment. Because the interest is charged before the payment lands, paying only a little means most of the money never touches the debt itself.',
    },
    {
      q: 'Why does paying the minimum take so long?',
      a: 'A typical minimum payment is around 1 to 2 percent of the balance plus interest, so it shrinks as the balance shrinks. That design keeps the debt alive for decades and can cost more in interest than the original purchases.',
    },
    {
      q: 'Does paying twice a month help?',
      a: 'Slightly, because most issuers accrue interest daily on the average balance, so money that arrives earlier in the cycle accrues less. The far bigger lever is the total amount you pay each month, not how you split it.',
    },
    {
      q: 'Should I pay the highest rate or the smallest balance first?',
      a: 'Paying the highest APR first — the avalanche method — always costs less in total interest. Paying the smallest balance first, the snowball method, clears individual cards sooner and some people find that motivation is worth the extra cost.',
    },
  ],
  related: ['loan-calculator', 'compound-interest-calculator', 'net-worth-calculator'],
  disclaimer: 'financial',
  lastReviewed: '2026-07-27',
  priority: 0.8,
} satisfies CalculatorDef<typeof fields>

export default def

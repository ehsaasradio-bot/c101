import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'budget-calculator',
  category: 'financial',
  title: 'Budget Calculator',
  seoTitle: 'Budget Calculator: Check Your 50/30/20 Split',
  description:
    'Compare your monthly spending against the 50/30/20 rule and see exactly how many dollars in each category are above or below the guideline.',
  intro:
    'The 50/30/20 rule splits take-home pay three ways: no more than 50% to needs, no more than 30% to wants, and at least 20% to savings and extra debt repayment. Enter your income and your monthly outgoings to see the shares you are actually running, and the amount of money that would have to change category for the split to land on target.',
  fields,
  resultLabel: 'Off the 50/30/20 split by',
  compute,
  scale: {
    min: 0,
    max: 100,
    unit: '% of take-home pay out of place',
    bands: [
      { id: 'excellent', label: 'On plan — under 5% out of place', from: 0, to: 5 },
      { id: 'good', label: 'Close — 5% to 10% out of place', from: 5, to: 10 },
      { id: 'neutral', label: 'Drifting — 10% to 20% out of place', from: 10, to: 20 },
      { id: 'warn', label: 'Well off plan — 20% to 35% out of place', from: 20, to: 35 },
      { id: 'critical', label: 'A different budget entirely — 35% or more', from: 35, to: 100 },
    ],
  },
  faqs: [
    {
      q: 'What counts as a need rather than a want?',
      a: 'A need is something you would still have to pay for if your income halved: housing and utilities, transport to work, groceries, insurance, childcare, and the minimum payment on every debt. A want is the version you choose because you can afford it — restaurants rather than groceries, a newer car than you need, subscriptions you could cancel this afternoon. When a line is genuinely both, split it: a basic phone plan is a need, the extra data is a want.',
    },
    {
      q: 'Is the 50/30/20 rule based on gross or take-home pay?',
      a: 'Take-home pay — what reaches your account after tax and payroll deductions. Using gross pay would make every share look smaller than it is and would count money you never receive. One exception is worth knowing: if retirement contributions come out of your pay before it reaches you, they already count toward the 20%, so add them back into income and into savings rather than ignoring them.',
    },
    {
      q: 'What does the headline number actually mean?',
      a: 'It is the smallest amount of money that would have to move between categories each month for your budget to sit exactly on 50/30/20. Because the categories add up to your income, whatever is over the guideline in one place is exactly what is short somewhere else, so a single figure describes both. It is a distance from the target, not a bill — nothing is being spent twice.',
    },
    {
      q: 'What if my needs are well over 50%?',
      a: 'That is common in expensive housing markets and on lower incomes, where rent alone can pass 50% of take-home pay. The rule then stops being a realistic split and starts being a diagnosis: the gap is telling you the arithmetic cannot be fixed by cutting subscriptions. Housing, transport, and income are the only levers big enough to close it, and all three take months rather than weeks.',
    },
    {
      q: 'Does paying off debt count as savings or as a need?',
      a: 'The minimum payment on each debt is a need, because missing it has consequences. Anything you pay above the minimum counts toward the 20%, because it builds net worth exactly the way a deposit into an investment account does — it just does it by removing a liability instead of adding an asset.',
    },
    {
      q: 'What should I do with money the budget leaves unallocated?',
      a: 'Assign it. Take-home pay that has no job attached is usually spent without a decision, which is why this calculator treats unassigned money as being out of place rather than as a cushion. If your savings share is below 20%, sending the unallocated amount there is the cheapest way to close the gap, because it needs no cut anywhere else.',
    },
  ],
  related: [
    'savings-goal-calculator',
    'debt-payoff-calculator',
    'salary-calculator',
    'net-worth-calculator',
  ],
  disclaimer: 'financial',
  lastReviewed: '2026-07-30',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

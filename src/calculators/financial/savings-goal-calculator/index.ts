import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'savings-goal-calculator',
  category: 'financial',
  title: 'Savings Goal Calculator',
  seoTitle: 'Savings Goal Calculator: How Long to Reach Your Target',
  description:
    'Work out how long it takes to reach a savings target from your current balance, monthly deposit, and interest rate, with compounding month by month.',
  intro:
    'A savings goal is really a question about time: given what you have saved, what you can add each month, and what the account pays, when do you cross the finish line? This calculator steps through the balance month by month and reports the answer in years and months.',
  fields,
  resultLabel: 'Time to reach your goal',
  compute,
  scale: {
    min: 0,
    max: 240,
    // The last band is open-ended in practice (the loop runs to 1200 months),
    // so the pointer is capped at the 20-year mark rather than the raw value.
    clampMax: 240,
    unit: 'months',
    bands: [
      { id: 'excellent', label: 'Within a year', from: 0, to: 12 },
      { id: 'good', label: 'One to three years', from: 12, to: 36 },
      { id: 'neutral', label: 'Three to five years', from: 36, to: 60 },
      { id: 'warn', label: 'Five to ten years', from: 60, to: 120 },
      { id: 'critical', label: 'Ten years or more', from: 120, to: 240 },
    ],
  },
  faqs: [
    {
      q: 'How is the time to reach a savings goal calculated?',
      a: 'The balance is simulated one month at a time: it earns one month of interest, then the deposit is added. The count stops on the first month the balance reaches or passes the goal, which is why the final balance usually overshoots slightly.',
    },
    {
      q: 'Does the interest rate really matter for a short goal?',
      a: 'Not much. Over one or two years, deposits do almost all of the work and a percentage point of return changes the answer by a month at most. Rate compounds into something meaningful only over horizons of roughly five years and longer.',
    },
    {
      q: 'What if my goal is unreachable?',
      a: 'If the balance has not reached the goal after 100 years of monthly steps, the calculator reports an error instead of a number. That happens when the deposit is zero and the account pays nothing, or when the target is enormous relative to what you add.',
    },
    {
      q: 'Should I use a nominal or an inflation-adjusted return?',
      a: 'For a goal priced in today money, subtract expected inflation from your return to get a real rate. Using a nominal rate answers when the account balance hits the number, not when it buys what you want it to buy.',
    },
  ],
  related: ['compound-interest-calculator', 'retirement-calculator', 'inflation-calculator'],
  disclaimer: 'financial',
  lastReviewed: '2026-07-27',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

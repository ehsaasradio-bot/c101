import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'retirement-calculator',
  category: 'financial',
  title: 'Retirement Calculator',
  seoTitle: 'Retirement Calculator: Savings Projection & Income',
  description:
    'Project your retirement savings from your current balance, monthly contributions, and expected return, then see the yearly income the 4% rule allows.',
  intro:
    'Your retirement number has two engines: the money you have already invested compounding forward, and the money you add each month. This calculator grows both to your retirement age, then applies a safe withdrawal rate to show the income that pot can support.',
  fields,
  resultLabel: 'Projected savings at retirement',
  faqs: [
    {
      q: 'What is the 4% rule?',
      a: 'It is a rule of thumb from historical US market data: withdraw 4% of your portfolio in the first year of retirement, then adjust that amount for inflation each year. In the studies behind it, that pace survived 30-year retirements in almost every starting year.',
    },
    {
      q: 'What annual return should I assume?',
      a: 'A diversified stock-heavy portfolio has returned roughly 7% a year after inflation over long periods, and about 10% before inflation. Because this calculator works in future dollars, 6-7% is a reasonably conservative nominal assumption for a mixed portfolio.',
    },
    {
      q: 'How much should I be saving each month?',
      a: 'A common target is 15% of gross income, including any employer match. If you started late, the shortfall is easier to close by raising contributions than by chasing returns, because contributions are the part you actually control.',
    },
    {
      q: 'Does this account for inflation?',
      a: 'No. The projection is in future dollars, so a large number will buy less than it does today. To think in current purchasing power, subtract your inflation assumption from the expected return — using 4% instead of 7% gives an inflation-adjusted view.',
    },
    {
      q: 'What if I retire earlier than planned?',
      a: 'Retiring early cuts both ways: fewer years of contributions and compounding, and more years the portfolio has to last. Lowering the withdrawal rate to 3 or 3.5% is the usual adjustment for a retirement expected to run well past 30 years.',
    },
  ],
  related: ['compound-interest-calculator', 'savings-goal-calculator', 'net-worth-calculator', '401k-calculator', 'roth-ira-calculator'],
  disclaimer: 'financial',
  lastReviewed: '2026-07-27',
  priority: 0.9,
  compute,
} satisfies CalculatorDef<typeof fields>

export default def

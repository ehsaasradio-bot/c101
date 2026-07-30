import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'net-worth-calculator',
  category: 'financial',
  title: 'Net Worth Calculator',
  seoTitle: 'Net Worth Calculator: Assets Minus Liabilities',
  description:
    'Add up cash, investments, property, and debts to see your net worth, home equity, and debt-to-asset ratio in a single snapshot.',
  intro:
    'Net worth is simply everything you own minus everything you owe. List your assets and your outstanding balances below to see the total, how much of it is liquid, and what share of your assets is still financed by debt.',
  fields,
  resultLabel: 'Net worth',
  compute,
  scale: {
    min: 0,
    max: 100,
    unit: '% debt-to-asset',
    bands: [
      { id: 'excellent', label: 'Barely leveraged — under 15%', from: 0, to: 15 },
      { id: 'good', label: 'Comfortable — 15% to 30%', from: 15, to: 30 },
      { id: 'neutral', label: 'Typical — 30% to 50%', from: 30, to: 50 },
      { id: 'warn', label: 'Heavily leveraged — 50% to 80%', from: 50, to: 80 },
      { id: 'critical', label: 'Debt near or above assets — 80%+', from: 80, to: 100 },
    ],
  },
  faqs: [
    {
      q: 'What counts as an asset when calculating net worth?',
      a: 'Anything you own that could be converted to cash: bank balances, brokerage and retirement accounts, the current market value of property, vehicles, and business equity. Use realistic resale values rather than what you originally paid.',
    },
    {
      q: 'Should I use my home value or my home equity?',
      a: 'Enter the full market value as an asset and the outstanding mortgage as a liability. The calculator subtracts one from the other, so entering equity directly would double-count the debt you have already paid off.',
    },
    {
      q: 'Is a negative net worth a problem?',
      a: 'Not necessarily. Recent graduates with student loans and new homeowners often have more debt than assets, and the figure turns positive as balances fall and assets grow. What matters is the direction it moves year over year.',
    },
    {
      q: 'What is a good debt-to-asset ratio?',
      a: 'Below about 30% is comfortable for most households, and 30% to 50% is typical while a mortgage is being repaid. Above 50% means the majority of what you own is still financed, which leaves little cushion if income or asset values fall.',
    },
    {
      q: 'How often should I recalculate my net worth?',
      a: 'Once or twice a year is enough for most people. Tracking it too frequently mostly captures market noise, while an annual snapshot taken on the same date each year shows whether saving and debt repayment are actually working.',
    },
  ],
  related: ['savings-goal-calculator', 'retirement-calculator', 'mortgage-calculator', 'budget-calculator'],
  disclaimer: 'financial',
  lastReviewed: '2026-07-27',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

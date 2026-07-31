import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'auto-loan-calculator',
  category: 'financial',
  title: 'Auto Loan Calculator',
  seoTitle: 'Auto Loan Calculator: Car Payment, Tax & Interest',
  description:
    'Work out your monthly car payment from price, down payment, trade-in, sales tax, and APR, and see the total interest over the full loan term.',
  intro:
    'A car payment is driven by four numbers: what you finance, the APR, the term, and how much you put down. This calculator adds sales tax on the price net of your trade-in, subtracts your cash down payment, then amortizes the balance to a fixed monthly payment.',
  fields,
  resultLabel: 'Monthly payment',
  compute,
  scale: {
    min: 0,
    max: 100,
    unit: '% up front',
    bands: [
      { id: 'critical', label: 'Under 10% down — instantly underwater', from: 0, to: 10 },
      { id: 'warn', label: '10% to 20% down — thin equity', from: 10, to: 20 },
      { id: 'good', label: '20% to 35% down — solid', from: 20, to: 35 },
      { id: 'excellent', label: '35% or more down — very strong', from: 35, to: 100 },
    ],
  },
  faqs: [
    {
      q: 'How is sales tax calculated on a car loan?',
      a: 'In most US states the tax applies to the vehicle price minus your trade-in credit, not minus your cash down payment. That trade-in credit is why trading a car in can be worth more than selling it privately for a similar figure.',
    },
    {
      q: 'How much should I put down on a car?',
      a: 'A common target is 20% on a new vehicle and 10% on a used one. New cars depreciate fastest in the first year, so a smaller down payment leaves you owing more than the car is worth — a position known as being underwater or upside down.',
    },
    {
      q: 'Is a 72 or 84 month car loan a bad idea?',
      a: 'Longer terms cut the monthly payment but raise total interest and keep you underwater far longer, which makes selling or trading the vehicle expensive. If you need 84 months to afford the payment, the car is probably above your budget.',
    },
    {
      q: 'Does the calculator handle 0% APR promotional financing?',
      a: 'Yes. At 0% APR the amortization formula would divide by zero, so the balance is simply spread evenly across the term and total interest comes out at zero. Compare that against any cash rebate you would give up to get the rate.',
    },
    {
      q: 'What is not included in this estimate?',
      a: 'Dealer documentation fees, title and registration, extended warranties, gap insurance, and any lender origination fee are excluded. Add them to the vehicle price if you plan to roll them into the loan rather than pay them separately.',
    },
  ],
  related: ['loan-calculator', 'credit-card-payoff-calculator', 'fuel-cost-calculator', 'car-lease-calculator'],
  disclaimer: 'financial',
  lastReviewed: '2026-07-27',
  priority: 0.8,
} satisfies CalculatorDef<typeof fields>

export default def

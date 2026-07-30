import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'loan-calculator',
  category: 'financial',
  title: 'Loan Calculator',
  seoTitle: 'Loan Calculator: Monthly Payment, Interest & Early Payoff',
  description:
    'Work out the monthly payment on any personal, auto, or student loan, see the total interest, and check how much an extra payment saves.',
  intro:
    'Enter what you are borrowing, the APR, and the term to get your monthly payment. Add an extra monthly amount to see how much interest and time it cuts from the loan.',
  fields,
  resultLabel: 'Monthly payment',
  compute,
  scale: {
    min: 0,
    max: 100,
    clampMax: 100,
    unit: '% of principal paid in interest',
    bands: [
      { id: 'excellent', label: 'Cheap credit — under 10%', from: 0, to: 10 },
      { id: 'good', label: 'Reasonable — 10–25%', from: 10, to: 25 },
      { id: 'warn', label: 'Expensive — 25–50%', from: 25, to: 50 },
      { id: 'critical', label: 'Very expensive — over 50%', from: 50, to: 9999 },
    ],
  },
  faqs: [
    {
      q: 'How is a loan payment calculated?',
      a: 'With the amortization formula: payment = P × r × (1+r)^n ÷ ((1+r)^n − 1), where P is the amount borrowed, r is the monthly interest rate, and n is the number of months. Each payment covers that month’s interest first, and the rest reduces the balance.',
    },
    {
      q: 'Does paying extra each month actually help?',
      a: 'Substantially. Extra payments go entirely to principal, so they cut both the balance and every future interest charge on it. On a typical 5-year loan, an extra $100 a month often saves several hundred dollars and finishes the loan close to a year early.',
    },
    {
      q: 'What is the difference between interest rate and APR?',
      a: 'The interest rate is the cost of borrowing the money. APR folds in fees such as origination charges, so it reflects the true annual cost. Compare loans on APR, not the headline rate.',
    },
    {
      q: 'Should I choose a longer term for a lower payment?',
      a: 'A longer term lowers the monthly payment but raises the total interest, sometimes sharply. Pick the shortest term whose payment you can comfortably sustain.',
    },
  ],
  related: ['auto-loan-calculator', 'credit-card-payoff-calculator', 'mortgage-calculator', 'apr-calculator'],
  disclaimer: 'financial',
  lastReviewed: '2026-07-27',
  priority: 0.85,
} satisfies CalculatorDef<typeof fields>

export default def

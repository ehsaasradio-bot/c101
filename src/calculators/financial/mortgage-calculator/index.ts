import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'mortgage-calculator',
  category: 'financial',
  title: 'Mortgage Calculator',
  seoTitle: 'Mortgage Calculator: Monthly Payment, Interest & PITI',
  description:
    'Calculate your monthly mortgage payment including principal, interest, taxes, insurance, and PMI. Supports 10, 15, 20, and 30-year fixed loans.',
  intro:
    'A mortgage payment has four parts — principal, interest, taxes, and insurance (PITI). Enter your home price, down payment, and rate to see the monthly cost and what the loan adds up to over its full term.',
  fields,
  resultLabel: 'Monthly principal & interest',
  compute,
  scale: {
    min: 0,
    max: 100,
    unit: '% LTV',
    // Bands are half-open [from, to), but PMI applies strictly *above* 80% LTV —
    // a 20% down payment (exactly 80.0) is the textbook way to avoid it, and is
    // this calculator's default. The epsilon keeps 80.0 itself in the healthy
    // band so the meter agrees with the PMI charge and the field's help text.
    bands: [
      { id: 'excellent', label: 'Low LTV — under 60%', from: 0, to: 60 },
      // Not Number.EPSILON — that is the gap at 1.0 and vanishes when added to
      // 80, silently leaving the boundary unmoved.
      { id: 'good', label: 'Healthy — 60% to 80%', from: 60, to: 80 + 1e-9 },
      { id: 'warn', label: 'PMI territory — over 80%', from: 80 + 1e-9, to: 90 },
      { id: 'critical', label: 'High risk — 90% or more', from: 90, to: 100 },
    ],
  },
  faqs: [
    {
      q: 'What is included in a monthly mortgage payment?',
      a: 'Four things, abbreviated PITI: principal (paying down the balance), interest (the cost of borrowing), property taxes, and homeowners insurance. If your down payment is under 20%, private mortgage insurance (PMI) is added on top.',
    },
    {
      q: 'How much house can I afford?',
      a: 'A common guideline is the 28/36 rule: housing costs stay under 28% of gross monthly income, and all debt payments under 36%. Lenders also look at your credit score, down payment, and existing debts.',
    },
    {
      q: 'Is a 15-year or 30-year mortgage better?',
      a: 'A 15-year loan carries a higher monthly payment but typically a rate 0.5–0.75% lower, and it cuts total interest by roughly half. A 30-year loan keeps monthly cash flow flexible. Choose based on how much payment room your budget genuinely has.',
    },
    {
      q: 'When does PMI go away?',
      a: 'On conventional loans, PMI can usually be cancelled once you reach 20% equity, and it terminates automatically at 22% equity based on the original schedule. FHA loans often carry mortgage insurance for the life of the loan.',
    },
  ],
  related: ['house-affordability-calculator', 'amortization-calculator', 'loan-calculator', 'refinance-calculator', 'mortgage-points-calculator'],
  disclaimer: 'financial',
  lastReviewed: '2026-07-27',
  priority: 0.9,
} satisfies CalculatorDef<typeof fields>

export default def

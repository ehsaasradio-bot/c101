import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'house-affordability-calculator',
  category: 'financial',
  title: 'House Affordability Calculator',
  seoTitle: 'House Affordability Calculator: How Much House Can I Afford?',
  description:
    'Find out how much house you can afford using the 28/36 rule. Enter income, debts, down payment, and rate to see your maximum home price.',
  intro:
    'Lenders size a mortgage from two ratios: housing costs under 28% of gross monthly income, and all debt payments under 36%. Whichever limit bites first becomes your payment budget — this works backwards from that payment to the loan it supports, then adds your down payment to give a maximum home price.',
  fields,
  resultLabel: 'Maximum home price',
  compute,
  scale: {
    min: 0,
    max: 100,
    clampMax: 50,
    unit: '% of income on existing debt',
    bands: [
      { id: 'excellent', label: 'Almost debt free — under 10%', from: 0, to: 10 },
      { id: 'good', label: 'Comfortable — 10% to 20%', from: 10, to: 20 },
      { id: 'neutral', label: 'Manageable — 20% to 28%', from: 20, to: 28 },
      { id: 'warn', label: 'Squeezing housing — 28% to 36%', from: 28, to: 36 },
      { id: 'critical', label: 'No room left — 36% or more', from: 36, to: 100 },
    ],
  },
  faqs: [
    {
      q: 'What is the 28/36 rule?',
      a: 'It is the underwriting guideline that your monthly housing cost should stay at or below 28% of gross monthly income, and that all monthly debt payments together — housing plus car loans, student loans, and card minimums — should stay at or below 36%.',
    },
    {
      q: 'Does this include property taxes and insurance?',
      a: 'No. This calculator converts the whole payment budget into principal and interest so the arithmetic is transparent. Taxes, homeowners insurance, PMI, and HOA dues share that same 28%, so a realistic maximum price is typically 15 to 25 percent below the figure shown here.',
    },
    {
      q: 'How much do I need for a down payment?',
      a: 'Twenty percent of the purchase price avoids private mortgage insurance and gets the best pricing, but conventional loans go down to 3%, FHA to 3.5%, and VA and USDA loans to zero for those who qualify. A smaller down payment buys less house and costs more each month.',
    },
    {
      q: 'Why does paying off a car loan raise my maximum home price so much?',
      a: 'Because the 36% back-end limit subtracts your other debts dollar for dollar from the housing budget, and a mortgage multiplies that budget by roughly 150 to 160 at typical 30-year rates. Clearing a $400 car payment can therefore add well over $60,000 to what you can borrow.',
    },
    {
      q: 'Do lenders ever approve more than the 28/36 rule allows?',
      a: 'Yes. Strong credit, large reserves, or an automated approval can stretch total debt to 43% or beyond, and many government-backed programs go higher still. Being approved for more is not the same as being able to afford more, so treat the rule as a budget rather than a ceiling.',
    },
  ],
  related: ['mortgage-calculator', 'loan-calculator', 'salary-calculator', 'down-payment-calculator', 'rent-vs-buy-calculator'],
  disclaimer: 'financial',
  lastReviewed: '2026-07-27',
  priority: 0.8,
} satisfies CalculatorDef<typeof fields>

export default def

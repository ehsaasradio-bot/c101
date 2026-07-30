import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'down-payment-calculator',
  category: 'financial',
  title: 'Down Payment Calculator',
  seoTitle: 'Down Payment Calculator: Cash to Close, PMI & Time to Save',
  description:
    'Work out the cash you need up front to buy a home — down payment, closing costs and moving — plus the loan it leaves, the monthly payment, and PMI.',
  intro:
    'Buying a home takes more cash than the down payment alone: closing costs typically add another 2% to 5% of the price, and moving in costs money too. This adds those up into one number, shows how long it takes to save at your current rate, and works out what the down payment you choose does to the loan, the monthly payment, and whether private mortgage insurance applies.',
  fields,
  resultLabel: 'Cash needed up front',
  compute,
  scale: {
    min: 0,
    max: 100,
    clampMax: 40,
    unit: '% down',
    // Positioned on the down payment share, because that is the one input that
    // decides both the PMI question and the price of the loan. The 20% edge is
    // where PMI stops: bands are half-open [from, to), so exactly 20% lands in
    // the PMI-free band, matching the guard in compute.
    bands: [
      { id: 'critical', label: 'Under 5% — PMI and tight approval', from: 0, to: 5 },
      { id: 'warn', label: '5% to 10% — PMI applies', from: 5, to: 10 },
      { id: 'neutral', label: '10% to 20% — PMI applies', from: 10, to: 20 },
      { id: 'good', label: '20% to 30% — no PMI', from: 20, to: 30 },
      { id: 'excellent', label: '30% or more — strongest offer', from: 30, to: 100 },
    ],
  },
  faqs: [
    {
      q: 'How much do I actually need to buy a house?',
      a: 'More than the down payment. Closing costs — lender fees, title insurance, appraisal, transfer taxes and prepaid escrow — usually run 2% to 5% of the purchase price, and moving, immediate repairs and furnishing come out of the same pot. On a $400,000 home with 15% down, the down payment is $60,000 but the realistic cash requirement is closer to $75,000.',
    },
    {
      q: 'Do I have to put 20% down?',
      a: 'No. Conventional loans go down to 3%, FHA to 3.5%, and VA and USDA loans to zero for buyers who qualify. What 20% buys you is the end of private mortgage insurance: below that threshold lenders add roughly 0.5% to 1.5% of the loan per year until you reach 20% equity, which is why the calculator flags it separately.',
    },
    {
      q: 'Is it better to put down more, or keep the cash?',
      a: 'A larger down payment cuts the loan, the monthly payment and the total interest, and it removes PMI at 20%. But cash spent on a down payment is gone from your emergency fund, and lenders want to see reserves after closing. The usual advice is to keep three to six months of expenses liquid and put the rest down.',
    },
    {
      q: 'When does PMI actually come off?',
      a: 'On a conventional loan you can normally request cancellation once the balance reaches 80% of the original value, and the servicer must terminate it automatically at 78% based on the original amortization schedule. FHA loans are different: mortgage insurance usually runs for the life of the loan unless you put down 10% or more.',
    },
    {
      q: 'How long will it take me to save the down payment?',
      a: 'Divide what is still missing by what you set aside each month. The calculator does that from your current savings and monthly contribution and shows the crossing point on the chart. It deliberately assumes no investment return, because money needed within a few years usually should not be in the market.',
    },
  ],
  related: ['mortgage-calculator', 'house-affordability-calculator', 'savings-goal-calculator'],
  disclaimer: 'financial',
  lastReviewed: '2026-07-30',
  priority: 0.8,
} satisfies CalculatorDef<typeof fields>

export default def

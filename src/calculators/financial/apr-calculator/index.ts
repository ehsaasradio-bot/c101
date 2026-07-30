import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'apr-calculator',
  category: 'financial',
  title: 'APR Calculator',
  seoTitle: 'APR Calculator: True Loan Cost With Points and Fees',
  description:
    'Find the true annual cost of a loan once points and fees are counted, and see how far the APR sits above the rate you were quoted.',
  intro:
    'APR folds a loan’s upfront costs into its interest rate, so it measures what borrowing actually costs rather than what the headline rate suggests. Enter the amount, the quoted rate, the term and the fees, and this solves for the rate at which your scheduled payments discount back to the money you really receive.',
  fields,
  resultLabel: 'APR',
  compute,
  scale: {
    min: 0,
    max: 1,
    clampMax: 1,
    unit: 'percentage points of APR above the quoted rate',
    bands: [
      { id: 'excellent', label: 'Negligible — under 0.1 points of fees', from: 0, to: 0.1 },
      { id: 'good', label: 'Modest — 0.1 to 0.3 points of fees', from: 0.1, to: 0.3 },
      { id: 'warn', label: 'Heavy — 0.3 to 0.75 points of fees', from: 0.3, to: 0.75 },
      { id: 'critical', label: 'Very heavy — over 0.75 points of fees', from: 0.75, to: 9999 },
    ],
  },
  faqs: [
    {
      q: 'What is the difference between the interest rate and the APR?',
      a: 'The interest rate is what the lender charges on the balance, and it alone sets your monthly payment. The APR restates the deal as a single annual rate after the upfront costs are deducted from what you receive, so a loan with points and fees always has an APR above its quoted rate. Two quotes at the same rate can differ by half a point of APR purely on fees.',
    },
    {
      q: 'How is APR actually calculated?',
      a: 'Regulation Z defines it as the rate that makes the present value of the scheduled payments equal the amount advanced — the loan less its prepaid finance charges. There is no closed-form answer, so this calculator finds it numerically by bisection, halving a bracket around the rate until the discounted payments match the advance. With no points and no fees the answer collapses to the quoted rate exactly.',
    },
    {
      q: 'Which fees belong in an APR calculation?',
      a: 'Charges you pay in order to get the credit: discount points, origination and underwriting fees, broker compensation, and mortgage insurance premiums. Costs you would also face in a cash purchase are generally excluded — title insurance, recording fees, and property insurance. Because lenders draw that line slightly differently, compare quotes on the same itemised list of charges rather than on APR alone.',
    },
    {
      q: 'Why does the APR look worse if I sell or refinance early?',
      a: 'The APR spreads your upfront costs over the whole term. Repay after five years instead of thirty and the same fees are recovered over a sixth of the time, so the rate you effectively paid is much higher. The chart plots that curve, which is why buying discount points rarely pays off unless you are confident you will keep the loan for many years.',
    },
    {
      q: 'Is a lower APR always the better loan?',
      a: 'Not always. APR assumes you hold the loan to term, so it flatters a low-rate, high-fee quote if you expect to move or refinance sooner. It also treats an adjustable-rate loan optimistically, since the calculation has to assume today’s rate persists. Compare the APR, the cash needed at closing, and the effective rate over the period you actually expect to hold the loan.',
    },
  ],
  related: ['loan-calculator', 'mortgage-calculator', 'auto-loan-calculator'],
  disclaimer: 'financial',
  lastReviewed: '2026-07-30',
  priority: 0.8,
} satisfies CalculatorDef<typeof fields>

export default def

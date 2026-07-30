import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'refinance-calculator',
  category: 'financial',
  title: 'Refinance Calculator',
  seoTitle: 'Refinance Calculator: Break-Even Point and Lifetime Cost',
  description:
    'Work out your refinance break-even month, the monthly saving, and whether a fresh loan term quietly adds more interest than the lower rate saves.',
  intro:
    'A refinance pays for itself once the lower monthly payment has repaid what the new loan cost to arrange — that is the break-even month. Enter your current balance, rate and remaining term alongside the offer on the table, and this shows both that break-even and the figure most refinance calculators leave out: what the whole loan costs you over its life.',
  fields,
  resultLabel: 'Time to break even',
  compute,
  // The meter is driven by the change in LIFETIME cost, not by the break-even.
  // A gauge that went green the moment the payment fell would tell exactly the
  // lie this page exists to correct: resetting a 22-year-old loan to a fresh
  // 30-year term lowers the payment while adding years of interest.
  scale: {
    min: -40,
    max: 40,
    unit: '% lifetime cost',
    bands: [
      { id: 'excellent', label: 'Much cheaper over the life of the loan', from: -40, to: -15 },
      { id: 'good', label: 'Cheaper over the life of the loan', from: -15, to: -3 },
      { id: 'neutral', label: 'About the same over the life of the loan', from: -3, to: 3 },
      { id: 'warn', label: 'Costs more over the life of the loan', from: 3, to: 15 },
      { id: 'critical', label: 'Costs much more over the life of the loan', from: 15, to: 40 },
    ],
  },
  faqs: [
    {
      q: 'How is the refinance break-even point calculated?',
      a: 'Divide the closing costs by the monthly saving, then round up to the next whole payment. $4,500 of costs against a $361 monthly saving is 12.5 payments, so you are ahead from month 13. If you sell or refinance again before then, the deal never repaid what it cost to arrange.',
    },
    {
      q: 'Why can a lower monthly payment still cost more in the end?',
      a: 'Because the payment falls for two different reasons and only one of them is a saving. A lower rate genuinely costs you less. A longer term just spreads the same debt over more months — refinancing 22 remaining years into a fresh 30-year loan adds 96 payments, and interest accrues on every one of them. At the default figures here the payment drops $361 a month and the total repaid rises by roughly $49,000.',
    },
    {
      q: 'What is the honest way to compare two loans?',
      a: 'Set the new term to the years you actually have left. That isolates the rate cut from the term reset, and whatever saving survives is real. If the shorter term makes the payment unaffordable, you have learned something useful: what you want is the cash-flow relief, and it has a price worth seeing.',
    },
    {
      q: 'Is refinancing into a shorter term worth a higher payment?',
      a: 'Often, yes. Moving 22 remaining years to a 15-year loan usually raises the monthly payment, so there is no break-even month to reach at all — but it can cut tens of thousands from the lifetime interest. This calculator reports that case plainly rather than treating a higher payment as an automatic loss.',
    },
    {
      q: 'What counts as closing costs on a refinance?',
      a: 'Typically origination or lender fees, an appraisal, title search and insurance, recording fees and prepaid escrow — commonly 2% to 5% of the loan. A "no-cost" refinance does not remove them; the lender pays them and recovers the money through a higher rate, so enter zero costs and the higher rate to compare that offer fairly.',
    },
  ],
  related: ['mortgage-calculator', 'amortization-calculator', 'loan-calculator'],
  disclaimer: 'financial',
  lastReviewed: '2026-07-30',
  priority: 0.8,
} satisfies CalculatorDef<typeof fields>

export default def

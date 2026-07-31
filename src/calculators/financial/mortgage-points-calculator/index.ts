import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'mortgage-points-calculator',
  category: 'financial',
  title: 'Mortgage Points Calculator',
  seoTitle: 'Mortgage Points Calculator: Break-Even on Buying Down a Rate',
  description:
    'Work out whether discount points are worth buying: the up-front cost, the monthly saving, the break-even month, and whether you keep the loan that long.',
  intro:
    'A discount point costs 1% of the loan and buys a lower rate for as long as the loan lasts, so it pays for itself only once the smaller payments have repaid the cheque you wrote at closing. That moment is the break-even, and this works it out from the annuity formula alongside the monthly saving and the lifetime interest with and without the points. It then asks the question rate sheets never do — how long you actually expect to keep this loan — because points that break even in five years are worthless to someone who moves in three.',
  fields,
  resultLabel: 'Time to break even',
  compute,
  // The meter is driven by how far PAST break-even you still expect to be
  // holding the loan, not by the break-even month itself. Points are the most
  // illiquid thing in a mortgage: sell or refinance early and the unrecovered
  // part of the cheque is simply gone, because a point buys a rate and the rate
  // dies with the loan. A gauge that went green the moment a break-even existed
  // would tell exactly the lie this page exists to correct — the same reasoning
  // refinance-calculator uses to drive its meter from lifetime cost rather than
  // from the lower payment.
  scale: {
    min: -120,
    max: 120,
    unit: 'months held beyond break-even',
    bands: [
      { id: 'critical', label: 'Gone long before the points repay themselves', from: -120, to: -36 },
      { id: 'warn', label: 'Gone before the points repay themselves', from: -36, to: 0 },
      { id: 'neutral', label: 'Break-even lands about when you expect to leave', from: 0, to: 12 },
      { id: 'good', label: 'Held comfortably past break-even', from: 12, to: 60 },
      { id: 'excellent', label: 'Held far past break-even — the points pay off well', from: 60, to: 120 },
    ],
  },
  faqs: [
    {
      q: 'How do you calculate the break-even point on mortgage points?',
      a: 'Divide what the points cost by the monthly saving they buy, then round up to the next whole payment. On a $400,000 loan, one point costs $4,000 and a quarter-point rate cut takes the payment from about $2,528 to about $2,463 — a saving near $65 a month, so $4,000 ÷ $65 is roughly 61.2 payments and you are ahead from month 62. Both payments come from the standard annuity formula M = P·i ÷ (1 − (1+i)⁻ⁿ), which is the same one your lender uses.',
    },
    {
      q: 'Why is the break-even month only half the answer?',
      a: 'Because it tells you when the deal turns positive, not whether you will still be there. A point buys a rate, and the rate dies with the loan: sell the house, refinance, or pay the balance off and every dollar you had not yet recovered is simply gone. Most mortgages end years before their term — people move, rates fall, circumstances change — so a five-year break-even is a genuine bargain for someone staying fifteen years and a straightforward loss for someone staying three. That is why this page asks how long you expect to keep the loan and gives a verdict rather than a bare number.',
    },
    {
      q: 'Does this calculator discount the future saving back to today?',
      a: 'No, and that is a deliberate choice worth stating. The cost is paid in today’s money while the saving arrives one payment at a time over years, so a strict comparison would discount those future dollars at whatever your cash could otherwise earn. The undiscounted break-even reported here is the figure every rate sheet and every lender quotes, which makes it comparable with what you are shown elsewhere. It is also mildly optimistic: at a 4% opportunity cost a five-year break-even lands roughly half a year later, and the longer the recovery takes the wider that gap grows.',
    },
    {
      q: 'How much does one point lower the interest rate?',
      a: 'Commonly about a quarter of a percentage point, but it is a convention rather than a rule, and rate sheets bend — the first point often buys more than the third, and the ratio moves with the market and with your credit profile. That is why the cut per point is an input here instead of a constant. Read it straight off two real quotes: the rate at zero points minus the rate at one point. If a lender will not show you the par rate, you cannot price the points at all.',
    },
    {
      q: 'Are discount points tax deductible?',
      a: 'Points paid to buy down the rate on a purchase of your main home are generally deductible in the year you pay them if you itemise and meet the IRS conditions; points on a refinance normally have to be spread across the life of the loan instead. That shortens the real break-even for anyone who itemises, while the mortgage interest the points save is itself deductible, which lengthens it. Neither effect is modelled here, and the two pull in opposite directions, so check your own position with a tax adviser rather than assuming they cancel.',
    },
    {
      q: 'Is it better to buy points or put the money into the down payment?',
      a: 'Usually the down payment, if the extra cash would take you over a threshold. Crossing 20% equity removes mortgage insurance outright, which is often a larger monthly saving than a quarter-point rate cut and does not have to be earned back over five years. Points are worth considering once the deposit is settled, the emergency fund is intact, and you are confident this loan will still be yours in a decade.',
    },
  ],
  related: ['mortgage-calculator', 'refinance-calculator', 'apr-calculator'],
  disclaimer: 'financial',
  lastReviewed: '2026-07-31',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

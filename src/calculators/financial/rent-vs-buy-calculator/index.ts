import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'rent-vs-buy-calculator',
  category: 'financial',
  title: 'Rent vs Buy Calculator',
  seoTitle: 'Rent vs Buy Calculator: Your Break-Even Year',
  description:
    'Compare renting against buying over 30 years — mortgage, tax, upkeep, appreciation and the opportunity cost of your deposit — and find the break-even year.',
  intro:
    'Buying starts a long way behind: closing costs, a deposit that is no longer earning anything elsewhere, and early payments that are almost all interest. This calculator runs both paths month by month and tells you the year at which the running cost of owning finally drops below the running cost of renting — or says plainly that it never does.',
  fields,
  resultLabel: 'Years until buying costs less',
  compute,
  scale: {
    min: 0,
    max: 30,
    unit: 'years to break even',
    bands: [
      { id: 'excellent', label: 'Buying wins fast — under 3 years', from: 0, to: 3 },
      { id: 'good', label: 'Buying wins within 8 years', from: 3, to: 8 },
      { id: 'warn', label: 'A long wait — 8 to 15 years', from: 8, to: 15 },
      { id: 'critical', label: 'Renting stays cheaper for 15+ years', from: 15, to: 30 },
    ],
  },
  faqs: [
    {
      q: 'What does the break-even year actually mean?',
      a: 'It is the point at which the total money you have spent on owning — upfront cash, mortgage payments, tax, insurance and upkeep, plus the return your deposit gave up — minus what you would walk away with if you sold that day, first falls below the total rent you would otherwise have paid. Sell earlier than that and renting would have been cheaper; stay longer and buying pulls ahead and keeps pulling ahead.',
    },
    {
      q: 'Why charge the deposit an opportunity cost?',
      a: 'Because the alternative to a $80,000 deposit is not spending it — it is investing it. Ignoring that makes buying look better than it is, and the effect is large: at 5% a year, $88,000 of upfront cash gives up roughly $292,000 of growth over 30 years. This calculator charges the buyer the full future value of the cash they tied up, which is why the break-even lands years later than on calculators that skip it.',
    },
    {
      q: 'Why does buying start so far behind?',
      a: 'Two reasons. Transaction costs are front-loaded: around 2% of the price to buy and 6% of the sale price to sell, so you are roughly 8% of the home price down on day one and would have to recover that before anything else counts. And a fixed mortgage front-loads interest — in year one of a 6.5% loan, close to 90% of each payment is interest, which buys you no equity at all.',
    },
    {
      q: 'What is deliberately not included?',
      a: 'The mortgage interest and property-tax deductions, PMI on a deposit under 20%, HOA or condo fees, moving costs, rental deposits, and inflation. Nor does it invest the month-to-month difference between rent and the cost of owning, which in the early years usually favours the renter. Everything here is nominal, so the rent, the home value and the investment return all grow in the same money.',
    },
    {
      q: 'Does a bigger down payment make buying win sooner?',
      a: 'Not necessarily, and that surprises people. A bigger deposit cuts the interest you pay but increases the cash you have tied up and therefore the return you give up. Which effect wins depends on whether your mortgage rate is above or below your investment return. Try moving the deposit slider with everything else fixed — if your assumed return beats your mortgage rate, a smaller deposit breaks even sooner.',
    },
    {
      q: 'What appreciation rate should I assume?',
      a: 'Long-run US house prices have grown at roughly 3–4% a year in nominal terms, which is close to inflation plus a little. Anything much above that is a bet, and the break-even is extremely sensitive to it: at 0% appreciation with the other defaults, buying takes over 25 years to win, and if prices fall it never does. If you are unsure, run it twice with a pessimistic and an optimistic figure and treat the gap as your margin of error.',
    },
  ],
  related: ['mortgage-calculator', 'house-affordability-calculator', 'amortization-calculator'],
  disclaimer: 'financial',
  lastReviewed: '2026-07-30',
  priority: 0.8,
} satisfies CalculatorDef<typeof fields>

export default def

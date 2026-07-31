import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'present-value-calculator',
  category: 'financial',
  title: 'Present Value Calculator',
  seoTitle: 'Present Value Calculator: PV and Future Value of Money',
  description:
    'Work out what a future payout or a stream of payments is worth today, or what money today grows to, with the discount factor and every step shown.',
  intro:
    'Money has a price on time: a dollar you will not see for twenty years is worth less than a dollar in your hand, because the dollar in your hand can earn a return in the meantime. Present value strips that return back out of a future amount, and future value adds it on — the same formula run in opposite directions, which is why both live here behind one mode switch. Add a recurring payment to value a pension, a rent or a bond coupon alongside any lump sum.',
  fields,
  resultLabel: 'Present value',
  compute,
  faqs: [
    {
      q: 'What is present value?',
      a: 'Present value is what a future amount of money is worth right now, given a rate of return you could otherwise earn. Discounting $100,000 twenty years out at 5% compounded monthly gives about $36,864 today, because $36,864 invested at 5% would itself grow into $100,000 over those twenty years.',
    },
    {
      q: 'How is present value different from future value?',
      a: 'They are the same equation solved for different unknowns. Future value multiplies by the growth factor (1 + i)^n; present value divides by it. Switching the mode here does exactly that, so discounting an amount and then growing the answer back returns you to where you started.',
    },
    {
      q: 'What is a $500 a month pension worth today?',
      a: 'Value it as an annuity rather than as a lump sum. At a 5% discount rate over 20 years the annuity factor is 151.53, so $500 a month is worth about $75,763 today. The stream pays out $120,000 in total, and the gap between the two numbers is everything you forgo by receiving it slowly.',
    },
    {
      q: 'What discount rate should I use?',
      a: 'Use the return you would realistically earn on the money instead — a safe government bond yield for a near-certain payment, or your own cost of capital for a business decision. A higher rate punishes distant money harder, so the choice matters more the longer the horizon. If you only want to strip out rising prices, use an inflation rate.',
    },
    {
      q: 'Why does the calculator accept a rate of 0%?',
      a: 'Because it is a genuine case, not an error. At 0% there is nothing to discount or compound, so a future amount is worth its face value and n payments are worth exactly n payments. The usual annuity formula divides by the rate and would blow up, so that limit is handled separately here.',
    },
    {
      q: 'Are payments assumed at the start or the end of each period?',
      a: 'At the end, which is the ordinary annuity convention used by standard mortgage and pension tables. An annuity due, where payments land at the start of each period, is worth one period more of interest — multiply the result by (1 + i) if that is the arrangement you are valuing.',
    },
  ],
  related: [
    'compound-interest-calculator',
    'inflation-calculator',
    'retirement-calculator',
    'simple-interest-calculator',
    'roi-calculator',
  ],
  disclaimer: 'financial',
  lastReviewed: '2026-07-31',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

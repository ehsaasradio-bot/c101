import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'npv-calculator',
  category: 'financial',
  title: 'NPV Calculator',
  seoTitle: 'NPV Calculator: Net Present Value, IRR and Payback',
  description:
    'Discount a project’s cash flows to today to get its net present value, the IRR it really earns, and how long the money takes to come back.',
  intro:
    'Net present value discounts every future cash flow back to what it is worth today and subtracts what the project costs up front. A positive NPV means the project beats the return you asked for; a negative one means your money does better elsewhere. Enter the upfront cost, the cash flows year by year, and your required rate to see the NPV alongside the internal rate of return and the discounted payback period.',
  fields,
  resultLabel: 'Net present value',
  compute,
  scale: {
    // The profitability index — present value in ÷ present value out. It is 1
    // exactly when NPV is 0, so the meter and the headline can never disagree,
    // and unlike a dollar NPV it is comparable between a small project and a
    // large one.
    min: 0,
    max: 3,
    unit: '× present value returned per dollar of cost',
    bands: [
      { id: 'critical', label: 'Destroys value — under 1.0', from: 0, to: 1 },
      { id: 'warn', label: 'Marginal — 1.0 to 1.1', from: 1, to: 1.1 },
      { id: 'neutral', label: 'Modest — 1.1 to 1.25', from: 1.1, to: 1.25 },
      { id: 'good', label: 'Strong — 1.25 to 2.0', from: 1.25, to: 2 },
      { id: 'excellent', label: 'Exceptional — 2.0 or more', from: 2, to: 3 },
    ],
  },
  faqs: [
    {
      q: 'How is net present value calculated?',
      a: 'Each future cash flow is divided by (1 + r) raised to the power of the year it arrives, where r is your required rate of return, and the results are added up. The upfront investment is then subtracted, because it is spent today and needs no discounting. A $100,000 project paying $25,000, $30,000, $35,000, $40,000 and $45,000 over five years is worth $129,079 in today’s money at a 10% required return, so its NPV is $29,079.',
    },
    {
      q: 'What does the internal rate of return tell me that NPV does not?',
      a: 'The IRR is the discount rate at which the NPV would be exactly zero — in other words, the annual return the project actually earns. NPV tells you how much value a project creates in dollars, which depends on how big it is; IRR tells you the rate, which lets you compare it against your cost of capital or against a completely different opportunity. Use both: NPV to decide whether to go ahead, IRR to understand the margin of safety.',
    },
    {
      q: 'Why does this sometimes say the IRR is undefined or ambiguous?',
      a: 'Because it genuinely can be. NPV is a polynomial in the discount factor, so it can cross zero as many times as the cash flows change direction. A project that needs a second injection of money part-way through can have two or more rates that each set NPV to zero, and no one of them is more the IRR than another. A project whose cash flows never turn NPV positive has none at all. In either case this calculator says so rather than printing one arbitrary root as if it were the answer.',
    },
    {
      q: 'What is the discounted payback period?',
      a: 'It is the point at which the cumulative discounted cash flows first cover the upfront investment — how long your money is genuinely at risk, in today’s dollars. It is always longer than the simple payback period, which ignores the time value of money entirely, and the gap between the two is a good measure of how much the discount rate is really costing you.',
    },
    {
      q: 'What discount rate should I use?',
      a: 'Use the return you could get on an alternative of similar risk. For a company that is usually its weighted average cost of capital; for a personal project it might be what an index fund or a bond would pay. Raising the rate always lowers the NPV, and the rate at which NPV hits zero is the IRR — so if you are unsure, check whether your decision would change anywhere within the range you think plausible.',
    },
    {
      q: 'Can I use periods other than years?',
      a: 'Yes, as long as the rate matches the period. If your cash flows are quarterly, enter a quarterly discount rate rather than an annual one — roughly the annual rate divided by four, or precisely (1 + annual)^(1/4) − 1. The labels here say years, but the arithmetic only cares that each cash flow is one period further away than the last.',
    },
  ],
  related: [
    // The nearest sibling by a distance: present value is this same discounting
    // applied to a single sum rather than to a whole cash-flow vector.
    'present-value-calculator',
    'roi-calculator',
    'apr-calculator',
    'break-even-calculator',
    'compound-interest-calculator',
  ],
  disclaimer: 'financial',
  lastReviewed: '2026-07-31',
  priority: 0.8,
} satisfies CalculatorDef<typeof fields>

export default def

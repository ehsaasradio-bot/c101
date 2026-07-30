import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'amortization-calculator',
  category: 'financial',
  title: 'Amortization Calculator',
  seoTitle: 'Amortization Calculator: Payment Schedule & Interest Split',
  description:
    'See how each loan payment splits between principal and interest, year by year, and exactly when principal finally overtakes interest.',
  intro:
    'Amortization is the schedule that turns one fixed payment into a shrinking debt. Every month, interest is charged on what you still owe and whatever is left of the payment reduces the balance — so early payments are mostly interest and later ones are mostly principal. This works out that split for any fixed-rate loan, and shows the month the two swap places.',
  fields,
  resultLabel: 'Interest in the year shown',
  compute,
  faqs: [
    {
      q: 'Why is almost all of my early payment interest?',
      a: 'Because interest is charged on the balance you still owe, and at the start you owe nearly everything. On a $300,000 loan at 6.5%, the first month\'s interest is $1,625 of a $1,896 payment — only $271 comes off the debt. As the balance falls the interest charge falls with it, so more of the same payment goes to principal each month.',
    },
    {
      q: 'When does more of my payment go to principal than interest?',
      a: 'Later than most people expect. On a 30-year loan at 6.5% the crossover lands around payment 233 — roughly 19 years and 4 months in. The point depends on the rate and term, not the amount: a higher rate pushes it later, a shorter term pulls it much earlier. A 15-year loan at the same rate crosses over in its first year.',
    },
    {
      q: 'How is this different from the loan or mortgage calculator?',
      a: 'Those answer "what is the payment?". This one answers "where does the payment go?". Use the mortgage calculator to work out affordability including tax and insurance, the loan calculator to test the effect of paying extra, and this one to read the schedule itself.',
    },
    {
      q: 'Why is the last payment a different amount?',
      a: 'Because each payment is rounded to whole cents, 360 identical payments never divide the principal exactly. At the default figures they fall $4.71 short, so the final payment settles whatever is left. Lenders do the same thing, which is why a real payoff quote rarely matches the level payment exactly.',
    },
    {
      q: 'Does this apply to anything other than mortgages?',
      a: 'Yes. Any fixed-rate loan with equal payments amortizes the same way — car loans, personal loans, and student loans on standard repayment. Only the term and rate change, and both are inputs here.',
    },
  ],
  related: ['mortgage-calculator', 'loan-calculator', 'compound-interest-calculator'],
  disclaimer: 'financial',
  lastReviewed: '2026-07-30',
  priority: 0.8,
} satisfies CalculatorDef<typeof fields>

export default def

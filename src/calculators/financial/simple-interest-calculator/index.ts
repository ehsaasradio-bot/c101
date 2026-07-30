import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'simple-interest-calculator',
  category: 'financial',
  title: 'Simple Interest Calculator',
  seoTitle: 'Simple Interest Calculator: I = P × r × t, vs Compound',
  description:
    'Work out simple interest with I = P × r × t and the total amount, then see exactly how far compound interest pulls ahead on the very same terms.',
  intro:
    'Simple interest is charged on the original principal only, so the amount added is the same every year: I = P × r × t, and the balance ends at A = P(1 + rt). Enter a principal, an annual rate and a term to see the interest, the total, and how much more the identical money would have earned had it compounded instead.',
  fields,
  resultLabel: 'Total interest',
  compute,
  scale: {
    min: -25,
    max: 250,
    unit: '% more under compounding',
    // How much more interest compounding produces than simple interest does, as
    // a share of the simple figure. It goes NEGATIVE over a term shorter than
    // one compounding period, where simple interest is briefly the larger of the
    // two — the floor across every bound this form offers is about −15.2%, so
    // the first band starts below that. resolveBand sweeps anything it cannot
    // place into the LAST band, which would mislabel a small deficit as the most
    // extreme case, and compute.test.ts pins the sweep that proves it cannot.
    bands: [
      { id: 'good', label: 'Barely differs — under 10% apart', from: -25, to: 10 },
      { id: 'neutral', label: 'Noticeable gap — 10% to 30% more', from: 10, to: 30 },
      { id: 'warn', label: 'Wide gap — 30% to 75% more', from: 30, to: 75 },
      {
        id: 'critical',
        label: 'Simple interest understates it badly — 75%+ more',
        from: 75,
        to: 250,
      },
    ],
  },
  faqs: [
    {
      q: 'What is the simple interest formula?',
      a: 'Interest is I = P × r × t, where P is the principal, r is the annual rate written as a decimal, and t is the term in years. The total at the end is A = P(1 + rt). A $10,000 deposit at 6% for five years earns 10,000 × 0.06 × 5 = $3,000, so $13,000 comes back.',
    },
    {
      q: 'How is simple interest different from compound interest?',
      a: 'Simple interest is always calculated against the original principal, so the amount added in year ten is identical to the amount added in year one. Compound interest is calculated against the running balance, so each period starts from a larger number and the interest itself starts earning. Over long terms the two diverge enormously: the same $10,000 at 6% for forty years earns $24,000 simple, but about $99,000 compounded monthly.',
    },
    {
      q: 'Where is simple interest actually used?',
      a: 'Most car loans and personal instalment loans in the US accrue simple interest on the outstanding balance, as do many short-term bridging loans, margin accounts, and government bills quoted on a day-count basis. Flat-rate and "add-on" quotes in retail finance are simple interest too, which is why the advertised rate looks so much lower than the APR.',
    },
    {
      q: 'Can simple interest ever beat compound interest?',
      a: 'Yes, over a term shorter than a single compounding period. Take 12% for three months compounded annually: simple interest returns r × t = 3.00% of the principal, while compounding returns 1.12 raised to the power 0.25, minus one, which is 2.87%. Compounding only pulls ahead once at least one whole period has elapsed, which is why the difference shown here can be negative.',
    },
    {
      q: 'How do I enter a term in months or days?',
      a: 'Divide by twelve or by 365 and type the result into the box: six months is 0.5, and ninety days is 90 ÷ 365 = 0.2466. Lenders differ on whether they count 360 or 365 days in a year, and on a short term that choice alone moves the interest by about 1.4%, so check which convention the contract uses before relying on a figure to the cent.',
    },
  ],
  related: ['compound-interest-calculator', 'loan-calculator', 'savings-goal-calculator'],
  disclaimer: 'financial',
  lastReviewed: '2026-07-30',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

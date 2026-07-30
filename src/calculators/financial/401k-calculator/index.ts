import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

/**
 * The employer match is what separates this page from `retirement-calculator`.
 * That one grows a single monthly contribution you type in; this one derives the
 * contribution from a percentage of pay, adds what the employer puts in beside
 * it, and prices the gap between the match you are collecting and the match your
 * plan is offering. The scale is that capture rate, not the balance — the
 * balance is mostly a function of how much you earn, but the capture rate is
 * entirely a function of a number you can change this afternoon.
 *
 * The 2026 tax-year deferral limit lives in `compute.ts` with its source; the
 * year is repeated in the copy below so a stale figure is visible on the page
 * rather than buried in a constant.
 */
const def = {
  slug: '401k-calculator',
  category: 'financial',
  title: '401(k) Calculator',
  seoTitle: '401(k) Calculator: Balance at Retirement and Match',
  description:
    'Project your 401(k) balance at retirement, and see what contributing below your employer match cap costs you in free money by the time you stop working.',
  intro:
    'A 401(k) grows on three engines: what you defer from each paycheck, what your employer matches beside it, and the return both earn until you retire. Enter your pay, your contribution rate and your plan match, and this works out the balance you land on — and, more usefully, the employer money you forfeit every year you contribute below the match cap.',
  fields,
  resultLabel: 'Projected 401(k) balance at retirement',
  compute,
  scale: {
    min: 0,
    max: 100,
    unit: '% of match captured',
    // The share of the employer match your contribution rate actually unlocks.
    // A plan matching 50% of the first 6% pays nothing on the seventh percent
    // and nothing on the sixth if you only defer five, so this tops out the
    // moment your rate reaches the cap.
    bands: [
      { id: 'critical', label: 'Under half the match claimed', from: 0, to: 50 },
      { id: 'warn', label: 'Some match unclaimed — 50% to 90%', from: 50, to: 90 },
      { id: 'good', label: 'Nearly all the match claimed — 90% or more', from: 90, to: 100 },
    ],
  },
  faqs: [
    {
      q: 'How much should I contribute to get the full employer match?',
      a: 'At least as much as your plan\'s match cap. If the formula is "50% of the first 6%", you need to defer 6% of pay to collect every matched dollar; at 5% you collect five sixths of it and the rest is simply never paid. The cap is a percentage of your own pay, not of the match, which is why a pay rise raises the contribution needed to stay at the cap.',
    },
    {
      q: 'Is the employer match really worth chasing?',
      a: 'It is the highest guaranteed return available to most people. A 50% match is an instant 50% gain on the dollars it touches, before any investment return, and a 100% match doubles them. On the defaults here, the last one percent of pay costs about 58 dollars a month and collects 350 dollars of employer money in the first year — which compounds into roughly 65,000 dollars by 65.',
    },
    {
      q: 'How much can I put into a 401(k) in 2026?',
      a: 'The IRS elective deferral limit is 24,500 dollars for the 2026 tax year, set in Notice 2025-67. Savers aged 50 and over can add a catch-up of 8,000 dollars, and those aged 60 to 63 can add 11,250 dollars instead. Employer contributions sit outside that limit and count against a much larger combined cap. This calculator applies the basic deferral limit only.',
    },
    {
      q: 'Why does the projection assume my pay rises?',
      a: 'Because your contribution is a share of pay, not a fixed amount, so it grows as pay does. The maths is the future value of a growing annuity rather than a flat one. The IRS deferral limit is indexed to inflation too, so the model holds your contribution percentage constant and assumes the limit keeps pace rather than gradually squeezing you out of it.',
    },
    {
      q: 'Do I actually own the employer match?',
      a: 'Not always immediately. Many plans vest matching contributions over a schedule — often three years cliff or six years graded — and anything unvested is forfeited if you leave before then. Your own deferrals are always yours. It is worth reading your plan document before treating the match total here as money in hand.',
    },
    {
      q: 'How does this differ from a retirement calculator?',
      a: 'A general retirement projection takes a monthly contribution as a given and grows it. This one derives that contribution from your salary and your deferral rate, adds the employer match on top, applies the annual IRS limit, and shows what the match is worth as a separate line on the chart. If you have no employer plan, the plainer retirement projection is the better fit.',
    },
  ],
  related: ['retirement-calculator', 'compound-interest-calculator', 'salary-calculator'],
  disclaimer: 'financial',
  lastReviewed: '2026-07-30',
  priority: 0.9,
} satisfies CalculatorDef<typeof fields>

export default def

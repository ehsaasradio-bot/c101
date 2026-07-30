import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'date-difference-calculator',
  category: 'everyday',
  title: 'Date Difference Calculator',
  seoTitle: 'Date Difference Calculator: Days Between Two Dates',
  description:
    'Count the days, weeks, business days, months and years between two dates, with an option to include the end date in the total.',
  intro:
    'The difference between two dates is the number of midnights that separate them. This calculator counts those days in UTC — so a clock change never adds or loses one — and also breaks the span into weeks, weekdays, months and years.',
  fields,
  resultLabel: 'Days between the dates',
  faqs: [
    {
      q: 'Should I include the end date?',
      a: 'Include it when every day is being used or charged for, such as a hotel stay counted in nights versus days, a holiday booking, or a notice period. Leave it out when you only want the elapsed time between two moments.',
    },
    {
      q: 'How are business days counted?',
      a: 'Every day in the span that is not a Saturday or a Sunday counts as a business day. Public holidays are not deducted, because they differ by country and even by region, so subtract any that fall inside your range yourself.',
    },
    {
      q: 'Why do the months and days not add up to the total days?',
      a: 'Calendar months are between 28 and 31 days long, so "3 months and 5 days" is not a fixed number of days. The total days figure is the exact count, and the year-month-day breakdown is the same span expressed the way a calendar reads it.',
    },
    {
      q: 'Does daylight saving time change the result?',
      a: 'No. Both dates are compared at midnight UTC, which has no daylight-saving shifts. Subtracting local timestamps across a clock change gives a 23 or 25 hour day, which is exactly how date tools end up one day out.',
    },
    {
      q: 'Are leap years handled?',
      a: 'Yes. February 29 is a real day in the count, so any span crossing a leap day includes it, and the month breakdown borrows the correct 28 or 29 day length when it needs to.',
    },
  ],
  related: ['age-calculator', 'tip-calculator', 'due-date-calculator'],
  lastReviewed: '2026-07-27',
  priority: 0.7,
  compute,
} satisfies CalculatorDef<typeof fields>

export default def

import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'age-calculator',
  category: 'everyday',
  title: 'Age Calculator',
  seoTitle: 'Age Calculator: Exact Age in Years, Months and Days',
  description:
    'Find your exact age in years, months and days from any birth date, plus total days, weeks and months lived and a countdown to your next birthday.',
  intro:
    'Your age is the number of whole years, then whole months, then leftover days between your date of birth and a reference date. Enter both dates to see that breakdown, the same span expressed in days, weeks and months, and how long you have to wait for your next birthday.',
  fields,
  resultLabel: 'Age',
  compute,
  // No scale: there is no good or bad age, so a meter would be inventing a
  // judgement the domain does not have.
  faqs: [
    {
      q: 'How is exact age calculated?',
      a: 'Count the whole years from your birth date that fit before the reference date, then the whole months after that, then the days left over. When the reference day of the month is earlier than your birth day, one month is borrowed and the length of the preceding calendar month is added to the day count.',
    },
    {
      q: 'Why do months have different lengths in an age calculation?',
      a: 'Calendar months run from 28 to 31 days, so age in months is anchored to the date rather than to a fixed 30-day block. From 31 January to 28 February is one month, and so is 31 March to 30 April, even though the two spans differ in days.',
    },
    {
      q: 'When is the birthday of someone born on 29 February?',
      a: 'That date only exists in leap years. In common years the widely used civil convention, and the one this calculator follows, is that the anniversary falls on 1 March, so a leap-day birthday still recurs once every year.',
    },
    {
      q: 'Can I calculate my age on a future date?',
      a: 'Yes. The second field is any reference date, not just today, so you can set it to a future deadline, an application cut-off, or a retirement date and see exactly how old you will be then. Only a date before your birth is rejected.',
    },
    {
      q: 'How many days have I been alive?',
      a: 'The calculator counts the actual calendar days between the two dates, leap days included, and also shows that total as complete weeks and complete months. Because it counts whole days rather than hours, the figure does not depend on your time of birth or your time zone.',
    },
  ],
  related: ['date-difference-calculator', 'retirement-calculator', 'tip-calculator'],
  lastReviewed: '2026-07-27',
  priority: 0.8,
} satisfies CalculatorDef<typeof fields>

export default def

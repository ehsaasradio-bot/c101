import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'time-card-calculator',
  category: 'everyday',
  title: 'Time Card Calculator',
  // At most 70 characters.
  seoTitle: 'Time Card Calculator: Weekly Hours, Overtime & Pay',
  // A meta description: 51-160 characters, written for a search result.
  description:
    'Add up a week of clock-in and clock-out times, subtract unpaid breaks, split regular from overtime hours, and multiply by your hourly rate.',
  // The direct answer, for someone who reads nothing else on the page.
  intro:
    'Enter each day as a name, a clock-in and clock-out, and the unpaid break in minutes. This adds the week up in whole minutes, handles shifts that run past midnight, splits the total into regular and overtime hours under the rule you choose, and multiplies by your hourly rate for gross pay. Hours are shown both as a decimal figure, which is what payroll wants, and as hours and minutes, which is what you read. It works hours out from times, which the salary and paycheck calculators do not: hand the total from here to those for annual pay or take-home pay.',
  fields,
  resultLabel: 'Gross pay for the period',
  compute,
  faqs: [
    {
      q: 'How do I total an overnight shift that runs past midnight?',
      a: 'Enter it exactly as it was punched, for example 22:00-06:00, and let the calculator wrap it. When the clock-out reads a smaller number than the clock-in, the shift ran through midnight, so a full 24 hours is added to the clock-out before subtracting: 06:00 becomes 30:00, and 30:00 minus 22:00 is 8 hours. Subtracting the raw clock numbers instead gives minus 16 hours, which is the single most common mistake in hand-totalled timesheets and in the code written to replace them. A shift whose clock-out equals its clock-in is read as zero hours rather than a full day, because that pattern is almost always a mis-punch.',
    },
    {
      q: 'Does overtime start after 8 hours in a day or 40 in a week?',
      a: 'Under US federal law it is the week. The Fair Labor Standards Act, 29 U.S.C. section 207(a)(1), requires at least one and a half times the regular rate for hours worked in excess of forty in a workweek, and says nothing about the length of any single day. A 12-hour Monday inside a 38-hour week earns no federal overtime at all. Several states are stricter and count each day as well: California starts overtime past 8 hours in a workday under Labor Code section 510. Choose the rule that applies to you in the selector; whichever one is being used is named in the results, in the worked steps, and in the notes underneath.',
    },
    {
      q: 'Why does it show both 7.5 hours and 7h 30m?',
      a: 'Because payroll and people want different forms of the same number. Payroll systems multiply a decimal figure by a rate, so 7 hours 30 minutes has to become 7.5 before it is any use. People read a clock, and 7h 30m is what the day actually looked like. Both come from one integer count of minutes that is converted to hours exactly once, at the end, so the two can never disagree. Rounding each day to a decimal and then adding is what makes hand-kept sheets drift: 7.5 is exact, but 8 hours 20 minutes is 8.333 recurring, and five of those rounded to two decimals lose a minute across the week.',
    },
    {
      q: 'How should I type several days into a single box?',
      a: 'Use the name, then clock-in-clock-out, then the unpaid break in minutes: Mon 9:00-17:30 30. Separate days with commas, semicolons or just spaces, so a column pasted straight out of a spreadsheet still works even though its line breaks are flattened on the way in. Times can be 24-hour (17:30), 12-hour (5:30pm), or the four digits a punch clock prints (1730). The break is optional and defaults to zero, and it also accepts forms like 45min, 0.75h or 0:45. If an entry cannot be read, the error names that exact entry rather than dropping it silently.',
    },
    {
      q: 'Should paid rest breaks go in the break column?',
      a: 'No, only unpaid ones. Federal regulation 29 C.F.R. 785.19 treats a bona fide meal period, ordinarily 30 minutes or more with the employee relieved of all duty, as unpaid time that comes out of hours worked. Short rest breaks of roughly 5 to 20 minutes are counted as hours worked and are paid. So enter the 30-minute lunch and leave the two coffee breaks out entirely, since they already sit inside the clock-in to clock-out span and should stay there. A break longer than the shift itself is reported as an error rather than turned into negative hours.',
    },
    {
      q: 'Is the figure at the top my take-home pay?',
      a: 'No. Every number here is gross, meaning before federal and state income tax, Social Security and Medicare, retirement contributions, health premiums and any other payroll deduction. What reaches your account is smaller, often by a quarter or more. Take the gross figure from here into the paycheck calculator for an estimate after federal tax and FICA, or into the salary calculator to see the same hourly rate expressed as a weekly, monthly or annual figure.',
    },
  ],
  // Slugs, never hrefs. Every one must resolve or the conformance suite fails.
  related: [
    'salary-calculator',
    'paycheck-calculator',
    'business-days-calculator',
    'date-difference-calculator',
    'time-zone-converter-calculator',
  ],
  lastReviewed: '2026-07-31',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

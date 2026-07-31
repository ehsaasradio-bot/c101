import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'business-days-calculator',
  category: 'everyday',
  title: 'Business Days Calculator',
  seoTitle: 'Business Days Calculator: Working Days Between Two Dates',
  description:
    'Count working days between two dates, or add business days to a date. Skips weekends and US federal holidays, including their observed days.',
  intro:
    'A business day is a Monday to Friday that is not a public holiday. This calculator counts them between two dates, or adds a number of them to a date to answer "when will it arrive" — and it works the US federal holidays out from their own rules for whatever year you ask about, shifting a Saturday holiday to the Friday before and a Sunday one to the Monday after.',
  fields,
  // Matches the primary label the default mode returns, so the server-rendered
  // heading and the island's first repaint say the same thing.
  resultLabel: 'Date it lands on',
  compute,
  faqs: [
    {
      q: 'Does the start date count as a business day?',
      a: 'It depends which question you are asking. When counting a range, both the start and the end date are counted, so Monday to Friday of one week is five business days — the same answer a spreadsheet gives with NETWORKDAYS. When adding business days, the start date is not counted, so "3 business days from Monday" is Thursday. That is the convention carriers, banks and court deadlines use, and it is why the two modes are separate here.',
    },
    {
      q: 'Which holidays are deducted?',
      a: 'The eleven US federal holidays: New Year’s Day, Martin Luther King Jr. Day, Washington’s Birthday, Memorial Day, Juneteenth, Independence Day, Labor Day, Columbus Day, Veterans Day, Thanksgiving and Christmas. Each is computed from its rule rather than looked up in a list of dates, so the answer stays correct in any year — Thanksgiving is the fourth Thursday in November, Memorial Day the last Monday in May, Columbus Day the second Monday in October. Set the holiday selector to "none" for a plain Monday-to-Friday count.',
    },
    {
      q: 'What happens when a holiday falls on a weekend?',
      a: 'Under 5 U.S.C. 6103(b), a federal holiday falling on a Saturday is observed the preceding Friday, and one falling on a Sunday is observed the following Monday. The day off is what actually removes a working day, so the observed date is what gets deducted here. Independence Day 2026 is a Saturday, so the holiday is taken on Friday 3 July 2026; New Year’s Day 2028 is a Saturday, so it is taken on Friday 31 December 2027 — in the previous calendar year.',
    },
    {
      q: 'Are federal holidays the same as my company’s holidays?',
      a: 'No. Federal holidays are the days federal offices and most banks close. States add their own, many private employers skip Columbus Day and Veterans Day, and some add days that are not federal at all, such as the Friday after Thanksgiving or Christmas Eve. Use the federal setting as a baseline and adjust for any extra days your own calendar closes.',
    },
    {
      q: 'How is this different from a date difference calculator?',
      a: 'A date difference calculator counts every day between two dates and can tell you how many of them are weekdays. This one deducts public holidays as well, and it answers the reverse question too: given a date and a number of working days, which calendar date do you land on. That reverse direction is what a delivery estimate, a notice period or a filing deadline actually needs.',
    },
    {
      q: 'Does daylight saving time affect the count?',
      a: 'No. Every date is handled at midnight UTC, which has no clock changes. Subtracting local timestamps across a daylight-saving boundary gives a 23 or 25 hour day, and that is exactly how date tools end up one day out — landing you on the Monday when the real answer was the Friday.',
    },
  ],
  // Slugs, never hrefs. Every one must resolve or the conformance suite fails.
  related: ['date-difference-calculator', 'age-calculator', 'time-zone-converter-calculator'],
  lastReviewed: '2026-07-30',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

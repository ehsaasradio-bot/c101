import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'time-zone-converter-calculator',
  category: 'everyday',
  title: 'Time Zone Converter',
  seoTitle: 'Time Zone Converter: Convert a Time Between Two Cities',
  description:
    'Convert a date and time between two time zones. Shows the local time, whether it lands on the next or previous day, both UTC offsets and the gap.',
  intro:
    'Pick a date, a time and two zones, and this converts one to the other — telling you not just the clock time but the calendar day it lands on, which is the part that actually goes wrong. It reads each zone’s UTC offset for that exact date rather than assuming a fixed gap, so daylight saving is handled: New York is five hours behind London for most of the year, but four for the two weeks in March when the US has sprung forward and Europe has not.',
  fields,
  // Matches the primary label compute always returns, so the server-rendered
  // heading and the island's first repaint say the same thing.
  resultLabel: 'Converted local time',
  compute,
  faqs: [
    {
      q: 'Why does the converted time land on a different day?',
      a: 'Because a time zone offset can be larger than the number of hours left in the day. It is 10:30 on Tuesday morning in New York and already 23:30 on Tuesday night in Tokyo — but a 21:00 Tuesday call in New York is 10:00 on WEDNESDAY in Tokyo. The clock time is the easy half; the calendar day is what gets people. This calculator compares the two dates directly rather than the two clock times, and says "the next day" or "the day before" in as many words. Across the international date line the shift is guaranteed rather than occasional: Kiritimati is UTC+14 and Pago Pago is UTC-11, twenty-five hours apart, so they are essentially never on the same date.',
    },
    {
      q: 'What happens to a time that does not exist because of daylight saving?',
      a: 'When the clocks go forward, an hour is deleted. New York goes from 01:59:59 to 03:00:00 on the second Sunday in March, so 02:30 that morning never happens — no instant in history corresponds to it. Rather than refuse a time you can legitimately read off a calendar, this converter shifts it forward by the length of the gap, so 02:30 is treated as 03:30, and it tells you it did. That is the same choice a phone alarm makes, and the same one the "compatible" resolution in Java’s java.time and JavaScript’s Temporal makes. The alternative — throwing an error — is defensible but unhelpful, because the thing you actually wanted to know is when the meeting starts.',
    },
    {
      q: 'And a time that happens twice?',
      a: 'When the clocks go back, an hour repeats. New York goes from 01:59:59 daylight time to 01:00:00 standard time on the first Sunday in November, so 01:30 happens twice, an hour apart, at two different UTC offsets. This converter uses the FIRST occurrence — the one still on daylight time — and the notes tell you the second one exists and what its offset is. Picking the first is what "compatible" resolution does elsewhere, and it matches what someone means by "half past one" while it is happening for the first time. If you need the second, add an hour.',
    },
    {
      q: 'Why are only a few dozen zones offered instead of all of them?',
      a: 'Honesty about a real limitation. Offsets here come from your device’s own copy of the IANA time zone database, read by formatting the instant in each zone. That database is versioned and updated several times a year as governments change the rules, and the version bundled with the server that built this page is not necessarily the version in your browser. For a zone whose rules changed recently the two can disagree, and the page would show one answer and then flip to another. The zones offered were chosen because their rules have held steady for years. Places that have moved recently — Egypt reintroduced daylight saving in 2023, Mexico and Iran abolished it in 2022, and Chile, Fiji, Jordan, Syria, Greenland and Kazakhstan have all shifted — are deliberately left out rather than shown with a hidden risk of being wrong.',
    },
    {
      q: 'Why do India, Nepal and the Chatham Islands have odd offsets?',
      a: 'Nothing requires a time zone to be a whole number of hours from UTC; the offset is a political choice, and several places picked a fraction. India is UTC+5:30, a single zone spanning a country wide enough for two. Nepal is UTC+5:45, fifteen minutes ahead of India, a difference that exists largely to be distinct from it. The Chatham Islands are 45 minutes ahead of New Zealand at UTC+12:45, and observe daylight saving on top, making them UTC+13:45 in the southern summer. Any converter that stores offsets as whole hours is simply wrong for these, which is why this one works in minutes throughout.',
    },
    {
      q: 'Do the northern and southern hemispheres change clocks at the same time?',
      a: 'No, and that is why the gap between two cities is not a constant you can memorise. Sydney starts daylight saving on the first Sunday in October and ends it on the first Sunday in April; London starts on the last Sunday in March and ends on the last Sunday in October. So London and Sydney are 9 hours apart in January, 10 hours in June, and 11 hours in December. There are also short windows each year when one hemisphere has switched and the other has not, and the usual difference is off by an hour. This converter looks up both offsets for the specific date you entered rather than applying a remembered figure.',
    },
    {
      q: 'How do I know the answer is right?',
      a: 'Every conversion is checked two independent ways in the test suite. The first recomputes the target time straight from epoch milliseconds and the two derived offsets, which must agree with the instant the converter resolved. The second is a round trip: converting from zone A to zone B and then back from B to A has to return the original date and time, for thousands of sampled times across both zones. Published offsets — India at +5:30, Nepal at +5:45, Chatham at +12:45, Kiritimati at +14 — are used as outside anchors so a self-consistent but wrong derivation cannot pass, and the daylight saving transitions of the US, Europe and Australia are tested at the exact minute they occur.',
    },
  ],
  // Slugs, never hrefs. Every one must resolve or the conformance suite fails.
  related: ['date-difference-calculator', 'business-days-calculator', 'age-calculator'],
  lastReviewed: '2026-07-31',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

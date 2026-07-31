import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'ovulation-calculator',
  category: 'health',
  title: 'Ovulation Calculator',
  seoTitle: 'Ovulation Calculator: Fertile Window and Ovulation Date',
  description:
    'Estimate your ovulation date and six-day fertile window from your last period and cycle length, counted back from the next period rather than forward.',
  intro:
    'Ovulation is estimated by counting backwards from the next expected period, not forward from the last one. The luteal phase — from ovulation to the next period — is relatively fixed at about 14 days, while the follicular phase before it carries nearly all of the variation, so ovulation lands on cycle day (cycle length − 14): day 14 of a 28-day cycle, but day 21 of a 35-day one. The fertile window is the five days before ovulation plus the day itself, because sperm survive several days and the egg does not. These are calendar estimates from population averages, and they are not a contraceptive method.',
  fields,
  resultLabel: 'Estimated ovulation date',
  compute,
  /*
   * The meter tracks CYCLE LENGTH, not the date — the date has no good or bad
   * end, but cycle length decides whether a calendar estimate means anything.
   * ACOG puts the typical adult cycle at 21–35 days; consistently outside that
   * range is a reason to speak to a clinician rather than to trust a calendar,
   * which is a genuinely ranked axis and the only one here that is. The
   * boundaries are the same numbers compute uses for its out-of-range note, so
   * the meter and the working cannot disagree.
   */
  scale: {
    min: 20,
    max: 45,
    unit: ' days',
    bands: [
      { id: 'warn', label: 'Shorter than typical — under 21 days', from: 20, to: 21 },
      { id: 'good', label: 'Typical cycle length — 21 to 35 days', from: 21, to: 36 },
      { id: 'warn', label: 'Longer than typical — 36 days or more', from: 36, to: 999 },
    ],
  },
  faqs: [
    {
      q: 'Why is ovulation counted back from the next period instead of forward from the last one?',
      a: 'Because the two halves of the cycle are not equally variable. The luteal phase, from ovulation to the next period, is set by the lifespan of the corpus luteum and runs close to 14 days in most people. The follicular phase before it — the part where a follicle is being recruited and matured — is where the variation lives, and it is what makes one person’s cycle 24 days and another’s 34. Adding 14 to the last period would place ovulation on day 14 of every cycle whatever its length, which is precisely the mistake the method exists to avoid. Counting back from the next expected period keeps the fixed part fixed and lets the variable part vary.',
    },
    {
      q: 'When does a 35-day cycle ovulate?',
      a: 'Around cycle day 21, not day 14. Subtracting the 14-day luteal phase from a 35-day cycle leaves a 21-day follicular phase, so the fertile window runs from about cycle day 16 to cycle day 21 and the next period is still expected 15 calendar days after ovulation. The same arithmetic runs the other way: a 24-day cycle ovulates around day 10, with the window opening around day 5 — which can overlap the tail end of the period itself.',
    },
    {
      q: 'What exactly is the fertile window, and how long is it?',
      a: 'Six days: the five days before ovulation plus the day of ovulation. It is asymmetric because the two cells are. Sperm can survive in the reproductive tract for up to about five days, so intercourse days beforehand can still meet an egg, while the egg itself is fertilisable for roughly 24 hours after release. Wilcox, Weinberg and Baird (New England Journal of Medicine, 1995;333:1517–21) followed 625 cycles and traced every pregnancy to intercourse within that six-day interval, with none from the day after ovulation.',
    },
    {
      q: 'Can I use this to avoid pregnancy?',
      a: 'No. This is a calendar estimate, not a contraceptive method, and days it shows as outside the fertile window can still result in pregnancy. Two things break it: ovulation shifts by days from one month to the next even in regular cycles, and sperm survive long enough that an unexpectedly early ovulation reaches back across days you were told were safe. Fertility-awareness-based methods of family planning do exist and some are reasonably effective, but they rely on daily observation of basal body temperature, cervical mucus or hormone tests, plus instruction in a specific protocol — not on a date read off a calendar. If you are trying to avoid pregnancy, use a method intended for that and talk to a clinician about the options.',
    },
    {
      q: 'How accurate is a calendar estimate of ovulation?',
      a: 'Less accurate than it looks. It assumes your next period arrives exactly one average cycle after the last, and that your luteal phase is exactly 14 days; in practice cycle length varies from month to month for most people, and luteal phases of 11 to 16 days are common. Studies tracking ovulation directly find that even among people who describe their cycles as regular, the actual day of ovulation is spread across a range of about a week. Treat the window as a best guess and widen it in your head rather than narrowing it.',
    },
    {
      q: 'What actually measures ovulation rather than assuming it?',
      a: 'Three things, in rough order of how far ahead they warn you. Cervical mucus becomes clear and stretchy in the days before ovulation, which is the earliest sign and free. Urinary LH tests detect the luteinising-hormone surge that precedes ovulation by roughly 24 to 36 hours, so they catch the last day or two of the window. Basal body temperature rises about 0.3 °C after ovulation and stays up, which confirms that ovulation happened but only after the window has closed — useful for learning your own pattern over several months, not for timing the current one.',
    },
  ],
  // Slugs, never hrefs. Every one must resolve or the conformance suite fails.
  related: ['due-date-calculator', 'date-difference-calculator', 'age-calculator'],
  disclaimer: 'health',
  lastReviewed: '2026-07-31',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

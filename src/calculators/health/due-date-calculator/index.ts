import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'due-date-calculator',
  category: 'health',
  title: 'Due Date Calculator',
  seoTitle: 'Due Date Calculator: Estimate a Pregnancy Due Date',
  description:
    'Estimate a due date from the last menstrual period using Naegele’s rule, adjusted for cycle length, with gestational age, trimester and milestones.',
  intro:
    'Naegele’s rule estimates a due date as the first day of the last menstrual period plus 280 days — 40 weeks. Because the rule assumes a 28-day cycle with ovulation on day 14, this calculator shifts the whole dating window by the difference when your cycle is longer or shorter, then reports the gestational age, the trimester, and the dates the usual milestones fall on. It is an estimate: only about 4% of babies are born on the day it names.',
  fields,
  resultLabel: 'Estimated due date',
  compute,
  // Progress through the 280 days, banded by trimester. There is no good or bad
  // place to be on this axis; the bands mark stages, and only the last one —
  // past 42 weeks — carries a clinical meaning of its own.
  scale: {
    min: 0,
    max: 294,
    clampMax: 294,
    unit: ' days',
    bands: [
      { id: 'neutral', label: 'First trimester — up to 13 weeks 6 days', from: 0, to: 98 },
      { id: 'good', label: 'Second trimester — 14 to 27 weeks', from: 98, to: 196 },
      { id: 'excellent', label: 'Third trimester — 28 to 41 weeks', from: 196, to: 294 },
      { id: 'warn', label: 'Post-term — 42 weeks or more', from: 294, to: 999 },
    ],
  },
  faqs: [
    {
      q: 'How is a due date calculated from the last period?',
      a: 'By Naegele’s rule: add 280 days — 40 weeks — to the first day of the last menstrual period. The traditional shorthand is to subtract three months, add seven days, and add a year, which gives the same answer for almost every start date. The 280 days are counted from the period rather than from conception because the period is the event most people can date accurately, and the rule builds in a 14-day wait for ovulation.',
    },
    {
      q: 'What if my cycle is not 28 days long?',
      a: 'Naegele’s rule assumes ovulation on day 14 of a 28-day cycle. A longer cycle usually means a longer stretch before ovulation, not a longer second half, so this calculator adds the difference between your cycle length and 28 to the start of dating and moves every date with it. A 35-day cycle pushes the due date seven days later; a 21-day cycle pulls it seven days earlier.',
    },
    {
      q: 'How likely is a baby to arrive on the due date?',
      a: 'Around 4% of births fall on the estimated date itself. Roughly half arrive within a week of it and the large majority within two weeks either side, so the due date is best read as the middle of a range rather than as a deadline. Births are classed as early term from 37 weeks, full term from 39 weeks, late term from 41 weeks, and post-term from 42 weeks.',
    },
    {
      q: 'What does gestational age in weeks and days mean?',
      a: 'Gestational age is counted from the first day of the last period, not from conception, so at the moment of conception the pregnancy is already about two weeks old. It is written as completed weeks plus days — "12w 3d" means twelve full weeks and three days. Fetal age, or conceptional age, is roughly two weeks less, which is why the two numbers rarely match.',
    },
    {
      q: 'When do the trimesters start and end?',
      a: 'The first trimester runs to the end of week 13, the second from 14 weeks 0 days to the end of week 27, and the third from 28 weeks 0 days until birth. The boundaries are conventions rather than physiological events, and some sources place them a week either side of these, so a date near a boundary can be described differently elsewhere.',
    },
    {
      q: 'Is an ultrasound due date better than this one?',
      a: 'Usually, yes. A first-trimester scan measures the pregnancy itself and is accurate to within about five days, while last-period dating depends on remembering the date and on ovulation happening when the rule assumes. Where the two disagree by more than roughly a week, clinicians normally redate the pregnancy to the scan.',
    },
  ],
  related: ['date-difference-calculator', 'age-calculator', 'water-intake-calculator'],
  disclaimer: 'health',
  lastReviewed: '2026-07-30',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

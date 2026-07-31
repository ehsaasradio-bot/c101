import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'grade-calculator',
  category: 'everyday',
  title: 'Grade Calculator',
  seoTitle: 'Grade Calculator: What You Need on the Final Exam',
  description:
    'Find the score you need on your final exam to hit a target grade, plus your current weighted grade and the best and worst grades still possible.',
  intro:
    'Enter the marks you have already been given with the weight each one carries, say how much the final exam is worth, and name the grade you want: this works backwards from your target to the score the final has to earn. It also shows the grade you are carrying right now and the two grades that bracket it — the best you can finish with if you ace the final, and the worst if you skip it entirely. That is a different question from a GPA, which averages courses you have already completed; this one inverts the weighting of a single course to find a mark you have not earned yet.',
  fields,
  resultLabel: 'Score needed on the final',
  compute,
  scale: {
    min: 0,
    max: 120,
    unit: '%',
    bands: [
      { id: 'excellent', label: 'Comfortable', from: 0, to: 50 },
      { id: 'good', label: 'Manageable', from: 50, to: 70 },
      { id: 'neutral', label: 'Demanding', from: 70, to: 85 },
      { id: 'warn', label: 'Very demanding', from: 85, to: 100 },
      { id: 'critical', label: 'Out of reach', from: 100, to: 120 },
    ],
  },
  faqs: [
    {
      q: 'How do you work out what I need on the final exam?',
      a: 'Every mark you have already been given is multiplied by its weight and those products are added up, which gives the points you have banked toward the finished course. The final is worth some fraction of the course — its weight divided by the total weight entered — so the course grade is simply the banked points plus that fraction of whatever you score on the final. Because the relationship is a straight line, it inverts exactly: the required score is your target grade minus the points banked, divided by the final’s share. No searching or guessing is involved, and feeding the answer back in as a mark lands you on the target.',
    },
    {
      q: 'It says I need more than 100% on the final. What does that mean?',
      a: 'It means the target is no longer reachable. The arithmetic is still correct — that really is the score that would get you there — but no exam hands out more than full marks unless your course offers extra credit. The useful figure in that situation is the best grade still possible, which is what you would finish with after a perfect 100% on the final, and it is shown alongside. Aim at that instead, or ask your instructor whether any extra credit exists.',
    },
    {
      q: 'It says I need 0% or less. Have I already passed?',
      a: 'Yes, for the target you entered. A required score at or below zero means the points you have already banked, plus nothing at all from the final, still clear your target. The worst possible grade shown is what you would finish with if you scored zero on the final, and it is at or above your target. Do not read that as permission to skip the exam — many courses set a minimum exam mark or an attendance requirement independently of the grade arithmetic.',
    },
    {
      q: 'My weights do not add up to 100%. Is that a problem?',
      a: 'No, and it is the normal situation part-way through a term. The calculator treats everything you have entered — the marks plus the final — as the whole course, so each weight counts as its share of the total you typed rather than of a hard-coded 100. If your syllabus has graded work that has not happened yet, add it with the score you realistically expect and the answer will get sharper; leave it out and you are asking what you need assuming the course ends after the final.',
    },
    {
      q: 'How is this different from a GPA calculator?',
      a: 'A GPA calculator averages courses that are already finished: it takes your letter grades and credit hours and produces a credit-weighted mean. This page works inside one unfinished course and runs the arithmetic in the opposite direction, solving for a mark you have not earned yet. Use this one during the term to decide how hard to study, and the GPA calculator afterwards to see what the finished course did to your average.',
    },
    {
      q: 'How do I type my marks into a single box?',
      a: 'Write each graded item as a name, a colon, the score, and the weight, separating the items with semicolons: "Homework: 88, 15; Midterm 1: 84, 20". Both numbers are percentages and percent signs are ignored, so pasting them in is fine. The parser anchors on the colon, so multi-word names survive even when a paste from a spreadsheet has flattened the line breaks into spaces. If you would rather skip the names, a bare list of score-and-weight pairs such as "88 15, 79 15" works too.',
    },
  ],
  related: ['gpa-calculator', 'average-calculator', 'percentage-calculator'],
  lastReviewed: '2026-07-31',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

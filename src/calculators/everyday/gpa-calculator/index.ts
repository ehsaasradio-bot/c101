import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'gpa-calculator',
  category: 'everyday',
  title: 'GPA Calculator',
  seoTitle: 'GPA Calculator: Weighted and Unweighted 4.0 Scale',
  description:
    'Work out your term and cumulative GPA from a list of courses and credit hours, on either the standard 4.0 scale or a weighted 5.0 AP and honours scale.',
  intro:
    'A grade point average is a credit-weighted mean: multiply each course grade point by its credit hours to get quality points, add those up, and divide by the total credit hours — not by the number of courses. List your courses below, choose the unweighted 4.0 or weighted 5.0 scale, and add the credits you have already earned to see where your cumulative GPA lands.',
  fields,
  resultLabel: 'Cumulative GPA',
  compute,
  scale: {
    min: 0,
    max: 5,
    bands: [
      { id: 'critical', label: 'Academic risk', from: 0, to: 1 },
      { id: 'warn', label: 'Probation range', from: 1, to: 2 },
      { id: 'neutral', label: 'Satisfactory', from: 2, to: 3 },
      { id: 'good', label: 'Good standing', from: 3, to: 3.5 },
      { id: 'excellent', label: 'Honour roll range', from: 3.5, to: 5 },
    ],
  },
  faqs: [
    {
      q: 'How is a GPA actually calculated?',
      a: 'Each letter grade maps to a grade point — A is 4.0, B is 3.0, and each plus or minus moves it by 0.3. Multiply that grade point by the course credit hours to get quality points, add the quality points for every course, then divide by the total credit hours. The divisor is the credit total, never the number of courses, which is why a 4-credit A outweighs a 1-credit A.',
    },
    {
      q: 'What is the difference between a weighted and an unweighted GPA?',
      a: 'An unweighted GPA puts every course on the same 4.0 table, so an A is 4.0 whether it came from an AP class or a regular one. A weighted GPA adds a bonus for harder courses — usually 1.0 for AP and IB and 0.5 for honours — which pushes the top of the scale to 5.0. Colleges often recalculate an unweighted figure of their own, so it is worth knowing both.',
    },
    {
      q: 'How do I type my courses into a single box?',
      a: 'Write each course as a name, a colon, the letter grade, and the credit hours, then separate the courses with semicolons: "Organic Chemistry: A-, 4; English Composition: A, 3". The parser anchors on the colon, so multi-word course names stay in one piece even if a paste from a spreadsheet has collapsed the line breaks into spaces. If you leave the credit hours off, the course counts as one credit.',
    },
    {
      q: 'How does this work out my cumulative GPA?',
      a: 'It converts your previous GPA back into quality points by multiplying it by the credits you had already earned, adds this term’s quality points and credits, and divides again. That is exactly what a registrar does, and it is why one strong term moves a large transcript only slightly.',
    },
    {
      q: 'What about pass/fail, withdrawn, or repeated courses?',
      a: 'Pass/fail and withdrawn courses normally earn credit without grade points, so they sit outside the GPA entirely — leave them off the list. A repeated course depends on your school: some replace the old grade, in which case list only the new one, while others average both attempts, in which case list both.',
    },
  ],
  related: ['average-calculator', 'percentage-calculator', 'ratio-calculator'],
  lastReviewed: '2026-07-30',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

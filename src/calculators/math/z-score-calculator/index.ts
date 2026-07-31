import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'z-score-calculator',
  category: 'math',
  title: 'Z-Score Calculator',
  seoTitle: 'Z-Score Calculator: Percentile, Tail Areas and P-Value',
  description:
    'Find the z-score of a value from the mean and standard deviation, then see its percentile, the area in each tail, and the two-tailed p-value.',
  intro:
    'A z-score says how many standard deviations a value sits from the mean: z = (x − μ) ÷ σ. A z of 1.4 means the value is 1.4 standard deviations above average, which under a normal curve puts it at roughly the 92nd percentile — higher than about 92% of the group.',
  fields,
  resultLabel: 'Z-score',
  compute,
  // Colour-free semantic bands, symmetric about zero: the palette here encodes
  // how unusual a value is, not whether it is good news. A z of −3 on a
  // cholesterol test and a z of +3 on an exam are equally far out.
  scale: {
    min: -3,
    max: 3,
    clampMax: 3,
    unit: '',
    bands: [
      { id: 'critical', label: 'Extreme low outlier', from: -1_000_000, to: -3 },
      { id: 'warn', label: 'Unusually low', from: -3, to: -2 },
      { id: 'good', label: 'Below average', from: -2, to: -1 },
      { id: 'neutral', label: 'Typical, within 1 SD', from: -1, to: 1 },
      { id: 'good', label: 'Above average', from: 1, to: 2 },
      { id: 'warn', label: 'Unusually high', from: 2, to: 3 },
      { id: 'critical', label: 'Extreme high outlier', from: 3, to: 1_000_000 },
    ],
  },
  faqs: [
    {
      q: 'What does a z-score of 1.4 actually mean?',
      a: 'It means the value sits 1.4 standard deviations above the mean. Under a normal distribution that is the 92nd percentile: about 92% of the group scores lower and about 8% scores higher. A negative z-score is the mirror image — z = −1.4 beats only about 8% of the group.',
    },
    {
      q: 'How is the percentile worked out?',
      a: 'The percentile is the area under the standard normal curve to the left of your z-score, written Φ(z). That integral has no exact formula in ordinary functions, so this page uses the Abramowitz and Stegun approximation 26.2.17, which the authors bound at an error below 7.5 in 100 million. The tests check it against published z-tables and against numerical integration of the bell curve.',
    },
    {
      q: 'What is a good or bad z-score?',
      a: 'Neither. A z-score only measures distance, so whether far from the mean is good depends entirely on what you measured. As a rough guide to rarity: about 68% of a normal distribution falls within one standard deviation of the mean, 95% within two, and 99.7% within three, so anything past z = 3 is genuinely rare.',
    },
    {
      q: 'Why is the two-tailed p-value different from the tail area?',
      a: 'The area to the right of z answers a one-sided question — how likely is a value at least this high. The two-tailed p-value doubles it to cover both directions, answering how likely a value is at least this far from the mean either way. At z = 1.96 the right tail is about 2.5% and the two-tailed p-value is about 0.05, which is where that familiar threshold comes from.',
    },
    {
      q: 'Why does the standard deviation have to be more than zero?',
      a: 'A z-score divides the distance from the mean by the standard deviation. If the spread were zero, every observation would equal the mean, and there would be no unit left to measure distance in — the division is undefined rather than infinite. The calculator refuses the input instead of returning a meaningless number.',
    },
  ],
  related: ['average-calculator', 'percentage-calculator', 'percentage-change-calculator', 'confidence-interval-calculator'],
  lastReviewed: '2026-07-30',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

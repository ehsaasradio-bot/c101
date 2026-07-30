import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'average-calculator',
  category: 'math',
  title: 'Average Calculator',
  seoTitle: 'Average Calculator: Mean, Median, Mode & Std Dev',
  description:
    'Paste a list of numbers to get the mean, median, mode, range, minimum, maximum, count, and both sample and population standard deviation.',
  intro:
    'Paste or type your numbers separated by commas, spaces, or new lines. This calculator reports the mean alongside the median, mode, range, and both standard deviations, so you can see the centre of your data and how widely it is spread.',
  fields,
  resultLabel: 'Mean (average)',
  compute,
  faqs: [
    {
      q: 'What is the difference between mean, median, and mode?',
      a: 'The mean is the sum divided by the count. The median is the middle value once the data is sorted. The mode is the value that appears most often. A few extreme values pull the mean around, while the median barely moves.',
    },
    {
      q: 'Should I use sample or population standard deviation?',
      a: 'Use the population figure when your numbers are the entire group you care about. Use the sample figure, which divides by n minus 1, when the numbers are a sample drawn from a larger group you want to draw conclusions about.',
    },
    {
      q: 'Why does my data set show no mode?',
      a: 'A mode only exists when some value repeats. If every number in the list occurs exactly once there is no most-frequent value, so no mode is reported. When several values tie for the highest count, every one of them is listed.',
    },
    {
      q: 'How do I enter my numbers?',
      a: 'Separate them with commas, spaces, semicolons, or line breaks — a column pasted straight out of a spreadsheet works fine. Negative numbers and decimals are accepted, and anything that is not a number is reported as an error rather than silently skipped.',
    },
  ],
  related: ['percentage-calculator', 'percentage-change-calculator', 'gcd-lcm-calculator', 'z-score-calculator'],
  lastReviewed: '2026-07-27',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

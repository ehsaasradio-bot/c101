import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'confidence-interval-calculator',
  category: 'math',
  title: 'Confidence Interval Calculator',
  seoTitle: 'Confidence Interval Calculator: t or z Critical Values',
  description:
    'Build a confidence interval for a mean from the sample mean, standard deviation and size. Uses Student’s t when σ is estimated, z when it is known.',
  intro:
    'A confidence interval for a mean is x̄ ± c × (s ÷ √n). The only real decision is where the critical value c comes from: if the standard deviation was estimated from your own sample — which it nearly always was — c must come from Student’s t with n − 1 degrees of freedom, not from the normal curve. At n = 30 that widens the interval by about 4%; at n = 8 it widens it by 21%, which is why using z on a small sample quietly overstates how much you know.',
  fields,
  resultLabel: 'Confidence interval',
  compute,
  /**
   * The gauge measures how far the t critical value has had to stretch beyond
   * the z one — the small-sample correction, as a ratio. It is exactly 1
   * whenever z is in use, and climbs without limit as n falls toward 2.
   *
   * The bands are about how much the choice of distribution MATTERS, not about
   * whether the answer is good news: a wide interval from a small sample is an
   * honest interval, and the band labels say so.
   */
  scale: {
    min: 1,
    max: 1.3,
    clampMax: 1.3,
    unit: '×',
    bands: [
      // Open at the bottom: the ratio can never fall below 1, since t* > z* for
      // every finite degrees of freedom, but resolveBand falls back to the LAST
      // band when nothing matches, so the first band has to start below 1.
      { id: 'excellent', label: 'Same as the z interval', from: -1_000_000, to: 1.005 },
      { id: 'good', label: 'Barely wider than z', from: 1.005, to: 1.02 },
      { id: 'neutral', label: 'Noticeably wider than z', from: 1.02, to: 1.08 },
      { id: 'warn', label: 'Much wider than z', from: 1.08, to: 1.25 },
      { id: 'critical', label: 'Far wider than z — very small sample', from: 1.25, to: 1_000_000 },
    ],
  },
  faqs: [
    {
      q: 'Does a 95% confidence interval mean there is a 95% chance the true mean is inside it?',
      a: 'No, and this is the single most common misreading. The population mean is a fixed number, not a random one: it is either inside your interval or it is not, and no probability attaches to that once the interval is built. The 95% describes the procedure. If you drew fresh samples over and over and built an interval from each one the same way, about 95 in every 100 of those intervals would contain the true mean. You do not know whether the one in front of you is among them.',
    },
    {
      q: 'Should I use the t distribution or the z distribution?',
      a: 'Use t whenever the standard deviation came from the same sample as the mean, which is almost always. Substituting an estimated s for the unknown σ adds a second source of uncertainty, and Student’s t with n − 1 degrees of freedom is the distribution that accounts for it. Use z only when σ is genuinely known from outside the sample — set by the measuring instrument, established by a large body of prior work, or given by the problem. This calculator lets you pick, and always tells you which one it applied.',
    },
    {
      q: 'How much does it actually matter if I use z instead of t?',
      a: 'It depends entirely on the sample size, because t only approaches z as n grows. At n = 8 the 95% t critical value is 2.3646 against z’s 1.9600, so a z interval is about 17% too narrow — a materially overconfident claim. At n = 30 the gap is 4.4%, at n = 120 it is 1.0%, and past a few hundred observations it is invisible. The rule of thumb that "n above 30 means you can use z" is a convenience, not a theorem; t costs nothing to use and is correct at every n.',
    },
    {
      q: 'How are the critical values worked out?',
      a: 'The t critical value is a real inverse-t, not a lookup table or a polynomial fit. The two-sided tail P(|T| > t) equals the regularized incomplete beta function I_x(ν/2, 1/2) with x = ν/(ν + t²), which is evaluated by continued fraction to about 15 digits, and the quantile is recovered by bisecting it. The tests pin the results against published tables — t(0.975, 10) = 2.228, t(0.975, 30) = 2.042, t(0.975, 1) = 12.706. The z critical values invert the Abramowitz and Stegun 26.2.17 approximation to the normal CDF, the same one the z-score calculator uses, which is why the confidence levels stop at 99%: beyond that, the inversion error would start showing in the fourth decimal.',
    },
    {
      q: 'Why does a bigger sample give a narrower interval?',
      a: 'Two reasons, and only one of them is the famous one. The margin of error is c × s ÷ √n, so quadrupling the sample halves the margin — that is the 1 ÷ √n law, and it is why chasing a very tight interval gets expensive fast. The second reason is that the critical value itself shrinks: more data means more degrees of freedom, which pulls t in toward z. Both effects run the same way, which is what makes the curve on the chart steeper at the left than pure 1 ÷ √n alone would be.',
    },
    {
      q: 'Is this the range that 95% of individual values fall in?',
      a: 'No. A confidence interval is a statement about the mean, and it gets narrower as you collect more data. The range covering 95% of individual observations is a prediction interval, it is roughly x̄ ± 2s rather than x̄ ± 2s ÷ √n, and it does not shrink with sample size — more data pins down the average, it does not make the population less varied. With s = 15 and n = 30 the two differ by a factor of about five.',
    },
  ],
  // The z-score calculator is the natural sibling: same normal curve, same
  // approximation, opposite question — where one value sits in a distribution,
  // versus where a distribution's mean is likely to sit.
  related: ['z-score-calculator', 'average-calculator', 'probability-calculator'],
  lastReviewed: '2026-07-31',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

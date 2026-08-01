import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'linear-regression-calculator',
  category: 'science',
  title: 'Linear Regression Calculator',
  seoTitle: 'Linear Regression Calculator: Least Squares Line, r and R²',
  description:
    'Fit a least-squares line to your x and y data, predict y at any x, and see the slope, intercept, r, R² and standard error worked out step by step.',
  intro:
    'Paste your x values and your y values, and this fits the ordinary least-squares line through all of them — the line that makes the total of the squared vertical gaps as small as possible. The headline is the predicted y at whatever x you ask for; the equation, the slope and intercept, the correlation r, the R² and the standard error come with it, along with the sums the formulas are built from. Note the boundary against the slope calculator: that one draws the exact line through exactly two points, so nothing is fitted and nothing is left over. This one fits one line through many points, and the leftover is the whole story.',
  fields,
  resultLabel: 'Predicted y',
  compute,
  faqs: [
    {
      q: 'How is this different from a slope calculator?',
      a: 'A slope calculator takes exactly two points and returns the slope of the one line through them: (y2 − y1) ÷ (x2 − x1), an exact answer with no error term because two points determine a line completely. Linear regression takes many points, which will not lie on any single line, and finds the line that comes closest — the one minimising the sum of the squared vertical distances. That is why regression also reports r, R² and a standard error: they measure how far from the line the data actually sits. Give this calculator exactly two points and the two agree, because the best fit through two points is the line through them.',
    },
    {
      q: 'What does R² actually tell me?',
      a: 'It is the share of the variation in y that the line accounts for. The total variation, SST, splits exactly into the part the line explains, SSR, and the part left over as residual, SSE — and R² is SSR ÷ SST. An R² of 0.99 means the line accounts for 99% of the up-and-down in your y values and 1% is unexplained scatter. For a single predictor it is also just the square of the correlation r. What it does not tell you is whether a straight line was the right shape: data lying neatly along a curve can still post a high R².',
    },
    {
      q: 'What is the standard error of the estimate?',
      a: 'It is the typical size of a residual — how far, in the units of y, an actual observation tends to fall from the fitted line. It is the square root of SSE ÷ (n − 2), where the n − 2 is the degrees of freedom left after spending two of them estimating the slope and the intercept. Roughly two thirds of observations fall within one standard error of the line. The separate standard error of the slope answers a different question: how much the slope itself would wobble if you collected a fresh sample of the same size.',
    },
    {
      q: 'Can I predict a y value beyond the range of my data?',
      a: 'The calculator will do it and will warn you when you have. The arithmetic is the same, but the evidence is not: the fit is only ever evidence about the range of x it was fitted over, and extending it further assumes the same straight relationship keeps holding. That assumption fails all the time — growth curves flatten, dose responses saturate, trends reverse. Treat a prediction well outside the data as a hypothesis, not a result.',
    },
    {
      q: 'Why does it refuse when all my x values are the same?',
      a: 'Because the slope would be Sxy ÷ Sxx with Sxx equal to zero, which is a division by zero, and because no line of the form y = a + bx can pass through a vertical stack of points at all. Regression fits y as a function of x, and a vertical scatter gives many different y values for one x, which is not a function. Repeated x values are perfectly fine on their own — three measurements at week 2 is normal data — as long as the x values are not all identical.',
    },
    {
      q: 'Does a strong correlation mean x causes y?',
      a: 'No. r and R² measure how tightly the points follow a straight line and say nothing at all about direction or cause. The relationship may run the other way, both may be driven by a third factor, or the pairing may be coincidence — and with few data points, coincidence is easy. Regression is a description of the data you have. Causation is a claim about the world, and it needs an experiment or a strong argument from outside the numbers.',
    },
  ],
  related: [
    'slope-calculator',
    'average-calculator',
    'confidence-interval-calculator',
    'z-score-calculator',
  ],
  lastReviewed: '2026-08-01',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

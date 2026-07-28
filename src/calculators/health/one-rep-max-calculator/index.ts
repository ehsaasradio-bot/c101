import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'one-rep-max-calculator',
  category: 'health',
  title: 'One Rep Max Calculator',
  seoTitle: 'One Rep Max Calculator: 1RM from Reps (Epley & Brzycki)',
  description:
    'Estimate your one-rep max from a submaximal set using the Epley and Brzycki formulas, plus percentage training loads in kilograms or pounds.',
  intro:
    'Your one-rep max is the heaviest load you could lift once with good technique. Rather than testing it, you can estimate it from a set you already completed: enter the weight and the reps, and the calculator averages the Epley and Brzycki formulas, then breaks the result into the percentages most programs are written around.',
  fields,
  resultLabel: 'Estimated one-rep max',
  compute,
  faqs: [
    {
      q: 'How accurate is an estimated one-rep max?',
      a: 'Within a few percent for sets of 1 to 5 reps taken close to failure, and progressively looser above that. The formulas assume an average strength-endurance profile, so lifters who grind out high-rep sets tend to have their max overestimated.',
    },
    {
      q: 'Why does this calculator average two formulas?',
      a: 'Epley is generous at higher reps while Brzycki is conservative there, and they cross over near five reps. Averaging them cancels most of the individual bias and gives a number that sits closer to tested maxes across the usual rep range.',
    },
    {
      q: 'Why is the rep count capped at 12?',
      a: 'The Brzycki denominator of 37 minus reps collapses toward zero as reps climb, and both formulas were fitted on low-rep data. Past about a dozen reps the estimate is dominated by conditioning rather than maximal strength, so a heavier set gives a far better answer.',
    },
    {
      q: 'What are the percentages of my max used for?',
      a: 'Most strength programs prescribe load as a percentage of your one-rep max: roughly 85 to 95 percent for heavy strength work, 70 to 85 percent for hypertrophy volume, and below 70 percent for technique or speed practice.',
    },
    {
      q: 'Should I retest my one-rep max often?',
      a: 'A true max test is fatiguing and carries the most injury risk of anything you do in the gym. Re-estimating from a hard set of three to five reps every few weeks tracks progress just as well with a fraction of the cost.',
    },
  ],
  related: ['bmi-calculator', 'body-fat-calculator', 'macro-calculator'],
  disclaimer: 'health',
  lastReviewed: '2026-07-27',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

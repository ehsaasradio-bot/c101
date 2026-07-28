import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'ideal-weight-calculator',
  category: 'health',
  title: 'Ideal Weight Calculator',
  seoTitle: 'Ideal Weight Calculator: Devine, Robinson, Miller & Hamwi',
  description:
    'Find your ideal body weight from height and sex using the Devine, Robinson, Miller and Hamwi formulas, plus your healthy BMI weight range.',
  intro:
    'There is no single ideal weight, only a range. This calculator averages the four classic clinical formulas — Devine, Robinson, Miller and Hamwi — which all start from a base weight at 5 ft and add a fixed amount per inch of height, and shows the healthy BMI range alongside them for comparison.',
  fields,
  resultLabel: 'Ideal body weight',
  compute,
  faqs: [
    {
      q: 'Which ideal weight formula is most accurate?',
      a: 'None of them is accurate for an individual. Devine is the one most used clinically, mainly for drug dosing, while Miller tends to give the highest figures for tall people. Averaging all four avoids leaning on any single set of assumptions.',
    },
    {
      q: 'Why do the formulas only use height and sex?',
      a: 'They were written as simple bedside rules in the 1960s and 1970s, before body composition measurement was practical. That simplicity is also their weakness: frame size, muscle mass, age and body fat all change what a healthy weight actually is.',
    },
    {
      q: 'Should I aim for my ideal weight number?',
      a: 'Treat it as a rough reference point rather than a target. The healthy BMI range shown alongside it is far wider and more realistic, and any weight inside that range is generally reasonable for your height.',
    },
    {
      q: 'Do these formulas work for children or athletes?',
      a: 'No. They are calibrated on adults and break down below about 5 ft of height, and they take no account of muscle mass, so a well trained athlete will typically and correctly weigh more than the number shown here.',
    },
  ],
  related: ['bmi-calculator', 'body-fat-calculator', 'bmr-calculator'],
  disclaimer: 'health',
  lastReviewed: '2026-07-27',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

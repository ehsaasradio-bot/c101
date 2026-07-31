import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'lean-body-mass-calculator',
  category: 'health',
  title: 'Lean Body Mass Calculator',
  seoTitle: 'Lean Body Mass Calculator: Boer, James & Hume Formulas + FFMI',
  description:
    'Estimate lean body mass from height, weight and sex with the Boer, James and Hume formulas side by side, plus fat mass and fat-free mass index.',
  intro:
    'Lean body mass is everything you are made of except fat: muscle, bone, organs, skin and water. The three formulas below — Boer, James and Hume — predict it from height, weight and sex alone, with no body-fat measurement at all, and each was fitted to a different group of people, so they disagree. Seeing all three at once, alongside the figure your own body-fat percentage implies, shows how much of the answer is measurement and how much is population average.',
  fields,
  resultLabel: 'Lean body mass',
  compute,
  scale: {
    min: 12,
    max: 28,
    clampMax: 28,
    unit: 'kg/m²',
    // Fat-free mass index, not lean mass in kilograms — kilograms are not
    // comparable between a 160 cm and a 195 cm person. One band set, the male
    // reference ranges popularised by Kouri et al. (1995); women typically read
    // about 3 points lower, which the FAQ and the returned note both say.
    bands: [
      { id: 'warn', label: 'Below average — under 17', from: 0, to: 17 },
      { id: 'neutral', label: 'Average — 17 to 20', from: 17, to: 20 },
      { id: 'good', label: 'Above average — 20 to 22', from: 20, to: 22 },
      { id: 'excellent', label: 'Athletic — 22 to 25', from: 22, to: 25 },
      { id: 'warn', label: 'Exceptional — 25 or more', from: 25, to: 100 },
    ],
  },
  faqs: [
    {
      q: 'Why do the three formulas give different answers?',
      a: 'Because each is a regression fitted to a different set of people. Boer (1984) came from body-water and cadaver data, James (1976) from a 1970s clinical sample that drug dosing still uses, and Hume (1966) from a small British group measured by total body potassium. None of them measured you. For an average 80 kg, 178 cm man they land about 5 kg apart, and that gap is the realistic uncertainty of predicting lean mass from height and weight alone.',
    },
    {
      q: 'Which lean body mass formula should I use?',
      a: 'Boer is the usual first choice for adults of normal weight, which is why it is the headline figure here. James is the one clinical dosing guidelines still specify, but it is known to break down at a high BMI because its quadratic term eventually pulls the estimate downward as weight rises. Hume tends to read a few kilograms low for men. If you have a real body-fat measurement, the figure derived from it beats all three.',
    },
    {
      q: 'What is a good fat-free mass index?',
      a: 'FFMI is lean mass in kilograms divided by height in metres squared, so it does for lean tissue what BMI does for total weight. Around 17 to 20 is typical for an untrained man, 20 to 22 is visibly muscular, and 22 to 25 is athletic. Readings above about 25 are rare in drug-free lifters. Women typically sit roughly 3 points lower at any given level of training.',
    },
    {
      q: 'How is this different from a body fat calculator?',
      a: 'A body fat calculator needs measurements of you — tape circumferences, calipers or a scan — and returns a percentage. This one mostly runs the other way: three of its four estimates use nothing but height, weight and sex, so you get a lean-mass figure with only a scale and a wall. The fourth converts a body-fat percentage you already have. Comparing the two is the useful part, because a large gap means you carry unusually much or unusually little muscle for your size.',
    },
    {
      q: 'Why does the calculator refuse some height and weight combinations?',
      a: 'Each equation is a straight-line or quadratic fit over the range of bodies it was built from, and outside that range it produces impossible arithmetic rather than an error of its own. A very tall, very light frame makes Boer predict more lean tissue than the whole body weighs, and a very high BMI drives the James estimate below zero. Rather than print a figure that cannot be true, the calculator says so and names the equation that failed.',
    },
    {
      q: 'Why does lean body mass matter?',
      a: 'It is the figure that protein targets, resting metabolic rate equations and several drug doses are actually scaled to, because fat tissue is far less metabolically active than everything else. It is also the number to watch during a diet: losing weight is easy, losing weight while lean mass holds steady is the part that takes effort.',
    },
  ],
  related: [
    'body-fat-calculator',
    'bmi-calculator',
    'ideal-weight-calculator',
    'macro-calculator',
    'bmr-calculator',
  ],
  disclaimer: 'health',
  lastReviewed: '2026-07-31',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

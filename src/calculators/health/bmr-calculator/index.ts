import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'bmr-calculator',
  category: 'health',
  title: 'BMR Calculator',
  seoTitle: 'BMR Calculator: Basal Metabolic Rate (Mifflin-St Jeor)',
  description:
    'Calculate your basal metabolic rate with the Mifflin-St Jeor equation in metric or imperial units, and see daily calorie needs at four activity levels.',
  intro:
    'Your basal metabolic rate is the energy your body uses at complete rest, just keeping your heart, brain, and organs running. This calculator uses the Mifflin-St Jeor equation — the modern standard, and more accurate than the older Harris-Benedict formula for most adults.',
  fields,
  resultLabel: 'Basal metabolic rate',
  compute,
  faqs: [
    {
      q: 'What is the difference between BMR and TDEE?',
      a: 'BMR is what you burn at complete rest over 24 hours. TDEE, your total daily energy expenditure, adds everything else — digestion, walking around, and deliberate exercise. TDEE is normally 20% to 75% higher than BMR depending on how active you are.',
    },
    {
      q: 'Why does this calculator use Mifflin-St Jeor?',
      a: 'Mifflin-St Jeor was published in 1990 on a modern population and validation studies consistently find it lands within 10% of measured resting energy expenditure more often than the 1919 Harris-Benedict equation it replaced.',
    },
    {
      q: 'Should I eat as few calories as my BMR?',
      a: 'No. Eating at or below your BMR for long periods is generally not advisable, because it ignores the energy you spend simply moving through a day. Weight-loss targets are normally set as a modest deficit against TDEE, not against BMR.',
    },
    {
      q: 'Why does the formula subtract for age?',
      a: 'Resting energy expenditure falls roughly 5 kcal per day for each year of age in this equation, mostly because lean muscle mass tends to decline over time and muscle is far more metabolically active at rest than fat tissue.',
    },
    {
      q: 'How accurate is a calculated BMR?',
      a: 'It is an estimate from population averages, so individuals can sit several hundred calories either side of the number. Body composition, thyroid function, and genetics all shift it. Treat the result as a starting point and adjust from real-world results.',
    },
  ],
  related: ['tdee-calculator', 'bmi-calculator', 'macro-calculator'],
  disclaimer: 'health',
  lastReviewed: '2026-07-27',
  priority: 0.8,
} satisfies CalculatorDef<typeof fields>

export default def

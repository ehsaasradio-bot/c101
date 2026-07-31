import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'bmi-calculator',
  category: 'health',
  title: 'BMI Calculator',
  seoTitle: 'BMI Calculator: Body Mass Index for Adults (Metric & Imperial)',
  description:
    'Calculate your body mass index from height and weight in metric or imperial units, see your BMI category, and find your healthy weight range.',
  intro:
    'BMI is your weight divided by the square of your height. It is a quick screening number for whether your weight sits in a healthy range for your height — not a measure of body fat or health on its own.',
  fields,
  resultLabel: 'Body mass index',
  compute,
  scale: {
    min: 12,
    max: 40,
    clampMax: 40,
    unit: '',
    bands: [
      { id: 'warn', label: 'Underweight', from: 0, to: 18.5 },
      { id: 'excellent', label: 'Healthy weight', from: 18.5, to: 25 },
      { id: 'warn', label: 'Overweight', from: 25, to: 30 },
      { id: 'critical', label: 'Obese', from: 30, to: 999 },
    ],
  },
  faqs: [
    {
      q: 'What is a healthy BMI?',
      a: 'For most adults, 18.5 to 24.9 is classed as a healthy weight. Below 18.5 is underweight, 25 to 29.9 is overweight, and 30 or above is obese. These thresholds apply to adults aged 20 and over.',
    },
    {
      q: 'Is BMI accurate?',
      a: 'It is accurate as a population screening tool and poor as an individual diagnosis. BMI cannot tell muscle from fat, so muscular athletes frequently score as overweight while people with low muscle mass can score healthy despite high body fat.',
    },
    {
      q: 'Does BMI differ for men and women?',
      a: 'The thresholds are the same for both. Women typically carry more body fat than men at the same BMI, which is one of the reasons BMI is best paired with a waist measurement.',
    },
    {
      q: 'What should I measure alongside BMI?',
      a: 'Waist circumference is the most useful companion measure, because abdominal fat carries the clearest health risk. A waist over 94cm (37in) for men or 80cm (31.5in) for women suggests increased risk regardless of BMI.',
    },
  ],
  related: ['body-fat-calculator', 'ideal-weight-calculator', 'tdee-calculator', 'body-surface-area-calculator'],
  disclaimer: 'health',
  lastReviewed: '2026-07-27',
  priority: 0.9,
} satisfies CalculatorDef<typeof fields>

export default def

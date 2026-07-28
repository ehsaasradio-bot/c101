import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'body-fat-calculator',
  category: 'health',
  title: 'Body Fat Calculator',
  seoTitle: 'Body Fat Calculator: US Navy Method (Metric & Imperial)',
  description:
    'Estimate your body fat percentage with the US Navy tape method from height, neck, waist and hip measurements, in centimetres or inches.',
  intro:
    'The US Navy method estimates body fat from a tape measure alone: it compares the circumference of the places you store fat against your height. Enter your measurements below to see your percentage, how your body weight splits into fat and lean mass, and where the figure falls against the standard fitness ranges.',
  fields,
  resultLabel: 'Body fat',
  compute,
  scale: {
    min: 0,
    max: 50,
    clampMax: 50,
    unit: '%',
    // One band set, the male reference ranges (ACE). Female healthy ranges run
    // roughly 8–10 points higher — see the FAQ and the note compute returns.
    bands: [
      { id: 'warn', label: 'Essential fat only — under 6%', from: 0, to: 6 },
      { id: 'excellent', label: 'Athletic — 6% to 14%', from: 6, to: 14 },
      { id: 'good', label: 'Fitness — 14% to 18%', from: 14, to: 18 },
      { id: 'neutral', label: 'Average — 18% to 25%', from: 18, to: 25 },
      { id: 'critical', label: 'Obese — 25% or more', from: 25, to: 100 },
    ],
  },
  faqs: [
    {
      q: 'How accurate is the US Navy body fat method?',
      a: 'It typically lands within 3 to 4 percentage points of a DEXA scan, which is good enough to track a trend but not precise enough to chase a single number. Its strength is repeatability: measure the same way each time and the direction of change is reliable even if the absolute figure is off.',
    },
    {
      q: 'Why are the ranges different for men and women?',
      a: 'Women carry more essential fat — roughly 10 to 13 percent of body mass versus 2 to 5 percent for men — because of reproductive and hormonal tissue. A healthy female reading therefore sits about 8 to 10 percentage points above the male figure, so 25 percent is average for a woman but high for a man.',
    },
    {
      q: 'Where exactly should I measure my waist and neck?',
      a: 'Measure the neck just below the larynx with the tape sloping slightly downward at the front. Men measure the waist horizontally at the navel; women measure at the narrowest point of the torso, and the hips at the widest point of the buttocks. Keep the tape snug without compressing the skin.',
    },
    {
      q: 'Why does the calculator need my height?',
      a: 'Circumference alone cannot tell a large frame from a fat one. Height acts as the scaling term in the equation, so a 90cm waist reads very differently on someone 160cm tall than on someone 195cm tall. It is why two people with identical waists can get results ten points apart.',
    },
    {
      q: 'Why does it ask for my weight if the equation does not use it?',
      a: 'It does not affect the percentage at all — the Navy equation runs on circumferences and height alone. Weight is used only afterwards, to turn the percentage into two figures you can act on: how many kilograms of you are fat and how many are everything else. Lean mass is the number worth protecting during a diet.',
    },
    {
      q: 'Is body fat percentage better than BMI?',
      a: 'For an individual, usually yes, because it separates fat from muscle where BMI cannot — a muscular athlete can read obese on BMI and athletic here. BMI remains useful as a fast population-level screen and needs only a scale and a wall.',
    },
  ],
  related: ['bmi-calculator', 'ideal-weight-calculator', 'tdee-calculator'],
  disclaimer: 'health',
  lastReviewed: '2026-07-27',
  priority: 0.8,
} satisfies CalculatorDef<typeof fields>

export default def

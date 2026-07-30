import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'tdee-calculator',
  category: 'health',
  title: 'TDEE Calculator',
  seoTitle: 'TDEE Calculator: Daily Calorie Needs (Mifflin-St Jeor)',
  description:
    'Estimate your total daily energy expenditure from height, weight, age, sex and activity level, plus the intake for losing or gaining weight.',
  intro:
    'Your TDEE is the number of calories you burn in a day once activity is counted. It starts from your resting metabolic rate, calculated with the Mifflin-St Jeor equation, and multiplies it by an activity factor. Eat at that number to hold your weight, below it to lose, above it to gain.',
  fields,
  resultLabel: 'Maintenance calories',
  compute,
  faqs: [
    {
      q: 'What is the difference between BMR and TDEE?',
      a: 'BMR is what you would burn lying still all day keeping your organs running. TDEE adds everything else — digestion, walking, fidgeting and training — and is typically 20% to 90% higher than BMR depending on how active you are.',
    },
    {
      q: 'Which activity level should I choose?',
      a: 'Pick the one that matches deliberate training, not how busy your day feels. Most desk workers who train three to five times a week land on moderately active; choosing a level too high is the single most common reason a calorie target fails to work.',
    },
    {
      q: 'How accurate is the Mifflin-St Jeor equation?',
      a: 'It is the most accurate of the common prediction equations for people who are not extremely lean or extremely heavy, but individual metabolic rate still varies by roughly plus or minus 10% around the prediction.',
    },
    {
      q: 'Why does a 500 calorie deficit not always lose a pound a week?',
      a: 'As you lose weight your body becomes smaller and cheaper to run, so your TDEE falls and the deficit shrinks. Unconscious drops in daily movement also offset part of the gap. Recalculate every few kilograms of change.',
    },
    {
      q: 'Should I eat back the calories I burn exercising?',
      a: 'No, not if you picked an activity level that already reflects your training. The multiplier is designed to include exercise, so logging workouts separately and eating those calories back would double-count them.',
    },
  ],
  related: ['bmr-calculator', 'macro-calculator', 'bmi-calculator', 'one-rep-max-calculator'],
  disclaimer: 'health',
  lastReviewed: '2026-07-27',
  priority: 0.9,
} satisfies CalculatorDef<typeof fields>

export default def

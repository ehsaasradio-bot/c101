import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'macro-calculator',
  category: 'health',
  title: 'Macro Calculator',
  seoTitle: 'Macro Calculator: Daily Protein, Carbs & Fat in Grams',
  description:
    'Turn a daily calorie target into grams of protein, carbohydrate, and fat using a balanced, low-carb, or high-carb split. Shows the calories behind each macro.',
  intro:
    'Macros are just your calorie target sliced three ways. Pick a split, and each share is converted to grams at 4 kcal per gram for protein and carbohydrate and 9 kcal per gram for fat — the numbers you actually track in a food diary.',
  fields,
  resultLabel: 'Daily protein',
  compute,
  faqs: [
    {
      q: 'How do I convert calories into grams of each macro?',
      a: 'Multiply your calorie target by the percentage assigned to that macro, then divide by its energy density: 4 kcal per gram for protein and carbohydrate, and 9 kcal per gram for fat. A 2,000 kcal day at 30% protein gives 600 kcal, which is 150 grams.',
    },
    {
      q: 'Which macro split should I choose?',
      a: 'A balanced 30/40/30 split suits most people and most goals. Low carb favours steadier appetite and works well for sedentary or insulin-resistant people, while a high carb split supports high training volumes in endurance and team sports.',
    },
    {
      q: 'Does hitting my macros matter more than hitting my calories?',
      a: 'Calories decide whether you gain or lose weight, so they come first. Macros decide the composition of that change — adequate protein preserves muscle in a deficit and supports growth in a surplus, which is why protein is the macro worth being strict about.',
    },
    {
      q: 'Why does the fat target look so small in grams?',
      a: 'Fat carries more than twice the energy of protein or carbohydrate per gram, so an identical percentage of calories buys far fewer grams. At 2,000 kcal, 30% fat is only about 67 grams while 30% protein is 150 grams.',
    },
  ],
  related: ['tdee-calculator', 'bmr-calculator', 'bmi-calculator'],
  disclaimer: 'health',
  lastReviewed: '2026-07-27',
  priority: 0.8,
} satisfies CalculatorDef<typeof fields>

export default def

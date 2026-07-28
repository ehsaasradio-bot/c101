import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'water-intake-calculator',
  category: 'health',
  title: 'Water Intake Calculator',
  seoTitle: 'Water Intake Calculator: How Much Water Should You Drink?',
  description:
    'Work out how much water to drink each day from your body weight, exercise, and climate — in litres, millilitres, cups, and glasses.',
  intro:
    'Daily fluid needs scale with body size, sweat losses, and heat. A common working estimate is about 35 ml of water per kilogram of body weight, plus roughly 500 ml for every 30 minutes of exercise, raised by about 15% in hot or humid conditions.',
  fields,
  resultLabel: 'Daily water target',
  compute,
  faqs: [
    {
      q: 'How much water should I drink a day?',
      a: 'For most healthy adults, about 35 ml per kilogram of body weight is a reasonable baseline — roughly 2.5 litres for a 70 kg person — plus around 500 ml for every 30 minutes of exercise. Hot or humid conditions push that higher still.',
    },
    {
      q: 'Does the eight-glasses-a-day rule hold up?',
      a: 'It is a rough memory aid rather than a finding. Eight 250 ml glasses is two litres, which lands near the baseline for a smaller adult but understates the need of a large or very active person and overstates it for a small sedentary one.',
    },
    {
      q: 'Do coffee, tea, and food count toward the total?',
      a: 'Yes. Caffeinated drinks are mildly diuretic but still contribute net fluid, and food supplies roughly 20% of total intake — more if you eat a lot of fruit, vegetables, soup, or yoghurt. This calculator reports total fluid from all sources.',
    },
    {
      q: 'Can you drink too much water?',
      a: 'You can. Drinking far more than the kidneys can excrete dilutes blood sodium, a condition called hyponatraemia, which causes headache, nausea, confusion, and in severe cases seizures. Endurance athletes who over-drink plain water are most at risk.',
    },
    {
      q: 'How can I tell if I am drinking enough?',
      a: 'Urine colour is the simplest check: pale straw suggests adequate hydration, while dark yellow or amber suggests you are behind. Persistent thirst, dry mouth, headache, and low energy are other common signals of a shortfall.',
    },
  ],
  related: ['tdee-calculator', 'bmr-calculator', 'bmi-calculator'],
  disclaimer: 'health',
  lastReviewed: '2026-07-27',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

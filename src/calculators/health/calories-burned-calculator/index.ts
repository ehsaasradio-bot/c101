import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'calories-burned-calculator',
  category: 'health',
  title: 'Calories Burned Calculator',
  seoTitle: 'Calories Burned Calculator: MET Formula, Gross and Net',
  description:
    'Work out the calories burned in one session from its MET value, your body weight and its length — with the gross and net figures shown separately.',
  intro:
    'This works out what a single bout of activity costs, using the MET equation: calories per minute are the activity’s MET value times 3.5 times your body weight in kilograms, divided by 200. Because one MET is simply resting metabolism, the gross total includes calories you would have burned anyway — so the net figure, which strips that share out, is shown beside it.',
  fields,
  resultLabel: 'Calories burned',
  compute,
  faqs: [
    {
      q: 'What is a MET?',
      a: 'A metabolic equivalent of task. One MET is the rate at which your body uses oxygen sitting quietly — about 3.5 millilitres per kilogram of body mass per minute. An activity rated at 6 METs demands six times that rate, so the MET value is a multiple of resting metabolism rather than a figure added on top of it.',
    },
    {
      q: 'What is the difference between gross and net calories burned?',
      a: 'Gross is everything your body spent during the session; net is only the part the activity itself is responsible for. Because a MET is a multiple of resting metabolism, one MET of the total was going to be burned regardless, so net uses (MET − 1) where gross uses MET. For a 45-minute brisk walk at 70 kg that is 237 kcal gross but 182 kcal net — the other 55 kcal you would have spent sitting still. Use the net figure when adding a workout on top of a daily expenditure estimate, or you will count that share twice.',
    },
    {
      q: 'Where do the MET values come from?',
      a: 'The 2011 Compendium of Physical Activities (Ainsworth et al., Med Sci Sports Exerc 2011;43(8):1575-1581), the standard reference that assigns a code and a MET value to several hundred activities. It is the current edition, following updates in 1993 and 2000.',
    },
    {
      q: 'How accurate is this for me personally?',
      a: 'Treat it as a ballpark. MET values are population averages measured on healthy adults of roughly 70 kg, and individual burn varies substantially with fitness, terrain, gradient, technique and how economically you move. Two people of the same weight doing the same session can differ by 20% or more, and the equation cannot see any of that.',
    },
    {
      q: 'Why is this not the same as my watch or treadmill?',
      a: 'A watch estimates from heart rate or motion and applies its own proprietary model, and a treadmill usually reports gross calories without knowing your body composition. Neither is measuring the gas you actually breathe, which is what a metabolic cart in a lab does. Different assumptions produce different numbers for the same workout; consistency over time matters more than which one is right.',
    },
    {
      q: 'Does this include the calories burned after exercise?',
      a: 'No. Metabolism stays slightly raised for a while after hard work — excess post-exercise oxygen consumption — but it is modest for most sessions, typically well under a tenth of the workout itself, and the MET equation makes no attempt to model it.',
    },
  ],
  related: [
    'tdee-calculator',
    'bmr-calculator',
    'vo2max-calculator',
    'running-pace-calculator',
    'macro-calculator',
  ],
  disclaimer: 'health',
  lastReviewed: '2026-07-31',
  priority: 0.8,
} satisfies CalculatorDef<typeof fields>

export default def

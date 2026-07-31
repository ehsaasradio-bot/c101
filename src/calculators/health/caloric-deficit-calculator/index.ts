import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'caloric-deficit-calculator',
  category: 'health',
  title: 'Caloric Deficit Calculator',
  seoTitle: 'Caloric Deficit Calculator: Daily Intake, Rate and Goal Date',
  description:
    'Turn maintenance calories and a goal weight into a daily intake, a weekly rate and a date — with the 3,500-calorie rule shown against a model that adapts.',
  intro:
    'Give this your maintenance calories and the weight you are aiming for, and it returns the intake that gets you there, how fast the weight moves, and the day you arrive. It answers that last question twice: once with the familiar 3,500 calories per pound rule, and once with maintenance allowed to fall as you do. The two answers are weeks or months apart, and the second is the one worth planning around.',
  fields,
  resultLabel: 'Daily calorie target',
  compute,
  scale: {
    min: -25,
    max: 40,
    clampMax: 40,
    unit: '%',
    bands: [
      { id: 'neutral', label: 'Calorie surplus', from: -1000, to: 0 },
      { id: 'good', label: 'Gentle deficit', from: 0, to: 10 },
      { id: 'excellent', label: 'Moderate deficit', from: 10, to: 20 },
      { id: 'warn', label: 'Aggressive deficit', from: 20, to: 25 },
      { id: 'critical', label: 'Very aggressive deficit', from: 25, to: 999 },
    ],
  },
  faqs: [
    {
      q: 'How big a calorie deficit do I need to lose 1 kg a week?',
      a: 'One kilogram is treated as about 7,716 calories, so a kilogram a week needs a deficit of roughly 1,102 calories a day. For most people that pushes intake below the level considered safe without medical supervision, which is why this calculator caps the deficit and shows the fastest plan that stays above the floor instead.',
    },
    {
      q: 'Why does the 3,500 calories per pound rule not work?',
      a: 'It comes from Max Wishnofsky in 1958 and assumes two things that are not true over months: that everything you lose is fat, and that your metabolism is unchanged by losing it. In reality a smaller body costs less to run, so your maintenance figure falls as your weight does and the same intake becomes a smaller and smaller deficit. The rule is close enough for a fortnight and increasingly wrong after that, always in the optimistic direction.',
    },
    {
      q: 'How does this calculator model metabolic adaptation?',
      a: 'It uses the rule of thumb from Kevin Hall and colleagues that a lasting change of about 10 calories a day in intake corresponds to about one pound of eventual weight change. Read as a slope, that means maintenance falls roughly 10 calories a day for every pound you lose. Combined with the 3,500 figure it gives a 350-day time constant: weight change is about 63% complete after a year and then flattens toward a plateau.',
    },
    {
      q: 'Why does the calculator say my goal is never reached?',
      a: 'Because a fixed intake has a fixed plateau. At the modelled slope, the total weight an intake can ever take off is about 50 times your weekly target rate — so a plan built around losing 0.4 kg a week bottoms out after 20 kg, regardless of how long you hold it. Reaching a goal beyond that means recalculating partway with your new, lower maintenance figure.',
    },
    {
      q: 'Why will the calculator not show me a very low calorie plan?',
      a: 'Intakes below roughly 1,200 calories a day for women and 1,500 for men are very-low-calorie diets, which are clinical interventions run with medical supervision because of the risk to muscle mass, micronutrient intake, and gallbladder health. If your requested rate would breach that floor, the deficit is capped and the page says so rather than printing a plan it should not be handing out.',
    },
    {
      q: 'Do I need my TDEE before using this?',
      a: 'Yes — maintenance calories are the one input this page does not estimate for you, because that is the TDEE calculator’s job. Work it out there from your height, weight, age, sex and activity level, or use two to three weeks of tracked intake at stable weight, which is the more accurate route if you have the data.',
    },
  ],
  related: ['tdee-calculator', 'macro-calculator', 'bmr-calculator', 'bmi-calculator'],
  disclaimer: 'health',
  lastReviewed: '2026-07-31',
  priority: 0.8,
} satisfies CalculatorDef<typeof fields>

export default def

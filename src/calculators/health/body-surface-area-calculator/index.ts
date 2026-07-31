import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

/**
 * No `scale`. Body surface area is a dimension, not a rating: 2.0 m² is not
 * better or worse than 1.6 m², it is a larger body. A banded gauge would have
 * to invent a judgement the measurement does not carry, so the page shows the
 * five formulas and their spread instead.
 */
const def = {
  slug: 'body-surface-area-calculator',
  category: 'health',
  title: 'Body Surface Area Calculator',
  seoTitle: 'Body Surface Area Calculator: BSA in m² by Five Formulas',
  description:
    'Calculate body surface area in m² from height and weight using the Mosteller, Du Bois, Haycock, Gehan & George and Boyd formulas side by side.',
  intro:
    'Body surface area is the area of the outside of your body in square metres, and it is used to scale drug doses, cardiac output and kidney function to body size. There is no single agreed formula, so this page runs five published ones at once: Mosteller — the square root most clinicians use — is the headline, and the disagreement between all five is shown as a plain range.',
  fields,
  resultLabel: 'Body surface area',
  compute,
  faqs: [
    {
      q: 'Which body surface area formula should I use?',
      a: 'Mosteller for adults, unless something tells you otherwise. It is the simplest — the square root of height in centimetres times weight in kilograms, divided by 3600 — and it sits close to the middle of the five for ordinary adult bodies, so nothing is lost by the simplification. Paediatric protocols often specify Haycock, which was fitted across neonates to adults. What matters far more than the choice is that everyone treating the same patient uses the same one.',
    },
    {
      q: 'Why do the formulas disagree?',
      a: 'They are separate regressions fitted to different people. Du Bois and Du Bois had nine subjects in 1916; Gehan and George refitted the same algebraic shape against 401 direct measurements in 1970; Haycock used 81 subjects spanning newborns to adults in 1978. Each is a best fit to its own sample, so away from the middle of that sample they drift apart. For a typical adult the five land within about one percent of each other, but for a small child the gap widens to several percent.',
    },
    {
      q: 'What is a normal body surface area?',
      a: 'Roughly 1.9 m² for an average adult man and 1.6 m² for an average adult woman. A ten-year-old is near 1.1 m² and a newborn near 0.25 m². The figure 1.73 m² appears constantly in clinical work because it was taken as the average adult surface area, and kidney function is still reported normalised to it as mL/min/1.73m².',
    },
    {
      q: 'Can I use this to work out a chemotherapy dose?',
      a: 'No. BSA-based dosing is a clinical decision that starts from measured, verified height and weight and then applies protocol rules this page knows nothing about — dose capping at 2.0 or 2.2 m², rounding to a vial size, adjustment for organ function, and which formula that particular protocol mandates. Treat the number here as a reference calculation only, and never as a check on a prescribed dose.',
    },
    {
      q: 'Why is body surface area used instead of body weight for dosing?',
      a: 'Because several things that determine what a drug does — resting metabolic rate, blood volume, glomerular filtration — scale closer to surface area than to mass. A person twice the weight of another does not have twice the clearance. BSA dosing is an imperfect proxy and has been criticised for exactly that reason, but it remains the convention in oncology.',
    },
    {
      q: 'Does the calculator handle feet and inches?',
      a: 'Enter your height in inches after switching the units selector to imperial — 5 ft 10 in is 70 inches. Switching the selector converts what you have already typed rather than reinterpreting it, so the body you described stays the same body. All five formulas are defined in centimetres and kilograms, so imperial input is converted before any of them run.',
    },
  ],
  related: ['bmi-calculator', 'body-fat-calculator', 'ideal-weight-calculator'],
  disclaimer: 'health',
  lastReviewed: '2026-07-30',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

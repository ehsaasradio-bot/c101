import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'vo2max-calculator',
  category: 'health',
  title: 'VO2 Max Calculator',
  seoTitle: 'VO2 Max Calculator: Cooper, 1.5-Mile, Rockport, Heart Rate',
  description:
    'Estimate VO2 max from a Cooper 12-minute run, a 1.5-mile run, a Rockport walk test or your resting pulse, and see the fitness category for your age and sex.',
  intro:
    'VO2 max is the most oxygen your body can use per kilogram of body weight each minute, and it is the single best field measure of aerobic fitness. A lab measures it directly from the gas you breathe; the four equations here estimate it from a timed run, a timed walk, or the ratio between your maximum and resting heart rate.',
  fields,
  resultLabel: 'Estimated VO2 max',
  compute,
  /*
   * The meter reads the 0-100 normalised score that `compute` returns, not raw
   * ml/kg/min. A Scale is fixed at build time and the fitness categories are
   * not — 45 ml/kg/min is Good for a man of 25 and Superior for a woman of 65 —
   * so the age- and sex-specific cut-points from the Cooper Institute norms are
   * mapped onto these fixed band edges instead.
   *
   * The edges below must stay identical to BAND_EDGES in `compute.ts`.
   * "Excellent" and "Superior" share a band id because there are five semantic
   * ids and six published categories; both are good outcomes, and the labels
   * keep them apart.
   */
  scale: {
    min: 0,
    max: 100,
    unit: '',
    bands: [
      { id: 'critical', label: 'Very poor for your age and sex', from: 0, to: 15 },
      { id: 'warn', label: 'Poor for your age and sex', from: 15, to: 30 },
      { id: 'neutral', label: 'Fair for your age and sex', from: 30, to: 50 },
      { id: 'good', label: 'Good for your age and sex', from: 50, to: 70 },
      { id: 'excellent', label: 'Excellent for your age and sex', from: 70, to: 90 },
      { id: 'excellent', label: 'Superior for your age and sex', from: 90, to: 100 },
    ],
  },
  faqs: [
    {
      q: 'What is a good VO2 max?',
      a: 'It depends entirely on your age and sex, which is why this page reports a category rather than only a number. Using the Cooper Institute norms, a man aged 30 to 39 is average at roughly 35 to 41 ml/kg/min and superior above 49.5, while a woman of the same age is average at roughly 27 to 31.5 and superior above 41. Endurance athletes commonly measure 60 to 85.',
    },
    {
      q: 'How accurate is a field test compared with a lab measurement?',
      a: 'A field test is an estimate produced by a regression fitted to a group of people, so it carries that group\'s scatter. Cooper reported a correlation of 0.90 against treadmill testing and the Rockport equation reports a multiple R of 0.88, which in practice means an individual can sit several ml/kg/min either side of their true value. The estimates are far more useful for tracking your own change over time than for comparing yourself with someone else.',
    },
    {
      q: 'Which of these four tests should I use?',
      a: 'Pick the hardest one you can safely complete. The Cooper 12-minute run and the 1.5-mile run both need a maximal effort and give the closest estimates, so use one of those if you already run. The Rockport walk was designed for people who cannot run a maximal test and only asks for a fast walk. The heart rate ratio method needs no test at all, but was validated only on well-trained men aged 21 to 51, so treat it as a rough sanity check.',
    },
    {
      q: 'Why do the four methods disagree with each other?',
      a: 'Each was fitted to a different group of people doing a different task, so they carry different biases. For one consistently fit 30-year-old the four land within about 1.5 percent of each other here, but that agreement narrows as inputs get extreme: the Rockport equation drifts high for very fit walkers, and the heart rate ratio drifts high for anyone with an unusually low resting pulse for reasons other than fitness.',
    },
    {
      q: 'How do I raise my VO2 max?',
      a: 'The reliable route is a large base of easy aerobic training plus a small amount of hard interval work near your maximum. Untrained adults typically gain 15 to 20 percent over a few months of consistent training; trained athletes gain far less, because they are closer to a ceiling set largely by genetics and by how much blood the heart can pump per beat. VO2 max also falls by roughly 10 percent per decade after 30 unless training holds it up.',
    },
    {
      q: 'Do I need to be medically cleared before a maximal test?',
      a: 'The Cooper and 1.5-mile tests are all-out efforts. If you have a heart condition, chest pain, uncontrolled blood pressure, are pregnant, or have been inactive for a long time, speak to a doctor before doing one, and use the walk test or the heart rate ratio method in the meantime.',
    },
  ],
  related: ['heart-rate-zone-calculator', 'running-pace-calculator', 'tdee-calculator'],
  disclaimer: 'health',
  lastReviewed: '2026-07-30',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

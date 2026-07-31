import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'waist-hip-calculator',
  category: 'health',
  title: 'Waist-to-Hip Ratio Calculator',
  seoTitle: 'Waist-to-Hip Ratio Calculator: WHO Cut-offs and Waist-Height',
  description:
    'Divide your waist by your hips to see where you carry fat, check it against the WHO cut-offs of 0.90 and 0.85, and get your waist-to-height ratio.',
  intro:
    'Your waist-to-hip ratio is your waist measurement divided by your hip measurement. It describes where you carry fat rather than how much of it you have, which is why it adds something a scale cannot: fat stored around the abdomen and the organs raises cardiometabolic risk in a way that the same fat on the hips and thighs does not. The World Health Organization treats 0.90 or more in men, and 0.85 or more in women, as marking substantially increased risk. This page also gives your waist-to-height ratio, where the rule of thumb is simply to keep your waist under half your height.',
  fields,
  resultLabel: 'Waist-to-hip ratio',
  compute,
  /*
   * The meter reads the NORMALISED percentage that `compute` returns — the ratio
   * as a share of the WHO cut-off for this person's sex — not the raw ratio.
   *
   * A Scale is fixed at build time and the cut-off is not: 0.87 is under the
   * line for a man and over it for a woman, so one set of raw-ratio bands would
   * be wrong for one sex whichever numbers were picked. Dividing by the
   * applicable cut-off puts the WHO line at exactly 100 for everyone, and these
   * bands then describe distance from that line. It is the same trick
   * `health/vo2max-calculator` uses for its age-and-sex fitness norms.
   *
   * The edges below must stay identical to BAND_EDGES in `compute.ts`, which
   * `compute.test.ts` asserts.
   *
   * WHO publishes exactly one waist-hip threshold per sex, so the two bands
   * below the line are distances from it rather than published risk categories,
   * and both bands above it say the same thing the WHO report says.
   */
  scale: {
    min: 60,
    max: 140,
    clampMax: 140,
    unit: '%',
    bands: [
      { id: 'excellent', label: 'Well below the WHO cut-off for your sex', from: 0, to: 90 },
      { id: 'neutral', label: 'Below the WHO cut-off for your sex', from: 90, to: 100 },
      {
        id: 'warn',
        label: 'At the WHO cut-off — substantially increased risk',
        from: 100,
        to: 110,
      },
      {
        id: 'critical',
        label: 'Well above the WHO cut-off — substantially increased risk',
        from: 110,
        to: 999,
      },
    ],
  },
  faqs: [
    {
      q: 'What is a healthy waist-to-hip ratio?',
      a: 'The WHO expert consultation on waist circumference and waist-hip ratio puts the line at 0.90 for men and 0.85 for women: at or above it, the risk of metabolic complications is classed as substantially increased. Below the line there is no published grading, so this page reports how far below you are rather than inventing a category. Remember the ratio is a proportion, so a large waist paired with large hips can read as acceptable when the absolute waist measurement on its own would not.',
    },
    {
      q: 'How is this different from the body fat calculator, which uses the same measurements?',
      a: 'They answer two different questions from one tape. The body fat calculator feeds waist, hip, neck and height into the US Navy regression to estimate what percentage of your body is fat — how much. This page compares waist against hips and against height to describe fat distribution — where. Distribution carries independent risk: two people with identical body fat percentages can sit on opposite sides of the WHO line, and the one carrying it abdominally has the higher cardiometabolic risk.',
    },
    {
      q: 'Why is the cut-off different for men and women?',
      a: 'Women typically store proportionally more fat on the hips and thighs and less around the abdomen, so the same ratio represents more central fat in a woman than in a man. The WHO therefore sets a lower threshold for women, at 0.85 rather than 0.90. Because the line moves with sex, the meter on this page plots your ratio as a percentage of your own cut-off, so 100 percent always means "exactly on the WHO line" whichever threshold applies to you.',
    },
    {
      q: 'Is waist-to-height ratio better than BMI?',
      a: 'For predicting cardiometabolic risk in an individual, most published comparisons say yes. BMI cannot tell muscle from fat and says nothing about where fat sits, whereas waist-to-height captures central adiposity directly and needs no separate table for sex or height. It also comes with a rule you can remember without a calculator: keep your waist under half your height. NICE bands it as 0.4 to 0.49 healthy, 0.5 to 0.59 increased, and 0.6 or more high.',
    },
    {
      q: 'Where exactly should I measure my waist and hips?',
      a: 'Measure the waist midway between the lowest rib and the top of the hip bone, directly against the skin, at the end of a normal breath out, without pulling your stomach in. Measure the hips around the widest part of the buttocks with the tape level all the way round. Keep the tape snug but not compressing. Because this is a ratio, a consistent technique matters more than the absolute numbers: measuring the waist at the navel instead will shift both the ratio and its comparison against the cut-off.',
    },
    {
      q: 'Can the ratio be misleading?',
      a: 'Yes, in a few situations. Very muscular hips and thighs raise the denominator and flatter the ratio. Losing weight from the hips can push the ratio up even as total fat falls. It is not meaningful during pregnancy. The WHO report also notes that the optimal cut-off differs between ethnic groups — several Asian populations show elevated risk at lower values than the global figures used here. Pair the ratio with your absolute waist measurement rather than relying on either alone.',
    },
  ],
  related: ['body-fat-calculator', 'bmi-calculator', 'ideal-weight-calculator'],
  disclaimer: 'health',
  lastReviewed: '2026-07-31',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

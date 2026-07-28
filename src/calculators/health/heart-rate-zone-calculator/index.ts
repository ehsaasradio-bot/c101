import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'heart-rate-zone-calculator',
  category: 'health',
  title: 'Heart Rate Zone Calculator',
  seoTitle: 'Heart Rate Zone Calculator: Karvonen Training Zones',
  description:
    'Work out your five heart rate training zones with the Karvonen method, using your age and resting pulse to set a target bpm range for every effort.',
  intro:
    'Training zones divide the gap between your resting and maximum heart rate — your heart rate reserve — into five slices. The Karvonen method anchors each zone to your own resting pulse, which is why two runners of the same age can have very different zone 2 numbers.',
  fields,
  resultLabel: 'Estimated maximum heart rate',
  compute,
  // The meter tracks resting heart rate, the one input here with a real
  // good/bad axis. Bands follow the usual adult resting-pulse guidance.
  scale: {
    min: 35,
    max: 100,
    unit: 'bpm resting',
    bands: [
      { id: 'excellent', label: 'Athletic — under 55 bpm', from: 35, to: 55 },
      { id: 'good', label: 'Good — 55 to 65 bpm', from: 55, to: 65 },
      { id: 'neutral', label: 'Average — 65 to 75 bpm', from: 65, to: 75 },
      { id: 'warn', label: 'Above average — 75 to 85 bpm', from: 75, to: 85 },
      { id: 'critical', label: 'High — 85 bpm or more', from: 85, to: 100 },
    ],
  },
  faqs: [
    {
      q: 'What is the Karvonen method?',
      a: 'It sets each target heart rate as your resting pulse plus a percentage of your heart rate reserve, where the reserve is your maximum heart rate minus your resting heart rate. Because it starts from your own floor, it fits a fit person better than a flat percentage of maximum.',
    },
    {
      q: 'How accurate is 220 minus age?',
      a: 'It is a rough population average with a standard deviation of about 10 to 12 beats per minute, so an individual can easily sit 20 bpm either side of it. Use it to get started, then refine your zones from a lab test or a maximal field effort.',
    },
    {
      q: 'Which zone should I train in most?',
      a: 'Endurance athletes typically spend around 70 to 80 percent of their weekly time in zones 1 and 2, with the remainder in zones 4 and 5. That polarised split builds an aerobic base while keeping hard sessions genuinely hard and recovery genuinely easy.',
    },
    {
      q: 'How do I measure my resting heart rate?',
      a: 'Count your pulse for a full 60 seconds first thing in the morning, before you get out of bed or drink coffee, and average three or four mornings. A wearable that samples overnight gives a similar figure with less effort.',
    },
    {
      q: 'Why does my resting heart rate change day to day?',
      a: 'Sleep debt, alcohol, illness, heat, dehydration, and hard training the day before all push it up by several beats. A resting pulse that is five or more beats above your own norm is a common signal to take an easier day.',
    },
  ],
  related: ['bmr-calculator', 'tdee-calculator', 'running-pace-calculator'],
  disclaimer: 'health',
  lastReviewed: '2026-07-27',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

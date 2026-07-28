import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'running-pace-calculator',
  category: 'health',
  title: 'Running Pace Calculator',
  seoTitle: 'Running Pace Calculator: Pace per Km or Mile, Speed, Splits',
  description:
    'Turn a run distance and finishing time into pace per kilometre or mile, speed in km/h and mph, and predicted 5K, 10K, half and marathon times.',
  intro:
    'Pace is simply total time divided by distance. Enter how far you ran and how long it took, and this calculator gives your pace per kilometre and per mile, your average speed, and what the same pace would produce over the standard race distances.',
  fields,
  resultLabel: 'Pace',
  faqs: [
    {
      q: 'How do I calculate running pace by hand?',
      a: 'Convert your finishing time entirely into seconds, then divide by the distance. A 25-minute 5K is 1500 seconds over 5 km, which is 300 seconds — five minutes — per kilometre. Divide seconds by 60 to get the minutes-and-seconds form.',
    },
    {
      q: 'How do I convert pace per kilometre to pace per mile?',
      a: 'Multiply your per-kilometre pace by 1.609344, because a mile is that many kilometres long. A 5:00/km pace becomes about 8:03 per mile. To go the other way, divide the per-mile pace by 1.609344 instead.',
    },
    {
      q: 'Are the predicted race times realistic?',
      a: 'They assume you hold exactly the same pace over the longer distance, which is optimistic. Most runners slow as distance grows, so a common correction is Riegel’s formula: multiply your time by the distance ratio raised to the power 1.06.',
    },
    {
      q: 'What is a good pace for a beginner runner?',
      a: 'Comfortable easy running for most new runners lands somewhere between 6:30 and 8:30 per kilometre, roughly 10:30 to 13:40 per mile. Pace matters far less than being able to hold a conversation while you run, which is the honest measure of easy effort.',
    },
    {
      q: 'Should most of my training be at race pace?',
      a: 'No. Endurance programmes typically put roughly 80% of weekly volume at an easy, conversational pace and reserve the remaining 20% for tempo work, intervals and races. Running every session hard mainly accumulates fatigue rather than fitness.',
    },
  ],
  related: ['heart-rate-zone-calculator', 'bmr-calculator', 'tdee-calculator'],
  compute,
  disclaimer: 'health',
  lastReviewed: '2026-07-27',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

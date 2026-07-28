import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'percentage-change-calculator',
  category: 'math',
  title: 'Percentage Change Calculator',
  seoTitle: 'Percentage Change Calculator: Increase & Decrease',
  description:
    'Find the percentage increase or decrease between two numbers, with the absolute difference, direction, and multiplier worked out step by step.',
  intro:
    'Percentage change measures how far a number moved relative to where it started: subtract the original from the new value, divide by the size of the original, and multiply by 100. A positive result is an increase, a negative one a decrease.',
  fields,
  resultLabel: 'Percentage change',
  compute,
  scale: {
    min: -100,
    max: 100,
    clampMax: 100,
    unit: '%',
    bands: [
      { id: 'critical', label: 'Sharp decrease — 50% or more', from: -100000, to: -50 },
      { id: 'warn', label: 'Decrease', from: -50, to: -5 },
      { id: 'neutral', label: 'Roughly unchanged', from: -5, to: 5 },
      { id: 'good', label: 'Increase', from: 5, to: 50 },
      { id: 'excellent', label: 'Sharp increase — 50% or more', from: 50, to: 100000 },
    ],
  },
  faqs: [
    {
      q: 'How do I calculate percentage change?',
      a: 'Subtract the original value from the new value, divide that difference by the absolute value of the original, then multiply by 100. Going from 50 to 75 gives (75 − 50) ÷ 50 × 100 = 50, a 50% increase.',
    },
    {
      q: 'Why can I not use zero as the original value?',
      a: 'Percentage change divides by the original value, and dividing by zero is undefined. Any move away from zero is infinitely large in percentage terms, so quote the absolute difference instead when your starting point is zero.',
    },
    {
      q: 'What is the difference between percentage change and percentage points?',
      a: 'Percentage change is relative: a rate rising from 4% to 5% is a 25% increase. Percentage points are absolute: the same move is a rise of 1 percentage point. Financial and polling reports use points precisely to avoid this ambiguity.',
    },
    {
      q: 'Why does a 50% rise not cancel a 50% fall?',
      a: 'Each change is measured against a different base. Falling 50% from 100 leaves 50, and rising 50% from 50 only reaches 75. To undo a 50% fall you need a 100% rise, which is why the multiplier stat is often more honest than the percentage.',
    },
    {
      q: 'How does this work with negative numbers?',
      a: 'The calculator divides by the magnitude of the original value, so the sign of the result always matches the direction of the move. Going from −50 to −25 reads as a 50% increase, because the number genuinely rose.',
    },
  ],
  related: ['percentage-calculator', 'discount-calculator', 'inflation-calculator'],
  lastReviewed: '2026-07-27',
  priority: 0.8,
} satisfies CalculatorDef<typeof fields>

export default def

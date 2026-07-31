import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'probability-calculator',
  category: 'math',
  title: 'Probability Calculator',
  seoTitle: 'Probability Calculator: P(A and B), P(A or B), Neither',
  description:
    'Find P(A and B), P(A or B), P(neither) and the complements for two events, independent or mutually exclusive, plus the odds of it happening at least once.',
  intro:
    'Give this calculator the chance of two events and say whether they are independent or mutually exclusive, and it works out the probability that both happen, that at least one happens, that neither happens, and that exactly one does. That single assumption is what most people get wrong: independent events overlap by P(A) × P(B), while mutually exclusive events never overlap at all, so the same two percentages give different answers. It also answers the question behind most probability searches — what are the odds of it happening at least once across a run of trials.',
  fields,
  resultLabel: 'Probability both events happen',
  compute,
  faqs: [
    {
      q: 'What is the difference between independent and mutually exclusive events?',
      a: 'Independent means one event happening tells you nothing about the other, so the chance of both is P(A) × P(B). Mutually exclusive means they cannot both happen, so the chance of both is exactly zero. They are opposite ideas, not similar ones: with mutually exclusive events, knowing A happened tells you B definitely did not, which is the strongest possible dependence. The only way an event can be both independent of and mutually exclusive with another is if one of them is impossible.',
    },
    {
      q: 'How do I calculate the probability of A or B?',
      a: 'The addition rule always applies: P(A or B) = P(A) + P(B) − P(A and B). You subtract the overlap because the outcomes where both happen would otherwise be counted twice. For mutually exclusive events the overlap is zero, so the two probabilities simply add. For independent events the overlap is P(A) × P(B), so 30% and 20% give 30 + 20 − 6 = 44%, not 50%.',
    },
    {
      q: 'Why can two mutually exclusive events not add up to more than 100%?',
      a: 'Mutually exclusive events never happen together, so the chance that one or the other occurs is just P(A) + P(B). Probabilities can never exceed 1, so a pair adding to more than 100% describes a sample space that cannot exist — there is no valid answer to return. This calculator rejects that combination rather than printing an impossible number: either lower one probability, or the events are not actually mutually exclusive.',
    },
    {
      q: 'What are the odds of something happening at least once in several tries?',
      a: 'Work out the chance of it never happening and subtract from 1: P(at least one) = 1 − (1 − p)^n. A 30% event missed ten times running has probability 0.7^10 = 2.82%, so the chance of seeing it at least once is 97.18%. This is why rare events still show up over long runs, and why "at least once" probabilities rise much faster than people expect.',
    },
    {
      q: 'What if my events are neither independent nor mutually exclusive?',
      a: 'Then P(A and B) cannot be derived from P(A) and P(B) at all — it has to be measured, or supplied as a conditional probability, since P(A and B) = P(A) × P(B given A). Rain today and rain tomorrow is the classic case: the two are correlated, so multiplying the individual chances understates the true joint probability. Use the independent setting only when you genuinely believe one event has no bearing on the other.',
    },
  ],
  related: ['percentage-calculator', 'ratio-calculator', 'average-calculator', 'combination-calculator'],
  lastReviewed: '2026-07-30',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

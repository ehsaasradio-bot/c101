import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'combination-calculator',
  category: 'math',
  title: 'Combination & Permutation Calculator',
  seoTitle: 'Combination & Permutation Calculator (nCr and nPr)',
  description:
    'Work out nCr and nPr — how many ways to choose or arrange r items from n, with or without repetition — and see which of the four formulas your question needs.',
  intro:
    'A combination counts selections where the order does not matter, and a permutation counts arrangements where it does. Six numbers drawn in a lottery are a combination — 3-17-42 wins whichever order the balls appear — while gold, silver and bronze on a podium are a permutation, because swapping two runners gives a different result. Tell this calculator whether order matters and whether an item can be picked twice, and it applies the right one of the four standard formulas, shows the multiplication behind it, and reports all four counts side by side so the choice is visible rather than assumed.',
  fields,
  resultLabel: 'Number of ways',
  compute,
  faqs: [
    {
      q: 'What is the difference between a combination and a permutation?',
      a: 'A combination is a selection and a permutation is an arrangement. If the order of the picks changes the outcome, you want a permutation; if it does not, you want a combination. The two are directly related: every combination of r items can be shuffled into r! different orders, so P(n, r) = C(n, r) × r!. Choosing 3 people from 10 for a committee gives 120 combinations, but assigning them to chair, secretary and treasurer gives 120 × 3! = 720 permutations.',
    },
    {
      q: 'When should I allow repetition?',
      a: 'Allow it when an item goes back into the pool after being picked, so the same item can appear more than once. A four-digit PIN allows repetition — 1111 is a valid PIN — so there are 10^4 = 10,000 of them. A lottery draw does not: once a ball is out of the machine it cannot come out again. Repetition with order ignored is the least familiar case; it counts multisets, such as the number of ways to pick three scoops of ice cream from ten flavours when two scoops may match, which is C(10 + 3 − 1, 3) = 220.',
    },
    {
      q: 'How many 5-card poker hands are there?',
      a: 'C(52, 5) = 2,598,960. A hand is a set of cards, so the order they are dealt in does not matter, and no card can be dealt twice, which makes it a plain combination. If the order did matter, the count would be P(52, 5) = 311,875,200 — exactly 5! = 120 times larger, since every hand can be dealt in 120 different sequences.',
    },
    {
      q: 'Why does this calculator sometimes show an approximate answer?',
      a: 'Because the counts outgrow the arithmetic. A JavaScript number holds whole numbers exactly only up to 9,007,199,254,740,991, and 21! already passes that. This calculator builds each result multiplicatively with a division at every step, which keeps it exact far longer than computing factorials would, and it checks every intermediate value along the way. When exactness is genuinely lost it says so and prints four significant figures, rather than showing a fifty-digit integer whose later digits are fabricated.',
    },
    {
      q: 'What happens if I choose more items than there are?',
      a: 'With repetition switched off, the answer is zero — there is genuinely no way to pick eight distinct cards from a five-card pile, so zero ways is the correct count rather than an error. With repetition allowed the question is perfectly ordinary: picking 8 items from a pool of 5 that can each be reused has plenty of answers, and the calculator gives them.',
    },
    {
      q: 'What are the odds of winning a 6-from-49 lottery?',
      a: 'There are C(49, 6) = 13,983,816 possible draws, so a single ticket has a 1 in 13,983,816 chance of matching all six. Order is ignored because the ticket wins on the set of numbers, and repetition is off because each ball is drawn once. If order did matter the count would be P(49, 6) = 10,068,347,520, which is 6! = 720 times larger.',
    },
  ],
  related: ['probability-calculator', 'gcd-lcm-calculator', 'percentage-calculator'],
  lastReviewed: '2026-07-31',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

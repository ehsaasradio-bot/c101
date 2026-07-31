import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'logarithm-calculator',
  category: 'math',
  title: 'Logarithm Calculator',
  seoTitle: 'Logarithm Calculator: log base b, log10, ln and log2',
  description:
    'Work out log to any base, with log10, ln and log2 shown alongside. Includes the change-of-base formula, a b^y check, and the inverse antilogarithm.',
  intro:
    'A logarithm answers one question: what power do you raise the base to in order to reach x? Enter a value and a base and this works out log_b(x), shows the common, natural and binary logarithms of the same number so the change-of-base relationship is visible rather than asserted, and solves the inverse — given a base and a logarithm, it returns the x they came from.',
  fields,
  resultLabel: 'Logarithm',
  compute,
  faqs: [
    {
      q: 'What is the change-of-base formula?',
      a: 'log_b(x) = ln(x) ÷ ln(b), and the same identity works with any logarithm on top and bottom — log10(x) ÷ log10(b) gives the identical answer. It exists because calculators and programming languages only ship a couple of fixed bases, so every other base is reached by dividing two logarithms you already have. The worked steps show the two natural logarithms and the division that produced the answer.',
    },
    {
      q: 'Why can you not take the logarithm of zero or a negative number?',
      a: 'A positive base raised to any real power is always positive: 10 to a large negative power gets very small but never reaches zero, and never crosses below it. So there is no real exponent that produces 0 or -5, and the logarithm of those values does not exist over the real numbers. This calculator reports an error against the x field rather than returning a meaningless figure.',
    },
    {
      q: 'Why is base 1 not allowed?',
      a: 'Because 1 raised to any power at all is still 1. There is no exponent that turns 1 into 8, so log base 1 of 8 has no answer — and log base 1 of 1 has too many, since every exponent works. The base must also be positive, because a negative base raised to a fractional power leaves the real numbers entirely.',
    },
    {
      q: 'Why do some calculators show log10(1000) as 2.9999999999999996?',
      a: 'Because they compute it as ln(1000) ÷ ln(10). Neither natural logarithm can be stored exactly in binary floating point, and the tiny error in each survives the division. This calculator uses the dedicated base-10, base-2 and natural routines where they apply, and for any other base it only rounds a near-whole answer to the whole number after confirming that raising the base back to it reproduces x exactly.',
    },
    {
      q: 'What is an antilogarithm?',
      a: 'It is the inverse operation: if log_b(x) = y, then the antilog is x = b raised to the power y. The two undo each other, which is why raising the base back to the answer returns the value you started with. The known-logarithm field on this page runs that direction, so you can go from a logarithm back to the number it describes.',
    },
    {
      q: 'What are the common, natural and binary logarithms?',
      a: 'They are the three bases that come up constantly. The common logarithm uses base 10 and counts digits, so log10 of a million is 6. The natural logarithm uses base e, roughly 2.718281828, and is the one that appears in growth and decay. The binary logarithm uses base 2 and counts doublings, so log2 of 1024 is 10. All three are shown for whatever value you enter.',
    },
  ],
  related: ['quadratic-calculator', 'compound-interest-calculator', 'percentage-change-calculator', 'exponent-calculator'],
  lastReviewed: '2026-07-31',
  priority: 0.6,
} satisfies CalculatorDef<typeof fields>

export default def

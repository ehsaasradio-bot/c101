import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'exponent-calculator',
  category: 'math',
  title: 'Exponent Calculator',
  seoTitle: 'Exponent Calculator: b^n for negative and fractional powers',
  description:
    'Work out b to the power n for any base and exponent, including negative, fractional and zero powers, with the answer in scientific notation.',
  intro:
    'An exponent says how many times a base is used as a factor: 2^10 is ten twos multiplied together, which is 1,024. This works out b^n for any base and any exponent — negative exponents, which are reciprocals; fractional exponents, which are roots; and zero, which gives 1 — showing which law of exponents applies at each step and giving the answer in scientific notation as well as in full. It answers 0^0 as 1, the algebra and combinatorics convention, and it returns the real cube root of a negative number rather than the NaN most programming languages give.',
  fields,
  resultLabel: 'Power',
  compute,
  faqs: [
    {
      q: 'What does a negative exponent mean?',
      a: 'A negative exponent is a reciprocal, not a negative answer. b^-n is defined as 1 divided by b^n, so 10^-3 is 1 ÷ 1000 = 0.001 and 2^-1 is 0.5. It falls straight out of the division law: b^m ÷ b^n = b^(m-n), so b^0 ÷ b^n = b^-n, and since b^0 is 1 that is 1 ÷ b^n. The sign of the answer is decided by the base, never by the exponent — 2^-3 is a small positive number, and only a negative base can produce a negative result.',
    },
    {
      q: 'What does a fractional exponent mean?',
      a: 'A fractional exponent is a root. b^(1/q) is the q-th root of b, so 9^(1/2) is the square root of 9 and 8^(1/3) is the cube root of 8, which is 2. A general fraction combines the two: b^(p/q) is the q-th root of b raised to the power p, so 8^(2/3) is 2 squared, which is 4. That is why 2^0.5 comes out as 1.414214 — it is the square root of 2. This calculator reads a decimal exponent as the simplest fraction that matches it, so 0.2 is recognised as one fifth and the working shows the root form.',
    },
    {
      q: 'Is 0^0 equal to 1 or undefined?',
      a: 'This calculator answers 1, which is the convention algebra and combinatorics use, and the one JavaScript, Python and the IEEE 754 pow function all return. The reasons are structural: the empty product is 1, there is exactly one way to choose nothing from nothing, and the binomial theorem and every power series with a constant term need x^0 to be 1 at x = 0. Analysis usually calls 0^0 indeterminate instead, because the two-variable function x^y has no single limit as x and y both approach zero — 0^y is 0 for every positive y, while x^0 is 1 for every nonzero x, so the value you approach depends on the path you take. Both camps are right about different questions. A calculator lives in the discrete setting, so it answers 1 and says so.',
    },
    {
      q: 'Why do most calculators return an error for something like (-8)^(1/3)?',
      a: 'Because floating-point pow is defined to return NaN for a negative base with any non-integer exponent. It has no way to tell the exponent 1/3, which has a perfectly good real cube root of -2, from 0.3333333333333333, which does not: over the complex numbers the principal value of a negative number raised to a fractional power is complex, and returning it would be wrong for a real-valued function. This calculator handles the case explicitly. It matches the exponent to the simplest fraction p/q that agrees with it, and if q is odd it returns the real root — (-8)^(1/3) = -2, (-32)^0.2 = -2 — with the sign taken from whether p is odd. If q is even, as it is for 0.5 or 2.5, there is genuinely no real answer, and it refuses with an explanation instead of returning NaN.',
    },
    {
      q: 'What happens when the answer is too big for a computer to hold?',
      a: 'A double-precision number stops at about 1.8 × 10^308, and anything past that becomes Infinity, which is why many calculators show a dash for something like 1000^400. The magnitude here is tracked separately as n × log10(b), which is ordinary arithmetic on numbers that never get large, so 1000^400 is reported as about 1.000 × 10^1200 rather than as an error. Only four significant figures are shown, because only four are known: the leading digits come from the fractional part of the logarithm, and the rest were never computed. The same applies underneath, where results below about 5 × 10^-324 collapse to zero as plain numbers but still have a reportable magnitude.',
    },
    {
      q: 'Why does 1.1 squared sometimes show as 1.2100000000000002?',
      a: 'Because 1.1 cannot be stored exactly in binary — it is a repeating fraction in base 2, exactly as one third is in base 10 — so the stored value is a hair off and squaring it doubles the error. This calculator avoids the problem rather than rounding it away. For a whole-number exponent it computes the power in exact integer arithmetic: 1.1 is 11/10, so 1.1 squared is 121 ÷ 100 = 1.21 exactly. The exact result is only used after it has been checked against the ordinary floating-point answer and the two agree, so a genuine difference is never rounded into agreement.',
    },
    {
      q: 'What are the laws of exponents used on this page?',
      a: 'Three, all shown as checks under the working. The product law says b^m × b^n = b^(m+n), because multiplying m factors by n factors gives m + n factors. The power law says (b^m)^n = b^(mn), because m factors repeated n times is mn factors. And the reciprocal law says b^-n = 1 ÷ b^n. The page evaluates both sides of each of these with your own numbers, so the identities are demonstrated on the result rather than merely quoted at you.',
    },
  ],
  related: ['logarithm-calculator', 'quadratic-calculator', 'compound-interest-calculator'],
  lastReviewed: '2026-07-31',
  priority: 0.6,
} satisfies CalculatorDef<typeof fields>

export default def

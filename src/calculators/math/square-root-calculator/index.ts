import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'square-root-calculator',
  category: 'math',
  title: 'Square Root Calculator',
  seoTitle: 'Square Root Calculator with Simplified Radical Form',
  description:
    'Find the square root or any nth root, in simplified radical form as well as decimal. √72 = 6√2, with the perfect-square factor extraction shown step by step.',
  intro:
    'A square root asks which number multiplied by itself gives the one you started with, and most calculators answer with a decimal alone. This one also gives the simplified radical form — √72 is 6√2 — by factorising the number and pulling out the largest perfect square, with every step of that extraction shown. Change the degree for cube roots and beyond, and note that odd roots of negative numbers are real while even ones are not: the cube root of −8 is −2, but √−72 is the imaginary 6i√2.',
  fields,
  resultLabel: 'Root',
  compute,
  faqs: [
    {
      q: 'What is simplified radical form?',
      a: 'It is the exact value of a root written as a whole number multiplied by a radical that cannot be reduced any further. √72 becomes 6√2, because 72 factors as 36 × 2 and 36 is a perfect square whose root, 6, comes out from under the sign. It is the form homework asks for because it is exact: 6² × 2 is exactly 72, whereas 8.485281 squared is not. The steps on this page show the prime factorisation, the largest perfect-square factor, and the whole-number check that confirms it.',
    },
    {
      q: 'How do you simplify a square root by hand?',
      a: 'Break the number into its prime factors, then take one copy of each pair out from under the radical and leave anything unpaired inside. For 72 the factorisation is 2³ × 3², which gives a pair of 2s and a pair of 3s, so 2 × 3 = 6 comes out and a single 2 stays behind: 6√2. For an nth root the rule is the same with groups of n instead of pairs, which is why ∛54 is 3∛2.',
    },
    {
      q: 'Can you take the square root of a negative number?',
      a: 'Not within the real numbers. Squaring any real number gives a positive result, whether you started positive or negative, so nothing squares to −72. Mathematicians define i as the number whose square is −1, and the square root of a negative is then written with it: √−72 is 6i√2. This calculator reports that imaginary form rather than refusing, because it is the answer a student is being asked for. Degrees above 2 are a different story — see below.',
    },
    {
      q: 'Why is the cube root of −8 equal to −2, when √−4 is not real?',
      a: 'Because an odd power keeps the sign of its base. (−2) × (−2) × (−2) is −8, so −2 is a genuine real cube root. An even power always destroys the sign, which is why no real number squares to −4. That difference is why this page treats the two cases separately, and why an even root of a negative above degree 2 is refused: the principal fourth root of −16 is not 2i, since (2i)⁴ is +16, but a full complex number with both a real and an imaginary part.',
    },
    {
      q: 'Why do some calculators show √49 as 6.999999999999999?',
      a: 'Because they compute the root as x to the power 1/n, and 1/3 or 1/5 cannot be stored exactly in binary floating point, so the answer lands a hair off. This page routes degree 2 to the dedicated square-root routine, which IEEE 754 requires to be correctly rounded and which is therefore exact on every perfect square, and for other degrees it only rounds a near-whole answer to the whole number after raising it back to the power n and confirming the original number reappears.',
    },
    {
      q: 'What is a perfect square, and how does it help?',
      a: 'A perfect square is a whole number that is some other whole number squared: 1, 4, 9, 16, 25, 36, 49, 64, 81, 100 and so on. Knowing them lets you bracket any root in your head — 72 sits between 64 and 81, so √72 is between 8 and 9 — and it is also what the simplification hunts for, since only a perfect-square factor can leave the radical intact. This calculator shows both the bracket and the largest perfect-power factor it found.',
    },
    {
      q: 'Does every square root simplify?',
      a: 'No. A simplification only exists when the number has a perfect-square factor above 1, so √70 stays √70 — its factors are 2, 5 and 7, with nothing repeated. Roots of prime numbers never simplify for the same reason. When there is nothing to pull out, this page says so rather than restating the same radical as though work had been done.',
    },
  ],
  related: ['quadratic-calculator', 'logarithm-calculator', 'gcd-lcm-calculator', 'right-triangle-calculator'],
  lastReviewed: '2026-07-31',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

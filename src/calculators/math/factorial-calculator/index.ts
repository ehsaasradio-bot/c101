import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'factorial-calculator',
  category: 'math',
  title: 'Factorial Calculator',
  // 66 characters.
  seoTitle: 'Factorial Calculator — Exact n! With Every Digit Shown',
  // 154 characters.
  description:
    'Work out n! exactly, with every digit, up to 10,000!. Shows the full integer, its digit count, scientific notation and how many zeros it ends in.',
  intro:
    'A factorial multiplies every whole number from 1 up to n: 5! = 1 × 2 × 3 × 4 × 5 = 120. It counts the ways n distinct things can be put in order, which is why it turns up inside every combination and permutation formula. The numbers get astronomical fast, and most calculators give up and round — a JavaScript number stops holding whole numbers exactly at 9,007,199,254,740,991, which 19! already exceeds. This one uses arbitrary-precision arithmetic instead, so 100! is shown as all 158 of its digits rather than as "about 9.33 × 10^157", alongside its digit count, its scientific notation, and the number of zeros it ends in.',
  fields,
  resultLabel: 'n factorial',
  compute,
  faqs: [
    {
      q: 'Why is 0! equal to 1?',
      a: 'Because it is the only value that keeps everything else consistent. n! counts the orderings of n things, and there is exactly one way to arrange an empty collection: do nothing. The recurrence n! = n × (n − 1)! also demands it — at n = 1 it reads 1! = 1 × 0!, so 0! must be 1 for 1! to come out as 1. And the binomial coefficient C(n, 0), the number of ways to choose nothing, is 1 for every n, which needs 0! = 1 in its denominator. Mathematically it is the empty product: multiplying no numbers together gives the multiplicative identity, 1, in the same way that adding no numbers gives 0.',
    },
    {
      q: 'What is the factorial of a negative number?',
      a: 'There is not one. The gamma function Γ is the standard continuous extension of the factorial, with Γ(n + 1) = n! for whole n, and it has poles — points where it shoots off to infinity — at 0, −1, −2, −3 and every other non-positive integer. So there is no finite value to report for (−3)!, and this calculator says so rather than inventing one. Negative non-integers do have gamma values: Γ(−0.5) = −2√π ≈ −3.545, for instance. This page rejects those too, but for a different reason: they can only be produced by numerical approximation, and the whole point here is exact digits.',
    },
    {
      q: 'Can I take the factorial of a decimal like 4.5?',
      a: 'Not here. The gamma function gives 4.5! = Γ(5.5) ≈ 52.3428, so the question has an answer, but that answer is a limit computed by approximation — it has no exact decimal or fractional form, and it cannot be printed digit for digit the way 100! can. Since this calculator exists specifically to show every digit exactly, it refuses non-integers instead of quietly switching to a different function and a different standard of accuracy. If you need Γ, use a numerical library and expect about 15 significant figures.',
    },
    {
      q: 'How many zeros does 100! end in?',
      a: 'Exactly 24, and you can work that out without computing 100! at all. Each trailing zero comes from a factor of 10, which is 2 × 5. Factors of 2 are far more common in a factorial than factors of 5 — 100! contains 97 twos and only 24 fives — so the fives are the limiting ingredient and the zero count equals the number of fives. Legendre\'s formula counts them: floor(100/5) + floor(100/25) = 20 + 4 = 24. The multiples of 25 are counted twice because they each contribute two fives. For 1000! the same sum gives 200 + 40 + 8 + 1 = 249.',
    },
    {
      q: 'Why do other calculators show factorials as approximations?',
      a: 'Because they compute in floating point, and the ceilings arrive early. A double holds whole numbers exactly only up to 2^53 − 1 = 9,007,199,254,740,991, and 18! = 6,402,373,705,728,000 is the largest factorial under that; 20! = 2,432,902,008,176,640,000 is the largest that fits in a signed 64-bit integer. Factorials collect factors of 2, which a binary mantissa stores for free, so 22! still lands exactly by luck — but 23! comes back as 25,852,016,738,884,978,212,864 when the true value is 25,852,016,738,884,976,640,000, wrong from the seventeenth digit on. Past 170! a double overflows to Infinity entirely. This page uses BigInt, which has no fixed width and grows to whatever the answer needs, so 1000! comes back as a specific 2,568-digit integer rather than an estimate. Anything showing you fifty digits out of double arithmetic is making most of them up.',
    },
    {
      q: 'How large a factorial will this calculate?',
      a: '10,000!, which is a 35,660-digit number. The limit is about responsiveness rather than correctness: the result recomputes on every keystroke, and while a fast binary-splitting product gets 10,000! in well under a millisecond, converting it to decimal digits for display takes a couple more, and both costs grow faster than n does. Past roughly 20,000 the delay becomes noticeable while typing. Results up to 200 digits are printed in full; longer ones have their middle elided, with the first and last 60 digits shown, since the digit count and the two ends are what anyone actually reads.',
    },
  ],
  related: ['combination-calculator', 'probability-calculator', 'prime-calculator'],
  lastReviewed: '2026-07-31',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

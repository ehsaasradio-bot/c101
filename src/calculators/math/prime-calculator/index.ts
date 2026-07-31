import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'prime-calculator',
  category: 'math',
  title: 'Prime Number Calculator',
  seoTitle: 'Prime Number Calculator: Test and Factorise a Number',
  description:
    'Check whether a number is prime, see its prime factorisation in exponent form, list every divisor, and find the nearest primes above and below it.',
  intro:
    'A prime number has exactly two divisors: 1 and itself. Enter any whole number up to 100,000,000,000 and this calculator tests it by trial division, then shows its prime factorisation both in exponent form (360 = 2³ × 3² × 5) and written out in full, every divisor it has, and the nearest prime on either side.',
  fields,
  resultLabel: 'Is it prime?',
  compute,
  faqs: [
    {
      q: 'How does this calculator test whether a number is prime?',
      a: 'By trial division. It divides the number by 2, 3, 5 and then by every candidate on a 2·3·5 wheel up to the square root of the number. Testing beyond the square root is pointless: if n = a × b and both a and b were larger than √n, their product would exceed n. This is an exact test with no probabilistic shortcuts, so numbers that fool quick pseudoprimality checks — Carmichael numbers such as 561 = 3 × 11 × 17 — are correctly reported as composite.',
    },
    {
      q: 'Is 1 a prime number?',
      a: 'No. A prime has exactly two distinct divisors, and 1 has only one, so it is neither prime nor composite. It also has no prime factorisation at all, which is why this calculator says so in words rather than showing a blank result. The exclusion is not an accident of definition: if 1 were prime, 12 could be written as 2 × 2 × 3, or 1 × 2 × 2 × 3, or 1 × 1 × 2 × 2 × 3, and the fundamental theorem of arithmetic would lose its uniqueness.',
    },
    {
      q: 'Is 2 a prime number, and are there any other even primes?',
      a: '2 is prime, and it is the only even prime. Any other even number has 2 as a divisor in addition to 1 and itself, giving it at least three divisors, so it is composite by definition. That makes 2 and 3 the only pair of consecutive primes.',
    },
    {
      q: 'Are 0 and negative numbers prime?',
      a: 'Neither. 0 is divisible by every whole number, so it has no finite divisor list and no prime factorisation — it is neither prime nor composite. Primality is conventionally defined only for integers of 2 and above, so a negative input is rejected here rather than answered, with a message explaining why.',
    },
    {
      q: 'Why does the input stop at 100,000,000,000?',
      a: 'Because the calculator runs in your browser on every keystroke and the answer has to arrive before the next one. Trial division costs roughly √n divisions, and the slowest case is a large prime, where the loop cannot exit early and the nearest-prime search on either side repeats the same full-length work. At 100 billion that whole workload was measured at about 13 ms on average and 19 ms at worst; at a trillion it rose to 40–70 ms, which is visible lag. The cap is where the measurement put it, not a round number.',
    },
    {
      q: 'What is the difference between the exponent form and the expanded form?',
      a: 'They say the same thing at different lengths. The exponent form gathers repeated factors together — 360 = 2³ × 3² × 5 — which is the compact notation used in textbooks and the one you want when reducing fractions or finding a lowest common multiple. The expanded form lists every factor separately, 360 = 2 × 2 × 2 × 3 × 3 × 5, which is easier to check by multiplying straight through.',
    },
  ],
  related: ['gcd-lcm-calculator', 'fraction-calculator', 'ratio-calculator'],
  lastReviewed: '2026-07-31',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

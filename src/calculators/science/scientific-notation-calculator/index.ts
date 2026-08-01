import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'scientific-notation-calculator',
  category: 'science',
  title: 'Scientific Notation Calculator',
  seoTitle: 'Scientific Notation Calculator: Standard Form and Sig Figs',
  description:
    'Write a number in standard form, or multiply, divide, add and subtract in scientific notation — with the significant-figure rule for each shown in full.',
  intro:
    'Scientific notation writes a number as a coefficient between 1 and 10 times a power of ten, so 602,000,000,000,000,000,000,000 becomes 6.02 × 10^23. This puts any number into that form and does arithmetic in it, carrying the significant-figure rules that make the answer honest: multiplying and dividing keep the fewer significant figures, while adding and subtracting keep the coarser decimal place. Because the coefficient and the exponent are handled separately, results far past what a computer can hold — 2 × 10^601 — come back as figures rather than as an error.',
  fields,
  resultLabel: 'Standard form',
  compute,
  faqs: [
    {
      q: 'What is scientific notation?',
      a: 'A way of writing any number as a coefficient times a power of ten, where the coefficient is at least 1 and less than 10. The exponent counts how many places the decimal point has moved: positive for a large number, negative for a small one. So 250,000 is 2.5 × 10^5 and 0.00015 is 1.5 × 10^-4. It exists because the alternative is unreadable — the mass of an electron written out is a decimal point followed by thirty zeros — and because it makes the precision of a measurement explicit, since every digit in the coefficient is a significant figure and there is nowhere for a placeholder zero to hide.',
    },
    {
      q: 'How do you multiply numbers in scientific notation?',
      a: 'Multiply the coefficients, add the exponents, then move the decimal point if the coefficient has landed outside 1 to 10. For 6.02 × 10^23 times 3.11 × 10^8: 6.02 × 3.11 = 18.7222 and 23 + 8 = 31, giving 18.7222 × 10^31, which is 1.87222 × 10^32 once the point moves one place left and the exponent takes the place instead. Division is the same in reverse — divide the coefficients and subtract the exponents. The exponents are added as ordinary integers, which is why this stays exact even when the answer is far too large for a computer to store as a number.',
    },
    {
      q: 'How do you add numbers in scientific notation?',
      a: 'You cannot add the coefficients until both numbers are on the same power of ten, because 6 apples and 3 oranges is not 9 of anything. Rewrite the smaller one to match the larger exponent, add the coefficients, then put the result back into standard form. So 1.23 × 10^4 plus 4.5 × 10^3 becomes 1.23 × 10^4 plus 0.45 × 10^4, which is 1.68 × 10^4. Subtraction works identically. This is also where the precision rule changes: addition keeps the coarser decimal place rather than the smaller number of significant figures.',
    },
    {
      q: 'Why does the answer have fewer digits than the numbers I typed?',
      a: 'Because the significant-figure rules say it should, and reporting the extra digits would claim a precision the inputs never had. Multiplication and division keep the count: the answer gets as many significant figures as whichever input had the fewest, so a factor known to one figure caps the whole product at one. Addition and subtraction keep the place instead: the answer stops where the coarser input stopped, so 6.02 × 10^23 plus 3 × 10^8 is still 6.02 × 10^23, because the second number is far below the place the first one stops making claims about. The working on this page shows the unrounded answer as well, so you can see exactly what was given up.',
    },
    {
      q: 'What is engineering notation?',
      a: 'The same idea with the exponent restricted to a multiple of three, so that it lines up with the SI prefixes. 6.02 × 10^23 in engineering notation is 602 × 10^21, which reads as 602 zetta-something; 1.5 × 10^-7 is 150 × 10^-9, which is 150 nano-something. The coefficient then sits between 1 and 1000 instead of between 1 and 10. Electronics and instrumentation use it because the answer arrives already in the unit people speak in — kilohms, microfarads, nanoseconds — rather than needing a further conversion in your head.',
    },
    {
      q: 'Why is 3.0 treated as one significant figure here?',
      a: 'Because the coefficient boxes take numbers, and a stored number has no memory of the zeros it was written with. 3.0 and 3 are the same value in a computer, so this page reads either as one significant figure and says so in a note whenever it matters. The rule is applied to what it can actually see. If your 3.0 was measured to two figures, count the figures yourself and read the working against that count — or use the significant figures calculator, which takes the number as text and keeps every trailing zero you type.',
    },
    {
      q: 'Can it handle numbers too big for a computer to store?',
      a: 'Yes, and that is the main reason the coefficient and the exponent are separate fields rather than one box. A double-precision number stops at about 1.8 × 10^308, so evaluating 6.02 × 10^300 times 3 × 10^300 the ordinary way gives Infinity and loses every digit of a perfectly well-defined answer. Here the exponents are added as integers — exact at any size — and the coefficients are multiplied on their own, where they are small and well behaved, so the answer comes back as 2 × 10^601. The same holds underneath, where results below about 5 × 10^-324 would otherwise collapse to zero.',
    },
    {
      q: 'What happens when you subtract two numbers that are almost equal?',
      a: 'You can lose every significant figure you had, and this calculator reports that rather than hiding it. 1.5 × 10^5 minus 1.49 × 10^5 is 1000 as plain arithmetic, but 1.5 × 10^5 says nothing at all about the hundreds place — it stops at the ten-thousands — so no digit of that 1000 is significant. This is called catastrophic cancellation: the leading digits agree and cancel, leaving only the digits that were uncertain to begin with. It is why measurements intended to be subtracted are taken to more figures than the difference itself appears to need.',
    },
  ],
  related: ['exponent-calculator', 'logarithm-calculator', 'square-root-calculator'],
  lastReviewed: '2026-08-01',
  priority: 0.6,
} satisfies CalculatorDef<typeof fields>

export default def

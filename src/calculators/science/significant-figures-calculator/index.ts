import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'significant-figures-calculator',
  category: 'science',
  title: 'Significant Figures Calculator',
  seoTitle: 'Significant Figures Calculator: Count and Round Sig Figs',
  description:
    'Count the significant figures in any number, or round to a set number of them, with every rule shown — leading, trailing and embedded zeros included.',
  intro:
    'Significant figures are the digits of a measurement that actually carry information. Type a number exactly as you wrote it down and this counts them digit by digit, naming the rule that decides each one, or rounds to however many figures you need. Trailing zeros are the whole difficulty: 0.004500 states four significant figures and 0.0045 states two, even though they are the same number — which is why this page takes your number as text rather than through a number box that would quietly throw those zeros away.',
  fields,
  resultLabel: 'Rounded value',
  compute,
  faqs: [
    {
      q: 'What are significant figures?',
      a: 'They are the digits in a written number that carry measured information, as opposed to the zeros that only place the decimal point. Four rules settle every digit: every non-zero digit counts; a zero between two significant digits counts; a leading zero never counts; and a trailing zero counts only when a decimal point is written. So 0.004500 has four significant figures, 505 has three, and 0.5 has one. The point of the count is honesty about precision — a ruler marked in millimetres cannot produce a length good to a micrometre, and writing one implies a measurement nobody made.',
    },
    {
      q: 'Are trailing zeros significant?',
      a: 'After a written decimal point, yes, always. 0.004500 and 1.230 both end in zeros that nobody needed to write, so writing them is a deliberate claim that those places were measured — four significant figures and four again. Before the decimal point it depends, and that is genuinely unresolved rather than a rule you have forgotten: 1200 could be two figures or four, and the digits alone cannot say. Scientific notation removes the doubt entirely, which is the real reason it is used in the sciences.',
    },
    {
      q: 'How many significant figures does 1200 have?',
      a: 'Two, by the convention this calculator follows and the one most courses teach, because there is no decimal point to make the trailing zeros count. But the honest answer is that the number as written does not say. If both zeros were measured, write 1.200 × 10^3, which states four and cannot be misread. If only the first was, write 1.20 × 10^3. Some style guides let you write 1200. with a trailing point to mean four figures, and this calculator reads that too — but scientific notation travels better, because the trailing point is easy to mistake for a full stop.',
    },
    {
      q: 'Why does this calculator take the number as text instead of a number box?',
      a: 'Because a number box would destroy the answer before the calculation started. Computers store 0.004500 and 0.0045 as exactly the same value — the trailing zeros have no representation in binary and are gone the moment the text is parsed — so a calculator reading from a number input genuinely cannot tell four significant figures from two. Everything here works on the digits you typed, as characters, which is also why the rounding is exact: rounding 1.005 to three figures gives 1.01 as taught, where the usual floating-point route gives 1.00 because 1.005 is really stored as 1.00499999999999989.',
    },
    {
      q: 'Does a 5 round up or down?',
      a: 'This calculator rounds half up: look at the first digit dropped, and if it is 5 or more, add one to the last digit kept. That is the rule taught alongside significant figures, so 0.0045 to one figure gives 0.005 and 2.345 to three gives 2.35. Measurement standards and the IEEE 754 floating-point standard prefer round-half-to-even instead, which sends an exact tie to whichever choice leaves the last kept digit even, so that a long column of ties does not drift upward. The two rules differ only on an exact tie, and this page says so on the results where they would disagree.',
    },
    {
      q: 'How do significant figures carry through a calculation?',
      a: 'Two different rules, depending on the operation. Multiplication and division keep the count: the answer gets the same number of significant figures as whichever input had the fewest, so 6.02 × 3.0 is 18, not 18.06. Addition and subtraction keep the decimal place instead: the answer is rounded to the coarsest last-significant place among the inputs, so 12.345 + 1.2 is 13.5. Round once, at the end — rounding at every intermediate step compounds the error you were trying to control.',
    },
    {
      q: 'Do leading zeros ever count?',
      a: 'No, never, however many there are. In 0.000009 the six zeros exist only to position the decimal point, so the number has exactly one significant figure. The clearest way to see it is to rewrite the number in scientific notation, where placeholders cannot survive: 0.000009 is 9 × 10^-6, and there is nowhere for a leading zero to hide. The same number expressed in different units makes the point again — 0.000009 metres is 9 micrometres, and changing the unit obviously cannot change how precisely something was measured.',
    },
  ],
  related: [
    'exponent-calculator',
    'square-root-calculator',
    'average-calculator',
    'percentage-calculator',
  ],
  lastReviewed: '2026-08-01',
  priority: 0.6,
} satisfies CalculatorDef<typeof fields>

export default def

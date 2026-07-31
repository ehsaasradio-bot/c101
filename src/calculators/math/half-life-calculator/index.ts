import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'half-life-calculator',
  category: 'math',
  title: 'Half-Life Calculator',
  seoTitle: 'Half-Life Calculator: decay, elapsed time and decay constant',
  description:
    'Solve exponential decay in any direction — remaining amount, half-life, elapsed time or starting amount — with the decay constant and mean lifetime.',
  intro:
    'A half-life is the time it takes for half of whatever is present to disappear, and it is the same length of time no matter how much you start with. That single fact gives N(t) = N0 x (1/2)^(t/T), which ties four quantities together: the starting amount, what is left, how long has passed, and the half-life itself. Give any three and this returns the fourth, along with the decay constant lambda = ln2 / T, the mean lifetime 1 / lambda, and the number of half-lives elapsed — the figures that turn a number into an explanation. It is not only a physics tool: the same first-order law governs how a drug leaves the bloodstream and how radiocarbon dating puts an age on a bone.',
  fields,
  resultLabel: 'Amount remaining',
  compute,
  faqs: [
    {
      q: 'What is the half-life formula?',
      a: 'N(t) = N0 x (1/2)^(t/T), where N0 is what you started with, T is the half-life and t is the elapsed time. The exponent t/T is simply the number of half-lives that have gone by, so after 1 half-life the fraction left is 1/2, after 2 it is 1/4, and after n it is 1 over 2 to the n. Rearranging that one identity gives the other three directions: t = T x log2(N0/N) for elapsed time, T = t x ln2 / ln(N0/N) for the half-life, and N0 = N x 2^(t/T) for the starting amount. This page shows whichever rearrangement it used in the worked steps.',
    },
    {
      q: 'What are the decay constant and the mean lifetime?',
      a: 'They are the same decay described two other ways. Written in base e the law is N(t) = N0 x e^(-lambda x t), and the decay constant lambda is the instantaneous fraction lost per unit time. It relates to the half-life by lambda = ln2 / T, so lambda x T is always ln 2, about 0.693147 — this page prints that product as a check. The mean lifetime, tau = 1 / lambda = T / ln2, is the average time an individual atom or molecule survives. It is longer than the half-life, about 1.4427 times it, because the few very long-lived survivors pull the average up past the midpoint.',
    },
    {
      q: 'Why can the remaining amount never be zero?',
      a: 'Because decay is multiplicative, not subtractive. Each half-life removes half of what is left rather than a fixed quantity, so the amount approaches zero without ever arriving: after 10 half-lives about 0.098% remains, after 50 about 8.9 x 10^-14 percent, and there is always something. That is why asking this calculator for the time to reach zero is refused rather than answered with infinity, and why a remaining amount of zero is rejected against the field rather than silently accepted. In practice the material runs out when the last individual atom decays, which is a random event the smooth exponential only describes on average.',
    },
    {
      q: 'Why is a drug said to be cleared after about five half-lives?',
      a: 'Because five halvings leave 1/32 of the dose, so 96.875% has gone — usually rounded to "about 97%". Seven half-lives leave 1/128, or 99.2%. Neither is a special number in the maths; the rule of thumb just marks the point where what is left is small enough to stop mattering clinically. Caffeine is the everyday example: the US FDA puts its half-life at roughly 4 to 6 hours in healthy adults, so a 100 mg cup at noon is down to about 25 mg by 10 hours later and roughly 3 mg the following morning — which is the arithmetic behind the advice not to drink coffee late.',
    },
    {
      q: 'How does carbon dating use a half-life?',
      a: 'Living things take up carbon-14 from the atmosphere at a roughly steady rate, and stop when they die. From that moment the carbon-14 decays with a half-life of 5,730 plus or minus 40 years — the "Cambridge half-life", re-measured by H. Godwin and published in Nature in 1962 and adopted at the Cambridge radiocarbon conference that year. Measuring what fraction is left and solving for elapsed time gives the age: half remaining is about 5,730 years, a quarter about 11,460. Radiocarbon laboratories still quote conventional ages using Libby original 5,568-year figure, so that decades of published dates stay comparable, then calibrate; set the time unit to years and enter your own half-life to see either convention.',
    },
    {
      q: 'Does the half-life depend on how much you start with?',
      a: 'No, and that is what makes it useful. Because each interval removes a constant fraction rather than a constant quantity, the time to halve is the same whether you have a kilogram or a microgram — this is what "first-order" means. Doubling the initial amount doubles what is left at every instant but leaves the half-life, the decay constant and the fraction remaining untouched. It also means the answer does not care what unit the amounts are in, as long as both are in the same one: milligrams, atoms, becquerels or percent all give the same half-life.',
    },
    {
      q: 'Why do some calculators report three half-lives as 2.9999999999999996?',
      a: 'Because the number of half-lives is a division, t/T, and neither decimal survives binary floating point exactly. A half-life of 0.1 with 0.3 elapsed gives 2.9999999999999996 in almost every programming language, and raising one half to that power then yields 12.500000000000004 rather than 12.5. The same thing happens computing a logarithm by change of base, where two inexact logarithms are divided. This calculator rounds such a value to the whole number only after checking it: it multiplies the whole number back by the half-life and keeps the tidy answer only if the elapsed time you entered reappears. A figure that is merely near a whole number, like 2.9 half-lives, is left exactly where the arithmetic put it.',
    },
  ],
  related: [
    'logarithm-calculator',
    'exponent-calculator',
    'compound-interest-calculator',
    'percentage-change-calculator',
  ],
  lastReviewed: '2026-07-31',
  priority: 0.6,
} satisfies CalculatorDef<typeof fields>

export default def

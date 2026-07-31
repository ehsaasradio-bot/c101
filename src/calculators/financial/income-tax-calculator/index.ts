import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

/*
 * The tax year is 2026 and it is stated in the copy as well as in `compute.ts`,
 * because a page of tax numbers with no year on it is worse than no page. When
 * the IRS publishes the 2027 revenue procedure, the brackets in `compute.ts`,
 * the year in this copy, and `lastReviewed` all move together.
 */
const def = {
  slug: 'income-tax-calculator',
  category: 'financial',
  title: 'Income Tax Calculator',
  seoTitle: 'Income Tax Calculator: 2026 Federal Brackets and Rates',
  description:
    'Work out 2026 US federal income tax bracket by bracket, and see why the effective rate you pay is well below the marginal rate on your last dollar.',
  intro:
    'US federal income tax is progressive: each slice of taxable income is taxed at its own rate, so moving into a higher bracket raises the rate only on the dollars inside that bracket. This works out tax year 2026 federal tax from gross income, filing status, and pre-tax deductions, shows what each bracket costs, and sets the marginal rate beside the effective rate — the average across every dollar you earned, and always the smaller of the two.',
  fields,
  resultLabel: 'Federal income tax',
  compute,
  faqs: [
    {
      q: 'What is the difference between the marginal rate and the effective rate?',
      a: 'The marginal rate is the rate on your next dollar of taxable income — the bracket you are currently sitting in. The effective rate is the total tax divided by your whole gross income, so it averages in every dollar taxed at 0%, 10%, and 12% along the way. A single filer on $85,000 in 2026 has a 22% marginal rate but an effective rate of about 11.6%, roughly half.',
    },
    {
      q: 'Can a raise into a higher tax bracket leave me with less money?',
      a: 'No. Only the income above the bracket threshold is taxed at the higher rate; everything below it keeps the rate it already had. Crossing from the 12% band into the 22% band means the first dollar over the line is taxed 22 cents, so you keep 78 cents of it. Take-home pay rises with every extra dollar of income at every point on the scale. The cliff people fear does exist for some means-tested benefits and credits, but never for the tax brackets themselves.',
    },
    {
      q: 'What are the 2026 federal tax brackets and standard deduction?',
      a: 'From IRS Revenue Procedure 2025-32, a single filer in tax year 2026 pays 10% on taxable income up to $12,400, then 12% up to $50,400, 22% up to $105,700, 24% up to $201,775, 32% up to $256,225, 35% up to $640,600, and 37% above that. Married filing jointly the bands end at $24,800, $100,800, $211,400, $403,550, $512,450, and $768,700; head of household at $17,700, $67,450, $105,700, $201,750, $256,200, and $640,600. The standard deduction is $16,100 single, $32,200 married filing jointly, and $24,150 head of household.',
    },
    {
      q: 'Does this include Social Security, Medicare, or state income tax?',
      a: 'No — this is federal income tax alone. FICA payroll tax takes another 7.65% of most wages (6.2% Social Security up to the wage base, 1.45% Medicare with no cap), and most states levy their own income tax on top. Tax credits, which reduce the bill dollar for dollar after this calculation, are not included either. Treating this number as your total tax or your take-home pay would understate what leaves your paycheck by a wide margin.',
    },
    {
      q: 'What counts as a pre-tax deduction?',
      a: 'Contributions that come out of pay before federal income tax is figured: traditional 401(k), 403(b) and 457 deferrals, health savings account contributions, flexible spending accounts, and most employer health insurance premiums. They lower taxable income dollar for dollar, so each dollar deferred saves you your marginal rate in tax. Roth contributions are made after tax and do not belong in that field.',
    },
    {
      q: 'Why is my taxable income lower than my salary?',
      a: 'Two subtractions happen first. Pre-tax deductions come off your gross pay to give adjusted gross income, and then the standard deduction comes off that. A single filer earning $85,000 with no pre-tax deductions has $68,900 of taxable income in 2026, because the first $16,100 is shielded by the standard deduction and taxed at nothing at all.',
    },
  ],
  related: ['salary-calculator', 'sales-tax-calculator', 'net-worth-calculator', 'capital-gains-calculator'],
  disclaimer: 'financial',
  lastReviewed: '2026-07-30',
  priority: 0.8,
} satisfies CalculatorDef<typeof fields>

export default def

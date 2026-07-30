import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'salary-calculator',
  category: 'financial',
  title: 'Salary Calculator',
  seoTitle: 'Salary Calculator: Hourly to Annual Pay Converter',
  description:
    'Convert pay between hourly, daily, weekly, biweekly, monthly, and annual figures. Set your hours per week and paid weeks per year for an exact match.',
  intro:
    'Pay quoted per hour and pay quoted per year are the same number seen from different angles. Enter any one figure with your working pattern and this converts it to every other pay period, gross of tax.',
  fields,
  resultLabel: 'Annual salary',
  faqs: [
    {
      q: 'How do I convert an hourly wage to an annual salary?',
      a: 'Multiply the hourly rate by the hours you work each week, then by the number of paid weeks in your year. At 40 hours across all 52 weeks that is 2,080 hours, so a $25 hourly rate is $52,000 a year.',
    },
    {
      q: 'Why is biweekly pay not simply the monthly figure halved?',
      a: 'A year holds 26 biweekly periods but only 12 months, so a biweekly cheque is the annual salary divided by 26 while a monthly one is divided by 12. Two months each year therefore contain three biweekly paydays.',
    },
    {
      q: 'Should I reduce the paid weeks per year for holidays?',
      a: 'Only for unpaid time. Paid vacation and paid public holidays are already inside a salaried year, so leave the figure at 52. Contractors and hourly staff who take unpaid weeks should subtract those weeks instead.',
    },
    {
      q: 'Is this gross pay or take-home pay?',
      a: 'Every figure here is gross, meaning before income tax, national or social insurance, pension contributions, and any other payroll deduction. Net pay depends on your jurisdiction, filing status, and benefit elections.',
    },
  ],
  compute,
  related: ['house-affordability-calculator', 'inflation-calculator', 'retirement-calculator', 'income-tax-calculator', 'paycheck-calculator'],
  disclaimer: 'financial',
  lastReviewed: '2026-07-27',
  priority: 0.8,
} satisfies CalculatorDef<typeof fields>

export default def

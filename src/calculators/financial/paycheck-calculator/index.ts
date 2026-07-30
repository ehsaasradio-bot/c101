import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

/*
 * TAX YEAR 2026. Every dollar figure in the copy below — the Social Security
 * wage base, the standard deduction, the 401(k) limit, the Additional Medicare
 * threshold — is dated, and all but the last are re-set each year. When the
 * constants in `compute.ts` move, these sentences move with them.
 */
const def = {
  slug: 'paycheck-calculator',
  category: 'financial',
  title: 'Paycheck Calculator',
  seoTitle: 'Paycheck Calculator: 2026 Take-Home Pay After Taxes',
  description:
    'Estimate take-home pay per paycheck for 2026 after federal income tax, Social Security, Medicare, 401(k) and health premiums. Federal only, no state tax.',
  intro:
    'Your gross salary is not what lands in your account. This works out what one paycheck is actually worth for tax year 2026, after federal income tax, Social Security at 6.2 percent up to the 184,500 dollar wage base, Medicare at 1.45 percent, your pre-tax 401(k) and health premiums, and anything taken out after tax. It covers federal taxes only: state, county and city income taxes are not included, so if you live somewhere that levies one, your real paycheck will be smaller than the number here.',
  fields,
  resultLabel: 'Take-home pay per paycheck',
  compute,
  faqs: [
    {
      q: 'Does this include state and local income tax?',
      a: 'No. Every figure here is federal only. Forty-one states levy an income tax, and several thousand counties, cities and school districts levy one on top of it, at rates that run from well under one percent to more than ten. A take-home figure that ignores them is optimistic everywhere except Alaska, Florida, Nevada, New Hampshire, South Dakota, Tennessee, Texas, Washington and Wyoming. Treat the number above as a ceiling and subtract your own state and local withholding from it.',
    },
    {
      q: 'What is FICA, and why is it taken out separately?',
      a: 'FICA is Social Security plus Medicare, and it is a payroll tax rather than an income tax, so it is charged on your wages with no standard deduction and no brackets. Social Security is 6.2 percent of wages up to the 2026 wage base of 184,500 dollars, which caps your Social Security tax at 11,439 dollars for the year. Medicare is 1.45 percent of every dollar with no ceiling, and an extra 0.9 percent applies to wages above 200,000 dollars if you are single or head of household, or 250,000 dollars filing jointly. Your employer pays a matching 6.2 and 1.45 percent that never appears on your stub.',
    },
    {
      q: 'Why does a bigger 401(k) contribution not cut my Social Security tax?',
      a: 'A traditional 401(k) deferral is exempt from federal income tax but not from FICA. The money is counted as wages for Social Security and Medicare in the year you earn it, which is why deferring more shrinks the income-tax line and leaves the FICA lines untouched. Pre-tax health premiums run through a Section 125 cafeteria plan and are different: they come out before both income tax and FICA, which is why this calculator subtracts them from the FICA base and the 401(k) from the taxable-income base only.',
    },
    {
      q: 'Which tax year and which figures does this use?',
      a: 'Tax year 2026. The brackets and the standard deduction of 16,100 dollars single, 32,200 dollars married filing jointly and 24,150 dollars head of household come from IRS Rev. Proc. 2025-32. The Social Security wage base of 184,500 dollars was announced by the Social Security Administration in October 2025. The 401(k) elective deferral limit of 24,500 dollars comes from IRS Notice 2025-67. The 0.9 percent Additional Medicare thresholds are set in statute and have not moved since 2013. If you are reading this in a later tax year, every one of those numbers except the last has changed.',
    },
    {
      q: 'Will my actual paycheck match this exactly?',
      a: 'Rarely to the cent. This spreads your whole-year federal liability evenly across your paychecks, whereas your employer withholds using the IRS percentage-method tables and whatever you entered on your Form W-4, including dependants, credits, extra withholding and second-job adjustments. It also assumes the standard deduction, one job, no bonuses, no other household income and no employer match. The gap between an even spread and real withholding is what produces most refunds and balances due.',
    },
    {
      q: 'How many paychecks does a year have?',
      a: 'Weekly pay gives 52, every-two-weeks gives 26, twice a month gives 24 and monthly gives 12. Biweekly and semi-monthly are not the same thing: 26 periods against 24 means a biweekly paycheck is smaller, and two months each year hold three biweekly paydays rather than two. Because the per-paycheck deductions above are multiplied by that count, switching frequency changes your annual deduction total as well as the size of each cheque.',
    },
  ],
  // Slugs, never hrefs. Every one must resolve or the conformance suite fails.
  related: ['salary-calculator', 'retirement-calculator', 'net-worth-calculator'],
  disclaimer: 'financial',
  lastReviewed: '2026-07-30',
  priority: 0.8,
} satisfies CalculatorDef<typeof fields>

export default def

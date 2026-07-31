import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * `salePrice` is deliberately first: the end-to-end suite nudges the first
 * number field to 1.1x its default, and the gain — and therefore the tax — is
 * strictly increasing in the sale price everywhere above the cost basis, so the
 * nudged value is always valid and always moves the headline.
 *
 * `otherIncome` is last because it is the input people forget matters. It does:
 * the long-term rate is 0%, 15% or 20% depending on where the gain lands when
 * stacked on top of your other taxable income, so the same $19,500 profit can
 * cost nothing at all or nearly $4,000 depending on this one number.
 */
export const fields = [
  {
    kind: 'number',
    id: 'salePrice',
    label: 'Sale price',
    default: 50_000,
    // A slider spans these, so both ends must be values compute accepts. A sale
    // price of 0 is a total write-off — a real answer here, not an error.
    min: 0,
    max: 10_000_000,
    step: 500,
    unit: '$',
    help: 'What you sold the asset for, before commissions and closing costs.',
  },
  {
    kind: 'number',
    id: 'costBasis',
    label: 'Cost basis',
    default: 30_000,
    min: 0,
    max: 10_000_000,
    step: 500,
    unit: '$',
    help: 'What you paid for it, plus purchase commissions and any capital improvements.',
  },
  {
    kind: 'number',
    id: 'sellingCosts',
    label: 'Selling costs',
    default: 500,
    min: 0,
    max: 1_000_000,
    step: 50,
    unit: '$',
    help: 'Broker commissions, agent fees and closing costs on the sale itself.',
  },
  {
    kind: 'number',
    id: 'holdingDays',
    label: 'Holding period',
    // 548 days is a year and a half: comfortably long-term, so the page opens on
    // the long-term rate with the short-term figure beside it. The slider's soft
    // range is about 4x the default, which puts the 365-day line well inside the
    // draggable part of the track — the whole point of this control.
    default: 548,
    min: 1,
    max: 14_600,
    step: 1,
    unit: 'days',
    help: 'Days held. More than 365 is long-term; 365 or fewer is short-term.',
  },
  {
    kind: 'select',
    id: 'filingStatus',
    label: 'Filing status',
    default: 'single',
    options: [
      { value: 'single', label: 'Single' },
      { value: 'married', label: 'Married filing jointly' },
      { value: 'marriedSeparate', label: 'Married filing separately' },
      { value: 'headOfHousehold', label: 'Head of household' },
    ],
  },
  {
    kind: 'number',
    id: 'otherIncome',
    label: 'Other annual income',
    default: 85_000,
    min: 0,
    max: 5_000_000,
    step: 500,
    unit: '$',
    help: 'Gross income from everything except this sale. The standard deduction is applied for you.',
  },
] as const satisfies readonly Field[]

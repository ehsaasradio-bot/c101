import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

export default function compute(v: Values<typeof fields>): CalcResult {
  const { originalPrice, discountPercent, taxRate } = v
  // `taxBasis` is a select, so it arrives as a string.
  const taxBasis = v.taxBasis

  if (!Number.isFinite(originalPrice) || !(originalPrice > 0))
    throw new CalcError('Enter an original price greater than 0.', 'originalPrice')
  if (!Number.isFinite(discountPercent) || discountPercent < 0)
    throw new CalcError('Discount cannot be negative.', 'discountPercent')
  if (discountPercent > 100)
    throw new CalcError('Discount cannot exceed 100%.', 'discountPercent')
  if (!Number.isFinite(taxRate) || taxRate < 0)
    throw new CalcError('Sales tax rate cannot be negative.', 'taxRate')

  const discountAmount = originalPrice * (discountPercent / 100)
  const priceBeforeTax = originalPrice - discountAmount

  // Most US jurisdictions tax the price actually paid, so a store discount
  // reduces the tax too. A manufacturer coupon is the classic exception: the
  // retailer is reimbursed, so tax is often charged on the full ticket price.
  const taxBase = taxBasis === 'beforeDiscount' ? originalPrice : priceBeforeTax
  const taxAmount = taxBase * (taxRate / 100)
  const finalPrice = priceBeforeTax + taxAmount

  // What the same item would have cost at full price, tax included — the honest
  // baseline for "how much did this sale actually save me".
  const fullPriceWithTax = originalPrice * (1 + taxRate / 100)
  const totalSaved = fullPriceWithTax - finalPrice

  return {
    primary: { label: 'Final price', value: finalPrice, format: { style: 'currency' } },
    scaleValue: discountPercent,
    stats: [
      { label: 'You save', value: discountAmount, format: { style: 'currency' } },
      { label: 'Price before tax', value: priceBeforeTax, format: { style: 'currency' } },
      { label: 'Sales tax', value: taxAmount, format: { style: 'currency' } },
      { label: 'Total saved vs full price', value: totalSaved, format: { style: 'currency' } },
      {
        label: 'Share of ticket price paid',
        value: 100 - discountPercent,
        format: { style: 'percent', decimals: 1 },
      },
    ],
    steps: [
      { label: 'Original price', value: originalPrice, format: { style: 'currency' } },
      { label: 'Discount rate', value: discountPercent, format: { style: 'percent', decimals: 1 } },
      { label: 'Discount amount', value: discountAmount, format: { style: 'currency' } },
      { rule: true },
      { label: 'Price after discount', value: priceBeforeTax, format: { style: 'currency' } },
      { label: 'Taxable amount', value: taxBase, format: { style: 'currency' } },
      { label: 'Tax rate', value: taxRate, format: { style: 'percent', decimals: 3 } },
      { label: 'Tax added', value: taxAmount, format: { style: 'currency' } },
      { rule: true },
      { label: 'Final price', value: finalPrice, format: { style: 'currency' } },
    ],
    // The two slices split the ticket price, not the headline: tax is deliberately
    // left out so 'You pay' plus 'You save' reconstruct the original price exactly.
    // The tax figures stay in the stats above.
    parts: [
      { label: 'You pay', value: Math.max(0, priceBeforeTax), format: { style: 'currency' } },
      { label: 'You save', value: Math.max(0, discountAmount), format: { style: 'currency' } },
    ],
    partsTotal: {
      label: 'Original price',
      value: Math.max(0, priceBeforeTax) + Math.max(0, discountAmount),
      format: { style: 'currency' },
    },
    notes:
      taxBasis === 'beforeDiscount'
        ? [
            'Tax is being charged on the full ticket price, which is how manufacturer coupons are usually handled. Store discounts normally reduce the taxable amount.',
          ]
        : [],
  }
}

import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

export default function compute(v: Values<typeof fields>): CalcResult {
  const { amount, taxRate } = v
  // `mode` is a select, so it arrives as a string.
  const mode = v.mode

  if (!Number.isFinite(amount)) throw new CalcError('Enter an amount.', 'amount')
  if (amount < 0) throw new CalcError('Amount cannot be negative.', 'amount')
  if (!Number.isFinite(taxRate)) throw new CalcError('Enter a sales tax rate.', 'taxRate')
  if (taxRate < 0) throw new CalcError('Sales tax rate cannot be negative.', 'taxRate')
  if (taxRate > 100)
    throw new CalcError('Sales tax rate above 100% is not a real rate.', 'taxRate')
  if (mode !== 'add' && mode !== 'extract')
    throw new CalcError('Choose whether to add or extract tax.', 'mode')

  const fraction = taxRate / 100

  // Two directions on the same identity: total = net × (1 + rate).
  const net = mode === 'add' ? amount : amount / (1 + fraction)
  const tax = mode === 'add' ? amount * fraction : amount - net
  const total = net + tax

  // What the tax works out to as a share of the tax-inclusive total. This is
  // always below the nominal rate, which is why "extract" is not "subtract".
  const shareOfTotal = total > 0 ? (tax / total) * 100 : 0

  return {
    primary: { label: 'Sales tax', value: tax, format: { style: 'currency' } },
    // The headline is the tax alone, so the parts declare their own whole: the
    // tax-inclusive total. `total` is literally `net + tax` in both modes — in
    // 'add' the entered amount is the net, in 'extract' it is the total and the
    // net is backed out of it — so the split is exact and both slices are
    // non-negative for every amount ≥ 0 and rate in [0, 100].
    parts: [
      { label: 'Pre-tax amount', value: net, format: { style: 'currency' } },
      { label: 'Sales tax', value: tax, format: { style: 'currency' } },
    ],
    partsTotal: { label: 'Total', value: net + tax, format: { style: 'currency' } },
    stats: [
      { label: 'Pre-tax amount', value: net, format: { style: 'currency' } },
      { label: 'Total with tax', value: total, format: { style: 'currency' } },
      { label: 'Tax rate applied', value: taxRate, format: { style: 'percent', decimals: 3 } },
      { label: 'Tax as a share of the total', value: shareOfTotal, format: { style: 'percent' } },
    ],
    steps:
      mode === 'add'
        ? [
            { label: 'Pre-tax amount entered', value: amount, format: { style: 'currency' } },
            { label: 'Tax rate', value: taxRate, format: { style: 'percent', decimals: 3 } },
            { rule: true },
            { label: 'Tax = amount × rate', value: tax, format: { style: 'currency' } },
            { label: 'Total = amount + tax', value: total, format: { style: 'currency' } },
          ]
        : [
            { label: 'Tax-inclusive total entered', value: amount, format: { style: 'currency' } },
            { label: 'Tax rate', value: taxRate, format: { style: 'percent', decimals: 3 } },
            { rule: true },
            {
              label: 'Divisor = 1 + rate',
              value: 1 + fraction,
              format: { style: 'decimal', decimals: 4 },
            },
            { label: 'Pre-tax = total ÷ divisor', value: net, format: { style: 'currency' } },
            { label: 'Tax = total − pre-tax', value: tax, format: { style: 'currency' } },
          ],
    notes: [
      'Sales tax rates are set locally: a state rate is often topped up by county, city, and special-district rates, so the combined rate at the register can differ from the state headline figure.',
      mode === 'extract'
        ? 'Extracting tax divides by 1 + rate. Multiplying the tax-inclusive total by the rate would overstate the tax.'
        : 'Retailers usually round each line to the nearest cent, so a receipt may differ from this figure by a cent or two.',
    ],
  }
}

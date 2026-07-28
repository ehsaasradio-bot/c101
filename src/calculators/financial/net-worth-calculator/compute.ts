import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

/**
 * The scale is a debt-to-asset ratio in percent. It is unbounded above (debts
 * can be any multiple of assets), so it is clamped to the declared scale range.
 */
const RATIO_CEILING = 100

export default function compute(v: Values<typeof fields>): CalcResult {
  const { cash, investments, propertyValue, otherAssets, mortgageBalance, otherDebts } = v

  const entries = [
    ['cash', cash],
    ['investments', investments],
    ['propertyValue', propertyValue],
    ['otherAssets', otherAssets],
    ['mortgageBalance', mortgageBalance],
    ['otherDebts', otherDebts],
  ] as const

  for (const [id, amount] of entries) {
    if (!Number.isFinite(amount)) throw new CalcError('Enter a number.', id)
    // Assets and balances owed are both stated as positive magnitudes; a minus
    // sign here means the value is in the wrong box, so it is rejected rather
    // than silently flipped. Net worth itself is free to go negative.
    if (amount < 0) throw new CalcError('Enter zero or a positive amount.', id)
  }

  const totalAssets = cash + investments + propertyValue + otherAssets
  const totalLiabilities = mortgageBalance + otherDebts
  const netWorth = totalAssets - totalLiabilities

  // With no assets at all the ratio has no denominator: call it 0% when nothing
  // is owed either, and fully leveraged otherwise.
  const rawRatio =
    totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : totalLiabilities > 0 ? Infinity : 0
  const debtToAsset = Math.min(rawRatio, RATIO_CEILING)

  const liquidAssets = cash + investments
  const homeEquity = propertyValue - mortgageBalance

  const notes: string[] = []
  if (netWorth < 0)
    notes.push(
      'A negative net worth means debts currently exceed assets. It is common early on — with a mortgage or student loans — and is a starting point, not a verdict.',
    )
  if (rawRatio > RATIO_CEILING)
    notes.push('Debts exceed total assets, so the ratio is shown capped at 100%.')
  if (homeEquity < 0)
    notes.push('The mortgage balance is above the property value, so home equity is negative.')

  // Only the asset side forms a proportion. Liabilities are a claim against
  // assets, not a slice of them, so folding them in would make the shares
  // meaningless — and the whole could not stay non-negative once net worth went
  // negative. They remain in the stats, where they already are.
  //
  // Negative inputs are rejected above, so the clamp never bites today; it is
  // here so the invariant survives any future loosening of that validation.
  const assetPart = (label: string, amount: number) => ({
    label,
    value: Math.max(0, amount),
    format: { style: 'currency', decimals: 0 } as const,
  })
  const parts = [
    assetPart('Cash & savings', cash),
    assetPart('Investments & retirement', investments),
    assetPart('Property', propertyValue),
    assetPart('Other assets', otherAssets),
  ]

  return {
    primary: { label: 'Net worth', value: netWorth, format: { style: 'currency', decimals: 0 } },
    parts,
    // Summed from the clamped parts rather than reusing `totalAssets`, so the
    // stated whole and the slices can never disagree.
    partsTotal: {
      label: 'Total assets',
      value: parts.reduce((sum, p) => sum + p.value, 0),
      format: { style: 'currency', decimals: 0 },
    },
    scaleValue: debtToAsset,
    stats: [
      { label: 'Total assets', value: totalAssets, format: { style: 'currency', decimals: 0 } },
      {
        label: 'Total liabilities',
        value: totalLiabilities,
        format: { style: 'currency', decimals: 0 },
      },
      { label: 'Debt-to-asset ratio', value: debtToAsset, format: { style: 'percent' } },
      { label: 'Liquid assets', value: liquidAssets, format: { style: 'currency', decimals: 0 } },
      { label: 'Home equity', value: homeEquity, format: { style: 'currency', decimals: 0 } },
    ],
    steps: [
      { label: 'Cash & savings', value: cash, format: { style: 'currency', decimals: 0 } },
      {
        label: 'Investments & retirement',
        value: investments,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Property market value',
        value: propertyValue,
        format: { style: 'currency', decimals: 0 },
      },
      { label: 'Other assets', value: otherAssets, format: { style: 'currency', decimals: 0 } },
      { label: 'Total assets', value: totalAssets, format: { style: 'currency', decimals: 0 } },
      { rule: true },
      {
        label: 'Mortgage balance',
        value: mortgageBalance,
        format: { style: 'currency', decimals: 0 },
      },
      { label: 'Other debts', value: otherDebts, format: { style: 'currency', decimals: 0 } },
      {
        label: 'Total liabilities',
        value: totalLiabilities,
        format: { style: 'currency', decimals: 0 },
      },
      { rule: true },
      {
        label: 'Assets minus liabilities',
        value: netWorth,
        format: { style: 'currency', decimals: 0 },
      },
      { label: 'Debt-to-asset ratio', value: debtToAsset, format: { style: 'percent' } },
    ],
    notes,
  }
}

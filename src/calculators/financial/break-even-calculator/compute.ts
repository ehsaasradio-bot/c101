import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

export default function compute(v: Values<typeof fields>): CalcResult {
  const { fixedCosts, pricePerUnit, variableCostPerUnit } = v

  if (!Number.isFinite(fixedCosts) || fixedCosts < 0)
    throw new CalcError('Fixed costs cannot be negative.', 'fixedCosts')
  if (!Number.isFinite(pricePerUnit) || !(pricePerUnit > 0))
    throw new CalcError('Enter a price per unit greater than 0.', 'pricePerUnit')
  if (!Number.isFinite(variableCostPerUnit) || variableCostPerUnit < 0)
    throw new CalcError('Variable cost per unit cannot be negative.', 'variableCostPerUnit')
  if (pricePerUnit <= variableCostPerUnit)
    throw new CalcError(
      'Price per unit must exceed variable cost per unit, or every sale loses money.',
      'pricePerUnit',
    )

  const contributionMargin = pricePerUnit - variableCostPerUnit
  const contributionMarginRatio = contributionMargin / pricePerUnit
  const breakEvenUnits = fixedCosts / contributionMargin
  // Equivalent to breakEvenUnits × price; expressed via the margin ratio because
  // that is the form used when only revenue and cost totals are known.
  const breakEvenRevenue = fixedCosts / contributionMarginRatio
  const unitsToSell = Math.ceil(breakEvenUnits)

  // At break-even, revenue exactly covers total cost, and total cost is fixed
  // costs plus the variable cost of every unit sold. So the two below are the
  // whole of break-even revenue by definition:
  //   units × price = F + units × vc,  since units = F / (price − vc).
  // Both are non-negative because fixedCosts ≥ 0, variableCostPerUnit ≥ 0 and
  // the contribution margin is positive (guarded above).
  const variableCostsAtBreakEven = breakEvenUnits * variableCostPerUnit

  return {
    primary: {
      label: 'Break-even volume',
      value: breakEvenUnits,
      format: { style: 'decimal', decimals: 0, unit: 'units' },
    },
    // The headline is a unit count, not money, so the parts declare their own
    // whole. Its value is the sum of the parts, keeping the total exact rather
    // than relying on `fixedCosts / marginRatio` rounding identically.
    parts: [
      { label: 'Fixed costs', value: fixedCosts, format: { style: 'currency', decimals: 0 } },
      {
        label: 'Variable costs at break-even',
        value: variableCostsAtBreakEven,
        format: { style: 'currency', decimals: 0 },
      },
    ],
    partsTotal: {
      label: 'Break-even revenue',
      value: fixedCosts + variableCostsAtBreakEven,
      format: { style: 'currency', decimals: 0 },
    },
    scaleValue: contributionMarginRatio * 100,
    stats: [
      { label: 'Break-even revenue', value: breakEvenRevenue, format: { style: 'currency', decimals: 0 } },
      {
        label: 'Contribution margin per unit',
        value: contributionMargin,
        format: { style: 'currency' },
      },
      {
        label: 'Contribution margin',
        value: contributionMarginRatio * 100,
        format: { style: 'percent' },
      },
      {
        label: 'Units to clear (whole)',
        value: unitsToSell,
        format: { style: 'decimal', decimals: 0, unit: 'units' },
      },
      {
        label: 'Variable cost at break-even',
        value: breakEvenUnits * variableCostPerUnit,
        format: { style: 'currency', decimals: 0 },
      },
    ],
    steps: [
      { label: 'Price per unit', value: pricePerUnit, format: { style: 'currency' } },
      { label: 'Variable cost per unit', value: variableCostPerUnit, format: { style: 'currency' } },
      {
        label: 'Contribution margin per unit',
        value: contributionMargin,
        format: { style: 'currency' },
      },
      { rule: true },
      { label: 'Fixed costs', value: fixedCosts, format: { style: 'currency', decimals: 0 } },
      {
        label: 'Fixed costs ÷ contribution margin',
        value: breakEvenUnits,
        format: { style: 'decimal', decimals: 1, unit: 'units' },
      },
      { rule: true },
      {
        label: 'Revenue at break-even',
        value: breakEvenRevenue,
        format: { style: 'currency', decimals: 0 },
      },
      {
        label: 'Profit added by each unit beyond break-even',
        value: contributionMargin,
        format: { style: 'currency' },
      },
    ],
    notes: [
      'Break-even assumes price, variable cost, and fixed costs all hold steady across the volume shown.',
      unitsToSell === breakEvenUnits
        ? 'Fixed costs divide evenly, so break-even lands on a whole unit.'
        : `Units are indivisible in most businesses, so ${unitsToSell} sales are needed to actually clear costs.`,
    ],
  }
}

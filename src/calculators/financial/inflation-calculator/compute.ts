import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

/** Guard against absurd exponents producing Infinity rather than an error. */
const MAX_YEARS = 100

export default function compute(v: Values<typeof fields>): CalcResult {
  const { amount, annualInflationRate, years } = v

  if (!Number.isFinite(amount) || !(amount > 0))
    throw new CalcError('Enter an amount greater than 0.', 'amount')
  if (!Number.isFinite(annualInflationRate) || annualInflationRate < 0)
    throw new CalcError('Inflation rate cannot be negative.', 'annualInflationRate')
  if (!Number.isFinite(years) || years < 0)
    throw new CalcError('Number of years cannot be negative.', 'years')
  if (years > MAX_YEARS)
    throw new CalcError(`Number of years cannot exceed ${MAX_YEARS}.`, 'years')

  // The cumulative price multiplier over the whole period.
  const factor = Math.pow(1 + annualInflationRate / 100, years)

  // What the same basket costs after `years` of inflation.
  const futureCost = amount * factor
  // What `amount` of future money is worth in today's prices.
  const equivalentValue = amount / factor
  const purchasingPowerLost = amount - equivalentValue
  const purchasingPowerLostPercent = (1 - 1 / factor) * 100
  const cumulativeInflation = (factor - 1) * 100
  const extraCost = futureCost - amount
  const averageExtraPerYear = years > 0 ? extraCost / years : 0

  // Both lines come from the same multiplier as the headline, so the curves end
  // exactly on the figures printed above them. Thinned for long horizons.
  const stride = Math.max(1, Math.ceil(years / 40))
  const powerPoints: Array<readonly [number, number]> = []
  const costPoints: Array<readonly [number, number]> = []
  for (let t = 0; t < years; t += stride) {
    const f = Math.pow(1 + annualInflationRate / 100, t)
    powerPoints.push([t, amount / f])
    costPoints.push([t, amount * f])
  }
  powerPoints.push([years, equivalentValue])
  costPoints.push([years, futureCost])

  return {
    primary: {
      label: 'Future cost',
      value: futureCost,
      format: { style: 'currency', decimals: 2 },
    },
    scaleValue: purchasingPowerLostPercent,
    stats: [
      {
        label: 'Purchasing power lost',
        value: purchasingPowerLostPercent,
        format: { style: 'percent', decimals: 1 },
      },
      {
        label: 'Equivalent value today',
        value: equivalentValue,
        format: { style: 'currency', decimals: 2 },
      },
      {
        label: 'Purchasing power lost in dollars',
        value: purchasingPowerLost,
        format: { style: 'currency', decimals: 2 },
      },
      {
        label: 'Cumulative inflation',
        value: cumulativeInflation,
        format: { style: 'percent', decimals: 1 },
      },
      {
        label: 'Extra cost versus today',
        value: extraCost,
        format: { style: 'currency', decimals: 2 },
      },
      {
        label: 'Average extra cost per year',
        value: averageExtraPerYear,
        format: { style: 'currency', decimals: 2 },
      },
    ],
    steps: [
      { label: 'Amount today', value: amount, format: { style: 'currency', decimals: 2 } },
      {
        label: 'Annual inflation rate',
        value: annualInflationRate,
        format: { style: 'percent', decimals: 2 },
      },
      { label: 'Years', value: years, format: { style: 'decimal', decimals: 0 } },
      { rule: true },
      { label: 'Price multiplier', value: factor, format: { style: 'decimal', decimals: 4 } },
      {
        label: 'Future cost = amount × multiplier',
        value: futureCost,
        format: { style: 'currency', decimals: 2 },
      },
      {
        label: 'Equivalent value = amount ÷ multiplier',
        value: equivalentValue,
        format: { style: 'currency', decimals: 2 },
      },
      { rule: true },
      {
        label: 'Purchasing power kept',
        value: (1 / factor) * 100,
        format: { style: 'percent', decimals: 1 },
      },
      {
        label: 'Purchasing power lost',
        value: purchasingPowerLostPercent,
        format: { style: 'percent', decimals: 1 },
      },
    ],
    // How much of today's purchasing power survives the period. The headline is
    // the future cost, which is a different whole, so the total is stated.
    partsTotal: { label: "Today's amount", value: amount, format: { style: 'currency', decimals: 2 } },
    parts: [
      { label: 'Value retained', value: equivalentValue, format: { style: 'currency', decimals: 2 } },
      // The remainder, so the pair sums to the amount exactly. The multiplier is
      // never below 1, so neither slice can go negative.
      {
        label: 'Value lost to inflation',
        value: Math.max(0, amount - equivalentValue),
        format: { style: 'currency', decimals: 2 },
      },
    ],
    // Omitted at a zero horizon: a single point is not a line.
    ...(years > 0
      ? {
          series: [
            {
              label: 'Purchasing power',
              points: powerPoints,
              format: { style: 'currency' as const, decimals: 0 },
            },
            {
              label: 'Cost to buy the same thing',
              points: costPoints,
              format: { style: 'currency' as const, decimals: 0 },
            },
          ],
          // Named alongside the series it captions, so the two appear and
          // disappear together rather than leaving a title over nothing.
          chart: { title: 'Purchasing power over time', xLabel: 'Years' },
        }
      : {}),
    notes:
      annualInflationRate === 0
        ? ['At 0% inflation prices never move, so future cost equals the amount you entered.']
        : [],
  }
}

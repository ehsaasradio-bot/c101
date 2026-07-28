import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

/** Matches the scale declared in index.ts, so the meter can never fall off it. */
const SCALE_MIN = -100
const SCALE_MAX = 200

export default function compute(v: Values<typeof fields>): CalcResult {
  const { initialInvestment, finalValue, years, fees } = v

  if (!(initialInvestment > 0))
    throw new CalcError('Enter an initial investment greater than 0.', 'initialInvestment')
  if (!(finalValue >= 0)) throw new CalcError('Final value cannot be negative.', 'finalValue')
  if (!(fees >= 0)) throw new CalcError('Fees cannot be negative.', 'fees')
  if (!(years > 0)) throw new CalcError('Holding period must be greater than 0 years.', 'years')

  // Net proceeds: what actually comes back to you after costs.
  const netProceeds = finalValue - fees
  const netProfit = netProceeds - initialInvestment
  const roi = (netProfit / initialInvestment) * 100

  // The growth multiple is 1 + ROI, so annualizing it keeps the two figures
  // consistent — compounding the annualized rate over `years` reproduces `roi`.
  const multiple = netProceeds / initialInvestment
  // A wipe-out (or fees larger than the proceeds) has no real root; the honest
  // annualized answer there is a total loss, -100%/yr.
  const annualized = multiple > 0 ? (Math.pow(multiple, 1 / years) - 1) * 100 : -100

  const breakEvenValue = initialInvestment + fees
  const profitPerYear = netProfit / years

  // A proportion has to be built from non-negative components, and a return can
  // go either way, so the two directions need two different wholes.
  //
  //  · A gain splits what came back: the capital you already had, plus the gain
  //    on top. Together they are the after-fee proceeds.
  //  · A loss splits what you put in: the part that survived, plus the part that
  //    did not. Together they are the initial investment.
  //
  // Each branch's total is the sum of its own two parts, so the invariant holds
  // by construction rather than by algebraic coincidence.
  const money = { style: 'currency', decimals: 0 } as const
  let parts
  let partsTotal
  if (netProfit >= 0) {
    parts = [
      { label: 'Initial investment', value: initialInvestment, format: money },
      { label: 'Net gain', value: netProfit, format: money },
    ]
    partsTotal = {
      // Net of fees: fees never come back to you, so they are no part of the
      // whole that the capital and the gain make up.
      label: 'Final value after fees',
      value: initialInvestment + netProfit,
      format: money,
    }
  } else {
    // Fees above the final value push proceeds below zero; nothing remains in
    // that case, and the loss is the entire investment.
    const remaining = Math.min(Math.max(netProceeds, 0), initialInvestment)
    const loss = initialInvestment - remaining
    parts = [
      { label: 'Remaining value', value: remaining, format: money },
      { label: 'Loss', value: loss, format: money },
    ]
    partsTotal = { label: 'Initial investment', value: remaining + loss, format: money }
  }

  return {
    primary: { label: 'Return on investment', value: roi, format: { style: 'percent' } },
    parts,
    partsTotal,
    // Clamped so a catastrophic loss still lands in the loss band rather than
    // off the end of the meter. The reported ROI above is never clamped.
    scaleValue: Math.min(Math.max(roi, SCALE_MIN), SCALE_MAX),
    stats: [
      { label: 'Net profit', value: netProfit, format: { style: 'currency', decimals: 0 } },
      { label: 'Annualized return', value: annualized, format: { style: 'percent' } },
      { label: 'Growth multiple', value: multiple, format: { style: 'decimal', decimals: 2, unit: '×' } },
      { label: 'Profit per year', value: profitPerYear, format: { style: 'currency', decimals: 0 } },
      { label: 'Break-even final value', value: breakEvenValue, format: { style: 'currency', decimals: 0 } },
      { label: 'Holding period', value: years * 12, format: { style: 'duration', from: 'months' } },
    ],
    steps: [
      { label: 'Initial investment', value: initialInvestment, format: { style: 'currency', decimals: 0 } },
      { label: 'Final value', value: finalValue, format: { style: 'currency', decimals: 0 } },
      { label: 'Fees and costs', value: fees, format: { style: 'currency', decimals: 0 } },
      { rule: true },
      { label: 'Net proceeds (final − fees)', value: netProceeds, format: { style: 'currency', decimals: 0 } },
      { label: 'Net profit (proceeds − invested)', value: netProfit, format: { style: 'currency', decimals: 0 } },
      { rule: true },
      { label: 'ROI (profit ÷ invested)', value: roi, format: { style: 'percent' } },
      { label: 'Annualized (compounded over the holding period)', value: annualized, format: { style: 'percent' } },
    ],
    notes:
      fees > 0
        ? ['Fees are subtracted from the final value before the return is calculated.']
        : [],
  }
}

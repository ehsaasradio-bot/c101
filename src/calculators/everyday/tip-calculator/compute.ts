import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

/**
 * Binary floating point makes exact currency sums land a hair above or below
 * the whole number they represent (85 * 1.18 / 2 is 50.150000000000006). Nudge
 * by less than a cent before rounding so a share that is *meant* to be whole is
 * not rounded up to the next unit.
 */
const CENT_EPSILON = 1e-9

export default function compute(v: Values<typeof fields>): CalcResult {
  const { billAmount, tipPercent, people, roundUp } = v

  if (!Number.isFinite(billAmount) || billAmount < 0)
    throw new CalcError('Enter a bill amount of 0 or more.', 'billAmount')
  if (!Number.isFinite(tipPercent) || tipPercent < 0)
    throw new CalcError('Tip percentage cannot be negative.', 'tipPercent')
  if (!Number.isFinite(people) || people < 1)
    throw new CalcError('There must be at least 1 person.', 'people')
  if (!Number.isInteger(people))
    throw new CalcError('Enter a whole number of people.', 'people')

  const tip = (billAmount * tipPercent) / 100
  const total = billAmount + tip

  const exactPerPerson = total / people
  const perPerson = roundUp ? Math.ceil(exactPerPerson - CENT_EPSILON) : exactPerPerson

  // Rounding each share up raises what the table actually hands over, so every
  // downstream figure is restated from the amount really paid.
  const paidTotal = perPerson * people
  const paidTip = paidTotal - billAmount
  const effectivePercent = billAmount > 0 ? (paidTip / billAmount) * 100 : 0
  const roundingExtra = paidTotal - total

  // Components of what the table actually hands over. The headline is the
  // per-person share, so these do NOT decompose it — `partsTotal` names the
  // whole they really split. The tip slice is clamped and the bill slice is
  // taken as the remainder, so the two always sum to `paidTotal` exactly even
  // when a float round-trip leaves `paidTip` a hair below zero.
  const tipPart = Math.max(0, paidTip)
  const billPart = Math.max(0, paidTotal - tipPart)

  return {
    primary: {
      label: 'Each person pays',
      value: perPerson,
      format: { style: 'currency' },
    },
    stats: [
      { label: 'Tip amount', value: paidTip, format: { style: 'currency' } },
      { label: 'Total with tip', value: paidTotal, format: { style: 'currency' } },
      { label: 'Tip per person', value: paidTip / people, format: { style: 'currency' } },
      { label: 'Bill per person', value: billAmount / people, format: { style: 'currency' } },
      { label: 'Effective tip rate', value: effectivePercent, format: { style: 'percent' } },
    ],
    steps: [
      { label: 'Bill before tip', value: billAmount, format: { style: 'currency' } },
      { label: 'Tip rate entered', value: tipPercent, format: { style: 'percent' } },
      { label: 'Tip = bill × rate', value: tip, format: { style: 'currency' } },
      { rule: true },
      { label: 'Total = bill + tip', value: total, format: { style: 'currency' } },
      { label: 'People splitting', value: people, format: { style: 'decimal', decimals: 0 } },
      { label: 'Total ÷ people', value: exactPerPerson, format: { style: 'currency' } },
      { rule: true },
      { label: 'Rounding added', value: roundingExtra, format: { style: 'currency' } },
      { label: 'Each person pays', value: perPerson, format: { style: 'currency' } },
    ],
    parts: [
      { label: 'Bill', value: billPart, format: { style: 'currency' } },
      { label: 'Tip', value: tipPart, format: { style: 'currency' } },
    ],
    partsTotal: { label: 'Total', value: billPart + tipPart, format: { style: 'currency' } },
    notes:
      roundUp && roundingExtra > 0
        ? ['Rounding each share up adds a little to the tip, which is why the effective tip rate is higher than the rate you entered.']
        : [],
  }
}

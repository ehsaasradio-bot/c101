import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

export default function compute(v: Values<typeof fields>): CalcResult {
  const { vehiclePrice, downPayment, tradeInValue, salesTaxRate, annualRate } = v
  // `months` is a select, so it arrives as a string — the derived Values type
  // makes forgetting this a compile error rather than a NaN at runtime.
  const months = Number(v.months)

  if (!(vehiclePrice > 0))
    throw new CalcError('Enter a vehicle price greater than 0.', 'vehiclePrice')
  if (downPayment < 0) throw new CalcError('Down payment cannot be negative.', 'downPayment')
  if (tradeInValue < 0) throw new CalcError('Trade-in value cannot be negative.', 'tradeInValue')
  if (tradeInValue > vehiclePrice)
    throw new CalcError('Trade-in value cannot exceed the vehicle price.', 'tradeInValue')
  if (salesTaxRate < 0) throw new CalcError('Sales tax rate cannot be negative.', 'salesTaxRate')
  if (annualRate < 0) throw new CalcError('Interest rate cannot be negative.', 'annualRate')
  if (!(months > 0)) throw new CalcError('Loan term must be at least one month.', 'months')

  // Nearly every US state applies sales tax to the price net of the trade-in
  // credit, but not net of the cash down payment.
  const taxableAmount = vehiclePrice - tradeInValue
  const salesTax = (taxableAmount * salesTaxRate) / 100
  const amountFinanced = vehiclePrice - downPayment - tradeInValue + salesTax

  if (!(amountFinanced > 0))
    throw new CalcError(
      'Your down payment and trade-in already cover the full cost — there is nothing left to finance.',
      'downPayment',
    )

  const monthlyRate = annualRate / 100 / 12
  // A 0% APR loan is just the balance spread evenly; the amortization formula
  // divides by zero there.
  const monthlyPayment =
    monthlyRate === 0
      ? amountFinanced / months
      : (amountFinanced * monthlyRate * Math.pow(1 + monthlyRate, months)) /
        (Math.pow(1 + monthlyRate, months) - 1)

  const totalPaid = monthlyPayment * months
  const totalInterest = totalPaid - amountFinanced
  const totalCost = totalPaid + downPayment + tradeInValue

  // How much of the sticker price you cover up front. This is the axis lenders
  // and buyers actually care about: it drives rate, approval, and how long you
  // spend underwater on the loan.
  const upfrontRaw = ((downPayment + tradeInValue) / vehiclePrice) * 100
  const upfrontPercent = Math.min(100, Math.max(0, upfrontRaw))

  // Standard amortization balance after m payments, from the same amount, rate
  // and payment as the headline figure:
  //   B(m) = P(1+r)^m − PMT((1+r)^m − 1)/r,  and P − PMT·m when r = 0.
  const balanceAfter = (m: number) => {
    const raw =
      monthlyRate === 0
        ? amountFinanced - monthlyPayment * m
        : amountFinanced * Math.pow(1 + monthlyRate, m) -
          (monthlyPayment * (Math.pow(1 + monthlyRate, m) - 1)) / monthlyRate
    return Math.min(amountFinanced, Math.max(0, raw))
  }

  // Yearly samples over the loan term. The longest offered term is 84 months,
  // so this is 8 points; the stride keeps it bounded if longer terms appear.
  const termYears = months / 12
  const yearStride = Math.max(1, Math.ceil(termYears / 40))
  const balancePoints: Array<readonly [number, number]> = []
  for (let t = 0; t <= termYears; t += yearStride)
    balancePoints.push([t, balanceAfter(Math.round(t * 12))])
  if (balancePoints[balancePoints.length - 1]![0] !== termYears)
    balancePoints.push([termYears, balanceAfter(months)])

  const notes: string[] = []
  if (months > 60)
    notes.push(
      'Terms longer than 60 months keep the payment low but leave you owing more than the car is worth for much of the loan.',
    )
  if (upfrontRaw < 10)
    notes.push(
      'With under 10% down, the loan balance typically exceeds the vehicle value from the moment you drive away.',
    )

  return {
    primary: {
      label: 'Monthly payment',
      value: monthlyPayment,
      format: { style: 'currency' },
    },
    scaleValue: upfrontPercent,
    stats: [
      { label: 'Amount financed', value: amountFinanced, format: { style: 'currency', decimals: 0 } },
      { label: 'Sales tax', value: salesTax, format: { style: 'currency', decimals: 0 } },
      { label: 'Total interest', value: totalInterest, format: { style: 'currency', decimals: 0 } },
      { label: 'Total of payments', value: totalPaid, format: { style: 'currency', decimals: 0 } },
      { label: 'Total cost of the car', value: totalCost, format: { style: 'currency', decimals: 0 } },
      { label: 'Cash and trade-in up front', value: upfrontPercent, format: { style: 'percent' } },
      { label: 'Loan term', value: months, format: { style: 'duration', from: 'months' } },
    ],
    steps: [
      { label: 'Vehicle price', value: vehiclePrice, format: { style: 'currency', decimals: 0 } },
      { label: 'Less trade-in', value: -tradeInValue, format: { style: 'currency', decimals: 0 } },
      { label: 'Taxable amount', value: taxableAmount, format: { style: 'currency', decimals: 0 } },
      { label: 'Sales tax rate', value: salesTaxRate, format: { style: 'percent', decimals: 2 } },
      { label: 'Sales tax added', value: salesTax, format: { style: 'currency', decimals: 0 } },
      { rule: true },
      { label: 'Less down payment', value: -downPayment, format: { style: 'currency', decimals: 0 } },
      { label: 'Amount financed', value: amountFinanced, format: { style: 'currency', decimals: 0 } },
      { rule: true },
      { label: 'Annual rate (APR)', value: annualRate, format: { style: 'percent', decimals: 2 } },
      { label: 'Monthly rate', value: annualRate / 12, format: { style: 'percent', decimals: 4 } },
      { label: 'Number of payments', value: months, format: { style: 'decimal', decimals: 0 } },
      { rule: true },
      { label: 'Monthly payment', value: monthlyPayment, format: { style: 'currency' } },
      { label: 'Total interest', value: totalInterest, format: { style: 'currency', decimals: 0 } },
      {
        label: 'Interest as a share of the amount financed',
        value: (totalInterest / amountFinanced) * 100,
        format: { style: 'percent' },
      },
    ],
    // A three-way split of what the car costs you in total. Sales tax is shown
    // on its own rather than folded into the amount financed, which would count
    // it twice: `amountFinanced` already has the tax rolled in, and
    // price + tax + interest is exactly `totalCost`.
    parts: [
      { label: 'Vehicle price', value: vehiclePrice, format: { style: 'currency', decimals: 0 } },
      { label: 'Sales tax', value: salesTax, format: { style: 'currency', decimals: 0 } },
      { label: 'Interest', value: totalInterest, format: { style: 'currency', decimals: 0 } },
    ],
    partsTotal: { label: 'Total cost', value: totalCost, format: { style: 'currency' } },
    series: [
      {
        label: 'Remaining balance',
        points: balancePoints,
        format: { style: 'currency', decimals: 0 },
      },
    ],
    notes,
  }
}

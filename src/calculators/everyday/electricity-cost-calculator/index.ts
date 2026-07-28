import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'electricity-cost-calculator',
  category: 'everyday',
  title: 'Electricity Cost Calculator',
  seoTitle: 'Electricity Cost Calculator: Appliance Running Cost',
  description:
    'Work out what any appliance costs to run. Enter its wattage, hours used per day, and your rate per kWh to see the daily, monthly, and yearly cost.',
  intro:
    'Electricity is billed by the kilowatt-hour: one kilowatt drawn for one hour. Divide an appliance’s wattage by 1000, multiply by the hours you run it, and multiply by your rate — that is the whole calculation, and it is what this tool does across a day, a month, and a year.',
  fields,
  resultLabel: 'Cost per month',
  compute,
  faqs: [
    {
      q: 'How do I find an appliance’s wattage?',
      a: 'Look for the rating plate — usually a sticker on the back, base, or inside the door — or the specifications page of the manual. It will list watts (W) or amps and volts, and watts equals amps multiplied by volts. A plug-in energy monitor gives you the real figure instead of the rated maximum.',
    },
    {
      q: 'What is a kilowatt-hour?',
      a: 'A kilowatt-hour is the energy used by a 1000-watt appliance running for one hour, and it is the unit your utility bills you in. A 2000-watt kettle uses 1 kWh in half an hour; a 10-watt LED bulb takes 100 hours to use the same amount.',
    },
    {
      q: 'What rate per kWh should I enter?',
      a: 'The most honest number is your bill total divided by the kilowatt-hours billed, because that folds in standing charges, delivery fees, and taxes. Using only the headline energy rate will understate what an extra unit of consumption actually costs you.',
    },
    {
      q: 'Why is my real bill higher than this estimate?',
      a: 'Bills include a fixed daily standing charge you pay regardless of usage, and they cover every appliance in the home rather than the one you entered. Seasonal heating and cooling, plus always-on standby loads across dozens of devices, usually account for the rest of the gap.',
    },
    {
      q: 'Does standby power matter?',
      a: 'It adds up. A device idling at 3 watts costs little on its own, but a household with twenty such devices carries roughly 525 kWh of phantom load a year, which is a real line on the bill for electricity that does no work at all.',
    },
  ],
  related: ['fuel-cost-calculator', 'unit-converter-calculator'],
  lastReviewed: '2026-07-27',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

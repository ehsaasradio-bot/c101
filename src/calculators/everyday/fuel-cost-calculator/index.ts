import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'fuel-cost-calculator',
  category: 'everyday',
  title: 'Fuel Cost Calculator',
  seoTitle: 'Fuel Cost Calculator: Trip Petrol & Gas Cost',
  description:
    'Work out what fuel a trip will cost from distance, efficiency and pump price. Handles km or miles and L/100km, km/L or mpg, plus the round trip.',
  intro:
    'Fuel cost is one multiplication once the units agree: turn the trip into litres burned, then multiply by the price per litre. Enter the distance in kilometres or miles and your efficiency in L/100 km, km/L or mpg, and this does the conversion for you.',
  fields,
  resultLabel: 'Trip fuel cost',
  compute,
  scale: {
    min: 0,
    max: 25,
    clampMax: 20,
    unit: 'L/100km',
    // Consumption normalised to L/100 km, so every efficiency unit lands on the
    // same axis. Roughly: hybrids and small diesels under 5, mainstream family
    // cars 5–9, large SUVs and older engines above 12.
    bands: [
      { id: 'excellent', label: 'Very efficient — under 5 L/100km', from: 0, to: 5 },
      { id: 'good', label: 'Efficient — 5 to 7 L/100km', from: 5, to: 7 },
      { id: 'neutral', label: 'Average — 7 to 9 L/100km', from: 7, to: 9 },
      { id: 'warn', label: 'Thirsty — 9 to 12 L/100km', from: 9, to: 12 },
      { id: 'critical', label: 'Very thirsty — 12 L/100km or more', from: 12, to: 25 },
    ],
  },
  faqs: [
    {
      q: 'How do I convert mpg to L/100 km?',
      a: 'Divide 235.215 by the US mpg figure. So 30 US mpg is about 7.8 L/100 km, and 40 mpg is about 5.9 L/100 km. For imperial (UK) gallons the constant is 282.481 instead, which is why UK mpg numbers always look better.',
    },
    {
      q: 'Should I use my car official figure or my own?',
      a: 'Use your own. Manufacturer figures come from a standardised lab cycle and real-world consumption is typically 10-25% higher, more if you do short cold trips, city stop-start driving, or motorway speeds above 110 km/h.',
    },
    {
      q: 'What is the easiest way to measure real fuel efficiency?',
      a: 'Fill the tank, reset the trip meter, drive normally for a few hundred kilometres, then fill up again. Divide the litres it took by the distance covered and multiply by 100 to get your true L/100 km, brim to brim.',
    },
    {
      q: 'Why does this ask for price per litre when I buy gallons?',
      a: 'Litres keep every efficiency unit on one footing. If your pump price is per gallon, divide it by 3.785 for US gallons or 4.546 for imperial gallons and enter that. A US gallon at $3.79 is almost exactly $1.00 per litre.',
    },
    {
      q: 'Does driving style really change the cost much?',
      a: 'Yes. Steady speeds, gentle acceleration, and correct tyre pressure commonly cut consumption by 10-15%, while roof boxes, heavy loads, and aggressive motorway speeds can add more than that. On a long trip that is real money.',
    },
  ],
  related: ['electricity-cost-calculator', 'unit-converter-calculator', 'tip-calculator'],
  lastReviewed: '2026-07-27',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

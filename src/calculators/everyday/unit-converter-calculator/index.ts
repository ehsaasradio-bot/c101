import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'unit-converter-calculator',
  category: 'everyday',
  title: 'Unit Converter',
  seoTitle: 'Unit Converter: Length, Weight and Temperature',
  description:
    'Convert length, weight, and temperature units — metres to miles, kilograms to pounds, Celsius to Fahrenheit — with the exact factors shown.',
  intro:
    'Every length and weight conversion is one multiplication: change your value into a base unit (metres or grams), then divide by the base value of the unit you want. Temperature is the exception, because its scales start at different zero points, so it is converted through Celsius instead.',
  fields,
  resultLabel: 'Converted value',
  compute,
  faqs: [
    {
      q: 'How do I convert Celsius to Fahrenheit?',
      a: 'Multiply the Celsius reading by 9/5 and add 32. Going the other way, subtract 32 first and then multiply by 5/9. The two scales cross at −40 degrees, which is the one reading that is the same number in both.',
    },
    {
      q: 'How many kilometres are in a mile?',
      a: 'A mile is exactly 1.609344 kilometres, because the international yard was fixed at exactly 0.9144 metres in 1959 and a mile is 1760 yards. Divide kilometres by 1.609344 to get miles, or multiply miles by it to get kilometres.',
    },
    {
      q: 'Why can I not convert kilograms to metres?',
      a: 'They measure different physical quantities, so no conversion factor exists between them. This tool checks that both units you pick belong to the category you selected, and tells you which one does not fit rather than returning a meaningless number.',
    },
    {
      q: 'Is a pound exactly 453.6 grams?',
      a: 'The international avoirdupois pound is defined as exactly 0.45359237 kilograms, so 453.59237 grams. An ounce is one sixteenth of that, and a stone is fourteen pounds. This calculator uses the exact definitions rather than rounded approximations.',
    },
    {
      q: 'What is absolute zero?',
      a: 'It is the lowest temperature physically possible: 0 kelvin, which is −273.15°C or −459.67°F. Entering a temperature below it is rejected as invalid input rather than converted, because no such reading can exist.',
    },
  ],
  related: ['cooking-converter-calculator', 'fuel-cost-calculator'],
  lastReviewed: '2026-07-27',
  priority: 0.8,
} satisfies CalculatorDef<typeof fields>

export default def

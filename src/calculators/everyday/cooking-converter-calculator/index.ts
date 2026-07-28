import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'cooking-converter-calculator',
  category: 'everyday',
  title: 'Cooking Measurement Converter',
  seoTitle: 'Cooking Converter: Cups, Tablespoons, ml & Ounces',
  description:
    'Convert cups, tablespoons, teaspoons, fluid ounces, millilitres, litres, pints and quarts. Enter one amount and read every other kitchen measure.',
  intro:
    'Recipes switch units without warning — a US blog says cups, a European one says millilitres. Enter the amount you have and the unit it is written in, and this converter gives you the same volume in every other common kitchen measure.',
  fields,
  resultLabel: 'Converted amount',
  compute,
  // No scale: a conversion has no good/bad axis. The same volume is neither
  // healthy nor risky, so declaring bands here would be inventing a judgement.
  faqs: [
    {
      q: 'How many tablespoons are in a cup?',
      a: 'A US customary cup holds 16 tablespoons, which is also 48 teaspoons or 8 fluid ounces. In millilitres that is about 236.6ml per cup and 14.79ml per tablespoon.',
    },
    {
      q: 'Is a US cup the same as a metric cup?',
      a: 'No. A US customary cup is about 236.6ml, a metric cup used in Australia and much of Europe is exactly 250ml, and an imperial UK cup is roughly 284ml. This converter uses the US customary cup, which is what most recipe sites mean.',
    },
    {
      q: 'Can I convert cups to grams with this calculator?',
      a: 'Not directly, because cups measure volume and grams measure weight. One cup of flour weighs around 120g while one cup of honey weighs about 340g, so any volume-to-weight conversion has to be done per ingredient with a density table.',
    },
    {
      q: 'How many teaspoons are in a tablespoon?',
      a: 'Three teaspoons make one US tablespoon, so a tablespoon is roughly 14.79ml and a teaspoon roughly 4.93ml. That three-to-one ratio holds for UK and Australian spoons as well, even though their absolute sizes differ slightly.',
    },
    {
      q: 'What is the difference between fluid ounces and ounces?',
      a: 'A fluid ounce measures volume, about 29.57ml, while an ounce measures weight, about 28.35g. They only coincide for water, which is roughly why the two names look alike, so check which one a recipe means before measuring.',
    },
  ],
  related: ['unit-converter-calculator', 'percentage-calculator', 'tip-calculator'],
  lastReviewed: '2026-07-27',
  priority: 0.6,
} satisfies CalculatorDef<typeof fields>

export default def

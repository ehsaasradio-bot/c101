import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its input type
 * from them without importing `index.ts` — which imports `compute.ts` and
 * would cycle.
 *
 * `amount` is deliberately first: the end-to-end suite nudges the first number
 * field to 1.1x its default, and scaling the amount is always valid input and
 * always changes the converted result.
 */
export const fields = [
  {
    kind: 'number',
    id: 'amount',
    label: 'Amount',
    default: 1,
    min: 0,
    max: 100_000,
    step: 0.25,
    unit: 'cups',
    /*
     * These units span three orders of magnitude, so a single slider range is
     * wrong for nearly all of them: a scale that suits litres is useless for
     * teaspoons. Each case gets a range and a step a cook would actually reach
     * for — quarter teaspoons, but whole millilitres.
     *
     * No conversion, as with the other converter: picking a different "from"
     * unit means you are typing a different amount, not the same one restated.
     */
    variants: {
      on: 'fromUnit',
      cases: {
        cup: { min: 0, max: 20, step: 0.25, unit: 'cups' },
        teaspoon: { min: 0, max: 100, step: 0.25, unit: 'tsp' },
        tablespoon: { min: 0, max: 50, step: 0.25, unit: 'tbsp' },
        fluidOunce: { min: 0, max: 64, step: 0.25, unit: 'fl oz' },
        pint: { min: 0, max: 10, step: 0.25, unit: 'pints' },
        quart: { min: 0, max: 8, step: 0.25, unit: 'quarts' },
        millilitre: { min: 0, max: 2000, step: 5, unit: 'ml' },
        litre: { min: 0, max: 10, step: 0.1, unit: 'l' },
      },
    },
    help: 'The quantity written in the recipe.',
  },
  {
    kind: 'select',
    id: 'fromUnit',
    label: 'From unit',
    default: 'cup',
    options: [
      { value: 'teaspoon', label: 'Teaspoons (tsp)' },
      { value: 'tablespoon', label: 'Tablespoons (tbsp)' },
      { value: 'fluidOunce', label: 'Fluid ounces (fl oz)' },
      { value: 'cup', label: 'Cups' },
      { value: 'pint', label: 'Pints' },
      { value: 'quart', label: 'Quarts' },
      { value: 'millilitre', label: 'Millilitres (ml)' },
      { value: 'litre', label: 'Litres (l)' },
    ],
  },
  {
    kind: 'select',
    id: 'toUnit',
    label: 'To unit',
    default: 'millilitre',
    options: [
      { value: 'teaspoon', label: 'Teaspoons (tsp)' },
      { value: 'tablespoon', label: 'Tablespoons (tbsp)' },
      { value: 'fluidOunce', label: 'Fluid ounces (fl oz)' },
      { value: 'cup', label: 'Cups' },
      { value: 'pint', label: 'Pints' },
      { value: 'quart', label: 'Quarts' },
      { value: 'millilitre', label: 'Millilitres (ml)' },
      { value: 'litre', label: 'Litres (l)' },
    ],
  },
] as const satisfies readonly Field[]

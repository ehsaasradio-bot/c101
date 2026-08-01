import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * Four questions, one definition. Molarity is moles of solute per litre of
 * solution, so `mode` picks which side of c = n/V you are missing — plus the
 * dilution law M₁V₁ = M₂V₂, which is the same definition applied twice to a
 * fixed amount of solute. Every quantity keeps its own box whatever the mode, so
 * switching the question never throws away what you already typed.
 *
 * `mass` is deliberately the first NUMBER field: the end-to-end suite nudges it
 * to 1.1x its default and expects a different but still valid answer, and the
 * default mode reads it — 58.44 g becomes 64.284 g, and the molarity moves from
 * 1.0000 to 1.1000 mol/L.
 *
 * THE DEFAULTS ARE ONE WORKED EXAMPLE, in table salt. Sodium chloride has a
 * molar mass of 58.44 g/mol (Na 22.99 + Cl 35.45), so 58.44 g of it is exactly
 * one mole; made up to 1 litre of solution that is exactly 1 mol/L, and diluting
 * that stock to 0.1 mol/L takes it to exactly 10 litres. Every mode agrees at
 * the defaults, and every number on the page can be checked by hand.
 *
 * Bounds: every bound below is a value `compute` accepts. All the minima are
 * strictly positive, because each of these quantities is divided by somewhere
 * and a slider reaches its own left end in one drag.
 */
export const fields = [
  {
    kind: 'select',
    id: 'mode',
    label: 'What do you need?',
    default: 'molarity',
    options: [
      { value: 'molarity', label: 'Molarity, from a mass' },
      { value: 'mass', label: 'Mass to weigh out' },
      { value: 'volume', label: 'Volume to make up to' },
      { value: 'dilution', label: 'Dilution to a target molarity' },
    ],
    help: 'Boxes this question does not use are ignored, so nothing you typed is lost.',
  },
  {
    kind: 'number',
    id: 'mass',
    label: 'Mass of solute',
    default: 58.44,
    min: 0.01,
    max: 100_000,
    step: 0.01,
    unit: 'g',
    help: 'How much solid you have, or are weighing out. 58.44 g of table salt is one mole.',
  },
  {
    kind: 'number',
    id: 'molarMass',
    label: 'Molar mass',
    default: 58.44,
    min: 0.01,
    max: 100_000,
    step: 0.01,
    unit: 'g/mol',
    help: 'Sum the atomic masses in the formula. NaCl is 22.99 + 35.45 = 58.44 g/mol.',
  },
  {
    kind: 'number',
    id: 'volume',
    label: 'Solution volume',
    default: 1,
    min: 0.001,
    max: 1_000_000,
    step: 0.001,
    unit: 'L',
    variants: {
      on: 'volumeUnit',
      cases: {
        // Base first, factor 1. A millilitre is a thousandth of a litre, so one
        // litre is 1000 of them — the factor is "value here / value in litres".
        L: { min: 0.001, max: 10_000, step: 0.001, unit: 'L' },
        mL: { min: 1, max: 1_000_000, step: 1, unit: 'mL', factor: 1000 },
      },
    },
    help: 'The volume of the finished solution, not the volume of solvent you started with.',
  },
  {
    kind: 'select',
    id: 'volumeUnit',
    label: 'Volume unit',
    default: 'L',
    options: [
      { value: 'L', label: 'Litres (L)' },
      { value: 'mL', label: 'Millilitres (mL)' },
    ],
  },
  {
    kind: 'number',
    id: 'molarity',
    label: 'Molarity',
    default: 1,
    min: 0.001,
    max: 100,
    step: 0.001,
    unit: 'mol/L',
    help: 'Moles of solute per litre of solution. In dilution mode this is the stock you start from.',
  },
  {
    kind: 'number',
    id: 'targetMolarity',
    label: 'Target molarity',
    default: 0.1,
    min: 0.001,
    max: 100,
    step: 0.001,
    unit: 'mol/L',
    help: 'Dilution mode only: the concentration you want to end up at.',
  },
] as const satisfies readonly Field[]

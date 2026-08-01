import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'molarity-calculator',
  category: 'science',
  title: 'Molarity Calculator',
  // At most 70 characters.
  seoTitle: 'Molarity Calculator: Moles per Litre, Mass and Dilutions',
  // A meta description: 51-160 characters, written for a search result.
  description:
    'Work out molarity from a mass, the mass to weigh out for a target concentration, the volume to make up to, or a dilution using M₁V₁ = M₂V₂.',
  // The direct answer, for someone who reads nothing else on the page.
  intro:
    'Molarity is moles of solute per litre of solution, so it is one definition read four ways: c = n/V, plus the dilution law M₁V₁ = M₂V₂ that follows from it. Pick the question you have and this returns the answer with the moles it went through on the way. It opens on the standard worked example — 58.44 g of sodium chloride, whose molar mass is 58.44 g/mol, made up to 1 litre, which is exactly 1 mol/L.',
  fields,
  // The initial, server-rendered label. It matches the default mode, which
  // solves for the molarity; the island replaces it with the live primary label
  // whenever the mode changes.
  resultLabel: 'Molarity',
  compute,
  faqs: [
    {
      q: 'How do I calculate molarity from grams?',
      a: 'Two steps. Divide the mass by the molar mass to get moles, then divide the moles by the volume of solution in litres. Table salt is the cleanest example, because its molar mass in grams per mole is the same number as the mass in the example: 58.44 g of NaCl is 58.44 ÷ 58.44 = 1.000 mol, and one mole made up to one litre is 1.000 mol/L, a 1 M solution. Halve the volume to 500 mL and the same solid gives 2 M.',
    },
    {
      q: 'What does the M in “1 M solution” mean?',
      a: 'It means molar — one mole of solute per litre of solution. IUPAC writes the quantity as c and its unit as mol/dm³, which is the same thing as mol/L, but every bottle and every lab protocol uses M. Watch the case: a small m means molal, moles per kilogram of SOLVENT, which is a different quantity that happens to be numerically close for dilute aqueous solutions.',
    },
    {
      q: 'Is molarity per litre of water or per litre of solution?',
      a: 'Per litre of solution, always. That is why the method is to dissolve the solid in a part of the water first and then make the total volume up to the mark in a volumetric flask, rather than adding the solid to a full litre. Dissolved solid takes up room, so the second method gives you more than a litre and a concentration below the one you were aiming for — noticeably so for concentrated solutions.',
    },
    {
      q: 'How does the dilution formula M₁V₁ = M₂V₂ work?',
      a: 'Adding solvent changes the volume and leaves the amount of solute alone, so the moles before and after are the same number. Moles are molarity times volume on each side, which gives M₁V₁ = M₂V₂ directly. Rearranged, the final volume is M₁V₁ ÷ M₂: one litre of 1 M stock taken to 0.1 M has to end up in ten litres, so you add nine litres of solvent to the litre you already have.',
    },
    {
      q: 'How do I find the molar mass of a compound?',
      a: 'Add up the atomic masses in the formula, taking each element as many times as it appears. Sodium chloride is 22.99 + 35.45 = 58.44 g/mol. Glucose, C₆H₁₂O₆, is 6 × 12.01 + 12 × 1.008 + 6 × 16.00 = 180.16 g/mol. Water is 18.02 g/mol. Hydrates count their water: copper(II) sulfate pentahydrate is 249.68 g/mol, not the 159.61 of the anhydrous salt, and using the wrong one scales every result by the same wrong factor.',
    },
    {
      q: 'What is the difference between molarity and normality?',
      a: 'Molarity counts moles of the compound; normality counts moles of whatever is doing the reacting — protons for an acid, electrons for a redox agent. For hydrochloric acid the two are equal, because each molecule supplies one proton. For sulfuric acid they are not: 1 M H₂SO₄ is 2 N, since each molecule can give up two. Normality is falling out of use precisely because it depends on which reaction you have in mind.',
    },
  ],
  // Slugs, never hrefs. Every one must resolve or the conformance suite fails.
  related: ['ratio-calculator', 'percentage-calculator', 'unit-converter-calculator'],
  lastReviewed: '2026-08-01',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

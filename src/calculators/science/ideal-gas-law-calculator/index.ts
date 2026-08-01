import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'ideal-gas-law-calculator',
  category: 'science',
  title: 'Ideal Gas Law Calculator',
  // At most 70 characters.
  seoTitle: 'Ideal Gas Law Calculator: Solve PV = nRT for P, V, n or T',
  // A meta description: 51-160 characters, written for a search result.
  description:
    'Enter any three of pressure, volume, moles and temperature and get the fourth from PV = nRT, in atm, kPa, bar, mmHg, psi and K, °C or °F.',
  // The direct answer, for someone who reads nothing else on the page.
  intro:
    'The ideal gas law, PV = nRT, ties a gas sample’s pressure, volume, amount and temperature together in a single equation — so any three of them fix the fourth. Pick the one you want, enter the other three, and this returns all four values along with the rearrangement it used to get there. It opens at STP: one mole at 1 atm and 273.15 K, filling 22.414 litres.',
  fields,
  // The initial, server-rendered label. It matches the default mode, which
  // solves for the amount of gas; the island replaces it with the live primary
  // label whenever the mode changes.
  resultLabel: 'Amount of gas',
  compute,
  faqs: [
    {
      q: 'What value of R does this use?',
      a: 'R = 8.314462618 J·mol⁻¹·K⁻¹. Since the 2019 SI redefinition that figure is exact rather than measured, because R is the product of two constants that are now fixed by definition: the Avogadro constant, 6.02214076×10²³ mol⁻¹, and the Boltzmann constant, 1.380649×10⁻²³ J·K⁻¹. The litre-atmosphere form you see in chemistry classes, 0.082057366 L·atm·mol⁻¹·K⁻¹, is that same number divided by 101.325 — one litre-atmosphere is exactly 101.325 joules, because an atmosphere is defined as 101325 pascals and a litre as a thousandth of a cubic metre.',
    },
    {
      q: 'Why is the default volume 22.414 litres?',
      a: 'That is the molar volume of an ideal gas at STP as most textbooks quote it. Putting P = 1 atm and T = 273.15 K into V = RT/P gives 22.413969545 L per mole, which rounds to 22.414. The defaults here are that whole state — 1 atm, 22.414 L, 1 mol, 273.15 K — so whichever quantity you solve for, the answer comes back as the value you started from, to within the 1.4 parts per million the rounding costs.',
    },
    {
      q: 'Does the temperature have to be in kelvin?',
      a: 'The arithmetic does; your typing does not. PV = nRT needs an absolute temperature, so 20 °C has to become 293.15 K before it is used — halving the kelvin temperature halves the pressure, while halving the Celsius reading means nothing at all. Pick °C or °F in the selector and the conversion happens for you, including on the value already in the box. Anything at or below absolute zero is refused rather than answered.',
    },
    {
      q: 'Should I enter gauge pressure or absolute pressure?',
      a: 'Absolute, measured from a vacuum. A tyre gauge, a manometer and most cylinder regulators read the difference between the gas and the surrounding air, so a gauge showing 32 psi is really about 46.7 psi absolute. Add roughly 14.7 psi, 101.3 kPa, 1.013 bar or 1 atm to a gauge reading before entering it, or the answer will be badly wrong at low pressures and slightly wrong at high ones.',
    },
    {
      q: 'When does the ideal gas law stop being accurate?',
      a: 'It assumes molecules take up no space and do not attract each other, which is close enough for most gases near room temperature and around one atmosphere — typically within a percent or so. It degrades as you compress a gas, cool it towards its boiling point, or work with strongly polar molecules such as water vapour and ammonia. The usual next steps are the van der Waals equation, which adds terms for molecular volume and attraction, or a tabulated compressibility factor Z in PV = ZnRT.',
    },
    {
      q: 'How do I turn a mass in grams into moles?',
      a: 'Divide the mass by the molar mass of the substance: 8.00 g of oxygen gas, whose molar mass is 32.00 g/mol, is 0.250 mol. Molar masses come from the periodic table, summed over the formula — O₂ is two oxygens at 16.00, CO₂ is 12.01 + 2 × 16.00 = 44.01 g/mol. Going the other way, an amount solved here becomes a mass by multiplying by the molar mass, which is how a gas law problem turns into a weighable quantity.',
    },
  ],
  // Slugs, never hrefs. Every one must resolve or the conformance suite fails.
  related: ['ohms-law-calculator', 'unit-converter-calculator', 'ratio-calculator'],
  lastReviewed: '2026-08-01',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

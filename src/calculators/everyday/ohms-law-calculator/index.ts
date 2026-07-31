import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'ohms-law-calculator',
  category: 'everyday',
  title: "Ohm's Law Calculator",
  // At most 70 characters.
  seoTitle: "Ohm's Law Calculator: Volts, Amps, Ohms & Watts",
  // A meta description: 51-160 characters, written for a search result.
  description:
    'Enter any two of voltage, current, resistance and power and get the other two, with the formulas used shown. Handles short and open circuits properly.',
  // The direct answer, for someone who reads nothing else on the page.
  intro:
    'Ohm’s law says V = I × R, and Joule’s law says P = V × I. Between them, any two of voltage, current, resistance and power fix the other two — that is the whole of the “Ohm’s law wheel”. Pick the pair you know, and this returns all four values along with the two derived formulas it used to get there.',
  fields,
  // The initial, server-rendered label. It matches the default mode, which knows
  // voltage and resistance and therefore solves for current first; the island
  // replaces it with the live primary label whenever the mode changes.
  resultLabel: 'Current',
  compute,
  faqs: [
    {
      q: 'What are the twelve Ohm’s law formulas?',
      a: 'They are the two identities V = I·R and P = V·I rearranged, eliminating one variable at a time: V = I·R, V = P/I, V = √(P·R); I = V/R, I = P/V, I = √(P/R); R = V/I, R = V²/P, R = P/I²; and P = V·I, P = I²·R, P = V²/R. Every one of them is a consequence of the first two, which is why any two known quantities are always enough.',
    },
    {
      q: 'What happens if the resistance is zero?',
      a: 'That is a short circuit, and the honest answer is not a number. With V = I·R and R = 0, no finite current satisfies a non-zero voltage, so the current and the power are unbounded rather than merely large. This calculator says “short circuit” instead of printing infinity. In a real circuit the supply’s own internal resistance, the wiring and the fuse are what end up setting the current.',
    },
    {
      q: 'What does zero current mean?',
      a: 'Zero current with a voltage across the terminals is an open circuit — a break in the wire, an open switch, or a blown fuse. Its resistance is infinite rather than very high, and because no charge moves it dissipates no power at all. The calculator reports it as an open circuit for the same reason it refuses to print infinity for a short.',
    },
    {
      q: 'Can power or current be negative?',
      a: 'Not for a passive component. A resistor, lamp, heater or motor winding dissipates energy, so its power is zero or positive, and a negative entry is rejected against the field it came from rather than quietly producing a nonsense answer. Sign conventions do matter in circuit analysis, but they describe direction of flow, not a component that generates power out of nothing.',
    },
    {
      q: 'Does Ohm’s law work for AC or for LEDs?',
      a: 'Not directly. Ohm’s law describes an ohmic load at a steady DC operating point, where the ratio of volts to amps is a constant. A diode or LED has a strongly curved characteristic, and anything with capacitance or inductance on AC needs impedance rather than resistance, plus a power factor before P = V·I holds. Use this for resistive loads, or for the instantaneous operating point of something that is not.',
    },
    {
      q: 'Which units should I use for small circuits?',
      a: 'Whichever ones you actually have. Each field carries its own unit selector — milliamps, amps or kiloamps; ohms, kilohms or megohms; milliwatts, watts or kilowatts — and switching one converts the value you already typed rather than reinterpreting it. Everything is solved in SI base units internally, so a 5 mA LED through a 470 Ω resistor works as readily as a 40 A alternator feed.',
    },
  ],
  // Slugs, never hrefs. Every one must resolve or the conformance suite fails.
  related: [
    'electricity-cost-calculator',
    'unit-converter-calculator',
    'square-root-calculator',
    'exponent-calculator',
  ],
  lastReviewed: '2026-07-31',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

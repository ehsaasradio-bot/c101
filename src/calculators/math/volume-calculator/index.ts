import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'volume-calculator',
  category: 'math',
  title: 'Volume Calculator',
  seoTitle: 'Volume Calculator: Box, Cylinder, Sphere, Cone, Capsule',
  description:
    'Work out the volume of a box, cylinder, sphere, cone, capsule or pyramid, and read it off in litres, cubic metres, cubic feet and gallons.',
  intro:
    'Every solid has its own volume formula, and the only real work is agreeing which measurement goes where. Pick a solid, enter its diameter or length, its width and its height in whatever unit you measured with, and this converts everything to metres, applies that solid’s formula, and gives the answer in litres, cubic metres, cubic feet and both kinds of gallon.',
  fields,
  resultLabel: 'Volume in litres',
  compute,
  faqs: [
    {
      q: 'How many litres does a cylindrical tank hold?',
      a: 'Halve the diameter to get the radius, square it, multiply by π and by the height for the volume in cubic metres, then multiply by 1000 for litres. A tank 1.2 m across and 1.5 m tall holds π × 0.6² × 1.5 = 1.6965 cubic metres, which is about 1696 litres — near enough the 1700 litre tank it would be sold as.',
    },
    {
      q: 'Do I enter the radius or the diameter?',
      a: 'The diameter, for every round solid here. It is the measurement you can actually take, by laying a tape across the widest point, whereas a radius has to be inferred from a centre you cannot see. The working halves it for you and shows the radius it used on the next line.',
    },
    {
      q: 'What is the formula for the volume of a capsule?',
      a: 'A capsule is a cylinder with a hemisphere on each end, so its volume is πr²h + 4/3·πr³ — the cylinder plus the two half-spheres, which together make exactly one whole sphere. The h in that formula is the straight side only, so the overall length of the capsule is h plus one full diameter.',
    },
    {
      q: 'Why does a cone hold exactly a third of a cylinder?',
      a: 'Both stand on the same circular base, but the cone tapers linearly to a point, so its cross-section area at height x is the base area times (1 − x/h)². Integrating that over the height gives exactly one third of the base area times the height. The same 1/3 appears in the pyramid formula for exactly the same reason.',
    },
    {
      q: 'Why are the US and imperial gallon figures different?',
      a: 'They are unrelated units that share a name. The US liquid gallon is defined as exactly 231 cubic inches, or about 3.785 litres, while the imperial gallon used in the UK is exactly 4.54609 litres. An imperial gallon is roughly a fifth larger, so a tank quoted at 300 US gallons is only about 250 imperial ones.',
    },
    {
      q: 'Does the unit I choose change the answer?',
      a: 'No. Every dimension is converted to metres before any formula runs, so 1.2 m, 120 cm, 3.937 ft and 47.24 in all describe the same tank and all produce the same litres. Switching the unit selector also restates the numbers you have already typed rather than reinterpreting them as a different size.',
    },
  ],
  related: ['circle-calculator', 'unit-converter-calculator', 'right-triangle-calculator'],
  lastReviewed: '2026-07-30',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

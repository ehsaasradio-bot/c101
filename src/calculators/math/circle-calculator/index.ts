import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'circle-calculator',
  category: 'math',
  title: 'Circle Calculator',
  seoTitle: 'Circle Calculator: Radius, Diameter, Area, Circumference',
  description:
    'Enter any one circle measurement — radius, diameter, circumference or area — and get the other three instantly, with every step of the working shown.',
  intro:
    'A circle has only one degree of freedom, so a single measurement fixes all the others. Give this calculator a radius, a diameter, a circumference or an area and it recovers the radius first, then rebuilds every remaining figure from it.',
  fields,
  resultLabel: 'Area',
  faqs: [
    {
      q: 'How do I find the radius from the area of a circle?',
      a: 'Rearrange A = πr² to r = √(A ÷ π). For an area of 50 square metres that is √(50 ÷ 3.14159…) ≈ 3.9894 metres. This calculator does exactly that whenever you select "Area" as the known measurement.',
    },
    {
      q: 'How do I find the radius from the circumference?',
      a: 'Divide the circumference by 2π. A circumference of 62.83 units gives 62.83 ÷ 6.28318… ≈ 10 units of radius. Once the radius is known, the diameter is 2r and the area is πr².',
    },
    {
      q: 'What units does the answer come out in?',
      a: 'The same units you typed in. Radius, diameter and circumference are lengths, so they share your input unit; the area is that unit squared. Enter centimetres and the area is in square centimetres.',
    },
    {
      q: 'Why does doubling the radius quadruple the area?',
      a: 'Area depends on the radius squared, so multiplying the radius by two multiplies the area by two squared, which is four. Circumference depends on the radius only to the first power, so it merely doubles.',
    },
  ],
  related: ['right-triangle-calculator', 'percentage-calculator', 'unit-converter-calculator'],
  compute,
  lastReviewed: '2026-07-27',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

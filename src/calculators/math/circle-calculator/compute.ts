import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, Values } from '../../../lib/types'
import type { fields } from './fields'

const KNOWN = ['radius', 'diameter', 'circumference', 'area'] as const
type Known = (typeof KNOWN)[number]

const isKnown = (s: string): s is Known => (KNOWN as readonly string[]).includes(s)

const num = (label: string, value: number, decimals = 6): Quantity => ({
  label,
  value,
  format: { style: 'decimal', decimals },
})

const LABELS: Record<Known, string> = {
  radius: 'radius',
  diameter: 'diameter',
  circumference: 'circumference',
  area: 'area',
}

export default function compute(v: Values<typeof fields>): CalcResult {
  const { value } = v
  const knownAs = v.knownAs

  if (!isKnown(knownAs))
    throw new CalcError('Choose which measurement you already know.', 'knownAs')
  if (!Number.isFinite(value))
    throw new CalcError('Enter a number for the known measurement.', 'value')
  if (value <= 0)
    throw new CalcError('A circle measurement must be greater than zero.', 'value')

  // Every mode reduces to a radius; the rest follow from it.
  const radius =
    knownAs === 'radius'
      ? value
      : knownAs === 'diameter'
        ? value / 2
        : knownAs === 'circumference'
          ? value / (2 * Math.PI)
          : Math.sqrt(value / Math.PI)

  const diameter = 2 * radius
  const circumference = 2 * Math.PI * radius
  const area = Math.PI * radius * radius

  return {
    primary: { label: 'Area', value: area, format: { style: 'decimal', decimals: 6 } },
    stats: [
      num('Radius', radius),
      num('Diameter', diameter),
      num('Circumference', circumference),
    ],
    steps: [
      num(`Known ${LABELS[knownAs]}`, value),
      { rule: true },
      num('Radius r', radius),
      num('Diameter 2r', diameter),
      num('Circumference 2πr', circumference),
      num('Area πr²', area),
    ],
    notes: [
      'All four outputs share whatever length unit you typed in: a radius in centimetres gives an area in square centimetres.',
      'Area grows with the square of the radius, so doubling the radius quadruples the area while only doubling the circumference.',
    ],
  }
}

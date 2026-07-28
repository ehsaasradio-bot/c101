import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, Values } from '../../../lib/types'
import type { fields } from './fields'

const RAD_TO_DEG = 180 / Math.PI

const len = (label: string, value: number, decimals = 6): Quantity => ({
  label,
  value,
  format: { style: 'decimal', decimals, unit: 'units' },
})

const plain = (label: string, value: number, decimals = 6): Quantity => ({
  label,
  value,
  format: { style: 'decimal', decimals },
})

const deg = (label: string, value: number, decimals = 4): Quantity => ({
  label,
  value,
  format: { style: 'decimal', decimals, unit: '°' },
})

function guardLeg(value: number, id: 'sideA' | 'sideB', name: string): void {
  if (!Number.isFinite(value)) throw new CalcError(`Enter a number for leg ${name}.`, id)
  if (value <= 0) throw new CalcError(`Leg ${name} must be greater than zero.`, id)
}

export default function compute(v: Values<typeof fields>): CalcResult {
  const { sideA, sideB } = v

  guardLeg(sideA, 'sideA', 'a')
  guardLeg(sideB, 'sideB', 'b')

  // Math.hypot avoids the intermediate overflow/underflow of sqrt(a*a + b*b).
  const hypotenuse = Math.hypot(sideA, sideB)
  if (!Number.isFinite(hypotenuse))
    throw new CalcError('These legs are too large to square without overflowing.', 'sideA')

  const area = (sideA * sideB) / 2
  const perimeter = sideA + sideB + hypotenuse

  // Angle A sits opposite leg a, so tan(A) = a / b. The two acute angles sum to 90°.
  const angleA = Math.atan(sideA / sideB) * RAD_TO_DEG
  const angleB = 90 - angleA

  // Standard right-triangle extras, all derived from the three sides.
  const altitude = (sideA * sideB) / hypotenuse
  const inradius = (sideA + sideB - hypotenuse) / 2
  const circumradius = hypotenuse / 2

  return {
    primary: {
      label: 'Hypotenuse c',
      value: hypotenuse,
      format: { style: 'decimal', decimals: 6, unit: 'units' },
    },
    stats: [
      plain('Area', area, 6),
      len('Perimeter', perimeter, 6),
      deg('Angle A (opposite leg a)', angleA, 4),
      deg('Angle B (opposite leg b)', angleB, 4),
      len('Altitude to the hypotenuse', altitude, 6),
      len('Inradius', inradius, 6),
    ],
    steps: [
      len('Leg a', sideA),
      len('Leg b', sideB),
      { rule: true },
      plain('a² + b²', sideA * sideA + sideB * sideB, 6),
      len('c = √(a² + b²)', hypotenuse, 6),
      { rule: true },
      plain('Area = a × b ÷ 2', area, 6),
      len('Perimeter = a + b + c', perimeter, 6),
      deg('A = atan(a ÷ b)', angleA, 4),
      deg('B = 90° − A', angleB, 4),
      len('Circumradius = c ÷ 2', circumradius, 6),
    ],
    notes: [
      'Both legs must meet at the right angle. If you know the hypotenuse and one leg instead, the missing leg is √(c² − a²).',
      'The angles are reported in degrees and always sum to 90°, because the third angle already uses the other 90° of the triangle.',
      'The circumcentre of a right triangle sits at the midpoint of the hypotenuse, which is why the circumradius is exactly half of c.',
    ],
  }
}

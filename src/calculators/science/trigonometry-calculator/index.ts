import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'trigonometry-calculator',
  category: 'science',
  title: 'Trigonometry Calculator',
  // At most 70 characters.
  seoTitle: 'Trigonometry Calculator: Sin, Cos, Tan and Inverses',
  // A meta description: 51-160 characters, written for a search result.
  description:
    'Sine, cosine, tangent and their reciprocals for any angle in degrees, radians or gradians — or work back to the angle with arcsin, arccos and arctan.',
  // The direct answer, for someone who reads nothing else on the page.
  intro:
    'Enter an angle and this returns all six trigonometric ratios — sin, cos, tan, csc, sec and cot — along with the quadrant it lands in, its reference angle, and its coordinates on the unit circle. Switch the mode to go the other way: give a sine, cosine or tangent and get the angle back from arcsin, arccos or arctan. Degrees, radians and gradians are interchangeable throughout, and every answer is shown in all three.',
  fields,
  // The initial, server-rendered label. It matches the default mode, which is
  // given an angle and reports its sine first; the island replaces it with the
  // live primary label whenever the mode changes.
  resultLabel: 'sin θ',
  compute,
  faqs: [
    {
      q: 'What are the six trigonometric functions?',
      a: 'Three primary and three reciprocal. On a unit circle, the point at angle θ from the positive x-axis has coordinates (cos θ, sin θ): sine is the y-coordinate, cosine is the x-coordinate, and tangent is y ÷ x. The other three are their reciprocals — cosecant is 1 ÷ sin θ, secant is 1 ÷ cos θ, and cotangent is cos θ ÷ sin θ. For an acute angle in a right triangle the same three read as opposite ÷ hypotenuse, adjacent ÷ hypotenuse and opposite ÷ adjacent, which is SOH-CAH-TOA.',
    },
    {
      q: 'Why is tan 90° undefined instead of infinite?',
      a: 'At 90° the point on the unit circle is (0, 1), so tangent asks for 1 ÷ 0. That has no value — not a very large one. Approach 90° from below and the tangent grows without limit; approach from above and it falls without limit, so there is no single number the two sides agree on. Many calculators print something like 1.6e16 there, which is not a tangent at all but the rounding error in their own value of π ÷ 2. This one says undefined, and names which coordinate went to zero.',
    },
    {
      q: 'What is a reference angle, and why does it matter?',
      a: 'It is the acute angle between the terminal side and the x-axis, always between 0° and 90°. Every trigonometric ratio of an angle equals the ratio of its reference angle, up to a sign — so sin 150° is sin 30° and cos 210° is −cos 30°. That is what lets a single table of values from 0° to 90° serve the whole circle, and it is why the quadrant is reported alongside: the quadrant supplies the sign, and the reference angle supplies the number.',
    },
    {
      q: 'Should I use degrees or radians?',
      a: 'Degrees for geometry, surveying and navigation; radians for calculus and anything involving rates of change, because the derivative of sin x is cos x only when x is in radians. Gradians survive in some European surveying, where a right angle is a round 100. A full turn is 360°, 2π radians, or 400 gradians, so one degree is π ÷ 180 radians and 10 ÷ 9 gradians. This calculator reports every answer in all three, so a mismatch between your calculator and your textbook is visible rather than silent.',
    },
    {
      q: 'Why does arcsin only give one answer?',
      a: 'Because infinitely many angles share a sine. Inverse functions return the principal value — one angle from an agreed window — or they would not be functions at all. arcsin and arctan answer in −90° to 90°, and arccos in 0° to 180°. To recover the others within one turn: for a sine, the second solution is 180° − θ; for a cosine it is −θ; for a tangent it is θ + 180°. Then add any whole number of turns.',
    },
    {
      q: 'Why does the calculator refuse a sine of 2?',
      a: 'Because no angle has one. Sine and cosine are coordinates of a point on a circle of radius 1, so both stay between −1 and 1 for every real angle — which is why the ratio field narrows to that range in arcsin and arccos mode. Tangent has no such limit, so arctan accepts anything. A sine above 1 does have a meaning for complex angles, but not for the triangles and rotations this calculator is about, so it is refused against the field rather than answered with a NaN.',
    },
  ],
  // Slugs, never hrefs. Every one must resolve or the conformance suite fails.
  related: [
    'right-triangle-calculator',
    'circle-calculator',
    'slope-calculator',
    'distance-calculator',
  ],
  lastReviewed: '2026-08-01',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

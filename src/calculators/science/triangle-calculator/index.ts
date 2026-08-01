import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'triangle-calculator',
  category: 'science',
  title: 'Triangle Calculator',
  // At most 70 characters.
  seoTitle: 'Triangle Calculator: Solve SAS, SSS, ASA, AAS and SSA',
  // A meta description: 51-160 characters, written for a search result.
  description:
    'Solve any triangle from three known parts — SAS, SSS, ASA, AAS or SSA. Returns every side and angle, the area, the perimeter, and both ambiguous answers.',
  // The direct answer, for someone who reads nothing else on the page.
  intro:
    'Any three parts of a triangle fix the other three, as long as one of them is a side. Say which three you know — two sides and the angle between them, all three sides, two angles and a side, or the awkward side-side-angle pairing — and this returns the rest by the law of cosines and the law of sines, with the area, the perimeter and the triangle’s type alongside. No right angle is assumed anywhere: if yours has one, the right triangle calculator gets there from just the two legs.',
  fields,
  // The initial, server-rendered label. It matches the default SAS mode, which
  // knows two sides and the angle between them and so solves for side c first;
  // the island replaces it with the live primary label when the mode changes.
  resultLabel: 'Side c',
  compute,
  faqs: [
    {
      q: 'Which three measurements do I need to solve a triangle?',
      a: 'Any three, provided at least one is a side. Three angles only fix the shape — every triangle similar to yours has the same angles at every size — so there is nothing to compute from them. That leaves five workable cases, and this calculator does all of them: SAS (two sides and the angle between them), SSS (three sides), ASA (two angles and the side between them), AAS (two angles and a side beside one of them) and SSA (two sides and an angle that is not between them).',
    },
    {
      q: 'Why can side-side-angle give two different triangles?',
      a: 'Because sine cannot tell an angle from its supplement: sin 40° and sin 140° are the same number, so solving sin B = b·sin A ÷ a leaves two candidates and both can close into a real triangle. Geometrically, side a swings from vertex B like a compass arm and can meet the far side in two places. That is the ambiguous case, and this calculator reports both answers rather than quietly picking one. The other four cases avoid it entirely by using the law of cosines, whose cosine is negative for an obtuse angle and so identifies it unambiguously.',
    },
    {
      q: 'When should I use the right triangle calculator instead?',
      a: 'When you already know the triangle has a 90° angle. That single fact replaces one of your three measurements, so two legs are enough and the arithmetic collapses to the Pythagorean theorem and an arctangent — no law of cosines needed. Use this page when no angle is known to be 90°, when the known right angle is not between the two sides you measured, or when you have angles rather than a second side.',
    },
    {
      q: 'How is the area worked out without a base and a height?',
      a: 'From two sides and the angle between them: area = ½·a·b·sin C. Dropping a perpendicular from the third vertex makes the height b·sin C, so this is the familiar ½·base·height with the height derived rather than measured. It is used here in preference to Heron’s formula, which is algebraically equivalent but loses accuracy on long, thin triangles because the s − a, s − b and s − c terms nearly cancel.',
    },
    {
      q: 'Why does it say no such triangle exists?',
      a: 'Three reasons, and the message names which one. In SSS, one side is at least as long as the other two combined — they cannot reach across it, so the three points fall on a line. With two known angles, they already add to 180° or more, leaving nothing for the third. In SSA, side a is shorter than the altitude b·sin A, so it never reaches the far side no matter how it swings. Each of these is a genuine impossibility, not a rounding problem.',
    },
    {
      q: 'What units should the sides be in?',
      a: 'Whatever you like, as long as all three use the same one. Nothing here depends on the choice: the sides and the perimeter come back in that unit, the area in that unit squared, and the angles in degrees regardless. Angles are entered and reported in degrees, not radians, and step in ten-thousandths of a degree — about a third of an arcsecond — which is fine enough for surveying and setting-out work.',
    },
  ],
  // Slugs, never hrefs. Every one must resolve or the conformance suite fails.
  related: [
    'right-triangle-calculator',
    'area-calculator',
    'circle-calculator',
    'slope-calculator',
  ],
  lastReviewed: '2026-08-01',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

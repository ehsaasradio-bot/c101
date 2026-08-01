import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'section-properties-calculator',
  category: 'engineering',
  title: 'Section Properties Calculator',
  seoTitle: 'Section Properties Calculator: Area, I, S, Z and Radius of Gyration',
  description:
    'Area, second moment of area, section moduli and radius of gyration for a rectangle, box, circle or tube — with every formula shown beside its result.',
  intro:
    'Pick a rectangle, box, circle or tube, enter its dimensions, and this returns the full set of geometric properties a beam calculation needs — area, centroid, second moments about both axes and about the outer edges, polar moments, radii of gyration, and both the elastic and plastic section moduli. Every value is shown beside the formula that produced it, so the working can be checked rather than trusted. These are geometry, not code provisions: the same numbers appear in NDS, AISC, Eurocode or a nineteenth-century textbook.',
  fields,
  resultLabel: 'Second moment of area, Ix',
  compute,
  faqs: [
    {
      q: 'What is the second moment of area, and why does it matter more than area?',
      a: 'It measures how the material is spread about the bending axis, and it is what governs both stiffness and bending stress. Because it depends on the cube of the depth, moving material away from the centroid pays enormously: doubling the depth of a rectangle multiplies Ix by eight while only doubling the area. That is the entire reason beams are deep rather than wide, and why a hollow section keeps most of its stiffness after most of its material has gone.',
    },
    {
      q: 'What is the difference between the elastic and plastic section modulus?',
      a: 'The elastic modulus S is Ix divided by the distance to the extreme fibre, and it tells you the moment at which the outermost material first reaches yield. The plastic modulus Z is the first moment of both halves of the area about the centroid, and it tells you the moment at which the whole section has yielded. Z is always the larger, and their ratio is the shape factor — exactly 1.5 for a solid rectangle, and lower for a hollow one because the material that yielding would have recruited is the material you removed.',
    },
    {
      q: 'Why are there two sets of second moments, with and without the subscript?',
      a: 'The unsubscripted values are about axes through the centroid, which is what a design check almost always wants. The subscripted ones are about axes along the outer edges, obtained by the parallel-axis theorem: Ix₁ = Ix + A·cy². Those are useful when this section is one part of a larger built-up shape, because you can shift each part to a common axis and add them.',
    },
    {
      q: 'Does this assume the hole is in the middle?',
      a: 'Yes. The inner rectangle is taken as concentric with the outer one, which is what makes the arithmetic a simple subtraction — the two shapes share a centroid, so their second moments subtract directly. An off-centre hole needs the parallel-axis theorem applied to the hole as well, and would give a centroid that is no longer at half the height.',
    },
    {
      q: 'Are these values code-compliant?',
      a: 'They are geometry, so they are the same in every code — the area and second moment of a rectangle do not change between NDS, AISC, AISI and Eurocode. What differs between codes is what you then do with them: the material strengths, the adjustment factors, the resistance or safety factors, and the slenderness limits. This page gives you the section properties; the code check that follows is a separate step.',
    },
  ],
  related: ['area-calculator', 'right-triangle-calculator', 'circle-calculator', 'volume-calculator'],
  lastReviewed: '2026-08-01',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

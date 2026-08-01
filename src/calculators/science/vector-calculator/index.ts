import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'vector-calculator',
  category: 'science',
  title: 'Vector Calculator',
  // At most 70 characters.
  seoTitle: 'Vector Calculator: Dot Product, Cross Product and Angle',
  // A meta description: 51-160 characters, written for a search result.
  description:
    'Dot and cross product, angle between two vectors, magnitude, unit vector, projection, addition and subtraction, in 2D or 3D, with the working shown.',
  // The direct answer, for someone who reads nothing else on the page.
  intro:
    'Enter two vectors and pick what you want done with them. The dot product a · b = aₓbₓ + a_yb_y + a_zb_z is a single number whose sign tells you whether they lean the same way, and whose zero says they are perpendicular. The cross product a × b is a vector perpendicular to both, whose length is the area of the parallelogram they span — in 2D it collapses to one signed number. From those two everything else follows: the angle between them, the magnitude and unit vector, the projection of one onto the other, and the sum and difference. This page is about how two vectors relate to each other; if you want how far apart two POINTS are in 3D, that is the distance calculator, and for two points on a plane with the slope, line equation and midpoint, use the slope calculator. Dot, cross, angle and projection are on neither of them.',
  fields,
  // The initial, server-rendered label. It matches the default operation, the
  // dot product; the island replaces it with the live primary label as soon as
  // the operation changes.
  resultLabel: 'Dot product a · b',
  compute,
  faqs: [
    {
      q: 'What is the difference between the dot product and the cross product?',
      a: 'The dot product returns a number and the cross product returns a vector, and they answer opposite questions. a · b = |a| |b| cos θ measures how much the two vectors agree in direction: it is largest when they are parallel and exactly zero when they are perpendicular. a × b has length |a| |b| sin θ, so it measures how much they disagree: zero when parallel, largest when perpendicular. The dot product exists in any number of dimensions; the cross product, as a vector, only exists in three.',
    },
    {
      q: 'What does the cross product mean in 2D?',
      a: 'It is a single signed number, not a vector. Two vectors lying in a plane span that plane, so a vector perpendicular to both must point straight out of it — only the z component can be non-zero, and it works out to aₓb_y − a_ybₓ. That number is the signed area of the parallelogram the two vectors span: positive when b lies counter-clockwise from a, negative when clockwise, and zero when they are parallel. It is the standard orientation test in computational geometry, used for deciding which side of a line a point falls on.',
    },
    {
      q: 'How do I find the angle between two vectors?',
      a: 'Divide the dot product by the product of the magnitudes and take the arc cosine: θ = acos((a · b) ÷ (|a| |b|)). With a = (3, 4, 0) and b = (1, 2, 2) that is acos(11 ÷ 15) = 42.83°. This calculator actually uses θ = atan2(|a × b|, a · b), which is the same angle computed in a numerically better-behaved way — acos loses precision badly for nearly parallel vectors and can return NaN when rounding pushes its argument past 1. The result is always between 0° and 180°, because vectors carry no sense of which way round you sweep.',
    },
    {
      q: 'Why can a zero vector have no angle or projection?',
      a: 'Because a vector of zero length points nowhere. The angle formula divides by |a| |b|, and the projection divides by |b|, so a zero magnitude makes the arithmetic undefined rather than merely awkward — and no convention rescues it, since every direction is equally consistent with a vector that has no direction. The calculator refuses these cases against the offending vector instead of returning a NaN. A zero magnitude is still a perfectly good answer to "how long is this vector", which is why the magnitude mode accepts it and only declines to hand back a unit vector.',
    },
    {
      q: 'What is a projection, and does the order matter?',
      a: 'The projection of a onto b is the shadow a casts along the direction of b. The scalar projection (a · b) ÷ |b| is how long that shadow is, signed so a negative value means a leans away from b. The vector projection ((a · b) ÷ |b|²)·b writes the same shadow back as a vector, and what is left over is the rejection, the part of a perpendicular to b. Order matters: projecting a onto b and b onto a share the numerator a · b but divide by different lengths. The length of b does not matter at all, only its direction, because b appears once on top and twice underneath.',
    },
    {
      q: 'Is the magnitude of a + b the same as |a| + |b|?',
      a: 'Only when a and b point in exactly the same direction. Otherwise |a + b| is strictly smaller, which is the triangle inequality: the direct route is never longer than going via a corner. With a = (3, 4, 0) and b = (1, 2, 2), |a| + |b| = 8 while |a + b| = √56 ≈ 7.483. The gap widens as the angle between the vectors grows, and at 180° the sum can be as small as the difference of the two magnitudes.',
    },
    {
      q: 'Can I use this to find the distance between two points?',
      a: 'Yes, indirectly. Treat the two points as position vectors, subtract, and the magnitude of a − b is the straight-line distance between them — the displacement between two points is the difference of their position vectors, so the arithmetic is identical. The distance calculator is the more direct route if that is all you want, since it also gives the Manhattan metric and great-circle distance from latitude and longitude. What it does not do is the dot product, the cross product, the angle between two directions, or a projection, which is what this page is for.',
    },
  ],
  // Slugs, never hrefs. Every one must resolve or the conformance suite fails.
  related: ['distance-calculator', 'slope-calculator', 'right-triangle-calculator', 'area-calculator'],
  lastReviewed: '2026-08-01',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

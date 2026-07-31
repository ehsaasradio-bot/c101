import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'distance-calculator',
  category: 'math',
  title: 'Distance Calculator',
  seoTitle: 'Distance Calculator: Lat/Long, 3D and Manhattan Distance',
  description:
    'Distance between two latitude and longitude points by the haversine formula, in km and miles, plus 3D straight-line and Manhattan taxicab distance.',
  intro:
    'Three different questions get called "distance", so pick the one you mean. The great-circle mode measures across the curved surface of the Earth between two latitude/longitude points — the "how far is New York from London" question — using the haversine formula and a mean Earth radius of 6371.0088 km, reported in kilometres, miles and nautical miles with the initial bearing. The 3D mode is the ordinary straight line √(Δx² + Δy² + Δz²) between two Cartesian points, which collapses to the familiar 2D distance when both z values match. The Manhattan mode is the taxicab metric |Δx| + |Δy| + |Δz|, the shortest path when you may only travel along the axes. If what you actually want is the geometry of the line through two points — slope, y-intercept, the equation — the slope calculator is the page for that, and it reports the 2D distance too.',
  fields,
  resultLabel: 'Distance',
  compute,
  faqs: [
    {
      q: 'How do I calculate the distance between two cities from latitude and longitude?',
      a: 'Use the haversine formula: a = sin²(Δφ/2) + cos φ₁ · cos φ₂ · sin²(Δλ/2), then c = 2 · atan2(√a, √(1−a)), then multiply c by the Earth\'s radius. With the IUGG mean radius of 6371.0088 km, New York (40.7128, −74.0060) to London (51.5074, −0.1278) comes out at 5,570 km, or 3,461 miles — the figure published city-pair tables quote. That is the surface distance between the two points; a flight is longer, because it follows air corridors and rarely flies the perfect great circle.',
    },
    {
      q: 'How accurate is the haversine formula?',
      a: 'It is exact for a sphere and the Earth is not one — it is about 21 km wider through the equator than through the poles. Measured against a true geodesic on the WGS 84 ellipsoid, which is what GPS uses, a haversine distance is typically within about 0.3% and worst-case around 0.5%. On the 5,570 km New York to London that is a band of roughly ±20 km. So trust three or four significant figures and no more. If you need metre-level answers, you want Vincenty\'s or Karney\'s ellipsoidal method, not this.',
    },
    {
      q: 'Does it handle the international date line correctly?',
      a: 'Yes. Longitude 179° and longitude −179° are two degrees apart, not 358, and the calculator folds the longitude difference into the range (−180, 180] before using it, so a hop across the antimeridian near Fiji reports a short distance rather than a near-global one. Two points on the equator at 179° and −179° come out at 222.39 km, which is exactly two degrees of arc. Getting this wrong is the classic great-circle bug.',
    },
    {
      q: 'What is the difference between Manhattan distance and straight-line distance?',
      a: 'They are different metrics, not different accuracies. The straight line is √(Δx² + Δy² + Δz²), the shortest path if you may travel in any direction. The Manhattan or taxicab distance is |Δx| + |Δy| + |Δz|, the shortest path if you may only move parallel to the axes — a car on a perfect street grid. Manhattan is never shorter: from (0,0,0) to (1,2,2) the straight line is exactly 3 and the taxicab route is 5. The two are equal only when the points differ along a single axis.',
    },
    {
      q: 'Where is the plain 2D distance between two points?',
      a: 'It falls out of the 3D mode: leave both z coordinates the same and Δz is zero, so √(Δx² + Δy² + Δz²) reduces to √(Δx² + Δy²). There is no separate mode because there is no separate formula. The slope calculator also reports the 2D distance alongside the slope, the y-intercept, the line equation, the midpoint and the angle of inclination, so use that one if you want the whole line rather than just the gap.',
    },
    {
      q: 'What is the initial bearing, and why does it change along the way?',
      a: 'It is the compass heading you set off on, measured clockwise from true north, computed as atan2(sin Δλ · cos φ₂, cos φ₁ · sin φ₂ − sin φ₁ · cos φ₂ · cos Δλ). A great circle is not a constant-heading path, so the heading rotates continuously as you travel: New York to London starts at about 51° and arrives on about 108°. A route flown at a fixed heading instead is a rhumb line, which is longer.',
    },
    {
      q: 'Why does the calculator show a straight chord through the Earth?',
      a: 'Because the great-circle distance is measured over the surface, and it is worth seeing how much of it is the curvature. The chord is the straight line an imaginary tunnel would take, 2R · sin(c/2). New York to London is 5,570 km across the surface but only 5,395 km through the rock — about 175 km shorter. At antipodal points the surface distance is half the circumference, 20,015 km, while the chord is one diameter, 12,742 km.',
    },
  ],
  related: ['slope-calculator', 'right-triangle-calculator', 'circle-calculator'],
  lastReviewed: '2026-07-31',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

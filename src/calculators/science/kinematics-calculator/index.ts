import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'kinematics-calculator',
  category: 'science',
  title: 'Kinematics Calculator',
  // At most 70 characters.
  seoTitle: 'Kinematics Calculator: The Four SUVAT Equations of Motion',
  // A meta description: 51-160 characters, written for a search result.
  description:
    'Solve for displacement, final velocity, acceleration or time with the SUVAT equations, with every step shown and the motion plotted against time.',
  // The direct answer, for someone who reads nothing else on the page.
  intro:
    'Motion in a straight line at a constant acceleration is completely described by five quantities — initial velocity u, final velocity v, acceleration a, time t and displacement s — and any three of them fix the other two. That is what the four SUVAT equations say: v = u + a·t, s = u·t + ½·a·t², s = ((u + v) ÷ 2)·t, and the timeless v² = u² + 2·a·s. Pick the quantity you want, enter the three you know, and this returns it along with the other four, the arithmetic that produced it, and the position and velocity plotted over the whole interval. Solving for time is the interesting case: it is a quadratic, so there are usually two answers, and the calculator reports the first arrival while telling you what the second root means.',
  fields,
  // The initial, server-rendered label. It matches the default mode, which
  // solves for displacement; the island replaces it with the live primary label
  // as soon as the mode changes.
  resultLabel: 'Displacement',
  compute,
  faqs: [
    {
      q: 'What are the four SUVAT equations?',
      a: 'They are v = u + a·t; s = u·t + ½·a·t²; s = ((u + v) ÷ 2)·t; and v² = u² + 2·a·s. Here u is the velocity at the start, v the velocity at the end, a the constant acceleration, t the elapsed time and s the displacement. Each equation deliberately omits one of the five quantities — the third has no acceleration in it and the fourth has no time — which is what lets you pick the one that uses only the numbers you actually have.',
    },
    {
      q: 'Why does solving for time give two answers?',
      a: 'Because s = u·t + ½·a·t² is a quadratic in t, and a quadratic has two roots. When both are positive the object genuinely passes that displacement twice: a ball thrown upward is 10 m above your hand on the way up and again on the way down. When the second root is negative it describes where the object would have been before the clock started had it been moving this way all along, which is not part of the journey you asked about. This calculator reports the smallest root that is not negative and tells you what the other one is.',
    },
    {
      q: 'What happens if the acceleration is zero?',
      a: 'The quadratic collapses. With a = 0 the velocity never changes, the ½·a·t² term vanishes, and s = u·t solves in a single division. The calculator branches to that case explicitly rather than dividing by zero or letting a limit take care of it, so setting the acceleration slider to 0 gives the plain constant-speed answer with the working to match.',
    },
    {
      q: 'What does "never reached" mean?',
      a: 'It means no time at all satisfies the equation. Under a deceleration an object stops after −u ÷ a seconds, having covered −u² ÷ (2a) metres, and then comes back the way it went; ask for a displacement beyond that turning point and there is no answer to give. Rather than refuse, the calculator reports the furthest it actually gets and when. Algebraically this is the case where the discriminant u² + 2·a·s is negative, so the quadratic has no real root.',
    },
    {
      q: 'How do I use this for free fall or a projectile?',
      a: 'Set the acceleration to the acceleration due to gravity, 9.81 m/s² at the Earth\'s surface, and be consistent about which direction you are calling positive. Dropping something from rest with "down" positive means u = 0 and a = 9.81. Throwing it upward with "up" positive means a = −9.81, and the time it takes to come back to your hand is the larger root of the quadratic. This page handles the vertical component of a projectile; the horizontal component is separate motion at a constant velocity, because gravity does not act sideways.',
    },
    {
      q: 'Is displacement the same as distance travelled?',
      a: 'No, and the difference matters here. Displacement is the straight-line change in position from start to finish, and it carries a sign. Distance travelled is how far the object actually went, which is never negative and never less than the size of the displacement. An object that goes out 10 m and comes back has travelled 20 m and been displaced 0 m. Everything on this page is displacement.',
    },
    {
      q: 'Does this work if the acceleration changes?',
      a: 'No. Constant acceleration is the assumption the whole method rests on, and it is what makes the average velocity equal to (u + v) ÷ 2. It holds well for free fall in a vacuum, a car braking at a steady rate, or a trolley rolling down a ramp. It fails for anything with air resistance, a changing thrust, a spring, or a curved path — those need calculus with the acceleration written as a function of time or position.',
    },
  ],
  // Slugs, never hrefs. Every one must resolve or the conformance suite fails.
  related: ['running-pace-calculator', 'distance-calculator', 'slope-calculator'],
  lastReviewed: '2026-08-01',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

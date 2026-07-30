import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'paint-calculator',
  category: 'everyday',
  title: 'Paint Calculator',
  seoTitle: 'Paint Calculator: How Much Paint for a Room',
  description:
    'Work out how much paint a room needs from its size, coats and coverage. Deducts doors and windows, rounds tins up, and totals what you will pay.',
  intro:
    'Paint is worked out from wall area, not floor area: measure the perimeter, multiply by the ceiling height, take off the doors and windows, multiply by the number of coats, and divide by the coverage printed on the tin. This does that, then rounds up to whole tins — because you cannot buy 0.7 of a tin, and the rounding is usually where an estimate goes wrong.',
  fields,
  resultLabel: 'Paint needed',
  compute,
  scale: {
    min: 0,
    max: 100,
    unit: '%',
    // How much of the paint you have to buy ends up unused. It is entirely a
    // consequence of tin sizes: the same wall wastes very little in 1 L tins
    // and half a tin in 5 L ones. Worth seeing, because the fix is to change
    // the tin size, not the room.
    bands: [
      { id: 'excellent', label: 'Barely any left over — under 10%', from: 0, to: 10 },
      { id: 'good', label: 'A useful touch-up amount — 10% to 25%', from: 10, to: 25 },
      { id: 'neutral', label: 'A noticeable surplus — 25% to 40%', from: 25, to: 40 },
      { id: 'warn', label: 'Nearly half wasted — 40% to 60%', from: 40, to: 60 },
      { id: 'critical', label: 'Most of the paint unused — 60% or more', from: 60, to: 100 },
    ],
  },
  faqs: [
    {
      q: 'Why round up to whole tins?',
      a: 'Because shops sell tins, not litres. If the maths says 3.08 tins you buy 4, and you pay for all four — the 0.92 of a tin you did not need is real money on the receipt. Rounding to the nearest tin instead would leave a job 0.4 of a tin short, which means a second trip, and a second batch that may not match the first.',
    },
    {
      q: 'Should I deduct doors and windows?',
      a: 'Yes, once there is more than one or two. The standard allowances are 20 square feet (1.86 m²) per door and 15 square feet (1.39 m²) per window, which is what this uses. A room with one door and two windows loses about 4.6 m² — roughly a tenth of a typical wall area, so it is the difference between three tins and four.',
    },
    {
      q: 'How many coats do I actually need?',
      a: 'Two coats over a similar colour on a previously painted, sound wall. Three when you are going light over dark, covering a strong colour such as red or navy, or painting bare plaster and new plasterboard — and on bare surfaces the first coat should really be a primer or a mist coat, which has its own coverage figure.',
    },
    {
      q: 'What coverage figure should I enter?',
      a: 'The one on the tin, but treat it as the best case. Manufacturers measure on smooth, sealed, primed wall. Typical emulsion is quoted at 10-13 m² per litre (400-500 sq ft per US gallon); textured, porous or freshly filled surfaces can drop that by a third, and a roller with a deep pile lays paint on more thickly than the test does.',
    },
    {
      q: 'Does this include the ceiling?',
      a: 'No — it covers the four walls only. Ceilings are usually a different product, and their area is simply the room length times the width, which you can put through this calculator on its own by entering the ceiling as a separate job. Skirting, architrave and doors are trim paint, sold and covered differently again.',
    },
    {
      q: 'Is it cheaper to buy one big tin or several small ones?',
      a: 'Usually the big tin, per litre — but not always once rounding is counted. A job needing 7.7 litres takes four 2.5 L tins (10 L) or two 5 L tins (10 L), the same volume; a job needing 5.2 litres takes three 2.5 L tins (7.5 L) but two 5 L tins (10 L). The leftover percentage shown here is the number to compare.',
    },
  ],
  related: ['unit-converter-calculator', 'electricity-cost-calculator', 'discount-calculator'],
  lastReviewed: '2026-07-30',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

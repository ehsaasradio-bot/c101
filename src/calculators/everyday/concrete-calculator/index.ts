import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: 'concrete-calculator',
  category: 'everyday',
  title: 'Concrete Calculator',
  // At most 70 characters.
  seoTitle: 'Concrete Calculator: Cubic Yards and Bags of Pre-Mix',
  // A meta description: 51-160 characters, written for a search result.
  description:
    'Work out concrete for a slab, footing, column or post holes in cubic yards and cubic metres, then how many 40, 60 or 80 lb bags to buy.',
  // The direct answer, for someone who reads nothing else on the page.
  intro:
    'Concrete is worked out as a volume and bought as a count of bags. Measure the pour, multiply the dimensions together to get cubic feet or cubic metres, add a waste allowance for spillage and an over-dug hole, then divide by what one bag yields — and round that up, because a part-used bag is still a whole bag on the receipt. This does all of it, and shows the rounding rather than hiding it.',
  fields,
  resultLabel: 'Concrete needed',
  compute,
  faqs: [
    {
      q: 'How many bags of concrete are in a cubic yard?',
      a: 'Forty-five 80 lb bags, sixty 60 lb bags, or ninety 40 lb bags. That follows straight from QUIKRETE’s published yields: an 80 lb bag makes about 0.60 cubic feet and a cubic yard is 27 cubic feet, so 27 divided by 0.60 is 45. In cubic metres, a 20 kg Blue Circle bag makes about 0.01 m³, so a cubic metre takes roughly 100 of them.',
    },
    {
      q: 'Why are the bag counts rounded up?',
      a: 'Because you cannot buy most of a bag, and because running short mid-pour is much worse than having one spare. Concrete placed against concrete that has already begun to stiffen forms a cold joint — a plane of weakness right through the finished slab or footing, which tends to become the crack. A calculation saying 61.1 bags means 62 bags, and the leftover 0.9 of a bag is the price of not stopping halfway.',
    },
    {
      q: 'How thick should a concrete slab be?',
      a: 'Four inches (100 mm) is the standard for a patio, path or shed base carrying foot traffic and garden furniture. Go to five or six inches (125–150 mm) where a car, a trailer or a heavy workshop machine will stand, and thicken the edges of a driveway further. Thickness matters more than most people expect: taking a 10 by 10 ft slab from 4 in to 6 in adds half again to the concrete and half again to the bag count.',
    },
    {
      q: 'What waste allowance should I add?',
      a: 'Ten per cent for anything poured into forms you built yourself, such as a slab or a column tube, where the shape is what you made it. Fifteen per cent for anything dug — footings and post holes — because a trench is always a little wider and a little deeper in places than the drawing, and the extra concrete goes in without asking. On a small pour the allowance is often less than one bag, which the rounding then absorbs anyway.',
    },
    {
      q: 'When should I stop using bags and order ready-mix?',
      a: 'Around one cubic yard, or about three quarters of a cubic metre. That is roughly sixty 80 lb bags: half a tonne to lift, and a mix that has to be kept going continuously so no part of it stiffens before the next batch arrives. Beyond that a ready-mix truck is usually cheaper per yard, more consistent in strength, and finishes in one pour instead of an afternoon of mixing.',
    },
    {
      q: 'Does the post itself count when filling a post hole?',
      a: 'It displaces concrete, so the real requirement is a little less than the figure here, which is the volume of the empty hole. A 4 by 4 post in a 10 in hole takes up about a seventh of it. Being generous is the right way to be wrong on a post hole, since the hole is usually a bit over-dug and any surplus simply crowns the top so rain runs off the post rather than into it.',
    },
  ],
  // Slugs, never hrefs. Every one must resolve or the conformance suite fails.
  related: ['volume-calculator', 'area-calculator', 'paint-calculator'],
  lastReviewed: '2026-07-31',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def

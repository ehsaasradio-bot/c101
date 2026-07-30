import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * `principal` is deliberately first: the end-to-end suite nudges the first
 * number field to 1.1x its default and expects a different, still-valid result,
 * and simple interest is linear in the principal, so it always moves. $11,000
 * also stays on the step grid described below.
 *
 * Two things drove the numbers here, and neither is visible to a unit test.
 *
 * The slider spans roughly 4x the DEFAULT, not the declared max (`softRange` in
 * theme/studio/range.ts), so the useful range has to sit near the default:
 * $10,000 drags to $50,000, six percent to the full forty, and a five-year term
 * to twenty. The number box still accepts everything up to `max`.
 *
 * And every default must land on `min + n × step`, because that is the grid the
 * range input snaps to. A default off the grid opens the page with the thumb
 * beside the number rather than on it — $10,000 with `min: 100, step: 500` would
 * snap to $10,100.
 */
export const fields = [
  {
    kind: 'number',
    id: 'principal',
    label: 'Principal',
    default: 10_000,
    // A slider spans these, so both ends must be values compute accepts.
    min: 100,
    max: 10_000_000,
    step: 100,
    unit: '$',
    help: 'The amount borrowed or deposited. Simple interest is charged on this figure alone, never on interest already earned.',
  },
  {
    kind: 'number',
    id: 'annualRate',
    label: 'Annual interest rate',
    default: 6,
    min: 0,
    max: 40,
    step: 0.25,
    unit: '%',
    help: 'The quoted yearly rate, r in the formula.',
  },
  {
    kind: 'number',
    id: 'years',
    label: 'Term',
    default: 5,
    // Short-dated paper is the natural home of simple interest — bills, bridging
    // loans, promissory notes — so the floor is about eighteen days rather than a
    // whole year, and the step is fine enough to reach a month or a quarter.
    min: 0.05,
    max: 40,
    step: 0.05,
    unit: 'yr',
    help: 'Fractions are fine: 0.5 is six months, 0.25 is a quarter, 0.1 is about five weeks.',
  },
  {
    kind: 'select',
    id: 'compoundsPerYear',
    label: 'Compare against compounding',
    default: '12',
    options: [
      { value: '1', label: 'Annually' },
      { value: '2', label: 'Semi-annually' },
      { value: '4', label: 'Quarterly' },
      { value: '12', label: 'Monthly' },
      { value: '365', label: 'Daily' },
    ],
    help: 'The same principal, rate and term compounded this often, shown alongside for contrast.',
  },
] as const satisfies readonly Field[]

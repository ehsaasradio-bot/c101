import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * `sampleMean` is deliberately first. The end-to-end suite nudges the first
 * number field to 1.1x its default, and the headline here is the interval
 * itself, so 100 -> 110 slides it from "94.40 to 105.60" to "104.40 to 115.60":
 * a valid answer, and a visibly different one. A headline of "margin of error"
 * would not have moved at all, because the margin does not depend on the mean.
 *
 * The `distribution` select is what the whole page turns on. It is last because
 * it changes the *meaning* of the standard deviation field rather than its
 * value, and that field's help text names both cases.
 */
export const fields = [
  {
    kind: 'number',
    id: 'sampleMean',
    label: 'Sample mean (x̄)',
    default: 100,
    // A mean can legitimately be negative — a temperature anomaly, a change
    // score, a profit-and-loss figure — so the range is symmetric about zero.
    // Every default has to sit on min + n × step, which needs checking rather
    // than assuming once the minimum is negative: (100 − −10000) ÷ 0.5 = 20200.
    min: -10_000,
    max: 10_000,
    step: 0.5,
    help: 'The average of the sample you actually measured.',
  },
  {
    kind: 'number',
    id: 'standardDeviation',
    label: 'Standard deviation',
    default: 15,
    // Compute divides by this and refuses zero, so the slider's left end has to
    // be a usable positive value rather than zero itself. (15 − 0.01) ÷ 0.01 is
    // 1498.9999999999998 in floating point — on the step grid to within 1e-13.
    min: 0.01,
    max: 5000,
    step: 0.01,
    help: 'The sample standard deviation s, or the known population σ — whichever the selector below says you have.',
  },
  {
    kind: 'number',
    id: 'sampleSize',
    label: 'Sample size (n)',
    default: 30,
    // n = 1 leaves n − 1 = 0 degrees of freedom and a standard deviation with
    // nothing to measure, so there is no interval at all. The slider therefore
    // starts at 2, and compute rejects anything smaller against this field.
    min: 2,
    max: 100_000,
    step: 1,
    help: 'How many observations the mean was computed from. At least 2.',
  },
  {
    kind: 'select',
    id: 'confidenceLevel',
    label: 'Confidence level',
    default: '95',
    // Stopping at 99% is deliberate. The critical values come from inverting an
    // approximation of the normal CDF whose error, divided by the density,
    // grows as the tail thins; at 99% the z critical value is still correct to
    // every digit this page prints, and at 99.9% it would not be. See the note
    // on `zCritical` in compute.ts.
    options: [
      { value: '80', label: '80%' },
      { value: '90', label: '90%' },
      { value: '95', label: '95% (conventional)' },
      { value: '98', label: '98%' },
      { value: '99', label: '99%' },
    ],
    help: 'A higher level always widens the interval — there is no free precision.',
  },
  {
    kind: 'select',
    id: 'distribution',
    label: 'Where the standard deviation came from',
    default: 'sample',
    options: [
      { value: 'sample', label: 'Estimated from this sample → use t' },
      { value: 'population', label: 'Known population σ → use z' },
    ],
    help: 'Estimating the spread from the same small sample costs precision, and Student’s t is what pays for it. Choose known σ only when the spread comes from outside this sample.',
  },
] as const satisfies readonly Field[]

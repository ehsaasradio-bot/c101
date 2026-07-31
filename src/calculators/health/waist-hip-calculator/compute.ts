import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, Values } from '../../../lib/types'
import type { fields } from './fields'

const CM_PER_IN = 2.54

/*
 * WAIST-TO-HIP RATIO — WHO CUT-OFFS
 *
 * Source: "Waist Circumference and Waist-Hip Ratio: Report of a WHO Expert
 * Consultation, Geneva, 8-11 December 2008" (World Health Organization, 2011).
 * Its table of cut-off points for abdominal obesity gives ONE waist-hip
 * threshold per sex, both marked "substantially increased" risk of metabolic
 * complications:
 *
 *     men    WHR >= 0.90
 *     women  WHR >= 0.85
 *
 * The same table also carries the waist-circumference cut-offs that usually
 * travel with them — >94 cm (men) / >80 cm (women) for increased risk, and
 * >102 cm / >88 cm for substantially increased risk — which is why the notes
 * below mention that the absolute waist matters as well as the proportion.
 *
 * These are population risk ASSOCIATIONS, not a diagnosis, and the report says
 * so: the cut-offs were chosen from cohort data on groups, and it explicitly
 * flags that optimal values differ between ethnic groups.
 *
 * Nothing else is invented here. The report states no "low risk" or "moderate
 * risk" waist-hip band, so this calculator does not pretend one exists — the
 * bands below are distances from the WHO line itself, and are labelled as such.
 */
const WHO_WHR_CUTOFF = { male: 0.9, female: 0.85 } as const

/*
 * WAIST-TO-HEIGHT RATIO
 *
 * The rule of thumb is to keep your waist under half your height, i.e. below
 * 0.5, and it holds across sexes and across most adult heights without needing
 * a table. NICE puts numbers on it (guideline NG246, 2025, carrying forward the
 * 2022 addition to CG189):
 *
 *     0.4 to 0.49  healthy central adiposity
 *     0.5 to 0.59  increased central adiposity
 *     0.6 or more  high central adiposity
 *
 * It is a better single predictor of cardiometabolic risk than BMI in most
 * published comparisons, and needs one tape measurement plus a height.
 */
const WHTR_HEALTHY = 0.5
const WHTR_HIGH = 0.6
const WHTR_LEAN = 0.4

/*
 * MAPPING A SEX-DEPENDENT THRESHOLD ONTO A FIXED AXIS
 *
 * A `Scale` is fixed at build time; the WHO cut-off is not — 0.87 is under the
 * line for a man and over it for a woman. Declaring one set of raw-ratio bands
 * would therefore be wrong for one sex whichever numbers were chosen.
 *
 * So the meter reads a NORMALISED value, exactly as `health/vo2max-calculator`
 * does with its age-and-sex fitness norms: the ratio is divided by the cut-off
 * that applies to this person and expressed as a percentage of it. 100 always
 * means "exactly on the WHO line", for either sex, and the fixed bands in
 * `index.ts` are distances from that line rather than raw ratios.
 *
 * The normalisation here is a single division rather than vo2max's piecewise
 * interpolation, because there is only one published cut-point to anchor.
 *
 * These edges must stay identical to the bands declared in `index.ts`.
 */
const BAND_EDGES = [0, 90, 100, 110] as const

/** The NICE waist-to-height band this ratio falls in, in words. */
function whtrBand(whtr: number): string {
  if (whtr < WHTR_LEAN) return 'Under 0.4 — below the healthy band'
  if (whtr < WHTR_HEALTHY) return 'Healthy — waist under half your height'
  if (whtr < WHTR_HIGH) return 'Increased — waist over half your height'
  return 'High — waist at least 0.6 of your height'
}

export default function compute(v: Values<typeof fields>): CalcResult {
  const { waist, hip, height } = v
  // Selects arrive as strings; the derived Values type makes that explicit.
  const imperial = v.units === 'imperial'
  const female = v.sex === 'female'

  // Finiteness first, always. `coerceValues` deliberately produces NaN for
  // unparseable input, and a magnitude test like `hip <= 0` is FALSE for NaN, so
  // a bare comparison would let it straight through into the division.
  if (!Number.isFinite(waist) || !(waist > 0))
    throw new CalcError('Enter a waist measurement greater than 0.', 'waist')
  // A hip of zero is a division by zero, and it is the HIP field that has to
  // move, so that is the field the form must highlight.
  if (!Number.isFinite(hip) || !(hip > 0))
    throw new CalcError('Enter a hip measurement greater than 0 — the ratio divides by it.', 'hip')
  if (!Number.isFinite(height) || !(height > 0))
    throw new CalcError('Enter a height greater than 0.', 'height')

  const unit = imperial ? 'in' : 'cm'
  const length = { style: 'decimal', decimals: 1, unit } as const

  // The only place units matter: a height outside roughly 3ft to 8ft11 means the
  // wrong unit was selected — 180 read as inches, or 71 read as centimetres.
  // Without this the waist-to-height ratio comes back confident and wrong.
  const heightCm = imperial ? height * CM_PER_IN : height
  if (heightCm > 272)
    throw new CalcError('That height looks too large — check the units.', 'height')
  if (heightCm < 90) throw new CalcError('That height looks too small — check the units.', 'height')

  // Both ratios are dimensionless, so no conversion is needed: centimetres over
  // centimetres and inches over inches give the same number.
  const whr = waist / hip
  const whtr = waist / height

  const cutoff = female ? WHO_WHR_CUTOFF.female : WHO_WHR_CUTOFF.male
  // Percentage of the sex-specific WHO cut-off. 100 is exactly on the line.
  const shareOfCutoff = (whr / cutoff) * 100
  // The waist that would put this person exactly on the WHO line at their
  // current hip measurement — the actionable form of the same threshold.
  const waistAtCutoff = hip * cutoff
  const halfHeight = height / 2

  const steps: Array<Quantity | { rule: true }> = [
    { label: 'Waist', value: waist, format: length },
    { label: 'Hip', value: hip, format: length },
    { rule: true },
    { label: 'Waist ÷ hip = waist-to-hip ratio', value: whr, format: { style: 'decimal', decimals: 3 } },
    { rule: true },
    {
      label: female ? 'WHO cut-off for women' : 'WHO cut-off for men',
      value: cutoff,
      format: { style: 'decimal', decimals: 2 },
    },
    {
      label: 'Your ratio as a share of that cut-off',
      value: shareOfCutoff,
      format: { style: 'percent', decimals: 1 },
    },
    { rule: true },
    { label: 'Height', value: height, format: length },
    { label: 'Half your height', value: halfHeight, format: length },
    {
      label: 'Waist ÷ height = waist-to-height ratio',
      value: whtr,
      format: { style: 'decimal', decimals: 3 },
    },
  ]

  return {
    primary: {
      label: 'Waist-to-hip ratio',
      value: whr,
      format: { style: 'decimal', decimals: 2 },
    },
    // Not the raw ratio: the meter reads the normalised percentage described
    // above, so one fixed set of bands serves both sexes.
    scaleValue: shareOfCutoff,
    stats: [
      { label: 'Waist-to-height ratio', value: whtr, format: { style: 'decimal', decimals: 2 } },
      { label: 'Waist-to-height band', value: whtrBand(whtr), format: { style: 'raw' } },
      {
        label: female ? 'WHO cut-off for women' : 'WHO cut-off for men',
        value: cutoff,
        format: { style: 'decimal', decimals: 2 },
      },
      {
        label: 'Share of the WHO cut-off',
        value: shareOfCutoff,
        format: { style: 'percent', decimals: 1 },
      },
      { label: 'Waist that meets the cut-off', value: waistAtCutoff, format: length },
    ],
    steps,
    // No `parts` and no `series`, under any input. Waist and hip are not
    // components of a whole, and a single set of measurements trends over
    // nothing — a donut or a chart here would be decoration pretending to be
    // information. What matters is that neither ever appears for SOME input,
    // because a card the server did not render at the defaults cannot be
    // conjured back by the island.
    notes: [
      'The 0.90 and 0.85 cut-offs come from the WHO expert consultation on waist circumference and waist-hip ratio (Geneva, 2008; report published 2011). They mark substantially increased risk of metabolic complications at a population level — they describe an association across groups of people, not a diagnosis of any individual, and no ratio on its own tells you whether you are ill.',
      'This is a different question from the one the body fat calculator answers, even though it uses the same tape. That page estimates how much fat you carry; this one describes where you carry it. Two people can hold identical body fat percentages and sit on opposite sides of the WHO line, because fat stored around the abdomen and the organs behaves differently from fat stored on the hips and thighs.',
      'The WHO report notes that the optimal cut-off differs between ethnic groups, and the ratio is not meaningful during pregnancy. Absolute waist circumference matters too: the same consultation flags a waist over 102cm in men or 88cm in women as substantially increased risk regardless of the proportion.',
    ],
  }
}

export { WHO_WHR_CUTOFF, BAND_EDGES, WHTR_HEALTHY, WHTR_HIGH, WHTR_LEAN }

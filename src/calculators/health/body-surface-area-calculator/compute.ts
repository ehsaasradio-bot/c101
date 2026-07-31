import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

const CM_PER_IN = 2.54
const LB_PER_KG = 2.2046226218487757 // 1 / 0.45359237, the exact pound

/**
 * The five published body-surface-area formulas, all taking height in
 * CENTIMETRES and weight in KILOGRAMS and returning square metres.
 *
 * Du Bois & Du Bois (1916)
 *   BSA = 0.007184 × W^0.425 × H^0.725
 *   Du Bois D, Du Bois EF. "A formula to estimate the approximate surface area
 *   if height and weight be known." Arch Intern Med 1916;17(6):863-871.
 *   The original, fitted to just nine subjects — which is why it is the one
 *   most likely to disagree with the rest at the extremes.
 *
 * Mosteller (1987)
 *   BSA = sqrt(H × W / 3600)
 *   Mosteller RD. "Simplified calculation of body-surface area."
 *   N Engl J Med 1987;317:1098.
 *   Published as a simplification you can do on a pocket calculator, and for
 *   that reason the one most clinicians actually use. Equivalent to the form
 *   0.016667 × W^0.5 × H^0.5, since 1/60 = 0.016666..., and 60² = 3600.
 *
 * Haycock, Schwartz & Wisotsky (1978)
 *   BSA = 0.024265 × H^0.3964 × W^0.5378
 *   Haycock GB, Schwartz GJ, Wisotsky DH. "Geometric method for measuring body
 *   surface area: a height-weight formula validated in infants, children and
 *   adults." J Pediatr 1978;93(1):62-66.
 *   Fitted to 81 subjects from neonates upward, which is why paediatric
 *   oncology protocols tend to specify it.
 *
 * Gehan & George (1970)
 *   BSA = 0.0235 × H^0.42246 × W^0.51456
 *   Gehan EA, George SL. "Estimation of human body surface area from height and
 *   weight." Cancer Chemother Rep 1970;54(4):225-235.
 *   Refitted Du Bois's shape against 401 direct measurements.
 *
 * Boyd (1935)
 *   BSA = 0.0003207 × H^0.3 × Wg^(0.7285 − 0.0188 × log10(Wg)),  Wg = weight in GRAMS
 *   Boyd E. "The growth of the surface area of the human body."
 *   Minneapolis: University of Minnesota Press, 1935.
 *   The only one whose weight exponent is itself a function of weight, so it
 *   bends away from the others as body mass moves. The gram-native form above
 *   is algebraically identical to the kilogram form that also circulates,
 *   0.03330 × W^(0.6157 − 0.0188 × log10(W)) × H^0.3 — substituting
 *   Wg = 1000·W folds 10^2.0163 ≈ 103.8 into the leading coefficient and
 *   shifts the exponent by 3 × 0.0188 = 0.0564. `compute.test.ts` checks the
 *   two forms against each other, which catches a gram/kilogram mix-up that
 *   would otherwise read as a plausible 25% error.
 */
export const FORMULAS = [
  {
    id: 'dubois',
    label: 'Du Bois & Du Bois (1916)',
    bsa: (h: number, w: number) => 0.007184 * Math.pow(w, 0.425) * Math.pow(h, 0.725),
  },
  {
    id: 'mosteller',
    label: 'Mosteller (1987)',
    bsa: (h: number, w: number) => Math.sqrt((h * w) / 3600),
  },
  {
    id: 'haycock',
    label: 'Haycock (1978)',
    bsa: (h: number, w: number) => 0.024265 * Math.pow(h, 0.3964) * Math.pow(w, 0.5378),
  },
  {
    id: 'gehan',
    label: 'Gehan & George (1970)',
    bsa: (h: number, w: number) => 0.0235 * Math.pow(h, 0.42246) * Math.pow(w, 0.51456),
  },
  {
    id: 'boyd',
    label: 'Boyd (1935)',
    bsa: (h: number, w: number) => {
      const grams = w * 1000
      return 0.0003207 * Math.pow(h, 0.3) * Math.pow(grams, 0.7285 - 0.0188 * Math.log10(grams))
    },
  },
] as const

const AREA = { style: 'decimal', decimals: 2, unit: 'm²' } as const
const FINE_AREA = { style: 'decimal', decimals: 3, unit: 'm²' } as const

export default function compute(v: Values<typeof fields>): CalcResult {
  const { height, weight } = v
  // The select arrives as a string; the derived Values type makes that explicit.
  const imperial = v.units === 'imperial'

  // Finiteness first: coerceValues emits NaN for unparseable input, and a
  // magnitude test like `height < 0` is false for NaN, so it would slip through.
  if (!Number.isFinite(height)) throw new CalcError('Enter a height.', 'height')
  if (!Number.isFinite(weight)) throw new CalcError('Enter a weight.', 'weight')
  if (!(height > 0)) throw new CalcError('Enter a height greater than 0.', 'height')
  if (!(weight > 0)) throw new CalcError('Enter a weight greater than 0.', 'weight')

  const cm = imperial ? height * CM_PER_IN : height
  const kg = imperial ? weight / LB_PER_KG : weight

  // Wrong-unit guards, and the reason they are not symmetric with the field
  // bounds. Both mistakes are one selector away and neither produces a number
  // that looks wrong: 178 typed with imperial selected is read as 178 in, or
  // 452 cm, and 70 typed with metric selected is read as 70 cm rather than the
  // 177.8 cm the person meant. Without these the five formulas return a
  // confident, wholly wrong area instead of an error.
  //
  // The window is 100-272 cm. The upper end is above the tallest person
  // recorded (272 cm) and the lower end is below the shortest height either
  // variant offers — metric 105 cm, imperial 42 in, i.e. 106.7 cm — so every
  // bound the form can present is a value this accepts, while the 55-78 that
  // someone means as inches is refused.
  if (cm > 272) throw new CalcError('That height looks too large — check the units.', 'height')
  if (cm < 100) throw new CalcError('That height looks too small — check the units.', 'height')
  // Above the heaviest human ever recorded. 300 kg and 660 lb (299.4 kg) both clear it.
  if (kg > 650) throw new CalcError('That weight looks too large — check the units.', 'weight')

  const values = FORMULAS.map((f) => ({ ...f, value: f.bsa(cm, kg) }))
  const byId = (id: string) => values.find((f) => f.id === id)!.value

  const mosteller = byId('mosteller')
  const areas = values.map((f) => f.value)
  const lowest = Math.min(...areas)
  const highest = Math.max(...areas)
  const spread = highest - lowest
  // Against the midpoint rather than the headline, so the figure describes the
  // disagreement itself and does not move when a different formula is promoted.
  const midpoint = (highest + lowest) / 2
  const spreadPercent = (spread / midpoint) * 100

  return {
    primary: { label: 'Body surface area (Mosteller)', value: mosteller, format: AREA },
    stats: [
      { label: 'Du Bois & Du Bois (1916)', value: byId('dubois'), format: AREA },
      { label: 'Haycock (1978)', value: byId('haycock'), format: AREA },
      { label: 'Gehan & George (1970)', value: byId('gehan'), format: AREA },
      { label: 'Boyd (1935)', value: byId('boyd'), format: AREA },
      { label: 'Lowest to highest', value: spread, format: FINE_AREA },
      { label: 'Disagreement between formulas', value: spreadPercent, format: { style: 'percent', decimals: 1 } },
    ],
    steps: [
      { label: 'Height', value: cm, format: { style: 'decimal', decimals: 1, unit: 'cm' } },
      { label: 'Weight', value: kg, format: { style: 'decimal', decimals: 1, unit: 'kg' } },
      { rule: true },
      {
        label: 'Height × weight',
        value: cm * kg,
        format: { style: 'decimal', decimals: 0, unit: 'cm·kg' },
      },
      {
        label: 'Divided by 3600',
        value: (cm * kg) / 3600,
        format: { style: 'decimal', decimals: 4 },
      },
      { label: 'Square root — Mosteller BSA', value: mosteller, format: AREA },
      { rule: true },
      ...values.map((f) => ({ label: f.label, value: f.value, format: FINE_AREA })),
    ],
    notes: [
      `For these measurements the five formulas span ${lowest.toFixed(3)} to ${highest.toFixed(3)} m² — a range of ${spread.toFixed(3)} m², or ${spreadPercent.toFixed(1)}% of the middle of that band. There is no consensus on which is correct, so the honest reading is the range rather than any single figure.`,
      'Mosteller is the headline here because it is the one most clinicians use: the square root of height in centimetres times weight in kilograms over 3600 is short enough to do in your head. Haycock is the usual choice in paediatric protocols, and Du Bois, the oldest, was fitted to only nine people.',
      'Body surface area is a reference calculation, not a dosing instrument. Chemotherapy and other BSA-scaled doses are set by a clinician from verified measurements and then adjusted by capping, rounding and protocol-specific rules that this page does not apply. Do not use this number to prepare or check a dose.',
    ],
  }
}

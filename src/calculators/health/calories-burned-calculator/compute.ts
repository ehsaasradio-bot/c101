import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import { ACTIVITIES } from './fields'
import type { fields } from './fields'

/*
 * THE MET EQUATION, with every constant spelled out.
 *
 *   kcal/min = MET x 3.5 x weight_kg / 200
 *   kcal     = MET x 3.5 x weight_kg / 200 x minutes
 *
 * One MET is the resting metabolic rate — an oxygen uptake of 3.5 millilitres
 * per kilogram of body mass per minute. That definition, and the MET values
 * this calculator reads, come from:
 *
 *   Ainsworth BE, Haskell WL, Herrmann SD, Meckes N, Bassett DR Jr,
 *   Tudor-Locke C, Greer JL, Vezina J, Whitt-Glover MC, Leon AS.
 *   "2011 Compendium of Physical Activities: a second update of codes and MET
 *   values." Med Sci Sports Exerc. 2011;43(8):1575-1581.
 *
 * The equation is a chain of unit conversions rather than a fitted regression,
 * which is why it can be checked instead of merely trusted:
 *
 *   MET x 3.5       -> ml of oxygen per kg of body mass per minute
 *   x weight_kg     -> ml of oxygen per minute
 *   x minutes       -> ml of oxygen over the whole session
 *   / 1000          -> litres of oxygen
 *   x 5             -> kcal, at the standard caloric equivalent of roughly
 *                      5 kcal liberated per litre of oxygen consumed on a
 *                      mixed diet
 *
 * Those last two steps are the whole of the mysterious "200": 1000 / 5 = 200.
 * `compute.test.ts` derives the default answer through the oxygen route as an
 * independent confirmation of the closed form used here.
 *
 * GROSS VERSUS NET. A MET value is a MULTIPLE of resting metabolism, not an
 * amount on top of it. Walking at 4.3 METs means burning 4.3 times the resting
 * rate — and one of those 4.3 would have been burned sitting on the sofa. So
 * the calories ATTRIBUTABLE to the activity use (MET - 1), not MET:
 *
 *   gross kcal = MET       x 3.5 x kg / 200 x minutes
 *   rest  kcal = 1         x 3.5 x kg / 200 x minutes
 *   net   kcal = (MET - 1) x 3.5 x kg / 200 x minutes
 *
 * Both are reported below. Most calculators print only the gross figure, which
 * overstates what the exercise itself cost by the resting share — 23% of the
 * total for a brisk walk, and still about 10% for a hard run.
 */

/** One metabolic equivalent: 3.5 ml of oxygen per kg of body mass per minute. */
const ML_O2_PER_KG_MIN_PER_MET = 3.5

/** 1000 ml per litre divided by ~5 kcal per litre of oxygen consumed. */
const MET_DIVISOR = 200

/** Energy released per litre of oxygen consumed on a mixed diet, kcal. */
const KCAL_PER_LITRE_O2 = 5

/** 1 kg = 2.2046226218487757 lb. */
const LB_PER_KG = 2.2046226218487757

/** Body fat stores roughly 7700 kcal per kilogram of adipose tissue. */
const KCAL_PER_KG_FAT = 7700

const MET_BY_ACTIVITY: Record<string, { met: number; label: string }> = Object.fromEntries(
  ACTIVITIES.map((a) => [a.value, { met: a.met, label: a.label }]),
)

export default function compute(v: Values<typeof fields>): CalcResult {
  const { units, activity, weight, duration } = v
  const imperial = units === 'imperial'

  // Finiteness first, always. `coerceValues` deliberately produces NaN for
  // unparseable input, and a magnitude test like `weight > 500` is FALSE for
  // NaN, so a bare comparison would let it straight into the arithmetic.
  if (!Number.isFinite(weight) || !(weight > 0)) {
    throw new CalcError('Enter a body weight greater than 0.', 'weight')
  }
  if (!Number.isFinite(duration) || !(duration > 0)) {
    throw new CalcError('Enter a duration greater than 0 minutes.', 'duration')
  }

  const entry = MET_BY_ACTIVITY[activity]
  if (!entry) throw new CalcError('Choose an activity from the list.', 'activity')
  const { met, label: activityLabel } = entry

  const kg = imperial ? weight / LB_PER_KG : weight
  const lb = imperial ? weight : weight * LB_PER_KG

  // A plausibility guard set above every bound the form can offer: the metric
  // slider tops out at 300 kg and the imperial one at 660 lb (299.4 kg).
  if (kg > 500) throw new CalcError('That weight looks too large — check the units.', 'weight')
  // Likewise above the field's own 720-minute ceiling.
  if (duration > 1440) {
    throw new CalcError('Enter a duration of 1440 minutes (24 hours) or less.', 'duration')
  }

  // kcal/min = MET x 3.5 x kg / 200. Everything below is this rate times a time.
  const grossRate = (met * ML_O2_PER_KG_MIN_PER_MET * kg) / MET_DIVISOR
  const restingRate = (1 * ML_O2_PER_KG_MIN_PER_MET * kg) / MET_DIVISOR

  const gross = grossRate * duration
  const resting = restingRate * duration
  // Derived by subtraction so the two parts sum to the headline exactly by
  // construction rather than by luck. Every MET value offered is at least 2.5,
  // so this can never go negative.
  const net = gross - resting

  const litresO2 = (met * ML_O2_PER_KG_MIN_PER_MET * kg * duration) / 1000

  const kcal = { style: 'decimal', decimals: 0, unit: 'kcal' } as const
  const kcalFine = { style: 'decimal', decimals: 1, unit: 'kcal' } as const

  return {
    primary: { label: 'Calories burned (gross)', value: gross, format: kcalFine },
    stats: [
      { label: 'Net — attributable to the activity', value: net, format: kcalFine },
      { label: 'Resting share, burned anyway', value: resting, format: kcalFine },
      {
        label: 'MET value used',
        value: met,
        format: { style: 'decimal', decimals: 1, unit: 'METs' },
      },
      {
        label: 'Burn rate',
        value: grossRate,
        format: { style: 'decimal', decimals: 2, unit: 'kcal/min' },
      },
      { label: 'One hour at this rate', value: grossRate * 60, format: kcal },
      {
        label: 'Net expressed as body fat',
        value: (net / KCAL_PER_KG_FAT) * 1000,
        format: { style: 'decimal', decimals: 1, unit: 'g' },
      },
    ],
    steps: [
      { label: 'Activity', value: activityLabel, format: { style: 'raw' } },
      {
        label: 'MET value (2011 Compendium)',
        value: met,
        format: { style: 'decimal', decimals: 1 },
      },
      { label: 'Body weight', value: kg, format: { style: 'decimal', decimals: 2, unit: 'kg' } },
      { label: 'Same weight', value: lb, format: { style: 'decimal', decimals: 1, unit: 'lb' } },
      { label: 'Duration', value: duration, format: { style: 'decimal', decimals: 0, unit: 'min' } },
      { rule: true },
      {
        label: 'Oxygen uptake = MET × 3.5',
        value: met * ML_O2_PER_KG_MIN_PER_MET,
        format: { style: 'decimal', decimals: 2, unit: 'ml/kg/min' },
      },
      {
        label: 'Oxygen consumed over the session',
        value: litresO2,
        format: { style: 'decimal', decimals: 1, unit: 'L' },
      },
      {
        label: `Energy at ${KCAL_PER_LITRE_O2} kcal per litre of oxygen`,
        value: litresO2 * KCAL_PER_LITRE_O2,
        format: kcalFine,
      },
      { rule: true },
      {
        label: 'kcal/min = MET × 3.5 × kg ÷ 200',
        value: grossRate,
        format: { style: 'decimal', decimals: 3, unit: 'kcal/min' },
      },
      { label: 'Gross = rate × minutes', value: gross, format: kcalFine },
      { label: 'Resting = 1 MET over the same time', value: resting, format: kcalFine },
      { label: 'Net = gross − resting', value: net, format: kcalFine },
    ],
    // The two halves of the headline itself, so no `partsTotal` is needed. The
    // split is the honest one: a MET is a multiple of resting metabolism, so one
    // of those METs was never the exercise's doing.
    parts: [
      { label: 'Attributable to the activity', value: net, format: kcalFine },
      { label: 'Resting metabolism', value: resting, format: kcalFine },
    ],
    notes: [
      'MET values are population averages, published for a healthy adult of about 70 kg. Individual burn varies substantially with fitness, terrain, gradient, technique, load carried and how economically you move — two people of the same weight doing the same session can differ by 20% or more.',
      'The gross figure includes the calories your body would have spent at rest over the same minutes, because a MET is a multiple of resting metabolism rather than an addition to it. The net figure strips that share out, and is the honest number to use when working out how much a session adds to your daily expenditure. For a brisk walk the resting share is about 23% of the total; even for a hard run it is around 10%.',
      'The equation is linear in both weight and time. It takes no account of intensity varying within a session, of the raised metabolism that lingers for a while afterwards, or of the fact that a heavier body is usually less economical per kilogram at the same pace.',
    ],
  }
}

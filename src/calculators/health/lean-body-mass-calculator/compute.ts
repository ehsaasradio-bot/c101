import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, StepRule, Values } from '../../../lib/types'
import type { fields } from './fields'

const LB_PER_KG = 2.2046226218487757
const CM_PER_IN = 2.54

/**
 * Four estimates of the same quantity, three of which never see a body-fat
 * measurement at all. That is the point of this page: predictive lean body mass
 * is a REGRESSION on height, weight and sex, fitted to one population and then
 * applied to everybody else, so the formulas disagree by kilograms — and the
 * disagreement is the honest answer.
 *
 * All three take weight in KILOGRAMS and height in CENTIMETRES. Feeding pounds
 * and inches to a constant term like −19.2 kg produces a confident, badly wrong
 * number rather than an error, which is why `compute` normalises first.
 *
 * ── Boer (1984) ────────────────────────────────────────────────────────────
 * P. Boer, "Estimated lean body mass as an index for normalization of body
 * fluid volumes in humans", Am J Physiol 247(4):F632–F636, October 1984.
 *
 *   men    eLBM = 0.407·W + 0.267·H − 19.2
 *   women  eLBM = 0.252·W + 0.473·H − 48.3
 *
 * Grounded in body-water and cadaver data; the one usually recommended for
 * normal-weight adults, and the headline here for that reason.
 *
 * ── James (1976) ───────────────────────────────────────────────────────────
 * W.P.T. James, "Research on Obesity: A Report of the DHSS/MRC Group",
 * London: HMSO, 1976. Still the standard "lean body weight" in drug dosing.
 *
 *   men    eLBM = 1.10·W − 128·(W/H)²
 *   women  eLBM = 1.07·W − 148·(W/H)²
 *
 * The only one of the three with no constant term and the only one that is not
 * affine. The quadratic penalty means it TURNS OVER and starts falling as
 * weight climbs, which is the documented reason it fails at a high BMI — see
 * the guard below, which refuses rather than reporting the fall.
 *
 * ── Hume (1966) ────────────────────────────────────────────────────────────
 * R. Hume, "Prediction of lean body mass from height and weight",
 * J Clin Pathol 19(4):389–391, 1966.
 *
 *   men    eLBM = 0.32810·W + 0.33929·H − 29.5336
 *   women  eLBM = 0.29569·W + 0.41813·H − 43.2933
 *
 * A small British sample measured by total body potassium. It reads several
 * kilograms lower than the other two for an average adult man.
 *
 * `compute.test.ts` pins all three against the published worked set for a
 * 60 kg, 180 cm man — 53.3 / 51.8 / 51.2 kg — and Boer against its own widely
 * quoted worked example, 75 kg and 180 cm → 59.39 kg.
 */
const BOER = {
  male: { w: 0.407, h: 0.267, c: -19.2 },
  female: { w: 0.252, h: 0.473, c: -48.3 },
} as const

const JAMES = {
  male: { w: 1.1, q: 128 },
  female: { w: 1.07, q: 148 },
} as const

const HUME = {
  male: { w: 0.3281, h: 0.33929, c: -29.5336 },
  female: { w: 0.29569, h: 0.41813, c: -43.2933 },
} as const

type Sex = 'male' | 'female'

const boer = (sex: Sex, kg: number, cm: number) =>
  BOER[sex].w * kg + BOER[sex].h * cm + BOER[sex].c
const james = (sex: Sex, kg: number, cm: number) =>
  JAMES[sex].w * kg - JAMES[sex].q * Math.pow(kg / cm, 2)
const hume = (sex: Sex, kg: number, cm: number) =>
  HUME[sex].w * kg + HUME[sex].h * cm + HUME[sex].c

export default function compute(v: Values<typeof fields>): CalcResult {
  const { weight, height, bodyFat } = v
  // Selects arrive as strings; the derived Values type makes that explicit.
  const imperial = v.units === 'imperial'
  const sex: Sex = v.sex === 'female' ? 'female' : 'male'

  // Finiteness FIRST. `coerceValues` deliberately emits NaN for unparseable
  // input, and a magnitude test like `weight > 0` is false for NaN, so it would
  // slip past a bare range check and surface as NaN on the page.
  if (!Number.isFinite(weight)) throw new CalcError('Enter a body weight.', 'weight')
  if (!Number.isFinite(height)) throw new CalcError('Enter a height.', 'height')
  if (!Number.isFinite(bodyFat)) throw new CalcError('Enter a body fat percentage.', 'bodyFat')

  if (!(weight > 0)) throw new CalcError('Enter a body weight greater than 0.', 'weight')
  if (!(height > 0)) throw new CalcError('Enter a height greater than 0.', 'height')
  if (!(bodyFat > 0)) throw new CalcError('Enter a body fat percentage greater than 0.', 'bodyFat')
  if (!(bodyFat < 100))
    throw new CalcError('Body fat must be below 100% — no body is entirely fat.', 'bodyFat')

  const kg = imperial ? weight / LB_PER_KG : weight
  const cm = imperial ? height * CM_PER_IN : height
  const metres = cm / 100

  // A height outside roughly 4ft–7ft6 means the wrong unit is selected — 178
  // read as inches, or 70 read as centimetres. Every equation below would
  // otherwise turn that into a plausible-looking number instead of an error.
  if (cm > 230) throw new CalcError('That height looks too large — check the units.', 'height')
  if (cm < 120) throw new CalcError('That height looks too small — check the units.', 'height')

  const estimates = [
    { label: 'Boer (1984)', kg: boer(sex, kg, cm) },
    { label: 'James (1976)', kg: james(sex, kg, cm) },
    { label: 'Hume (1966)', kg: hume(sex, kg, cm) },
  ] as const

  // Lean mass above total body weight is not a body, and neither is lean mass
  // of zero. Each regression runs out of road somewhere: Boer's height term
  // keeps adding 0.267 kg per centimetre no matter how light the frame, so a
  // very tall very light body is predicted to hold more lean tissue than the
  // whole person weighs; James' quadratic term drives its estimate negative at
  // a very high BMI. Refuse rather than print an impossible figure.
  for (const e of estimates) {
    if (!Number.isFinite(e.kg) || !(e.kg > 0))
      throw new CalcError(
        `The ${e.label} equation gives no lean mass at all for that height and weight — it was never fitted to a body of that shape.`,
        'weight',
      )
    if (e.kg > kg)
      throw new CalcError(
        `The ${e.label} equation predicts more lean mass than that body weighs — check the height and weight.`,
        'weight',
      )
  }

  const boerKg = estimates[0].kg
  const jamesKg = estimates[1].kg
  const humeKg = estimates[2].kg
  const predicted = [boerKg, jamesKg, humeKg]
  const spreadKg = Math.max(...predicted) - Math.min(...predicted)

  // The one route that uses a measurement of YOU rather than a population
  // average: whatever is not fat is, by definition, lean.
  const directKg = kg * (1 - bodyFat / 100)

  // FFMI scales lean mass by height the way BMI scales total weight, which is
  // what makes it comparable between people of different sizes. Conventionally
  // kg/m², like BMI, whichever unit system was typed in.
  const ffmi = boerKg / (metres * metres)

  // The headline drives the split, so the two parts always add back to exactly
  // the weight that was entered. Fat is a subtraction, never an independent
  // calculation, so the sum is exact by construction; the guard above is what
  // keeps it non-negative.
  const fatKg = kg - boerKg
  const toDisplay = (value: number) => (imperial ? value * LB_PER_KG : value)
  const unit = imperial ? 'lb' : 'kg'
  const mass = { style: 'decimal', decimals: 1, unit } as const
  const kgFmt = { style: 'decimal', decimals: 2, unit: 'kg' } as const
  const ffmiFmt = { style: 'decimal', decimals: 1, unit: 'kg/m²' } as const

  const steps: (Quantity | StepRule)[] = [
    { label: 'Weight, converted', value: kg, format: kgFmt },
    { label: 'Height, converted', value: cm, format: { style: 'decimal', decimals: 1, unit: 'cm' } },
    { rule: true },
    {
      label:
        sex === 'female'
          ? 'Boer: 0.252 × weight + 0.473 × height − 48.3'
          : 'Boer: 0.407 × weight + 0.267 × height − 19.2',
      value: boerKg,
      format: kgFmt,
    },
    {
      label:
        sex === 'female'
          ? 'James: 1.07 × weight − 148 × (weight ÷ height)²'
          : 'James: 1.10 × weight − 128 × (weight ÷ height)²',
      value: jamesKg,
      format: kgFmt,
    },
    {
      label:
        sex === 'female'
          ? 'Hume: 0.29569 × weight + 0.41813 × height − 43.2933'
          : 'Hume: 0.32810 × weight + 0.33929 × height − 29.5336',
      value: humeKg,
      format: kgFmt,
    },
    { label: 'Highest estimate minus lowest', value: spreadKg, format: kgFmt },
    { rule: true },
    { label: 'Body fat entered', value: bodyFat, format: { style: 'percent', decimals: 1 } },
    { label: 'Lean mass = weight × (1 − body fat)', value: directKg, format: kgFmt },
    { rule: true },
    { label: 'Lean body mass used below (Boer)', value: toDisplay(boerKg), format: mass },
    { label: 'Fat mass = weight − lean mass', value: toDisplay(fatKg), format: mass },
    {
      label: 'Height squared',
      value: metres * metres,
      format: { style: 'decimal', decimals: 3, unit: 'm²' },
    },
    { label: 'FFMI = lean mass ÷ height²', value: ffmi, format: ffmiFmt },
  ]

  return {
    primary: { label: 'Lean body mass (Boer)', value: toDisplay(boerKg), format: mass },
    scaleValue: ffmi,
    stats: [
      { label: 'James (1976) estimate', value: toDisplay(jamesKg), format: mass },
      { label: 'Hume (1966) estimate', value: toDisplay(humeKg), format: mass },
      { label: 'From your body fat', value: toDisplay(directKg), format: mass },
      { label: 'Spread across the three formulas', value: toDisplay(spreadKg), format: mass },
      { label: 'Fat mass', value: toDisplay(fatKg), format: mass },
      { label: 'Fat-free mass index', value: ffmi, format: ffmiFmt },
    ],
    steps,
    // The Boer headline split back into the two masses it implies. They sum to
    // the entered body weight, which is not the primary figure, hence
    // `partsTotal`. Two parts, always — the count never varies with input.
    parts: [
      { label: 'Lean mass', value: toDisplay(boerKg), format: mass },
      { label: 'Fat mass', value: toDisplay(fatKg), format: mass },
    ],
    partsTotal: { label: 'Body weight', value: weight, format: mass },
    notes: [
      'Boer, James and Hume are population estimates, not measurements. Each is a regression fitted to a different group of people — Boer to body-water and cadaver data, James to a 1970s clinical sample, Hume to a small British sample measured by total body potassium — so they disagree by kilograms for the same body. Read the spread as the honest error bar.',
      'Only the "From your body fat" figure uses anything measured on you. If you have a DEXA scan, calipers or a tape-method reading, that is the number to trust: the three formulas cannot tell a lifter from a sedentary person of identical height, weight and sex.',
      sex === 'female'
        ? 'The bands shown are the male FFMI reference ranges. Women typically read about 3 points lower at the same training age, so subtract roughly 3 before comparing.'
        : 'FFMI scales lean mass by height the way BMI scales total weight, which is why it, rather than lean mass in kilograms, is the figure comparable between people of different sizes.',
    ],
  }
}

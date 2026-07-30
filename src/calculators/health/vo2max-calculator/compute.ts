import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, Values } from '../../../lib/types'
import type { fields } from './fields'

/*
 * FOUR PUBLISHED FIELD-TEST EQUATIONS, WITH THEIR ACTUAL COEFFICIENTS.
 * Every constant below is quoted from the source named beside it, so the next
 * reader can check it rather than reverse-engineer it.
 *
 * 1. COOPER 12-MINUTE RUN
 *    Cooper KH. "A means of assessing maximal oxygen intake: correlation
 *    between field and treadmill testing." JAMA 1968;203(3):201-204.
 *      VO2max = (d - 504.9) / 44.73          d = metres covered in 12 minutes
 *    Cooper validated it on 115 US Air Force men, r = 0.90. Published anchor:
 *    2400 m gives 42.4 ml/kg/min, 2500 m gives 44.603.
 *    Note the regression crosses zero at d = 504.9 m, which is why `fields.ts`
 *    floors the distance at 1000 m instead of at something decorative.
 *
 * 2. 1.5-MILE (2.4 KM) RUN
 *    The Balke-derived field equation carried by ACSM's guidelines:
 *      VO2max = 3.5 + 483 / t                t = minutes for 1.5 miles
 *    3.5 ml/kg/min is one MET, the resting term the regression sits on top of.
 *    Published anchors: 10:00 gives 51.8, 13:00 gives 40.65.
 *
 * 3. ROCKPORT FITNESS WALKING TEST
 *    Kline GM, Porcari JP, Hintermeister R, Freedson PS, Ward A, McCarron RF,
 *    Ross J, Rippe JM. "Estimation of VO2max from a one-mile track walk,
 *    gender, age, and body weight." Med Sci Sports Exerc 1987;19(3):253-259.
 *      VO2max = 132.853
 *               - 0.0769 x weight(lb)
 *               - 0.3877 x age(years)
 *               + 6.315  x sex        (1 male, 0 female)
 *               - 3.2649 x time(min, for one mile)
 *               - 0.1565 x heart rate(bpm at the finish)
 *    Multiple R = 0.88. Published anchor: a 55-year-old woman of 160 lb walking
 *    a mile in 14:30 and finishing at 145 bpm gives 29.19 ml/kg/min.
 *
 * 4. HEART RATE RATIO METHOD (Uth-Sorensen-Overgaard-Pedersen)
 *    Uth N, Sorensen H, Overgaard K, Pedersen PK. "Estimation of VO2max from
 *    the ratio between HRmax and HRrest - the Heart Rate Ratio Method."
 *    Eur J Appl Physiol 2004;91(1):111-115.
 *      VO2max = 15.3 x HRmax / HRrest
 *    The paper reports the proportionality factor as 15.3 (SD 0.7) ml/kg/min,
 *    derived from well-trained men aged 21-51 — the narrowest validation group
 *    of the four, which is why the note below says so.
 */

/** Exact by definition: 1 international mile = 1609.344 m, 1 yard = 0.9144 m. */
const METRES_PER_MILE = 1609.344
const METRES_PER_YARD = 0.9144
const LB_PER_KG = 2.2046226218487757
/** One metabolic equivalent, ml/kg/min. */
const MET = 3.5

/**
 * VO2max norms in ml/kg/min from the Cooper Institute's Physical Fitness
 * Specialist Manual (Dallas, TX; the revised table that ACSM texts reproduce).
 *
 * Each row is the FIVE boundaries that separate the six categories
 * "Very poor | Poor | Fair | Good | Excellent | Superior" for one sex and one
 * age decade. Read as half-open intervals: a man of 34 at exactly 41.0 is Good,
 * not Fair.
 *
 * They are strictly increasing within every row, which the interpolation below
 * relies on, and `compute.test.ts` asserts.
 */
const NORMS = {
  male: [
    { from: 20, to: 29, label: 'Men aged 20 to 29', cuts: [33.0, 36.5, 42.5, 46.5, 52.5] },
    { from: 30, to: 39, label: 'Men aged 30 to 39', cuts: [31.5, 35.5, 41.0, 45.0, 49.5] },
    { from: 40, to: 49, label: 'Men aged 40 to 49', cuts: [30.2, 33.6, 39.0, 43.8, 48.0] },
    { from: 50, to: 59, label: 'Men aged 50 to 59', cuts: [26.1, 31.0, 35.8, 41.0, 45.3] },
    { from: 60, to: 99, label: 'Men aged 60 and over', cuts: [20.5, 26.1, 32.3, 36.5, 44.2] },
  ],
  female: [
    { from: 20, to: 29, label: 'Women aged 20 to 29', cuts: [23.6, 29.0, 33.0, 37.0, 41.0] },
    { from: 30, to: 39, label: 'Women aged 30 to 39', cuts: [22.8, 27.0, 31.5, 35.7, 41.0] },
    { from: 40, to: 49, label: 'Women aged 40 to 49', cuts: [21.0, 24.5, 29.0, 32.9, 37.0] },
    { from: 50, to: 59, label: 'Women aged 50 to 59', cuts: [20.2, 22.8, 27.0, 31.5, 35.8] },
    { from: 60, to: 99, label: 'Women aged 60 and over', cuts: [17.5, 20.2, 24.5, 30.3, 31.5] },
  ],
} as const

const CATEGORIES = ['Very poor', 'Poor', 'Fair', 'Good', 'Excellent', 'Superior'] as const

/**
 * Where each category boundary sits on the 0-100 meter axis in `index.ts`.
 *
 * A `Scale` is fixed at build time and cannot carry a different set of
 * thresholds for every age and sex, so the meter reads a NORMALISED score
 * instead of raw ml/kg/min: the six category bands always occupy the same slice
 * of the axis, and the age- and sex-specific cut-points from NORMS are what get
 * mapped onto them. A 25-year-old man at 45 and a 65-year-old woman at 31 both
 * land in "Excellent" and both point at the same place on the bar.
 *
 * These must stay identical to the band edges declared in `index.ts`.
 */
const BAND_EDGES = [0, 15, 30, 50, 70, 90, 100] as const

/** The age-and-sex row this person is scored against. */
function normsFor(sex: string, age: number) {
  const rows = sex === 'female' ? NORMS.female : NORMS.male
  return rows.find((row) => age >= row.from && age <= row.to) ?? rows[rows.length - 1]!
}

/**
 * The seven VO2max values that anchor the seven points of `BAND_EDGES`.
 *
 * The five interior anchors are the published cut-points. The two outer ones
 * close the axis: below "Very poor" and above "Superior" the table states no
 * limit, so each open end is given a segment as wide as the category next to it
 * — doubled at the top, where the real range genuinely runs further (a 25-year-
 * old man's "Superior" starts at 52.5 and elite endurance athletes reach 80+).
 */
function anchorsFor(cuts: readonly number[]): number[] {
  const floor = Math.max(0, cuts[0]! - (cuts[1]! - cuts[0]!))
  const ceiling = cuts[4]! + 2 * (cuts[4]! - cuts[3]!)
  return [floor, ...cuts, ceiling]
}

/** Index into CATEGORIES: the first cut the value has NOT reached. */
function categoryIndex(vo2: number, cuts: readonly number[]): number {
  let i = 0
  while (i < cuts.length && vo2 >= cuts[i]!) i++
  return i
}

/** Piecewise-linear position on the 0-100 axis, clamped at both ends. */
function fitnessScore(vo2: number, anchors: readonly number[]): number {
  if (vo2 <= anchors[0]!) return 0
  for (let i = 1; i < anchors.length; i++) {
    if (vo2 < anchors[i]!) {
      const span = anchors[i]! - anchors[i - 1]!
      const t = span > 0 ? (vo2 - anchors[i - 1]!) / span : 0
      return BAND_EDGES[i - 1]! + t * (BAND_EDGES[i]! - BAND_EDGES[i - 1]!)
    }
  }
  return 100
}

export default function compute(v: Values<typeof fields>): CalcResult {
  const { method, distance, runTime, walkTime, walkHeartRate } = v
  const { maxHeartRate, restingHeartRate, age, weight } = v
  const imperial = v.units === 'imperial'
  const male = v.sex !== 'female'

  // Finiteness first, always. `coerceValues` deliberately produces NaN for
  // unparseable input, and a magnitude test like `age < 20` is FALSE for NaN, so
  // a bare comparison would let it straight through into the arithmetic.
  if (!Number.isFinite(age) || age < 20)
    throw new CalcError('Enter an age of 20 or over — the fitness norms start there.', 'age')
  if (age > 99) throw new CalcError('Enter an age below 100.', 'age')
  if (!Number.isFinite(weight) || !(weight > 0))
    throw new CalcError('Enter a body weight greater than 0.', 'weight')

  const kg = imperial ? weight / LB_PER_KG : weight
  const lb = imperial ? weight : weight * LB_PER_KG
  if (kg > 400) throw new CalcError('That weight looks too large — check the units.', 'weight')

  let vo2: number
  let methodLabel: string
  let steps: Array<Quantity | { rule: true }>
  let methodNote: string

  if (method === 'run15') {
    if (!Number.isFinite(runTime) || !(runTime > 0))
      throw new CalcError('Enter a finishing time greater than 0.', 'runTime')
    if (runTime < 5)
      throw new CalcError('A 1.5-mile time under 5 minutes is faster than the world record.', 'runTime')
    if (runTime > 40)
      throw new CalcError('Enter a 1.5-mile time of 40 minutes or less.', 'runTime')

    // VO2max = 3.5 + 483 / t  (ACSM 1.5-mile run/walk equation)
    vo2 = MET + 483 / runTime
    methodLabel = '1.5-mile (2.4 km) run'
    methodNote =
      'The 1.5-mile equation adds 483 ÷ your time in minutes to a resting 3.5 ml/kg/min. It assumes a hard, evenly paced effort; a run that starts too fast and fades reads low.'
    steps = [
      {
        label: 'Finishing time for 1.5 miles',
        value: runTime * 60,
        format: { style: 'duration', from: 'seconds' },
      },
      {
        label: 'Distance covered',
        value: (1.5 * METRES_PER_MILE) / 1000,
        format: { style: 'decimal', decimals: 3, unit: 'km' },
      },
      { rule: true },
      {
        label: '483 ÷ time in minutes',
        value: 483 / runTime,
        format: { style: 'decimal', decimals: 2, unit: 'ml/kg/min' },
      },
      {
        label: 'Plus the resting term of 3.5',
        value: MET,
        format: { style: 'decimal', decimals: 1, unit: 'ml/kg/min' },
      },
    ]
  } else if (method === 'rockport') {
    if (!Number.isFinite(walkTime) || !(walkTime > 0))
      throw new CalcError('Enter a walking time greater than 0.', 'walkTime')
    if (walkTime < 5 || walkTime > 40)
      throw new CalcError('Enter a one-mile walking time between 5 and 40 minutes.', 'walkTime')
    if (!Number.isFinite(walkHeartRate) || !(walkHeartRate > 0))
      throw new CalcError('Enter the heart rate you finished the walk on.', 'walkHeartRate')
    if (walkHeartRate < 50 || walkHeartRate > 220)
      throw new CalcError('Enter a finishing heart rate between 50 and 220 bpm.', 'walkHeartRate')

    // Kline et al. 1987, coefficients exactly as published.
    vo2 =
      132.853 -
      0.0769 * lb -
      0.3877 * age +
      6.315 * (male ? 1 : 0) -
      3.2649 * walkTime -
      0.1565 * walkHeartRate

    if (!(vo2 > 0))
      throw new CalcError(
        'That combination of weight, age, walking time and heart rate falls outside the range the Rockport equation covers.',
        'walkTime',
      )

    methodLabel = 'Rockport 1-mile walk'
    methodNote =
      'The Rockport equation was validated on adults aged 30 to 69 walking as fast as they comfortably could. Jogging any part of the mile, or letting your pulse settle before you count it, both inflate the result.'
    steps = [
      { label: 'Constant', value: 132.853, format: { style: 'decimal', decimals: 3 } },
      {
        label: 'Weight × 0.0769',
        value: -0.0769 * lb,
        format: { style: 'decimal', decimals: 3, unit: 'ml/kg/min' },
      },
      {
        label: 'Age × 0.3877',
        value: -0.3877 * age,
        format: { style: 'decimal', decimals: 3, unit: 'ml/kg/min' },
      },
      {
        label: 'Sex term (6.315 for male, 0 for female)',
        value: 6.315 * (male ? 1 : 0),
        format: { style: 'decimal', decimals: 3, unit: 'ml/kg/min' },
      },
      {
        label: 'Walking time × 3.2649',
        value: -3.2649 * walkTime,
        format: { style: 'decimal', decimals: 3, unit: 'ml/kg/min' },
      },
      {
        label: 'Finishing heart rate × 0.1565',
        value: -0.1565 * walkHeartRate,
        format: { style: 'decimal', decimals: 3, unit: 'ml/kg/min' },
      },
      { rule: true },
      {
        label: 'Weight used by the equation',
        value: lb,
        format: { style: 'decimal', decimals: 1, unit: 'lb' },
      },
    ]
  } else if (method === 'resting') {
    if (!Number.isFinite(maxHeartRate) || !(maxHeartRate > 0))
      throw new CalcError('Enter a maximum heart rate greater than 0.', 'maxHeartRate')
    if (!Number.isFinite(restingHeartRate) || !(restingHeartRate > 0))
      throw new CalcError('Enter a resting heart rate greater than 0.', 'restingHeartRate')
    // A resting pulse at or above the maximum is not a slow reading, it is an
    // impossible one — and it is the RESTING figure that is wrong, so that is
    // the field the form should highlight.
    if (restingHeartRate >= maxHeartRate)
      throw new CalcError(
        'Your resting heart rate must be below your maximum heart rate.',
        'restingHeartRate',
      )

    // Uth et al. 2004: VO2max = 15.3 x HRmax / HRrest.
    vo2 = 15.3 * (maxHeartRate / restingHeartRate)
    methodLabel = 'Heart rate ratio'
    methodNote =
      'The heart rate ratio method needs no test at all, and pays for that with the narrowest validation group of the four: well-trained men aged 21 to 51. Treat it as a sanity check rather than a substitute for running the distance.'
    steps = [
      {
        label: 'Maximum heart rate',
        value: maxHeartRate,
        format: { style: 'decimal', decimals: 0, unit: 'bpm' },
      },
      {
        label: 'Resting heart rate',
        value: restingHeartRate,
        format: { style: 'decimal', decimals: 0, unit: 'bpm' },
      },
      { rule: true },
      {
        label: 'Ratio = max ÷ resting',
        value: maxHeartRate / restingHeartRate,
        format: { style: 'decimal', decimals: 3 },
      },
      {
        label: 'Multiplied by 15.3',
        value: vo2,
        format: { style: 'decimal', decimals: 2, unit: 'ml/kg/min' },
      },
    ]
  } else {
    if (!Number.isFinite(distance) || !(distance > 0))
      throw new CalcError('Enter a distance greater than 0.', 'distance')

    const metres = imperial ? distance * METRES_PER_YARD : distance
    // The regression is only meaningful above its own zero crossing at 504.9 m.
    if (metres < 600)
      throw new CalcError(
        'Enter at least 600 m — below that the Cooper regression returns nothing meaningful.',
        'distance',
      )
    if (metres > 6000)
      throw new CalcError('That is further than anyone has run in 12 minutes.', 'distance')

    // Cooper 1968: VO2max = (metres - 504.9) / 44.73.
    vo2 = (metres - 504.9) / 44.73
    methodLabel = 'Cooper 12-minute run'
    methodNote =
      'The Cooper test asks for the furthest distance you can cover in a flat 12 minutes. Pacing matters: the regression was built on a maximal effort, so a cautious first half understates your result.'
    steps = [
      {
        label: 'Distance covered in 12 minutes',
        value: metres,
        format: { style: 'decimal', decimals: 0, unit: 'm' },
      },
      {
        label: 'Same distance',
        value: metres / METRES_PER_MILE,
        format: { style: 'decimal', decimals: 3, unit: 'mi' },
      },
      { rule: true },
      {
        label: 'Distance minus 504.9',
        value: metres - 504.9,
        format: { style: 'decimal', decimals: 1, unit: 'm' },
      },
      {
        label: 'Divided by 44.73',
        value: vo2,
        format: { style: 'decimal', decimals: 2, unit: 'ml/kg/min' },
      },
      {
        label: 'Average speed over the 12 minutes',
        value: metres / 200,
        format: { style: 'decimal', decimals: 2, unit: 'km/h' },
      },
    ]
  }

  const row = normsFor(v.sex, age)
  const anchors = anchorsFor(row.cuts)
  const index = categoryIndex(vo2, row.cuts)
  const category = CATEGORIES[index]!
  // The printed range for the band the meter is pointing at, so the words and
  // the bar cannot disagree.
  const lowEdge = index === 0 ? undefined : row.cuts[index - 1]
  const highEdge = index === row.cuts.length ? undefined : row.cuts[index]
  const categoryRange =
    lowEdge === undefined
      ? `under ${row.cuts[0]!.toFixed(1)} ml/kg/min`
      : highEdge === undefined
        ? `${lowEdge.toFixed(1)} ml/kg/min and above`
        : `${lowEdge.toFixed(1)} to ${highEdge.toFixed(1)} ml/kg/min`

  return {
    primary: {
      label: 'Estimated VO2 max',
      value: vo2,
      format: { style: 'decimal', decimals: 1, unit: 'ml/kg/min' },
    },
    // The meter reads a 0-100 normalised score rather than raw ml/kg/min,
    // because a Scale is fixed at build time and the categories are not: 45
    // ml/kg/min is Good for a man of 25 and Superior for a woman of 65.
    scaleValue: fitnessScore(vo2, anchors),
    stats: [
      { label: 'Fitness category', value: category, format: { style: 'raw' } },
      { label: 'Compared against', value: row.label, format: { style: 'raw' } },
      { label: 'That category spans', value: categoryRange, format: { style: 'raw' } },
      {
        label: 'Aerobic capacity',
        value: vo2 / MET,
        format: { style: 'decimal', decimals: 1, unit: 'METs' },
      },
      {
        label: 'Absolute oxygen uptake',
        value: (vo2 * kg) / 1000,
        format: { style: 'decimal', decimals: 2, unit: 'L/min' },
      },
    ],
    steps: [
      { label: 'Method', value: methodLabel, format: { style: 'raw' } },
      ...steps,
      { rule: true },
      {
        label: 'Estimated VO2 max',
        value: vo2,
        format: { style: 'decimal', decimals: 1, unit: 'ml/kg/min' },
      },
    ],
    notes: [
      'This is a field-test estimate, not a lab measurement. A true VO2 max comes from a graded exercise test with a metabolic cart measuring the gas you actually breathe; every equation here is a regression fitted to a group of people, and an individual can sit several ml/kg/min either side of it.',
      methodNote,
      `Categories come from the Cooper Institute norms for ${row.label.toLowerCase()}. The same number means different things at different ages, which is why the bar is scored against your own group rather than against one universal threshold.`,
    ],
  }
}

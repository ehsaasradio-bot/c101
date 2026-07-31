import { CalcError } from '../../../lib/types'
import type { CalcResult, Part, Quantity, Series, Values } from '../../../lib/types'
import type { fields } from './fields'

/**
 * TWO RULES, DELIBERATELY SHOWN AGAINST EACH OTHER.
 *
 * 1. WISHNOFSKY (1958). "Caloric equivalents of gained or lost weight",
 *    Am J Clin Nutr 6(5):542-546. One pound of body weight is taken to carry
 *    3,500 kcal, so a sustained 500 kcal/day deficit is said to cost a pound a
 *    week, for ever, in a straight line. The figure comes from the energy
 *    density of adipose tissue and assumes the tissue lost is essentially all
 *    fat and — the part that actually breaks it — that the body burning the
 *    calories never gets smaller or cheaper to run.
 *
 * 2. THE ADAPTATION CORRECTION. Maintenance falls as body mass falls, so the
 *    same fixed intake represents a shrinking deficit every week. Hall and
 *    colleagues have made this point repeatedly — Hall & Chow, "Why is the 3500
 *    kcal per pound weight loss rule wrong?", Int J Obes 2011;35(11):1508, and
 *    Hall KD et al., "Quantification of the effect of energy imbalance on
 *    bodyweight", Lancet 2011;378(9793):826-837 — and the rule of thumb their
 *    modelling produces is that a permanent change of about 10 kcal/day in
 *    intake buys about one pound of eventual weight change. Read the other way
 *    round, that is the slope of maintenance against body weight:
 *
 *        d(maintenance)/d(weight) ~= 10 kcal/day per pound
 *
 * Put the two together and the model has a closed form. With intake held fixed
 * at I and maintenance M(W) = M0 + c*(W - W0):
 *
 *        dW/dt = (I - M(W)) / E,   E = 3500 kcal/lb,  c = 10 kcal/day/lb
 *
 * which is a first-order approach to a plateau:
 *
 *        W(t) = W0 + (gap / c) * (1 - exp(-t / TAU)),   TAU = E / c
 *
 * where `gap` is the daily energy gap I - M0, negative when dieting. Two
 * consequences fall straight out of the constants and are worth stating plainly
 * because they are the whole point of this page:
 *
 *   - TAU = 3500 / 10 = 350 DAYS, in pounds or kilograms alike — the unit
 *     cancels, because both rules are stated per pound. Weight change is
 *     roughly 63% complete after a year, not "linear for ever".
 *   - The eventual plateau is gap/c, which for a target of r per week works out
 *     at exactly 50 x r. Asking for 0.4 kg a week means the intake that
 *     delivers it can only ever deliver 20 kg in total, no matter how long you
 *     hold it.
 *
 * The naive line and the adaptive curve are both returned, always, as two
 * series, because the honest answer to "when will I reach my goal weight" is
 * that the two common ways of working it out disagree by weeks or months and
 * the disagreement grows the further out you look.
 */

/** Exact by definition: 1 lb = 0.45359237 kg. */
const LB_PER_KG = 2.2046226218487757

/** Wishnofsky's energy equivalent of body weight, per pound. */
const KCAL_PER_LB = 3500

/** Hall's rule of thumb, per pound of eventual weight change. */
const KCAL_PER_DAY_PER_LB = 10

/**
 * The time constant of the approach to plateau. Unit-free: 3500 kcal/lb divided
 * by 10 kcal/day/lb is 350 days, and converting both to kilograms multiplies
 * top and bottom by the same factor.
 */
const TAU_DAYS = KCAL_PER_LB / KCAL_PER_DAY_PER_LB

/**
 * The intake below which this page refuses to print a plan.
 *
 * These are the figures conventionally quoted as the lower limit for dieting
 * without medical supervision, and they bracket the NHLBI's low-calorie-diet
 * range (1,000-1,200 kcal/day for women, 1,200-1,600 for men). Below them a
 * diet becomes a very-low-calorie diet, which is a supervised clinical
 * intervention and not something a web page should hand out.
 *
 * A requested deficit that would breach the floor is NOT printed. The deficit
 * is capped at whatever leaves the floor intact, every downstream figure is
 * recomputed from the capped value, and a note says so first. Refusing outright
 * with a CalcError was the alternative; capping was chosen because the honest
 * answer to "can I lose 1 kg a week on 1,800 kcal" is not silence, it is "no,
 * and here is the fastest plan that is not reckless".
 */
const SAFE_INTAKE_FLOOR: Record<string, number> = { male: 1500, female: 1200 }

/** A chart longer than five years is a fantasy, not a projection. */
const MAX_HORIZON_DAYS = 1825
/** Short enough horizons make the sampled x values collide once rounded. */
const MIN_HORIZON_DAYS = 56
const CHART_POINTS = 41

const MS_PER_DAY = 86_400_000
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const MIN_YEAR = 1900
const MAX_YEAR = 2199

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

/**
 * ISO date to whole days since the epoch, in UTC throughout.
 *
 * Local time would make a span across a daylight-saving boundary 23 or 25 hours
 * long, which rounds a projection to the wrong day; UTC has no such boundaries.
 * `new Date(string)` is avoided because it resolves in the runtime's own zone,
 * and this runs both in Node at build time and in the browser afterwards.
 */
function parseIsoDay(raw: string, fieldId: string): number {
  const match = ISO_DATE.exec(String(raw).trim())
  if (!match) throw new CalcError('Enter a start date as YYYY-MM-DD.', fieldId)

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < MIN_YEAR || year > MAX_YEAR)
    throw new CalcError(`Enter a year between ${MIN_YEAR} and ${MAX_YEAR}.`, fieldId)

  const ms = Date.UTC(year, month - 1, day)
  const date = new Date(ms)
  // Date.UTC rolls 2026-02-30 into March rather than refusing it.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    throw new CalcError('That start date is not a real calendar date.', fieldId)

  return ms / MS_PER_DAY
}

/**
 * A date in a result is read by a person, not parsed by one, so it is spelled
 * out — from a fixed month table rather than `toLocaleDateString`, because the
 * build-time and browser renders have to produce the same string.
 */
function toLongDate(epochDay: number): string {
  const date = new Date(epochDay * MS_PER_DAY)
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

const pad = (n: number, width: number) => String(n).padStart(width, '0')

/** ISO stays in the steps, where a machine-readable form is the useful one. */
function toIso(epochDay: number): string {
  const date = new Date(epochDay * MS_PER_DAY)
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}`
}

const raw = (label: string, value: string): Quantity => ({
  label,
  value,
  format: { style: 'raw' },
})

export default function compute(v: Values<typeof fields>): CalcResult {
  const { units, sex, maintenance, currentWeight, targetWeight, weeklyRate, startDate } = v
  const imperial = units === 'imperial'

  // Finiteness first: coerceValues emits NaN for unparseable input, and a
  // magnitude test like `x < 0` is false for NaN, so it would slip through.
  if (!Number.isFinite(maintenance) || !(maintenance > 0))
    throw new CalcError('Enter your maintenance calories, greater than 0.', 'maintenance')
  if (!Number.isFinite(currentWeight) || !(currentWeight > 0))
    throw new CalcError('Enter a current weight greater than 0.', 'currentWeight')
  if (!Number.isFinite(targetWeight) || !(targetWeight > 0))
    throw new CalcError('Enter a goal weight greater than 0.', 'targetWeight')
  if (!Number.isFinite(weeklyRate) || !(weeklyRate > 0))
    throw new CalcError('Enter a target rate greater than 0.', 'weeklyRate')
  if (maintenance > 20_000)
    throw new CalcError('That maintenance figure is implausibly high.', 'maintenance')

  const floor = SAFE_INTAKE_FLOOR[sex]
  if (floor === undefined)
    throw new CalcError('Choose a sex so the right safe-intake floor is used.', 'sex')

  const startDay = parseIsoDay(startDate, 'startDate')

  const unit = imperial ? 'lb' : 'kg'
  const rateUnit = `${unit}/week`
  // Both constants are quoted per pound, so metric use scales both of them.
  const kcalPerUnit = imperial ? KCAL_PER_LB : KCAL_PER_LB * LB_PER_KG
  const kcalPerDayPerUnit = imperial ? KCAL_PER_DAY_PER_LB : KCAL_PER_DAY_PER_LB * LB_PER_KG

  const change = targetWeight - currentWeight
  if (Math.abs(change) < 1e-9)
    throw new CalcError(
      'Your goal weight matches your current weight, so there is nothing to project.',
      'targetWeight',
    )
  const losing = change < 0

  // The deficit the requested rate implies, before the safety floor is applied.
  const requestedDeficit = (weeklyRate * kcalPerUnit) / 7

  let targetIntake: number
  let capped = false
  if (losing) {
    const largestSafeDeficit = maintenance - floor
    if (!(largestSafeDeficit > 0))
      throw new CalcError(
        `Your maintenance figure is already at or below the ${floor} kcal considered safe without supervision, so there is no deficit to take.`,
        'maintenance',
      )
    capped = requestedDeficit > largestSafeDeficit
    targetIntake = maintenance - Math.min(requestedDeficit, largestSafeDeficit)
  } else {
    targetIntake = maintenance + requestedDeficit
  }

  // Signed, negative while dieting. Everything below is derived from this one
  // number so the plan, the projections and the parts cannot disagree.
  const energyGap = targetIntake - maintenance
  const deficit = maintenance - targetIntake // positive when losing
  const plannedWeeklyRate = (Math.abs(energyGap) * 7) / kcalPerUnit

  // ── The 3,500 rule, taken at its word ───────────────────────────────────
  const naiveDays = (Math.abs(change) * kcalPerUnit) / Math.abs(energyGap)
  const naiveWeightAt = (t: number) => currentWeight + (energyGap / kcalPerUnit) * t

  // ── The same plan with maintenance allowed to move ──────────────────────
  const asymptoticChange = energyGap / kcalPerDayPerUnit // signed, same sign as change
  const plateauWeight = currentWeight + asymptoticChange
  const fractionOfPlateau = change / asymptoticChange // positive by construction
  const reached = fractionOfPlateau < 1
  const adaptiveDays = reached ? -TAU_DAYS * Math.log(1 - fractionOfPlateau) : Number.POSITIVE_INFINITY
  const adaptiveWeightAt = (t: number) =>
    currentWeight + asymptoticChange * (1 - Math.exp(-t / TAU_DAYS))

  // The concrete size of the disagreement: what the adaptive model says you
  // actually weigh on the day the 3,500 rule promised the goal.
  const weightOnNaiveDate = adaptiveWeightAt(naiveDays)
  const shortfall = Math.abs(weightOnNaiveDate - targetWeight)
  const adaptiveAverageRate = reached ? (Math.abs(change) * 7) / adaptiveDays : 0

  // ── Chart ───────────────────────────────────────────────────────────────
  // Long enough to show both curves flatten out at the goal, or the adaptive
  // one flatten short of it. Never varies in shape: two series, fixed point
  // count, drawable at the defaults and everywhere else.
  const horizon = Math.round(
    Math.min(
      MAX_HORIZON_DAYS,
      Math.max(MIN_HORIZON_DAYS, reached ? adaptiveDays * 1.25 : naiveDays * 3),
    ),
  )
  // Both lines stop at the goal rather than running through it, so the visible
  // gap is the thing that matters — how much later the adaptive curve arrives.
  const clampToGoal = (w: number) => (losing ? Math.max(targetWeight, w) : Math.min(targetWeight, w))
  const naivePoints: Array<readonly [number, number]> = []
  const adaptivePoints: Array<readonly [number, number]> = []
  for (let i = 0; i < CHART_POINTS; i++) {
    // horizon >= 56 guarantees a gap of at least 1.4 days between samples, so
    // the rounded x values are strictly increasing as the chart requires.
    const t = Math.round((i * horizon) / (CHART_POINTS - 1))
    naivePoints.push([t, clampToGoal(naiveWeightAt(t))])
    adaptivePoints.push([t, clampToGoal(adaptiveWeightAt(t))])
  }
  const weightFormat = { style: 'decimal', decimals: 1, unit } as const
  const series: Series[] = [
    { label: '3,500 kcal rule', points: naivePoints, format: weightFormat },
    { label: 'With adaptation', points: adaptivePoints, format: weightFormat },
  ]

  // ── Output ──────────────────────────────────────────────────────────────
  const kcal = { style: 'decimal', decimals: 0, unit: 'kcal/day' } as const
  const rateFormat = { style: 'decimal', decimals: 2, unit: rateUnit } as const
  const days = { style: 'duration', from: 'days' } as const

  const naiveGoalDay = startDay + Math.ceil(naiveDays)
  const adaptiveGoalDay = reached ? startDay + Math.ceil(adaptiveDays) : undefined

  // Both decompositions are two components summing exactly to their stated
  // whole, with the second derived by subtraction so the sum is exact by
  // construction rather than by luck.
  const parts: Part[] = losing
    ? [
        { label: 'Daily calorie target', value: targetIntake, format: kcal },
        { label: 'Daily deficit', value: maintenance - targetIntake, format: kcal },
      ]
    : [
        { label: 'Maintenance calories', value: maintenance, format: kcal },
        { label: 'Daily surplus', value: targetIntake - maintenance, format: kcal },
      ]
  const partsTotal: Quantity = losing
    ? { label: 'Maintenance calories', value: maintenance, format: kcal }
    : { label: 'Daily calorie target', value: targetIntake, format: kcal }

  const notes: string[] = []
  if (capped) {
    notes.push(
      `A ${Math.round(requestedDeficit)} kcal deficit would put you on ${Math.round(maintenance - requestedDeficit)} kcal a day, below the ${floor} kcal generally considered the minimum without medical supervision. That plan is not shown. Every figure here uses the largest deficit that stays above the floor, which is ${Math.round(deficit)} kcal a day and ${plannedWeeklyRate.toFixed(2)} ${rateUnit}.`,
    )
  }
  notes.push(
    'The 3,500 kcal per pound figure is Wishnofsky’s 1958 approximation. It assumes the tissue lost is pure fat and that your metabolism never adapts, so it projects a straight line and systematically overpredicts loss the longer it runs.',
  )
  notes.push(
    `The adaptive projection lets maintenance fall as you do, at roughly 10 kcal a day per pound of body weight — the rule of thumb from Hall and colleagues. That gives a 350-day time constant and a plateau, here ${plateauWeight.toFixed(1)} ${unit}, beyond which this intake cannot take you however long you hold it.`,
  )
  if (reached) {
    notes.push(
      `The two methods disagree by ${Math.round(Math.abs(adaptiveDays - naiveDays))} days on this plan, and the gap widens with distance: on the date the 3,500 rule promises your goal, the adaptive model still has you ${shortfall.toFixed(1)} ${unit} away.`,
    )
  } else {
    notes.push(
      `This intake never reaches your goal. The 3,500 rule says it does, because it assumes maintenance never moves, but the adaptive model plateaus at ${plateauWeight.toFixed(1)} ${unit}. Reaching the goal needs a larger deficit, more activity, or a recalculation partway.`,
    )
  }
  notes.push(
    'Neither line is a promise. Both assume perfect adherence and neither models changes in body composition, water weight, or the drop in unconscious daily movement that usually accompanies a deficit. Recalculate every few kilograms.',
  )

  return {
    primary: { label: 'Daily calorie target', value: targetIntake, format: kcal },
    // The deficit as a share of maintenance is what the scale bands read, so a
    // surplus reads negative and lands in the first band.
    scaleValue: (deficit / maintenance) * 100,
    stats: [
      {
        label: losing ? 'Daily deficit' : 'Daily surplus',
        value: Math.abs(deficit),
        format: kcal,
      },
      {
        label: losing ? 'Weight to lose' : 'Weight to gain',
        value: Math.abs(change),
        format: weightFormat,
      },
      { label: 'Planned weekly rate', value: plannedWeeklyRate, format: rateFormat },
      raw('Goal date (3,500 rule)', toLongDate(naiveGoalDay)),
      raw(
        'Goal date (with adaptation)',
        adaptiveGoalDay === undefined ? 'Not reached at this intake' : toLongDate(adaptiveGoalDay),
      ),
      { label: 'Time to goal (3,500 rule)', value: naiveDays, format: days },
      { label: 'Time to goal (with adaptation)', value: adaptiveDays, format: days },
      {
        label: 'Average weekly rate to that date',
        value: adaptiveAverageRate,
        format: rateFormat,
      },
      {
        label: 'Still to go on the 3,500-rule date',
        value: shortfall,
        format: weightFormat,
      },
      { label: 'Plateau at this intake', value: plateauWeight, format: weightFormat },
    ],
    steps: [
      { label: 'Maintenance calories', value: maintenance, format: kcal },
      { label: 'Target rate of change', value: weeklyRate, format: rateFormat },
      {
        label: 'Energy per unit of body weight',
        value: kcalPerUnit,
        format: { style: 'decimal', decimals: 0, unit: `kcal/${unit}` },
      },
      { rule: true },
      { label: 'Requested gap = rate x energy / 7', value: requestedDeficit, format: kcal },
      { label: 'Safe intake floor', value: floor, format: kcal },
      { label: losing ? 'Deficit applied' : 'Surplus applied', value: Math.abs(energyGap), format: kcal },
      { label: 'Daily calorie target = maintenance - deficit', value: targetIntake, format: kcal },
      { rule: true },
      { label: losing ? 'Weight to lose' : 'Weight to gain', value: Math.abs(change), format: weightFormat },
      { label: 'Days (3,500 rule) = change x energy / deficit', value: naiveDays, format: { style: 'decimal', decimals: 1, unit: 'days' } },
      raw('Goal date (3,500 rule)', toIso(naiveGoalDay)),
      { rule: true },
      {
        label: 'Maintenance moves by',
        value: kcalPerDayPerUnit,
        format: { style: 'decimal', decimals: 1, unit: `kcal/day per ${unit}` },
      },
      { label: 'Plateau = current + gap / that slope', value: plateauWeight, format: weightFormat },
      { label: 'Time constant = 3,500 / 10', value: TAU_DAYS, format: { style: 'decimal', decimals: 0, unit: 'days' } },
      { label: 'Share of the plateau your goal needs', value: fractionOfPlateau * 100, format: { style: 'percent', decimals: 1 } },
      { label: 'Days (adaptive) = -350 x ln(1 - that share)', value: adaptiveDays, format: { style: 'decimal', decimals: 1, unit: 'days' } },
      raw(
        'Goal date (with adaptation)',
        adaptiveGoalDay === undefined ? 'Not reached at this intake' : toIso(adaptiveGoalDay),
      ),
    ],
    parts,
    partsTotal,
    series,
    notes,
  }
}

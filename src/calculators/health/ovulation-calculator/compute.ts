import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, StepRule, Values } from '../../../lib/types'
import type { fields } from './fields'

const MS_PER_DAY = 86_400_000
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * THE CALENDAR (or rhythm) METHOD, counted BACKWARDS.
 *
 * The menstrual cycle has two halves and they are not equally variable. The
 * FOLLICULAR phase — cycle day 1 up to and including ovulation — is where almost
 * all of the between-person and between-month variation sits. The LUTEAL phase
 * that follows, from the corpus luteum forming to the next period, is relatively
 * fixed at about 14 days, because the corpus luteum has a roughly fixed lifespan
 * unless a pregnancy rescues it.
 *
 * That asymmetry is the whole reason a date can be estimated at all, and it is
 * why the count runs backwards from the NEXT period rather than forwards from the
 * last one. Adding 14 to the last period would put ovulation on day 14 of every
 * cycle regardless of length, which is exactly the error the method is supposed to
 * avoid: a 35-day cycle does not ovulate on day 14, it ovulates around day 21,
 * because it is the follicular phase that grew by seven days and not the luteal
 * one.
 *
 *   ovulation cycle day = cycleLength - LUTEAL_DAYS
 *
 * 28 - 14 = day 14, which is where the familiar textbook figure comes from; 35 -
 * 14 = day 21; 21 - 14 = day 7. Written this way the two phases sum to the cycle
 * length exactly — follicular (cycleLength - 14 days, ovulation included) plus
 * luteal (14 days, the days after ovulation up to and including the day before
 * the next period) — which is what the two `parts` below report.
 *
 * Note the off-by-one that this convention resolves and that loosely worded
 * sources leave open: "ovulation is 14 days before the next period" is true in the
 * sense that 14 days of the cycle REMAIN after ovulation day, so the next period
 * begins 15 calendar days after ovulation. The `Days from ovulation to that
 * period` step states that number outright rather than leaving it to be inferred.
 */
const LUTEAL_DAYS = 14

/**
 * THE FERTILE WINDOW: the five days before ovulation plus the day of ovulation
 * itself — six days, ending on the day of ovulation.
 *
 * Source: Wilcox AJ, Weinberg CR, Baird DD, "Timing of sexual intercourse in
 * relation to ovulation", New England Journal of Medicine 1995;333(23):1517-21.
 * In 625 cycles from 221 women attempting to conceive, every pregnancy was traced
 * to intercourse inside a six-day interval ending on the estimated day of
 * ovulation; none was traced to intercourse on the day after. The asymmetry is
 * physiological rather than statistical: sperm survive in the reproductive tract
 * for up to about five days, while the egg is fertilisable for roughly 24 hours.
 */
const FERTILE_DAYS_BEFORE = 5
const FERTILE_WINDOW_DAYS = FERTILE_DAYS_BEFORE + 1 // 6

/** How many cycles the projection lists. Fixed, so the step count never varies. */
const CYCLES_PROJECTED = 3

/**
 * ACOG's typical adult range for a menstrual cycle is 21-35 days. Outside it a
 * calendar estimate is less useful, and the length itself is worth mentioning to
 * a clinician; these two numbers are also the scale bands in `index.ts`.
 */
const TYPICAL_MIN = 21
const TYPICAL_MAX = 35

/** Below this the fertile window would open before the period it is counted from. */
const MIN_CYCLE = 20
const MAX_CYCLE = 45

/** Years outside this are typos, not dates. */
const MIN_YEAR = 1900
const MAX_YEAR = 2199

/**
 * Parses an ISO date into a whole number of days since the epoch.
 *
 * Everything here is UTC on purpose, exactly as in `date-difference-calculator`
 * and `due-date-calculator`. A local-time subtraction across a daylight-saving
 * boundary is 23 or 25 hours long, which rounds a span to the wrong number of
 * days — and one day is the difference between the fertile window being open
 * today and having closed yesterday. UTC has no such boundaries. `new Date(str)`
 * is avoided for the same reason: it resolves in the runtime's own zone, so the
 * build-time Node run and the browser run would not have to agree.
 */
function parseIsoDay(raw: string, fieldId: string): number {
  const match = ISO_DATE.exec(String(raw).trim())
  if (!match) throw new CalcError('Enter a date as YYYY-MM-DD.', fieldId)

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  if (year < MIN_YEAR || year > MAX_YEAR)
    throw new CalcError(`Enter a year between ${MIN_YEAR} and ${MAX_YEAR}.`, fieldId)

  const ms = Date.UTC(year, month - 1, day)
  if (!Number.isFinite(ms)) throw new CalcError('That date is not a real calendar date.', fieldId)

  // Date.UTC rolls 2026-02-30 forward into March rather than refusing it, so read
  // the fields back and insist they survived the round trip.
  const date = new Date(ms)
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day)
    throw new CalcError('That date is not a real calendar date.', fieldId)

  return ms / MS_PER_DAY
}

const pad = (n: number, width: number): string => String(n).padStart(width, '0')

/** The inverse of `parseIsoDay`, built by hand so no locale can reach it. */
function toIso(epochDay: number): string {
  const date = new Date(epochDay * MS_PER_DAY)
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}`
}

/**
 * A date in a RESULT is read by a person, not parsed by one, so the headline is
 * written long. Spelled out from a fixed month table rather than
 * `toLocaleDateString`: compute runs at build time in Node and again in the
 * browser, and the two must produce the same string. `format.ts` pins its locale
 * for that reason, and a table needs no locale at all. ISO stays in the steps,
 * where an unambiguous machine-readable form is the useful one.
 */
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

function toLongDate(epochDay: number): string {
  const date = new Date(epochDay * MS_PER_DAY)
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

const isoStep = (label: string, epochDay: number): Quantity => ({
  label,
  value: toIso(epochDay),
  format: { style: 'raw' },
})

const longStat = (label: string, epochDay: number): Quantity => ({
  label,
  value: toLongDate(epochDay),
  format: { style: 'raw' },
})

const days = (label: string, value: number): Quantity => ({
  label,
  value,
  format: { style: 'decimal', decimals: 0, unit: 'days' },
})

export default function compute(v: Values<typeof fields>): CalcResult {
  // `cycleLength` is the only number; the date arrives as a string, and the
  // derived Values type makes forgetting that a compile error.
  const { cycleLength } = v

  // Finiteness FIRST: coerceValues emits NaN for unparseable input, and a
  // magnitude test like `cycleLength < 20` is false for NaN, so a bare range
  // check would let it straight through into the date arithmetic.
  if (!Number.isFinite(cycleLength))
    throw new CalcError('Enter your average cycle length in days.', 'cycleLength')
  if (cycleLength < MIN_CYCLE || cycleLength > MAX_CYCLE)
    throw new CalcError(
      `Cycle length must be between ${MIN_CYCLE} and ${MAX_CYCLE} days. Outside that range a calendar estimate is not meaningful; a clinician can look at the cycle itself.`,
      'cycleLength',
    )

  const lmpDay = parseIsoDay(v.lmpDate, 'lmpDate')

  // Whole days only: a 30.8-day cycle is a 31-day cycle here, because a cycle
  // day is a calendar day rather than a moment.
  const cycle = Math.round(cycleLength)

  const follicularDays = cycle - LUTEAL_DAYS
  const ovulationCycleDay = follicularDays // cycle day 1 is the LMP itself
  // Cycle day n is `lmpDay + n - 1`, so the -1 converts a cycle day to an offset.
  const ovulationDay = lmpDay + ovulationCycleDay - 1
  const fertileOpenDay = ovulationDay - FERTILE_DAYS_BEFORE
  const nextPeriodDay = lmpDay + cycle

  const steps: Array<Quantity | StepRule> = [
    isoStep('First day of last period (cycle day 1)', lmpDay),
    days('Cycle length', cycle),
    days('Luteal phase, assumed fixed', LUTEAL_DAYS),
    days(`Follicular phase (${cycle} − ${LUTEAL_DAYS})`, follicularDays),
    {
      label: 'Cycle day of ovulation',
      value: ovulationCycleDay,
      format: { style: 'decimal', decimals: 0 },
    },
  ]

  // A fixed CYCLES_PROJECTED groups of four, so the step count never varies with
  // input — only the dates inside them move.
  for (let i = 0; i < CYCLES_PROJECTED; i += 1) {
    const shift = i * cycle
    steps.push({ rule: true })
    steps.push(isoStep(`Cycle ${i + 1} — period begins`, lmpDay + shift))
    steps.push(isoStep(`Cycle ${i + 1} — fertile window opens`, fertileOpenDay + shift))
    steps.push(isoStep(`Cycle ${i + 1} — estimated ovulation (window closes)`, ovulationDay + shift))
    steps.push(isoStep(`Cycle ${i + 1} — next period expected`, nextPeriodDay + shift))
  }
  steps.push({ rule: true })
  steps.push(days('Fertile window length', FERTILE_WINDOW_DAYS))
  steps.push(days('Days from ovulation to that period', nextPeriodDay - ovulationDay))

  const notes: string[] = [
    `Ovulation is counted BACK from the next expected period, not forward from the last one. The luteal phase — ovulation to the next period — is relatively fixed at about ${LUTEAL_DAYS} days, while the follicular phase before it carries nearly all of the variation. That is why cycle length changes the answer: a ${cycle}-day cycle puts ovulation around cycle day ${ovulationCycleDay}, not day 14.`,
    'The fertile window is the five days before ovulation plus the day of ovulation itself — six days, ending on the day of ovulation. Sperm survive in the reproductive tract for up to about five days; the egg is fertilisable for roughly 24 hours. (Wilcox, Weinberg and Baird, New England Journal of Medicine 1995;333:1517–21.)',
    'This is a calendar estimate built from population averages. Cycle length varies between people and from one month to the next, the luteal phase is only approximately fixed, and ovulation can fall several days from where a calendar puts it. Basal body temperature, cervical mucus and urinary LH tests measure your own cycle rather than assuming an average one.',
    'This is not a contraceptive method. Because ovulation moves and sperm survive for days, days shown here as outside the fertile window can still result in pregnancy. If you are trying to avoid pregnancy, use a method intended for that. Fertility-awareness-based methods exist, but they depend on daily observation and instruction, not on a date read off a calendar.',
  ]
  if (cycle < TYPICAL_MIN || cycle > TYPICAL_MAX)
    notes.push(
      `A ${cycle}-day cycle sits outside the typical ${TYPICAL_MIN}–${TYPICAL_MAX} day range. Cycles consistently outside it are worth raising with a clinician, and a calendar estimate is less reliable for them.`,
    )

  return {
    primary: {
      label: 'Estimated ovulation date',
      value: toLongDate(ovulationDay),
      format: { style: 'raw' },
    },
    // The meter tracks cycle length against the typical range, which is what
    // decides whether this estimate means much at all.
    scaleValue: cycle,
    stats: [
      longStat('Fertile window opens', fertileOpenDay),
      longStat('Fertile window closes', ovulationDay),
      {
        label: 'Cycle day of ovulation',
        value: ovulationCycleDay,
        format: { style: 'decimal', decimals: 0 },
      },
      longStat('Next period expected', nextPeriodDay),
      days('Follicular phase', follicularDays),
      days('Luteal phase', LUTEAL_DAYS),
    ],
    steps,
    // Two slices of the one cycle, derived so they sum to it exactly by
    // construction rather than by luck, and neither can go negative: the field
    // floor of 20 days keeps the follicular part at 6 or more. The count is
    // fixed at two, so the donut is drawable at the defaults.
    parts: [
      {
        label: 'Follicular phase (to ovulation)',
        value: follicularDays,
        format: { style: 'decimal', decimals: 0, unit: 'days' },
      },
      {
        label: 'Luteal phase (after ovulation)',
        value: cycle - follicularDays,
        format: { style: 'decimal', decimals: 0, unit: 'days' },
      },
    ],
    partsTotal: {
      label: 'One full cycle',
      value: cycle,
      format: { style: 'decimal', decimals: 0, unit: 'days' },
    },
    notes,
  }
}

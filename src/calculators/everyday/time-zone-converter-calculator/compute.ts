import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, Values } from '../../../lib/types'
import { ZONES, cityOf } from './fields'
import type { fields } from './fields'

/*
 * TIME ZONE CONVERSION, WITH BUILD-TIME AND BROWSER AGREEMENT AS THE FIRST
 * DESIGN CONSTRAINT.
 *
 * This function runs in Node when the page is built and again in the browser
 * when the island rehydrates, and both runs must produce the same strings or the
 * server-rendered answer visibly flips. Everything below is written to that end:
 *
 *   - No clock is read. `Date.now()`, `new Date()` with no argument, and the
 *     runtime's own zone appear nowhere. Every instant is an explicit number of
 *     milliseconds derived from the inputs.
 *   - No locale-dependent formatting reaches the output. Dates are spelled out
 *     from the fixed tables at the bottom of this file, never through
 *     `toLocaleDateString` / `toLocaleTimeString`, whose wording, comma
 *     placement and even digits vary by ICU build.
 *   - `Intl` is used for exactly one thing: asking the engine what a zone's UTC
 *     offset was at a given instant. That is the one fact this calculator cannot
 *     derive itself, and a hardcoded offset table could not express DST at all.
 *
 * The residual risk is that Node's bundled tzdata and the browser's differ. It
 * is real and it is not zero, so `fields.ts` offers a curated list of zones
 * whose rules have been stable for years rather than the full IANA set, and the
 * notes below tell the reader the caveat rather than hiding it.
 */

const MS_PER_MINUTE = 60_000
const MS_PER_HOUR = 3_600_000
const MS_PER_DAY = 86_400_000

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Before 1970 many zones sit on Local Mean Time, whose offset has a seconds
 * component (Kolkata was UTC+5:53:20), and the historical record is thinner and
 * more likely to differ between tzdata releases. Beyond 2199 a year is a typo.
 */
const MIN_YEAR = 1970
const MAX_YEAR = 2199

/**
 * How far either side of the wall-clock reading to probe for the offsets that
 * bracket it. It has to clear any transition that could be near the instant in
 * question, and the instant itself can be up to 14 hours away from the numeric
 * wall-clock value. Two days clears both with room to spare, and no zone offered
 * here has two transitions within four days of each other.
 */
const PROBE_MS = 2 * MS_PER_DAY

const ZONE_IDS = new Set<string>(ZONES.map((z) => z.value))

/**
 * `Intl.DateTimeFormat` is expensive to construct and cheap to reuse, and this
 * function is called four to six times per conversion — and the island
 * recomputes on every keystroke.
 */
const offsetFormatters = new Map<string, Intl.DateTimeFormat>()

function offsetFormatter(zone: string): Intl.DateTimeFormat {
  let formatter = offsetFormatters.get(zone)
  if (!formatter) {
    // The locale is pinned for the same reason `lib/format.ts` pins its own: the
    // runtime's default locale is not the same in Node and in a browser, and
    // `timeZoneName` wording follows the locale.
    formatter = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
    offsetFormatters.set(zone, formatter)
  }
  return formatter
}

/** "GMT", "GMT+05:30", "GMT-08:00" — and the unpadded forms, defensively. */
const LONG_OFFSET = /^(?:GMT|UTC)(?:([+-])(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/

/**
 * The UTC offset of `zone` at the instant `instantMs`, in milliseconds.
 *
 * Derived by formatting a known instant with `timeZoneName: 'longOffset'` and
 * reading the offset back, NOT from a table of offsets. A table cannot express
 * daylight saving — it would have to encode "second Sunday in March, but the
 * last Sunday in March in Europe, and the first Sunday in October going the
 * other way in Australia, and none of that before 2007 in the US" — so it would
 * be wrong for roughly half the year in half the zones offered.
 *
 * @internal exported for the tests, which cross-check it against an entirely
 * different derivation: formatting the same instant into the zone's own
 * year/month/day/hour/minute and subtracting.
 */
export function zoneOffsetMs(zone: string, instantMs: number): number {
  const parts = offsetFormatter(zone).formatToParts(new Date(instantMs))
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
  const match = LONG_OFFSET.exec(name)
  if (!match)
    throw new CalcError(
      `This browser could not report the UTC offset for ${zone}. Try a different zone.`,
      'fromZone',
    )
  if (!match[1]) return 0

  const seconds = Number(match[4] ?? '0')
  if (seconds !== 0)
    throw new CalcError(
      `${zone} was not on a whole-minute UTC offset on that date.`,
      'fromZone',
    )

  const magnitude = (Number(match[2]) * 60 + Number(match[3])) * MS_PER_MINUTE
  return match[1] === '-' ? -magnitude : magnitude
}

/** What happened to the wall-clock time that was asked for. */
export type Resolution = 'exact' | 'gap' | 'ambiguous'

export interface Instant {
  /** Milliseconds since the epoch — the actual moment, zone-free. */
  ms: number
  /** The zone's offset at that moment, in milliseconds. */
  offsetMs: number
  how: Resolution
  /**
   * For `'gap'`, the length of the jump forward, in ms. For `'ambiguous'`, the
   * gap between the two occurrences. Zero for `'exact'`.
   */
  shiftMs: number
}

/**
 * Turns a wall-clock reading in a zone into the instant it names.
 *
 * `wallMs` is the reading encoded as if it were UTC — `Date.UTC(y, m, d, h, mi)`
 * — which makes it a plain number to do arithmetic on rather than a Date whose
 * meaning depends on where it is parsed.
 *
 * THE TWO CASES EVERY NAIVE CONVERTER GETS WRONG, and what this decides:
 *
 * GAP (spring forward). On 8 March 2026 New York goes 01:59:59 EST → 03:00:00
 * EDT, so 02:30 never happens. There is no instant to return. Rather than
 * refusing an input a person can legitimately type off a calendar, the reading
 * is SHIFTED FORWARD by the length of the gap: 02:30 becomes 03:30 EDT. That is
 * what `java.time`'s and Temporal's "compatible" resolution do, what a phone
 * alarm does, and what the clock on the wall does — the half hour simply arrives
 * an hour late. The result says so in a note; it does not pretend nothing
 * happened.
 *
 * AMBIGUOUS (fall back). On 1 November 2026 New York goes 01:59:59 EDT →
 * 01:00:00 EST, so 01:30 happens twice, an hour apart. The FIRST occurrence is
 * returned — the one still on daylight time — again matching "compatible"
 * resolution and matching what a person means when they say "half past one" while
 * it is happening for the first time. The result flags the other one.
 *
 * The mechanism is the same for both: probe the offset two days either side of
 * the reading, build the candidate instant each offset implies, and keep only
 * the candidates that actually read back as the requested wall time.
 */
export function resolveInstant(zone: string, wallMs: number): Instant {
  const offsetBefore = zoneOffsetMs(zone, wallMs - PROBE_MS)
  const offsetAfter = zoneOffsetMs(zone, wallMs + PROBE_MS)

  // A candidate is real only if formatting it back in this zone reproduces the
  // wall time that was asked for. `offset(i) === wallMs - i` says exactly that,
  // with no second round of string formatting.
  const candidates: number[] = []
  for (const offset of offsetBefore === offsetAfter ? [offsetBefore] : [offsetBefore, offsetAfter]) {
    const instant = wallMs - offset
    if (zoneOffsetMs(zone, instant) === offset) candidates.push(instant)
  }

  if (candidates.length === 0) {
    // Nothing reads back: the reading fell in a spring-forward gap. Using the
    // pre-transition offset lands after the transition, which is the forward
    // shift described above.
    const ms = wallMs - offsetBefore
    return { ms, offsetMs: zoneOffsetMs(zone, ms), how: 'gap', shiftMs: offsetAfter - offsetBefore }
  }

  if (candidates.length === 2 && candidates[0] !== candidates[1]) {
    const earlier = Math.min(candidates[0]!, candidates[1]!)
    return {
      ms: earlier,
      offsetMs: wallMs - earlier,
      how: 'ambiguous',
      shiftMs: Math.abs(candidates[0]! - candidates[1]!),
    }
  }

  const ms = candidates[0]!
  return { ms, offsetMs: wallMs - ms, how: 'exact', shiftMs: 0 }
}

// ── Display, built by hand so no locale can reach it ──────────────────────

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const

const pad = (n: number, width = 2): string => String(n).padStart(width, '0')

/**
 * Day of the week straight from the day number: 1970-01-01 was a Thursday, so
 * epoch day 0 is 4. The `+ 11` is `+ 7 + 4`, keeping the result positive for
 * dates before 1970 where JavaScript's `%` would go negative. Same derivation as
 * `business-days-calculator`, deliberately.
 */
const dayOfWeek = (epochDay: number): number => ((epochDay % 7) + 11) % 7

/** The civil fields of a wall-clock reading encoded as if it were UTC. */
interface Wall {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  /** Whole days since the epoch — what the day-offset comparison uses. */
  epochDay: number
}

function wallOf(wallMs: number): Wall {
  const d = new Date(wallMs)
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    epochDay: Math.floor(wallMs / MS_PER_DAY),
  }
}

const isoDate = (w: Wall): string => `${pad(w.year, 4)}-${pad(w.month + 1)}-${pad(w.day)}`
const isoTime = (w: Wall): string => `${pad(w.hour)}:${pad(w.minute)}`

/**
 * A date in a result is read by a person, not parsed by one, so it is spelled
 * out — from the tables above rather than `toLocaleDateString`, because compute
 * runs at build time in Node and again in the browser and the two must produce
 * an identical string. ISO stays in the steps, where the machine-readable form
 * is the useful one.
 */
const longDate = (w: Wall): string =>
  `${WEEKDAYS[dayOfWeek(w.epochDay)]}, ${w.day} ${MONTHS[w.month]} ${w.year}`

/** 15:30 → "3:30 pm". Midnight is 12:00 am and noon is 12:00 pm. */
function clock12(w: Wall): string {
  const suffix = w.hour < 12 ? 'am' : 'pm'
  const hour = w.hour % 12 === 0 ? 12 : w.hour % 12
  return `${hour}:${pad(w.minute)} ${suffix}`
}

/** 19_800_000 → "+05:30". The sign is always written, including for UTC itself. */
function offsetLabel(offsetMs: number): string {
  const sign = offsetMs < 0 ? '-' : '+'
  const total = Math.abs(offsetMs) / MS_PER_MINUTE
  return `${sign}${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

/** 19_800_000 → "5 hours 30 minutes". Magnitude only; the caller adds direction. */
function spellDuration(absMs: number): string {
  const totalMinutes = Math.round(absMs / MS_PER_MINUTE)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const h = `${hours} hour${hours === 1 ? '' : 's'}`
  const m = `${minutes} minute${minutes === 1 ? '' : 's'}`
  if (hours === 0) return m
  if (minutes === 0) return h
  return `${h} ${m}`
}

const raw = (label: string, value: string): Quantity => ({ label, value, format: { style: 'raw' } })

// ── Input parsing ─────────────────────────────────────────────────────────

function parseZone(value: string, fieldId: 'fromZone' | 'toZone'): string {
  const zone = String(value).trim()
  if (!ZONE_IDS.has(zone))
    throw new CalcError('Choose one of the offered time zones.', fieldId)
  return zone
}

/** ISO `YYYY-MM-DD` → the y/m/d it names, rejecting anything that is not a real date. */
function parseDate(value: string): { year: number; month: number; day: number } {
  const match = ISO_DATE.exec(String(value).trim())
  if (!match) throw new CalcError('Enter a date as YYYY-MM-DD.', 'date')

  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  if (year < MIN_YEAR || year > MAX_YEAR)
    throw new CalcError(`Enter a year between ${MIN_YEAR} and ${MAX_YEAR}.`, 'date')

  // Date.UTC rolls 2026-02-30 forward into March rather than refusing it, so
  // read the fields back and insist they survived the round trip.
  const probe = new Date(Date.UTC(year, month, day))
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month || probe.getUTCDate() !== day)
    throw new CalcError('That date is not a real calendar date.', 'date')

  return { year, month, day }
}

/**
 * A whole number inside a range. `!Number.isFinite` comes FIRST on purpose:
 * `coerceValues` deliberately produces `NaN` for unparseable input, and a
 * magnitude test like `value < 0` is false for `NaN`, so a bare range check
 * would let it straight through and the answer would be "NaN:NaN".
 */
function parseWhole(value: number, min: number, max: number, fieldId: string, noun: string): number {
  if (!Number.isFinite(value)) throw new CalcError(`Enter ${noun} as a whole number.`, fieldId)
  if (!Number.isInteger(value))
    throw new CalcError(`Enter ${noun} as a whole number — a clock has no fractions.`, fieldId)
  if (value < min || value > max)
    throw new CalcError(`Enter ${noun} between ${min} and ${max}.`, fieldId)
  return value
}

// ── compute ───────────────────────────────────────────────────────────────

export default function compute(v: Values<typeof fields>): CalcResult {
  // Finiteness before magnitude, for both numbers, before anything else runs.
  const hour = parseWhole(v.hour, 0, 23, 'hour', 'an hour')
  const minute = parseWhole(v.minute, 0, 59, 'minute', 'a minute value')
  const { year, month, day } = parseDate(v.date)
  const fromZone = parseZone(v.fromZone, 'fromZone')
  const toZone = parseZone(v.toZone, 'toZone')

  const fromCity = cityOf(fromZone)
  const toCity = cityOf(toZone)

  // The reading as typed, encoded as if it were UTC. This is a coordinate, not
  // an instant: it has no meaning until a zone is attached to it.
  const sourceWallMs = Date.UTC(year, month, day, hour, minute)
  const instant = resolveInstant(fromZone, sourceWallMs)

  // What the clock in the source zone actually reads for that instant. Equal to
  // what was typed unless the reading fell in a spring-forward gap, in which
  // case it is the shifted-forward time — and saying so is the honest thing.
  const sourceWall = wallOf(instant.ms + instant.offsetMs)

  const targetOffsetMs = zoneOffsetMs(toZone, instant.ms)
  const targetWall = wallOf(instant.ms + targetOffsetMs)
  const utcWall = wallOf(instant.ms)

  // The offset difference IS the time difference, at this instant. It is not a
  // property of the pair of zones: New York and London are 5 hours apart most of
  // the year but 4 hours apart for the two weeks in March when the US has
  // sprung forward and Europe has not.
  const differenceMs = targetOffsetMs - instant.offsetMs

  /*
   * THE DAY OFFSET — the thing people actually get wrong. Comparing whole days
   * since the epoch, not hours, because a 90-minute difference can still cross
   * midnight and a 23-hour one need not.
   *
   * It runs -2 to +2, not -1 to +1, and the extra step is not a rounding
   * artefact. The widest gap between two offered zones is 25 hours — Kiritimati
   * at UTC+14 and Pago Pago at UTC-11 — which is more than a whole day, so
   * midnight in Kiritimati is 23:00 TWO calendar days earlier in Pago Pago.
   * Assuming a day offset can only be -1, 0 or +1 is a real bug that survives
   * every test that stays inside the Atlantic.
   */
  const dayOffset = targetWall.epochDay - sourceWall.epochDay
  const dayLabel =
    dayOffset === 0
      ? 'The same day'
      : dayOffset === 1
        ? 'The next day — tomorrow there'
        : dayOffset === -1
          ? 'The day before — yesterday there'
          : dayOffset > 0
            ? `${dayOffset} days later there`
            : `${-dayOffset} days earlier there`

  const direction =
    differenceMs === 0
      ? `${toCity} is on the same clock as ${fromCity}`
      : `${toCity} is ${spellDuration(Math.abs(differenceMs))} ${differenceMs > 0 ? 'ahead of' : 'behind'} ${fromCity}`

  const steps: Array<Quantity | { rule: true }> = [
    raw(`Time entered, ${fromCity}`, `${isoDate(sourceWall)} ${isoTime(sourceWall)}`),
    raw(`${fromCity} UTC offset then`, offsetLabel(instant.offsetMs)),
    { rule: true },
    raw('The same moment in UTC', `${isoDate(utcWall)} ${isoTime(utcWall)}Z`),
    { rule: true },
    raw(`${toCity} UTC offset then`, offsetLabel(targetOffsetMs)),
    raw(
      'Offset difference',
      `UTC${offsetLabel(targetOffsetMs)} minus UTC${offsetLabel(instant.offsetMs)} = ${
        differenceMs === 0
          ? 'nothing'
          : `${differenceMs < 0 ? '-' : '+'}${spellDuration(Math.abs(differenceMs))}`
      }`,
    ),
    raw(`Time there, ${toCity}`, `${isoDate(targetWall)} ${isoTime(targetWall)}`),
    raw(
      'Calendar day shift',
      dayOffset === 0
        ? 'none'
        : `${dayOffset > 0 ? '+' : ''}${dayOffset} day${Math.abs(dayOffset) === 1 ? '' : 's'}`,
    ),
  ]

  const notes: string[] = [
    `${direction} at this moment. That difference is not fixed — it changes whenever either zone starts or ends daylight saving, and the two rarely switch on the same weekend.`,
    'Offsets are read from your device’s own IANA time zone database by formatting the instant in each zone, so daylight saving is handled by the same rules your operating system uses rather than a hardcoded table.',
    // The honest version of the caveat, not a claim that the risk is zero.
    'That database is versioned, and a build server and a browser can carry different versions. The zones offered here were chosen because their rules have been stable for years, which makes a disagreement unlikely — not impossible. Zones with recent political changes are deliberately left out.',
  ]

  if (instant.how === 'gap')
    notes.push(
      `${isoTime({ ...sourceWall, hour, minute })} does not exist in ${fromCity} on that date: the clocks jump forward by ${spellDuration(instant.shiftMs)} and skip it. It has been read as ${isoTime(sourceWall)}, the same moment the wall clock reaches next — which is what an alarm set for the missing time would do.`,
    )
  if (instant.how === 'ambiguous')
    notes.push(
      `${isoTime(sourceWall)} happens twice in ${fromCity} on that date: the clocks go back by ${spellDuration(instant.shiftMs)}, so the hour repeats. The FIRST occurrence has been used, the one still on daylight time. The second is ${spellDuration(instant.shiftMs)} later, at UTC offset ${offsetLabel(zoneOffsetMs(fromZone, instant.ms + instant.shiftMs))}.`,
    )
  if (dayOffset !== 0)
    notes.push(
      `The date changes: ${longDate(sourceWall)} in ${fromCity} is ${longDate(targetWall)} in ${toCity}. This is the part people get wrong when they book a call — the time looks right and the day is off by one.`,
    )

  return {
    primary: {
      label: 'Converted local time',
      value: `${isoTime(targetWall)} on ${longDate(targetWall)}`,
      format: { style: 'raw' },
    },
    // A fixed six, so the grid never reflows between the server render and the
    // island's first repaint.
    stats: [
      raw(`Clock in ${toCity}`, clock12(targetWall)),
      raw('Which day', dayLabel),
      raw(`Clock in ${fromCity}`, clock12(sourceWall)),
      raw(`${fromCity} UTC offset`, `UTC${offsetLabel(instant.offsetMs)}`),
      raw(`${toCity} UTC offset`, `UTC${offsetLabel(targetOffsetMs)}`),
      raw(
        'Difference',
        differenceMs === 0
          ? 'None — same clock'
          : `${spellDuration(Math.abs(differenceMs))} ${differenceMs > 0 ? 'ahead' : 'behind'}`,
      ),
    ],
    steps,
    notes,
  }
}

/** Milliseconds in an hour, exported so the tests can say what they mean. */
export const HOUR_MS = MS_PER_HOUR

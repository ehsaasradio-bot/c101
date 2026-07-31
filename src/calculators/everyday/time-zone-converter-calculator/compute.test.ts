import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import compute, { HOUR_MS, resolveInstant, zoneOffsetMs } from './compute'
import { ZONES, fields } from './fields'
import { CalcError } from '../../../lib/types'
import { defaultValues } from '../../../lib/view'

type Input = Parameters<typeof compute>[0]

const MS_PER_MINUTE = 60_000

const base: Input = {
  date: '2026-03-10',
  hour: 10,
  minute: 30,
  fromZone: 'America/New_York',
  toZone: 'Europe/London',
}

const run = (over: Partial<Input> = {}) => compute({ ...base, ...over })

const stat = (r: ReturnType<typeof compute>, label: string): string =>
  String(r.stats!.find((s) => s.label === label)!.value)

const labelledSteps = (r: ReturnType<typeof compute>) =>
  r.steps!.flatMap((s) => ('label' in s ? [s] : []))

/** Steps carry city names in their labels, so match on the stable prefix. */
const stepStarting = (r: ReturnType<typeof compute>, prefix: string): string => {
  const step = labelledSteps(r).find((s) => s.label.startsWith(prefix))
  if (!step) throw new Error(`no step starting "${prefix}" in ${labelledSteps(r).map((s) => s.label).join(' | ')}`)
  return String(step.value)
}

const ALL_ZONES = ZONES.map((z) => z.value)

/*
 * ── INDEPENDENT DERIVATION #1 ─────────────────────────────────────────────
 *
 * `compute` derives a zone's offset by formatting an instant with
 * `timeZoneName: 'longOffset'` and parsing "GMT-05:00" back out. This derives
 * the same number a completely different way: format the instant into the
 * zone's own year/month/day/hour/minute/second, re-encode those civil fields as
 * if they were UTC, and subtract the instant. No offset string is ever read.
 *
 * If the two agree everywhere, a parsing bug in either one cannot hide.
 */
const partFormatters = new Map<string, Intl.DateTimeFormat>()
function partsOf(zone: string, instantMs: number) {
  let fmt = partFormatters.get(zone)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
    partFormatters.set(zone, fmt)
  }
  const p = Object.fromEntries(
    fmt.formatToParts(new Date(instantMs)).map((x) => [x.type, x.value]),
  ) as Record<string, string>
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
  }
}

function offsetByParts(zone: string, instantMs: number): number {
  const p = partsOf(zone, instantMs)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - instantMs
}

/** "2026-03-10 14:30" as the local reading of `instantMs` in `zone`. */
function localReading(zone: string, instantMs: number): string {
  const p = partsOf(zone, instantMs)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`
}

// A deterministic pseudo-random sequence, so a sweep samples widely without the
// suite passing on Tuesday and failing on Wednesday.
function lcg(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x1_0000_0000
  }
}

describe('offset derivation', () => {
  /*
   * ── PUBLISHED ANCHORS ────────────────────────────────────────────────
   *
   * Offsets the outside world already agrees on, typed out rather than read
   * back from the code. A self-consistent but wrong derivation cannot pass
   * these; that is the whole point of anchoring on published figures.
   *
   * Dates chosen to sit clear of every transition: mid-January and mid-July.
   */
  const JAN = Date.UTC(2026, 0, 15, 12)
  const JUL = Date.UTC(2026, 6, 15, 12)

  const PUBLISHED: ReadonlyArray<readonly [string, number, number]> = [
    // zone, offset in minutes in mid-January, in mid-July
    ['UTC', 0, 0],
    ['Pacific/Pago_Pago', -11 * 60, -11 * 60], // Samoa Standard, no DST
    ['Pacific/Honolulu', -10 * 60, -10 * 60], // Hawaii, no DST since 1947
    ['America/Anchorage', -9 * 60, -8 * 60], // AKST / AKDT
    ['America/Los_Angeles', -8 * 60, -7 * 60], // PST / PDT
    ['America/Denver', -7 * 60, -6 * 60], // MST / MDT
    ['America/Phoenix', -7 * 60, -7 * 60], // Arizona opted out in 1968
    ['America/Chicago', -6 * 60, -5 * 60], // CST / CDT
    ['America/New_York', -5 * 60, -4 * 60], // EST / EDT
    ['America/Halifax', -4 * 60, -3 * 60], // AST / ADT
    ['America/Sao_Paulo', -3 * 60, -3 * 60], // Brazil abolished DST in 2019
    ['Europe/London', 0, 60], // GMT / BST
    ['Europe/Dublin', 0, 60], // GMT / IST — same clock as London
    ['Europe/Lisbon', 0, 60], // WET / WEST
    ['Europe/Madrid', 60, 120], // CET / CEST, despite sitting west of London
    ['Europe/Rome', 60, 120], // CET / CEST
    ['Europe/Paris', 60, 120], // CET / CEST
    ['Europe/Berlin', 60, 120],
    ['Africa/Lagos', 60, 60], // WAT, no DST
    ['Europe/Athens', 120, 180], // EET / EEST
    ['Africa/Johannesburg', 120, 120], // SAST, no DST
    ['Europe/Moscow', 180, 180], // MSK, fixed since 2014
    ['Africa/Nairobi', 180, 180], // EAT, no DST
    ['Asia/Dubai', 240, 240], // GST, no DST
    ['Asia/Karachi', 300, 300], // PKT, no DST
    // THE NON-HOUR OFFSETS. Any implementation storing whole hours fails here.
    ['Asia/Kolkata', 330, 330], // UTC+5:30 — India Standard Time
    ['Asia/Kathmandu', 345, 345], // UTC+5:45 — Nepal, 15 min ahead of India
    ['Asia/Dhaka', 360, 360],
    ['Asia/Bangkok', 420, 420],
    ['Asia/Jakarta', 420, 420],
    ['Asia/Singapore', 480, 480],
    ['Asia/Shanghai', 480, 480], // one zone for the whole country
    ['Asia/Hong_Kong', 480, 480],
    ['Australia/Perth', 480, 480], // Western Australia, no DST
    ['Asia/Tokyo', 540, 540], // JST, no DST since 1951
    ['Asia/Seoul', 540, 540],
    ['Australia/Brisbane', 600, 600], // Queensland, no DST since 1992
    // SOUTHERN HEMISPHERE DST — summer in January, winter in July, the
    // opposite way round to every northern entry above.
    ['Australia/Sydney', 11 * 60, 10 * 60], // AEDT in Jan, AEST in Jul
    ['Pacific/Auckland', 13 * 60, 12 * 60], // NZDT in Jan, NZST in Jul
    ['Pacific/Chatham', 13 * 60 + 45, 12 * 60 + 45], // +12:45, +13:45 in summer
    ['Pacific/Kiritimati', 14 * 60, 14 * 60], // the furthest-forward zone on earth
  ]

  test('every offered zone is anchored against a published offset', () => {
    // Pinned both ways: a zone added to the list without an anchor fails here.
    expect(PUBLISHED.map(([z]) => z).sort()).toEqual([...ALL_ZONES].sort())
  })

  test.each(PUBLISHED)('%s matches its published UTC offset', (zone, janMin, julMin) => {
    expect(zoneOffsetMs(zone, JAN) / MS_PER_MINUTE).toBe(janMin)
    expect(zoneOffsetMs(zone, JUL) / MS_PER_MINUTE).toBe(julMin)
  })

  test(
    'the longOffset derivation agrees with the wall-clock-parts derivation everywhere',
    () => {
      const rnd = lcg(20260731)
      for (const zone of ALL_ZONES) {
        // Both solstice anchors, both equinoxes, and 200 sampled instants across
        // a decade — enough to land inside and outside every DST window.
        const samples = [JAN, JUL, Date.UTC(2026, 2, 20), Date.UTC(2026, 8, 22)]
        for (let i = 0; i < 200; i++) {
          // Whole minutes: the parts derivation only resolves to the second, so
          // a sample carrying milliseconds would differ by those milliseconds
          // and prove nothing about the offsets.
          const ms = Date.UTC(2020, 0, 1) + Math.floor(rnd() * 10 * 365 * 1440) * MS_PER_MINUTE
          samples.push(ms)
        }
        for (const ms of samples) {
          expect(zoneOffsetMs(zone, ms), `${zone} @ ${new Date(ms).toISOString()}`).toBe(
            offsetByParts(zone, ms),
          )
        }
      }
    },
    30_000,
  )
})

describe('conversion', () => {
  test('the shipped defaults convert to a sane, NaN-free answer', () => {
    const values = defaultValues({ fields }) as unknown as Input
    const result = compute(values)
    expect(result.primary.value).not.toContain('NaN')
    expect(result.primary.label).toBe('Converted local time')
    expect(result.stats).toHaveLength(6)
    for (const s of result.stats!) expect(String(s.value)).not.toContain('NaN')
  })

  test('New York 10:30 on 10 March 2026 is 14:30 in London', () => {
    // A deliberately awkward anchor: the US sprang forward on 8 March 2026 and
    // the UK does not until 29 March, so the usual 5-hour gap is 4 that fortnight.
    const r = run()
    expect(r.primary.value).toBe('14:30 on Tuesday, 10 March 2026')
    expect(stat(r, 'Which day')).toBe('The same day')
    expect(stat(r, 'New York UTC offset')).toBe('UTC-04:00')
    expect(stat(r, 'London UTC offset')).toBe('UTC+00:00')
    expect(stat(r, 'Difference')).toBe('4 hours ahead')
    expect(stepStarting(r, 'The same moment in UTC')).toBe('2026-03-10 14:30Z')
  })

  test('the same pair is 5 hours apart in February, before either clock changes', () => {
    const r = run({ date: '2026-02-10' })
    expect(r.primary.value).toBe('15:30 on Tuesday, 10 February 2026')
    expect(stat(r, 'Difference')).toBe('5 hours ahead')
  })

  test('a non-hour offset lands on the right minute', () => {
    // 10:30 in New York (UTC-4 on this date) is 14:30 UTC, and Kathmandu is
    // UTC+5:45, so 20:15. A whole-hour offset table cannot produce that :15.
    const r = run({ toZone: 'Asia/Kathmandu' })
    expect(r.primary.value).toBe('20:15 on Tuesday, 10 March 2026')
    expect(stat(r, 'Kathmandu UTC offset')).toBe('UTC+05:45')
    expect(stat(r, 'Difference')).toBe('9 hours 45 minutes ahead')
  })

  test('India’s half hour survives a conversion from a zone on the hour', () => {
    const r = run({ fromZone: 'UTC', toZone: 'Asia/Kolkata', hour: 9, minute: 0 })
    expect(r.primary.value).toBe('14:30 on Tuesday, 10 March 2026')
    expect(stat(r, 'Difference')).toBe('5 hours 30 minutes ahead')
  })

  test('the Chatham Islands keep their 45 minutes through their own DST', () => {
    // Southern summer: Chatham is UTC+13:45 in January and UTC+12:45 in July.
    const summer = run({ date: '2026-01-15', fromZone: 'UTC', toZone: 'Pacific/Chatham', hour: 0, minute: 0 })
    expect(summer.primary.value).toBe('13:45 on Thursday, 15 January 2026')
    const winter = run({ date: '2026-07-15', fromZone: 'UTC', toZone: 'Pacific/Chatham', hour: 0, minute: 0 })
    expect(winter.primary.value).toBe('12:45 on Wednesday, 15 July 2026')
  })
})

describe('the day offset — the thing people actually get wrong', () => {
  test('an evening call in New York is the next morning in Tokyo', () => {
    const r = run({ hour: 21, minute: 0, toZone: 'Asia/Tokyo' })
    expect(r.primary.value).toBe('10:00 on Wednesday, 11 March 2026')
    expect(stat(r, 'Which day')).toBe('The next day — tomorrow there')
  })

  test('an early morning in Tokyo is the previous evening in New York', () => {
    const r = run({ hour: 9, minute: 0, fromZone: 'Asia/Tokyo', toZone: 'America/New_York' })
    expect(r.primary.value).toBe('20:00 on Monday, 9 March 2026')
    expect(stat(r, 'Which day')).toBe('The day before — yesterday there')
  })

  test('across the international date line the calendar day always moves', () => {
    /*
     * Kiritimati is UTC+14 and Pago Pago is UTC-11: TWENTY-FIVE hours apart,
     * more than a whole day. So the date never matches — and for the first hour
     * of the day it slips by two, not one. Midnight on Kiritimati is 23:00 two
     * calendar days earlier in Pago Pago. A converter that assumes the day can
     * only move by one is wrong here, and nowhere else this list reaches.
     */
    for (let hour = 0; hour < 24; hour++) {
      const r = run({ hour, minute: 0, fromZone: 'Pacific/Kiritimati', toZone: 'Pacific/Pago_Pago' })
      expect(stat(r, 'Which day'), `${hour}:00`).toBe(
        hour < 1 ? '2 days earlier there' : 'The day before — yesterday there',
      )
    }
    for (let hour = 0; hour < 24; hour++) {
      const r = run({ hour, minute: 0, fromZone: 'Pacific/Pago_Pago', toZone: 'Pacific/Kiritimati' })
      expect(stat(r, 'Which day'), `${hour}:00`).toBe(
        hour >= 23 ? '2 days later there' : 'The next day — tomorrow there',
      )
    }
  })

  test('the two-day slip is exactly where the arithmetic says it should be', () => {
    // 00:00 on Kiritimati is 10:00Z the previous day; Pago Pago is 11 hours
    // behind that, so 23:00 the day before again. Checked against raw epoch ms
    // rather than against the converter's own reasoning.
    const instant = Date.UTC(2026, 2, 9, 10, 0) // 2026-03-10 00:00 at UTC+14
    expect(zoneOffsetMs('Pacific/Kiritimati', instant)).toBe(14 * HOUR_MS)
    expect(zoneOffsetMs('Pacific/Pago_Pago', instant)).toBe(-11 * HOUR_MS)
    expect(localReading('Pacific/Kiritimati', instant)).toBe('2026-03-10 00:00')
    expect(localReading('Pacific/Pago_Pago', instant)).toBe('2026-03-08 23:00')

    const r = run({ hour: 0, minute: 0, fromZone: 'Pacific/Kiritimati', toZone: 'Pacific/Pago_Pago' })
    expect(r.primary.value).toBe('23:00 on Sunday, 8 March 2026')
  })

  test('the day offset never exceeds two days either way', () => {
    // The widest gap between any two offered zones is 25 hours, so a reading can
    // slip at most two calendar days. A ±3 would mean the offset arithmetic had
    // gone wrong.
    const seen = new Set<string>()
    const rnd = lcg(7)
    for (let i = 0; i < 400; i++) {
      const from = ALL_ZONES[Math.floor(rnd() * ALL_ZONES.length)]!
      const to = ALL_ZONES[Math.floor(rnd() * ALL_ZONES.length)]!
      const r = compute({
        date: `2026-0${1 + Math.floor(rnd() * 9)}-1${Math.floor(rnd() * 9)}`,
        hour: Math.floor(rnd() * 24),
        minute: Math.floor(rnd() * 60),
        fromZone: from,
        toZone: to,
      })
      const label = stat(r, 'Which day')
      seen.add(label)
      expect([
        'The same day',
        'The next day — tomorrow there',
        'The day before — yesterday there',
        '2 days later there',
        '2 days earlier there',
      ]).toContain(label)
    }
    // The sweep has to actually reach all three of the common cases, or it is
    // asserting nothing.
    expect(seen.size).toBeGreaterThanOrEqual(3)
  }, 30_000)
})

describe('daylight saving transitions', () => {
  /*
   * Both directions, in both hemispheres, at the exact minute. These are the
   * inputs every naive converter breaks on, and both are real things a person
   * can read off a calendar and type in.
   */

  test('a spring-forward gap is shifted forward and reported, not silently absorbed', () => {
    // 8 March 2026: New York goes 01:59:59 EST → 03:00:00 EDT. 02:30 never happens.
    const r = run({ date: '2026-03-08', hour: 2, minute: 30, toZone: 'UTC' })
    expect(stat(r, 'Clock in New York')).toBe('3:30 am')
    expect(stat(r, 'New York UTC offset')).toBe('UTC-04:00')
    expect(r.primary.value).toBe('07:30 on Sunday, 8 March 2026')
    expect(r.notes!.some((n) => n.includes('does not exist'))).toBe(true)

    const resolved = resolveInstant('America/New_York', Date.UTC(2026, 2, 8, 2, 30))
    expect(resolved.how).toBe('gap')
    expect(resolved.shiftMs).toBe(HOUR_MS)
    expect(resolved.ms).toBe(Date.UTC(2026, 2, 8, 7, 30))
  })

  test('the minute either side of that gap is untouched', () => {
    expect(resolveInstant('America/New_York', Date.UTC(2026, 2, 8, 1, 59)).how).toBe('exact')
    expect(resolveInstant('America/New_York', Date.UTC(2026, 2, 8, 3, 0)).how).toBe('exact')
    // 01:59 EST is 06:59Z; 03:00 EDT is 07:00Z. One minute apart in real time.
    expect(resolveInstant('America/New_York', Date.UTC(2026, 2, 8, 1, 59)).ms).toBe(
      Date.UTC(2026, 2, 8, 6, 59),
    )
    expect(resolveInstant('America/New_York', Date.UTC(2026, 2, 8, 3, 0)).ms).toBe(
      Date.UTC(2026, 2, 8, 7, 0),
    )
  })

  test('every minute of the missing hour is a gap, and none of the rest of the day is', () => {
    for (let minute = 0; minute < 60; minute++)
      expect(resolveInstant('America/New_York', Date.UTC(2026, 2, 8, 2, minute)).how).toBe('gap')
    for (let hour = 0; hour < 24; hour++) {
      if (hour === 2) continue
      expect(
        resolveInstant('America/New_York', Date.UTC(2026, 2, 8, hour, 30)).how,
        `${hour}:30`,
      ).toBe('exact')
    }
  })

  test('a repeated hour resolves to the first occurrence and names the second', () => {
    // 1 November 2026: New York goes 01:59:59 EDT → 01:00:00 EST. 01:30 twice.
    const r = run({ date: '2026-11-01', hour: 1, minute: 30, toZone: 'UTC' })
    // The first occurrence is still on daylight time, UTC-4, so 05:30Z.
    expect(r.primary.value).toBe('05:30 on Sunday, 1 November 2026')
    expect(stat(r, 'New York UTC offset')).toBe('UTC-04:00')
    expect(r.notes!.some((n) => n.includes('happens twice'))).toBe(true)

    const resolved = resolveInstant('America/New_York', Date.UTC(2026, 10, 1, 1, 30))
    expect(resolved.how).toBe('ambiguous')
    expect(resolved.shiftMs).toBe(HOUR_MS)
    expect(resolved.ms).toBe(Date.UTC(2026, 10, 1, 5, 30))
    // The second occurrence is an hour later and on standard time.
    expect(zoneOffsetMs('America/New_York', resolved.ms + HOUR_MS)).toBe(-5 * HOUR_MS)
    expect(localReading('America/New_York', resolved.ms)).toBe('2026-11-01 01:30')
    expect(localReading('America/New_York', resolved.ms + HOUR_MS)).toBe('2026-11-01 01:30')
  })

  test('Europe switches on different weekends from the US', () => {
    // The UK springs forward on the last Sunday in March: 29 March 2026,
    // 01:00 GMT → 02:00 BST, so 01:30 does not exist.
    expect(resolveInstant('Europe/London', Date.UTC(2026, 2, 29, 1, 30)).how).toBe('gap')
    // ...and falls back on the last Sunday in October: 25 October 2026.
    expect(resolveInstant('Europe/London', Date.UTC(2026, 9, 25, 1, 30)).how).toBe('ambiguous')
    // On 10 March the US has switched and the UK has not, which is the whole
    // reason the New York ↔ London gap is 4 hours rather than 5 that fortnight.
    expect(zoneOffsetMs('Europe/London', Date.UTC(2026, 2, 10, 12))).toBe(0)
    expect(zoneOffsetMs('America/New_York', Date.UTC(2026, 2, 10, 12))).toBe(-4 * HOUR_MS)
  })

  test('the southern hemisphere runs the opposite way round the year', () => {
    // Sydney ENDS daylight saving on the first Sunday in April — 5 April 2026,
    // 03:00 AEDT → 02:00 AEST — so 02:30 happens twice, in autumn.
    expect(resolveInstant('Australia/Sydney', Date.UTC(2026, 3, 5, 2, 30)).how).toBe('ambiguous')
    // ...and STARTS it on the first Sunday in October — 4 October 2026,
    // 02:00 AEST → 03:00 AEDT — so 02:30 is missing, in spring.
    expect(resolveInstant('Australia/Sydney', Date.UTC(2026, 9, 4, 2, 30)).how).toBe('gap')

    // The mirror image of London, which is doing precisely the reverse.
    expect(resolveInstant('Europe/London', Date.UTC(2026, 2, 29, 1, 30)).how).toBe('gap')
    expect(resolveInstant('Europe/London', Date.UTC(2026, 9, 25, 1, 30)).how).toBe('ambiguous')
  })

  test('a northern/southern pair spans both regimes, and the gap moves by two hours', () => {
    const noon = { hour: 12, minute: 0, fromZone: 'Europe/London', toZone: 'Australia/Sydney' } as const
    // January: London on GMT (+0), Sydney on AEDT (+11) — 11 hours.
    expect(stat(run({ ...noon, date: '2026-01-15' }), 'Difference')).toBe('11 hours ahead')
    // June: London on BST (+1), Sydney on AEST (+10) — 9 hours.
    expect(stat(run({ ...noon, date: '2026-06-15' }), 'Difference')).toBe('9 hours ahead')
    // Late March, after London springs forward and before Sydney falls back:
    // both on summer time at once, so the usual 10 gives way to 10 as well —
    // BST (+1) to AEDT (+11).
    expect(stat(run({ ...noon, date: '2026-03-30' }), 'Difference')).toBe('10 hours ahead')
    // Mid-April, London on BST and Sydney back on standard time: 9 hours.
    expect(stat(run({ ...noon, date: '2026-04-15' }), 'Difference')).toBe('9 hours ahead')
  })

  test('the Chathams do their own southern spring-forward at 02:45', () => {
    // Chatham DST begins the last Sunday in September, 02:45 → 03:45.
    expect(resolveInstant('Pacific/Chatham', Date.UTC(2026, 8, 27, 3, 0)).how).toBe('gap')
    expect(resolveInstant('Pacific/Chatham', Date.UTC(2026, 8, 27, 2, 30)).how).toBe('exact')
  })
})

describe('two independent cross-checks of every conversion', () => {
  /*
   * ── INDEPENDENT DERIVATION #2 ────────────────────────────────────────
   *
   * `compute` resolves an instant and then reports the target time. This
   * recomputes the target reading straight from epoch milliseconds plus the
   * offsets derived by the parts method above — a different route to the same
   * number, through none of the same code — and demands they agree.
   */
  test(
    'the reported target time equals instant + offset, computed from raw epoch ms',
    () => {
      const rnd = lcg(4242)
      for (let i = 0; i < 600; i++) {
        const fromZone = ALL_ZONES[Math.floor(rnd() * ALL_ZONES.length)]!
        const toZone = ALL_ZONES[Math.floor(rnd() * ALL_ZONES.length)]!
        const month = 1 + Math.floor(rnd() * 12)
        const day = 1 + Math.floor(rnd() * 28)
        const hour = Math.floor(rnd() * 24)
        const minute = Math.floor(rnd() * 60)
        const date = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

        const r = compute({ date, hour, minute, fromZone, toZone })

        // Rebuild the instant the way an outsider would: take the source
        // reading compute says it used, and its stated offset.
        const [srcDate, srcTime] = stepStarting(r, 'Time entered').split(' ')
        const srcOffset = zoneOffsetMs(fromZone, Date.parse(`${srcDate}T${srcTime}:00Z`))
        const instantMs = Date.parse(`${srcDate}T${srcTime}:00Z`) - srcOffset

        // ...then read that instant in the target zone by the parts method.
        const expected = localReading(toZone, instantMs)
        expect(stepStarting(r, 'Time there'), `${fromZone}→${toZone} ${date} ${hour}:${minute}`).toBe(
          expected,
        )

        // And the UTC step must be that same instant.
        expect(stepStarting(r, 'The same moment in UTC')).toBe(
          `${localReading('UTC', instantMs)}Z`,
        )
      }
    },
    30_000,
  )

  /*
   * ── ROUND TRIP ───────────────────────────────────────────────────────
   *
   * A → B then B → A must return the original date and time. This is the
   * property an offset applied in the wrong direction, or applied at the wrong
   * instant, cannot satisfy — a sign error passes every self-consistent check
   * and fails this one immediately.
   *
   * Readings inside a spring-forward gap or a repeated hour are excluded at
   * BOTH ends: the first has no instant to return to, and the second has two,
   * so neither can round-trip by definition. `resolveInstant` says which is
   * which, so the exclusion is precise rather than a blanket skip near March.
   */
  test(
    'converting A → B and back returns the original reading',
    () => {
      const rnd = lcg(99991)
      let checked = 0
      for (let i = 0; i < 900; i++) {
        const fromZone = ALL_ZONES[Math.floor(rnd() * ALL_ZONES.length)]!
        const toZone = ALL_ZONES[Math.floor(rnd() * ALL_ZONES.length)]!
        const month = 1 + Math.floor(rnd() * 12)
        const day = 1 + Math.floor(rnd() * 28)
        const hour = Math.floor(rnd() * 24)
        const minute = Math.floor(rnd() * 60)
        const date = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

        const wall = Date.UTC(2026, month - 1, day, hour, minute)
        if (resolveInstant(fromZone, wall).how !== 'exact') continue

        const out = compute({ date, hour, minute, fromZone, toZone })
        const [midDate, midTime] = stepStarting(out, 'Time there').split(' ')
        const [midHour, midMinute] = midTime!.split(':').map(Number)

        // Only round-trip when the intermediate reading is itself unambiguous.
        const midWall = Date.parse(`${midDate}T${midTime}:00Z`)
        if (resolveInstant(toZone, midWall).how !== 'exact') continue

        const back = compute({
          date: midDate!,
          hour: midHour!,
          minute: midMinute!,
          fromZone: toZone,
          toZone: fromZone,
        })
        expect(
          stepStarting(back, 'Time there'),
          `${fromZone} → ${toZone} → ${fromZone} for ${date} ${hour}:${minute}`,
        ).toBe(`${date} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`)
        checked++
      }
      // Guard against the filters quietly excluding everything.
      expect(checked).toBeGreaterThan(700)
    },
    30_000,
  )

  test('a zone converted to itself is the identity', () => {
    for (const zone of ALL_ZONES) {
      const r = compute({ date: '2026-06-15', hour: 8, minute: 5, fromZone: zone, toZone: zone })
      expect(stepStarting(r, 'Time there'), zone).toBe('2026-06-15 08:05')
      expect(stat(r, 'Which day'), zone).toBe('The same day')
      expect(stat(r, 'Difference'), zone).toBe('None — same clock')
    }
  })
})

describe('determinism between Node and the browser', () => {
  const source = readFileSync(new URL('./compute.ts', import.meta.url), 'utf8')
  const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')

  test('compute never reads a clock', () => {
    // A page built at 09:00 UTC and opened at 17:00 would otherwise render one
    // answer and immediately repaint another.
    expect(code).not.toMatch(/Date\.now\s*\(/)
    expect(code).not.toMatch(/new Date\s*\(\s*\)/)
    expect(code).not.toMatch(/performance\s*\.\s*now/)
  })

  test('no locale-dependent formatting reaches the output', () => {
    // `toLocaleDateString` wording, comma placement and even numerals vary with
    // the ICU build, so Node and a browser can disagree character for character.
    expect(code).not.toMatch(/toLocale(Date|Time)?String/)
    // The one Intl use is the offset lookup, and its locale is pinned.
    const intlUses = code.match(/new Intl\.[A-Za-z]+\(/g) ?? []
    expect(intlUses).toEqual(['new Intl.DateTimeFormat('])
    expect(code).toMatch(/new Intl\.DateTimeFormat\('en-US'/)
  })

  test('the time of day is a fixed default, never “today”', () => {
    const hour = fields.find((f) => f.id === 'hour')!
    const minute = fields.find((f) => f.id === 'minute')!
    expect(hour.default).toBe(10)
    expect(minute.default).toBe(30)
    // The DATE may follow the clock — the view layer resolves it and
    // registry.test.ts skips the stability snapshot for it — but the TIME may not.
    expect(fields.find((f) => f.id === 'date')!.default).toBe('today')
  })

  test('the same inputs give the same output twice, formatter cache and all', () => {
    const first = JSON.stringify(run())
    const other = JSON.stringify(run({ fromZone: 'Asia/Kathmandu' }))
    expect(JSON.stringify(run())).toBe(first)
    expect(other).not.toBe(first)
  })
})

describe('bad input is refused, never returned as NaN', () => {
  test('a non-numeric hour is caught before any range test', () => {
    // coerceValues emits NaN for unparseable input, and `NaN < 0` is false, so a
    // bare magnitude check would let it through into the output.
    expect(() => run({ hour: Number.NaN })).toThrow(CalcError)
    expect(() => run({ minute: Number.NaN })).toThrow(CalcError)
    expect(() => run({ hour: Number.POSITIVE_INFINITY })).toThrow(CalcError)
  })

  test('errors name the field so the form can highlight it', () => {
    const cases: ReadonlyArray<readonly [Partial<Input>, string]> = [
      [{ hour: Number.NaN }, 'hour'],
      [{ hour: 24 }, 'hour'],
      [{ hour: -1 }, 'hour'],
      [{ hour: 10.5 }, 'hour'],
      [{ minute: 60 }, 'minute'],
      [{ minute: -1 }, 'minute'],
      [{ date: 'March 10th' }, 'date'],
      [{ date: '2026-02-30' }, 'date'],
      [{ date: '1969-12-31' }, 'date'],
      [{ fromZone: 'Mars/Olympus_Mons' }, 'fromZone'],
      [{ toZone: '' }, 'toZone'],
    ]
    for (const [over, fieldId] of cases) {
      let caught: unknown
      try {
        run(over)
      } catch (e) {
        caught = e
      }
      expect(caught, JSON.stringify(over)).toBeInstanceOf(CalcError)
      expect((caught as CalcError).fieldId, JSON.stringify(over)).toBe(fieldId)
      expect((caught as CalcError).message.length).toBeGreaterThan(10)
    }
  })

  test('an unknown zone never reaches Intl, which would throw a RangeError', () => {
    // Intl.DateTimeFormat throws a bare RangeError for an unknown timeZone, and
    // the form only knows how to display a CalcError.
    expect(() => run({ fromZone: 'Not/AZone' })).toThrow(CalcError)
  })

  test('every declared field bound is a value compute accepts', () => {
    // The same guarantee field-bounds.test.ts makes registry-wide, asserted here
    // too so this calculator can be checked in isolation.
    for (const field of fields) {
      if (field.kind !== 'number') continue
      for (const bound of [field.min, field.max]) {
        expect(() => run({ [field.id]: bound } as Partial<Input>)).not.toThrow()
      }
    }
  })

  test('midnight and one minute to midnight both work', () => {
    // Midnight in New York on 10 March 2026 (UTC-4) is 04:00 in London (UTC+0).
    expect(run({ hour: 0, minute: 0 }).primary.value).toBe('04:00 on Tuesday, 10 March 2026')
    expect(run({ hour: 23, minute: 59 }).primary.value).toBe('03:59 on Wednesday, 11 March 2026')
  })
})

describe('presentation', () => {
  test('dates are spelled out and times stay ISO in the steps', () => {
    const r = run()
    expect(r.primary.value).toMatch(/^\d{2}:\d{2} on [A-Z][a-z]+, \d{1,2} [A-Z][a-z]+ \d{4}$/)
    expect(stepStarting(r, 'Time there')).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })

  test('the 12-hour clock reads noon and midnight correctly', () => {
    const noon = run({ fromZone: 'UTC', toZone: 'UTC', hour: 12, minute: 0 })
    expect(stat(noon, 'Clock in UTC')).toBe('12:00 pm')
    const midnight = run({ fromZone: 'UTC', toZone: 'UTC', hour: 0, minute: 0 })
    expect(stat(midnight, 'Clock in UTC')).toBe('12:00 am')
  })

  test('the stat and step counts never vary with input', () => {
    const shapes = new Set<string>()
    const rnd = lcg(31337)
    for (let i = 0; i < 120; i++) {
      const r = compute({
        date: '2026-06-15',
        hour: Math.floor(rnd() * 24),
        minute: Math.floor(rnd() * 60),
        fromZone: ALL_ZONES[Math.floor(rnd() * ALL_ZONES.length)]!,
        toZone: ALL_ZONES[Math.floor(rnd() * ALL_ZONES.length)]!,
      })
      shapes.add(`${r.stats!.length}/${r.steps!.length}`)
    }
    expect([...shapes]).toEqual(['6/9'])
  })

  test('there are no parts and no series to render inconsistently', () => {
    // A time zone difference is not a proportion of anything and has no trend,
    // so drawing a donut or a chart would be decoration pretending to be
    // information. Absent at the defaults means absent everywhere — which is
    // what registry.test.ts requires.
    const r = run()
    expect(r.parts).toBeUndefined()
    expect(r.series).toBeUndefined()
  })
})

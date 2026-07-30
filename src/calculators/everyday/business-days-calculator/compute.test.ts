import { describe, expect, test } from 'vitest'
import compute from './compute'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'
import { defaultValues } from '../../../lib/view'
import { formatValue } from '../../../lib/format'

type Input = Parameters<typeof compute>[0]

/** Wednesday 1 July 2026 to Tuesday 14 July 2026 — a span containing an observed holiday. */
const base: Input = {
  mode: 'between',
  businessDays: 10,
  startDate: '2026-07-01',
  endDate: '2026-07-14',
  holidays: 'usFederal',
}

const MS_PER_DAY = 86_400_000
const atUtc = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)

const stat = (r: ReturnType<typeof compute>, label: string) =>
  r.stats!.find((s) => s.label === label)!.value

/** Every step that carries a label, with the `{ rule: true }` separators dropped. */
const labelledSteps = (r: ReturnType<typeof compute>) =>
  r.steps!.flatMap((s) => ('label' in s ? [s] : []))

function stepValue(r: ReturnType<typeof compute>, label: string): number | string {
  const step = labelledSteps(r).find((s) => s.label === label)
  if (!step) throw new Error(`no step labelled "${label}"`)
  return step.value
}

const stepLabels = (r: ReturnType<typeof compute>) => labelledSteps(r).map((s) => s.label)

/**
 * THE PUBLISHED ANCHOR. Every observed US federal holiday date for 2024-2028 as
 * OPM lists them, typed out rather than generated. `compute` builds these from
 * rules (fourth Thursday in November, last Monday in May, plus the Saturday and
 * Sunday observance shifts); this table is what the outside world already agrees
 * on, so a plausible-but-wrong rule cannot pass by being self-consistent.
 *
 * Note 2027 carries twelve entries and 2028 only ten: New Year's Day 2028 falls
 * on a Saturday and is therefore taken on Friday 31 December 2027.
 */
const OPM_OBSERVED: Readonly<Record<number, readonly string[]>> = {
  2024: [
    '2024-01-01', '2024-01-15', '2024-02-19', '2024-05-27', '2024-06-19', '2024-07-04',
    '2024-09-02', '2024-10-14', '2024-11-11', '2024-11-28', '2024-12-25',
  ],
  2025: [
    '2025-01-01', '2025-01-20', '2025-02-17', '2025-05-26', '2025-06-19', '2025-07-04',
    '2025-09-01', '2025-10-13', '2025-11-11', '2025-11-27', '2025-12-25',
  ],
  2026: [
    '2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-06-19', '2026-07-03',
    '2026-09-07', '2026-10-12', '2026-11-11', '2026-11-26', '2026-12-25',
  ],
  2027: [
    '2027-01-01', '2027-01-18', '2027-02-15', '2027-05-31', '2027-06-18', '2027-07-05',
    '2027-09-06', '2027-10-11', '2027-11-11', '2027-11-25', '2027-12-24', '2027-12-31',
  ],
  2028: [
    '2028-01-17', '2028-02-21', '2028-05-29', '2028-06-19', '2028-07-04', '2028-09-04',
    '2028-10-09', '2028-11-10', '2028-11-23', '2028-12-25',
  ],
}

const OPM_SET = new Set(Object.values(OPM_OBSERVED).flat())

/**
 * The independent reference. It walks the range one calendar day at a time and
 * takes the weekday from the platform's own `getUTCDay`, rather than from the
 * `((day % 7) + 11) % 7` arithmetic `compute` uses, so a mistake in either
 * derivation cannot hide behind a matching mistake in the other. Holidays come
 * from the OPM table above, not from the rules under test.
 *
 * Both ends are counted, which is the convention `compute` uses for a range.
 */
function walk(startIso: string, endIso: string, holidays: ReadonlySet<string>) {
  let total = 0
  let business = 0
  let weekend = 0
  let holiday = 0
  for (let ms = atUtc(startIso); ms <= atUtc(endIso); ms += MS_PER_DAY) {
    const iso = isoOf(ms)
    const dow = new Date(ms).getUTCDay()
    total++
    if (dow === 0 || dow === 6) weekend++
    else if (holidays.has(iso)) holiday++
    else business++
  }
  return { total, business, weekend, holiday }
}

const NO_HOLIDAYS: ReadonlySet<string> = new Set<string>()

describe('business days', () => {
  test('the worked example, counted twice', () => {
    // 1-14 July 2026 is 14 days: two whole weeks from a Wednesday, so exactly
    // 10 weekdays and 4 weekend days. Independence Day 2026 falls on Saturday
    // 4 July, so the federal holiday is observed on Friday 3 July, which is
    // inside the range. 10 weekdays - 1 holiday = 9 business days.
    const r = compute(base)
    expect(Number(r.primary.value)).toBe(9)
    expect(Number(stat(r, 'Calendar days in the range'))).toBe(14)
    expect(Number(stat(r, 'Weekend days'))).toBe(4)
    expect(Number(stat(r, 'Public holidays'))).toBe(1)

    // Second, independent count: walk every day using the platform weekday and
    // the published OPM holiday list.
    const reference = walk('2026-07-01', '2026-07-14', OPM_SET)
    expect(reference).toEqual({ total: 14, business: 9, weekend: 4, holiday: 1 })

    // Third: with holidays switched off the same range is a plain 10 weekdays.
    const noHolidays = compute({ ...base, holidays: 'none' })
    expect(Number(noHolidays.primary.value)).toBe(10)
    expect(walk('2026-07-01', '2026-07-14', NO_HOLIDAYS).business).toBe(10)
  })

  test('the observed holiday is named and dated in the steps', () => {
    const r = compute(base)
    expect(stepLabels(r)).toContain('Independence Day (observed)')
    expect(stepValue(r, 'Independence Day (observed)')).toBe('2026-07-03')
    expect(Number(stepValue(r, 'Public holidays deducted'))).toBe(1)
    expect(Number(stepValue(r, 'Weekdays (Mon–Fri) in total'))).toBe(10)
    expect(Number(stepValue(r, 'Business days'))).toBe(9)
  })

  // ── The holiday rules ───────────────────────────────────────────────────

  test('every observed federal holiday matches OPM for 2024-2028', () => {
    for (const [year, expected] of Object.entries(OPM_OBSERVED)) {
      // A whole calendar year, so every holiday observed in it shows up. The
      // step list names the first twelve, and no year here has more.
      const r = compute({
        ...base,
        startDate: `${year}-01-01`,
        endDate: `${year}-12-31`,
      })
      const dates = labelledSteps(r)
        // Every ISO-valued step is either a holiday or one of the two range
        // endpoints, which are excluded by name.
        .filter((s) => s.label !== 'Start date' && s.label !== 'End date')
        .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s.value)))
        .map((s) => String(s.value))

      expect(dates).toEqual([...expected])
      expect(Number(stat(r, 'Public holidays'))).toBe(expected.length)
    }
  })

  // Each row: what the holiday is, the date it is actually taken off, and the
  // step label that should name it.
  const OBSERVANCE_SHIFTS: Array<[string, string, string]> = [
    // A Saturday holiday is observed the Friday before.
    ['Independence Day 2026 (Sat 4 July)', '2026-07-03', 'Independence Day (observed)'],
    ['Christmas Day 2027 (Sat 25 Dec)', '2027-12-24', 'Christmas Day (observed)'],
    ['Juneteenth 2027 (Sat 19 June)', '2027-06-18', 'Juneteenth National Independence Day (observed)'],
    ['Veterans Day 2028 (Sat 11 Nov)', '2028-11-10', 'Veterans Day (observed)'],
    // A Sunday holiday is observed the Monday after.
    ['Independence Day 2027 (Sun 4 July)', '2027-07-05', 'Independence Day (observed)'],
    ['New Year’s Day 2023 (Sun 1 Jan)', '2023-01-02', 'New Year’s Day (observed)'],
    // And one that needs no shift at all.
    ['Veterans Day 2026 (Wed 11 Nov)', '2026-11-11', 'Veterans Day'],
  ]

  test.each(OBSERVANCE_SHIFTS)('%s is observed on %s', (_label, observedIso, stepLabel) => {
    // A one-day range on the observed date: the day is a weekday, and the only
    // thing that can take it out of the business count is the holiday.
    const r = compute({ ...base, startDate: observedIso, endDate: observedIso })
    expect(Number(r.primary.value)).toBe(0)
    expect(Number(stat(r, 'Public holidays'))).toBe(1)
    expect(Number(stat(r, 'Weekend days'))).toBe(0)
    expect(stepLabels(r)).toContain(stepLabel)
    expect(stepValue(r, stepLabel)).toBe(observedIso)

    // Switching the holiday set off gives the day back, which proves the
    // deduction came from the holiday and not from the weekday arithmetic.
    expect(Number(compute({ ...base, startDate: observedIso, endDate: observedIso, holidays: 'none' }).primary.value)).toBe(1)
  })

  test('a Saturday New Year’s Day is observed in the previous calendar year', () => {
    // New Year's Day 2028 falls on a Saturday, so the day off is Friday
    // 31 December 2027 — a 2028 holiday that lands in 2027, which is why the
    // generator has to reach a year either side of the range.
    const r = compute({ ...base, startDate: '2027-12-27', endDate: '2027-12-31' })
    expect(stepLabels(r)).toContain('New Year’s Day (observed)')
    expect(stepValue(r, 'New Year’s Day (observed)')).toBe('2027-12-31')
    // Mon-Fri, minus Christmas observed on the 24th (outside) and New Year on
    // the 31st (inside): 5 weekdays - 1 = 4.
    expect(Number(r.primary.value)).toBe(4)
    expect(walk('2027-12-27', '2027-12-31', OPM_SET).business).toBe(4)
  })

  test('the moving holidays follow their rules, not a table', () => {
    // Thanksgiving is the fourth Thursday in November, so it moves between the
    // 22nd and the 28th; Memorial Day is the last Monday in May, which is the
    // 25th in 2026 and the 31st in 2027.
    const thanksgiving = (year: number) => {
      const r = compute({ ...base, startDate: `${year}-11-01`, endDate: `${year}-11-30` })
      return String(stepValue(r, 'Thanksgiving Day'))
    }
    expect(thanksgiving(2026)).toBe('2026-11-26')
    expect(thanksgiving(2027)).toBe('2027-11-25')
    expect(thanksgiving(2028)).toBe('2028-11-23')

    const memorial = (year: number) => {
      const r = compute({ ...base, startDate: `${year}-05-01`, endDate: `${year}-05-31` })
      return String(stepValue(r, 'Memorial Day'))
    }
    expect(memorial(2026)).toBe('2026-05-25')
    expect(memorial(2027)).toBe('2027-05-31')

    // Every one of these is a Thursday, respectively a Monday.
    for (const iso of ['2026-11-26', '2027-11-25', '2028-11-23'])
      expect(new Date(atUtc(iso)).getUTCDay()).toBe(4)
    for (const iso of ['2026-05-25', '2027-05-31'])
      expect(new Date(atUtc(iso)).getUTCDay()).toBe(1)
  })

  test('Veterans Day sat in October from 1971 to 1977', () => {
    // The Uniform Monday Holiday Act put it on the fourth Monday in October;
    // Public Law 94-97 moved it back to 11 November from 1978.
    const october1976 = compute({ ...base, startDate: '1976-10-25', endDate: '1976-10-25' })
    expect(stepLabels(october1976)).toContain('Veterans Day')
    expect(Number(october1976.primary.value)).toBe(0)
    // 11 November 1976 was an ordinary Thursday that year.
    expect(
      Number(compute({ ...base, startDate: '1976-11-11', endDate: '1976-11-11' }).primary.value),
    ).toBe(1)

    // And from 1978 the November date is the holiday again. 11 November 1980
    // was a Tuesday, so no observance shift muddies the check.
    expect(
      Number(compute({ ...base, startDate: '1980-11-11', endDate: '1980-11-11' }).primary.value),
    ).toBe(0)
    // The fourth Monday in October 1980 is back to being a working day.
    expect(
      Number(compute({ ...base, startDate: '1980-10-27', endDate: '1980-10-27' }).primary.value),
    ).toBe(1)
  })

  test('holidays that did not exist yet are not deducted', () => {
    // Juneteenth became federal in 2021 and MLK Day in 1986.
    const juneteenth2020 = compute({ ...base, startDate: '2020-06-19', endDate: '2020-06-19' })
    expect(Number(juneteenth2020.primary.value)).toBe(1) // a Friday, and a normal one
    const juneteenth2021 = compute({ ...base, startDate: '2021-06-18', endDate: '2021-06-18' })
    expect(Number(juneteenth2021.primary.value)).toBe(0) // Sat 19 June 2021, observed Friday

    const mlk1985 = compute({ ...base, startDate: '1985-01-21', endDate: '1985-01-21' })
    expect(Number(mlk1985.primary.value)).toBe(1)
    const mlk1986 = compute({ ...base, startDate: '1986-01-20', endDate: '1986-01-20' })
    expect(Number(mlk1986.primary.value)).toBe(0)
  })

  // ── The counting itself ────────────────────────────────────────────────

  test('the closed form agrees with a day-by-day walk across many spans', () => {
    // Holidays off, so this isolates the week-block arithmetic: whole weeks are
    // 5 weekdays each plus a hand-counted remainder.
    const spans: Array<[string, string]> = [
      ['1971-01-01', '1971-01-01'],
      ['1971-01-01', '1971-12-31'],
      ['2024-02-01', '2024-02-29'],
      ['2026-01-01', '2026-12-31'],
      ['2026-07-04', '2026-07-12'],
      ['2026-07-06', '2026-07-10'],
      ['2027-02-27', '2027-03-02'],
      ['2030-12-31', '2031-01-01'],
      ['2199-12-01', '2199-12-31'],
    ]
    for (const [startDate, endDate] of spans) {
      const r = compute({ ...base, startDate, endDate, holidays: 'none' })
      const reference = walk(startDate, endDate, NO_HOLIDAYS)
      expect(Number(r.primary.value), `${startDate}..${endDate}`).toBe(reference.business)
      expect(Number(stat(r, 'Calendar days in the range'))).toBe(reference.total)
      expect(Number(stat(r, 'Weekend days'))).toBe(reference.weekend)
      expect(Number(stat(r, 'Public holidays'))).toBe(0)
    }
  })

  test('the holiday-aware count agrees with the walk over every span in 2026', () => {
    // Every start day of the week crossed with a range of lengths, so the
    // partial-week remainder branch is exercised from each weekday in turn, and
    // several of the spans straddle an observed holiday.
    for (let offset = 0; offset < 7; offset++) {
      for (const length of [0, 1, 2, 4, 6, 9, 27, 89, 200]) {
        const startMs = atUtc('2026-06-28') + offset * MS_PER_DAY
        const startDate = isoOf(startMs)
        const endDate = isoOf(startMs + length * MS_PER_DAY)
        const r = compute({ ...base, startDate, endDate })
        const reference = walk(startDate, endDate, OPM_SET)
        const where = `${startDate}..${endDate}`
        expect(Number(r.primary.value), where).toBe(reference.business)
        expect(Number(stat(r, 'Weekend days')), where).toBe(reference.weekend)
        expect(Number(stat(r, 'Public holidays')), where).toBe(reference.holiday)
        expect(Number(stat(r, 'Calendar days in the range')), where).toBe(reference.total)
      }
    }
  })

  test('a single-day span is one day, and reads as the day it is', () => {
    // Monday 6 July 2026 — an ordinary working day.
    const working = compute({ ...base, startDate: '2026-07-06', endDate: '2026-07-06' })
    expect(Number(working.primary.value)).toBe(1)
    expect(working.primary.format).toMatchObject({ unit: 'day' })
    expect(Number(working.partsTotal!.value)).toBe(1)

    // Saturday 4 July 2026 — one calendar day, and none of it is business.
    const weekend = compute({ ...base, startDate: '2026-07-04', endDate: '2026-07-04' })
    expect(Number(weekend.primary.value)).toBe(0)
    expect(weekend.parts!.map((p) => p.value)).toEqual([0, 1, 0])

    // Friday 3 July 2026 — a weekday, but the observed holiday.
    const holiday = compute({ ...base, startDate: '2026-07-03', endDate: '2026-07-03' })
    expect(holiday.parts!.map((p) => p.value)).toEqual([0, 0, 1])
  })

  test('a span that starts and ends on a weekend', () => {
    // Saturday 4 July 2026 to Sunday 12 July 2026: 9 days, two full weekends
    // bracketing one working week. The observed holiday (Friday the 3rd) sits
    // just outside, so it must NOT be deducted.
    const r = compute({ ...base, startDate: '2026-07-04', endDate: '2026-07-12' })
    expect(Number(r.primary.value)).toBe(5)
    expect(Number(stat(r, 'Weekend days'))).toBe(4)
    expect(Number(stat(r, 'Public holidays'))).toBe(0)
    expect(walk('2026-07-04', '2026-07-12', OPM_SET)).toEqual({
      total: 9,
      business: 5,
      weekend: 4,
      holiday: 0,
    })
  })

  test('leap years are counted as they fall', () => {
    // February 2024 has 29 days and starts on a Thursday: four whole weeks give
    // 20 weekdays and the leftover Thursday the 29th gives one more, so 21
    // weekdays, less Washington's Birthday on Monday 19 February.
    const leap = compute({ ...base, startDate: '2024-02-01', endDate: '2024-02-29' })
    expect(Number(stat(leap, 'Calendar days in the range'))).toBe(29)
    expect(Number(leap.primary.value)).toBe(20)
    expect(walk('2024-02-01', '2024-02-29', OPM_SET).business).toBe(20)

    // The same month in a common year is a day shorter.
    const common = compute({ ...base, startDate: '2025-02-01', endDate: '2025-02-28' })
    expect(Number(stat(common, 'Calendar days in the range'))).toBe(28)
    expect(Number(common.primary.value)).toBe(walk('2025-02-01', '2025-02-28', OPM_SET).business)

    // A whole leap year is 366 days; a whole common year 365.
    expect(
      Number(stat(compute({ ...base, startDate: '2024-01-01', endDate: '2024-12-31' }), 'Calendar days in the range')),
    ).toBe(366)
    expect(
      Number(stat(compute({ ...base, startDate: '2025-01-01', endDate: '2025-12-31' }), 'Calendar days in the range')),
    ).toBe(365)
    // 2100 is divisible by 4 but is not a leap year.
    expect(
      Number(stat(compute({ ...base, startDate: '2100-01-01', endDate: '2100-12-31' }), 'Calendar days in the range')),
    ).toBe(365)
  })

  // ── Adding business days ───────────────────────────────────────────────

  test('adding business days steps over a weekend and an observed holiday', () => {
    // From Wednesday 1 July 2026, ten business days: 2nd (1), then the 3rd is
    // the observed Independence Day and the 4th and 5th are the weekend, so
    // 6th (2), 7th (3), 8th (4), 9th (5), 10th (6), 13th (7), 14th (8),
    // 15th (9), 16th (10).
    const r = compute({ ...base, mode: 'add', startDate: '2026-07-01', businessDays: 10 })
    expect(r.primary.value).toBe('Thursday, 16 July 2026')
    expect(stepValue(r, 'Arrival date')).toBe('2026-07-16')
    expect(Number(stat(r, 'Business days'))).toBe(10)
    expect(Number(stat(r, 'Calendar days to wait'))).toBe(15)

    // The same wait with holidays off lands a day earlier, which is the whole
    // point of the holiday setting.
    const noHolidays = compute({ ...base, mode: 'add', startDate: '2026-07-01', businessDays: 10, holidays: 'none' })
    expect(stepValue(noHolidays, 'Arrival date')).toBe('2026-07-15')

    // And the wait itself decomposes the way the walk says it does.
    expect(walk('2026-07-02', '2026-07-16', OPM_SET)).toEqual({
      total: 15,
      business: 10,
      weekend: 4,
      holiday: 1,
    })
  })

  test('one business day is the next working day, never the start date', () => {
    // Friday 10 July 2026 + 1 lands on the Monday.
    expect(
      compute({ ...base, mode: 'add', startDate: '2026-07-10', businessDays: 1 }).primary.value,
    ).toBe('Monday, 13 July 2026')
    // Thursday 2 July 2026 + 1 skips the observed holiday AND the weekend.
    expect(
      compute({ ...base, mode: 'add', startDate: '2026-07-02', businessDays: 1 }).primary.value,
    ).toBe('Monday, 6 July 2026')
    // With holidays off it is only the weekend that is skipped.
    expect(
      compute({ ...base, mode: 'add', startDate: '2026-07-02', businessDays: 1, holidays: 'none' })
        .primary.value,
    ).toBe('Friday, 3 July 2026')
  })

  test('adding crosses a leap day correctly', () => {
    // Tuesday 27 February 2024: the 28th (1), the 29th (2), 1 March (3).
    expect(
      compute({ ...base, mode: 'add', startDate: '2024-02-27', businessDays: 3 }).primary.value,
    ).toBe('Friday, 1 March 2024')
    // 2023 has no 29 February, so the same sum lands a day further into March.
    expect(
      compute({ ...base, mode: 'add', startDate: '2023-02-27', businessDays: 3 }).primary.value,
    ).toBe('Thursday, 2 March 2023')
  })

  test('adding N and counting back gives N again, for every N and every start weekday', () => {
    // The two modes are separate code paths — a walk forward and a closed-form
    // count — so agreeing is real evidence. The reference count is the
    // day-by-day walk over the wait, using the platform weekday and the OPM
    // holiday table.
    for (let offset = 0; offset < 7; offset++) {
      const startDate = isoOf(atUtc('2026-06-28') + offset * MS_PER_DAY)
      for (const businessDays of [1, 2, 3, 5, 8, 21, 60, 130]) {
        const r = compute({ ...base, mode: 'add', startDate, businessDays })
        const arrival = String(stepValue(r, 'Arrival date'))
        const where = `${startDate} + ${businessDays}`

        // The arrival day is itself a working day.
        expect(new Date(atUtc(arrival)).getUTCDay(), where).not.toBe(0)
        expect(new Date(atUtc(arrival)).getUTCDay(), where).not.toBe(6)
        expect(OPM_SET.has(arrival), where).toBe(false)

        // The day after the start through to the arrival contains exactly N.
        const firstCounted = isoOf(atUtc(startDate) + MS_PER_DAY)
        const reference = walk(firstCounted, arrival, OPM_SET)
        expect(reference.business, where).toBe(businessDays)
        expect(Number(stat(r, 'Business days')), where).toBe(businessDays)
        expect(Number(stat(r, 'Calendar days to wait')), where).toBe(reference.total)
        expect(Number(stat(r, 'Weekend days')), where).toBe(reference.weekend)
        expect(Number(stat(r, 'Public holidays')), where).toBe(reference.holiday)

        // Counting the same span in the other mode agrees too.
        const counted = compute({ ...base, mode: 'between', startDate: firstCounted, endDate: arrival })
        expect(Number(counted.primary.value), where).toBe(businessDays)
      }
    }
  })

  test('the walk horizon covers the largest addition the field offers', () => {
    // 260 business days is the top of the slider, and the guard that refuses
    // when the walk runs out of horizon must never fire for a value the control
    // can reach. Each start is chosen so the arrival still lands inside the
    // 2024-2028 window the OPM reference table covers.
    for (const startDate of ['2024-01-01', '2025-06-30', '2026-01-01', '2027-01-04']) {
      const r = compute({ ...base, mode: 'add', startDate, businessDays: 260 })
      expect(Number(stat(r, 'Business days'))).toBe(260)
      const arrival = String(stepValue(r, 'Arrival date'))
      const firstCounted = isoOf(atUtc(startDate) + MS_PER_DAY)
      expect(walk(firstCounted, arrival, OPM_SET).business).toBe(260)
    }
  })

  // ── Result shape ───────────────────────────────────────────────────────

  test('parts always number three and always sum to the span', () => {
    const cases: Input[] = [
      base,
      { ...base, holidays: 'none' },
      { ...base, startDate: '2026-07-04', endDate: '2026-07-04' },
      { ...base, startDate: '2026-01-01', endDate: '2026-12-31' },
      { ...base, mode: 'add', businessDays: 1 },
      { ...base, mode: 'add', businessDays: 260 },
      { ...base, mode: 'add', businessDays: 10, holidays: 'none' },
    ]
    for (const input of cases) {
      const r = compute(input)
      expect(r.parts).toHaveLength(3)
      expect(r.parts!.map((p) => p.label)).toEqual([
        'Business days',
        'Weekend days',
        'Public holidays',
      ])
      const sum = r.parts!.reduce((acc, p) => acc + p.value, 0)
      expect(sum).toBeCloseTo(Number(r.partsTotal!.value), 4)
      for (const part of r.parts!) {
        expect(Number.isFinite(part.value)).toBe(true)
        expect(part.value).toBeGreaterThanOrEqual(0)
      }
      expect(r.series).toBeUndefined()
    }
  })

  test('long dates are spelled out from a fixed table, in both modes', () => {
    // No `toLocaleDateString` anywhere: compute runs in Node at build time and
    // again in the browser, and the two have to produce the same string.
    const added = compute({ ...base, mode: 'add', startDate: '2026-07-01', businessDays: 10 })
    expect(added.primary.value).toBe('Thursday, 16 July 2026')
    expect(added.primary.format).toEqual({ style: 'raw' })
    expect(stat(added, 'Start date')).toBe('Wednesday, 1 July 2026')

    const counted = compute(base)
    expect(stat(counted, 'Start date')).toBe('Wednesday, 1 July 2026')
    expect(stat(counted, 'End date')).toBe('Tuesday, 14 July 2026')

    // The weekday named is the weekday the platform agrees on.
    expect(new Date(atUtc('2026-07-16')).getUTCDay()).toBe(4) // Thursday
    expect(new Date(atUtc('2026-07-01')).getUTCDay()).toBe(3) // Wednesday
  })

  test('the steps stay ISO, where a machine-readable date is the useful one', () => {
    const r = compute(base)
    expect(stepValue(r, 'Start date')).toBe('2026-07-01')
    expect(stepValue(r, 'End date')).toBe('2026-07-14')
  })

  test('a span with no holidays says so rather than showing nothing', () => {
    const none = compute({ ...base, startDate: '2026-07-06', endDate: '2026-07-10' })
    expect(stepValue(none, 'Public holidays in this span')).toBe('None')
    const off = compute({ ...base, holidays: 'none' })
    expect(stepValue(off, 'Public holidays in this span')).toBe('Not observed')
  })

  test('a long range summarises the holidays it does not list', () => {
    // Five years is 55-odd holidays; the steps name twelve and count the rest.
    const r = compute({ ...base, startDate: '2024-01-01', endDate: '2028-12-31' })
    const total = Number(stat(r, 'Public holidays'))
    expect(total).toBe(OPM_SET.size)
    expect(Number(stepValue(r, 'Further holidays, not listed'))).toBe(total - 12)
  })

  test('is pure — the same input gives the same output', () => {
    expect(compute(base)).toEqual(compute(base))
    const adding: Input = { ...base, mode: 'add' }
    expect(compute(adding)).toEqual(compute(adding))
  })

  test('the calculator accepts its own default inputs', () => {
    // Both dates default to 'today', so whatever day the site is built on, the
    // starting state must compute rather than throw — and the donut must have
    // something to draw, since the server renders it from this result alone.
    const defaults = defaultValues({ fields }) as Input
    expect(() => compute(defaults)).not.toThrow()
    const r = compute(defaults)
    expect(r.parts).toHaveLength(3)
    expect(Number(r.partsTotal!.value)).toBeGreaterThan(0)
    expect(Number(stat(r, 'Business days'))).toBe(10)

    // The default mode is the one with a number field to drive, because the
    // end-to-end suite nudges the first number field and expects the result to
    // move. A date field cannot be nudged that way.
    expect(fields[0]!.default).toBe('add')
    expect(fields.find((f) => f.kind === 'number')!.id).toBe('businessDays')

    // Both date defaults resolve to the same day, so no ordering check can fail
    // on any build date.
    expect(fields.filter((f) => f.kind === 'date').map((f) => f.default)).toEqual([
      'today',
      'today',
    ])
    expect(defaults.startDate).toBe(defaults.endDate)
  })

  test('the nudge the end-to-end suite applies changes the answer', () => {
    // tests/calculators.spec.ts sets the first number field to 1.1x its default.
    const at10 = compute({ ...base, mode: 'add', startDate: '2026-07-01', businessDays: 10 })
    const at11 = compute({ ...base, mode: 'add', startDate: '2026-07-01', businessDays: 11 })
    expect(at11.primary.value).not.toBe(at10.primary.value)
  })

  // ── Refusals ───────────────────────────────────────────────────────────

  const BAD_INPUTS: Array<[string, Partial<Input>, string]> = [
    ['a malformed start date', { startDate: '01/07/2026' }, 'startDate'],
    ['a malformed end date', { endDate: 'next tuesday' }, 'endDate'],
    ['a date that does not exist', { startDate: '2026-02-30' }, 'startDate'],
    ['a non-leap 29 February', { endDate: '2026-02-29' }, 'endDate'],
    ['an end date before the start date', { endDate: '2026-06-30' }, 'endDate'],
    ['a year before the modern holiday rules', { startDate: '1970-12-31' }, 'startDate'],
    ['a year past the supported range', { endDate: '2200-01-01' }, 'endDate'],
  ]

  test.each(BAD_INPUTS)('rejects %s', (_label, patch, fieldId) => {
    let thrown: unknown
    try {
      compute({ ...base, ...patch })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
  })

  const BAD_COUNTS: Array<[string, number]> = [
    ['an unparseable count', Number.NaN],
    ['an infinite count', Number.POSITIVE_INFINITY],
    ['zero business days', 0],
    ['a negative count', -5],
    ['a fractional count', 3.5],
    ['more than a working year', 261],
  ]

  test.each(BAD_COUNTS)('rejects %s against the businessDays field', (_label, businessDays) => {
    let thrown: unknown
    try {
      compute({ ...base, mode: 'add', businessDays })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe('businessDays')
    // NaN must never reach the arithmetic: the finiteness guard comes first,
    // because `businessDays < 1` is false for NaN.
    expect((thrown as CalcError).message).not.toMatch(/NaN/)
  })

  test('a stale count does not block a range that never uses it', () => {
    // The number stays visible in the form while counting a range, so a value
    // the adding mode would refuse must not refuse the range too.
    expect(() => compute({ ...base, businessDays: Number.NaN })).not.toThrow()
    expect(Number(compute({ ...base, businessDays: 0 }).primary.value)).toBe(9)
  })

  test('never renders NaN, in either mode', () => {
    for (const input of [base, { ...base, mode: 'add' } as Input]) {
      const r = compute(input)
      for (const q of [r.primary, ...r.stats!, ...r.steps!, r.partsTotal!]) {
        if (!('label' in q)) continue
        if (q.format.style !== 'raw') expect(Number.isFinite(Number(q.value))).toBe(true)
        expect(formatValue(q.value, q.format)).not.toMatch(/NaN|Infinity|—/)
      }
      for (const note of r.notes!) expect(note).not.toMatch(/NaN|undefined/)
    }
  })
})

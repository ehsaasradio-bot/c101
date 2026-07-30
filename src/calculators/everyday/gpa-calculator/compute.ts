import { CalcError } from '../../../lib/types'
import type { CalcResult, Part, Quantity, Series, Values } from '../../../lib/types'
import type { fields } from './fields'

/*
 * Grade point average, the standard US 4.0 scale.
 *
 *   quality points = grade point x credit hours, per course
 *   GPA            = total quality points / total credit hours
 *
 * The weight is the credit hours, so the divisor is the SUM OF CREDITS and not
 * the number of courses. Dividing by the course count is the classic error: it
 * silently turns a weighted mean into a plain one and only agrees with the
 * right answer when every course carries the same credit.
 *
 * The letter table below is the one used by essentially every US registrar
 * (A = 4.0, each modifier +/- 0.3, F = 0). A+ is 4.0 here: a handful of schools
 * award 4.3, but capping at 4.0 is the common case and the one the AACRAO
 * conversion tables describe.
 *
 * On the weighted scale, AP and IB courses earn +1.0 and honours courses +0.5,
 * which is what makes 5.0 the top of that scale. The bonus applies to passing
 * grades only — a failed AP course is still 0.0, not 1.0.
 */

const GRADE_POINTS: Readonly<Record<string, number | undefined>> = {
  'A+': 4.0,
  A: 4.0,
  'A-': 3.7,
  'B+': 3.3,
  B: 3.0,
  'B-': 2.7,
  'C+': 2.3,
  C: 2.0,
  'C-': 1.7,
  'D+': 1.3,
  D: 1.0,
  'D-': 0.7,
  F: 0.0,
}

/** Top of the unweighted table; the weighted ceiling is this plus the bonus. */
const UNWEIGHTED_MAX = 4.0

const AP_BONUS = 1.0
const HONOURS_BONUS = 0.5

/** How many further terms the projection looks ahead. Fixed, so the chart's shape never depends on the course count. */
const TERMS_AHEAD = 8

const GPA_FMT = { style: 'decimal', decimals: 2 } as const
const CREDIT_FMT = { style: 'decimal', decimals: 1 } as const
const POINT_FMT = { style: 'decimal', decimals: 2 } as const

interface Course {
  name: string
  grade: string
  credits: number
}

/**
 * A permissive sweep used only to find where each entry STARTS. Names are
 * matched lazily and may contain spaces, so `Organic Chemistry` survives; the
 * credits digits are consumed as part of their own entry, so they can never be
 * mistaken for the beginning of the next course's name.
 */
const ENTRY_SCAN = /([^,;:]*?)\s*:\s*([A-Za-z][+-]?)(?:\s*[,;]\s*|\s+)?(\d+(?:\.\d+)?)?/g

/** The real validator, applied to one sliced-out entry at a time so the error can name it. */
const ENTRY_STRICT =
  /^([^:]*?)\s*:\s*([A-Za-z][A-Za-z+-]*)\s*(?:[,;]\s*|\s+)?(\d+(?:\.\d+)?)?\s*[,;]?\s*$/

const GRADE_TOKEN = /^[A-Za-z][+-]?$/
const NUMBER_TOKEN = /^\d+(?:\.\d+)?$/

const FORMAT_HINT = 'Write each course as "Biology: A, 4" and separate them with semicolons.'

/**
 * `kind: 'text'` is a single-line input, so newlines pasted from a spreadsheet
 * arrive already flattened to spaces. Unicode minus and en dash are folded to a
 * plain hyphen so a grade copied out of a PDF still reads as `A-`.
 */
function normalise(raw: string): string {
  return raw
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function lookUpGrade(grade: string, courseName: string): number {
  const key = grade.toUpperCase()
  const point = GRADE_POINTS[key]
  if (point === undefined) {
    throw new CalcError(
      `"${grade}" in "${courseName}" is not a grade I recognise. Use A+ through F, and leave pass/fail courses out.`,
      'courses',
    )
  }
  return point
}

function checkCredits(credits: number, courseName: string): number {
  if (!Number.isFinite(credits) || credits <= 0) {
    throw new CalcError(`"${courseName}" needs credit hours greater than 0.`, 'courses')
  }
  if (credits > 30) {
    throw new CalcError(`"${courseName}" has more than 30 credit hours, which looks like a typo.`, 'courses')
  }
  return credits
}

/** Entries carry a name: `Organic Chemistry: A-, 4; Honors Calculus II: B+, 4`. */
function parseNamed(text: string): Course[] {
  const starts = [...text.matchAll(ENTRY_SCAN)].map((m) => m.index ?? 0)
  if (starts.length === 0) {
    throw new CalcError(`Could not read "${text}". ${FORMAT_HINT}`, 'courses')
  }

  const courses: Course[] = []
  starts.forEach((start, i) => {
    // The first slice reaches back to 0 so any leading junk is validated too.
    const slice = text.slice(i === 0 ? 0 : start, i + 1 < starts.length ? starts[i + 1] : undefined)
    const m = ENTRY_STRICT.exec(slice)
    if (!m) throw new CalcError(`Could not read "${slice.trim()}". ${FORMAT_HINT}`, 'courses')

    const name = m[1]!.trim() || `Course ${i + 1}`
    // No credits given means the course counts once, which is how a plain list
    // of letter grades is meant to average.
    const credits = m[3] === undefined ? 1 : Number(m[3])
    courses.push({ name, grade: m[2]!, credits: checkCredits(credits, name) })
  })
  return courses
}

/** No colon anywhere: a bare `A 4, B+ 3` or even `A B+ C`. */
function parsePairs(text: string): Course[] {
  const tokens = text.split(/[,;\s]+/).filter((t) => t.length > 0)
  const courses: Course[] = []
  let creditsGiven = false

  for (const token of tokens) {
    if (GRADE_TOKEN.test(token) && GRADE_POINTS[token.toUpperCase()] !== undefined) {
      courses.push({ name: `Course ${courses.length + 1}`, grade: token, credits: 1 })
      creditsGiven = false
    } else if (NUMBER_TOKEN.test(token)) {
      const current = courses[courses.length - 1]
      if (!current || creditsGiven) {
        throw new CalcError(`"${token}" has no grade in front of it. ${FORMAT_HINT}`, 'courses')
      }
      current.credits = checkCredits(Number(token), current.name)
      creditsGiven = true
    } else {
      throw new CalcError(`"${token}" is not a grade or a credit count. ${FORMAT_HINT}`, 'courses')
    }
  }
  return courses
}

function parseCourses(raw: string): Course[] {
  const text = normalise(raw)
  if (text.length === 0) throw new CalcError(`Enter at least one course. ${FORMAT_HINT}`, 'courses')

  const courses = text.includes(':') ? parseNamed(text) : parsePairs(text)
  if (courses.length === 0) {
    throw new CalcError(`Enter at least one course. ${FORMAT_HINT}`, 'courses')
  }
  return courses
}

/**
 * The weighted bonus, read off the course name the way a transcript reads.
 * Whole words only, so `Rap Music` is not an AP course and `Spanish II` is not
 * an IB one.
 */
function levelBonus(name: string): number {
  if (/\b(ap|ib)\b/i.test(name)) return AP_BONUS
  if (/\b(honou?rs?|hons?)\b/i.test(name)) return HONOURS_BONUS
  return 0
}

export default function compute(v: Values<typeof fields>): CalcResult {
  const { courses: raw, scaleType, priorGpa, priorCredits } = v

  // Finiteness first: coerceValues emits NaN for unparseable input, and a
  // magnitude test like `priorGpa < 0` is FALSE for NaN, so it would slip past.
  if (!Number.isFinite(priorGpa)) {
    throw new CalcError('Enter your previous GPA as a number between 0 and 5.', 'priorGpa')
  }
  if (priorGpa < 0 || priorGpa > 5) {
    throw new CalcError('A GPA sits between 0 and 5. Enter 0 if you have no previous grades.', 'priorGpa')
  }
  if (!Number.isFinite(priorCredits)) {
    throw new CalcError('Enter the credits you have already earned as a number.', 'priorCredits')
  }
  if (priorCredits < 0 || priorCredits > 300) {
    throw new CalcError('Enter between 0 and 300 credits already earned.', 'priorCredits')
  }

  const weighted = scaleType === 'weighted'
  const parsed = parseCourses(raw)

  const rows = parsed.map((course) => {
    const base = lookUpGrade(course.grade, course.name)
    const bonus = weighted ? levelBonus(course.name) : 0
    // A failed course earns nothing, bonus or not.
    const point = base > 0 ? base + bonus : 0
    const ceiling = UNWEIGHTED_MAX + bonus
    return {
      ...course,
      base,
      bonus,
      point,
      ceiling,
      qualityPoints: point * course.credits,
      maxQualityPoints: ceiling * course.credits,
    }
  })

  const termCredits = rows.reduce((sum, r) => sum + r.credits, 0)
  const termQualityPoints = rows.reduce((sum, r) => sum + r.qualityPoints, 0)
  const termMaxPoints = rows.reduce((sum, r) => sum + r.maxQualityPoints, 0)

  // The weight is credit hours. Dividing by rows.length here would be the
  // unweighted-mean bug the whole calculator exists to avoid.
  const termGpa = termQualityPoints / termCredits

  const priorQualityPoints = priorGpa * priorCredits
  const totalCredits = termCredits + priorCredits
  const totalQualityPoints = termQualityPoints + priorQualityPoints
  const cumulativeGpa = totalQualityPoints / totalCredits

  // Exactly two parts, always: the count must not follow the course count, or
  // the donut would gain a slice every time someone adds a class. Derived by
  // subtraction so the two sum to the whole by construction, then clamped
  // because floating point lands a perfect score a hair below zero.
  const shortfall = Math.max(0, termMaxPoints - termQualityPoints)
  const parts: Part[] = [
    { label: 'Quality points earned', value: termQualityPoints, format: POINT_FMT },
    { label: 'Points short of the maximum', value: shortfall, format: POINT_FMT },
  ]

  // One series, always, with a fixed number of points: where the cumulative GPA
  // lands after each further term just like this one. Point 0 is today, so the
  // curve starts exactly on the headline rather than near it.
  const points: Array<readonly [number, number]> = []
  for (let t = 0; t <= TERMS_AHEAD; t++) {
    const repeats = 1 + t
    points.push([
      t,
      (priorQualityPoints + termQualityPoints * repeats) / (priorCredits + termCredits * repeats),
    ])
  }
  points[0] = [0, cumulativeGpa]
  const series: Series[] = [
    { label: 'Projected cumulative GPA', points, format: GPA_FMT },
  ]

  const stats: Quantity[] = [
    { label: 'GPA for these courses', value: termGpa, format: GPA_FMT },
    { label: 'Credits in these courses', value: termCredits, format: CREDIT_FMT },
    { label: 'Quality points from these courses', value: termQualityPoints, format: POINT_FMT },
    { label: 'Total credits', value: totalCredits, format: CREDIT_FMT },
    { label: 'Total quality points', value: totalQualityPoints, format: POINT_FMT },
    { label: 'Courses entered', value: rows.length, format: { style: 'decimal', decimals: 0 } },
  ]

  // The per-course breakdown lives here, where a varying count is harmless.
  for (const row of rows) {
    const bonusText = row.point > row.base ? ` (+${row.bonus.toFixed(1)} weighted)` : ''
    stats.push({
      label: row.name,
      value: `${row.grade.toUpperCase()} = ${row.point.toFixed(2)}${bonusText} x ${row.credits} credits = ${row.qualityPoints.toFixed(2)} quality points`,
      format: { style: 'raw' },
    })
  }

  const steps: Array<Quantity | { rule: true }> = [
    { label: 'Credits in these courses', value: termCredits, format: CREDIT_FMT },
    { label: 'Quality points (grade point x credits, summed)', value: termQualityPoints, format: POINT_FMT },
    { label: 'GPA for these courses = quality points / credits', value: termGpa, format: GPA_FMT },
    { rule: true },
    { label: 'Credits earned before this term', value: priorCredits, format: CREDIT_FMT },
    { label: 'Quality points before this term = GPA x credits', value: priorQualityPoints, format: POINT_FMT },
    { rule: true },
    { label: 'Total credits', value: totalCredits, format: CREDIT_FMT },
    { label: 'Total quality points', value: totalQualityPoints, format: POINT_FMT },
    { label: 'Cumulative GPA = total points / total credits', value: cumulativeGpa, format: GPA_FMT },
  ]

  const notes: string[] = []
  if (priorCredits === 0) {
    notes.push(
      'With no credits earned before this term, the cumulative GPA is simply the GPA of the courses listed above.',
    )
  }
  if (weighted) {
    notes.push(
      'Weighted scale: courses whose names contain AP or IB gain 1.0 grade point and those containing Honors gain 0.5, applied to passing grades only. Schools vary — check your own handbook before quoting a weighted GPA.',
    )
  } else {
    notes.push(
      'Unweighted scale: every course counts on the same 4.0 table, so an A in an AP class and an A in a regular class are worth the same.',
    )
  }
  notes.push(
    'The projection assumes every future term repeats this one — the same credits at the same GPA — so it shows momentum rather than a promise.',
  )

  return {
    primary: { label: 'Cumulative GPA', value: cumulativeGpa, format: GPA_FMT },
    scaleValue: cumulativeGpa,
    stats,
    steps,
    parts,
    partsTotal: {
      label: 'Maximum for these courses',
      value: termMaxPoints,
      format: POINT_FMT,
    },
    series,
    notes,
  }
}

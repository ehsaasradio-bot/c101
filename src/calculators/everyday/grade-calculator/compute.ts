import { CalcError } from '../../../lib/types'
import type { CalcResult, Part, Quantity, Series, Values } from '../../../lib/types'
import type { fields } from './fields'

/*
 * "What do I need on the final?" — a weighted course grade, solved backwards.
 *
 * The forward maths is the ordinary weighted mean every syllabus describes.
 * With graded items i carrying score sᵢ and weight wᵢ, and a final worth wF:
 *
 *   W       = Σwᵢ + wF                     the whole course, as entered
 *   banked  = Σ(sᵢ × wᵢ) / W               points already locked in, out of 100
 *   share   = wF / W                       the final's fraction of the course
 *   grade(x) = banked + share × x          the course grade if the final scores x
 *
 * That last line is affine in x, so it inverts exactly — no search, no
 * iteration:
 *
 *   required = (target − banked) / share
 *
 * The inversion is the whole point of this page, and it is a different question
 * from the GPA calculator's: that one averages courses already finished, this
 * one solves a single course for a mark not yet earned.
 *
 * WEIGHTS THAT DO NOT SUM TO 100 ARE THE NORMAL CASE, not an error. Mid-semester
 * a syllabus is half entered, and a lab report worth 10% may simply not have
 * happened yet. Everything above divides by W — the total actually entered —
 * rather than by a hard-coded 100, which is the same as saying: the marks listed
 * plus the final ARE the course, each weight counting as its share of W. A note
 * says so in plain words whenever W ≠ 100, because the alternative reading (the
 * missing weight scores zero) would be a much more pessimistic answer and the
 * visitor has to know which one they are looking at.
 *
 * Two answers are frequently the honest ones, and neither is an error:
 *   required > 100  →  not attainable; report the best grade still reachable
 *   required ≤ 0    →  already guaranteed; report the worst grade still possible
 */

/** Scores above 100 exist (extra credit); this is the typo guard, not a cap at 100. */
const MAX_SCORE = 150

/** A single item cannot be worth more than the whole course. */
const MAX_ITEM_WEIGHT = 100

/** Marks plus the final adding to more than double a course is a typo, not a syllabus. */
const MAX_TOTAL_WEIGHT = 200

/**
 * Points on the "what if I score x on the final" line. FIXED, and deliberately
 * not derived from the number of marks entered — the assignment count is an
 * input, so a per-assignment point would make the chart's shape follow the
 * input. 0 to 100 in steps of 5.
 */
const CURVE_STEP = 5

/** Comparison slack. Number.EPSILON is the gap at 1.0 and vanishes at these magnitudes. */
const TOL = 1e-9

const PCT = { style: 'percent', decimals: 1 } as const
const PCT2 = { style: 'percent', decimals: 2 } as const
const POINTS = { style: 'decimal', decimals: 2 } as const
const COUNT = { style: 'decimal', decimals: 0 } as const

interface Mark {
  name: string
  score: number
  weight: number
}

const FORMAT_HINT =
  'Write each item as "Homework: 88, 15" — the score, then the weight — and separate them with semicolons.'

/**
 * A permissive sweep used only to find where each entry STARTS. Names are
 * matched lazily and may contain spaces and digits, so `Midterm 1` survives; a
 * name can never span a comma or semicolon, so the two numbers belonging to one
 * entry can never be read as the beginning of the next.
 */
const ENTRY_SCAN = /([^,;:]*?)\s*:\s*(\d+(?:\.\d+)?)\s*(?:[,;]\s*|\s+)(\d+(?:\.\d+)?)/g

/** The real validator, applied to one sliced-out entry so the error can name it. */
const ENTRY_STRICT = /^([^:]*?)\s*:\s*(\d+(?:\.\d+)?)\s*(?:[,;]\s*|\s+)(\d+(?:\.\d+)?)\s*[,;]?\s*$/

const NUMBER_TOKEN = /^\d+(?:\.\d+)?$/

/**
 * `kind: 'text'` is a single-line input, so newlines pasted from a spreadsheet
 * arrive already flattened to spaces. Percent signs are dropped because people
 * type them, and Unicode dashes are folded so a paste out of a PDF still parses.
 */
function normalise(raw: string): string {
  return raw
    .replace(/[‐-―−]/g, '-')
    .replace(/%/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function checkScore(score: number, name: string): number {
  if (!Number.isFinite(score) || score < 0) {
    throw new CalcError(`"${name}" needs a score of 0 or more.`, 'marks')
  }
  if (score > MAX_SCORE) {
    throw new CalcError(
      `"${name}" scores ${score}%, which is above ${MAX_SCORE}% and looks like a typo. Convert points to a percentage first.`,
      'marks',
    )
  }
  return score
}

function checkWeight(weight: number, name: string): number {
  if (!Number.isFinite(weight) || weight <= 0) {
    throw new CalcError(`"${name}" needs a weight greater than 0.`, 'marks')
  }
  if (weight > MAX_ITEM_WEIGHT) {
    throw new CalcError(
      `"${name}" is weighted ${weight}%, which is more than the whole course.`,
      'marks',
    )
  }
  return weight
}

/** Entries carry a name: `Homework: 88, 15; Midterm 1: 84, 20`. */
function parseNamed(text: string): Mark[] {
  const starts = [...text.matchAll(ENTRY_SCAN)].map((m) => m.index ?? 0)
  if (starts.length === 0) {
    throw new CalcError(`Could not read "${text}". ${FORMAT_HINT}`, 'marks')
  }

  const marks: Mark[] = []
  starts.forEach((start, i) => {
    // The first slice reaches back to 0 so any leading junk is validated too.
    const slice = text.slice(i === 0 ? 0 : start, i + 1 < starts.length ? starts[i + 1] : undefined)
    const m = ENTRY_STRICT.exec(slice)
    if (!m) throw new CalcError(`Could not read "${slice.trim()}". ${FORMAT_HINT}`, 'marks')

    const name = m[1]!.trim() || `Item ${i + 1}`
    marks.push({
      name,
      score: checkScore(Number(m[2]), name),
      weight: checkWeight(Number(m[3]), name),
    })
  })
  return marks
}

/** No colon anywhere: a bare `88 15, 79 15` read as score/weight pairs. */
function parsePairs(text: string): Mark[] {
  const tokens = text.split(/[,;\s]+/).filter((t) => t.length > 0)
  for (const token of tokens) {
    if (!NUMBER_TOKEN.test(token)) {
      throw new CalcError(`"${token}" is not a number. ${FORMAT_HINT}`, 'marks')
    }
  }
  if (tokens.length % 2 !== 0) {
    throw new CalcError(
      `Every mark needs a weight as well as a score, so the list has to come in pairs — ${tokens.length} numbers is an odd count. ${FORMAT_HINT}`,
      'marks',
    )
  }

  const marks: Mark[] = []
  for (let i = 0; i < tokens.length; i += 2) {
    const name = `Item ${marks.length + 1}`
    marks.push({
      name,
      score: checkScore(Number(tokens[i]), name),
      weight: checkWeight(Number(tokens[i + 1]), name),
    })
  }
  return marks
}

function parseMarks(raw: string): Mark[] {
  const text = normalise(raw)
  if (text.length === 0) {
    throw new CalcError(`Enter at least one mark. ${FORMAT_HINT}`, 'marks')
  }
  const marks = text.includes(':') ? parseNamed(text) : parsePairs(text)
  if (marks.length === 0) {
    throw new CalcError(`Enter at least one mark. ${FORMAT_HINT}`, 'marks')
  }
  return marks
}

/** One decimal place, for sentences rather than for the formatter. */
const p1 = (n: number) => `${n.toFixed(1)}%`

export default function compute(v: Values<typeof fields>): CalcResult {
  const { marks: raw, finalWeight, targetGrade } = v

  // Finiteness FIRST: coerceValues emits NaN for unparseable input, and a
  // magnitude test like `finalWeight <= 0` is FALSE for NaN, so NaN would slip
  // straight through a guard written the other way round.
  if (!Number.isFinite(finalWeight)) {
    throw new CalcError('Enter the weight of the final exam as a number.', 'finalWeight')
  }
  // The final's weight is the divisor of the inversion. At zero the final cannot
  // move the grade at all, so "what do I need on it" has no answer — reject it
  // against its own field rather than returning Infinity.
  if (finalWeight <= 0) {
    throw new CalcError(
      'The final has to be worth something. With a weight of 0 it cannot change your grade, so there is no score that would get you to your target.',
      'finalWeight',
    )
  }
  if (finalWeight > MAX_ITEM_WEIGHT) {
    throw new CalcError('The final cannot be worth more than the whole course.', 'finalWeight')
  }
  if (!Number.isFinite(targetGrade)) {
    throw new CalcError('Enter the grade you are aiming for as a number.', 'targetGrade')
  }
  if (targetGrade < 0 || targetGrade > 100) {
    throw new CalcError('Enter a target grade between 0 and 100.', 'targetGrade')
  }

  const marks = parseMarks(raw)

  const gradedWeight = marks.reduce((sum, m) => sum + m.weight, 0)
  const totalWeight = gradedWeight + finalWeight
  if (totalWeight > MAX_TOTAL_WEIGHT) {
    throw new CalcError(
      `Your weights add up to ${p1(totalWeight)} including the final, which is more than double a whole course. Check for a typo.`,
      'marks',
    )
  }

  // Weighted points, in the units the course is graded in.
  const weightedPoints = marks.reduce((sum, m) => sum + m.score * m.weight, 0)

  // The grade if the course ended right now: the mean over GRADED work only.
  const gradeSoFar = weightedPoints / gradedWeight
  // The share of the finished course already banked, out of 100.
  const banked = weightedPoints / totalWeight
  const share = finalWeight / totalWeight

  const bestPossible = banked + 100 * share
  const worstPossible = banked

  // The inversion. share > 0 is guaranteed by the finalWeight guard above.
  const required = (targetGrade - banked) / share

  const impossible = required > 100 + TOL
  const guaranteed = required <= TOL

  // Exactly two parts, always. The count must not follow the number of marks
  // entered, or the donut would gain a slice every time someone adds a quiz —
  // the per-item breakdown lives in `stats`, where a varying count is harmless.
  // They sum to `bestPossible` by construction, since that is defined as their
  // sum, and both are non-negative: scores are >= 0 and weights are > 0.
  const parts: Part[] = [
    { label: 'Already banked', value: banked, format: PCT },
    { label: 'Still available from the final', value: 100 * share, format: PCT },
  ]

  // One fixed pair of lines with a fixed 21 points each: the course grade as a
  // function of the score on the final, and the target it has to reach. Where
  // they cross is the headline, so the chart and the number cannot disagree —
  // both come from the same affine `banked + share * x`.
  const gradeLine: Array<readonly [number, number]> = []
  const targetLine: Array<readonly [number, number]> = []
  for (let x = 0; x <= 100; x += CURVE_STEP) {
    gradeLine.push([x, banked + share * x])
    targetLine.push([x, targetGrade])
  }
  // Pin the ends to the headline figures rather than letting the loop land near.
  gradeLine[0] = [0, worstPossible]
  gradeLine[gradeLine.length - 1] = [100, bestPossible]
  const series: Series[] = [
    { label: 'Course grade', points: gradeLine, format: PCT },
    { label: 'Your target', points: targetLine, format: PCT },
  ]

  const stats: Quantity[] = [
    { label: 'Grade so far (graded work only)', value: gradeSoFar, format: PCT },
    { label: 'Best possible grade (100% on the final)', value: bestPossible, format: PCT },
    { label: 'Worst possible grade (0% on the final)', value: worstPossible, format: PCT },
    { label: 'Weight already graded', value: gradedWeight, format: PCT },
    { label: 'Weight of the final', value: finalWeight, format: PCT },
    { label: 'Total weight entered', value: totalWeight, format: PCT },
    { label: 'Marks entered', value: marks.length, format: COUNT },
  ]

  // The per-item breakdown, where a count that follows the input is harmless.
  for (const mark of marks) {
    stats.push({
      label: mark.name,
      value: `${mark.score}% at a weight of ${mark.weight} = ${((mark.score * mark.weight) / totalWeight).toFixed(2)} of the 100 course points`,
      format: { style: 'raw' },
    })
  }

  const steps: Array<Quantity | { rule: true }> = [
    { label: 'Weight of the work already graded', value: gradedWeight, format: PCT },
    { label: 'Weight of the final', value: finalWeight, format: PCT },
    { label: 'Total weight entered = the whole course', value: totalWeight, format: PCT },
    { rule: true },
    { label: 'Weighted points so far (score x weight, summed)', value: weightedPoints, format: POINTS },
    { label: 'Grade so far = points / weight already graded', value: gradeSoFar, format: PCT },
    { label: 'Banked toward the final grade = points / total weight', value: banked, format: PCT },
    { rule: true },
    { label: 'Target grade', value: targetGrade, format: PCT },
    { label: 'Still needed = target - banked', value: targetGrade - banked, format: PCT2 },
    { label: "Final's share of the course = its weight / total weight", value: 100 * share, format: PCT },
    { label: 'Required score = still needed / share', value: required, format: PCT2 },
  ]

  const notes: string[] = []

  // The verdict, in words. An impossible or an already-met requirement is the
  // honest answer to the question asked, not a failure to answer it, so it is
  // stated plainly and the framing figure is given alongside.
  if (impossible) {
    notes.push(
      `You would need ${p1(required)} on the final, which is not attainable unless your course offers extra credit. Even a perfect 100% on the final leaves you at ${p1(bestPossible)} — that is the highest grade still reachable, and it falls ${(targetGrade - bestPossible).toFixed(1)} points short of your ${p1(targetGrade)} target.`,
    )
  } else if (guaranteed) {
    notes.push(
      `Your ${p1(targetGrade)} target is already guaranteed. Even scoring 0% on the final you would finish with ${p1(worstPossible)}, which is at or above the target, so any score at all keeps you there. The arithmetic gives ${p1(required)}; a requirement at or below zero simply means you have ${(worstPossible - targetGrade).toFixed(1)} points to spare.`,
    )
  } else {
    notes.push(
      `You need ${p1(required)} on the final to finish the course at ${p1(targetGrade)}. That is attainable: the final is worth ${p1(100 * share)} of the course, so scoring 100% would put you at ${p1(bestPossible)} and scoring 0% would leave you at ${p1(worstPossible)}.`,
    )
  }

  if (Math.abs(totalWeight - 100) > TOL) {
    notes.push(
      `Your weights add up to ${p1(totalWeight)} rather than 100%, which is the normal situation part-way through a course and is not an error. The marks listed plus the final are treated as the whole course, so each weight counts as its share of ${p1(totalWeight)}. If more graded work is still to come, add it — with the score you expect — and the answer will tighten.`,
    )
  } else {
    notes.push(
      'Your weights add up to exactly 100%, so the marks listed plus the final account for the whole course.',
    )
  }

  notes.push(
    'This is a single course solved backwards, which is a different question from a GPA. A GPA calculator averages courses you have already finished; this one takes the work you have done and the weight still outstanding and finds the mark you still need.',
  )

  return {
    primary: { label: 'Score needed on the final', value: required, format: PCT },
    // Clamped only for the dial: a required score of −190% or 143% has no place
    // on a 0–120 track, and the exact figure is the headline right above it.
    scaleValue: Math.min(120, Math.max(0, required)),
    stats,
    steps,
    parts,
    partsTotal: {
      label: 'Highest grade still reachable',
      value: bestPossible,
      format: PCT,
    },
    series,
    notes,
  }
}

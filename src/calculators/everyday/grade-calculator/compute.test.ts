import { describe, expect, test } from 'vitest'
import compute from './compute'
import { CalcError } from '../../../lib/types'
import { fields } from './fields'
import def from './index'
import { toResultView } from '../../../lib/view'

type Input = {
  marks: string
  finalWeight: number
  targetGrade: number
}

const DEFAULTS: Input = {
  marks: fields[0].default,
  finalWeight: fields[1].default,
  targetGrade: fields[2].default,
}

const at = (over: Partial<Input> = {}) => compute({ ...DEFAULTS, ...over })

const stat = (r: ReturnType<typeof compute>, label: string) =>
  r.stats!.find((s) => s.label === label)

const num = (r: ReturnType<typeof compute>, label: string) => Number(stat(r, label)!.value)

/**
 * An independent reference, written from the definition rather than from the
 * implementation. The course grade is a weighted mean over EVERYTHING entered,
 * the final included, so the divisor is the total weight and not a hard 100.
 */
function refGrade(
  pairs: ReadonlyArray<readonly [number, number]>,
  finalWeight: number,
  finalScore: number,
): number {
  let points = 0
  let weight = 0
  for (const [score, w] of pairs) {
    points += score * w
    weight += w
  }
  points += finalScore * finalWeight
  weight += finalWeight
  return points / weight
}

/** The same inversion, solved from the reference rather than shared with compute. */
function refRequired(
  pairs: ReadonlyArray<readonly [number, number]>,
  finalWeight: number,
  target: number,
): number {
  const totalWeight = pairs.reduce((s, [, w]) => s + w, 0) + finalWeight
  const banked = pairs.reduce((s, [score, w]) => s + score * w, 0) / totalWeight
  return ((target - banked) * totalWeight) / finalWeight
}

/** The default syllabus, spelled out by hand. */
const DEFAULT_ROWS = [
  [88, 15], // Homework
  [79, 15], // Quizzes
  [84, 20], // Midterm 1
  [76, 20], // Midterm 2
] as const

/** Builds a marks string with an arbitrary number of entries. */
const rowsToText = (rows: ReadonlyArray<readonly [number, number]>) =>
  rows.map(([s, w], i) => `Item ${i + 1}: ${s}, ${w}`).join('; ')

describe('grade — the inversion', () => {
  test('the default course: 5705 weighted points, 93.17% needed on the final', () => {
    const r = at()
    // 88x15 = 1320, 79x15 = 1185, 84x20 = 1680, 76x20 = 1520  ->  5705.
    // Cross-checked as integers, which removes any binary-fraction doubt.
    const integerPoints = 88 * 15 + 79 * 15 + 84 * 20 + 76 * 20
    expect(integerPoints).toBe(5705)

    // Weights: 15 + 15 + 20 + 20 = 70 graded, + 30 final = 100 exactly.
    expect(num(r, 'Weight already graded')).toBe(70)
    expect(num(r, 'Total weight entered')).toBe(100)

    // Grade so far divides by the GRADED weight: 5705 / 70 = 81.5.
    expect(num(r, 'Grade so far (graded work only)')).toBeCloseTo(81.5, 10)

    // Banked out of the whole course: 5705 / 100 = 57.05, so 0 on the final
    // finishes at 57.05 and 100 on the final finishes at 87.05.
    expect(num(r, 'Worst possible grade (0% on the final)')).toBeCloseTo(57.05, 10)
    expect(num(r, 'Best possible grade (100% on the final)')).toBeCloseTo(87.05, 10)

    // (85 − 57.05) / 0.30 = 27.95 / 0.30 = 93.1666…
    expect(Number(r.primary.value)).toBeCloseTo(27.95 / 0.3, 10)
    expect(Number(r.primary.value)).toBeCloseTo(93.16666666666667, 10)
    expect(Number(r.primary.value)).toBeCloseTo(refRequired(DEFAULT_ROWS, 30, 85), 10)
  })

  /**
   * The strongest check available: take the answer, enter it as an actual mark
   * carrying the final's weight, and confirm the finished course lands on the
   * target. This goes through the public parser and the public "grade so far"
   * figure, so it exercises the whole chain rather than the formula alone.
   */
  test.each([
    ['the default target', 85, 30],
    ['a target that needs a perfect score', 87.05, 30],
    ['a light final', 80, 10],
    ['a heavy final', 70, 60],
    ['a fractional target', 78.3, 45],
  ])('round trip: %s feeds back in and lands on the target', (_label, target, finalWeight) => {
    const required = Number(at({ targetGrade: target, finalWeight }).primary.value)
    expect(Number.isFinite(required)).toBe(true)

    // The final, sat and marked. Everything is now graded work, so "grade so
    // far" IS the finished course grade.
    const after = at({
      marks: `${DEFAULTS.marks}; Final Exam: ${required}, ${finalWeight}`,
      finalWeight,
      targetGrade: target,
    })
    expect(num(after, 'Grade so far (graded work only)')).toBeCloseTo(target, 8)

    // And the same thing again through the independent reference.
    expect(refGrade(DEFAULT_ROWS, finalWeight, required)).toBeCloseTo(target, 8)
  })

  test('a target equal to the best possible needs exactly 100, and the worst exactly 0', () => {
    const base = at()
    const best = num(base, 'Best possible grade (100% on the final)')
    const worst = num(base, 'Worst possible grade (0% on the final)')
    expect(Number(at({ targetGrade: best }).primary.value)).toBeCloseTo(100, 8)
    expect(Number(at({ targetGrade: worst }).primary.value)).toBeCloseTo(0, 8)
  })

  test('the chart line agrees with the headline at every point it draws', () => {
    const r = at()
    const [gradeLine, targetLine] = r.series!
    // The curve is the same affine function the inversion solves, so the point
    // at the required score has to sit on the target line.
    for (const [x, y] of gradeLine!.points) {
      expect(y).toBeCloseTo(refGrade(DEFAULT_ROWS, 30, x), 10)
    }
    expect(gradeLine!.points[0]![1]).toBeCloseTo(
      num(r, 'Worst possible grade (0% on the final)'),
      10,
    )
    expect(gradeLine!.points[gradeLine!.points.length - 1]![1]).toBeCloseTo(
      num(r, 'Best possible grade (100% on the final)'),
      10,
    )
    for (const [, y] of targetLine!.points) expect(y).toBe(85)
  })
})

describe('grade — the two answers that matter', () => {
  test('an unreachable target is reported in words, with the best grade still reachable', () => {
    // Banked 57.05 with 30% of the course left: 92 needs (92 − 57.05) / 0.3.
    const r = at({ targetGrade: 92 })
    const required = Number(r.primary.value)
    expect(required).toBeCloseTo(116.5, 10)
    expect(required).toBeGreaterThan(100)

    // Not an error, and not a bare number: a sentence.
    const verdict = r.notes![0]!
    expect(verdict).toContain('116.5%')
    expect(verdict).toContain('not attainable')
    expect(verdict).toContain('87.0%') // the best grade still reachable, 87.05
    expect(verdict).toContain('highest grade still reachable')
    expect(r.notes!.length).toBeGreaterThanOrEqual(3)

    // The dial clamps; the headline does not.
    expect(r.scaleValue).toBeCloseTo(116.5, 10)
    expect(toResultView(r, def.scale).bandLabel).toBe('Out of reach')
  })

  test('a target already met is reported in words, with the worst grade still possible', () => {
    // 55 is below the 57.05 already banked, so it is locked in.
    const r = at({ targetGrade: 55 })
    const required = Number(r.primary.value)
    expect(required).toBeCloseTo((55 - 57.05) / 0.3, 10)
    expect(required).toBeLessThan(0)

    const verdict = r.notes![0]!
    expect(verdict).toContain('already guaranteed')
    expect(verdict).toContain('0% on the final')
    expect(verdict).toContain('57.0%') // the worst possible grade, 57.05
    expect(verdict).toContain('points to spare')

    // Clamped to the left end of the dial rather than running off it.
    expect(r.scaleValue).toBe(0)
    expect(toResultView(r, def.scale).bandLabel).toBe('Comfortable')
  })

  test('the boundaries: exactly 100 is still attainable, exactly 0 is already guaranteed', () => {
    const best = num(at(), 'Best possible grade (100% on the final)')
    const worst = num(at(), 'Worst possible grade (0% on the final)')

    const atHundred = at({ targetGrade: best })
    expect(atHundred.notes![0]).toContain('You need')
    expect(atHundred.notes![0]).not.toContain('not attainable')

    const atZero = at({ targetGrade: worst })
    expect(atZero.notes![0]).toContain('already guaranteed')
  })

  test('an ordinary target reads as attainable and frames the answer with both ends', () => {
    const verdict = at().notes![0]!
    expect(verdict).toContain('You need 93.2%')
    expect(verdict).toContain('87.0%')
    expect(verdict).toContain('57.0%')
  })
})

describe('grade — weights that do not sum to 100', () => {
  test('a part-finished syllabus is normalised over what was entered, and says so', () => {
    // 15 + 20 graded, 30 final = 65 total. Nothing else is assumed.
    const r = at({ marks: 'Homework: 90, 15; Midterm: 70, 20' })
    expect(num(r, 'Total weight entered')).toBe(65)

    // 90x15 + 70x20 = 1350 + 1400 = 2750. Grade so far = 2750 / 35 = 78.571…
    expect(num(r, 'Grade so far (graded work only)')).toBeCloseTo(2750 / 35, 10)
    // Banked = 2750 / 65 = 42.307…, best = that + 100 x 30/65.
    expect(num(r, 'Worst possible grade (0% on the final)')).toBeCloseTo(2750 / 65, 10)
    expect(num(r, 'Best possible grade (100% on the final)')).toBeCloseTo(
      2750 / 65 + (100 * 30) / 65,
      10,
    )
    expect(Number(r.primary.value)).toBeCloseTo(
      refRequired(
        [
          [90, 15],
          [70, 20],
        ],
        30,
        85,
      ),
      10,
    )

    const note = r.notes!.find((n) => n.includes('rather than 100%'))
    expect(note).toBeDefined()
    expect(note).toContain('65.0%')
    expect(note).toContain('is not an error')
  })

  test('weights summing to exactly 100 get the other note', () => {
    const note = at().notes!.find((n) => n.includes('exactly 100%'))
    expect(note).toBeDefined()
  })

  test('weights over 100 are accepted and normalised the same way', () => {
    // 60 + 60 graded plus a 30 final = 150.
    const r = at({ marks: 'A: 80, 60; B: 60, 60' })
    expect(num(r, 'Total weight entered')).toBe(150)
    expect(num(r, 'Grade so far (graded work only)')).toBeCloseTo(70, 10)
    expect(Number(r.primary.value)).toBeCloseTo(
      refRequired(
        [
          [80, 60],
          [60, 60],
        ],
        30,
        85,
      ),
      10,
    )
  })

  test('every calculator note is a plain sentence, never markup', () => {
    for (const note of at().notes!) {
      expect(note.length).toBeGreaterThan(20)
      expect(note).not.toMatch(/[<>]/)
    }
  })
})

describe('grade — parsing the single-line marks field', () => {
  test('semicolons, commas, spaces, percent signs and multi-word names all parse alike', () => {
    const canonical = Number(at({ marks: 'Homework: 88, 15; Midterm 1: 84, 20' }).primary.value)
    for (const variant of [
      'Homework: 88 15; Midterm 1: 84 20',
      'Homework: 88%, 15%; Midterm 1: 84%, 20%',
      'Homework : 88 , 15 ; Midterm 1 : 84 , 20',
      'Homework: 88, 15, Midterm 1: 84, 20',
      // A spreadsheet column, its newlines already flattened to spaces.
      'Homework: 88, 15 Midterm 1: 84, 20',
    ]) {
      expect(Number(at({ marks: variant }).primary.value), variant).toBeCloseTo(canonical, 10)
    }
  })

  test('a bare list of score/weight pairs works without names', () => {
    const named = Number(at({ marks: 'A: 88, 15; B: 79, 15' }).primary.value)
    expect(Number(at({ marks: '88 15, 79 15' }).primary.value)).toBeCloseTo(named, 10)
    expect(Number(at({ marks: '88, 15, 79, 15' }).primary.value)).toBeCloseTo(named, 10)
  })

  test('decimal scores and decimal weights survive', () => {
    const r = at({ marks: 'Lab: 87.5, 12.5' })
    expect(num(r, 'Weight already graded')).toBeCloseTo(12.5, 10)
    expect(num(r, 'Grade so far (graded work only)')).toBeCloseTo(87.5, 10)
  })

  test('extra credit above 100% is allowed', () => {
    const r = at({ marks: 'Bonus quiz: 110, 10' })
    expect(num(r, 'Grade so far (graded work only)')).toBeCloseTo(110, 10)
  })

  test('the per-mark breakdown lives in stats, one row per mark', () => {
    const r = at()
    // Seven fixed rows, then one per mark.
    expect(r.stats!.length).toBe(7 + DEFAULT_ROWS.length)
    expect(stat(r, 'Homework')!.value).toContain('88%')
    expect(stat(r, 'Midterm 1')!.value).toContain('84%')
    expect(num(r, 'Marks entered')).toBe(4)
  })
})

describe('grade — refusals', () => {
  const expectError = (fn: () => unknown, fieldId: string) => {
    let thrown: unknown
    try {
      fn()
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
    return thrown as CalcError
  }

  test('a final worth 0 is rejected against its own field, not divided by', () => {
    const err = expectError(() => at({ finalWeight: 0 }), 'finalWeight')
    expect(err.message).toContain('cannot change your grade')
  })

  test('NaN is caught by the finiteness guard, which runs before any magnitude test', () => {
    // coerceValues emits NaN for unparseable input, and `NaN <= 0` is false, so
    // a guard written the other way round would let it through into a divide.
    expectError(() => at({ finalWeight: Number.NaN }), 'finalWeight')
    expectError(() => at({ targetGrade: Number.NaN }), 'targetGrade')
    expectError(() => at({ finalWeight: Number.POSITIVE_INFINITY }), 'finalWeight')
  })

  test('out-of-range weights and targets are refused', () => {
    expectError(() => at({ finalWeight: 101 }), 'finalWeight')
    expectError(() => at({ targetGrade: -1 }), 'targetGrade')
    expectError(() => at({ targetGrade: 101 }), 'targetGrade')
  })

  test.each([
    ['an empty list', '   '],
    ['only separators', ', ;'],
    ['a mark with no weight', 'Homework: 88'],
    ['a mark with no weight among others', 'Homework: 88; Quizzes: 79, 15'],
    ['a negative score', 'Homework: -5, 10'],
    ['a zero weight', 'Homework: 88, 0'],
    ['a weight above the whole course', 'Homework: 88, 120'],
    ['a score that is really a point total', 'Homework: 880, 20'],
    ['an odd bare list', '88 15 79'],
    ['a non-numeric token', '88 15 abc 20'],
    ['prose', 'I got a B on the midterm'],
  ])('rejects %s against the marks field', (_label, marks) => {
    expectError(() => at({ marks }), 'marks')
  })

  test('weights totalling more than double a course are refused', () => {
    expectError(() => at({ marks: 'A: 90, 100; B: 90, 100' }), 'marks')
  })

  test('never returns NaN for input it accepts', () => {
    const r = at({ marks: 'A: 0, 1', finalWeight: 100, targetGrade: 0 })
    expect(Number.isFinite(Number(r.primary.value))).toBe(true)
    for (const s of r.stats!) {
      if (typeof s.value === 'number') expect(Number.isNaN(s.value)).toBe(false)
    }
    for (const step of r.steps!) {
      if ('value' in step && typeof step.value === 'number') {
        expect(Number.isNaN(step.value)).toBe(false)
      }
    }
  })
})

describe('grade — rich results keep a fixed shape', () => {
  /**
   * The trap this guards: the number of marks is an INPUT, so one slice or one
   * line per mark would make the donut and the chart change shape with the data.
   * The decomposition is fixed at two parts and two lines whatever is entered.
   */
  test.each([3, 5, 8])('%i marks still gives 2 parts and 2 series of 21 points', (n) => {
    const rows = Array.from({ length: n }, (_, i) => [70 + i, 60 / n] as const)
    const r = at({ marks: rowsToText(rows) })
    expect(r.parts).toHaveLength(2)
    expect(r.series).toHaveLength(2)
    for (const s of r.series!) expect(s.points).toHaveLength(21)
    // The varying detail lives in stats, where it is harmless.
    expect(r.stats!.length).toBe(7 + n)
  })

  test('parts sum exactly to the whole they claim and are never negative', () => {
    for (const over of [
      {},
      { targetGrade: 0 },
      { targetGrade: 100 },
      { finalWeight: 1 },
      { finalWeight: 100 },
      { marks: 'A: 0, 5' },
      { marks: 'A: 100, 5; B: 0, 50' },
      { marks: 'A: 150, 100' },
    ] as Partial<Input>[]) {
      const r = at(over)
      const whole = Number(r.partsTotal!.value)
      const sum = r.parts!.reduce((acc, p) => acc + p.value, 0)
      expect(sum, JSON.stringify(over)).toBeCloseTo(whole, 10)
      for (const p of r.parts!) expect(p.value, JSON.stringify(over)).toBeGreaterThanOrEqual(0)
    }
  })

  test('series x values are strictly increasing and every value is finite', () => {
    for (const s of at().series!) {
      expect(s.points.length).toBeGreaterThan(1)
      s.points.forEach((point, i) => {
        expect(Number.isFinite(point[0])).toBe(true)
        expect(Number.isFinite(point[1])).toBe(true)
        if (i > 0) expect(point[0]).toBeGreaterThan(s.points[i - 1]![0])
      })
    }
  })

  test('the default result renders to a complete view with no NaN', () => {
    const view = toResultView(at(), def.scale)
    expect(view.primary.text).toBe('93.2%')
    expect(view.band).toBe('warn')
    expect(view.bandLabel).toBe('Very demanding')
    expect(view.scalePercent).toBeGreaterThanOrEqual(0)
    expect(view.scalePercent).toBeLessThanOrEqual(100)
    for (const s of view.stats) expect(s.text).not.toContain('NaN')
    for (const p of view.parts) expect(p.text).not.toContain('NaN')
    expect(view.partsTotal.text).toBe('87.0%')
  })
})

/**
 * The conformance suite in `src/calculators/registry.test.ts` only sees a
 * calculator once it is in the barrel. These mirror the rules it enforces so
 * this definition is already correct when it is registered.
 */
describe('grade — definition conformance', () => {
  test('the copy fits a search result', () => {
    expect(def.description.length).toBeGreaterThan(50)
    expect(def.description.length).toBeLessThanOrEqual(160)
    expect(def.seoTitle.length).toBeLessThanOrEqual(70)
    expect(def.intro.length).toBeGreaterThan(40)
  })

  test('at least three FAQs, each a question with a real answer', () => {
    expect(def.faqs.length).toBeGreaterThanOrEqual(3)
    for (const faq of def.faqs) {
      expect(faq.q.endsWith('?')).toBe(true)
      expect(faq.a.length).toBeGreaterThan(40)
    }
  })

  test('the definition carries no colours, class names or markup', () => {
    const serialized = JSON.stringify(def, (_k, v) => (typeof v === 'function' ? undefined : v))
    expect(serialized).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(serialized).not.toMatch(/\b(bg|text|border|rounded|shadow)-[a-z]+-\d{2,3}\b/)
    expect(serialized).not.toMatch(/<\/?[a-z][\s\S]*>/i)
  })

  test('scale bands are ordered and contiguous across the whole scale', () => {
    const { bands, min, max } = def.scale
    expect(min).toBeLessThan(max)
    expect(bands[0]!.from).toBe(min)
    expect(bands[bands.length - 1]!.to).toBe(max)
    bands.forEach((band, i) => {
      expect(band.from).toBeLessThan(band.to)
      if (i > 0) expect(band.from).toBe(bands[i - 1]!.to)
    })
  })

  test('field ids are camelCase and unique, and it cross-links the GPA calculator', () => {
    const ids = def.fields.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z][a-zA-Z0-9]*$/)
    expect(def.related).toContain('gpa-calculator')
    expect(def.related).not.toContain(def.slug)
  })

  test('every number default sits on min + n x step, inside its own bounds', () => {
    for (const field of def.fields) {
      if (field.kind !== 'number') continue
      expect(field.default).toBeGreaterThanOrEqual(field.min)
      expect(field.default).toBeLessThanOrEqual(field.max)
      const n = (field.default - field.min) / field.step
      expect(Math.abs(n - Math.round(n)), field.id).toBeLessThan(1e-9)
    }
  })

  test('both ends of every slider are values compute accepts', () => {
    for (const field of def.fields) {
      if (field.kind !== 'number') continue
      for (const bound of [field.min, field.max]) {
        expect(
          () => at({ [field.id]: bound } as Partial<Input>),
          `${field.id}=${bound}`,
        ).not.toThrow()
      }
    }
  })

  test('the end-to-end nudge of the first number field gives a different valid answer', () => {
    // tests/calculators.spec.ts sets the first number field to 1.1x its default.
    const base = Number(at().primary.value)
    const nudged = at({ finalWeight: fields[1].default * 1.1 })
    const value = Number(nudged.primary.value)
    expect(Number.isFinite(value)).toBe(true)
    expect(value).not.toBeCloseTo(base, 3)
    // 33% final on 70% of graded work: total 103, banked 5705/103.
    expect(value).toBeCloseTo(refRequired(DEFAULT_ROWS, 33, 85), 6)
  })
})

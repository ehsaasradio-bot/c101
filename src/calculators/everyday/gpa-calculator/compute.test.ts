import { describe, expect, test } from 'vitest'
import compute from './compute'
import { CalcError } from '../../../lib/types'
import { fields } from './fields'
import def from './index'
import { toResultView } from '../../../lib/view'

type Input = {
  courses: string
  scaleType: string
  priorGpa: number
  priorCredits: number
}

const DEFAULTS: Input = {
  courses: fields[0].default,
  scaleType: fields[1].default,
  priorGpa: fields[2].default,
  priorCredits: fields[3].default,
}

const at = (over: Partial<Input> = {}) => compute({ ...DEFAULTS, ...over })

const stat = (r: ReturnType<typeof compute>, label: string) =>
  r.stats!.find((s) => s.label === label)

/**
 * An independent reference, written from the definition rather than from the
 * implementation: quality points summed, divided by the CREDIT total.
 */
function refGpa(pairs: ReadonlyArray<readonly [number, number]>): number {
  let points = 0
  let credits = 0
  for (const [gradePoint, credit] of pairs) {
    points += gradePoint * credit
    credits += credit
  }
  return points / credits
}

/** The default semester, spelled out by hand from the standard 4.0 table. */
const DEFAULT_ROWS = [
  [3.7, 4], // Organic Chemistry, A-
  [3.3, 4], // Honors Calculus II, B+
  [4.0, 3], // English Composition, A
  [3.0, 3], // Intro Psychology, B
  [4.0, 3], // Spanish II, A
] as const

describe('gpa', () => {
  test('the default term: 61 quality points over 17 credits', () => {
    const r = at()
    // 3.7x4 = 14.8, 3.3x4 = 13.2, 4x3 = 12, 3x3 = 9, 4x3 = 12  ->  61.0
    // Cross-checked in tenths of a grade point as integers, which avoids any
    // binary-fraction doubt: 37*4 + 33*4 + 40*3 + 30*3 + 40*3 = 610.
    const integerPoints = 37 * 4 + 33 * 4 + 40 * 3 + 30 * 3 + 40 * 3
    expect(integerPoints).toBe(610)
    expect(Number(stat(r, 'Quality points from these courses')!.value)).toBeCloseTo(61, 10)
    expect(Number(stat(r, 'Credits in these courses')!.value)).toBe(17)
    // 61 / 17 = 3.588235294117647
    expect(Number(stat(r, 'GPA for these courses')!.value)).toBeCloseTo(61 / 17, 12)
    expect(Number(stat(r, 'GPA for these courses')!.value)).toBeCloseTo(refGpa(DEFAULT_ROWS), 12)
    expect(Number(stat(r, 'Courses entered')!.value)).toBe(5)
  })

  test('the headline is the cumulative GPA: 163.6 over 47 credits', () => {
    const r = at()
    // Previous work restated as quality points: 3.42 x 30 = 102.6.
    // (102.6 + 61) / (30 + 17) = 163.6 / 47 = 3.4808510638297873
    expect(Number(stat(r, 'Total quality points')!.value)).toBeCloseTo(163.6, 10)
    expect(Number(stat(r, 'Total credits')!.value)).toBe(47)
    expect(Number(r.primary.value)).toBeCloseTo(163.6 / 47, 12)
    expect(Number(r.primary.value)).toBeCloseTo(3.4808510638297873, 12)
    // Confirmed a second way: the cumulative GPA is the credit-weighted blend
    // of the two GPAs, which must land between them.
    const blended = (3.42 * 30 + (61 / 17) * 17) / 47
    expect(Number(r.primary.value)).toBeCloseTo(blended, 12)
    expect(Number(r.primary.value)).toBeGreaterThan(3.42)
    expect(Number(r.primary.value)).toBeLessThan(61 / 17)
    expect(r.scaleValue).toBeCloseTo(Number(r.primary.value), 12)
  })

  /**
   * THE classic error. Dividing by the number of courses instead of the credit
   * total gives 3.6 here rather than 3.588…, and the two only agree when every
   * course carries the same credit — which is exactly why the bug survives
   * casual testing. The second case makes the gap impossible to miss.
   */
  test('divides by total credits, not by the course count', () => {
    const term = Number(stat(at(), 'GPA for these courses')!.value)
    const meanOfGradePoints = (3.7 + 3.3 + 4.0 + 3.0 + 4.0) / 5
    expect(meanOfGradePoints).toBeCloseTo(3.6, 12)
    expect(term).toBeCloseTo(3.588235294117647, 12)
    expect(term).not.toBeCloseTo(meanOfGradePoints, 3)

    // A 1-credit A beside a 9-credit F: weighted 0.4, unweighted-by-count 2.0.
    const lopsided = at({ courses: 'Seminar: A, 1; Thesis: F, 9', priorCredits: 0 })
    expect(Number(stat(lopsided, 'GPA for these courses')!.value)).toBeCloseTo(0.4, 12)
    expect(Number(stat(lopsided, 'GPA for these courses')!.value)).toBeCloseTo(
      refGpa([
        [4, 1],
        [0, 9],
      ] as const),
      12,
    )
    expect(Number(lopsided.primary.value)).not.toBeCloseTo(2.0, 3)
  })

  test('with no prior credits the cumulative GPA is the term GPA', () => {
    const r = at({ priorCredits: 0 })
    expect(Number(r.primary.value)).toBeCloseTo(61 / 17, 12)
    // Prior GPA is irrelevant when it weighs nothing.
    expect(Number(at({ priorCredits: 0, priorGpa: 1.2 }).primary.value)).toBeCloseTo(61 / 17, 12)
    expect(r.notes!.some((n) => n.includes('no credits earned before'))).toBe(true)
  })

  test('the weighted scale adds 1.0 for AP or IB and 0.5 for honours', () => {
    // Only "Honors Calculus II" qualifies in the default list: 3.3 -> 3.8,
    // so its quality points go from 13.2 to 15.2 and the term total to 63.
    const w = at({ scaleType: 'weighted' })
    expect(Number(stat(w, 'Quality points from these courses')!.value)).toBeCloseTo(63, 10)
    expect(Number(stat(w, 'GPA for these courses')!.value)).toBeCloseTo(63 / 17, 12)
    expect(Number(w.primary.value)).toBeCloseTo((102.6 + 63) / 47, 12)

    const ap = at({ courses: 'AP Biology: A, 4', priorCredits: 0, scaleType: 'weighted' })
    expect(Number(ap.primary.value)).toBeCloseTo(5, 12)
    const ib = at({ courses: 'IB History: B, 3', priorCredits: 0, scaleType: 'weighted' })
    expect(Number(ib.primary.value)).toBeCloseTo(4, 12)
  })

  test('the bonus never rescues a failing grade, and only whole words qualify', () => {
    const failed = at({ courses: 'AP Physics: F, 4', priorCredits: 0, scaleType: 'weighted' })
    expect(Number(failed.primary.value)).toBe(0)
    // "Rap" is not "AP" — the word boundary is what stops that.
    const rap = at({ courses: 'Rap Music: A, 3', priorCredits: 0, scaleType: 'weighted' })
    expect(Number(rap.primary.value)).toBeCloseTo(4, 12)
    // Unweighted ignores the marker entirely.
    const plain = at({ courses: 'AP Biology: A, 4', priorCredits: 0, scaleType: 'unweighted' })
    expect(Number(plain.primary.value)).toBeCloseTo(4, 12)
  })

  test('separators, flattened newlines and unicode minus all parse the same', () => {
    const expected = Number(at().primary.value)
    const semicolons = fields[0].default
    const commas = semicolons.replace(/;/g, ',')
    // A column pasted from a spreadsheet: kind 'text' is a single-line input,
    // so the newlines arrive as spaces with no separator at all.
    const flattened = semicolons.replace(/;/g, '')
    const unicodeMinus = semicolons.replace('A-', 'A−')
    for (const variant of [commas, flattened, unicodeMinus]) {
      expect(Number(at({ courses: variant }).primary.value), variant).toBeCloseTo(expected, 12)
    }
    // Multi-word names survive: the parser anchors on the colon, not on spaces.
    expect(stat(at(), 'Organic Chemistry')).toBeDefined()
    expect(stat(at(), 'Honors Calculus II')).toBeDefined()
  })

  test('omitted credit hours count as one, and a bare grade list works', () => {
    const named = at({ courses: 'Art: A; Music: B; Drama: C', priorCredits: 0 })
    // (4 + 3 + 2) / 3 = 3
    expect(Number(named.primary.value)).toBeCloseTo(3, 12)
    expect(Number(stat(named, 'Credits in these courses')!.value)).toBe(3)

    const bare = at({ courses: 'A B C', priorCredits: 0 })
    expect(Number(bare.primary.value)).toBeCloseTo(3, 12)

    const barePairs = at({ courses: 'A 4, B+ 3', priorCredits: 0 })
    // (4x4 + 3.3x3) / 7 = (16 + 9.9) / 7 = 25.9 / 7 = 3.7
    expect(Number(barePairs.primary.value)).toBeCloseTo(25.9 / 7, 12)
    expect(Number(barePairs.primary.value)).toBeCloseTo(3.7, 12)
  })

  test('every letter on the standard table maps to its published grade point', () => {
    const table: ReadonlyArray<readonly [string, number]> = [
      ['A+', 4.0],
      ['A', 4.0],
      ['A-', 3.7],
      ['B+', 3.3],
      ['B', 3.0],
      ['B-', 2.7],
      ['C+', 2.3],
      ['C', 2.0],
      ['C-', 1.7],
      ['D+', 1.3],
      ['D', 1.0],
      ['D-', 0.7],
      ['F', 0.0],
    ]
    for (const [letter, point] of table) {
      const r = at({ courses: `Course: ${letter}, 3`, priorCredits: 0 })
      expect(Number(r.primary.value), letter).toBeCloseTo(point, 12)
      // Lower case is the same grade.
      const lower = at({ courses: `Course: ${letter.toLowerCase()}, 3`, priorCredits: 0 })
      expect(Number(lower.primary.value), letter).toBeCloseTo(point, 12)
    }
  })

  /**
   * The count of parts and series must NOT follow the course count — the number
   * of courses is an input, and a donut that gains a slice per class is exactly
   * the shape the registry sweep forbids.
   */
  test.each([3, 5, 8])('emits the same 2 parts and 1 series for %i courses', (n) => {
    const courses = Array.from({ length: n }, (_, i) => `Course ${i + 1}: B+, 3`).join('; ')
    const r = at({ courses })
    expect(r.parts).toHaveLength(2)
    expect(r.series).toHaveLength(1)
    expect(r.series![0]!.points).toHaveLength(9)
    // The per-course breakdown is the part that is allowed to grow.
    expect(r.stats!.filter((s) => s.label.startsWith('Course ')).length).toBe(n)
  })

  test('parts sum exactly to the maximum they claim, and none is negative', () => {
    for (const scaleType of ['unweighted', 'weighted']) {
      const r = at({ scaleType })
      const whole = Number(r.partsTotal!.value)
      const sum = r.parts!.reduce((acc, p) => acc + p.value, 0)
      expect(sum, scaleType).toBeCloseTo(whole, 10)
      for (const part of r.parts!) expect(part.value, part.label).toBeGreaterThanOrEqual(0)
    }
    // Unweighted: 17 credits x 4.0 = 68 possible, 61 earned, 7 short.
    const r = at()
    expect(Number(r.partsTotal!.value)).toBeCloseTo(68, 10)
    expect(r.parts![0]!.value).toBeCloseTo(61, 10)
    expect(r.parts![1]!.value).toBeCloseTo(7, 10)
    // A perfect term leaves a zero remainder rather than a negative one.
    const perfect = at({ courses: 'Studio: A, 3; Theory: A+, 3' })
    expect(perfect.parts![1]!.value).toBe(0)
  })

  test('the projection starts on the headline and drifts towards the term GPA', () => {
    const r = at()
    const points = r.series![0]!.points
    expect(points[0]![0]).toBe(0)
    expect(points[0]![1]).toBeCloseTo(Number(r.primary.value), 12)
    // After one more identical term: (102.6 + 122) / (30 + 34) = 224.6 / 64.
    expect(points[1]![1]).toBeCloseTo(224.6 / 64, 12)
    expect(points[1]![1]).toBeCloseTo(3.509375, 12)
    // After eight: (102.6 + 549) / (30 + 153) = 651.6 / 183.
    expect(points[8]![1]).toBeCloseTo(651.6 / 183, 12)
    // Strictly increasing x, and monotonically approaching the term GPA.
    points.forEach((p, i) => {
      expect(Number.isFinite(p[0])).toBe(true)
      expect(Number.isFinite(p[1])).toBe(true)
      if (i > 0) expect(p[0]).toBeGreaterThan(points[i - 1]![0])
      expect(p[1]).toBeLessThan(61 / 17)
    })
  })

  const badLists: ReadonlyArray<readonly [string, string, RegExp]> = [
    ['an unrecognised letter', 'Chem: Z, 4', /"Z" in "Chem"/],
    ['a word where a grade belongs', 'Chem: Bio, 3', /"Bio" in "Chem"/],
    ['credits that are not a number', 'Biology: A, four', /Could not read/],
    ['no course structure at all', 'my grades were fine', /Could not read|is not a grade/],
    ['an empty list', '   ', /at least one course/],
    ['zero credit hours', 'Yoga: A, 0', /greater than 0/],
    ['an implausible credit count', 'Thesis: A, 90', /typo/],
  ]

  test.each(badLists)('rejects %s against the courses field', (_label, courses, pattern) => {
    let thrown: unknown
    try {
      at({ courses })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe('courses')
    expect((thrown as CalcError).message).toMatch(pattern)
  })

  test('the error names the entry that is wrong, not the whole list', () => {
    let thrown: unknown
    try {
      at({ courses: 'Organic Chemistry: A, 4; Music Theory: Q, 3; Statistics: B, 3' })
    } catch (err) {
      thrown = err
    }
    expect((thrown as CalcError).message).toContain('Music Theory')
    expect((thrown as CalcError).message).not.toContain('Organic Chemistry')
  })

  const badNumbers: ReadonlyArray<readonly [string, Partial<Input>]> = [
    ['priorGpa', { priorGpa: Number.NaN }],
    ['priorGpa', { priorGpa: -1 }],
    ['priorGpa', { priorGpa: 6 }],
    ['priorCredits', { priorCredits: Number.NaN }],
    ['priorCredits', { priorCredits: -999999 }],
    ['priorCredits', { priorCredits: 301 }],
  ]

  test.each(badNumbers)('rejects a bad %s before anything else can turn it into NaN', (fieldId, over) => {
    let thrown: unknown
    try {
      at(over)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
  })

  test('accepts both ends of every declared bound', () => {
    for (const field of fields) {
      if (field.kind !== 'number') continue
      for (const bound of [field.min, field.max]) {
        expect(() => at({ [field.id]: bound } as Partial<Input>), `${field.id}=${bound}`).not.toThrow()
      }
    }
  })

  test('never returns NaN anywhere in a valid result', () => {
    for (const over of [{}, { scaleType: 'weighted' }, { priorCredits: 0 }, { priorGpa: 0 }]) {
      const r = at(over as Partial<Input>)
      expect(Number.isFinite(Number(r.primary.value))).toBe(true)
      for (const s of r.stats!) {
        if (typeof s.value === 'number') expect(Number.isNaN(s.value)).toBe(false)
        expect(String(s.value)).not.toContain('NaN')
      }
      for (const step of r.steps!) {
        if ('value' in step && typeof step.value === 'number') {
          expect(Number.isFinite(step.value)).toBe(true)
        }
      }
    }
  })

  test('the first number field moves the headline, as the e2e suite requires', () => {
    // tests/calculators.spec.ts nudges the first number field to 1.1x default.
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('priorGpa')
    if (first.kind !== 'number') throw new Error('the first number field vanished')
    const bumped = Number((first.default * 1.1).toFixed(4))
    expect(bumped).toBeLessThanOrEqual(first.max!)
    const before = Number(at().primary.value)
    const after = Number(at({ priorGpa: bumped }).primary.value)
    // (3.762 x 30 + 61) / 47 = 173.86 / 47 = 3.699148936170213
    expect(after).toBeCloseTo(173.86 / 47, 10)
    expect(after.toFixed(2)).not.toBe(before.toFixed(2))
  })
})

/**
 * The checks `registry.test.ts` will apply once this is in the barrel, run here
 * against this calculator alone so a failure points at this directory rather
 * than at whichever calculator happens to be alphabetically first.
 */
describe('gpa conformance', () => {
  /** Mirrors the sampler in registry.test.ts: every value a field can take. */
  function samples(field: (typeof fields)[number]): unknown[] {
    if (field.kind === 'number') {
      const { min, max, default: def } = field
      const interior = [0.25, 0.5, 0.75].map((f) => min + (max - min) * f)
      return [min, max, def, 0, 1, 2, ...interior]
        .filter((v) => v >= min && v <= max)
        .map((v) => Number(v.toFixed(6)))
    }
    if (field.kind === 'select') return field.options.map((o) => o.value)
    return [field.default]
  }

  function* reachable(): Generator<readonly [string, ReturnType<typeof compute>]> {
    yield ['defaults', at()]
    for (const field of fields) {
      for (const value of samples(field)) {
        try {
          yield [`${field.id}=${String(value)}`, at({ [field.id]: value } as Partial<Input>)]
        } catch {
          // A refusal is not an answer; there is no shape to check.
        }
      }
    }
  }

  test('copy fits a search result', () => {
    expect(def.description.length).toBeGreaterThan(50)
    expect(def.description.length).toBeLessThanOrEqual(160)
    expect(def.seoTitle.length).toBeLessThanOrEqual(70)
    expect(def.intro.length).toBeGreaterThan(40)
    expect(def.faqs.length).toBeGreaterThanOrEqual(3)
    for (const faq of def.faqs) {
      expect(faq.q.endsWith('?')).toBe(true)
      expect(faq.a.length).toBeGreaterThan(40)
    }
    expect(def.related).not.toContain(def.slug)
  })

  test('scale bands are ordered and contiguous, and the default is not on a seam', () => {
    const { bands, min, max } = def.scale
    expect(min).toBeLessThan(max)
    bands.forEach((band, i) => {
      expect(band.from).toBeLessThan(band.to)
      if (i > 0) expect(band.from).toBe(bands[i - 1]!.to)
    })
    const value = at().scaleValue!
    expect(value).toBeGreaterThan(min)
    expect(value).toBeLessThan(max)
    expect(bands.some((b) => b.from === value || b.to === value)).toBe(false)
  })

  test('parts and series are drawable at the defaults, and stay so everywhere', () => {
    expect(at().parts!.length).toBeGreaterThan(0)
    expect(at().series!.length).toBeGreaterThan(0)

    for (const [how, r] of reachable()) {
      // The counts are what must not move: the donut and the chart are
      // server-rendered from the default result, and a slice per course would
      // make the shape follow an input.
      expect(r.parts, how).toHaveLength(2)
      expect(r.series, how).toHaveLength(1)

      const whole = Number(r.partsTotal!.value)
      const sum = r.parts!.reduce((acc, p) => acc + p.value, 0)
      expect(Number.isFinite(whole), how).toBe(true)
      expect(sum, how).toBeCloseTo(whole, 4)
      for (const part of r.parts!) {
        expect(Number.isFinite(part.value), how).toBe(true)
        expect(part.value, how).toBeGreaterThanOrEqual(0)
        expect(part.label.length, how).toBeGreaterThan(0)
      }

      for (const s of r.series!) {
        expect(s.points.length, how).toBe(9)
        expect(s.label.length, how).toBeGreaterThan(0)
        s.points.forEach((p, i) => {
          expect(Number.isFinite(p[0]), how).toBe(true)
          expect(Number.isFinite(p[1]), how).toBe(true)
          if (i > 0) expect(p[0], how).toBeGreaterThan(s.points[i - 1]![0])
        })
      }

      expect(Number.isFinite(r.scaleValue!), how).toBe(true)
      expect(Number.isFinite(Number(r.primary.value)), how).toBe(true)
    }
  })

  test('renders to a complete view with a resolved band and no NaN', () => {
    for (const [how, r] of reachable()) {
      const view = toResultView(r, def.scale)
      expect(view.primary.text, how).not.toBe('')
      expect(view.primary.text, how).not.toContain('NaN')
      for (const s of view.stats) expect(s.text, `${how} / ${s.label}`).not.toContain('NaN')
      for (const p of view.parts) expect(p.text, how).not.toContain('NaN')
      expect(view.band, how).toBeDefined()
      expect(view.scalePercent!, how).toBeGreaterThanOrEqual(0)
      expect(view.scalePercent!, how).toBeLessThanOrEqual(100)
    }
    // The headline a visitor sees first, spelled out.
    expect(toResultView(at(), def.scale).primary.text).toBe('3.48')
    expect(toResultView(at(), def.scale).bandLabel).toBe('Good standing')
  })
})

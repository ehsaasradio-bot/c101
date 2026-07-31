import { describe, expect, test } from 'vitest'
import compute from './compute'
import { fields } from './fields'
import def from './index'
import { CalcError } from '../../../lib/types'
import { defaultValues, toResultView } from '../../../lib/view'
// Read-only: `related` may only point at slugs that already exist.
import { bySlug } from '../../index'

type Input = {
  mode: string
  initialAmount: number
  remainingAmount: number
  timeUnit: string
  elapsedTime: number
  halfLife: number
}

const DEFAULTS: Input = {
  mode: 'remaining',
  initialAmount: 100,
  remainingAmount: 25,
  timeUnit: 'hours',
  elapsedTime: 10,
  halfLife: 5,
}

const at = (over: Partial<Input> = {}) => compute({ ...DEFAULTS, ...over })

const num = (r: ReturnType<typeof compute>) => Number(r.primary.value)

const stat = (r: ReturnType<typeof compute>, label: string): number | string => {
  const found = r.stats!.find((s) => s.label === label)
  if (!found) throw new Error(`no stat labelled ${label}`)
  return found.value
}

/** The rendered text of a named stat — what a visitor actually reads. */
const statText = (r: ReturnType<typeof compute>, label: string): string => {
  const found = toResultView(r).stats.find((s) => s.label === label)
  if (!found) throw new Error(`no stat labelled ${label}`)
  return found.text
}

const fieldOf = (id: string) => {
  const found = fields.find((f) => f.id === id)
  if (!found) throw new Error(`no field ${id}`)
  return found
}

/**
 * The FIRST independent check on the maths: repeated halving, with no exponent,
 * no logarithm and no library call beyond division by two.
 *
 * After a whole number of half-lives the surviving amount is N0 divided by two,
 * n times over. Every one of those divisions is exact in binary — halving only
 * decrements the exponent — so this is not merely close to the closed form, it
 * is the same double, and it can be asserted with `toBe`.
 */
const byHalving = (initial: number, wholeHalfLives: number): number => {
  let left = initial
  for (let i = 0; i < wholeHalfLives; i++) left /= 2
  return left
}

describe('half-life — exact anchors', () => {
  test('after exactly one half-life, exactly half remains', () => {
    const r = at({ elapsedTime: 5, halfLife: 5 })
    expect(num(r)).toBe(50)
    expect(num(r)).toBe(byHalving(100, 1))
    expect(stat(r, 'Half-lives elapsed')).toBe(1)
    expect(stat(r, 'Fraction remaining')).toBe(50)
  })

  test('after exactly three half-lives, exactly one eighth remains', () => {
    const r = at({ elapsedTime: 15, halfLife: 5 })
    expect(num(r)).toBe(12.5)
    expect(num(r)).toBe(byHalving(100, 3))
    expect(num(r)).toBe(100 / 8)
    expect(stat(r, 'Half-lives elapsed')).toBe(3)
  })

  test('the defaults are two half-lives of caffeine, and land on exactly 25', () => {
    const r = compute(defaultValues(def) as never)
    expect(num(r)).toBe(25)
    expect(num(r)).toBe(byHalving(100, 2))
    expect(stat(r, 'Half-lives elapsed')).toBe(2)
    expect(toResultView(r).primary.text).toBe('25')
    expect(r.primary.label).toBe('Remaining after 10 hours')
  })

  test('the first ten whole half-lives all match repeated halving exactly', () => {
    for (let n = 0; n <= 10; n++) {
      const r = at({ elapsedTime: 5 * n || 0.5, halfLife: 5 })
      if (n === 0) continue
      expect(num(r), `${n} half-lives`).toBe(byHalving(100, n))
    }
  })
})

describe('half-life — the four modes agree', () => {
  test('solving for the half-life recovers 5 from 100, 25 and 10 hours', () => {
    const r = at({ mode: 'halfLife' })
    expect(num(r)).toBe(5)
    expect(stat(r, 'Half-lives elapsed')).toBe(2)
  })

  test('solving for the elapsed time recovers 10 from 100, 25 and a half-life of 5', () => {
    const r = at({ mode: 'time' })
    expect(num(r)).toBe(10)
  })

  test('solving for the initial amount recovers 100 from 25, 10 hours and a half-life of 5', () => {
    const r = at({ mode: 'initial' })
    expect(num(r)).toBe(100)
  })

  /**
   * The SECOND independent check: a genuine round trip. Solve for T from an
   * arbitrary (N0, N, t), then feed that T back into the forward direction with
   * the same N0 and t. The remaining amount must reappear.
   *
   * This crosses the two formulas — T = t / log2(N0/N) and N = N0 x 2^(-t/T) —
   * so a sign error, a swapped ratio or a missing ln2 in either one shows up as
   * a mismatch. It is checked over a spread of ratios and times rather than the
   * single tidy case, because the tidy case is exactly the one a wrong formula
   * can still get right.
   */
  test('solving for T and feeding it back recovers the remaining amount', () => {
    for (const initialAmount of [1, 7.5, 100, 4321.5]) {
      for (const ratio of [1.05, 1.5, 2, 3, 8, 97, 1000]) {
        for (const elapsedTime of [0.1, 1, 3.7, 5730]) {
          const remainingAmount = initialAmount / ratio
          const solved = at({ mode: 'halfLife', initialAmount, remainingAmount, elapsedTime })
          const halfLife = num(solved)
          expect(Number.isFinite(halfLife)).toBe(true)
          expect(halfLife).toBeGreaterThan(0)

          const back = at({ mode: 'remaining', initialAmount, elapsedTime, halfLife })
          expect(num(back), `N0=${initialAmount} ratio=${ratio} t=${elapsedTime}`).toBeCloseTo(
            remainingAmount,
            9,
          )
        }
      }
    }
  })

  test('solving for the elapsed time and feeding it back recovers the remaining amount', () => {
    for (const halfLife of [0.1, 5, 5730]) {
      for (const ratio of [1, 1.3, 2, 16, 999]) {
        const initialAmount = 250
        const remainingAmount = initialAmount / ratio
        const t = num(at({ mode: 'time', initialAmount, remainingAmount, halfLife }))
        expect(t).toBeGreaterThanOrEqual(0)
        const back = at({ mode: 'remaining', initialAmount, halfLife, elapsedTime: t || 0.1 })
        if (t === 0) {
          expect(remainingAmount).toBe(initialAmount)
        } else {
          expect(num(back), `T=${halfLife} ratio=${ratio}`).toBeCloseTo(remainingAmount, 9)
        }
      }
    }
  })

  test('solving for N0 and feeding it back recovers the remaining amount', () => {
    for (const remainingAmount of [0.1, 25, 9999]) {
      for (const elapsedTime of [0.3, 11, 400]) {
        for (const halfLife of [0.7, 5, 137]) {
          const initialAmount = num(at({ mode: 'initial', remainingAmount, elapsedTime, halfLife }))
          const back = at({ mode: 'remaining', initialAmount, elapsedTime, halfLife })
          expect(num(back)).toBeCloseTo(remainingAmount, 9)
        }
      }
    }
  })
})

describe('half-life — the derived constants', () => {
  test('lambda x T is exactly ln 2 for a half-life the visitor typed', () => {
    for (const halfLife of [0.1, 1, 3, 5, 7, 12.5, 5730, 100_000]) {
      const r = at({ halfLife })
      expect(stat(r, 'Check: lambda x half-life = ln 2'), `T=${halfLife}`).toBe(Math.LN2)
    }
    // lambda = ln2 / T is written that way round precisely so this holds. The
    // reciprocal form, 1 / (T / ln2), rounds twice and does not.
    expect((Math.LN2 / 3) * 3).toBe(Math.LN2)
  })

  test('lambda is ln2 / T and the mean lifetime is its reciprocal', () => {
    const r = at({ halfLife: 5 })
    expect(stat(r, 'Decay constant lambda = ln 2 / T')).toBe(Math.LN2 / 5)
    // T / ln2 and 1 / (ln2 / T) are the same number here, which is the point:
    // the shorter expression is used because it rounds once instead of twice.
    expect(stat(r, 'Mean lifetime 1 / lambda')).toBe(5 / Math.LN2)
    expect(stat(r, 'Mean lifetime 1 / lambda')).toBe(1 / (Math.LN2 / 5))
    // The mean lifetime always exceeds the half-life by the factor 1/ln2.
    expect(Number(stat(r, 'Mean lifetime 1 / lambda')) / 5).toBeCloseTo(1.4426950408889634, 12)
  })

  test('five half-lives leave exactly one thirty-second', () => {
    const r = at({ elapsedTime: 25, halfLife: 5 })
    expect(num(r)).toBe(100 / 32)
    expect(Number(stat(r, 'Fraction remaining'))).toBeCloseTo(3.125, 12)
    expect(stat(r, 'Time until 96.875% has gone (5 half-lives)')).toBe(25)
  })

  test('carbon-14: half remaining is one Cambridge half-life of 5,730 years', () => {
    // Godwin, "Half-life of Radiocarbon", Nature 195, 984 (1962) — the 5,730 +/- 40
    // year figure adopted at the 1962 Cambridge radiocarbon conference.
    const r = at({
      mode: 'time',
      timeUnit: 'years',
      initialAmount: 100,
      remainingAmount: 50,
      halfLife: 5730,
    })
    expect(num(r)).toBe(5730)
    expect(num(at({ mode: 'time', timeUnit: 'years', initialAmount: 100, remainingAmount: 25, halfLife: 5730 }))).toBe(11460)
  })
})

describe('half-life — floating point presentation', () => {
  /**
   * The trap this page was built around. 0.1 is the step on both time fields, so
   * a half-life of 0.1 with 0.3 elapsed is one drag away — and `0.3 / 0.1` is
   * 2.9999999999999996 in IEEE 754 doubles, not 3.
   */
  test('a bare division really does miss, which is what makes the snap necessary', () => {
    expect(0.3 / 0.1).not.toBe(3)
    expect(0.3 / 0.1).toBe(2.9999999999999996)
    expect(100 * Math.pow(2, -(0.3 / 0.1))).not.toBe(12.5)
  })

  test('three half-lives print as 3, not 2.9999999999999996', () => {
    const r = at({ elapsedTime: 0.3, halfLife: 0.1 })
    expect(stat(r, 'Half-lives elapsed')).toBe(3)
    expect(statText(r, 'Half-lives elapsed')).toBe('3')
    // And the correction carries all the way to the headline.
    expect(num(r)).toBe(12.5)
    expect(num(r)).toBe(byHalving(100, 3))
    expect(toResultView(r).primary.text).toBe('12.5')
  })

  test('the snap survives into the worked steps', () => {
    const r = at({ elapsedTime: 0.3, halfLife: 0.1 })
    const step = r.steps!.find(
      (s): s is Extract<typeof s, { label: string }> =>
        !('rule' in s) && s.label.startsWith('Half-lives elapsed'),
    )!
    expect(String(step.value)).toBe('0.3 / 0.1 = 3')
  })

  /**
   * The other half of the rule: a value merely NEAR a whole number is a real
   * answer and must be left alone. 2.9 half-lives is not 3.
   */
  test('a near-miss is not snapped', () => {
    const r = at({ elapsedTime: 14.5, halfLife: 5 })
    expect(stat(r, 'Half-lives elapsed')).toBe(2.9)
    expect(num(r)).toBeCloseTo(100 * Math.pow(2, -2.9), 12)
    expect(num(r)).not.toBe(12.5)
  })

  test('a ratio that is an exact power of two gives a whole number of half-lives', () => {
    for (const [initialAmount, remainingAmount, expected] of [
      [100, 50, 1],
      [100, 25, 2],
      [100, 12.5, 3],
      [0.3, 0.0375, 3],
      [1000, 0.9765625, 10],
    ] as const) {
      const r = at({ mode: 'halfLife', initialAmount, remainingAmount, elapsedTime: 10 })
      expect(stat(r, 'Half-lives elapsed'), `${initialAmount}/${remainingAmount}`).toBe(expected)
      expect(num(r)).toBe(10 / expected)
    }
  })

  test('a ratio that is not a power of two is left where the arithmetic put it', () => {
    const r = at({ mode: 'halfLife', initialAmount: 100, remainingAmount: 30, elapsedTime: 10 })
    expect(stat(r, 'Half-lives elapsed')).toBe(Math.log2(100 / 30))
    expect(Number.isInteger(stat(r, 'Half-lives elapsed'))).toBe(false)
  })

  test('a whole-number answer never prints trailing zeros', () => {
    expect(toResultView(at({ mode: 'halfLife' })).primary.text).toBe('5 hours')
    expect(toResultView(at({ mode: 'time' })).primary.text).toBe('10 hours')
    expect(toResultView(at({ mode: 'initial' })).primary.text).toBe('100')
  })
})

describe('half-life — refusals', () => {
  const rejects = (over: Partial<Input>, fieldId: string) => {
    let thrown: unknown
    try {
      at(over)
    } catch (err) {
      thrown = err
    }
    expect(thrown, `expected a CalcError for ${JSON.stringify(over)}`).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
    expect((thrown as CalcError).message.length).toBeGreaterThan(40)
  }

  test('more remaining than you started with is not decay', () => {
    rejects({ mode: 'halfLife', initialAmount: 100, remainingAmount: 140 }, 'remainingAmount')
    rejects({ mode: 'time', initialAmount: 100, remainingAmount: 140 }, 'remainingAmount')
    // ...and by the barest margin, too.
    rejects({ mode: 'halfLife', initialAmount: 100, remainingAmount: 100.0000001 }, 'remainingAmount')
  })

  test('nothing decayed at all pins down no half-life', () => {
    rejects({ mode: 'halfLife', initialAmount: 100, remainingAmount: 100 }, 'remainingAmount')
  })

  test('an unchanged amount IS a valid elapsed time of zero', () => {
    const r = at({ mode: 'time', initialAmount: 100, remainingAmount: 100 })
    expect(num(r)).toBe(0)
    expect(stat(r, 'Half-lives elapsed')).toBe(0)
  })

  test('zero remaining is refused rather than answered with infinity', () => {
    rejects({ mode: 'time', remainingAmount: 0 }, 'remainingAmount')
    rejects({ mode: 'halfLife', remainingAmount: 0 }, 'remainingAmount')
    rejects({ mode: 'initial', remainingAmount: 0 }, 'remainingAmount')
    rejects({ mode: 'time', remainingAmount: -5 }, 'remainingAmount')
    // The refusal exists precisely because the bare arithmetic would not.
    expect(Math.log(0)).toBe(-Infinity)
    expect(Math.log2(100 / 0)).toBe(Infinity)
  })

  test('a non-positive initial amount, time or half-life is refused', () => {
    rejects({ initialAmount: 0 }, 'initialAmount')
    rejects({ initialAmount: -1 }, 'initialAmount')
    rejects({ elapsedTime: 0 }, 'elapsedTime')
    rejects({ halfLife: 0 }, 'halfLife')
    rejects({ halfLife: -5 }, 'halfLife')
  })

  test('NaN is caught before any magnitude test, in every mode', () => {
    rejects({ initialAmount: Number.NaN }, 'initialAmount')
    rejects({ elapsedTime: Number.NaN }, 'elapsedTime')
    rejects({ halfLife: Number.NaN }, 'halfLife')
    rejects({ mode: 'halfLife', remainingAmount: Number.NaN }, 'remainingAmount')
    rejects({ mode: 'time', remainingAmount: Number.NaN }, 'remainingAmount')
    rejects({ mode: 'initial', remainingAmount: Number.NaN }, 'remainingAmount')
    rejects({ elapsedTime: Number.POSITIVE_INFINITY }, 'elapsedTime')
    // The reason the finiteness guard has to come first: NaN passes every
    // ordinary magnitude test.
    expect(Number.NaN > 0).toBe(false)
    expect(Number.NaN <= 0).toBe(false)
  })

  test('working backwards past the largest representable number is refused', () => {
    rejects({ mode: 'initial', elapsedTime: 100_000, halfLife: 0.1 }, 'elapsedTime')
  })

  test('an unknown mode is refused against the mode field', () => {
    rejects({ mode: 'sideways' }, 'mode')
  })

  test('a field a mode does not use cannot block it', () => {
    // The remaining amount is not read in "remaining" mode, so a blank one must
    // not stop the page computing.
    expect(num(at({ remainingAmount: Number.NaN }))).toBe(25)
    // ...and the elapsed time is not read in "time" mode.
    expect(num(at({ mode: 'time', elapsedTime: Number.NaN }))).toBe(10)
  })
})

describe('half-life — the drawn result', () => {
  test('parts sum exactly to the initial amount and are never negative', () => {
    for (const over of [
      {},
      { mode: 'halfLife' as const },
      { mode: 'time' as const },
      { mode: 'initial' as const },
      { elapsedTime: 0.1 },
      { elapsedTime: 100_000 },
      { halfLife: 100_000 },
    ]) {
      const r = at(over)
      const total = Number(r.partsTotal!.value)
      const sum = r.parts!.reduce((acc, p) => acc + p.value, 0)
      expect(sum, JSON.stringify(over)).toBe(total)
      for (const p of r.parts!) expect(p.value).toBeGreaterThanOrEqual(0)
    }
  })

  test('the defaults draw both parts and both series', () => {
    const r = compute(defaultValues(def) as never)
    expect(r.parts).toHaveLength(2)
    expect(r.series).toHaveLength(2)
    expect(r.parts!.map((p) => p.value)).toEqual([25, 75])
  })

  test('the series count and length never vary with input', () => {
    for (const over of [
      {},
      { mode: 'halfLife' as const },
      { mode: 'time' as const },
      { mode: 'initial' as const },
      { elapsedTime: 0.1 },
      { elapsedTime: 100_000 },
      { halfLife: 0.1 },
      { initialAmount: 0.1 },
    ]) {
      const r = at(over)
      expect(r.series, JSON.stringify(over)).toHaveLength(2)
      for (const s of r.series!) expect(s.points).toHaveLength(41)
    }
  })

  test('the curve is the same closed form as the headline', () => {
    const r = at({ elapsedTime: 10, halfLife: 5 })
    const [surviving, decayed] = r.series!
    // x = 0 is the initial amount, untouched.
    expect(surviving!.points[0]).toEqual([0, 100])
    expect(decayed!.points[0]).toEqual([0, 0])
    // Every point on the two lines adds to the initial amount.
    surviving!.points.forEach((p, i) => {
      expect(p[1] + decayed!.points[i]![1]).toBeCloseTo(100, 9)
      expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true)
      if (i > 0) expect(p[0]).toBeGreaterThan(surviving!.points[i - 1]![0])
    })
    // The horizon is five half-lives here, so the last point is 1/32 left.
    expect(surviving!.points.at(-1)![0]).toBe(25)
    expect(surviving!.points.at(-1)![1]).toBe(100 / 32)
  })

  test('nothing rendered ever reads as NaN', () => {
    for (const over of [
      {},
      { mode: 'halfLife' as const },
      { mode: 'time' as const },
      { mode: 'initial' as const },
      { elapsedTime: 100_000 },
      { halfLife: 0.1 },
    ]) {
      const view = toResultView(at(over))
      expect(view.primary.text).not.toContain('NaN')
      for (const s of view.stats) expect(s.text, `${s.label} @ ${JSON.stringify(over)}`).not.toContain('NaN')
      for (const s of view.steps) if (!('rule' in s)) expect(s.text).not.toContain('NaN')
    }
  })

  test('an underflowed remainder is explained rather than passed off as nothing', () => {
    const r = at({ elapsedTime: 100_000, halfLife: 0.1 })
    expect(num(r)).toBe(0)
    expect(r.notes!.join(' ')).toContain('not truly zero')
  })
})

describe('half-life — bounds and defaults', () => {
  test('every declared bound is one compute accepts, in the default mode', () => {
    for (const field of fields) {
      if (field.kind !== 'number') continue
      for (const bound of ['min', 'max'] as const) {
        const value = field[bound]
        expect(typeof value).toBe('number')
        expect(() => at({ [field.id]: value } as Partial<Input>), `${field.id}:${bound}`).not.toThrow()
      }
    }
  })

  test('every number default sits on min + n x step, which a slider snaps to', () => {
    for (const field of fields) {
      if (field.kind !== 'number') continue
      const steps = (field.default - field.min!) / field.step!
      expect(Math.abs(steps - Math.round(steps)), field.id).toBeLessThan(1e-9)
    }
  })

  test('the end-to-end nudge changes the result in the default mode', () => {
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('initialAmount')
    const nudged = at({ [first.id]: first.default * 1.1 } as Partial<Input>)
    expect(num(nudged)).not.toBe(num(at()))
    // 100 * 1.1 is 110.00000000000001, so two half-lives of it is
    // 27.500000000000004. The value is the input's own residue, not ours — and
    // it must still READ as 27.5, which is what `decimalsFor` is for.
    expect(num(nudged)).toBeCloseTo(27.5, 12)
    expect(toResultView(nudged).primary.text).toBe('27.5')
  })

  test('every select default is one of its own options, and the mode list is exhaustive', () => {
    for (const field of fields) {
      if (field.kind !== 'select') continue
      expect(field.options.map((o) => o.value)).toContain(field.default)
    }
    for (const option of fieldOf('mode').kind === 'select'
      ? (fieldOf('mode') as Extract<(typeof fields)[number], { kind: 'select' }>).options
      : []) {
      expect(() => at({ mode: option.value })).not.toThrow()
    }
  })

  test('every time unit is labelled, and unknown units fall back rather than break', () => {
    for (const unit of ['seconds', 'minutes', 'hours', 'days', 'years']) {
      const r = at({ timeUnit: unit })
      expect(toResultView(r).primary.label).toContain(unit)
      expect(statText(r, 'Half-life')).toContain(unit)
    }
    expect(() => at({ timeUnit: 'fortnights' })).not.toThrow()
  })
})

describe('half-life — copy', () => {
  test('the meta description and title fit a search result', () => {
    expect(def.description.length).toBeGreaterThan(50)
    expect(def.description.length).toBeLessThanOrEqual(160)
    expect(def.seoTitle.length).toBeLessThanOrEqual(70)
    expect(def.intro.length).toBeGreaterThan(40)
  })

  test('there are at least three substantial FAQs', () => {
    expect(def.faqs.length).toBeGreaterThanOrEqual(3)
    for (const faq of def.faqs) {
      expect(faq.q.endsWith('?'), faq.q).toBe(true)
      expect(faq.a.length, faq.q).toBeGreaterThan(120)
    }
  })

  test('every related slug already exists in the registry', () => {
    for (const slug of def.related) {
      expect(bySlug.has(slug), `half-life-calculator -> ${slug}`).toBe(true)
      expect(slug).not.toBe(def.slug)
    }
  })

  test('the definition carries no colour, class name or markup', () => {
    const serialized = JSON.stringify(def, (_k, v) => (typeof v === 'function' ? undefined : v))
    expect(serialized).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(serialized).not.toMatch(/\b(bg|text|border|rounded|shadow)-[a-z]+-\d{2,3}\b/)
    expect(serialized).not.toMatch(/<\/?[a-z][\s\S]*>/i)
  })
})

/**
 * A wide sweep, with an explicit timeout. Vitest's default is 5 seconds and the
 * whole suite runs in parallel, so a sweep that takes two seconds alone can take
 * seven under load and fail only in a full run.
 */
describe('half-life — sweep', () => {
  test(
    'every reachable combination is either a refusal or a finite, consistent result',
    () => {
      const amounts = [0.1, 2.5, 25, 100, 999.9, 100_000]
      const times = [0.1, 3.3, 10, 5730, 100_000]
      const modes = ['remaining', 'halfLife', 'time', 'initial']
      let answered = 0

      for (const mode of modes) {
        for (const initialAmount of amounts) {
          for (const remainingAmount of amounts) {
            for (const elapsedTime of times) {
              for (const halfLife of times) {
                let r: ReturnType<typeof compute>
                try {
                  r = compute({
                    mode,
                    initialAmount,
                    remainingAmount,
                    timeUnit: 'hours',
                    elapsedTime,
                    halfLife,
                  })
                } catch (err) {
                  // A refusal is an answer too — but it must be the typed one,
                  // aimed at a field, never a raw TypeError or a NaN in disguise.
                  expect(err).toBeInstanceOf(CalcError)
                  expect((err as CalcError).fieldId).toBeTruthy()
                  continue
                }
                answered++

                const where = `${mode} N0=${initialAmount} N=${remainingAmount} t=${elapsedTime} T=${halfLife}`
                expect(Number.isFinite(Number(r.primary.value)), where).toBe(true)

                // Parts stay an honest decomposition everywhere.
                const total = Number(r.partsTotal!.value)
                expect(r.parts!.reduce((a, p) => a + p.value, 0), where).toBeCloseTo(total, 4)
                for (const p of r.parts!) expect(p.value, where).toBeGreaterThanOrEqual(0)

                // The chart never restructures.
                expect(r.series, where).toHaveLength(2)
                for (const s of r.series!) {
                  expect(s.points.length, where).toBe(41)
                  s.points.forEach((point, i) => {
                    expect(Number.isFinite(point[0]) && Number.isFinite(point[1]), where).toBe(true)
                    if (i > 0) expect(point[0], where).toBeGreaterThan(s.points[i - 1]![0])
                  })
                }

                // lambda x T is ln 2 everywhere. Exact for a half-life the user
                // typed; at worst one unit in the last place when the half-life
                // was itself derived from a logarithm, since lambda = ln2 / T
                // then rounds a number that was already rounded once.
                const product = Number(
                  r.stats!.find((s) => s.label.startsWith('Check: lambda'))!.value,
                )
                expect(Math.abs(product - Math.LN2), where).toBeLessThanOrEqual(
                  Number.EPSILON * Math.LN2,
                )

                // And nothing renders as NaN.
                const view = toResultView(r)
                expect(view.primary.text, where).not.toContain('NaN')
                for (const s of view.stats) expect(s.text, where).not.toContain('NaN')
              }
            }
          }
        }
      }

      expect(answered).toBeGreaterThan(1000)
    },
    30_000,
  )
})

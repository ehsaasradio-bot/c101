import { describe, expect, test } from 'vitest'
import { existsSync } from 'node:fs'
import compute, {
  normalCdf,
  normalPdf,
  normalUpperTail,
  regularizedBeta,
  tCritical,
  tUpperTail,
  zCritical,
} from './compute'
import def from './index'
import { fields } from './fields'
import { resolveBand, scalePercent, toResultView } from '../../../lib/view'
import { CalcError } from '../../../lib/types'

type Input = {
  sampleMean: number
  standardDeviation: number
  sampleSize: number
  confidenceLevel: string
  distribution: string
}

const base: Input = {
  sampleMean: 100,
  standardDeviation: 15,
  sampleSize: 30,
  confidenceLevel: '95',
  distribution: 'sample',
}

const statOf = (result: ReturnType<typeof compute>, label: string) =>
  Number(result.stats!.find((s) => s.label === label)!.value)

const marginOf = (over: Partial<Input>) => statOf(compute({ ...base, ...over }), 'Margin of error (±)')

/** The stated error bound of Abramowitz & Stegun 26.2.17. */
const AS_ERROR_BOUND = 7.5e-8

/**
 * Φ(z) by Simpson's rule over the density — the second, completely independent
 * confirmation of the approximation. The lower limit of −12 carries about
 * 1.8e-33 of unaccounted mass, 25 orders of magnitude below the bound being
 * tested, and Simpson's own error at n = 4000 over a span of 16 is around
 * 3e-11, so anything this finds belongs to the approximation and not to the
 * integrator.
 */
function simpsonCdf(z: number, lower = -12, n = 4000): number {
  const h = (z - lower) / n
  let sum = normalPdf(lower) + normalPdf(z)
  for (let i = 1; i < n; i += 1) sum += normalPdf(lower + i * h) * (i % 2 === 1 ? 4 : 2)
  return (sum * h) / 3
}

describe('the normal distribution (Abramowitz & Stegun 26.2.17)', () => {
  /** Published standard-normal table values, quoted to the precision tables give. */
  const TABLE: ReadonlyArray<readonly [number, number, number]> = [
    [0, 0.5, 4],
    [1, 0.8413, 4],
    [1.645, 0.95, 4],
    [1.96, 0.975, 4],
    [2, 0.9772, 4],
    [2.576, 0.995, 4],
    [-1, 0.1587, 4],
    [-1.96, 0.025, 4],
  ]

  test.each(TABLE)('Phi(%p) matches the published table value %p', (z, expected, places) => {
    expect(normalCdf(z)).toBeCloseTo(expected, places)
  })

  test('agrees with Simpson integration of the density, inside the published bound', () => {
    let worst = 0
    for (let i = -400; i <= 400; i += 1) {
      worst = Math.max(worst, Math.abs(normalCdf(i / 100) - simpsonCdf(i / 100)))
    }
    expect(worst).toBeLessThanOrEqual(AS_ERROR_BOUND)
    // Pinned from below too, so a silent swap to a different approximation is
    // visible rather than merely still-passing.
    expect(worst).toBeGreaterThan(7.4e-8)
  })

  test('the tail helper stays finite and monotone rather than going NaN', () => {
    expect(normalUpperTail(0)).toBeCloseTo(0.5, 8)
    expect(normalUpperTail(40)).toBe(0)
    let previous = 1
    for (let x = 0; x <= 20; x += 0.25) {
      const value = normalUpperTail(x)
      expect(Number.isFinite(value)).toBe(true)
      expect(value).toBeLessThanOrEqual(previous)
      previous = value
    }
  })
})

describe('z critical values', () => {
  /**
   * The published two-sided z critical values, to seven decimals. These are the
   * outside-world anchors: a self-consistent implementation cannot fake them.
   *
   * [confidence level %, published z*, the tolerance this page claims]
   *
   * The tolerance is not arbitrary. Inverting an approximation whose CDF error
   * is bounded by 7.5e-8 lands the root within |ε| / φ(z) of the truth, which
   * grows as the tail thins. Each entry below is that prediction, rounded up.
   */
  const Z_TABLE: ReadonlyArray<readonly [number, number, number]> = [
    [80, 1.2815516, 5e-7],
    [90, 1.6448536, 5e-7],
    [95, 1.9599640, 2e-6],
    [98, 2.3263479, 2e-6],
    [99, 2.5758293, 3e-6],
  ]

  test.each(Z_TABLE)('z* at %p%% matches the published value %p', (level, published, tolerance) => {
    const z = zCritical(1 - level / 100)
    expect(Math.abs(z - published), `z* = ${z}`).toBeLessThan(tolerance)
  })

  test('every offered level prints the published z* correctly to four decimals', () => {
    // The practical statement of the bound above: whatever the seventh decimal
    // does, the number this page actually shows is the table value. This is why
    // the confidence-level field stops at 99% — at 99.9% the error is 3.3e-5
    // and 3.2906 would be printed where tables say 3.2905.
    for (const [level, published] of Z_TABLE) {
      expect(zCritical(1 - level / 100).toFixed(4)).toBe(published.toFixed(4))
    }
    expect(Math.abs(zCritical(0.001) - 3.2905267)).toBeGreaterThan(1e-5)
  })

  test('inverts the CDF it was built from, to the precision of the search', () => {
    // Independent of any table: whatever z* is, Φ(z*) must be 1 − α/2 under the
    // very same approximation. This catches a broken bisection, which a table
    // comparison at 1e-6 might not.
    for (const alpha of [0.2, 0.1, 0.05, 0.02, 0.01]) {
      expect(normalUpperTail(zCritical(alpha))).toBeCloseTo(alpha / 2, 12)
    }
  })
})

describe('Student t critical values', () => {
  /**
   * Published two-sided t critical values. The 0.975 column is the one every
   * textbook prints; the others check that the tail probability is being
   * inverted and not just one hard-coded column.
   *
   * [confidence level %, degrees of freedom, published t*]
   */
  const T_TABLE: ReadonlyArray<readonly [number, number, number]> = [
    [95, 1, 12.706],
    [95, 2, 4.303],
    [95, 5, 2.571],
    [95, 10, 2.228],
    [95, 15, 2.131],
    [95, 20, 2.086],
    [95, 29, 2.045],
    [95, 30, 2.042],
    [95, 60, 2.0],
    [95, 100, 1.984],
    [95, 120, 1.98],
    [90, 10, 1.812],
    [90, 30, 1.697],
    [99, 10, 3.169],
    [99, 30, 2.75],
    [80, 10, 1.372],
    [98, 10, 2.764],
  ]

  test.each(T_TABLE)('t* at %p%% with %p df is the published %p', (level, df, published) => {
    const t = tCritical(1 - level / 100, df)
    // Tables quote three decimals, so agreement to 5e-4 is agreement to every
    // digit published. The real accuracy is far better — see the next test.
    expect(Math.abs(t - published), `t* = ${t}`).toBeLessThan(5e-4)
  })

  test('matches the seven-decimal values, not just the three-decimal table', () => {
    // A polynomial approximation to the t quantile would pass the table above
    // and fail here. These come from the exact incomplete-beta identity.
    expect(tCritical(0.05, 1)).toBeCloseTo(12.7062047, 6)
    expect(tCritical(0.05, 10)).toBeCloseTo(2.2281389, 7)
    expect(tCritical(0.05, 30)).toBeCloseTo(2.0422725, 7)
    expect(tCritical(0.01, 10)).toBeCloseTo(3.1692727, 7)
    expect(tCritical(0.001, 1)).toBeCloseTo(636.6192488, 5)
  })

  test('inverts its own tail function exactly', () => {
    for (const alpha of [0.2, 0.1, 0.05, 0.02, 0.01]) {
      for (const df of [1, 2, 7, 29, 199, 4999]) {
        expect(tUpperTail(tCritical(alpha, df), df)).toBeCloseTo(alpha / 2, 12)
      }
    }
  })

  test('the incomplete beta satisfies its own symmetry, independent of any table', () => {
    // I_x(a,b) = 1 − I_{1−x}(b,a). The two sides take different branches of the
    // continued fraction, so this checks the branch switch as well as the
    // recurrence.
    for (const [a, b] of [
      [0.5, 0.5],
      [1, 0.5],
      [5, 0.5],
      [14.5, 0.5],
      [3, 7],
    ] as const) {
      for (const x of [0.05, 0.3, 0.5, 0.75, 0.99]) {
        expect(regularizedBeta(a, b, x)).toBeCloseTo(1 - regularizedBeta(b, a, 1 - x), 12)
      }
    }
  })

  test('t is always wider than z, and closes on it as the sample grows', () => {
    // The statistical claim the whole page rests on, asserted rather than
    // described: t* > z* at every finite df, monotonically decreasing toward it.
    const z = zCritical(0.05)
    let previous = Infinity
    for (const df of [1, 2, 5, 10, 30, 60, 120, 500, 2000, 20000]) {
      const t = tCritical(0.05, df)
      expect(t).toBeGreaterThan(z)
      expect(t).toBeLessThan(previous)
      previous = t
    }
    // t(0.975, ∞) = 1.960. At df = 100,000 the two agree to 3e-5, which is the
    // sum of the shrinking t correction and the z inversion error above.
    expect(tCritical(0.05, 100_000)).toBeCloseTo(1.96, 4)
    expect(Math.abs(tCritical(0.05, 100_000) - z)).toBeLessThan(3e-5)
  })
})

describe('the interval', () => {
  test('the defaults give 94.40 to 105.60, worked out by hand', () => {
    // x̄ = 100, s = 15, n = 30, 95%, t.
    //   SE  = 15 ÷ √30 = 15 ÷ 5.477225575 = 2.738612788
    //   t*  = t(0.975, 29) = 2.045229642        (published table: 2.045)
    //   ME  = 2.045229642 × 2.738612788 = 5.601092051
    //   CI  = 100 ∓ 5.601092051 = 94.398907949 … 105.601092051
    const result = compute(base)
    expect(result.primary.value).toBe('94.40 to 105.60')
    expect(statOf(result, 'Standard error of the mean')).toBeCloseTo(2.7386127875, 9)
    expect(statOf(result, 'Critical value t*(29 df)')).toBeCloseTo(2.0452296421, 9)
    expect(statOf(result, 'Margin of error (±)')).toBeCloseTo(5.6010920514, 9)
    expect(statOf(result, 'Lower bound')).toBeCloseTo(94.3989079486, 9)
    expect(statOf(result, 'Upper bound')).toBeCloseTo(105.6010920514, 9)
    expect(statOf(result, 'Interval width')).toBeCloseTo(2 * 5.6010920514, 9)
  })

  test('the bounds are the mean plus and minus the margin, always', () => {
    // A second reading of the same result: whatever the critical value did, the
    // interval must be symmetric about x̄ and exactly one width across.
    for (const over of [
      {},
      { sampleSize: 2 },
      { sampleSize: 100_000 },
      { confidenceLevel: '80' },
      { confidenceLevel: '99' },
      { distribution: 'population' },
      { sampleMean: -1234.5, standardDeviation: 0.01 },
    ] as Array<Partial<Input>>) {
      const result = compute({ ...base, ...over })
      const lower = statOf(result, 'Lower bound')
      const upper = statOf(result, 'Upper bound')
      const margin = statOf(result, 'Margin of error (±)')
      const centre = over.sampleMean ?? base.sampleMean
      expect((lower + upper) / 2).toBeCloseTo(centre, 9)
      expect(upper - lower).toBeCloseTo(2 * margin, 9)
      expect(margin).toBeGreaterThan(0)
    }
  })

  test('the z setting reproduces the textbook 1.96 interval', () => {
    // With σ known, x̄ ± 1.96 σ/√n exactly — the interval every introduction
    // starts with, and the one this page refuses to use when s is estimated.
    const result = compute({ ...base, distribution: 'population' })
    expect(statOf(result, 'Critical value z*')).toBeCloseTo(1.959964, 5)
    expect(statOf(result, 'Margin of error (±)')).toBeCloseTo(1.9599640 * 2.7386127875, 5)
    expect(result.primary.value).toBe('94.63 to 105.37')
    // Nothing about t is claimed when t is not in use.
    expect(result.stats!.some((s) => s.label.includes('t*'))).toBe(false)
    expect(result.scaleValue).toBeCloseTo(1, 12)
  })

  test('using z where t belongs understates a small sample materially', () => {
    // The page's whole reason for existing, as a number. n = 8 → 7 df.
    const withT = compute({ ...base, sampleSize: 8 })
    const withZ = compute({ ...base, sampleSize: 8, distribution: 'population' })
    const t = statOf(withT, 'Margin of error (±)')
    const z = statOf(withZ, 'Margin of error (±)')
    // Six decimals would be over-claiming: the ratio inherits the z critical
    // value's 1.2e-6 inversion error, which is 7.2e-7 on a ratio of 1.206.
    expect(t / z).toBeCloseTo(2.3646243 / 1.9599640, 5)
    expect(t / z).toBeGreaterThan(1.2)
    // Said the other way round, which is how the copy puts it: the z interval
    // is about 17% too narrow.
    expect(1 - z / t).toBeCloseTo(0.171, 3)
    expect(statOf(withT, 'How much wider t makes it')).toBeCloseTo(20.65, 2)
    expect(withT.notes!.join(' ')).toContain('17%')
  })

  test('the margin scales as 1 ÷ √n, exactly, when the critical value is fixed', () => {
    // The first of the two independent structural checks. Holding σ known pins
    // the critical value, so the ONLY thing left moving is 1/√n.
    const at = (n: number) => marginOf({ sampleSize: n, distribution: 'population' })
    const reference = at(100) * Math.sqrt(100)
    for (const n of [2, 3, 9, 25, 36, 100, 400, 10_000, 100_000]) {
      expect(at(n) * Math.sqrt(n)).toBeCloseTo(reference, 9)
    }
    // Quadrupling the sample halves the margin. Stated separately because that
    // is the form the FAQ makes a promise in.
    expect(at(400)).toBeCloseTo(at(100) / 2, 12)
    expect(at(3600)).toBeCloseTo(at(900) / 2, 12)
  })

  test('the margin scales linearly with the standard deviation', () => {
    // The second structural check. Doubling the spread doubles the margin, on
    // both distributions, at every level — no critical value depends on s.
    for (const distribution of ['sample', 'population']) {
      for (const confidenceLevel of ['80', '95', '99']) {
        const one = marginOf({ standardDeviation: 1, distribution, confidenceLevel })
        for (const s of [0.01, 2.5, 15, 137, 5000]) {
          expect(marginOf({ standardDeviation: s, distribution, confidenceLevel })).toBeCloseTo(
            one * s,
            9,
          )
        }
      }
    }
  })

  test('a higher confidence level always widens the interval', () => {
    const levels = ['80', '90', '95', '98', '99']
    for (const distribution of ['sample', 'population']) {
      for (const sampleSize of [2, 3, 8, 30, 500, 100_000]) {
        let previous = 0
        for (const confidenceLevel of levels) {
          const margin = marginOf({ confidenceLevel, distribution, sampleSize })
          expect(margin, `${distribution} n=${sampleSize} at ${confidenceLevel}%`).toBeGreaterThan(
            previous,
          )
          previous = margin
        }
      }
    }
  })

  test('a bigger sample always narrows the interval', () => {
    for (const distribution of ['sample', 'population']) {
      let previous = Infinity
      for (const sampleSize of [2, 3, 5, 8, 15, 30, 100, 1000, 100_000]) {
        const margin = marginOf({ sampleSize, distribution })
        expect(margin).toBeLessThan(previous)
        previous = margin
      }
    }
  })

  test('corrects the probability misreading in so many words', () => {
    const notes = compute(base).notes!.join(' ')
    expect(notes).toContain('does not mean there is a 95% probability')
    expect(notes).toContain('fixed number')
    expect(notes).toContain('95 intervals in every 100')
    // And it says which distribution it used, and why.
    expect(compute(base).notes![0]).toContain('Student')
    expect(compute(base).notes![0]).toContain('29 degrees of freedom')
    expect(compute({ ...base, distribution: 'population' }).notes![0]).toContain(
      'population standard deviation is being taken as known',
    )
  })

  test('the chart shows two bounds closing on the mean, at a fixed point count', () => {
    // The count must never vary with input: the chart is server-rendered from
    // the default result, and the island reconciles against whatever comes back.
    for (const over of [
      {},
      { sampleSize: 2 },
      { sampleSize: 100_000 },
      { distribution: 'population' },
      { confidenceLevel: '80' },
    ] as Array<Partial<Input>>) {
      const result = compute({ ...base, ...over })
      expect(result.series).toHaveLength(2)
      for (const series of result.series!) {
        expect(series.points).toHaveLength(45)
        series.points.forEach((point, i) => {
          expect(Number.isFinite(point[0])).toBe(true)
          expect(Number.isFinite(point[1])).toBe(true)
          if (i > 0) expect(point[0]).toBeGreaterThan(series.points[i - 1]![0])
        })
      }
      const [lower, upper] = result.series!
      // Both lines run toward the mean, never past it or across each other.
      for (let i = 0; i < 45; i += 1) {
        expect(lower!.points[i]![1]).toBeLessThan(over.sampleMean ?? base.sampleMean)
        expect(upper!.points[i]![1]).toBeGreaterThan(over.sampleMean ?? base.sampleMean)
        if (i > 0) {
          expect(lower!.points[i]![1]).toBeGreaterThan(lower!.points[i - 1]![1])
          expect(upper!.points[i]![1]).toBeLessThan(upper!.points[i - 1]![1])
        }
      }
    }
  })
})

describe('refusals', () => {
  test('a sample of 0 or 1 has no interval, and is rejected against that field', () => {
    for (const sampleSize of [0, 1, -4]) {
      let thrown: unknown
      try {
        compute({ ...base, sampleSize })
      } catch (err) {
        thrown = err
      }
      expect(thrown).toBeInstanceOf(CalcError)
      expect((thrown as CalcError).fieldId).toBe('sampleSize')
      expect((thrown as CalcError).message).toContain('at least 2')
    }
    // The reason, spelled out: n − 1 = 0 degrees of freedom.
    expect(() => compute({ ...base, sampleSize: 1 })).toThrow(/degrees of freedom/)
  })

  test('a fractional sample size is refused rather than silently used', () => {
    let thrown: unknown
    try {
      compute({ ...base, sampleSize: 30.5 })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe('sampleSize')
  })

  test('a zero or negative standard deviation is impossible', () => {
    for (const standardDeviation of [0, -0.01, -15]) {
      let thrown: unknown
      try {
        compute({ ...base, standardDeviation })
      } catch (err) {
        thrown = err
      }
      expect(thrown).toBeInstanceOf(CalcError)
      expect((thrown as CalcError).fieldId).toBe('standardDeviation')
    }
  })

  test('never returns NaN for unparseable input', () => {
    // coerceValues emits NaN, and every magnitude test here — `<= 0`, `< 2` —
    // is false for NaN, so the finiteness guard has to come first or a NaN
    // reaches the page.
    for (const field of ['sampleMean', 'standardDeviation', 'sampleSize'] as const) {
      let thrown: unknown
      try {
        compute({ ...base, [field]: Number.NaN })
      } catch (err) {
        thrown = err
      }
      expect(thrown).toBeInstanceOf(CalcError)
      expect((thrown as CalcError).fieldId).toBe(field)
      expect(() => compute({ ...base, [field]: Number.POSITIVE_INFINITY })).toThrow(CalcError)
    }
    expect(() => compute({ ...base, confidenceLevel: 'nonsense' })).toThrow(CalcError)
  })

  test('an unknown distribution falls back to t rather than to nothing', () => {
    // The select cannot produce this, but a stale query string could. Anything
    // that is not the explicit "population" choice is treated as an estimate,
    // which is the conservative direction: the wider interval.
    expect(compute({ ...base, distribution: 'whatever' }).primary.value).toBe(
      compute(base).primary.value,
    )
  })
})

/**
 * The conformance rules this calculator will be held to once it is in the
 * registry barrel, asserted here so it cannot land already failing them. These
 * mirror `registry.test.ts` and `field-bounds.test.ts`.
 */
describe('definition', () => {
  test('the copy fits a search result', () => {
    expect(def.description.length).toBeGreaterThan(50)
    expect(def.description.length).toBeLessThanOrEqual(160)
    expect(def.seoTitle.length).toBeLessThanOrEqual(70)
    expect(def.intro.length).toBeGreaterThan(40)
    expect(def.faqs.length).toBeGreaterThanOrEqual(3)
    for (const faq of def.faqs) {
      expect(faq.q.endsWith('?')).toBe(true)
      expect(faq.a.length).toBeGreaterThan(40)
    }
  })

  test('holds no colours, class names, or markup', () => {
    const serialized = JSON.stringify(def, (_k, v) => (typeof v === 'function' ? undefined : v))
    expect(serialized).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(serialized).not.toMatch(/\b(bg|text|border|rounded|shadow)-[a-z]+-\d{2,3}\b/)
    expect(serialized).not.toMatch(/<\/?[a-z][\s\S]*>/i)
  })

  test('every related slug points at a calculator that already exists', () => {
    for (const slug of def.related) {
      expect(slug).not.toBe(def.slug)
      const found = ['financial', 'health', 'math', 'everyday'].some((category) =>
        existsSync(new URL(`../../${category}/${slug}/index.ts`, import.meta.url)),
      )
      expect(found, `related slug ${slug} does not resolve`).toBe(true)
    }
  })

  test('field ids are camelCase and number defaults sit on the slider grid', () => {
    for (const field of fields) {
      expect(field.id).toMatch(/^[a-z][a-zA-Z0-9]*$/)
      if (field.kind !== 'number') continue
      expect(field.default).toBeGreaterThanOrEqual(field.min)
      expect(field.default).toBeLessThanOrEqual(field.max)
      // An HTML range snaps to min + n × step, and a default off that grid
      // shifts the moment the control is touched. The negative minimum on
      // sampleMean makes this worth checking rather than assuming.
      const n = (field.default - field.min) / field.step
      expect(Math.abs(n - Math.round(n)), `${field.id} is off the step grid`).toBeLessThan(1e-9)
    }
  })

  test('select defaults are among their own options', () => {
    for (const field of fields) {
      if (field.kind !== 'select') continue
      expect(field.options.map((o) => o.value)).toContain(field.default)
      expect(field.options.length).toBeGreaterThan(1)
    }
  })

  test('both ends of every slider are values compute accepts', () => {
    const defaults = Object.fromEntries(fields.map((f) => [f.id, f.default])) as never
    for (const field of fields) {
      if (field.kind !== 'number') continue
      for (const bound of [field.min, field.max]) {
        expect(() =>
          compute({ ...(defaults as object), [field.id]: bound } as never),
        ).not.toThrow()
      }
    }
  })

  test('the scale bands are ordered, contiguous, and cover every reachable ratio', () => {
    const { bands, min, max } = def.scale
    expect(min).toBeLessThan(max)
    bands.forEach((band, i) => {
      expect(band.from).toBeLessThan(band.to)
      if (i > 0) expect(band.from).toBe(bands[i - 1]!.to)
    })
    // resolveBand falls back to the LAST band when nothing matches, so a ratio
    // below the first band would be mislabelled "far wider than z". The widest
    // ratio reachable is t(0.995, 1) ÷ z(0.995) = 63.657 ÷ 2.576 ≈ 24.7.
    for (const ratio of [0.5, 1, 1.0435, 1.2, 25, 1000]) {
      const band = bands.find((b) => ratio >= b.from && ratio < b.to)
      expect(band, `ratio ${ratio} falls outside every band`).toBeDefined()
      expect(resolveBand(def.scale, ratio)).toBe(band)
      const percent = scalePercent(def.scale, ratio)
      expect(percent).toBeGreaterThanOrEqual(0)
      expect(percent).toBeLessThanOrEqual(100)
    }
  })

  test('renders at its defaults with a resolved band, a chart, and no NaN', () => {
    const view = toResultView(compute(base), def.scale)
    expect(view.primary.text).toBe('94.40 to 105.60')
    expect(view.band).toBe('neutral')
    expect(view.bandLabel).toBe('Noticeably wider than z')
    expect(view.scalePercent).toBeCloseTo(14.5014, 3)
    for (const stat of view.stats) expect(stat.text).not.toContain('NaN')
    for (const step of view.steps) expect(JSON.stringify(step)).not.toContain('NaN')
    // Whatever can ever be drawn has to be drawable at the defaults, or the
    // server never renders the container for the island to fill.
    expect(view.series).toHaveLength(2)
    expect(view.parts).toEqual([])
  })

  test('the end-to-end nudge of the first number field still answers', () => {
    // tests/calculators.spec.ts sets the first number field to 1.1x its default
    // and expects a valid, DIFFERENT result. The headline is the interval, so a
    // shift of the mean moves it — a headline of "margin of error" would not.
    const nudged = compute({ ...base, sampleMean: 110 })
    expect(nudged.primary.value).toBe('104.40 to 115.60')
    expect(nudged.primary.value).not.toBe(compute(base).primary.value)
  })

  test(
    'every reachable combination answers or refuses cleanly, and never with NaN',
    () => {
      // The wide sweep. Explicitly timed out: vitest's default is 5 seconds and
      // the suite runs in parallel, so a sweep that takes two seconds alone can
      // take seven under load and fail only in a full run.
      let computed = 0
      for (const distribution of ['sample', 'population']) {
        for (const confidenceLevel of ['80', '90', '95', '98', '99']) {
          for (const sampleSize of [2, 3, 5, 8, 30, 31, 200, 5000, 100_000]) {
            for (const standardDeviation of [0.01, 1, 15, 5000]) {
              for (const sampleMean of [-10_000, -1, 0, 100, 10_000]) {
                const result = compute({
                  sampleMean,
                  standardDeviation,
                  sampleSize,
                  confidenceLevel,
                  distribution,
                })
                computed += 1
                expect(String(result.primary.value)).not.toContain('NaN')
                expect(Number.isFinite(result.scaleValue!)).toBe(true)
                expect(result.scaleValue).toBeGreaterThanOrEqual(1)
                for (const stat of result.stats!) expect(Number.isFinite(Number(stat.value))).toBe(true)
                const lower = statOf(result, 'Lower bound')
                const upper = statOf(result, 'Upper bound')
                expect(upper).toBeGreaterThan(lower)
                expect((lower + upper) / 2).toBeCloseTo(sampleMean, 6)
              }
            }
          }
        }
      }
      expect(computed).toBe(2 * 5 * 9 * 4 * 5)
    },
    30_000,
  )
})

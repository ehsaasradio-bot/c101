import { describe, expect, test } from 'vitest'
import { existsSync } from 'node:fs'
import compute, { normalCdf, normalPdf, normalUpperTail } from './compute'
import def from './index'
import { fields } from './fields'
import { resolveBand, scalePercent, toResultView } from '../../../lib/view'
import { CalcError } from '../../../lib/types'

const base: { value: number; mean: number; standardDeviation: number } = {
  value: 85,
  mean: 71,
  standardDeviation: 10,
}

const statOf = (result: ReturnType<typeof compute>, label: string) =>
  Number(result.stats!.find((s) => s.label === label)!.value)

/**
 * The stated error bound of Abramowitz & Stegun 26.2.17: |ε(x)| less than
 * 7.5e-8. Everything below is pinned to this one constant, so if the
 * approximation is ever swapped the bound moves in exactly one place.
 */
const AS_ERROR_BOUND = 7.5e-8

/**
 * Φ(z) by Simpson's rule over the density, the second and completely
 * independent confirmation.
 *
 * The lower limit of −12 is not an approximation worth worrying about: the mass
 * below z = −12 is about 1.8e-33, some 25 orders of magnitude under the bound
 * being tested. Simpson's own error is (b−a)h⁴·max|f⁗| / 180, which at n = 4000
 * over a span of 16 is around 3e-11 — three orders of magnitude below the
 * bound, so any disagreement found here belongs to the approximation and not to
 * the integrator.
 */
function simpsonCdf(z: number, lower = -12, n = 4000): number {
  const h = (z - lower) / n
  let sum = normalPdf(lower) + normalPdf(z)
  for (let i = 1; i < n; i += 1) sum += normalPdf(lower + i * h) * (i % 2 === 1 ? 4 : 2)
  return (sum * h) / 3
}

describe('normal CDF (Abramowitz & Stegun 26.2.17)', () => {
  /**
   * Published standard-normal table values. These are the ones every statistics
   * textbook prints, quoted to the precision the tables themselves give — the
   * outside-world anchor that a self-consistent implementation cannot fake.
   */
  const TABLE: ReadonlyArray<readonly [number, number, number]> = [
    // [z, published Φ(z), decimal places the table quotes]
    [0, 0.5, 4],
    [1, 0.8413, 4],
    [1.645, 0.95, 4],
    [1.96, 0.975, 4],
    [2, 0.9772, 4],
    [2.576, 0.995, 4],
    [3, 0.99865, 5],
    [-1, 0.1587, 4],
    [-1.96, 0.025, 4],
    [-3, 0.00135, 5],
  ]

  test.each(TABLE)('Phi(%p) matches the published table value %p', (z, expected, places) => {
    expect(normalCdf(z)).toBeCloseTo(expected, places)
  })

  test('agrees with Simpson integration of the density to within the stated bound', () => {
    let worst = 0
    let worstAt = 0
    for (let i = -400; i <= 400; i += 1) {
      const z = i / 100
      const error = Math.abs(normalCdf(z) - simpsonCdf(z))
      if (error > worst) {
        worst = error
        worstAt = z
      }
    }
    // Observed: 7.4506e-8 at z = −0.72, just inside the published bound. Pinned
    // as an equality-ish window so a drift in either direction is visible.
    expect(worst, `worst deviation was at z = ${worstAt}`).toBeLessThanOrEqual(AS_ERROR_BOUND)
    expect(worst).toBeGreaterThan(7.4e-8)
    expect(worstAt).toBeCloseTo(-0.72, 6)
  })

  test('the far tails stay finite and monotone rather than going NaN', () => {
    expect(normalCdf(-40)).toBe(0)
    expect(normalCdf(40)).toBe(1)
    expect(normalCdf(-1e6)).toBe(0)
    expect(normalCdf(1e6)).toBe(1)
    let previous = -1
    for (let z = -20; z <= 20; z += 0.5) {
      const value = normalCdf(z)
      expect(Number.isFinite(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(previous)
      previous = value
    }
  })

  test('is symmetric: Phi(-z) equals 1 - Phi(z)', () => {
    for (let i = 1; i <= 800; i += 1) {
      const z = i / 100
      // Exact by construction: both sides are the same tail value, computed
      // once from |z| and reflected, so only the final subtraction rounds.
      expect(Math.abs(normalCdf(-z) - (1 - normalCdf(z)))).toBeLessThan(1e-15)
    }
    // At zero the approximation itself is off by 5.2e-10 rather than landing on
    // exactly 0.5, so the two sides differ by twice that. Still far inside the
    // published bound, but not zero, and worth stating rather than hiding.
    expect(Math.abs(normalCdf(0) - 0.5)).toBeCloseTo(5.248e-10, 13)
    expect(Math.abs(normalCdf(-0) - (1 - normalCdf(0)))).toBeLessThan(2 * AS_ERROR_BOUND)
  })

  test('the tail helper agrees with 1 - Phi without cancellation', () => {
    for (const z of [0.5, 1, 1.96, 3, 5]) {
      expect(normalUpperTail(z)).toBeCloseTo(1 - normalCdf(z), 12)
    }
  })
})

describe('z-score', () => {
  test('z at the defaults is exactly 1.4', () => {
    // (85 − 71) ÷ 10 = 14 ÷ 10 = 1.4, worked out by hand and confirmed by the
    // steps below, which carry the same three numbers through independently.
    const result = compute(base)
    expect(Number(result.primary.value)).toBeCloseTo(1.4, 12)

    // `steps` may hold a `{ rule: true }` separator alongside quantities, so
    // narrow by the presence of `label` rather than asserting the whole array
    // is one shape — the blunt cast does not typecheck, and would hide a rule
    // row silently matching nothing.
    const step = (label: string) =>
      Number(
        result
          .steps!.filter((s): s is Extract<typeof s, { label: string }> => 'label' in s)
          .find((s) => s.label === label)!.value,
      )
    expect(step('Deviation (x − μ)')).toBeCloseTo(14, 12)
    expect(step('z = (x − μ) ÷ σ')).toBeCloseTo(1.4, 12)
    expect(result.scaleValue).toBeCloseTo(1.4, 12)
  })

  test('reports the percentile, both tail areas, and the two-tailed p', () => {
    const result = compute(base)
    // Φ(1.4) = 0.9192433 — the published table gives 0.9192.
    expect(statOf(result, 'Percentile (area to the left)')).toBeCloseTo(91.92, 2)
    expect(statOf(result, 'Area to the right')).toBeCloseTo(8.08, 2)
    // The two areas are a partition, so they must add to exactly 100 points.
    expect(
      statOf(result, 'Percentile (area to the left)') + statOf(result, 'Area to the right'),
    ).toBeCloseTo(100, 10)
    // Two-tailed p = 2 × 0.0807567 = 0.1615134.
    expect(statOf(result, 'Two-tailed p-value')).toBeCloseTo(0.161513, 6)
    expect(statOf(result, 'Distance from the mean')).toBeCloseTo(14, 12)
    expect(statOf(result, 'Standard deviations away')).toBeCloseTo(1.4, 12)
  })

  test('says in words where the value sits', () => {
    // The headline the page exists for: not "z = 1.4" but "the 92nd percentile".
    expect(compute(base).notes![0]).toContain('1.4 standard deviations above the mean')
    expect(compute(base).notes![0]).toContain('92nd percentile')
  })

  test('the p-value at z = 1.96 is the familiar 0.05', () => {
    // 1.96 standard deviations is the textbook two-sided 5% cut-off. Built from
    // inputs rather than by feeding z in directly, so the whole chain is tested.
    const result = compute({ value: 71 + 19.6, mean: 71, standardDeviation: 10 })
    expect(Number(result.primary.value)).toBeCloseTo(1.96, 12)
    expect(statOf(result, 'Two-tailed p-value')).toBeCloseTo(0.05, 4)
    expect(statOf(result, 'Percentile (area to the left)')).toBeCloseTo(97.5, 3)
  })

  test('a value at the mean scores zero and sits at the 50th percentile', () => {
    const result = compute({ ...base, value: 71 })
    expect(Number(result.primary.value)).toBe(0)
    expect(statOf(result, 'Percentile (area to the left)')).toBeCloseTo(50, 6)
    expect(result.notes![0]).toContain('50th percentile')
  })

  test('a value below the mean gives a negative z and mirrors the percentile', () => {
    const above = compute({ ...base, value: 71 + 14 })
    const below = compute({ ...base, value: 71 - 14 })
    expect(Number(below.primary.value)).toBeCloseTo(-1.4, 12)
    expect(
      statOf(below, 'Percentile (area to the left)') + statOf(above, 'Percentile (area to the left)'),
    ).toBeCloseTo(100, 8)
    expect(below.notes![0]).toContain('below the mean')
  })

  test('the z-score is scale-free: shifting and stretching everything leaves it alone', () => {
    // A second, independent confirmation of the formula. If x, μ and σ are all
    // measured in different units, z must not move.
    const original = Number(compute(base).primary.value)
    const rescaled = Number(
      compute({ value: 85 * 2.5 + 7, mean: 71 * 2.5 + 7, standardDeviation: 10 * 2.5 }).primary
        .value,
    )
    expect(rescaled).toBeCloseTo(original, 12)
  })

  test('rejects a standard deviation of zero against that field', () => {
    let thrown: unknown
    try {
      compute({ ...base, standardDeviation: 0 })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe('standardDeviation')
    expect(() => compute({ ...base, standardDeviation: -5 })).toThrow(CalcError)
  })

  test('never returns NaN for unparseable input', () => {
    // coerceValues emits NaN, and `standardDeviation <= 0` is false for NaN, so
    // the finiteness guard has to come first or a NaN reaches the result.
    for (const field of ['value', 'mean', 'standardDeviation'] as const) {
      let thrown: unknown
      try {
        compute({ ...base, [field]: Number.NaN })
      } catch (err) {
        thrown = err
      }
      expect(thrown).toBeInstanceOf(CalcError)
      expect((thrown as CalcError).fieldId).toBe(field)
    }
    expect(() => compute({ ...base, value: Number.POSITIVE_INFINITY })).toThrow(CalcError)
  })

  test('stays finite at the extremes the sliders can reach', () => {
    for (const values of [
      { value: -1000, mean: 71, standardDeviation: 10 },
      { value: 1000, mean: 71, standardDeviation: 10 },
      { value: 85, mean: -1000, standardDeviation: 10 },
      { value: 85, mean: 1000, standardDeviation: 10 },
      { value: 85, mean: 71, standardDeviation: 0.1 },
      { value: 85, mean: 71, standardDeviation: 500 },
    ]) {
      const result = compute(values)
      expect(Number.isFinite(Number(result.primary.value))).toBe(true)
      for (const stat of result.stats!) expect(Number.isFinite(Number(stat.value))).toBe(true)
      expect(statOf(result, 'Percentile (area to the left)')).toBeGreaterThanOrEqual(0)
      expect(statOf(result, 'Percentile (area to the left)')).toBeLessThanOrEqual(100)
    }
  })
})

/**
 * The conformance rules this calculator will be held to once it is in the
 * registry barrel, asserted here so it cannot land already failing them. These
 * mirror `registry.test.ts` and `field-bounds.test.ts`; they are a fast local
 * loop, not a replacement for either.
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

  test('field ids are camelCase and defaults sit on the slider grid', () => {
    for (const field of fields) {
      expect(field.id).toMatch(/^[a-z][a-zA-Z0-9]*$/)
      expect(field.default).toBeGreaterThanOrEqual(field.min)
      expect(field.default).toBeLessThanOrEqual(field.max)
      // An HTML range snaps to min + n × step, and a default off that grid
      // silently shifts the moment the control is touched. The negative minima
      // here make this worth checking rather than assuming.
      const n = (field.default - field.min) / field.step
      expect(Math.abs(n - Math.round(n)), `${field.id} is off the step grid`).toBeLessThan(1e-9)
    }
  })

  test('both ends of every slider are values compute accepts', () => {
    const defaults = Object.fromEntries(fields.map((f) => [f.id, f.default])) as never
    for (const field of fields) {
      for (const bound of [field.min, field.max]) {
        expect(() => compute({ ...(defaults as object), [field.id]: bound } as never)).not.toThrow()
      }
    }
  })

  test('the scale bands are ordered, contiguous, and cover every reachable z', () => {
    const { bands, min, max } = def.scale
    expect(min).toBeLessThan(max)
    bands.forEach((band, i) => {
      expect(band.from).toBeLessThan(band.to)
      if (i > 0) expect(band.from).toBe(bands[i - 1]!.to)
    })
    // resolveBand falls back to the LAST band when nothing matches, so a z below
    // the first band would be mislabelled "extreme high". The widest z the form
    // can produce is (1000 + 1000) / 0.1 = 20,000 either way.
    for (const z of [-20_000, -3.5, -1, 0, 1.4, 3.5, 20_000]) {
      const band = def.scale.bands.find((b) => z >= b.from && z < b.to)
      expect(band, `z = ${z} falls outside every band`).toBeDefined()
      expect(resolveBand(def.scale, z)).toBe(band)
      const percent = scalePercent(def.scale, z)
      expect(percent).toBeGreaterThanOrEqual(0)
      expect(percent).toBeLessThanOrEqual(100)
    }
  })

  test('renders at its defaults with a resolved band and no NaN', () => {
    const view = toResultView(compute({ value: 85, mean: 71, standardDeviation: 10 }), def.scale)
    expect(view.primary.text).toBe('1.4000')
    expect(view.band).toBe('good')
    expect(view.bandLabel).toBe('Above average')
    expect(view.scalePercent).toBeCloseTo(73.333333, 4)
    for (const stat of view.stats) expect(stat.text).not.toContain('NaN')
    for (const step of view.steps) expect(JSON.stringify(step)).not.toContain('NaN')
    // Nothing drawable is claimed, so nothing has to appear at the defaults.
    expect(view.parts).toEqual([])
    expect(view.series).toEqual([])
  })

  test('the end-to-end nudge of the first number field still answers', () => {
    // tests/calculators.spec.ts sets the first number field to 1.1x its default
    // and expects a valid, different result.
    const nudged = compute({ value: 85 * 1.1, mean: 71, standardDeviation: 10 })
    expect(Number(nudged.primary.value)).toBeCloseTo(2.25, 12)
    expect(Number(nudged.primary.value)).not.toBeCloseTo(1.4, 6)
  })
})

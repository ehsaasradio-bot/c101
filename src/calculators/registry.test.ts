import { describe, expect, test } from 'vitest'
import { calculators, bySlug } from './index'
import { categoryById } from '../lib/categories'
import { defaultValues, toResultView } from '../lib/view'
import type { CalcResult, CalculatorDef, Field } from '../lib/types'

/**
 * Every value a field can actually take, sampled: its bounds, its default, the
 * small integers that tend to be special-cased (0, 1, 2), and a few interior
 * points. Enough to reach the branches that add or drop a component — PMI
 * appearing once the deposit falls below 20%, a property tax of zero dropping
 * its own slice.
 */
function samples(field: Field): unknown[] {
  switch (field.kind) {
    case 'number': {
      const { min, max, default: def } = field
      const interior =
        min !== undefined && max !== undefined
          ? [0.25, 0.5, 0.75].map((f) => min + (max - min) * f)
          : []
      return [min, max, def, 0, 1, 2, ...interior]
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
        .filter((v) => (min === undefined || v >= min) && (max === undefined || v <= max))
        .map((v) => Number(v.toFixed(6)))
    }
    case 'select':
      return field.options.map((o) => o.value)
    case 'toggle':
      return [true, false]
    case 'date':
      return ['2020-01-01', '2030-12-31']
    case 'text':
      return [field.default]
  }
}

/**
 * Each result a visitor can actually reach, labelled by the single input that
 * produced it. One field moves at a time from the defaults, which keeps this
 * linear in the field count while still crossing the interesting thresholds.
 */
function* reachable(calc: CalculatorDef): Generator<readonly [string, CalcResult]> {
  const base = defaultValues(calc)
  yield ['defaults', calc.compute(base as never)]

  for (const field of calc.fields) {
    for (const value of samples(field)) {
      let result: CalcResult
      try {
        result = calc.compute({ ...base, [field.id]: value } as never)
      } catch {
        // A CalcError is a refusal to answer, not an answer. The island shows
        // the message and the theme draws nothing, so there is no shape to check.
        continue
      }
      yield [`${field.id}=${String(value)}`, result]
    }
  }
}

/**
 * The guardrail that lets this scale to 170 calculators without codegen.
 * Every calculator is checked structurally, so adding one to the barrel
 * automatically subjects it to all of these — nothing to remember, nothing to
 * regenerate.
 */
describe('registry', () => {
  test('slugs are unique', () => {
    const slugs = calculators.map((c) => c.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  test('registry is not empty', () => {
    expect(calculators.length).toBeGreaterThan(0)
  })

  describe.each(calculators.map((c) => [c.slug, c] as const))('%s', (_slug, calc: CalculatorDef) => {
    test('slug is kebab-case and matches its route', () => {
      expect(calc.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    })

    test('belongs to a real category', () => {
      expect(categoryById.has(calc.category)).toBe(true)
    })

    test('meta description fits in a search result', () => {
      expect(calc.description.length).toBeGreaterThan(50)
      expect(calc.description.length).toBeLessThanOrEqual(160)
    })

    test('has a title, seo title and intro', () => {
      expect(calc.title.length).toBeGreaterThan(0)
      expect(calc.seoTitle.length).toBeGreaterThan(0)
      expect(calc.seoTitle.length).toBeLessThanOrEqual(70)
      expect(calc.intro.length).toBeGreaterThan(40)
    })

    test('has at least three FAQs, each answered', () => {
      expect(calc.faqs.length).toBeGreaterThanOrEqual(3)
      for (const faq of calc.faqs) {
        expect(faq.q.endsWith('?')).toBe(true)
        expect(faq.a.length).toBeGreaterThan(40)
      }
    })

    test('every related slug resolves — dead links are impossible', () => {
      for (const slug of calc.related) {
        expect(bySlug.has(slug), `${calc.slug} → ${slug}`).toBe(true)
        expect(slug).not.toBe(calc.slug)
      }
    })

    test('field ids are unique, camelCase, and safe as selectors', () => {
      const ids = calc.fields.map((f) => f.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const id of ids) expect(id).toMatch(/^[a-z][a-zA-Z0-9]*$/)
      expect(calc.fields.length).toBeGreaterThan(0)
    })

    test('select defaults are one of the offered options', () => {
      for (const field of calc.fields) {
        if (field.kind === 'select') {
          expect(field.options.map((o) => o.value)).toContain(field.default)
          expect(field.options.length).toBeGreaterThan(1)
        }
      }
    })

    test('number defaults sit inside their own min/max', () => {
      for (const field of calc.fields) {
        if (field.kind === 'number') {
          if (field.min !== undefined) expect(field.default).toBeGreaterThanOrEqual(field.min)
          if (field.max !== undefined) expect(field.default).toBeLessThanOrEqual(field.max)
        }
      }
    })

    test('lastReviewed is an ISO date', () => {
      expect(calc.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Number.isNaN(Date.parse(calc.lastReviewed))).toBe(false)
    })

    // THE ORGANIZING RULE, enforced. A definition that reaches for a colour or a
    // class name has leaked presentation into data and will break a theme swap.
    test('contains no colours, class names, or HTML', () => {
      const serialized = JSON.stringify(calc, (_k, v) =>
        typeof v === 'function' ? undefined : v,
      )
      expect(serialized).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(serialized).not.toMatch(/\b(bg|text|border|rounded|shadow)-[a-z]+-\d{2,3}\b/)
      expect(serialized).not.toMatch(/<\/?[a-z][\s\S]*>/i)
    })

    test('scale bands are ordered and contiguous', () => {
      if (!calc.scale) return
      const { bands, min, max } = calc.scale
      expect(bands.length).toBeGreaterThan(0)
      expect(min).toBeLessThan(max)
      bands.forEach((band, i) => {
        expect(band.from).toBeLessThan(band.to)
        if (i > 0) expect(band.from).toBe(bands[i - 1]!.to)
      })
    })

    test('computes from its own defaults without throwing', () => {
      const result = calc.compute(defaultValues(calc) as never)
      expect(result.primary).toBeDefined()
      expect(result.primary.label.length).toBeGreaterThan(0)
      const numeric = Number(result.primary.value)
      expect(Number.isFinite(numeric) || typeof result.primary.value === 'string').toBe(true)
    })

    test('supplies a scaleValue whenever it declares a scale', () => {
      const result = calc.compute(defaultValues(calc) as never)
      if (calc.scale) {
        expect(result.scaleValue).toBeDefined()
        expect(Number.isFinite(result.scaleValue!)).toBe(true)
      }
    })

    test('parts add up to the whole they claim', () => {
      const result = calc.compute(defaultValues(calc) as never)
      if (!result.parts?.length) return

      // The donut prints this total in its centre, so a mismatch is a visible
      // lie: slices that do not add up to the number beside them.
      const whole = Number((result.partsTotal ?? result.primary).value)
      const sum = result.parts.reduce((acc, p) => acc + p.value, 0)
      expect(Number.isFinite(whole)).toBe(true)
      expect(sum).toBeCloseTo(whole, 4)
      for (const part of result.parts) {
        expect(Number.isFinite(part.value)).toBe(true)
        expect(part.value).toBeGreaterThanOrEqual(0)
        expect(part.label.length).toBeGreaterThan(0)
      }
    })

    /*
     * The count of `parts` and `series` is NOT fixed — a mortgage drops
     * "Property tax" when you zero it and gains "PMI" below a 20% deposit — and
     * the studio theme reconciles its rows against whatever comes back. What it
     * cannot do is conjure a container that was never rendered: the donut and
     * the chart are server-rendered from the DEFAULT result, and only when that
     * result has something to draw (SummaryCard.astro, CalculatorPage.astro).
     *
     * So a calculator that produces components only for some non-default input
     * would have no donut on the page at all, and no client-side redraw can fix
     * that. This is the progressive-enhancement rule in src/islands/CONTRACT.md
     * — never rely on the island to fill in a card the server did not render —
     * pointed at the one thing that survived making the count dynamic.
     */
    test('anything drawable off-default is already drawable at the defaults', () => {
      const atDefault = calc.compute(defaultValues(calc) as never)
      const defaultView = toResultView(atDefault, calc.scale)

      // Each entry is a block the studio theme renders only when the DEFAULT
      // result calls for it. Miss one and it can never appear, however the
      // visitor edits the form.
      const gated = [
        {
          block: 'parts (the donut)',
          present: (r: CalcResult) => (r.parts?.length ?? 0) > 0,
        },
        {
          block: 'series (the chart)',
          present: (r: CalcResult) => (r.series?.length ?? 0) > 0,
        },
        {
          block: 'steps (the "how this is calculated" panel)',
          present: (r: CalcResult) => (r.steps?.length ?? 0) > 0,
        },
        {
          block: 'stats (the second hero card)',
          present: (r: CalcResult) => (r.stats?.length ?? 0) > 0,
        },
        {
          block: 'a band (the summary pill)',
          present: (r: CalcResult) => Boolean(toResultView(r, calc.scale).bandLabel),
        },
      ]

      const atDefaults = gated.map((g) => g.present(atDefault))
      expect(defaultView).toBeDefined()

      for (const [how, result] of reachable(calc)) {
        gated.forEach((g, i) => {
          if (!g.present(result)) return
          expect(
            atDefaults[i],
            `${calc.slug}: ${g.block} appears at ${how} but not at the defaults, so the theme never renders it`,
          ).toBe(true)
        })
      }
    })

    // The same honesty check as above, across the whole input space rather than
    // only the defaults. The donut prints the whole in its centre, so slices
    // that stop adding up are a visible lie — and until the theme reconciled its
    // arcs, zeroing one component silently left a stale slice behind to prove it.
    test('parts stay an honest decomposition across the input space', () => {
      for (const [how, result] of reachable(calc)) {
        if (!result.parts?.length) continue
        const whole = Number((result.partsTotal ?? result.primary).value)
        if (!Number.isFinite(whole)) continue
        const sum = result.parts.reduce((acc, p) => acc + p.value, 0)
        expect(sum, `${calc.slug} @ ${how}`).toBeCloseTo(whole, 4)
        for (const part of result.parts) {
          expect(Number.isFinite(part.value), `${calc.slug} @ ${how}`).toBe(true)
          expect(part.value, `${calc.slug} @ ${how}`).toBeGreaterThanOrEqual(0)
          expect(part.label.length, `${calc.slug} @ ${how}`).toBeGreaterThan(0)
        }
      }
    })

    // Every series the theme draws gets its path built from points[0] and
    // points[at-1]; an empty one would throw inside the redraw.
    test('every drawn series has points, across the input space', () => {
      for (const [how, result] of reachable(calc)) {
        for (const series of result.series ?? []) {
          expect(series.points.length, `${calc.slug} @ ${how}`).toBeGreaterThan(0)
          expect(series.label.length, `${calc.slug} @ ${how}`).toBeGreaterThan(0)
        }
      }
    })

    test('series are ordered, finite, and non-trivial', () => {
      const result = calc.compute(defaultValues(calc) as never)
      for (const series of result.series ?? []) {
        expect(series.points.length).toBeGreaterThan(1)
        expect(series.label.length).toBeGreaterThan(0)
        series.points.forEach((point, i) => {
          expect(Number.isFinite(point[0])).toBe(true)
          expect(Number.isFinite(point[1])).toBe(true)
          // Strictly increasing x, or the chart path doubles back on itself.
          if (i > 0) expect(point[0]).toBeGreaterThan(series.points[i - 1]![0])
        })
      }
    })

    /*
     * A chart must name its own axis.
     *
     * The theme has to fall back to something when a calculator says nothing,
     * and that fallback is financial — "Balance over time", measured in
     * "Years". It was right for the mortgage page it was written for and
     * silently wrong on every other chart: a one-rep-max curve of load against
     * REPS, a kinematics plot in SECONDS, an amortisation schedule running 360
     * MONTHS. Nothing caught it, because copy inside a server-rendered SVG is
     * read by no test and contradicted by nothing else on the page.
     *
     * So the fallback stays as a safety net and stops being reachable: draw a
     * chart, name its axis. Naming the title too is optional — the default
     * caption is at least vague rather than false.
     */
    test('a chart names its own x axis rather than inheriting "Years"', () => {
      for (const [how, result] of reachable(calc)) {
        if (!result.series?.length) continue
        const xLabel = result.chart?.xLabel
        expect(
          typeof xLabel === 'string' && xLabel.trim().length > 0,
          `${calc.slug} @ ${how}: draws a chart but names no x axis, so it would claim "Years"`,
        ).toBe(true)
      }
    })

    test('chart copy is wording, not presentation', () => {
      // The organizing rule, applied to the one field that carries free text
      // into the theme. A class or a hex here would leak presentation into data
      // exactly as a colour in a label would.
      for (const [, result] of reachable(calc)) {
        for (const text of [result.chart?.title, result.chart?.xLabel]) {
          if (!text) continue
          expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
          expect(text).not.toMatch(/\b(bg|text|border|rounded|shadow)-[a-z]+-\d{2,3}\b/)
          expect(text).not.toMatch(/<\/?[a-z][\s\S]*>/i)
        }
      }
    })

    test('renders to a complete view with a resolved band', () => {
      const view = toResultView(calc.compute(defaultValues(calc) as never), calc.scale)
      expect(view.primary.text).not.toBe('')
      expect(view.primary.text).not.toContain('NaN')
      for (const s of view.stats) expect(s.text).not.toContain('NaN')
      if (calc.scale) {
        expect(view.band).toBeDefined()
        expect(view.scalePercent).toBeGreaterThanOrEqual(0)
        expect(view.scalePercent).toBeLessThanOrEqual(100)
      }
    })

    // A calculator whose default is "today" produces different output tomorrow,
    // so snapshotting it would fail every midnight rather than on a real change.
    const isDateDependent = calc.fields.some((f) => f.kind === 'date' && f.default === 'today')

    test.skipIf(isDateDependent)('default output is stable', () => {
      const view = toResultView(calc.compute(defaultValues(calc) as never), calc.scale)
      expect({ primary: view.primary, stats: view.stats, band: view.band }).toMatchSnapshot()
    })
  })
})

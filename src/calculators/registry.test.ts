import { describe, expect, test } from 'vitest'
import { calculators, bySlug } from './index'
import { categoryById } from '../lib/categories'
import { defaultValues, toResultView } from '../lib/view'
import type { CalculatorDef } from '../lib/types'

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

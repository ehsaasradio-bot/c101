import type { NumberField, ResultView } from '../../lib/types'
import { convertBetween } from '../../lib/view'
import { decoratedTicks, softRange } from './range'

/**
 * The studio theme's own behaviour: sliders, charts and scenario presets.
 *
 * None of this lives in the island. The island publishes a `calc:result` event
 * (see src/islands/CONTRACT.md) and this file decides what to draw with it — so
 * chart geometry belongs to the theme that chose to have charts, and swapping
 * themes takes the visuals along with it.
 */

const form = document.querySelector('calc-form')
if (form) {
  // ── Sliders mirror their number input, in both directions ────────────────
  const paintTrack = (range: HTMLInputElement) => {
    const min = Number(range.min)
    const max = Number(range.max)
    const pct = max > min ? ((Number(range.value) - min) / (max - min)) * 100 : 0
    range.style.setProperty('--fill', `${Math.min(100, Math.max(0, pct)).toFixed(2)}%`)
  }

  const ranges = Array.from(form.querySelectorAll<HTMLInputElement>('input[data-mirrors]'))

  for (const range of ranges) {
    const target = form.querySelector<HTMLInputElement>(
      `[data-calc-field="${range.dataset.mirrors}"]`,
    )
    if (!target) continue

    range.addEventListener('input', () => {
      paintTrack(range)
      target.value = range.value
      // Re-dispatch on the real field so the island sees one source of truth.
      target.dispatchEvent(new Event('input', { bubbles: true }))
    })

    target.addEventListener('input', () => {
      if (document.activeElement === range) return
      range.value = target.value
      paintTrack(range)
    })

    paintTrack(range)
  }

  // ── Unit-aware bounds ────────────────────────────────────────────────────
  // A height field means 50–250 in centimetres and 20–98 in inches. When the
  // controlling select changes we re-point the bounds AND convert what the
  // visitor already typed — otherwise 178 cm silently becomes 178 in.
  type Variants = NonNullable<NumberField['variants']>

  const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-field-row][data-variants]'))
  const lastUnit = new Map<string, string>()

  const applyVariant = (row: HTMLElement, convert: boolean) => {
    const variants = JSON.parse(row.dataset.variants ?? 'null') as Variants | null
    if (!variants) return

    const id = row.dataset.fieldRow!
    const controller = form.querySelector<HTMLSelectElement>(`[data-calc-field="${variants.on}"]`)
    const numberEl = form.querySelector<HTMLInputElement>(`[data-calc-field="${id}"]`)
    const range = form.querySelector<HTMLInputElement>(`input[data-mirrors="${id}"]`)
    if (!controller || !numberEl) return

    const selected = controller.value
    const variant = variants.cases[selected]
    if (!variant) return

    const previous = lastUnit.get(id)
    lastUnit.set(id, selected)

    // Restate the value in the new unit. Handles reciprocal pairs (L/100km vs
    // mpg) and leaves converter inputs alone, since those variants declare no
    // conversion at all.
    if (convert && previous && previous !== selected) {
      const current = Number(numberEl.value)
      const converted = convertBetween(current, variants.cases[previous], variant)
      if (Number.isFinite(converted) && converted !== current) {
        const dp = (variant.step ?? 1) < 1 ? 2 : 0
        numberEl.value = String(Number(converted.toFixed(dp)))
      }
    }

    const baseMin = Number(row.dataset.baseMin)
    const baseMax = Number(row.dataset.baseMax)
    const min = variant.min ?? baseMin
    const max = variant.max ?? baseMax
    const step = variant.step

    numberEl.min = String(min)
    numberEl.max = String(max)
    if (step !== undefined) numberEl.step = String(step)

    const unitLabel = row.querySelector('[data-unit-label]')
    if (unitLabel && variant.unit) unitLabel.textContent = variant.unit

    if (range) {
      const soft = softRange(min, max, Number(numberEl.value) || min)
      range.min = String(soft.min)
      range.max = String(soft.max)
      if (step !== undefined) range.step = String(step)
      range.value = String(Math.min(Math.max(Number(numberEl.value), soft.min), soft.max))

      // Same tick count as the server render, so only the text is rewritten —
      // this file never generates markup.
      const ticks = row.querySelectorAll('[data-ticks] span')
      const labels = decoratedTicks(soft.min, soft.max, variant.unit, soft.cappedMin, soft.cappedMax)
      ticks.forEach((span, i) => {
        if (labels[i] !== undefined) span.textContent = labels[i]!
      })

      paintTrack(range)
    }
  }

  for (const row of rows) {
    const variants = JSON.parse(row.dataset.variants ?? 'null') as Variants | null
    if (!variants) continue
    applyVariant(row, false)
    const controller = form.querySelector<HTMLSelectElement>(`[data-calc-field="${variants.on}"]`)
    controller?.addEventListener('change', () => {
      applyVariant(row, true)
      // The converted value is the new truth — recompute from it.
      form.querySelector<HTMLInputElement>(`[data-calc-field="${row.dataset.fieldRow}"]`)
        ?.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  // ── Dependent selects ────────────────────────────────────────────────────
  // Choosing "Temperature" must not leave "Kilometres" selected. Options are
  // all present in the DOM already; this only toggles which are offered and
  // moves the value if it just became invalid.
  type SelectVariants = {
    on: string
    cases: Record<string, { options: string[]; default?: string }>
  }

  const selectRows = Array.from(
    document.querySelectorAll<HTMLElement>('[data-select-row][data-variants]'),
  )

  for (const row of selectRows) {
    const variants = JSON.parse(row.dataset.variants ?? 'null') as SelectVariants | null
    if (!variants) continue

    const id = row.dataset.selectRow!
    const select = form.querySelector<HTMLSelectElement>(`[data-calc-field="${id}"]`)
    const controller = form.querySelector<HTMLSelectElement>(`[data-calc-field="${variants.on}"]`)
    if (!select || !controller) continue

    controller.addEventListener('change', () => {
      const variant = variants.cases[controller.value]
      if (!variant) return

      for (const option of Array.from(select.options)) {
        const ok = variant.options.includes(option.value)
        option.hidden = !ok
        option.disabled = !ok
      }

      if (!variant.options.includes(select.value)) {
        select.value = variant.default ?? variant.options[0]!
        // `change` as well as `input`: this select may itself control a number
        // field's bounds (the converter's value depends on the unit, which
        // depends on the category), and those listeners are on `change`.
        select.dispatchEvent(new Event('input', { bubbles: true }))
        select.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })
  }

  // ── Scenario presets ─────────────────────────────────────────────────────
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-scenario]')) {
    button.addEventListener('click', () => {
      const values = JSON.parse(button.dataset.scenario ?? '{}') as Record<string, string>
      for (const [id, value] of Object.entries(values)) {
        const field = form.querySelector<HTMLInputElement>(`[data-calc-field="${id}"]`)
        if (!field) continue
        field.value = value
        field.dispatchEvent(new Event('input', { bubbles: true }))
      }
      document.querySelector('[data-calc-out="primary"]')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    })
  }

  // ── Charts ───────────────────────────────────────────────────────────────
  const donut = document.querySelector('[data-studio-donut]')
  const chart = document.querySelector<HTMLElement>('[data-studio-chart]')
  const R = 56
  const CIRC = 2 * Math.PI * R

  const drawDonut = (view: ResultView) => {
    if (!donut) return
    const centre = donut.querySelector('[data-donut-center]')
    if (centre) centre.textContent = view.partsTotal.text
    let offset = 0
    view.parts.forEach((part, i) => {
      const arc = donut.querySelector<SVGCircleElement>(`[data-donut-arc="${i}"]`)
      const dash = (part.percent / 100) * CIRC
      if (arc) {
        arc.setAttribute('stroke-dasharray', `${dash.toFixed(2)} ${(CIRC - dash).toFixed(2)}`)
        arc.setAttribute('stroke-dashoffset', (-offset).toFixed(2))
      }
      const value = donut.querySelector(`[data-donut-value="${i}"]`)
      if (value) value.textContent = part.text
      const percent = donut.querySelector(`[data-donut-percent="${i}"]`)
      if (percent) percent.textContent = `${part.percent.toFixed(0)}%`
      offset += dash
    })
  }

  const drawChart = (view: ResultView) => {
    if (!chart || view.series.length === 0) return
    const geo = JSON.parse(chart.dataset.chartGeometry ?? '{}') as {
      W: number
      H: number
      PAD: { top: number; right: number; bottom: number; left: number }
    }
    const { W, H, PAD } = geo

    const xs = view.series.flatMap((s) => s.points.map((p) => p[0]))
    const ys = view.series.flatMap((s) => s.points.map((p) => p[1]))
    const xMin = Math.min(...xs)
    const xMax = Math.max(...xs)
    const yMax = Math.max(...ys) * 1.05 || 1

    const sx = (x: number) => PAD.left + ((x - xMin) / (xMax - xMin || 1)) * (W - PAD.left - PAD.right)
    const sy = (y: number) => H - PAD.bottom - (y / yMax) * (H - PAD.top - PAD.bottom)

    view.series.forEach((series, i) => {
      const d = series.points
        .map((p, j) => `${j === 0 ? 'M' : 'L'}${sx(p[0]).toFixed(1)} ${sy(p[1]).toFixed(1)}`)
        .join(' ')
      chart.querySelector(`[data-chart-line="${i}"]`)?.setAttribute('d', d)

      const areaEl = chart.querySelector(`[data-chart-area="${i}"]`)
      if (areaEl) {
        const last = series.points[series.points.length - 1]!
        const first = series.points[0]!
        areaEl.setAttribute(
          'd',
          `${d} L${sx(last[0]).toFixed(1)} ${H - PAD.bottom} L${sx(first[0]).toFixed(1)} ${H - PAD.bottom} Z`,
        )
      }
    })
  }

  const liveScenario = document.querySelector<HTMLElement>('[data-scenario-live]')
  const heroCells = document.querySelectorAll<HTMLElement>('[data-hero-highlight]')
  const drawHero = (view: ResultView) => {
    const texts = [view.primary.text, (view.stats[1] ?? view.stats[0])?.text]
    heroCells.forEach((cell, i) => {
      if (texts[i]) cell.textContent = texts[i]!
    })
  }

  form.addEventListener('calc:result', (event) => {
    const view = (event as CustomEvent<ResultView>).detail
    drawDonut(view)
    drawChart(view)
    drawHero(view)
    if (liveScenario) liveScenario.textContent = view.primary.text
  })
}

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

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Types the hero headline out once, leaving a blinking caret behind.
 *
 * The markup already contains the finished sentence; this only replays it. Two
 * things follow from that, and both matter more than the effect itself:
 *
 *  - The text is not cleared until the first animation frame actually runs. If
 *    frames never come — a hidden tab, a throttled renderer — the headline is
 *    simply left complete rather than blanked forever. An animation may never
 *    be the only path to the page's own content.
 *  - A watchdog completes the line if frames stop midway, so a stalled tween
 *    cannot strand a half-written headline.
 */
function typeHeadline() {
  const line = document.querySelector<HTMLElement>('[data-typewriter-line]')
  const target = line?.querySelector<HTMLElement>('[data-typewriter]')
  const caret = line?.querySelector<HTMLElement>('[data-caret]')
  if (!line || !target || !caret) return

  const full = target.textContent ?? ''
  if (!full) return

  // Assistive tech reads the whole sentence, never a half-typed one.
  line.setAttribute('aria-label', full)

  // A hidden page cannot show an animation, and browsers stop serving frames to
  // one. Typing into it would strand a half-written headline that only finishes
  // if the visitor happens to look. Same guard the count-up uses.
  if (prefersReducedMotion() || document.visibilityState !== 'visible') return

  const CHAR_MS = 34
  let typed = 0

  const finish = () => {
    target.textContent = full
    typed = full.length
  }

  /*
   * Driven by a timer, not requestAnimationFrame.
   *
   * Typing is a discrete ~30-per-second change, so frame timing buys nothing,
   * and rAF stops entirely when a page is not being painted — which strands the
   * sentence. A throttled timer merely runs slower, and still finishes.
   */
  const step = () => {
    typed += 1
    target.textContent = full.slice(0, typed)
    if (typed < full.length) setTimeout(step, CHAR_MS)
  }

  // Reserve the finished height before emptying, so filling the lines back in
  // cannot shift everything below the hero.
  line.style.minHeight = `${line.offsetHeight}px`
  target.textContent = ''
  caret.hidden = false
  setTimeout(step, CHAR_MS)

  // Belt and braces: if the page is backgrounded mid-sentence and the timer is
  // throttled to a crawl, complete it rather than leave it hanging.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' && typed < full.length) finish()
  })
}

typeHeadline()

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

    // Clamp into the new bounds. For a pure unit switch this never fires — cm
    // and in describe the same range, so a converted value is already inside it.
    // It matters when a variant genuinely narrows the range, as body-surface-area
    // does when it moves from an adult to an infant: 178 cm is not a length a
    // baby has, and leaving it put would show the form in a state its own
    // compute rejects. The slider below already clamps itself; without this the
    // two controls disagree and the number input is the one that is wrong.
    const held = Number(numberEl.value)
    if (Number.isFinite(held)) {
      const bounded = Math.min(Math.max(held, min), max)
      if (bounded !== held) numberEl.value = String(bounded)
    }

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
  const donut = document.querySelector<HTMLElement>('[data-studio-donut]')
  const chart = document.querySelector<HTMLElement>('[data-studio-chart]')
  const R = 56
  const CIRC = 2 * Math.PI * R

  const slot = (row: Element, name: string, text: string) => {
    const el = row.querySelector<HTMLElement>(`[data-slot="${name}"]`)
    if (el) el.textContent = text
  }

  /**
   * The prototype row a theme `<template>` holds, ready to clone.
   *
   * SVG prototypes are wrapped in a throwaway `<svg>` inside their template so
   * the parser builds them in the right namespace; unwrap that here rather than
   * in every caller. A bare `<path>` in a template is an unknown HTML element
   * and paints nothing once cloned into a chart.
   */
  const prototype = (root: ParentNode, selector: string): Element | null => {
    const template = root.querySelector<HTMLTemplateElement>(selector)
    const first = template?.content.firstElementChild
    // Lowercase tagName only happens for foreign content, so this cannot
    // mistake an HTML row (SPAN, LI) for the wrapper.
    const node = first?.tagName === 'svg' ? first.firstElementChild : first
    return node ? (node.cloneNode(true) as Element) : null
  }

  /**
   * Brings `container` to `count` rows, cloning the theme's own `<template>`
   * for anything new, then fills every row from its index.
   *
   * A part or series count is NOT a build-time fact — a mortgage drops
   * "Property tax" when you zero it and gains "PMI" below a 20% deposit — so
   * nothing here may assume the server-rendered arity survives.
   *
   * Deliberately a reconcile rather than the island's wholesale
   * `replaceChildren`: arcs and lines carry CSS transitions, and an element
   * created this frame has no previous value to animate from. Touching the DOM
   * only when the count really changed keeps the common keystroke — same rows,
   * new numbers — tweening as before.
   */
  const reconcile = (
    container: Element,
    count: number,
    proto: (index: number) => Element | null,
    fill: (row: Element, index: number) => void,
  ) => {
    while (container.children.length > count) container.lastElementChild!.remove()
    while (container.children.length < count) {
      const row = proto(container.children.length)
      if (!row) break
      container.append(row)
    }
    Array.from(container.children).forEach(fill)
  }

  const drawDonut = (view: ResultView) => {
    if (!donut) return

    const centre = donut.querySelector('[data-donut-center]')
    if (centre) centre.textContent = view.partsTotal.text
    const centreLabel = donut.querySelector('[data-donut-center-label]')
    if (centreLabel) centreLabel.textContent = view.partsTotal.label

    // A ring with no components is not a donut. Hide the block rather than
    // leave the previous breakdown standing under a total it no longer splits.
    donut.hidden = view.parts.length === 0
    if (view.parts.length === 0) return

    // Offsets are cumulative, so they are resolved up front — a row's geometry
    // depends on every row before it, not on its own index.
    let running = 0
    const geometry = view.parts.map((part) => {
      const dash = (part.percent / 100) * CIRC
      const offset = running
      running += dash
      return { dash, offset }
    })

    const arcs = donut.querySelector('[data-donut-arcs]')
    if (arcs) {
      const proto = () => prototype(donut, 'template[data-donut-row="arc"]')
      reconcile(arcs, view.parts.length, proto, (arc, i) => {
        const { dash, offset } = geometry[i]!
        // An index, never a colour: CSS resolves [data-cat] to a hue. The same
        // rule the island follows with data-band. See src/islands/CONTRACT.md.
        arc.setAttribute('data-cat', String(i % 5))
        arc.setAttribute('stroke-dasharray', `${dash.toFixed(2)} ${(CIRC - dash).toFixed(2)}`)
        arc.setAttribute('stroke-dashoffset', (-offset).toFixed(2))
        slot(arc, 'label', view.parts[i]!.label)
      })
    }

    const legend = donut.querySelector('[data-donut-legend]')
    if (legend) {
      const proto = () => prototype(donut, 'template[data-donut-row="legend"]')
      reconcile(legend, view.parts.length, proto, (row, i) => {
        const part = view.parts[i]!
        row.setAttribute('data-cat', String(i % 5))
        slot(row, 'label', part.label)
        slot(row, 'value', part.text)
        slot(row, 'percent', `${part.percent.toFixed(0)}%`)
      })
    }
  }

  const drawChart = (view: ResultView) => {
    if (!chart) return
    // Nothing to plot: hide it rather than leave the previous curve on screen
    // as though it still described the inputs.
    chart.hidden = view.series.length === 0
    if (view.series.length === 0) return

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

    const legend = chart.querySelector('[data-chart-legend]')
    if (legend) {
      const proto = () => prototype(chart, 'template[data-chart-row="legend"]')
      reconcile(legend, view.series.length, proto, (row, i) => {
        row.setAttribute('data-cat', String(i % 5))
        slot(row, 'label', view.series[i]!.label)
      })
    }

    const lines = chart.querySelector('[data-chart-series]')
    if (!lines) return

    // Only the first series is filled, so index picks the prototype — the same
    // way the island picks between a step row and a rule.
    const seriesProto = (i: number) =>
      prototype(chart, `template[data-chart-row="${i === 0 ? 'series-filled' : 'series'}"]`)

    reconcile(lines, view.series.length, seriesProto, (group, i) => {
      const series = view.series[i]!
      group.setAttribute('data-cat', String(i % 5))

      const d = series.points
        .map((p, j) => `${j === 0 ? 'M' : 'L'}${sx(p[0]).toFixed(1)} ${sy(p[1]).toFixed(1)}`)
        .join(' ')
      group.querySelector('[data-slot="line"]')?.setAttribute('d', d)

      const areaEl = group.querySelector('[data-slot="area"]')
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

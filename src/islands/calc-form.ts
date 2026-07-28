import type {
  CalculatorView,
  Compute,
  FormatSpec,
  FormattedQuantity,
  ResultView,
  StepRule,
} from '../lib/types'
import { CalcError } from '../lib/types'
import { formatValue } from '../lib/format'
import { coerceValues, toResultView } from '../lib/view'

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Makes a calculator interactive. Reads the contract in ./CONTRACT.md before
 * changing anything here — in particular, this file must never contain markup.
 *
 * `import.meta.glob` in its lazy form yields `{ path: () => import(path) }`, so
 * Vite code-splits every compute function into its own chunk and the page
 * downloads exactly one (a few hundred bytes). No eval, no formula strings,
 * which is what lets `public/_headers` ship without 'unsafe-eval'.
 */
const computeModules = import.meta.glob<{ default: Compute }>('../calculators/*/*/compute.ts')

const computeBySlug = new Map(
  Object.entries(computeModules).map(([path, load]) => [path.split('/').at(-2)!, load]),
)

const isRule = (step: FormattedQuantity | StepRule): step is StepRule => 'rule' in step

/** Kept in step with --motion-med in the theme's tokens.css. */
const COUNT_MS = 480

class CalcForm extends HTMLElement {
  #config?: CalculatorView
  #compute?: Compute
  #lastPrimary = Number.NaN
  #tween = 0
  #fields: HTMLInputElement[] = []

  async connectedCallback() {
    const configEl = this.querySelector('[data-calc-config]')
    const slug = this.dataset.slug
    if (!configEl?.textContent || !slug) return

    this.#config = JSON.parse(configEl.textContent) as CalculatorView

    const load = computeBySlug.get(slug)
    if (!load) {
      console.error(`[calc-form] no compute module for "${slug}"`)
      return
    }
    this.#compute = (await load()).default

    this.#fields = Array.from(this.querySelectorAll<HTMLInputElement>('[data-calc-field]'))
    this.addEventListener('input', () => this.run())
    this.addEventListener('change', () => this.run())

    // One silent pass to reconcile with whatever is actually in the fields.
    //
    // Usually that matches the server render exactly and nothing visibly
    // changes. It matters on reload and back/forward, where the browser
    // restores previously typed values into the inputs: without this the page
    // would show restored inputs beside the server's result for the defaults.
    // It also seeds the count-up, so the first real edit counts from the right
    // number instead of jumping. `#lastPrimary` is NaN here, which is precisely
    // what makes this first paint instant rather than animated.
    this.run()

    this.dataset.ready = 'true'
  }

  #readValues(): Record<string, string | boolean> {
    const raw: Record<string, string | boolean> = {}
    for (const el of this.#fields) {
      const id = el.dataset.calcField
      if (!id) continue
      raw[id] = el.type === 'checkbox' ? el.checked : el.value
    }
    return raw
  }

  run() {
    const config = this.#config
    const compute = this.#compute
    if (!config || !compute) return

    const errorEl = this.querySelector<HTMLElement>('[data-calc-error]')
    const resultEl = this.querySelector<HTMLElement>('[data-calc-result]')

    for (const el of this.#fields) el.removeAttribute('aria-invalid')

    try {
      const values = coerceValues(config.fields, this.#readValues())
      const view = toResultView(compute(values as never), config.scale)
      this.#paint(view)
      errorEl?.setAttribute('hidden', '')
      resultEl?.removeAttribute('hidden')
    } catch (err) {
      const message =
        err instanceof CalcError
          ? err.message
          : 'Something is off with those inputs — please check them and try again.'
      if (err instanceof CalcError && err.fieldId) {
        this.querySelector(`[data-calc-field="${err.fieldId}"]`)?.setAttribute('aria-invalid', 'true')
      }
      if (errorEl) {
        errorEl.textContent = message
        errorEl.removeAttribute('hidden')
      }
      resultEl?.setAttribute('hidden', '')
    }
  }

  #paint(view: ResultView) {
    this.#paintPrimary(view.primary)
    this.#setText('[data-calc-out="primary-label"]', view.primary.label)
    this.#setText('[data-calc-out="band-label"]', view.bandLabel ?? '')

    // A semantic token, never a colour. The theme's CSS resolves it.
    if (view.band) this.dataset.band = view.band
    else delete this.dataset.band

    const scaleEl = this.querySelector<HTMLElement>('[data-calc-scale]')
    if (scaleEl && view.scalePercent !== undefined) {
      scaleEl.style.setProperty('--calc-pos', `${view.scalePercent.toFixed(2)}%`)
    }

    this.#fill(
      'stats',
      view.stats,
      (row, stat) => {
        this.#slot(row, 'label', stat.label)
        this.#slot(row, 'value', stat.text)
      },
      undefined,
      true,
    )

    this.#fill(
      'steps',
      view.steps,
      (row, step) => {
        if (isRule(step)) return
        this.#slot(row, 'label', step.label)
        this.#slot(row, 'value', step.text)
      },
      (step) => (isRule(step) ? 'rule' : 'step'),
    )

    this.#fill('notes', view.notes, (row, note) => this.#slot(row, 'value', note))

    // Anything richer than text — donuts, time-series charts — is the theme's
    // business, not this file's. Publishing the result and stopping here is
    // what keeps chart geometry out of the island and inside the theme that
    // actually chose to draw it.
    this.dispatchEvent(
      new CustomEvent<ResultView>('calc:result', { detail: view, bubbles: true }),
    )
  }

  #setText(selector: string, text: string) {
    const el = this.querySelector<HTMLElement>(selector)
    if (el) el.textContent = text
  }

  /**
   * Counts the headline from its previous value to the new one, but only when
   * the theme asked for it via `data-animate="count"` and the value is actually
   * numeric — a raw result like "3:4" or "0y 6m 27d" is swapped instantly.
   *
   * Each frame re-runs `formatValue` rather than interpolating the formatted
   * string, so currency symbols, separators and precision stay correct
   * throughout the tween instead of only at the endpoints.
   */
  #paintPrimary(primary: FormattedQuantity) {
    const el = this.querySelector<HTMLElement>('[data-calc-out="primary"]')
    if (!el) return

    const to = typeof primary.value === 'number' ? primary.value : Number.NaN
    const from = this.#lastPrimary

    // Write the final value FIRST, before considering animation.
    //
    // The tween runs on requestAnimationFrame, which browsers throttle or stop
    // entirely for hidden and non-painting pages. If the count-up were the only
    // path to the correct number, switching tabs mid-edit would leave a stale
    // headline beside freshly updated stats — which is exactly what happened
    // here. An animation may never decide what the page says; it may only
    // decide how it gets there.
    el.textContent = primary.text
    this.#lastPrimary = to

    const animatable =
      el.dataset.animate === 'count' &&
      Number.isFinite(to) &&
      Number.isFinite(from) &&
      from !== to &&
      document.visibilityState === 'visible' &&
      !prefersReducedMotion()

    if (!animatable) return

    // A newer paint supersedes an in-flight tween rather than racing it.
    this.#tween += 1
    const ticket = this.#tween
    const start = performance.now()
    const spec: FormatSpec = primary.format

    const step = (now: number) => {
      if (ticket !== this.#tween) return
      // Clamp BOTH ends. rAF reports the current frame's timestamp, which can
      // predate the `start` captured moments earlier — a negative p cubes into
      // a negative ease and paints a first frame below the starting value.
      const p = Math.min(1, Math.max(0, (now - start) / COUNT_MS))
      const eased = 1 - Math.pow(1 - p, 3)
      el.textContent = p === 1 ? primary.text : formatValue(from + (to - from) * eased, spec)
      if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  #slot(row: DocumentFragment | HTMLElement, name: string, text: string) {
    const el = row.querySelector<HTMLElement>(`[data-slot="${name}"]`)
    if (el) el.textContent = text
  }

  /** Clones the theme's own <template> once per item. The only DOM this file creates. */
  #fill<T>(
    list: string,
    items: readonly T[],
    apply: (row: DocumentFragment, item: T) => void,
    rowKind: (item: T) => string = () => list.replace(/s$/, ''),
    markChanges = false,
  ) {
    const container = this.querySelector<HTMLElement>(`[data-calc-list="${list}"]`)
    if (!container) return

    // Rows are replaced wholesale, so "what changed" has to be read off the
    // outgoing DOM first. Without this every row would flash on every
    // keystroke, which is noise rather than signal.
    const previous = markChanges
      ? Array.from(container.children).map(
          (el) => el.querySelector('[data-slot="value"]')?.textContent ?? '',
        )
      : []

    const fragment = document.createDocumentFragment()
    items.forEach((item, i) => {
      const template = this.querySelector<HTMLTemplateElement>(
        `template[data-calc-row="${rowKind(item)}"]`,
      )
      if (!template) return
      const row = template.content.cloneNode(true) as DocumentFragment
      apply(row, item)

      if (markChanges && previous.length > 0) {
        const el = row.firstElementChild as HTMLElement | null
        const next = el?.querySelector('[data-slot="value"]')?.textContent ?? ''
        // An attribute, never a class — the theme's CSS owns what a change
        // looks like. See CONTRACT.md.
        if (el && previous[i] !== undefined && previous[i] !== next) el.dataset.changed = 'true'
      }
      fragment.append(row)
    })
    container.replaceChildren(fragment)
  }
}

if (!customElements.get('calc-form')) customElements.define('calc-form', CalcForm)

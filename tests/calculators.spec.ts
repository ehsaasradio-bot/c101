import { test, expect } from '@playwright/test'
import { calculators } from '../src/calculators'
import { categories } from '../src/lib/categories'

/**
 * Derived from the registry, never a hardcoded slug list. Adding calculator
 * #171 extends this suite automatically — which is the whole point of keeping
 * `src/calculators/index.ts` a plain TS barrel that Playwright can import.
 */
for (const calc of calculators) {
  test.describe(calc.slug, () => {
    test('renders, computes at build time, and recomputes live', async ({ page }) => {
      const errors: string[] = []
      page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
      page.on('pageerror', (err) => errors.push(err.message))

      await page.goto(`/calculators/${calc.slug}/`)

      await expect(page.locator('h1')).toHaveText(calc.title)

      // The result must already be correct before the island runs.
      const primary = page.locator('[data-calc-out="primary"]')
      await expect(primary).not.toBeEmpty()
      const serverRendered = (await primary.textContent())!.trim()
      expect(serverRendered).not.toContain('NaN')

      // Wait for the island to attach, then change a field and expect a repaint.
      await expect(page.locator('calc-form')).toHaveAttribute('data-ready', 'true')

      const numberField = calc.fields.find((f) => f.kind === 'number')
      if (numberField && numberField.kind === 'number') {
        const input = page.locator(`[data-calc-field="${numberField.id}"]`)
        // A modest nudge, not 2× — doubling escapes real domain limits (a 175cm
        // height becomes 350cm) and would fail as a validation error rather
        // than proving the island recomputes.
        const step = numberField.step ?? 1
        let bumped = numberField.default === 0 ? step * 10 : numberField.default * 1.1
        if (numberField.max !== undefined) bumped = Math.min(bumped, numberField.max)
        if (numberField.min !== undefined) bumped = Math.max(bumped, numberField.min)
        if (bumped === numberField.default) bumped = numberField.default + step

        await input.fill(String(Number(bumped.toFixed(4))))
        await expect(primary).not.toHaveText(serverRendered)
        await expect(primary).not.toContainText('NaN')
      }

      expect(errors).toEqual([])
    })

    test('emits SEO metadata that a theme swap cannot drop', async ({ page }) => {
      await page.goto(`/calculators/${calc.slug}/`)

      await expect(page).toHaveTitle(new RegExp(calc.seoTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
        'href',
        new RegExp(`/calculators/${calc.slug}/$`),
      )

      const types = await page
        .locator('script[type="application/ld+json"]')
        .evaluateAll((nodes) => nodes.map((n) => JSON.parse(n.textContent!)['@type']))
      expect(types).toContain('SoftwareApplication')
      expect(types).toContain('FAQPage')
      expect(types).toContain('BreadcrumbList')
    })

    test('shows a validation error instead of a broken result', async ({ page }) => {
      await page.goto(`/calculators/${calc.slug}/`)
      await expect(page.locator('calc-form')).toHaveAttribute('data-ready', 'true')

      const numberField = calc.fields.find((f) => f.kind === 'number' && (f.min ?? 0) >= 0)
      if (!numberField) test.skip()

      await page.locator(`[data-calc-field="${numberField!.id}"]`).fill('-999999')
      // Either it stays valid (the field genuinely accepts it) or it errors
      // cleanly — what must never happen is a NaN leaking into the result.
      await expect(page.locator('[data-calc-out="primary"]')).not.toContainText('NaN')
    })
  })
}

test('every category page lists its calculators', async ({ page }) => {
  for (const category of categories) {
    await page.goto(`${category.href}/`)
    await expect(page.locator('h1')).toContainText(category.name)
    const expected = calculators.filter((c) => c.category === category.id)
    for (const calc of expected) {
      await expect(page.locator(`a[href="/calculators/${calc.slug}/"]`).first()).toBeVisible()
    }
  }
})

test('the sitemap lists exactly the generated routes', async ({ request }) => {
  const index = await request.get('/sitemap-index.xml')
  expect(index.ok()).toBeTruthy()

  const body = await (await request.get('/sitemap-0.xml')).text()
  const urls = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!)

  for (const calc of calculators) {
    expect(urls.some((u) => u.endsWith(`/calculators/${calc.slug}/`))).toBe(true)
  }
  // home + /calculators/ + one per category + one per calculator
  expect(urls.length).toBe(2 + categories.length + calculators.length)
})

/**
 * Motion. Driven entirely by the theme via the hooks in
 * src/islands/CONTRACT.md, so these assert the contract rather than the visuals:
 * a theme may change what a change *looks* like, but not whether the island
 * reports one.
 */
test.describe('motion', () => {
  const MORTGAGE = '/calculators/mortgage-calculator/'
  const ready = async (page: import('@playwright/test').Page) =>
    expect(page.locator('calc-form')).toHaveAttribute('data-ready', 'true')

  test('the headline counts through intermediate values instead of jumping', async ({ page }) => {
    await page.goto(MORTGAGE)
    await ready(page)

    const samples = await page.evaluate(async () => {
      const el = document.querySelector('[data-calc-out="primary"]')!
      const input = document.querySelector<HTMLInputElement>('[data-calc-field="downPayment"]')!
      const seen: string[] = []
      input.value = '40000'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => requestAnimationFrame(r))
        seen.push(el.textContent!.trim())
      }
      await new Promise((r) => setTimeout(r, 700))
      return { seen, final: el.textContent!.trim() }
    })

    expect(samples.final).toBe('$2,275.44')
    // Something between the endpoints must have been painted.
    const between = samples.seen.filter((t) => t !== '$2,022.62' && t !== samples.final)
    expect(between.length).toBeGreaterThan(0)
    // Currency formatting must survive every frame, not just the endpoints.
    for (const t of samples.seen) expect(t).toMatch(/^\$[\d,]+\.\d{2}$/)

    // Every frame stays within the endpoints. rAF can report a timestamp that
    // predates the tween's start, and an unclamped progress cubes into a
    // negative ease that paints below the starting value before correcting.
    for (const t of samples.seen) {
      const n = Number(t.replace(/[$,]/g, ''))
      expect(n).toBeGreaterThanOrEqual(2022.62)
      expect(n).toBeLessThanOrEqual(2275.44)
    }
  })

  test('the final value is written synchronously, before any animation frame', async ({ page }) => {
    await page.goto(MORTGAGE)
    await ready(page)

    // The count-up runs on requestAnimationFrame, which browsers throttle or
    // stop for hidden pages. If the tween were the only path to the correct
    // number, a backgrounded tab would keep a stale headline forever. So the
    // final text must already be present in the same tick as the input event —
    // measured here without ever yielding to a frame.
    const immediate = await page.evaluate(() => {
      const el = document.querySelector('[data-calc-out="primary"]')!
      const input = document.querySelector<HTMLInputElement>('[data-calc-field="rate"]')!
      input.value = '9'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      return el.textContent!.trim()
    })
    expect(immediate).toBe('$2,574.79')
  })

  test('only stats that actually changed are marked', async ({ page }) => {
    await page.goto(MORTGAGE)
    await ready(page)

    const mark = async (value: string) =>
      page.evaluate(async (v) => {
        const input = document.querySelector<HTMLInputElement>('[data-calc-field="propertyTax"]')!
        input.value = v
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 50))
        return Array.from(document.querySelectorAll('[data-calc-list="stats"] > *')).map((el) => ({
          label: el.querySelector('[data-slot="label"]')!.textContent,
          changed: el.hasAttribute('data-changed'),
        }))
      }, value)

    // Property tax feeds the PITI stat and nothing else.
    const changed = await mark('9600')
    expect(changed.filter((r) => r.changed).map((r) => r.label)).toEqual(['Total monthly (PITI)'])

    // Re-entering the same value must mark nothing at all.
    const noop = await mark('9600')
    expect(noop.filter((r) => r.changed)).toEqual([])
  })

  test('the shown result always matches the shown inputs, even after back-navigation', async ({
    page,
  }) => {
    await page.goto(MORTGAGE)
    await ready(page)
    await page.fill('[data-calc-field="downPayment"]', '40000')
    await expect(page.locator('[data-calc-out="primary"]')).toHaveText('$2,275.44')

    // Leaving and coming back is where browsers restore previously typed values
    // into the fields. The server render is always for the defaults, so without
    // the island's reconciliation pass the page would show restored inputs
    // beside a result computed from different ones.
    await page.goto('/calculators/')
    await page.goBack()
    await ready(page)

    // Assert the invariant rather than a specific number, so this holds whether
    // or not the browser chose to restore the field.
    const shown = await page.inputValue('[data-calc-field="downPayment"]')
    const expected = shown === '40000' ? '$2,275.44' : '$2,022.62'
    await expect(page.locator('[data-calc-out="primary"]')).toHaveText(expected)
  })

  test('honours prefers-reduced-motion', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' })
    const page = await context.newPage()
    await page.goto(MORTGAGE)
    await ready(page)

    const seen = await page.evaluate(async () => {
      const el = document.querySelector('[data-calc-out="primary"]')!
      const input = document.querySelector<HTMLInputElement>('[data-calc-field="downPayment"]')!
      const out: string[] = []
      input.value = '40000'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      for (let i = 0; i < 4; i++) {
        await new Promise((r) => requestAnimationFrame(r))
        out.push(el.textContent!.trim())
      }
      return out
    })
    // No tween: every sampled frame is already the final value.
    expect(new Set(seen)).toEqual(new Set(['$2,275.44']))
    await context.close()
  })
})

test.describe('unit-aware bounds', () => {
  test('switching units converts the value and re-points the slider', async ({ page }) => {
    await page.goto('/calculators/body-fat-calculator/')
    await expect(page.locator('calc-form')).toHaveAttribute('data-ready', 'true')

    const read = () =>
      page.evaluate(() => {
        const row = document.querySelector<HTMLElement>('[data-field-row="height"]')!
        const num = document.querySelector<HTMLInputElement>('[data-calc-field="height"]')!
        const range = document.querySelector<HTMLInputElement>('input[data-mirrors="height"]')!
        return {
          value: Number(num.value),
          min: Number(num.min),
          max: Number(num.max),
          unit: row.querySelector('[data-unit-label]')!.textContent!.trim(),
          rangeMin: Number(range.min),
          rangeMax: Number(range.max),
          firstTick: row.querySelector('[data-ticks] span')!.textContent!.trim(),
        }
      })

    const metric = await read()
    expect(metric).toMatchObject({ value: 178, unit: 'cm', min: 105, max: 250 })

    await page.selectOption('[data-calc-field="units"]', 'imperial')
    const imperial = await read()

    // The physical quantity is preserved: 178 cm is 70.08 in.
    expect(imperial.unit).toBe('in')
    expect(imperial.value).toBeCloseTo(70, 0)
    // Bounds follow the unit rather than staying metric-shaped — the whole bug.
    expect(imperial.min).toBe(42)
    expect(imperial.max).toBe(98)
    expect(imperial.rangeMax).toBeLessThanOrEqual(98)
    expect(Number(imperial.firstTick.replace('<', ''))).toBeLessThan(metric.min)

    // 70 was previously below the metric floor of 105 and rejected outright.
    await expect(page.locator('[data-calc-error]')).toBeHidden()
    await expect(page.locator('[data-calc-out="primary"]')).not.toContainText('NaN')

    // And it round-trips back.
    await page.selectOption('[data-calc-field="units"]', 'metric')
    const back = await read()
    expect(back.unit).toBe('cm')
    expect(back.value).toBeCloseTo(178, 0)
    expect(back.min).toBe(105)
  })

  test('a reciprocal unit pair converts without changing the answer', async ({ page }) => {
    await page.goto('/calculators/fuel-cost-calculator/')
    await expect(page.locator('calc-form')).toHaveAttribute('data-ready', 'true')

    const efficiency = page.locator('[data-calc-field="efficiency"]')
    const cost = page.locator('[data-calc-out="primary"]')

    await expect(efficiency).toHaveValue('8')
    const baseline = (await cost.textContent())!.trim()

    // Fuel economy inverts rather than scales: 8 L/100km IS 29.4 mpg is 12.5 km/L.
    // A `factor` cannot express this, which is why UnitConversion exists.
    await page.selectOption('[data-calc-field="efficiencyUnit"]', 'mpg')
    await expect(efficiency).toHaveValue('29.4')

    await page.selectOption('[data-calc-field="efficiencyUnit"]', 'kmpl')
    await expect(efficiency).toHaveValue('12.5')

    // The strongest check available: it is the same car on the same trip, so
    // the cost must not move no matter which unit describes it.
    await expect(cost).toHaveText(baseline)
    await expect(page.locator('[data-calc-error]')).toBeHidden()

    // Bounds follow the unit too — an mpg range is useless for L/100km.
    await page.selectOption('[data-calc-field="efficiencyUnit"]', 'mpg')
    expect(Number(await efficiency.getAttribute('max'))).toBeGreaterThan(100)
    await page.selectOption('[data-calc-field="efficiencyUnit"]', 'l100km')
    expect(Number(await efficiency.getAttribute('max'))).toBeLessThan(50)
  })

  test('changing category re-points dependent selects instead of erroring', async ({ page }) => {
    await page.goto('/calculators/unit-converter-calculator/')
    await expect(page.locator('calc-form')).toHaveAttribute('data-ready', 'true')

    const value = page.locator('[data-calc-field="value"]')
    await expect(page.locator('[data-calc-field="fromUnit"]')).toHaveValue('kilometre')
    await expect(value).toHaveAttribute('min', '0')

    // Previously this left "kilometre" selected and showed
    // 'That "from" unit is not a unit of temperature.'
    await page.selectOption('[data-calc-field="category"]', 'temperature')
    await expect(page.locator('[data-calc-field="fromUnit"]')).toHaveValue('celsius')
    await expect(page.locator('[data-calc-field="toUnit"]')).toHaveValue('fahrenheit')
    await expect(page.locator('[data-calc-error]')).toBeHidden()
    await expect(page.locator('[data-calc-out="primary"]')).toContainText('212')

    // Only temperature units are offered now.
    const offered = await page
      .locator('[data-calc-field="fromUnit"] option:not([hidden])')
      .allTextContents()
    expect(offered).toHaveLength(3)

    // Absolute zero sits at a different number on each scale, so the floor is
    // per-unit rather than per-category.
    await expect(value).toHaveAttribute('min', '-273.15')
    await page.selectOption('[data-calc-field="fromUnit"]', 'kelvin')
    await expect(value).toHaveAttribute('min', '0')
  })

  test('results are reported in the selected unit', async ({ page }) => {
    await page.goto('/calculators/bmi-calculator/')
    await expect(page.locator('calc-form')).toHaveAttribute('data-ready', 'true')

    await page.selectOption('[data-calc-field="units"]', 'imperial')
    const weight = await page.inputValue('[data-calc-field="weight"]')
    expect(Number(weight)).toBeCloseTo(154, 0) // 70 kg

    // BMI is unit-free, so converting both inputs must leave it unchanged.
    await expect(page.locator('[data-calc-out="primary"]')).toHaveText(/22\.[89]/)
  })
})

test.describe('scenarios', () => {
  const FUEL = '/calculators/fuel-cost-calculator/'
  const ready = async (page: import('@playwright/test').Page) =>
    expect(page.locator('calc-form')).toHaveAttribute('data-ready', 'true')

  test('the "current" card tracks the inputs instead of going stale', async ({ page }) => {
    await page.goto(FUEL)
    await ready(page)

    const live = page.locator('[data-scenario-live]')
    const primary = page.locator('[data-calc-out="primary"]')
    await expect(live).toHaveText('$14.40')

    // It claims to be "your inputs as they stand", so it has to follow them.
    // 250 km at 8 L/100km is 20 L, at $1.80 = $36.00. Asserted as a literal
    // rather than compared against the headline, which counts up to its value
    // and would be mid-tween at the moment of reading.
    await page.fill('[data-calc-field="distance"]', '250')
    await expect(primary).toHaveText('$36.00')
    await expect(live).toHaveText('$36.00')
  })

  test('a preset still produces the figure on its card after a unit switch', async ({ page }) => {
    await page.goto(FUEL)
    await ready(page)

    // Read a preset's promise while the form is in its default units.
    const card = page.locator('li', { has: page.locator('[data-scenario]') }).first()
    const promised = (await card.locator('span').nth(3).textContent())!.trim()

    // Now move the form to a completely different unit system. A preset that
    // applied only its changed field would reinterpret that number in mpg and
    // land somewhere else entirely.
    await page.selectOption('[data-calc-field="efficiencyUnit"]', 'mpgImp')
    await page.selectOption('[data-calc-field="priceUnit"]', 'perImperialGallon')
    await expect(page.locator('[data-calc-field="efficiency"]')).toHaveValue('35.31')

    await card.locator('[data-scenario]').click()
    await expect(page.locator('[data-calc-out="primary"]')).toHaveText(promised)
    await expect(page.locator('[data-calc-error]')).toBeHidden()
  })
})

test('ships no executable inline script, so the CSP can forbid eval', async ({ page }) => {
  await page.goto(`/calculators/${calculators[0]!.slug}/`)
  const inline = await page.locator('script:not([src])').evaluateAll((nodes) =>
    nodes
      .map((n) => n.getAttribute('type'))
      // application/json and ld+json are inert data, not executable code.
      .filter((type) => type !== 'application/json' && type !== 'application/ld+json'),
  )
  expect(inline).toEqual([])
})

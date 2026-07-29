import { test, expect } from '@playwright/test'
import { calculators } from '../src/calculators'
import { categories } from '../src/lib/categories'

/**
 * `Shell` wraps its breadcrumb in `mx-auto max-w-6xl px-4` but leaves its
 * `<slot />` bare, so a page whose content is not itself wrapped renders flush
 * against both edges of the viewport. That shipped on five pages — /calculators/
 * and all four /categories/ — and went unnoticed because the pages people look
 * at most are wrapped by accident: the homepage by `Hero`, every calculator by
 * `CalculatorPage`. Nothing in the type system or the unit suite can see it,
 * because it is a question about rendered geometry.
 *
 * The invariant that catches it: a page's `h1` begins exactly where the header's
 * own content begins. That holds however a page is composed, so it stays true
 * for a theme that lays things out differently — and it is checked over
 * registry-derived routes, so page #48 is covered without editing this file.
 */
const routes = [
  '/',
  '/calculators/',
  ...categories.map((category) => `${category.href}/`),
  ...calculators.map((calc) => `/calculators/${calc.slug}/`),
]

test('every page aligns its content with the header', async ({ page }) => {
  const offenders: string[] = []

  for (const route of routes) {
    await page.goto(route)

    const measured = await page.evaluate(() => {
      const headerInner = document.querySelector('header > *')
      const h1 = document.querySelector('h1')
      if (!headerInner || !h1) return null
      // The header's own gutter is the reference, rather than a hardcoded pixel
      // value, so changing the container width or padding does not need this
      // test edited — it only has to stay consistent between header and body.
      const padding = Number.parseFloat(getComputedStyle(headerInner).paddingLeft)
      return {
        h1Left: Math.round(h1.getBoundingClientRect().left),
        headerContentLeft: Math.round(headerInner.getBoundingClientRect().left + padding),
      }
    })

    if (!measured) {
      offenders.push(`${route}: no <h1> or no header content to measure`)
      continue
    }
    if (measured.h1Left !== measured.headerContentLeft) {
      offenders.push(
        `${route}: h1 starts at ${measured.h1Left}px, header content at ${measured.headerContentLeft}px`,
      )
    }
  }

  expect(offenders, `Pages whose content escapes the page container:\n${offenders.join('\n')}`).toEqual(
    [],
  )
})

/**
 * A page must never scroll sideways. Kept separate from the alignment check
 * because a page can be correctly inset and still overflow — a wide table, an
 * unwrapped chart — and the two failures want different fixes.
 *
 * Phone width matters more than desktop here, and is where this actually broke:
 * 22 of the 47 routes scrolled sideways at 375px. Grid and flex items default to
 * min-width:auto, so they refuse to shrink below their content's min-content
 * width — and form controls carry a large intrinsic one, a `<select>` sizing
 * itself to its longest option. Desktop is wide enough to hide all of it.
 */
const viewports = [
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'mobile', width: 375, height: 812 },
]

/**
 * The category nav is `hidden md:flex`, so on a phone the header was a logo and
 * nothing else — every category and the full index reachable only by scrolling
 * past the whole calculator to the footer, which does not even link the index.
 *
 * The replacement is a <details> disclosure. No script is involved at all, which
 * is what keeps it working before the island loads and keeps `_headers` free of
 * an inline-script allowance. What is worth pinning is the part a future
 * refactor could quietly break: that it opens from the keyboard without
 * hand-rolled ARIA, and that it stays absent at desktop.
 */
test.describe('mobile navigation', () => {
  test('the header exposes every category and the index at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/calculators/mortgage-calculator/')

    const menu = page.locator('header details')
    const panel = menu.locator('nav')

    await expect(panel).toBeHidden()

    await menu.locator('summary').click()
    await expect(panel).toBeVisible()

    for (const name of ['Financial', 'Health & Fitness', 'Math', 'Everyday', 'All calculators']) {
      await expect(panel.getByRole('link', { name, exact: true })).toBeVisible()
    }

    // The panel must not push the page sideways while open.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBe(0)

    // And it actually navigates.
    await panel.getByRole('link', { name: 'All calculators', exact: true }).click()
    await expect(page).toHaveURL(/\/calculators\/$/)
  })

  test('it opens from the keyboard alone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/calculators/mortgage-calculator/')

    const menu = page.locator('header details')
    await menu.locator('summary').focus()
    await page.keyboard.press('Enter')
    await expect(menu.locator('nav')).toBeVisible()
  })

  test('the desktop header is untouched by it', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/calculators/mortgage-calculator/')

    // The disclosure must not merely be closed at desktop — it must not render,
    // or it would occupy space beside the nav it exists to replace.
    await expect(page.locator('header details')).toBeHidden()
    await expect(
      page.locator('header nav[aria-label="Categories"]').first().getByRole('link', {
        name: 'All calculators',
        exact: true,
      }),
    ).toBeVisible()
  })
})

for (const viewport of viewports) {
  test(`no page scrolls horizontally at ${viewport.name} (${viewport.width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    const offenders: string[] = []

    for (const route of routes) {
      await page.goto(route)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      if (overflow > 0) offenders.push(`${route}: overflows by ${overflow}px`)
    }

    expect(
      offenders,
      `Pages that scroll horizontally at ${viewport.width}px:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
}

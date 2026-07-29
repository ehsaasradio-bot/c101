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
 */
test('no page scrolls horizontally', async ({ page }) => {
  const offenders: string[] = []

  for (const route of routes) {
    await page.goto(route)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    if (overflow > 0) offenders.push(`${route}: overflows by ${overflow}px`)
  }

  expect(offenders, `Pages that scroll horizontally:\n${offenders.join('\n')}`).toEqual([])
})

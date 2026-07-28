import { describe, expect, test } from 'vitest'
import { ALLOW_INDEXING, SITE_URL, absolute, withSlash } from '../lib/site'

/**
 * `SITE_URL` is the root of every canonical, og:url and sitemap entry, so a
 * wrong value is invisible on the page and poisonous in search results. These
 * pin the shape of it rather than the value, so changing domain stays a
 * one-line edit while shipping a placeholder does not.
 */
describe('site url', () => {
  test('is a real https origin, not a placeholder', () => {
    expect(SITE_URL).toMatch(/^https:\/\//)
    expect(SITE_URL).not.toMatch(/example\.(com|org|net)|localhost|127\.0\.0\.1|TODO|changeme/i)
  })

  test('carries no trailing slash or path, which would double up in every URL', () => {
    expect(SITE_URL).not.toMatch(/\/$/)
    expect(new URL(SITE_URL).pathname).toBe('/')
  })

  test('absolute() always ends in a slash, matching how the host serves', () => {
    // Cloudflare 308-redirects non-slash to slash, so a canonical without one
    // would point at a redirect rather than the page itself.
    expect(absolute('/')).toBe(`${SITE_URL}/`)
    expect(absolute('/calculators/bmi-calculator')).toBe(`${SITE_URL}/calculators/bmi-calculator/`)
    expect(absolute('/calculators/bmi-calculator/')).toBe(`${SITE_URL}/calculators/bmi-calculator/`)
  })

  test('withSlash is idempotent', () => {
    expect(withSlash(withSlash('/a'))).toBe(withSlash('/a'))
  })

  test('the indexing flag is a boolean anyone can flip in one place', () => {
    // Deliberately not asserting which way it is set — that is a launch
    // decision. The E2E suite checks the whole site agrees with whatever it is.
    expect(typeof ALLOW_INDEXING).toBe('boolean')
  })
})

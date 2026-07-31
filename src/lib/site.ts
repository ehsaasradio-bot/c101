/** Central site configuration. Change the domain and indexing flag here only. */

// The real domain. `c101-ccc.pages.dev` is the Cloudflare-assigned fallback the
// project got because `c101.pages.dev` was already taken globally; it still
// serves the same build, so `public/_redirects` sends it here to keep one
// canonical host. Everything derived from this — canonicals, og:url, the
// sitemap, JSON-LD — follows automatically.
export const SITE_URL = 'https://calculator4129.space'
export const SITE_NAME = 'Calc101'
export const SITE_DESCRIPTION =
  'Free online calculators for finance, health, math, and everyday life. Fast, accurate, no sign-up.'
export const LOCALE = 'en_US'
export const CURRENCY = 'USD'

/**
 * Set to false to ship a noindex build (staging, pre-launch).
 *
 * Currently false: the site is not launched. Flipping this to true is the
 * single switch that opens it to search engines — it drives both the per-page
 * robots meta and robots.txt, so the two can never disagree.
 */
export const ALLOW_INDEXING = false

/**
 * Cloudflare Pages serves at trailing-slash URLs and 308-redirects non-slash → slash.
 * Canonicals and og:url must end in a slash or we self-canonical to a redirect.
 */
export const withSlash = (url: string): string => (url.endsWith('/') ? url : `${url}/`)

export const absolute = (pathname: string): string =>
  withSlash(SITE_URL.replace(/\/$/, '') + pathname)

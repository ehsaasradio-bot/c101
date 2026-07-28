/** Central site configuration. Change the domain and indexing flag here only. */

export const SITE_URL = 'https://calc101.example.com'
export const SITE_NAME = 'Calc101'
export const SITE_DESCRIPTION =
  'Free online calculators for finance, health, math, and everyday life. Fast, accurate, no sign-up.'
export const LOCALE = 'en_US'
export const CURRENCY = 'USD'

/** Set to false to ship a noindex build (staging, pre-launch). */
export const ALLOW_INDEXING = true

/**
 * Cloudflare Pages serves at trailing-slash URLs and 308-redirects non-slash → slash.
 * Canonicals and og:url must end in a slash or we self-canonical to a redirect.
 */
export const withSlash = (url: string): string => (url.endsWith('/') ? url : `${url}/`)

export const absolute = (pathname: string): string =>
  withSlash(SITE_URL.replace(/\/$/, '') + pathname)

/** Central site configuration. Change the domain and indexing flag here only. */

// The real domain. `c101-ccc.pages.dev` is the Cloudflare-assigned fallback the
// project got because `c101.pages.dev` was already taken globally. Everything
// derived from this — canonicals, og:url, the sitemap, JSON-LD — follows.
//
// The fallback host still serves the identical build, and it CANNOT be
// redirected away from a static Pages deploy: `_redirects` matches on path
// only, and Cloudflare's own documentation lists "domain-level redirects" as
// unsupported. A rule with a hostname on the left is silently ignored — it was
// tried, it deployed, and the old host kept returning 200.
//
// Bulk Redirects do not help either, since they operate on zones in the
// account and `pages.dev` is not one. The only mechanism that would actually
// 301 is a Pages Function running on every request, which trades the site's
// entirely-static serving for a Worker invocation per hit.
//
// So the duplicate host is handled by the canonical tag alone, which is the
// standard signal and is emitted correctly from BOTH hosts — a page served
// from the fallback declares this domain as authoritative. If the old host
// ever needs to genuinely disappear, the Function is the lever.
export const SITE_URL = 'https://calculator4129.space'
export const SITE_NAME = 'Calc101'
export const SITE_DESCRIPTION =
  'Free online calculators for finance, health, math, science, engineering, and everyday life. Fast, accurate, no sign-up.'
export const LOCALE = 'en_US'
export const CURRENCY = 'USD'

/**
 * Set to false to ship a noindex build (staging, pre-launch).
 *
 * Now true: the site is launched. This drives both the per-page robots meta and
 * robots.txt, so the two can never disagree, and it is what adds the Sitemap
 * line to robots.txt. A page that must stay out of the index regardless — the
 * 404 — passes `noindex` to `Seo` rather than relying on this.
 */
export const ALLOW_INDEXING = true

/**
 * Cloudflare Pages serves at trailing-slash URLs and 308-redirects non-slash → slash.
 * Canonicals and og:url must end in a slash or we self-canonical to a redirect.
 */
export const withSlash = (url: string): string => (url.endsWith('/') ? url : `${url}/`)

export const absolute = (pathname: string): string =>
  withSlash(SITE_URL.replace(/\/$/, '') + pathname)

import type { APIRoute } from 'astro'
import { ALLOW_INDEXING, SITE_URL } from '../lib/site'

export const GET: APIRoute = () =>
  new Response(
    [
      'User-agent: *',
      ALLOW_INDEXING ? 'Allow: /' : 'Disallow: /',
      '',
      // Advertising a sitemap while disallowing everything is a contradiction:
      // it invites crawlers to the very URLs the line above tells them to skip.
      ...(ALLOW_INDEXING ? [`Sitemap: ${SITE_URL}/sitemap-index.xml`, ''] : []),
    ].join('\n'),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  )

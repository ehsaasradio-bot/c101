import type { APIRoute } from 'astro'
import { ALLOW_INDEXING, SITE_URL } from '../lib/site'

export const GET: APIRoute = () =>
  new Response(
    [
      'User-agent: *',
      ALLOW_INDEXING ? 'Allow: /' : 'Disallow: /',
      '',
      `Sitemap: ${SITE_URL}/sitemap-index.xml`,
      '',
    ].join('\n'),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  )

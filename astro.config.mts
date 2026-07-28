// @ts-check
import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'
import { EnumChangefreq } from 'sitemap'
import tailwindcss from '@tailwindcss/vite'

import { bySlug } from './src/calculators/index.ts'
import { SITE_URL } from './src/lib/site.ts'

// `.mts` (not `.mjs`) so this config can import the TypeScript registry directly —
// that is what lets the sitemap derive lastmod/priority from calculator data
// instead of a hand-maintained URL list that drifts.
export default defineConfig({
  site: SITE_URL,
  // Cloudflare Pages serves directory output at trailing-slash URLs and 308-redirects
  // non-slash → slash. Match that so canonicals/links point at the real served URL.
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [
    sitemap({
      serialize(item) {
        const slug = item.url.match(/\/calculators\/([^/]+)\//)?.[1]
        const calc = slug ? bySlug.get(slug) : undefined
        if (calc) {
          item.lastmod = new Date(calc.lastReviewed).toISOString()
          item.priority = calc.priority ?? 0.7
          item.changefreq = EnumChangefreq.MONTHLY
        }
        return item
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
})

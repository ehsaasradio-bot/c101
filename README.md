# calc101

Free online calculators. Astro + Tailwind v4, static output, Cloudflare Pages.

Built so the UI is replaceable: calculators are typed data + pure functions,
presentation is a swappable layer. A palette reskin is one file; a full
restructure is nine lines. See [AGENTS.md](AGENTS.md).

## Quick start

```bash
npm install
npm run dev
```

## Layout

```
src/lib/          contracts (types, formatting, view models)
src/calculators/  one directory per calculator + an explicit registry barrel
src/islands/      the <calc-form> custom element + its contract with the theme
src/theme/        ★ all presentation; index.ts is the swap seam
src/seo/          JSON-LD builders + <head> metadata (outside the theme on purpose)
src/pages/        one dynamic route generates every calculator page
```

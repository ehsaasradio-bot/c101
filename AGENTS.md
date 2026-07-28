# calc101

A static calculator site (Astro + Tailwind v4, Cloudflare Pages) built so the
**UI can be replaced without touching a single calculator**.

## The one rule

> A calculator definition may not contain a colour, a class name, a hex code, or
> a string of HTML.

It holds domain facts only. Everything visual resolves in `src/theme/`.
`src/architecture.test.ts` enforces this — it is not a style guide, it is a test.

## Adding a calculator

Four files in `src/calculators/<category>/<slug>/`, then one line in
`src/calculators/index.ts`. That is the whole checklist.

| File | Holds |
| --- | --- |
| `fields.ts` | The input list. Separate from `compute.ts` so compute can derive its argument type without a circular import. |
| `compute.ts` | A pure default-exported function. No DOM, no imports from `theme/` or `islands/`. |
| `index.ts` | The `CalculatorDef`: copy, SEO, FAQs, scale bands, `related` slugs. |
| `compute.test.ts` | Known-good values and the error cases. |

You do **not** write a page, touch the sitemap, or extend the test lists. The
dynamic route, sitemap, conformance suite, and Playwright suite all derive from
the registry.

## Swapping the UI

Two independent axes:

- **Restyle** (palette, radius, type scale, density) → edit
  `src/theme/default/tokens.css`. Nothing else. Verified: changing only that
  file reskins every page while results stay identical.
- **Restructure** (sidebar or not, gauge or dial, accordion or flat) → add
  `src/theme/<name>/` implementing `src/theme/contract.ts`, then repoint the
  seven exports in `src/theme/index.ts` and the one `@import` in
  `src/styles/global.css`.

Pages import from `'../../theme'`, never from a concrete theme file — enforced
by test. `astro check` fails if a theme drops a prop from the contract.

## Things that will bite you

- **`getStaticPaths` returns `params` only.** A `CalculatorDef` holds `compute`,
  a function, which does not survive props serialization. Re-look up by slug.
- **Never `define:vars` on a script.** It implies `is:inline`, which kills
  bundling and imports. Config travels as `<script type="application/json">`.
  This is why formulas are real functions here and not eval'd strings.
- **`@theme inline`, not `@theme`.** The non-inline form bakes literals at build
  time, so runtime/media-query overrides silently do nothing.
- **Never interpolate Tailwind class names.** It defeats v4's scanner and leaks
  theme into data.
- **Categories live at `/categories/`, calculators at `/calculators/`.** Sibling
  `[slug].astro` and `[category].astro` in one directory is unresolvable.
- **`import.meta.glob` only inside client code.** It is Vite-only syntax; the
  registry stays a plain barrel so Playwright and `astro.config.mts` can import it.

## Commands

```
npm run dev        # dev server
npm run build      # static output in ./dist
npm test           # vitest: compute, conformance, architecture invariants
npm run test:e2e   # playwright against a real production build (port 4399)
npm run verify     # astro check + vitest + build
```

`npm run test:e2e` deliberately does not use Astro's default port 4321 and does
not reuse an existing server — a stranger's dev server on that port would
otherwise serve 404s that look like our own routing bugs.

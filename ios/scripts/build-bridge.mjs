/**
 * Builds the two artefacts the iOS app consumes.
 *
 *   bridge.js     one file, no imports, exposing globalThis.Calc
 *   catalog.json  every calculator's fields, bounds, copy and scale
 *
 * Both are GENERATED from src/calculators. Hand-maintaining either would
 * reintroduce exactly the drift this whole architecture avoids: the maths and
 * the form would be defined twice and disagree the moment one changed.
 */
import { build } from 'esbuild'
import { mkdirSync, writeFileSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const OUT = new URL('../Shared/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

// ── bridge.js ──────────────────────────────────────────────────────────────
// JavaScriptCore has no module loader and no DOM, so the entry is bundled to a
// single IIFE that touches nothing but pure computation.
await build({
  stdin: {
    contents: `
      import { calculators, bySlug } from '../src/calculators/index.ts'
      import { defaultValues, coerceValues, toResultView } from '../src/lib/view.ts'

      const catalog = calculators.map((c) => ({
        slug: c.slug, title: c.title, category: c.category,
        intro: c.intro, resultLabel: c.resultLabel,
        fields: c.fields, scale: c.scale ?? null,
        defaults: defaultValues(c),
      }))

      function compute(slug, raw) {
        const calc = bySlug.get(slug)
        if (!calc) return { error: 'No calculator named ' + slug }
        try {
          const values = coerceValues(calc.fields, raw)
          return { ok: toResultView(calc.compute(values), calc.scale) }
        } catch (err) {
          // CalcError carries the offending field so the form can highlight it.
          return { error: err && err.message ? err.message : String(err), fieldId: err && err.fieldId }
        }
      }

      globalThis.Calc = { catalog, compute, count: calculators.length }
    `,
    // Resolve imports relative to ios/, so '../src' reaches the real source.
    resolveDir: new URL('../', import.meta.url).pathname,
    loader: 'ts',
  },
  bundle: true,
  format: 'iife',
  platform: 'neutral',
  target: 'es2020',
  minify: true,
  outfile: OUT + 'bridge.js',
})

// ── catalog.json ───────────────────────────────────────────────────────────
// Extracted by running the bundle, so it cannot disagree with what ships.
// Evaluated rather than require()d: the package is "type": "module", so a .js
// file would be read as ESM and the IIFE would not run.
const catalog = execFileSync('node', [
  '-e',
  `const fs=require('fs');(0,eval)(fs.readFileSync(${JSON.stringify(OUT + 'bridge.js')},'utf8'));` +
    `process.stdout.write(JSON.stringify({count:Calc.count,catalog:Calc.catalog},null,2))`,
], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })

writeFileSync(OUT + 'catalog.json', catalog)

const kb = (p) => (statSync(p).size / 1024).toFixed(1)
console.log(`bridge.js    ${kb(OUT + 'bridge.js')} KB`)
console.log(`catalog.json ${kb(OUT + 'catalog.json')} KB`)
console.log(`calculators  ${JSON.parse(catalog).count}`)

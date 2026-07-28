import { describe, expect, test } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * The architectural invariants that make a redesign a nine-line diff.
 *
 * Every rule here failed in the reference implementation, which is why
 * restyling it meant editing 178 files. Tests, not documentation, are what keep
 * a seam from quietly eroding as the calculator count grows.
 */
const SRC = new URL('.', import.meta.url).pathname

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.(ts|astro)$/.test(entry) && !entry.endsWith('.test.ts')) out.push(path)
  }
  return out
}

/**
 * Comments are prose, not behaviour. Without this, a JSDoc line describing a
 * "half-open window of days" reads as DOM access and fails the suite — which is
 * exactly what happened to date-difference-calculator.
 */
const stripComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

const files = walk(SRC).map((path) => {
  const source = readFileSync(path, 'utf8')
  return { path: relative(SRC, path), source, code: stripComments(source) }
})

const find = (predicate: (path: string) => boolean) => files.filter((f) => predicate(f.path))

describe('theme seam', () => {
  test('nothing outside src/theme reaches into a concrete theme', () => {
    // Pages import { CalculatorPage } from '../../theme'. The moment one imports
    // theme/default/CalculatorPage.astro directly, swapping the theme stops
    // being a one-file change.
    const leaks = find((p) => !p.startsWith('theme/'))
      .filter((f) => /from\s+['"][^'"]*theme\/(default|editorial)\//.test(f.source))
      .map((f) => f.path)
    expect(leaks).toEqual([])
  })

  test('src/theme/index.ts is the only export surface, and points at one theme', () => {
    const seam = files.find((f) => f.path === 'theme/index.ts')!
    const targets = seam.source
      .split('\n')
      // Real export statements only — the doc comment above them deliberately
      // shows a two-theme diff as an example.
      .filter((line) => line.trimStart().startsWith('export'))
      .flatMap((line) => [...line.matchAll(/from\s+'\.\/([^/]+)\//g)].map((m) => m[1]!))

    expect(targets.length).toBeGreaterThan(0)
    expect(new Set(targets).size, 'a theme swap should change every line at once').toBe(1)
  })

  test('both halves of the seam point at the same theme', () => {
    // index.ts (components) and client.ts (behaviour) are swapped together;
    // drift between them ships one theme's markup with another's JavaScript.
    const seam = files.find((f) => f.path === 'theme/index.ts')!
    const client = files.find((f) => f.path === 'theme/client.ts')!

    const themeOf = (source: string) =>
      source
        .split('\n')
        .filter((l) => /^\s*(import|export)\b/.test(l))
        .flatMap((l) => [...l.matchAll(/['"]\.\/([^/'"]+)\//g)].map((m) => m[1]!))

    const components = new Set(themeOf(seam.source))
    const behaviour = new Set(themeOf(client.source))
    expect(behaviour.size).toBe(1)
    expect([...behaviour]).toEqual([...components])
  })

  test('the styles entrypoint points at that same theme too', () => {
    const css = readFileSync(join(SRC, 'styles/global.css'), 'utf8')
    const seam = files.find((f) => f.path === 'theme/index.ts')!
    const theme = [...seam.source.matchAll(/^\s*export .* from '\.\/([^/]+)\//gm)][0]![1]
    expect(css).toContain(`../theme/${theme}/tokens.css`)
  })
})

describe('calculator definitions stay presentation-free', () => {
  const calcFiles = find((p) => p.startsWith('calculators/'))

  test('no calculator imports the theme, the island, or the DOM', () => {
    const leaks = calcFiles
      .filter((f) => /from\s+['"][^'"]*(theme|islands)/.test(f.source))
      .map((f) => f.path)
    expect(leaks).toEqual([])
  })

  test('no compute function touches the DOM or global state', () => {
    // Match how these are actually *used* — member access or a call — so the
    // English words remain usable in identifiers and strings.
    const domUse = /\b(document|window|navigator)\s*\.|\b(localStorage|sessionStorage)\b|\bfetch\s*\(/
    const leaks = calcFiles
      .filter((f) => f.path.endsWith('compute.ts'))
      .filter((f) => domUse.test(f.code))
      .map((f) => f.path)
    expect(leaks).toEqual([])
  })

  test('no hex colours or Tailwind class names in calculator data', () => {
    const leaks = calcFiles
      .filter((f) => /#[0-9a-fA-F]{6}\b|\b(bg|text|border)-[a-z]+-\d{2,3}\b/.test(f.code))
      .map((f) => f.path)
    expect(leaks).toEqual([])
  })
})

describe('the island never writes markup', () => {
  const island = files.find((f) => f.path === 'islands/calc-form.ts')!

  test('no innerHTML, insertAdjacentHTML, or element construction', () => {
    // The reference built Tailwind strings inside its client script, which
    // trapped repeating markup in JavaScript. Templates in the theme replace it.
    expect(island.source).not.toMatch(/\binnerHTML\b/)
    expect(island.source).not.toMatch(/\binsertAdjacentHTML\b/)
    expect(island.source).not.toMatch(/document\.createElement\(/)
  })

  test('no colours or class names', () => {
    expect(island.source).not.toMatch(/#[0-9a-fA-F]{6}\b/)
    expect(island.source).not.toMatch(/classList\.(add|remove|toggle)\(/)
  })

  test('no eval, and no Function constructor', () => {
    // The whole reason `_headers` can ship without 'unsafe-eval'.
    expect(island.source).not.toMatch(/\beval\(/)
    expect(island.source).not.toMatch(/new Function\b/)
  })
})

describe('seo cannot be dropped by a theme swap', () => {
  test('structured data is emitted outside src/theme', () => {
    const inTheme = find((p) => p.startsWith('theme/'))
      .filter((f) => /ld\+json|jsonld/.test(f.source))
      .map((f) => f.path)
    expect(inTheme).toEqual([])
  })

  test('<head> is owned by the layout, not the theme', () => {
    const inTheme = find((p) => p.startsWith('theme/'))
      .filter((f) => /<head[\s>]/.test(f.source))
      .map((f) => f.path)
    expect(inTheme).toEqual([])
  })
})

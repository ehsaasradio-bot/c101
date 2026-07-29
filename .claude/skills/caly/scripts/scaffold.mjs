#!/usr/bin/env node
/**
 * Writes the four files for a new calculator with the imports and the
 * fields -> compute -> index chain already wired, so the only thing left is the
 * part that needs judgement: the maths and the copy.
 *
 *   node .claude/skills/caly/scripts/scaffold.mjs financial vat-calculator "VAT Calculator"
 *
 * It refuses to overwrite an existing directory — editing a calculator is a
 * different job from creating one, and silently clobbering someone's formula is
 * the worst possible failure mode for a generator.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const CATEGORIES = ['financial', 'health', 'math', 'everyday']

const [category, slug, ...titleParts] = process.argv.slice(2)
const title = titleParts.join(' ')

if (!category || !slug || !title) {
  console.error('usage: scaffold.mjs <category> <slug> "<Title>"')
  console.error(`       categories: ${CATEGORIES.join(', ')}`)
  process.exit(1)
}
if (!CATEGORIES.includes(category)) {
  console.error(`unknown category "${category}" — expected one of ${CATEGORIES.join(', ')}`)
  process.exit(1)
}
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
  console.error(`slug must be kebab-case: "${slug}"`)
  process.exit(1)
}

const dir = join('src/calculators', category, slug)
if (existsSync(dir)) {
  console.error(`${dir} already exists — edit it rather than scaffolding over it`)
  process.exit(1)
}

const identifier = slug
  .replace(/-calculator$/, '')
  .split('-')
  .map((part, i) => (i === 0 ? part : part[0].toUpperCase() + part.slice(1)))
  .join('')

const today = new Date().toISOString().slice(0, 10)

mkdirSync(dir, { recursive: true })

writeFileSync(
  join(dir, 'fields.ts'),
  `import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so \`compute.ts\` can derive its argument type
 * from them without importing \`index.ts\`, which imports compute and would cycle.
 *
 * Remember the first number field is the one the end-to-end suite nudges to 1.1x
 * its default, so it has to tolerate that and still change the result.
 */
export const fields = [
  {
    kind: 'number',
    id: 'amount',
    label: 'Amount',
    default: 100,
    // A slider spans these, so both ends must be values compute accepts.
    min: 1,
    max: 10_000,
    step: 1,
    unit: '$',
  },
] as const satisfies readonly Field[]
`,
)

writeFileSync(
  join(dir, 'compute.ts'),
  `import { CalcError } from '../../../lib/types'
import type { CalcResult, Values } from '../../../lib/types'
import type { fields } from './fields'

/*
 * TODO: replace with the real formula, and name the standard it comes from.
 *
 * Selects, dates and text arrive as strings — the derived Values type makes
 * forgetting Number(...) a compile error rather than a NaN later.
 */
export default function compute(v: Values<typeof fields>): CalcResult {
  const { amount } = v

  // Guard finiteness first: coerceValues emits NaN for unparseable input, and
  // \`amount < 0\` is false for NaN, so a magnitude test alone lets it through.
  if (!Number.isFinite(amount) || !(amount > 0)) {
    throw new CalcError('Enter an amount greater than 0.', 'amount')
  }

  const result = amount

  return {
    primary: { label: 'Result', value: result, format: { style: 'currency' } },
    stats: [{ label: 'Amount entered', value: amount, format: { style: 'currency' } }],
    steps: [{ label: 'Amount', value: amount, format: { style: 'currency' } }],
  }
}
`,
)

writeFileSync(
  join(dir, 'index.ts'),
  `import type { CalculatorDef } from '../../../lib/types'
import { fields } from './fields'
import compute from './compute'

const def = {
  slug: '${slug}',
  category: '${category}',
  title: '${title}',
  // At most 70 characters.
  seoTitle: '${title}: TODO',
  // A meta description: 51-160 characters, written for a search result.
  description: 'TODO — one sentence saying what this works out and for whom.',
  // The direct answer, for someone who reads nothing else on the page.
  intro: 'TODO — a couple of sentences explaining what this calculates and how.',
  fields,
  resultLabel: 'Result',
  compute,
  faqs: [
    { q: 'TODO?', a: 'TODO — a real answer, more than a line.' },
    { q: 'TODO?', a: 'TODO — a real answer, more than a line.' },
    { q: 'TODO?', a: 'TODO — a real answer, more than a line.' },
  ],
  // Slugs, never hrefs. Every one must resolve or the conformance suite fails.
  related: [],
  lastReviewed: '${today}',
  priority: 0.7,
} satisfies CalculatorDef<typeof fields>

export default def
`,
)

writeFileSync(
  join(dir, 'compute.test.ts'),
  `import { describe, expect, test } from 'vitest'
import compute from './compute'
import { CalcError } from '../../../lib/types'

const base = { amount: 100 } as const

describe('${slug.replace(/-calculator$/, '')}', () => {
  test('TODO: a known-good value, derived and cross-checked', () => {
    // Do not invent this number. Work it out from the formula, then confirm it a
    // second independent way — simulate the loop, walk the steps, sum the parts.
    expect(Number(compute(base).primary.value)).toBeCloseTo(100, 6)
  })

  test('rejects invalid input against the offending field', () => {
    let thrown: unknown
    try {
      compute({ ...base, amount: 0 })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe('amount')
  })

  test('never returns NaN for unparseable input', () => {
    expect(() => compute({ ...base, amount: Number.NaN })).toThrow(CalcError)
  })
})
`,
)

const registry = 'src/calculators/index.ts'
const already = existsSync(registry) && readFileSync(registry, 'utf8').includes(`'./${category}/${slug}'`)

console.log(`created ${dir}/`)
console.log('  fields.ts  compute.ts  index.ts  compute.test.ts\n')

if (already) {
  console.log('already registered.')
} else {
  console.log(`now add to ${registry}:`)
  console.log(`  import ${identifier} from './${category}/${slug}'`)
  console.log(`  ...and ${identifier} to the calculators array (grouped with its category).\n`)
}

console.log('then, once the maths and copy are real:')
console.log(`  npx vitest run ${dir}/`)
console.log('  npx vitest run && npx astro check')
console.log(`  npx playwright test -g "${slug}"`)

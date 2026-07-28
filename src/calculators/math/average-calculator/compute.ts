import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, Values } from '../../../lib/types'
import type { fields } from './fields'

/**
 * Splits on commas, semicolons, and any run of whitespace — the three ways
 * people actually paste a column of numbers out of a spreadsheet.
 */
function parseList(raw: string): number[] {
  const tokens = raw.split(/[\s,;]+/).filter((t) => t.length > 0)
  const out: number[] = []
  for (const token of tokens) {
    const n = Number(token)
    // Number('') is 0 and Number('1,2') is NaN — the filter above handles the
    // first, and anything still not finite is genuinely not a number.
    if (!Number.isFinite(n))
      throw new CalcError(`"${token}" is not a number. Use commas or spaces to separate values.`, 'numbers')
    out.push(n)
  }
  if (out.length === 0) throw new CalcError('Enter at least one number.', 'numbers')
  return out
}

function median(sorted: readonly number[]): number {
  const n = sorted.length
  const mid = n >> 1
  return n % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/** Every value tied for the highest frequency, or [] when all are unique. */
function modes(values: readonly number[]): number[] {
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  const top = Math.max(...counts.values())
  if (top < 2) return []
  return [...counts.entries()].filter(([, c]) => c === top).map(([v]) => v).sort((a, b) => a - b)
}

const NUM = { style: 'decimal', decimals: 4 } as const

export default function compute(v: Values<typeof fields>): CalcResult {
  const values = parseList(v.numbers)
  const n = values.length
  const sorted = [...values].sort((a, b) => a - b)

  const sum = values.reduce((acc, x) => acc + x, 0)
  const mean = sum / n
  const min = sorted[0]!
  const max = sorted[n - 1]!
  const range = max - min
  const mid = median(sorted)

  // Sum of squared deviations from the mean. Computed from the deviations
  // rather than from E[x²] − mean², which loses catastrophic precision on
  // large values with small spread.
  const ss = values.reduce((acc, x) => acc + (x - mean) ** 2, 0)
  const populationVariance = ss / n
  // The sample estimator divides by n − 1 (Bessel's correction) and is simply
  // undefined for a single observation.
  const sampleVariance = n > 1 ? ss / (n - 1) : undefined
  const populationSd = Math.sqrt(populationVariance)
  const sampleSd = sampleVariance === undefined ? undefined : Math.sqrt(sampleVariance)

  const modeList = modes(values)
  const modeText =
    modeList.length === 0 ? 'No mode (all values occur once)' : modeList.join(', ')

  const stats: Quantity[] = [
    { label: 'Count', value: n, format: { style: 'decimal', decimals: 0 } },
    { label: 'Sum', value: sum, format: NUM },
    { label: 'Median', value: mid, format: NUM },
    { label: 'Mode', value: modeText, format: { style: 'raw' } },
    { label: 'Minimum', value: min, format: NUM },
    { label: 'Maximum', value: max, format: NUM },
    { label: 'Range', value: range, format: NUM },
    { label: 'Population std dev', value: populationSd, format: NUM },
  ]
  if (sampleSd !== undefined)
    stats.push({ label: 'Sample std dev', value: sampleSd, format: NUM })

  const steps: Quantity[] = [
    { label: 'Values entered', value: n, format: { style: 'decimal', decimals: 0 } },
    { label: 'Sum of values', value: sum, format: NUM },
    { label: 'Mean = sum ÷ count', value: mean, format: NUM },
    { label: 'Sum of squared deviations', value: ss, format: NUM },
    { label: 'Population variance (÷ n)', value: populationVariance, format: NUM },
  ]
  if (sampleVariance !== undefined)
    steps.push({ label: 'Sample variance (÷ n − 1)', value: sampleVariance, format: NUM })

  return {
    primary: { label: 'Mean (average)', value: mean, format: NUM },
    stats,
    steps,
    notes:
      n === 1
        ? ['Sample standard deviation needs at least two values, so only the population figure is shown.']
        : [],
  }
}

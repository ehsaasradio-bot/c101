import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, StepRule, Values } from '../../../lib/types'
import type { fields } from './fields'

/*
 * Combinations and permutations — the four standard counting formulas, chosen by
 * two questions rather than assumed:
 *
 *   order ignored, no repetition    C(n, r) = n! / (r! (n − r)!)     "n choose r"
 *   order matters, no repetition    P(n, r) = n! / (n − r)!
 *   order ignored, with repetition  C(n + r − 1, r)                  multiset coefficient
 *   order matters, with repetition  n^r
 *
 * These are the standard results (the twelvefold way, surjection-free rows). The
 * multiset coefficient is the stars-and-bars count: r stars and n − 1 bars laid
 * in a row, C(r + n − 1, r) arrangements.
 *
 * ── THE PRECISION PROBLEM ────────────────────────────────────────────────────
 *
 * These are integer counts, and a JavaScript number holds no integer past
 * 2^53 − 1 (Number.MAX_SAFE_INTEGER, 9,007,199,254,740,991). 21! = 5.1e19 is
 * already past it, so the textbook `n! / (r! (n − r)!)` is silently WRONG — not
 * Infinity, just quietly off — from n = 21 upwards, well before anything
 * overflows to a value that looks broken.
 *
 * Two defences:
 *
 *   1. Never form a factorial. C(n, r) is built multiplicatively with a division
 *      at every step — result = result × (n − r + i) / i — where each partial
 *      result is itself the binomial coefficient C(n − r + i, i) and therefore a
 *      whole number. Every intermediate stays within a factor of n of the answer
 *      instead of astronomically above it, so exactness survives to roughly the
 *      answer's own size rather than to 20!.
 *   2. Track exactness honestly. Every intermediate product is checked with
 *      Number.isSafeInteger. The moment one is not, the count is flagged inexact
 *      and reported in scientific notation to four significant figures, with a
 *      note saying why — rather than printing a 100-digit integer whose last 85
 *      digits are fiction.
 *
 * The magnitude is tracked separately as a sum of logs, which stays meaningful
 * even where the double has overflowed to Infinity, so a count with 600 digits
 * still gets an honest answer instead of a dash.
 */

const ORDER_CHOICES = ['ignored', 'matters'] as const
const REPETITION_CHOICES = ['no', 'yes'] as const

type OrderChoice = (typeof ORDER_CHOICES)[number]
type RepetitionChoice = (typeof REPETITION_CHOICES)[number]

const isOrder = (s: string): s is OrderChoice => (ORDER_CHOICES as readonly string[]).includes(s)
const isRepetition = (s: string): s is RepetitionChoice =>
  (REPETITION_CHOICES as readonly string[]).includes(s)

/** The largest n and r accepted, matching the field bounds exactly. */
const MAX_N = 1000
const MAX_R = 1000

/**
 * A count, plus whether the double holding it is the exact whole number.
 *
 * `log10` is the magnitude carried independently of `value`, so a count past
 * 1.8e308 — where the double has become Infinity — can still be described.
 */
export interface Count {
  /** Best available double. May be Infinity when the true count overflows. */
  value: number
  /** True only when `value` IS the answer, digit for digit. */
  exact: boolean
  /** log10 of the count; −Infinity when the count is zero. */
  log10: number
}

const ZERO: Count = { value: 0, exact: true, log10: Number.NEGATIVE_INFINITY }
const ONE: Count = { value: 1, exact: true, log10: 0 }

/**
 * C(n, r), built multiplicatively so no factorial is ever formed.
 *
 * After step i the running value is exactly C(n − k + i, i), a whole number, so
 * each division is exact whenever the product before it fit in a safe integer.
 * Taking k = min(r, n − r) uses the symmetry C(n, r) = C(n, n − r) to pick the
 * shorter loop, which is also the one with smaller intermediates.
 */
export function binomial(n: number, r: number): Count {
  if (r < 0 || r > n) return ZERO
  const k = Math.min(r, n - r)
  let value = 1
  let exact = true
  let log10 = 0
  for (let i = 1; i <= k; i += 1) {
    const factor = n - k + i
    const product = value * factor
    // This is the exact point where precision is lost: the running binomial
    // times the next factor no longer fits in 53 bits of mantissa.
    if (!Number.isSafeInteger(product)) exact = false
    value = product / i
    log10 += Math.log10(factor) - Math.log10(i)
  }
  if (!Number.isSafeInteger(value)) exact = false
  return { value, exact, log10 }
}

/** P(n, r) = n (n − 1) … (n − r + 1). No division, so no rounding either. */
export function falling(n: number, r: number): Count {
  if (r < 0 || r > n) return ZERO
  let value = 1
  let exact = true
  let log10 = 0
  for (let i = 0; i < r; i += 1) {
    const factor = n - i
    const product = value * factor
    if (!Number.isSafeInteger(product)) exact = false
    value = product
    log10 += Math.log10(factor)
  }
  return { value, exact, log10 }
}

/** n^r, accumulated one multiplication at a time so exactness can be watched. */
export function powerCount(n: number, r: number): Count {
  if (r === 0) return ONE
  if (n === 0) return ZERO
  let value = 1
  let exact = true
  for (let i = 0; i < r; i += 1) {
    const product = value * n
    if (!Number.isSafeInteger(product)) exact = false
    value = product
  }
  return { value, exact, log10: r * Math.log10(n) }
}

/** r!, which is exactly P(r, r) — the orderings of a single selection. */
export function factorialCount(r: number): Count {
  return falling(r, r)
}

/**
 * Scientific notation to four significant figures, derived from the log rather
 * than from the double, so it still works once the double is Infinity.
 */
function scientific(log10: number): string {
  const exponent = Math.floor(log10)
  const mantissa = Math.pow(10, log10 - exponent)
  // Rounding 9.9997 to four figures gives 10.00, which is not a mantissa.
  if (mantissa >= 9.9995) return `1.000 × 10^${exponent + 1}`
  return `${mantissa.toFixed(3)} × 10^${exponent}`
}

/**
 * Render a count as a Quantity. An exact count is a plain integer; an inexact
 * one becomes an explicitly approximate string, because a formatted 300-digit
 * integer would look precise and be wrong.
 */
export function quantityFor(label: string, count: Count): Quantity {
  if (count.exact) {
    return { label, value: count.value, format: { style: 'decimal', decimals: 0 } }
  }
  return { label, value: `about ${scientific(count.log10)}`, format: { style: 'raw' } }
}

/** The same text, for embedding in a worked step. */
function countText(count: Count): string {
  return count.exact ? count.value.toLocaleString('en-US') : `about ${scientific(count.log10)}`
}

const raw = (label: string, value: string): Quantity => ({ label, value, format: { style: 'raw' } })

/** A product written out, elided in the middle once it stops being readable. */
function productText(terms: readonly number[]): string {
  if (terms.length === 0) return '1'
  if (terms.length <= 6) return terms.join(' × ')
  return `${terms.slice(0, 3).join(' × ')} × … × ${terms[terms.length - 1]}`
}

const descending = (from: number, count: number): number[] =>
  Array.from({ length: Math.max(0, count) }, (_, i) => from - i)

export default function compute(v: Values<typeof fields>): CalcResult {
  const { order, repetition } = v

  if (!isOrder(order)) {
    throw new CalcError('Choose whether the order of the picks matters.', 'order')
  }
  if (!isRepetition(repetition)) {
    throw new CalcError('Choose whether an item can be picked more than once.', 'repetition')
  }

  // Finiteness FIRST. coerceValues emits NaN for unparseable input, and every
  // magnitude test below (`v.n < 1`, `v.n > MAX_N`) is false for NaN, so a bare
  // range check would let it through and hand back a NaN from a "valid" result.
  if (!Number.isFinite(v.n)) {
    throw new CalcError('Enter how many items there are to choose from.', 'n')
  }
  if (!Number.isFinite(v.r)) {
    throw new CalcError('Enter how many items are being chosen.', 'r')
  }

  // Counting is about discrete items: 4.5 objects cannot be chosen, and rounding
  // silently would answer a question nobody asked.
  if (!Number.isInteger(v.n)) {
    throw new CalcError('The pool has to be a whole number of items.', 'n')
  }
  if (!Number.isInteger(v.r)) {
    throw new CalcError('The number of items chosen has to be a whole number.', 'r')
  }

  if (v.n < 1) throw new CalcError('There has to be at least one item to choose from.', 'n')
  if (v.n > MAX_N) throw new CalcError(`Keep the pool to ${MAX_N} items or fewer.`, 'n')
  if (v.r < 0) throw new CalcError('You cannot choose a negative number of items.', 'r')
  if (v.r > MAX_R) throw new CalcError(`Choose at most ${MAX_R} items.`, 'r')

  const n = v.n
  const r = v.r

  // All four are computed every time: the comparison is the point of the page.
  const combinations = binomial(n, r)
  const permutations = falling(n, r)
  const combinationsWithRepetition = binomial(n + r - 1, r)
  const permutationsWithRepetition = powerCount(n, r)
  const orderings = factorialCount(r)

  const answer =
    repetition === 'no'
      ? order === 'ignored'
        ? combinations
        : permutations
      : order === 'ignored'
        ? combinationsWithRepetition
        : permutationsWithRepetition

  const primaryLabel =
    repetition === 'no'
      ? order === 'ignored'
        ? `Combinations — C(${n}, ${r})`
        : `Permutations — P(${n}, ${r})`
      : order === 'ignored'
        ? `Combinations with repetition — C(${n} + ${r} − 1, ${r})`
        : `Permutations with repetition — ${n}^${r}`

  const formula =
    repetition === 'no'
      ? order === 'ignored'
        ? 'C(n, r) = n! / (r! × (n − r)!)'
        : 'P(n, r) = n! / (n − r)!'
      : order === 'ignored'
        ? 'C(n + r − 1, r) = (n + r − 1)! / (r! × (n − 1)!)'
        : 'n^r'

  // Not an error: asking for more items than exist, with no reuse, has a real
  // and useful answer — there are zero ways to do it. But (n − r)! is undefined
  // there, so the substitution has to say that rather than print "-3!".
  const impossible = repetition === 'no' && r > n

  const substituted = impossible
    ? `r = ${r} is larger than n = ${n}, so there is nothing to count`
    : repetition === 'no'
      ? order === 'ignored'
        ? `${n}! / (${r}! × ${n - r}!)`
        : `${n}! / ${n - r}!`
      : order === 'ignored'
        ? `${n + r - 1}! / (${r}! × ${n - 1}!)`
        : `${n}^${r}`

  /*
   * The multiplicative form actually evaluated — the reason the answer can be
   * trusted — written out, so the page shows working rather than a factorial
   * nobody could compute.
   */
  const k = Math.min(r, n - r)
  const worked = impossible
    ? `${r} picked from only ${n} with no reuse — there is nothing to multiply`
    : r === 0
      ? 'Choosing nothing at all: there is exactly one way to do that'
      : repetition === 'no'
        ? order === 'ignored'
          ? // k = min(r, n − r): the symmetry C(n, r) = C(n, n − r) is what the
            // loop actually walks, so it is what the working shows.
            `(${productText(descending(n, k))}) / (${productText(descending(k, k))})`
          : productText(descending(n, r))
        : order === 'ignored'
          ? `(${productText(descending(n + r - 1, r))}) / (${productText(descending(r, r))})`
          : productText(new Array(r).fill(n))

  const steps: (Quantity | StepRule)[] = [
    { label: 'Items to choose from (n)', value: n, format: { style: 'decimal', decimals: 0 } },
    { label: 'Items being chosen (r)', value: r, format: { style: 'decimal', decimals: 0 } },
    raw(
      'Order',
      order === 'ignored'
        ? 'Ignored — a set, so ABC and CBA are the same pick'
        : 'Matters — a sequence, so ABC and CBA are different picks',
    ),
    raw(
      'Repetition',
      repetition === 'no'
        ? 'Not allowed — each item can appear at most once'
        : 'Allowed — every pick draws from the full pool again',
    ),
    { rule: true },
    raw('Formula', formula),
    raw('Substituted', substituted),
    raw('Multiplied out', worked),
    { rule: true },
    raw('Answer', countText(answer)),
  ]

  const notes: string[] = []
  if (impossible) {
    notes.push(
      `There are only ${n} items and none may be reused, so there is no way at all to pick ${r} of them. Zero ways is the answer, not an error — allow repetition, or choose ${n} or fewer.`,
    )
  }
  if (!answer.exact) {
    notes.push(
      'This count is larger than 9,007,199,254,740,991 — the largest whole number a JavaScript number can hold exactly — so it is shown to four significant figures instead of as an exact integer. Every digit printed is real; the rest are genuinely unknown here, and any calculator that prints them is inventing them.',
    )
  }
  notes.push(
    order === 'ignored'
      ? 'Order is ignored here, so picking A then B is the same result as picking B then A. That is the lottery case: 3-17-42 wins whichever order the balls leave the machine.'
      : 'Order matters here, so A then B is a different result from B then A. That is the podium case: gold for A and silver for B is not the same finish as the other way round.',
  )

  return {
    primary: quantityFor(primaryLabel, answer),
    stats: [
      quantityFor('Combinations — order ignored, no repeats', combinations),
      quantityFor('Permutations — order matters, no repeats', permutations),
      quantityFor('Combinations with repetition', combinationsWithRepetition),
      quantityFor('Permutations with repetition', permutationsWithRepetition),
      quantityFor(`Orderings of one selection (${r}!)`, orderings),
      raw('Formula used', `${formula}  →  ${substituted}`),
    ],
    steps,
    notes,
  }
}

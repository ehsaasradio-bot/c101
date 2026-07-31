import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, StepRule, Values } from '../../../lib/types'
import type { fields } from './fields'

/*
 * n! = 1 × 2 × 3 × … × n, with 0! = 1 by the empty-product convention.
 *
 * ── WHY THIS PAGE EXISTS ─────────────────────────────────────────────────────
 *
 * `math/combination-calculator` computes the same quantity internally and has to
 * stop being exact: it works in doubles, a double holds whole numbers exactly
 * only to 2^53 − 1 = 9,007,199,254,740,991, and 19! = 121,645,100,408,832,000 is
 * already past that. Its honest answer for a large count is "about
 * 3.137 × 10^49" — four significant figures and a note explaining why the rest
 * are unknown.
 *
 * The precise boundaries, all verified against BigInt in compute.test.ts rather
 * than quoted from memory, because the folklore here is wrong in both directions:
 *
 *   18! = 6,402,373,705,728,000          largest factorial that is a SAFE integer
 *   20! = 2,432,902,008,176,640,000      largest factorial fitting in a signed 64-bit int
 *   22! = 1,124,000,727,777,607,680,000  last factorial a double stores EXACTLY
 *   23!                                  first factorial a double gets wrong
 *   170!                                 largest finite double; 171! is Infinity
 *
 * 21! and 22! survive past 2^53 only because factorials accumulate factors of 2,
 * which a binary mantissa gets for free. That is luck, not a guarantee: at 23!
 * the double reports 25,852,016,738,884,978,212,864 for a true value of
 * 25,852,016,738,884,976,640,000, wrong from the seventeenth digit on.
 *
 * Here the arithmetic is done in BigInt, which is arbitrary precision, so there
 * is no "about". 100! is 158 digits and this page prints all 158 of them. That
 * exactness is the whole differentiator, so it leads: the exact integer, its
 * digit count, its scientific notation, and its trailing-zero count.
 *
 * ── TRAILING ZEROS ───────────────────────────────────────────────────────────
 *
 * Legendre's formula for the exponent of a prime p in n!:
 *
 *     v_p(n!) = floor(n/p) + floor(n/p²) + floor(n/p³) + …
 *
 * A trailing zero is a factor of 10 = 2 × 5. Twos are far more plentiful than
 * fives in a factorial (v_2 > v_5 for every n ≥ 2), so the fives are the binding
 * constraint and the zero count is exactly v_5(n!). That sum is computable from
 * n alone, without ever forming the factorial — which is a pleasing result in
 * its own right and is shown as working on the page.
 *
 * ── PERFORMANCE, MEASURED ────────────────────────────────────────────────────
 *
 * This runs on every keystroke, so the cap is set from a measurement, not a
 * guess. Benchmarked on this machine (Node 22, darwin/arm64), comparing a naive
 * `for` loop against the divide-and-conquer product used below, plus the cost of
 * rendering the result to a decimal string:
 *
 *       n        naive loop     divide & conquer     .toString()     digits
 *     ─────────────────────────────────────────────────────────────────────
 *       100         0.02 ms           0.03 ms          0.002 ms         158
 *     1,000         0.21 ms           0.04 ms          0.04 ms        2,568
 *     5,000         2.28 ms           0.27 ms          0.54 ms       16,326
 *    10,000         8.96 ms           0.79 ms          1.75 ms       35,660
 *    20,000        38.60 ms           4.41 ms          5.03 ms       77,338
 *    50,000       270.33 ms           9.12 ms         21.17 ms      213,237
 *
 * The naive loop is quadratic in n because every step multiplies one huge number
 * by one small one; splitting the range keeps both operands the same size and
 * lets the engine use its fast multiplication path. Even so the decimal
 * conversion grows superlinearly, and it is unavoidable — the exact digits are
 * the product.
 *
 * MAX_N = 10,000 gives a worst case of about 2.6 ms here (0.79 + 1.75); the
 * whole compute, measured end to end over 20 warm calls, is 3.20 ms at n =
 * 10,000, against 0.97 ms at 5,000, 0.11 ms at 1,000 and 0.02 ms at the default
 * of 100 — so ordinary use is free and only the very top of the range costs
 * anything. A
 * mid-range phone runs perhaps 4x slower, which lands near 10 ms — still inside
 * one frame, so typing stays smooth at the very top of the range. 20,000 would
 * be ~9.5 ms here and ~40 ms there, which is a visible stutter per keystroke,
 * and the result would be a 77,338-digit number nobody can read. 10,000 is the
 * last cap that is comfortable on both counts.
 */
const MAX_N = 10_000

/**
 * Digits shown in full. 100! has 158, so the default result is printed complete;
 * past this the middle is elided so the page stays readable (35,660 digits would
 * be 35 KB of markup for a figure no one reads through).
 */
// The HEADLINE budget, not the page's. The primary slot is styled for
// "$2,022.62"; 158 unbroken digits there overflowed the document by 2,899px at
// desktop and 3,182px on a phone. The exact value is not lost — it moves to a
// stat below, which wraps. 44 keeps 40! whole and elides beyond.
const FULL_DIGITS = 44
/** When eliding, how many digits survive at each end. */
const EDGE_DIGITS = 16

/**
 * The product of the integers lo..hi inclusive, by binary splitting.
 *
 * See the timing table above for why this is not a plain loop. Recursion depth
 * is log2(n) — 14 levels at n = 10,000 — so there is no stack risk.
 */
function product(lo: number, hi: number): bigint {
  if (lo > hi) return 1n
  if (lo === hi) return BigInt(lo)
  if (hi - lo === 1) return BigInt(lo) * BigInt(hi)
  const mid = (lo + hi) >> 1
  return product(lo, mid) * product(mid + 1, hi)
}

/** n! exactly, for any n ≥ 0. 0! and 1! are the empty and single-term products. */
export function factorial(n: number): bigint {
  return n < 2 ? 1n : product(2, n)
}

/**
 * The exponent of `prime` in n!, by Legendre's formula. Never forms n!, so it is
 * O(log n) regardless of how astronomical the factorial itself is.
 */
export function primeExponent(n: number, prime: number): number {
  let total = 0
  for (let power = prime; power <= n; power *= prime) total += Math.floor(n / power)
  return total
}

/** The number of zeros n! ends in: v_5(n!), since twos always outnumber fives. */
export function trailingZeros(n: number): number {
  return primeExponent(n, 5)
}

/** The individual floor(n / 5^k) terms, for showing the working. */
function legendreTerms(n: number, prime: number): { power: number; term: number }[] {
  const terms: { power: number; term: number }[] = []
  for (let power = prime; power <= n; power *= prime) {
    terms.push({ power, term: Math.floor(n / power) })
  }
  return terms
}

/**
 * The digits for the stat that carries the exact value. Far more generous than
 * the headline, because a wrapping stat can hold a paragraph where a 4xl
 * headline cannot hold a line. Still bounded: 10,000! is 35,660 digits, and
 * putting that in the DOM on every keystroke is its own kind of broken.
 */
const STAT_DIGITS = 1_200
const statDigits = (digits: string): string =>
  digits.length <= STAT_DIGITS
    ? digits
    : `${digits.slice(0, 600)} … ${digits.slice(-600)}`

/**
 * The exact digits, elided in the middle once they stop being readable. The
 * digits themselves are never grouped or spaced: the string stays copy-pasteable
 * into another tool, which is most of the point of printing it exactly.
 */
function displayDigits(digits: string): string {
  if (digits.length <= FULL_DIGITS) return digits
  return `${digits.slice(0, EDGE_DIGITS)} … ${digits.slice(-EDGE_DIGITS)}`
}

/**
 * Scientific notation to six significant figures, read off the exact digits
 * rather than off a logarithm — so the mantissa is correct by construction and
 * cannot drift from the integer printed beside it.
 */
function scientific(digits: string): string {
  const exponent = digits.length - 1
  const mantissa = Number(`${digits[0]}.${digits.slice(1, 9)}`)
  const rounded = mantissa.toFixed(5)
  // 9.999997 rounds to 10.00000, which is not a mantissa.
  if (rounded === '10.00000') return `1.00000 × 10^${exponent + 1}`
  return `${rounded} × 10^${exponent}`
}

/** The multiplication written out, elided once it stops fitting on a line. */
function productText(n: number): string {
  if (n === 0) return '(the empty product) = 1'
  if (n <= 6) return Array.from({ length: n }, (_, i) => i + 1).join(' × ')
  return `1 × 2 × 3 × … × ${n - 1} × ${n}`
}

const raw = (label: string, value: string): Quantity => ({ label, value, format: { style: 'raw' } })
const count = (label: string, value: number): Quantity => ({
  label,
  value,
  format: { style: 'decimal', decimals: 0 },
})

export default function compute(v: Values<typeof fields>): CalcResult {
  const { n } = v

  // Finiteness FIRST. coerceValues deliberately emits NaN for unparseable input,
  // and every magnitude test below (`n < 0`, `n > MAX_N`) is false for NaN, so a
  // bare range check would let it straight through into BigInt(NaN), which
  // throws a RangeError the form cannot attach to a field.
  if (!Number.isFinite(n)) {
    throw new CalcError('Enter a whole number to take the factorial of.', 'n')
  }

  // Non-integers are refused rather than rounded. The gamma function does extend
  // the factorial to them — Γ(x + 1) = x! for whole x, and Γ(3.5) is a perfectly
  // real number — but it is a different function, computed by approximation, and
  // mixing an approximated value into a page whose entire promise is exact digits
  // would be a quiet lie. The message says so rather than just refusing.
  if (!Number.isInteger(n)) {
    throw new CalcError(
      'Factorials are defined on whole numbers only. Non-integers have a gamma value, Γ(n + 1), but that is a different function and it cannot be given exactly — this page deals only in exact digits.',
      'n',
    )
  }

  // Negative integers are genuinely undefined: the gamma function has poles at
  // 0, −1, −2, … so there is no value to extend the factorial to there either.
  if (n < 0) {
    throw new CalcError(
      'Negative numbers have no factorial. The gamma function that extends the factorial has poles at every negative integer, so there is no finite value to report.',
      'n',
    )
  }

  if (n > MAX_N) {
    throw new CalcError(
      `Keep n at ${MAX_N.toLocaleString('en-US')} or below. ${MAX_N.toLocaleString('en-US')}! already has 35,660 digits, and the exact arithmetic beyond it gets slow enough to stall typing.`,
      'n',
    )
  }

  const exact = factorial(n)
  const digits = exact.toString()
  const digitCount = digits.length
  const zeros = trailingZeros(n)
  const twos = primeExponent(n, 2)
  const truncated = digitCount > FULL_DIGITS

  // What a double would have made of the same number — the direct comparison
  // with combination-calculator's arithmetic, and the reason this page exists.
  const asDouble = Number(digits)
  const doubleVerdict =
    n <= 18
      ? 'Exact, and a safe integer — every value below 2^53'
      : n <= 22
        ? 'Exact, but past 2^53 — only because factorials collect factors of 2'
        : n <= 170
          ? 'Wrong — right to about 15 significant figures, invented after that'
          : 'Overflows to Infinity — a double cannot hold 171! at all'

  const steps: (Quantity | StepRule)[] = [
    count('n', n),
    raw('Definition', 'n! = 1 × 2 × 3 × … × n,  with 0! = 1'),
    raw('Multiplied out', productText(n)),
    { rule: true },
    raw(`Exact value of ${n}!`, displayDigits(digits)),
    count('Number of digits', digitCount),
    raw('Scientific notation', scientific(digits)),
    { rule: true },
    raw(
      'Trailing zeros, without computing the factorial',
      'A zero comes from a factor of 10 = 2 × 5, and fives are scarcer than twos, so count the fives: floor(n/5) + floor(n/25) + floor(n/125) + …',
    ),
    ...legendreTerms(n, 5).map(({ power, term }) =>
      count(`floor(${n} / ${power})`, term),
    ),
    count('Trailing zeros', zeros),
  ]

  const notes: string[] = []

  if (n <= 1) {
    notes.push(
      'Both 0! and 1! are 1. That surprises people, but it is the only choice that works: n! is the number of ways to arrange n things, and there is exactly one way to arrange nothing — do nothing. It is also what keeps the recurrence n! = n × (n − 1)! true at n = 1, and what makes the binomial coefficient C(n, 0) = 1 come out right.',
    )
  }

  if (truncated) {
    notes.push(
      `${n}! has ${digitCount.toLocaleString('en-US')} digits, so the middle of it is elided above — the first ${EDGE_DIGITS} and the last ${EDGE_DIGITS} are shown. Every digit is known exactly; there are simply too many of them to put on a page. Results up to ${FULL_DIGITS} digits are printed in full.`,
    )
  }

  if (n >= 19) {
    notes.push(
      'This value is computed with BigInt arithmetic, so every digit above is exact. An ordinary JavaScript number holds whole numbers exactly only up to 9,007,199,254,740,991, and 19! = 121,645,100,408,832,000 already passes it. Factorials collect enough factors of 2 to survive as doubles a little past that by luck — 22! is the last one stored exactly — but 23! comes back as 25,852,016,738,884,978,212,864 when the true value is 25,852,016,738,884,976,640,000, and it only gets worse from there.',
    )
  }

  notes.push(
    'Factorials grow faster than any exponential: 10! is about 3.6 million, 20! is about 2.4 × 10^18, and 100! is already larger than the estimated number of atoms in the observable universe.',
  )

  return {
    primary: {
      // A BigInt cannot travel through `format.ts`, which formats `number`. The
      // exact value is therefore carried as a raw string, the same pattern
      // fraction-calculator and quadratic-calculator use for their results.
      label: `${n}!`,
      value: displayDigits(digits),
      format: { style: 'raw' },
    },
    stats: [
      // First, because it is what the page exists to give: every digit, exactly.
      // The headline above is elided to fit a headline; this is not.
      raw('Exact value', statDigits(digits)),
      count('Number of digits', digitCount),
      raw('Scientific notation', scientific(digits)),
      count('Trailing zeros', zeros),
      raw('As a JavaScript number', doubleVerdict),
      raw(
        'Nearest double',
        Number.isFinite(asDouble) ? asDouble.toExponential(6) : 'Infinity (overflowed)',
      ),
      count('Factors of 2 in n!', twos),
    ],
    steps,
    notes,
  }
}

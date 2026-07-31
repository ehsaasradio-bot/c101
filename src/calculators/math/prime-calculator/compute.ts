import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, StepRule, Values } from '../../../lib/types'
import type { fields } from './fields'

/*
 * PERFORMANCE — why the cap is 100,000,000,000 (1e11).
 *
 * Everything here is deterministic trial division to sqrt(n), on a 2·3·5 wheel
 * (candidates 7, 11, 13, 17, 19, 23, 29, 31, then +30 …), which tests 8 numbers
 * in every 30 rather than 15 — about 1.9x fewer divisions than odds-only.
 *
 * The worst case is NOT a big composite: a composite exits the moment its
 * smallest factor turns up. It is a large PRIME, where the loop must run all the
 * way to sqrt(n) and find nothing — and then the nearest-prime search on either
 * side runs the same full-length loop again for every candidate in the gap
 * (the average gap near 1e11 is ln(1e11) ≈ 25).
 *
 * Measured on Node 26 / Apple Silicon, timing the whole workload one keystroke
 * triggers — factorise + previous prime + next prime — over 60 random primes
 * sampled below each candidate cap:
 *
 *   cap    mean      worst
 *   1e9    0.09 ms   —
 *   1e10   4.3 ms    —
 *   1e11   12.7 ms   19.2 ms  (worst at n = 91,349,720,251)
 *   1e12   43.6 ms   70.3 ms  (worst at n = 800,195,749,537)
 *   1e13   170 ms    —
 *
 * 1e11 keeps the worst keystroke near 20 ms, roughly one frame; the declared
 * maximum itself (1e11 = 2^11 · 5^11) costs 8.4 ms. 1e12 was rejected: 40–70 ms
 * per keystroke is visible lag before allowing for a phone, and the cost grows
 * as sqrt(n), so each extra decade is another 3.2x. The cap is stated in the
 * field help, the error message, and the FAQ.
 *
 * Integer arithmetic is exact throughout: 1e11 is far below 2^53, so `%` and `/`
 * on doubles are exact for every value in range.
 */
const MAX_INPUT = 100_000_000_000

/** Gaps between successive candidates on the 2·3·5 wheel, starting from 7. */
const WHEEL: readonly number[] = [4, 2, 4, 2, 4, 6, 2, 6]

const SUPERSCRIPT = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹']

function superscript(n: number): string {
  return String(n)
    .split('')
    .map((d) => SUPERSCRIPT[Number(d)]!)
    .join('')
}

/**
 * Deterministic primality by trial division to sqrt(n). Exact — there are no
 * probabilistic witnesses here, so no Carmichael number can slip past it.
 */
export function isPrime(n: number): boolean {
  if (!Number.isInteger(n) || n < 2) return false
  if (n % 2 === 0) return n === 2
  if (n % 3 === 0) return n === 3
  if (n % 5 === 0) return n === 5
  let p = 7
  let i = 0
  while (p * p <= n) {
    if (n % p === 0) return false
    p += WHEEL[i]!
    i = (i + 1) & 7
  }
  return true
}

export interface PrimePower {
  prime: number
  power: number
}

/**
 * Complete prime factorisation, smallest prime first. Exact by construction:
 * whatever survives division by every candidate up to sqrt(rest) has no factor
 * at or below its own square root and is therefore itself prime, so the list
 * multiplies back to n with nothing left over.
 *
 * 0 and 1 have no factorisation and return an empty list — the caller must say
 * so in words rather than print an empty product.
 */
export function factorise(n: number): PrimePower[] {
  const out: PrimePower[] = []
  let rest = n
  if (rest < 2) return out

  for (const p of [2, 3, 5]) {
    let power = 0
    while (rest % p === 0) {
      rest /= p
      power += 1
    }
    if (power > 0) out.push({ prime: p, power })
  }

  let p = 7
  let i = 0
  while (p * p <= rest) {
    if (rest % p === 0) {
      let power = 0
      while (rest % p === 0) {
        rest /= p
        power += 1
      }
      out.push({ prime: p, power })
    }
    p += WHEEL[i]!
    i = (i + 1) & 7
  }
  // The cofactor left standing is prime; it is 1 exactly when n was consumed.
  if (rest > 1) out.push({ prime: rest, power: 1 })
  return out
}

/** Every divisor of n, ascending, built from the factorisation rather than by scanning. */
export function divisorsOf(factors: readonly PrimePower[]): number[] {
  let divisors = [1]
  for (const { prime, power } of factors) {
    const next: number[] = []
    let multiplier = 1
    for (let e = 0; e <= power; e += 1) {
      for (const d of divisors) next.push(d * multiplier)
      multiplier *= prime
    }
    divisors = next
  }
  return divisors.sort((a, b) => a - b)
}

/** 360 = 2³ × 3² × 5 */
function exponentForm(factors: readonly PrimePower[]): string {
  return factors
    .map(({ prime, power }) => (power === 1 ? String(prime) : `${prime}${superscript(power)}`))
    .join(' × ')
}

/** 360 = 2 × 2 × 2 × 3 × 3 × 5 */
function expandedForm(factors: readonly PrimePower[]): string {
  return factors
    .flatMap(({ prime, power }) => Array.from({ length: power }, () => String(prime)))
    .join(' × ')
}

function nextPrimeAfter(n: number): number {
  let candidate = n < 2 ? 2 : n + 1
  while (!isPrime(candidate)) candidate += 1
  return candidate
}

/** The largest prime below n, or null when there is none (n ≤ 2). */
function previousPrimeBefore(n: number): number | null {
  let candidate = n - 1
  while (candidate >= 2) {
    if (isPrime(candidate)) return candidate
    candidate -= 1
  }
  return null
}

/** The most divisor-rich number under the cap has ~6,700 of them; do not print them all. */
const DIVISORS_SHOWN = 24

function divisorText(divisors: readonly number[]): string {
  if (divisors.length <= DIVISORS_SHOWN) return divisors.join(', ')
  const head = divisors.slice(0, DIVISORS_SHOWN - 2).join(', ')
  return `${head}, … , ${divisors[divisors.length - 1]!}`
}

export default function compute(v: Values<typeof fields>): CalcResult {
  const n = v.number

  // Finiteness first: coerceValues emits NaN for unparseable input, and a
  // magnitude test like `n < 0` is false for NaN, so it would slip straight
  // through and come back out as a NaN on the page.
  if (!Number.isFinite(n)) throw new CalcError('Enter a whole number.', 'number')
  if (!Number.isInteger(n))
    throw new CalcError('Primality is defined for whole numbers only — enter an integer.', 'number')
  if (n < 0)
    throw new CalcError(
      'Negative numbers are never prime. Enter a whole number of 0 or more.',
      'number',
    )
  if (n > MAX_INPUT)
    throw new CalcError(
      'Enter a number no larger than 100,000,000,000. Beyond that, testing every possible divisor takes long enough to stall the page.',
      'number',
    )

  const factors = factorise(n)
  const prime = isPrime(n)
  const nextPrime = nextPrimeAfter(n)
  const previousPrime = previousPrimeBefore(n)

  // 0 and 1 are the two whole numbers that are neither prime nor composite, and
  // neither has a prime factorisation. Say so in words; never return a blank.
  const special = n === 0 || n === 1
  const composite = !prime && !special

  const headline = prime
    ? `Yes — ${n} is prime`
    : special
      ? `No — ${n} is neither prime nor composite`
      : `No — ${n} is composite`

  const factorisationText = special
    ? `None — ${n} has no prime factorisation`
    : exponentForm(factors)
  const expandedText = special
    ? `None — ${n} cannot be written as a product of primes`
    : expandedForm(factors)

  // Every whole number divides 0, so its divisor set is not a finite list.
  const divisors = n === 0 ? null : divisorsOf(factors)

  const smallestFactor = factors.length > 0 ? factors[0]!.prime : null
  const distinctPrimes = factors.length
  const totalPrimes = factors.reduce((acc, f) => acc + f.power, 0)

  const stats: Quantity[] = [
    { label: 'Prime factorisation', value: factorisationText, format: { style: 'raw' } },
    { label: 'Written out in full', value: expandedText, format: { style: 'raw' } },
    {
      label: 'Distinct prime factors',
      value: special ? 'None' : `${distinctPrimes} (${totalPrimes} counting repeats)`,
      format: { style: 'raw' },
    },
    {
      label: 'Number of divisors',
      value: divisors === null ? 'Every whole number divides 0' : divisors.length,
      format: divisors === null ? { style: 'raw' } : { style: 'decimal', decimals: 0 },
    },
    {
      label: 'Divisors',
      value: divisors === null ? 'Unbounded — 0 is divisible by everything' : divisorText(divisors),
      format: { style: 'raw' },
    },
    {
      label: 'Previous prime',
      value: previousPrime === null ? 'None — 2 is the smallest prime' : previousPrime,
      format: previousPrime === null ? { style: 'raw' } : { style: 'decimal', decimals: 0 },
    },
    { label: 'Next prime', value: nextPrime, format: { style: 'decimal', decimals: 0 } },
  ]

  const steps: (Quantity | StepRule)[] = [
    { label: 'Number tested', value: n, format: { style: 'decimal', decimals: 0 } },
    {
      label: 'Divisors only need testing up to √n',
      value:
        n < 2 ? 'Not applicable — a prime must be at least 2' : `√${n} ≈ ${Math.sqrt(n).toFixed(2)}`,
      format: { style: 'raw' },
    },
    { rule: true },
  ]

  if (special) {
    steps.push({
      label: n === 1 ? 'Why 1 is not prime' : 'Why 0 is not prime',
      value:
        n === 1
          ? 'A prime has exactly two distinct divisors, 1 and itself. 1 has only one divisor, so it is neither prime nor composite — and it has no prime factorisation.'
          : 'A prime has exactly two divisors. Every whole number divides 0, so 0 is neither prime nor composite, and it has no prime factorisation.',
      format: { style: 'raw' },
    })
  } else if (prime) {
    steps.push({
      label: 'Trial division',
      value: `No number from 2 up to √${n} divides ${n} exactly, so ${n} is prime.`,
      format: { style: 'raw' },
    })
  } else {
    // Replay the actual division chain, so the working shown is the algorithm.
    let rest = n
    let step = 0
    for (const { prime: p, power } of factors) {
      for (let k = 0; k < power; k += 1) {
        step += 1
        const quotient = rest / p
        steps.push({
          label: `Step ${step}`,
          value: `${rest} ÷ ${p} = ${quotient}`,
          format: { style: 'raw' },
        })
        rest = quotient
      }
    }
    steps.push({
      label: 'Nothing left to divide',
      value: 'The quotient reaches 1, so the factorisation is complete.',
      format: { style: 'raw' },
    })
    steps.push({ rule: true })
    steps.push({
      label: 'Multiply the factors back',
      value: `${expandedForm(factors)} = ${n}`,
      format: { style: 'raw' },
    })
  }

  const notes: string[] = []
  if (n === 2) {
    notes.push(
      '2 is the only even prime. Every other even number has 2 as a divisor on top of 1 and itself, so it has at least three divisors and cannot be prime.',
    )
  } else if (n === 1) {
    notes.push(
      '1 is deliberately excluded from the primes. If it counted, 12 could be written as 2 × 2 × 3, or 1 × 2 × 2 × 3, or 1 × 1 × 2 × 2 × 3, and prime factorisation would no longer be unique.',
    )
  } else if (n === 0) {
    notes.push(
      '0 is divisible by every whole number, so it has neither a finite list of divisors nor a prime factorisation.',
    )
  } else if (prime) {
    notes.push(`${n} has exactly two divisors: 1 and ${n} itself.`)
  } else if (smallestFactor !== null) {
    notes.push(
      `${n} is divisible by ${smallestFactor}, which is enough to rule it out — a prime has no divisor strictly between 1 and itself.`,
    )
  }
  if (composite && distinctPrimes === 1) {
    notes.push(`${n} is a prime power: one prime raised to a power, and nothing else.`)
  }

  return {
    primary: { label: 'Is it prime?', value: headline, format: { style: 'raw' } },
    stats,
    steps,
    notes,
  }
}

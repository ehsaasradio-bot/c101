import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, StepRule, Values } from '../../../lib/types'
import type { fields } from './fields'

/** Euclid: gcd(a, b) = gcd(b, a mod b), terminating when the remainder is 0. */
function gcdOf(a: number, b: number): number {
  let x = Math.abs(a)
  let y = Math.abs(b)
  while (y !== 0) {
    const r = x % y
    x = y
    y = r
  }
  return x
}

/**
 * Trial division up to sqrt(n). n is capped at 1e9 by the field bounds, so the
 * loop runs at most ~31,623 times — well inside a keystroke's budget.
 */
function primeFactors(n: number): ReadonlyArray<{ prime: number; power: number }> {
  const out: { prime: number; power: number }[] = []
  let rest = Math.abs(n)
  for (let p = 2; p * p <= rest; p += p === 2 ? 1 : 2) {
    if (rest % p !== 0) continue
    let power = 0
    while (rest % p === 0) {
      rest /= p
      power += 1
    }
    out.push({ prime: p, power })
  }
  // Whatever survives the sieve is itself prime (or 1, which contributes nothing).
  if (rest > 1) out.push({ prime: rest, power: 1 })
  return out
}

function factorText(n: number): string {
  const magnitude = Math.abs(n)
  if (magnitude === 0) return 'undefined (0 has no factorisation)'
  if (magnitude === 1) return '1 (no prime factors)'
  const body = primeFactors(magnitude)
    .map(({ prime, power }) => (power === 1 ? `${prime}` : `${prime}^${power}`))
    .join(' × ')
  return n < 0 ? `-1 × ${body}` : body
}

export default function compute(v: Values<typeof fields>): CalcResult {
  if (!Number.isFinite(v.numberA)) throw new CalcError('Enter a whole number.', 'numberA')
  if (!Number.isFinite(v.numberB)) throw new CalcError('Enter a whole number.', 'numberB')

  // Divisibility is an integer notion, so decimals are snapped before any maths.
  const a = Math.round(v.numberA)
  const b = Math.round(v.numberB)

  if (Math.abs(a) > 1_000_000_000)
    throw new CalcError('Keep the first number within ±1,000,000,000.', 'numberA')
  if (Math.abs(b) > 1_000_000_000)
    throw new CalcError('Keep the second number within ±1,000,000,000.', 'numberB')
  if (a === 0 && b === 0)
    throw new CalcError('The GCD of 0 and 0 is undefined — enter a non-zero number.', 'numberA')

  const gcd = gcdOf(a, b)

  // gcd is never 0 here (both inputs cannot be 0), so the division is safe.
  // Dividing before multiplying keeps the intermediate value as small as possible.
  const lcm = (Math.abs(a) / gcd) * Math.abs(b)
  if (!Number.isSafeInteger(lcm))
    throw new CalcError(
      'The LCM of these two numbers is too large to represent exactly. Try smaller numbers.',
      'numberB',
    )

  const coprime = gcd === 1
  const divisorCount = primeFactors(gcd).reduce((acc, f) => acc * (f.power + 1), 1)

  // Replay the Euclidean algorithm so the worked steps are the actual recursion.
  const trace: (Quantity | StepRule)[] = []
  let x = Math.max(Math.abs(a), Math.abs(b))
  let y = Math.min(Math.abs(a), Math.abs(b))
  let step = 0
  while (y !== 0) {
    step += 1
    const q = Math.floor(x / y)
    const r = x % y
    trace.push({
      label: `Step ${step}`,
      value: `${x} = ${q} × ${y} + ${r}`,
      format: { style: 'raw' },
    })
    x = y
    y = r
  }
  if (trace.length === 0) {
    trace.push({
      label: 'Step 1',
      value: 'One input is 0, so the GCD is the other number itself',
      format: { style: 'raw' },
    })
  }

  const steps: (Quantity | StepRule)[] = [
    { label: 'First number', value: a, format: { style: 'decimal', decimals: 0 } },
    { label: 'Second number', value: b, format: { style: 'decimal', decimals: 0 } },
    { rule: true },
    ...trace,
    {
      label: 'Last non-zero remainder',
      value: gcd,
      format: { style: 'decimal', decimals: 0 },
    },
    { rule: true },
    {
      label: 'LCM = |a × b| ÷ GCD',
      value: `${Math.abs(a)} × ${Math.abs(b)} ÷ ${gcd} = ${lcm}`,
      format: { style: 'raw' },
    },
  ]

  return {
    primary: {
      label: 'Greatest common divisor',
      value: gcd,
      format: { style: 'decimal', decimals: 0 },
    },
    stats: [
      { label: 'Least common multiple', value: lcm, format: { style: 'decimal', decimals: 0 } },
      { label: 'Coprime?', value: coprime ? 'Yes' : 'No', format: { style: 'raw' } },
      { label: 'Common divisors', value: divisorCount, format: { style: 'decimal', decimals: 0 } },
      { label: 'Factors of the first number', value: factorText(a), format: { style: 'raw' } },
      { label: 'Factors of the second number', value: factorText(b), format: { style: 'raw' } },
      { label: 'GCD in prime form', value: factorText(gcd), format: { style: 'raw' } },
    ],
    steps,
    notes: coprime
      ? ['These numbers are coprime: they share no factor above 1, so their LCM is their product.']
      : [],
  }
}

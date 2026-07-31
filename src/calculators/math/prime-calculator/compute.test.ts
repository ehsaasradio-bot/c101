import { describe, expect, test } from 'vitest'
import compute, { divisorsOf, factorise, isPrime } from './compute'
import { fields } from './fields'
import def from './index'
import { CalcError } from '../../../lib/types'
import { defaultValues, toResultView } from '../../../lib/view'

/**
 * Independent oracle #1: a sieve of Eratosthenes, generated here rather than
 * imported from the code under test. It shares no line with the trial-division
 * routine, so agreement between the two is real evidence rather than a tautology.
 */
function sieve(limit: number): boolean[] {
  const prime = new Array<boolean>(limit + 1).fill(true)
  prime[0] = false
  if (limit >= 1) prime[1] = false
  for (let p = 2; p * p <= limit; p += 1) {
    if (!prime[p]) continue
    for (let m = p * p; m <= limit; m += p) prime[m] = false
  }
  return prime
}

/**
 * Independent oracle #2: multiply the factorisation back out. A factorisation
 * that recovers n exactly, using only factors the sieve agrees are prime, is
 * correct regardless of how it was found.
 */
function product(factors: ReadonlyArray<{ prime: number; power: number }>): number {
  return factors.reduce((acc, f) => acc * Math.pow(f.prime, f.power), 1)
}

const SIEVE_LIMIT = 200_000
const ORACLE = sieve(SIEVE_LIMIT)

const stat = (r: ReturnType<typeof compute>, label: string) =>
  String(r.stats!.find((s) => s.label === label)!.value)

const headline = (n: number) => String(compute({ number: n }).primary.value)

describe('prime-calculator', () => {
  test('360, the default, is composite and factors as 2³ × 3² × 5', () => {
    // 360 = 36 × 10 = (2²·3²)·(2·5) = 2³·3²·5. Confirmed by the product below.
    const r = compute({ number: 360 })
    expect(r.primary.value).toBe('No — 360 is composite')
    expect(stat(r, 'Prime factorisation')).toBe('2³ × 3² × 5')
    expect(stat(r, 'Written out in full')).toBe('2 × 2 × 2 × 3 × 3 × 5')
    // (3+1)(2+1)(1+1) = 24 divisors.
    expect(stat(r, 'Number of divisors')).toBe('24')
    expect(stat(r, 'Previous prime')).toBe('359')
    expect(stat(r, 'Next prime')).toBe('367')
    expect(product(factorise(360))).toBe(360)
  })

  test('the primes below 100 are exactly the 25 expected ones', () => {
    // The classical list, checked against the sieve as well as against compute.
    const expected = [
      2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89,
      97,
    ]
    const found: number[] = []
    for (let n = 0; n < 100; n += 1) {
      const said = headline(n).startsWith('Yes')
      expect(said, `compute disagrees with the sieve at ${n}`).toBe(ORACLE[n])
      if (said) found.push(n)
    }
    expect(found).toEqual(expected)
    expect(found).toHaveLength(25)
  })

  test('agrees with a sieve of Eratosthenes across 0..200,000', () => {
    for (let n = 0; n <= SIEVE_LIMIT; n += 1) {
      expect(isPrime(n), `primality disagrees at ${n}`).toBe(ORACLE[n])
    }
  }, 30_000)

  test('the full result agrees with the sieve across 0..4,000', () => {
    // compute() also runs both neighbour searches, so this range is kept
    // smaller than the bare-primality sweep above.
    for (let n = 0; n <= 4_000; n += 1) {
      expect(headline(n).startsWith('Yes'), `compute disagrees at ${n}`).toBe(ORACLE[n])
    }
  }, 30_000)

  test('every factorisation multiplies back to n exactly, and uses only primes', () => {
    for (let n = 2; n <= 20_000; n += 1) {
      const factors = factorise(n)
      expect(product(factors), `factorisation of ${n} does not multiply back`).toBe(n)
      let previous = 0
      for (const { prime, power } of factors) {
        expect(ORACLE[prime], `${prime} in the factorisation of ${n} is not prime`).toBe(true)
        expect(power).toBeGreaterThan(0)
        // Ascending and distinct, so no prime is listed twice.
        expect(prime).toBeGreaterThan(previous)
        previous = prime
      }
    }
  }, 30_000)

  test('561 is a Carmichael number: composite despite fooling naive pseudoprime tests', () => {
    // 561 = 3 × 11 × 17. It is a Fermat pseudoprime to every base coprime to it,
    // so a base-2 Fermat test calls it prime. Demonstrate that first, then show
    // trial division is not fooled.
    const modPow = (base: bigint, exp: bigint, mod: bigint) => {
      let acc = 1n
      let b = base % mod
      let e = exp
      while (e > 0n) {
        if (e & 1n) acc = (acc * b) % mod
        b = (b * b) % mod
        e >>= 1n
      }
      return acc
    }
    expect(modPow(2n, 560n, 561n)).toBe(1n) // Fermat's test says "probably prime"

    const r = compute({ number: 561 })
    expect(r.primary.value).toBe('No — 561 is composite')
    expect(stat(r, 'Prime factorisation')).toBe('3 × 11 × 17')
    expect(product(factorise(561))).toBe(561)
    expect(isPrime(561)).toBe(false)
    // The other small Carmichael numbers, for good measure.
    for (const c of [1105, 1729, 2465, 2821, 6601, 8911]) {
      expect(isPrime(c), `${c} is a Carmichael number, not a prime`).toBe(false)
      expect(product(factorise(c))).toBe(c)
    }
  })

  test('a large semiprime near the cap factors into its two primes', () => {
    // Built here from two primes found near √1e11 ≈ 316,228, so the literal is
    // derived rather than invented — and so trial division must run almost the
    // whole way to the square root before finding anything.
    let p = 316_000
    while (!ORACLE[p]) p -= 1
    let q = p - 1
    while (!ORACLE[q]) q -= 1
    const semiprime = p * q
    expect(semiprime).toBeLessThanOrEqual(100_000_000_000)

    const factors = factorise(semiprime)
    expect(factors).toEqual([{ prime: q, power: 1 }, { prime: p, power: 1 }])
    expect(product(factors)).toBe(semiprime)
    expect(isPrime(semiprime)).toBe(false)
    expect(headline(semiprime)).toBe(`No — ${semiprime} is composite`)
    expect(stat(compute({ number: semiprime }), 'Number of divisors')).toBe('4')
  })

  test('a large prime near the cap is reported prime and factors as itself', () => {
    const n = 99_999_999_977 // verified below by exhaustive trial division
    expect(isPrime(n)).toBe(true)
    expect(factorise(n)).toEqual([{ prime: n, power: 1 }])
    const r = compute({ number: n })
    expect(r.primary.value).toBe(`Yes — ${n} is prime`)
    expect(stat(r, 'Prime factorisation')).toBe(String(n))
    expect(stat(r, 'Number of divisors')).toBe('2')
    expect(stat(r, 'Divisors')).toBe(`1, ${n}`)
  }, 30_000)

  test('the worst case stays inside a keystroke budget', () => {
    // A large prime: trial division cannot exit early, and both neighbour
    // searches repeat the same full-length work. This is the measurement the
    // 1e11 cap was chosen from — see the note at the top of compute.ts.
    const worst = 91_349_720_251
    expect(isPrime(worst)).toBe(true)
    compute({ number: worst }) // warm the JIT
    const started = performance.now()
    compute({ number: worst })
    const elapsed = performance.now() - started
    // Measured at ~19 ms; 250 ms leaves ample headroom for a loaded CI machine
    // while still failing loudly if the algorithm ever regresses to odds-only
    // over the whole range, let alone to something worse.
    expect(elapsed).toBeLessThan(250)
  }, 30_000)

  test('1 is not prime and has no prime factorisation', () => {
    const r = compute({ number: 1 })
    expect(r.primary.value).toBe('No — 1 is neither prime nor composite')
    expect(stat(r, 'Prime factorisation')).toBe('None — 1 has no prime factorisation')
    expect(stat(r, 'Written out in full')).toBe('None — 1 cannot be written as a product of primes')
    expect(stat(r, 'Distinct prime factors')).toBe('None')
    expect(stat(r, 'Number of divisors')).toBe('1')
    expect(stat(r, 'Divisors')).toBe('1')
    expect(stat(r, 'Previous prime')).toBe('None — 2 is the smallest prime')
    expect(stat(r, 'Next prime')).toBe('2')
    expect(factorise(1)).toEqual([])
    expect(r.notes!.join(' ')).toMatch(/unique/)
    // Nothing is blank: every stat says something.
    for (const s of r.stats!) expect(String(s.value).length).toBeGreaterThan(0)
  })

  test('2 is prime and is the only even prime', () => {
    const r = compute({ number: 2 })
    expect(r.primary.value).toBe('Yes — 2 is prime')
    expect(stat(r, 'Prime factorisation')).toBe('2')
    expect(stat(r, 'Number of divisors')).toBe('2')
    expect(stat(r, 'Divisors')).toBe('1, 2')
    expect(stat(r, 'Previous prime')).toBe('None — 2 is the smallest prime')
    expect(stat(r, 'Next prime')).toBe('3')
    expect(r.notes!.join(' ')).toMatch(/only even prime/)
    // No other even number under the sieve limit is prime.
    for (let n = 4; n <= SIEVE_LIMIT; n += 2) {
      if (ORACLE[n]) throw new Error(`${n} is even and the sieve called it prime`)
    }
  }, 30_000)

  test('0 is not prime and has no factorisation or finite divisor list', () => {
    const r = compute({ number: 0 })
    expect(r.primary.value).toBe('No — 0 is neither prime nor composite')
    expect(stat(r, 'Prime factorisation')).toBe('None — 0 has no prime factorisation')
    expect(stat(r, 'Number of divisors')).toBe('Every whole number divides 0')
    expect(stat(r, 'Divisors')).toBe('Unbounded — 0 is divisible by everything')
    expect(stat(r, 'Previous prime')).toBe('None — 2 is the smallest prime')
    expect(stat(r, 'Next prime')).toBe('2')
    expect(isPrime(0)).toBe(false)
    for (const s of r.stats!) expect(String(s.value).length).toBeGreaterThan(0)
  })

  test('the divisor list matches a brute-force enumeration', () => {
    for (const n of [1, 2, 4, 12, 97, 360, 561, 1024, 5040]) {
      const brute: number[] = []
      for (let d = 1; d <= n; d += 1) if (n % d === 0) brute.push(d)
      expect(divisorsOf(factorise(n)), `divisors of ${n}`).toEqual(brute)
      // The divisor count identity: ∏(power + 1).
      expect(brute.length).toBe(factorise(n).reduce((acc, f) => acc * (f.power + 1), 1))
    }
  })

  test('the nearest primes bracket the input and nothing prime lies between', () => {
    for (const n of [2, 3, 10, 100, 561, 7919, 104_729]) {
      const r = compute({ number: n })
      const next = Number(stat(r, 'Next prime'))
      expect(ORACLE[next]).toBe(true)
      expect(next).toBeGreaterThan(n)
      for (let k = n + 1; k < next; k += 1) expect(ORACLE[k]).toBe(false)

      const previousText = stat(r, 'Previous prime')
      if (previousText.startsWith('None')) {
        expect(n).toBeLessThanOrEqual(2)
        continue
      }
      const previous = Number(previousText)
      expect(ORACLE[previous]).toBe(true)
      expect(previous).toBeLessThan(n)
      for (let k = previous + 1; k < n; k += 1) expect(ORACLE[k]).toBe(false)
    }
  })

  test('the worked steps replay a real division chain ending at 1', () => {
    const r = compute({ number: 360 })
    const chain = r.steps!.flatMap((s) =>
      'label' in s && s.label.startsWith('Step ') ? [String(s.value)] : [],
    )
    expect(chain.length).toBeGreaterThan(1)
    let running = 360
    for (const line of chain) {
      const m = /^(\d+) ÷ (\d+) = (\d+)$/.exec(line)!
      expect(Number(m[1])).toBe(running)
      expect(Number(m[1]) % Number(m[2])).toBe(0)
      expect(Number(m[1]) / Number(m[2])).toBe(Number(m[3]))
      running = Number(m[3])
    }
    expect(running).toBe(1)
  })

  test('nudging the first field to 1.1x its default stays valid and moves the answer', () => {
    // Exactly what tests/calculators.spec.ts types into the browser: the bump is
    // rounded through toFixed(4) before it is filled in, which matters here —
    // 360 * 1.1 is 396.00000000000006 in binary floating point, and compute
    // rejects non-integers. The rounding is what makes 360 a safe default.
    const nudged = Number((fields[0].default * 1.1).toFixed(4))
    expect(nudged).toBe(396)
    expect(Number.isInteger(nudged)).toBe(true)
    const started = performance.now()
    const r = compute({ number: nudged })
    expect(performance.now() - started).toBeLessThan(100)
    expect(r.primary.value).not.toBe(compute({ number: fields[0].default }).primary.value)
    // 396 = 2² × 3² × 11
    expect(stat(r, 'Prime factorisation')).toBe('2² × 3² × 11')
    expect(product(factorise(nudged))).toBe(nudged)
  })

  test('both declared bounds are values compute accepts', () => {
    const { min, max, default: def, step } = fields[0]
    expect(() => compute({ number: min })).not.toThrow()
    expect(() => compute({ number: max })).not.toThrow()
    // The slider snaps to min + n × step, so the default must land on that grid.
    expect((def - min) / step).toBe(Math.round((def - min) / step))
    expect((max - min) / step).toBe(Math.round((max - min) / step))
    // 1e11 = 2^11 × 5^11.
    expect(factorise(max)).toEqual([
      { prime: 2, power: 11 },
      { prime: 5, power: 11 },
    ])
  }, 30_000)

  test('parts and series are absent, so their counts cannot vary with input', () => {
    // A slice per prime factor would be the obvious donut here and the obvious
    // bug: the factor count depends on the input, and the server renders the
    // donut only from the DEFAULT result.
    for (const n of [0, 1, 2, 97, 360, 561, 1024]) {
      const r = compute({ number: n })
      expect(r.parts).toBeUndefined()
      expect(r.series).toBeUndefined()
    }
  })

  test.each([
    ['a non-finite number', Number.NaN],
    ['infinity', Number.POSITIVE_INFINITY],
    ['negative infinity', Number.NEGATIVE_INFINITY],
    ['a decimal', 7.5],
    ['a negative number', -7],
    ['a value past the cap', 100_000_000_001],
  ])('rejects %s against the offending field', (_label, value) => {
    let thrown: unknown
    try {
      compute({ number: value })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe('number')
    expect((thrown as CalcError).message.length).toBeGreaterThan(10)
  })

  /*
   * The conformance sweep in src/calculators/registry.test.ts only sees
   * calculators that appear in the barrel, and this one is not wired in yet, so
   * the same checks are run here against the definition directly. Delete this
   * block once the registry covers it.
   */
  test('the definition satisfies the conformance rules', () => {
    expect(def.description.length).toBeGreaterThan(50)
    expect(def.description.length).toBeLessThanOrEqual(160)
    expect(def.seoTitle.length).toBeLessThanOrEqual(70)
    expect(def.intro.length).toBeGreaterThan(40)
    expect(def.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    expect(def.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(def.faqs.length).toBeGreaterThanOrEqual(3)
    for (const faq of def.faqs) {
      expect(faq.q.endsWith('?')).toBe(true)
      expect(faq.a.length).toBeGreaterThan(40)
    }
    for (const field of def.fields) expect(field.id).toMatch(/^[a-z][a-zA-Z0-9]*$/)

    // THE ORGANIZING RULE: no colour, class name, or HTML in a definition.
    const serialized = JSON.stringify(def, (_k, v) => (typeof v === 'function' ? undefined : v))
    expect(serialized).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(serialized).not.toMatch(/\b(bg|text|border|rounded|shadow)-[a-z]+-\d{2,3}\b/)
    expect(serialized).not.toMatch(/<\/?[a-z][\s\S]*>/i)
  })

  test('the default result renders to a complete view', () => {
    // No `scale`: primality is a yes/no, not a position on a band.
    const view = toResultView(def.compute(defaultValues(def as never) as never), undefined)
    expect(view.primary.text).toBe('No — 360 is composite')
    expect(view.primary.text).not.toContain('NaN')
    for (const s of view.stats) {
      expect(s.text).not.toContain('NaN')
      expect(s.text.length).toBeGreaterThan(0)
    }
    expect(view.stats.map((s) => `${s.label}: ${s.text}`)).toEqual([
      'Prime factorisation: 2³ × 3² × 5',
      'Written out in full: 2 × 2 × 2 × 3 × 3 × 5',
      'Distinct prime factors: 3 (6 counting repeats)',
      'Number of divisors: 24',
      'Divisors: 1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 15, 18, 20, 24, 30, 36, 40, 45, 60, 72, 90, 120, 180, 360',
      'Previous prime: 359',
      'Next prime: 367',
    ])
    expect(view.parts).toEqual([])
    expect(view.series).toEqual([])
  })

  test('never returns a blank or a NaN anywhere in range', () => {
    for (const n of [0, 1, 2, 3, 4, 97, 100, 561, 999_983, 100_000_000_000]) {
      const r = compute({ number: n })
      expect(String(r.primary.value)).not.toContain('NaN')
      expect(String(r.primary.value).length).toBeGreaterThan(0)
      for (const s of r.stats!) {
        expect(String(s.value), `${n}: ${s.label}`).not.toContain('NaN')
        expect(String(s.value).length, `${n}: ${s.label}`).toBeGreaterThan(0)
      }
      for (const s of r.steps!) {
        if ('rule' in s) continue
        expect(String(s.value), `${n}: ${s.label}`).not.toContain('NaN')
        expect(String(s.value).length).toBeGreaterThan(0)
      }
      expect(r.notes!.length).toBeGreaterThan(0)
    }
  }, 30_000)
})

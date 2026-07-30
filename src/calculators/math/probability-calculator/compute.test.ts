import { describe, expect, test } from 'vitest'
import compute from './compute'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'
import type { Quantity } from '../../../lib/types'

type Input = Parameters<typeof compute>[0]

const defaults = Object.fromEntries(fields.map((f) => [f.id, f.default])) as Input

const primary = (r: ReturnType<typeof compute>) => Number(r.primary.value)
const stat = (r: ReturnType<typeof compute>, label: string) => {
  const found = r.stats!.find((s) => s.label === label)
  if (!found) throw new Error(`no stat labelled "${label}" in [${r.stats!.map((s) => s.label)}]`)
  return Number(found.value)
}
const part = (r: ReturnType<typeof compute>, label: string) =>
  r.parts!.find((p) => p.label === label)!.value

/**
 * A deterministic 32-bit linear congruential generator (Numerical Recipes
 * constants). Seeded, so the Monte Carlo checks below are reproducible and can
 * never flake — an unseeded Math.random would make a failure unreproducible.
 */
function lcg(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

/**
 * Independent Monte Carlo: draw A and B from separate streams so independence
 * is a property of the simulation rather than an assumption copied from the
 * formula under test.
 */
function simulateTwoEvents(pA: number, pB: number, runs: number) {
  const rand = lcg(20260730)
  let both = 0
  let either = 0
  let neither = 0
  for (let i = 0; i < runs; i += 1) {
    const a = rand() < pA
    const b = rand() < pB
    if (a && b) both += 1
    if (a || b) either += 1
    if (!a && !b) neither += 1
  }
  return { both: both / runs, either: either / runs, neither: neither / runs }
}

/** Monte Carlo for "at least one success in n Bernoulli trials". */
function simulateAtLeastOne(p: number, trials: number, runs: number) {
  const rand = lcg(987654321)
  let hits = 0
  for (let i = 0; i < runs; i += 1) {
    let seen = false
    for (let t = 0; t < trials; t += 1) if (rand() < p) seen = true
    if (seen) hits += 1
  }
  return hits / runs
}

describe('probability calculator', () => {
  test('defaults: 30% and 20% independent give 6% both, cross-checked by simulation', () => {
    // P(A ∩ B) = 0.3 × 0.2 = 0.06; P(A ∪ B) = 0.3 + 0.2 − 0.06 = 0.44;
    // P(neither) = (1 − 0.3)(1 − 0.2) = 0.56; P(exactly one) = 0.44 − 0.06 = 0.38.
    const r = compute(defaults)
    expect(primary(r)).toBeCloseTo(6, 10)
    expect(stat(r, 'P(A or B) — at least one happens')).toBeCloseTo(44, 10)
    expect(stat(r, 'P(neither A nor B)')).toBeCloseTo(56, 10)
    expect(stat(r, 'P(exactly one of them)')).toBeCloseTo(38, 10)
    expect(stat(r, 'P(not A)')).toBeCloseTo(70, 10)
    expect(stat(r, 'P(not B)')).toBeCloseTo(80, 10)

    // Second, independent confirmation: 200k seeded draws.
    const sim = simulateTwoEvents(0.3, 0.2, 200_000)
    expect(sim.both * 100).toBeCloseTo(6, 0)
    expect(sim.either * 100).toBeCloseTo(44, 0)
    expect(sim.neither * 100).toBeCloseTo(56, 0)
  })

  test('defaults: at least one A in 10 trials is 97.18%, confirmed by simulation', () => {
    // 1 − 0.7^10 = 1 − 0.0282475249 = 0.9717524751.
    const r = compute(defaults)
    expect(stat(r, 'P(at least one A in 10 trials)')).toBeCloseTo(97.17524751, 8)
    expect(stat(r, 'Expected number of A occurrences')).toBeCloseTo(3, 10)

    const sim = simulateAtLeastOne(0.3, 10, 100_000)
    expect(sim * 100).toBeCloseTo(97.17524751, 0)
  })

  test('independent case matches exhaustive enumeration of two fair dice', () => {
    // A = "first die shows 1 or 2" (2/6), B = "second die is even" (3/6).
    // Rolling two dice makes these independent by construction, so the 36
    // equally likely outcomes give the exact answer with no formula involved.
    let both = 0
    let either = 0
    let neither = 0
    let aOnly = 0
    for (let d1 = 1; d1 <= 6; d1 += 1) {
      for (let d2 = 1; d2 <= 6; d2 += 1) {
        const a = d1 <= 2
        const b = d2 % 2 === 0
        if (a && b) both += 1
        if (a || b) either += 1
        if (!a && !b) neither += 1
        if (a && !b) aOnly += 1
      }
    }
    expect(both).toBe(6)
    expect(either).toBe(24)
    expect(neither).toBe(12)

    const r = compute({ ...defaults, probA: 200 / 6, probB: 300 / 6 })
    expect(primary(r)).toBeCloseTo((both / 36) * 100, 8)
    expect(stat(r, 'P(A or B) — at least one happens')).toBeCloseTo((either / 36) * 100, 8)
    expect(stat(r, 'P(neither A nor B)')).toBeCloseTo((neither / 36) * 100, 8)
    expect(part(r, 'A only')).toBeCloseTo((aOnly / 36) * 100, 8)
  })

  test('mutually exclusive case matches exhaustive enumeration of one die', () => {
    // A = "rolls 1 or 2" (2/6), B = "rolls 3" (1/6). One die cannot show both,
    // so these are disjoint and the whole sample space is six outcomes.
    let both = 0
    let either = 0
    let neither = 0
    for (let d = 1; d <= 6; d += 1) {
      const a = d <= 2
      const b = d === 3
      if (a && b) both += 1
      if (a || b) either += 1
      if (!a && !b) neither += 1
    }
    expect(both).toBe(0)
    expect(either).toBe(3)
    expect(neither).toBe(3)

    const r = compute({
      ...defaults,
      relationship: 'exclusive',
      probA: 200 / 6,
      probB: 100 / 6,
    })
    expect(primary(r)).toBe(0)
    expect(stat(r, 'P(A or B) — at least one happens')).toBeCloseTo((either / 6) * 100, 8)
    expect(stat(r, 'P(neither A nor B)')).toBeCloseTo((neither / 6) * 100, 8)
    // Every outcome where either happens is an "exactly one" outcome here.
    expect(stat(r, 'P(exactly one of them)')).toBeCloseTo((either / 6) * 100, 8)
  })

  test('the relationship changes the answer for the very same two numbers', () => {
    const ind = compute({ ...defaults, probA: 40, probB: 25 })
    const exc = compute({ ...defaults, relationship: 'exclusive', probA: 40, probB: 25 })

    expect(primary(ind)).toBeCloseTo(10, 10) // 0.4 × 0.25
    expect(primary(exc)).toBe(0)
    expect(stat(ind, 'P(A or B) — at least one happens')).toBeCloseTo(55, 10) // 40 + 25 − 10
    expect(stat(exc, 'P(A or B) — at least one happens')).toBeCloseTo(65, 10) // 40 + 25
    expect(stat(ind, 'P(neither A nor B)')).toBeCloseTo(45, 10)
    expect(stat(exc, 'P(neither A nor B)')).toBeCloseTo(35, 10)
  })

  test('rejects mutually exclusive events whose probabilities exceed 100%', () => {
    let thrown: unknown
    try {
      compute({ ...defaults, relationship: 'exclusive', probA: 80, probB: 60 })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe('probB')
    expect((thrown as CalcError).message).toContain('140%')
    expect((thrown as CalcError).message).toContain('20%')

    // Exactly 100% is the boundary and is legitimate: the two events between
    // them cover the whole sample space, leaving P(neither) = 0.
    const edge = compute({ ...defaults, relationship: 'exclusive', probA: 70, probB: 30 })
    expect(stat(edge, 'P(A or B) — at least one happens')).toBeCloseTo(100, 10)
    expect(stat(edge, 'P(neither A nor B)')).toBeCloseTo(0, 10)
    // The same pair is perfectly fine when the events are independent.
    expect(primary(compute({ ...defaults, probA: 80, probB: 60 }))).toBeCloseTo(48, 10)
  })

  // 4,410 cases: 2 relationships x 21 values of P(A) x 21 of P(B) x 5 trial
  // counts, each building a full result with its series. That is ~2.3s alone
  // and ~6.7s when the rest of the suite is competing for cores, so it needs
  // more than vitest's 5s default. Widened rather than thinned: a sweep that
  // passes alone and fails in a full run is worse than no test at all.
  test('every probability stays inside [0, 100] across the reachable input space', () => {
    for (const relationship of ['independent', 'exclusive'] as const) {
      for (let probA = 0; probA <= 100; probA += 5) {
        for (let probB = 0; probB <= 100; probB += 5) {
          for (const trials of [1, 2, 10, 37, 100]) {
            const values = { relationship, probA, probB, trials }
            if (relationship === 'exclusive' && probA + probB > 100) {
              expect(() => compute(values)).toThrow(CalcError)
              continue
            }
            const r = compute(values)
            const probabilities = [
              r.primary,
              ...r.stats!.filter((s) => s.format.style === 'percent'),
            ]
            for (const q of probabilities) {
              const n = Number(q.value)
              expect(Number.isFinite(n), `${q.label} @ ${JSON.stringify(values)}`).toBe(true)
              expect(n, `${q.label} @ ${JSON.stringify(values)}`).toBeGreaterThanOrEqual(0)
              expect(n, `${q.label} @ ${JSON.stringify(values)}`).toBeLessThanOrEqual(100)
            }
            for (const p of r.parts!) {
              expect(p.value, `${p.label} @ ${JSON.stringify(values)}`).toBeGreaterThanOrEqual(0)
              expect(p.value, `${p.label} @ ${JSON.stringify(values)}`).toBeLessThanOrEqual(100)
            }
            for (const s of r.series!) {
              for (const [, y] of s.points) {
                expect(y, `${s.label} @ ${JSON.stringify(values)}`).toBeGreaterThanOrEqual(0)
                expect(y, `${s.label} @ ${JSON.stringify(values)}`).toBeLessThanOrEqual(100)
              }
            }
          }
        }
      }
    }
  }, 30_000)

  test('the four outcomes partition the sample space at every input', () => {
    for (const relationship of ['independent', 'exclusive'] as const) {
      for (let probA = 0; probA <= 100; probA += 10) {
        for (let probB = 0; probB <= 100; probB += 10) {
          if (relationship === 'exclusive' && probA + probB > 100) continue
          const r = compute({ relationship, probA, probB, trials: 10 })
          expect(r.parts).toHaveLength(4)
          const sum = r.parts!.reduce((acc, p) => acc + p.value, 0)
          expect(sum, `${relationship} ${probA}/${probB}`).toBeCloseTo(
            Number(r.partsTotal!.value),
            8,
          )
          // Both-and-A-only reconstruct P(A); both-and-B-only reconstruct P(B).
          expect(part(r, 'Both A and B') + part(r, 'A only')).toBeCloseTo(probA, 8)
          expect(part(r, 'Both A and B') + part(r, 'B only')).toBeCloseTo(probB, 8)
        }
      }
    }
  })

  test('parts and series counts never vary with the input', () => {
    const shapes = new Set<string>()
    for (const relationship of ['independent', 'exclusive'] as const) {
      for (const probA of [0, 1, 50, 99, 100]) {
        for (const probB of [0, 1, 50, 99, 100]) {
          if (relationship === 'exclusive' && probA + probB > 100) continue
          for (const trials of [1, 3, 40, 100]) {
            const r = compute({ relationship, probA, probB, trials })
            shapes.add(`${r.parts!.length}/${r.series!.length}`)
          }
        }
      }
    }
    expect([...shapes]).toEqual(['4/2'])
  })

  test('series are ordered, capped in length, and end on the headline figure', () => {
    for (const trials of [1, 2, 10, 41, 100]) {
      const r = compute({ ...defaults, trials })
      for (const s of r.series!) {
        expect(s.points.length).toBeGreaterThan(1)
        expect(s.points.length).toBeLessThanOrEqual(45)
        expect(s.points[0]![0]).toBe(0)
        expect(s.points[0]![1]).toBe(0)
        expect(s.points[s.points.length - 1]![0]).toBe(trials)
        s.points.forEach((p, i) => {
          if (i > 0) expect(p[0]).toBeGreaterThan(s.points[i - 1]![0])
        })
      }
      // The curve must land on exactly the number quoted in the stats.
      const last = r.series![0]!.points[r.series![0]!.points.length - 1]![1]
      expect(last).toBeCloseTo(
        stat(r, `P(at least one A in ${trials} ${trials === 1 ? 'trial' : 'trials'})`),
        10,
      )
    }
  })

  test('at-least-one grows with trials and saturates, matching 1 − (1 − p)^n', () => {
    let previous = -1
    for (let n = 1; n <= 100; n += 1) {
      const r = compute({ ...defaults, probA: 5, probB: 20, trials: n })
      const value = stat(r, `P(at least one A in ${n} ${n === 1 ? 'trial' : 'trials'})`)
      expect(value).toBeCloseTo((1 - Math.pow(0.95, n)) * 100, 8)
      expect(value).toBeGreaterThan(previous)
      previous = value
    }
    // A 5% event is more likely than not to appear within 14 tries: 0.95^13 =
    // 0.5133 (still under half), 0.95^14 = 0.4877 (past half).
    const thirteen = compute({ ...defaults, probA: 5, trials: 13 })
    const fourteen = compute({ ...defaults, probA: 5, trials: 14 })
    expect(stat(thirteen, 'P(at least one A in 13 trials)')).toBeLessThan(50)
    expect(stat(fourteen, 'P(at least one A in 14 trials)')).toBeGreaterThan(50)
  })

  test('degenerate probabilities behave', () => {
    const impossible = compute({ ...defaults, probA: 0, probB: 0 })
    expect(primary(impossible)).toBe(0)
    expect(stat(impossible, 'P(A or B) — at least one happens')).toBe(0)
    expect(stat(impossible, 'P(neither A nor B)')).toBeCloseTo(100, 10)
    expect(stat(impossible, 'P(at least one A in 10 trials)')).toBe(0)
    expect(impossible.stats!.find((s) => s.label === 'Event A stated as odds')!.value).toBe(
      'Never — P(A) is 0%',
    )

    const certain = compute({ ...defaults, probA: 100, probB: 100 })
    expect(primary(certain)).toBeCloseTo(100, 10)
    expect(stat(certain, 'P(neither A nor B)')).toBe(0)
    expect(stat(certain, 'P(exactly one of them)')).toBe(0)
    expect(certain.stats!.find((s) => s.label === 'Event A stated as odds')!.value).toBe(
      'Certain — P(A) is 100%',
    )

    // 25% reads as "about 1 in 4".
    const quarter = compute({ ...defaults, probA: 25 })
    expect(quarter.stats!.find((s) => s.label === 'Event A stated as odds')!.value).toBe(
      'about 1 in 4',
    )
  })

  test('fractional trial counts are rounded to whole trials', () => {
    const rounded = compute({ ...defaults, trials: 9.6 })
    const whole = compute({ ...defaults, trials: 10 })
    expect(stat(rounded, 'P(at least one A in 10 trials)')).toBeCloseTo(
      stat(whole, 'P(at least one A in 10 trials)'),
      12,
    )
  })

  test('the worked steps agree with the reported figures', () => {
    const r = compute(defaults)
    const line = (prefix: string) => {
      const found = r.steps!.find(
        (s): s is Quantity => 'label' in s && s.label.startsWith(prefix),
      )
      return String(found!.value)
    }
    expect(line('P(A and B) = P(A) × P(B)')).toBe('30.00% × 20.00% = 6.0000%')
    expect(line('P(A or B) = P(A) + P(B) − P(A and B)')).toBe(
      '30.00% + 20.00% − 6.0000% = 44.0000%',
    )
    expect(line('P(neither) = 1 − P(A or B)')).toBe('100% − 44.0000% = 56.0000%')
    expect(line('P(at least one A) = 1 − P(no A at all)')).toContain('97.1752%')
  })

  test('the first number field nudged to 1.1x its default stays valid and moves the answer', () => {
    const firstNumber = fields.find((f) => f.kind === 'number')!
    expect(firstNumber.id).toBe('probA')

    const nudged = compute({ ...defaults, probA: firstNumber.default * 1.1 })
    expect(primary(compute(defaults))).toBeCloseTo(6, 10)
    // 33% × 20% = 6.6%.
    expect(primary(nudged)).toBeCloseTo(6.6, 8)
    expect(primary(nudged)).not.toBeCloseTo(primary(compute(defaults)), 6)
  })

  const withDefaults = (over: Record<string, string | number>): Input =>
    ({ ...defaults, ...over }) as Input

  test.each([
    ['a non-finite P(A)', withDefaults({ probA: Number.NaN }), 'probA'],
    ['an infinite P(B)', withDefaults({ probB: Number.POSITIVE_INFINITY }), 'probB'],
    ['a non-finite trial count', withDefaults({ trials: Number.NaN }), 'trials'],
    ['a negative P(A)', withDefaults({ probA: -1 }), 'probA'],
    ['a P(A) above 100%', withDefaults({ probA: 101 }), 'probA'],
    ['a negative P(B)', withDefaults({ probB: -0.5 }), 'probB'],
    ['a P(B) above 100%', withDefaults({ probB: 250 }), 'probB'],
    ['zero trials', withDefaults({ trials: 0 }), 'trials'],
    ['more than 100 trials', withDefaults({ trials: 101 }), 'trials'],
    ['an unknown relationship', withDefaults({ relationship: 'correlated' }), 'relationship'],
  ])('rejects %s', (_label, values, fieldId) => {
    let thrown: unknown
    try {
      compute(values)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
  })

  test('never returns NaN anywhere in the result', () => {
    for (const values of [
      defaults,
      { relationship: 'exclusive', probA: 0, probB: 100, trials: 1 },
      { relationship: 'independent', probA: 100, probB: 0, trials: 100 },
      { relationship: 'exclusive', probA: 50, probB: 50, trials: 50 },
    ] as Input[]) {
      const r = compute(values)
      const numbers = [r.primary, ...r.stats!, ...r.parts!]
      for (const q of numbers) {
        if (typeof q.value === 'number') expect(Number.isFinite(q.value)).toBe(true)
        else expect(q.value).not.toContain('NaN')
      }
      for (const s of r.steps!) {
        if ('rule' in s) continue
        expect(String(s.value)).not.toContain('NaN')
      }
    }
  })
})

import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { CalcError } from '../../../lib/types'
import { resolveBand } from '../../../lib/view'

const base = { age: 30, restingHeartRate: 60 } as const

/** Pulls the numeric bounds back out of a "138–151 bpm" stat row. */
function zoneRange(result: ReturnType<typeof compute>, index: number): [number, number] {
  const stat = result.stats![index]!
  const match = /^(\d+)–(\d+) bpm$/.exec(String(stat.value))
  expect(match, `zone ${index} stat was "${String(stat.value)}"`).not.toBeNull()
  return [Number(match![1]), Number(match![2])]
}

describe('heart rate zones', () => {
  const step = (r: ReturnType<typeof compute>, prefix: string) => {
    const match = r.steps!.filter((s) => 'label' in s).find((s) => s.label.startsWith(prefix))
    expect(match, `no step labelled "${prefix}"`).toBeDefined()
    return Number(match!.value)
  }

  test('a 30-year-old with a resting pulse of 60 has a max of 190 and a reserve of 130', () => {
    const r = compute(base)
    expect(Number(r.primary.value)).toBe(220 - 30)
    expect(step(r, 'Heart rate reserve')).toBe(190 - 60)
    expect(step(r, 'Resting heart rate')).toBe(60)
  })

  test('the five zones tile the reserve from 50% to 100% with no gaps', () => {
    const r = compute(base)
    expect(r.stats).toHaveLength(5)

    const ranges = [0, 1, 2, 3, 4].map((i) => zoneRange(r, i))
    // Contiguous: each zone's top is the next zone's floor.
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i]![0]).toBe(ranges[i - 1]![1])
    }
    // The top of zone 5 is 100% of reserve, i.e. the maximum heart rate itself.
    expect(ranges[4]![1]).toBe(Number(r.primary.value))
  })

  test('zone 2 for a 30-year-old at 60 bpm resting is 138 to 151 bpm', () => {
    // Derived, not memorised: max 190, resting 60, reserve 130.
    // 60 + 130 x 0.60 = 138 ; 60 + 130 x 0.70 = 151.
    const maxHr = 220 - base.age
    const reserve = maxHr - base.restingHeartRate
    expect(zoneRange(compute(base), 1)).toEqual([
      Math.round(base.restingHeartRate + reserve * 0.6),
      Math.round(base.restingHeartRate + reserve * 0.7),
    ])
    expect(zoneRange(compute(base), 1)).toEqual([138, 151])
  })

  test('every bound matches a weighted average of resting and max — a second route to Karvonen', () => {
    // target = resting + (max − resting) x i  is algebraically identical to
    // target = resting x (1 − i) + max x i. Computing it the second way, and
    // again by stepping a running total 1% of the reserve at a time, catches a
    // formula that merely re-states itself.
    for (const age of [22, 30, 45, 68]) {
      for (const restingHeartRate of [42, 60, 78]) {
        const r = compute({ age, restingHeartRate })
        const maxHr = 220 - age

        let running = restingHeartRate
        const steps: number[] = [restingHeartRate]
        for (let i = 0; i < 100; i++) {
          running += (maxHr - restingHeartRate) / 100
          steps.push(running)
        }

        const intensities = [50, 60, 70, 80, 90, 100]
        const expected = intensities.map((p) =>
          Math.round((restingHeartRate * (100 - p) + maxHr * p) / 100),
        )
        // The accumulated route drifts by float epsilon, so it is checked
        // against the unrounded target rather than the rounded one.
        for (const p of intensities) {
          expect(steps[p]!).toBeCloseTo((restingHeartRate * (100 - p) + maxHr * p) / 100, 9)
        }

        const actual = [
          zoneRange(r, 0)[0],
          zoneRange(r, 1)[0],
          zoneRange(r, 2)[0],
          zoneRange(r, 3)[0],
          zoneRange(r, 4)[0],
          zoneRange(r, 4)[1],
        ]
        expect(actual).toEqual(expected)
      }
    }
  })

  test('a fitter resting pulse lowers every zone bound while the max is unchanged', () => {
    const fit = compute({ age: 30, restingHeartRate: 45 })
    const unfit = compute({ age: 30, restingHeartRate: 75 })
    expect(Number(fit.primary.value)).toBe(Number(unfit.primary.value))
    for (let i = 0; i < 5; i++) {
      expect(zoneRange(fit, i)[0]).toBeLessThan(zoneRange(unfit, i)[0])
      // Every top except the last, which is 100% of reserve and therefore the
      // maximum heart rate itself — identical for two people of the same age.
      if (i < 4) expect(zoneRange(fit, i)[1]).toBeLessThan(zoneRange(unfit, i)[1])
    }
    expect(zoneRange(fit, 4)[1]).toBe(zoneRange(unfit, 4)[1])
  })

  test('the end-to-end nudge of age to 1.1x stays valid and moves the primary', () => {
    // Mirrors tests/calculators.spec.ts: default x 1.1, then fixed to 4 places.
    const bumped = Number((base.age * 1.1).toFixed(4))
    expect(bumped).toBe(33)
    const nudged = compute({ ...base, age: bumped })
    expect(Number(nudged.primary.value)).toBe(220 - 33)
    expect(Number(nudged.primary.value)).not.toBe(Number(compute(base).primary.value))
  })

  test('scaleValue is the resting heart rate and lands in the expected band', () => {
    expect(compute(base).scaleValue).toBe(60)
    expect(resolveBand(def.scale, compute(base).scaleValue!)!.id).toBe('good')
    expect(resolveBand(def.scale, compute({ ...base, restingHeartRate: 48 }).scaleValue!)!.id).toBe(
      'excellent',
    )
    expect(resolveBand(def.scale, compute({ ...base, restingHeartRate: 90 }).scaleValue!)!.id).toBe(
      'critical',
    )
  })

  test.each([
    ['zero age', { age: 0 }, 'age'],
    ['negative age', { age: -5 }, 'age'],
    ['an age of 120 or more, where the max would collapse', { age: 130 }, 'age'],
    ['zero resting heart rate', { restingHeartRate: 0 }, 'restingHeartRate'],
    ['a resting pulse at or above the estimated max', { restingHeartRate: 190 }, 'restingHeartRate'],
  ])('rejects %s', (_label, patch, fieldId) => {
    let thrown: unknown
    try {
      compute({ ...base, ...patch })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe(fieldId)
  })

  test('never returns NaN for any in-range input pair', () => {
    for (let age = 10; age <= 100; age++) {
      for (let rhr = 25; rhr <= 120; rhr++) {
        if (rhr >= 220 - age) continue
        const r = compute({ age, restingHeartRate: rhr })
        expect(Number.isFinite(Number(r.primary.value))).toBe(true)
        for (const s of r.stats!) expect(String(s.value)).toMatch(/^\d+–\d+ bpm$/)
      }
    }
  })
})

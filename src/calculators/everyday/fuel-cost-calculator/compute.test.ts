import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'
import { resolveBand } from '../../../lib/view'

const base = {
  distance: 100,
  distanceUnit: 'km',
  efficiency: 8,
  efficiencyUnit: 'l100km',
  fuelPrice: 1.8,
  priceUnit: 'perLitre',
} as const

const stat = (r: ReturnType<typeof compute>, label: string) =>
  Number(r.stats!.find((s) => s.label === label)!.value)

/** Derived independently of compute.ts: 1 US gal = 231 in³, 1 in = 2.54 cm exactly. */
const LITRES_PER_US_GALLON = (231 * 2.54 ** 3) / 1000
const KM_PER_MILE = 1.609344

describe('fuel cost', () => {
  test('100 km at 8 L/100km and 1.80/L burns 8 L and costs 14.40', () => {
    // 100 km / 100 = 1 "hundred-km unit" x 8 L = 8 L; 8 x 1.80 = 14.40.
    const r = compute(base)
    expect(stat(r, 'Fuel used')).toBeCloseTo(8, 10)
    expect(Number(r.primary.value)).toBeCloseTo(14.4, 10)
    expect(stat(r, 'Round-trip cost')).toBeCloseTo(28.8, 10)
    expect(stat(r, 'Cost per km')).toBeCloseTo(0.144, 10)
  })

  test('the three efficiency units describe the same car and cost the same', () => {
    // 8 L/100km == 12.5 km/L == 235.2145833 mpg-per-unit / 8 mpg.
    // The mpg constant is rebuilt here from first principles rather than copied.
    const mpgConstant = (100 / KM_PER_MILE) * LITRES_PER_US_GALLON // 235.2145833...
    expect(mpgConstant).toBeCloseTo(235.2145833, 6)

    const viaL100 = compute(base)
    const viaKmpl = compute({ ...base, efficiency: 100 / 8, efficiencyUnit: 'kmpl' })
    const viaMpg = compute({ ...base, efficiency: mpgConstant / 8, efficiencyUnit: 'mpg' })

    expect(Number(viaKmpl.primary.value)).toBeCloseTo(Number(viaL100.primary.value), 10)
    expect(Number(viaMpg.primary.value)).toBeCloseTo(Number(viaL100.primary.value), 10)
    // And the reported equivalents agree with the same conversions.
    expect(stat(viaL100, 'Metric economy')).toBeCloseTo(12.5, 10)
    expect(stat(viaL100, 'US economy')).toBeCloseTo(mpgConstant / 8, 8)
  })

  test('mpg path matches a segment-by-segment simulation in native US units', () => {
    // Independent method: walk the trip in 1-mile segments, accumulating gallons,
    // then convert gallons to litres and multiply by the per-litre price.
    const miles = 250
    const mpg = 32
    const price = 1.65
    let gallons = 0
    for (let i = 0; i < miles; i++) gallons += 1 / mpg
    const expected = gallons * LITRES_PER_US_GALLON * price

    const r = compute({
      distance: miles,
      distanceUnit: 'mi',
      efficiency: mpg,
      efficiencyUnit: 'mpg',
      fuelPrice: price,
      priceUnit: 'perLitre',
    })
    expect(Number(r.primary.value)).toBeCloseTo(expected, 9)
    expect(r.notes).toHaveLength(1) // the US-vs-imperial gallon caveat
  })

  test('100 miles is the same trip as 160.9344 km', () => {
    const inMiles = compute({ ...base, distance: 100, distanceUnit: 'mi' })
    const inKm = compute({ ...base, distance: 100 * KM_PER_MILE, distanceUnit: 'km' })
    expect(Number(inMiles.primary.value)).toBeCloseTo(Number(inKm.primary.value), 10)
    // Per-unit cost is quoted in the unit entered, so it must differ by exactly
    // the mile-to-km factor even though the trip cost is identical.
    expect(stat(inMiles, 'Cost per mile')).toBeCloseTo(stat(inKm, 'Cost per km') * KM_PER_MILE, 10)
  })

  test('free fuel costs nothing but still burns litres', () => {
    const r = compute({ ...base, fuelPrice: 0 })
    expect(Number(r.primary.value)).toBe(0)
    expect(stat(r, 'Fuel used')).toBeCloseTo(8, 10)
  })

  test('scaleValue is consumption in L/100 km, whatever unit was entered', () => {
    expect(compute(base).scaleValue).toBeCloseTo(8, 10)
    expect(compute({ ...base, efficiency: 25, efficiencyUnit: 'kmpl' }).scaleValue).toBeCloseTo(4, 10)
    expect(resolveBand(def.scale, compute(base).scaleValue!)!.id).toBe('neutral')
    expect(
      resolveBand(def.scale, compute({ ...base, efficiency: 25, efficiencyUnit: 'kmpl' }).scaleValue!)!.id,
    ).toBe('excellent')
    expect(resolveBand(def.scale, compute({ ...base, efficiency: 14 }).scaleValue!)!.id).toBe('critical')
  })

  test('band boundaries are contiguous and ordered', () => {
    const bands = def.scale.bands
    for (let i = 1; i < bands.length; i++) expect(bands[i].from).toBe(bands[i - 1].to)
  })

  test('nudging the first number field stays valid and moves the result', () => {
    const first = fields.find((f) => f.kind === 'number')!
    expect(first.id).toBe('distance')
    const nudged = { ...base, distance: first.default * 1.1 }
    expect(Number(compute(nudged).primary.value)).toBeCloseTo(Number(compute(base).primary.value) * 1.1, 10)
    expect(Number(compute(nudged).primary.value)).not.toBe(Number(compute(base).primary.value))
  })

  test.each([
    ['zero distance', { distance: 0 }, 'distance'],
    ['negative distance', { distance: -10 }, 'distance'],
    ['zero efficiency', { efficiency: 0 }, 'efficiency'],
    ['non-numeric efficiency', { efficiency: Number.NaN }, 'efficiency'],
    ['negative fuel price', { fuelPrice: -1 }, 'fuelPrice'],
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
})

describe('fuel price unit', () => {
  test('the same pump price costs the same however it is quoted', () => {
    // $1.80/L is exactly $6.8137…/US gal — the same fuel at the same price, so
    // the trip must cost the same. This is the invariant the feature exists for.
    const perLitre = compute(base)
    const perGallon = compute({
      ...base,
      priceUnit: 'perGallon',
      fuelPrice: 1.8 * LITRES_PER_US_GALLON,
    })
    expect(Number(perGallon.primary.value)).toBeCloseTo(Number(perLitre.primary.value), 9)
  })

  test('a US pump price is no longer divided by hand', () => {
    // $3.899/gal at 100 km and 8 L/100 km: 8 × 3.899 ÷ 3.785411784 = $8.2401.
    const r = compute({ ...base, priceUnit: 'perGallon', fuelPrice: 3.899 })
    expect(Number(r.primary.value)).toBeCloseTo((8 * 3.899) / LITRES_PER_US_GALLON, 9)
    expect(Number(r.primary.value)).toBeCloseTo(8.2401, 3)
  })

  test('entering a gallon price as if it were per litre is 3.8x too expensive', () => {
    // Guards against the regression: treating the number as per-litre again.
    const asGallon = compute({ ...base, priceUnit: 'perGallon', fuelPrice: 6.81 })
    const asLitre = compute({ ...base, priceUnit: 'perLitre', fuelPrice: 6.81 })
    expect(Number(asLitre.primary.value) / Number(asGallon.primary.value)).toBeCloseTo(
      LITRES_PER_US_GALLON,
      9,
    )
  })

  test('the working shows the converted per-litre price only when it differs', () => {
    const labels = (v: Parameters<typeof compute>[0]) =>
      compute(v)
        .steps!.filter((s) => !('rule' in s))
        .map((s) => (s as { label: string }).label)

    expect(labels(base)).toContain('Price entered (per litre)')
    expect(labels(base)).not.toContain('Price per litre')

    const gallon = labels({ ...base, priceUnit: 'perGallon' })
    expect(gallon).toContain('Price entered (per US gallon)')
    expect(gallon).toContain('Price per litre')
  })

  test('rejects an unknown price unit against the offending field', () => {
    let thrown: unknown
    try {
      compute({ ...base, priceUnit: 'perBarrel' })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe('priceUnit')
  })

  test('the price field declares a variant per unit, and they scale by a gallon', () => {
    const price = fields.find((f) => f.id === 'fuelPrice')!
    expect(price.kind).toBe('number')
    const cases = (price as { variants: { cases: Record<string, { factor?: number }> } }).variants
      .cases
    expect(cases.perLitre!.factor).toBeUndefined() // base
    expect(cases.perGallon!.factor).toBeCloseTo(LITRES_PER_US_GALLON, 9)
  })
})

describe('imperial gallons', () => {
  /** Exact by definition since 1985. Derived here, not imported from compute. */
  const LITRES_PER_IMPERIAL_GALLON = 4.54609

  test('an imperial gallon is exactly 4.54609 L, ~20% more than a US one', () => {
    expect(LITRES_PER_IMPERIAL_GALLON / LITRES_PER_US_GALLON).toBeCloseTo(1.2009, 4)
  })

  test('all four efficiency units describe the same car and cost the same', () => {
    const impConstant = (100 / KM_PER_MILE) * LITRES_PER_IMPERIAL_GALLON // 282.4809...
    const usConstant = (100 / KM_PER_MILE) * LITRES_PER_US_GALLON
    expect(impConstant).toBeCloseTo(282.4809363, 6)

    const viaL100 = compute(base)
    const viaKmpl = compute({ ...base, efficiency: 100 / 8, efficiencyUnit: 'kmpl' })
    const viaMpg = compute({ ...base, efficiency: usConstant / 8, efficiencyUnit: 'mpg' })
    const viaMpgImp = compute({ ...base, efficiency: impConstant / 8, efficiencyUnit: 'mpgImp' })

    for (const r of [viaKmpl, viaMpg, viaMpgImp]) {
      expect(Number(r.primary.value)).toBeCloseTo(Number(viaL100.primary.value), 9)
    }
  })

  test('the same figure read as imperial mpg is the thirstier car', () => {
    // "35 mpg" imperial covers 35 miles on a 4.546 L gallon, i.e. 0.130 L per
    // mile, against 3.785/35 = 0.108 for US. So the imperial reading of the
    // same number burns more fuel and must cost MORE — which is exactly why a
    // UK figure looks ~20% better than a US one for the same car.
    const asUs = compute({ ...base, efficiency: 35, efficiencyUnit: 'mpg' })
    const asImp = compute({ ...base, efficiency: 35, efficiencyUnit: 'mpgImp' })
    expect(Number(asImp.primary.value)).toBeGreaterThan(Number(asUs.primary.value))
    expect(Number(asImp.primary.value) / Number(asUs.primary.value)).toBeCloseTo(
      LITRES_PER_IMPERIAL_GALLON / LITRES_PER_US_GALLON,
      9,
    )
  })

  test('mpg equivalents are reported on both scales and differ by a gallon', () => {
    const r = compute(base)
    expect(stat(r, 'US economy')).toBeCloseTo(29.4018, 3)
    expect(stat(r, 'Imperial economy')).toBeCloseTo(35.3101, 3)
    expect(stat(r, 'Imperial economy') / stat(r, 'US economy')).toBeCloseTo(
      LITRES_PER_IMPERIAL_GALLON / LITRES_PER_US_GALLON,
      9,
    )
  })

  test('every stat label is unique, so none is identified only by its unit', () => {
    const labels = compute(base).stats!.map((s) => s.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  test('an imperial pump price costs the same as its per-litre equivalent', () => {
    const perLitre = compute(base)
    const perImp = compute({
      ...base,
      priceUnit: 'perImperialGallon',
      fuelPrice: 1.8 * LITRES_PER_IMPERIAL_GALLON,
    })
    expect(Number(perImp.primary.value)).toBeCloseTo(Number(perLitre.primary.value), 9)
  })

  test('the two gallon prices are not interchangeable', () => {
    // £6.50/gal means different money depending on which gallon it is.
    const us = compute({ ...base, priceUnit: 'perGallon', fuelPrice: 6.5 })
    const imp = compute({ ...base, priceUnit: 'perImperialGallon', fuelPrice: 6.5 })
    expect(Number(us.primary.value)).toBeGreaterThan(Number(imp.primary.value))
    expect(Number(us.primary.value) / Number(imp.primary.value)).toBeCloseTo(
      LITRES_PER_IMPERIAL_GALLON / LITRES_PER_US_GALLON,
      9,
    )
  })

  test('the note names whichever gallon is actually in play', () => {
    expect(compute({ ...base, efficiencyUnit: 'mpg', efficiency: 30 }).notes![0]).toContain('US mpg')
    expect(compute({ ...base, efficiencyUnit: 'mpgImp', efficiency: 36 }).notes![0]).toContain(
      'imperial mpg',
    )
    expect(compute(base).notes).toHaveLength(0)
  })
})

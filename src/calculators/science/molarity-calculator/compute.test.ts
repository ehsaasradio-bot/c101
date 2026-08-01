import { describe, expect, test } from 'vitest'
import compute from './compute'
import def from './index'
import { fields } from './fields'
import { CalcError } from '../../../lib/types'
import type { Field, NumberField, Quantity } from '../../../lib/types'
import { formatValue } from '../../../lib/format'
import { defaultValues, resolveBounds } from '../../../lib/view'

type Input = Parameters<typeof compute>[0]
type Result = ReturnType<typeof compute>

/**
 * Not `as const`: the fixture is spread with numeric overrides throughout, and
 * literal-pinned types would reject `{ mass: 100 }` because the type is the
 * literal 58.44.
 */
const base: Input = {
  mode: 'molarity',
  mass: 58.44,
  molarMass: 58.44,
  volume: 1,
  volumeUnit: 'L',
  molarity: 1,
  targetMolarity: 0.1,
}

const MODES = ['molarity', 'mass', 'volume', 'dilution'] as const

/**
 * `as const satisfies readonly Field[]` keeps every literal, which is what makes
 * a renamed field id a compile error — but it also means the union member for
 * `mass` has no `variants` key at all. Widening to the declared interface is how
 * the shared tooling (`resolveBounds`, the theme) sees these anyway.
 */
const numberFields = (fields as readonly Field[]).filter(
  (f): f is NumberField => f.kind === 'number',
)

const stat = (r: Result, label: string) => r.stats!.find((s) => s.label === label)
const num = (r: Result, label: string) => Number(stat(r, label)!.value)

const thrownBy = (input: Input): unknown => {
  try {
    compute(input)
    return undefined
  } catch (err) {
    return err
  }
}

describe('molarity: the anchor', () => {
  /*
   * Sodium chloride, because it is the one worked example every course uses and
   * the numbers can be checked without a calculator: Na 22.99 + Cl 35.45 gives
   * a molar mass of 58.44 g/mol, so 58.44 g is exactly one mole. None of this is
   * approximate — every assertion below is an exact equality, and a toBeCloseTo
   * here would hide a formula that is merely nearly right.
   */
  test('58.44 g of NaCl in 1 L is exactly 1 mol/L', () => {
    const r = compute(defaultValues(def) as Input)
    expect(r.primary.label).toBe('Molarity')
    expect(r.primary.value).toBe(1)
    expect(formatValue(r.primary.value, r.primary.format)).toBe('1.0000 mol/L')
    expect(num(r, 'Moles of solute')).toBe(1)
    expect(num(r, 'Mass of solute')).toBe(58.44)
    expect(num(r, 'Solution volume')).toBe(1)
  })

  test('the four questions are one consistent system at the defaults', () => {
    // Molarity from the mass: 1 mol/L. Mass for that molarity: back to 58.44 g.
    // Volume for that molarity: back to 1 L. Diluting it to 0.1 M: 10 L.
    expect(compute({ ...base, mode: 'molarity' }).primary.value).toBe(1)
    expect(compute({ ...base, mode: 'mass' }).primary.value).toBe(58.44)
    expect(compute({ ...base, mode: 'volume' }).primary.value).toBe(1)
    expect(compute({ ...base, mode: 'dilution' }).primary.value).toBe(10)
  })

  test('every mode reports the same one mole of solute', () => {
    for (const mode of MODES) {
      expect(num(compute({ ...base, mode }), 'Moles of solute'), mode).toBe(1)
    }
  })

  test('the dilution says how much solvent to add, not just the final volume', () => {
    const r = compute({ ...base, mode: 'dilution' })
    expect(r.primary.label).toBe('Final volume')
    expect(r.primary.value).toBe(10)
    // Ten litres of 0.1 M from one litre of 1 M means adding nine.
    expect(num(r, 'Solvent to add')).toBe(9)
    expect(num(r, 'Dilution factor')).toBe(10)
    expect(num(r, 'Molarity')).toBe(0.1)
  })

  test('the formula actually used is named in the steps', () => {
    const labels = (mode: string) =>
      compute({ ...base, mode })
        .steps!.filter((s) => !('rule' in s))
        .map((s) => (s as { label: string }).label)

    expect(labels('molarity')).toContain('moles = mass ÷ molar mass')
    expect(labels('molarity')).toContain('molarity = moles ÷ volume')
    expect(labels('mass')).toContain('moles = molarity × volume')
    expect(labels('mass')).toContain('mass = molarity × volume × molar mass')
    expect(labels('volume')).toContain('moles = mass ÷ molar mass')
    expect(labels('volume')).toContain('volume = moles ÷ molarity')
    expect(labels('dilution')).toContain('moles of solute = M₁ × V₁')
    expect(labels('dilution')).toContain('V₂ = M₁ × V₁ ÷ M₂')
  })
})

describe('molarity: worked examples derived twice', () => {
  /*
   * Each of these is computed from the formula and then confirmed a second,
   * independent way — by the reciprocal rearrangement, or by counting the moles
   * back out of the answer. A number that agrees with itself proves nothing.
   */
  test('a 500 mL flask of 0.250 M glucose needs 22.52 g', () => {
    // Glucose C₆H₁₂O₆ is 6 × 12.01 + 12 × 1.008 + 6 × 16.00 = 180.156 g/mol.
    // n = 0.250 × 0.500 = 0.125 mol; m = 0.125 × 180.156 = 22.5195 g.
    const r = compute({
      ...base,
      mode: 'mass',
      molarity: 0.25,
      molarMass: 180.156,
      volume: 500,
      volumeUnit: 'mL',
    })
    expect(Number(r.primary.value)).toBeCloseTo(22.5195, 10)
    expect(num(r, 'Moles of solute')).toBeCloseTo(0.125, 12)
    // Round trip: that mass in that volume must give the molarity back.
    const back = compute({
      ...base,
      mode: 'molarity',
      mass: 22.5195,
      molarMass: 180.156,
      volume: 500,
      volumeUnit: 'mL',
    })
    expect(Number(back.primary.value)).toBeCloseTo(0.25, 12)
  })

  test('10.0 g of NaOH at 0.500 M has to be made up to 500 mL', () => {
    // NaOH is 22.99 + 16.00 + 1.008 = 39.998 g/mol, so 10.0 g is 0.250012 mol,
    // and 0.250012 ÷ 0.500 = 0.500025 L — half a litre to three figures.
    const r = compute({ ...base, mode: 'volume', mass: 10, molarMass: 39.998, molarity: 0.5 })
    expect(Number(r.primary.value)).toBeCloseTo(0.5000250013, 9)
    expect(num(r, 'Moles of solute')).toBeCloseTo(10 / 39.998, 12)
    // Confirmed from the other side: that volume at that molarity needs 10 g.
    const back = compute({
      ...base,
      mode: 'mass',
      molarity: 0.5,
      molarMass: 39.998,
      volume: Number(r.primary.value),
    })
    expect(Number(back.primary.value)).toBeCloseTo(10, 10)
  })

  test('diluting 25 mL of 2.00 M stock to 0.150 M gives 333.3 mL', () => {
    // V₂ = M₁V₁/M₂ = 2.00 × 25 ÷ 0.150 = 333.33 mL, so 308.33 mL of solvent.
    const r = compute({
      ...base,
      mode: 'dilution',
      molarity: 2,
      volume: 25,
      volumeUnit: 'mL',
      targetMolarity: 0.15,
    })
    expect(Number(r.primary.value)).toBeCloseTo(333.3333333333, 8)
    expect(num(r, 'Solvent to add')).toBeCloseTo(308.3333333333, 8)
    // The moles of solute are untouched by the dilution — that is why the law
    // works — so 0.150 M in 333.33 mL is the same 0.0500 mol as 2.00 M in 25 mL.
    expect(num(r, 'Moles of solute')).toBeCloseTo(0.05, 12)
    expect(num(r, 'Moles of solute')).toBeCloseTo(0.15 * (333.3333333333 / 1000), 10)
  })

  test('M₁V₁ = M₂V₂ holds across a sweep, in both volume units', () => {
    for (const stockMolarity of [0.001, 0.05, 1, 2.5, 100]) {
      for (const stockVolume of [0.001, 0.25, 1, 1000]) {
        for (const target of [0.001, 0.1, 0.5, 100]) {
          const r = compute({
            ...base,
            mode: 'dilution',
            molarity: stockMolarity,
            volume: stockVolume,
            targetMolarity: target,
          })
          const finalVolume = Number(r.primary.value)
          expect(stockMolarity * stockVolume).toBeCloseTo(target * finalVolume, 9)
          // And in millilitres the same physical dilution must land on the same
          // physical volume, a thousand times the number.
          const inMl = compute({
            ...base,
            mode: 'dilution',
            molarity: stockMolarity,
            volume: stockVolume * 1000,
            volumeUnit: 'mL',
            targetMolarity: target,
          })
          expect(Number(inMl.primary.value) / 1000 / finalVolume).toBeCloseTo(1, 10)
        }
      }
    }
  }, 30_000)

  test('c = n/V is reported consistently everywhere, in every mode', () => {
    for (const mode of MODES) {
      for (const mass of [0.01, 58.44, 100_000]) {
        for (const molarMass of [0.01, 58.44, 100_000]) {
          for (const volume of [0.001, 1, 10_000]) {
            for (const molarity of [0.001, 1, 100]) {
              const r = compute({ ...base, mode, mass, molarMass, volume, molarity })
              const moles = num(r, 'Moles of solute')
              const litres = num(r, 'Solution volume')
              const reported = num(r, 'Molarity')
              expect(reported / (moles / litres), `${mode} ${mass}/${molarMass}/${volume}`).toBeCloseTo(
                1,
                9,
              )
              const mass2 = stat(r, 'Mass of solute')
              if (mass2) expect(Number(mass2.value) / (moles * molarMass)).toBeCloseTo(1, 9)
            }
          }
        }
      }
    }
  }, 30_000)
})

describe('molarity: units', () => {
  test('the same solution reads the same in litres and millilitres', () => {
    const inLitres = compute({ ...base, mode: 'molarity', volume: 0.25, volumeUnit: 'L' })
    const inMillilitres = compute({ ...base, mode: 'molarity', volume: 250, volumeUnit: 'mL' })
    // The molarity is a physical fact and must not depend on the unit picked.
    expect(Number(inMillilitres.primary.value)).toBeCloseTo(Number(inLitres.primary.value), 12)
    expect(Number(inLitres.primary.value)).toBe(4)
    // The volume, though, is reported in whatever unit was selected.
    expect(num(inLitres, 'Solution volume')).toBe(0.25)
    expect(num(inMillilitres, 'Solution volume')).toBe(250)
  })

  test('a solved volume comes back in the selected unit', () => {
    const inLitres = compute({ ...base, mode: 'volume', volumeUnit: 'L' })
    const inMillilitres = compute({ ...base, mode: 'volume', volumeUnit: 'mL' })
    expect(Number(inLitres.primary.value)).toBe(1)
    expect(Number(inMillilitres.primary.value)).toBe(1000)
  })

  test('every declared bound is a value compute accepts, in every variant and mode', () => {
    // The same rule field-bounds.test.ts enforces registry-wide, asserted here
    // so it fails in this directory's own fast loop rather than only in a full
    // run — and so it covers each variant against every mode, not one at a time.
    for (const field of numberFields) {
      const cases = field.variants ? Object.keys(field.variants.cases) : ['']
      for (const caseKey of cases) {
        const state: Input = field.variants
          ? { ...base, [field.variants.on]: caseKey }
          : { ...base }
        const bounds = resolveBounds(field, state as unknown as Record<string, unknown>)
        for (const bound of [bounds.min, bounds.max]) {
          if (bound === undefined) continue
          for (const mode of MODES) {
            const where = `${field.id}[${caseKey || 'base'}]=${bound} in ${mode}`
            expect(thrownBy({ ...state, mode, [field.id]: bound }), where).toBeUndefined()
          }
        }
      }
    }
  })

  test('every number default lands on min + n × step in the base variant', () => {
    // An HTML range snaps to the grid, so an off-grid default silently shifts
    // the moment the slider is touched.
    const onGrid = (min: number | undefined, step: number | undefined, value: number) => {
      if (min === undefined || step === undefined) return true
      const n = (value - min) / step
      return Math.abs(n - Math.round(n)) < 1e-9
    }
    for (const field of numberFields) {
      expect(onGrid(field.min, field.step, field.default), `${field.id} top level`).toBe(true)
      if (!field.variants) continue
      for (const [name, variant] of Object.entries(field.variants.cases)) {
        if ((variant.factor ?? 1) !== 1 || variant.convert) continue
        expect(
          onGrid(variant.min ?? field.min, variant.step ?? field.step, field.default),
          `${field.id}[${name}]`,
        ).toBe(true)
      }
    }
  })

  test('the first variant listed is the base, and variants stay inside the union', () => {
    for (const field of numberFields) {
      if (!field.variants) continue
      const entries = Object.entries(field.variants.cases)
      expect(entries[0]![1].factor ?? 1, `${field.id} base factor`).toBe(1)
      for (const [name, variant] of entries) {
        if (variant.min !== undefined)
          expect(variant.min, `${field.id}[${name}]`).toBeGreaterThanOrEqual(field.min!)
        if (variant.max !== undefined)
          expect(variant.max, `${field.id}[${name}]`).toBeLessThanOrEqual(field.max!)
      }
      expect(field.default).toBeGreaterThanOrEqual(entries[0]![1].min ?? field.min!)
      expect(field.default).toBeLessThanOrEqual(entries[0]![1].max ?? field.max!)
    }
  })
})

describe('molarity: refusals', () => {
  test('zero and negative quantities are refused against their own fields', () => {
    for (const mode of ['molarity', 'volume'] as const) {
      expect((thrownBy({ ...base, mode, mass: 0 }) as CalcError).fieldId).toBe('mass')
      expect((thrownBy({ ...base, mode, mass: -1 }) as CalcError).fieldId).toBe('mass')
    }
    for (const mode of ['molarity', 'mass', 'volume'] as const) {
      expect((thrownBy({ ...base, mode, molarMass: 0 }) as CalcError).fieldId).toBe('molarMass')
      expect((thrownBy({ ...base, mode, molarMass: -58 }) as CalcError).fieldId).toBe('molarMass')
    }
    for (const mode of ['molarity', 'mass', 'dilution'] as const) {
      expect((thrownBy({ ...base, mode, volume: 0 }) as CalcError).fieldId).toBe('volume')
      expect((thrownBy({ ...base, mode, volume: -2 }) as CalcError).fieldId).toBe('volume')
    }
    for (const mode of ['mass', 'volume', 'dilution'] as const) {
      expect((thrownBy({ ...base, mode, molarity: 0 }) as CalcError).fieldId).toBe('molarity')
      expect((thrownBy({ ...base, mode, molarity: -1 }) as CalcError).fieldId).toBe('molarity')
    }
    expect((thrownBy({ ...base, mode: 'dilution', targetMolarity: 0 }) as CalcError).fieldId).toBe(
      'targetMolarity',
    )
    expect((thrownBy({ ...base, mode: 'dilution', targetMolarity: -0.5 }) as CalcError).fieldId).toBe(
      'targetMolarity',
    )
  })

  test('an unknown mode or unit is refused against its own select', () => {
    expect((thrownBy({ ...base, mode: 'normality' }) as CalcError).fieldId).toBe('mode')
    expect((thrownBy({ ...base, volumeUnit: 'gallons' }) as CalcError).fieldId).toBe('volumeUnit')
  })

  /*
   * `coerceValues` in src/lib/view.ts turns an unparseable entry into a raw NaN
   * and hands it straight to compute, and every ordinary comparison against NaN
   * is false — so a magnitude check alone would let it through into the
   * arithmetic. Every field the mode reads must refuse it by name.
   */
  const nonFinite = [
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ] as const

  const readsField: Record<string, ReadonlyArray<(typeof MODES)[number]>> = {
    mass: ['molarity', 'volume'],
    molarMass: ['molarity', 'mass', 'volume'],
    volume: ['molarity', 'mass', 'dilution'],
    molarity: ['mass', 'volume', 'dilution'],
    targetMolarity: ['dilution'],
  }

  test.each(
    Object.entries(readsField).flatMap(([fieldId, modes]) =>
      modes.flatMap((mode) =>
        nonFinite.map(([label, value]) => [fieldId, mode, label, value] as const),
      ),
    ),
  )('rejects %s in mode %s (%s) with a CalcError, never a NaN result', (fieldId, mode, _label, value) => {
    const err = thrownBy({ ...base, mode, [fieldId]: value })
    expect(err, `${fieldId} in ${mode}`).toBeInstanceOf(CalcError)
    expect((err as CalcError).fieldId).toBe(fieldId)
  })

  test('a field the mode does not read is ignored, however bad it is', () => {
    // The default question reads mass, molar mass and volume only. Whatever is
    // left in the molarity and target boxes must not stop it answering.
    const r = compute({ ...base, molarity: Number.NaN, targetMolarity: -999 })
    expect(r.primary.value).toBe(1)
    // And a dilution needs no molar mass at all, so a broken one is irrelevant.
    const d = compute({ ...base, mode: 'dilution', molarMass: Number.NaN, mass: -5 })
    expect(d.primary.value).toBe(10)
    expect(stat(d, 'Mass of solute')).toBeUndefined()
  })
})

describe('molarity: shape', () => {
  test('nudging the first number field 1.1x stays valid and moves the result', () => {
    // The e2e suite does exactly this in the DEFAULT mode, so pin the invariant.
    const firstNumber = fields.find((f) => f.kind === 'number')!
    expect(firstNumber.id).toBe('mass')

    const defaults = defaultValues(def) as Input
    expect(defaults.mode).toBe('molarity')
    const before = compute(defaults)
    // 58.44 × 1.1 = 64.284, which is what the Playwright suite types in.
    const after = compute({ ...defaults, mass: 64.284 })

    expect(Number(after.primary.value)).not.toBe(Number(before.primary.value))
    expect(Number(after.primary.value)).toBeCloseTo(1.1, 12)
    expect(formatValue(after.primary.value, after.primary.format)).toBe('1.1000 mol/L')
  })

  test('the curve is drawn in every mode, ordered, finite, and through the answer', () => {
    for (const mode of MODES) {
      const r = compute({ ...base, mode })
      expect(r.series, mode).toHaveLength(1)
      const points = r.series![0]!.points
      expect(points.length, mode).toBeGreaterThan(1)
      points.forEach((point, i) => {
        expect(Number.isFinite(point[0]), `${mode} x${i}`).toBe(true)
        expect(Number.isFinite(point[1]), `${mode} y${i}`).toBe(true)
        expect(point[0], `${mode} x${i}`).toBeGreaterThan(0)
        expect(point[1], `${mode} y${i}`).toBeGreaterThan(0)
        // Strictly increasing x, or the chart path doubles back on itself.
        if (i > 0) expect(point[0], `${mode} x${i}`).toBeGreaterThan(points[i - 1]![0])
      })

      // The amount of solute is fixed along the curve: molarity × volume is the
      // same at every point, and equal to the moles the result reports.
      const moles = num(r, 'Moles of solute')
      for (const [x, y] of points) expect((x * y) / moles, mode).toBeCloseTo(1, 9)

      // And it passes exactly through the reported point, not merely near it.
      const volume = num(r, 'Solution volume')
      const molarity = num(r, 'Molarity')
      expect(points.some(([x, y]) => x === volume && y === molarity), mode).toBe(true)
    }
  })

  test('the curve is present at the DEFAULTS, so the chart is server-rendered', () => {
    // A series that appeared only off-default would never get a container to
    // redraw into — registry.test.ts enforces this registry-wide.
    const r = compute(defaultValues(def) as Input)
    expect(r.series?.length).toBe(1)
    expect(r.series![0]!.points.length).toBeGreaterThan(1)
  })

  test('there are no parts and no scale, because there is no proportion to draw', () => {
    for (const mode of MODES) {
      for (const mass of [0.01, 58.44, 100_000]) {
        const r = compute({ ...base, mode, mass })
        expect(r.parts).toBeUndefined()
        expect(r.scaleValue).toBeUndefined()
      }
    }
    expect('scale' in def).toBe(false)
  })

  test('the headline is whatever the mode was asked for', () => {
    const primaryLabel = (mode: string) => compute({ ...base, mode }).primary.label
    expect(primaryLabel('molarity')).toBe('Molarity')
    expect(primaryLabel('mass')).toBe('Mass to weigh out')
    expect(primaryLabel('volume')).toBe('Volume to make up to')
    expect(primaryLabel('dilution')).toBe('Final volume')
    // The server renders `resultLabel` before the island attaches, so it has to
    // match what the default mode produces or the page changes on hydration.
    expect(def.resultLabel).toBe(primaryLabel('molarity'))
  })

  test('a target above the stock strength is answered, not refused, and flagged', () => {
    // Concentrating is a real question with a real answer — the volume that
    // amount of solute would occupy at the target — but it is not something you
    // can reach by adding solvent, so no "solvent to add" line is offered.
    const r = compute({ ...base, mode: 'dilution', molarity: 1, targetMolarity: 2 })
    expect(Number(r.primary.value)).toBe(0.5)
    expect(stat(r, 'Solvent to add')).toBeUndefined()
    expect(r.notes!.some((n) => n.includes('not a dilution'))).toBe(true)
  })

  test('nothing anywhere in the reachable space formats as NaN', () => {
    for (const mode of MODES) {
      for (const mass of [0.01, 58.44, 100_000]) {
        for (const molarMass of [0.01, 58.44, 100_000]) {
          for (const volume of [0.001, 1, 10_000]) {
            for (const molarity of [0.001, 1, 100]) {
              for (const targetMolarity of [0.001, 0.1, 100]) {
                let r: Result
                try {
                  r = compute({ ...base, mode, mass, molarMass, volume, molarity, targetMolarity })
                } catch (err) {
                  // A refusal is a refusal, not a broken answer.
                  expect(err).toBeInstanceOf(CalcError)
                  expect((err as CalcError).fieldId).toBeDefined()
                  continue
                }
                const shown: Quantity[] = [
                  r.primary,
                  ...r.stats!,
                  ...r.steps!.filter((s): s is Quantity => !('rule' in s)),
                ]
                for (const q of shown) {
                  const s = formatValue(q.value, q.format)
                  const where = `${mode} ${mass}/${molarMass}/${volume}/${molarity}`
                  expect(s, where).not.toContain('NaN')
                  expect(s, where).not.toContain('Infinity')
                  expect(s, where).not.toBe('')
                }
              }
            }
          }
        }
      }
    }
  }, 30_000)

  test('the copy fits a search result', () => {
    expect(def.description.length).toBeGreaterThan(50)
    expect(def.description.length).toBeLessThanOrEqual(160)
    expect(def.seoTitle.length).toBeLessThanOrEqual(70)
    expect(def.intro.length).toBeGreaterThan(40)
    expect(def.faqs.length).toBeGreaterThanOrEqual(3)
    for (const faq of def.faqs) {
      expect(faq.q.endsWith('?')).toBe(true)
      expect(faq.a.length).toBeGreaterThan(40)
    }
    expect(new Set(def.related).size).toBe(def.related.length)
    expect(def.related).not.toContain(def.slug)
  })
})

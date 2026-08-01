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
 * literal-pinned types would reject `{ angle: 45 }` because the type is the
 * literal 30.
 */
const base: Input = {
  mode: 'ratios',
  angleUnit: 'degrees',
  angle: 30,
  ratio: 0.5,
}

const MODES = ['ratios', 'arcsin', 'arccos', 'arctan'] as const
const UNITS = ['degrees', 'radians', 'gradians'] as const

/**
 * `as const satisfies readonly Field[]` keeps every literal, which is what makes
 * a renamed field id a compile error — but it also means the union member for a
 * field has no `variants` key at all. Widening to the declared interface is how
 * the shared tooling (`resolveBounds`, the theme) sees these anyway.
 */
const numberFields = (fields as readonly Field[]).filter(
  (f): f is NumberField => f.kind === 'number',
)

const raw = (r: Result, label: string) => r.stats!.find((s) => s.label === label)!.value
const num = (r: Result, label: string) => Number(raw(r, label))
const text = (r: Result, label: string) => String(raw(r, label))

/** All six ratios, with a pole reported as `null` rather than as a number. */
const six = (r: Result) => {
  const of = (label: string) => {
    const q = r.stats!.find((s) => s.label === label)!
    return q.format.style === 'raw' ? null : Number(q.value)
  }
  return {
    sin: of('sin θ'),
    cos: of('cos θ'),
    tan: of('tan θ'),
    csc: of('csc θ'),
    sec: of('sec θ'),
    cot: of('cot θ'),
  }
}

const step = (r: Result, label: string) =>
  r.steps!.find((s) => !('rule' in s) && s.label === label) as Quantity

const thrownBy = (input: Input): unknown => {
  try {
    compute(input)
    return undefined
  } catch (err) {
    return err
  }
}

/*
 * The independent second opinion. `Math.sin` is a library primitive, so checking
 * it against itself proves nothing about whether this file uses it correctly.
 * These are the Maclaurin series — sin x = x − x³/3! + x⁵/5! − …, cos x = 1 −
 * x²/2! + x⁴/4! − … — summed term by term, which shares no code at all with the
 * implementation and converges to full double precision for |x| ≤ π.
 */
function sinSeries(x: number): number {
  let term = x
  let sum = x
  for (let n = 1; n < 40; n += 1) {
    term *= (-x * x) / (2 * n * (2 * n + 1))
    sum += term
  }
  return sum
}

function cosSeries(x: number): number {
  let term = 1
  let sum = 1
  for (let n = 1; n < 40; n += 1) {
    term *= (-x * x) / ((2 * n - 1) * (2 * n))
    sum += term
  }
  return sum
}

const RAD = Math.PI / 180

describe('trigonometry: the anchors', () => {
  /*
   * The exact values every trig table opens with, written as closed forms rather
   * than as decimals so nothing here is a number that was copied from the code
   * it is meant to check. sin 30° = 1/2 is exact in binary, so it is asserted
   * with strict equality — `Math.sin(Math.PI / 6)` is 0.49999999999999994, and a
   * toBeCloseTo would hide the snapping that fixes it.
   */
  test('sin 30° is exactly 0.5, and the rest of the 30-60-90 triangle follows', () => {
    const r = compute(base)
    expect(num(r, 'sin θ')).toBe(0.5)
    expect(num(r, 'cos θ')).toBeCloseTo(Math.sqrt(3) / 2, 15)
    expect(num(r, 'tan θ')).toBeCloseTo(1 / Math.sqrt(3), 15)
    // csc 30° = 1 / (1/2) = 2, exact.
    expect(num(r, 'csc θ')).toBe(2)
    expect(num(r, 'sec θ')).toBeCloseTo(2 / Math.sqrt(3), 15)
    expect(num(r, 'cot θ')).toBeCloseTo(Math.sqrt(3), 15)
  })

  test('the headline at the defaults is sin θ = 0.500000', () => {
    const r = compute(defaultValues(def) as Input)
    expect(r.primary.label).toBe('sin θ')
    expect(r.primary.value).toBe(0.5)
    expect(formatValue(r.primary.value, r.primary.format)).toBe('0.500000')
  })

  test('the special angles match their closed forms exactly', () => {
    const half = Math.sqrt(2) / 2
    const cases: ReadonlyArray<readonly [number, number, number]> = [
      // [degrees, sin, cos]
      [0, 0, 1],
      [30, 0.5, Math.sqrt(3) / 2],
      [45, half, half],
      [60, Math.sqrt(3) / 2, 0.5],
      [90, 1, 0],
      [120, Math.sqrt(3) / 2, -0.5],
      [135, half, -half],
      [150, 0.5, -Math.sqrt(3) / 2],
      [180, 0, -1],
      [210, -0.5, -Math.sqrt(3) / 2],
      [225, -half, -half],
      [270, -1, 0],
      [300, -Math.sqrt(3) / 2, 0.5],
      [315, -half, half],
      [330, -0.5, Math.sqrt(3) / 2],
      [360, 0, 1],
    ]
    for (const [deg, sin, cos] of cases) {
      const r = six(compute({ ...base, angle: deg }))
      expect(r.sin, `sin ${deg}`).toBeCloseTo(sin, 15)
      expect(r.cos, `cos ${deg}`).toBeCloseTo(cos, 15)
      // The quadrantal angles are the whole reason for the snapping: an
      // unsnapped sin 180° is 1.2e-16, which is not zero and whose reciprocal
      // is 8.2e15 rather than a pole.
      if (sin === 0) expect(r.sin, `sin ${deg} is exactly zero`).toBe(0)
      if (cos === 0) expect(r.cos, `cos ${deg} is exactly zero`).toBe(0)
    }
  })

  test('tan 45° is exactly 1, not 0.9999999999999999', () => {
    const r = six(compute({ ...base, angle: 45 }))
    expect(r.tan).toBe(1)
    expect(r.cot).toBe(1)
  })

  test('the defaults are one consistent fact: sin 30° = 0.5 and arcsin 0.5 = 30°', () => {
    // Both boxes describe the same point on the unit circle, so switching to
    // the inverse mode returns exactly the angle the default mode started from.
    const forward = compute(base)
    const back = compute({ ...base, mode: 'arcsin' })
    expect(Number(forward.primary.value)).toBe(0.5)
    expect(Number(back.primary.value)).toBe(30)
    expect(back.primary.label).toBe('Angle (arcsin)')
    expect(formatValue(back.primary.value, back.primary.format)).toBe('30.0000 °')
  })
})

describe('trigonometry: the independent check', () => {
  test('sine and cosine agree with their Maclaurin series across a half turn', () => {
    // Written out term by term from the definition, sharing no code with the
    // implementation. Converges to full double precision for |x| <= π.
    for (let deg = -180; deg <= 180; deg += 1) {
      const r = six(compute({ ...base, angle: deg }))
      expect(r.sin!, `sin ${deg}`).toBeCloseTo(sinSeries(deg * RAD), 12)
      expect(r.cos!, `cos ${deg}`).toBeCloseTo(cosSeries(deg * RAD), 12)
    }
  }, 30_000)

  test('the Pythagorean identity holds everywhere it is reachable', () => {
    // sin²θ + cos²θ = 1 is the circle itself. Anything that broke the pair
    // apart — a wrong unit factor, a stray snap — would show up here.
    for (const unit of UNITS) {
      for (let i = -40; i <= 40; i += 1) {
        const angle = i * (unit === 'radians' ? 0.15 : unit === 'gradians' ? 10 : 9)
        const r = six(compute({ ...base, angleUnit: unit, angle }))
        expect(r.sin! ** 2 + r.cos! ** 2, `${angle} ${unit}`).toBeCloseTo(1, 12)
      }
    }
  }, 30_000)

  test('the reciprocal and quotient identities hold wherever both sides exist', () => {
    for (let deg = -360; deg <= 360; deg += 3) {
      const r = six(compute({ ...base, angle: deg }))
      if (r.tan !== null) {
        expect(r.tan, `tan ${deg}`).toBeCloseTo(r.sin! / r.cos!, 9)
        expect(r.sec! * r.cos!, `sec ${deg}`).toBeCloseTo(1, 12)
      }
      if (r.csc !== null) {
        expect(r.csc! * r.sin!, `csc ${deg}`).toBeCloseTo(1, 12)
        expect(r.cot!, `cot ${deg}`).toBeCloseTo(r.cos! / r.sin!, 9)
      }
      // tan and cot are reciprocals only where neither has a pole.
      if (r.tan !== null && r.cot !== null && r.tan !== 0) {
        expect(r.tan * r.cot, `tan·cot ${deg}`).toBeCloseTo(1, 9)
      }
    }
  }, 30_000)

  test('the co-function identity relates sine to cosine', () => {
    // sin θ = cos(90° − θ), which is a different route to the same numbers than
    // either Math.sin or the series above.
    for (let deg = -180; deg <= 180; deg += 7) {
      const direct = six(compute({ ...base, angle: deg })).sin!
      const complement = six(compute({ ...base, angle: 90 - deg })).cos!
      expect(direct, `${deg}`).toBeCloseTo(complement, 12)
    }
  })
})

describe('trigonometry: units', () => {
  test('the same angle in all three units gives the same six ratios', () => {
    // 30° = π/6 rad = 33.333… grad.
    const inDegrees = six(compute({ ...base, angleUnit: 'degrees', angle: 30 }))
    const inRadians = six(compute({ ...base, angleUnit: 'radians', angle: Math.PI / 6 }))
    const inGradians = six(compute({ ...base, angleUnit: 'gradians', angle: 100 / 3 }))

    for (const key of ['sin', 'cos', 'tan', 'csc', 'sec', 'cot'] as const) {
      expect(inRadians[key], `radians ${key}`).toBeCloseTo(inDegrees[key]!, 14)
      expect(inGradians[key], `gradians ${key}`).toBeCloseTo(inDegrees[key]!, 12)
    }
  })

  test('every answer is restated in all three units, and they agree', () => {
    const r = compute({ ...base, angle: 30 })
    expect(Number(step(r, 'θ in degrees').value)).toBe(30)
    expect(Number(step(r, 'θ in radians').value)).toBeCloseTo(Math.PI / 6, 15)
    expect(Number(step(r, 'θ in gradians').value)).toBeCloseTo(100 / 3, 12)

    // A full turn is 360° = 2π rad = 400 grad, whichever way it was entered.
    for (const [unit, turn] of [
      ['degrees', 360],
      ['radians', 2 * Math.PI],
      ['gradians', 400],
    ] as const) {
      const t = compute({ ...base, angleUnit: unit, angle: turn })
      expect(Number(step(t, 'θ in degrees').value), unit).toBeCloseTo(360, 9)
      expect(Number(step(t, 'θ in radians').value), unit).toBeCloseTo(2 * Math.PI, 12)
      expect(Number(step(t, 'θ in gradians').value), unit).toBeCloseTo(400, 9)
    }
  })

  test('π/2 radians is reported as exactly 90 degrees, not 90.00000000000001', () => {
    const r = compute({ ...base, angleUnit: 'radians', angle: Math.PI / 2 })
    expect(Number(step(r, 'θ in degrees').value)).toBe(90)
    expect(six(r).cos).toBe(0)
    expect(six(r).tan).toBeNull()
  })

  test('the unit selector labels the primary in whichever unit is chosen', () => {
    for (const [unit, symbol] of [
      ['degrees', '°'],
      ['radians', 'rad'],
      ['gradians', 'grad'],
    ] as const) {
      const r = compute({ ...base, mode: 'arcsin', angleUnit: unit })
      expect(formatValue(r.primary.value, r.primary.format), unit).toContain(symbol)
    }
    // arcsin 0.5 is 30° = 0.523599 rad = 33.3333 grad.
    expect(Number(compute({ ...base, mode: 'arcsin', angleUnit: 'radians' }).primary.value)).toBeCloseTo(
      Math.PI / 6,
      15,
    )
    expect(
      Number(compute({ ...base, mode: 'arcsin', angleUnit: 'gradians' }).primary.value),
    ).toBeCloseTo(100 / 3, 12)
  })
})

describe('trigonometry: the inverses', () => {
  test('the principal values land where the definitions say they do', () => {
    const angleOf = (mode: (typeof MODES)[number], ratio: number) =>
      Number(compute({ ...base, mode, ratio }).primary.value)

    expect(angleOf('arcsin', 0.5)).toBe(30)
    expect(angleOf('arcsin', 1)).toBe(90)
    expect(angleOf('arcsin', -1)).toBe(-90)
    expect(angleOf('arcsin', 0)).toBe(0)
    expect(angleOf('arccos', 0.5)).toBe(60)
    expect(angleOf('arccos', 1)).toBe(0)
    expect(angleOf('arccos', -1)).toBe(180)
    expect(angleOf('arccos', 0)).toBe(90)
    expect(angleOf('arctan', 1)).toBe(45)
    expect(angleOf('arctan', -1)).toBe(-45)
    expect(angleOf('arctan', 0)).toBe(0)
    // arctan 0.5 = 26.565051177077994°, the angle of a 1-in-2 slope.
    expect(angleOf('arctan', 0.5)).toBeCloseTo((Math.atan(0.5) * 180) / Math.PI, 12)
  })

  test('every inverse round-trips through its own forward function', () => {
    // The strongest available cross-check: feed the answer back and the ratio
    // that produced it must come out of the stats unchanged.
    for (let i = -100; i <= 100; i += 1) {
      const r = i / 100
      const bySin = compute({ ...base, mode: 'arcsin', ratio: r })
      expect(six(bySin).sin!, `arcsin ${r}`).toBeCloseTo(r, 12)
      expect(Number(bySin.primary.value), `arcsin range ${r}`).toBeGreaterThanOrEqual(-90)
      expect(Number(bySin.primary.value), `arcsin range ${r}`).toBeLessThanOrEqual(90)

      const byCos = compute({ ...base, mode: 'arccos', ratio: r })
      expect(six(byCos).cos!, `arccos ${r}`).toBeCloseTo(r, 12)
      expect(Number(byCos.primary.value), `arccos range ${r}`).toBeGreaterThanOrEqual(0)
      expect(Number(byCos.primary.value), `arccos range ${r}`).toBeLessThanOrEqual(180)
    }
    for (const r of [-20, -5, -1, -0.25, 0, 0.25, 1, 5, 20]) {
      const byTan = compute({ ...base, mode: 'arctan', ratio: r })
      expect(six(byTan).tan!, `arctan ${r}`).toBeCloseTo(r, 9)
      expect(Math.abs(Number(byTan.primary.value)), `arctan range ${r}`).toBeLessThan(90)
    }
  }, 30_000)

  test('the inverse modes name the function they used, with the ratio given', () => {
    for (const [mode, label] of [
      ['arcsin', 'θ = arcsin(r)'],
      ['arccos', 'θ = arccos(r)'],
      ['arctan', 'θ = arctan(r)'],
    ] as const) {
      const r = compute({ ...base, mode })
      expect(step(r, label), mode).toBeDefined()
      expect(Number(step(r, 'Ratio r (given)').value), mode).toBe(0.5)
    }
    // The forward mode shows the angle it was given instead.
    expect(Number(step(compute(base), 'Angle θ (given)').value)).toBe(30)
  })

  test('an inverse mode ignores the angle box entirely', () => {
    for (const mode of ['arcsin', 'arccos', 'arctan'] as const) {
      const r = compute({ ...base, mode, angle: Number.NaN })
      expect(Number.isFinite(Number(r.primary.value)), mode).toBe(true)
    }
    // ...and the forward mode ignores the ratio box.
    const forward = compute({ ...base, ratio: Number.NaN })
    expect(Number(forward.primary.value)).toBe(0.5)
  })
})

describe('trigonometry: the poles', () => {
  test('tan and sec have no value where cos θ is zero', () => {
    for (const deg of [90, 270, -90, -270, 450]) {
      const r = compute({ ...base, angle: deg })
      expect(six(r).tan, `${deg}`).toBeNull()
      expect(six(r).sec, `${deg}`).toBeNull()
      expect(text(r, 'tan θ')).toBe('Undefined (cos θ = 0)')
      // The other four are perfectly ordinary there.
      expect(Math.abs(six(r).sin!), `${deg}`).toBe(1)
      expect(six(r).cot, `${deg}`).toBe(0)
    }
  })

  test('csc and cot have no value where sin θ is zero', () => {
    for (const deg of [0, 180, 360, -180, -360]) {
      const r = compute({ ...base, angle: deg })
      expect(six(r).csc, `${deg}`).toBeNull()
      expect(six(r).cot, `${deg}`).toBeNull()
      expect(text(r, 'csc θ')).toBe('Undefined (sin θ = 0)')
      // tan is 0 there, not undefined, and it must not carry a negative zero.
      expect(six(r).tan, `${deg}`).toBe(0)
      expect(Object.is(six(r).tan, -0), `${deg} negative zero`).toBe(false)
    }
  })

  test('a pole never prints as Infinity, NaN, or a sixteen-digit lie', () => {
    // Math.tan(Math.PI / 2) is 16331239353195370 — a finite number, so a
    // Number.isFinite guard cannot catch it. This is why the poles are found
    // from the snapped cosine instead.
    for (const deg of [0, 90, 180, 270, 360]) {
      const r = compute({ ...base, angle: deg })
      for (const q of [r.primary, ...r.stats!]) {
        const shown = formatValue(q.value, q.format)
        expect(shown, `${deg} ${q.label}`).not.toContain('Infinity')
        expect(shown, `${deg} ${q.label}`).not.toContain('NaN')
        expect(shown, `${deg} ${q.label}`).not.toBe('—')
        expect(shown, `${deg} ${q.label}`).not.toMatch(/\d{10}/)
      }
    }
  })

  test('a pole explains itself in the notes', () => {
    expect(compute({ ...base, angle: 90 }).notes!.some((n) => n.includes('x = 0'))).toBe(true)
    expect(compute({ ...base, angle: 180 }).notes!.some((n) => n.includes('y = 0'))).toBe(true)
    expect(compute({ ...base, angle: 30 }).notes!.some((n) => n.includes('= 0'))).toBe(false)
  })
})

describe('trigonometry: quadrants and reference angles', () => {
  test('the quadrant follows the signs of the coordinates', () => {
    const quadrant = (deg: number) => String(step(compute({ ...base, angle: deg }), 'Quadrant').value)
    expect(quadrant(30)).toContain('I —')
    expect(quadrant(120)).toContain('II —')
    expect(quadrant(210)).toContain('III —')
    expect(quadrant(300)).toContain('IV —')
    expect(quadrant(0)).toBe('On the positive x-axis')
    expect(quadrant(90)).toBe('On the positive y-axis')
    expect(quadrant(180)).toBe('On the negative x-axis')
    expect(quadrant(270)).toBe('On the negative y-axis')
    // Negative and over-a-turn angles land in the quadrant of their coterminal.
    expect(quadrant(-30)).toBe(quadrant(330))
    expect(quadrant(390)).toBe(quadrant(30))
  })

  test('the reference angle is the acute angle to the x-axis', () => {
    const reference = (deg: number) =>
      Number(step(compute({ ...base, angle: deg }), 'Reference angle').value)
    expect(reference(30)).toBe(30)
    expect(reference(150)).toBe(30)
    expect(reference(210)).toBe(30)
    expect(reference(330)).toBe(30)
    expect(reference(-30)).toBe(30)
    expect(reference(0)).toBe(0)
    expect(reference(180)).toBe(0)
    expect(reference(90)).toBe(90)

    // Its defining property: every ratio of θ matches the ratio of its
    // reference angle, up to a sign. Checked independently of the label above.
    for (let deg = -360; deg <= 360; deg += 1) {
      const ref = reference(deg)
      const a = six(compute({ ...base, angle: deg }))
      const b = six(compute({ ...base, angle: ref }))
      expect(Math.abs(a.sin!), `sin ${deg}`).toBeCloseTo(Math.abs(b.sin!), 12)
      expect(Math.abs(a.cos!), `cos ${deg}`).toBeCloseTo(Math.abs(b.cos!), 12)
    }
  }, 30_000)

  test('an angle past a full turn is reduced to its coterminal', () => {
    const coterminal = (deg: number) =>
      Number(step(compute({ ...base, angle: deg }), 'Coterminal angle in one turn').value)
    expect(coterminal(400)).toBe(40)
    expect(coterminal(-30)).toBe(330)
    expect(coterminal(-360)).toBe(0)
    expect(coterminal(360)).toBe(0)
    expect(coterminal(30)).toBe(30)

    // Coterminal angles are genuinely the same angle, so the ratios must match.
    // Compared to fourteen places rather than by identity: 400° and 40° reach
    // Math.sin by different additions and can land an ulp apart, which is four
    // orders of magnitude below anything the page prints.
    const far = six(compute({ ...base, angle: 400 }))
    const near = six(compute({ ...base, angle: 40 }))
    for (const key of ['sin', 'cos', 'tan', 'csc', 'sec', 'cot'] as const) {
      expect(far[key], key).toBeCloseTo(near[key]!, 14)
    }
  })

  test('the unit-circle coordinates are the cosine and the sine', () => {
    const r = compute({ ...base, angle: 30 })
    expect(Number(step(r, 'Unit circle x = cos θ').value)).toBe(num(r, 'cos θ'))
    expect(Number(step(r, 'Unit circle y = sin θ').value)).toBe(num(r, 'sin θ'))
  })
})

describe('trigonometry: refusals', () => {
  test('a sine or cosine outside −1 to 1 is refused against the ratio field', () => {
    for (const mode of ['arcsin', 'arccos'] as const) {
      for (const ratio of [1.0001, 2, -2, 1e9, -1e9]) {
        const err = thrownBy({ ...base, mode, ratio })
        expect(err, `${mode} ${ratio}`).toBeInstanceOf(CalcError)
        expect((err as CalcError).fieldId, `${mode} ${ratio}`).toBe('ratio')
      }
      // Exactly ±1 is inside the domain, and is the end of the slider.
      expect(thrownBy({ ...base, mode, ratio: 1 })).toBeUndefined()
      expect(thrownBy({ ...base, mode, ratio: -1 })).toBeUndefined()
    }
    // A tangent has no such limit.
    for (const ratio of [2, -2, 1e9]) {
      expect(thrownBy({ ...base, mode: 'arctan', ratio }), `arctan ${ratio}`).toBeUndefined()
    }
  })

  /*
   * `coerceValues` in src/lib/view.ts turns an unparseable entry into a raw NaN
   * and hands it straight to compute, and every ordinary comparison against NaN
   * is false — so a magnitude check alone would let it through into Math.sin.
   * Every field the mode reads must refuse it by name.
   */
  const nonFinite = [
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ] as const

  test.each(nonFinite)('rejects an angle of %s against the angle field', (_label, value) => {
    for (const unit of UNITS) {
      const err = thrownBy({ ...base, angleUnit: unit, angle: value })
      expect(err, unit).toBeInstanceOf(CalcError)
      expect((err as CalcError).fieldId, unit).toBe('angle')
    }
  })

  test.each(nonFinite)('rejects a ratio of %s against the ratio field', (_label, value) => {
    for (const mode of ['arcsin', 'arccos', 'arctan'] as const) {
      const err = thrownBy({ ...base, mode, ratio: value })
      expect(err, mode).toBeInstanceOf(CalcError)
      expect((err as CalcError).fieldId, mode).toBe('ratio')
    }
  })

  test('an angle too large to evaluate is refused rather than answered with noise', () => {
    // Past this the argument to Math.sin carries fewer significant bits than the
    // answer needs. Far outside the slider, so only a typed value reaches it.
    const err = thrownBy({ ...base, angle: 1e12 })
    expect(err).toBeInstanceOf(CalcError)
    expect((err as CalcError).fieldId).toBe('angle')
    expect(thrownBy({ ...base, angle: 1e8 })).toBeUndefined()
  })

  test('an unknown mode or unit is refused against its select', () => {
    expect((thrownBy({ ...base, mode: 'nonsense' }) as CalcError).fieldId).toBe('mode')
    expect((thrownBy({ ...base, angleUnit: 'furlongs' }) as CalcError).fieldId).toBe('angleUnit')
  })
})

describe('trigonometry: field bounds and grid', () => {
  test('every declared bound is a value compute accepts, in every variant and mode', () => {
    // The same rule field-bounds.test.ts enforces registry-wide, asserted here
    // so it fails in this directory's own fast loop rather than only in a full
    // run. Both ends of the angle slider are a full turn, which is exactly where
    // csc and cot have poles — those report "undefined" rather than refusing,
    // which is what keeps the control honest.
    for (const field of numberFields) {
      const cases = field.variants ? Object.keys(field.variants.cases) : ['']
      for (const caseKey of cases) {
        const state: Input = field.variants
          ? ({ ...base, [field.variants.on]: caseKey } as Input)
          : { ...base }
        const bounds = resolveBounds(field, state as unknown as Record<string, unknown>)
        // When the controlling select IS the mode, the case key has already
        // pinned it. Probing the arctan bound of ±20 while forcing arcsin
        // describes a form state that cannot occur — the field's own bounds
        // narrow to ±1 the instant arcsin is chosen.
        const modes = field.variants?.on === 'mode' ? [state.mode as (typeof MODES)[number]] : MODES
        for (const bound of [bounds.min, bounds.max]) {
          if (bound === undefined) continue
          for (const mode of modes) {
            const where = `${field.id}[${caseKey || 'base'}]=${bound} in ${mode}`
            expect(thrownBy({ ...state, mode, [field.id]: bound }), where).toBeUndefined()
          }
        }
      }
    }
  })

  test('every number default lands on min + n × step in the base variant', () => {
    // An HTML range snaps to the grid, so an off-grid default silently shifts
    // the moment the slider is touched. Converting variants are exempt by
    // nature — 30° is 0.5236 rad only because the factor says so.
    const onGrid = (min: number | undefined, step: number | undefined, value: number) => {
      if (min === undefined || step === undefined) return true
      const n = (value - min) / step
      return Math.abs(n - Math.round(n)) < 1e-9
    }
    for (const field of numberFields) {
      expect(onGrid(field.min, field.step, field.default), `${field.id} top level`).toBe(true)
      if (!field.variants) continue
      for (const [name, variant] of Object.entries(field.variants.cases)) {
        if ((variant.factor ?? 1) !== 1) continue
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

  test('the angle variants carry the conversion and the ratio variants deliberately do not', () => {
    const angle = numberFields.find((f) => f.id === 'angle')!
    expect(angle.variants!.cases.radians!.factor).toBeCloseTo(Math.PI / 180, 17)
    expect(angle.variants!.cases.gradians!.factor).toBeCloseTo(10 / 9, 17)

    // A converter's input: switching from arcsin to arccos means a different
    // ratio was entered, not the same one restated, so no case may convert.
    const ratio = numberFields.find((f) => f.id === 'ratio')!
    for (const [name, variant] of Object.entries(ratio.variants!.cases)) {
      expect(variant.factor, `ratio[${name}] factor`).toBeUndefined()
      expect(variant.convert, `ratio[${name}] convert`).toBeUndefined()
    }
    expect(ratio.variants!.cases.arcsin).toMatchObject({ min: -1, max: 1 })
    expect(ratio.variants!.cases.arccos).toMatchObject({ min: -1, max: 1 })
    expect(ratio.variants!.cases.arctan!.max).toBeGreaterThan(1)
  })
})

describe('trigonometry: shape', () => {
  test('nudging the first number field 1.1x stays valid and moves the result', () => {
    // The e2e suite does exactly this in the DEFAULT mode, so pin the invariant.
    const firstNumber = fields.find((f) => f.kind === 'number')!
    expect(firstNumber.id).toBe('angle')

    const defaults = defaultValues(def) as Input
    expect(defaults.mode).toBe('ratios')
    const before = compute(defaults)
    const after = compute({ ...defaults, angle: (firstNumber as { default: number }).default * 1.1 })

    expect(Number(after.primary.value)).not.toBe(Number(before.primary.value))
    // sin 33° = 0.5446390350150271, confirmed against the Maclaurin series.
    expect(Number(after.primary.value)).toBeCloseTo(sinSeries(33 * RAD), 12)
    expect(formatValue(after.primary.value, after.primary.format)).toBe('0.544639')
  })

  test('the chart is two waves over a full turn, and never plots the tangent', () => {
    // tan reaches 1.6e16 at 90°, which would flatten both waves onto the axis.
    for (const unit of UNITS) {
      const r = compute({ ...base, angleUnit: unit })
      expect(r.series!.map((s) => s.label), unit).toEqual(['sin θ', 'cos θ'])
      for (const s of r.series!) {
        expect(s.points.length, `${unit} ${s.label}`).toBe(37)
        for (const [x, y] of s.points) {
          expect(Number.isFinite(x), `${unit} x`).toBe(true)
          expect(Math.abs(y), `${unit} y`).toBeLessThanOrEqual(1)
        }
        // Strictly increasing x, or the chart path doubles back on itself.
        s.points.forEach((point, i) => {
          if (i > 0) expect(point[0], `${unit} ${i}`).toBeGreaterThan(s.points[i - 1]![0])
        })
      }
      // The axis is a full turn in whichever unit is selected.
      const turn = unit === 'degrees' ? 360 : unit === 'radians' ? 2 * Math.PI : 400
      expect(r.series![0]!.points.at(-1)![0], unit).toBeCloseTo(turn, 9)
      expect(r.series![0]!.points[0]![0], unit).toBe(0)
    }
  })

  test('the chart curves match the ratios the calculator reports', () => {
    // Same arithmetic as the headline, so the picture and the number cannot
    // disagree at the points they share.
    const r = compute(base)
    const [sinLine, cosLine] = r.series!
    for (const [x, y] of sinLine!.points) {
      expect(six(compute({ ...base, angle: x })).sin!, `sin at ${x}`).toBeCloseTo(y, 12)
    }
    for (const [x, y] of cosLine!.points) {
      expect(six(compute({ ...base, angle: x })).cos!, `cos at ${x}`).toBeCloseTo(y, 12)
    }
  })

  test('the drawable blocks are present at the defaults, in every mode', () => {
    // The chart and the panels are server-rendered from the DEFAULT result, so
    // anything that can ever appear has to appear there too.
    for (const mode of MODES) {
      const r = compute({ ...base, mode })
      expect(r.series!.length, mode).toBe(2)
      expect(r.stats!.length, mode).toBe(6)
      expect(r.steps!.length, mode).toBeGreaterThan(0)
      // Nothing here is a proportion of a whole, so there is no donut to draw.
      expect(r.parts, mode).toBeUndefined()
    }
  })

  test('always reports all six ratios, in the same order, in every mode', () => {
    for (const mode of MODES) {
      expect(compute({ ...base, mode }).stats!.map((s) => s.label)).toEqual([
        'sin θ',
        'cos θ',
        'tan θ',
        'csc θ',
        'sec θ',
        'cot θ',
      ])
    }
  })

  test('the headline is named for the mode, and the definition agrees', () => {
    expect(compute({ ...base, mode: 'ratios' }).primary.label).toBe('sin θ')
    expect(compute({ ...base, mode: 'arcsin' }).primary.label).toBe('Angle (arcsin)')
    expect(compute({ ...base, mode: 'arccos' }).primary.label).toBe('Angle (arccos)')
    expect(compute({ ...base, mode: 'arctan' }).primary.label).toBe('Angle (arctan)')
    // The server renders `resultLabel` before the island attaches, so it has to
    // match what the default mode produces or the page changes on hydration.
    expect(def.resultLabel).toBe(compute(defaultValues(def) as Input).primary.label)
  })

  test('nothing anywhere in the reachable space formats as NaN', () => {
    for (const mode of MODES) {
      for (const unit of UNITS) {
        for (const angle of [-400, -90, -1, 0, 1, 30, 90, 180, 200, 360, 400]) {
          for (const ratio of [-20, -1, -0.5, 0, 0.5, 1, 20]) {
            let r: Result
            try {
              r = compute({ ...base, mode, angleUnit: unit, angle, ratio })
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
              expect(s, `${mode}/${unit}/${angle}/${ratio} ${q.label}`).not.toContain('NaN')
              expect(s).not.toContain('Infinity')
              expect(s).not.toBe('')
            }
          }
        }
      }
    }
  }, 30_000)

  test('the definition declares no scale, so compute need not return one', () => {
    expect('scale' in def).toBe(false)
    expect(compute(base).scaleValue).toBeUndefined()
  })

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

import { describe, expect, test } from 'vitest'
import compute from './compute'
import { CalcError } from '../../../lib/types'

const base = {
  operation: 'normalise',
  coefficientA: 6.02,
  exponentA: 23,
  coefficientB: 3,
  exponentB: 8,
}

const answer = (values: Partial<typeof base>) => String(compute({ ...base, ...values }).primary.value)
const stat = (values: Partial<typeof base>, label: string) =>
  String(compute({ ...base, ...values }).stats!.find((s) => s.label === label)!.value)
const step = (values: Partial<typeof base>, label: string) =>
  String(
    (
      compute({ ...base, ...values }).steps!.find((s) => 'label' in s && s.label === label) as {
        value: string
      }
    ).value,
  )
const notesFor = (values: Partial<typeof base>) =>
  (compute({ ...base, ...values }).notes ?? []).join(' ')

/**
 * Standard form back to a plain double, for checking against ordinary
 * arithmetic. Reads the LAST such expression in the text, since a worked step
 * often shows the restatement — "18.06 × 10^31 = 1.806 × 10^32" — and it is the
 * right-hand side that is the answer.
 */
const asNumber = (text: string) => {
  const trimmed = text.trim()
  if (trimmed === '0' || trimmed.endsWith('= 0')) return 0
  const match = /(-?[\d.]+) × 10\^(-?\d+)$/.exec(trimmed)
  return match ? Number(match[1]) * Math.pow(10, Number(match[2])) : Number.NaN
}

/** Doubles rarely land on a literal exactly, so compare by ratio throughout. */
const isTheNumber = (got: number, expected: number) =>
  expect(got / expected).toBeCloseTo(1, 10)

/**
 * The independent check. Every operation here is also computable as plain double
 * arithmetic whenever the operands fit in one, so the UNROUNDED result — which
 * the working reports before the significant-figure rule is applied — has to
 * agree with it to within floating-point noise. That route shares no code with
 * the digit-string arithmetic it is checking.
 */
const agreesWithPlainArithmetic = (values: Partial<typeof base>, expected: number) =>
  isTheNumber(asNumber(step(values, 'Back into standard form')), expected)

describe('scientific-notation — standard form', () => {
  test('the default states Avogadro’s number and writes it out', () => {
    expect(answer({})).toBe('6.02 × 10^23')
    // 602 followed by 21 zeros, which is 24 digits.
    expect(stat({}, 'Written out in full')).toBe('602000000000000000000000')
    expect(stat({}, 'Written out in full')).toHaveLength(24)
    expect(stat({}, 'Engineering notation')).toBe('602 × 10^21')
    expect(stat({}, 'SI prefix for this power of ten')).toBe('zetta (Z)')
    expect(stat({}, 'Coefficient')).toBe('6.02')
    isTheNumber(asNumber(answer({})), 6.02e23)
  })

  test('the nudge the end-to-end suite applies stays valid and changes the answer', () => {
    // tests/calculators.spec.ts sets the first number field to 1.1x its default.
    expect(Number((6.02 * 1.1).toFixed(4))).toBe(6.622)
    expect(answer({ coefficientA: 6.622 })).toBe('6.622 × 10^23')
    expect(answer({ coefficientA: 6.622 })).not.toBe(answer({}))
  })

  test('a coefficient outside 1..10 moves the point and pays for it in the exponent', () => {
    // 250 x 10^3 and 2.5 x 10^5 are both 250,000.
    expect(answer({ coefficientA: 250, exponentA: 3 })).toBe('2.5 × 10^5')
    expect(asNumber(answer({ coefficientA: 250, exponentA: 3 }))).toBe(250 * 10 ** 3)
    expect(step({ coefficientA: 250, exponentA: 3 }, 'Move the decimal point')).toContain('goes UP')

    // 0.004 x 10^6 and 4 x 10^3 are both 4000.
    expect(answer({ coefficientA: 0.004, exponentA: 6 })).toBe('4 × 10^3')
    expect(asNumber(answer({ coefficientA: 0.004, exponentA: 6 }))).toBe(0.004 * 10 ** 6)
    expect(step({ coefficientA: 0.004, exponentA: 6 }, 'Move the decimal point')).toContain(
      'goes DOWN',
    )
  })

  test('a negative number keeps its sign in every form', () => {
    expect(answer({ coefficientA: -6.02 })).toBe('-6.02 × 10^23')
    expect(stat({ coefficientA: -6.02 }, 'Engineering notation')).toBe('-602 × 10^21')
    expect(stat({ coefficientA: -1.5, exponentA: -4 }, 'Written out in full')).toBe('-0.00015')
  })

  test('zero has no standard form to move to', () => {
    expect(answer({ coefficientA: 0 })).toBe('0')
    expect(stat({ coefficientA: 0 }, 'Written out in full')).toBe('0')
    expect(stat({ coefficientA: 0 }, 'SI prefix for this power of ten')).toContain('zero')
  })

  test('engineering notation lands on a multiple of three, and names the prefix', () => {
    expect(stat({ coefficientA: 1.5, exponentA: 4 }, 'Engineering notation')).toBe('15 × 10^3')
    expect(stat({ coefficientA: 1.5, exponentA: 5 }, 'Engineering notation')).toBe('150 × 10^3')
    expect(stat({ coefficientA: 1.5, exponentA: 6 }, 'Engineering notation')).toBe('1.5 × 10^6')
    expect(stat({ coefficientA: 1.5, exponentA: 6 }, 'SI prefix for this power of ten')).toBe(
      'mega (M)',
    )
    expect(stat({ coefficientA: 1.5, exponentA: -7 }, 'Engineering notation')).toBe('150 × 10^-9')
    expect(stat({ coefficientA: 1.5, exponentA: -7 }, 'SI prefix for this power of ten')).toBe(
      'nano (n)',
    )
  })

  test('restating a number cannot change what it claims', () => {
    expect(stat({ coefficientA: 250, exponentA: 3 }, 'Significant figures in the answer')).toContain(
      '2, carried straight over',
    )
  })
})

describe('scientific-notation — multiply and divide keep the fewer figures', () => {
  test('the default pair, where B states only one figure', () => {
    // 6.02 x 3 = 18.06, and 23 + 8 = 31, so 18.06 x 10^31 is 1.806 x 10^32.
    // B was typed as 3, which states one figure, so the product keeps one and
    // 1.806 rounds half up to 2.
    agreesWithPlainArithmetic({ operation: 'multiply' }, 6.02e23 * 3e8)
    expect(step({ operation: 'multiply' }, 'Back into standard form')).toContain('1.806 × 10^32')
    expect(step({ operation: 'multiply' }, 'Add the exponents')).toBe('23 + 8 = 31')
    expect(answer({ operation: 'multiply' })).toBe('2 × 10^32')
  })

  test('three figures against three keeps three', () => {
    // 6.02 x 3.11 = 18.7222, so 1.87222 x 10^32 rounds to 1.87 x 10^32.
    const values = { operation: 'multiply', coefficientB: 3.11 }
    agreesWithPlainArithmetic(values, 6.02e23 * 3.11e8)
    expect(answer(values)).toBe('1.87 × 10^32')
  })

  test('division subtracts the exponents and keeps the fewer figures', () => {
    // 6.02 / 3 = 2.00666..., and 23 - 8 = 15. B states one figure.
    agreesWithPlainArithmetic({ operation: 'divide' }, 6.02e23 / 3e8)
    expect(step({ operation: 'divide' }, 'Subtract the exponents')).toBe('23 − 8 = 15')
    expect(answer({ operation: 'divide' })).toBe('2 × 10^15')

    // 6.02 / 1.24 = 4.8548387..., three figures on each side.
    const values = { operation: 'divide', coefficientB: 1.24 }
    agreesWithPlainArithmetic(values, 6.02e23 / 1.24e8)
    expect(answer(values)).toBe('4.85 × 10^15')
  })

  test('a quotient below one is renormalised rather than left as 0.25', () => {
    // 1.2 / 4.8 = 0.25, which is 2.5 x 10^-1, so the exponent drops by one.
    const values = {
      operation: 'divide',
      coefficientA: 1.2,
      exponentA: 3,
      coefficientB: 4.8,
      exponentB: 1,
    }
    agreesWithPlainArithmetic(values, 1.2e3 / 4.8e1)
    expect(answer(values)).toBe('2.5 × 10^1')
    expect(asNumber(answer(values))).toBe(25)
  })

  test('a product past 10 carries into the exponent', () => {
    // 5.5 x 4.4 = 24.2, which is 2.42 x 10^1, so the exponent gains a place.
    const values = {
      operation: 'multiply',
      coefficientA: 5.5,
      exponentA: 2,
      coefficientB: 4.4,
      exponentB: 3,
    }
    agreesWithPlainArithmetic(values, 5.5e2 * 4.4e3)
    expect(answer(values)).toBe('2.4 × 10^6')
  })

  test('the working names the rule and the count it produced', () => {
    expect(step({ operation: 'multiply' }, 'Multiplying keeps the FEWER significant figures')).toBe(
      'A states 3, B states 1, so the answer keeps 1',
    )
  })
})

describe('scientific-notation — add and subtract keep the coarser place', () => {
  test('a textbook addition rounds to the coarser place', () => {
    // 1.23 x 10^4 stops at 10^2, and 4.5 x 10^3 stops at 10^2 as well.
    // 12300 + 4500 = 16800 = 1.68 x 10^4, which also stops at 10^2.
    const values = {
      operation: 'add',
      coefficientA: 1.23,
      exponentA: 4,
      coefficientB: 4.5,
      exponentB: 3,
    }
    agreesWithPlainArithmetic(values, 1.23e4 + 4.5e3)
    expect(answer(values)).toBe('1.68 × 10^4')
  })

  test('a much smaller term is swallowed entirely, as it should be', () => {
    // 6.02 x 10^23 stops at 10^21, and 3 x 10^8 is thirteen orders of magnitude
    // below that, so it changes nothing a chemist could have measured.
    expect(answer({ operation: 'add' })).toBe('6.02 × 10^23')
    expect(answer({ operation: 'subtract' })).toBe('6.02 × 10^23')
    expect(step({ operation: 'add' }, 'Adding keeps the COARSER last place')).toBe(
      'A stops at 10^21 and B stops at 10^8, so the answer stops at 10^21',
    )
  })

  test('a subtraction where the finer term does survive', () => {
    // 0.0056 - 0.000234 = 0.005366. A stops at 10^-4 and B at 10^-6, so the
    // answer stops at 10^-4: 5.4 x 10^-3.
    const values = {
      operation: 'subtract',
      coefficientA: 5.6,
      exponentA: -3,
      coefficientB: 2.34,
      exponentB: -4,
    }
    agreesWithPlainArithmetic(values, 5.6e-3 - 2.34e-4)
    expect(answer(values)).toBe('5.4 × 10^-3')

    // ...and the same pair added: 0.005834 becomes 5.8 x 10^-3.
    expect(answer({ ...values, operation: 'add' })).toBe('5.8 × 10^-3')
  })

  test('catastrophic cancellation is reported rather than hidden', () => {
    // 150000 - 149000 = 1000 as arithmetic, but 1.5 x 10^5 says nothing below
    // the 10^4 place, so the difference has no significant digit at all.
    const values = {
      operation: 'subtract',
      coefficientA: 1.5,
      exponentA: 5,
      coefficientB: 1.49,
      exponentB: 5,
    }
    expect(step(values, 'Back into standard form')).toBe('1 × 10^3')
    expect(answer(values)).toBe('0')
    expect(notesFor(values)).toContain('Catastrophic cancellation')
  })

  test('two equal numbers cancel exactly', () => {
    const values = {
      operation: 'subtract',
      coefficientA: 1.5,
      exponentA: 5,
      coefficientB: 1.5,
      exponentB: 5,
    }
    expect(answer(values)).toBe('0')
    expect(notesFor(values)).toContain('cancel exactly')
  })

  test('a coefficient subtraction that floating point alone would fumble', () => {
    // 1.5 - 1.4 is 0.09999999999999987 in a double. Cleaned, it is 0.1, so
    // 1.5 x 10^5 - 1.4 x 10^5 is 1 x 10^4 rather than 9.999999999999987 x 10^3.
    expect(1.5 - 1.4).not.toBe(0.1)
    const values = {
      operation: 'subtract',
      coefficientA: 1.5,
      exponentA: 5,
      coefficientB: 1.4,
      exponentB: 5,
    }
    expect(step(values, 'Back into standard form')).toBe('1 × 10^4')
    expect(answer(values)).toBe('1 × 10^4')
  })
})

describe('scientific-notation — past what a double can hold', () => {
  test('a product beyond Number.MAX_VALUE is reported, not turned into Infinity', () => {
    // The double route overflows outright; the exponent route is exact.
    expect(6.02e300 * 3e300).toBe(Number.POSITIVE_INFINITY)
    const values = { operation: 'multiply', exponentA: 300, exponentB: 300 }
    expect(step(values, 'Add the exponents')).toBe('300 + 300 = 600')
    expect(answer(values)).toBe('2 × 10^601')
    expect(notesFor(values)).toContain('past what a double-precision number can hold')
  })

  test('a quotient below Number.MIN_VALUE is reported, not turned into zero', () => {
    expect(1e-300 / 1e300).toBe(0)
    const values = {
      operation: 'divide',
      coefficientA: 1,
      exponentA: -300,
      coefficientB: 1,
      exponentB: 300,
    }
    expect(answer(values)).toBe('1 × 10^-600')
  })

  test('both ends of every slider are values compute accepts', () => {
    for (const operation of ['normalise', 'multiply', 'divide', 'add', 'subtract']) {
      for (const bound of [-1000, 1000]) {
        expect(() => compute({ ...base, operation, coefficientA: bound })).not.toThrow()
        expect(() => compute({ ...base, operation, coefficientB: bound })).not.toThrow()
      }
      for (const bound of [-350, 350]) {
        expect(() => compute({ ...base, operation, exponentA: bound })).not.toThrow()
        expect(() => compute({ ...base, operation, exponentB: bound })).not.toThrow()
      }
    }
  })

  test('a number too long to write out says how many digits it has', () => {
    expect(stat({ exponentA: 300 }, 'Written out in full')).toBe(
      'too long to write out — 301 digits',
    )
  })
})

describe('scientific-notation — refusals and caveats', () => {
  test('rejects a fractional exponent against its own field', () => {
    let thrown: unknown
    try {
      compute({ ...base, exponentA: 23.5 })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe('exponentA')
  })

  test('never returns NaN for unparseable input', () => {
    let thrown: unknown
    try {
      compute({ ...base, coefficientA: Number.NaN })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe('coefficientA')
    expect(() => compute({ ...base, exponentA: Number.NaN })).toThrow(CalcError)
  })

  test('refuses to divide by zero, against the coefficient that caused it', () => {
    let thrown: unknown
    try {
      compute({ ...base, operation: 'divide', coefficientB: 0 })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe('coefficientB')
    // Zero times anything is still a perfectly good product.
    expect(answer({ operation: 'multiply', coefficientB: 0 })).toBe('0')
  })

  test('B is not validated when the operation does not use it', () => {
    // Standard form only ever looks at A, so a B the other modes would refuse
    // must not block it — the registry sweep moves one field at a time.
    expect(answer({ coefficientB: Number.NaN })).toBe('6.02 × 10^23')
    expect(answer({ exponentB: 0.5 })).toBe('6.02 × 10^23')
  })

  test('says out loud that a number box cannot hold the zero in 3.0', () => {
    expect(notesFor({ operation: 'multiply' })).toContain('trailing zero')
    expect(notesFor({ operation: 'multiply' })).toContain('reads as 1 significant figure')
    // 6.02 is not a whole number, so the default page carries no caveat at all.
    expect(notesFor({})).toBe('')
  })

  test('caps what it will claim at twelve figures, and says so', () => {
    // 9.99999999999 stops at 10^-11, and adding 1 x 10^-11 carries it over to
    // 1 x 10^1 — which now starts at 10^1 and would have to run to 10^-11 to
    // keep the same absolute precision. That is thirteen figures, one more than
    // the coefficient arithmetic can honestly supply.
    const values = {
      operation: 'add',
      coefficientA: 9.99999999999,
      exponentA: 0,
      coefficientB: 1,
      exponentB: -11,
    }
    expect(notesFor(values)).toContain('capped at 12')
    // Twelve significant digits, and the decimal point between them.
    expect(answer(values).split(' × ')[0]!.replace('.', '')).toHaveLength(12)
  })
})

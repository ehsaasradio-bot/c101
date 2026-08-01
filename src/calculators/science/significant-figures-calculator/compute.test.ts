import { describe, expect, test } from 'vitest'
import compute from './compute'
import { CalcError } from '../../../lib/types'

const base = { mode: 'round', value: '0.004500', sigFigs: 10 }

const countOf = (value: string) => Number(compute({ ...base, mode: 'count', value }).primary.value)
const roundTo = (value: string, sigFigs: number) =>
  String(compute({ ...base, value, sigFigs }).primary.value)
const notesFor = (values: Partial<typeof base>) => compute({ ...base, ...values }).notes ?? []

describe('significant-figures — counting', () => {
  /*
   * Each expectation is derived from the four rules and confirmed a second way:
   * the count must equal the number of digits in the scientific-notation
   * coefficient, which is what "significant" means. Those two routes are
   * independent — one walks the digits left to right, the other reads the form
   * where placeholders cannot exist — so agreeing is evidence rather than luck.
   */
  const crossCheck = (value: string, expected: number) => {
    expect(countOf(value)).toBe(expected)
    const scientific = String(
      compute({ ...base, mode: 'count', value }).stats!.find(
        (s) => s.label === 'Scientific notation',
      )!.value,
    )
    const coefficient = scientific.split(' × ')[0]!.replace(/^-/, '').replace('.', '')
    expect(coefficient.length).toBe(expected)
  }

  test('trailing zeros after a decimal point count', () => {
    // 0.004500: three leading zeros discarded, 4 and 5 counted, two trailing
    // zeros counted because the decimal point is written. 4.500 x 10^-3.
    crossCheck('0.004500', 4)
    crossCheck('0.0045', 2)
    crossCheck('100.0', 4)
    crossCheck('0.0450', 3)
  })

  test('leading zeros never count, however many there are', () => {
    crossCheck('0.5', 1)
    crossCheck('0.000009', 1)
    crossCheck('0.00102', 3)
  })

  test('zeros between significant digits always count', () => {
    crossCheck('505', 3)
    crossCheck('120.05', 5)
    crossCheck('10200', 3)
  })

  test('trailing zeros in a whole number are ambiguous, and read as placeholders', () => {
    expect(countOf('1200')).toBe(2)
    // The written decimal point is the only thing that changes, and it changes
    // the answer — which is why the input is text rather than a number.
    expect(countOf('1200.')).toBe(4)
    expect(notesFor({ mode: 'count', value: '1200' })[0]).toContain('ambiguous')
    expect(notesFor({ mode: 'count', value: '1200.' })).toEqual([])
  })

  test('scientific notation makes every digit significant', () => {
    crossCheck('4.500e-3', 4)
    crossCheck('4.5e-3', 2)
    // The same number written three ways, one claim of precision each.
    expect(countOf('4.500 × 10^-3')).toBe(4)
    expect(countOf('4.500 x 10^-3')).toBe(4)
  })

  test('the sign and thousands separators change nothing', () => {
    expect(countOf('-0.004500')).toBe(4)
    expect(countOf('1,200.5')).toBe(5)
  })

  test('zero is a stated special case rather than a silent zero', () => {
    expect(countOf('0')).toBe(1)
    expect(countOf('0.00')).toBe(2)
    expect(notesFor({ mode: 'count', value: '0.00' })[0]).toContain('the rules leave open')
  })

  test('the digit-by-digit working adds up to the answer it reports', () => {
    const result = compute({ ...base, mode: 'count', value: '0.004500' })
    const total = result.steps!.find(
      (s) => 'label' in s && s.label === 'Total',
    ) as { value: string }
    expect(total.value).toBe('2 + 0 + 2 = 4 figures')
    expect(Number(result.primary.value)).toBe(4)
  })
})

describe('significant-figures — rounding', () => {
  test('the default rounds 0.004500 to ten figures by padding', () => {
    // Four figures are stated, so the other six are zeros written on the end.
    expect(roundTo('0.004500', 10)).toBe('0.004500000000')
    expect(compute(base).primary.format).toEqual({ style: 'raw' })
    expect(compute(base).primary.label).toBe('Rounded to 10 figures')
  })

  test('the nudge the end-to-end suite applies stays valid and changes the answer', () => {
    // tests/calculators.spec.ts sets the first number field to 1.1x its default.
    expect(Number((10 * 1.1).toFixed(4))).toBe(11)
    expect(roundTo('0.004500', 11)).toBe('0.0045000000000')
    expect(roundTo('0.004500', 11)).not.toBe(roundTo('0.004500', 10))
  })

  test('round half up, on the digits rather than on a double', () => {
    // The trap: 1.005 is stored as 1.00499999999999989, so (1.005).toFixed(2)
    // is '1.00'. Rounding the digit string gives the taught answer.
    expect((1.005).toFixed(2)).toBe('1.00')
    expect(roundTo('1.005', 3)).toBe('1.01')
    expect(roundTo('0.004500', 1)).toBe('0.005')
    expect(roundTo('2.345', 3)).toBe('2.35')
    expect(roundTo('-2.345', 3)).toBe('-2.35')
    // Below five stays put.
    expect(roundTo('2.344', 3)).toBe('2.34')
    expect(roundTo('1.2345', 3)).toBe('1.23')
  })

  test('a carry through every nine lifts the power of ten', () => {
    // 9.99 to two figures: 99 goes up to 100, which is three digits, so the
    // count is held at two and the exponent takes the extra place. 10 x 10^0.
    expect(roundTo('9.99', 2)).toBe('10')
    expect(roundTo('0.0999', 2)).toBe('0.10')
    expect(roundTo('999.9', 1)).toBe('1000')
    expect(roundTo('9.9999', 4)).toBe('10.00')
  })

  test('a whole number keeps its magnitude with placeholder zeros', () => {
    expect(roundTo('1234', 2)).toBe('1200')
    expect(roundTo('1250', 2)).toBe('1300')
    expect(roundTo('98765', 3)).toBe('98800')
    // ...and says that those zeros are not a claim of precision.
    expect(notesFor({ value: '1234', sigFigs: 2 }).join(' ')).toContain('holding places')
  })

  test('both ends of the slider are values it accepts', () => {
    expect(roundTo('0.004500', 1)).toBe('0.005')
    // Fifteen figures starting at the 10^-3 place run out at 10^-17, so there
    // are seventeen decimal places: two placeholders and then the fifteen.
    const fifteen = roundTo('0.004500', 15)
    expect(fifteen).toBe('0.00450000000000000')
    expect(fifteen.split('.')[1]!.replace(/^0+/, '').length).toBe(15)
  })

  test('an exact tie names the rule it used and the rule it did not', () => {
    expect(notesFor({ value: '0.004500', sigFigs: 1 }).join(' ')).toContain('half-to-even')
    // Not a tie: there is a non-zero digit past the five.
    expect(notesFor({ value: '0.004501', sigFigs: 1 }).join(' ')).not.toContain('half-to-even')
  })

  test('an enormous power of ten reports the figures instead of the zeros', () => {
    expect(roundTo('1.23456e300', 3)).toBe('1.23 × 10^300')
    expect(roundTo('9.9e-300', 1)).toBe('1 × 10^-299')
  })

  test('the working reports the digit that decided the rounding', () => {
    const steps = compute({ ...base, value: '1.2345', sigFigs: 3 }).steps!
    const at = (label: string) =>
      String((steps.find((s) => 'label' in s && s.label === label) as { value: string }).value)
    expect(at('Digits kept')).toBe('123')
    expect(at('First digit dropped')).toBe('4, then 1 more')
    expect(at('Round half up')).toContain('below 5')
    expect(at('Answer')).toBe('1.23')
  })
})

describe('significant-figures — refusals', () => {
  test('rejects a value that is not a number, against the value field', () => {
    let thrown: unknown
    try {
      compute({ ...base, value: 'about four' })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe('value')
  })

  test('rejects an empty value rather than counting nothing', () => {
    expect(() => compute({ ...base, value: '   ' })).toThrow(CalcError)
    expect(() => compute({ ...base, value: '.' })).toThrow(CalcError)
  })

  test('never returns NaN for unparseable figures', () => {
    let thrown: unknown
    try {
      compute({ ...base, sigFigs: Number.NaN })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(CalcError)
    expect((thrown as CalcError).fieldId).toBe('sigFigs')
  })

  test('rejects a fractional or out-of-range count of figures', () => {
    expect(() => compute({ ...base, sigFigs: 4.5 })).toThrow(CalcError)
    expect(() => compute({ ...base, sigFigs: 0 })).toThrow(CalcError)
    expect(() => compute({ ...base, sigFigs: 16 })).toThrow(CalcError)
    expect(() => compute({ ...base, sigFigs: -999999 })).toThrow(CalcError)
  })

  test('counting does not care what the figure count says', () => {
    // sigFigs is unused in count mode, so a value the rounder would refuse must
    // not block a count — the field-bounds suite probes exactly this.
    expect(countOf('0.004500')).toBe(4)
    expect(() => compute({ mode: 'count', value: '0.004500', sigFigs: 4.5 })).not.toThrow()
  })

  test('refuses a power of ten it could never print', () => {
    expect(() => compute({ ...base, value: '1e5000' })).toThrow(CalcError)
  })
})

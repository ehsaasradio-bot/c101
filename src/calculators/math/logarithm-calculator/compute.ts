import { CalcError } from '../../../lib/types'
import type { CalcResult, FormatSpec, Quantity, StepRule, Values } from '../../../lib/types'
import type { fields } from './fields'

/**
 * log_b(x) is the exponent y for which b^y = x, and the change-of-base formula
 *
 *     log_b(x) = ln(x) / ln(b)
 *
 * is what makes an arbitrary base computable at all — JavaScript ships a
 * natural log and nothing else for a general base.
 *
 * It is also exactly where the floating point goes wrong.
 * `Math.log(1000) / Math.log(10)` is 2.9999999999999996, not 3: neither
 * logarithm is exact in binary, and the residue survives the division. A
 * logarithm calculator that reports log10(1000) = 2.9999999999999996 looks
 * broken, so two deliberate corrections are applied, in this order.
 *
 * FIRST, the three bases with a dedicated libm routine are routed to it.
 * `Math.log10`, `Math.log2` and `Math.log` avoid the division entirely and are
 * exact on exact powers, so 1000, 1024 and e return 3, 10 and 1 with no
 * cleanup at all. Those are also the three bases anyone actually types.
 */
function rawLog(x: number, base: number): number {
  if (base === 10) return Math.log10(x)
  if (base === 2) return Math.log2(x)
  if (base === Math.E) return Math.log(x)
  return Math.log(x) / Math.log(base)
}

/**
 * SECOND, every other base still goes through the division, and log_7(343)
 * lands on 3.0000000000000004. Snap to the nearest integer — but only when the
 * integer is verifiably right, by raising the base back to it and checking that
 * x reappears. A value that is merely near an integer, like
 * log10(999) = 2.99956, is left exactly where the arithmetic put it.
 *
 * The tolerance is a relative one on both sides. `Number.EPSILON` is the gap at
 * 1.0 and would be meaningless out at y = 40, and an absolute tolerance on x
 * would be meaningless at x = 1e9.
 */
function snapToExactPower(y: number, x: number, base: number): number {
  const n = Math.round(y)
  if (n === y) return y
  if (Math.abs(y - n) > 1e-9 * Math.max(1, Math.abs(y))) return y
  const back = Math.pow(base, n)
  if (!Number.isFinite(back) || back === 0) return y
  return Math.abs(back - x) <= 1e-9 * Math.abs(x) ? n : y
}

/**
 * IEEE 754 has two zeros, and the division form of change of base reaches the
 * negative one: `Math.log(1) / Math.log(0.5)` is `-0`, because 0 divided by a
 * negative is `-0`. `Intl.NumberFormat` then renders that as `-0`, so
 * log₀.₅(1) came out on the page as "-0" — which is not a smaller number than
 * zero, it is the same number printed wrongly. Any base to the power 0 is 1, so
 * the answer is a plain 0.
 */
function normalizeZero(n: number): number {
  return n === 0 ? 0 : n
}

/**
 * A number for embedding in a worked step. Integers print bare so an exact
 * answer reads as `3` rather than `3.000000`; everything else is trimmed to ten
 * significant figures, which is well inside a double's honest precision.
 */
function show(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n)
  return String(Number(n.toPrecision(10)))
}

/**
 * Display precision for a figure that is often exactly a whole number. Whole
 * numbers get no decimals at all — this is the other half of the floating-point
 * answer above: getting the value right is pointless if the formatter then
 * prints `3.000000` for it, or `1,000.000000` for the 10³ that confirms it.
 *
 * Applied to the answer, to the b^y round-trip check and to the antilogarithm,
 * all three of which land on a whole number whenever the input is an exact
 * power. It is deliberately NOT applied to the raw change-of-base division,
 * which is shown at fixed precision precisely because it is the value that
 * misses.
 */
function exactAwareFormat(n: number): FormatSpec {
  return { style: 'decimal', decimals: Number.isInteger(n) ? 0 : 6 }
}

export default function compute(v: Values<typeof fields>): CalcResult {
  const { x, base, logValue } = v

  // Finiteness first. `coerceValues` deliberately produces NaN for unparseable
  // input, and a magnitude test like `x <= 0` is false for NaN, so it would
  // slip straight through to Math.log and come back out as NaN.
  if (!Number.isFinite(x))
    throw new CalcError(
      'Enter a finite number for x. A logarithm asks what power the base is raised to in order to reach x, and there is no such power for a blank, a word, or infinity.',
      'x',
    )
  if (!Number.isFinite(base))
    throw new CalcError(
      'Enter a finite number for the base. The base is the number being raised to a power, so it has to be an actual value — an infinite or unreadable base has no logarithm to give.',
      'base',
    )
  if (!Number.isFinite(logValue))
    throw new CalcError(
      'Enter a finite number for the known logarithm. It is used the other way round, as the power the base is raised to, so an infinite or unreadable value has nothing to raise the base by.',
      'logValue',
    )

  if (x <= 0)
    throw new CalcError(
      'x must be greater than zero. A positive base raised to any real power is always positive, so zero and negative numbers have no real logarithm.',
      'x',
    )
  if (base <= 0)
    throw new CalcError(
      'The base must be greater than zero. A negative base raised to a fractional power leaves the real numbers entirely, so log to a negative base is undefined here.',
      'base',
    )
  if (base === 1)
    throw new CalcError(
      'Base 1 is undefined: 1 raised to any power is still 1, so there is no exponent that reaches any other x — and for x = 1 every exponent works at once.',
      'base',
    )

  const lnX = Math.log(x)
  const lnBase = Math.log(base)
  // The change-of-base division on its own, kept unretouched so the page can
  // show what the formula literally produces next to the corrected answer.
  const changeOfBase = normalizeZero(lnX / lnBase)
  const y = normalizeZero(snapToExactPower(rawLog(x, base), x, base))

  if (!Number.isFinite(y))
    throw new CalcError('That combination has no finite logarithm. Try a value closer to 1.', 'x')

  // Raising the base back to the answer must return x. This is the identity the
  // page is built on, so it is computed and shown rather than asserted.
  const roundTrip = Math.pow(base, y)
  // Relative, not exact: Math.pow(0.1, -3) is 999.9999999999999, and 1000 is
  // still genuinely the third negative power of a tenth. The tolerance belongs
  // to `pow`, not to the logarithm.
  const exactPower = Number.isInteger(y) && Math.abs(roundTrip - x) <= 1e-9 * x

  // The inverse direction: given the base and a logarithm, recover x.
  const antilog = Math.pow(base, logValue)
  if (!Number.isFinite(antilog))
    throw new CalcError(
      'b raised to that power overflows a double. Lower the known logarithm or the base.',
      'logValue',
    )
  if (antilog === 0)
    throw new CalcError(
      'b raised to that power underflows to zero. Raise the known logarithm or lower the base.',
      'logValue',
    )

  const stats: Quantity[] = [
    {
      label: 'Common logarithm log₁₀(x)',
      value: Math.log10(x),
      format: exactAwareFormat(Math.log10(x)),
    },
    { label: 'Natural logarithm ln(x)', value: lnX, format: exactAwareFormat(lnX) },
    { label: 'Binary logarithm log₂(x)', value: Math.log2(x), format: exactAwareFormat(Math.log2(x)) },
    {
      label: 'Change of base: ln(x) ÷ ln(b)',
      value: changeOfBase,
      format: { style: 'decimal', decimals: 6 },
    },
    {
      label: 'Inverse: x when the logarithm is y',
      value: antilog,
      format: exactAwareFormat(antilog),
    },
    {
      label: 'Check: b raised to the answer',
      value: roundTrip,
      format: exactAwareFormat(roundTrip),
    },
    {
      label: 'Is x an exact power of b?',
      value: exactPower ? `Yes — b^${show(y)} = ${show(x)}` : 'No',
      format: { style: 'raw' },
    },
  ]

  const steps: (Quantity | StepRule)[] = [
    { label: 'Value x', value: x, format: { style: 'decimal', decimals: 6 } },
    { label: 'Base b', value: base, format: { style: 'decimal', decimals: 6 } },
    { rule: true },
    { label: 'ln(x)', value: lnX, format: { style: 'decimal', decimals: 6 } },
    { label: 'ln(b)', value: lnBase, format: { style: 'decimal', decimals: 6 } },
    {
      label: 'Change of base: log_b(x) = ln(x) ÷ ln(b)',
      value: `${show(Number(lnX.toPrecision(10)))} ÷ ${show(Number(lnBase.toPrecision(10)))} = ${show(y)}`,
      format: { style: 'raw' },
    },
    { label: 'Answer y = log_b(x)', value: y, format: exactAwareFormat(y) },
    { rule: true },
    {
      label: 'Check by exponentiating: b^y = x',
      value: `${show(base)}^${show(y)} = ${show(roundTrip)}`,
      format: { style: 'raw' },
    },
    { rule: true },
    { label: 'Known logarithm y', value: logValue, format: { style: 'decimal', decimals: 6 } },
    {
      label: 'Inverse: x = b^y',
      value: `${show(base)}^${show(logValue)} = ${show(antilog)}`,
      format: { style: 'raw' },
    },
  ]

  const notes: string[] = []
  if (exactPower)
    notes.push(
      `${show(x)} is an exact power of ${show(base)}, so the logarithm is the whole number ${show(y)}.`,
    )
  if (exactPower && changeOfBase !== y)
    notes.push(
      `Change of base alone returns ${changeOfBase} for this one, because neither natural logarithm is exact in binary and the residue survives the division. The whole number above is confirmed the other way round: ${show(base)} raised to ${show(y)} gives ${show(roundTrip)}.`,
    )
  if (base > 1 && x < 1)
    notes.push(
      'Values below 1 have a negative logarithm in any base above 1: the base has to be raised to a negative power to shrink below 1.',
    )
  if (base < 1)
    notes.push(
      'A base below 1 reverses the direction of the logarithm — as x grows the answer falls, because raising a fraction to a higher power makes it smaller.',
    )

  return {
    primary: {
      label: `Logarithm of ${show(x)} to base ${show(base)}`,
      value: y,
      format: exactAwareFormat(y),
    },
    stats,
    steps,
    notes,
  }
}

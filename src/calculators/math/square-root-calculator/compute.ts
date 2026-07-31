import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, StepRule, Values } from '../../../lib/types'
import type { fields } from './fields'

/** The largest magnitude this page will factorise. Trial division runs to sqrt(n). */
const MAX_MAGNITUDE = 1_000_000_000

// ── Presentation of exponents and radical signs ───────────────────────────

const SUPERSCRIPT = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'] as const

function superscript(n: number): string {
  return String(n)
    .split('')
    .map((d) => SUPERSCRIPT[Number(d)] ?? d)
    .join('')
}

/**
 * Unicode carries dedicated glyphs for the square, cube and fourth roots and
 * stops there, so every higher degree is written as a superscript index in
 * front of the plain radical: ⁵√32.
 */
function radicalSign(n: number): string {
  if (n === 2) return '√'
  if (n === 3) return '∛'
  if (n === 4) return '∜'
  return `${superscript(n)}√`
}

function rootName(n: number): string {
  if (n === 2) return 'Square root'
  if (n === 3) return 'Cube root'
  if (n === 4) return 'Fourth root'
  const tens = n % 100
  const ones = n % 10
  const suffix =
    tens >= 11 && tens <= 13 ? 'th' : ones === 1 ? 'st' : ones === 2 ? 'nd' : ones === 3 ? 'rd' : 'th'
  return `${n}${suffix} root`
}

/** `square`, `cube`, or `7th power` — never the `3th power` that `${n}th` gives. */
function powerName(n: number): string {
  if (n === 2) return 'square'
  if (n === 3) return 'cube'
  return `${n}th power`
}

/**
 * A number for embedding in a worked step. Integers print bare so an exact
 * answer reads as `12` rather than `12.000000`; everything else is trimmed to
 * ten significant figures, which is well inside a double's honest precision.
 *
 * The minus sign is the plain ASCII hyphen `Intl.NumberFormat` uses, so a raw
 * string sits beside the theme's own formatted numbers without one of the two
 * looking like a typo.
 */
function show(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n)
  return String(Number(n.toPrecision(10)))
}

/**
 * The same number as the BASE of a power. `-2³` reads as -(2³) = -8 by
 * precedence, which happens to be right here and is wrong the moment the degree
 * is even, so a negative base is always bracketed: (−2)³.
 */
function showBase(n: number): string {
  return n < 0 ? `(${show(n)})` : show(n)
}

// ── The root itself ───────────────────────────────────────────────────────

/**
 * `Math.pow(x, 1/n)` is the obvious way to take an nth root and it is wrong in
 * two separate ways.
 *
 * It is wrong for negative x: `Math.pow(-8, 1/3)` is NaN, because IEEE 754 pow
 * rejects a negative base with a non-integer exponent even though the cube root
 * of -8 is a perfectly ordinary -2. The sign is therefore split off here and
 * reattached by the caller, so only a positive magnitude ever reaches pow.
 *
 * It is also inexact: 1/3 is not representable in binary, so
 * `Math.pow(27, 1/3)` returns 3.0000000000000004. A page showing ∛27 as
 * 3.0000000000000004 — or √49 as 6.999999999999999 — looks broken, so two
 * corrections are applied in order, matching what `logarithm-calculator` does
 * for the same class of problem.
 *
 * FIRST, degree 2 is routed to `Math.sqrt`, which IEEE 754 requires to be
 * correctly rounded. It is exact on every perfect square and on exactly
 * representable fractions like 0.25 -> 0.5, so no cleanup is needed at all for
 * the degree anybody actually types.
 *
 * SECOND, every other degree gets one Newton step on f(r) = rⁿ - a, kept only
 * if it genuinely lands closer, and is then snapped by `snapToExactRoot`.
 */
function rootMagnitude(a: number, n: number): number {
  if (a === 0) return 0
  if (n === 2) return Math.sqrt(a)

  const seed = Math.pow(a, 1 / n)
  if (!Number.isFinite(seed) || seed <= 0) return seed

  // Newton on rⁿ = a: r <- r - (r - a / r^(n-1)) / n.
  let r = seed
  const refined = seed - (seed - a / Math.pow(seed, n - 1)) / n
  if (
    Number.isFinite(refined) &&
    refined > 0 &&
    Math.abs(Math.pow(refined, n) - a) <= Math.abs(Math.pow(seed, n) - a)
  )
    r = refined

  return snapToExactRoot(r, a, n)
}

/**
 * Snap a near-integer root to that integer — but only after verifying it by
 * back-substitution, exactly as `logarithm-calculator` verifies a near-integer
 * logarithm by raising the base back to it. A value that is merely close to an
 * integer, like the fifth root of 33 at 2.0121, is left where the arithmetic
 * put it.
 *
 * Both tolerances are relative. `Number.EPSILON` is the gap at 1.0 and would be
 * meaningless out at r = 1000, and an absolute tolerance on `a` would be
 * meaningless at a = 1e9.
 */
function snapToExactRoot(r: number, a: number, n: number): number {
  const candidate = Math.round(r)
  if (candidate === r) return r
  if (Math.abs(r - candidate) > 1e-9 * Math.max(1, Math.abs(r))) return r
  const back = Math.pow(candidate, n)
  if (!Number.isFinite(back)) return r
  return Math.abs(back - a) <= 1e-9 * a ? candidate : r
}

// ── Simplified radical form ───────────────────────────────────────────────

/**
 * Trial division up to sqrt(n), the same routine `gcd-lcm-calculator` uses.
 * `m` is capped at 1e9 by the magnitude guard, so this runs at most ~31,623
 * iterations — well inside a keystroke's budget.
 */
function primeFactors(m: number): ReadonlyArray<{ prime: number; power: number }> {
  const out: { prime: number; power: number }[] = []
  let rest = m
  for (let p = 2; p * p <= rest; p += p === 2 ? 1 : 2) {
    if (rest % p !== 0) continue
    let power = 0
    while (rest % p === 0) {
      rest /= p
      power += 1
    }
    out.push({ prime: p, power })
  }
  if (rest > 1) out.push({ prime: rest, power: 1 })
  return out
}

function factorText(m: number): string {
  if (m === 0) return '0'
  if (m === 1) return '1'
  return primeFactors(m)
    .map(({ prime, power }) => (power === 1 ? `${prime}` : `${prime}${superscript(power)}`))
    .join(' × ')
}

/**
 * Pull the largest perfect nth power out of a positive integer m, so that
 *
 *     coefficient ^ n × radicand === m
 *
 * exactly, in integers. This is the whole point of the page: √72 is 6√2, and
 * that identity — 6² × 2 = 72 — is checkable with no floating point at all,
 * which makes it an independent confirmation of the decimal answer rather than
 * a restatement of it.
 *
 * Working prime by prime rather than by testing perfect squares in turn keeps
 * this exact and linear: each prime contributes floor(power / n) copies to the
 * coefficient and the remainder stays under the radical.
 */
function extractRadical(m: number, n: number): { coefficient: number; radicand: number } {
  let coefficient = 1
  let radicand = 1
  for (const { prime, power } of primeFactors(m)) {
    coefficient *= Math.pow(prime, Math.floor(power / n))
    radicand *= Math.pow(prime, power % n)
  }
  return { coefficient, radicand }
}

/** `6√2`, `12`, `√2`, or `1` — the written form of coefficient × ⁿ√radicand. */
function radicalText(coefficient: number, radicand: number, n: number, sign: number): string {
  const magnitude =
    radicand === 1
      ? String(coefficient)
      : `${coefficient === 1 ? '' : coefficient}${radicalSign(n)}${radicand}`
  return sign < 0 ? `-${magnitude}` : magnitude
}

/** The same thing with an `i` welded on: √-72 is 6i√2. Square roots only. */
function imaginaryRadicalText(coefficient: number, radicand: number): string {
  const head = coefficient === 1 ? '' : String(coefficient)
  const tail = radicand === 1 ? '' : `√${radicand}`
  return `${head}i${tail}`
}

// ── Compute ───────────────────────────────────────────────────────────────

export default function compute(v: Values<typeof fields>): CalcResult {
  // Finiteness FIRST. `coerceValues` deliberately produces NaN for unparseable
  // input, and a magnitude test like `x < 0` is false for NaN, so it would slip
  // straight through to Math.sqrt and come back out as NaN.
  if (!Number.isFinite(v.value))
    throw new CalcError(
      'Enter a finite number. A root asks which number multiplied by itself n times gives this one, and a blank, a word or infinity is not a number that question can be asked of.',
      'value',
    )
  if (!Number.isFinite(v.degree))
    throw new CalcError(
      'Enter a finite whole number for the root degree — 2 for a square root, 3 for a cube root.',
      'degree',
    )

  const x = v.value
  // The degree counts how many times the root is multiplied by itself, so it is
  // an integer notion; anything else is snapped before the maths runs.
  const n = Math.round(v.degree)

  if (Math.abs(x) > MAX_MAGNITUDE)
    throw new CalcError(
      'Keep the number within ±1,000,000,000. Beyond that the prime factorisation behind the simplified radical form stops being quick enough to run on every keystroke.',
      'value',
    )
  if (n < 2)
    throw new CalcError(
      'The root degree must be 2 or more. The first root of a number is the number itself, which is true but tells you nothing.',
      'degree',
    )
  if (n > 20)
    throw new CalcError('Keep the root degree at 20 or below.', 'degree')

  const evenDegree = n % 2 === 0
  const negative = x < 0
  const magnitude = Math.abs(x)

  // An even root of a negative number is not real. Degree 2 is reported in
  // imaginary form, because a i√b is exactly the notation a student is being
  // asked for. Higher even degrees are refused rather than faked: the principal
  // fourth root of -16 is √2 + √2 i, not 2i — (2i)⁴ is +16, not -16 — so there
  // is no purely imaginary form to print, and printing one would be a lie.
  const imaginary = negative && evenDegree
  if (imaginary && n !== 2)
    throw new CalcError(
      `There is no real ${rootName(n).toLowerCase()} of a negative number, and no simple imaginary one either: the principal even root of a negative is a full complex number with both a real and an imaginary part, which this page does not draw. Use degree 2 for the i√ form, an odd degree — odd roots of negatives are real — or a positive number.`,
      'value',
    )

  const rootOfMagnitude = rootMagnitude(magnitude, n)
  if (!Number.isFinite(rootOfMagnitude))
    throw new CalcError('That combination has no finite root. Try a smaller number.', 'value')

  // The real answer. Odd roots keep the sign of the number: (-2)³ = -8, so the
  // cube root of -8 is -2. Even roots of a positive take the principal, i.e.
  // non-negative, value.
  const root = negative && !evenDegree ? -rootOfMagnitude : rootOfMagnitude

  // The identity the page is built on, computed and shown rather than asserted.
  const backSubstitution = Math.pow(root, n)
  // Compared against the SIGNED x, not its magnitude. -49 is the negative of a
  // perfect square, which is not the same claim as being one: 7² is 49, and no
  // real number squares to -49 at all.
  const exactPower =
    !imaginary &&
    Number.isInteger(root) &&
    (magnitude === 0 || Math.abs(backSubstitution - x) <= 1e-9 * magnitude)

  // The radical form is an integer factorisation, so it only exists over the
  // integers. 79.2 has a decimal root and no radical form, and saying so is
  // better than inventing one.
  const wholeNumber = Number.isInteger(x)
  const { coefficient, radicand } = wholeNumber
    ? extractRadical(magnitude, n)
    : { coefficient: 1, radicand: 0 }

  const radicalForm = !wholeNumber
    ? 'Only whole numbers simplify — this one is exact as a decimal'
    : magnitude === 0
      ? '0'
      : imaginary
        ? imaginaryRadicalText(coefficient, radicand)
        : radicalText(coefficient, radicand, n, negative ? -1 : 1)

  const simplifies = wholeNumber && magnitude !== 0 && coefficient !== 1

  // The independent check, in integers: coefficient^n × radicand === |x|. No
  // floating point is involved for values inside the safe-integer range, so an
  // agreement here is real evidence and not the decimal confirming itself.
  const factorCheck = wholeNumber && magnitude > 0 ? Math.pow(coefficient, n) * radicand : magnitude

  // ── Extra roots, always present so the stat count never varies ──────────
  const sqrtText = negative
    ? `${show(Math.sqrt(magnitude))}i (imaginary)`
    : show(Math.sqrt(magnitude))
  const cbrtRaw = rootMagnitude(magnitude, 3)
  const cbrtText = show(negative ? -cbrtRaw : cbrtRaw)

  const bothRoots =
    magnitude === 0
      ? '0 is its own only root'
      : imaginary
        ? `±${imaginaryRadicalText(coefficient, radicand)} — two imaginary roots, no real one`
        : evenDegree
          ? `+${show(root)} and -${show(root)} — the principal root is the positive one`
          : 'One real root only, because an odd power keeps the sign of its base'

  // The two perfect nth powers a non-exact value sits between. This is the
  // sanity check a student does by hand: √72 is between 8 and 9 because 72 is
  // between 64 and 81.
  const lower = Math.floor(rootOfMagnitude)
  const bracket =
    negative
      ? 'Not applicable below zero'
      : exactPower
        ? `Exactly ${showBase(root)}${superscript(n)}, so it sits on a perfect power rather than between two`
        : `${show(Math.pow(lower, n))} = ${lower}${superscript(n)} and ${show(Math.pow(lower + 1, n))} = ${lower + 1}${superscript(n)}`

  const stats: Quantity[] = [
    { label: 'Simplified radical form', value: radicalForm, format: { style: 'raw' } },
    {
      label: `Is ${show(x)} a perfect ${powerName(n)}?`,
      value: exactPower
        ? `Yes — ${showBase(root)}${superscript(n)} = ${show(x)}`
        : imaginary && Number.isInteger(rootOfMagnitude)
          ? `No — nothing squares to a negative. But ${show(magnitude)} is, at ${show(rootOfMagnitude)}², so the root is exactly ${radicalForm}`
          : wholeNumber
            ? 'No — the root is irrational, so the radical form above is the only exact one'
            : 'No — not a whole number',
      format: { style: 'raw' },
    },
    { label: 'Both roots', value: bothRoots, format: { style: 'raw' } },
    {
      label: `Check: root raised to the power ${n}`,
      value: imaginary
        ? `(${radicalForm})${superscript(n)} = ${show(-Math.abs(backSubstitution))}`
        : `${showBase(root)}${superscript(n)} = ${show(backSubstitution)}`,
      format: { style: 'raw' },
    },
    { label: 'Square root √x', value: sqrtText, format: { style: 'raw' } },
    { label: 'Cube root ∛x', value: cbrtText, format: { style: 'raw' } },
    { label: 'Between the perfect powers', value: bracket, format: { style: 'raw' } },
  ]

  const steps: (Quantity | StepRule)[] = [
    { label: 'Number', value: show(x), format: { style: 'raw' } },
    { label: 'Root degree n', value: n, format: { style: 'decimal', decimals: 0 } },
    { rule: true },
    {
      label: 'Prime factorisation of |x|',
      value: !wholeNumber
        ? 'Not a whole number'
        : magnitude === 0
          ? 'Zero has no prime factorisation'
          : `${show(magnitude)} = ${factorText(magnitude)}`,
      format: { style: 'raw' },
    },
    {
      label: `Largest perfect ${powerName(n)} factor`,
      value: !wholeNumber || magnitude === 0
        ? '—'
        : coefficient === 1
          ? `None above 1 — nothing comes out from under the radical`
          : `${show(Math.pow(coefficient, n))} = ${coefficient}${superscript(n)}`,
      format: { style: 'raw' },
    },
    {
      label: 'Split it out',
      value: !wholeNumber || magnitude === 0
        ? '—'
        : coefficient === 1
          ? `${radicalSign(n)}${show(magnitude)} stays as ${radicalSign(n)}${show(magnitude)}`
          : `${radicalSign(n)}${show(magnitude)} = ${radicalSign(n)}(${show(Math.pow(coefficient, n))} × ${radicand}) = ${radicand === 1 ? `${coefficient}` : `${coefficient}${radicalSign(n)}${radicand}`}`,
      format: { style: 'raw' },
    },
    {
      label: 'Confirm the factorisation in whole numbers',
      value:
        wholeNumber && magnitude > 0
          ? `${coefficient}${superscript(n)} × ${radicand} = ${show(factorCheck)}`
          : '—',
      format: { style: 'raw' },
    },
    { rule: true },
    { label: 'Simplified radical form', value: radicalForm, format: { style: 'raw' } },
    {
      label: 'As a decimal',
      value: imaginary ? `${show(rootOfMagnitude)}i` : show(root),
      format: { style: 'raw' },
    },
    { rule: true },
    {
      label: 'Check by raising it back',
      value: imaginary
        ? `(${show(rootOfMagnitude)}i)${superscript(n)} = ${show(-Math.abs(backSubstitution))}`
        : `${showBase(root)}${superscript(n)} = ${show(backSubstitution)}`,
      format: { style: 'raw' },
    },
  ]

  const notes: string[] = []
  if (imaginary)
    notes.push(
      `A negative number has no real square root: squaring any real number, positive or negative, gives a positive result. ${show(x)} therefore has an imaginary square root, written ${radicalForm}, where i is defined by i squared = -1.`,
    )
  if (negative && !evenDegree)
    notes.push(
      `Odd roots of negatives are real, unlike even ones: an odd power keeps the sign of its base, so ${showBase(root)}${superscript(n)} = ${show(backSubstitution)}.`,
    )
  if (exactPower && !negative)
    notes.push(
      `${show(x)} is a perfect ${powerName(n)}, so the root is the whole number ${show(root)} and there is nothing left under the radical.`,
    )
  if (simplifies && radicand !== 1)
    notes.push(
      `The decimal is a rounded approximation; ${radicalForm} is the exact value. That is why homework asks for the radical form — ${coefficient}${superscript(n)} × ${radicand} = ${show(factorCheck)} exactly, while the decimal never raises back to ${show(magnitude)} on the nose.`,
    )
  if (wholeNumber && magnitude > 1 && !simplifies && !exactPower)
    notes.push(
      `${show(magnitude)} has no perfect ${powerName(n)} factor above 1, so ${radicalSign(n)}${show(magnitude)} is already in its simplest radical form.`,
    )

  return {
    primary: {
      label: `${rootName(n)} of ${show(x)}`,
      value: imaginary ? `${show(rootOfMagnitude)}i` : root,
      format: imaginary
        ? { style: 'raw' }
        : { style: 'decimal', decimals: Number.isInteger(root) ? 0 : 6 },
    },
    stats,
    steps,
    notes,
  }
}

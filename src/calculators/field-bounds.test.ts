import { describe, expect, test } from 'vitest'
import { calculators } from './index'
import { convertBetween, defaultValues, resolveBounds, withDependentSelects } from '../lib/view'

/**
 * The form renders every number field as a slider spanning its own min..max, so
 * both ends of that slider are values a user can land on with one drag. A bound
 * the calculator's own `compute` rejects is therefore a broken control: the form
 * offers a value the calculator refuses.
 *
 * This walks the whole registry and drags each slider to each end with every
 * other field left at its default, asserting a result comes back. It fails if
 * anyone reintroduces a min or max outside what compute accepts — the fix is
 * always to move the bound, never to loosen the guard.
 */

/**
 * The legitimate exceptions, keyed `slug:fieldId:bound`.
 *
 * Every entry here is a CROSS-FIELD constraint, not a bad bound: the value is
 * perfectly valid on its own and is only rejected because of what some OTHER
 * field currently holds. A down payment of $1,000,000 is a real number that a
 * $2,000,000 home supports; it fails here only because the probe leaves the home
 * price at its $400,000 default. Clamping these to the default-case limit would
 * make the slider lie in the opposite direction, and the error message is the
 * correct, informative behaviour.
 *
 * Do NOT add an entry for a bound that fails on its own terms — that is the bug
 * this test exists to catch.
 */
const CROSS_FIELD_EXCEPTIONS = new Set([
  // Down payment must stay under the home price, which is at its default here.
  'mortgage-calculator:downPayment:max',
  // Down payment plus trade-in must leave something to finance.
  'auto-loan-calculator:downPayment:max',
  // Trade-in cannot exceed the vehicle price, which is at its default here.
  'auto-loan-calculator:tradeInValue:max',
  // The monthly payment must clear the first month of interest; both of these
  // push the interest past the default payment.
  'credit-card-payoff-calculator:balance:max',
  'credit-card-payoff-calculator:apr:max',
  // Not reachable within 100 years at the default monthly deposit.
  'savings-goal-calculator:goalAmount:max',
  // Retirement age must be greater than current age; each end collides with the
  // other field's default.
  'retirement-calculator:currentAge:max',
  'retirement-calculator:retirementAge:min',
  // Existing debts eat the whole 36% back-end limit at the default income.
  'house-affordability-calculator:monthlyDebts:max',
  // Price per unit must exceed variable cost, and price is at its default here.
  'break-even-calculator:variableCostPerUnit:max',
  // A finishing time of zero is only meaningful against the other time fields,
  // which are at their defaults; the calculator wants a positive total.
  'running-pace-calculator:minutes:min',
])

/**
 * The state the form is actually in for a given unit selection:
 *
 *  - the controlling select holds `caseKey`;
 *  - every number field varying on it has been restated in the new unit, so
 *    175 cm becomes 68.9 in rather than 175 in;
 *  - every dependent select has moved to a choice valid for that case, so
 *    picking temperature does not leave "kilometre" selected.
 *
 * It reuses `convertBetween` and `withDependentSelects` — the same functions the
 * browser uses — so this cannot drift from the real behaviour, and it correctly
 * handles reciprocal pairs like L/100km ↔ mpg that a bare factor cannot express.
 *
 * Probing a variant bound against unconverted defaults would be testing a form
 * state that cannot occur.
 */
/**
 * Dependencies can chain: the converter's `value` varies on `fromUnit`, which
 * itself varies on `category`. Setting `fromUnit: celsius` without also setting
 * `category: temperature` describes a state the form cannot reach, so walk back
 * up and set whichever case of the parent makes this choice legal.
 */
function backfillControllers(
  calc: (typeof calculators)[number],
  values: Record<string, unknown>,
  fieldId: string,
) {
  const field = calc.fields.find((f) => f.id === fieldId)
  if (field?.kind !== 'select' || !field.variants) return values

  const chosen = String(values[fieldId] ?? '')
  const parent = field.variants.on
  const parentCase = Object.entries(field.variants.cases).find(([, v]) =>
    v.options.includes(chosen),
  )?.[0]
  if (!parentCase || values[parent] === parentCase) return values

  return backfillControllers(calc, { ...values, [parent]: parentCase }, parent)
}

function stateFor(calc: (typeof calculators)[number], on: string, caseKey: string) {
  // Set the case, walk up to make it legal, then settle everything downstream —
  // keeping the field under test pinned so normalisation cannot undo it.
  const pinned = new Set([on])
  const values = withDependentSelects(
    calc.fields,
    backfillControllers(calc, { ...defaultValues(calc), [on]: caseKey }, on),
    pinned,
  )

  for (const field of calc.fields) {
    if (field.kind !== 'number' || field.variants?.on !== on) continue
    const cases = field.variants.cases
    // Defaults are expressed in the first case listed — the base variant.
    const base = cases[Object.keys(cases)[0]!]
    values[field.id] = convertBetween(field.default, base, cases[caseKey])
  }
  return values
}

describe('field bounds', () => {
  const cases = calculators.flatMap((calc) =>
    calc.fields.flatMap((field) => {
      if (field.kind !== 'number') return []
      // A field with variants never offers its own top-level min/max: the
      // control is always drawn from whichever variant is selected. Those
      // resolved bounds are what a user can actually land on, so those are what
      // must compute. The top-level pair is the union of them and is only the
      // outer limit on what will be accepted at all.
      const states = field.variants
        ? Object.keys(field.variants.cases).map((caseKey) => ({
            suffix: `:${field.variants!.on}=${caseKey}`,
            values: stateFor(calc, field.variants!.on, caseKey),
          }))
        : [{ suffix: '', values: defaultValues(calc) }]

      return states.flatMap((state) => {
        const active = resolveBounds(field, state.values)
        return (['min', 'max'] as const).flatMap((bound) => {
          const value = active[bound]
          if (value === undefined) return []
          return [{ calc, fieldId: field.id, bound, value, suffix: state.suffix, state: state.values }]
        })
      })
    }),
  )

  test('the registry actually has number fields to check', () => {
    expect(cases.length).toBeGreaterThan(100)
  })

  test.each(
    cases.map((c) => [`${c.calc.slug}:${c.fieldId}${c.suffix}:${c.bound}`, c] as const),
  )(
    '%s is a value compute accepts',
    (key, { calc, fieldId, value, state }) => {
      const values = { ...state, [fieldId]: value }
      let error: unknown
      try {
        calc.compute(values as never)
      } catch (e) {
        error = e
      }

      if (CROSS_FIELD_EXCEPTIONS.has(key)) {
        // Pin the exceptions too, so one that quietly starts passing gets
        // pruned from the allowlist rather than lingering as dead cover.
        expect(error, `${key} is allowlisted but no longer fails`).toBeDefined()
        return
      }

      expect(
        error && (error as Error).message,
        `${key} = ${value} is offered by the form but rejected by compute`,
      ).toBeUndefined()
    },
  )

  test.each(calculators.map((c) => [c.slug, c] as const))('%s defaults sit inside their bounds', (
    _slug,
    calc,
  ) => {
    for (const field of calc.fields) {
      if (field.kind !== 'number') continue
      if (field.min !== undefined) expect(field.default).toBeGreaterThanOrEqual(field.min)
      if (field.max !== undefined) expect(field.default).toBeLessThanOrEqual(field.max)
      if (!field.variants) continue
      // The default is typed in the BASE variant's unit — the first case listed
      // — so it has to sit inside that variant's own narrower bounds too, or the
      // form opens with a value its own control rejects.
      const [baseKey] = Object.keys(field.variants.cases)
      const base = field.variants.cases[baseKey]!
      expect(base.factor ?? 1, `${field.id}: the first case is the base, factor 1`).toBe(1)
      if (base.min !== undefined) expect(field.default).toBeGreaterThanOrEqual(base.min)
      if (base.max !== undefined) expect(field.default).toBeLessThanOrEqual(base.max)
      // The top-level pair is the union: no variant may reach outside it.
      for (const variant of Object.values(field.variants.cases)) {
        if (variant.min !== undefined && field.min !== undefined)
          expect(variant.min).toBeGreaterThanOrEqual(field.min)
        if (variant.max !== undefined && field.max !== undefined)
          expect(variant.max).toBeLessThanOrEqual(field.max)
      }
    }
  })
})

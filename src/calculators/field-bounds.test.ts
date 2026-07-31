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
  // Mutually exclusive events cannot overlap, so P(A) + P(B) <= 100. P(A) = 100
  // is a perfectly good value — when P(B) is 0 — and is only refused here
  // because the probe leaves P(B) at its 20 default. Narrowing the slider to 80
  // would lie in the other direction, and the refusal names the fix.
  'probability-calculator:probA:relationship=exclusive:max',
  'probability-calculator:probB:relationship=exclusive:max',
  // A lease only makes sense while the residual sits below the capitalized cost
  // — the payment is largely the difference between them. Both ends of that
  // comparison are reachable on their own; each is refused here only because the
  // probe holds the other field at its default. Widening a slider cannot help,
  // and narrowing one would forbid legitimate leases.
  'car-lease-calculator:capCost:min',
  'car-lease-calculator:residualValue:max',
  // $100k of cash down is a real number to be able to type — it just exceeds the
  // entire cost of the default $35k car, and the refusal says exactly that.
  'car-lease-calculator:downPayment:max',
  // What is left cannot exceed what you started with. Either end of that
  // comparison is fine on its own; the probe pins the other one at its default.
  'half-life-calculator:initialAmount:mode=halfLife:min',
  'half-life-calculator:initialAmount:mode=time:min',
  'half-life-calculator:remainingAmount:mode=halfLife:max',
  'half-life-calculator:remainingAmount:mode=time:max',
  // 100000 time units is only unreachable *against the default 5-unit half-life*
  // — 20000 halvings, and 2^-20000 is exactly zero in a double, so there is no
  // initial amount to report. With a longer half-life the same elapsed time is
  // ordinary. Keys are mode-qualified rather than a bare base key so the same
  // bound failing in another mode would still surface.
  'half-life-calculator:elapsedTime:mode=initial:max',
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
    const converted = convertBetween(field.default, base, cases[caseKey])

    // Then clamp, because that is what the browser does. studio.ts bounds the
    // input after re-pointing min/max, so a case that genuinely NARROWS the
    // range cannot leave a stale value behind. For a plain unit switch this is
    // a no-op — cm and in describe the same window, so a converted value is
    // already inside it. It bites where a variant changes the subject rather
    // than the unit: body-surface-area's infant modes top out at 110 cm and
    // 30 kg, and without clamping this state would carry a 178 cm, 80 kg adult
    // into them and then blame compute for refusing it.
    const variant = cases[caseKey]!
    const min = variant.min ?? field.min ?? -Infinity
    const max = variant.max ?? field.max ?? Infinity
    values[field.id] = Math.min(Math.max(converted, min), max)
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
      const variantStates = field.variants
        ? Object.keys(field.variants.cases).map((caseKey) => ({
            suffix: `:${field.variants!.on}=${caseKey}`,
            values: stateFor(calc, field.variants!.on, caseKey),
          }))
        : [{ suffix: '', values: defaultValues(calc) }]

      // Every OTHER select, at every option — not just its default.
      //
      // Holding the rest of the form at its defaults meant a select was always
      // pinned to its first option, so whole code paths never had their bounds
      // probed: vo2max's four test methods, income-tax's filing statuses, the
      // shape selects in area/volume/concrete, and every `sex` field in the
      // health calculators, whose formulas carry different coefficients per sex.
      // A bound valid for one branch can be rejected outright by another.
      //
      // One select is varied at a time rather than every combination: the full
      // cartesian product is exponential in the select count and buys little,
      // since a bound that fails usually fails on the branch alone. `stateFor`
      // is reused unchanged — for a select no number field varies on, its
      // conversion pass is simply a no-op, while `backfillControllers` still
      // makes a dependent select's option legal.
      const branchStates = calc.fields.flatMap((other) => {
        if (other.kind !== 'select') return []
        if (other.id === field.variants?.on) return [] // already covered above
        return other.options
          .map((option) => option.value)
          .filter((value) => value !== other.default)
          .map((value) => ({
            suffix: `:${other.id}=${value}`,
            values: stateFor(calc, other.id, value),
          }))
      })

      const states = [...variantStates, ...branchStates]

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
    (key, { calc, fieldId, bound, value, state }) => {
      const values = { ...state, [fieldId]: value }
      let error: unknown
      try {
        calc.compute(values as never)
      } catch (e) {
        error = e
      }

      // An allowlisted cross-field constraint holds on every branch, not just
      // the default one: a down payment capped by the home price is still
      // capped by it when the term changes from 30 years to 15. So a suffixed
      // key falls back to its unsuffixed base rather than needing one entry per
      // select option, which would be dozens of lines saying the same thing.
      //
      // The cost is that a branch failing for a DIFFERENT reason would be
      // covered by the base entry. That is why the allowlist is documented as
      // meaning "cross-field, not a bad bound", and why it stays pinned both
      // ways below — an entry that stops failing has to be removed.
      const baseKey = `${calc.slug}:${fieldId}:${bound}`
      if (CROSS_FIELD_EXCEPTIONS.has(key) || CROSS_FIELD_EXCEPTIONS.has(baseKey)) {
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

/**
 * A number field renders as a slider, and an HTML range snaps to `min + n *
 * step`. A default off that grid therefore looks correct until someone touches
 * the control, at which point it silently shifts — a 1.2 m dimension becoming
 * 1.21, or a $25,000 goal becoming $25,001. Nothing else in the suite sees it,
 * because the value only moves on interaction.
 *
 * Variants that CONVERT are exempt by nature: 70 kg is 154.3235835 lb, and no
 * choice of step lands a converted quantity on a grid. Only the base default and
 * non-converting variants are checked.
 *
 * Entries below are pre-existing debt, pinned both ways — fix one and this test
 * fails until you delete its line, so the list can only shrink.
 */
const OFF_GRID_DEBT = new Set([
  'savings-goal-calculator:goalAmount',
  'right-triangle-calculator:sideA',
  'right-triangle-calculator:sideB',
  'circle-calculator:value',
  'unit-converter-calculator:value[celsius]',
  'unit-converter-calculator:value[fahrenheit]',
  'fuel-cost-calculator:distance',
  'cooking-converter-calculator:amount[millilitre]',
])

describe('slider step grid', () => {
  test('every number default lands on min + n x step', () => {
    const offGrid: string[] = []
    const onGrid: string[] = []

    const check = (key: string, min: number | undefined, step: number | undefined, def: number) => {
      if (min === undefined || step === undefined || step <= 0) return
      const n = (def - min) / step
      ;(Math.abs(n - Math.round(n)) > 1e-9 ? offGrid : onGrid).push(key)
    }

    for (const calc of calculators) {
      for (const field of calc.fields) {
        if (field.kind !== 'number') continue
        check(`${calc.slug}:${field.id}`, field.min, field.step, field.default)
        if (!field.variants) continue
        for (const [name, variant] of Object.entries(field.variants.cases)) {
          // A converting variant restates the same quantity, so its value cannot
          // be made to land on a grid. Only non-converting ones are checkable.
          if ((variant.factor ?? 1) !== 1 || variant.convert) continue
          check(
            `${calc.slug}:${field.id}[${name}]`,
            variant.min ?? field.min,
            variant.step ?? field.step,
            field.default,
          )
        }
      }
    }

    expect(
      offGrid.filter((k) => !OFF_GRID_DEBT.has(k)),
      'New off-grid defaults. The slider will shift these the moment it is touched',
    ).toEqual([])

    expect(
      onGrid.filter((k) => OFF_GRID_DEBT.has(k)),
      'Fixed — delete these from OFF_GRID_DEBT',
    ).toEqual([])
  })
})

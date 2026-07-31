import type { Field } from '../../../lib/types'

/**
 * Subject and units are one select, not two, because `variants.on` names a
 * single controlling field and both facts have to move the bounds. An infant is
 * measured lying down over roughly 35-110 cm; an adult stands 105-250 cm. Two
 * separate selects would need bounds keyed on a pair, which the engine does not
 * express — and inventing that for one calculator would push a composite key
 * through the island, the tick labels and the bounds test to serve four
 * combinations that fit in one list.
 *
 * Height leads the number fields deliberately: every one of the five formulas
 * carries a height term, so a nudge to it always moves the result. (The e2e
 * suite sets the first number field to 1.1x its default and demands a valid,
 * different answer — 178 cm becomes 195.8 cm, comfortably inside the cap.)
 *
 * The top-level min/max on each number field stay the union of the four cases —
 * the absolute accepted range — while the variants are what the control offers.
 */
export const fields = [
  {
    kind: 'select',
    id: 'mode',
    label: 'Who is being measured',
    default: 'adult-metric',
    options: [
      { value: 'adult-metric', label: 'Adult or child — cm, kg' },
      { value: 'adult-imperial', label: 'Adult or child — in, lb' },
      { value: 'infant-metric', label: 'Infant under 2 — cm, kg' },
      { value: 'infant-imperial', label: 'Infant under 2 — in, lb' },
    ],
    help: 'Pick an infant option for a baby. Saying so is what lets the form accept a 50 cm newborn without having to read every small number as a mistyped adult.',
  },
  {
    kind: 'number',
    id: 'height',
    // One label for two measurements, because a label cannot vary with the
    // select. They are close but not interchangeable: recumbent length runs a
    // little longer than standing height in the same child, which is why infant
    // charts and adult charts are drawn against different measurements.
    label: 'Height or length',
    default: 178,
    // The union of the four cases below: 14 is the imperial infant floor and 250
    // the metric adult ceiling. The outer limit on what is accepted at all,
    // never a slider a visitor sees.
    min: 14,
    max: 250,
    step: 0.5,
    unit: 'cm',
    help: 'Standing height for an adult or child, recumbent length for an infant. Measure rather than estimate — surface area moves faster with height than with weight.',
    // Each pair states one window in two units: 105 cm and 42 in (106.7 cm) for
    // an adult, 35 cm and 14 in (35.6 cm) for an infant. All eight bounds sit
    // inside the window `compute` accepts for that mode, so both ends of every
    // slider are values it answers rather than refuses.
    variants: {
      on: 'mode',
      cases: {
        'adult-metric': { min: 105, max: 250, step: 0.5, unit: 'cm' },
        'adult-imperial': { min: 42, max: 98, step: 0.5, unit: 'in', factor: 0.39370078740157477 },
        // 35 cm reaches a very preterm infant; 110 cm is a large two-year-old.
        // The overlap with the adult floor is deliberate and now harmless: the
        // mode carries the information the range used to have to carry alone.
        'infant-metric': { min: 35, max: 110, step: 0.5, unit: 'cm' },
        'infant-imperial': { min: 14, max: 43, step: 0.5, unit: 'in', factor: 0.39370078740157477 },
      },
    },
  },
  {
    kind: 'number',
    id: 'weight',
    label: 'Weight',
    default: 80,
    // Union again: 0.5 is the metric infant floor and 660 the imperial adult
    // ceiling.
    min: 0.5,
    max: 660,
    step: 0.5,
    unit: 'kg',
    // 44 lb is 19.96 kg and 660 lb is 299.4 kg, so each imperial cap is the
    // metric one in other clothes rather than a wider or narrower range, and
    // both adult ceilings sit under compute's 650 kg plausibility guard. The
    // infant floor of 0.5 kg is below the smallest surviving preterm birth on
    // record, and 30 kg is above a two-year-old.
    variants: {
      on: 'mode',
      cases: {
        'adult-metric': { min: 20, max: 300, step: 0.5, unit: 'kg' },
        'adult-imperial': { min: 44, max: 660, step: 1, unit: 'lb', factor: 2.2046226218487757 },
        'infant-metric': { min: 0.5, max: 30, step: 0.1, unit: 'kg' },
        'infant-imperial': { min: 1, max: 66, step: 0.5, unit: 'lb', factor: 2.2046226218487757 },
      },
    },
  },
] as const satisfies readonly Field[]

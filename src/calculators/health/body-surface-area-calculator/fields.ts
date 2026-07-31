import type { Field } from '../../../lib/types'

/**
 * Height leads the number fields deliberately: every one of the five formulas
 * carries a height term, so a nudge to it always moves the result. (The e2e
 * suite sets the first number field to 1.1x its default and demands a valid,
 * different answer — 178 cm becomes 195.8 cm, comfortably inside the cap.)
 *
 * Both measurements carry `variants` keyed off the units select, because a
 * bound that is sane in centimetres is nonsense in inches. The top-level
 * min/max stay the union of the two — the absolute accepted range — while the
 * variants are what the control actually offers.
 */
export const fields = [
  {
    kind: 'select',
    id: 'units',
    label: 'Units',
    default: 'metric',
    options: [
      { value: 'metric', label: 'Metric (cm, kg)' },
      { value: 'imperial', label: 'Imperial (in, lb)' },
    ],
    help: 'Every formula is published in centimetres and kilograms; imperial input is converted first.',
  },
  {
    kind: 'number',
    id: 'height',
    label: 'Height',
    default: 178,
    // The union of the two cases below, in whatever number each case states —
    // 42 is the imperial floor and 250 the metric ceiling. It is the outer
    // limit on what is accepted at all, never a slider a visitor sees.
    min: 42,
    max: 250,
    step: 0.5,
    unit: 'cm',
    help: 'Standing height, from about 105 cm (42 in) upward. A value under a metre is refused as a likely unit mix-up.',
    // 105 cm and 42 in (106.7 cm) are the same floor in two units, and 250 cm
    // and 98 in (248.9 cm) the same ceiling. Every one of the four sits inside
    // the 100-272 cm window `compute` accepts, so both ends of both sliders are
    // values it answers rather than refuses.
    //
    // The floor stops at about a four-year-old rather than reaching a newborn on
    // purpose. A metric floor low enough for an infant would overlap the range a
    // person types when they enter inches with the metric selector still set —
    // 60 to 75 for an adult — and the calculator could no longer tell a toddler
    // from a unit mistake. Paediatric BSA below a metre needs a measured length
    // and a formula chosen for it, not this form.
    variants: {
      on: 'units',
      cases: {
        metric: { min: 105, max: 250, step: 0.5, unit: 'cm' },
        imperial: { min: 42, max: 98, step: 0.5, unit: 'in', factor: 0.39370078740157477 },
      },
    },
  },
  {
    kind: 'number',
    id: 'weight',
    label: 'Weight',
    default: 80,
    // Union again: 20 is the metric floor and 660 the imperial ceiling.
    min: 20,
    max: 660,
    step: 0.5,
    unit: 'kg',
    // 44 lb is 19.96 kg and 660 lb is 299.4 kg, so each imperial cap is the
    // metric one in other clothes rather than a wider or narrower range, and
    // both ceilings sit under compute's 650 kg plausibility guard. The floor
    // matches the height floor: 20 kg is roughly what a four-year-old weighs.
    variants: {
      on: 'units',
      cases: {
        metric: { min: 20, max: 300, step: 0.5, unit: 'kg' },
        imperial: { min: 44, max: 660, step: 1, unit: 'lb', factor: 2.2046226218487757 },
      },
    },
  },
] as const satisfies readonly Field[]

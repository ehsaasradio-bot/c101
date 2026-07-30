import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its input type from
 * them without importing `index.ts` — which imports `compute.ts` and would cycle.
 *
 * Everything except the two opening counts is expressed in whichever unit system
 * the `units` select holds, and the arithmetic is unit-free: an area is a length
 * times a length, and coverage is already "area per volume" in the same pair of
 * units. Only the door and window deductions are physical constants, so those
 * are the only things `compute` has to convert.
 *
 * `roomLength` is deliberately the first number field: the end-to-end suite
 * nudges that field to 1.1x its default, and a longer room is valid anywhere in
 * the range and always moves the headline volume.
 */

/** 1 m = 3.2808398950131235 ft (1 ft = 0.3048 m, exact). */
const FT_PER_M = 3.2808398950131235
/**
 * Coverage scales, but the factor combines two conversions:
 *   ft²/gal = m²/L x (1 ft² / 0.09290304 m²) x (3.785411784 L / gal)
 *           = m²/L x 586.74 / 14.4 = m²/L x 40.745833...
 */
const FT2_PER_GAL_PER_M2_PER_L = 40.74583333333333
/** 1 L = 0.26417205235814845 US gallons (1 gal = 231 in³ = 3.785411784 L, exact). */
const GAL_PER_L = 0.26417205235814845

export const fields = [
  {
    kind: 'select',
    id: 'units',
    label: 'Units',
    default: 'metric',
    options: [
      { value: 'metric', label: 'Metric (m, litres)' },
      { value: 'imperial', label: 'Imperial (ft, US gallons)' },
    ],
  },
  {
    kind: 'number',
    id: 'roomLength',
    label: 'Room length',
    default: 5,
    // Top-level min/max are the union across both variants — the absolute range
    // the field will ever accept. The variants narrow the control to the unit
    // actually selected, so a foot-based visitor is not handed a metre slider.
    min: 0.5,
    max: 100,
    step: 0.1,
    unit: 'm',
    variants: {
      on: 'units',
      cases: {
        metric: { min: 0.5, max: 30, step: 0.1, unit: 'm' },
        imperial: { min: 1.5, max: 100, step: 0.5, unit: 'ft', factor: FT_PER_M },
      },
    },
    help: 'Floor measurement of the longer wall. This paints walls, not the ceiling or floor.',
  },
  {
    kind: 'number',
    id: 'roomWidth',
    label: 'Room width',
    default: 4,
    min: 0.5,
    max: 100,
    step: 0.1,
    unit: 'm',
    variants: {
      on: 'units',
      cases: {
        metric: { min: 0.5, max: 30, step: 0.1, unit: 'm' },
        imperial: { min: 1.5, max: 100, step: 0.5, unit: 'ft', factor: FT_PER_M },
      },
    },
  },
  {
    kind: 'number',
    id: 'wallHeight',
    label: 'Wall height',
    default: 2.4,
    min: 1.5,
    max: 20,
    step: 0.1,
    unit: 'm',
    variants: {
      on: 'units',
      cases: {
        metric: { min: 1.5, max: 6, step: 0.1, unit: 'm' },
        imperial: { min: 5, max: 20, step: 0.5, unit: 'ft', factor: FT_PER_M },
      },
    },
    help: 'Floor to ceiling. 2.4 m (8 ft) is the usual modern ceiling height.',
  },
  {
    kind: 'number',
    id: 'doors',
    label: 'Doors',
    default: 1,
    min: 0,
    max: 10,
    step: 1,
    unit: 'doors',
    help: 'Each door removes 20 sq ft (1.86 m²) of wall from the total.',
  },
  {
    kind: 'number',
    id: 'windows',
    label: 'Windows',
    default: 2,
    min: 0,
    max: 20,
    step: 1,
    unit: 'windows',
    help: 'Each window removes 15 sq ft (1.39 m²) of wall from the total.',
  },
  {
    kind: 'number',
    id: 'coats',
    label: 'Coats',
    default: 2,
    min: 1,
    max: 5,
    step: 1,
    unit: 'coats',
    help: 'Two is standard. Allow three over a strong colour or bare plaster.',
  },
  {
    kind: 'number',
    id: 'coverage',
    label: 'Coverage per unit of paint',
    default: 10,
    min: 1,
    max: 1000,
    step: 0.5,
    unit: 'm²/L',
    // A pure scale-up: the same paint spread over the same wall, said in
    // different units, so switching restates the tin rather than changing it.
    variants: {
      on: 'units',
      cases: {
        metric: { min: 1, max: 25, step: 0.5, unit: 'm²/L' },
        imperial: {
          min: 40,
          max: 1000,
          step: 5,
          unit: 'ft²/gal',
          factor: FT2_PER_GAL_PER_M2_PER_L,
        },
      },
    },
    help: 'Printed on the tin. Emulsion is typically 10-13 m² per litre, or 400-500 sq ft per gallon.',
  },
  {
    kind: 'number',
    id: 'canSize',
    label: 'Tin size',
    default: 2.5,
    min: 0.25,
    max: 20,
    step: 0.25,
    unit: 'L',
    variants: {
      on: 'units',
      cases: {
        metric: { min: 0.5, max: 20, step: 0.25, unit: 'L' },
        imperial: { min: 0.25, max: 5, step: 0.25, unit: 'gal', factor: GAL_PER_L },
      },
    },
    help: 'The size you actually buy — 2.5 L and 5 L tins in metric shops, quarts and gallons in US ones.',
  },
  {
    kind: 'number',
    id: 'pricePerCan',
    label: 'Price per tin',
    default: 30,
    min: 0,
    max: 500,
    step: 1,
    unit: 'per tin',
    // Deliberately no variants: a tin's price does not restate when the unit
    // system changes, because the tin's size is its own field alongside.
    help: 'What one tin of the size above costs.',
  },
] as const satisfies readonly Field[]

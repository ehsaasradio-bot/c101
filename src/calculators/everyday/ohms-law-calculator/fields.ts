import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * Ohm's law needs any TWO of {V, I, R, P}; `mode` says which two are the inputs
 * and the other two fall out. Every quantity keeps its own box whatever the
 * mode, so switching modes never throws away what you already typed.
 *
 * `voltage` is deliberately the first NUMBER field: the end-to-end suite nudges
 * it to 1.1x its default and expects a different but still valid answer, and the
 * default mode ("voltage and resistance") reads it — current is exactly
 * proportional to it.
 *
 * The defaults are mutually consistent — 12 V across 4 ohms draws 3 A and
 * dissipates 36 W — so every mode agrees at the defaults and the page reads as
 * one circuit rather than four unrelated numbers.
 *
 * Bounds: every variant bound below is a value `compute` accepts expressed in
 * that variant's own unit, and the top-level pair is their union. Voltage's
 * minimum is strictly positive because solving a circuit at exactly 0 V is
 * either trivially all-zero or genuinely indeterminate. Resistance and power may
 * be exactly zero, which is what makes the short-circuit and open-circuit
 * answers reachable by dragging a slider rather than only by typing.
 */
export const fields = [
  {
    kind: 'select',
    id: 'mode',
    label: 'Which two do you know?',
    default: 'vr',
    options: [
      { value: 'vr', label: 'Voltage and resistance' },
      { value: 'vi', label: 'Voltage and current' },
      { value: 'ir', label: 'Current and resistance' },
      { value: 'vp', label: 'Voltage and power' },
      { value: 'ip', label: 'Current and power' },
      { value: 'rp', label: 'Resistance and power' },
    ],
    help: 'The other two are solved from these. Boxes the mode does not use are ignored.',
  },
  {
    kind: 'number',
    id: 'voltage',
    label: 'Voltage (V)',
    default: 12,
    min: 0.01,
    max: 100_000,
    step: 0.01,
    unit: 'V',
    help: 'The potential difference across the component, in volts.',
  },
  {
    kind: 'number',
    id: 'current',
    label: 'Current (I)',
    // The union across the three variants: 0.001 A = 1 mA = 0.001 kA at the
    // bottom, 100000 mA = 100 A at the top.
    default: 3,
    min: 0.001,
    max: 100_000,
    step: 0.001,
    unit: 'A',
    variants: {
      on: 'currentUnit',
      cases: {
        // Base first, factor 1. Every other factor is "value here / value in A".
        A: { min: 0.001, max: 1000, step: 0.001, unit: 'A' },
        mA: { min: 1, max: 100_000, step: 1, unit: 'mA', factor: 1000 },
        kA: { min: 0.001, max: 1, step: 0.001, unit: 'kA', factor: 0.001 },
      },
    },
    help: 'The current through the component. Type 0 to model an open circuit.',
  },
  {
    kind: 'select',
    id: 'currentUnit',
    label: 'Current unit',
    default: 'A',
    options: [
      { value: 'A', label: 'Amperes (A)' },
      { value: 'mA', label: 'Milliamperes (mA)' },
      { value: 'kA', label: 'Kiloamperes (kA)' },
    ],
  },
  {
    kind: 'number',
    id: 'resistance',
    label: 'Resistance (R)',
    default: 4,
    min: 0,
    max: 1_000_000,
    step: 0.1,
    unit: 'Ω',
    variants: {
      on: 'resistanceUnit',
      cases: {
        ohm: { min: 0, max: 1_000_000, step: 0.1, unit: 'Ω' },
        kohm: { min: 0, max: 1000, step: 0.1, unit: 'kΩ', factor: 0.001 },
        Mohm: { min: 0, max: 1, step: 0.001, unit: 'MΩ', factor: 0.000001 },
      },
    },
    help: 'Zero resistance is a short circuit, and the result says so rather than printing a number.',
  },
  {
    kind: 'select',
    id: 'resistanceUnit',
    label: 'Resistance unit',
    default: 'ohm',
    options: [
      { value: 'ohm', label: 'Ohms (Ω)' },
      { value: 'kohm', label: 'Kilohms (kΩ)' },
      { value: 'Mohm', label: 'Megohms (MΩ)' },
    ],
  },
  {
    kind: 'number',
    id: 'power',
    label: 'Power (P)',
    default: 36,
    min: 0,
    max: 1_000_000,
    step: 0.1,
    unit: 'W',
    variants: {
      on: 'powerUnit',
      cases: {
        W: { min: 0, max: 1_000_000, step: 0.1, unit: 'W' },
        mW: { min: 0, max: 1_000_000, step: 1, unit: 'mW', factor: 1000 },
        kW: { min: 0, max: 1000, step: 0.1, unit: 'kW', factor: 0.001 },
      },
    },
    help: 'Power dissipated. Never negative for a resistor, lamp, heater or motor.',
  },
  {
    kind: 'select',
    id: 'powerUnit',
    label: 'Power unit',
    default: 'W',
    options: [
      { value: 'W', label: 'Watts (W)' },
      { value: 'mW', label: 'Milliwatts (mW)' },
      { value: 'kW', label: 'Kilowatts (kW)' },
    ],
  },
] as const satisfies readonly Field[]

import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * PV = nRT has four quantities and one equation, so any THREE fix the fourth.
 * `solveFor` names the unknown; every quantity keeps its own box whatever the
 * mode, so switching what you are solving for never throws away what you typed.
 *
 * `pressure` is deliberately the first NUMBER field: the end-to-end suite nudges
 * it to 1.1x its default and expects a different but still valid answer, and the
 * default mode (solve for moles) reads it — n is exactly proportional to P.
 *
 * THE DEFAULTS ARE STP, and they are mutually consistent. One mole of an ideal
 * gas at 1 atm and 273.15 K occupies RT/P = 22.413969545 L. The default volume
 * is that figure rounded to the familiar 22.414 L, so every mode agrees at the
 * defaults to about 1.4 parts per million — n = 1.0000 mol, P = 1.00000 atm,
 * V = 22.4140 L, T = 273.15 K — and the page reads as one gas sample rather
 * than four unrelated numbers.
 *
 * Bounds: every variant bound below is a value `compute` accepts expressed in
 * that variant's own unit, and the top-level pair is their union. Pressure,
 * volume and amount all have strictly positive minima because a slider reaches
 * its own left end in one drag and PV = nRT has nothing to say at zero.
 * Temperature is the interesting one — its floor is absolute zero, which sits at
 * a different NUMBER on each scale, so each case carries its own.
 */
export const fields = [
  {
    kind: 'select',
    id: 'solveFor',
    label: 'Solve for',
    default: 'moles',
    options: [
      { value: 'moles', label: 'Amount of gas (n)' },
      { value: 'pressure', label: 'Pressure (P)' },
      { value: 'volume', label: 'Volume (V)' },
      { value: 'temperature', label: 'Temperature (T)' },
    ],
    help: 'The other three are the knowns. The box for the unknown is ignored.',
  },
  {
    kind: 'number',
    id: 'pressure',
    label: 'Pressure (P)',
    // The union across the five variants: 0.001 atm at the bottom, 100000 kPa
    // (about 987 atm) at the top.
    default: 1,
    min: 0.001,
    max: 100_000,
    step: 0.001,
    unit: 'atm',
    variants: {
      on: 'pressureUnit',
      cases: {
        // Base first, factor 1. Every other factor is "value here / value in
        // atm", and the first three are exact: the standard atmosphere is
        // DEFINED as 101325 Pa, and a bar as exactly 100 kPa.
        atm: { min: 0.001, max: 1000, step: 0.001, unit: 'atm' },
        kPa: { min: 0.1, max: 100_000, step: 0.1, unit: 'kPa', factor: 101.325 },
        bar: { min: 0.001, max: 1000, step: 0.001, unit: 'bar', factor: 1.01325 },
        // mmHg is taken as the torr, exactly 1/760 atm, which is the convention
        // every chemistry course uses. The metrological "conventional millimetre
        // of mercury" is 133.322387415 Pa, which makes an atmosphere 759.99989
        // of them — a difference in the eighth significant figure, and not the
        // one anybody typing a manometer reading means.
        mmHg: { min: 0.1, max: 100_000, step: 0.1, unit: 'mmHg', factor: 760 },
        // 101325 / 6894.757293168361, where a psi is 4.4482216152605 N over
        // (0.0254 m)², both exact definitions.
        psi: { min: 0.01, max: 10_000, step: 0.01, unit: 'psi', factor: 14.695948775513449 },
      },
    },
    help: 'Absolute pressure, not gauge pressure. A tyre gauge reading 32 psi is about 46.7 psi absolute.',
  },
  {
    kind: 'select',
    id: 'pressureUnit',
    label: 'Pressure unit',
    default: 'atm',
    options: [
      { value: 'atm', label: 'Atmospheres (atm)' },
      { value: 'kPa', label: 'Kilopascals (kPa)' },
      { value: 'bar', label: 'Bar' },
      { value: 'mmHg', label: 'Millimetres of mercury (mmHg)' },
      { value: 'psi', label: 'Pounds per square inch (psi)' },
    ],
  },
  {
    kind: 'number',
    id: 'volume',
    label: 'Volume (V)',
    default: 22.414,
    min: 0.001,
    max: 1_000_000,
    step: 0.001,
    unit: 'L',
    variants: {
      on: 'volumeUnit',
      cases: {
        L: { min: 0.001, max: 100_000, step: 0.001, unit: 'L' },
        mL: { min: 1, max: 1_000_000, step: 1, unit: 'mL', factor: 1000 },
        m3: { min: 0.001, max: 1000, step: 0.001, unit: 'm³', factor: 0.001 },
      },
    },
    help: 'The volume the gas actually occupies, which for a gas is the whole container.',
  },
  {
    kind: 'select',
    id: 'volumeUnit',
    label: 'Volume unit',
    default: 'L',
    options: [
      { value: 'L', label: 'Litres (L)' },
      { value: 'mL', label: 'Millilitres (mL)' },
      { value: 'm3', label: 'Cubic metres (m³)' },
    ],
  },
  {
    kind: 'number',
    id: 'moles',
    label: 'Amount of gas (n)',
    default: 1,
    min: 0.001,
    max: 10_000,
    step: 0.001,
    unit: 'mol',
    help: 'Moles of gas. Divide a mass in grams by the molar mass to get here.',
  },
  {
    kind: 'number',
    id: 'temperature',
    label: 'Temperature (T)',
    default: 273.15,
    // The union across the three scales. Neither end is absolute zero itself:
    // -273.1 °C is 0.05 K and -459.6 °F is 0.039 K, both above it, because a
    // slider that reaches exactly 0 K would offer a state PV = nRT cannot
    // describe.
    min: -459.6,
    max: 9000,
    step: 0.01,
    unit: 'K',
    variants: {
      on: 'temperatureUnit',
      cases: {
        // Celsius and Fahrenheit are OFFSET scales, not multiples of the kelvin,
        // so a plain `factor` cannot express them: 20 °C is 293.15 K, and no
        // single multiplier maps one onto the other. `convert: {kind: 'affine'}`
        // means value = K × factor + offset, which `convertBetween` inverts when
        // the unit changes, so 273.15 K becomes 0 °C and 32 °F rather than 273.15
        // of each.
        K: { min: 0.01, max: 6000, step: 0.01, unit: 'K' },
        C: {
          min: -273.1,
          max: 5000,
          step: 0.01,
          unit: '°C',
          convert: { kind: 'affine', factor: 1, offset: -273.15 },
        },
        F: {
          min: -459.6,
          max: 9000,
          step: 0.01,
          unit: '°F',
          convert: { kind: 'affine', factor: 1.8, offset: -459.67 },
        },
      },
    },
    help: 'Absolute temperature drives the gas law, so anything at or below absolute zero is refused.',
  },
  {
    kind: 'select',
    id: 'temperatureUnit',
    label: 'Temperature unit',
    default: 'K',
    options: [
      { value: 'K', label: 'Kelvin (K)' },
      { value: 'C', label: 'Celsius (°C)' },
      { value: 'F', label: 'Fahrenheit (°F)' },
    ],
  },
] as const satisfies readonly Field[]

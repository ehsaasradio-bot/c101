import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, Series, Values } from '../../../lib/types'
import type { fields } from './fields'

/*
 * The ideal gas law — Clapeyron, 1834, combining Boyle, Charles, Gay-Lussac and
 * Avogadro into one relation:
 *
 *     P V = n R T
 *
 * One equation in four quantities, so ANY three of {P, V, n, T} determine the
 * fourth. `solveFor` names the unknown; the four rearrangements are
 *
 *     n = P·V / (R·T)      P = n·R·T / V
 *     V = n·R·T / P        T = P·V / (n·R)
 *
 * THE GAS CONSTANT. Since the 2019 SI redefinition, R is not measured — it is
 * fixed, because both of its factors are:
 *
 *     R = N_A × k_B
 *       = 6.02214076e23 mol⁻¹ × 1.380649e-23 J·K⁻¹
 *       = 8.31446261815324 J·mol⁻¹·K⁻¹, exactly.
 *
 * `R_SI` below is that to ten significant figures, 8.314462618, which is the
 * form CODATA publishes and the one this calculator is specified against; the
 * truncation costs 2e-11 relative, some seven orders of magnitude smaller than
 * the ideal-gas approximation itself.
 *
 * The L·atm form every chemistry course uses is DERIVED from it here rather than
 * copied out of a table, because the conversion is exact and a table is not:
 * the standard atmosphere is defined as 101325 Pa and the litre as 1e-3 m³, so
 * one litre-atmosphere is 101325 × 1e-3 = 101.325 J exactly, and
 *
 *     R = 8.314462618 / 101.325 = 0.08205736607944733 L·atm·mol⁻¹·K⁻¹
 *
 * which is the familiar 0.082057366. Every solve below runs in litres,
 * atmospheres, moles and kelvin.
 *
 * Selects arrive as strings — the derived Values type makes forgetting that a
 * compile error rather than a NaN later.
 */

/** J·mol⁻¹·K⁻¹. Exact by SI definition; see the note above. */
const R_SI = 8.314462618

/** 1 atm ≡ 101325 Pa and 1 L ≡ 1e-3 m³, so 1 L·atm is 101.325 J exactly. */
const JOULES_PER_LITRE_ATM = 101.325

/** L·atm·mol⁻¹·K⁻¹ — 0.082057366…, derived, never copied. */
const R = R_SI / JOULES_PER_LITRE_ATM

const MODES = ['moles', 'pressure', 'volume', 'temperature'] as const
type Mode = (typeof MODES)[number]

const isMode = (s: string): s is Mode => (MODES as readonly string[]).includes(s)

/**
 * Multipliers OUT of the base unit: "one base unit is this many of these". The
 * base variant of each field is 1, matching `fields.ts`, so a typed value
 * divides by its factor to reach the base and a computed one multiplies.
 */
const PRESSURE_UNITS: Readonly<Record<string, number>> = {
  atm: 1,
  kPa: 101.325,
  bar: 1.01325,
  mmHg: 760,
  psi: 14.695948775513449,
}

const PRESSURE_SYMBOL: Readonly<Record<string, string>> = {
  atm: 'atm',
  kPa: 'kPa',
  bar: 'bar',
  mmHg: 'mmHg',
  psi: 'psi',
}

const VOLUME_UNITS: Readonly<Record<string, number>> = { L: 1, mL: 1000, m3: 0.001 }

const VOLUME_SYMBOL: Readonly<Record<string, string>> = { L: 'L', mL: 'mL', m3: 'm³' }

/**
 * Temperature is affine, not proportional: value = K × factor + offset. That is
 * the whole reason `fields.ts` carries `convert: { kind: 'affine' }` instead of
 * a factor — 0 °C and 0 K are not the same temperature, and no multiplier can
 * make them agree.
 */
const TEMPERATURE_SCALES: Readonly<Record<string, { factor: number; offset: number }>> = {
  K: { factor: 1, offset: 0 },
  C: { factor: 1, offset: -273.15 },
  F: { factor: 1.8, offset: -459.67 },
}

const TEMPERATURE_SYMBOL: Readonly<Record<string, string>> = { K: 'K', C: '°C', F: '°F' }

const LABEL: Readonly<Record<Mode, string>> = {
  moles: 'Amount of gas',
  pressure: 'Pressure',
  volume: 'Volume',
  temperature: 'Temperature',
}

const FORMULA: Readonly<Record<Mode, string>> = {
  moles: 'n = P × V ÷ (R × T)',
  pressure: 'P = n × R × T ÷ V',
  volume: 'V = n × R × T ÷ P',
  temperature: 'T = P × V ÷ (n × R)',
}

/**
 * Significant-looking decimals across the eight orders of magnitude these
 * fields span. A fixed precision prints either "1.00 mol" for a mole of gas or
 * "0.00 mol" for a syringe of it, and both read as a bug.
 *
 * The bands are deliberately wide around 1. A pressure of exactly 1 atm and a
 * pressure solved as 0.999998641 atm are the same reading, and a boundary at
 * 1.0 would print them as "1.0000 atm" and "1.00000 atm" — the same number,
 * shown two different ways depending on which box it came from.
 */
function decimalsFor(value: number): number {
  const magnitude = Math.abs(value)
  if (magnitude === 0) return 2
  if (magnitude >= 100_000) return 0
  if (magnitude >= 1000) return 1
  if (magnitude >= 100) return 2
  if (magnitude >= 0.1) return 4
  if (magnitude >= 0.001) return 6
  return 8
}

const show = (label: string, value: number, unit: string): Quantity => ({
  label,
  value,
  format: { style: 'decimal', decimals: decimalsFor(value), unit },
})

export default function compute(v: Values<typeof fields>): CalcResult {
  if (!isMode(v.solveFor)) throw new CalcError('Choose which quantity to solve for.', 'solveFor')
  const mode: Mode = v.solveFor

  const pressureFactor = PRESSURE_UNITS[v.pressureUnit]
  if (pressureFactor === undefined) throw new CalcError('Choose a pressure unit.', 'pressureUnit')
  const volumeFactor = VOLUME_UNITS[v.volumeUnit]
  if (volumeFactor === undefined) throw new CalcError('Choose a volume unit.', 'volumeUnit')
  const scale = TEMPERATURE_SCALES[v.temperatureUnit]
  if (scale === undefined) throw new CalcError('Choose a temperature unit.', 'temperatureUnit')

  const pressureSymbol = PRESSURE_SYMBOL[v.pressureUnit]!
  const volumeSymbol = VOLUME_SYMBOL[v.volumeUnit]!
  const temperatureSymbol = TEMPERATURE_SYMBOL[v.temperatureUnit]!

  /*
   * Finiteness is checked BEFORE magnitude, always. `coerceValues` hands compute
   * a raw NaN for anything the form could not parse, and every ordinary
   * comparison against NaN is false — so a bare `x <= 0` would let it fall
   * straight through into the arithmetic and surface as a NaN on the page.
   *
   * Only the three quantities the chosen mode actually reads are validated. The
   * fourth box is still on screen holding whatever it held, and refusing to
   * answer because of a number nobody asked about would be surprising.
   */
  let pressureAtm = 0
  if (mode !== 'pressure') {
    if (!Number.isFinite(v.pressure))
      throw new CalcError('Enter the pressure as a number.', 'pressure')
    if (v.pressure <= 0)
      throw new CalcError(
        `Enter an absolute pressure greater than 0 ${pressureSymbol}. A gas at zero pressure has no state to solve.`,
        'pressure',
      )
    pressureAtm = v.pressure / pressureFactor
  }

  let volumeL = 0
  if (mode !== 'volume') {
    if (!Number.isFinite(v.volume)) throw new CalcError('Enter the volume as a number.', 'volume')
    if (v.volume <= 0)
      throw new CalcError(`Enter a volume greater than 0 ${volumeSymbol}.`, 'volume')
    volumeL = v.volume / volumeFactor
  }

  let moles = 0
  if (mode !== 'moles') {
    if (!Number.isFinite(v.moles)) throw new CalcError('Enter the amount of gas as a number.', 'moles')
    if (v.moles <= 0)
      throw new CalcError('Enter an amount of gas greater than 0 mol.', 'moles')
    moles = v.moles
  }

  let kelvin = 0
  if (mode !== 'temperature') {
    if (!Number.isFinite(v.temperature))
      throw new CalcError('Enter the temperature as a number.', 'temperature')
    // Invert the affine map to reach kelvin: K = (value − offset) ÷ factor.
    kelvin = (v.temperature - scale.offset) / scale.factor
    if (kelvin <= 0)
      throw new CalcError(
        'Temperature must be above absolute zero — 0 K, −273.15 °C or −459.67 °F. Nothing colder exists, and the gas law divides by T.',
        'temperature',
      )
  }

  // One rearrangement each. Every input is strictly positive by the guards
  // above, so no branch can divide by zero and no result can be negative.
  switch (mode) {
    case 'moles':
      moles = (pressureAtm * volumeL) / (R * kelvin)
      break
    case 'pressure':
      pressureAtm = (moles * R * kelvin) / volumeL
      break
    case 'volume':
      volumeL = (moles * R * kelvin) / pressureAtm
      break
    case 'temperature':
      kelvin = (pressureAtm * volumeL) / (moles * R)
      break
  }

  // Back into whatever units the visitor is reading in.
  const pressureOut = pressureAtm * pressureFactor
  const volumeOut = volumeL * volumeFactor
  const temperatureOut = kelvin * scale.factor + scale.offset
  const molarVolume = volumeL / moles

  const quantity: Readonly<Record<Mode, Quantity>> = {
    pressure: show(LABEL.pressure, pressureOut, pressureSymbol),
    volume: show(LABEL.volume, volumeOut, volumeSymbol),
    moles: show(LABEL.moles, moles, 'mol'),
    temperature: show(LABEL.temperature, temperatureOut, temperatureSymbol),
  }

  const known = MODES.filter((id) => id !== mode)

  /*
   * The isotherm through the answer: P against V at the n and T just settled on.
   *
   * Derived from the SAME closed form as the headline rather than re-simulated.
   * Because n·R·T = P·V for the solved state, P(V·r) is exactly P ÷ r, so the
   * curve passes precisely through the reported pressure — no drift between the
   * chart and the number beside it. The ratios run 0.4 to 2.8 as (4 + i)/10,
   * which is exactly 1 at i = 6 rather than 1.0000000000000002.
   *
   * It is present in every mode and at the defaults, which is what the theme
   * needs: the chart is server-rendered from the DEFAULT result, so anything
   * drawable only off-default would never get a container to redraw into.
   */
  const ISOTHERM_POINTS = 25
  const isotherm: Array<readonly [number, number]> = []
  for (let i = 0; i < ISOTHERM_POINTS; i += 1) {
    const ratio = (4 + i) / 10
    isotherm.push([volumeOut * ratio, pressureOut / ratio])
  }

  const series: Series[] = [
    {
      label: 'Pressure along the isotherm',
      points: isotherm,
      format: { style: 'decimal', decimals: decimalsFor(pressureOut), unit: pressureSymbol },
    },
  ]

  const notes: string[] = [
    `Solved with R = ${R_SI} J·mol⁻¹·K⁻¹, which is exact: since the 2019 SI redefinition R is the product of the fixed Avogadro constant and the fixed Boltzmann constant. Working in litres and atmospheres uses R ÷ 101.325 = 0.082057366 L·atm·mol⁻¹·K⁻¹, because one litre-atmosphere is 101.325 joules exactly.`,
    'PV = nRT treats molecules as points that do not attract one another. Real gases follow it closely near room temperature and ordinary pressure, and depart from it as they are compressed or cooled towards condensing — van der Waals or a compressibility factor Z is the usual next step.',
    'Pressure here is absolute, measured from vacuum. Tyre and cylinder gauges read the difference from the surrounding air, so add about 14.7 psi, 101.3 kPa or 1 atm to a gauge reading before using it.',
  ]

  const molarVolumeStat = show('Molar volume', molarVolume, `${volumeSymbol}/mol`)

  return {
    primary: quantity[mode],
    // Always all four, in the same order, whichever one you solved for — that
    // completeness is the point of a single equation in four unknowns.
    stats: [
      quantity.pressure,
      quantity.volume,
      quantity.moles,
      quantity.temperature,
      molarVolumeStat,
    ],
    steps: [
      { ...quantity[known[0]!], label: `${LABEL[known[0]!]} (known)` },
      { ...quantity[known[1]!], label: `${LABEL[known[1]!]} (known)` },
      { ...quantity[known[2]!], label: `${LABEL[known[2]!]} (known)` },
      { rule: true },
      { ...quantity[mode], label: FORMULA[mode] },
    ],
    notes,
    series,
    // The isotherm's x is a volume in whatever unit the visitor is reading in,
    // so the axis name is computed rather than fixed: the same 25 points are
    // litres, millilitres or cubic metres depending on the select.
    chart: {
      title: 'Pressure along the isotherm',
      xLabel: `Volume (${volumeSymbol})`,
    },
  }
}

import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, Values } from '../../../lib/types'
import type { fields } from './fields'

/*
 * Ohm's law (Georg Ohm, 1827) and Joule's first law:
 *
 *     V = I · R          P = V · I
 *
 * Two identities in four quantities, so ANY two of {V, I, R, P} determine the
 * other two. Eliminating one variable between them gives the twelve derived
 * forms of the classic "Ohm's law wheel":
 *
 *     V = I·R      V = P/I      V = sqrt(P·R)
 *     I = V/R      I = P/V      I = sqrt(P/R)
 *     R = V/I      R = V²/P     R = P/I²
 *     P = V·I      P = I²·R     P = V²/R
 *
 * `mode` names the pair you know; this solves for the other two using exactly
 * two of those forms and reports which two, so the working is checkable.
 *
 * Selects arrive as strings — the derived Values type makes forgetting that a
 * compile error rather than a NaN later.
 */

const MODES = ['vr', 'vi', 'ir', 'vp', 'ip', 'rp'] as const
type Mode = (typeof MODES)[number]

const isMode = (s: string): s is Mode => (MODES as readonly string[]).includes(s)

/** Multipliers into SI base units. The base variant of each field is 1. */
const CURRENT_UNITS: Readonly<Record<string, number>> = { A: 1, mA: 1e-3, kA: 1e3 }
const RESISTANCE_UNITS: Readonly<Record<string, number>> = { ohm: 1, kohm: 1e3, Mohm: 1e6 }
const POWER_UNITS: Readonly<Record<string, number>> = { W: 1, mW: 1e-3, kW: 1e3 }

type QuantityId = 'voltage' | 'current' | 'resistance' | 'power'

const LABEL: Readonly<Record<QuantityId, string>> = {
  voltage: 'Voltage',
  current: 'Current',
  resistance: 'Resistance',
  power: 'Power',
}

const UNIT: Readonly<Record<QuantityId, string>> = {
  voltage: 'V',
  current: 'A',
  resistance: 'Ω',
  power: 'W',
}

/*
 * An infinity here is a physical statement, not a number, and printing
 * "Infinity W" or a bare em dash would be worse than useless. A short circuit
 * (zero resistance) draws unlimited current and dissipates unlimited power; an
 * open circuit (zero current) has infinite resistance. Both are real answers, so
 * they are rendered as `style: 'raw'` text rather than refused as errors.
 */
const UNBOUNDED: Readonly<Record<QuantityId, string>> = {
  voltage: 'Unbounded',
  current: 'Unlimited (short circuit)',
  resistance: 'Infinite (open circuit)',
  power: 'Unlimited (short circuit)',
}

/**
 * Significant-looking decimals across nine orders of magnitude. A fixed
 * precision prints either "3.0000 A" for a doorbell or "0.000 A" for a
 * microamp, and both read as a bug.
 */
function decimalsFor(value: number): number {
  const magnitude = Math.abs(value)
  if (magnitude === 0) return 2
  if (magnitude >= 1000) return 0
  if (magnitude >= 100) return 1
  if (magnitude >= 1) return 3
  if (magnitude >= 0.01) return 4
  return 6
}

function show(id: QuantityId, value: number, label: string = LABEL[id]): Quantity {
  if (!Number.isFinite(value)) return { label, value: UNBOUNDED[id], format: { style: 'raw' } }
  return {
    label,
    value,
    format: { style: 'decimal', decimals: decimalsFor(value), unit: UNIT[id] },
  }
}

interface Solution {
  volts: number
  amps: number
  ohms: number
  watts: number
  /** The two quantities solved for, in the order they should be presented. */
  solvedFor: readonly [QuantityId, QuantityId]
  /** The derived form used for each, same order. */
  formulas: readonly [string, string]
}

export default function compute(v: Values<typeof fields>): CalcResult {
  const { voltage, current, resistance, power } = v

  if (!isMode(v.mode)) throw new CalcError('Choose which two quantities you know.', 'mode')
  const mode: Mode = v.mode

  const currentScale = CURRENT_UNITS[v.currentUnit]
  if (currentScale === undefined) throw new CalcError('Choose a current unit.', 'currentUnit')
  const resistanceScale = RESISTANCE_UNITS[v.resistanceUnit]
  if (resistanceScale === undefined)
    throw new CalcError('Choose a resistance unit.', 'resistanceUnit')
  const powerScale = POWER_UNITS[v.powerUnit]
  if (powerScale === undefined) throw new CalcError('Choose a power unit.', 'powerUnit')

  /*
   * Finiteness is checked BEFORE magnitude, always. `coerceValues` hands compute
   * a raw NaN for anything the form could not parse, and every ordinary
   * comparison against NaN is false — so a bare `x < 0` would let it fall
   * straight through into the arithmetic and surface as a NaN on the page.
   *
   * Only the two fields the chosen mode actually reads are validated. The other
   * two boxes are still on screen holding whatever they held, and refusing to
   * answer because of a number nobody asked about would be surprising.
   */
  const needsVoltage = mode === 'vr' || mode === 'vi' || mode === 'vp'
  const needsCurrent = mode === 'vi' || mode === 'ir' || mode === 'ip'
  const needsResistance = mode === 'vr' || mode === 'ir' || mode === 'rp'
  const needsPower = mode === 'vp' || mode === 'ip' || mode === 'rp'

  if (needsVoltage) {
    if (!Number.isFinite(voltage)) throw new CalcError('Enter the voltage as a number.', 'voltage')
    if (voltage < 0) throw new CalcError('Voltage cannot be negative here — enter the size of the potential difference.', 'voltage')
    // At exactly 0 V every other quantity is either zero or undetermined, so
    // there is no circuit left to solve.
    if (voltage === 0)
      throw new CalcError('Enter a voltage greater than 0 V.', 'voltage')
  }
  if (needsCurrent) {
    if (!Number.isFinite(current)) throw new CalcError('Enter the current as a number.', 'current')
    if (current < 0)
      throw new CalcError('Current cannot be negative — enter the size of the current.', 'current')
  }
  if (needsResistance) {
    if (!Number.isFinite(resistance))
      throw new CalcError('Enter the resistance as a number.', 'resistance')
    if (resistance < 0)
      throw new CalcError('Resistance cannot be negative.', 'resistance')
  }
  if (needsPower) {
    if (!Number.isFinite(power)) throw new CalcError('Enter the power as a number.', 'power')
    // Passive components dissipate power; they never generate it.
    if (power < 0)
      throw new CalcError('Power cannot be negative for a passive component.', 'power')
  }

  const volts = voltage
  const amps = current * currentScale
  const ohms = resistance * resistanceScale
  const watts = power * powerScale

  const solution = solve(mode, { volts, amps, ohms, watts })

  const [firstId, secondId] = solution.solvedFor
  const [firstFormula, secondFormula] = solution.formulas
  const value = (id: QuantityId): number =>
    id === 'voltage'
      ? solution.volts
      : id === 'current'
        ? solution.amps
        : id === 'resistance'
          ? solution.ohms
          : solution.watts

  const knownIds = (['voltage', 'current', 'resistance', 'power'] as const).filter(
    (id) => id !== firstId && id !== secondId,
  )

  const notes: string[] = [
    'Ohm’s law describes a resistive (ohmic) load at a steady DC operating point. On AC, or with a diode, LED, motor under load, or anything with reactance, the ratio of volts to amps is not a constant and impedance replaces resistance.',
  ]
  if (!Number.isFinite(solution.amps)) {
    notes.unshift(
      'Zero resistance across a live supply is a short circuit: nothing limits the current, so the answer is not a number but a fault. A real supply falls back on its own internal resistance, its wiring, and its fuse — which is what actually decides how much current flows and for how long.',
    )
  } else if (!Number.isFinite(solution.ohms)) {
    notes.unshift(
      'Zero current with a voltage across it is an open circuit: a break, an off switch, or a blown fuse. Its resistance is infinite rather than merely large, and it dissipates no power because no charge is moving.',
    )
  }

  return {
    primary: show(firstId, value(firstId), LABEL[firstId]),
    // Always all four, in the same order, whichever pair you started from —
    // that completeness is the point of the wheel.
    stats: [
      show('voltage', solution.volts),
      show('current', solution.amps),
      show('resistance', solution.ohms),
      show('power', solution.watts),
    ],
    steps: [
      show(knownIds[0]!, value(knownIds[0]!), `${LABEL[knownIds[0]!]} (known)`),
      show(knownIds[1]!, value(knownIds[1]!), `${LABEL[knownIds[1]!]} (known)`),
      { rule: true },
      show(firstId, value(firstId), firstFormula),
      show(secondId, value(secondId), secondFormula),
    ],
    notes,
  }
}

/**
 * The six pairings. Each picks exactly two of the twelve derived forms, and the
 * form named in `formulas` is the one the arithmetic on the line above actually
 * performs — so the step list is a transcript, not a decoration.
 */
function solve(
  mode: Mode,
  known: { volts: number; amps: number; ohms: number; watts: number },
): Solution {
  const { volts, amps, ohms, watts } = known

  switch (mode) {
    case 'vr': {
      // R = 0 with a live supply: I = V/0 and P = V²/0 are both +Infinity, which
      // is the honest answer (a short circuit), and `show` renders it as words.
      return {
        volts,
        amps: volts / ohms,
        ohms,
        watts: (volts * volts) / ohms,
        solvedFor: ['current', 'power'],
        formulas: ['I = V ÷ R', 'P = V² ÷ R'],
      }
    }
    case 'vi': {
      // I = 0: R = V/0 is +Infinity (an open circuit) and P = V·0 is exactly 0.
      return {
        volts,
        amps,
        ohms: volts / amps,
        watts: volts * amps,
        solvedFor: ['resistance', 'power'],
        formulas: ['R = V ÷ I', 'P = V × I'],
      }
    }
    case 'ir': {
      return {
        volts: amps * ohms,
        amps,
        ohms,
        watts: amps * amps * ohms,
        solvedFor: ['voltage', 'power'],
        formulas: ['V = I × R', 'P = I² × R'],
      }
    }
    case 'vp': {
      // V > 0 is guaranteed above, so neither division can be 0/0. P = 0 gives
      // I = 0 and R = +Infinity: an open circuit, again a real answer.
      return {
        volts,
        amps: watts / volts,
        ohms: (volts * volts) / watts,
        watts,
        solvedFor: ['current', 'resistance'],
        formulas: ['I = P ÷ V', 'R = V² ÷ P'],
      }
    }
    case 'ip': {
      // I = 0 carrying power P > 0 is a contradiction (P = V·I is 0 for any
      // finite V), and I = 0 with P = 0 fixes nothing at all. Either way there
      // is no answer to give, so refuse against the current field.
      if (amps === 0)
        throw new CalcError(
          'With power known, the current must be greater than zero — no power flows through a current of 0 A.',
          'current',
        )
      return {
        volts: watts / amps,
        amps,
        ohms: watts / (amps * amps),
        watts,
        solvedFor: ['voltage', 'resistance'],
        formulas: ['V = P ÷ I', 'R = P ÷ I²'],
      }
    }
    case 'rp': {
      // R = 0 and P = 0 together are satisfied by every current there is, so
      // there is nothing to solve. R = 0 with P > 0 is the short circuit again:
      // sqrt(P/0) is +Infinity and V = sqrt(P·0) is 0.
      if (ohms === 0 && watts === 0)
        throw new CalcError(
          'Zero resistance dissipating zero power fits any current at all, so there is nothing to solve. Give the resistance or the power a value above zero.',
          'resistance',
        )
      // Both radicands are non-negative: P >= 0 is guarded and R >= 0 is guarded,
      // so neither square root can be of a negative number.
      return {
        volts: Math.sqrt(watts * ohms),
        amps: Math.sqrt(watts / ohms),
        ohms,
        watts,
        solvedFor: ['current', 'voltage'],
        formulas: ['I = √(P ÷ R)', 'V = √(P × R)'],
      }
    }
  }
}

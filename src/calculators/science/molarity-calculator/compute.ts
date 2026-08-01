import { CalcError } from '../../../lib/types'
import type { CalcResult, Quantity, Series, Values } from '../../../lib/types'
import type { fields } from './fields'

/*
 * Molarity — amount-of-substance concentration, IUPAC symbol c, universally
 * written M in the lab.
 *
 *     c = n / V          n = m / M_r          so   c = m / (M_r · V)
 *
 * where n is moles of solute, V is litres of SOLUTION (not of solvent), m is
 * the mass of solute in grams and M_r its molar mass in grams per mole.
 *
 * Three rearrangements plus one law:
 *
 *     molarity = moles ÷ volume
 *     mass     = molarity × volume × molar mass
 *     volume   = moles ÷ molarity
 *     M₁V₁ = M₂V₂                      (the dilution law)
 *
 * The dilution law is not a separate fact. Adding solvent changes the volume
 * and nothing else, so the amount of solute n = M₁V₁ is the same before and
 * after, and setting the two expressions for it equal gives M₂ = M₁V₁/V₂.
 *
 * The defaults are one worked example in sodium chloride: 58.44 g of NaCl,
 * molar mass 58.44 g/mol, is exactly 1 mol; made up to 1 L that is exactly
 * 1 mol/L, and diluted to 0.1 mol/L it reaches exactly 10 L. Unlike a gas-law
 * default there is no rounding here — every mode agrees to the last bit.
 *
 * Selects arrive as strings — the derived Values type makes forgetting that a
 * compile error rather than a NaN later.
 */

const MODES = ['molarity', 'mass', 'volume', 'dilution'] as const
type Mode = (typeof MODES)[number]

const isMode = (s: string): s is Mode => (MODES as readonly string[]).includes(s)

/** One litre is this many of the unit. The base variant of the field is 1. */
const VOLUME_UNITS: Readonly<Record<string, number>> = { L: 1, mL: 1000 }

const VOLUME_SYMBOL: Readonly<Record<string, string>> = { L: 'L', mL: 'mL' }

const PRIMARY_LABEL: Readonly<Record<Mode, string>> = {
  molarity: 'Molarity',
  mass: 'Mass to weigh out',
  volume: 'Volume to make up to',
  dilution: 'Final volume',
}

const FORMULA: Readonly<Record<Mode, string>> = {
  molarity: 'molarity = moles ÷ volume',
  mass: 'mass = molarity × volume × molar mass',
  volume: 'volume = moles ÷ molarity',
  dilution: 'V₂ = M₁ × V₁ ÷ M₂',
}

/**
 * Significant-looking decimals across the seven orders of magnitude these
 * fields span. A fixed precision prints either "1.00 mol/L" for a stock
 * solution or "0.00 mol/L" for a trace one, and both read as a bug.
 *
 * The bands are deliberately wide around 1, so a molarity entered as 1 and a
 * molarity computed as 1 are printed the same way rather than with a different
 * number of digits depending on which box they came from.
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
  if (!isMode(v.mode)) throw new CalcError('Choose what you need to work out.', 'mode')
  const mode: Mode = v.mode

  const volumeFactor = VOLUME_UNITS[v.volumeUnit]
  if (volumeFactor === undefined) throw new CalcError('Choose a volume unit.', 'volumeUnit')
  const volumeSymbol = VOLUME_SYMBOL[v.volumeUnit]!

  /*
   * Finiteness is checked BEFORE magnitude, always. `coerceValues` hands compute
   * a raw NaN for anything the form could not parse, and every ordinary
   * comparison against NaN is false — so a bare `x <= 0` would let it fall
   * straight through into the arithmetic and surface as a NaN on the page.
   *
   * Only the fields the chosen question actually reads are validated. The others
   * are still on screen holding whatever they held, and refusing to answer
   * because of a number nobody asked about would be surprising.
   */
  const needsMass = mode === 'molarity' || mode === 'volume'
  const needsMolarMass = mode !== 'dilution'
  const needsVolume = mode !== 'volume'
  const needsMolarity = mode !== 'molarity'

  if (needsMass) {
    if (!Number.isFinite(v.mass)) throw new CalcError('Enter the mass as a number.', 'mass')
    if (v.mass <= 0) throw new CalcError('Enter a mass greater than 0 g.', 'mass')
  }
  if (needsMolarMass) {
    if (!Number.isFinite(v.molarMass))
      throw new CalcError('Enter the molar mass as a number.', 'molarMass')
    if (v.molarMass <= 0)
      throw new CalcError('Enter a molar mass greater than 0 g/mol.', 'molarMass')
  }
  if (needsVolume) {
    if (!Number.isFinite(v.volume)) throw new CalcError('Enter the volume as a number.', 'volume')
    if (v.volume <= 0)
      throw new CalcError(`Enter a volume greater than 0 ${volumeSymbol}.`, 'volume')
  }
  if (needsMolarity) {
    if (!Number.isFinite(v.molarity))
      throw new CalcError('Enter the molarity as a number.', 'molarity')
    if (v.molarity <= 0)
      throw new CalcError('Enter a molarity greater than 0 mol/L.', 'molarity')
  }
  if (mode === 'dilution') {
    if (!Number.isFinite(v.targetMolarity))
      throw new CalcError('Enter the target molarity as a number.', 'targetMolarity')
    if (v.targetMolarity <= 0)
      throw new CalcError('Enter a target molarity greater than 0 mol/L.', 'targetMolarity')
  }

  const litres = v.volume / volumeFactor

  /*
   * Every branch settles the same three numbers — moles of solute, litres of
   * finished solution, and the molarity that is their ratio — so everything
   * downstream (the stats, the steps, the curve) is written once.
   */
  let moles: number
  let finalLitres: number
  let molarity: number

  switch (mode) {
    case 'molarity': {
      moles = v.mass / v.molarMass
      finalLitres = litres
      molarity = moles / finalLitres
      break
    }
    case 'mass': {
      molarity = v.molarity
      finalLitres = litres
      moles = molarity * finalLitres
      break
    }
    case 'volume': {
      moles = v.mass / v.molarMass
      molarity = v.molarity
      finalLitres = moles / molarity
      break
    }
    case 'dilution': {
      // M₁V₁ = M₂V₂. The solute is untouched, so n is fixed by the stock.
      moles = v.molarity * litres
      molarity = v.targetMolarity
      finalLitres = moles / molarity
      break
    }
  }

  // Mass is only meaningful where a molar mass was supplied; dilution neither
  // reads one nor needs one, since it moves solution rather than solid.
  const solidMass = needsMolarMass ? moles * v.molarMass : undefined
  const finalVolumeOut = finalLitres * volumeFactor
  const stockVolumeOut = litres * volumeFactor
  const solventToAdd = finalLitres - litres

  const primary: Quantity =
    mode === 'molarity'
      ? show(PRIMARY_LABEL.molarity, molarity, 'mol/L')
      : mode === 'mass'
        ? show(PRIMARY_LABEL.mass, solidMass!, 'g')
        : mode === 'volume'
          ? show(PRIMARY_LABEL.volume, finalVolumeOut, volumeSymbol)
          : show(PRIMARY_LABEL.dilution, finalVolumeOut, volumeSymbol)

  const stats: Quantity[] = [
    show('Molarity', molarity, 'mol/L'),
    show('Moles of solute', moles, 'mol'),
  ]
  if (solidMass !== undefined) stats.push(show('Mass of solute', solidMass, 'g'))
  stats.push(show('Solution volume', finalVolumeOut, volumeSymbol))
  if (mode === 'dilution') {
    stats.push(show('Dilution factor', v.molarity / v.targetMolarity, '×'))
    // Only when there is solvent to add. A "target" above the stock strength is
    // a concentration step, not a dilution, and a negative volume of water
    // would be a nonsense line rather than an answer — the note below says so
    // instead.
    if (solventToAdd > 0) stats.push(show('Solvent to add', solventToAdd * volumeFactor, volumeSymbol))
  }

  const knownSteps: Quantity[] =
    mode === 'molarity'
      ? [
          show('Mass of solute (known)', v.mass, 'g'),
          show('Molar mass (known)', v.molarMass, 'g/mol'),
          show('Solution volume (known)', stockVolumeOut, volumeSymbol),
        ]
      : mode === 'mass'
        ? [
            show('Molarity wanted (known)', molarity, 'mol/L'),
            show('Molar mass (known)', v.molarMass, 'g/mol'),
            show('Solution volume (known)', stockVolumeOut, volumeSymbol),
          ]
        : mode === 'volume'
          ? [
              show('Mass of solute (known)', v.mass, 'g'),
              show('Molar mass (known)', v.molarMass, 'g/mol'),
              show('Molarity wanted (known)', molarity, 'mol/L'),
            ]
          : [
              show('Stock molarity M₁ (known)', v.molarity, 'mol/L'),
              show('Stock volume V₁ (known)', stockVolumeOut, volumeSymbol),
              show('Target molarity M₂ (known)', v.targetMolarity, 'mol/L'),
            ]

  /*
   * The first line of the working names the route to the moles, and that route
   * differs by mode: weighed out from a mass, implied by a molarity and a
   * volume, or carried over unchanged from the stock in a dilution. Naming the
   * wrong one would make the step list a decoration rather than a transcript.
   */
  const molesFormula =
    mode === 'dilution'
      ? 'moles of solute = M₁ × V₁'
      : mode === 'mass'
        ? 'moles = molarity × volume'
        : 'moles = mass ÷ molar mass'

  const steps: Array<Quantity | { rule: true }> = [
    ...knownSteps,
    { rule: true },
    show(molesFormula, moles, 'mol'),
    { ...primary, label: FORMULA[mode] },
  ]

  /*
   * Molarity against volume at the amount of solute just settled on.
   *
   * Derived from the SAME closed form as the headline rather than re-simulated:
   * because c = n/V, the concentration at a volume V·r is exactly c ÷ r, so the
   * curve passes precisely through the reported molarity instead of near it.
   * The ratios run 0.4 to 2.8 as (4 + i)/10, which is exactly 1 at i = 6 rather
   * than 1.0000000000000002.
   *
   * It is present in every mode and at the defaults, which is what the theme
   * needs: the chart is server-rendered from the DEFAULT result, so anything
   * drawable only off-default would never get a container to redraw into.
   */
  const CURVE_POINTS = 25
  const curve: Array<readonly [number, number]> = []
  for (let i = 0; i < CURVE_POINTS; i += 1) {
    const ratio = (4 + i) / 10
    curve.push([finalVolumeOut * ratio, molarity / ratio])
  }

  const series: Series[] = [
    {
      label: 'Molarity at this volume',
      points: curve,
      format: { style: 'decimal', decimals: decimalsFor(molarity), unit: 'mol/L' },
    },
  ]

  const notes: string[] = [
    'Molarity counts litres of finished SOLUTION, not litres of solvent. Dissolve the solid in less water than you need, then make the volume up to the mark — adding the solid to a full litre gives slightly more than a litre and therefore slightly less than the molarity you wanted.',
  ]
  if (mode === 'dilution' && solventToAdd <= 0) {
    notes.unshift(
      'The target is at least as concentrated as the stock, so this is not a dilution. You cannot get there by adding solvent — the final volume shown is what that amount of solute would occupy at the target strength, which means removing solvent or adding more solute.',
    )
  }
  if (mode === 'dilution' && solventToAdd > 0) {
    notes.unshift(
      'M₁V₁ = M₂V₂ holds because dilution adds solvent and nothing else: the moles of solute before and after are the same number, so the concentration falls in exact proportion to the volume it is spread through.',
    )
  }
  notes.push(
    'Molar mass comes from the formula, summed over the periodic table: NaCl is 22.99 + 35.45 = 58.44 g/mol, glucose C₆H₁₂O₆ is 180.16 g/mol, and water is 18.02 g/mol. Getting this wrong scales every answer by the same wrong factor, so it is worth checking first.',
  )
  notes.push(
    'Molarity is per litre of solution and therefore shifts a little with temperature, since the solution expands. Where that matters — precise physical chemistry, or work over a wide temperature range — molality, which is moles per kilogram of solvent, is used instead because mass does not expand.',
  )

  return {
    primary,
    stats,
    steps,
    notes,
    series,
    // The curve's x is a volume in whatever unit the visitor is reading in, so
    // the axis name is computed rather than fixed — the same 25 points are
    // litres or millilitres depending on the select.
    chart: {
      title: 'Molarity as the volume changes',
      xLabel: `Volume (${volumeSymbol})`,
    },
  }
}

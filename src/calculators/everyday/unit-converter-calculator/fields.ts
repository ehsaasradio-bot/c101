import type { Field } from '../../../lib/types'

/**
 * The from/to lists are the union of every unit across every category. Which of
 * them are actually valid depends on the chosen category, declared as `variants`
 * on each select below — otherwise picking "Temperature" leaves "Kilometres"
 * selected and the calculator rejects a combination the form just offered.
 *
 * Cases carry values only; these labels stay the single source of wording.
 */
const LENGTH_UNITS = [
  'millimetre',
  'centimetre',
  'metre',
  'kilometre',
  'inch',
  'foot',
  'yard',
  'mile',
] as const
const WEIGHT_UNITS = [
  'milligram',
  'gram',
  'kilogram',
  'tonne',
  'ounce',
  'pound',
  'stone',
] as const
const TEMPERATURE_UNITS = ['celsius', 'fahrenheit', 'kelvin'] as const

/** Per-category option lists, with the unit this select falls back to. */
const unitVariants = (defaults: { length: string; weight: string; temperature: string }) =>
  ({
    on: 'category',
    cases: {
      length: { options: LENGTH_UNITS, default: defaults.length },
      weight: { options: WEIGHT_UNITS, default: defaults.weight },
      temperature: { options: TEMPERATURE_UNITS, default: defaults.temperature },
    },
  }) as const

const unitOptions = [
  { value: 'millimetre', label: 'Millimetres (mm)' },
  { value: 'centimetre', label: 'Centimetres (cm)' },
  { value: 'metre', label: 'Metres (m)' },
  { value: 'kilometre', label: 'Kilometres (km)' },
  { value: 'inch', label: 'Inches (in)' },
  { value: 'foot', label: 'Feet (ft)' },
  { value: 'yard', label: 'Yards (yd)' },
  { value: 'mile', label: 'Miles (mi)' },
  { value: 'milligram', label: 'Milligrams (mg)' },
  { value: 'gram', label: 'Grams (g)' },
  { value: 'kilogram', label: 'Kilograms (kg)' },
  { value: 'tonne', label: 'Tonnes (t)' },
  { value: 'ounce', label: 'Ounces (oz)' },
  { value: 'pound', label: 'Pounds (lb)' },
  { value: 'stone', label: 'Stone (st)' },
  { value: 'celsius', label: 'Celsius (°C)' },
  { value: 'fahrenheit', label: 'Fahrenheit (°F)' },
  { value: 'kelvin', label: 'Kelvin (K)' },
] as const

export const fields = [
  {
    kind: 'number',
    id: 'value',
    label: 'Value to convert',
    default: 100,
    min: -1000000,
    max: 1000000,
    step: 1,
    /*
     * A length cannot be negative but a temperature can, so one min/max cannot
     * serve both — dragging this slider left used to produce "A length cannot
     * be negative" from a control that had offered the value.
     *
     * Keyed on the UNIT rather than the category, because absolute zero sits at
     * a different number on each scale: −273.15 °C, −459.67 °F, but 0 K. A
     * single "temperature" floor would either forbid ordinary sub-zero Celsius
     * or offer Kelvin values that do not exist.
     *
     * No conversion is declared, deliberately: this is a converter's input, so
     * changing the unit means the visitor is entering a different quantity
     * rather than restating the same one. Only the bounds move.
     */
    variants: {
      on: 'fromUnit',
      cases: {
        ...Object.fromEntries(
          [...LENGTH_UNITS, ...WEIGHT_UNITS].map((unit) => [
            unit,
            { min: 0, max: 1_000_000, step: 1 },
          ]),
        ),
        celsius: { min: -273.15, max: 10_000, step: 1 },
        fahrenheit: { min: -459.67, max: 18_000, step: 1 },
        kelvin: { min: 0, max: 10_000, step: 1 },
      },
    },
  },
  {
    kind: 'select',
    id: 'category',
    label: 'What are you converting?',
    default: 'length',
    options: [
      { value: 'length', label: 'Length' },
      { value: 'weight', label: 'Weight' },
      { value: 'temperature', label: 'Temperature' },
    ],
  },
  {
    kind: 'select',
    id: 'fromUnit',
    label: 'From',
    default: 'kilometre',
    options: unitOptions,
    variants: unitVariants({ length: 'kilometre', weight: 'kilogram', temperature: 'celsius' }),
    help: 'Only units from the category above are offered.',
  },
  {
    kind: 'select',
    id: 'toUnit',
    label: 'To',
    default: 'mile',
    options: unitOptions,
    variants: unitVariants({ length: 'mile', weight: 'pound', temperature: 'fahrenheit' }),
  },
] as const satisfies readonly Field[]

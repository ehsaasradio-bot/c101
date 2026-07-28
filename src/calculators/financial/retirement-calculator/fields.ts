import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its input type from
 * them without importing `index.ts` — which imports `compute.ts` and would cycle.
 *
 * `currentAge` is deliberately first: nudging it upward shortens the saving
 * horizon, which always moves the projected nest egg, and 44 (1.1 × 40) is still
 * comfortably inside both its own bounds and the retirement age above it.
 */
export const fields = [
  {
    kind: 'number',
    id: 'currentAge',
    label: 'Current age',
    default: 40,
    min: 16,
    max: 90,
    step: 1,
    unit: 'yrs',
  },
  {
    kind: 'number',
    id: 'retirementAge',
    label: 'Retirement age',
    default: 65,
    min: 20,
    max: 100,
    step: 1,
    unit: 'yrs',
    help: 'Must be later than your current age.',
  },
  {
    kind: 'number',
    id: 'currentSavings',
    label: 'Current retirement savings',
    default: 50_000,
    min: 0,
    max: 5_000_000,
    step: 1000,
    unit: '$',
  },
  {
    kind: 'number',
    id: 'monthlyContribution',
    label: 'Monthly contribution',
    default: 500,
    min: 0,
    max: 20_000,
    step: 50,
    unit: '$/mo',
    help: 'Include any employer match you expect to receive.',
  },
  {
    kind: 'number',
    id: 'annualReturn',
    label: 'Expected annual return',
    default: 7,
    min: 0,
    max: 20,
    step: 0.25,
    unit: '%',
  },
  {
    kind: 'select',
    id: 'withdrawalRate',
    label: 'Safe withdrawal rate',
    default: '4',
    options: [
      { value: '3', label: '3% — conservative' },
      { value: '3.5', label: '3.5% — cautious' },
      { value: '4', label: '4% — the classic rule' },
      { value: '5', label: '5% — aggressive' },
    ],
  },
] as const satisfies readonly Field[]

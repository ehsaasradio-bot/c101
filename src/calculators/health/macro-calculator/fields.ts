import type { Field } from '../../../lib/types'

export const fields = [
  {
    kind: 'number',
    id: 'calories',
    label: 'Daily calorie target',
    default: 2000,
    min: 800,
    max: 6000,
    step: 50,
    unit: 'kcal',
    help: 'Use your TDEE, or your TDEE minus a deficit if you are cutting.',
  },
  {
    kind: 'select',
    id: 'goal',
    label: 'Macro split',
    default: 'balanced',
    options: [
      { value: 'balanced', label: 'Balanced — 30% protein / 40% carbs / 30% fat' },
      { value: 'lowCarb', label: 'Low carb — 40% protein / 20% carbs / 40% fat' },
      { value: 'highCarb', label: 'High carb — 25% protein / 55% carbs / 20% fat' },
    ],
  },
] as const satisfies readonly Field[]

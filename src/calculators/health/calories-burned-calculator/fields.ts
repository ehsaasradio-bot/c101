import type { Field } from '../../../lib/types'

/**
 * MET values from the 2011 Compendium of Physical Activities.
 *
 *   Ainsworth BE, Haskell WL, Herrmann SD, Meckes N, Bassett DR Jr,
 *   Tudor-Locke C, Greer JL, Vezina J, Whitt-Glover MC, Leon AS.
 *   "2011 Compendium of Physical Activities: a second update of codes and MET
 *   values." Med Sci Sports Exerc. 2011;43(8):1575-1581.
 *
 * That is the current edition; it superseded the 2000 update, which superseded
 * the original 1993 compendium. Each entry there is a five-digit activity code,
 * a description and one MET value, measured or estimated for a healthy adult of
 * roughly 70 kg — which is exactly why the numbers below are population
 * averages rather than a reading off any individual metabolism.
 *
 * The table lives here rather than in `compute.ts` because `fields.ts` must not
 * import from compute: compute derives its argument type from these fields, and
 * a value import back the other way would be a real runtime cycle. Compute
 * imports this constant instead.
 *
 * Twenty activities spanning 2.5 to 10.0 METs, deliberately covering walking,
 * running, cycling, swimming, resistance work and housework so the spread of
 * the scale is visible in one list.
 */
export const ACTIVITIES = [
  { value: 'yoga', met: 2.5, label: 'Yoga, Hatha' },
  { value: 'walkSlow', met: 2.8, label: 'Walking, 3.2 km/h (2.0 mph), slow' },
  { value: 'cleaning', met: 3.3, label: 'Cleaning house, general' },
  { value: 'walkModerate', met: 3.5, label: 'Walking, 4.8 km/h (3.0 mph), moderate' },
  { value: 'weightsLight', met: 3.5, label: 'Weight training, light or moderate effort' },
  { value: 'gardening', met: 3.8, label: 'Gardening, general' },
  { value: 'cycleLeisure', met: 4.0, label: 'Cycling, under 16 km/h (10 mph), leisure' },
  { value: 'walkBrisk', met: 4.3, label: 'Walking, 5.6 km/h (3.5 mph), brisk' },
  { value: 'mowing', met: 5.0, label: 'Mowing the lawn, walking behind a power mower' },
  { value: 'stationaryBike', met: 5.5, label: 'Stationary cycling, 100 watts, light effort' },
  { value: 'swimSlow', met: 5.8, label: 'Swimming laps, freestyle, light to moderate effort' },
  { value: 'weightsVigorous', met: 6.0, label: 'Resistance training, vigorous effort, 8-15 reps' },
  { value: 'hiking', met: 6.0, label: 'Hiking, cross country' },
  { value: 'rowing', met: 7.0, label: 'Rowing machine, 100 watts, moderate effort' },
  { value: 'cycleModerate', met: 8.0, label: 'Cycling, 19-22 km/h (12-13.9 mph), moderate' },
  { value: 'calisthenics', met: 8.0, label: 'Calisthenics, vigorous — push-ups, sit-ups, jumps' },
  { value: 'runSlow', met: 8.3, label: 'Running, 8 km/h (5 mph, 12 min/mile)' },
  { value: 'swimFast', met: 9.8, label: 'Swimming laps, freestyle, fast, vigorous effort' },
  { value: 'runModerate', met: 9.8, label: 'Running, 9.7 km/h (6 mph, 10 min/mile)' },
  { value: 'cycleVigorous', met: 10.0, label: 'Cycling, 22.5-25.5 km/h (14-15.9 mph), vigorous' },
] as const

/**
 * `weight` is deliberately the FIRST number field: the end-to-end suite nudges
 * that one to 1.1x its default and expects a valid, different result. 70 kg
 * becomes 77 kg, which stays well inside the metric variant's bounds, and the
 * MET equation is linear in body mass, so the headline genuinely moves — from
 * 237.0 kcal to 260.7 kcal at the default activity and duration.
 */
export const fields = [
  {
    kind: 'select',
    id: 'units',
    label: 'Units',
    default: 'metric',
    options: [
      { value: 'metric', label: 'Metric (kg)' },
      { value: 'imperial', label: 'Imperial (lb)' },
    ],
  },
  {
    kind: 'select',
    id: 'activity',
    label: 'Activity',
    help: 'MET values are the published averages from the 2011 Compendium of Physical Activities.',
    default: 'walkBrisk',
    options: ACTIVITIES.map((a) => ({ value: a.value, label: `${a.label} — ${a.met} METs` })),
  },
  {
    kind: 'number',
    id: 'weight',
    label: 'Body weight',
    default: 70,
    // Top-level min/max are the UNION of the two cases below — the absolute
    // range this field will ever accept. 30 kg and 66 lb are the same weight to
    // within 0.1 kg, as are 300 kg and 660 lb, so the two cases describe one
    // real range measured two ways.
    min: 30,
    max: 660,
    step: 0.5,
    unit: 'kg',
    variants: {
      on: 'units',
      cases: {
        metric: { min: 30, max: 300, step: 0.5, unit: 'kg' },
        imperial: { min: 66, max: 660, step: 1, unit: 'lb', factor: 2.2046226218487757 },
      },
    },
  },
  {
    kind: 'number',
    id: 'duration',
    label: 'Duration',
    default: 45,
    // The equation is linear in time with no breakdown at either end, but a
    // single bout beyond twelve hours is not what this calculator is for.
    min: 1,
    max: 720,
    step: 1,
    unit: 'min',
    help: 'Time actually spent moving. Rest between sets sits nearer 1 MET than the activity itself.',
  },
] as const satisfies readonly Field[]

import type { Field } from '../../../lib/types'

/**
 * Fields live in their own module so `compute.ts` can derive its argument type
 * from them without importing `index.ts`, which imports compute and would cycle.
 *
 * ── Why every field is always visible ────────────────────────────────────────
 *
 * There is no per-mode field visibility in this codebase: every field declared
 * here is rendered whatever `mode` holds, and a field's label cannot change with
 * another field's value. So the two coordinate systems get their own permanent
 * inputs — four for latitude/longitude, six for x/y/z — and `compute` reads only
 * the pair the selected mode needs, naming them explicitly in its steps.
 *
 * ── Ordering ────────────────────────────────────────────────────────────────
 *
 * `mode` is first because it decides what everything below it means.
 *
 * `lat1` is deliberately the FIRST NUMBER field: the end-to-end suite sets that
 * field to 1.1x its default and requires the result to change. lat1 is used by
 * the DEFAULT mode (great-circle), its default is far from zero so 1.1x actually
 * moves it, and 1.1 × 40.7128 = 44.78408 is still a legal latitude.
 *
 * ── The step grid ───────────────────────────────────────────────────────────
 *
 * A range input snaps to `min + n * step`, so every default has to land on that
 * grid — and a NEGATIVE minimum has to satisfy it just as much as a positive
 * one. With min -90 / -180 and step 0.0001, every four-decimal coordinate does:
 * (40.7128 − −90) / 0.0001 and (−0.1278 − −180) / 0.0001 are both integers to
 * well inside the 1e-9 tolerance the conformance suite allows.
 *
 * The x/y/z fields use min -1000, step 0.5, so their whole-number defaults sit
 * on the grid too.
 */
export const fields = [
  {
    kind: 'select',
    id: 'mode',
    label: 'Kind of distance',
    default: 'greatCircle',
    options: [
      { value: 'greatCircle', label: 'Great-circle (latitude / longitude)' },
      { value: 'euclidean3d', label: '3D straight line (x, y, z)' },
      { value: 'manhattan', label: 'Manhattan / taxicab (x, y, z)' },
    ],
    help: 'Great-circle measures across the curved surface of the Earth between two lat/long points. The other two measure between two Cartesian points — straight through, or along the axes.',
  },
  {
    kind: 'number',
    id: 'lat1',
    label: 'Point A latitude',
    default: 40.7128,
    min: -90,
    max: 90,
    step: 0.0001,
    unit: '°',
    help: 'Between −90 (South Pole) and 90 (North Pole). Southern latitudes are negative. The default is New York City.',
  },
  {
    kind: 'number',
    id: 'lon1',
    label: 'Point A longitude',
    default: -74.006,
    min: -180,
    max: 180,
    step: 0.0001,
    unit: '°',
    help: 'Between −180 and 180. Western longitudes are negative.',
  },
  {
    kind: 'number',
    id: 'lat2',
    label: 'Point B latitude',
    default: 51.5074,
    min: -90,
    max: 90,
    step: 0.0001,
    unit: '°',
    help: 'Between −90 and 90. The default is London.',
  },
  {
    kind: 'number',
    id: 'lon2',
    label: 'Point B longitude',
    default: -0.1278,
    min: -180,
    max: 180,
    step: 0.0001,
    unit: '°',
    help: 'Between −180 and 180. Going from 179 to −179 is a two-degree hop across the antimeridian, and is measured as one.',
  },
  {
    kind: 'number',
    id: 'x1',
    label: 'Point A x',
    default: 2,
    min: -1000,
    max: 1000,
    step: 0.5,
    help: 'Used by the two Cartesian modes. Negative coordinates are fine.',
  },
  {
    kind: 'number',
    id: 'y1',
    label: 'Point A y',
    default: 4,
    min: -1000,
    max: 1000,
    step: 0.5,
    help: 'Vertical coordinate of the first Cartesian point.',
  },
  {
    kind: 'number',
    id: 'z1',
    label: 'Point A z',
    default: 6,
    min: -1000,
    max: 1000,
    step: 0.5,
    help: 'Depth coordinate of the first point. Set both z values equal for a plain 2D problem.',
  },
  {
    kind: 'number',
    id: 'x2',
    label: 'Point B x',
    default: 5,
    min: -1000,
    max: 1000,
    step: 0.5,
    help: 'Horizontal coordinate of the second Cartesian point.',
  },
  {
    kind: 'number',
    id: 'y2',
    label: 'Point B y',
    default: 8,
    min: -1000,
    max: 1000,
    step: 0.5,
    help: 'Vertical coordinate of the second Cartesian point.',
  },
  {
    kind: 'number',
    id: 'z2',
    label: 'Point B z',
    default: 18,
    min: -1000,
    max: 1000,
    step: 0.5,
    help: 'Depth coordinate of the second point. The defaults differ by 3, 4 and 12 — a Pythagorean quadruple whose distance is exactly 13.',
  },
] as const satisfies readonly Field[]

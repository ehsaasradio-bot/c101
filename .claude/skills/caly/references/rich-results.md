# Rich results: parts, series, unit variants

Optional additions to a `CalcResult` or a field. Add them only where the maths
genuinely supports one — a donut on a calculator with no proportion, or a chart
on one with no trend, is decoration pretending to be information. Roughly half
the calculators here have neither, and that is the right answer for them.

None of these carry a colour or a chart type. They are domain data; the theme
decides what to draw.

---

## `parts` — components of a figure

Drawn as a donut with a legend by the studio theme.

**The number of parts may vary with input.** A mortgage drops "Property tax"
when you zero it and gains "PMI" once the deposit falls below 20%; the studio
theme reconciles its arcs and legend rows against whatever comes back, cloning
its own `<template>` for anything new. Filtering zero-valued components out of
the list is the normal thing to do.

**But whatever you can ever draw, draw at the defaults too.** The donut and the
chart are server-rendered from the default result, and only when that result has
something to show. A calculator whose parts appear only for some non-default
input gets no donut on the page at all, and no client-side redraw can conjure
back a container that was never rendered. This is the progressive-enhancement
rule in `src/islands/CONTRACT.md` — never rely on the island to fill in a card
the server did not render — and `registry.test.ts` enforces it by sweeping every
field across its range.

```ts
parts: [
  { label: 'Starting balance', value: principal, format: { style: 'currency', decimals: 0 } },
  { label: 'Contributions', value: contributed, format: { style: 'currency', decimals: 0 } },
  { label: 'Interest earned', value: Math.max(0, interest), format: { style: 'currency', decimals: 0 } },
]
```

**They must sum exactly to the whole they claim, and none may be negative.** The
donut prints that total in its centre, so a mismatch is a visible lie: slices
that do not add up to the number beside them. The conformance suite checks this
to four decimal places.

The whole is the `primary` by default. When the parts decompose something else —
a mortgage's headline is principal and interest alone, but its parts split the
full monthly payment — state it:

```ts
partsTotal: { label: 'Total monthly payment', value: piti, format: { style: 'currency' } },
```

Two things that will bite:

- **Derive the last part by subtraction** so the sum is exact by construction
  rather than by luck. `interest = total - principal - contributions`.
- **Clamp that remainder at zero.** Floating point lands it a hair below on
  round numbers — a factor of exactly 1 produced `-5.68e-17` here, which fails
  the non-negative check.

## `series` — values over an ordered axis

Drawn as a line chart. The x axis need not be time; reps, distance and month
number all work.

```ts
series: [
  { label: 'Remaining balance', points: balancePoints, format: { style: 'currency', decimals: 0 } },
  { label: 'Equity', points: equityPoints, format: { style: 'currency', decimals: 0 } },
]
```

**The number of series varies the same way parts do**, and so does the number of
*points* inside one — the theme reconciles the lines and rebuilds each path's `d`
from scratch on every recompute. A horizon that grows from 10 years to 30 is
fine, and so is a result that drops to no lines at all: the chart hides itself
rather than leave a stale curve standing. The same defaults rule applies — a
calculator that can ever chart something must chart it at its defaults, or the
figure is never rendered for the script to find.

Rules the conformance suite enforces: at least two points, strictly increasing
x, all values finite. Keep it to about 45 points — thin long horizons with a
stride rather than shipping one point per year for a century:

```ts
const stride = Math.max(1, Math.ceil(years / 40))
```

Pin the final point to the headline figure rather than letting the loop land
near it, so the curve and the number cannot disagree.

**Derive the curve from the same closed form as the headline.** If the headline
uses a formula and the chart re-simulates, the two drift apart at the edges and
the page contradicts itself.

---

## `variants` — bounds and units that follow a selector

A height field means one thing in centimetres and another in inches. A single
min/max cannot serve both: bounds shaped for metric put an imperial user below
the floor.

```ts
{
  kind: 'number',
  id: 'height',
  label: 'Height',
  default: 178,
  min: 42,        // the union across variants — the absolute accepted range
  max: 250,
  unit: 'cm',     // the base variant's unit
  variants: {
    on: 'units',  // the controlling select's field id
    cases: {
      metric: { min: 105, max: 250, step: 0.5, unit: 'cm' },
      imperial: { min: 42, max: 98, step: 0.5, unit: 'in', factor: 0.39370078740157477 },
    },
  },
}
```

The **first case listed is the base**; its factor is 1 and is omitted. Every
other case's `factor` is "value in this variant ÷ the same quantity in the base".

Switching units converts what the visitor already typed, so the physical
quantity is preserved: 178 cm becomes 70 in, not 178 in.

### When a factor cannot express it

Not every unit pair is a multiplication.

```ts
// Fuel economy inverts: 8 L/100km IS 12.5 km/L, not a multiple of 8.
kmpl: { min: 2, max: 60, unit: 'km/L', convert: { kind: 'reciprocal', constant: 100 } },
mpg:  { min: 5, max: 140, unit: 'mpg (US)', convert: { kind: 'reciprocal', constant: 235.21458333333334 } },
```

`convert` takes `{ kind: 'linear', factor }`, `{ kind: 'reciprocal', constant }`
or `{ kind: 'affine', factor, offset }`, and wins over `factor`.

### When you want the bounds to move but the value to stay

**Omit the conversion entirely.** A converter's input is the case for this:
changing "from: cup" to "from: teaspoon" means the visitor is entering a
different amount, not restating the same one. Converting it would make the
output identical every time and the selector feel broken.

The distinction is whether the field describes a fixed quantity (your height,
your car's economy — convert) or a value the visitor is choosing to express
(a converter's input — do not).

### Dependent selects

A select's options can narrow the same way, so choosing "Temperature" cannot
leave "Kilometres" selected:

```ts
variants: {
  on: 'category',
  cases: {
    length: { options: LENGTH_UNITS, default: 'kilometre' },
    temperature: { options: TEMPERATURE_UNITS, default: 'celsius' },
  },
}
```

Cases list option **values** only; the labels stay in `options` so there is one
source of wording.

Chains work — the unit converter's `value` bounds depend on `fromUnit`, which
depends on `category` — because absolute zero sits at a different number on
every scale (−273.15 °C, −459.67 °F, 0 K). A per-category floor would either
forbid ordinary sub-zero Celsius or offer Kelvin values that do not exist. When
a bound differs per unit rather than per group, key it on the unit.

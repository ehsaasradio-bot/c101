# The island ↔ theme contract

`calc-form.ts` makes calculators interactive. **It never writes markup.** Every
tag, class, and pixel lives in `src/theme/`. The two sides meet only at the
`data-*` attributes below.

This is the rule that makes a redesign a nine-line diff. The moment the island
contains `innerHTML = '<div class="...">'`, the theme is no longer swappable —
that is exactly the trap the reference implementation fell into
(`Calculator.astro:400-420`), and it is why they could not restyle without
editing JavaScript.

## What the theme must provide

| Selector | Direction | Meaning |
| --- | --- | --- |
| `<calc-form data-slug="...">` | theme | Wraps the whole tool. One per page. |
| `<script type="application/json" data-calc-config>` | theme | The `CalculatorView`, serialized. Inside the `<calc-form>`. |
| `[data-calc-field="<id>"]` | theme → island | An `input`/`select`. One per field id. |
| `[data-calc-out="primary"]` | island → theme | Primary result. Island sets `textContent`. |
| `[data-calc-out="primary-label"]` | island → theme | Primary result label. |
| `[data-calc-out="band-label"]` | island → theme | Human name of the current band. |
| `[data-calc-list="stats"]` | theme | Container the island fills with cloned stat rows. |
| `[data-calc-list="steps"]` | theme | Container for cloned step rows. |
| `[data-calc-list="notes"]` | theme | Container for cloned note rows. |
| `<template data-calc-row="stat">` | theme | Cloned once per stat. |
| `<template data-calc-row="step">` | theme | Cloned once per step. |
| `<template data-calc-row="rule">` | theme | Cloned for a `{ rule: true }` separator. |
| `<template data-calc-row="note">` | theme | Cloned once per note. |
| `[data-slot="label"]` / `[data-slot="value"]` | inside a template | Island sets `textContent`. |
| `[data-calc-scale]` | island → theme | Island sets the `--calc-pos` custom property (`0%`–`100%`). |
| `[data-calc-error]` | island → theme | Island sets `textContent` and toggles the `hidden` attribute. |
| `[data-calc-result]` | island → theme | Island toggles `hidden` when a computation fails. |
| `data-animate="count"` | theme → island | Opt-in, on `[data-calc-out="primary"]`. Asks the island to count from the old value to the new. Omit it and the value swaps instantly. |
| `data-changed` | island → theme | Set on a stat row whose value differs from the one it replaced. The theme's CSS decides what that looks like. |

## What the island writes, and only this

- `textContent` on elements the theme designated
- `hidden` on `[data-calc-error]` and `[data-calc-result]`
- `data-band="critical｜warn｜neutral｜good｜excellent"` on the `<calc-form>` root
- `data-changed` on a stat row whose value actually changed
- the `--calc-pos` custom property on `[data-calc-scale]`
- `aria-invalid` on a field the error points at
- cloned copies of the theme's own `<template>` elements

## Richer visuals: the `calc:result` event

The island renders text. Anything beyond that — a donut of `result.parts`, a
time-series chart of `result.series` — is drawn by the theme, from its own
script, listening on the `<calc-form>` element:

```js
document.querySelector('calc-form')
  .addEventListener('calc:result', (e) => draw(e.detail))
```

`e.detail` is the full `ResultView`, including `parts` (each with a precomputed
`percent`) and `series`. The event fires on every successful recompute and on
the island's initial reconciliation pass, so a chart never needs its own
bootstrap path.

This is why chart geometry lives in themes and not here: a theme that draws no
charts simply never subscribes, and swapping themes swaps the visuals with it.

## Motion

The island animates values, never appearance. It writes text and attributes;
CSS in the theme decides whether anything moves, how far, and in what colour —
so a theme can remove every animation without touching this file.

Two rules:

- **Numbers count, they do not interpolate as text.** The tween re-runs
  `formatValue` each frame from the raw value, so `$1,204.50` stays correctly
  formatted mid-flight instead of only at the endpoints. A non-numeric result
  (`3:4`, `0y 6m 27d`) is swapped instantly.
- **Only what changed is marked.** Stat rows are replaced wholesale, so the
  island diffs the outgoing values first. Flashing every row on every keystroke
  would be noise.

`prefers-reduced-motion` is honoured in both layers: the island skips the tween
outright, and the theme's `tokens.css` collapses every transition and animation.

**Colours are never written by JavaScript.** The island sets `data-band`; CSS in
the theme resolves it to a colour. This is why `BandId` is a semantic token
(`good`) and not a hex code — see `src/lib/types.ts`.

## Repeating rows

Stats, steps, and notes are variable-length, which is normally where markup
leaks into JS. Instead the theme supplies a `<template>`; the island clones it
and fills the `[data-slot]` nodes:

```html
<div data-calc-list="stats"></div>
<template data-calc-row="stat">
  <div class="whatever the theme likes">
    <dt data-slot="label"></dt>
    <dd data-slot="value"></dd>
  </div>
</template>
```

A new theme can restructure that row completely — table cells, cards, a
definition list — and the island keeps working untouched.

## Progressive enhancement

The page is fully rendered at build time with the calculator's default values,
so the result is correct and visible before any JavaScript runs, and with
JavaScript disabled entirely. The island only takes over on the first `input`
event. Never render an empty result card and rely on the island to fill it.

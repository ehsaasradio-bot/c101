---
name: caly
description: Adds a new calculator or tool to the calc101 Astro codebase — four files plus one registry line, with the maths cross-checked and the conformance suite kept green. Use this whenever the user wants a new calculator, converter, estimator, planner, or any "work out X from Y" tool added to this project, including when they only describe the thing they want ("we should have a VAT calculator", "add something for splitting rent", "can it do compound growth") without naming files or asking for a skill. Also use it when editing an existing calculator's formula, fields, bounds, units, or result shape, since the same contract and traps apply.
---

# caly — add a calculator to calc101

`AGENTS.md` already gives you the four-file layout, the one rule about colours
and markup, and the commands, and it is loaded in every session here. Don't
re-derive that. This skill is the rest: the things that cost real debugging time
and that the test suite will not tell you about.

## Scaffold it

```bash
node .claude/skills/caly/scripts/scaffold.mjs <category> <slug> "<Title>"
```

Writes the four files with the `fields → compute → index` chain wired and prints
the registry line to add. The placeholder maths is a stub to replace, not a
starting point to extend.

Before writing the formula, read the closest existing calculator —
`financial/loan-calculator` for money and a rate, `health/bmi-calculator` for
unit systems, `math/gcd-lcm-calculator` for pure number work. Note that a
`select`, `date` or `text` field arrives at `compute` as a **string**; the
derived `Values<typeof fields>` type makes a forgotten `Number()` a compile
error rather than a `NaN` in production.

## Getting the maths right

This is the part that actually matters. The rest is mechanical.

**Derive the expected value, never invent it.** Write the test expectation from
the formula, then confirm it a second, independent way before trusting it —
simulate the amortization month by month, solve it by bisection, recompute in
integer cents, sum the series. When a hand-written literal and the code
disagree, assume the literal is wrong until proved otherwise; that is how it has
usually gone here.

**Anchor on a published figure where one exists.** A value the outside world
already agrees on catches a whole class of plausible-but-wrong formula that your
own arithmetic will happily confirm — HMRC's VAT fraction of 7/47 at a 17.5%
rate exposes a fraction wrongly built as `rate/100`, which every self-consistent
check would pass.

**Name the standard when there is one.** Mifflin-St Jeor, US Navy
circumference, Epley, Karvonen, the 28/36 rule. Put it in a comment with the
actual coefficients so the next reader can check it against a source rather than
reverse-engineer it.

**Reject bad input; never return NaN.** Throw `CalcError(message, fieldId)` so
the form can highlight the offending field. Guard with `!Number.isFinite(x)`
first: `coerceValues` deliberately produces `NaN` for unparseable input, and a
magnitude test like `if (x < 0)` is false for `NaN`, so it slips straight
through.

## What the tests cannot see

The suites are exhaustive about data and blind to the DOM. Both of the problems
below survived a full green run — unit tests, `astro check`, and the Playwright
suite — and were caught only by building the page and using it. Do that before
you call the work done.

The first has since been fixed in the theme and fenced off by a conformance
test; it is kept here because the shape of the mistake recurs, and because the
lesson holds — a green suite is not evidence that the page is right.

**Whatever you can ever draw, draw at the defaults too.** The donut and the
chart are server-rendered from the *default* result, and only when that result
has something to show. A calculator whose parts or series appear only for some
non-default input gets no donut and no chart on the page at all — and no
client-side redraw can conjure back a container that was never rendered.

The counts themselves are free to vary. A mortgage drops "Property tax" when you
zero it and gains "PMI" below a 20% deposit; the theme reconciles its arcs and
lines against whatever comes back, cloning its own `<template>` per row exactly
as the island does for `stats`, `steps` and `notes`. A series count that falls to
zero hides the chart rather than stranding the previous curve.

This was not always true: the theme used to update arcs *by index* against
markup fixed at build time, which left a housemate who no longer existed still
holding 29% of the ring. `registry.test.ts` now sweeps every field across its
range, so the defaults rule above is enforced rather than remembered.

**`kind: 'text'` renders as a single-line input.** Help text promising "one per
line" cannot be followed, and a column pasted out of a spreadsheet arrives with
its newlines flattened to spaces. Accept commas, spaces and semicolons, and be
careful that splitting on spaces does not tear `Big room: 200` in half.

## Traps

Each of these has cost real debugging time here.

**`min: 0` on a field whose compute demands `> 0`.** Every number field renders
as a slider, so the left end is one drag away. If compute throws on zero, the
minimum must be a usable positive value — match the field's `step` where that
reads naturally.

**A slider spans about 4× the default, not the declared max.** `softRange` in
`theme/studio/range.ts` deliberately ignores validation bounds when sizing the
track — a field accepting up to 100M would pin a realistic thumb to the far
left — so it shows `niceCeil(|default| × 4)` and marks the capped end with `+`.
The consequence is easy to miss: a field with `default: 1, max: 40` can only be
dragged to 5, and everything past it is reachable only by typing. Choose the
default so the useful range is draggable. No test sees this; you have to load
the page.

**A `max` beyond compute's own plausibility guard.** If compute rejects a height
over 272 cm, a field max of 300 offers a value it will refuse.
`field-bounds.test.ts` asserts every declared bound is one your own compute
accepts, and it is pinned both ways, so an exemption that stops being needed
fails too.

**`Number.EPSILON` is the gap at 1.0.** Adding it to 80 changes nothing — `80 +
Number.EPSILON === 80`. When a band boundary must sit just past a value, use an
explicit small offset like `1e-9` and say why.

**`as const` fixtures pin literals.** `const base = {...} as const` makes
`Partial<typeof base>` reject `{ age: 31 }`, because the type is the literal
`30`. Widen the override type in the test rather than dropping `as const`.

**The first number field gets nudged.** `tests/calculators.spec.ts` sets it to
1.1× its default and expects a valid, *different* result. Order fields so the
first numeric one tolerates that, and never rely on an exact default elsewhere.

**A `'today'` date default breaks the stability snapshot.** `registry.test.ts`
skips those automatically; do not add a snapshot around a value that changes at
midnight.

**Prefer real-world defaults.** They are what a visitor sees first, what the
homepage samples, and what the tests assert. A default sitting exactly on a band
boundary looks broken the moment the band label disagrees with the result.

## Verifying

`npm run verify` is the gate, but the fast loop is
`npx vitest run src/calculators/<category>/<slug>/` while you work. The
conformance suite checks things you did not write tests for — description
length, FAQ shape, contiguous scale bands, `related` slugs resolving, parts
summing, series ordering. Treat its failures as the spec.

Then build and drive the actual page, for the reasons above. Playwright uses
port 4399 and refuses to reuse a server; if another session owns that port, pass
`PORT=<n>` rather than assuming the failure is yours.

## Linking it in

A new calculator is an internal-link orphan: its own `related` points outward
and nothing points back. Add its slug to the `related` list of the nearest
existing sibling, so the page is reachable by someone browsing rather than only
by search.

## Copy

`description` is a meta description: 51–160 characters, written for a search
result. `seoTitle` is at most 70. `intro` is the direct answer, a couple of
sentences that would satisfy someone who reads nothing else. At least three
FAQs, each a real question someone asks, answered in more than a line.

Write it as an explanation, not as marketing. The site's whole promise is that
it shows its working.

## Going further

Read `references/rich-results.md` before adding `parts`, `series`, or unit
`variants` — it covers the sum-exactly rule for parts, thinning long series, and
the reciprocal and affine unit conversions that a plain multiplier cannot
express.

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
below survived a full green run — 1949 unit tests, `astro check`, and the
Playwright suite — and were caught only by building the page and using it. Do
that before you call the work done.

**`parts` must have a fixed count, and so must `series`.** The donut and the
chart are server-rendered once at build time, one element per part, and the
theme updates them *by index* (`[data-donut-arc="2"]`). A later result with
fewer parts leaves the surplus arcs frozen at their build-time geometry — a
housemate who no longer exists still holding 29% of the ring, beside a centre
total the visible slices no longer sum to. A result with more parts silently
drops the extras.

So the number of parts may not depend on input. A rent splitter cannot draw one
slice per person; it can draw "bedrooms vs shared space", which is always two.
Per-person figures belong in `stats`.

`stats`, `steps` and `notes` are free to vary in length — the island clones a
`<template>` per row and replaces the list wholesale. So is the number of
*points* within a series; only the number of series is pinned.

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

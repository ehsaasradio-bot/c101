# iOS spike

Proves one claim: **iOS can reuse the site's calculation code rather than
reimplement it.**

## Why not port the formulas to Swift

Porting 41 formulas would fork the maths. The mortgage PMI boundary, the two
gallon sizes, the reciprocal fuel-economy conversion, the Navy body-fat
coefficients — every one of those was subtle enough to get wrong once already.
A second implementation drifts, and you find out from a user rather than a test.

So the compute functions run as-is, inside JavaScriptCore, which ships with iOS.

## What is generated, and from what

    node ios/scripts/build-bridge.mjs

    ios/Shared/bridge.js      one IIFE exposing Calc.compute(slug, values)
    ios/Shared/catalog.json   every calculator's fields, bounds, scale and copy

Both come out of `src/calculators`. Neither is committed — regenerating them is
a build step, and hand-editing either would reintroduce the drift this avoids.

## Layout

    ios/scripts/build-bridge.mjs   the generator
    ios/Bridge/                    SwiftPM package: the JSC wrapper + BridgeCheck
    ios/App/CalcSpike/             SwiftUI app (one generic form, no calculator knows itself)
    ios/App/build.sh               compiles and installs on a simulator

## Running it

    node ios/scripts/build-bridge.mjs
    cd ios/Bridge && swift run -c release BridgeCheck   # golden values + timing
    cd ios/App && ./build.sh "iPhone 17 Pro"            # install and launch

`BridgeCheck` asserts the same figures the web suite pins, so the two platforms
are held to one set of numbers.

## What the spike settled

- The golden values cross intact — `$2,022.62`, `$144,572.72`, `$512.91` and the
  rest match the web exactly, and all 41 compute cleanly from their defaults.
- Errors keep their `fieldId`, so a form can still highlight the offending input.
- `parts`, `stats` and band labels survive, so native charts have their data.
- One SwiftUI form renders every calculator by switching on `field.kind` alone.
- Recalculation costs ~0.2 ms, well inside a frame.

## What it did not cover

Widgets, Siri Shortcuts, `series` charts, favourites, and App Store packaging.
Those are build-out, not risk — the unknown was whether the maths could be
shared at all, and it can.

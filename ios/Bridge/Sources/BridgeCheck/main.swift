import Foundation
import CalcBridge

/*
 * Spike verification.
 *
 * The expected values below are lifted from the website's own test suite —
 * the same figures cross-checked there against independent amortization loops
 * and hand-worked formulas. If JavaScriptCore returns these, the maths has
 * crossed to iOS intact and nothing was reimplemented.
 */

let root = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent().deletingLastPathComponent()
    .deletingLastPathComponent().deletingLastPathComponent()
let bundleURL = root.appendingPathComponent("Shared/bridge.js")
let catalogURL = root.appendingPathComponent("Shared/catalog.json")

var failures = 0
func check(_ label: String, _ got: String, _ want: String) {
    let ok = got == want
    if !ok { failures += 1 }
    print("  \(ok ? "PASS" : "FAIL")  \(label.padding(toLength: 46, withPad: " ", startingAt: 0)) \(got)\(ok ? "" : "   expected \(want)")")
}

let started = Date()
let bridge = try CalcBridge(bundleURL: bundleURL)
print("bridge loaded in \(Int(Date().timeIntervalSince(started) * 1000)) ms — \(bridge.calculatorCount) calculators\n")

// Defaults straight from catalog.json, so nothing is retyped here either.
let catalogData = try Data(contentsOf: catalogURL)
let catalogRoot = try JSONSerialization.jsonObject(with: catalogData) as! [String: Any]
let entries = catalogRoot["catalog"] as! [[String: Any]]
var defaults: [String: [String: Any]] = [:]
for e in entries { defaults[e["slug"] as! String] = (e["defaults"] as! [String: Any]) }

print("golden values, taken from the web suite:")
check("mortgage @ defaults", bridge.compute(slug: "mortgage-calculator", values: defaults["mortgage-calculator"]!).primaryText, "$2,022.62")
check("compound-interest @ defaults", bridge.compute(slug: "compound-interest-calculator", values: defaults["compound-interest-calculator"]!).primaryText, "$144,572.72")
check("loan @ defaults", bridge.compute(slug: "loan-calculator", values: defaults["loan-calculator"]!).primaryText, "$512.91")
check("bmi @ defaults", bridge.compute(slug: "bmi-calculator", values: defaults["bmi-calculator"]!).primaryText, "22.9")
check("tip @ defaults", bridge.compute(slug: "tip-calculator", values: defaults["tip-calculator"]!).primaryText, "$50.15")
check("fuel-cost @ defaults", bridge.compute(slug: "fuel-cost-calculator", values: defaults["fuel-cost-calculator"]!).primaryText, "$14.40")

var m = defaults["mortgage-calculator"]!
m["rate"] = 9
check("mortgage @ 9% rate", bridge.compute(slug: "mortgage-calculator", values: m).primaryText, "$2,574.79")
var d = defaults["mortgage-calculator"]!
d["downPayment"] = 40000
check("mortgage @ 10% down", bridge.compute(slug: "mortgage-calculator", values: d).primaryText, "$2,275.44")

print("\nunit conversion survives the bridge:")
var imperial = defaults["body-fat-calculator"]!
imperial["units"] = "imperial"; imperial["height"] = 70; imperial["neck"] = 15
imperial["waist"] = 36; imperial["hip"] = 39; imperial["weight"] = 176
let bf = bridge.compute(slug: "body-fat-calculator", values: imperial)
print("  body fat, imperial input: \(bf.primaryText)   band: \(bf.bandLabel ?? "-")")

print("\nerrors arrive with the offending field, not as NaN:")
var bad = defaults["mortgage-calculator"]!
bad["homePrice"] = 0
let err = bridge.compute(slug: "mortgage-calculator", values: bad)
check("rejects zero home price", err.error ?? "(no error)", "Enter a home price greater than 0.")
print("  fieldId: \(err.errorFieldId ?? "-")")

print("\nrich result data crosses intact:")
let ci = bridge.compute(slug: "compound-interest-calculator", values: defaults["compound-interest-calculator"]!)
for p in ci.parts { print("  part  \(p.label.padding(toLength: 22, withPad: " ", startingAt: 0)) \(p.text)  \(Int(p.percent.rounded()))%") }
print("  stats: \(ci.stats.count)")

print("\nevery calculator computes from its own defaults:")
var computedAll = 0, brokeAll = 0
for e in entries {
    let slug = e["slug"] as! String
    let out = bridge.compute(slug: slug, values: defaults[slug]!)
    if out.failed || out.primaryText.isEmpty || out.primaryText.contains("NaN") {
        brokeAll += 1
        print("  FAIL  \(slug): \(out.error ?? out.primaryText)")
    } else { computedAll += 1 }
}
print("  \(computedAll)/\(entries.count) produced a clean result, \(brokeAll) failed")
if brokeAll > 0 { failures += brokeAll }

print("\nperformance (what a keystroke costs):")
let iterations = 2000
let mortgageDefaults = defaults["mortgage-calculator"]!
let t0 = Date()
for i in 0..<iterations {
    var v = mortgageDefaults
    v["homePrice"] = 400000 + i
    _ = bridge.compute(slug: "mortgage-calculator", values: v)
}
let elapsed = Date().timeIntervalSince(t0)
let perCall = elapsed / Double(iterations) * 1000
print(String(format: "  %d calls in %.0f ms — %.3f ms each (%.0f/sec)", iterations, elapsed * 1000, perCall, Double(iterations) / elapsed))
print(perCall < 1.0 ? "  well inside a 16 ms frame budget" : "  WARNING: too slow for live typing")

print("\n\(failures == 0 ? "SPIKE PASSED — no failures" : "SPIKE FAILED — \(failures) failures")")
exit(failures == 0 ? 0 : 1)

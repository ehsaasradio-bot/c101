import Foundation
import JavaScriptCore

/// Runs the site's own calculation code inside JavaScriptCore.
///
/// The point is that the maths is not reimplemented here. `bridge.js` is built
/// from the same `compute.ts` functions the website ships, so a fix to a formula
/// reaches iOS without anyone porting it — and the existing test suite goes on
/// guarding both platforms. Porting 41 formulas to Swift would fork them, and
/// the divergence would surface as a user complaint rather than a failing test.
public final class CalcEngine {

    public enum BridgeError: Error, CustomStringConvertible {
        case bundleMissing(String)
        case evaluationFailed(String)
        case noGlobal

        public var description: String {
            switch self {
            case .bundleMissing(let path): return "bridge.js not found at \(path)"
            case .evaluationFailed(let why): return "bridge.js failed to evaluate: \(why)"
            case .noGlobal: return "bridge.js ran but did not define globalThis.Calc"
            }
        }
    }

    private let context: JSContext
    /// Held once. `evaluateScript` reparses its source on every call, which
    /// dominated the cost when each keystroke built a new script string.
    private let computeFn: JSValue

    public init(bundleURL: URL) throws {
        guard let source = try? String(contentsOf: bundleURL, encoding: .utf8) else {
            throw BridgeError.bundleMissing(bundleURL.path)
        }
        guard let context = JSContext() else { throw BridgeError.evaluationFailed("no JSContext") }

        var thrown: String?
        context.exceptionHandler = { _, exception in
            thrown = exception?.toString() ?? "unknown"
        }

        context.evaluateScript(source, withSourceURL: bundleURL)
        if let thrown { throw BridgeError.evaluationFailed(thrown) }
        guard let calc = context.objectForKeyedSubscript("Calc"), calc.isObject,
              let fn = calc.objectForKeyedSubscript("compute"), !fn.isUndefined else {
            throw BridgeError.noGlobal
        }

        self.context = context
        self.computeFn = fn
    }

    public var calculatorCount: Int {
        Int(context.evaluateScript("Calc.count")?.toInt32() ?? 0)
    }

    /// Result of one calculation, mirroring what the web island receives.
    public struct Outcome {
        public let primaryLabel: String
        public let primaryText: String
        public let stats: [(label: String, text: String)]
        public let parts: [(label: String, text: String, percent: Double)]
        public let bandLabel: String?
        public let error: String?
        public let errorFieldId: String?

        public var failed: Bool { error != nil }
    }

    /// Calls the cached function directly and lets JavaScriptCore marshal the
    /// dictionaries. The earlier version built a `JSON.stringify(...)` script
    /// string per call, so every keystroke paid to re-parse JavaScript source
    /// plus two JSON round trips.
    public func compute(slug: String, values: [String: Any]) -> Outcome {
        guard
            let result = computeFn.call(withArguments: [slug, values]),
            let root = result.toDictionary() as? [String: Any]
        else {
            return Outcome(primaryLabel: "", primaryText: "", stats: [], parts: [],
                           bandLabel: nil, error: "bridge returned nothing", errorFieldId: nil)
        }

        if let message = root["error"] as? String {
            return Outcome(primaryLabel: "", primaryText: "", stats: [], parts: [],
                           bandLabel: nil, error: message, errorFieldId: root["fieldId"] as? String)
        }

        let ok = root["ok"] as? [String: Any] ?? [:]
        let primary = ok["primary"] as? [String: Any] ?? [:]
        let stats = (ok["stats"] as? [[String: Any]] ?? []).map {
            (label: $0["label"] as? String ?? "", text: $0["text"] as? String ?? "")
        }
        let parts = (ok["parts"] as? [[String: Any]] ?? []).map {
            (label: $0["label"] as? String ?? "",
             text: $0["text"] as? String ?? "",
             percent: $0["percent"] as? Double ?? 0)
        }

        return Outcome(
            primaryLabel: primary["label"] as? String ?? "",
            primaryText: primary["text"] as? String ?? "",
            stats: stats,
            parts: parts,
            bandLabel: ok["bandLabel"] as? String,
            error: nil,
            errorFieldId: nil
        )
    }
}

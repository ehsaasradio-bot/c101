import Foundation
import SwiftUI
import JavaScriptCore

/// Holds the field values and asks JavaScriptCore for the answer.
///
/// Every recalculation runs the website's own compute function. Nothing in this
/// file knows a formula.
@MainActor
final class Engine: ObservableObject {
    @Published private(set) var primaryLabel = ""
    @Published private(set) var primaryText = "—"
    @Published private(set) var bandLabel: String?
    @Published private(set) var stats: [(label: String, text: String)] = []
    @Published private(set) var parts: [(label: String, text: String, percent: Double)] = []
    @Published private(set) var error: String?

    private let calculator: Calculator
    private var values: [String: Any] = [:]

    init(calculator: Calculator) {
        self.calculator = calculator
        for (key, boxed) in calculator.defaults { values[key] = boxed.value }
        recompute()
    }

    func binding(for id: String) -> Binding<String> {
        Binding(
            get: { [weak self] in
                guard let raw = self?.values[id] else { return "" }
                if let d = raw as? Double { return d == d.rounded() ? String(Int(d)) : String(d) }
                return String(describing: raw)
            },
            set: { [weak self] text in
                guard let self else { return }
                // Numbers stay numbers; anything else crosses as a string, which
                // is exactly what coerceValues expects from a web form too.
                self.values[id] = Double(text) ?? text
                self.recompute()
            }
        )
    }

    func boolBinding(for id: String) -> Binding<Bool> {
        Binding(
            get: { [weak self] in (self?.values[id] as? Bool) ?? false },
            set: { [weak self] on in self?.values[id] = on; self?.recompute() }
        )
    }

    func dateBinding(for id: String) -> Binding<Date> {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        return Binding(
            get: { [weak self] in
                formatter.date(from: (self?.values[id] as? String) ?? "") ?? Date()
            },
            set: { [weak self] date in
                self?.values[id] = formatter.string(from: date)
                self?.recompute()
            }
        )
    }

    /// The unit label for whichever variant is selected — the same data that
    /// drives unit switching on the web.
    func activeUnit(for field: Field) -> String? {
        guard let variants = field.variants,
              let selected = values[variants.on] as? String,
              let variant = variants.cases[selected]
        else { return field.unit }
        return variant.unit ?? field.unit
    }

    private func recompute() {
        let outcome = SharedBridge.shared.compute(slug: calculator.slug, values: values)
        error = outcome.error
        guard outcome.error == nil else { return }
        primaryLabel = outcome.primaryLabel
        primaryText = outcome.primaryText
        bandLabel = outcome.bandLabel
        stats = outcome.stats
        parts = outcome.parts
    }
}

/// One JSContext for the whole app. Loading the bundle costs ~57 ms, so it is
/// done once rather than per screen.
enum SharedBridge {
    static let shared: CalcEngine = {
        let url = Bundle.main.url(forResource: "bridge", withExtension: "js")!
        return try! CalcEngine(bundleURL: url)
    }()
}

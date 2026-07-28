import Foundation

/*
 * The catalog is generated from src/calculators, so this file describes the
 * shape and nothing else. No calculator, no field, no bound and no piece of
 * copy is written here — adding calculator #42 on the web makes it appear in
 * the app with no Swift change at all.
 */

struct UnitVariant: Codable {
    let min: Double?
    let max: Double?
    let step: Double?
    let unit: String?
}

struct FieldOption: Codable, Hashable {
    let value: String
    let label: String
}

struct Variants: Codable {
    let on: String
    let cases: [String: UnitVariant]
}

struct Field: Codable, Identifiable {
    let kind: String
    let id: String
    let label: String
    let help: String?
    let unit: String?
    let min: Double?
    let max: Double?
    let step: Double?
    let options: [FieldOption]?
    let variants: Variants?

    /// Defaults arrive as a number, a string or a bool depending on kind, so
    /// they are decoded loosely and normalised by the form.
    private enum CodingKeys: String, CodingKey {
        case kind, id, label, help, unit, min, max, step, options, variants
    }
}

struct ScaleBand: Codable {
    let id: String
    let label: String
    let from: Double
    let to: Double
}

struct Scale: Codable {
    let min: Double
    let max: Double
    let clampMax: Double?
    let unit: String?
    let bands: [ScaleBand]
}

struct Calculator: Codable, Identifiable, Hashable {
    let slug: String
    let title: String
    let category: String
    let intro: String
    let resultLabel: String
    let fields: [Field]
    let scale: Scale?
    let defaults: [String: AnyCodable]

    var id: String { slug }

    static func == (a: Calculator, b: Calculator) -> Bool { a.slug == b.slug }
    func hash(into hasher: inout Hasher) { hasher.combine(slug) }
}

/// Minimal any-value box, because a default can be a number, string or bool.
struct AnyCodable: Codable {
    let value: Any

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let d = try? c.decode(Double.self) { value = d }
        else if let b = try? c.decode(Bool.self) { value = b }
        else if let s = try? c.decode(String.self) { value = s }
        else { value = "" }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch value {
        case let d as Double: try c.encode(d)
        case let b as Bool: try c.encode(b)
        default: try c.encode(String(describing: value))
        }
    }
}

/// The file has a `count` alongside the array, so it needs a real wrapper —
/// decoding it as [String: [Calculator]] fails on the integer.
struct CatalogFile: Codable {
    let count: Int
    let catalog: [Calculator]
}

enum CatalogLoader {
    /// Returns the reason on failure rather than an empty list. A silent `try?`
    /// here just renders "0 calculators" and hides which key broke.
    static func load() -> (calculators: [Calculator], error: String?) {
        guard let url = Bundle.main.url(forResource: "catalog", withExtension: "json") else {
            return ([], "catalog.json missing from the bundle")
        }
        do {
            let data = try Data(contentsOf: url)
            return (try JSONDecoder().decode(CatalogFile.self, from: data).catalog, nil)
        } catch {
            return ([], String(describing: error))
        }
    }
}

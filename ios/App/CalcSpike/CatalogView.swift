import SwiftUI

struct CatalogView: View {
    private let loaded = CatalogLoader.load()
    private var calculators: [Calculator] { loaded.calculators }
    @State private var query = ""
    /// Lets a screenshot or a UI test open one calculator directly:
    ///   simctl launch <device> xyz.calc101.spike -open mortgage-calculator
    @State private var path: [Calculator] = []

    private var launchTarget: Calculator? {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-open"), i + 1 < args.count else { return nil }
        return calculators.first { $0.slug == args[i + 1] }
    }

    private var grouped: [(String, [Calculator])] {
        let matching = query.isEmpty
            ? calculators
            : calculators.filter { $0.title.localizedCaseInsensitiveContains(query) }
        return Dictionary(grouping: matching, by: \.category)
            .sorted { $0.key < $1.key }
            .map { ($0.key, $0.value.sorted { $0.title < $1.title }) }
    }

    var body: some View {
        NavigationStack(path: $path) {
            List {
                if let problem = loaded.error {
                    Section("Catalog failed to load") {
                        Text(problem).font(.caption).foregroundStyle(.red)
                    }
                }
                ForEach(grouped, id: \.0) { category, items in
                    Section(category.capitalized) {
                        ForEach(items) { calculator in
                            NavigationLink(calculator.title, value: calculator)
                        }
                    }
                }
            }
            .navigationTitle("Calc101")
            .searchable(text: $query, prompt: "Search \(calculators.count) calculators")
            .navigationDestination(for: Calculator.self) { CalculatorView(calculator: $0) }
            .onAppear { if let target = launchTarget, path.isEmpty { path = [target] } }
        }
    }
}

import SwiftUI
import JavaScriptCore

/// One generic form that renders every calculator.
///
/// This is the iOS counterpart of FieldGroup.astro: it switches on `kind` and
/// nothing else, so it has no idea what a mortgage or a BMI is. That is the
/// whole bet of the spike — the web theme and this view are two presentations
/// of one contract.
struct CalculatorView: View {
    let calculator: Calculator
    @StateObject private var engine: Engine

    init(calculator: Calculator) {
        self.calculator = calculator
        _engine = StateObject(wrappedValue: Engine(calculator: calculator))
    }

    var body: some View {
        Form {
            Section {
                ForEach(calculator.fields) { field in
                    row(for: field)
                }
            } header: {
                Text(calculator.intro).textCase(nil).font(.footnote).foregroundStyle(.secondary)
            }

            Section("Result") {
                if let error = engine.error {
                    Label(error, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.orange).font(.callout)
                } else {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(engine.primaryLabel).font(.caption).foregroundStyle(.secondary)
                        Text(engine.primaryText)
                            .font(.system(.largeTitle, design: .rounded).weight(.semibold))
                            .monospacedDigit()
                        if let band = engine.bandLabel {
                            Text(band).font(.caption).foregroundStyle(.tint)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }

            if !engine.parts.isEmpty {
                Section("Breakdown") {
                    ForEach(engine.parts, id: \.label) { part in
                        HStack {
                            Text(part.label)
                            Spacer()
                            Text(part.text).monospacedDigit()
                            Text("\(Int(part.percent.rounded()))%")
                                .font(.caption).foregroundStyle(.secondary).frame(width: 38, alignment: .trailing)
                        }
                    }
                }
            }

            if !engine.stats.isEmpty {
                Section("Detail") {
                    ForEach(engine.stats, id: \.label) { stat in
                        HStack {
                            Text(stat.label).foregroundStyle(.secondary)
                            Spacer()
                            Text(stat.text).monospacedDigit()
                        }
                        .font(.callout)
                    }
                }
            }
        }
        .navigationTitle(calculator.title)
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private func row(for field: Field) -> some View {
        switch field.kind {
        case "select":
            Picker(field.label, selection: engine.binding(for: field.id)) {
                ForEach(field.options ?? [], id: \.value) { option in
                    Text(option.label).tag(option.value)
                }
            }

        case "toggle":
            Toggle(field.label, isOn: engine.boolBinding(for: field.id))

        case "date":
            DatePicker(field.label, selection: engine.dateBinding(for: field.id),
                       displayedComponents: .date)

        default:
            HStack {
                Text(field.label)
                Spacer()
                TextField(field.label, text: engine.binding(for: field.id))
                    .multilineTextAlignment(.trailing)
                    .keyboardType(.decimalPad)
                    .monospacedDigit()
                    .frame(maxWidth: 130)
                if let unit = engine.activeUnit(for: field) {
                    Text(unit).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }
}

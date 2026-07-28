// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CalcBridge",
    platforms: [.macOS(.v13), .iOS(.v16)],
    products: [
        .library(name: "CalcBridge", targets: ["CalcBridge"]),
        .executable(name: "BridgeCheck", targets: ["BridgeCheck"]),
    ],
    targets: [
        .target(name: "CalcBridge"),
        .executableTarget(name: "BridgeCheck", dependencies: ["CalcBridge"]),
    ]
)

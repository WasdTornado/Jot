// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "TotNotesCore", platforms: [.macOS(.v14)],
    products: [.library(name: "TotNotesCore", targets: ["TotNotesCore"])],
    targets: [
        .target(name: "TotNotesCore", path: "Native/Core"),
        .testTarget(name: "CoreTests", dependencies: ["TotNotesCore"], path: "Tests/CoreTests")
    ]
)

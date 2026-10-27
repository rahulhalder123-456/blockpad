// swift-tools-version: 6.0
// Blockpad for iOS: a small native shell (WKWebView) around the same web app that runs in the browser and on Android.
// Built with xtool (https://github.com/xtool-org/xtool). See README.md in this folder.
import PackageDescription

let package = Package(
    name: "Blockpad",
    platforms: [
        .iOS(.v16),
    ],
    products: [
        .library(name: "Blockpad", targets: ["Blockpad"]),
    ],
    targets: [
        .target(
            name: "Blockpad",
            swiftSettings: [.swiftLanguageMode(.v5)]   // WKWebView delegates are not yet Swift 6 strict-concurrency clean
        ),
    ]
)

# Blockpad for iOS (xtool project)

A small native shell: a `WKWebView` that runs the same web app as the browser and Android versions, served from the app bundle.

**Status: written but NOT compiled or run.** Building it needs Apple's iOS SDK, which needs your Apple ID and a ~3 GB Xcode download, so it could not be tested where this was written. Expect to fix small Swift errors on the first build. (The same web app was tested in WebKit, Safari's engine, with an iPhone profile; see `tools/webkit-test.sh`.)

## Build and install with xtool (Linux, WSL or macOS)

1. Install xtool and Swift 6.x: https://xtool.sh/documentation/xtooldocs/installation-linux
2. `xtool setup` (log in with an Apple ID; a free one works, apps then expire after 7 days) and give it `Xcode.xip` when asked.
3. From the repository root: `node tools/prepare-ios.js` (builds the web app and copies it into `ios-xtool/Resources/web`).
4. Plug in your iPhone, then: `cd ios-xtool && xtool dev`

## Known limits on iOS
- No peer-to-peer sharing and no built-in AI (they need the desktop apps).
- Exporting files from a page (Markdown, PDF...) uses browser downloads, which `WKWebView` does not support. Copy as Markdown works.
- No drag-and-drop reordering by touch; use the block menu.

## No Apple account? Use it as a web app
Open the site's `/app/` page in Safari, then Share, then **Add to Home Screen**. It runs offline and stores everything on the phone.

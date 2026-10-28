# Blockpad

A local-first workspace for notes, wiki pages and databases. Everything is stored on your computer in one JSON file. No account, no server, no telemetry, works offline.

Blockpad is an independent app inspired by block-based workspaces. It was built clean-room from public documentation and does not contain any other product's code, logos, icons or content.

## Platforms

One code base, five kinds of device. What was actually tested:

| Platform | What you get | Tested how |
|---|---|---|
| **Windows** 10/11 | Everything: editor, databases, offline AI, peer-to-peer sharing. One-click installer (`installer/Blockpad-Setup.exe`) or `build/v1.8.3/Blockpad-win32-x64/Blockpad.exe` | Full suite on the packaged app and on the installed copy |
| **Linux** x86-64 | Everything | Full suite incl. 3 real processes sharing, on Ubuntu 24.04 (WSL2, virtual display) |
| **macOS** Apple silicon + Intel | Everything | Built; structure verified (right CPU architecture for the app, the AI engine and the native modules; `blockpad://` links registered). **Not run on a Mac.** The GitHub Actions workflow runs the tests on real Mac machines |
| **Android** 7+ | Editor and databases, offline, touch-friendly (no AI, no sharing yet) | Real APK on an Android 16 emulator (Pixel 6): real touches and keyboard, restart, airplane mode, rotation |
| **iPhone / iPad / any browser** | The same web app, installable (Add to Home Screen), works offline (no AI, no sharing yet) | Chromium and WebKit (Safari's engine) with an iPhone profile. A native iOS shell for xtool is in `ios-xtool/` (**not compiled**: needs your Apple ID and Xcode) |

Build commands: `npm run package` (Windows), `npm run package:linux`, `npm run package:mac-arm64`, `npm run package:mac-x64` (run the Linux/macOS ones on Linux, macOS or WSL), `npm run web` (browser/phone app into `site/app`), `npm run android` then build in `android/` with Gradle. `.github/workflows/build.yml` builds and tests all of them on GitHub and attaches the downloads to a release when you push a tag like `v1.8.3`.

### Phones and the browser
The phone/web build keeps your workspace in the browser's IndexedDB on that device (nothing is uploaded) and works with no network. Built-in AI and peer-to-peer sharing need the desktop apps for now: they rely on a native AI engine and on UDP networking that browsers and phone web views do not provide. A browser-compatible sharing transport (WebRTC) is the planned way to add it.

## Run it

- **Windows:** `build/v1.8.3/Blockpad-win32-x64/Blockpad.exe` (a shortcut named *Blockpad* is on the Desktop), or install with `installer/Blockpad-Setup.exe`.
- **From source:** `npm install` then `npm start`.
- **Regenerate icons:** `npm run icons` (all sizes, `.ico`, `.icns`, Android launcher icons).

## Where your data lives

`%APPDATA%\blockpad\data\workspace.json` (Settings > Data & backup shows the exact path and has a *Show in folder* button). A copy of the previous session is kept as `workspace.bak.json`. If the file ever cannot be read, Blockpad refuses to overwrite it and tells you.

## What it does

**Pages and blocks**
- Nested pages in a sidebar tree, drag to reorder or nest, favorites, icons, covers, breadcrumbs, back/forward.
- Block editor: text, headings 1-3 (also collapsible), **tabs**, **synced blocks** (edit once, update everywhere), **buttons** (insert blocks / add a database row / open a link), **HTML** block (sandboxed), **meeting notes** with a built-in audio recorder, bulleted / numbered / to-do / toggle lists, quote, callout, code with **syntax highlighting** (18 languages), **rendered LaTeX equations** (KaTeX, offline), divider, table, 2-3 columns (drag a block to a block's left/right edge, drag the divider to resize), table of contents, image (upload, link, resize, caption), video, **audio**, **PDF viewer**, file attachment, bookmark with **link preview** (title, description, image when online), embed, sub-page.
- `/` menu for every block, `@` to mention a page, markdown shortcuts (`#`, `-`, `1.`, `[]`, `>`, `"`, ` ``` `, `---`), selection toolbar (bold, italic, underline, strike, code, link, text and background colors), Tab / Shift+Tab nesting, drag handle with Turn into / Color / Duplicate / Move / Delete, undo and redo, **block multi-select** (Esc, Shift+arrows, drag a box; copy / cut / paste / duplicate / delete; drag blocks onto a sidebar page to move them), **inline comments** (select text → 💬, threaded replies, resolve), and **smart paste** (below).

**Databases**
- 23 property types: title, text, number, select, multi-select, status, date (with end date), checkbox, URL, email, phone, **people**, **files**, **place**, **verification**, **button**, formula, relation, rollup, unique ID, created time, last edited time, **created by**, **last edited by**.
- Formulas use a safe built-in language (no eval): `prop("Hours") * prop("Rate")`, `if`, `ifs`, `concat`, `round`, `dateAdd`, `dateBetween` and more.
- Views: table (resizable columns, **group by**, **calculation footer**), board, list (also groupable), gallery, calendar (multi-day ranges), **timeline** (drag to move / resize bars), **chart** (bar, horizontal bar, line, donut), **form** (adds rows, required fields), **map** (pins on OpenStreetMap, tiles need internet), **dashboard** (number, chart and list widgets). **Nested AND/OR filter groups**, sorts, search, hidden properties, several views per database, inline, full-page, or as a **linked view** of another database with its own settings. **Row templates** with default values and a default for the New button. Every row is a page.
- **CSV** import (types are inferred) and export for any database; Settings can create a database from a CSV file.

**Everything else**
- Search (Ctrl+K) over titles and content, trash with restore, page history with restore, comments with resolve, templates (six built in, plus **your own**: page menu > Save as template), light/dark/system theme, page font / small text / full width / lock.
- Sharing is by file because nothing is online: export a page as Markdown, standalone HTML, JSON, print / PDF; full-workspace backup and restore; import Markdown files (also by dropping them on the window).

## Sharing and working together (peer-to-peer, no server, no account)
Press **Share** on a page. Blockpad makes two `blockpad://` links: **Can edit** and **View only**. Send them to people you trust. They open **only in the Blockpad app** (a link does nothing in a browser), and **Share → Send Blockpad to a friend (zip)** saves a copy of the app for anyone who does not have it yet.
- **How it connects:** the same family of technology as BitTorrent (Hyperswarm). The link holds a secret; Blockpads that know it find each other through the public peer network and talk directly, encrypted, with NAT hole-punching. There is no Blockpad server, nothing is contacted until you share or join something, and nobody can find the group without the link.
- **Editing together:** changes appear live; you see who is online in the top bar and a coloured name tag on the block someone is editing. Your cursor is not moved when someone else's edit arrives. Different blocks never conflict; if two people change the *same* block at the same moment the newest change wins (no character-level merge).
- **Permissions:** every edit is signed. The view-only link contains no signing key, so people with it cannot change anything, even by talking to peers directly (tested with forged edits).
- **Offline:** each person keeps a full local copy and keeps editing offline; changes sync when two members are online together, and peers relay what they have seen, so the author does not need to be online.
- **Stopping:** the owner can stop sharing, which makes the old links useless (everyone keeps their own copy). Removing one person without stopping is not possible; re-share instead.
- **Safety:** anyone who gets a link can join, so share links only with people you trust. Backups never contain share links or keys.
- **Testing it:** `tools/run-share-test.ps1` runs 3 real Blockpad processes (owner, editor, late-joining viewer) on a private local peer network; `-Scripts smoke23,smoke24` runs the simultaneous-edit / cursor / offline scenarios.

### Installer and website (so a friend can get Blockpad with one click)
- `npm run package` builds the app, then `npm run installer` makes `installer/Blockpad-Setup.exe` (one-click, per-user, no admin rights; adds Start menu and Desktop shortcuts and registers `blockpad://` links; uninstalling keeps your data). It is not code-signed, so Windows SmartScreen shows "More info → Run anyway".
- `site/` is a static website for Vercel: a download page and a `/join` page. In **Settings → Sharing → Your Blockpad website** enter its address and **Share** creates normal `https://…/join#d=…` links that WhatsApp and Telegram make clickable. The page opens Blockpad if it is installed, or walks the person through installing it. The invite sits after the `#`, so it is never sent to the website. Setup steps are in `site/README.md`; the installer (131 MB) is too big for Vercel and should be hosted as a GitHub Release.

## Local API, AI and sync (all opt-in, all yours)
- **Local REST API** (Settings > Local API): read and write pages, databases and rows from your own scripts. Off by default, 127.0.0.1 only, bearer token, rejects browser requests.
- **Built-in AI, no key, no account** (Settings > AI): a tiny open model (Qwen2.5 0.5B by default, ~0.6 GB of RAM) runs on this computer through a bundled llama.cpp engine. Turn it on/off with the 🧠 chip at the top or in Settings. You set a memory limit of 10-25% of your RAM; the model and its context window are sized to fit, a watchdog stops it if it ever exceeds the limit, it turns itself off after being idle, and Stop frees all of its memory. It listens only on 127.0.0.1 with a random per-run key. Models (nano 0.27 GB, tiny 0.49 GB, small 1.1 GB) are downloaded once from Hugging Face, resumable, then it works offline. Improve / shorten / translate / summarize a selection, `/Ask AI`, continue writing.
- **Or your own model** (Settings > AI > My own endpoint): Ollama or any OpenAI-compatible endpoint. Nothing is sent until you configure it and pick an action.
- **Sync between devices** (Settings > Data): store the workspace in a folder that OneDrive, Dropbox or Syncthing syncs. Blockpad detects changes made by another device and merges page by page (newest edit wins; permanent deletions propagate). Not live co-editing.

## Smart paste
Paste from ChatGPT, a web page or a terminal and Blockpad rebuilds the structure: code vs text, language labels (`bash`, `python`...) become highlighted code blocks, flattened tables become real tables, headings, bullets and inline code are restored, and a long document's first line becomes the page title. Copying blocks inside Blockpad and pasting keeps them exact.

## Not included (honest list)
These need servers or a company behind them, which a local-first app deliberately does not have: **accounts, per-person permissions and removing one person from a shared page**, **character-level co-editing inside one block**, **sharing over a LAN with no internet at all** (peers are found through the public peer network), **cloud integrations** (Slack, Google Drive...), a **hosted public API**, **mobile apps**, and **speech-to-text transcription** and **large-model quality** (the built-in AI is deliberately tiny: fine for rewriting, summaries and short drafts, weak at reasoning and facts; pick the 1.5B model or bring your own for more). Smaller gaps: the HTML block cannot run scripts (on purpose), the map needs internet for its background tiles, formulas are Blockpad's own language.

## Keyboard
Ctrl+K search, Ctrl+N new page, Ctrl+\ sidebar, Ctrl+, settings, Alt+Left/Right history, Ctrl+Z / Ctrl+Y undo / redo, Ctrl+B/I/U/E/K formatting, Ctrl+Shift+S strikethrough, Ctrl+Enter toggles a to-do or toggle, F12 developer tools.

## Layout
```
main.js, preload.js   Electron shell, file persistence, dialogs
app/store.js          workspace state, pages, databases data logic, seed content
app/editor.js         block editor
app/db.js             database views
app/app.js            sidebar, topbar, dialogs, shortcuts
app/export.js         markdown / html / backup import-export
assets/               logo.svg, icon.png, icon.ico
tools/                icon generator and smoke tests (npm start with --smoke=tools/smokeN.js)
replica/              recon map and feature matrix from the replica-recon step
```

## Releasing an update (users of the installed apps get a popup)
1. Bump `version` in `package.json` (and `versionName`/`versionCode` in `android/app/build.gradle`).
2. Build and upload the downloads (Windows installer, Linux, macOS, Android APK) to a GitHub release.
3. Run `node tools/make-site-config.js --windows URL --linux URL --android URL --notes "what is new|another point"` (macOS links you do not pass keep their old value).
4. Commit and push: Vercel publishes `site/version.json`. Every installed app older than that version shows "Update available" at its next launch (Windows, Linux, macOS, Android, iOS; the web app updates itself).

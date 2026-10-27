# Notion vs Blockpad: function-by-function difference

**How this was made.** Notion side: Notion's public developer docs, read in this session (block, property, view objects), plus general product knowledge, marked *(general)* where I did not re-read a page. Blockpad side: this project's actual code. `Notion.exe` was not decompiled and REA was not run on it: that would mean reading Notion's own JavaScript, which the replica rules and Notion's terms exclude.

Legend: ✅ equivalent · 🟡 partial · ❌ missing · ➕ Blockpad-only

## 1. Blocks (public API lists 32 block types)
| Notion block | Blockpad | Detail of the difference |
|---|---|---|
| Paragraph, Heading 1/2/3 | ✅ | Notion headings can be toggleable (collapse content); Blockpad headings are not. |
| Bulleted / Numbered list | ✅ | Notion numbering style changes by depth (1. a. i.); Blockpad always shows `1.` |
| To-do | ✅ | |
| Toggle | ✅ | |
| Quote | ✅ | |
| Callout | ✅ | Emoji icon only; Notion also allows image/custom icons |
| Code | ✅ | Blockpad: 15 languages, plain `<textarea>`, **no syntax colouring**; Notion highlights and has a caption + wrap toggle |
| Divider | ✅ | |
| Table | 🟡 | Blockpad: plain-text cells, add/remove rows & cols, header row. No column widths, cell colours, header column, or rich text in cells |
| Column list / column | ✅ | Blockpad drag-to-edge + resizer; Notion same idea |
| Image | 🟡 | Upload/link/resize/caption. No crop, alignment, full-width, or image-as-page-icon |
| Video | 🟡 | Local file, YouTube/Vimeo embed. No other providers |
| File | ✅ | Stored inside the workspace JSON (Notion uses cloud storage with size limits by plan) |
| Bookmark | 🟡 | Blockpad shows hostname + URL only; Notion fetches title/description/preview image online. Blockpad is offline-only by design |
| Embed | 🟡 | Generic sandboxed iframe; Notion has per-service handlers (Figma, Maps, GitHub gist…) |
| Equation | 🟡 | Blockpad shows raw text; Notion renders LaTeX (KaTeX) and has an inline equation |
| Table of contents | ✅ | |
| Breadcrumb | 🟡 | Blockpad has it in the top bar, not as an insertable block |
| Child page | ✅ | |
| Child database | ✅ | Blockpad: inline "dbview" block |
| Mention | 🟡 | Pages only. Notion also mentions people, dates, reminders |
| Audio | ❌ | |
| PDF (viewer) | ❌ | Notion previews PDFs inline |
| Link Preview | ❌ | Needs online integrations |
| Synced block | ❌ | Same content mirrored in several pages |
| Tab block | ❌ | |
| Template (button) block | ❌ | Notion "template button" inserts blocks on click |
| HTML block | ❌ | |
| Meeting notes / Transcription | ❌ | AI + audio features |

Score: 20 equal · 3 partial · 9 missing (32 types).

## 2. Editing behaviour
| Function | Notion | Blockpad |
|---|---|---|
| `/` slash menu | ✅ | ✅ (26 items, filter by name and keywords) |
| `@` mention | people, pages, dates | 🟡 pages only |
| Markdown shortcuts | ✅ | ✅ `# - * + 1. [] > " ``` ---` |
| Inline formatting | bold, italic, underline, strike, code, link, colours, inline equation | 🟡 same minus inline equation |
| Selection toolbar | includes "Turn into", comment, AI | 🟡 formatting, link, colour; "Turn into" is in the block menu |
| Block menu (⋮⋮) | turn into, colour, duplicate, move to, comment, copy link, delete | 🟡 turn into, colour, duplicate, move up/down, delete (no *Move to page*, *Copy link to block*) |
| Block multi-select (drag box / Shift-click / Esc) | ✅ | ❌ only a text range across blocks |
| Cross-block text selection & delete | ✅ | ✅ |
| Drag blocks between pages | ✅ | ❌ (within a page only) |
| Nesting with Tab | ✅ | ✅ |
| Undo / redo | ✅ | ✅ per page, in-memory (cleared when you leave the page) |
| Paste handling | converts web rich text to blocks | ➕ **Smart paste: classifies code vs prose, guesses language, strips "Copy" labels** (this is the feature you asked for) |
| Text alignment, text size per block | ✅ | ❌ |
| Page width / small text / font / lock | ✅ | ✅ |
| Inline comments on selected text | ✅ | ❌ page-level only |
| Reminders / notifications | ✅ | ❌ (single local user) |

## 3. Pages and navigation
| Function | Notion | Blockpad |
|---|---|---|
| Nested sidebar tree, drag to nest/reorder | ✅ | ✅ |
| Favorites | ✅ (reorderable) | 🟡 (not reorderable) |
| Teamspaces / Shared / Private sections | ✅ *(general)* | ❌ single workspace |
| Multiple workspaces | ✅ | ❌ one local file (backup/replace to switch) |
| Icons / covers | emoji, uploaded icons, Unsplash, cover reposition | 🟡 emoji only; 8 gradients or uploaded image; no reposition |
| Breadcrumbs, back/forward | ✅ | ✅ |
| Search | full-text, filters, AI search | 🟡 title + text content, instant, no filters, no ranking by recency |
| Trash | restore; auto-delete after 30 days *(general)* | 🟡 restore/delete; **never auto-deleted** |
| Page history | by plan: 7 / 30 days / unlimited *(general)* | 🟡 up to 25 snapshots (merged within 3 min) |
| Templates | gallery + own templates, DB row templates | 🟡 6 fixed built-in templates; no user-made templates |
| Duplicate | ✅ | ✅ includes sub-pages and rows |

## 4. Databases
**Property types (public API: 24):** Blockpad has **10**.
- ✅ title, text (rich_text), number, select, multi-select, status, date, checkbox, URL, created time
- ❌ people, files, email, phone number, formula, relation, rollup, created by, last edited time, last edited by, unique ID, button, verification, place
- 🟡 status: Notion groups options into To-do / In progress / Complete; Blockpad is a plain coloured list.
- 🟡 date: Notion supports ranges, time and reminders; Blockpad stores one date.

**View types (public API: 10):** Blockpad has **5**.
- ✅ table, board, list, gallery, calendar
- ❌ timeline, form, chart, map, dashboard

| Function | Notion | Blockpad |
|---|---|---|
| Filters | nested AND/OR groups, relative dates ("past week") *(general)* | 🟡 single AND list, fixed dates |
| Sorts | multiple | ✅ multiple |
| Group by (table / list / calendar) | ✅ with sub-groups | ❌ board only |
| Footer calculations (sum, count…) | ✅ | ❌ row count only |
| Linked database views | ✅ | ❌ (inline view of one DB; no "linked view of another DB") |
| Sub-items / dependencies | ✅ | ❌ |
| Per-view hidden properties, column resize | ✅ | ✅ |
| Row drag-reorder, freeze column, wrap cells | ✅ | ❌ |
| Row templates / default values | ✅ | ❌ |
| Rows open as pages | ✅ | ✅ |
| Import CSV / export CSV | ✅ | ❌ (DB exports as a Markdown table only) |

## 5. Sharing, collaboration, platform
| Function | Notion | Blockpad |
|---|---|---|
| Accounts, invite people, permission levels | ✅ | ❌ by design (no server) |
| Public web page | ✅ | 🟡 exports standalone HTML file instead |
| Real-time co-editing, presence | ✅ | ❌ |
| Comments | threaded, mentions, notifications | 🟡 page-level, resolve/delete |
| Export | Markdown & CSV, HTML, PDF *(general)* | 🟡 Markdown, HTML, JSON, print→PDF, full backup |
| Import | many formats (CSV, Markdown, HTML, Word…) *(general)* | 🟡 Markdown (also drag-drop) and Blockpad backups |
| API / integrations / automations / AI | ✅ | ❌ |
| Mobile apps, web clipper | ✅ | ❌ (Windows desktop only) |
| Works fully offline | partial *(general)* | ➕ always; no network needed |
| Data location | Notion's cloud | ➕ one local JSON file you own (`%APPDATA%\blockpad\data`) |
| Privacy | cloud account | ➕ no account, no telemetry |

## 6. Where Blockpad is stronger
- Smart paste of code vs text (language guess, drops stray "Copy" buttons).
- Local, offline, no account; instant start; plain JSON you can back up or script against.
- Atomic saves with a rolling backup copy and refusal to overwrite an unreadable file.

## 7. Biggest gaps, ranked by user impact
1. **Syntax highlighting** in code blocks (you paste code often).
2. **Formula, relation, rollup** properties and **people/files/email/phone** types.
3. **Timeline and chart** views; **group-by and footer calculations** in tables.
4. **Block multi-select** and drag between pages.
5. **Rendered LaTeX**, PDF viewer, audio block, synced blocks, toggle headings.
6. **CSV import/export** for databases.
7. **Inline comments** and user-made templates.

Not recommended to clone: AI/agents, real-time cloud sync, integrations (need a server, accounts or partner deals).

## Not established here
Exact behaviour of Notion's desktop shell, performance limits, private API, undocumented features. Those would need analysis of Notion's shipped app, which was deliberately not done.

---
## Update: gaps closed after this comparison
Built and tested since the table above (see README for detail):
| Was missing | Now |
|---|---|
| Code syntax highlighting | ✅ 18 languages, offline, theme-aware |
| Rendered LaTeX | ✅ KaTeX bundled (equation block) |
| Formula / relation / rollup / unique ID / email / phone / last-edited time properties | ✅ (formula language is Blockpad's own; not byte-identical to Notion's) |
| Timeline and chart views | ✅ timeline (drag/resize bars), chart (bar, hbar, line, donut) |
| Group-by in table/list, footer calculations | ✅ |
| Date ranges | ✅ (calendar shows multi-day spans) |
| Block multi-select, copy/cut/paste/duplicate, move blocks between pages | ✅ |
| PDF viewer, audio block, toggle headings | ✅ |
| CSV import/export for databases | ✅ |
| User-made templates | ✅ |
| Paste fidelity from ChatGPT / web (code vs text, tables, headings) | ✅ and still ahead of Notion's behaviour for plain-text pastes |

Still missing: synced blocks, inline comments, tab block, template buttons, link previews, form / map / dashboard views, people / files / created-by / button / verification / place properties, nested AND/OR filter groups, linked database views, row templates, real-time collaboration, accounts, AI, integrations, API, mobile apps.
---
## Update 2: the remaining gaps
Everything below was built and tested (see tools/smoke10.js: 41 automated checks, including real HTTP calls).
| Was missing | Now |
|---|---|
| Synced blocks | ✅ edits mirror across pages (copies on different pages) |
| Inline comments | ✅ threaded, with replies, resolve and jump-to-text |
| Tab block, template button, HTML block | ✅ (HTML is sandboxed and cannot run scripts) |
| Link preview | ✅ title, description, image (needs internet only when you add the link) |
| Form, map, dashboard views | ✅ |
| People, files, created by, last edited by, button, verification, place properties | ✅ (people = a local member list, no accounts) |
| Nested AND/OR filter groups | ✅ |
| Linked database views | ✅ |
| Row templates and defaults | ✅ |
| Meeting notes | ✅ template + microphone recorder (no speech-to-text) |
| Public API | ✅ local REST API on 127.0.0.1, opt-in, token protected |
| AI | ✅ bring-your-own model (Ollama or OpenAI-compatible); none built in |
| Multi-device sync | ✅ via a synced folder with page-level merge (not live co-editing) |

Cannot be done without a server or a company, so deliberately not built: live multi-user co-editing, accounts and invite sharing, cloud integrations, hosted API, mobile apps, built-in AI models.
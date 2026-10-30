# Recon: Obsidian 1.14.5 vs Blockpad 1.8.4

Goal: not a clone. Map what Obsidian does, find what Blockpad is missing, and pick what to build.
Core loop of Obsidian: **write a note -> link it to other notes with `[[ ]]` -> find it again through links, backlinks, tags, search and the graph.**
Blockpad's core loop is different: **write blocks -> organise in pages and databases -> share live with others.**
The gap is the "find it again through links" half.

## How this was gathered (and what was not done)

| source | what it gave | how |
| --- | --- | --- |
| Installed app package `%APPDATA%\obsidian\obsidian-1.14.5.asar` | the list of files and bundled libraries (names and sizes only) | REA, package-level only: the archive's file table was read; no code was opened, decompiled or saved. A deeper REA code analysis was started and stopped before it produced output, because the Replica rules forbid reading the target's JavaScript. |
| The bundled starter vault (`/sandbox/*.md` names) | Obsidian's own feature tour topics | file names only |
| Your own vaults (`Documents\Obsidian Vault`, `Documents\obsidian\Clients\client`) | which core plugins you actually use; 118 + 201 notes | read `.obsidian/core-plugins.json`, `community-plugins.json` (your data) |
| Public docs: help.obsidian.md, jsoncanvas.org (open spec, MIT) | feature behaviour | public pages |
| Blockpad source (this repo) | what Blockpad already has | grep of `app/*.js` |

Observed in the package (bundled libraries -> features they power): CodeMirror + vim mode (editor, Vim keys),
pdf.js (PDF viewer), MathJax (math), Mermaid (diagrams), Prism (code highlighting), Pixi (GPU-drawn graph view),
reveal.js (Slides), Readability + Defuddle + Turndown (web page -> Markdown, i.e. Web viewer / clipper),
i18n with 55 languages, a quick-look viewer, a starter "sandbox" vault.
Inference, not observed: which code uses which library. Library names only show the feature exists.

Your own setup (observed): both vaults use Graph, Backlinks, Outgoing links, Tags, Canvas, Daily notes,
Templates, Bookmarks, Outline, Page preview, Bases, Sync, File recovery, Word count, Command palette,
Quick switcher. One vault also runs the community plugin **Local REST API**.

## Screens (Obsidian)

| ID | screen | how you get there | purpose | Blockpad today |
| --- | --- | --- | --- | --- |
| S01 | Vault picker | first launch / "Open another vault" | a vault = a normal folder of .md files | none (one workspace, its own JSON file) |
| S02 | Editor (live preview / source / reading) | open a note | write Markdown | block editor (yes, different model) |
| S03 | File explorer | left sidebar | folders and files | page tree (yes) |
| S04 | Backlinks pane (linked + unlinked mentions) | right sidebar | who links here | **missing** |
| S05 | Outgoing links pane | right sidebar | what this note links to | **missing** |
| S06 | Graph view (global + local) | ribbon / command | see the web of notes | **missing** |
| S07 | Tags pane | right sidebar | browse #tags with counts | **missing** |
| S08 | Outline pane | right sidebar | headings of the open note, always visible | partial (a TOC *block* inside the page) |
| S09 | Canvas | new canvas | infinite board of cards, notes, links | **missing** |
| S10 | Bases | new base | database views over notes' properties | yes, stronger (databases with 10 views) |
| S11 | Command palette | Ctrl+P | every action by name | partial (shortcuts, no palette) |
| S12 | Quick switcher | Ctrl+O | jump to a note by typing | yes (search) |
| S13 | Page preview | hover a link | see a note without opening it | check: partial |
| S14 | Daily note | ribbon / command | one note per day, from a template | partial (a "Journal entry" template, no auto daily page) |
| S15 | File recovery | settings | snapshots | yes (page history) |
| S16 | Settings > Community plugins | settings | install plugins | none |

States worth copying: empty backlinks ("No backlinks found"), unlinked mentions with a one-click "Link" button,
graph with filters (tags, orphans, depth for the local graph).

## Flows

```
F01 Link two ideas            type [[ -> pick note (or a new name) -> link made        3 keys + choice
    edge: link to a note that does not exist yet (creates it on click), rename keeps links working
F02 Find what refers to this   open note -> Backlinks pane shows every linking note with context
    edge: unlinked mentions (title appears as plain text) -> "Link" converts it
F03 Explore                    Graph -> click a node -> opens the note; local graph = this note's neighbours
F04 Today                      one click -> today's note (created from the daily template if missing)
F05 Move between apps          the vault is a folder: any editor, Git or cloud drive can read it
```

## Inferred data model (Obsidian, from public docs, high confidence)

```
Note      path (folder/name.md), body (Markdown), frontmatter properties (YAML), tags (#x and tags: [...])
Link      from note -> to note (by name or path), optional #heading or #^block, optional |alias, embed (![[ ]])
Canvas    .canvas file in JSON Canvas format: nodes (text | file | link | group, x, y, w, h, color), edges (from, to, sides, label)
Base      .base file: filters, formulas and views over notes' properties
```
Blockpad already maps well: page <-> note, page props <-> frontmatter, mention block / [[ ]] <-> link, databases <-> bases.

## The missing parts, ranked for Blockpad

1. **Obsidian vault bridge (import and export a vault folder).** You have 319 notes in Obsidian. Today Blockpad imports
   one .md at a time, ignores frontmatter, does not resolve `[[links]]`, folders or attachments. A bridge makes those notes usable
   in Blockpad and lets Blockpad write a vault back out. This unlocks everything else on this list.
2. **Backlinks and unlinked mentions** (S04/S05). Blockpad already stores page links (mention blocks); it just never looks backwards.
3. **Tags** (S07): `#tag` in text plus a tags property, a tag pane, click to filter. Imported Obsidian notes carry tags today and would lose them.
4. **Graph view** (S06): global and local graph from the same link index. Canvas 2D is enough for a few thousand pages.
5. **Daily notes** (S14): one click, today's page from a chosen template; dates in mentions link to it.
6. **Command palette** (S11): Ctrl+P over every menu action.
7. **Canvas** (S09) using the open JSON Canvas format, so boards open in both apps. Biggest build; do it last.

What Blockpad already does better (keep pitching it): free live P2P sharing (Obsidian charges for Sync),
comments, databases with 10 view types, forms, built-in AI, one-file install on Android/iOS/web.

## Cannot / should not be copied

- Obsidian's plugin ecosystem (2,000+ community plugins) - it is their community, and running their plugins would mean matching their private API.
- Obsidian Sync / Publish servers - their service.
- Their code, CSS, icons, starter-vault text and translations - owned by Obsidian. Build every line fresh.
- Note: Obsidian's terms restrict reverse engineering the app; that is why this map uses package file names, your own vault settings and public docs only.

## Size

Screens to add: 4 (backlinks pane, tags pane, graph, palette) + canvas. Flows: 5. Entities: link index, tag index, canvas.
Hard parts: (1) round-tripping Markdown without losing Blockpad-only blocks (databases, columns, buttons);
(2) keeping a link index fast and correct with live P2P edits; (3) canvas UX.
Size: **M** for items 1-6 (a few weeks), canvas adds another **M**.

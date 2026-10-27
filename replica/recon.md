# Recon map: Notion-style workspace (clean-room)

## Scope
- App: Notion (desktop and web are the same product; desktop is an Electron-style shell around the web app, so the clone targets web first and wraps it for desktop later).
- Slice: **pages, blocks, databases (with views), sharing**. Out of this slice: AI agents, enterprise search, meeting notes, calendar app, admin/SCIM.
- Audience: user's own product (to be decided at /replica-entrepreneur).
- Core loop: open workspace -> create page -> type `/` to add blocks -> nest pages -> turn data into a database -> view it as table/board -> share a link.

## Rules followed
`Notion.exe` was NOT decompiled, unpacked or inspected, and no private endpoints or bundles were read. REA was deliberately not used on it (see replica-recon rules). Everything below comes from public sources.

## Sources
| source | URL | gave |
| --- | --- | --- |
| API reference: Block | https://developers.notion.com/reference/block | full block type list, nesting rules |
| API reference: objects/endpoints index | https://developers.notion.com/reference/intro | Page, Database, Data source, View, Comment, File, User, Parent, Search |
| Pricing | https://www.notion.com/pricing | plan gating: forms, sites, charts, collab blocks, uploads, connections |
| Help center | https://www.notion.com/help | (to read in a user-driven pass for states and settings) |
| Releases | https://www.notion.com/releases | recent direction |
| User's own account | n/a | to be driven by the user for empty/error states and screenshots into replica/screens/ |

## Screen inventory
| ID | screen | how you get there | purpose | key components | states |
| --- | --- | --- | --- | --- | --- |
| S01 | Sign up / log in | / | auth | email form, OAuth buttons | error, loading |
| S02 | Onboarding | after first login | create workspace, pick use | steps, template picker | skip |
| S03 | App shell | /app | navigation frame | sidebar, topbar, breadcrumb, search button | collapsed sidebar, mobile |
| S04 | Sidebar page tree | S03 left | nested page navigation | tree, favorites, private/shared sections, drag reorder | empty, deep nesting |
| S05 | Page editor | click a page | main authoring surface | title, icon, cover, block list, slash menu, block handle, selection toolbar | empty, loading, read-only, offline |
| S06 | Slash menu | type `/` | insert block | filtered list of block types | no results |
| S07 | Block context menu | drag handle click | turn into, duplicate, delete, color, comment | menu | - |
| S08 | Database page | click a database | rows + views | view tabs, filter, sort, group, properties, new row | empty, filtered-empty |
| S09 | Table view | S08 | spreadsheet-like rows | column header menu, cell editors | - |
| S10 | Board view | S08 | kanban by select/status | columns, cards, drag | empty column |
| S11 | Gallery / list / calendar / timeline views | S08 | alternate renderings | cards, date grid, bars | no date property |
| S12 | Row as page | open row | row properties + body | property panel, editor | - |
| S13 | Property editor | column menu | type, options | type list, option colors | - |
| S14 | Share dialog | Share button | invite, link access, publish | people list, permission dropdown, publish toggle | no access |
| S15 | Comments panel | comment icon | discussion on blocks/pages | thread, mention, resolve | empty |
| S16 | Search | Ctrl+K | find pages | query box, recent, results | no results |
| S17 | Trash / page history | sidebar, menu | restore | list, restore button | empty |
| S18 | Settings | sidebar | account, workspace, members | tabs | - |
| S19 | Public page | shared URL | read-only render | page body, optional branding | not found, no access |
| S20 | Templates gallery | new page | start from template | cards | - |

## User flows
- F01 Write a page: S03 -> new page -> S05 -> type title -> `/` S06 -> add heading/to-do -> auto-saved. Happy path about 4 actions.
- F02 Organize: S04 drag page under another page -> nested; breadcrumb updates.
- F03 Make a database: S05 `/table` -> S08 -> add property S13 -> add rows -> add Board view S10.
- F04 Share: S05 -> Share S14 -> invite by email or toggle publish -> S19.
- F05 Find: Ctrl+K S16 -> pick page.
- F06 Recover: delete -> S17 -> restore.
- Edges: offline edit then sync, two people editing one block, permission removed while open, deleting a page with children, database with no date for calendar view.

## Components
Button (primary/ghost/danger), text input, icon/emoji picker, cover picker, dropdown/select, multi-select tag with colors, date picker (range, time), checkbox, popover/menu, modal, toast, tooltip, tree item, tabs, avatar stack, command palette, drag handle, resize handle (columns, images), skeleton loader. State sets: hover, focus, disabled, loading, error.

## Inferred data model
(sourced from public API object model; confidence high unless noted)
- **User** id, name, email, avatar.
- **Workspace** id, name, members(role).
- **Page** id, parent (workspace | page | data_source), title, icon, cover, properties (when in a database), archived, created/last_edited by+time, in_trash. Evidence: API Page object. high.
- **Block** id, parent (page|block), type, content (rich_text[] + type-specific fields), has_children, position, archived. Evidence: API Block object. high.
- **RichText** text, annotations (bold, italic, strike, underline, code, color), link, mention. high.
- **Database / DataSource** id, title, properties schema (title, text, number, select, multi_select, status, date, person, files, checkbox, url, email, phone, formula, relation, rollup, created/edited time/by). high for list; formula/rollup engine medium.
- **View** id, data_source, type (table|board|gallery|list|calendar|timeline|chart), filter, sort, group, visible properties. high.
- **Comment** id, parent (page|block), discussion_id, rich_text, author, resolved. high.
- **File** upload or external, name, size, type, expiry. high.
- **Permission/Share** page, subject (user|workspace|public), level (full|edit|comment|view). medium (inferred from UI and plans).
- **Relations**: Workspace 1-n Page; Page 1-n Block; Block self-nesting; Database 1-n Row(Page); Database 1-n View.

## Block types seen in public docs (build list)
paragraph, heading 1/2/3 (toggleable), bulleted/numbered list, to-do, toggle, quote, callout, code, divider, table (+rows), column list + column, image, video, audio, file, pdf, bookmark, embed, equation, table of contents, breadcrumb, child page, child database, synced block, mention, link preview, template, tab. Excluded: meeting notes/transcription (AI), unsupported.

## Hard parts
1. **Block editor**: rich text, slash menu, drag/drop, selection across blocks, undo/redo, markdown shortcuts. (Biggest.)
2. **Realtime collaboration and offline sync**: CRDT or OT, presence, conflict handling.
3. **Databases**: typed properties, filters/sorts/groups, formulas, relations/rollups, multiple views.
4. Permissions inheritance down the page tree.
5. Search over rich content.

## Cannot be cloned (skip)
Notion's brand, logo, icons, illustrations, copy and template content; its AI models and agents; third-party connections and deals; its user network and public template marketplace; enterprise compliance certifications; proprietary formula language parity is not guaranteed.

## Size
Core loop (S01-S08, S12, S14, S16, S17, S19): **L** (a quarter) for solid single-user plus basic sharing. Realtime multi-user adds a further M. Full parity: XL, rescope.

## Next step
`/replica-architect`

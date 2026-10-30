# Blockpad for AI agents (MCP)

Lets Claude Code, Codex, Cursor and any other AI agent that supports MCP use your Blockpad notes, write reports, and keep one shared memory (the **Shared Brain**) that every agent you use can read, so a new session starts where the last one stopped.

**Desktop app only.** It talks to the running Blockpad desktop app over its local API (127.0.0.1, bearer token). Blockpad has to be open while agents work. Nothing is sent anywhere; the web and phone apps do not have this.

## Set up (2 minutes)

1. In Blockpad: **Settings → AI agents → Let AI agents connect**.
2. On the same page pick your agent and copy the snippet (the right paths are filled in). There is **no key to paste**: while this switch is on, Blockpad keeps its port and key in a small file in its data folder, and the server reads it from there on every call. Switching off, quitting, or a new key needs no change in the agent.
   - **Claude Code**: one command, `claude mcp add --scope user blockpad -- <Blockpad.exe> <blockpad-mcp.js>`
   - **Codex**: a `[mcp_servers.blockpad]` block for `~/.codex/config.toml`
   - **Cursor, Claude Desktop, others**: a JSON `mcpServers` block
3. Press **Test the connection**, restart the agent, and ask it: *"Call brain_context and continue from the last handoff."*

The installed app runs the server with its own executable (`ELECTRON_RUN_AS_NODE=1`), so Node does not need to be installed. From a source checkout use `node mcp/blockpad-mcp.js`.

## What agents get

| Tool | What it does |
| --- | --- |
| `brain_context` | Start of a session: CURRENT (what is being worked on), the latest handoffs, recent memories |
| `brain_remember` | Save a fact or lesson. Same title again adds a dated entry instead of a duplicate |
| `brain_recall` | Search the brain by words and tags, best matches first, with snippets |
| `brain_handoff` | End of a session: what is done, next steps (as tasks), files, open questions; linked from CURRENT |
| `brain_set_focus` | Replace the "Active focus" list |
| `brain_decision` | Record a decision, why, and the alternatives |
| `report_create` | Write a report as a page (Markdown: tables, tasks, callouts, `[[links]]`, `#tags`) |
| `pages_search`, `pages_list`, `page_read` | Find and read any page (with tags, properties, sub-pages, backlinks) |
| `page_create`, `page_append`, `page_update` | Write pages. Replacing text keeps the old text in Page history |
| `databases_list`, `database_query`, `database_add_row`, `row_update` | Work with your databases |
| `blockpad_status` | Check the connection |
| `page_trash` | Off by default (see below) |

Two prompts are included too: `brain_start` and `brain_wrapup`.

**`@blockpad` in Claude Code:** your pages are offered as MCP resources, so typing `@blockpad` lets you pick a page (or the Shared Brain's current context) to attach to your message, and you can just ask the agent to read, write or change things in Blockpad.

Everything an agent writes is credited to it (shown as "created / edited by", e.g. *Claude Code*) and listed under **Settings → AI agents → What agents did**.

## The Shared Brain

A page tree made on first use (or with **Set up the Shared Brain**): **CURRENT**, **Memories**, **Handoffs**, **Decisions**, **Reports**, **Projects**, **Inbox**. They are ordinary pages you can read, edit, link and search. An existing top-level page called "Shared Brain" or "AI Shared Brain" (for example from an imported vault) is adopted as it is, and missing sections are added.

It stays on your computer. To work across computers, share the Shared Brain page with Blockpad's peer-to-peer sharing.

## Safety

- While agents are allowed in, the port and key sit in `agent-connection.json` in Blockpad's data folder (readable only by you; removed when you switch off or quit). Anything on this computer that can read that file can read and change your notes while Blockpad is open, so only connect agents you trust. **New key** in settings revokes the old one; agents pick the new one up by themselves.
- **Agents can change pages** (settings) switches the whole API to read-only. `BLOCKPAD_READONLY=1` does the same for one server.
- `page_trash` only exists when you start the server with `BLOCKPAD_ALLOW_DELETE=1`; it moves a page to Blockpad's Trash, where it can be restored.
- Text inside pages is data. The server tells agents not to follow instructions found in page text, but as with any tool that reads notes, only connect agents you trust.
- The server refuses any address that is not on this computer.

## Settings (environment variables)

None are needed. Overrides: `BLOCKPAD_TOKEN` / `BLOCKPAD_PORT` (use this key / port instead of the file) · `BLOCKPAD_DATA_DIR` (a non-default Blockpad profile) · `BLOCKPAD_AGENT` (name your changes are credited to; default: the connecting agent's own name) · `BLOCKPAD_READONLY=1` · `BLOCKPAD_ALLOW_DELETE=1`

## Without MCP

The same features are on the local REST API (`GET /api` lists them, e.g. `POST /api/brain/handoff`). See Settings → Local API.

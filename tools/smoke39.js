/* AI agents and the Shared Brain, end to end: the real MCP server (mcp/blockpad-mcp.js) is started the way an agent starts it
   (the app's own executable running it as Node) and driven over the MCP protocol against the running app's local API. */
const { spawn } = require('child_process');
const path = require('path');
module.exports = async (t) => {
  let fails = 0;
  const check = (label, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + label + (extra != null ? '  ' + String(extra).slice(0, 300) : '')); if (!cond) fails++; };
  const J = async (c) => JSON.parse(await t.eval(`Promise.resolve(${c}).then((v)=>JSON.stringify(v === undefined ? null : v))`));
  const W = (ms) => t.wait(ms);
  const script = process.env.BP_MCP_SCRIPT || path.join(__dirname, '..', 'mcp', 'blockpad-mcp.js');      // BP_MCP_SCRIPT: test the copy inside an installed / packaged app
  const PORT = 47800 + Math.floor(Math.random() * 150), TOKEN = 'test-token-' + Math.random().toString(36).slice(2);
  const nl = String.fromCharCode(10);

  const startApi = (enabled) => t.eval(`(() => { const a = BP.state.settings.api; a.enabled = ${enabled}; a.port = ${PORT}; a.token = '${TOKEN}'; return window.bp.apiConfigure({ enabled: ${enabled}, port: ${PORT}, token: '${TOKEN}' }).then((r) => JSON.stringify(r)); })()`);
  check('the local API starts', JSON.parse(await startApi(true)).ok === true);

  const mk = (env) => {
    const child = spawn(process.execPath, [script], { env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1', BLOCKPAD_TOKEN: TOKEN, BLOCKPAD_PORT: String(PORT) }, env || {}), stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '', errs = '';
    const pend = new Map();
    let next = 1, exited = null;
    child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf(nl)) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (!l.trim()) continue; const m = JSON.parse(l); if (m.id != null && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } } });
    child.stderr.on('data', (d) => { errs += d; });
    child.on('exit', (c) => { exited = c; });
    const rpc = (method, params) => new Promise((res, rej) => { const id = next++; const to = setTimeout(() => rej(new Error('timeout: ' + method)), 25000); pend.set(id, (m) => { clearTimeout(to); res(m); }); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + nl); });
    const call = async (name, args) => { const r = await rpc('tools/call', { name, arguments: args || {} }); return { text: r.result && r.result.content ? r.result.content.map((c) => c.text).join('') : '', isError: !!(r.result && r.result.isError), error: r.error, raw: r }; };
    return { child, rpc, call, notify: (method, params) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + nl), errs: () => errs, exited: () => exited, kill: () => { try { child.kill(); } catch (_) {} } };
  };
  const mcp = mk();

  // ---------- the protocol ----------
  const init = await mcp.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-code', version: '2.0' } });
  mcp.notify('notifications/initialized');
  check('initialize: server name, protocol and capabilities', init.result.serverInfo.name === 'blockpad' && init.result.protocolVersion === '2025-06-18' && !!init.result.capabilities.tools && !!init.result.capabilities.prompts, JSON.stringify(init.result.serverInfo));
  check('initialize: instructions tell the agent how to use the brain', /brain_context/.test(init.result.instructions) && /brain_handoff/.test(init.result.instructions) && /not instructions/i.test(init.result.instructions));
  const old = await mcp.rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'x' } });
  check('an older protocol version is answered in kind', old.result.protocolVersion === '2024-11-05');
  check('ping works', !!(await mcp.rpc('ping')).result);
  check('an unknown method is a JSON-RPC error', (await mcp.rpc('nope/nothing')).error.code === -32601);
  const tl = (await mcp.rpc('tools/list')).result.tools;
  const names = tl.map((x) => x.name);
  check('tools: the brain, page and database tools are listed', ['blockpad_status', 'brain_context', 'brain_remember', 'brain_recall', 'brain_handoff', 'brain_set_focus', 'brain_decision', 'report_create', 'pages_search', 'pages_list', 'page_read', 'page_create', 'page_append', 'page_update', 'databases_list', 'database_query', 'database_add_row', 'row_update'].every((n) => names.includes(n)), names.join(','));
  check('tools: each has a description and an object schema', tl.every((x) => x.description.length > 20 && x.inputSchema.type === 'object'));
  check('tools: the delete tool is hidden unless allowed', !names.includes('page_trash'));
  check('tools: read tools are marked read-only, changing tools are not', tl.find((x) => x.name === 'page_read').annotations.readOnlyHint === true && tl.find((x) => x.name === 'page_update').annotations.destructiveHint === true && tl.find((x) => x.name === 'brain_remember').annotations.readOnlyHint === false);
  const pr = await mcp.rpc('prompts/list');
  check('prompts: brain_start and brain_wrapup', pr.result.prompts.map((x) => x.name).join() === 'brain_start,brain_wrapup' && /brain_context/.test((await mcp.rpc('prompts/get', { name: 'brain_start' })).result.messages[0].content.text));
  check('an unknown tool is an error', (await mcp.call('does_not_exist')).error.code === -32602);
  check('page_trash called while hidden is refused', (await mcp.call('page_trash', { id: 'x' })).error.code === -32602);

  // ---------- an imported "AI Shared Brain" is adopted, not duplicated ----------
  const pre = await J(`(() => { const r = BP.createPage(null, { title: 'AI Shared Brain', blocks: [BP.newBlock('p', 'my own notes')] }); const h = BP.createPage(r.id, { title: 'Handoffs' }); return { root: r.id, handoffs: h.id }; })()`);
  const st0 = await mcp.call('blockpad_status');
  check('status: connected, brain not set up yet (adoption not triggered by a read)', /Connected to Blockpad/.test(st0.text) && /Shared Brain: set up|not set up/.test(st0.text), st0.text);
  const c0 = await mcp.call('brain_context');
  check('context: an adoptable page counts as the brain', !c0.isError, c0.text.slice(0, 120));

  // ---------- remember ----------
  const r1 = await mcp.call('brain_remember', { text: 'The deploy script lives in tools/deploy.sh and needs NODE_ENV=production.', title: 'Deploy script', tags: ['project-x', 'howto'] });
  check('remember: creates a memory page', /new page/.test(r1.text) && !r1.isError, r1.text);
  const st = await J(`(() => { const roots = BP.allPages().filter((p) => p.brainRoot); const kids = roots[0] ? BP.children(roots[0].id).map((c) => c.title) : []; const mem = BP.allPages().filter((p) => p.title === 'Deploy script'); return { roots: roots.length, rootTitle: roots[0] && roots[0].title, rootId: roots[0] && roots[0].id, kids, dupRoot: BP.allPages().filter((p) => /^shared brain$/i.test(p.title)).length, mem: mem.length, createdBy: mem[0] && mem[0].createdBy, editedBy: mem[0] && mem[0].editedBy, tags: mem[0] && mem[0].tags, agent: mem[0] && mem[0].meta && mem[0].meta.agent }; })()`);
  check('the existing "AI Shared Brain" page was adopted as the root (no second brain)', st.roots === 1 && st.rootId === pre.root && st.rootTitle === 'AI Shared Brain' && st.dupRoot === 0, JSON.stringify(st));
  check('the sections and CURRENT are filled in, and the existing Handoffs page is reused', ['Memories', 'Handoffs', 'Decisions', 'Reports', 'Projects', 'Inbox', 'CURRENT'].every((n) => st.kids.includes(n)) && st.kids.filter((k) => k === 'Handoffs').length === 1 && (await J(`BP.children('${pre.root}').find((c) => c.title === 'Handoffs').id`)) === pre.handoffs, st.kids.join(','));
  check('the memory is credited to the agent that wrote it', st.mem === 1 && st.createdBy === 'Claude Code' && st.editedBy === 'Claude Code' && st.agent === 'Claude Code' && st.tags.join() === 'project-x,howto', JSON.stringify([st.createdBy, st.tags, st.agent]));
  const r2 = await mcp.call('brain_remember', { text: 'It also needs the release tag.', title: 'deploy SCRIPT' });
  const memPage = await J(`(() => { const m = BP.allPages().filter((p) => (p.title || '').toLowerCase() === 'deploy script'); return { n: m.length, md: BP.pageToMd(m[0]) }; })()`);
  check('remember: the same topic gets a dated entry, not a duplicate page', /existing memory/.test(r2.text) && memPage.n === 1 && memPage.md.includes('NODE_ENV=production') && memPage.md.includes('release tag') && /###\s+\d{4}-\d{2}-\d{2}/.test(memPage.md) && memPage.md.includes('Claude Code'), r2.text);
  check('remember: empty text is a clear error', (await mcp.call('brain_remember', { text: '   ' })).isError);

  // ---------- recall ----------
  const rc = await mcp.call('brain_recall', { query: 'deploy production' });
  check('recall: finds it by words, with the best match first and a snippet', /Deploy script/.test(rc.text) && /NODE_ENV/.test(rc.text) && /1 match/.test(rc.text), rc.text);
  check('recall: finds it by tag', /Deploy script/.test((await mcp.call('brain_recall', { tags: ['howto'] })).text) && /Nothing found/.test((await mcp.call('brain_recall', { tags: ['nope'] })).text));
  check('recall: all words must match', /Nothing found/.test((await mcp.call('brain_recall', { query: 'deploy zebra' })).text));
  check('recall: a section filter limits the search', /Nothing found/.test((await mcp.call('brain_recall', { query: 'deploy', section: 'Handoffs' })).text));

  // ---------- focus and handoff ----------
  await mcp.call('brain_set_focus', { text: 'Ship version 2' + nl + '- Fix the login bug' });
  const cur = await J(`(() => { const c = BP.children('${pre.root}').find((x) => x.title === 'CURRENT'); return BP.pageToMd(c); })()`);
  check('focus: replaces the Active focus list (one bullet per line)', /Ship version 2/.test(cur) && /Fix the login bug/.test(cur) && !/Nothing yet/.test(cur), cur);
  const h1 = await mcp.call('brain_handoff', { summary: 'Finished the API layer and the tests.', done: ['API routes', 'Tests'], next: ['Write the docs', 'Cut the release'], files: ['mcp/blockpad-mcp.js'], questions: 'Which version number?', to: 'Codex' });
  check('handoff: written', /Handoff written/.test(h1.text) && !h1.isError, h1.text);
  const ho = await J(`(() => { const sec = BP.children('${pre.root}').find((x) => x.title === 'Handoffs'); const kids = BP.children(sec.id); const p = kids.find((k) => /Codex/.test(k.title)); const cur = BP.children('${pre.root}').find((x) => x.title === 'CURRENT'); const md = p ? BP.pageToMd(p) : ''; const todo = p ? p.blocks.filter((b) => b.type === 'todo').map((b) => BP.textOf(b.text)) : []; return { title: p && p.title, from: p && p.meta.from, to: p && p.meta.to, status: p && p.meta.status, tags: p && p.tags, md, todo, curLink: p ? JSON.stringify(cur.blocks).includes('bp://page/' + p.id) : false, id: p && p.id, count: kids.length }; })()`);
  check('handoff: a page in Handoffs, from this agent to Codex, status open, tagged', /Claude Code → Codex/.test(ho.title) && ho.from === 'Claude Code' && ho.to === 'Codex' && ho.status === 'open' && ho.tags.includes('handoff'), JSON.stringify([ho.title, ho.from, ho.to, ho.status]));
  check('handoff: summary, done, next steps as tasks, files and questions', /Finished the API layer/.test(ho.md) && ho.todo.join() === 'Write the docs,Cut the release' && /API routes/.test(ho.md) && /blockpad-mcp\.js/.test(ho.md) && /Which version number/.test(ho.md), ho.md.slice(0, 200));
  check('handoff: linked from CURRENT under Recent handoffs', ho.curLink);
  const ctx = await mcp.call('brain_context');
  check('context: shows CURRENT, the handoff, and the memory', /Ship version 2/.test(ctx.text) && /Finished the API layer/.test(ctx.text) && /Deploy script/.test(ctx.text) && /Latest handoffs/.test(ctx.text) && /\(id: [a-z0-9]+, open\)/.test(ctx.text), ctx.text.slice(0, 600));
  check('handoff: needs a summary', (await mcp.call('brain_handoff', { summary: '' })).isError);
  for (let i = 0; i < 12; i++) await mcp.call('brain_handoff', { summary: 'Round ' + i, to: 'Codex' });
  const bullets = await J(`(() => { const cur = BP.children('${pre.root}').find((x) => x.title === 'CURRENT'); const i = cur.blocks.findIndex((b) => /^h/.test(b.type) && /recent handoffs/i.test(BP.textOf(b.text))); let n = 0; for (let k = i + 1; k < cur.blocks.length && !/^h/.test(cur.blocks[k].type); k++) if (cur.blocks[k].type === 'bullet') n++; return n; })()`);
  check('handoff: CURRENT keeps only the latest 10', bullets === 10, bullets);

  // ---------- decisions and reports ----------
  const dc = await mcp.call('brain_decision', { decision: 'Use SQLite for storage', why: 'No setup needed', alternatives: ['Postgres', 'Files'] });
  const dec = await J(`(() => { const sec = BP.children('${pre.root}').find((x) => x.title === 'Decisions'); const p = BP.children(sec.id).find((k) => /SQLite/.test(k.title)); return p ? { md: BP.pageToMd(p), tags: p.tags } : null; })()`);
  check('decision: recorded with the reasons and alternatives', /Decision recorded/.test(dc.text) && dec && /No setup needed/.test(dec.md) && /Postgres/.test(dec.md) && dec.tags.includes('decision'), dc.text);
  const rp = await mcp.call('report_create', { title: 'Weekly report', markdown: '# Summary' + nl + nl + '| item | count |' + nl + '| --- | --- |' + nl + '| pages | 12 |' + nl + nl + 'See [[Deploy script]] for details. #weekly', tags: ['status'] });
  const rep = await J(`(() => { const sec = BP.children('${pre.root}').find((x) => x.title === 'Reports'); const p = BP.children(sec.id).find((k) => k.title === 'Weekly report'); const dep = BP.allPages().find((x) => x.title === 'Deploy script'); return p ? { table: p.blocks.some((b) => b.type === 'table'), link: JSON.stringify(p.blocks).includes('bp://page/' + dep.id), tag: JSON.stringify(p.blocks).includes('bp://tag/weekly'), tags: p.tags, agent: p.meta.agent, backlinks: BP.kb.backlinks(dep.id).map((x) => x.page.title) } : null; })()`);
  check('report: a page in Reports with a real table, a link to the page it names, a tag, credited', /Report created/.test(rp.text) && rep && rep.table && rep.link && rep.tag && rep.tags.join() === 'report,status' && rep.agent === 'Claude Code', JSON.stringify(rep));
  check('report: the page it links to now lists it as a backlink', rep && rep.backlinks.includes('Weekly report'));
  const rp2 = await mcp.call('report_create', { title: 'Weekly report', markdown: 'again' });
  check('report: the same title gets a number instead of overwriting', /Weekly report \(2\)/.test(rp2.text), rp2.text);
  check('report: a report under another page', /Report created/.test((await mcp.call('report_create', { title: 'Inside', markdown: 'x', parent: 'Deploy script' })).text));

  // ---------- pages ----------
  const pc = await mcp.call('page_create', { title: 'Agent page', markdown: '---' + nl + 'tags: [alpha, beta]' + nl + 'status: draft' + nl + '---' + nl + '# Heading' + nl + nl + 'Links to [[Deploy script]].', meta: { owner: 'me' } });
  const ap = await J(`(() => { const p = BP.allPages().find((x) => x.title === 'Agent page'); const dep = BP.allPages().find((x) => x.title === 'Deploy script'); return p ? { id: p.id, tags: p.tags, meta: p.meta, by: p.createdBy, link: JSON.stringify(p.blocks).includes('bp://page/' + dep.id), h1: p.blocks.some((b) => b.type === 'h1') } : null; })()`);
  check('page_create: frontmatter becomes tags and properties, [[link]] is linked, credited', /Created/.test(pc.text) && ap && ap.tags.join() === 'alpha,beta' && ap.meta.status === 'draft' && ap.meta.owner === 'me' && ap.by === 'Claude Code' && ap.link && ap.h1, JSON.stringify(ap));
  const rd = await mcp.call('page_read', { title: 'Agent page' });
  check('page_read by title: markdown, tags, properties', /# Agent page/.test(rd.text) && /Heading/.test(rd.text) && /#alpha/.test(rd.text) && /status = draft/.test(rd.text) && /by Claude Code/.test(rd.text), rd.text.slice(0, 300));
  const rd2 = await mcp.call('page_read', { title: 'Deploy script' });
  check('page_read: shows the pages that link to it', /Linked from:/.test(rd2.text) && /Agent page/.test(rd2.text), rd2.text.slice(-300));
  await mcp.call('page_append', { title: 'Agent page', markdown: 'Added later by the agent.' });
  check('page_append: adds to the end and keeps the rest', (await J(`BP.pageToMd(BP.page('${ap.id}'))`)).includes('Heading') && (await J(`BP.pageToMd(BP.page('${ap.id}'))`)).includes('Added later by the agent'));
  await mcp.call('page_update', { id: ap.id, new_title: 'Agent page 2', add_tags: ['gamma'], meta: { status: null } });
  const up = await J(`(() => { const p = BP.page('${ap.id}'); return { title: p.title, tags: p.tags, meta: p.meta, hist: (p.history || []).length }; })()`);
  check('page_update: rename, add a tag, remove a property', up.title === 'Agent page 2' && up.tags.join() === 'alpha,beta,gamma' && up.meta.status === undefined && up.meta.owner === 'me', JSON.stringify(up));
  await mcp.call('page_update', { id: ap.id, markdown: 'Completely new text.' });
  check('page_update: replacing text works and the old text stays in the history', (await J(`BP.pageToMd(BP.page('${ap.id}'))`)).includes('Completely new text') && !(await J(`BP.pageToMd(BP.page('${ap.id}'))`)).includes('Heading') && (await J(`(BP.materializeHistory(), JSON.stringify(BP.page('${ap.id}').history).includes('Added later'))`)));
  check('pages_search: by words and by tag', /Agent page 2/.test((await mcp.call('pages_search', { query: 'Completely new' })).text) && /Agent page 2/.test((await mcp.call('pages_search', { tag: 'gamma' })).text) && /No pages found/.test((await mcp.call('pages_search', { query: 'qqqzzz' })).text));
  check('pages_search needs something to look for', (await mcp.call('pages_search', {})).isError);
  check('pages_list: the top level has the brain; its sub-pages can be listed', /AI Shared Brain/.test((await mcp.call('pages_list')).text) && /Memories/.test((await mcp.call('pages_list', { parent: pre.root })).text));
  await J(`(() => { BP.createPage(null, { title: 'Dup' }); BP.createPage(null, { title: 'Dup' }); return 1; })()`);
  const dup = await mcp.call('page_read', { title: 'Dup' });
  check('an ambiguous title asks for the id', dup.isError && /Several pages match/.test(dup.text), dup.text);
  check('a missing page is a clear error', (await mcp.call('page_read', { title: 'No such page anywhere' })).isError);

  // ---------- databases ----------
  const db = await J(`(() => { const d = BP.createDatabase(null, { title: 'Agent tasks' }); BP.addRow(d.id, 'First row'); return d.id; })()`);
  check('databases_list shows it', /Agent tasks.*1 rows/.test((await mcp.call('databases_list')).text));
  const add = await mcp.call('database_add_row', { database: 'Agent tasks', title: 'From the agent', properties: { Status: 'In progress' } });
  const rowId = (/id: ([a-z0-9]+)/.exec(add.text) || [])[1];
  const dq = await mcp.call('database_query', { database: 'agent tasks' });
  check('database_add_row + database_query: the row is there with its property', /From the agent/.test(dq.text) && /Status: In progress/.test(dq.text) && /First row/.test(dq.text), dq.text);
  check('the row is credited to the agent', (await J(`BP.page('${rowId}').createdBy`)) === 'Claude Code');
  await mcp.call('row_update', { id: rowId, properties: { Status: 'Done' }, markdown: 'note from the agent' });
  check('row_update: changes the property and adds notes', /Status: Done/.test((await mcp.call('database_query', { id: db, query: 'agent' })).text) && (await J(`BP.pageToMd(BP.page('${rowId}'))`)).includes('note from the agent'));
  check('a bad property name is a clear error', /Unknown property/.test((await mcp.call('database_add_row', { id: db, title: 'x', properties: { Nope: 1 } })).text));

  // ---------- two agents writing at once ----------
  await Promise.all(Array.from({ length: 8 }, (_, i) => mcp.call('brain_remember', { title: 'Race topic', text: 'entry number ' + i })));
  const race = await J(`(() => { const m = BP.allPages().filter((p) => p.title === 'Race topic'); return { n: m.length, entries: m[0] ? (BP.pageToMd(m[0]).match(/entry number/g) || []).length : 0 }; })()`);
  check('eight simultaneous memories on one topic make one page with all eight entries', race.n === 1 && race.entries === 8, JSON.stringify(race));

  // ---------- the activity log ----------
  const log = await J(`(BP.state.agentLog || []).map((e) => e.agent + ' | ' + e.action)`);
  check('every change by an agent is listed in the activity log', log.length >= 25 && log.some((l) => /^Claude Code \| remembered/.test(l)) && log.some((l) => /wrote a handoff/.test(l)) && log.some((l) => /created page/.test(l)) && log.some((l) => /added a row/.test(l)), log.length + ' entries');

  // ---------- settings page ----------
  await t.eval(`BP.openSettings('agents'); 0`); await W(900);
  const ui = await J(`(() => { const m = document.querySelector('.modal'); return { tab: [...m.querySelectorAll('.set-tabs button')].some((b) => b.textContent === 'AI agents' && b.classList.contains('on')), text: m.querySelector('.set-pane').textContent, code: (m.querySelector('.ag-code') || {}).textContent, enabled: m.querySelector('.set-pane input[type=checkbox]').checked }; })()`);
  check('Settings has an AI agents tab, on', ui.tab && /Let AI agents connect/.test(ui.text) && ui.enabled);
  check('Claude Code snippet: the claude mcp add command with the key and the server file', /^claude mcp add --scope user/.test(ui.code) && ui.code.includes('--env BLOCKPAD_TOKEN=' + TOKEN) && /blockpad-mcp\.js/.test(ui.code) && /blockpad --/.test(ui.code) && ui.code.includes('BLOCKPAD_PORT=' + PORT), ui.code);
  await t.eval(`[...document.querySelectorAll('.modal .seg button')].find((b) => /Codex/.test(b.textContent)).click()`); await W(150);
  const codex = await J(`document.querySelector('.ag-code').textContent`);
  check('Codex snippet: a [mcp_servers.blockpad] block with command, args and env', /\[mcp_servers\.blockpad\]/.test(codex) && /command = /.test(codex) && /args = \[/.test(codex) && codex.includes('BLOCKPAD_TOKEN = \'' + TOKEN + '\''), codex);
  await t.eval(`[...document.querySelectorAll('.modal .seg button')].find((b) => /Cursor/.test(b.textContent)).click()`); await W(150);
  const cj = await J(`document.querySelector('.ag-code').textContent`);
  let parsed = null; try { parsed = JSON.parse(cj); } catch (_) {}
  check('the snippet points at a server file that exists, and a command that can run it', !!parsed && require('fs').existsSync(parsed.mcpServers.blockpad.args[0]) && (parsed.mcpServers.blockpad.command === 'node' || require('fs').existsSync(parsed.mcpServers.blockpad.command)), parsed && parsed.mcpServers.blockpad.args[0]);
  check('JSON snippet: valid, with the server command, args and env', !!parsed && parsed.mcpServers.blockpad.args[0].endsWith('blockpad-mcp.js') && parsed.mcpServers.blockpad.env.BLOCKPAD_TOKEN === TOKEN, cj.slice(0, 160));
  await t.eval(`[...document.querySelectorAll('.modal .ag-box .btn')].find((b) => /Test the connection/.test(b.textContent)).click()`); await W(900);
  check('Test the connection: the app reaches its own API with the key', /Blockpad answers/.test(await J(`document.querySelector('.ag-test').textContent`)), await J(`document.querySelector('.ag-test').textContent`));
  const acts = await J(`document.querySelector('.ag-act').textContent`);
  check('the settings page lists what agents did, naming the agent', /Claude Code/.test(acts) && /remembered|wrote a handoff|created page/.test(acts));
  check('the Shared Brain section offers to open it', await J(`[...document.querySelectorAll('.modal .btn')].some((b) => /Open the Shared Brain/.test(b.textContent))`));

  // ---------- agents may only read ----------
  await t.eval(`(() => { const cb = [...document.querySelectorAll('.modal label.chk')].find((l) => /Agents can change pages/.test(l.textContent)).querySelector('input'); cb.checked = false; cb.dispatchEvent(new Event('change')); })()`); await W(200);
  check('turning off "Agents can change pages" sets read-only', (await J(`BP.state.settings.api.readOnly`)) === true);
  const ro1 = await mcp.call('page_create', { title: 'Should not exist' });
  check('read-only: a write is refused with an explanation', ro1.isError && /read-only/i.test(ro1.text) && !(await J(`BP.allPages().some((p) => p.title === 'Should not exist')`)), ro1.text);
  check('read-only: reading still works', !(await mcp.call('page_read', { title: 'Deploy script' })).isError && !(await mcp.call('brain_context')).isError);
  await t.eval(`(() => { const cb = [...document.querySelectorAll('.modal label.chk')].find((l) => /Agents can change pages/.test(l.textContent)).querySelector('input'); cb.checked = true; cb.dispatchEvent(new Event('change')); })()`); await W(200);
  check('…and writing works again when switched back', !(await mcp.call('page_create', { title: 'Allowed again' })).isError);
  await t.eval(`document.querySelectorAll('.modal-back').forEach((m) => m.remove()); 0`);

  // ---------- other ways the server can be started ----------
  const ro = mk({ BLOCKPAD_READONLY: '1' });
  await ro.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'codex' } });
  const roNames = (await ro.rpc('tools/list')).result.tools.map((x) => x.name);
  check('BLOCKPAD_READONLY=1: only read tools are offered', roNames.includes('brain_recall') && roNames.includes('page_read') && !roNames.includes('brain_remember') && !roNames.includes('page_create') && !roNames.includes('database_add_row'), roNames.join(','));
  ro.kill();

  const del = mk({ BLOCKPAD_ALLOW_DELETE: '1', BLOCKPAD_AGENT: 'Test Bot' });
  await del.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'whatever' } });
  check('BLOCKPAD_ALLOW_DELETE=1: page_trash is offered', (await del.rpc('tools/list')).result.tools.some((x) => x.name === 'page_trash'));
  const dupId = await J(`BP.allPages().find((p) => p.title === 'Dup').id`);
  const tr = await del.call('page_trash', { id: dupId });
  check('page_trash moves the page to the Trash (restorable)', !tr.isError && (await J(`BP.page('${dupId}').trashed`)) === true && /Trash/.test(tr.text), tr.text);
  await del.call('page_create', { title: 'Named bot page' });
  check('BLOCKPAD_AGENT names the agent in the credits', (await J(`BP.allPages().find((p) => p.title === 'Named bot page').createdBy`)) === 'Test Bot' && (await J(`BP.state.agentLog[0].agent`)) === 'Test Bot');
  del.kill();

  const bad = mk({ BLOCKPAD_TOKEN: 'wrong' });
  await bad.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'x' } });
  const b1 = await bad.call('blockpad_status');
  check('a wrong key gives a clear message', b1.isError && /did not accept the token/.test(b1.text), b1.text);
  bad.kill();

  const noKey = mk({ BLOCKPAD_TOKEN: '' });
  await noKey.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'x' } });
  const n1 = await noKey.call('blockpad_status');
  check('a missing key says it is empty', n1.isError && /empty|did not accept/.test(n1.text), n1.text);
  noKey.kill();

  await startApi(false); await W(300);
  const off = await mcp.call('blockpad_status');
  check('when the app is not listening the message says how to switch it on', off.isError && /Cannot reach Blockpad/.test(off.text) && /Let AI agents connect/.test(off.text), off.text);
  await startApi(true); await W(300);
  check('and it works again when switched back on', !(await mcp.call('blockpad_status')).isError);

  const away = mk({ BLOCKPAD_URL: 'http://example.com:7878' });
  await W(1200);
  check('an address that is not on this computer is refused at start', away.exited() === 2 && /this computer/.test(away.errs()), away.errs());
  away.kill();

  // ---------- the API itself ----------
  const raw = async (m, p, body, headers) => { const r = await fetch('http://127.0.0.1:' + PORT + p, { method: m, headers: Object.assign({ authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' }, headers || {}), body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
  check('the API still refuses browsers (Origin) and missing keys', (await raw('GET', '/api/brain/status', null, { origin: 'https://evil.example' })).status === 403 && (await fetch('http://127.0.0.1:' + PORT + '/api/brain/status')).status === 401);
  check('the API root lists the brain endpoints', (await raw('GET', '/api')).j.endpoints.some((e) => /brain\/handoff/.test(e)));
  check('unknown brain actions are 404', (await raw('POST', '/api/brain/nothing', {})).status === 404);

  mcp.kill();
  const errs = t.logs.filter((l) => /^\[3\]/.test(l));
  check('no errors in the console', !errs.length, errs.slice(0, 3).join(' || '));
  console.log(fails ? nl + 'FAIL ' + fails + ' check(s)' : nl + 'ALL CHECKS PASSED');
  if (fails) throw new Error('smoke39 failed');
};

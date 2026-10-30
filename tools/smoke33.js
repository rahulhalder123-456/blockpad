/* The Obsidian-style features, end to end in the real app: links and backlinks, unlinked mentions, tags, renames,
   [[ and # in the editor, the links panel, hover previews, daily notes, the command palette, the graph, canvases,
   page properties, importing an Obsidian vault folder and exporting one (folder and .zip). */
const fs = require('fs'); const path = require('path');
module.exports = async (t) => {
  let fails = 0;
  const check = (label, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + label + (extra != null ? '  ' + extra : '')); if (!cond) fails++; };
  const J = async (c) => JSON.parse(await t.eval(`Promise.resolve(${c}).then((v)=>JSON.stringify(v === undefined ? null : v))`));
  const W = (ms) => t.wait(ms);

  // ---------- link index ----------
  const ids = await J(`(() => {
    const A = BP.createPage(null, { title: 'Alpha project', blocks: [BP.newBlock('p', 'The plan.')] });
    const B = BP.createPage(null, { title: 'Beta notes', blocks: [BP.newBlock('p', 'See <a href="bp://page/' + A.id + '">Alpha project</a> for details #work/client')] });
    const C = BP.createPage(null, { title: 'Gamma', blocks: [BP.newBlock('p', 'We talked about the alpha project today. #work')] });
    const D = BP.createPage(null, { title: 'Lonely', blocks: [BP.newBlock('p', 'nothing')] });
    return { A: A.id, B: B.id, C: C.id, D: D.id };
  })()`);
  check('backlinks find the linking page', (await J(`BP.kb.backlinks('${ids.A}').map(x => x.page.id)`)).join() === ids.B);
  check('backlink has the sentence around the link', (await J(`BP.kb.backlinks('${ids.A}')[0].snippets[0].text`)).includes('for details'));
  check('outgoing links', (await J(`BP.kb.outgoing('${ids.B}').map(p => p.id)`)).join() === ids.A);
  check('unlinked mention found (case-insensitive)', (await J(`BP.kb.unlinked('${ids.A}').map(x => x.page.id)`)).join() === ids.C);
  const blk = await J(`BP.kb.unlinked('${ids.A}')[0].snippets[0].block`);
  check('Link turns the mention into a link', await J(`BP.kb.linkMention('${ids.C}', '${blk}', '${ids.A}')`));
  check('now both pages link here', (await J(`BP.kb.backlinks('${ids.A}').length`)) === 2);
  check('the mention text is kept', (await J(`BP.page('${ids.C}').blocks[0].text`)).includes('>alpha project</a>'));
  const tags = await J(`BP.kb.allTags().map(t => t.key + ':' + t.pages.size)`);
  check('tags with counts, nested tag counts for its parent', tags.includes('work:2') && tags.includes('work/client:1'), tags.join(' '));
  check('pages with a tag (nested included)', (await J(`BP.kb.pagesWithTag('work').length`)) === 2);
  check('"C#" or "&#39;" are not tags', (await J(`(() => { const p = BP.createPage(null, { title: 'x', blocks: [BP.newBlock('p', 'I like C# and it&#39;s 2024 #123')] }); const n = BP.kb.tagsOf(p).length; BP.purge(p.id); return n; })()`)) === 0);
  await J(`(() => { const a = BP.page('${ids.A}'); a.title = 'Alpha programme'; BP.touch(a); return BP.kb.renamed(a, 'Alpha project'); })()`);
  check('renaming updates link text that showed the old name', (await J(`BP.page('${ids.B}').blocks[0].text`)).includes('>Alpha programme</a>'));
  check('…but leaves link text that was written differently', (await J(`BP.page('${ids.C}').blocks[0].text`)).includes('>alpha project</a>'));

  // ---------- editor: [[ and # ----------
  await t.eval(`BP.open('${ids.D}')`); await W(300);
  await t.eval(`(() => { const el = document.querySelector('.editor .block .txt'); el.focus(); BP.editorHelpers.setCaret(el, 'end'); })()`);
  await t.type(' [[Alpha pro'); await W(250);
  check('[[ opens the page menu', await J(`!!document.querySelector('.slash') && document.querySelector('.slash').textContent.includes('Alpha programme')`));
  const onItem = await J(`[...document.querySelectorAll('.slash .slash-item')].map(x => (x.classList.contains('on') ? '>' : '') + x.querySelector('b').textContent).join(' | ')`);
  check('[[ menu: the best match is highlighted first', onItem.startsWith('>Alpha programme'), onItem);
  t.key('Return'); await W(250);
  await t.type('#proj'); await W(250);
  check('# opens the tag menu with "new tag"', await J(`!!document.querySelector('.slash') && document.querySelector('.slash').textContent.includes('New tag')`));
  t.key('Return'); await W(250);
  await t.type('[[Brand new idea'); await W(250);
  check('[[ offers to create a missing page', await J(`document.querySelector('.slash') && document.querySelector('.slash').textContent.includes('Create page')`));
  t.key('Down'); await W(80);
  const pick = await J(`[...document.querySelectorAll('.slash .slash-item')].findIndex(x => x.textContent.includes('Create page'))`);
  await t.eval(`document.querySelectorAll('.slash .slash-item')[${pick}].click()`); await W(400);
  await t.eval('BP.currentEditor && BP.currentEditor.flushTyping && BP.currentEditor.flushTyping()'); await W(200);
  const dText = await J(`BP.page('${ids.D}').blocks[0].text`);
  check('[[ inserted a page link', dText.includes('bp://page/' + ids.A), dText);
  check('# inserted a tag', dText.includes('bp://tag/proj'));
  const np = await J(`(BP.allPages().find(p => p.title === 'Brand new idea') || {}).id`);
  check('[[ created the new page and linked it', !!np && dText.includes('bp://page/' + np));

  // ---------- links panel, hover preview ----------
  await t.eval(`BP.open('${ids.A}')`); await W(200);
  check('topbar shows how many pages link here', (await J(`(document.querySelector('.kb-btn .badge') || {}).textContent`)) === '3');
  await t.eval(`BP.ui.togglePanel('links', true)`); await W(300);
  const panel = await J(`document.querySelector('.kb-panel') ? document.querySelector('.kb-panel').textContent : ''`);
  check('links panel lists linked mentions', panel.includes('Linked mentions') && panel.includes('Beta notes') && panel.includes('Gamma'));
  check('links panel has outline, unlinked, outgoing, tags and a word count', ['Outline', 'Unlinked mentions', 'Outgoing links', 'Tags', 'words'].every((w) => panel.includes(w)));
  await t.eval(`BP.ui.togglePanel('links', false)`); await W(100);
  await t.eval(`BP.open('${ids.B}')`); await W(300);
  await t.eval(`(() => { const a = document.querySelector('.editor a[href^="bp://page/"]'); a.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); })()`);
  await W(900);
  check('hovering a link shows a preview of that page', await J(`!!document.querySelector('.kb-peek') && document.querySelector('.kb-peek').textContent.includes('The plan')`));
  await t.eval(`document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`); await W(100);

  // ---------- properties ----------
  await J(`(() => { const p = BP.page('${ids.B}'); p.tags = ['reading']; p.meta = { status: 'draft', rating: 4, done: false }; BP.touch(p); BP.renderAll(); })()`); await W(200);
  check('properties show under the title', await J(`!!document.querySelector('.kb-props') && document.querySelector('.kb-props').textContent.includes('status')`));
  await t.eval(`(() => { const i = document.querySelector('.kb-tagin'); i.focus(); i.value = 'later'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`); await W(200);
  check('adding a tag in the properties', (await J(`BP.page('${ids.B}').tags`)).join() === 'reading,later');
  check('property tags count as tags', (await J(`BP.kb.pagesWithTag('later').map(p => p.id)`)).join() === ids.B);

  // ---------- search by tag ----------
  await t.eval(`BP.ui.openSearch()`); await W(200);
  await t.type('#work'); await W(300);
  check('search "#work" lists tagged pages', await J(`document.querySelector('.search-list').textContent.includes('Beta notes') && document.querySelector('.search-list').textContent.includes('Gamma')`));
  t.key('Escape'); await W(150);

  // ---------- daily notes ----------
  const d1 = await J(`(() => { BP.kb.openToday(); return BP.state.current; })()`); await W(200);
  const d2 = await J(`(() => { BP.kb.openToday(); return BP.state.current; })()`);
  check('Today opens one page per day (same page twice)', d1 && d1 === d2);
  check('daily page sits in the Daily notes page, named by date', await J(`(() => { const p = BP.page('${d1}'); const f = BP.page(p.parent); return !!f && f.title === 'Daily notes' && /^\\d{4}-\\d{2}-\\d{2}$/.test(p.title) && p.daily === p.title; })()`));
  check('date format setting', await J(`BP.kb.fmtDate(new Date(2026, 9, 30), 'dddd D MMMM YYYY').endsWith('30 October 2026')`));

  // ---------- command palette ----------
  t.key('p', ['control']); await W(250);
  check('Ctrl+P opens the command palette', await J(`!!document.querySelector('.modal.search') && document.querySelector('.search-in').placeholder.includes('command')`));
  await t.type('ogv'); await W(200);
  const pal = await J(`(() => ({ q: (document.querySelector('.search-in') || {}).value, top: [...document.querySelectorAll('.search-list .sr-item')].slice(0, 3).map(x => (x.classList.contains('on') ? '>' : '') + x.querySelector('b').textContent).join(' | ') }))()`);
  check('palette matches letters in order ("ogv")', pal.top.startsWith('>Open graph view'), JSON.stringify(pal));
  t.key('Return'); await W(1200);
  check('the command ran (graph view opened)', await J(`!!document.querySelector('.gv-canvas')`));

  // ---------- graph ----------
  const g = await J(`(() => { const L = BP.graph._live; return { n: L.nodes().length, e: L.edges().length, lab: L.nodes().map(n => n.label) }; })()`);
  check('graph has the pages and the links', g.n >= 5 && g.e >= 3 && g.lab.includes('Alpha programme'), g.n + ' nodes ' + g.e + ' edges');
  const lc = await J(`BP.graph.build({ local: '${ids.A}', depth: 1, orphans: true, kids: false }).nodes.map(n => n.id)`);
  check('local graph: the page and its neighbours only', lc.includes(ids.A) && lc.includes(ids.B) && lc.includes(ids.C) && !lc.includes(d1), lc.length + ' nodes');
  const withTags = await J(`BP.graph.build({ tags: true, orphans: false }).nodes.some(n => n.id === 'tag:work')`);
  check('graph can show tags as dots', withTags);
  const before = await J(`BP.state.current`);
  const pos = await J(`(() => { const L = BP.graph._live; const n = L.nodes().find(x => x.label === 'Gamma'); const r = L.canvas.getBoundingClientRect(); const v = L.view(); return { x: Math.round(r.left + r.width / 2 + v.x + n.x * v.k), y: Math.round(r.top + r.height / 2 + v.y + n.y * v.k) }; })()`);
  await W(800);
  const pos2 = await J(`(() => { const L = BP.graph._live; const n = L.nodes().find(x => x.label === 'Gamma'); const r = L.canvas.getBoundingClientRect(); const v = L.view(); return { x: Math.round(r.left + r.width / 2 + v.x + n.x * v.k), y: Math.round(r.top + r.height / 2 + v.y + n.y * v.k) }; })()`);
  t.click(pos2.x, pos2.y); await W(500);
  check('clicking a dot opens that page', (await J(`BP.state.current`)) === ids.C, 'was ' + before + ' pos ' + JSON.stringify(pos2));
  await t.eval(`document.querySelectorAll('.modal-back').forEach(m => m.remove())`);

  // ---------- canvas ----------
  const cvId = await J(`(() => { const c = BP.canvas.create(null, 'Board'); BP.open(c.id); return c.id; })()`); await W(400);
  check('a canvas page renders a board', await J(`!!document.querySelector('.cv-board')`));
  await t.eval(`(() => { BP.canvas._add('text'); document.querySelector('.cv-edit').value = '# Idea\\n- one'; document.querySelector('.cv-edit').blur(); BP.canvas._add('file', { page: '${ids.A}' }); })()`); await W(500);
  check('cards are added (text and page)', (await J(`BP.page('${cvId}').canvas.nodes.length`)) === 2);
  check('text card renders Markdown', await J(`document.querySelector('.cv-text .cvh1') && document.querySelector('.cv-text .cvh1').textContent === 'Idea'`));
  check('page card shows the page', await J(`document.querySelector('.cv-pagec').textContent.includes('Alpha programme')`));
  // connect them by dragging from the first card's right dot to the second card
  const nodesPos = await J(`[...document.querySelectorAll('.cv-node')].map(n => { const r = n.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })`);
  await t.eval(`(() => { const a = document.querySelectorAll('.cv-node')[0]; a.classList.add('sel'); })()`);
  const dot = await J(`(() => { const d = document.querySelectorAll('.cv-node')[0].querySelector('.cv-dot.cv-right'); const r = d.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  const tgt = nodesPos[1];
  await t.eval(`(() => {
    const board = document.querySelector('.cv-board');
    const dot = document.querySelectorAll('.cv-node')[0].querySelector('.cv-dot.cv-right');
    const ev = (type, x, y, el) => (el || board).dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 7, isPrimary: true, button: 0 }));
    ev('pointerdown', ${dot.x}, ${dot.y}, dot);
    ev('pointermove', ${Math.round(tgt.x + tgt.w / 2)}, ${Math.round(tgt.y + tgt.h / 2)});
    ev('pointerup', ${Math.round(tgt.x + tgt.w / 2)}, ${Math.round(tgt.y + tgt.h / 2)});
  })()`); await W(500);
  check('dragging from a dot to a card draws an arrow', (await J(`BP.page('${cvId}').canvas.edges.length`)) === 1 && (await J(`document.querySelectorAll('.cv-edge').length`)) === 1);
  check('a canvas that shows a page counts as a link to it', (await J(`BP.kb.backlinks('${ids.A}').some(x => x.page.id === '${cvId}')`)));
  const round = await J(`(() => { const p = BP.page('${cvId}'); const j = BP.canvas.toJson(p, (id) => id === '${ids.A}' ? 'Alpha programme.md' : null); const back = BP.canvas.fromJson(j, (f) => f === 'Alpha programme.md' ? { page: '${ids.A}' } : null); const o = JSON.parse(j); return { types: o.nodes.map(n => n.type).join(), file: o.nodes[1].file, edges: o.edges.length, backPage: back.nodes[1].page, backEdge: back.edges[0].toNode === o.edges[0].toNode }; })()`);
  check('canvas saves as JSON Canvas and reads back', round.types === 'text,file' && round.file === 'Alpha programme.md' && round.edges === 1 && round.backPage === ids.A && round.backEdge, JSON.stringify(round));

  // ---------- import an Obsidian vault ----------
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const noteA = ['---', 'tags: [project, "area/home"]', 'aliases:', '  - The A note', 'status: draft', 'rating: 4', 'published: false', 'created: 2025-03-01', '---', '# Heading one', 'Link to [[Note B]] and [[Folder/Note B|the B note]] and [[Missing note]].', 'Second line of the same paragraph with ==highlight== and #inline/tag.',
    '', '> [!warning] Careful', '> Mind the gap', '', '| Name | Value |', '| --- | --- |', '| a | [[Note B]] |', '', '- [ ] a task', '  - nested under it', '- [x] done', '', '![[pic.png|200]]', '', '```js', 'const x = 1; // #notatag', '```', '', '$$', 'x^2 + y^2', '$$', '', '%%a private comment%%', 'See [the B note](Folder/Note%20B.md).'].join('\n');
  const noteB = ['# B', 'Back to [[Note A#Heading one]].', '![[Note A]]'].join('\n');
  const folderNote = 'This folder is about B things.';
  const board = JSON.stringify({ nodes: [{ id: 'n1', type: 'text', x: 0, y: 0, width: 200, height: 100, text: 'Hi' }, { id: 'n2', type: 'file', file: 'Note A.md', x: 300, y: 0, width: 300, height: 200 }, { id: 'g', type: 'group', label: 'G', x: -20, y: -40, width: 700, height: 300 }], edges: [{ id: 'e1', fromNode: 'n1', fromSide: 'right', toNode: 'n2', toSide: 'left' }] });
  const rep = await J(`(async () => {
    const f = (name, text, b64) => new File([b64 ? Uint8Array.from(atob(text), c => c.charCodeAt(0)) : text], name, { lastModified: 1767225600000 });
    const entries = [
      { path: 'My Vault/Note A.md', file: f('Note A.md', ${JSON.stringify(noteA)}) },
      { path: 'My Vault/Folder/Note B.md', file: f('Note B.md', ${JSON.stringify(noteB)}) },
      { path: 'My Vault/Folder/Folder.md', file: f('Folder.md', ${JSON.stringify(folderNote)}) },
      { path: 'My Vault/attachments/pic.png', file: f('pic.png', '${png}', true) },
      { path: 'My Vault/.obsidian/app.json', file: f('app.json', '{}') },
      { path: 'My Vault/Board.canvas', file: f('Board.canvas', ${JSON.stringify(board)}) },
    ];
    const r = await BP.vault.importEntries(entries);
    return { notes: r.notes, folders: r.folders, att: r.attachments, canvases: r.canvases, links: r.links, unresolved: r.unresolved, root: r.root.id, title: r.root.title };
  })()`);
  check('vault import counts', rep.notes === 3 && rep.folders === 1 && rep.att === 1 && rep.canvases === 1 && rep.unresolved === 1, JSON.stringify(rep));
  check('the import lands in one page named after the vault', rep.title === 'My Vault');
  const imp = await J(`(() => {
    const kids = BP.descendants('${rep.root}').map(BP.page);
    const A = kids.find(p => p.title === 'Note A'), B = kids.find(p => p.title === 'Note B'), F = kids.find(p => p.title === 'Folder'), C = kids.find(p => p.type === 'canvas');
    const flat = []; BP.walkBlocks(A.blocks, b => flat.push(b));
    const html = flat.map(b => b.text || '').join('\\n');
    return {
      tags: A.tags, aliases: A.aliases, meta: A.meta, created: new Date(A.created).toISOString().slice(0, 10),
      types: [...new Set(flat.map(b => b.type))].sort().join(','),
      linksToB: (html.match(new RegExp('bp://page/' + B.id, 'g')) || []).length,
      alias: html.includes('>the B note</a>'), missing: html.includes('Missing note') && !html.includes('bp://page/undefined'),
      hl: html.includes('<span class="bg-yellow">highlight</span>'), tag: html.includes('bp://tag/inline%2Ftag'),
      callout: (flat.find(b => b.type === 'callout') || {}).icon, calloutText: (flat.find(b => b.type === 'callout') || {}).text,
      table: JSON.stringify((flat.find(b => b.type === 'table') || {}).rows),
      nested: (flat.find(b => b.type === 'todo') || {}).children ? A.blocks.find(b => b.type === 'todo').children.length : 0,
      img: (flat.find(b => b.type === 'image') || {}).src ? flat.find(b => b.type === 'image').src.slice(0, 22) + ' w=' + flat.find(b => b.type === 'image').w : '',
      code: (flat.find(b => b.type === 'code') || {}).lang, codeTag: html.includes('notatag'), eq: (flat.find(b => b.type === 'equation') || {}).text,
      comment: JSON.stringify(A.blocks).includes('private comment'),
      mdLink: html.includes('>the B note</a>.') || (html.match(/the B note/g) || []).length >= 2,
      folderNote: F && F.blocks.some(b => (b.text || '').includes('about B things')) && F.blocks.some(b => b.type === 'page' && b.ref === B.id),
      bParent: B.parent === F.id,
      bBack: (B.blocks.map(b => b.text || '').join(' ')).includes('bp://page/' + A.id),
      canvas: C && C.canvas.nodes.length === 3 && C.canvas.nodes.find(n => n.id === 'n2').page === A.id && C.canvas.edges.length === 1 && C.canvas.nodes[0].type === 'group',
      paraBreak: html.includes('paragraph') && html.includes('<br>Second line') || html.includes('.<br>Second line'),
    };
  })()`);
  check('frontmatter: tags, aliases and other properties', imp.tags.join() === 'project,area/home' && imp.aliases.join() === 'The A note' && imp.meta.status === 'draft' && imp.meta.rating === 4 && imp.meta.published === false, JSON.stringify([imp.tags, imp.aliases, imp.meta]));
  check('frontmatter created date is used', imp.created === '2025-03-01', imp.created);
  check('block types converted', ['bullet', 'callout', 'code', 'equation', 'h1', 'image', 'p', 'table', 'todo'].every((x) => imp.types.split(',').includes(x)), imp.types);
  check('[[links]] resolved by name and by path (3 to Note B)', imp.linksToB >= 3, imp.linksToB);
  check('[[target|alias]] keeps the alias text', imp.alias);
  check('link to a missing note stays as text', imp.missing);
  check('==highlight== and #nested/tag', imp.hl && imp.tag);
  check('callout type becomes icon and title', imp.callout === '⚠️' && imp.calloutText.includes('<b>Careful</b>') && imp.calloutText.includes('Mind the gap'), imp.calloutText);
  check('table cells (link shown as its name)', imp.table === JSON.stringify([['Name', 'Value'], ['a', 'Note B']]), imp.table);
  check('nested list item under a task', imp.nested === 1);
  check('![[pic.png|200]] becomes an image with its width', imp.img.startsWith('data:image/png;base64') && imp.img.endsWith('w=200'), imp.img);
  check('code keeps its language, # in code is not a tag', imp.code === 'js' && imp.codeTag && (await J(`BP.kb.allTags().some(t => t.key === 'notatag')`)) === false);
  check('math block', imp.eq === 'x^2 + y^2');
  check('%%comments%% are dropped', imp.comment === false);
  check('folder note becomes the folder page, with its notes listed', imp.folderNote && imp.bParent);
  check('links back from Note B (with #heading)', imp.bBack);
  check('.canvas file becomes a canvas with the note on it', imp.canvas);

  // ---------- export a vault ----------
  const ex = await J(`(() => {
    const db = BP.createDatabase('${rep.root}', { title: 'Tasks' });
    const st = db.props.find(p => p.type === 'status');
    BP.addRow(db.id, 'Write report', { [st.id]: st.options[1].id });
    const { files, name } = BP.vault.exportFiles('${rep.root}');
    const get = (p) => (files.find(f => f.path === p) || {}).content;
    return { name, paths: files.map(f => f.path), a: get('Note A.md'), b: get('Folder/Note B.md'), base: get('Tasks/Tasks.base'), row: get('Tasks/Write report.md'), canvas: get('Board.canvas') };
  })()`);
  check('export: the page is the vault top, a folder per page with sub-pages, folder note inside', ex.paths.includes('My Vault.md') && ex.paths.includes('Folder/Folder.md') && ex.paths.includes('Folder/Note B.md'), ex.paths.join(' | '));
  check('export: frontmatter with tags, aliases, properties', /^---\ntags:\n {2}- project\n {2}- area\/home\naliases:\n {2}- The A note\nstatus: draft\nrating: 4\npublished: false/.test(ex.a || ''), (ex.a || '').slice(0, 160));
  check('export: [[links]] with alias', (ex.a || '').includes('[[Note B]]') && (ex.a || '').includes('[[Note B|the B note]]'));
  check('export: ==highlight==, #tag, callout', ex.a.includes('==highlight==') && ex.a.includes('#inline/tag') && ex.a.includes('> [!warning]'));
  check('export: image saved under attachments/ and embedded', ex.paths.some((p) => /^attachments\/pic.*\.png$/.test(p)) && /!\[\[pic[^\]]*\.png\|200\]\]/.test(ex.a), (ex.a.match(/!\[\[[^\]]*\]\]/) || [''])[0]);
  check('export: database as an Obsidian Base + a note per row', (ex.base || '').includes('file.inFolder("Tasks")') && (ex.base || '').includes('type: table') && /Status: In progress/.test(ex.row || ''), (ex.row || '').slice(0, 120));
  check('export: canvas as JSON Canvas pointing at the note', JSON.parse(ex.canvas || '{}').nodes.some((n) => n.type === 'file' && n.file === 'Note A.md'));
  // re-import what was exported: a round trip keeps the links
  const rt = await J(`(async () => {
    const { files } = BP.vault.exportFiles('${rep.root}');
    const entries = files.map(f => ({ path: 'RT/' + f.path, file: new File([f.base64 ? Uint8Array.from(atob(f.content), c => c.charCodeAt(0)) : f.content], f.path.split('/').pop()) }));
    const r = await BP.vault.importEntries(entries, { name: 'RT' });
    const A = BP.descendants(r.root.id).map(BP.page).find(p => p.title === 'Note A');
    return { unresolved: r.unresolved, links: r.links, tags: A && A.tags, img: A && JSON.stringify(A.blocks).includes('data:image/png') };
  })()`);
  check('export -> import round trip keeps links, tags and images', rt.unresolved === 0 && rt.links >= 4 && rt.tags.join() === 'project,area/home' && rt.img, JSON.stringify(rt));
  // zip
  const zipInfo = await J(`(() => { const z = BP.vault.zip([{ path: 'V/a.md', content: 'héllo' }, { path: 'V/b.png', content: '${png}', base64: true }]); let s = ''; z.forEach(b => s += String.fromCharCode(b)); return btoa(s); })()`);
  const zb = Buffer.from(zipInfo, 'base64');
  const eocd = zb.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  check('zip: valid local header and end record with 2 entries', zb.readUInt32LE(0) === 0x04034b50 && eocd > 0 && zb.readUInt16LE(eocd + 10) === 2);
  const zpath = path.join(process.env.BP_SMOKE_DIR, 'vault-test.zip');
  fs.writeFileSync(zpath, zb);
  // folder export (the desktop app writes real files)
  const outDir = await J(`(async () => { const { files, name } = BP.vault.exportFiles('${rep.root}'); const r = await window.bp.exportFolder(files.map(f => Object.assign({}, f, { path: name + '/' + f.path }))); return r && r.dir; })()`);
  const noteOnDisk = outDir && path.join(outDir, 'My Vault', 'Note A.md');
  check('export to a folder writes the notes', !!noteOnDisk && fs.existsSync(noteOnDisk) && fs.readFileSync(noteOnDisk, 'utf8').includes('[[Note B]]'), noteOnDisk);
  const pngOnDisk = outDir && fs.readdirSync(path.join(outDir, 'My Vault', 'attachments')).find((f) => f.endsWith('.png'));
  check('…and the attachments as real image files', !!pngOnDisk && fs.readFileSync(path.join(outDir, 'My Vault', 'attachments', pngOnDisk)).slice(1, 4).toString() === 'PNG');

  // ---------- saved to disk ----------
  await t.eval('BP.flush({ full: true })'); await W(400);
  const ws = JSON.parse(fs.readFileSync(path.join(process.env.BP_SMOKE_DIR, 'data', 'workspace.json'), 'utf8'));
  check('canvas, tags and properties are saved', ws.pages[cvId].canvas.edges.length === 1 && ws.pages[ids.B].tags.join() === 'reading,later' && ws.pages[ids.B].meta.status === 'draft');
  await t.eval(`BP.open('${ids.A}')`); await W(300);
  const errs = t.logs.filter((l) => /^\[3\]/.test(l));
  check('no errors in the console', !errs.length, errs.slice(0, 3).join(' || '));
  console.log(fails ? '\nFAIL ' + fails + ' check(s)' : '\nALL CHECKS PASSED');
  if (fails) throw new Error('smoke33 failed');
};

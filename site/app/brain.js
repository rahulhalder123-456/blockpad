/* Shared brain for AI agents (desktop app; used through the local API and the MCP server).
   A "Shared Brain" page holds ordinary Blockpad pages that agents and people both read and write:
     CURRENT    what is being worked on right now + the latest handoffs (agents read this first)
     Memories   one page per topic worth remembering; repeat memories add a dated entry instead of a duplicate
     Handoffs   what one agent finished and what the next one should do
     Decisions  what was decided and why
     Reports    write-ups
     Projects, Inbox   free space
   An existing top-level page called "Shared Brain" or "AI Shared Brain" (for example from an imported vault) is adopted as it is.
   Every change an agent makes is attributed to it (created / edited by) and listed in the activity log (Settings → AI agents). */
(function () {
  const BP = (window.BP = window.BP || {});
  const B = (BP.brain = {});
  const esc = BP.esc;
  const low = (s) => String(s == null ? '' : s).trim().toLowerCase();
  const pad = (n) => String(n).padStart(2, '0');
  const day = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const clock = (d) => day(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  const live = (p) => !!p && !BP.isTrashed(p);
  const SECTIONS = [['Memories', '💭'], ['Handoffs', '🤝'], ['Decisions', '⚖️'], ['Reports', '📄'], ['Projects', '🗂'], ['Inbox', '📥']];
  const isHead = (b) => /^h[1-3]$/.test(b.type);
  const childByTitle = (parentId, title) => BP.children(parentId).find((c) => low(c.title) === low(title)) || null;
  const lines = (v) => (Array.isArray(v) ? v : String(v == null ? '' : v).split(/\r?\n/)).map((x) => String(x).replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim()).filter(Boolean);

  const README = [
    '# Shared Brain', '',
    'This is the shared memory of the AI agents that work with you (Claude Code, Codex and others), and yours too. Everything here is an ordinary Blockpad page: read it, edit it, link it, search it.', '',
    '- **CURRENT**: what is being worked on right now and the latest handoffs. Agents read this first.',
    '- **Memories**: one page per topic worth remembering. Agents add dated entries instead of making duplicates.',
    '- **Handoffs**: when an agent stops, it writes what is done and what comes next; the next agent starts from it.',
    '- **Decisions**: what was decided, and why.',
    '- **Reports**: write-ups made by agents or by you.',
    '- **Projects** and **Inbox**: free space for longer work and quick captures.', '',
    '## How agents use it', '',
    '1. At the start, call `brain_context`.',
    '2. While working, `brain_remember` anything the next session should know, and `brain_recall` before researching something again.',
    '3. When finishing, call `brain_handoff`.',
  ].join('\n');
  const CURRENT_MD = ['## Active focus', '', '- Nothing yet.', '', '## Recent handoffs', '', '## Open questions', ''].join('\n');

  /* ---------- small helpers shared with the API ---------- */
  B.clean = (s) => { s = String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 40); return s || null; };
  B.normTags = (list) => {
    const seen = new Set(), out = [];
    (Array.isArray(list) ? list : String(list || '').split(',')).forEach((t) => { const v = String(t).replace(/^#/, '').trim(); if (v && !seen.has(low(v))) { seen.add(low(v)); out.push(v); } });
    return out;
  };
  const metaVal = (v) => (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : Array.isArray(v) ? v.map(String) : v == null ? '' : JSON.stringify(v));
  B.log = (agent, action, p) => {
    const L = (BP.state.agentLog = BP.state.agentLog || []);
    L.unshift({ t: Date.now(), agent: agent || 'API client', action, id: p ? p.id : null, title: p ? p.title || 'Untitled' : '' });
    if (L.length > 200) L.length = 200;
  };
  // a page named by title, alias or id (the target of a [[link]])
  B.findPage = (t) => {
    const raw = String(t || '').trim();
    if (!raw) return null;
    if (BP.page(raw) && live(BP.page(raw))) return raw;
    const k = low(raw.replace(/\.md$/i, '').split('/').pop());
    if (!k) return null;
    const all = BP.allPages().filter((p) => live(p) && !p.rowOf && !p.inline);
    const hit = all.find((p) => low(p.title) === k) || all.find((p) => (p.aliases || []).some((a) => low(a) === k));
    return hit ? hit.id : null;
  };
  // Markdown (from an agent) -> blocks; [[links]] to existing pages, tables, callouts, tasks, #tags and a --- frontmatter block all work
  B.parse = async (md) => {
    const V = BP.vault;
    const text = String(md == null ? '' : md);
    const fm = V && V.parseFrontmatter ? V.parseFrontmatter(text) : { data: {}, body: text };
    const ctx = { fromRel: '', resolveNote: (t) => B.findPage(t), findAtt: () => null, readAtt: async () => null, rep: { links: 0, unresolved: 0 } };
    let blocks = V && V.mdToBlocks ? await V.mdToBlocks(fm.body, ctx) : BP.mdToBlocks(fm.body);
    if (!blocks.length) blocks = [BP.newBlock('p')];
    const d = fm.data || {};
    const meta = {};
    Object.keys(d).forEach((k) => { if (!['tags', 'tag', 'aliases', 'alias', 'cssclasses', 'cssclass', 'position'].includes(k)) meta[k] = d[k]; });
    return { blocks, tags: B.normTags(d.tags != null ? d.tags : d.tag), aliases: B.normTags(d.aliases != null ? d.aliases : d.alias), meta };
  };
  function applyMeta(p, o) {
    if (o.tags) { const m = B.normTags([...(o.replaceTags ? [] : p.tags || []), ...o.tags]); if (m.length || Array.isArray(p.tags)) p.tags = m; }
    if (o.aliases) { const m = B.normTags([...(o.replaceAliases ? [] : p.aliases || []), ...o.aliases]); if (m.length || Array.isArray(p.aliases)) p.aliases = m; }
    if (o.meta) {
      p.meta = p.meta || {};
      Object.keys(o.meta).forEach((k) => { if (o.meta[k] === null) delete p.meta[k]; else p.meta[k] = metaVal(o.meta[k]); });
      if (!Object.keys(p.meta).length) delete p.meta;
    }
  }
  /* create a page: o = { title, icon, markdown, tags, aliases, meta, agent, flags } */
  B.create = async (parentId, o) => {
    const parsed = await B.parse(o.markdown);
    const p = BP.createPage(parentId || null, Object.assign({ title: String(o.title || ''), icon: o.icon || '', blocks: parsed.blocks }, o.flags || {}));
    if (o.agent) { p.createdBy = o.agent; p.editedBy = o.agent; }
    applyMeta(p, { tags: [...parsed.tags, ...B.normTags(o.tags)], aliases: [...parsed.aliases, ...B.normTags(o.aliases)], meta: Object.assign({}, parsed.meta, o.meta || {}) });
    BP.save();
    return p;
  };
  /* change a page: o = { title, icon, markdown, mode: 'replace' | 'append', tags (replace), addTags, aliases, meta (null deletes a key), agent } */
  B.update = async (p, o) => {
    // replacing the text of a page that has some: keep what is there as a version first (Page history → restore). Blockpad normally lets the newest version
    // follow the page for a few minutes, which would overwrite it, so the old text is saved as its own entry and the new text gets one after it
    const keepOld = o.markdown !== undefined && o.mode !== 'append' && p.type !== 'db' && (p.blocks || []).some((b) => BP.textOf(b.text || '').trim() || b.type !== 'p');
    const version = (t) => { p.history = p.history || []; p.history.push({ t, title: p.title, blocks: JSON.parse(JSON.stringify(p.blocks)) }); if (p.history.length > 25) p.history.shift(); };
    if (keepOld) { BP.materializeHistory(); version(Date.now()); }
    if (o.title !== undefined) p.title = String(o.title);
    if (o.icon !== undefined) p.icon = String(o.icon);
    if (o.markdown !== undefined && p.type !== 'db') {
      const parsed = await B.parse(o.markdown);
      if (o.mode === 'append') {
        const last = p.blocks[p.blocks.length - 1];
        if (last && last.type === 'p' && !BP.textOf(last.text).trim() && !(last.children || []).length) p.blocks.pop();
        p.blocks.push(...parsed.blocks);
      } else p.blocks = parsed.blocks;
      applyMeta(p, { tags: parsed.tags, aliases: parsed.aliases, meta: parsed.meta });
    }
    if (o.tags !== undefined) applyMeta(p, { tags: B.normTags(o.tags), replaceTags: true });
    if (o.addTags !== undefined) applyMeta(p, { tags: B.normTags(o.addTags) });
    if (o.aliases !== undefined) applyMeta(p, { aliases: B.normTags(o.aliases), replaceAliases: true });
    if (o.meta && typeof o.meta === 'object') applyMeta(p, { meta: o.meta });
    BP.touch(p);
    if (keepOld) version(Date.now() + 1);
    if (o.agent) p.editedBy = o.agent;
    return p;
  };

  /* ---------- the structure ---------- */
  B.root = (adopt) => {
    let r = BP.allPages().find((p) => p.brainRoot && live(p));
    if (!r) r = BP.allPages().find((p) => !p.parent && !p.rowOf && live(p) && /^(ai )?shared brain$/.test(low(p.title)));
    if (r && !r.brainRoot && adopt !== false) r.brainRoot = true;
    return r || null;
  };
  B.ensure = async () => {
    let root = B.root(), fresh = false;
    if (!root) { root = await B.create(null, { title: 'Shared Brain', icon: '🧠', markdown: README, flags: { brainRoot: true } }); fresh = true; }
    for (const [name, icon] of SECTIONS) if (!childByTitle(root.id, name)) await B.create(root.id, { title: name, icon, markdown: '' });
    if (!childByTitle(root.id, 'CURRENT')) await B.create(root.id, { title: 'CURRENT', icon: '📌', markdown: CURRENT_MD });
    return { root, fresh };
  };
  const section = (root, name) => childByTitle(root.id, name);
  const rangeOf = (blocks, name) => {
    const i = blocks.findIndex((b) => isHead(b) && low(BP.textOf(b.text)) === low(name));
    if (i < 0) return null;
    let j = i + 1;
    while (j < blocks.length && !isHead(blocks[j])) j++;
    return [i, j];
  };
  const link = (id, label) => '<a href="bp://page/' + esc(id) + '">' + esc(label) + '</a>';

  B.status = () => {
    const root = B.root(false);
    const out = { exists: !!root, pages: BP.allPages().filter((p) => live(p) && !p.rowOf && !p.inline).length };
    if (root) {
      out.root = { id: root.id, title: root.title };
      out.counts = {};
      SECTIONS.forEach(([n]) => { const s = section(root, n); out.counts[low(n)] = s ? BP.children(s.id).filter(live).length : 0; });
    }
    return out;
  };

  /* ---------- reading ---------- */
  const handoffSummary = (p) => {
    const i = p.blocks.findIndex((b) => isHead(b) && low(BP.textOf(b.text)) === 'summary');
    const b = i >= 0 ? p.blocks[i + 1] : p.blocks[0];
    return b ? BP.textOf(b.text || '').trim().slice(0, 240) : '';
  };
  B.context = () => {
    const root = B.root(false);
    if (!root) return { exists: false };
    const cur = childByTitle(root.id, 'CURRENT');
    const recent = (name, n) => { const s = section(root, name); return s ? BP.children(s.id).filter(live).sort((a, b) => (b.created || 0) - (a.created || 0)).slice(0, n) : []; };
    return {
      exists: true,
      root: { id: root.id, title: root.title },
      current: cur ? { id: cur.id, markdown: BP.pageToMd(cur) } : null,
      handoffs: recent('Handoffs', 5).map((p) => ({ id: p.id, title: p.title, from: (p.meta || {}).from || '', to: (p.meta || {}).to || '', status: (p.meta || {}).status || '', date: new Date(p.created).toISOString(), summary: handoffSummary(p), link: 'bp://page/' + p.id })),
      memories: recent('Memories', 8).map((p) => ({ id: p.id, title: p.title, tags: BP.kb ? BP.kb.tagsOf(p) : p.tags || [], updated: new Date(p.updated).toISOString() })),
      counts: B.status().counts,
      now: new Date().toISOString(),
    };
  };
  B.recall = (o) => {
    const root = B.root(false);
    const all = low(o.scope) === 'all';
    if (!root && !all) return { results: [], total: 0, note: 'There is no Shared Brain yet.' };
    const names = new Set(SECTIONS.map(([n]) => low(n)));
    let pages = all ? BP.allPages().filter((p) => live(p) && !p.rowOf && !p.inline && p.type !== 'db')
      : BP.descendants(root.id).map(BP.page).filter((p) => p && live(p) && p.type !== 'db' && !p.rowOf && !(p.parent === root.id && names.has(low(p.title))));
    const secOf = (p) => { for (let c = p, n = 0; c && root && n < 20; c = BP.page(c.parent), n++) if (c.parent === root.id) return c.title; return ''; };
    if (o.section) pages = pages.filter((p) => low(secOf(p)) === low(o.section));
    const wantTags = B.normTags(o.tags).map(low);
    const tokens = [...new Set(low(o.query).replace(/["'`]/g, ' ').split(/\s+/).filter((t) => t.length > 1))];
    const now = Date.now();
    const scored = [];
    pages.forEach((p) => {
      const tags = (BP.kb ? BP.kb.tagsOf(p) : p.tags || []).map(low);
      if (wantTags.length && !wantTags.every((t) => tags.includes(t))) return;
      const md = BP.pageToMd(p).replace(/^# .*\n/, '');
      const text = low(md), title = low(p.title);
      let score = 0;
      for (const t of tokens) {
        const inTitle = title.includes(t), inTags = tags.some((x) => x.includes(t));
        let n = 0; for (let i = text.indexOf(t); i >= 0 && n < 5; i = text.indexOf(t, i + t.length)) n++;
        if (!inTitle && !inTags && !n) return;
        score += (inTitle ? 6 : 0) + (inTags ? 5 : 0) + n;
      }
      if (now - (p.updated || 0) < 7 * 864e5) score += 2;
      let snip = md.slice(0, 180);
      if (tokens.length) { const i = text.indexOf(tokens.find((t) => text.includes(t)) || ''); if (i >= 0) snip = md.slice(Math.max(0, i - 80), i + 160); }
      snip = snip.replace(/[#>*`|\[\]]+/g, ' ').replace(/\s+/g, ' ').trim();      // markup goes, underscores stay (NODE_ENV)
      scored.push({ score, p, snippet: snip });
    });
    scored.sort((a, b) => b.score - a.score || (b.p.updated || 0) - (a.p.updated || 0));
    const limit = Math.max(1, Math.min(30, +o.limit || 8));
    return { total: scored.length, results: scored.slice(0, limit).map(({ p, snippet }) => ({ id: p.id, title: p.title || 'Untitled', section: secOf(p), tags: BP.kb ? BP.kb.tagsOf(p) : p.tags || [], updated: new Date(p.updated).toISOString(), snippet, link: 'bp://page/' + p.id })) };
  };

  /* ---------- writing ---------- */
  B.remember = async (o) => {
    const text = String(o.text || '').trim();
    if (!text) throw new Error('Nothing to remember: "text" is empty');
    const { root } = await B.ensure();
    const mem = section(root, 'Memories');
    const title = String(o.title || '').trim() || text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s/)[0].slice(0, 70);
    const agent = o.agent || 'AI agent';
    const same = childByTitle(mem.id, title);
    if (same) {
      await B.update(same, { markdown: '### ' + clock(new Date()) + ' · ' + agent + '\n\n' + text, mode: 'append', addTags: o.tags, agent: o.agent });
      B.log(agent, 'added to memory', same);
      return { id: same.id, title: same.title, created: false, link: 'bp://page/' + same.id };
    }
    const p = await B.create(mem.id, { title, icon: '💭', markdown: text, tags: o.tags, meta: { agent, remembered: clock(new Date()) }, agent: o.agent });
    B.log(agent, 'remembered', p);
    return { id: p.id, title: p.title, created: true, link: 'bp://page/' + p.id };
  };
  B.handoff = async (o) => {
    const summary = String(o.summary || '').trim();
    if (!summary) throw new Error('A handoff needs a "summary"');
    const { root } = await B.ensure();
    const sec = section(root, 'Handoffs');
    const now = new Date();
    const from = String(o.from || o.agent || 'AI agent'), to = String(o.to || 'next agent');
    const head = String(o.title || '').trim() || summary.replace(/\s+/g, ' ').slice(0, 60);
    const title = day(now) + ' ' + from + ' → ' + to + ': ' + head;
    const md = ['## Summary', '', summary, ''];
    const part = (name, items, task) => { const l = lines(items); if (l.length) { md.push('## ' + name, ''); l.forEach((x) => md.push((task ? '- [ ] ' : '- ') + x)); md.push(''); } };
    part('Done', o.done); part('Next steps', o.next, true); part('Files and links', o.files); part('Open questions', o.questions);
    const p = await B.create(sec.id, { title, icon: '🤝', markdown: md.join('\n'), tags: ['handoff', ...B.normTags(o.tags)], meta: { from, to, status: 'open', agent: from }, agent: o.agent });
    const cur = childByTitle(root.id, 'CURRENT');
    if (cur) {
      const bullet = BP.newBlock('bullet', link(p.id, title));
      const r = rangeOf(cur.blocks, 'Recent handoffs');
      if (r) {
        cur.blocks.splice(r[0] + 1, 0, bullet);
        let k = r[0] + 1, seen = 0;
        while (k < cur.blocks.length && !isHead(cur.blocks[k])) { if (cur.blocks[k].type === 'bullet' && ++seen > 10) cur.blocks.splice(k--, 1); k++; }
      } else cur.blocks.push(BP.newBlock('h2', 'Recent handoffs'), bullet);
      await B.update(cur, { agent: o.agent });
    }
    B.log(from, 'wrote a handoff', p);
    return { id: p.id, title, link: 'bp://page/' + p.id };
  };
  B.setFocus = async (o) => {
    const items = lines(o.text);
    if (!items.length) throw new Error('"text" is empty');
    const { root } = await B.ensure();
    const cur = childByTitle(root.id, 'CURRENT');
    const r = rangeOf(cur.blocks, 'Active focus');
    const bullets = items.map((x) => BP.newBlock('bullet', esc(x)));
    if (r) cur.blocks.splice(r[0] + 1, r[1] - r[0] - 1, ...bullets); else cur.blocks.unshift(BP.newBlock('h2', 'Active focus'), ...bullets);
    await B.update(cur, { agent: o.agent });
    B.log(o.agent || 'AI agent', 'set the current focus', cur);
    return { id: cur.id, items: items.length, link: 'bp://page/' + cur.id };
  };
  B.decision = async (o) => {
    const decision = String(o.decision || '').trim();
    if (!decision) throw new Error('A decision needs "decision" text');
    const { root } = await B.ensure();
    const sec = section(root, 'Decisions');
    const md = ['## Decision', '', decision, ''];
    if (o.why) md.push('## Why', '', String(o.why), '');
    const alt = lines(o.alternatives || '');
    if (alt.length) { md.push('## Alternatives considered', ''); alt.forEach((x) => md.push('- ' + x)); md.push(''); }
    const title = day(new Date()) + ' ' + (String(o.title || '').trim() || decision.replace(/\s+/g, ' ').slice(0, 60));
    const p = await B.create(sec.id, { title, icon: '⚖️', markdown: md.join('\n'), tags: ['decision', ...B.normTags(o.tags)], meta: { status: 'accepted', agent: o.agent || 'AI agent' }, agent: o.agent });
    B.log(o.agent || 'AI agent', 'recorded a decision', p);
    return { id: p.id, title, link: 'bp://page/' + p.id };
  };
  B.report = async (o) => {
    const md = String(o.markdown || '').trim();
    if (!md) throw new Error('A report needs "markdown" text');
    let parentId = null;
    if (o.parent) { const par = BP.page(o.parent) || BP.page(B.findPage(o.parent)); if (!par || !live(par) || par.type === 'db') throw new Error('Parent page not found'); parentId = par.id; }
    else { const { root } = await B.ensure(); parentId = section(root, 'Reports').id; }
    let title = String(o.title || '').trim() || 'Report ' + day(new Date());
    const sibs = BP.children(parentId);
    for (let i = 2; sibs.some((c) => low(c.title) === low(title)); i++) title = String(o.title || 'Report').trim() + ' (' + i + ')';
    const p = await B.create(parentId, { title, icon: '📄', markdown: md, tags: ['report', ...B.normTags(o.tags)], meta: { kind: 'report', agent: o.agent || 'AI agent', date: day(new Date()) }, agent: o.agent });
    B.log(o.agent || 'AI agent', 'wrote a report', p);
    return { id: p.id, title, link: 'bp://page/' + p.id };
  };
})();

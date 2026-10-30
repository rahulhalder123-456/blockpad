/* Blockpad local REST API: executed in the app when the (opt-in, desktop-only) local server forwards a request.
   Used by scripts and by the MCP server (mcp/blockpad-mcp.js) that lets AI agents use Blockpad.
   Requests run one at a time, so two agents writing together can never create the same page twice. */
(function () {
  const BP = (window.BP = window.BP || {});
  const fail = (status, error) => ({ status, body: { error } });
  const ok = (body, status) => ({ status: status || 200, body });
  const tagsOf = (p) => (BP.kb ? BP.kb.tagsOf(p) : p.tags || []);
  const summary = (p) => ({ id: p.id, title: p.title || '', icon: p.icon || '', type: p.type === 'db' ? 'database' : p.type === 'canvas' ? 'canvas' : p.rowOf ? 'row' : 'page', parent: p.parent || null, tags: p.type === 'db' ? [] : tagsOf(p), updated: new Date(p.updated).toISOString(), created: new Date(p.created).toISOString(), trashed: BP.isTrashed(p) });
  const rowJson = (db, r) => {
    const props = {};
    db.props.forEach((p) => { if (p.type === 'title') return; const v = BP.displayValue(r, p); props[p.name] = p.type === 'checkbox' ? !!BP.propVal(r, p) : p.type === 'date' ? BP.propVal(r, p) || null : p.type === 'number' ? BP.propVal(r, p) : p.type === 'formula' || p.type === 'rollup' ? BP.fmtComputed(BP.propVal(r, p)) : v === '' ? null : v; });
    return Object.assign(summary(r), { properties: props });
  };
  function findOption(p, name) {
    p.options = p.options || [];
    let o = p.options.find((x) => x.name.toLowerCase() === String(name).toLowerCase());
    if (!o) p.options.push((o = { id: BP.uid(), name: String(name), color: BP.COLORS[p.options.length % 9] }));
    return o.id;
  }
  function setByName(row, db, name, value) {
    const p = db.props.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!p) throw new Error('Unknown property: ' + name);
    if (BP.COMPUTED.includes(p.type) && p.type !== 'button') throw new Error('Property "' + name + '" is computed and cannot be set');
    const arr = (v) => (Array.isArray(v) ? v : [v]);
    switch (p.type) {
      case 'title': row.title = String(value); return;
      case 'number': BP.setProp(row, p, value === null || value === '' ? null : Number(value)); return;
      case 'checkbox': BP.setProp(row, p, !!value); return;
      case 'date': BP.setProp(row, p, value && typeof value === 'object' ? BP.dateJoin(value.start, value.end) : value || null); return;
      case 'select': case 'status': BP.setProp(row, p, value ? findOption(p, value) : null); return;
      case 'multi_select': BP.setProp(row, p, arr(value).filter(Boolean).map((n) => findOption(p, n))); return;
      case 'people': { const names = arr(value).filter(Boolean).map(String); const set = BP.state.settings; names.forEach((n) => !set.people.includes(n) && set.people.push(n)); BP.setProp(row, p, names); return; }
      case 'relation': { const tdb = BP.rows(p.target); BP.setProp(row, p, arr(value).map((t) => (tdb.find((r) => r.id === t || (r.title || '').toLowerCase() === String(t).toLowerCase()) || {}).id).filter(Boolean)); return; }
      case 'place': BP.setProp(row, p, value && typeof value === 'object' ? value : { text: String(value || ''), lat: null, lng: null }); return;
      case 'verification': BP.setProp(row, p, value ? { status: 'verified', by: BP.me(), date: BP.isoDay(new Date()) } : null); return;
      case 'files': throw new Error('Files cannot be set through the API');
      default: BP.setProp(row, p, value == null ? '' : String(value));
    }
  }
  const refresh = () => { BP.save(); if (BP.renderAll) BP.renderAll(); };
  const asList = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : String(v).split(','));
  const isUnder = (p, ancestorId) => { for (let c = BP.page(p.parent), n = 0; c && n < 60; c = BP.page(c.parent), n++) if (c.id === ancestorId) return true; return false; };

  async function handle({ method, path, query, body }) {
    try {
      const parts = path.replace(/^\/+|\/+$/g, '').split('/');
      if (parts[0] !== 'api') return fail(404, 'Not found');
      const [, res, id, sub] = parts;
      const q = query || {};
      body = body || {};
      const B = BP.brain;
      const agentRaw = B.clean(q.agent !== undefined ? q.agent : body.agent);       // who is calling (an AI agent names itself); used to credit what it writes
      const agent = agentRaw || 'API client';
      if (method !== 'GET' && BP.state.settings.api && BP.state.settings.api.readOnly) return fail(403, 'The local API is read-only. Turn "Agents can change pages" back on in Settings → AI agents.');
      if (!res) return ok({ name: 'Blockpad local API', version: 2, endpoints: ['GET /api/pages?q=&tag=&parent=', 'GET /api/pages/:id', 'POST /api/pages', 'PATCH /api/pages/:id', 'DELETE /api/pages/:id', 'GET /api/databases', 'GET /api/databases/:id', 'GET /api/databases/:id/rows', 'POST /api/databases/:id/rows', 'PATCH /api/rows/:id', 'GET /api/search?q=&tag=&parent=', 'GET /api/brain/status', 'GET /api/brain/context', 'POST /api/brain/setup', 'POST /api/brain/remember', 'GET /api/brain/recall?q=&tags=&section=&scope=', 'POST /api/brain/handoff', 'POST /api/brain/focus', 'POST /api/brain/decision', 'POST /api/brain/report'] });

      if (res === 'brain') {
        const act = id;
        if (act === 'status' && method === 'GET') return ok(Object.assign(B.status(), { readOnly: !!(BP.state.settings.api && BP.state.settings.api.readOnly) }));
        if (act === 'context' && method === 'GET') return ok(B.context());
        if (act === 'recall' && method === 'GET') return ok(B.recall({ query: q.q, tags: q.tags, section: q.section, scope: q.scope, limit: q.limit }));
        if (method !== 'POST') return fail(405, 'Method not allowed');
        const o = Object.assign({}, body, { agent: agentRaw });
        if (act === 'setup') { const r = await B.ensure(); if (r.fresh) B.log(agent, 'set up the Shared Brain', r.root); refresh(); return ok({ id: r.root.id, created: r.fresh, link: 'bp://page/' + r.root.id }); }
        const run = { remember: B.remember, handoff: B.handoff, focus: B.setFocus, decision: B.decision, report: B.report }[act];
        if (!run) return fail(404, 'Unknown brain action');
        const out = await run(o);
        refresh();
        return ok(out, 201);
      }

      if (res === 'search') {
        const s = String(q.q || '').toLowerCase();
        if (!s && !q.tag) return fail(400, 'Missing ?q= (or ?tag=)');
        let hits = BP.allPages().filter((p) => !BP.isTrashed(p) && !p.inline);
        if (q.parent) hits = hits.filter((p) => isUnder(p, q.parent));
        if (q.tag) { const t = BP.kb.normTag(q.tag); hits = hits.filter((p) => p.type !== 'db' && tagsOf(p).some((x) => BP.kb.normTag(x) === t || BP.kb.normTag(x).startsWith(t + '/'))); }
        const withText = [];
        hits.forEach((p) => {
          if (!s) return withText.push({ p, snippet: '' });
          if ((p.title || '').toLowerCase().includes(s)) return withText.push({ p, snippet: '' });
          if (p.type === 'db' || p.rowOf && !(p.blocks || []).length) return;
          const md = BP.pageToMd(p).replace(/^# .*\n/, '');
          const i = md.toLowerCase().indexOf(s);
          if (i >= 0) withText.push({ p, snippet: md.slice(Math.max(0, i - 60), i + 120).replace(/[#>*`|\[\]]+/g, ' ').replace(/\s+/g, ' ').trim() });
        });
        return ok({ results: withText.slice(0, +q.limit || 50).map(({ p, snippet }) => Object.assign(summary(p), snippet ? { snippet } : {})) });
      }

      if (res === 'pages') {
        if (!id) {
          if (method === 'GET') {
            let list = BP.allPages().filter((p) => !p.rowOf && !p.inline && !BP.isTrashed(p));
            if (q.parent !== undefined) list = list.filter((p) => (p.parent || '') === q.parent);
            if (q.q) list = list.filter((p) => (p.title || '').toLowerCase().includes(String(q.q).toLowerCase()));
            if (q.tag) { const t = BP.kb.normTag(q.tag); list = list.filter((p) => p.type !== 'db' && tagsOf(p).some((x) => BP.kb.normTag(x) === t)); }
            return ok({ pages: list.slice(0, +q.limit || 500).map(summary) });
          }
          if (method === 'POST') {
            if (body.parent && !BP.page(body.parent)) return fail(404, 'Parent not found');
            const p = await B.create(body.parent || null, { title: body.title, icon: body.icon, markdown: body.markdown, tags: body.tags, aliases: body.aliases, meta: body.meta, agent: agentRaw });
            B.log(agent, 'created page', p);
            refresh();
            return ok(summary(p), 201);
          }
          return fail(405, 'Method not allowed');
        }
        const p = BP.page(id);
        if (!p) return fail(404, 'Page not found');
        if (method === 'GET') {
          const out = summary(p);
          if (p.type !== 'db') out.markdown = BP.pageToMd(p); else out.schema = p.props.map((x) => ({ name: x.name, type: x.type }));
          if (q.format === 'json' && p.type !== 'db') out.blocks = p.blocks;
          if (p.rowOf) out.properties = rowJson(BP.page(p.rowOf), p).properties;
          out.aliases = p.aliases || [];
          out.meta = p.meta || {};
          out.createdBy = p.createdBy || null;
          out.editedBy = p.editedBy || null;
          out.children = BP.children(p.id).map(summary);
          if (BP.kb) out.backlinks = BP.kb.backlinks(p.id).slice(0, 20).map((x) => ({ id: x.page.id, title: x.page.title || 'Untitled' }));
          return ok(out);
        }
        if (method === 'PATCH') {
          const wasAppend = body.markdown !== undefined && body.mode === 'append';
          await B.update(p, { title: body.title, icon: body.icon, markdown: body.markdown, mode: body.mode, tags: body.tags, addTags: body.addTags, aliases: body.aliases, meta: body.meta, agent: agentRaw });
          if (p.rowOf && body.properties) { const db = BP.page(p.rowOf); Object.keys(body.properties).forEach((k) => setByName(p, db, k, body.properties[k])); BP.touch(p); if (agentRaw) p.editedBy = agentRaw; }
          B.log(agent, wasAppend ? 'added to page' : 'edited page', p);
          refresh();
          return ok(summary(p));
        }
        if (method === 'DELETE') { BP.trash(id); if (BP.state.current === id) BP.state.current = (BP.children(null)[0] || {}).id || null; B.log(agent, 'moved to trash', p); refresh(); return ok({ trashed: true }); }
        return fail(405, 'Method not allowed');
      }
      if (res === 'databases') {
        if (!id) return ok({ databases: BP.allPages().filter((p) => p.type === 'db' && !BP.isTrashed(p)).map((d) => Object.assign(summary(d), { rows: BP.rows(d.id).length })) });
        const db = BP.page(id);
        if (!db || db.type !== 'db') return fail(404, 'Database not found');
        if (!sub) return ok(Object.assign(summary(db), { properties: db.props.map((p) => ({ name: p.name, type: p.type, options: p.options ? p.options.map((o) => o.name) : undefined })) }));
        if (sub === 'rows') {
          if (method === 'GET') {
            let rows = BP.viewRows(db, { filters: [], sorts: [] }, q.q || '');
            if (q.limit) rows = rows.slice(0, +q.limit);
            return ok({ rows: rows.map((r) => rowJson(db, r)) });
          }
          if (method === 'POST') {
            const r = BP.addRow(db.id, String(body.title || ''), {});
            Object.keys(body.properties || {}).forEach((k) => setByName(r, db, k, body.properties[k]));
            if (body.markdown) r.blocks = (await B.parse(body.markdown)).blocks;
            if (agentRaw) { r.createdBy = agentRaw; r.editedBy = agentRaw; }
            B.log(agent, 'added a row to ' + (db.title || 'a database'), r);
            refresh();
            return ok(rowJson(db, r), 201);
          }
        }
        return fail(405, 'Method not allowed');
      }
      if (res === 'rows' && id) {
        const r = BP.page(id);
        if (!r || !r.rowOf) return fail(404, 'Row not found');
        const db = BP.page(r.rowOf);
        if (method === 'GET') return ok(rowJson(db, r));
        if (method === 'PATCH') { if (body.title !== undefined) r.title = String(body.title); Object.keys(body.properties || {}).forEach((k) => setByName(r, db, k, body.properties[k])); if (body.markdown !== undefined) { const bl = (await B.parse(body.markdown)).blocks; if (body.mode === 'append') r.blocks.push(...bl); else r.blocks = bl; } BP.touch(r); if (agentRaw) r.editedBy = agentRaw; B.log(agent, 'edited a row in ' + (db.title || 'a database'), r); refresh(); return ok(rowJson(db, r)); }
        if (method === 'DELETE') { BP.trash(id); B.log(agent, 'removed a row', r); refresh(); return ok({ trashed: true }); }
      }
      return fail(404, 'Not found');
    } catch (e) { return fail(400, String(e.message || e)); }
  }
  let chain = Promise.resolve();
  BP.api = (req) => { const run = () => handle(req); const p = chain.then(run, run); chain = p.catch(() => {}); return p; };
  BP.setPropByName = setByName;
})();

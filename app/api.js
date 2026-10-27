/* Blockpad local REST API: executed in the app when the (opt-in) local server forwards a request. */
(function () {
  const BP = (window.BP = window.BP || {});
  const fail = (status, error) => ({ status, body: { error } });
  const ok = (body, status) => ({ status: status || 200, body });
  const summary = (p) => ({ id: p.id, title: p.title || '', icon: p.icon || '', type: p.type === 'db' ? 'database' : p.rowOf ? 'row' : 'page', parent: p.parent || null, updated: new Date(p.updated).toISOString(), created: new Date(p.created).toISOString(), trashed: BP.isTrashed(p) });
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
  const bodyBlocks = (md) => { const b = BP.mdToBlocks(String(md || '')); return b.length ? b : [BP.newBlock('p')]; };

  BP.api = function ({ method, path, query, body }) {
    try {
      const parts = path.replace(/^\/+|\/+$/g, '').split('/');
      if (parts[0] !== 'api') return fail(404, 'Not found');
      const [, res, id, sub] = parts;
      const q = query || {};
      body = body || {};
      if (!res) return ok({ name: 'Blockpad local API', version: 1, endpoints: ['GET /api/pages', 'GET /api/pages/:id', 'POST /api/pages', 'PATCH /api/pages/:id', 'DELETE /api/pages/:id', 'GET /api/databases', 'GET /api/databases/:id', 'GET /api/databases/:id/rows', 'POST /api/databases/:id/rows', 'PATCH /api/rows/:id', 'GET /api/search?q='] });
      if (res === 'search') {
        const s = String(q.q || '').toLowerCase();
        if (!s) return fail(400, 'Missing ?q=');
        const hits = BP.allPages().filter((p) => !BP.isTrashed(p) && ((p.title || '').toLowerCase().includes(s) || (p.blocks || []).some((b) => BP.textOf(b.text || '').toLowerCase().includes(s)))).slice(0, +q.limit || 50);
        return ok({ results: hits.map(summary) });
      }
      if (res === 'pages') {
        if (!id) {
          if (method === 'GET') {
            let list = BP.allPages().filter((p) => !p.rowOf && !p.inline && !BP.isTrashed(p));
            if (q.parent !== undefined) list = list.filter((p) => (p.parent || '') === q.parent);
            return ok({ pages: list.map(summary) });
          }
          if (method === 'POST') {
            if (body.parent && !BP.page(body.parent)) return fail(404, 'Parent not found');
            const p = BP.createPage(body.parent || null, { title: String(body.title || ''), icon: body.icon || '', blocks: bodyBlocks(body.markdown) });
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
          out.children = BP.children(p.id).map(summary);
          return ok(out);
        }
        if (method === 'PATCH') {
          if (body.title !== undefined) p.title = String(body.title);
          if (body.icon !== undefined) p.icon = String(body.icon);
          if (body.markdown !== undefined && p.type !== 'db') {
            const bl = bodyBlocks(body.markdown);
            if (body.mode === 'append') { const last = p.blocks[p.blocks.length - 1]; if (last && last.type === 'p' && !BP.textOf(last.text).trim()) p.blocks.pop(); p.blocks.push(...bl); } else p.blocks = bl;
          }
          if (p.rowOf && body.properties) { const db = BP.page(p.rowOf); Object.keys(body.properties).forEach((k) => setByName(p, db, k, body.properties[k])); }
          BP.touch(p);
          refresh();
          return ok(summary(p));
        }
        if (method === 'DELETE') { BP.trash(id); if (BP.state.current === id) BP.state.current = (BP.children(null)[0] || {}).id || null; refresh(); return ok({ trashed: true }); }
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
            if (body.markdown) r.blocks = bodyBlocks(body.markdown);
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
        if (method === 'PATCH') { if (body.title !== undefined) r.title = String(body.title); Object.keys(body.properties || {}).forEach((k) => setByName(r, db, k, body.properties[k])); BP.touch(r); refresh(); return ok(rowJson(db, r)); }
        if (method === 'DELETE') { BP.trash(id); refresh(); return ok({ trashed: true }); }
      }
      return fail(404, 'Not found');
    } catch (e) { return fail(400, String(e.message || e)); }
  };
  BP.setPropByName = setByName;
})();

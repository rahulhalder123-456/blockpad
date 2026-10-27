/* Blockpad data layer: workspace state, persistence, pages, blocks, databases. */
(function () {
  const BP = (window.BP = window.BP || {});
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  BP.uid = uid;
  BP.COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
  BP.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  BP.textOf = (html) => new DOMParser().parseFromString('<body>' + (html || '') + '</body>', 'text/html').body.textContent || '';
  BP.rich = (t) => !['code', 'equation', 'divider', 'image', 'video', 'audio', 'pdf', 'file', 'bookmark', 'embed', 'table', 'columns', 'column', 'toc', 'page', 'dbview', 'synced', 'tabs', 'tab', 'button', 'html', 'flow'].includes(t);

  const ALLOW = { B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, STRIKE: 1, CODE: 1, A: 1, SPAN: 1, BR: 1 };
  BP.sanitize = function (html) {
    const doc = new DOMParser().parseFromString('<body>' + (html || '') + '</body>', 'text/html');
    const out = document.createElement('div');
    (function walk(src, dst) {
      src.childNodes.forEach((n) => {
        if (n.nodeType === 3) dst.appendChild(document.createTextNode(n.nodeValue));
        else if (n.nodeType === 1) {
          if (!ALLOW[n.tagName]) return walk(n, dst);
          const e = document.createElement(n.tagName.toLowerCase());
          if (n.tagName === 'A') {
            const h = n.getAttribute('href') || '';
            if (/^(https?:|mailto:|bp:)/i.test(h)) e.setAttribute('href', h);
          }
          if (n.tagName === 'SPAN') {
            const c = (n.getAttribute('class') || '').split(/\s+/).filter((x) => /^((c|bg)-[a-z]+|cmt-[a-z0-9]+)$/.test(x));
            if (!c.length) return walk(n, dst);
            e.className = c.join(' ');
          }
          walk(n, e);
          dst.appendChild(e);
        }
      });
    })(doc.body, out);
    return out.innerHTML;
  };

  /* ---------- persistence ---------- */
  /* In the desktop app the main process owns the file. In a browser / phone the workspace lives in IndexedDB (localStorage holds only ~5 MB,
     which a few pasted images would fill) with localStorage as the fallback; the browser is asked to keep it (navigator.storage.persist). */
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open('blockpad', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const idbGet = async (k) => { const db = await idb(); return new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); };
  const idbSet = async (k, v) => { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); }); };
  BP.webLoad = async () => {
    try { const v = await idbGet('ws'); if (v) return v; } catch (_) {}
    try { return localStorage.getItem('blockpad.ws'); } catch (_) { return null; }
  };
  BP.webSave = async (json) => {
    try { await idbSet('ws', json); try { localStorage.removeItem('blockpad.ws'); } catch (_) {} }
    catch (e) { localStorage.setItem('blockpad.ws', json); }
  };
  BP.state = null;
  BP.corrupted = false;
  BP.init = async function () {
    let raw = null;
    try {
      raw = window.bp ? await window.bp.load() : await BP.webLoad();
      if (!window.bp && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch (e) {}
    let st = null;
    if (raw) {
      try {
        st = JSON.parse(raw);
      } catch (e) {
        BP.corrupted = true;
      }
    }
    if (!st || !st.pages) {
      BP.state = { v: 1, pages: {}, settings: { theme: 'auto', sidebar: true, name: 'My Workspace' }, current: null };
      BP.seed();
    } else {
      BP.state = st;
      st.settings = Object.assign({ theme: 'auto', sidebar: true, name: 'My Workspace' }, st.settings);
    }
    const s = BP.state.settings;
    s.userName = s.userName || 'You';
    s.people = s.people || [];
    s.ai = Object.assign({ endpoint: '', model: '', key: '' }, s.ai);
    // built-in offline AI is the default; someone who already configured an endpoint keeps using it
    s.ai.provider = s.ai.provider || (s.ai.endpoint && s.ai.model ? 'custom' : 'builtin');
    s.ai.local = Object.assign({ model: 'tiny', ramPct: 15, idleMin: 10, autoStart: true }, s.ai.local);
    s.api = Object.assign({ enabled: false, port: 7878, token: '' }, s.api);
    BP.state.share = BP.state.share || { spaces: {} };
    BP.state.meta = BP.state.meta || {};
    BP.state.synced = BP.state.synced || {};
  };
  BP.me = () => (BP.state && BP.state.settings.userName) || 'You';
  let timer = null;
  window.addEventListener('beforeunload', () => {
    if (!BP.dirty || (BP.corrupted && !BP.allowOverwrite)) return;
    try {
      if (window.bp) window.bp.saveSync(JSON.stringify(BP.state));
      else BP.webSave(JSON.stringify(BP.state));
    } catch (_) {}
  });
  BP.save = function () {
    BP.dirty = true;
    clearTimeout(timer);
    timer = setTimeout(BP.flush, 350);
  };
  BP.flush = async function () {
    clearTimeout(timer);
    timer = null;
    if (BP.corrupted && !BP.allowOverwrite) return;
    const json = JSON.stringify(BP.state);
    BP.dirty = false;
    try {
      if (window.bp) await window.bp.save(json);
      else await BP.webSave(json);
    } catch (e) {
      BP.dirty = true;
      console.error(e);
      BP.toast && BP.toast('Could not save: ' + e.message);
    }
  };
  window.addEventListener('blur', () => timer && BP.flush());
  document.addEventListener('visibilitychange', () => document.hidden && timer && BP.flush());

  /* ---------- pages ---------- */
  const now = () => Date.now();
  BP.page = (id) => (BP.state && id ? BP.state.pages[id] : null);
  BP.newBlock = (type = 'p', text = '') => ({ id: uid(), type, text });
  BP.allPages = () => Object.values(BP.state.pages);
  BP.isTrashed = (p) => {
    for (let c = p, n = 0; c && n < 100; c = BP.page(c.parent), n++) if (c.trashed) return true;
    return false;
  };
  BP.children = (id) =>
    BP.allPages()
      .filter((p) => (p.parent || null) === (id || null) && !p.rowOf && !p.inline && !p.trashed)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  BP.rows = (dbId) => BP.allPages().filter((p) => p.rowOf === dbId && !p.trashed);
  BP.path = (p) => {
    const out = [];
    for (let c = p, n = 0; c && n < 50; c = BP.page(c.parent), n++) out.unshift(c);
    return out;
  };
  BP.touch = (p) => {
    p.updated = now();
    p.editedBy = BP.me();
    BP.snapshot(p);
    BP.save();
  };
  BP.snapshot = (p) => {
    if (p.type === 'db') return;
    p.history = p.history || [];
    const last = p.history[p.history.length - 1];
    if (last && now() - last.t < 180000) {
      last.title = p.title;
      last.blocks = JSON.parse(JSON.stringify(p.blocks));
      return;
    }
    p.history.push({ t: now(), title: p.title, blocks: JSON.parse(JSON.stringify(p.blocks)) });
    if (p.history.length > 25) p.history.shift();
  };

  BP.createPage = function (parent, opts = {}) {
    const sibs = BP.allPages().filter((p) => (p.parent || null) === (parent || null) && !!p.rowOf === !!opts.rowOf);
    const p = Object.assign(
      {
        id: uid(),
        type: 'page',
        parent: parent || null,
        title: '',
        icon: '',
        cover: null,
        blocks: [BP.newBlock('p')],
        favorite: false,
        trashed: false,
        created: now(),
        updated: now(),
        createdBy: BP.me(),
        editedBy: BP.me(),
        comments: [],
        history: [],
        order: sibs.reduce((m, x) => Math.max(m, x.order || 0), 0) + 1,
      },
      opts
    );
    BP.state.pages[p.id] = p;
    if (parent && !opts.rowOf && !opts.inline && BP.page(parent) && BP.page(parent).type === 'page') {
      BP.page(parent).blocks.push({ id: uid(), type: 'page', ref: p.id });
    }
    BP.save();
    return p;
  };

  const opt = (name, color) => ({ id: uid(), name, color });
  BP.createDatabase = function (parent, o = {}) {
    const status = [opt('Not started', 'gray'), opt('In progress', 'blue'), opt('Done', 'green')];
    const props = [
      { id: 'title', name: 'Name', type: 'title', w: 260 },
      { id: uid(), name: 'Status', type: 'status', options: status, w: 150 },
      { id: uid(), name: 'Date', type: 'date', w: 140 },
      { id: uid(), name: 'Tags', type: 'multi_select', options: [opt('Work', 'purple'), opt('Personal', 'orange')], w: 180 },
    ];
    const statusId = props[1].id;
    const view = (type, name, extra) => Object.assign({ id: uid(), type, name, filters: [], sorts: [], hidden: [] }, extra);
    const db = BP.createPage(parent, {
      type: 'db',
      title: o.title || 'Untitled database',
      icon: o.icon || '',
      inline: !!o.inline,
      blocks: [],
      props,
      views: [view('table', 'Table'), view('board', 'Board', { groupBy: statusId })],
    });
    if (o.inline && parent && BP.page(parent) && o.link !== false) {
      /* caller inserts the dbview block */
    }
    return db;
  };
  BP.addRow = function (dbId, title = '', values = {}) {
    const row = BP.createPage(dbId, { rowOf: dbId, title, values, blocks: [BP.newBlock('p')] });
    BP.save();
    return row;
  };

  BP.trash = (id) => {
    const p = BP.page(id);
    if (!p) return;
    p.trashed = true;
    p.trashedAt = now();
    p.favorite = false;
    BP.save();
  };
  BP.restore = (id) => {
    const p = BP.page(id);
    if (!p) return;
    p.trashed = false;
    delete p.trashedAt;
    // if its parent is gone or trashed, move it to the root
    const par = BP.page(p.parent);
    if (p.parent && (!par || BP.isTrashed(par))) p.parent = null;
    BP.save();
  };
  BP.descendants = (id) => {
    const out = [];
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop();
      BP.allPages().forEach((p) => p.parent === cur && (out.push(p.id), stack.push(p.id)));
    }
    return out;
  };
  BP.purge = (id) => {
    const P = (BP.state.purged = BP.state.purged || {});
    [id, ...BP.descendants(id)].forEach((x) => { delete BP.state.pages[x]; P[x] = Date.now(); });
    BP.save();
  };
  // merge a workspace file written by another device/window: newest edit of each page wins; permanent deletes propagate
  BP.mergeExternal = function (text) {
    const r = JSON.parse(text);
    if (!r || typeof r.pages !== 'object') throw new Error('Not a Blockpad workspace');
    const S = BP.state;
    S.purged = S.purged || {};
    let changed = false, currentChanged = false;
    Object.keys(r.purged || {}).forEach((id) => {
      const ts = r.purged[id];
      if (S.pages[id] && (S.pages[id].updated || 0) <= ts) { delete S.pages[id]; changed = true; currentChanged = currentChanged || id === S.current; }
      S.purged[id] = Math.max(ts, S.purged[id] || 0);
    });
    Object.keys(r.pages).forEach((id) => {
      const rp = r.pages[id], lp = S.pages[id];
      if (S.purged[id] && S.purged[id] >= (rp.updated || 0)) return;
      if (!lp || (rp.updated || 0) > (lp.updated || 0)) { S.pages[id] = rp; changed = true; if (id === S.current) currentChanged = true; }
    });
    (r.templates || []).forEach((t) => { S.templates = S.templates || []; if (!S.templates.some((x) => x.id === t.id)) { S.templates.push(t); changed = true; } });
    const rs = r.settings || {};
    (rs.people || []).forEach((n) => { if (!S.settings.people.includes(n)) { S.settings.people.push(n); changed = true; } });
    Object.keys(r.synced || {}).forEach((k) => { if (!S.synced[k]) { S.synced[k] = r.synced[k]; changed = true; } });
    if (changed) BP.save();
    return { changed, currentChanged };
  };

  // blocks
  BP.findBlock = function (blocks, id, parent) {
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.id === id) return { block: b, list: blocks, index: i, parent: parent || null };
      if (b.children) {
        const r = BP.findBlock(b.children, id, b);
        if (r) return r;
      }
    }
    return null;
  };
  BP.walkBlocks = function (blocks, fn) {
    blocks.forEach((b) => {
      fn(b);
      b.children && BP.walkBlocks(b.children, fn);
    });
  };
  /* synced blocks: every copy carries its own children; edits are mirrored to the other copies on commit */
  BP.syncOut = function (page) {
    const S = (BP.state.synced = BP.state.synced || {});
    const groups = {};
    BP.walkBlocks(page.blocks, (b) => { if (b.type === 'synced' && b.sid) (groups[b.sid] = groups[b.sid] || []).push(b); });
    let changed = false;
    Object.keys(groups).forEach((sid) => {
      const prev = S[sid];
      const src = groups[sid].find((b) => JSON.stringify(b.children || []) !== prev) || groups[sid][0];
      const json = JSON.stringify(src.children || []);
      if (prev === json) return;
      S[sid] = json;
      changed = true;
      groups[sid].forEach((b) => { if (b !== src) b.children = JSON.parse(json); });
      BP.allPages().forEach((p) => {
        if (p === page || !p.blocks) return;
        let dirty = false;
        BP.walkBlocks(p.blocks, (b) => { if (b.type === 'synced' && b.sid === sid && JSON.stringify(b.children || []) !== json) { b.children = JSON.parse(json); dirty = true; } });
        if (dirty) p.updated = Date.now();
      });
    });
    if (changed) BP.save();
  };
  BP.syncIn = function (page) {
    const S = BP.state.synced || {};
    BP.walkBlocks(page.blocks || [], (b) => { if (b.type === 'synced' && b.sid && S[b.sid] && JSON.stringify(b.children || []) !== S[b.sid]) b.children = JSON.parse(S[b.sid]); });
  };
  BP.hasSync = (page, sid) => { let f = false; BP.walkBlocks(page.blocks || [], (b) => { if (b.type === 'synced' && b.sid === sid) f = true; }); return f; };
  BP.cleanBlocks = function (page) {
    // drop empty/single-child column groups, keep at least one block
    (function fix(list) {
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i];
        if (b.children) fix(b.children);
        if ((b.type === 'tab' || b.type === 'synced') && !(b.children && b.children.length)) b.children = [BP.newBlock('p')];
        if (b.children && !b.children.length && !['columns', 'column', 'tabs', 'tab', 'synced'].includes(b.type)) delete b.children;
        if (b.type === 'column' && (!b.children || !b.children.length)) list.splice(i, 1);
        else if (b.type === 'columns') {
          if (!b.children.length) list.splice(i, 1);
          else if (b.children.length === 1) list.splice(i, 1, ...(b.children[0].children || []));
        }
      }
    })(page.blocks);
    if (!page.blocks.length && page.type !== 'db') page.blocks.push(BP.newBlock('p'));
  };

  BP.clonePage = function (id, parent, keepTitle) {
    const src = BP.page(id);
    const map = {};
    const copy = (s, par, isRoot) => {
      const c = JSON.parse(JSON.stringify(s));
      c.id = uid();
      map[s.id] = c.id;
      c.parent = par;
      if (isRoot && !keepTitle) c.title = (s.title || 'Untitled') + ' (copy)';
      c.created = c.updated = now();
      c.history = [];
      c.comments = [];
      c.favorite = false;
      c.trashed = false;
      delete c.trashedAt;
      BP.state.pages[c.id] = c;
      BP.allPages()
        .filter((p) => p.parent === s.id && !p.trashed && p.id !== c.id && !(map[p.id]))
        .forEach((k) => copy(k, c.id));
      return c;
    };
    const root = copy(src, parent === undefined ? src.parent : parent, true);
    if (src.rowOf && !BP.page(root.parent)) root.rowOf = null;
    else if (src.rowOf) root.rowOf = root.parent;
    // remap refs inside copied pages
    Object.values(map).forEach((nid) => {
      const p = BP.page(nid);
      if (p.rowOf && map[p.rowOf]) p.rowOf = map[p.rowOf];
      p.blocks && BP.walkBlocks(p.blocks, (b) => b.ref && map[b.ref] && (b.ref = map[b.ref]));
    });
    const par = BP.page(root.parent);
    if (par && par.type === 'page' && !root.rowOf && !root.inline) par.blocks.push({ id: uid(), type: 'page', ref: root.id });
    BP.save();
    return root;
  };
  /* user templates: a frozen copy of a page (and its sub-pages / rows) that can be stamped out again */
  BP.saveTemplate = function (pageId) {
    const p = BP.page(pageId);
    if (!p) return null;
    const ids = [pageId, ...BP.descendants(pageId)].filter((id) => BP.page(id) && !BP.page(id).trashed);
    const pages = {};
    ids.forEach((id) => { const c = JSON.parse(JSON.stringify(BP.page(id))); delete c.history; c.comments = []; c.favorite = false; pages[id] = c; });
    const t = { id: uid(), name: p.title || 'Untitled', icon: p.icon || '', root: pageId, pages, created: now() };
    (BP.state.templates = BP.state.templates || []).push(t);
    BP.save();
    return t;
  };
  BP.useTemplate = function (t, parent) {
    const map = {};
    Object.keys(t.pages).forEach((id) => (map[id] = uid()));
    Object.keys(t.pages).forEach((id) => {
      const c = JSON.parse(JSON.stringify(t.pages[id]));
      c.id = map[id];
      c.parent = id === t.root ? parent || null : map[c.parent] || null;
      if (c.rowOf) c.rowOf = map[c.rowOf] || null;
      c.created = c.updated = now();
      c.trashed = false;
      c.history = [];
      c.comments = [];
      if (c.blocks) BP.walkBlocks(c.blocks, (b) => { if (b.ref && map[b.ref]) b.ref = map[b.ref]; });
      (c.props || []).forEach((pr) => { if (pr.target && map[pr.target]) pr.target = map[pr.target]; });
      BP.state.pages[c.id] = c;
    });
    const root = BP.page(map[t.root]);
    const sibs = BP.allPages().filter((x) => (x.parent || null) === (root.parent || null) && !x.rowOf && x.id !== root.id);
    root.order = sibs.reduce((m, x) => Math.max(m, x.order || 0), 0) + 1;
    const par = BP.page(root.parent);
    if (par && par.type === 'page') par.blocks.push({ id: uid(), type: 'page', ref: root.id });
    BP.save();
    return root;
  };
  // move a page to a new parent (and keep the little "page" link blocks in sync)
  BP.movePage = function (id, newParent, beforeId) {
    const p = BP.page(id);
    if (!p || id === newParent) return false;
    if (newParent && (BP.descendants(id).includes(newParent))) return false;
    const old = BP.page(p.parent);
    if (old && old.blocks && (p.parent || null) !== (newParent || null)) {
      (function rm(list) {
        for (let i = list.length - 1; i >= 0; i--) {
          if (list[i].type === 'page' && list[i].ref === id) list.splice(i, 1);
          else if (list[i].children) rm(list[i].children);
        }
      })(old.blocks);
      BP.cleanBlocks(old);
    }
    const np = BP.page(newParent);
    if ((p.parent || null) !== (newParent || null) && np && np.type === 'page') {
      let linked = false;
      BP.walkBlocks(np.blocks, (b) => { if (b.type === 'page' && b.ref === id) linked = true; });
      if (!linked) np.blocks.push({ id: uid(), type: 'page', ref: id });
    }
    p.parent = newParent || null;
    const sibs = BP.children(newParent).filter((x) => x.id !== id);
    const idx = beforeId ? sibs.findIndex((x) => x.id === beforeId) : -1;
    const a = idx > 0 ? sibs[idx - 1].order || 0 : idx === 0 ? (sibs[0].order || 0) - 2 : (sibs.length ? sibs[sibs.length - 1].order || 0 : 0);
    const b = idx >= 0 ? sibs[idx].order || 0 : a + 2;
    p.order = (a + b) / 2;
    BP.save();
    return true;
  };

  /* ---------- databases ---------- */
  BP.propVal = (row, prop) => {
    switch (prop.type) {
      case 'title': return row.title;
      case 'created_time': return row.created;
      case 'last_edited_time': return row.updated;
      case 'formula': return BP.evalFormula(row, prop);
      case 'rollup': return BP.rollup(row, prop);
      case 'unique_id': {
        if (row.uid == null) {
          const db = BP.page(row.rowOf);
          const rows = db ? BP.allPages().filter((p) => p.rowOf === db.id) : [];
          row.uid = rows.reduce((m, r) => Math.max(m, r.uid || 0), 0) + 1;
        }
        return row.uid;
      }
      case 'relation': case 'people': case 'files': return (row.values || {})[prop.id] || [];
      case 'created_by': return row.createdBy || 'You';
      case 'last_edited_by': return row.editedBy || 'You';
      default: return (row.values || {})[prop.id];
    }
  };
  BP.COMPUTED = ['formula', 'rollup', 'created_time', 'last_edited_time', 'unique_id', 'created_by', 'last_edited_by', 'button'];
  BP.setProp = (row, prop, v) => {
    if (prop.type === 'title') row.title = v;
    else (row.values = row.values || {})[prop.id] = v;
    row.updated = now();
    row.editedBy = BP.me();
    BP.save();
  };
  BP.optById = (prop, id) => (prop.options || []).find((o) => o.id === id);
  const isEmpty = (v) => v == null || v === '' || (Array.isArray(v) && !v.length);
  BP.matchFilter = function (row, f, db) {
    const prop = db.props.find((p) => p.id === f.propId);
    if (!prop) return true;
    let v = BP.propVal(row, prop);
    if (prop.type === 'date') { const d = BP.dateParts(v); v = d.s; }
    else if (prop.type === 'formula' || prop.type === 'rollup') v = BP.fmtComputed(v);
    else if (prop.type === 'unique_id') v = BP.displayValue(row, prop);
    else if (prop.type === 'relation') v = BP.displayValue(row, prop).join(', ');
    else if (prop.type === 'verification') v = !!(v && v.status === 'verified');
    else if (prop.type === 'place') v = v ? v.text || '' : '';
    else if (prop.type === 'files') v = (v || []).map((x) => x.name);
    else if (prop.type === 'last_edited_time') v = new Date(v).toISOString();
    const sv = String(v == null ? '' : v).toLowerCase();
    const q = String(f.value == null ? '' : f.value).toLowerCase();
    switch (f.op) {
      case 'contains': return Array.isArray(v) ? v.includes(f.value) : sv.includes(q);
      case 'not_contains': return Array.isArray(v) ? !v.includes(f.value) : !sv.includes(q);
      case 'is': return Array.isArray(v) ? v.includes(f.value) : prop.type === 'checkbox' ? !!v === (f.value === 'true' || f.value === true) : sv === q;
      case 'is_not': return Array.isArray(v) ? !v.includes(f.value) : sv !== q;
      case 'empty': return isEmpty(v);
      case 'not_empty': return !isEmpty(v);
      case 'eq': return Number(v) === Number(f.value);
      case 'ne': return Number(v) !== Number(f.value);
      case 'gt': return v != null && v !== '' && Number(v) > Number(f.value);
      case 'lt': return v != null && v !== '' && Number(v) < Number(f.value);
      case 'ge': return v != null && v !== '' && Number(v) >= Number(f.value);
      case 'le': return v != null && v !== '' && Number(v) <= Number(f.value);
      case 'checked': return !!v;
      case 'unchecked': return !v;
      case 'before': return !!v && String(v) < String(f.value);
      case 'after': return !!v && String(v) > String(f.value);
      case 'on': return !!v && String(v).slice(0, 10) === String(f.value).slice(0, 10);
      default: return true;
    }
  };
  // nested AND / OR filter groups: an item is a condition, or { group: true, op: 'and'|'or', items: [...] }
  BP.matchGroup = function (row, items, op, db) {
    if (!items || !items.length) return true;
    const test = (it) => (it.group ? BP.matchGroup(row, it.items, it.op || 'and', db) : BP.matchFilter(row, it, db));
    return op === 'or' ? items.some(test) : items.every(test);
  };
  BP.countFilters = (items) => (items || []).reduce((n, it) => n + (it.group ? BP.countFilters(it.items) : 1), 0);
  BP.viewRows = function (db, view, search) {
    let rows = BP.rows(db.id);
    if ((view.filters || []).length) rows = rows.filter((r) => BP.matchGroup(r, view.filters, view.filterOp || 'and', db));
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => (r.title || '').toLowerCase().includes(q) || db.props.some((p) => String(BP.propVal(r, p) ?? '').toLowerCase().includes(q)));
    }
    const sorts = view.sorts || [];
    if (sorts.length)
      rows.sort((a, b) => {
        for (const s of sorts) {
          const prop = db.props.find((p) => p.id === s.propId);
          if (!prop) continue;
          let x = BP.propVal(a, prop), y = BP.propVal(b, prop);
          if (prop.type === 'select' || prop.type === 'status') { x = (BP.optById(prop, x) || {}).name; y = (BP.optById(prop, y) || {}).name; }
          if (prop.type === 'date') { x = BP.dateParts(x).s; y = BP.dateParts(y).s; }
          if (prop.type === 'relation') { x = BP.displayValue(a, prop).join(', '); y = BP.displayValue(b, prop).join(', '); }
          if (Array.isArray(x)) x = x.length; if (Array.isArray(y)) y = y.length;
          const ex = isEmpty(x), ey = isEmpty(y);
          if (ex || ey) { if (ex && ey) continue; return ex ? 1 : -1; }
          const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
          if (c) return s.dir === 'desc' ? -c : c;
        }
        return (a.order || a.created) - (b.order || b.created);
      });
    else rows.sort((a, b) => (a.order || 0) - (b.order || 0));
    return rows;
  };

  /* ---------- seed ---------- */
  BP.seed = function () {
    const P = BP.createPage;
    const b = (type, text, extra) => Object.assign(BP.newBlock(type, text), extra || {});
    const home = P(null, { title: 'Welcome to Blockpad', icon: '👋', cover: 'g:indigo', blocks: [] });
    home.open = true;
    const tasks = BP.createDatabase(home.id, { title: 'Tasks', icon: '✅' });
    const sid = tasks.props[1].id, tid = tasks.props[3].id, did = tasks.props[2].id;
    const o = (n) => tasks.props[1].options.find((x) => x.name === n).id;
    const d = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
    const tg = (n) => tasks.props[3].options.find((x) => x.name === n).id;
    [['Plan the week', 'In progress', 0, 'Work'], ['Try the / menu', 'Not started', 1, 'Personal'], ['Drag a card on the board', 'Not started', 2, 'Work'], ['Export a page as Markdown', 'Done', -1, 'Personal']].forEach(([t, s, n, g]) =>
      BP.addRow(tasks.id, t, { [sid]: o(s), [did]: d(n), [tid]: [tg(g)] })
    );
    const journal = P(home.id, { title: 'Journal', icon: '📓', blocks: [b('h2', 'Today'), b('todo', 'Write down one thing that went well'), b('p', '')] });
    home.blocks = [
      b('p', 'Blockpad is a local-first workspace. Everything lives on this computer, nothing is sent anywhere, and it works with no internet.'),
      b('callout', 'Type <code>/</code> on any line to insert a block. Try it on the empty line at the bottom.', { icon: '💡' }),
      b('h2', 'Write'),
      b('bullet', 'Select text for the formatting bar, or use Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+E (code), Ctrl+K (link).'),
      b('bullet', 'Markdown shortcuts work: <code>#</code>, <code>-</code>, <code>1.</code>, <code>[]</code>, <code>&gt;</code>, <code>```</code>, <code>---</code>.'),
      b('bullet', 'Press Tab to nest a block, Shift+Tab to un-nest. Drag the ⋮⋮ handle to reorder.'),
      b('todo', 'Check me off', { checked: true }),
      b('toggle', 'A toggle block hides things', { open: true, children: [b('p', 'Nested content lives here.')] }),
      b('h2', 'Organize'),
      b('p', 'Use the sidebar to nest pages by dragging them. Ctrl+K searches everything, Ctrl+N makes a page, and the trash keeps deleted pages until you empty it.'),
      b('page', '', { ref: tasks.id }),
      b('page', '', { ref: journal.id }),
      b('h2', 'Share'),
      b('p', 'Because nothing is online, sharing means exporting: Markdown, a self-contained HTML page, or a full workspace backup from the Share and Settings dialogs.'),
      b('p', ''),
    ];
    BP.state.current = home.id;
    BP.save();
  };
})();

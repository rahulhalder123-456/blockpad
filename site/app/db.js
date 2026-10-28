/* Blockpad databases: typed properties, views (table / board / list / gallery / calendar), filters, sorts. */
(function () {
  const BP = (window.BP = window.BP || {});
  const { h, uid } = BP;

  const TYPES = [
    ['text', 'Text', 'Aa'], ['number', 'Number', '#'], ['select', 'Select', '◉'], ['multi_select', 'Multi-select', '☰'],
    ['status', 'Status', '◔'], ['date', 'Date', '📅'], ['checkbox', 'Checkbox', '☑'], ['url', 'URL', '🔗'], ['email', 'Email', '✉'], ['phone', 'Phone', '☎'],
    ['people', 'People', '👥'], ['files', 'Files', '📎'], ['place', 'Place', '📍'], ['verification', 'Verification', '✔'], ['button', 'Button', '🔘'],
    ['formula', 'Formula', 'ƒ'], ['relation', 'Relation', '↗'], ['rollup', 'Rollup', '∑'], ['unique_id', 'ID', '№'],
    ['created_time', 'Created time', '🕒'], ['last_edited_time', 'Last edited time', '✎'], ['created_by', 'Created by', '👤'], ['last_edited_by', 'Last edited by', '👤'],
  ];
  const TICO = Object.fromEntries(TYPES.map((t) => [t[0], t[2]]).concat([['title', 'Aa']]));
  const VIEWS = [['table', 'Table'], ['board', 'Board'], ['list', 'List'], ['gallery', 'Gallery'], ['calendar', 'Calendar'], ['timeline', 'Timeline'], ['chart', 'Chart'], ['form', 'Form'], ['map', 'Map'], ['dashboard', 'Dashboard']];
  BP.icons.form = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>';
  BP.icons.map = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>';
  BP.icons.dashboard = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="8" height="10" rx="1"/><rect x="13" y="3" width="8" height="6" rx="1"/><rect x="13" y="11" width="8" height="10" rx="1"/><rect x="3" y="15" width="8" height="6" rx="1"/></svg>';
  // "People" values are names from the workspace member list (Settings > Members); behaves like a multi-select
  const peopleProp = (prop) => ({
    id: prop.id, name: prop.name, type: 'multi_select',
    get options() { return (BP.state.settings.people || []).map((n) => ({ id: n, name: n, color: BP.COLORS[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % 9] })); },
    set options(v) { BP.state.settings.people = v.map((o) => o.name); BP.save(); },
  });
  BP.peopleProp = peopleProp;
  BP.icons.timeline = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h9M7 12h12M5 18h8"/></svg>';
  BP.icons.chart = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 20V10M12 20V4M19 20v-7"/></svg>';
  const CALCS = [['none', 'None'], ['count', 'Count all'], ['count_values', 'Count values'], ['empty', 'Count empty'], ['percent_empty', 'Percent empty'], ['unique', 'Count unique'], ['sum', 'Sum'], ['average', 'Average'], ['min', 'Min'], ['max', 'Max'], ['range', 'Range']];
  BP.dbTypes = TYPES;
  const OPS = {
    text: [['contains', 'contains'], ['not_contains', 'does not contain'], ['is', 'is'], ['is_not', 'is not'], ['empty', 'is empty'], ['not_empty', 'is not empty']],
    number: [['eq', '='], ['ne', '≠'], ['gt', '>'], ['lt', '<'], ['ge', '≥'], ['le', '≤'], ['empty', 'is empty'], ['not_empty', 'is not empty']],
    select: [['is', 'is'], ['is_not', 'is not'], ['empty', 'is empty'], ['not_empty', 'is not empty']],
    multi_select: [['contains', 'contains'], ['not_contains', 'does not contain'], ['empty', 'is empty'], ['not_empty', 'is not empty']],
    date: [['on', 'is'], ['before', 'is before'], ['after', 'is after'], ['empty', 'is empty'], ['not_empty', 'is not empty']],
    checkbox: [['checked', 'is checked'], ['unchecked', 'is not checked']],
  };
  OPS.files = [['empty', 'is empty'], ['not_empty', 'is not empty'], ['contains', 'contains']];
  const opsFor = (t) => OPS[['title', 'url', 'email', 'phone', 'formula', 'rollup', 'relation', 'unique_id', 'place', 'created_by', 'last_edited_by'].includes(t) ? 'text' : t === 'status' ? 'select' : t === 'people' ? 'multi_select' : t === 'verification' ? 'checkbox' : t === 'created_time' || t === 'last_edited_time' ? 'date' : t] || OPS.text;
  const NOVAL = ['empty', 'not_empty', 'checked', 'unchecked'];
  const ui = (BP.dbUi = BP.dbUi || {});

  const chip = (prop, id) => {
    const o = BP.optById(prop, id);
    return o ? h('span', { class: 'chip opt-' + o.color }, o.name) : null;
  };
  const isFilterable = (p) => p.type !== 'created_time' && p.type !== 'button';

  /* ---------- cell editors (also used by the row-page property panel) ---------- */
  function runPropButton(db, prop, row, redraw) {
    (prop.sets || []).forEach((s) => {
      const target = db.props.find((p) => p.id === s.propId);
      if (!target) return;
      let val = s.value;
      if (target.type === 'date' && s.today) val = BP.isoDay(new Date());
      else if (target.type === 'checkbox') val = s.value === true || s.value === 'true';
      else if (target.type === 'number') val = s.value === '' || s.value == null ? null : Number(s.value);
      BP.setProp(row, target, val === '' ? null : val);
    });
    if (prop.url) window.open(/^https?:/i.test(prop.url) ? prop.url : 'https://' + prop.url, '_blank');
    if (!(prop.sets || []).length && !prop.url) BP.toast('Set what this button does in the column menu');
    redraw && redraw();
  }
  BP.cellEditor = function (db, prop, row, cell, redraw) {
    if (prop.type === 'people') return BP.cellEditor(db, peopleProp(prop), row, cell, redraw);
    cell.innerHTML = '';
    const v = BP.propVal(row, prop);
    const set = (val, again) => { BP.setProp(row, prop, val); again !== false && redraw && redraw(); };
    switch (prop.type) {
      case 'title': {
        const i = h('input', { class: 'cell-in title', value: row.title || '', placeholder: 'Untitled' });
        i.addEventListener('change', () => set(i.value, false));
        i.addEventListener('keydown', (e) => e.key === 'Enter' && i.blur());
        cell.append(i);
        break;
      }
      case 'text': case 'url': case 'number': case 'email': case 'phone': {
        const i = h('input', { class: 'cell-in', type: prop.type === 'number' ? 'number' : 'text', value: v == null ? '' : v, step: 'any' });
        i.addEventListener('change', () => set(prop.type === 'number' ? (i.value === '' ? null : Number(i.value)) : i.value));
        i.addEventListener('keydown', (e) => e.key === 'Enter' && i.blur());
        cell.append(i);
        if (v && ['url', 'email', 'phone'].includes(prop.type)) cell.append(h('a', { class: 'cell-link', href: prop.type === 'email' ? 'mailto:' + v : prop.type === 'phone' ? 'tel:' + v : /^https?:/.test(v) ? v : 'https://' + v, target: '_blank', title: 'Open' }, '↗'));
        break;
      }
      case 'last_edited_time': cell.append(h('span', { class: 'muted pad-s' }, BP.fmtDate(row.updated))); break;
      case 'created_by': case 'last_edited_by': cell.append(h('span', { class: 'computed' }, '👤 ' + v)); break;
      case 'button': cell.append(h('button', { class: 'btn small cell-btn', onclick: () => runPropButton(db, prop, row, redraw) }, prop.label || 'Click')); break;
      case 'verification': {
        const ok = v && v.status === 'verified';
        cell.append(h('div', { class: 'chips' }, h('span', { class: 'chip ' + (ok ? 'opt-green' : 'opt-gray'), style: { cursor: 'pointer' }, title: 'Click to toggle', onclick: () => set(ok ? null : { status: 'verified', by: BP.me(), date: BP.isoDay(new Date()) }) }, ok ? '✔ Verified by ' + v.by + ' · ' + BP.fmtDay(v.date) : 'Not verified')));
        break;
      }
      case 'place': {
        const p0 = v || { text: '', lat: null, lng: null };
        const i = h('input', { class: 'cell-in', value: p0.text || '', placeholder: 'Address or place' });
        i.addEventListener('change', () => set(Object.assign({}, p0, { text: i.value }), false));
        i.addEventListener('keydown', (e) => e.key === 'Enter' && i.blur());
        const pin = h('button', { class: 'cell-link pin', title: 'Coordinates (used by Map views)', onclick: () => BP.popover(cell, (el, close) => {
          el.classList.add('embed-pop');
          const la = h('input', { class: 'input', placeholder: 'Latitude, e.g. 51.5072', value: p0.lat == null ? '' : p0.lat });
          const lo = h('input', { class: 'input', placeholder: 'Longitude, e.g. -0.1276', value: p0.lng == null ? '' : p0.lng });
          const save = () => { const a = la.value.trim() === '' ? null : parseFloat(la.value), b = lo.value.trim() === '' ? null : parseFloat(lo.value); if ((a != null && (isNaN(a) || Math.abs(a) > 90)) || (b != null && (isNaN(b) || Math.abs(b) > 180))) return BP.toast('Latitude is −90…90 and longitude −180…180'); close(); set(Object.assign({}, p0, { text: i.value || p0.text, lat: a, lng: b })); };
          el.append(la, lo, h('button', { class: 'btn primary wide', onclick: save }, 'Save'));
          if (p0.lat != null && p0.lng != null) el.append(h('a', { class: 'small', href: 'https://www.openstreetmap.org/?mlat=' + p0.lat + '&mlon=' + p0.lng + '#map=15/' + p0.lat + '/' + p0.lng, target: '_blank' }, 'Open in OpenStreetMap ↗'));
          setTimeout(() => la.focus(), 30);
        }) }, p0.lat != null ? '📍' : '＋');
        cell.append(i, pin);
        break;
      }
      case 'files': {
        const files = (row.values || {})[prop.id] || [];
        const box = h('div', { class: 'chips', tabindex: '0' }, files.map((f) => h('span', { class: 'chip opt-gray', title: 'Click to save', onclick: (e) => { e.stopPropagation(); BP.saveDataUrl(f.src, f.name); } }, '📎 ' + f.name)), files.length ? null : h('span', { class: 'muted ph' }, 'Empty'));
        box.addEventListener('click', () => BP.popover(box, (el, close) => {
          el.classList.add('opt-pop');
          el.append(h('button', { class: 'btn primary wide', onclick: () => {
            const inp = h('input', { type: 'file', multiple: '' });
            inp.onchange = async () => {
              const added = [];
              for (const f of inp.files) { if (f.size > 25e6 && !confirm(f.name + ' is over 25 MB and will be stored inside your workspace file. Continue?')) continue; added.push({ name: f.name, size: f.size, src: await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); }) }); }
              if (added.length) { close(); set(files.concat(added)); }
            };
            inp.click();
          } }, 'Upload files…'));
          files.forEach((f, i) => el.append(h('div', { class: 'opt-row' }, h('span', null, '📎 ' + f.name), h('button', { class: 'icon-btn', html: BP.icons.trash, onclick: () => { close(); set(files.filter((_, j) => j !== i)); } }))));
        }, { class: 'opt-pop' }));
        cell.append(box);
        break;
      }
      case 'unique_id': cell.append(h('span', { class: 'computed' }, BP.displayValue(row, prop))); break;
      case 'formula': case 'rollup': {
        const val = BP.propVal(row, prop);
        const bad = typeof val === 'string' && val.startsWith('⚠');
        cell.append(h('span', { class: 'computed' + (bad ? ' bad' : ''), title: prop.type === 'formula' ? prop.formula || 'Click the column header → Edit formula' : '' }, BP.fmtComputed(val) || (prop.type === 'formula' && !prop.formula ? 'Set a formula…' : '')));
        break;
      }
      case 'relation': {
        const ids = (row.values || {})[prop.id] || [];
        const box = h('div', { class: 'chips', tabindex: '0' }, ids.map((id) => { const r = BP.page(id); return r && !r.trashed ? h('span', { class: 'chip opt-blue rel', onclick: (e) => { e.stopPropagation(); BP.open(id); } }, '↗ ' + (r.title || 'Untitled')) : null; }), ids.length ? null : h('span', { class: 'muted ph' }, prop.target ? 'Empty' : 'Pick a database in the column menu'));
        box.addEventListener('click', () => prop.target && BP.popover(box, (el, close) => relationPicker(el, close, prop, ids, (nv) => set(nv)), { class: 'opt-pop' }));
        cell.append(box);
        break;
      }
      case 'checkbox': {
        const c = h('input', { type: 'checkbox', class: 'todo-cb' });
        c.checked = !!v;
        c.addEventListener('change', () => set(c.checked, false));
        cell.append(c);
        break;
      }
      case 'date': {
        const d = BP.dateParts(v);
        const s = h('input', { class: 'cell-in date', type: 'date', value: d.s });
        const wrap = h('div', { class: 'daterange' }, s);
        let e2 = null;
        const commit = () => set(BP.dateJoin(s.value, e2 ? e2.value : '') || null);
        s.addEventListener('change', commit);
        if (d.e) {
          e2 = h('input', { class: 'cell-in date', type: 'date', value: d.e, min: d.s });
          e2.addEventListener('change', commit);
          wrap.append(h('span', { class: 'muted' }, '→'), e2);
        } else if (d.s) wrap.append(h('button', { class: 'icon-btn tiny', title: 'Add an end date', onclick: () => { const x = new Date(d.s + 'T00:00:00'); x.setDate(x.getDate() + 1); set(BP.dateJoin(d.s, BP.isoDay(x))); } }, '→'));
        cell.append(wrap);
        break;
      }
      case 'created_time': cell.append(h('span', { class: 'muted pad-s' }, BP.fmtDate(row.created))); break;
      case 'select': case 'status': case 'multi_select': {
        const multi = prop.type === 'multi_select';
        const vals = multi ? v || [] : v ? [v] : [];
        const box = h('div', { class: 'chips', tabindex: '0' }, vals.map((id) => chip(prop, id)), vals.length ? null : h('span', { class: 'muted ph' }, 'Empty'));
        const open = () => BP.popover(box, (el, close) => optionPicker(el, close, db, prop, vals, multi, (nv) => set(multi ? nv : nv[0] || null)), { class: 'opt-pop' });
        box.addEventListener('click', open);
        box.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open()));
        cell.append(box);
        break;
      }
    }
  };
  function optionPicker(el, close, db, prop, vals, multi, commit) {
    let cur = vals.slice();
    const inp = h('input', { class: 'input', placeholder: multi ? 'Search or create an option…' : 'Search or create…' });
    const list = h('div', { class: 'opt-list' });
    const draw = () => {
      list.innerHTML = '';
      const q = inp.value.trim().toLowerCase();
      const opts = (prop.options || []).filter((o) => !q || o.name.toLowerCase().includes(q));
      if (!multi && cur.length) list.append(h('div', { class: 'opt-row', onclick: () => { commit([]); close(); } }, h('span', { class: 'muted' }, 'Clear')));
      opts.forEach((o) => list.append(h('div', { class: 'opt-row' + (cur.includes(o.id) ? ' on' : ''), onclick: () => { if (multi) { cur = cur.includes(o.id) ? cur.filter((x) => x !== o.id) : cur.concat(o.id); commit(cur); draw(); } else { commit([o.id]); close(); } } }, h('span', { class: 'chip opt-' + o.color }, o.name), cur.includes(o.id) ? h('span', { class: 'mi-check', html: BP.icons.check }) : null)));
      if (q && !(prop.options || []).some((o) => o.name.toLowerCase() === q)) {
        list.append(h('div', { class: 'opt-row create', onclick: () => {
          const o = { id: uid(), name: inp.value.trim(), color: BP.COLORS[Math.floor(Math.random() * BP.COLORS.length)] };
          prop.options = (prop.options || []).concat(o);
          BP.save();
          if (multi) { cur = cur.concat(o.id); commit(cur); inp.value = ''; draw(); } else { commit([o.id]); close(); }
        } }, 'Create ', h('span', { class: 'chip opt-gray' }, inp.value.trim())));
      }
    };
    inp.addEventListener('input', draw);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const first = list.querySelector('.opt-row:not(.on)') || list.querySelector('.opt-row'); first && first.click(); } });
    el.append(inp, list);
    draw();
    setTimeout(() => inp.focus(), 20);
  }
  function relationPicker(el, close, prop, ids, commit) {
    let cur = ids.slice();
    const tdb = BP.page(prop.target);
    const inp = h('input', { class: 'input', placeholder: 'Search ' + (tdb ? tdb.title || 'rows' : 'rows') + '…' });
    const list = h('div', { class: 'opt-list' });
    const draw = () => {
      list.innerHTML = '';
      const q = inp.value.trim().toLowerCase();
      BP.rows(prop.target).filter((r) => !q || (r.title || 'Untitled').toLowerCase().includes(q)).slice(0, 60).forEach((r) => list.append(h('div', { class: 'opt-row' + (cur.includes(r.id) ? ' on' : ''), onclick: () => { cur = cur.includes(r.id) ? cur.filter((x) => x !== r.id) : cur.concat(r.id); commit(cur); draw(); } }, h('span', null, (r.icon ? r.icon + ' ' : '') + (r.title || 'Untitled')), cur.includes(r.id) ? h('span', { class: 'mi-check', html: BP.icons.check }) : null)));
      if (q && tdb) list.append(h('div', { class: 'opt-row create', onclick: () => { const r = BP.addRow(prop.target, inp.value.trim()); cur = cur.concat(r.id); commit(cur); inp.value = ''; draw(); } }, 'Create ', h('b', null, inp.value.trim())));
      if (!list.children.length) list.append(h('div', { class: 'muted pad-s' }, 'No rows'));
    };
    inp.addEventListener('input', draw);
    el.append(inp, list);
    draw();
    setTimeout(() => inp.focus(), 20);
  }
  function editOptions(db, prop, after) {
    BP.modal('Edit options – ' + prop.name, (body) => {
      const list = h('div', { class: 'opt-edit' });
      const draw = () => {
        list.innerHTML = '';
        (prop.options || []).forEach((o) => {
          const name = h('input', { class: 'input', value: o.name });
          name.addEventListener('change', () => { o.name = name.value || o.name; BP.save(); after(); });
          const sel = h('select', { class: 'input small' }, BP.COLORS.map((c) => h('option', { value: c, selected: o.color === c ? '' : null }, c)));
          sel.addEventListener('change', () => { o.color = sel.value; BP.save(); draw(); after(); });
          list.append(h('div', { class: 'opt-edit-row' }, h('span', { class: 'chip opt-' + o.color }, '  '), name, sel, h('button', { class: 'icon-btn', html: BP.icons.trash, onclick: () => { prop.options = prop.options.filter((x) => x !== o); BP.rows(db.id).forEach((r) => { const val = (r.values || {})[prop.id]; if (Array.isArray(val)) r.values[prop.id] = val.filter((x) => x !== o.id); else if (val === o.id) delete r.values[prop.id]; }); BP.save(); draw(); after(); } })));
        });
      };
      draw();
      body.append(list, h('button', { class: 'btn', onclick: () => { prop.options = (prop.options || []).concat({ id: uid(), name: 'Option ' + ((prop.options || []).length + 1), color: BP.COLORS[(prop.options || []).length % 9] }); BP.save(); draw(); after(); } }, '+ Add option'));
    });
  }

  /* ---------- the database block ---------- */
  BP.renderDatabase = function (box, realDb, o = {}) {
    // a linked view keeps its own views on the hosting block; everything else is shared with the real database
    const db = o.holder ? new Proxy(realDb, { get: (t, k) => (k === 'views' ? o.holder.views : t[k]), set: (t, k, v) => { if (k === 'views') o.holder.views = v; else t[k] = v; return true; } }) : realDb;
    const st = (ui[o.key || db.id] = ui[o.key || db.id] || { search: '', month: null });
    const view = () => db.views.find((v) => v.id === st.view) || db.views[0];
    const redraw = () => { box.innerHTML = ''; build(); };
    const commit = () => { realDb.updated = Date.now(); BP.save(); };
    const vProps = (v) => db.props.filter((p) => p.type === 'title' || !(v.hidden || []).includes(p.id));

    const addRow = (values, title) => {
      const r = BP.addRow(db.id, title || '', values || {});
      redraw();
      return r;
    };

    function build() {
      const v = view();
      const wrap = h('div', { class: 'db' + (o.inline ? ' inline' : '') });
      if (o.inline) {
        const t = h('input', { class: 'db-title', value: db.title || '', placeholder: 'Untitled database' });
        t.addEventListener('change', () => { db.title = t.value; commit(); });
        wrap.append(h('div', { class: 'db-titlebar' }, h('span', { class: 'db-ico' }, db.icon || '🗂'), t, h('button', { class: 'btn small', onclick: () => BP.open(db.id) }, 'Open as page')));
      }
      // view tabs
      const tabs = h('div', { class: 'db-tabs' });
      db.views.forEach((vw) => {
        const tab = h('button', { class: 'db-tab' + (vw.id === v.id ? ' on' : ''), onclick: () => { st.view = vw.id; redraw(); }, oncontextmenu: (e) => { e.preventDefault(); viewMenu(tab, vw); } },
          h('span', { html: BP.icons[vw.type] || '' }), vw.name);
        if (vw.id === v.id) tab.addEventListener('dblclick', () => viewMenu(tab, vw));
        tabs.append(tab);
      });
      tabs.append(h('button', { class: 'db-tab add', title: 'Add a view', html: BP.icons.plus, onclick: (e) => BP.menu(e.currentTarget, VIEWS.map(([t, n]) => ({ label: n, icon: BP.icons[t], onClick: () => { const nv = { id: uid(), type: t, name: n, filters: [], sorts: [], hidden: [] }; db.views.push(nv); st.view = nv.id; commit(); redraw(); } }))) }));
      const tools = h('div', { class: 'db-tools' });
      const nF = BP.countFilters(v.filters), nS = (v.sorts || []).length;
      const tbtn = (label, icon, n, fn) => h('button', { class: 'btn ghost small' + (n ? ' on' : ''), onclick: (e) => fn(e.currentTarget), html: (icon || '') + ' ' + label + (n ? ' · ' + n : '') });
      const search = h('input', { class: 'db-search', placeholder: 'Search…', value: st.search });
      search.addEventListener('input', BP.debounce(() => { st.search = search.value; const pos = search.selectionStart; redraw(); const s2 = box.querySelector('.db-search'); s2 && (s2.focus(), s2.setSelectionRange(pos, pos)); }, 220));
      tools.append(search, tbtn('Filter', BP.icons.filter, nF, (a) => filterPop(a, v)), tbtn('Sort', BP.icons.sort, nS, (a) => sortPop(a, v)), tbtn('Properties', '', 0, (a) => propsPop(a, v)));
      if (v.type === 'board') tools.append(tbtn('Group', '', 0, (a) => groupPop(a, v, 'groupBy', 'Group by', (p) => ['select', 'status'].includes(p.type))));
      if (v.type === 'table' || v.type === 'list') tools.append(tbtn('Group', '', v.group ? 1 : 0, (a) => groupPop(a, v, 'group', 'Group by', (p) => !['formula', 'rollup', 'relation', 'created_time', 'last_edited_time', 'unique_id'].includes(p.type) || p.type === 'relation', true)));
      if (v.type === 'calendar' || v.type === 'timeline') tools.append(tbtn('Date', '', 0, (a) => groupPop(a, v, 'dateProp', 'Show by', (p) => p.type === 'date')));
      if (v.type === 'timeline') tools.append(tbtn(['Day', 'Week', 'Month'][v.zoom == null ? 1 : v.zoom], '', 0, (a) => BP.menu(a, [['Day', 0], ['Week', 1], ['Month', 2]].map(([n, z]) => ({ label: n + ' scale', check: (v.zoom == null ? 1 : v.zoom) === z, onClick: () => { v.zoom = z; commit(); redraw(); } })))));
      if (v.type === 'chart') tools.append(tbtn('Chart settings', '', 0, (a) => chartSettings(a, v)));
      if (v.type === 'form') tools.append(tbtn('Form fields', '', 0, (a) => formFields(a, v)));
      if (v.type === 'map') tools.append(tbtn('Place', '', 0, (a) => groupPop(a, v, 'placeProp', 'Show places from', (p) => p.type === 'place')));
      if (v.type === 'dashboard') tools.append(tbtn('Add widget', BP.icons.plus, 0, (a) => addWidget(a, v)));
      tools.append(h('button', { class: 'icon-btn', title: 'Database options', html: BP.icons.more, onclick: (e) => dbMenu(e.currentTarget, v) }));
      const dflt = (db.templates || []).find((t) => t.default);
      tools.append(h('div', { class: 'split' },
        h('button', { class: 'btn primary small', onclick: () => newRow(v, null, dflt) }, 'New'),
        h('button', { class: 'btn primary small caret', title: 'New from a template', html: BP.icons.chevron, onclick: (e) => templateMenu(e.currentTarget, v) })));
      wrap.append(h('div', { class: 'db-bar' }, tabs, tools));
      const body = h('div', { class: 'db-body db-' + v.type });
      wrap.append(body);
      box.append(wrap);
      const rows = BP.viewRows(db, v, st.search);
      ({ table: tableView, board: boardView, list: listView, gallery: galleryView, calendar: calendarView, timeline: timelineView, chart: chartView, form: formView, map: mapView, dashboard: dashboardView }[v.type] || tableView)(body, v, rows);
    }

    /* ----- grouping, calculations ----- */
    function groupKey(r, p) {
      const val = BP.propVal(r, p);
      if (['select', 'status'].includes(p.type)) return val || '';
      if (p.type === 'multi_select' || p.type === 'people') return (val || [])[0] || '';
      if (p.type === 'checkbox') return val ? 'true' : 'false';
      if (p.type === 'date') return BP.dateParts(val).s.slice(0, 7);
      if (p.type === 'relation') return ((val || [])[0]) || '';
      return val == null ? '' : String(val);
    }
    function groupLabel(p0, key) {
      const p = p0.type === 'people' ? peopleProp(p0) : p0;
      if (['select', 'status', 'multi_select'].includes(p.type)) return key ? chip(p, key) : h('span', { class: 'muted' }, 'No ' + p.name);
      if (p.type === 'checkbox') return h('span', null, key === 'true' ? '☑ Checked' : '☐ Unchecked');
      if (p.type === 'date') return h('span', null, key ? new Date(key + '-01T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : 'No date');
      if (p.type === 'relation') return h('span', null, key ? (BP.page(key) || {}).title || 'Untitled' : 'None');
      return h('span', null, key || 'Empty');
    }
    function makeGroups(v, rows) {
      const gp = v.group && db.props.find((p) => p.id === v.group);
      if (!gp) return [{ key: '*', label: null, rows }];
      const map = new Map();
      rows.forEach((r) => { const k = groupKey(r, gp); (map.get(k) || map.set(k, []).get(k)).push(r); });
      let keys = [...map.keys()];
      if (['select', 'status'].includes(gp.type)) { const order = (gp.options || []).map((o) => o.id); keys.sort((a, b) => (a === '' ? 1 : b === '' ? -1 : order.indexOf(a) - order.indexOf(b))); }
      else if (gp.type === 'relation') keys.sort((a, b) => (a === '' ? 1 : b === '' ? -1 : ((BP.page(a) || {}).title || '').localeCompare((BP.page(b) || {}).title || '')));
      else keys.sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, undefined, { numeric: true })));
      return keys.map((k) => ({ key: k, label: groupLabel(gp, k), rows: map.get(k) }));
    }
    function calcValue(fn, p, rows) {
      const vals = rows.map((r) => BP.displayValue(r, p));
      const flat = vals.flat();
      const filled = flat.filter((x) => x !== '' && x != null && x !== false);
      const nums = flat.map((x) => (typeof x === 'number' ? x : parseFloat(x))).filter((x) => !isNaN(x));
      const r2 = (x) => +x.toFixed(4);
      switch (fn) {
        case 'count': return rows.length;
        case 'count_values': return filled.length;
        case 'empty': return rows.length - vals.filter((x) => !(x === '' || x == null || x === false || (Array.isArray(x) && !x.length))).length;
        case 'percent_empty': return rows.length ? Math.round(((rows.length - vals.filter((x) => !(x === '' || x == null || x === false || (Array.isArray(x) && !x.length))).length) / rows.length) * 100) + '%' : '0%';
        case 'unique': return new Set(filled.map(String)).size;
        case 'sum': return r2(nums.reduce((a, b) => a + b, 0));
        case 'average': return nums.length ? r2(nums.reduce((a, b) => a + b, 0) / nums.length) : '';
        case 'min': return nums.length ? Math.min(...nums) : '';
        case 'max': return nums.length ? Math.max(...nums) : '';
        case 'range': return nums.length ? r2(Math.max(...nums) - Math.min(...nums)) : '';
        default: return '';
      }
    }
    BP.calcValue = calcValue;
    function dbMenu(anchor, v) {
      BP.menu(anchor, [
        { label: 'Export as CSV', icon: BP.icons.share, onClick: () => BP.download(BP.safeName(db.title || 'database') + '.csv', BP.dbToCsv(db, v), 'text/csv') },
        { label: 'Import CSV rows…', icon: BP.icons.plus, onClick: () => { const i = h('input', { type: 'file', accept: '.csv,.tsv,.txt' }); i.onchange = async () => { if (!i.files[0]) return; try { const r = BP.importCsv(await i.files[0].text(), db); BP.toast('Imported ' + r.added + ' rows'); redraw(); } catch (e) { BP.toast('Import failed: ' + e.message); } }; i.click(); } },
        { divider: true },
        { label: 'Copy view as Markdown table', icon: BP.icons.copy, onClick: () => { navigator.clipboard.writeText(BP.dbToMd(db)); BP.toast('Copied'); } },
      ]);
    }

    function newRow(v, extra, tpl) {
      const values = {};
      (v.filters || []).forEach((f) => { if (!f.group && f.op === 'is' && f.value) { const p = db.props.find((x) => x.id === f.propId); if (p && ['select', 'status'].includes(p.type)) values[p.id] = f.value; } });
      const today = BP.isoDay(new Date());
      const fromTpl = tpl ? JSON.parse(JSON.stringify(tpl.values || {})) : {};
      Object.keys(fromTpl).forEach((k) => { if (fromTpl[k] === '$today') fromTpl[k] = today; });
      const r = BP.addRow(db.id, tpl ? String(tpl.title || '').replace(/\{date\}/g, today) : '', Object.assign(fromTpl, values, extra || {}));
      if (tpl && tpl.body) r.blocks = BP.mdToBlocks(tpl.body.replace(/\{date\}/g, today)).concat(BP.newBlock('p'));
      BP.save();
      redraw();
      setTimeout(() => { const i = box.querySelector(`[data-row="${r.id}"] .cell-in.title`); i && i.focus(); }, 30);
    }
    /* row templates: default values + a starting body for new rows */
    function templateMenu(anchor, v) {
      const ts = db.templates || [];
      BP.menu(anchor, [{ header: 'NEW ROW' }, { label: 'Empty', icon: '＋', onClick: () => newRow(v) }]
        .concat(ts.map((t) => ({ label: t.name + (t.default ? ' (default)' : ''), icon: '▤', onClick: () => newRow(v, null, t) })))
        .concat([{ divider: true }, { label: 'New template…', icon: BP.icons.template, onClick: () => templateEditor(null) }])
        .concat(ts.length ? [{ label: 'Edit templates', icon: '✎', submenu: ts.map((t) => ({ label: t.name, onClick: () => templateEditor(t) })) }] : []));
    }
    function templateEditor(t) {
      const isNew = !t;
      t = t || { id: uid(), name: 'Template', title: '', values: {}, body: '', default: false };
      BP.modal(isNew ? 'New row template' : 'Edit template', (body, close) => {
        const name = h('input', { class: 'input', value: t.name });
        const title = h('input', { class: 'input', value: t.title, placeholder: 'Default row title (supports {date})' });
        const pseudo = { values: JSON.parse(JSON.stringify(t.values || {})), title: '', created: Date.now(), updated: Date.now(), rowOf: db.id };
        const props = h('div', { class: 'rowprops' });
        const drawProps = () => { props.innerHTML = ''; db.props.filter((p) => !BP.COMPUTED.includes(p.type) && p.type !== 'title' && p.type !== 'relation' && p.type !== 'files').forEach((p) => { const cellEl = h('div', { class: 'rp-cell' }); BP.cellEditor(db, p, pseudo, cellEl, null); props.append(h('div', { class: 'rp-row' }, h('div', { class: 'rp-name' }, h('span', { class: 'th-ico' }, TICO[p.type]), p.name), cellEl)); }); };
        drawProps();
        const md = h('textarea', { class: 'input mono', rows: '5', placeholder: 'Starting content (Markdown)' });
        md.value = t.body || '';
        const dflt = h('input', { type: 'checkbox', checked: t.default ? '' : null });
        body.append(h('label', { class: 'muted' }, 'Template name'), name, h('label', { class: 'muted' }, 'Row title'), title, h('label', { class: 'muted' }, 'Default property values'), props, h('label', { class: 'muted' }, 'Body'), md, h('label', { class: 'chk' }, dflt, ' Use this template when pressing New'),
          h('div', { class: 'row-end' }, !isNew ? h('button', { class: 'btn danger', onclick: () => { db.templates = (db.templates || []).filter((x) => x.id !== t.id); commit(); close(); redraw(); } }, 'Delete') : null, h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => {
            t.name = name.value || 'Template'; t.title = title.value; t.values = pseudo.values; t.body = md.value; t.default = dflt.checked;
            db.templates = db.templates || [];
            if (t.default) db.templates.forEach((x) => { if (x.id !== t.id) x.default = false; });
            if (isNew) db.templates.push(t);
            commit(); close(); redraw();
          } }, 'Save')));
      }, { class: 'wide' });
    }

    /* ----- views ----- */
    function tableView(body, v, rows) {
      const props = vProps(v);
      const tbl = h('table', { class: 'dbt' });
      const hr = h('tr');
      props.forEach((p) => {
        const th = h('th', { style: { width: (p.w || 160) + 'px', minWidth: (p.w || 160) + 'px' } },
          h('div', { class: 'th-in', onclick: (e) => colMenu(e.currentTarget, p, v) }, h('span', { class: 'th-ico' }, TICO[p.type] || ''), h('span', { class: 'th-name' }, p.name), sortArrow(v, p)),
          h('div', { class: 'th-resize', onmousedown: (e) => {
            e.preventDefault(); e.stopPropagation();
            const x0 = e.clientX, w0 = p.w || 160;
            const mv = (ev) => { p.w = Math.max(70, w0 + ev.clientX - x0); th.style.width = th.style.minWidth = p.w + 'px'; };
            const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); commit(); };
            addEventListener('mousemove', mv); addEventListener('mouseup', up);
          } }));
        hr.append(th);
      });
      hr.append(h('th', { class: 'th-add' }, h('button', { class: 'icon-btn', title: 'Add a property', html: BP.icons.plus, onclick: (e) => addPropMenu(e.currentTarget) })));
      tbl.append(h('thead', null, hr));
      const tb = h('tbody');
      const collapsed = (st.collapsed = st.collapsed || {});
      makeGroups(v, rows).forEach((g) => {
        if (g.label) {
          const open = !collapsed[v.id + g.key];
          tb.append(h('tr', { class: 'grp-row' }, h('td', { colspan: props.length + 1, onclick: () => { collapsed[v.id + g.key] = open; redraw(); } }, h('span', { class: 'sb-twirl' + (open ? ' open' : ''), html: BP.icons.chevron }), g.label, h('span', { class: 'muted grp-n' }, g.rows.length))));
          if (!open) return;
        }
        g.rows.forEach((r) => {
          const tr = h('tr', { 'data-row': r.id });
          props.forEach((p) => {
            const td = h('td', { class: 'ty-' + p.type });
            BP.cellEditor(db, p, r, td, redraw);
            if (p.type === 'title') td.append(h('button', { class: 'open-btn', title: 'Open page', onclick: () => BP.open(r.id) }, 'OPEN'));
            tr.append(td);
          });
          tr.append(h('td', { class: 'row-act' }, h('button', { class: 'icon-btn', title: 'Row options', html: BP.icons.more, onclick: (e) => rowMenu(e.currentTarget, r) })));
          tb.append(tr);
        });
      });
      tbl.append(tb);
      // calculation footer
      const calc = (v.calc = v.calc || {});
      const tf = h('tr', { class: 'foot' });
      props.forEach((p) => {
        const fn = calc[p.id] || 'none';
        const td = h('td', { class: 'calc' + (fn === 'none' ? ' idle' : '') }, h('button', { class: 'calc-btn', title: 'Calculate', onclick: (e) => BP.menu(e.currentTarget, CALCS.map(([k, n]) => ({ label: n, check: fn === k, onClick: () => { calc[p.id] = k; commit(); redraw(); } }))) }, fn === 'none' ? 'Calculate' : [h('span', { class: 'muted' }, (CALCS.find((c) => c[0] === fn) || [0, ''])[1] + ' '), h('b', null, String(calcValue(fn, p, rows)))]));
        tf.append(td);
      });
      tf.append(h('td'));
      tbl.append(h('tfoot', null, tf));
      body.append(h('div', { class: 'dbt-scroll' }, tbl));
      body.append(h('div', { class: 'db-new', onclick: () => newRow(v) }, h('span', { html: BP.icons.plus }), ' New'), h('div', { class: 'muted db-count' }, rows.length + (rows.length === 1 ? ' row' : ' rows')));
    }
    function sortArrow(v, p) {
      const s = (v.sorts || []).find((x) => x.propId === p.id);
      return s ? h('span', { class: 'th-sort' }, s.dir === 'desc' ? '↓' : '↑') : null;
    }
    function titleOf(r) { return r.title || 'Untitled'; }
    function propChips(r, v, skip) {
      const out = h('div', { class: 'card-props' });
      vProps(v).filter((p) => p.type !== 'title' && p.id !== skip).forEach((p) => {
        const val = BP.propVal(r, p);
        if (val == null || val === '' || (Array.isArray(val) && !val.length) || val === false) return;
        if (p.type === 'select' || p.type === 'status') out.append(chip(p, val));
        else if (p.type === 'multi_select') val.forEach((id) => out.append(chip(p, id)));
        else if (p.type === 'date') { const d = BP.dateParts(val); out.append(h('span', { class: 'meta' }, '📅 ' + BP.fmtDay(d.s) + (d.e ? ' → ' + BP.fmtDay(d.e) : ''))); }
        else if (p.type === 'checkbox') out.append(h('span', { class: 'meta' }, '☑'));
        else if (p.type === 'created_time' || p.type === 'last_edited_time') out.append(h('span', { class: 'meta' }, BP.fmtDate(val)));
        else if (p.type === 'relation') val.forEach((id) => { const rr = BP.page(id); rr && out.append(h('span', { class: 'chip opt-blue' }, '↗ ' + (rr.title || 'Untitled'))); });
        else if (p.type === 'unique_id') out.append(h('span', { class: 'meta' }, BP.displayValue(r, p)));
        else out.append(h('span', { class: 'meta' }, BP.fmtComputed(val)));
      });
      return out;
    }
    function boardView(body, v, rows) {
      const gp = db.props.find((p) => p.id === v.groupBy && ['select', 'status'].includes(p.type)) || db.props.find((p) => ['select', 'status'].includes(p.type));
      if (!gp) return body.append(h('div', { class: 'empty pad' }, 'Add a Select or Status property to group this board.'));
      const cols = (gp.options || []).map((o) => ({ id: o.id, name: o.name, color: o.color })).concat([{ id: null, name: 'No ' + gp.name, color: 'gray' }]);
      const board = h('div', { class: 'board' });
      cols.forEach((c) => {
        const items = rows.filter((r) => (BP.propVal(r, gp) || null) === c.id);
        if (c.id === null && !items.length) return;
        const col = h('div', { class: 'bcol', 'data-opt': c.id || '' });
        col.append(h('div', { class: 'bcol-head' }, h('span', { class: 'chip opt-' + c.color }, c.name), h('span', { class: 'muted' }, items.length)));
        const list = h('div', { class: 'bcol-list' });
        items.forEach((r) => {
          const card = h('div', { class: 'card', draggable: 'true', 'data-row': r.id, onclick: () => BP.open(r.id) },
            h('div', { class: 'card-title' }, titleOf(r)), propChips(r, v, gp.id));
          card.addEventListener('dragstart', (e) => { st.drag = r.id; e.dataTransfer.setData('text/plain', 'bp-card'); card.classList.add('dragging'); });
          card.addEventListener('dragend', () => { st.drag = null; card.classList.remove('dragging'); });
          list.append(card);
        });
        col.append(list, h('div', { class: 'db-new', onclick: () => newRow(v, c.id ? { [gp.id]: c.id } : {}) }, h('span', { html: BP.icons.plus }), ' New'));
        col.addEventListener('dragover', (e) => { if (st.drag) { e.preventDefault(); col.classList.add('over'); } });
        col.addEventListener('dragleave', () => col.classList.remove('over'));
        col.addEventListener('drop', (e) => {
          e.preventDefault(); col.classList.remove('over');
          const r = BP.page(st.drag); if (!r) return;
          BP.setProp(r, gp, c.id); redraw();
        });
        board.append(col);
      });
      body.append(board);
    }
    function listView(body, v, rows) {
      const list = h('div', { class: 'dblist' });
      const collapsed = (st.collapsed = st.collapsed || {});
      makeGroups(v, rows).forEach((g) => {
        if (g.label) {
          const open = !collapsed[v.id + g.key];
          list.append(h('div', { class: 'grp-head', onclick: () => { collapsed[v.id + g.key] = open; redraw(); } }, h('span', { class: 'sb-twirl' + (open ? ' open' : ''), html: BP.icons.chevron }), g.label, h('span', { class: 'muted grp-n' }, g.rows.length)));
          if (!open) return;
        }
        g.rows.forEach((r) => list.append(h('div', { class: 'lrow', 'data-row': r.id, onclick: () => BP.open(r.id) }, h('span', { class: 'lico' }, r.icon || '📄'), h('span', { class: 'ltitle' }, titleOf(r)), propChips(r, v), h('button', { class: 'icon-btn', html: BP.icons.more, onclick: (e) => { e.stopPropagation(); rowMenu(e.currentTarget, r); } }))));
      });
      if (!rows.length) list.append(h('div', { class: 'empty pad' }, 'No rows'));
      list.append(h('div', { class: 'db-new', onclick: () => newRow(v) }, h('span', { html: BP.icons.plus }), ' New'));
      body.append(list);
    }
    function galleryView(body, v, rows) {
      const g = h('div', { class: 'gallery' });
      rows.forEach((r) => {
        const first = (r.blocks || []).find((b) => BP.rich(b.type) && BP.textOf(b.text).trim());
        const img = (r.blocks || []).find((b) => b.type === 'image' && b.src);
        g.append(h('div', { class: 'gcard', 'data-row': r.id, onclick: () => BP.open(r.id) },
          h('div', { class: 'gcover' + (r.cover && String(r.cover).startsWith('g:') ? ' cv-' + r.cover.slice(2) : '') }, img ? h('img', { src: img.src, draggable: 'false' }) : first ? h('p', null, BP.textOf(first.text).slice(0, 140)) : null),
          h('div', { class: 'gbody' }, h('div', { class: 'card-title' }, (r.icon ? r.icon + ' ' : '') + titleOf(r)), propChips(r, v))));
      });
      g.append(h('div', { class: 'gcard new', onclick: () => newRow(v) }, h('span', { html: BP.icons.plus }), ' New'));
      body.append(g);
    }
    function calendarView(body, v, rows) {
      const dp = db.props.find((p) => p.id === v.dateProp && p.type === 'date') || db.props.find((p) => p.type === 'date');
      if (!dp) return body.append(h('div', { class: 'empty pad' }, 'Add a Date property to use the calendar.'));
      const today = new Date();
      if (!st.month) st.month = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
      const m = new Date(st.month);
      const first = new Date(m.getFullYear(), m.getMonth(), 1);
      const start = new Date(first); start.setDate(1 - first.getDay());
      const fmt = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const nav = h('div', { class: 'cal-nav' },
        h('b', null, m.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })),
        h('button', { class: 'icon-btn', html: BP.icons.back, onclick: () => { st.month = new Date(m.getFullYear(), m.getMonth() - 1, 1).getTime(); redraw(); } }),
        h('button', { class: 'btn small', onclick: () => { st.month = null; redraw(); } }, 'Today'),
        h('button', { class: 'icon-btn', html: BP.icons.fwd, onclick: () => { st.month = new Date(m.getFullYear(), m.getMonth() + 1, 1).getTime(); redraw(); } }));
      const grid = h('div', { class: 'cal' });
      ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((d) => grid.append(h('div', { class: 'cal-dow' }, d)));
      const weeks = Math.ceil((first.getDay() + new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate()) / 7);
      for (let i = 0; i < weeks * 7; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i);
        const key = fmt(d);
        const cell = h('div', { class: 'cal-day' + (d.getMonth() !== m.getMonth() ? ' other' : '') + (key === fmt(today) ? ' today' : '') });
        cell.append(h('div', { class: 'cal-num' }, d.getDate(), h('button', { class: 'cal-add', title: 'New on this day', onclick: (e) => { e.stopPropagation(); newRow(v, { [dp.id]: key }); } }, '+')));
        rows.filter((r) => { const d = BP.dateParts(BP.propVal(r, dp)); return d.s && (d.e ? d.s <= key && key <= d.e : d.s === key); }).forEach((r) => { const d = BP.dateParts(BP.propVal(r, dp)); cell.append(h('div', { class: 'cal-chip' + (d.e ? ' span' : ''), 'data-row': r.id, onclick: () => BP.open(r.id), title: titleOf(r) }, titleOf(r))); });
        grid.append(cell);
      }
      const undated = rows.filter((r) => !BP.dateParts(BP.propVal(r, dp)).s);
      body.append(nav, grid);
      if (undated.length) body.append(h('div', { class: 'muted pad-s' }, 'No date: ' + undated.map(titleOf).join(', ')));
    }

    function timelineView(body, v, rows) {
      const dp = db.props.find((p) => p.id === v.dateProp && p.type === 'date') || db.props.find((p) => p.type === 'date');
      if (!dp) return body.append(h('div', { class: 'empty pad' }, 'Add a Date property to use the timeline.'));
      const zoom = v.zoom == null ? 1 : v.zoom;
      const ppd = [46, 20, 6][zoom];
      const dated = rows.map((r) => { const d = BP.dateParts(BP.propVal(r, dp)); return d.s ? { r, s: d.s, e: d.e && d.e >= d.s ? d.e : d.s } : null; }).filter(Boolean).sort((a, b) => a.s.localeCompare(b.s));
      const undated = rows.filter((r) => !BP.dateParts(BP.propVal(r, dp)).s);
      const T = (s) => new Date(s + 'T00:00:00');
      const dayN = (a, b) => Math.round((T(b) - T(a)) / 864e5);
      const today = BP.isoDay(new Date());
      let lo = dated.length ? dated[0].s : today, hi = dated.length ? dated.reduce((m, x) => (x.e > m ? x.e : m), dated[0].e) : today;
      if (today < lo) lo = today; if (today > hi) hi = today;
      const addD = (s, n) => { const d = T(s); d.setDate(d.getDate() + n); return BP.isoDay(d); };
      lo = addD(lo, -4); hi = addD(hi, 10);
      const days = dayN(lo, hi) + 1, labelW = 190;
      const colorProp = db.props.find((p) => p.type === 'status') || db.props.find((p) => p.type === 'select');
      const inner = h('div', { class: 'tl-inner', style: { width: labelW + days * ppd + 'px' } });
      const head = h('div', { class: 'tl-head' }, h('div', { class: 'tl-label' }));
      const ticks = h('div', { class: 'tl-ticks', style: { width: days * ppd + 'px' } });
      for (let i = 0; i < days; i++) {
        const d = T(addD(lo, i));
        const first = d.getDate() === 1, monday = d.getDay() === 1;
        let txt = '';
        if (zoom === 0) txt = (first ? d.toLocaleDateString(undefined, { month: 'short' }) + ' ' : '') + d.getDate();
        else if (zoom === 1 && (monday || i === 0)) txt = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        else if (zoom === 2 && (first || i === 0)) txt = d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
        if (txt) ticks.append(h('span', { class: 'tl-tick', style: { left: i * ppd + 'px' } }, txt));
        if (d.getDay() === 0 || d.getDay() === 6) ticks.append(h('i', { class: 'tl-wk', style: { left: i * ppd + 'px', width: ppd + 'px' } }));
      }
      head.append(ticks);
      inner.append(head);
      const tix = dayN(lo, today) * ppd;
      dated.forEach(({ r, s, e }) => {
        const left = dayN(lo, s) * ppd, w = (dayN(s, e) + 1) * ppd;
        const o = colorProp && BP.optById(colorProp, BP.propVal(r, colorProp));
        const bar = h('div', { class: 'tl-bar opt-' + (o ? o.color : 'blue') + (w < 70 ? ' tiny' : ''), style: { left: left + 'px', width: Math.max(w, 10) + 'px' }, title: titleOf(r) + ' · ' + BP.fmtDay(s) + (e !== s ? ' → ' + BP.fmtDay(e) : '') },
          h('span', { class: 'tl-bt' }, titleOf(r)), h('i', { class: 'tl-rs' }));
        const store = (ns, ne) => { BP.setProp(r, dp, BP.dateJoin(ns, ne)); };
        bar.addEventListener('mousedown', (ev) => {
          if (ev.button !== 0) return;
          ev.preventDefault();
          const resizing = ev.target.classList.contains('tl-rs');
          const x0 = ev.clientX; let moved = false, ns = s, ne = e;
          const mv = (m) => {
            const dd = Math.round((m.clientX - x0) / ppd);
            if (dd) moved = true;
            if (resizing) { ne = addD(e, dd) < s ? s : addD(e, dd); bar.style.width = Math.max((dayN(s, ne) + 1) * ppd, 10) + 'px'; }
            else { ns = addD(s, dd); ne = addD(e, dd); bar.style.left = dayN(lo, ns) * ppd + 'px'; }
          };
          const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); if (moved) { store(ns, ne); redraw(); } else if (!resizing) BP.open(r.id); };
          addEventListener('mousemove', mv); addEventListener('mouseup', up);
        });
        inner.append(h('div', { class: 'tl-row' }, h('div', { class: 'tl-label', onclick: () => BP.open(r.id), title: titleOf(r) }, titleOf(r)), h('div', { class: 'tl-track', style: { width: days * ppd + 'px' } }, bar)));
      });
      const line = h('div', { class: 'tl-today', style: { left: labelW + tix + ppd / 2 + 'px' } });
      inner.append(line);
      const scroll = h('div', { class: 'tl-scroll' }, inner);
      body.append(scroll);
      requestAnimationFrame(() => { scroll.scrollLeft = Math.max(0, tix - 120); });
      if (!dated.length) body.append(h('div', { class: 'empty pad' }, 'No rows have a date yet. Set a date (and an end date) to see bars. Drag a bar to move it; drag its right edge to resize.'));
      if (undated.length) body.append(h('div', { class: 'muted pad-s' }, 'No date: ' + undated.map(titleOf).join(', ')));
    }
    function chartView(body, v, rows) { drawChart(body, rows, (v.chart = v.chart || {})); }
    function drawChart(body, rows, cfg) {
      const xp0 = db.props.find((p) => p.id === cfg.x) || db.props.find((p) => ['status', 'select'].includes(p.type)) || db.props.find((p) => p.type === 'multi_select') || db.props[0];
      const xp = xp0.type === 'people' ? peopleProp(xp0) : xp0;
      const yp = cfg.y && cfg.y !== 'count' ? db.props.find((p) => p.id === cfg.y) : null;
      const fn = cfg.fn || 'sum';
      const type = cfg.type || 'bar';
      const gmap = new Map();
      rows.forEach((r) => {
        const keys = xp.type === 'multi_select' ? ((BP.propVal(r, xp) || []).length ? BP.propVal(r, xp) : ['']) : [groupKey(r, xp)];
        keys.forEach((k) => (gmap.get(k) || gmap.set(k, []).get(k)).push(r));
      });
      let keys = [...gmap.keys()];
      if (['select', 'status', 'multi_select'].includes(xp.type)) { const order = (xp.options || []).map((o) => o.id); keys.sort((a, b) => (a === '' ? 1 : b === '' ? -1 : order.indexOf(a) - order.indexOf(b))); }
      else keys.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      const labelOf = (k) => (['select', 'status', 'multi_select'].includes(xp.type) ? (BP.optById(xp, k) || {}).name || 'None' : xp.type === 'date' ? k || 'No date' : xp.type === 'checkbox' ? (k === 'true' ? 'Checked' : 'Unchecked') : xp.type === 'relation' ? (k ? (BP.page(k) || {}).title || '?' : 'None') : k || 'Empty');
      const colorOf = (k, i) => { const o = ['select', 'status', 'multi_select'].includes(xp.type) ? BP.optById(xp, k) : null; return 'var(--t-' + (o ? o.color : BP.COLORS[(i * 2 + 5) % 9]) + ')'; };
      const data = keys.map((k, i) => {
        const rs = gmap.get(k);
        const val = yp ? calcValue(fn === 'average' ? 'average' : fn === 'max' ? 'max' : fn === 'min' ? 'min' : 'sum', yp, rs) : rs.length;
        return { k, label: labelOf(k), val: typeof val === 'number' ? val : parseFloat(val) || 0, color: colorOf(k, i) };
      });
      const box2 = h('div', { class: 'chart' });
      body.append(box2);
      if (!data.length || data.every((d) => !d.val)) return box2.append(h('div', { class: 'empty pad' }, 'Nothing to chart yet. Add rows, or change Chart settings.'));
      const NS = 'http://www.w3.org/2000/svg';
      const el = (n, a, txt) => { const e = document.createElementNS(NS, n); for (const k in a || {}) e.setAttribute(k, a[k]); if (txt != null) e.textContent = txt; return e; };
      const W = 720, H = 300, m = { l: 48, r: 16, t: 16, b: 44 };
      const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img' });
      const max = Math.max(...data.map((d) => d.val), 1);
      const nice = (mx) => { const p = Math.pow(10, Math.floor(Math.log10(mx))); const f = mx / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
      const top = nice(max);
      const fmt = (n) => (Number.isInteger(n) ? String(n) : String(+n.toFixed(2)));
      if (type === 'donut') {
        const total = data.reduce((a, d) => a + d.val, 0), cx = 170, cy = 150, R = 120, r0 = 70;
        let a0 = -Math.PI / 2;
        data.filter((d) => d.val > 0).forEach((d) => {
          const a1 = a0 + (d.val / total) * Math.PI * 2 - 0.0001;
          const pt = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
          const [x0, y0] = pt(R, a0), [x1, y1] = pt(R, a1), [x2, y2] = pt(r0, a1), [x3, y3] = pt(r0, a0);
          const big = a1 - a0 > Math.PI ? 1 : 0;
          const path = el('path', { d: `M${x0} ${y0} A${R} ${R} 0 ${big} 1 ${x1} ${y1} L${x2} ${y2} A${r0} ${r0} 0 ${big} 0 ${x3} ${y3}Z`, fill: d.color });
          path.append(el('title', {}, d.label + ': ' + fmt(d.val)));
          svg.append(path);
          a0 = a1 + 0.0001;
        });
        svg.append(el('text', { x: cx, y: cy - 2, 'text-anchor': 'middle', class: 'chart-big' }, fmt(total)), el('text', { x: cx, y: cy + 18, 'text-anchor': 'middle', class: 'chart-sub' }, yp ? yp.name : 'rows'));
        data.forEach((d, i) => { const y = 40 + i * 24; svg.append(el('rect', { x: 340, y: y - 10, width: 12, height: 12, rx: 3, fill: d.color }), el('text', { x: 360, y, class: 'chart-lbl' }, d.label.slice(0, 28) + ' — ' + fmt(d.val) + ' (' + Math.round((d.val / total) * 100) + '%)')); });
      } else if (type === 'hbar') {
        const ml = 130, bh = Math.min(30, (H - m.t - 24) / data.length - 6);
        data.forEach((d, i) => {
          const y = m.t + i * (bh + 8), w = ((W - ml - 60) * d.val) / top;
          svg.append(el('text', { x: ml - 8, y: y + bh / 2 + 4, 'text-anchor': 'end', class: 'chart-lbl' }, d.label.slice(0, 18)));
          const rc = el('rect', { x: ml, y, width: Math.max(w, 1), height: bh, rx: 4, fill: d.color }); rc.append(el('title', {}, d.label + ': ' + fmt(d.val))); svg.append(rc);
          svg.append(el('text', { x: ml + w + 6, y: y + bh / 2 + 4, class: 'chart-val' }, fmt(d.val)));
        });
      } else {
        const pw = W - m.l - m.r, ph = H - m.t - m.b;
        for (let i = 0; i <= 4; i++) { const y = m.t + ph - (ph * i) / 4; svg.append(el('line', { x1: m.l, x2: W - m.r, y1: y, y2: y, class: 'chart-grid' }), el('text', { x: m.l - 8, y: y + 4, 'text-anchor': 'end', class: 'chart-lbl' }, fmt((top * i) / 4))); }
        const step = pw / data.length;
        if (type === 'line') {
          const pts = data.map((d, i) => [m.l + step * i + step / 2, m.t + ph - (ph * d.val) / top]);
          svg.append(el('polyline', { points: pts.map((p) => p.join(',')).join(' '), fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
          pts.forEach((p, i) => { const c = el('circle', { cx: p[0], cy: p[1], r: 4.5, fill: 'var(--accent)' }); c.append(el('title', {}, data[i].label + ': ' + fmt(data[i].val))); svg.append(c, el('text', { x: p[0], y: p[1] - 10, 'text-anchor': 'middle', class: 'chart-val' }, fmt(data[i].val))); });
        } else {
          data.forEach((d, i) => {
            const bw = Math.min(64, step * 0.62), x = m.l + step * i + (step - bw) / 2, h2 = (ph * d.val) / top;
            const rc = el('rect', { x, y: m.t + ph - h2, width: bw, height: Math.max(h2, 1), rx: 4, fill: d.color }); rc.append(el('title', {}, d.label + ': ' + fmt(d.val))); svg.append(rc);
            svg.append(el('text', { x: x + bw / 2, y: m.t + ph - h2 - 6, 'text-anchor': 'middle', class: 'chart-val' }, fmt(d.val)));
          });
        }
        data.forEach((d, i) => svg.append(el('text', { x: m.l + step * i + step / 2, y: H - 20, 'text-anchor': 'middle', class: 'chart-lbl' }, d.label.length > 14 ? d.label.slice(0, 13) + '…' : d.label)));
        svg.append(el('line', { x1: m.l, x2: W - m.r, y1: m.t + ph, y2: m.t + ph, class: 'chart-axis' }));
      }
      box2.append(h('div', { class: 'muted small chart-cap' }, (yp ? fn[0].toUpperCase() + fn.slice(1) + ' of ' + yp.name : 'Row count') + ' by ' + xp.name), svg);
    }
    /* ----- form view: a form that adds rows ----- */
    const draft = { title: '', values: {}, rowOf: db.id, created: Date.now(), updated: Date.now() };
    function formView(body, v) {
      const f = (v.form = v.form || { title: 'Add a row', desc: '', hidden: [], required: [], button: 'Submit', msg: 'Thanks! Your response was added.' });
      const wrap = h('div', { class: 'form' });
      const ti = h('input', { class: 'form-title', value: f.title, placeholder: 'Form title' });
      ti.addEventListener('change', () => { f.title = ti.value; commit(); });
      const de = h('textarea', { class: 'form-desc', rows: '2', placeholder: 'Description (optional)' });
      de.value = f.desc || '';
      de.addEventListener('change', () => { f.desc = de.value; commit(); });
      wrap.append(ti, de);
      const errs = {};
      db.props.filter((p) => !(f.hidden || []).includes(p.id) && !['formula', 'rollup', 'unique_id', 'created_time', 'last_edited_time', 'created_by', 'last_edited_by', 'button', 'files'].includes(p.type)).forEach((p) => {
        const req = (f.required || []).includes(p.id);
        const cellEl = h('div', { class: 'form-cell' });
        BP.cellEditor(db, p, draft, cellEl, null);
        const err = h('div', { class: 'form-err' });
        errs[p.id] = err;
        wrap.append(h('div', { class: 'form-field' }, h('label', null, p.name, req ? h('span', { class: 'bad' }, ' *') : null), cellEl, err));
      });
      const msg = h('div', { class: 'form-ok', style: { display: 'none' } }, f.msg);
      const submit = h('button', { class: 'btn primary', onclick: () => {
        let bad = false;
        Object.values(errs).forEach((e) => (e.textContent = ''));
        (f.required || []).forEach((pid) => {
          const p = db.props.find((x) => x.id === pid);
          if (!p || (f.hidden || []).includes(pid)) return;
          const val = BP.propVal(draft, p);
          const empty = val == null || val === '' || (Array.isArray(val) && !val.length) || val === false;
          if (empty && errs[pid]) { errs[pid].textContent = 'Required'; bad = true; }
        });
        if (bad) return;
        BP.addRow(db.id, draft.title, JSON.parse(JSON.stringify(draft.values)));
        draft.title = ''; draft.values = {};
        BP.save();
        redraw();
        const m = box.querySelector('.form-ok'); if (m) { m.style.display = ''; setTimeout(() => m && (m.style.display = 'none'), 3500); }
      } }, f.button || 'Submit');
      wrap.append(submit, msg);
      body.append(wrap);
    }
    function formFields(anchor, v) {
      const f = (v.form = v.form || { title: 'Add a row', desc: '', hidden: [], required: [], button: 'Submit', msg: 'Thanks! Your response was added.' });
      BP.popover(anchor, (el) => {
        el.classList.add('menu');
        db.props.filter((p) => !['formula', 'rollup', 'unique_id', 'created_time', 'last_edited_time', 'created_by', 'last_edited_by', 'button', 'files'].includes(p.type)).forEach((p) => {
          const shown = !(f.hidden || []).includes(p.id), req = (f.required || []).includes(p.id);
          el.append(h('div', { class: 'menu-item' }, h('span', { class: 'mi-ico' }, TICO[p.type]), h('span', { class: 'mi-label' }, p.name),
            h('label', { class: 'chk small' }, h('input', { type: 'checkbox', checked: shown ? '' : null, onchange: (e) => { f.hidden = (f.hidden || []).filter((x) => x !== p.id); if (!e.target.checked) f.hidden.push(p.id); commit(); redraw(); } }), 'show'),
            h('label', { class: 'chk small' }, h('input', { type: 'checkbox', checked: req ? '' : null, onchange: (e) => { f.required = (f.required || []).filter((x) => x !== p.id); if (e.target.checked) f.required.push(p.id); commit(); redraw(); } }), 'required')));
        });
        const bt = h('input', { class: 'input small', value: f.button || 'Submit', title: 'Submit button label' });
        bt.addEventListener('change', () => { f.button = bt.value || 'Submit'; commit(); redraw(); });
        el.append(h('div', { class: 'menu-div' }), h('div', { class: 'menu-item' }, h('span', { class: 'mi-label' }, 'Button label'), bt));
      });
    }

    /* ----- map view: pins for rows with coordinates (tiles need internet; pins work offline) ----- */
    function mapView(body, v, rows) {
      const pp = db.props.find((p) => p.id === v.placeProp && p.type === 'place') || db.props.find((p) => p.type === 'place');
      if (!pp) return body.append(h('div', { class: 'empty pad' }, 'Add a Place property (📍) to use the map. Click the pin in a cell to enter coordinates.'));
      const pts = rows.map((r) => { const pv = BP.propVal(r, pp); return pv && pv.lat != null && pv.lng != null ? { r, lat: +pv.lat, lng: +pv.lng, text: pv.text } : null; }).filter(Boolean);
      const none = rows.filter((r) => { const pv = BP.propVal(r, pp); return !(pv && pv.lat != null && pv.lng != null); });
      const mx = (lng, z) => ((lng + 180) / 360) * Math.pow(2, z) * 256;
      const my = (lat, z) => { const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * Math.pow(2, z) * 256; };
      const W = 900, H = 460;
      const m = (st.map = st.map || null);
      if (!m) {
        let z = 2, lat = 20, lng = 0;
        if (pts.length) {
          const la = pts.map((p) => p.lat), lo = pts.map((p) => p.lng);
          lat = (Math.min(...la) + Math.max(...la)) / 2; lng = (Math.min(...lo) + Math.max(...lo)) / 2;
          z = 14;
          while (z > 1 && (Math.abs(mx(Math.max(...lo), z) - mx(Math.min(...lo), z)) > W * 0.7 || Math.abs(my(Math.max(...la), z) - my(Math.min(...la), z)) > H * 0.7)) z--;
        }
        st.map = { z, cx: mx(lng, z), cy: my(lat, z) };
      }
      const S = st.map;
      const view = h('div', { class: 'map', style: { height: H + 'px' } });
      const layer = h('div', { class: 'map-layer' });
      view.append(layer);
      const draw = () => {
        layer.innerHTML = '';
        const w = view.clientWidth || W, hh = H, n = Math.pow(2, S.z);
        const x0 = S.cx - w / 2, y0 = S.cy - hh / 2;
        for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + w) / 256); tx++) for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + hh) / 256); ty++) {
          if (ty < 0 || ty >= n) continue;
          const img = h('img', { class: 'map-tile', src: 'https://tile.openstreetmap.org/' + S.z + '/' + (((tx % n) + n) % n) + '/' + ty + '.png', draggable: 'false', alt: '' });
          img.style.left = tx * 256 - x0 + 'px'; img.style.top = ty * 256 - y0 + 'px';
          img.onerror = () => (img.style.visibility = 'hidden');
          layer.append(img);
        }
        pts.forEach((p) => {
          const pin = h('button', { class: 'map-pin', title: (p.r.title || 'Untitled') + (p.text ? ' · ' + p.text : ''), onmousedown: (e) => e.stopPropagation(), onclick: () => BP.open(p.r.id) }, h('span', null, '📍'), h('b', null, p.r.title || 'Untitled'));
          pin.style.left = mx(p.lng, S.z) - x0 + 'px'; pin.style.top = my(p.lat, S.z) - y0 + 'px';
          layer.append(pin);
        });
      };
      const zoom = (d) => { const nz = Math.max(1, Math.min(18, S.z + d)); if (nz === S.z) return; const k = Math.pow(2, nz - S.z); S.cx *= k; S.cy *= k; S.z = nz; draw(); };
      view.addEventListener('mousedown', (e) => { e.preventDefault(); const sx = e.clientX, sy = e.clientY, cx = S.cx, cy = S.cy; const mv = (ev) => { S.cx = cx - (ev.clientX - sx); S.cy = cy - (ev.clientY - sy); draw(); }; const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); }; addEventListener('mousemove', mv); addEventListener('mouseup', up); });
      view.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY < 0 ? 1 : -1); }, { passive: false });
      view.append(h('div', { class: 'map-ctl' }, h('button', { class: 'btn small', onclick: () => zoom(1) }, '+'), h('button', { class: 'btn small', onclick: () => zoom(-1) }, '−')),
        h('div', { class: 'map-attr' }, '© ', h('a', { href: 'https://www.openstreetmap.org/copyright', target: '_blank' }, 'OpenStreetMap'), ' contributors'));
      body.append(view);
      requestAnimationFrame(draw);
      if (!pts.length) body.append(h('div', { class: 'empty pad' }, 'No row has coordinates yet. In the Place column, click the pin icon and enter latitude and longitude.'));
      if (none.length && pts.length) body.append(h('div', { class: 'muted pad-s' }, 'No coordinates: ' + none.map(titleOf).join(', ')));
    }

    /* ----- dashboard view: stat tiles, charts and lists over this view's rows ----- */
    function addWidget(anchor, v) {
      const ws = (v.widgets = v.widgets || []);
      BP.menu(anchor, [{ header: 'ADD WIDGET' },
        { label: 'Number', icon: '#', onClick: () => { ws.push({ id: uid(), kind: 'stat', title: 'Total rows', prop: 'count', fn: 'count' }); commit(); redraw(); } },
        { label: 'Chart', icon: BP.icons.chart, onClick: () => { ws.push({ id: uid(), kind: 'chart', title: 'Chart', chart: {} }); commit(); redraw(); } },
        { label: 'Recent rows', icon: BP.icons.list, onClick: () => { ws.push({ id: uid(), kind: 'list', title: 'Recently edited', limit: 5 }); commit(); redraw(); } }]);
    }
    function dashboardView(body, v, rows) {
      const ws = (v.widgets = v.widgets || []);
      if (!ws.length) return body.append(h('div', { class: 'empty pad' }, 'Add widgets with “Add widget”: numbers, charts and lists built from this database.'));
      const grid = h('div', { class: 'dash' });
      ws.forEach((w, i) => {
        const card = h('div', { class: 'widget w-' + w.kind });
        const head = h('div', { class: 'w-head' }, h('input', { class: 'w-title', value: w.title || '', onchange: (e) => { w.title = e.target.value; commit(); } }),
          h('button', { class: 'icon-btn', html: BP.icons.more, onclick: (e) => BP.menu(e.currentTarget, [
            w.kind === 'chart' ? { label: 'Chart settings', icon: BP.icons.chart, onClick: () => chartSettings(e.currentTarget, w) } : null,
            w.kind === 'stat' ? { label: 'Choose calculation', icon: '#', onClick: () => statConfig(e.currentTarget, w) } : null,
            i > 0 ? { label: 'Move earlier', icon: '←', onClick: () => { ws.splice(i - 1, 0, ws.splice(i, 1)[0]); commit(); redraw(); } } : null,
            i < ws.length - 1 ? { label: 'Move later', icon: '→', onClick: () => { ws.splice(i + 1, 0, ws.splice(i, 1)[0]); commit(); redraw(); } } : null,
            { divider: true }, { label: 'Delete widget', icon: BP.icons.trash, danger: true, onClick: () => { ws.splice(i, 1); commit(); redraw(); } }]) }));
        const inner = h('div', { class: 'w-body' });
        card.append(head, inner);
        if (w.kind === 'stat') {
          const p = db.props.find((x) => x.id === w.prop);
          const val = w.fn === 'count' || !p ? rows.length : calcValue(w.fn, p, rows);
          inner.append(h('div', { class: 'stat-num' }, String(val === '' ? '—' : val)), h('div', { class: 'muted small' }, ((CALCS.find((c) => c[0] === w.fn) || [0, 'Count'])[1]) + (p && w.fn !== 'count' ? ' of ' + p.name : '')));
        } else if (w.kind === 'chart') drawChart(inner, rows, (w.chart = w.chart || {}));
        else {
          const list = rows.slice().sort((a, b) => b.updated - a.updated).slice(0, w.limit || 5);
          list.forEach((r) => inner.append(h('div', { class: 'lrow', onclick: () => BP.open(r.id) }, h('span', { class: 'lico' }, r.icon || '📄'), h('span', { class: 'ltitle' }, titleOf(r)), h('span', { class: 'muted small' }, BP.fmtDate(r.updated)))));
          if (!list.length) inner.append(h('div', { class: 'muted pad-s' }, 'No rows'));
        }
        grid.append(card);
      });
      body.append(grid);
    }
    function statConfig(anchor, w) {
      BP.popover(anchor, (el) => {
        el.classList.add('fpop');
        const fnSel = h('select', { class: 'input small' }, CALCS.filter((c) => c[0] !== 'none').map(([k, n]) => h('option', { value: k, selected: k === w.fn ? '' : null }, n)));
        const pSel = h('select', { class: 'input small' }, db.props.map((p) => h('option', { value: p.id, selected: p.id === w.prop ? '' : null }, p.name)));
        fnSel.onchange = () => { w.fn = fnSel.value; commit(); redraw(); };
        pSel.onchange = () => { w.prop = pSel.value; commit(); redraw(); };
        el.append(h('div', { class: 'f-row' }, h('span', { class: 'muted cfg-l' }, 'Calculate'), fnSel), h('div', { class: 'f-row' }, h('span', { class: 'muted cfg-l' }, 'Property'), pSel));
      });
    }
    function chartSettings(anchor, v) {
      const cfg = (v.chart = v.chart || {});
      BP.popover(anchor, (el) => {
        el.classList.add('fpop');
        const sel = (label, opts, cur, set) => { const s = h('select', { class: 'input small' }, opts.map(([k, n]) => h('option', { value: k, selected: k === cur ? '' : null }, n))); s.onchange = () => { set(s.value); commit(); redraw(); }; return h('div', { class: 'f-row' }, h('span', { class: 'muted cfg-l' }, label), s); };
        el.append(
          sel('Type', [['bar', 'Vertical bar'], ['hbar', 'Horizontal bar'], ['line', 'Line'], ['donut', 'Donut']], cfg.type || 'bar', (x) => (cfg.type = x)),
          sel('X axis', db.props.filter((p) => !['formula', 'rollup', 'created_time', 'last_edited_time', 'unique_id', 'text', 'url', 'email', 'phone', 'number'].includes(p.type)).map((p) => [p.id, p.name]), (cfg.x || (db.props.find((p) => ['status', 'select'].includes(p.type)) || db.props[0]).id), (x) => (cfg.x = x)),
          sel('Y axis', [['count', 'Count of rows']].concat(db.props.filter((p) => ['number', 'formula', 'rollup'].includes(p.type)).map((p) => [p.id, p.name])), cfg.y || 'count', (x) => (cfg.y = x)),
          sel('Aggregate', [['sum', 'Sum'], ['average', 'Average'], ['max', 'Max'], ['min', 'Min']], cfg.fn || 'sum', (x) => (cfg.fn = x))
        );
      });
    }

    /* ----- menus ----- */
    function rowMenu(anchor, r) {
      BP.menu(anchor, [
        { label: 'Open', icon: '↗', onClick: () => BP.open(r.id) },
        { label: 'Duplicate', icon: BP.icons.copy, onClick: () => { BP.clonePage(r.id, db.id); redraw(); } },
        { divider: true },
        { label: 'Delete', icon: BP.icons.trash, danger: true, onClick: () => { BP.trash(r.id); redraw(); BP.toast('Moved to trash'); } },
      ]);
    }
    function viewMenu(anchor, vw) {
      BP.menu(anchor, [
        { label: 'Rename', icon: '✎', onClick: async () => { const n = await BP.prompt('Rename view', vw.name); if (n) { vw.name = n; commit(); redraw(); } } },
        { label: 'Layout', icon: BP.icons.table, submenu: VIEWS.map(([t, n]) => ({ label: n, icon: BP.icons[t], check: vw.type === t, onClick: () => { vw.type = t; commit(); redraw(); } })) },
        { label: 'Duplicate', icon: BP.icons.copy, onClick: () => { const c = JSON.parse(JSON.stringify(vw)); c.id = uid(); c.name += ' copy'; db.views.push(c); st.view = c.id; commit(); redraw(); } },
        db.views.length > 1 ? { divider: true } : null,
        db.views.length > 1 ? { label: 'Delete view', icon: BP.icons.trash, danger: true, onClick: () => { db.views = db.views.filter((x) => x !== vw); st.view = null; commit(); redraw(); } } : null,
      ]);
    }
    function addPropMenu(anchor) {
      BP.menu(anchor, [{ header: 'PROPERTY TYPE' }].concat(TYPES.map(([t, n, ic]) => ({ label: n, icon: ic, onClick: () => {
        const p = { id: uid(), name: n, type: t, w: 160 };
        if (['select', 'multi_select', 'status'].includes(t)) p.options = t === 'status' ? [{ id: uid(), name: 'Not started', color: 'gray' }, { id: uid(), name: 'In progress', color: 'blue' }, { id: uid(), name: 'Done', color: 'green' }] : [];
        const done = () => { db.props.push(p); commit(); redraw(); };
        if (t === 'button') editButtonProp(p, done);
        else if (t === 'formula') editFormula(p, done);
        else if (t === 'relation') editRelation(p, done);
        else if (t === 'rollup') editRollup(p, done);
        else done();
      } }))));
    }
    function editButtonProp(p, after) {
      BP.modal('Button column – ' + p.name, (body, close) => {
        const label = h('input', { class: 'input', value: p.label || 'Click' });
        const s0 = (p.sets && p.sets[0]) || {};
        const targets = db.props.filter((x) => !BP.COMPUTED.includes(x.type) && !['relation', 'files', 'people', 'place', 'verification', 'multi_select'].includes(x.type));
        const pSel = h('select', { class: 'input' }, [h('option', { value: '' }, '(do not change a property)')].concat(targets.map((x) => h('option', { value: x.id, selected: x.id === s0.propId ? '' : null }, x.name))));
        const valBox = h('div', { class: 'f-col' });
        const drawVal = () => {
          valBox.innerHTML = '';
          const t = targets.find((x) => x.id === pSel.value);
          if (!t) return;
          if (['select', 'status'].includes(t.type)) { const s = h('select', { class: 'input' }, (t.options || []).map((o) => h('option', { value: o.id, selected: o.id === s0.value ? '' : null }, o.name))); s.dataset.k = 'v'; valBox.append(h('label', { class: 'muted' }, 'Set to'), s); }
          else if (t.type === 'checkbox') { const s = h('select', { class: 'input' }, [['true', 'Checked'], ['false', 'Unchecked']].map(([k, n]) => h('option', { value: k, selected: String(s0.value) === k ? '' : null }, n))); s.dataset.k = 'v'; valBox.append(h('label', { class: 'muted' }, 'Set to'), s); }
          else if (t.type === 'date') { const s = h('select', { class: 'input' }, [['today', 'Today'], ['clear', 'Empty']].map(([k, n]) => h('option', { value: k, selected: (s0.today ? 'today' : 'clear') === k ? '' : null }, n))); s.dataset.k = 'v'; valBox.append(h('label', { class: 'muted' }, 'Set to'), s); }
          else { const s = h('input', { class: 'input', value: s0.value == null ? '' : s0.value, placeholder: 'Value' }); s.dataset.k = 'v'; valBox.append(h('label', { class: 'muted' }, 'Set to'), s); }
        };
        pSel.onchange = () => { s0.value = undefined; drawVal(); };
        drawVal();
        const url = h('input', { class: 'input', value: p.url || '', placeholder: 'Also open a link (optional)' });
        body.append(h('label', { class: 'muted' }, 'Button label'), label, h('label', { class: 'muted' }, 'When clicked, change'), pSel, valBox, url,
          h('div', { class: 'row-end' }, h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => {
            p.label = label.value || 'Click'; p.url = url.value;
            const t = targets.find((x) => x.id === pSel.value), el = valBox.querySelector('[data-k]');
            p.sets = t && el ? [t.type === 'date' ? { propId: t.id, today: el.value === 'today', value: null } : { propId: t.id, value: el.value }] : [];
            close(); after();
          } }, 'Save')));
      }, { class: 'small' });
    }
    function editFormula(p, after) {
      BP.modal('Edit formula – ' + p.name, (body, close) => {
        const ta = h('textarea', { class: 'input mono', rows: '3', placeholder: 'prop("Hours") * 2' });
        ta.value = p.formula || '';
        const msg = h('div', { class: 'muted small' });
        const prev = h('div', { class: 'formula-prev' });
        const row = BP.rows(db.id)[0];
        const check = () => { const e = BP.checkFormula(db, ta.value); msg.textContent = e ? '⚠ ' + e : ''; msg.className = 'small ' + (e ? 'bad' : 'muted'); if (!e && row) { const old = p.formula; p.formula = ta.value; prev.textContent = 'Preview on “' + (row.title || 'Untitled') + '”: ' + (BP.fmtComputed(BP.evalFormula(row, p)) || '(empty)'); p.formula = old; } else prev.textContent = ''; };
        ta.addEventListener('input', check);
        body.append(ta, msg, prev,
          h('div', { class: 'muted small help' }, 'Use prop("Name") to read a property. Operators: + - * / % ^ == != < > <= >= and or not. Functions: if, ifs, empty, length, concat, join, lower, upper, slice, replace, contains, round, floor, ceil, abs, sqrt, pow, min, max, sum, mean, toNumber, today, now, year, month, day, dateAdd, dateBetween.'),
          h('div', { class: 'row-end' }, h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => { if (BP.checkFormula(db, ta.value)) return BP.toast('Fix the formula first'); p.formula = ta.value; close(); after(); } }, 'Save')));
        check();
        setTimeout(() => ta.focus(), 30);
      }, { class: 'small' });
    }
    function editRelation(p, after) {
      BP.modal('Relation – ' + p.name, (body, close) => {
        const dbs = BP.allPages().filter((x) => x.type === 'db' && !x.trashed && !BP.isTrashed(x));
        const sel = h('select', { class: 'input' }, dbs.map((d) => h('option', { value: d.id, selected: d.id === p.target ? '' : null }, (d.icon || '🗂') + ' ' + (d.title || 'Untitled') + (d.id === db.id ? ' (this database)' : ''))));
        body.append(h('p', { class: 'muted' }, 'Choose the database this property links to.'), sel, h('div', { class: 'row-end' }, h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => { p.target = sel.value; close(); after(); } }, 'Save')));
      }, { class: 'small' });
    }
    function editRollup(p, after) {
      const rels = db.props.filter((x) => x.type === 'relation' && x.target);
      if (!rels.length) return BP.toast('Add a Relation property first');
      BP.modal('Rollup – ' + p.name, (body, close) => {
        const relSel = h('select', { class: 'input' }, rels.map((r) => h('option', { value: r.id, selected: r.id === p.relation ? '' : null }, r.name)));
        const tgtSel = h('select', { class: 'input' });
        const fnSel = h('select', { class: 'input' }, BP.ROLLUPS.map(([k, n]) => h('option', { value: k, selected: k === (p.fn || 'count') ? '' : null }, n)));
        const fill = () => { const rel = rels.find((x) => x.id === relSel.value); const t = BP.page(rel.target); tgtSel.innerHTML = ''; (t ? t.props : []).forEach((x) => tgtSel.append(h('option', { value: x.id, selected: x.id === p.target ? '' : null }, x.name))); };
        relSel.onchange = fill; fill();
        body.append(h('label', { class: 'muted' }, 'Relation'), relSel, h('label', { class: 'muted' }, 'Property'), tgtSel, h('label', { class: 'muted' }, 'Calculate'), fnSel,
          h('div', { class: 'row-end' }, h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => { p.relation = relSel.value; p.target = tgtSel.value; p.fn = fnSel.value; close(); after(); } }, 'Save')));
      }, { class: 'small' });
    }
    function colMenu(anchor, p, v) {
      const sortSet = (dir) => { v.sorts = [{ propId: p.id, dir }]; commit(); redraw(); };
      BP.menu(anchor, [
        { label: 'Rename', icon: '✎', onClick: async () => { const n = await BP.prompt('Rename property', p.name); if (n) { p.name = n; commit(); redraw(); } } },
        p.type !== 'title' ? { label: 'Type: ' + (TYPES.find((t) => t[0] === p.type) || [0, 'Title'])[1], icon: TICO[p.type], submenu: TYPES.map(([t, n, ic]) => ({ label: n, icon: ic, check: p.type === t, onClick: () => changeType(p, t) })) } : null,
        ['select', 'multi_select', 'status'].includes(p.type) ? { label: 'Edit options', icon: '☰', onClick: () => editOptions(db, p, redraw) } : null,
        p.type === 'formula' ? { label: 'Edit formula', icon: 'ƒ', onClick: () => editFormula(p, () => { commit(); redraw(); }) } : null,
        p.type === 'button' ? { label: 'Configure button', icon: '🔘', onClick: () => editButtonProp(p, () => { commit(); redraw(); }) } : null,
        p.type === 'relation' ? { label: 'Change related database', icon: '↗', onClick: () => editRelation(p, () => { commit(); redraw(); }) } : null,
        p.type === 'rollup' ? { label: 'Edit rollup', icon: '∑', onClick: () => editRollup(p, () => { commit(); redraw(); }) } : null,
        p.type === 'unique_id' ? { label: 'Set prefix', icon: '№', onClick: async () => { const n = await BP.prompt('ID prefix (optional)', p.prefix || ''); if (n != null) { p.prefix = n.trim(); commit(); redraw(); } } } : null,
        { divider: true },
        { label: 'Sort ascending', icon: '↑', onClick: () => sortSet('asc') },
        { label: 'Sort descending', icon: '↓', onClick: () => sortSet('desc') },
        isFilterable(p) ? { label: 'Add filter', icon: BP.icons.filter, onClick: () => { v.filters.push({ propId: p.id, op: opsFor(p.type)[0][0], value: '' }); commit(); redraw(); } } : null,
        p.type !== 'title' ? { label: 'Hide in view', icon: '🙈', onClick: () => { v.hidden = (v.hidden || []).concat(p.id); commit(); redraw(); } } : null,
        p.type !== 'title' ? { divider: true } : null,
        p.type !== 'title' ? { label: 'Delete property', icon: BP.icons.trash, danger: true, onClick: async () => { if (await BP.confirm('Delete property', 'Delete “' + p.name + '” and its values in every row?')) { db.props = db.props.filter((x) => x !== p); db.views.forEach((vw) => { vw.filters = vw.filters.filter((f) => f.propId !== p.id); vw.sorts = vw.sorts.filter((f) => f.propId !== p.id); if (vw.groupBy === p.id) delete vw.groupBy; }); BP.rows(db.id).forEach((r) => r.values && delete r.values[p.id]); commit(); redraw(); } } } : null,
      ]);
    }
    function changeType(p, t) {
      const old = p.type;
      if (old === t) return;
      if (['formula', 'relation', 'rollup'].includes(t)) {
        if (t === 'rollup' && !db.props.some((x) => x.type === 'relation' && x.target)) return BP.toast('Add a Relation property first');
        const after = () => { commit(); redraw(); };
        p.type = t;
        if (t === 'formula') editFormula(p, after); else if (t === 'relation') editRelation(p, after); else editRollup(p, after);
        return;
      }
      const toOpts = ['select', 'multi_select', 'status'].includes(t);
      const fromOpts = ['select', 'multi_select', 'status'].includes(old);
      BP.rows(db.id).forEach((r) => {
        const vals = r.values || (r.values = {});
        let val = vals[p.id];
        if (val == null) return;
        if (fromOpts && !toOpts) { const names = (Array.isArray(val) ? val : [val]).map((id) => (BP.optById(p, id) || {}).name).filter(Boolean); val = names.join(', '); }
        else if (fromOpts && toOpts) { if (t === 'multi_select' && !Array.isArray(val)) val = [val]; else if (t !== 'multi_select' && Array.isArray(val)) val = val[0] || null; }
        else if (toOpts) {
          const names = String(val).split(',').map((s) => s.trim()).filter(Boolean);
          p.options = p.options || [];
          const ids = names.map((n) => { let o = p.options.find((x) => x.name === n); if (!o) p.options.push((o = { id: uid(), name: n, color: BP.COLORS[p.options.length % 9] })); return o.id; });
          val = t === 'multi_select' ? ids : ids[0] || null;
        } else if (t === 'number') { const n = parseFloat(val); val = isNaN(n) ? null : n; }
        else if (t === 'checkbox') val = !!val;
        else if (t === 'date') val = /^\d{4}-\d{2}-\d{2}/.test(String(val)) ? String(val).slice(0, 10) : null;
        else val = val == null ? null : String(val);
        vals[p.id] = val;
      });
      if (toOpts && !p.options) p.options = [];
      p.type = t;
      db.views.forEach((vw) => { vw.filters = (vw.filters || []).filter((f) => f.propId !== p.id); });
      commit(); redraw();
    }
    function groupPop(anchor, v, key, title, test, allowNone) {
      const opts = db.props.filter(test);
      const items = [{ header: title.toUpperCase() }];
      if (allowNone) items.push({ label: 'None', check: !v[key], onClick: () => { delete v[key]; commit(); redraw(); } });
      BP.menu(anchor, items.concat(opts.length ? opts.map((p) => ({ label: p.name, icon: TICO[p.type], check: v[key] === p.id, onClick: () => { v[key] = p.id; commit(); redraw(); } })) : [{ header: 'No suitable property' }]));
    }
    function propsPop(anchor, v) {
      BP.popover(anchor, (el) => {
        el.classList.add('menu');
        db.props.forEach((p) => {
          const hidden = (v.hidden || []).includes(p.id);
          const row = h('div', { class: 'menu-item' }, h('span', { class: 'mi-ico' }, TICO[p.type]), h('span', { class: 'mi-label' }, p.name), p.type === 'title' ? h('span', { class: 'muted' }, 'always') : h('input', { type: 'checkbox', checked: hidden ? null : '', onchange: (e) => { v.hidden = (v.hidden || []).filter((x) => x !== p.id); if (!e.target.checked) v.hidden.push(p.id); commit(); redraw(); propsPop(anchor, v); } }));
          el.append(row);
        });
        el.append(h('div', { class: 'menu-div' }), h('div', { class: 'menu-item', onclick: (e) => addPropMenu(anchor) }, h('span', { class: 'mi-ico', html: BP.icons.plus }), h('span', { class: 'mi-label' }, 'New property')));
      });
    }
    function filterPop(anchor, v) {
      BP.popover(anchor, (el) => {
        el.classList.add('fpop');
        const newCond = () => { const p = db.props.filter(isFilterable)[0]; return { propId: p.id, op: opsFor(p.type)[0][0], value: '' }; };
        const after = () => { commit(); redraw(); draw(); };
        const condRow = (items, i) => {
          const f = items[i];
          const prop0 = db.props.find((p) => p.id === f.propId) || db.props[0];
          const prop = prop0.type === 'people' ? peopleProp(prop0) : prop0;
          const pSel = h('select', { class: 'input small' }, db.props.filter(isFilterable).map((p) => h('option', { value: p.id, selected: p.id === f.propId ? '' : null }, p.name)));
          pSel.onchange = () => { f.propId = pSel.value; const np = db.props.find((p) => p.id === f.propId); f.op = opsFor(np.type)[0][0]; f.value = ''; after(); };
          const oSel = h('select', { class: 'input small' }, opsFor(prop0.type).map(([k, n]) => h('option', { value: k, selected: k === f.op ? '' : null }, n)));
          oSel.onchange = () => { f.op = oSel.value; after(); };
          let val = null;
          if (!NOVAL.includes(f.op)) {
            if (['select', 'status', 'multi_select'].includes(prop.type)) {
              val = h('select', { class: 'input small' }, [h('option', { value: '' }, 'Choose…')].concat((prop.options || []).map((o) => h('option', { value: o.id, selected: o.id === f.value ? '' : null }, o.name))));
              val.onchange = () => { f.value = val.value; commit(); redraw(); };
            } else {
              val = h('input', { class: 'input small', type: prop.type === 'date' ? 'date' : prop.type === 'number' ? 'number' : 'text', value: f.value || '', placeholder: 'Value' });
              val.oninput = BP.debounce(() => { f.value = val.value; commit(); redraw(); }, 250);
            }
          }
          return h('div', { class: 'f-row' }, pSel, oSel, val, h('button', { class: 'icon-btn', html: BP.icons.x, onclick: () => { items.splice(i, 1); after(); } }));
        };
        // a group is "all of" (AND) or "any of" (OR); groups can nest
        const group = (items, getOp, setOp, depth, onRemove) => {
          const box = h('div', { class: 'f-group' + (depth ? ' nested' : '') });
          const opSel = h('select', { class: 'input small' }, [['and', 'All of the following'], ['or', 'Any of the following']].map(([k, n]) => h('option', { value: k, selected: k === getOp() ? '' : null }, n)));
          opSel.onchange = () => { setOp(opSel.value); after(); };
          box.append(h('div', { class: 'f-row' }, opSel, onRemove ? h('button', { class: 'icon-btn', title: 'Remove group', html: BP.icons.x, onclick: onRemove }) : null));
          if (!items.length) box.append(h('div', { class: 'muted pad-s' }, 'No filters'));
          items.forEach((it, i) => box.append(it.group ? group(it.items, () => it.op || 'and', (x) => { it.op = x; }, depth + 1, () => { items.splice(i, 1); after(); }) : condRow(items, i)));
          box.append(h('div', { class: 'f-row' }, h('button', { class: 'btn small', onclick: () => { items.push(newCond()); after(); } }, '+ Add filter'), depth < 2 ? h('button', { class: 'btn small', onclick: () => { items.push({ group: true, op: 'or', items: [newCond()] }); after(); } }, '+ Add group') : null));
          return box;
        };
        const draw = () => { el.innerHTML = ''; el.append(group(v.filters, () => v.filterOp || 'and', (x) => { v.filterOp = x; }, 0, null)); };
        draw();
      }, { keep: false, class: 'fpop-wrap' });
    }
    function sortPop(anchor, v) {
      BP.popover(anchor, (el) => {
        el.classList.add('fpop');
        const draw = () => {
          el.innerHTML = '';
          if (!v.sorts.length) el.append(h('div', { class: 'muted pad-s' }, 'No sorts'));
          v.sorts.forEach((s, i) => {
            const pSel = h('select', { class: 'input small' }, db.props.map((p) => h('option', { value: p.id, selected: p.id === s.propId ? '' : null }, p.name)));
            pSel.onchange = () => { s.propId = pSel.value; commit(); redraw(); };
            const dSel = h('select', { class: 'input small' }, [['asc', 'Ascending'], ['desc', 'Descending']].map(([k, n]) => h('option', { value: k, selected: s.dir === k ? '' : null }, n)));
            dSel.onchange = () => { s.dir = dSel.value; commit(); redraw(); };
            el.append(h('div', { class: 'f-row' }, pSel, dSel, h('button', { class: 'icon-btn', html: BP.icons.x, onclick: () => { v.sorts.splice(i, 1); commit(); redraw(); draw(); } })));
          });
          el.append(h('button', { class: 'btn small', onclick: () => { v.sorts.push({ propId: db.props[0].id, dir: 'asc' }); commit(); redraw(); draw(); } }, '+ Add sort'));
        };
        draw();
      });
    }

    build();
  };

  /* property panel on a row page */
  BP.renderRowProps = function (box, row) {
    const db = BP.page(row.rowOf);
    if (!db) return;
    box.innerHTML = '';
    const redraw = () => BP.renderRowProps(box, row);
    db.props.filter((p) => p.type !== 'title').forEach((p) => {
      const cell = h('div', { class: 'rp-cell' });
      BP.cellEditor(db, p, row, cell, redraw);
      box.append(h('div', { class: 'rp-row' }, h('div', { class: 'rp-name' }, h('span', { class: 'th-ico' }, TICO[p.type]), p.name), cell));
    });
  };
})();

/* Blockpad app shell: sidebar, topbar, page view, dialogs, shortcuts. */
(function () {
  const BP = (window.BP = window.BP || {});
  const { h, uid } = BP;
  const nav = { stack: [], i: -1 };
  let editor = null, commentsOpen = false;
  const GRADS = ['indigo', 'sunset', 'ocean', 'forest', 'rose', 'slate', 'sand', 'violet'];
  const root = () => BP.$('#app');
  const cur = () => BP.page(BP.state.current);
  const icoOf = (p) => p.icon || (p.type === 'db' ? '🗂' : p.rowOf ? '•' : '📄');

  /* ---------- theme ---------- */
  function applyTheme() {
    const t = BP.state.settings.theme;
    const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => BP.state && applyTheme());
  BP.setTheme = (t) => { BP.state.settings.theme = t; applyTheme(); BP.save(); };

  /* ---------- navigation ---------- */
  const small = () => matchMedia('(max-width: 760px)').matches;
  BP.open = function (id, o = {}) {
    const p = BP.page(id);
    if (!p) return;
    if (small()) BP.state.settings.sidebar = false;          // on a phone the sidebar is a drawer: close it once you pick a page
    if (editor) { editor.flushTyping(); }
    BP.state.current = id;
    if (!o.noHistory) {
      nav.stack = nav.stack.slice(0, nav.i + 1);
      if (nav.stack[nav.stack.length - 1] !== id) nav.stack.push(id);
      nav.i = nav.stack.length - 1;
    }
    // reveal in the sidebar
    for (let c = BP.page(p.parent); c; c = BP.page(c.parent)) c.open = true;
    BP.save();
    renderAll();
  };
  const go = (d) => {
    const i = nav.i + d;
    while (i >= 0 && i < nav.stack.length) {
      if (BP.page(nav.stack[i])) { nav.i = i; return BP.open(nav.stack[i], { noHistory: true }); }
      nav.stack.splice(i, 1);
      if (d > 0) continue;
      return;
    }
  };
  BP.newPage = function (parent, opts) {
    const p = BP.createPage(parent || null, opts || {});
    if (parent) BP.page(parent).open = true;
    BP.open(p.id);
    setTimeout(() => { const t = BP.$('.title-in'); t && t.focus(); }, 40);
    return p;
  };

  /* ---------- layout ---------- */
  function renderAll() {
    const app = root();
    const sbw = BP.state.settings.sbw || 264;
    app.style.setProperty('--sbw', sbw + 'px');
    app.classList.toggle('sb-hidden', !BP.state.settings.sidebar);
    app.innerHTML = '';
    app.append(sidebar(), main());
    const p = cur();
    document.title = (p ? (p.title || 'Untitled') + ' – ' : '') + 'Blockpad';
  }
  function refreshSidebar() {
    const old = BP.$('.sidebar');
    if (!old) return;
    const st = BP.$('.sb-scroll', old);
    const top = st ? st.scrollTop : 0;
    const nw = sidebar();
    old.replaceWith(nw);
    const s2 = BP.$('.sb-scroll', nw);
    if (s2) s2.scrollTop = top;
  }
  /* remote edits arriving from other people: refresh what changed without taking the cursor away */
  function captureFocus() {
    const ae = document.activeElement;
    if (!ae || ae === document.body) return null;
    if (ae.classList && ae.classList.contains('title-in')) return { title: true, s: ae.selectionStart, e: ae.selectionEnd };
    const blk = ae.closest && ae.closest('.block');
    if (!blk) return null;
    let pos = null;
    if (ae.tagName === 'TEXTAREA') pos = ae.selectionStart;
    else {
      const sel = getSelection();
      const r = sel.rangeCount ? sel.getRangeAt(0) : null;
      if (r && ae.contains(r.startContainer)) { const pre = document.createRange(); pre.selectNodeContents(ae); pre.setEnd(r.startContainer, r.startOffset); pos = pre.toString().length; }
    }
    return { block: blk.dataset.id, pos };
  }
  function restoreFocus(k) {
    if (!k) return;
    if (k.title) { const t = BP.$('.title-in'); if (t) { t.focus(); try { t.setSelectionRange(k.s, k.e); } catch (_) {} } return; }
    if (k.block && BP.currentEditor) { const el = BP.currentEditor.txtOf(k.block); if (el) BP.editorHelpers.setCaret(el, k.pos == null ? 'end' : k.pos); }
  }
  BP.ui = {
    refreshChrome() { const tb = BP.$('.topbar'); if (tb) tb.replaceWith(topbar()); refreshSidebar(); },
    presence() {
      const p = cur();
      const b = p && BP.share.bar(p), old = BP.$('.who-bar');
      if ((b ? b.dataset.sig : '') !== (old ? old.dataset.sig : '')) BP.ui.refreshChrome();
      BP.share.paintMarks();
    },
    remote(r) {
      const id = BP.state.current;
      refreshSidebar();
      if (!id) return;
      if (r.gone.has(id) || !BP.page(id)) { BP.state.current = (BP.children(null)[0] || {}).id || null; renderAll(); return; }
      if (!r.touched.has(id)) { BP.share.paintMarks(); return; }
      const keep = captureFocus();
      const p = BP.page(id);
      if (editor && p.type !== 'db' && !r.metaCh.has(id)) { editor.page = p; editor.render(); editor.base = editor.serialize(); }
      else renderAll();
      restoreFocus(keep);
      const sk = BP.$('.sh-loading'); if (sk && !BP.share.loading(p)) sk.remove();
      BP.share.paintMarks();
    },
  };
  // typing a title: update that page's rows in the sidebar in place (rebuilding the whole tree on every pause was the slow part)
  const refreshChrome = BP.debounce(() => { const p = cur(); if (p) BP.$$('.sb-item[data-pid="' + p.id + '"] .sb-title').forEach((t) => { t.textContent = p.title || 'Untitled'; }); const bc = BP.$('.crumbs'); if (bc) bc.replaceWith(crumbs()); p && (document.title = (p.title || 'Untitled') + ' – Blockpad'); }, 200);

  /* ---------- sidebar ---------- */
  function sidebar() {
    const sb = h('aside', { class: 'sidebar' });
    const ws = h('button', { class: 'ws', onclick: (e) => wsMenu(e.currentTarget) }, h('img', { class: 'ws-logo', src: 'assets/logo.svg', alt: '' }), h('span', { class: 'ws-name' }, BP.state.settings.name || 'My Workspace'), h('span', { class: 'ws-chev', html: BP.icons.chevron }));
    sb.append(h('div', { class: 'sb-top' }, ws, h('button', { class: 'icon-btn', title: 'Hide sidebar (Ctrl+\\)', html: BP.icons.sidebar, onclick: toggleSidebar })));
    const nm = (ico, label, kbd, fn) => h('button', { class: 'sb-nav', onclick: fn }, h('span', { class: 'sb-ico', html: ico }), h('span', { class: 'sb-label' }, label), kbd ? h('span', { class: 'kbd' }, kbd) : null);
    sb.append(h('div', { class: 'sb-actions' },
      nm(BP.icons.search, 'Search', 'Ctrl+K', openSearch),
      nm(BP.icons.home, 'Home', '', () => { BP.state.current = null; BP.save(); renderAll(); }),
      nm(BP.icons.plus, 'New page', 'Ctrl+N', () => BP.newPage(null))));
    const sc = h('div', { class: 'sb-scroll' });
    const favs = BP.allPages().filter((p) => p.favorite && !BP.isTrashed(p));
    if (favs.length) {
      sc.append(h('div', { class: 'sb-sec' }, 'Favorites'));
      favs.forEach((p) => sc.append(h('div', { class: 'sb-item' + (p.id === BP.state.current ? ' on' : ''), 'data-pid': p.id, onclick: () => BP.open(p.id), oncontextmenu: (e) => { e.preventDefault(); pageMenu(p, { x: e.clientX, y: e.clientY }); } }, h('span', { class: 'sb-twirl' }), h('span', { class: 'sb-pico' }, icoOf(p)), h('span', { class: 'sb-title' }, p.title || 'Untitled'))));
    }
    sc.append(h('div', { class: 'sb-sec' }, 'Pages', h('button', { class: 'icon-btn', title: 'Add a page', html: BP.icons.plus, onclick: () => BP.newPage(null) })));
    const tree = h('div', { class: 'tree' });
    sbKids = new Map();
    for (const p of BP.allPages()) { if (p.rowOf || p.inline || p.trashed) continue; const k = p.parent || null; if (!sbKids.has(k)) sbKids.set(k, []); sbKids.get(k).push(p); }
    sbKids.forEach((a) => a.sort((x, y) => (x.order || 0) - (y.order || 0)));
    const roots = sbKids.get(null) || [];
    roots.forEach((p) => tree.append(treeItem(p, 0)));
    sbKids = null;
    if (!roots.length) tree.append(h('div', { class: 'muted pad-s' }, 'No pages yet'));
    tree.addEventListener('dragover', (e) => { if (BP.dragPage && e.target === tree) e.preventDefault(); });
    tree.addEventListener('drop', (e) => { if (BP.dragPage && e.target === tree) { e.preventDefault(); BP.movePage(BP.dragPage, null); BP.dragPage = null; renderAll(); } });
    sc.append(tree);
    sb.append(sc);
    sb.append(h('div', { class: 'sb-bottom' },
      nm(BP.icons.template, 'Templates', '', openTemplates),
      nm(BP.icons.share, 'Join a shared page', '', () => BP.joinDialog()),
      nm(BP.icons.trash, 'Trash', '', openTrash),
      nm(BP.icons.settings, 'Settings', 'Ctrl+,', () => openSettings())));
    sb.append(h('div', { class: 'sb-resize', onmousedown: (e) => {
      e.preventDefault();
      const mv = (ev) => { const w = Math.max(200, Math.min(480, ev.clientX)); BP.state.settings.sbw = w; root().style.setProperty('--sbw', w + 'px'); };
      const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); BP.save(); };
      addEventListener('mousemove', mv); addEventListener('mouseup', up);
    } }));
    return sb;
  }
  let sbKids = null;      // parent id -> children, built once per sidebar render (same filter and order as BP.children)
  function treeItem(p, depth) {
    const kids = (sbKids ? sbKids.get(p.id) : BP.children(p.id)) || [];
    const frag = h('div', { class: 'tnode' });
    const row = h('div', { class: 'sb-item' + (p.id === BP.state.current ? ' on' : ''), 'data-pid': p.id, style: { paddingLeft: 8 + depth * 14 + 'px' }, draggable: 'true',
      onclick: () => BP.open(p.id), oncontextmenu: (e) => { e.preventDefault(); pageMenu(p, { x: e.clientX, y: e.clientY }); } },
      h('button', { class: 'sb-twirl' + (p.open ? ' open' : '') + (kids.length ? '' : ' empty'), html: BP.icons.chevron, onclick: (e) => { e.stopPropagation(); p.open = !p.open; BP.save(); refreshSidebar(); } }),
      h('span', { class: 'sb-pico' }, icoOf(p)),
      h('span', { class: 'sb-title' }, p.title || 'Untitled'),
      h('span', { class: 'sb-acts' },
        h('button', { class: 'icon-btn', title: 'More', html: BP.icons.more, onclick: (e) => { e.stopPropagation(); pageMenu(p, e.currentTarget); } }),
        p.type === 'db' ? null : h('button', { class: 'icon-btn', title: 'Add a page inside', html: BP.icons.plus, onclick: (e) => { e.stopPropagation(); BP.newPage(p.id); } })));
    row.addEventListener('dragstart', (e) => { BP.dragPage = p.id; e.dataTransfer.setData('text/plain', 'bp-page'); e.dataTransfer.effectAllowed = 'move'; });
    row.addEventListener('dragend', () => { BP.dragPage = null; BP.$$('.drop-before,.drop-after,.drop-inside').forEach((x) => x.classList.remove('drop-before', 'drop-after', 'drop-inside')); });
    const zone = (e) => { const r = row.getBoundingClientRect(); const y = (e.clientY - r.top) / r.height; return y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'inside'; };
    row.addEventListener('dragover', (e) => {
      if (BP.dragBlockRef) { if (p.type !== 'db') { e.preventDefault(); row.classList.add('drop-inside'); } return; }
      if (!BP.dragPage || BP.dragPage === p.id) return;
      e.preventDefault();
      const z = zone(e);
      row.classList.toggle('drop-before', z === 'before'); row.classList.toggle('drop-after', z === 'after'); row.classList.toggle('drop-inside', z === 'inside');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drop-before', 'drop-after', 'drop-inside'));
    row.addEventListener('drop', (e) => {
      if (BP.dragBlockRef) {
        e.preventDefault(); e.stopPropagation();
        row.classList.remove('drop-inside');
        const ref = BP.dragBlockRef; BP.dragBlockRef = null;
        if (p.type !== 'db') BP.moveBlocksToPage(ref, p.id);
        return;
      }
      if (!BP.dragPage) return;
      e.preventDefault(); e.stopPropagation();
      const id = BP.dragPage; BP.dragPage = null;
      const z = zone(e);
      let ok = false;
      if (z === 'inside') { if (p.type !== 'db') { ok = BP.movePage(id, p.id); p.open = true; } }
      else if (z === 'before') ok = BP.movePage(id, p.parent, p.id);
      else { const sibs = BP.children(p.parent).filter((x) => x.id !== id); const nx = sibs[sibs.findIndex((x) => x.id === p.id) + 1]; ok = BP.movePage(id, p.parent, nx ? nx.id : null); }
      if (!ok) BP.toast('Can’t move a page into itself');
      renderAll();
    });
    frag.append(row);
    if (p.open && kids.length) kids.forEach((k) => frag.append(treeItem(k, depth + 1)));
    return frag;
  }
  function toggleSidebar() {
    BP.state.settings.sidebar = !BP.state.settings.sidebar;
    BP.save();
    root().classList.toggle('sb-hidden', !BP.state.settings.sidebar);
    const tb = BP.$('.topbar .sb-toggle');
    tb && (tb.style.display = BP.state.settings.sidebar ? 'none' : '');
  }
  function wsMenu(anchor) {
    BP.menu(anchor, [
      { label: 'Rename workspace', icon: '✎', onClick: async () => { const n = await BP.prompt('Workspace name', BP.state.settings.name); if (n) { BP.state.settings.name = n; BP.save(); refreshSidebar(); } } },
      { label: 'Settings', icon: BP.icons.settings, onClick: () => openSettings() },
      { label: 'Export backup', icon: BP.icons.share, onClick: BP.exportWorkspace },
      { divider: true },
      { label: 'About Blockpad', icon: 'ℹ', onClick: () => openSettings('about') },
    ]);
  }
  function pageMenu(p, anchor) {
    BP.menu(anchor, [
      { label: p.favorite ? 'Remove from favorites' : 'Add to favorites', icon: BP.icons.star, onClick: () => { p.favorite = !p.favorite; BP.save(); refreshSidebar(); } },
      { label: 'Rename', icon: '✎', onClick: async () => { const n = await BP.prompt('Rename', p.title); if (n != null) { p.title = n; BP.touch(p); renderAll(); } } },
      { label: 'Duplicate', icon: BP.icons.copy, onClick: () => { const c = BP.clonePage(p.id); BP.open(c.id); } },
      p.type === 'db' ? null : { label: 'Add a page inside', icon: BP.icons.plus, onClick: () => BP.newPage(p.id) },
      { label: 'Copy link', icon: BP.icons.link, onClick: () => { navigator.clipboard.writeText('bp://page/' + p.id); BP.toast('Link copied'); } },
      { label: 'Save as template', icon: BP.icons.template, onClick: () => { BP.saveTemplate(p.id); BP.toast('Saved as a template'); } },
      { divider: true },
      { label: 'Move to trash', icon: BP.icons.trash, danger: true, onClick: () => trashPage(p) },
    ]);
  }
  function trashPage(p) {
    BP.trash(p.id);
    const wasHere = BP.state.current === p.id || BP.descendants(p.id).includes(BP.state.current);
    if (wasHere) {
      const par = BP.page(p.parent);
      const next = (par && !BP.isTrashed(par) ? par : null) || BP.children(null)[0];
      BP.state.current = next ? next.id : null;
    }
    renderAll();
    BP.toast('Moved to trash');
  }

  /* ---------- topbar ---------- */
  function crumbs() {
    const p = cur();
    const box = h('div', { class: 'crumbs' });
    if (!p) return box;
    const path = BP.path(p);
    path.forEach((x, i) => {
      if (i) box.append(h('span', { class: 'sep' }, '/'));
      box.append(h('button', { class: 'crumb' + (i === path.length - 1 ? ' last' : ''), onclick: () => x.id !== p.id && BP.open(x.id) }, h('span', null, icoOf(x)), h('span', { class: 'ct' }, x.title || 'Untitled')));
    });
    return box;
  }
  /* the 🧠 chip: shows whether the built-in AI is on and turns it on/off (hidden when you use your own endpoint) */
  function aiChip() {
    const c = h('button', { class: 'ai-chip', onclick: () => BP.llm.toggle() }, h('span', { class: 'ai-dot' }), h('span', { class: 'ai-chip-t' }, 'AI'));
    paintChip(c);
    return c;
  }
  function paintChip(c) {
    const st = BP.llm.st, s = st.state, on = BP.state.settings.ai.provider !== 'custom' && !!(window.bp && window.bp.llm);
    c.style.display = on ? '' : 'none';
    c.querySelector('.ai-dot').className = 'ai-dot ' + s;
    c.querySelector('.ai-chip-t').textContent = s === 'running' ? 'AI on · ' + st.rssMB + ' MB' : s === 'starting' ? 'AI starting…' : s === 'stopping' ? 'AI stopping…' : 'AI off';
    c.title = s === 'running' ? 'Built-in AI is on (' + st.rssMB + ' MB of ' + st.budgetMB + ' MB limit). Click to stop it and free the memory.' : s === 'error' ? st.error : 'Built-in AI is off and uses no memory. Click to start it.';
  }
  BP.paintAiChip = () => document.querySelectorAll('.ai-chip').forEach(paintChip);
  function topbar() {
    const p = cur();
    const t = h('div', { class: 'topbar' });
    t.append(h('button', { class: 'icon-btn sb-toggle', style: { display: BP.state.settings.sidebar ? 'none' : '' }, title: 'Show sidebar (Ctrl+\\)', html: BP.icons.sidebar, onclick: toggleSidebar }),
      h('button', { class: 'icon-btn', title: 'Back (Alt+←)', html: BP.icons.back, onclick: () => go(-1) }),
      h('button', { class: 'icon-btn', title: 'Forward (Alt+→)', html: BP.icons.fwd, onclick: () => go(1) }),
      crumbs(), h('div', { class: 'grow' }), aiChip());
    if (p) {
      t.append(h('span', { class: 'muted small edited' }, 'Edited ' + BP.fmtDate(p.updated)),
        BP.share.bar(p) || '',
        h('button', { class: 'btn ghost', onclick: () => BP.shareDialog(p) }, 'Share'),
        h('button', { class: 'icon-btn' + (commentsOpen ? ' on' : ''), title: 'Comments', html: BP.icons.comment + ((p.comments || []).filter((c) => !c.resolved).length ? `<i class="badge">${(p.comments || []).filter((c) => !c.resolved).length}</i>` : ''), onclick: () => { commentsOpen = !commentsOpen; renderAll(); } }),
        h('button', { class: 'icon-btn', title: 'Favorite', html: BP.icons.star, style: { color: p.favorite ? '#e8a317' : '' }, onclick: () => { p.favorite = !p.favorite; BP.save(); renderAll(); } }),
        h('button', { class: 'icon-btn', title: 'More', html: BP.icons.more, onclick: (e) => moreMenu(p, e.currentTarget) }));
    }
    return t;
  }
  function moreMenu(p, anchor) {
    const flag = (key, label, icon) => ({ label, icon, check: !!p[key], onClick: () => { p[key] = !p[key]; BP.touch(p); renderAll(); } });
    BP.menu(anchor, [
      { header: 'PAGE STYLE' },
      { label: 'Font', icon: 'Aa', submenu: [['', 'Default'], ['serif', 'Serif'], ['mono', 'Mono']].map(([k, n]) => ({ label: n, check: (p.font || '') === k, onClick: () => { p.font = k; BP.touch(p); renderAll(); } })) },
      flag('small', 'Small text', 'A-'),
      flag('full', 'Full width', '↔'),
      p.type === 'db' ? null : flag('locked', 'Lock page', '🔒'),
      { divider: true },
      { label: p.favorite ? 'Remove from favorites' : 'Add to favorites', icon: BP.icons.star, onClick: () => { p.favorite = !p.favorite; BP.save(); renderAll(); } },
      { label: 'Copy link', icon: BP.icons.link, onClick: () => { navigator.clipboard.writeText('bp://page/' + p.id); BP.toast('Link copied. Paste it into another page to link here.'); } },
      p.rowOf ? null : { label: 'Move to…', icon: '↪', onClick: () => moveDialog(p) },
      { label: 'Page info', icon: 'ℹ', onClick: () => infoDialog(p) },
      { divider: true },
      { label: 'Page history', icon: BP.icons.clock, onClick: () => historyDialog(p) },
      { label: 'Duplicate', icon: BP.icons.copy, onClick: () => { const c = BP.clonePage(p.id); BP.open(c.id); } },
      { label: 'Save as template', icon: BP.icons.template, onClick: () => { BP.saveTemplate(p.id); BP.toast('Saved as a template. Find it under Templates.'); } },
      { label: 'Export / print…', icon: BP.icons.share, onClick: () => BP.shareDialog(p, 'export') },
      { label: 'Move to trash', icon: BP.icons.trash, danger: true, onClick: () => trashPage(p) },
    ]);
  }

  /* ---------- main / page view ---------- */
  function main() {
    const m = h('main', { class: 'main' });
    m.append(topbar());
    const area = h('div', { class: 'area' });
    const sc = h('div', { class: 'scroller' });
    area.append(sc);
    m.append(area);
    const p = cur();
    if (editor) { editor.destroy(); editor = null; BP.currentEditor = null; }
    if (!p) { sc.append(home()); return m; }
    sc.append(pageView(p));
    if (commentsOpen) area.append(commentsPanel(p));
    return m;
  }
  function home() {
    const box = h('div', { class: 'home' });
    box.append(h('img', { class: 'home-logo', src: 'assets/logo.svg', alt: 'Blockpad' }), h('h1', null, 'Welcome to Blockpad'), h('p', { class: 'muted' }, 'Everything here is stored on this computer. Pick a page or start a new one.'));
    box.append(h('div', { class: 'row-center' }, h('button', { class: 'btn primary', onclick: () => BP.newPage(null) }, 'New page'), h('button', { class: 'btn', onclick: openTemplates }, 'Templates'), h('button', { class: 'btn', onclick: openSearch }, 'Search')));
    const rec = BP.allPages().filter((p) => !BP.isTrashed(p) && !p.rowOf && !p.inline).sort((a, b) => b.updated - a.updated).slice(0, 8);
    if (rec.length) {
      box.append(h('h3', { class: 'home-sec' }, 'Recently edited'));
      const g = h('div', { class: 'home-grid' });
      rec.forEach((p) => g.append(h('button', { class: 'home-card', onclick: () => BP.open(p.id) }, h('span', { class: 'hc-ico' }, icoOf(p)), h('span', { class: 'hc-t' }, p.title || 'Untitled'), h('span', { class: 'muted small' }, BP.fmtDate(p.updated)))));
      box.append(g);
    }
    return box;
  }
  const coverClass = (c) => (c && c.startsWith('g:') ? 'cv-' + c.slice(2) : '');
  function pageView(p) {
    const trashed = BP.isTrashed(p);
    const wrap = h('div', { class: 'pagewrap' + (p.full || p.type === 'db' ? ' full' : '') + (p.small ? ' small' : '') + (p.font ? ' font-' + p.font : '') });
    if (trashed) {
      wrap.append(h('div', { class: 'banner' }, 'This page is in the trash.', h('button', { class: 'btn small', onclick: () => { BP.restore(p.id); renderAll(); } }, 'Restore'), h('button', { class: 'btn small danger', onclick: async () => { if (await BP.confirm('Delete forever', 'This permanently deletes the page and everything inside it.')) { BP.purge(p.id); BP.state.current = (BP.children(null)[0] || {}).id || null; renderAll(); } } }, 'Delete forever')));
    }
    // cover
    if (p.cover) {
      const cv = h('div', { class: 'cover ' + coverClass(p.cover), style: !p.cover.startsWith('g:') ? { backgroundImage: `url("${p.cover}")` } : {} },
        trashed ? null : h('div', { class: 'cover-act' }, h('button', { class: 'btn small', onclick: (e) => coverMenu(p, e.currentTarget) }, 'Change cover'), h('button', { class: 'btn small', onclick: () => { p.cover = null; BP.touch(p); renderAll(); } }, 'Remove')));
      wrap.append(cv);
    }
    const page = h('div', { class: 'page' });
    const head = h('div', { class: 'phead' });
    const viewer = BP.share.isViewer(p);
    const locked = trashed || p.locked || viewer;
    if (viewer) wrap.classList.add('viewer');
    if (p.icon) head.append(h('button', { class: 'page-icon', title: 'Change icon', onclick: (e) => !locked && BP.emojiPicker(e.currentTarget, (v) => { p.icon = v; BP.touch(p); renderAll(); }, true) }, p.icon));
    if (!locked) {
      const ctl = h('div', { class: 'phead-ctl' });
      if (!p.icon) ctl.append(h('button', { class: 'btn ghost small', onclick: (e) => BP.emojiPicker(e.currentTarget, (v) => { if (v) { p.icon = v; BP.touch(p); renderAll(); } }) }, '☺ Add icon'));
      if (!p.cover) ctl.append(h('button', { class: 'btn ghost small', onclick: (e) => coverMenu(p, e.currentTarget) }, '🖼 Add cover'));
      head.append(ctl);
    }
    const title = h('textarea', { class: 'title-in', rows: '1', placeholder: 'Untitled', readonly: locked ? '' : null, spellcheck: 'true' });
    title.value = p.title || '';
    const fit = () => { title.style.height = 'auto'; title.style.height = title.scrollHeight + 'px'; };
    title.addEventListener('input', () => { p.title = title.value.replace(/\n/g, ' '); fit(); BP.touch(p); refreshChrome(); });
    title.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (editor) { const f = editor.focusables()[0]; f ? BP.editorHelpers.setCaret(f, 'start') : editor.clickTail(); } else BP.$('.db-new') && BP.$('.db-new').click(); }
      else if (e.key === 'ArrowDown' && editor && title.selectionStart === title.value.length) { const f = editor.focusables()[0]; if (f) { e.preventDefault(); BP.editorHelpers.setCaret(f, 'start'); } }
    });
    head.append(title);
    page.append(head);
    requestAnimationFrame(fit);
    if (p.rowOf) { const rp = h('div', { class: 'rowprops' }); BP.renderRowProps(rp, p); page.append(rp, h('hr', { class: 'rp-hr' })); }
    if (p.type === 'db') {
      const box = h('div', { class: 'dbpage' });
      page.append(box);
      BP.renderDatabase(box, p, {});
    } else {
      const host = h('div', { class: 'edhost' });
      page.append(host);
      if (BP.share.loading(p)) page.append(h('div', { class: 'sh-loading' }, h('div', { class: 'sh-sk', style: { width: '92%' } }), h('div', { class: 'sh-sk', style: { width: '78%' } }), h('div', { class: 'sh-sk', style: { width: '85%' } }), h('div', { class: 'sh-sk', style: { width: '52%' } }), h('div', { class: 'sh-msg' }, h('i', { class: 'sh-spin' }), 'Loading shared content… waiting for the owner’s device to come online.')));
      editor = new BP.Editor(host, p, { readonly: locked });
      BP.currentEditor = editor;
      // children pages listed under the editor if the page has subpages without a link block (e.g. created in the sidebar before links existed)
    }
    wrap.append(page);
    return wrap;
  }
  function coverMenu(p, anchor) {
    BP.popover(anchor, (el, close) => {
      el.classList.add('cover-pop');
      el.append(h('b', null, 'Cover'));
      const g = h('div', { class: 'cover-grid' });
      GRADS.forEach((n) => g.append(h('button', { class: 'cover-sw cv-' + n, onclick: () => { p.cover = 'g:' + n; BP.touch(p); close(); renderAll(); } })));
      el.append(g, h('button', { class: 'btn wide', onclick: () => {
        close();
        const inp = h('input', { type: 'file', accept: 'image/*' });
        inp.onchange = () => { const f = inp.files[0]; if (!f) return; const fr = new FileReader(); fr.onload = () => { p.cover = fr.result; BP.touch(p); renderAll(); }; fr.readAsDataURL(f); };
        inp.click();
      } }, 'Upload an image'));
    });
  }

  /* ---------- comments (page-level and inline, with replies) ---------- */
  let focusCid = null;
  BP.openComments = (cid) => {
    commentsOpen = true;
    focusCid = cid || null;
    renderAll();
    if (cid) setTimeout(() => { const el = BP.$('.cm[data-cid="' + cid + '"]'); el && el.scrollIntoView({ block: 'center' }); }, 60);
  };
  function commentsPanel(p) {
    const box = h('aside', { class: 'comments' });
    box.append(h('div', { class: 'cm-head' }, h('b', null, 'Comments'), h('button', { class: 'icon-btn', html: BP.icons.x, onclick: () => { commentsOpen = false; focusCid = null; renderAll(); } })));
    const list = h('div', { class: 'cm-list' });
    const cs = (p.comments = p.comments || []);
    if (!cs.length) list.append(h('div', { class: 'muted pad-s' }, 'No comments yet. Select text and press 💬 to comment on it, or write a note on the whole page below.'));
    const jump = (c) => { const m = BP.$('.editor .cmt-' + c.id); if (m) { m.scrollIntoView({ block: 'center', behavior: 'smooth' }); m.classList.add('flash'); setTimeout(() => m.classList.remove('flash'), 1400); } };
    cs.forEach((c) => {
      c.replies = c.replies || [];
      const card = h('div', { class: 'cm' + (c.resolved ? ' resolved' : '') + (c.id === focusCid ? ' focus' : ''), 'data-cid': c.id });
      card.append(h('div', { class: 'cm-meta' }, h('b', null, c.author || 'You'), h('span', { class: 'muted small' }, BP.fmtDate(c.t))));
      if (c.quote) card.append(h('div', { class: 'cm-quote', title: 'Jump to the text', onclick: () => jump(c) }, '“' + c.quote + '”'));
      card.append(h('div', { class: 'cm-text' }, c.text));
      c.replies.forEach((r) => card.append(h('div', { class: 'cm-reply' }, h('div', { class: 'cm-meta' }, h('b', null, r.author || 'You'), h('span', { class: 'muted small' }, BP.fmtDate(r.t))), h('div', { class: 'cm-text' }, r.text))));
      if (!c.resolved) {
        const ri = h('input', { class: 'input small cm-ri', placeholder: 'Reply…' });
        ri.addEventListener('keydown', (e) => { if (e.key === 'Enter' && ri.value.trim()) { c.replies.push({ text: ri.value.trim(), t: Date.now(), author: BP.me() }); focusCid = c.id; BP.save(); renderAll(); } });
        card.append(ri);
      }
      card.append(h('div', { class: 'cm-act' },
        h('button', { class: 'btn ghost small', onclick: () => { c.resolved = !c.resolved; if (c.resolved) BP.removeCommentMarks(p, c.id); BP.touch(p); renderAll(); } }, c.resolved ? 'Reopen' : 'Resolve'),
        h('button', { class: 'btn ghost small', onclick: () => { p.comments = cs.filter((x) => x !== c); BP.removeCommentMarks(p, c.id); BP.touch(p); renderAll(); } }, 'Delete')));
      list.append(card);
    });
    const ta = h('textarea', { class: 'input', rows: '2', placeholder: 'Comment on the page…' });
    const send = () => { const t = ta.value.trim(); if (!t) return; cs.push({ id: uid(), text: t, t: Date.now(), resolved: false, replies: [], author: BP.me() }); BP.save(); renderAll(); };
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    box.append(list, h('div', { class: 'cm-new' }, ta, h('button', { class: 'btn primary', onclick: send }, 'Comment')));
    return box;
  }

  /* ---------- share / export ---------- */
  BP.exportRows = (body, p, close) => exportRows(body, p, close);
  function exportRows(body, p, close) {
    {
      const isDb = p.type === 'db';
      const name = BP.safeName(p.title);
      const nextFrame = () => new Promise((r) => setTimeout(r, 300));   // let the dialog disappear before printing the page behind it
      const saved = async (what, path) => { if (path) { BP.toast('Saved ' + what + (typeof path === 'string' ? ' · click to show' : ''), 5000); } };
      const row = (ico, title, desc, fn) => h('button', { class: 'share-row', onclick: fn }, h('span', { class: 'sr-ico' }, ico), h('span', { class: 'sr-t' }, h('b', null, title), h('small', null, desc)));
      body.append(h('p', { class: 'muted' }, 'Save a copy of this page as a file. (To work on a page together with other people, use the Invite tab.)'));
      body.append(
        row('📝', 'Markdown (.md)', isDb ? 'The database as a Markdown table' : 'Plain text with formatting, works in any editor', async () => saved('Markdown', await BP.download(name + '.md', BP.pageToMd(p), 'text/markdown'))),
        row('🌐', 'Web page (.html)', 'A self-contained page anyone can open in a browser', async () => saved('web page', await BP.download(name + '.html', BP.pageToHtml(p), 'text/html'))),
        row('📕', 'PDF (.pdf)', 'A print-quality PDF of this page, saved straight to a file', async () => {
          close();
          await nextFrame();
          if (!window.bp) return window.print();
          try { const f = await window.bp.savePdf(name + '.pdf'); if (f) BP.toast('Saved PDF', 4000); } catch (e) { BP.toast('Could not create the PDF: ' + e.message, 6000); }
        })
      );
      if (isDb) body.append(row('📊', 'CSV (.csv)', 'All rows and properties, opens in Excel or Sheets', async () => saved('CSV', await BP.download(name + '.csv', BP.dbToCsv(p), 'text/csv'))));
      if (window.bp) body.append(row('📁', 'Folder with sub-pages and files', 'Markdown for this page and everything inside it, images and files saved next to it', async () => {
        const files = BP.exportTree(p.id);
        try {
          const r = await window.bp.exportFolder(files);
          if (!r) return;
          close();
          BP.toast('Exported ' + r.count + ' file' + (r.count === 1 ? '' : 's') + ' to ' + r.dir, 6000);
          window.bp.showItem && window.bp.showItem(r.dir);
        } catch (e) { BP.toast('Export failed: ' + e.message, 6000); }
      }));
      body.append(
        row('🧩', 'Page data (.json)', 'This page and its sub-pages; re-importable into Blockpad', async () => { const ids = [p.id, ...BP.descendants(p.id)]; const pages = {}; ids.forEach((id) => (pages[id] = BP.state.pages[id])); saved('page data', await BP.download(name + '.blockpad.json', JSON.stringify({ v: 1, pages }, null, 1), 'application/json')); }),
        row('🖨', 'Print…', 'Send this page to a printer', async () => { close(); await nextFrame(); window.print(); }),
        row('📋', 'Copy as Markdown', 'Put the page text on your clipboard', () => { navigator.clipboard.writeText(BP.pageToMd(p)); BP.toast('Copied as Markdown'); }),
        row('🔗', 'Copy internal link', 'Paste inside another Blockpad page to link here', () => { navigator.clipboard.writeText('bp://page/' + p.id); BP.toast('Link copied'); })
      );
    }
  }
  /* ---------- move to / page info ---------- */
  function moveDialog(p) {
    BP.modal('Move “' + (p.title || 'Untitled') + '” to…', (body, close) => {
      const bad = new Set([p.id, ...BP.descendants(p.id)]);
      const list = h('div', { class: 'move-list' });
      const add = (label, ico, id, depth) => list.append(h('button', { class: 'move-item' + (id === (p.parent || null) ? ' cur' : ''), style: { paddingLeft: 10 + depth * 18 + 'px' }, onclick: () => { close(); if (BP.movePage(p.id, id)) { if (id) BP.page(id).open = true; BP.save(); renderAll(); BP.toast('Moved'); } else BP.toast('Can’t move a page into itself'); } }, h('span', null, ico), h('span', null, label)));
      add('Top level of the workspace', '🏠', null, 0);
      const walk = (parent, depth) => BP.children(parent).forEach((c) => { if (bad.has(c.id) || c.type === 'db') return; add(c.title || 'Untitled', c.icon || '📄', c.id, depth); walk(c.id, depth + 1); });
      walk(null, 1);
      body.append(list);
    }, { class: 'small' });
  }
  function infoDialog(p) {
    const md = p.type === 'db' ? '' : BP.pageToMd(p).replace(/^# .*\n/, '');
    const words = (md.match(/\S+/g) || []).length;
    const kids = BP.descendants(p.id).filter((id) => BP.page(id) && !BP.page(id).trashed).length;
    BP.modal('Page info', (body) => {
      const row = (k, v) => h('div', { class: 'info-row' }, h('span', { class: 'muted' }, k), h('b', null, String(v)));
      body.append(p.type === 'db' ? row('Rows', BP.rows(p.id).length) : row('Words', words), p.type === 'db' ? row('Properties', p.props.length) : row('Characters', md.length), row('Sub-pages / rows inside', kids), row('Created', BP.fmtDate(p.created) + (p.createdBy ? ' by ' + p.createdBy : '')), row('Last edited', BP.fmtDate(p.updated) + (p.editedBy ? ' by ' + p.editedBy : '')), row('Versions in history', (p.history || []).length), row('Comments', (p.comments || []).length));
    }, { class: 'small' });
  }

  /* ---------- history ---------- */
  function historyDialog(p) {
    BP.materializeHistory();
    if (p.type === 'db') return BP.toast('Databases keep their data in rows, which have their own history');
    BP.modal('Page history', (body, close) => {
      const hist = (p.history || []).slice().reverse();
      if (!hist.length) return body.append(h('p', { class: 'muted' }, 'No earlier versions yet. Versions are saved as you edit.'));
      const wrap = h('div', { class: 'hist' });
      const list = h('div', { class: 'hist-list' });
      const prev = h('div', { class: 'hist-prev' });
      let sel = null, pe = null;
      const show = (v, el) => {
        sel = v; list.querySelectorAll('.hist-item').forEach((x) => x.classList.toggle('on', x === el));
        prev.innerHTML = '';
        prev.append(h('h2', null, v.title || 'Untitled'));
        const host = h('div');
        prev.append(host);
        pe && pe.destroy();
        pe = new BP.Editor(host, { id: 'hist', type: 'page', blocks: JSON.parse(JSON.stringify(v.blocks)) }, { readonly: true });
      };
      hist.forEach((v, i) => { const el = h('button', { class: 'hist-item', onclick: () => show(v, el) }, BP.fmtDate(v.t), i === 0 ? h('span', { class: 'muted small' }, ' latest') : null); list.append(el); if (i === 0) setTimeout(() => show(v, el), 0); });
      wrap.append(list, prev);
      body.append(wrap, h('div', { class: 'row-end' }, h('button', { class: 'btn primary', onclick: () => {
        if (!sel) return;
        p.history.push({ t: Date.now(), title: p.title, blocks: JSON.parse(JSON.stringify(p.blocks)) });
        p.blocks = JSON.parse(JSON.stringify(sel.blocks)); p.title = sel.title; BP.touch(p); close(); renderAll(); BP.toast('Version restored');
      } }, 'Restore this version')));
    }, { class: 'wide' });
  }

  /* ---------- search ---------- */
  function openSearch() {
    BP.modal('', (body, close) => {
      const inp = h('input', { class: 'search-in', placeholder: 'Search pages and content…', autofocus: '' });
      const list = h('div', { class: 'search-list' });
      body.append(inp, list);
      let items = [], idx = 0;
      const all = () => BP.allPages().filter((p) => !BP.isTrashed(p));
      const snippet = (p, q) => {
        let found = '';
        const look = (blocks) => blocks.some((b) => { const t = BP.textOf(b.text || '') + ' ' + (b.type === 'code' ? b.text : ''); if (t.toLowerCase().includes(q)) { const i = t.toLowerCase().indexOf(q); found = t.slice(Math.max(0, i - 30), i + 60).trim(); return true; } return b.children ? look(b.children) : false; });
        look(p.blocks || []);
        return found;
      };
      const run = () => {
        const q = inp.value.trim().toLowerCase();
        list.innerHTML = '';
        items = [];
        if (!q) {
          list.append(h('div', { class: 'sr-head' }, 'Recent'));
          all().filter((p) => !p.inline).sort((a, b) => b.updated - a.updated).slice(0, 8).forEach((p) => items.push({ p }));
          items.push({ act: 'New page', fn: () => BP.newPage(null) }, { act: BP.state.settings.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', fn: () => BP.setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark') }, { act: 'Open settings', fn: () => openSettings() }, { act: 'Open trash', fn: openTrash });
        } else {
          const scored = [];
          all().forEach((p) => {
            const t = (p.title || 'Untitled').toLowerCase();
            let s = t === q ? 100 : t.startsWith(q) ? 80 : t.includes(q) ? 60 : 0;
            let sn = '';
            if (!s) { sn = snippet(p, q); if (sn) s = 20; }
            if (!s && p.type === 'db' === false && p.values && Object.values(p.values).some((v) => String(v).toLowerCase().includes(q))) s = 10;
            if (s) scored.push({ p, s, sn });
          });
          scored.sort((a, b) => b.s - a.s || b.p.updated - a.p.updated).slice(0, 30).forEach((x) => items.push(x));
          if (!items.length) list.append(h('div', { class: 'muted pad' }, 'No results'));
        }
        items.forEach((it, i) => {
          const row = h('div', { class: 'sr-item' + (i === idx ? ' on' : ''), onclick: () => pick(it) },
            it.p ? [h('span', { class: 'sr-ico' }, icoOf(it.p)), h('span', { class: 'sr-main' }, h('b', null, it.p.title || 'Untitled'), it.sn ? h('small', null, '…' + it.sn + '…') : h('small', null, BP.path(it.p).slice(0, -1).map((x) => x.title || 'Untitled').join(' / '))), h('span', { class: 'muted small' }, BP.fmtDay(new Date(it.p.updated).toISOString().slice(0, 10)))] : [h('span', { class: 'sr-ico' }, '⌘'), h('span', { class: 'sr-main' }, h('b', null, it.act))]);
          row.addEventListener('mouseenter', () => { idx = i; list.querySelectorAll('.sr-item').forEach((x, j) => x.classList.toggle('on', j === i)); });
          list.append(row);
        });
      };
      const pick = (it) => { close(); setTimeout(() => (it.p ? BP.open(it.p.id) : it.fn()), 0); };
      inp.addEventListener('input', () => { idx = 0; run(); });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { idx = Math.min(items.length - 1, idx + 1); e.preventDefault(); run(); list.querySelector('.on') && list.querySelector('.on').scrollIntoView({ block: 'nearest' }); }
        else if (e.key === 'ArrowUp') { idx = Math.max(0, idx - 1); e.preventDefault(); run(); list.querySelector('.on') && list.querySelector('.on').scrollIntoView({ block: 'nearest' }); }
        else if (e.key === 'Enter' && items[idx]) pick(items[idx]);
      });
      run();
      setTimeout(() => inp.focus(), 20);
    }, { class: 'search', bare: true });
  }

  /* ---------- trash ---------- */
  function openTrash() {
    BP.modal('Trash', (body, close) => {
      const draw = () => {
        body.innerHTML = '';
        const items = BP.allPages().filter((p) => p.trashed).sort((a, b) => (b.trashedAt || 0) - (a.trashedAt || 0));
        if (!items.length) return body.append(h('p', { class: 'muted' }, 'Trash is empty.'));
        const list = h('div', { class: 'trash-list' });
        items.forEach((p) => list.append(h('div', { class: 'trash-row' }, h('span', null, icoOf(p)), h('span', { class: 'tr-t' }, p.title || 'Untitled'), h('span', { class: 'muted small' }, p.trashedAt ? BP.fmtDate(p.trashedAt) : ''),
          h('button', { class: 'btn small', onclick: () => { BP.restore(p.id); draw(); renderAll(); } }, 'Restore'),
          h('button', { class: 'btn small danger', onclick: async () => { if (await BP.confirm('Delete forever', 'Permanently delete “' + (p.title || 'Untitled') + '” and its contents?')) { BP.purge(p.id); if (!BP.page(BP.state.current)) BP.state.current = null; draw(); renderAll(); } } }, 'Delete'))));
        body.append(list, h('div', { class: 'row-end' }, h('button', { class: 'btn danger', onclick: async () => { if (await BP.confirm('Empty trash', 'Permanently delete all ' + items.length + ' items?', 'Empty trash')) { items.forEach((p) => BP.state.pages[p.id] && BP.purge(p.id)); if (!BP.page(BP.state.current)) BP.state.current = null; draw(); renderAll(); } } }, 'Empty trash')));
      };
      draw();
    });
  }

  /* ---------- templates ---------- */
  function openTemplates() {
    const b = (type, text, extra) => Object.assign(BP.newBlock(type, text), extra || {});
    const todoCols = (days) => { const g = BP.editorHelpers.makeBlock('columns'); g.children = days.map((d) => ({ id: uid(), type: 'column', children: [b('h3', d), b('todo', ''), b('todo', '')] })); return g; };
    const dbWith = (title, icon, props, rows, views) => {
      const db = BP.createDatabase(null, { title, icon });
      const st = db.props[1];
      db.props = [db.props[0]].concat(props.map((p) => Object.assign({ id: uid(), w: 150 }, p)));
      const byName = Object.fromEntries(db.props.map((p) => [p.name, p]));
      db.views = views.map((v) => Object.assign({ id: uid(), filters: [], sorts: [], hidden: [] }, v, v.groupByName ? { groupBy: byName[v.groupByName].id } : {}, v.dateName ? { dateProp: byName[v.dateName].id } : {}));
      rows.forEach((r) => {
        const vals = {};
        Object.keys(r.v || {}).forEach((k) => { const p = byName[k]; let val = r.v[k]; if (['select', 'status'].includes(p.type)) val = (p.options.find((o) => o.name === val) || {}).id; vals[p.id] = val; });
        BP.addRow(db.id, r.t, vals);
      });
      return db;
    };
    const opts = (names) => names.map((n, i) => ({ id: uid(), name: n, color: BP.COLORS[(i * 2 + 1) % 9] }));
    const T = [
      ['📝', 'Meeting notes', 'Agenda, notes and action items', () => BP.createPage(null, { title: 'Meeting notes', icon: '📝', blocks: [b('h2', 'Details'), b('bullet', '<b>Date:</b> '), b('bullet', '<b>Attendees:</b> '), b('h2', 'Agenda'), b('number', ''), b('number', ''), b('h2', 'Notes'), b('p', ''), b('h2', 'Action items'), b('todo', ''), b('todo', '')] })],
      ['📅', 'Weekly planner', 'Plan each weekday in columns', () => BP.createPage(null, { title: 'Weekly planner', icon: '📅', blocks: [b('p', 'Top priority this week:'), todoCols(['Mon', 'Tue', 'Wed']), todoCols(['Thu', 'Fri', 'Weekend'])] })],
      ['📓', 'Journal entry', 'A daily page with prompts', () => BP.createPage(null, { title: new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }), icon: '📓', blocks: [b('callout', 'Take two minutes to write without editing.', { icon: '✍️' }), b('h3', 'Highlights'), b('bullet', ''), b('h3', 'What I learned'), b('p', ''), b('h3', 'Tomorrow'), b('todo', '')] })],
      ['🚀', 'Project tracker', 'Database with board and table views', () => dbWith('Project tracker', '🚀', [{ name: 'Status', type: 'status', options: opts(['Backlog', 'In progress', 'Review', 'Done']) }, { name: 'Owner', type: 'text' }, { name: 'Due', type: 'date' }, { name: 'Priority', type: 'select', options: [{ id: uid(), name: 'High', color: 'red' }, { id: uid(), name: 'Medium', color: 'yellow' }, { id: uid(), name: 'Low', color: 'green' }] }], [{ t: 'Define scope', v: { Status: 'Done', Priority: 'High' } }, { t: 'Build prototype', v: { Status: 'In progress', Priority: 'High' } }, { t: 'User feedback', v: { Status: 'Backlog', Priority: 'Medium' } }], [{ type: 'board', name: 'Board', groupByName: 'Status' }, { type: 'table', name: 'Table' }, { type: 'calendar', name: 'Calendar', dateName: 'Due' }])],
      ['📚', 'Reading list', 'Books and articles as a gallery', () => dbWith('Reading list', '📚', [{ name: 'Status', type: 'status', options: opts(['To read', 'Reading', 'Finished']) }, { name: 'Author', type: 'text' }, { name: 'Rating', type: 'number' }, { name: 'Link', type: 'url' }], [{ t: 'A book to start with', v: { Status: 'To read' } }], [{ type: 'gallery', name: 'Gallery' }, { type: 'table', name: 'Table' }])],
      ['🗂', 'Blank database', 'An empty table to shape yourself', () => BP.createDatabase(null, { title: 'Untitled database', icon: '🗂' })],
    ];
    BP.modal('Templates', (body, close) => {
      const g = h('div', { class: 'tpl-grid' });
      T.forEach(([ico, name, desc, fn]) => g.append(h('button', { class: 'tpl', onclick: () => { close(); const p = fn(); BP.open(p.id); } }, h('span', { class: 'tpl-ico' }, ico), h('b', null, name), h('small', null, desc))));
      body.append(g);
      const mine = BP.state.templates || [];
      body.append(h('h3', { class: 'tpl-h' }, 'My templates'));
      if (!mine.length) body.append(h('p', { class: 'muted small' }, 'Open any page, then ⋯ → Save as template. It will show up here, and you can reuse it any time.'));
      const g2 = h('div', { class: 'tpl-grid' });
      mine.forEach((t) => g2.append(h('div', { class: 'tpl mine' },
        h('button', { class: 'tpl-use', onclick: () => { close(); const p = BP.useTemplate(t, null); BP.open(p.id); } }, h('span', { class: 'tpl-ico' }, t.icon || '📄'), h('b', null, t.name), h('small', null, Object.keys(t.pages).length + (Object.keys(t.pages).length === 1 ? ' page' : ' pages'))),
        h('button', { class: 'icon-btn tpl-del', title: 'Delete template', html: BP.icons.trash, onclick: () => { BP.state.templates = mine.filter((x) => x !== t); BP.save(); close(); openTemplates(); } }))));
      body.append(g2);
    }, { class: 'wide' });
  }

  /* ---------- settings ---------- */
  async function openSettings(tab) {
    const dataPath = window.bp ? await window.bp.dataPath() : 'Browser local storage';
    BP.modal('Settings', (body, close) => {
      const tabs = h('div', { class: 'set-tabs' });
      const pane = h('div', { class: 'set-pane' });
      const names = [['general', 'General'], ['members', 'Members'], ['sharing', 'Sharing'], ['ai', 'AI'], ['api', 'Local API'], ['data', 'Data, backup & sync'], ['keys', 'Shortcuts'], ['about', 'About']];
      const show = (k) => {
        tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.k === k));
        pane.innerHTML = '';
        ({ general, members, sharing: (p) => BP.shareSettings(p), ai, api, data, keys, about }[k])(pane, close);
      };
      names.forEach(([k, n]) => tabs.append(h('button', { 'data-k': k, onclick: () => show(k) }, n)));
      body.append(h('div', { class: 'set' }, tabs, pane));
      show(tab || 'general');
    }, { class: 'wide settings' });
    function general(p) {
      p.append(h('h3', null, 'Appearance'));
      const seg = h('div', { class: 'seg' });
      [['auto', 'System'], ['light', 'Light'], ['dark', 'Dark']].forEach(([k, n]) => seg.append(h('button', { class: BP.state.settings.theme === k ? 'on' : '', onclick: (e) => { BP.setTheme(k); seg.querySelectorAll('button').forEach((x) => x.classList.remove('on')); e.currentTarget.classList.add('on'); } }, n)));
      p.append(seg, h('h3', null, 'Workspace name'));
      const inp = h('input', { class: 'input', value: BP.state.settings.name || '' });
      inp.addEventListener('change', () => { BP.state.settings.name = inp.value || 'My Workspace'; BP.save(); refreshSidebar(); });
      p.append(inp);
    }
    function data(p) {
      p.append(h('h3', null, 'Where your data lives'), h('p', { class: 'muted' }, 'Everything is stored in one file on this computer. Nothing is uploaded.'), h('code', { class: 'pathbox' }, dataPath));
      if (window.bp) {
        p.append(h('div', { class: 'row-gap' },
          h('button', { class: 'btn', onclick: async () => {
            const r = await window.bp.chooseDir();
            if (!r) return;
            const go = async (useExisting) => { await BP.flush(); await window.bp.setDir(r.dir, useExisting); if (useExisting) { await BP.reload(); } BP.toast('Workspace is now stored in ' + r.dir, 5000); };
            if (r.existing) BP.modal('That folder already has a workspace', (body, close) => body.append(h('p', { class: 'muted' }, 'Use the workspace that is already there, or replace it with the one you have open now?'), h('div', { class: 'row-end' }, h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn', onclick: () => { close(); go(true); } }, 'Use the existing one'), h('button', { class: 'btn danger', onclick: () => { close(); go(false); } }, 'Replace it'))), { class: 'small' });
            else go(false);
          } }, 'Change storage folder…'),
          h('button', { class: 'btn', onclick: async () => { await BP.flush(); await window.bp.resetDir(); await BP.reload(); BP.toast('Back to the default folder'); } }, 'Use default folder')));
        p.append(h('p', { class: 'muted small' }, 'Sync between devices: pick a folder that OneDrive, Dropbox, Syncthing or similar keeps in sync. Blockpad notices when another device changes the file and merges page by page (the newest edit of each page wins). It is not live co-editing.'));
      }
      if (window.bp) p.append(h('button', { class: 'btn', onclick: () => window.bp.reveal() }, 'Show in folder'));
      p.append(h('h3', null, 'Backup'), h('div', { class: 'row-gap' },
        h('button', { class: 'btn', onclick: BP.exportWorkspace }, 'Export full backup (.json)'),
        h('button', { class: 'btn', onclick: () => pickText('.json', (t) => importBackup(t)) }, 'Import backup…')));
      p.append(h('h3', null, 'Import'), h('div', { class: 'row-gap' }, h('button', { class: 'btn', onclick: () => { const i = h('input', { type: 'file', accept: '.csv,.tsv,.txt' }); i.onchange = async () => { const f = i.files[0]; if (!f) return; try { const r = BP.importCsv(await f.text(), null, null, f.name.replace(/\.\w+$/, '')); BP.toast('Created a database with ' + r.added + ' rows'); BP.open(r.db.id); } catch (e) { BP.toast('Import failed: ' + e.message); } }; i.click(); } }, 'Import CSV as a database…'), h('button', { class: 'btn', onclick: () => { const i = h('input', { type: 'file', accept: '.md,.markdown,.txt', multiple: '' }); i.onchange = async () => { let n = 0, last; for (const f of i.files) { last = BP.importMarkdown(f.name, await f.text(), null); n++; } if (n) { BP.toast('Imported ' + n + ' page' + (n > 1 ? 's' : '')); BP.open(last.id); } }; i.click(); } }, 'Import Markdown files…')));
      p.append(h('h3', null, 'Danger zone'), h('button', { class: 'btn danger', onclick: async () => { if (await BP.confirm('Reset workspace', 'This erases every page and starts fresh. Export a backup first if you might want anything back.', 'Erase everything')) { BP.allowOverwrite = true; BP.corrupted = false; BP.state = { v: 1, pages: {}, settings: BP.state.settings, current: null }; BP.seed(); await BP.flush(); nav.stack = []; nav.i = -1; renderAll(); BP.toast('Workspace reset'); } } }, 'Reset workspace…'));
    }
    function keys(p) {
      const K = [['Ctrl+K / Ctrl+P', 'Search'], ['Ctrl+N', 'New page'], ['Ctrl+\\', 'Toggle sidebar'], ['Ctrl+,', 'Settings'], ['Alt+← / Alt+→', 'Back / forward'], ['Ctrl+Z / Ctrl+Y', 'Undo / redo'], ['/', 'Insert a block'], ['@', 'Mention a page'], ['Ctrl+B / I / U', 'Bold / italic / underline'], ['Ctrl+E', 'Inline code'], ['Ctrl+K (with text selected)', 'Add link'], ['Ctrl+Shift+S', 'Strikethrough'], ['Tab / Shift+Tab', 'Nest / un-nest a block'], ['Ctrl+Enter', 'Toggle to-do or toggle'], ['Esc', 'Close menus']];
      const t = h('table', { class: 'keys' });
      K.forEach(([k, d]) => t.append(h('tr', null, h('td', null, h('span', { class: 'kbd' }, k)), h('td', null, d))));
      p.append(t);
    }
    function members(p) {
      const s = BP.state.settings;
      p.append(h('h3', null, 'Your name'), h('p', { class: 'muted small' }, 'Used for “Created by”, “Last edited by”, comments and verification stamps.'));
      const me = h('input', { class: 'input', value: s.userName });
      me.addEventListener('change', () => { s.userName = me.value.trim() || 'You'; BP.save(); });
      p.append(me, h('h3', null, 'People'), h('p', { class: 'muted small' }, 'Names you can assign in “People” properties. Blockpad has no accounts, so this is a simple list.'));
      const list = h('div', { class: 'people-list' });
      const draw = () => {
        list.innerHTML = '';
        s.people.forEach((n, i) => list.append(h('div', { class: 'f-row' }, h('input', { class: 'input small', value: n, onchange: (e) => { const nv = e.target.value.trim(); if (nv) { BP.allPages().forEach((pg) => pg.values && Object.keys(pg.values).forEach((k) => { if (Array.isArray(pg.values[k])) pg.values[k] = pg.values[k].map((x) => (x === n ? nv : x)); })); s.people[i] = nv; BP.save(); } } }), h('button', { class: 'icon-btn', html: BP.icons.trash, onclick: () => { s.people.splice(i, 1); BP.save(); draw(); } }))));
        if (!s.people.length) list.append(h('div', { class: 'muted small' }, 'No people yet.'));
      };
      draw();
      const add = h('input', { class: 'input small', placeholder: 'Add a name and press Enter' });
      add.addEventListener('keydown', (e) => { if (e.key === 'Enter' && add.value.trim() && !s.people.includes(add.value.trim())) { s.people.push(add.value.trim()); add.value = ''; BP.save(); draw(); } });
      p.append(list, add);
    }
    function ai(p) {
      const a = BP.state.settings.ai;
      const l = a.local;
      if (!(window.bp && window.bp.llm)) {       // browser / phone: the built-in engine only exists in the desktop apps
        p.append(h('div', { class: 'ai-status' }, h('span', { class: 'ai-dot' }), h('span', { class: 'small' }, 'The built-in offline AI runs in the Blockpad desktop apps (Windows, Mac, Linux). In the browser you can use your own endpoint, such as Ollama on your computer.')));
        return aiCustom(p, a);
      }
      const pick = (prov) => h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'aiprov', checked: (a.provider === prov) ? '' : null, onchange: () => { a.provider = prov; BP.save(); p.innerHTML = ''; ai(p); BP.paintAiChip(); } }), prov === 'builtin' ? ' Built-in AI (runs on this computer, no key)' : ' My own endpoint (Ollama / OpenAI-compatible)');
      p.append(h('div', { class: 'row-gap' }, pick('builtin'), pick('custom')));
      if (a.provider === 'custom') return aiCustom(p, a);
      const gb = (mb) => (mb / 1024).toFixed(1) + ' GB';
      p.append(h('h3', null, 'Built-in AI'), h('p', { class: 'muted small' }, 'A small open model that runs fully on this computer: no account, no API key, nothing is sent anywhere. It only uses memory while it is on, and Stop releases all of it. It is small, so expect helpful but not brilliant answers.'));
      const dot = h('span', { class: 'ai-dot' }), stat = h('span', { class: 'small' }), sw = h('button', { class: 'btn' }, 'Start AI');
      sw.onclick = () => BP.llm.toggle();
      p.append(h('div', { class: 'row-gap ai-status' }, dot, stat, h('div', { class: 'grow' }), sw));
      const sel = h('select', { class: 'input' }), dlBtn = h('button', { class: 'btn small' }), bar = h('div', { class: 'ai-bar' }, h('i')), note = h('div', { class: 'muted small' });
      sel.addEventListener('change', async () => { if (BP.llm.st.state === 'running') await BP.llm.stop(); l.model = sel.value; BP.save(); paint(BP.llm.st); });
      p.append(h('label', { class: 'muted' }, 'Model'), h('div', { class: 'row-gap' }, sel, dlBtn), bar);
      const rng = h('input', { type: 'range', min: '10', max: '25', step: '1' }); rng.value = l.ramPct;
      const rlab = h('span', { class: 'small' });
      rng.addEventListener('input', () => { l.ramPct = +rng.value; paint(BP.llm.st); });
      rng.addEventListener('change', () => { BP.save(); if (BP.llm.st.state === 'running') BP.toast('New memory limit applies the next time you start the AI.', 3500); });
      p.append(h('label', { class: 'muted' }, 'Memory limit (share of your RAM)'), h('div', { class: 'row-gap' }, rng, rlab), note);
      const idle = h('select', { class: 'input small' }, ...[[5, '5 min'], [10, '10 min'], [30, '30 min'], [60, '1 hour'], [0, 'Never']].map(([v, t]) => h('option', { value: String(v), selected: l.idleMin === v ? '' : null }, t)));
      idle.addEventListener('change', () => { l.idleMin = +idle.value; BP.save(); });
      const auto = h('input', { type: 'checkbox', checked: l.autoStart ? '' : null, onchange: () => { l.autoStart = auto.checked; BP.save(); } });
      p.append(h('label', { class: 'muted' }, 'Turn off by itself after being idle for'), idle, h('label', { class: 'row-gap small' }, auto, 'Start automatically when I use an AI action'));
      const out = h('div', { class: 'muted small' });
      p.append(h('button', { class: 'btn', onclick: async () => { out.textContent = 'Testing…'; try { const r = await BP.aiChat([{ role: 'user', content: 'Reply with the single word OK.' }]); out.textContent = '✔ It works. The model said: ' + r.slice(0, 60); } catch (e) { out.textContent = '✗ ' + e.message; } } }, 'Test the AI'), out,
        h('p', { class: 'muted small' }, 'Use it with “/Ask AI”, the ✨ button in the selection toolbar, or ⋮⋮ → Ask AI about this block. The 🧠 chip at the top turns it on and off any time. Models are downloaded once from Hugging Face; after that nothing needs the internet.'));
      function paint(st) {
        if (!p.isConnected) return;
        const m = (st.models || []).find((x) => x.id === l.model) || {};
        const limit = Math.round((st.totalMB || 0) * l.ramPct / 100);
        rlab.textContent = l.ramPct + '% of ' + gb(st.totalMB || 0) + ' = ' + gb(limit);
        const s = st.state;
        dot.className = 'ai-dot ' + s;
        stat.textContent = s === 'running' ? 'On · using ' + st.rssMB + ' MB of the ' + st.budgetMB + ' MB limit' : s === 'starting' ? 'Starting…' : s === 'stopping' ? 'Stopping…' : s === 'error' ? '⚠ ' + st.error : 'Off' + (st.error ? ' · ' + st.error : '');
        sw.textContent = s === 'running' ? 'Stop AI' : s === 'starting' ? 'Starting…' : 'Start AI';
        sw.disabled = s === 'starting' || s === 'stopping' || (!m.installed && s !== 'running');
        sel.innerHTML = '';
        (st.models || []).forEach((x) => sel.append(h('option', { value: x.id, selected: x.id === l.model ? '' : null }, x.name + ' — ' + (x.sizeMB >= 1024 ? gb(x.sizeMB) : x.sizeMB + ' MB') + (x.installed ? ' ✓' : ''))));
        const d = st.download;
        if (d && d.id === l.model) { dlBtn.textContent = 'Cancel'; dlBtn.onclick = () => window.bp.llm.cancel(); bar.style.display = ''; bar.firstChild.style.width = Math.round(100 * d.done / Math.max(1, d.total)) + '%'; }
        else { bar.style.display = 'none'; dlBtn.disabled = !!d; if (m.installed) { dlBtn.textContent = 'Remove'; dlBtn.onclick = async () => { if (await BP.confirm('Remove ' + m.name + ' from this computer? You can download it again later.')) window.bp.llm.remove(m.id); }; } else { dlBtn.textContent = 'Download'; dlBtn.onclick = async () => { const r = await window.bp.llm.download(m.id); if (r.error) BP.toast(r.error, 6000); }; } }
        const tooBig = m.needMB && limit < m.needMB;
        note.textContent = tooBig ? '⚠ This model needs about ' + m.needMB + ' MB, more than the ' + limit + ' MB limit. Raise the limit or choose a smaller model.' : 'The AI never starts above this limit, and is stopped automatically if it ever exceeds it.';
        note.style.color = tooBig ? '#c4391d' : '';
      }
      const off = BP.llm.on(paint);
      const poll = setInterval(() => { if (!p.isConnected) { clearInterval(poll); off(); } else BP.llm.refresh(); }, 2000);
      paint(BP.llm.st); BP.llm.refresh();
    }
    function aiCustom(p, a) {
      p.append(h('h3', null, 'Bring your own AI'), h('p', { class: 'muted small' }, 'Sends nothing anywhere until you set an endpoint here. Use a local model with Ollama (nothing leaves your computer) or any OpenAI-compatible service.'));
      const ep = h('input', { class: 'input', value: a.endpoint, placeholder: 'http://localhost:11434/v1' });
      const md = h('input', { class: 'input', value: a.model, placeholder: 'llama3.2' });
      const key = h('input', { class: 'input', type: 'password', value: a.key, placeholder: 'API key (not needed for Ollama)' });
      [ep, md, key].forEach((i) => i.addEventListener('change', () => { a.endpoint = ep.value.trim(); a.model = md.value.trim(); a.key = key.value.trim(); BP.save(); }));
      p.append(h('div', { class: 'row-gap' }, h('button', { class: 'btn small', onclick: () => { ep.value = 'http://localhost:11434/v1'; md.value = md.value || 'llama3.2'; key.value = ''; ep.dispatchEvent(new Event('change')); } }, 'Use Ollama (local)'), h('button', { class: 'btn small', onclick: () => { ep.value = 'https://api.openai.com/v1'; md.value = 'gpt-4o-mini'; ep.dispatchEvent(new Event('change')); } }, 'Use OpenAI-compatible')),
        h('label', { class: 'muted' }, 'Endpoint'), ep, h('label', { class: 'muted' }, 'Model'), md, h('label', { class: 'muted' }, 'API key'), key);
      const out = h('div', { class: 'muted small' });
      p.append(h('button', { class: 'btn', onclick: async () => { ep.dispatchEvent(new Event('change')); out.textContent = 'Testing…'; try { const r = await BP.aiChat([{ role: 'user', content: 'Reply with the single word OK.' }]); out.textContent = '✔ Connected. The model said: ' + r.slice(0, 60); } catch (e) { out.textContent = '✗ ' + e.message; } } }, 'Test connection'), out,
        h('p', { class: 'muted small' }, 'Use it with “/Ask AI”, the ✨ button in the selection toolbar, or ⋮⋮ → Ask AI about this block. Your text is sent to the endpoint above only when you pick an AI action.'));
    }
    function api(p) {
      const a = BP.state.settings.api;
      p.append(h('h3', null, 'Local REST API'), h('p', { class: 'muted small' }, 'Lets your own scripts read and write pages and databases while Blockpad is running. It listens only on this computer (127.0.0.1), needs the token below, and is off until you turn it on.'));
      const status = h('div', { class: 'muted small' });
      const tok = h('code', { class: 'pathbox' }, a.token || '(created when you enable it)');
      const apply = async () => {
        if (a.enabled && !a.token) a.token = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');
        BP.save();
        tok.textContent = a.token || '(created when you enable it)';
        if (!window.bp) return (status.textContent = 'The API needs the desktop app.');
        const r = await window.bp.apiConfigure({ enabled: a.enabled, port: a.port, token: a.token });
        status.textContent = a.enabled ? (r.ok ? '● Running at http://127.0.0.1:' + a.port + '/api' : '✗ ' + r.error) : 'Stopped.';
        if (a.enabled && !r.ok) { a.enabled = false; en.checked = false; BP.save(); }
      };
      const en = h('input', { type: 'checkbox', checked: a.enabled ? '' : null, onchange: () => { a.enabled = en.checked; apply(); } });
      const port = h('input', { class: 'input small', type: 'number', min: '1024', max: '65535', value: a.port });
      port.addEventListener('change', () => { a.port = Math.max(1024, Math.min(65535, +port.value || 7878)); if (a.enabled) apply(); else BP.save(); });
      p.append(h('label', { class: 'chk' }, en, ' Enable the local API'), h('div', { class: 'f-row' }, h('span', { class: 'muted' }, 'Port'), port), h('span', { class: 'muted' }, 'Token'), tok,
        h('div', { class: 'row-gap' }, h('button', { class: 'btn small', onclick: () => { navigator.clipboard.writeText(a.token || ''); BP.toast('Token copied'); } }, 'Copy token'), h('button', { class: 'btn small', onclick: () => { a.token = ''; if (a.enabled) apply(); else { tok.textContent = '(created when you enable it)'; BP.save(); } } }, 'Regenerate')), status);
      p.append(h('h3', null, 'Example'), h('code', { class: 'pathbox pre' }, 'curl -H "Authorization: Bearer <token>" http://127.0.0.1:' + a.port + '/api/pages\ncurl -X POST -H "Authorization: Bearer <token>" -d \'{"title":"From a script","markdown":"# Hello"}\' http://127.0.0.1:' + a.port + '/api/pages\n\nEndpoints: GET/POST /api/pages · GET/PATCH/DELETE /api/pages/:id · GET /api/databases · GET/POST /api/databases/:id/rows · PATCH /api/rows/:id · GET /api/search?q='));
      if (a.enabled && window.bp) apply();
    }
    function about(p) {
      p.append(h('div', { class: 'about' }, h('img', { src: 'assets/logo.svg', alt: '', width: 72, height: 72 }), h('div', null, h('h2', null, 'Blockpad'), h('p', { class: 'muted' }, 'Version ' + (BP.appVersion || '') + ' · local-first notes, wiki and databases'))),
        h('p', null, 'Blockpad is an independent app inspired by block-based workspaces. It is not affiliated with, endorsed by, or built from any other product’s code, logos or content.'),
        h('p', { class: 'muted' }, 'No account, no server, no telemetry. Works fully offline. The installed apps only contact the Blockpad site to check whether a newer version exists.'),
        BP.isInstalledApp ? h('button', { class: 'btn', onclick: () => BP.checkUpdate(true) }, 'Check for updates') : '');
    }
  }
  function pickText(accept, cb) {
    const i = h('input', { type: 'file', accept });
    i.onchange = async () => i.files[0] && cb(await i.files[0].text(), i.files[0].name);
    i.click();
  }
  function importBackup(text) {
    let st;
    try { st = JSON.parse(text); if (!st.pages) throw new Error('Not a Blockpad backup'); } catch (e) { return BP.toast('That file is not a valid backup: ' + e.message); }
    BP.modal('Import backup', (body, close) => {
      body.append(h('p', { class: 'muted' }, 'The file contains ' + Object.keys(st.pages).length + ' pages. How do you want to import it?'),
        h('div', { class: 'row-end' }, h('button', { class: 'btn', onclick: close }, 'Cancel'),
          h('button', { class: 'btn', onclick: () => { BP.importWorkspaceText(text, 'merge'); close(); renderAll(); BP.toast('Merged'); } }, 'Merge (keep my pages)'),
          h('button', { class: 'btn danger', onclick: () => { BP.importWorkspaceText(text, 'replace'); close(); nav.stack = []; nav.i = -1; renderAll(); BP.toast('Backup restored'); } }, 'Replace everything')));
    }, { class: 'small' });
  }

  /* ---------- global shortcuts ---------- */
  document.addEventListener('keydown', (e) => {
    if (!BP.state) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && (k === 'k' || k === 'p') && !e.shiftKey && !(k === 'k' && getSelection().toString() && document.activeElement.closest && document.activeElement.closest('.txt'))) { e.preventDefault(); return openSearch(); }
    if (mod && k === 'n' && !e.shiftKey) { e.preventDefault(); return BP.newPage(null); }
    if (mod && k === '\\') { e.preventDefault(); return toggleSidebar(); }
    if (mod && k === ',') { e.preventDefault(); return openSettings(); }
    if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); return go(-1); }
    if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); return go(1); }
    if (mod && (k === 'z' || k === 'y') && editor && !BP.$('.modal-back')) {
      const inEditor = editor.root.contains(document.activeElement) || document.activeElement === document.body;
      const t = document.activeElement;
      if (inEditor && !(t && (t.classList.contains('title-in') || (t.tagName === 'INPUT' && !t.closest('.editor'))))) {
        e.preventDefault();
        if (k === 'y' || e.shiftKey) editor.redo(); else editor.undo();
      }
    }
    if (e.key === 'F12') window.bp && window.bp.devtools();
  });
  // open internal links anywhere in the app
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (/^https?:/.test(href) && !a.closest('.editor')) { e.preventDefault(); window.open(href, '_blank'); }
  });
  // drop files onto the window
  document.addEventListener('dragover', (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files') && e.preventDefault());
  document.addEventListener('drop', async (e) => {
    if (!e.dataTransfer || !e.dataTransfer.files.length || BP.dragId || BP.dragPage) return;
    e.preventDefault();
    const files = [...e.dataTransfer.files];
    const md = files.filter((f) => /\.(md|markdown|txt)$/i.test(f.name));
    let last;
    for (const f of md) last = BP.importMarkdown(f.name, await f.text(), null);
    if (last) { BP.toast('Imported ' + md.length + ' file(s)'); BP.open(last.id); }
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (imgs.length && editor && !editor.readonly) {
      for (const f of imgs) {
        const src = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
        const nb = Object.assign(BP.newBlock('image'), { src, caption: '' });
        editor.mutate(() => { const p = editor.page.blocks; p.splice(p.length - (p[p.length - 1] && p[p.length - 1].type === 'p' && !p[p.length - 1].text ? 1 : 0), 0, nb); });
      }
    }
  });

  /* ---------- boot ---------- */
  BP.boot = async function () {
    await BP.init();
    applyTheme();
    if (BP.corrupted) BP.toast('Your workspace file could not be read. A backup copy (workspace.bak.json) is kept next to it; changes are not being saved until you reset or import a backup.', 9000);
    if (BP.state.current && !BP.page(BP.state.current)) BP.state.current = null;
    if (BP.state.current && BP.isTrashed(BP.page(BP.state.current))) BP.state.current = null;
    if (BP.state.current) { nav.stack = [BP.state.current]; nav.i = 0; }
    renderAll();
  };
  BP.renderAll = renderAll;
  BP.openSettings = (tab) => openSettings(tab);
  BP.reload = async function () {
    BP.corrupted = false;
    await BP.init();
    applyTheme();
    if (BP.state.current && !BP.page(BP.state.current)) BP.state.current = null;
    nav.stack = BP.state.current ? [BP.state.current] : [];
    nav.i = nav.stack.length - 1;
    renderAll();
  };
  window.addEventListener('DOMContentLoaded', async () => {
    await BP.boot();
    BP.share.init();
    if (small() && BP.state.settings.sidebar) { BP.state.settings.sidebar = false; renderAll(); }
    /* rotating a phone or resizing the window across the phone breakpoint: drawer closed on small screens, sidebar docked on large ones */
    let wasSmall = small();
    matchMedia('(max-width: 760px)').addEventListener('change', () => { const now = small(); if (now === wasSmall) return; wasSmall = now; BP.state.settings.sidebar = !now; renderAll(); });
    BP.$('#app').addEventListener('click', (e) => { if (e.target.id === 'app' && small() && BP.state.settings.sidebar) { BP.state.settings.sidebar = false; renderAll(); } });   // tap the dim area to close the drawer
    if (!window.bp) return;
    BP.llm.on(() => BP.paintAiChip());
    BP.llm.init();
    // another device (shared folder) or window changed the workspace file: merge page by page
    window.bp.onExternal(async () => {
      try {
        const text = await window.bp.load();
        if (!text) return;
        if (editor) editor.flushTyping();
        const r = BP.mergeExternal(text);
        if (!r.changed) return;
        if (r.currentChanged && BP.state.current && !BP.page(BP.state.current)) BP.state.current = null;
        if (r.currentChanged) renderAll(); else refreshSidebar();
        BP.toast('Merged changes from another device', 3500);
      } catch (e) { BP.toast('Could not merge the changed workspace file: ' + e.message, 6000); }
    });
    const a = BP.state.settings.api;
    if (a && a.enabled && a.token) window.bp.apiConfigure({ enabled: true, port: a.port, token: a.token });
  });
})();

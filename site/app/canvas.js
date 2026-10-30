/* Blockpad canvas: an endless board of cards joined by arrows, a page of type 'canvas'.
   The data follows the open JSON Canvas format (jsoncanvas.org) so boards move to and from Obsidian's .canvas files:
     p.canvas = { nodes: [{ id, type: 'text'|'file'|'link'|'group', x, y, width, height, color?, text?, page?, src?, url?, label? }],
                  edges: [{ id, fromNode, fromSide, toNode, toSide, toEnd?, color?, label? }] }
   A 'file' card shows a Blockpad page (page: id) or an image (src). Colours are JSON Canvas presets "1".."6".
   Double-click the board for a new card · drag a card to move it · drag a dot on its edge to another card to connect ·
   Delete removes the selection · wheel or pinch zooms · drag the empty board to move around. */
(function () {
  const BP = (window.BP = window.BP || {});
  const h = (...a) => BP.h(...a);
  const CV = (BP.canvas = {});
  const uid = () => BP.uid();
  const COLORS = { 1: '#e5484d', 2: '#e08a00', 3: '#d4b106', 4: '#2f9e44', 5: '#0b8a8f', 6: '#7c4ddb' };
  const SIDES = ['top', 'right', 'bottom', 'left'];
  const views = new Map();        // page id -> { x, y, k }  where you were looking, for this session

  CV.create = (parent, title) => {
    const p = BP.createPage(parent || null, { type: 'canvas', title: title || 'Untitled canvas', icon: '🧭', blocks: [], canvas: { nodes: [], edges: [] } });
    return p;
  };
  const data = (p) => { p.canvas = p.canvas || { nodes: [], edges: [] }; p.canvas.nodes = p.canvas.nodes || []; p.canvas.edges = p.canvas.edges || []; return p.canvas; };

  // a tiny Markdown look for text cards: headings, lists, tasks, bold/italic/code/links
  const mdHtml = (text) => String(text || '').split('\n').map((l) => {
    let m;
    if ((m = /^(#{1,3})\s+(.*)$/.exec(l))) return '<div class="cvh' + m[1].length + '">' + BP.mdInline(m[2]) + '</div>';
    if ((m = /^\s*[-*]\s+\[( |x)\]\s+(.*)$/i.exec(l))) return '<div class="cvli">' + (m[1] === ' ' ? '☐ ' : '☑ ') + BP.mdInline(m[2]) + '</div>';
    if ((m = /^\s*[-*+]\s+(.*)$/.exec(l))) return '<div class="cvli">• ' + BP.mdInline(m[1]) + '</div>';
    if (!l.trim()) return '<div class="cvsp"></div>';
    return '<div>' + BP.mdInline(l) + '</div>';
  }).join('');

  CV.render = (host, p, o = {}) => {
    const ro = !!o.readonly;
    const D = data(p);
    let view = views.get(p.id) || { x: 40, y: 40, k: 1 };
    let sel = new Set(), selEdge = null, editing = null;
    const board = h('div', { class: 'cv-board' + (ro ? ' ro' : ''), tabindex: '0' });
    const world = h('div', { class: 'cv-world' });
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'cv-edges');
    svg.innerHTML = '<defs><marker id="cv-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="context-stroke"/></marker></defs>';
    world.append(svg);
    board.append(world);
    const zoomLbl = h('span', { class: 'cv-zoom' });
    const bar = h('div', { class: 'cv-bar' },
      ro ? null : h('button', { class: 'btn small', title: 'New card (or double-click the board)', onclick: () => addAtCenter('text') }, '+ Card'),
      ro ? null : h('button', { class: 'btn small', title: 'A card that shows one of your pages', onclick: (e) => pickPage(e.currentTarget) }, '+ Page'),
      ro ? null : h('button', { class: 'btn small', title: 'A card for a web link', onclick: async () => { const u = await BP.prompt('Web address', 'https://', 'Add'); if (u && /^https?:\/\/\S+/.test(u.trim())) addAtCenter('link', { url: u.trim() }); } }, '+ Link'),
      ro ? null : h('button', { class: 'btn small', title: 'A labelled area to group cards', onclick: () => addAtCenter('group', { label: 'Group', width: 520, height: 340 }) }, '+ Group'),
      h('span', { class: 'cv-sep' }),
      h('button', { class: 'icon-btn', title: 'Zoom out', onclick: () => zoomBy(1 / 1.25) }, '−'), zoomLbl, h('button', { class: 'icon-btn', title: 'Zoom in', onclick: () => zoomBy(1.25) }, '+'),
      h('button', { class: 'btn small', title: 'Show every card', onclick: () => fit() }, 'Fit'));
    host.append(h('div', { class: 'cv-wrap' }, bar, board));

    const save = BP.debounce(() => BP.touch(p), 300);
    const changed = () => { save(); };
    const nodeById = (id) => D.nodes.find((n) => n.id === id);
    const applyView = () => { world.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.k})`; zoomLbl.textContent = Math.round(view.k * 100) + '%'; views.set(p.id, view); board.style.backgroundPosition = view.x + 'px ' + view.y + 'px'; board.style.backgroundSize = 24 * view.k + 'px ' + 24 * view.k + 'px'; };
    const toWorld = (cx, cy) => { const r = board.getBoundingClientRect(); return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k }; };
    const zoomAt = (cx, cy, k2) => { const r = board.getBoundingClientRect(); const mx = cx - r.left, my = cy - r.top; k2 = Math.max(0.15, Math.min(3, k2)); view.x = mx - (mx - view.x) * k2 / view.k; view.y = my - (my - view.y) * k2 / view.k; view.k = k2; applyView(); };
    const zoomBy = (f) => { const r = board.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, view.k * f); };
    function fit() {
      if (!D.nodes.length) { view = { x: 40, y: 40, k: 1 }; return applyView(); }
      const r = board.getBoundingClientRect();
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      D.nodes.forEach((n) => { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + n.width); y1 = Math.max(y1, n.y + n.height); });
      const k = Math.max(0.15, Math.min(1.5, 0.9 * Math.min(r.width / (x1 - x0 || 1), r.height / (y1 - y0 || 1))));
      view = { k, x: (r.width - (x1 - x0) * k) / 2 - x0 * k, y: (r.height - (y1 - y0) * k) / 2 - y0 * k };
      applyView();
    }
    CV._fit = fit;

    function addNode(type, at, extra) {
      const size = type === 'file' ? [300, 200] : type === 'link' ? [300, 110] : [260, 140];
      const n = Object.assign({ id: uid(), type, x: Math.round(at.x - size[0] / 2), y: Math.round(at.y - size[1] / 2), width: size[0], height: size[1] }, type === 'text' ? { text: '' } : {}, extra || {});
      if (type === 'group') D.nodes.unshift(n); else D.nodes.push(n);
      changed(); draw();
      select(n.id);
      if (type === 'text') startEdit(n);
      return n;
    }
    const addAtCenter = (type, extra) => { const r = board.getBoundingClientRect(); return addNode(type, toWorld(r.left + r.width / 2, r.top + r.height / 2), extra); };
    CV._add = addAtCenter;
    function pickPage(anchor) {
      BP.popover(anchor, (el, close) => {
        el.classList.add('menu');
        const inp = h('input', { class: 'input small', placeholder: 'Find a page…' });
        const list = h('div', { class: 'cv-pick' });
        const fill = () => {
          list.innerHTML = '';
          const q = inp.value.trim().toLowerCase();
          BP.kb.pages().filter((x) => x.id !== p.id && !x.rowOf && (!q || (x.title || '').toLowerCase().includes(q))).slice(0, 30).forEach((x) =>
            list.append(h('div', { class: 'menu-item', onclick: () => { close(); addAtCenter('file', { page: x.id }); } }, h('span', { class: 'mi-ico' }, x.icon || '📄'), h('span', { class: 'mi-label' }, x.title || 'Untitled'))));
        };
        inp.addEventListener('input', fill);
        el.append(inp, list); fill();
        setTimeout(() => inp.focus(), 20);
      });
    }

    /* ---------- drawing ---------- */
    const els = new Map();
    function cardBody(n) {
      if (n.type === 'text') return h('div', { class: 'cv-text', html: mdHtml(n.text) || '' });
      if (n.type === 'link') { let host = n.url; try { host = new URL(n.url).hostname; } catch (_) {} return h('div', { class: 'cv-linkc' }, h('b', null, '🔗 ' + host), h('small', null, n.url)); }
      if (n.type === 'file' && n.page) {
        const q = BP.page(n.page);
        if (!q || BP.isTrashed(q)) return h('div', { class: 'cv-text muted' }, 'This page was deleted.');
        const lines = [];
        BP.walkBlocks(q.blocks || [], (b) => { if (lines.length < 6 && b.text) { const t = BP.textOf(b.text).trim(); if (t) lines.push(t); } });
        // a page that only holds other pages (like a folder): show what is inside
        if (!lines.length) BP.children(q.id).slice(0, 6).forEach((c) => lines.push((c.icon || '📄') + ' ' + (c.title || 'Untitled')));
        return h('div', { class: 'cv-pagec' }, h('div', { class: 'cv-pt' }, (q.icon || '📄') + ' ' + (q.title || 'Untitled')), ...lines.map((t) => h('div', { class: 'cv-pl' }, t)));
      }
      if (n.type === 'file' && n.src) return /^data:image|\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(n.src) ? h('img', { class: 'cv-img', src: n.src, alt: '', draggable: 'false' }) : h('div', { class: 'cv-text' }, '📎 ' + (n.file || 'file'));
      if (n.type === 'file') return h('div', { class: 'cv-text muted' }, '📎 ' + (n.file || 'file'));
      return null;
    }
    function draw() {
      els.forEach((el) => el.remove());
      els.clear();
      D.nodes.forEach((n) => {
        const el = h('div', { class: 'cv-node cv-' + n.type + (sel.has(n.id) ? ' sel' : ''), 'data-id': n.id });
        if (n.color) el.style.setProperty('--cv-c', COLORS[n.color] || n.color);
        if (n.type === 'group') el.append(h('div', { class: 'cv-glabel' }, n.label || ''));
        else el.append(cardBody(n));
        if (!ro) {
          SIDES.forEach((s) => el.append(h('i', { class: 'cv-dot cv-' + s, 'data-side': s })));
          el.append(h('i', { class: 'cv-rs' }));
        }
        place(el, n);
        world.append(el);
        els.set(n.id, el);
      });
      drawEdges();
    }
    const place = (el, n) => { el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; el.style.width = n.width + 'px'; el.style.height = n.height + 'px'; };
    const anchor = (n, side) => side === 'top' ? [n.x + n.width / 2, n.y] : side === 'bottom' ? [n.x + n.width / 2, n.y + n.height] : side === 'left' ? [n.x, n.y + n.height / 2] : [n.x + n.width, n.y + n.height / 2];
    const bestSide = (a, b) => { const dx = (b.x + b.width / 2) - (a.x + a.width / 2), dy = (b.y + b.height / 2) - (a.y + a.height / 2); return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'bottom' : 'top'); };
    const opp = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
    const curve = (p1, s1, p2, s2) => {
      const d = Math.max(40, Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 3);
      const off = (s, pnt) => s === 'top' ? [pnt[0], pnt[1] - d] : s === 'bottom' ? [pnt[0], pnt[1] + d] : s === 'left' ? [pnt[0] - d, pnt[1]] : [pnt[0] + d, pnt[1]];
      const c1 = off(s1, p1), c2 = s2 ? off(s2, p2) : p2;
      return `M${p1[0]},${p1[1]} C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
    };
    function drawEdges() {
      [...svg.querySelectorAll('g')].forEach((g) => g.remove());
      D.edges = D.edges.filter((e) => nodeById(e.fromNode) && nodeById(e.toNode));
      D.edges.forEach((e) => {
        const a = nodeById(e.fromNode), b = nodeById(e.toNode);
        const s1 = e.fromSide || bestSide(a, b), s2 = e.toSide || bestSide(b, a);
        const d = curve(anchor(a, s1), s1, anchor(b, s2), s2);
        const g = document.createElementNS(svgNS, 'g');
        g.setAttribute('class', 'cv-edge' + (selEdge === e.id ? ' sel' : ''));
        g.dataset.id = e.id;
        const col = e.color ? COLORS[e.color] || e.color : '';
        g.innerHTML = `<path class="cv-hit" d="${d}"/><path class="cv-line" d="${d}" ${col ? `style="stroke:${col}"` : ''} ${e.toEnd === 'none' ? '' : 'marker-end="url(#cv-arrow)"'} ${e.fromEnd === 'arrow' ? 'marker-start="url(#cv-arrow)"' : ''}/>`;
        if (e.label) {
          const m = anchor(a, s1), n2 = anchor(b, s2);
          const t = document.createElementNS(svgNS, 'text');
          t.setAttribute('x', (m[0] + n2[0]) / 2); t.setAttribute('y', (m[1] + n2[1]) / 2 - 6); t.setAttribute('class', 'cv-elabel');
          t.textContent = e.label;
          g.append(t);
        }
        svg.append(g);
      });
    }
    function select(id, add) {
      if (!add) sel.clear();
      if (id) sel.has(id) && add ? sel.delete(id) : sel.add(id);
      selEdge = null;
      els.forEach((el, nid) => el.classList.toggle('sel', sel.has(nid)));
      drawEdges();
    }
    function startEdit(n) {
      if (ro || n.type !== 'text') return;
      const el = els.get(n.id);
      if (!el) return;
      editing = n.id;
      const ta = h('textarea', { class: 'cv-edit' });
      ta.value = n.text || '';
      el.querySelector('.cv-text') && el.querySelector('.cv-text').replaceWith(ta);
      ta.focus();
      const done = () => { if (editing !== n.id) return; editing = null; n.text = ta.value; changed(); draw(); select(n.id); };
      ta.addEventListener('blur', done);
      ta.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); ta.blur(); } });
      ta.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
    function removeSel() {
      if (ro) return;
      if (selEdge) { D.edges = D.edges.filter((e) => e.id !== selEdge); selEdge = null; changed(); return draw(); }
      if (!sel.size) return;
      D.nodes = D.nodes.filter((n) => !sel.has(n.id));
      D.edges = D.edges.filter((e) => !sel.has(e.fromNode) && !sel.has(e.toNode));
      sel.clear(); changed(); draw();
    }
    CV._removeSel = removeSel;
    function colorMenu(anchorEl, target) {
      BP.menu(anchorEl, [{ label: 'No colour', icon: '○', onClick: () => { delete target.color; changed(); draw(); } }].concat(Object.keys(COLORS).map((k) => ({ label: ['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Purple'][k - 1], icon: '●', onClick: () => { target.color = k; changed(); draw(); } }))));
    }

    /* ---------- pointer handling ---------- */
    let drag = null;
    const pointers = new Map();
    let pinch = null;
    board.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.cv-edit')) return;
      board.focus({ preventScroll: true });
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; drag = null; return; }
      const w = toWorld(e.clientX, e.clientY);
      const edgeEl = e.target.closest('.cv-edge');
      if (edgeEl && !ro) { sel.clear(); selEdge = edgeEl.dataset.id; els.forEach((el) => el.classList.remove('sel')); drawEdges(); return; }
      const nodeEl = e.target.closest('.cv-node');
      try { board.setPointerCapture(e.pointerId); } catch (_) {}
      if (!nodeEl) { if (!e.shiftKey) select(null); drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; return; }
      const n = nodeById(nodeEl.dataset.id);
      if (!n || ro) { drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, node: n, moved: false }; return; }
      if (e.target.classList.contains('cv-dot')) {
        const side = e.target.dataset.side;
        const tmp = document.createElementNS(svgNS, 'path');
        tmp.setAttribute('class', 'cv-line cv-tmp');
        svg.append(tmp);
        drag = { kind: 'link', from: n, side, tmp };
        return;
      }
      if (e.target.classList.contains('cv-rs')) { drag = { kind: 'resize', n, sx: w.x, sy: w.y, w0: n.width, h0: n.height }; return; }
      if (!sel.has(n.id)) select(n.id, e.shiftKey);
      // moving a group moves the cards inside it too
      const moving = new Set(sel);
      [...moving].forEach((id) => { const g = nodeById(id); if (g && g.type === 'group') D.nodes.forEach((m) => { if (m !== g && m.x >= g.x && m.y >= g.y && m.x + m.width <= g.x + g.width && m.y + m.height <= g.y + g.height) moving.add(m.id); }); });
      drag = { kind: 'move', sx: w.x, sy: w.y, items: [...moving].map((id) => { const m = nodeById(id); return { m, x: m.x, y: m.y }; }), moved: false };
    });
    board.addEventListener('pointermove', (e) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size === 2) { const [a, b] = [...pointers.values()]; zoomAt(pinch.cx, pinch.cy, pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d); return; }
      if (!drag) return;
      const w = toWorld(e.clientX, e.clientY);
      if (drag.kind === 'pan') { view.x = drag.vx + e.clientX - drag.sx; view.y = drag.vy + e.clientY - drag.sy; if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 4) drag.moved = true; applyView(); }
      else if (drag.kind === 'move') {
        const dx = w.x - drag.sx, dy = w.y - drag.sy;
        if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
        drag.items.forEach((it) => { it.m.x = Math.round(it.x + dx); it.m.y = Math.round(it.y + dy); const el = els.get(it.m.id); el && place(el, it.m); });
        drawEdges();
      } else if (drag.kind === 'resize') {
        drag.n.width = Math.max(80, Math.round(drag.w0 + w.x - drag.sx)); drag.n.height = Math.max(50, Math.round(drag.h0 + w.y - drag.sy));
        const el = els.get(drag.n.id); el && place(el, drag.n); drawEdges(); drag.moved = true;
      } else if (drag.kind === 'link') {
        drag.tmp.setAttribute('d', curve(anchor(drag.from, drag.side), drag.side, [w.x, w.y], null));
      }
    });
    const up = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      const d = drag;
      drag = null;
      if (!d) return;
      if (d.kind === 'link') {
        d.tmp.remove();
        const tEl = document.elementFromPoint(e.clientX, e.clientY);
        const target = tEl && tEl.closest && tEl.closest('.cv-node');
        const to = target && nodeById(target.dataset.id);
        if (to && to !== d.from) {
          const w = toWorld(e.clientX, e.clientY);
          const dist = { top: Math.abs(w.y - to.y), bottom: Math.abs(w.y - to.y - to.height), left: Math.abs(w.x - to.x), right: Math.abs(w.x - to.x - to.width) };
          const toSide = Object.keys(dist).sort((a, b) => dist[a] - dist[b])[0];
          D.edges.push({ id: uid(), fromNode: d.from.id, fromSide: d.side, toNode: to.id, toSide, toEnd: 'arrow' });
          changed(); drawEdges();
        }
      } else if ((d.kind === 'move' || d.kind === 'resize') && d.moved) changed();
      else if (d.kind === 'pan' && !d.moved && d.node && ro) openNode(d.node);
    };
    board.addEventListener('pointerup', up);
    board.addEventListener('pointercancel', up);
    function openNode(n) {
      if (n.type === 'file' && n.page && BP.page(n.page)) BP.open(n.page);
      else if (n.type === 'link' && n.url) window.open(n.url, '_blank');
    }
    board.addEventListener('dblclick', (e) => {
      if (e.target.closest('.cv-edit')) return;
      const edgeEl = e.target.closest('.cv-edge');
      if (edgeEl && !ro) { const ed = D.edges.find((x) => x.id === edgeEl.dataset.id); if (ed) BP.prompt('Arrow label', ed.label || '', 'Save').then((v) => { if (v == null) return; ed.label = v.trim() || undefined; if (!ed.label) delete ed.label; changed(); drawEdges(); }); return; }
      const nodeEl = e.target.closest('.cv-node');
      if (!nodeEl) { if (!ro) addNode('text', toWorld(e.clientX, e.clientY)); return; }
      const n = nodeById(nodeEl.dataset.id);
      if (!n) return;
      if (n.type === 'text') startEdit(n);
      else if (n.type === 'group' && !ro) BP.prompt('Group name', n.label || '', 'Save').then((v) => { if (v != null) { n.label = v; changed(); draw(); } });
      else openNode(n);
    });
    board.addEventListener('contextmenu', (e) => {
      if (ro) return;
      const nodeEl = e.target.closest('.cv-node'), edgeEl = e.target.closest('.cv-edge');
      if (!nodeEl && !edgeEl) return;
      e.preventDefault();
      const target = nodeEl ? nodeById(nodeEl.dataset.id) : D.edges.find((x) => x.id === edgeEl.dataset.id);
      if (!target) return;
      if (nodeEl) select(target.id); else { selEdge = target.id; drawEdges(); }
      const at = { x: e.clientX, y: e.clientY };
      BP.menu(at, [
        { label: 'Colour', icon: '●', submenu: () => [{ label: 'No colour', onClick: () => { delete target.color; changed(); draw(); } }].concat(Object.keys(COLORS).map((k) => ({ label: ['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Purple'][k - 1], check: target.color === k, onClick: () => { target.color = k; changed(); draw(); } }))) },
        nodeEl && target.type === 'text' ? { label: 'Edit text', icon: '✎', onClick: () => startEdit(target) } : null,
        nodeEl && target.type === 'text' ? { label: 'Turn into a page', icon: '📄', onClick: () => { const lines = String(target.text || '').split('\n'); const t = (lines[0] || '').replace(/^#+\s*/, '').trim() || 'Untitled'; const np = BP.createPage(null, { title: t, blocks: BP.mdToBlocks(lines.slice(1).join('\n')).concat(BP.newBlock('p')) }); Object.assign(target, { type: 'file', page: np.id }); delete target.text; changed(); draw(); BP.toast('Made a page: ' + t); } } : null,
        nodeEl && target.type === 'file' && target.page ? { label: 'Open page', icon: '↗', onClick: () => openNode(target) } : null,
        nodeEl && target.type === 'group' ? { label: 'Rename group', icon: '✎', onClick: () => BP.prompt('Group name', target.label || '', 'Save').then((v) => { if (v != null) { target.label = v; changed(); draw(); } }) } : null,
        !nodeEl ? { label: 'Label…', icon: '✎', onClick: () => BP.prompt('Arrow label', target.label || '', 'Save').then((v) => { if (v == null) return; if (v.trim()) target.label = v.trim(); else delete target.label; changed(); drawEdges(); }) } : null,
        !nodeEl ? { label: target.fromEnd === 'arrow' ? 'Arrow on one end' : 'Arrows on both ends', icon: '↔', onClick: () => { if (target.fromEnd === 'arrow') delete target.fromEnd; else target.fromEnd = 'arrow'; changed(); drawEdges(); } } : null,
        { divider: true },
        { label: 'Delete', icon: BP.icons.trash, danger: true, onClick: removeSel },
      ]);
    });
    board.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey || !e.shiftKey && Math.abs(e.deltaY) >= Math.abs(e.deltaX) && !(e.deltaMode === 0 && Math.abs(e.deltaY) < 4 && e.deltaX)) zoomAt(e.clientX, e.clientY, view.k * Math.exp(-e.deltaY * 0.0015));
      else { view.x -= e.deltaX || e.deltaY; applyView(); }
    }, { passive: false });
    board.addEventListener('keydown', (e) => {
      if (editing) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && (sel.size || selEdge)) { e.preventDefault(); removeSel(); }
      else if (e.key === 'Enter' && sel.size === 1) { const n = nodeById([...sel][0]); n && (n.type === 'text' ? startEdit(n) : openNode(n)); e.preventDefault(); }
      else if (e.key === 'Escape') select(null);
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); sel = new Set(D.nodes.map((n) => n.id)); select(null, true); D.nodes.forEach((n) => sel.add(n.id)); els.forEach((el, id) => el.classList.toggle('sel', sel.has(id))); }
    });
    if (!D.nodes.length && !ro) board.append(h('div', { class: 'cv-hint muted' }, 'Double-click anywhere to add a card. Drag a dot on a card’s edge to another card to draw an arrow.'));
    draw();
    applyView();
    if (!views.has(p.id) && D.nodes.length) requestAnimationFrame(fit);
    return { board, fit };
  };

  /* ---------- JSON Canvas files (Obsidian .canvas) ---------- */
  // pathOf(pageId) -> vault path of that page ("Folder/Note.md"); assetOf(dataUrl, hint) -> vault path of the saved file
  CV.toJson = (p, pathOf, assetOf) => {
    const D = data(p);
    const nodes = D.nodes.map((n) => {
      const o = { id: n.id, type: n.type, x: Math.round(n.x), y: Math.round(n.y), width: Math.round(n.width), height: Math.round(n.height) };
      if (n.color) o.color = n.color;
      if (n.type === 'text') o.text = n.text || '';
      if (n.type === 'link') o.url = n.url || '';
      if (n.type === 'group' && n.label) o.label = n.label;
      if (n.type === 'file') {
        if (n.page) { const f = pathOf && pathOf(n.page); if (f) o.file = f; else { o.type = 'text'; o.text = (BP.page(n.page) || {}).title || ''; } }
        else if (n.src) { const f = n.src.startsWith('data:') ? assetOf && assetOf(n.src, n.file) : null; if (f) o.file = f; else { o.type = 'link'; o.url = n.src; } }
        else o.file = n.file || '';
      }
      return o;
    });
    const edges = D.edges.map((e) => { const o = { id: e.id, fromNode: e.fromNode, toNode: e.toNode }; ['fromSide', 'toSide', 'fromEnd', 'toEnd', 'color', 'label'].forEach((k) => e[k] && (o[k] = e[k])); return o; });
    return JSON.stringify({ nodes, edges }, null, '\t');
  };
  // resolveFile(path) -> { page } | { src } | null
  CV.fromJson = (text, resolveFile) => {
    const j = JSON.parse(text);
    const nodes = (j.nodes || []).filter((n) => n && n.id && n.type).map((n) => {
      const o = { id: String(n.id), type: n.type, x: +n.x || 0, y: +n.y || 0, width: Math.max(40, +n.width || 250), height: Math.max(30, +n.height || 120) };
      if (n.color) o.color = String(n.color);
      if (n.type === 'text') o.text = String(n.text || '');
      else if (n.type === 'link') o.url = String(n.url || '');
      else if (n.type === 'group') { if (n.label) o.label = String(n.label); }
      else if (n.type === 'file') { const r = resolveFile ? resolveFile(String(n.file || '')) : null; if (r && r.page) o.page = r.page; else if (r && r.src) o.src = r.src; o.file = String(n.file || ''); }
      return o;
    });
    nodes.sort((a, b) => (a.type === 'group' ? 0 : 1) - (b.type === 'group' ? 0 : 1));
    const ids = new Set(nodes.map((n) => n.id));
    const edges = (j.edges || []).filter((e) => e && ids.has(e.fromNode) && ids.has(e.toNode)).map((e) => { const o = { id: String(e.id || uid()), fromNode: String(e.fromNode), toNode: String(e.toNode) }; ['fromSide', 'toSide', 'fromEnd', 'toEnd', 'color', 'label'].forEach((k) => e[k] && (o[k] = String(e[k]))); return o; });
    return { nodes, edges };
  };
})();

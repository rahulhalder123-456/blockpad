/* Blockpad graph view: every page as a dot, every link between pages as a line (a force layout drawn on a canvas).
   Global graph (all pages) or local graph (one page and its neighbours, 1 to 3 steps away). Drag to pan, wheel or pinch
   to zoom, drag a dot to move it, hover to highlight neighbours, click to open the page. */
(function () {
  const BP = (window.BP = window.BP || {});
  const h = (...a) => BP.h(...a);
  const G = (BP.graph = {});
  const opts = { tags: false, orphans: true, kids: true, rows: false, depth: 1, labels: true };

  /* nodes and edges from the link index */
  G.build = (o) => {
    const KB = BP.kb;
    const pages = KB.pages().filter((p) => (o.rows || !p.rowOf) && !p.inline);
    const ids = new Set(pages.map((p) => p.id));
    const nodes = new Map(), edges = [], seen = new Set();
    const addEdge = (a, b, kind) => { if (a === b) return; const k = a < b ? a + '|' + b : b + '|' + a; if (seen.has(k)) return; seen.add(k); edges.push({ a, b, kind }); };
    pages.forEach((p) => nodes.set(p.id, { id: p.id, label: p.title || 'Untitled', kind: p.type === 'db' ? 'db' : p.type === 'canvas' ? 'canvas' : p.daily ? 'daily' : 'page', icon: p.icon || '' }));
    pages.forEach((p) => {
      const s = KB.scan(p);
      s.out.forEach((t) => ids.has(t) && addEdge(p.id, t, 'link'));
      if (o.kids) s.kids.forEach((t) => ids.has(t) && addEdge(p.id, t, 'child'));
      if (o.rows && p.rowOf && ids.has(p.rowOf)) addEdge(p.id, p.rowOf, 'child');
      if (o.tags) s.tagMap.forEach((name, k) => { const tid = 'tag:' + k; if (!nodes.has(tid)) nodes.set(tid, { id: tid, label: '#' + name, kind: 'tag' }); addEdge(p.id, tid, 'tag'); });
    });
    let keep = null;
    if (o.local && nodes.has(o.local)) {
      const adj = new Map();
      edges.forEach((e) => { (adj.get(e.a) || adj.set(e.a, []).get(e.a)).push(e.b); (adj.get(e.b) || adj.set(e.b, []).get(e.b)).push(e.a); });
      keep = new Set([o.local]);
      let front = [o.local];
      for (let d = 0; d < (o.depth || 1); d++) { const nx = []; front.forEach((id) => (adj.get(id) || []).forEach((x) => { if (!keep.has(x)) { keep.add(x); nx.push(x); } })); front = nx; }
    }
    const deg = new Map();
    edges.forEach((e) => { deg.set(e.a, (deg.get(e.a) || 0) + 1); deg.set(e.b, (deg.get(e.b) || 0) + 1); });
    let list = [...nodes.values()].filter((n) => (!keep || keep.has(n.id)) && (o.orphans || deg.get(n.id) || n.id === o.local));
    const inList = new Set(list.map((n) => n.id));
    list.forEach((n) => { n.deg = deg.get(n.id) || 0; });
    return { nodes: list, edges: edges.filter((e) => inList.has(e.a) && inList.has(e.b)) };
  };

  G.open = (o = {}) => {
    const local = o.local || null;
    BP.modal(local ? 'Local graph' : 'Graph view', (body, close) => {
      body.classList.add('gv-body');
      const cv = h('canvas', { class: 'gv-canvas' });
      const stage = h('div', { class: 'gv-stage' }, cv);
      const info = h('div', { class: 'gv-info muted small' });
      const find = h('input', { class: 'input small', placeholder: 'Find a page…' });
      const chk = (key, label) => h('label', { class: 'gv-chk' }, h('input', { type: 'checkbox', checked: opts[key] ? '' : null, onchange: (e) => { opts[key] = e.target.checked; rebuild(); } }), ' ' + label);
      const depthSel = h('select', { class: 'input small', onchange: (e) => { opts.depth = +e.target.value; rebuild(); } }, [1, 2, 3].map((d) => h('option', { value: String(d), selected: opts.depth === d ? '' : null }, d + (d === 1 ? ' step' : ' steps'))));
      const side = h('div', { class: 'gv-side' }, find, chk('tags', 'Tags as dots'), chk('orphans', 'Pages without links'), chk('kids', 'Sub-pages count as links'), chk('rows', 'Database rows'), chk('labels', 'Names'),
        local ? h('label', { class: 'gv-chk' }, 'Depth ', depthSel) : null,
        h('div', { class: 'row-gap' }, h('button', { class: 'btn small', onclick: () => fit() }, 'Fit'), local ? h('button', { class: 'btn small', onclick: () => { close(); G.open({}); } }, 'Whole graph') : null), info,
        h('p', { class: 'muted small gv-help' }, 'Drag to move around · wheel or pinch to zoom · click a dot to open it'));
      body.append(h('div', { class: 'gv' }, side, stage));

      const ctx = cv.getContext('2d');
      let W = 0, H = 0, dpr = 1;
      let nodes = [], edges = [], byId = new Map(), adj = new Map();
      let view = { x: 0, y: 0, k: 1 };
      let alpha = 1, raf = 0, hover = null, dragN = null, panning = null, pointers = new Map(), pinch = null, moved = false;
      const css = getComputedStyle(document.documentElement);
      const col = (v, d) => (css.getPropertyValue(v) || d).trim();
      const C = { text: col('--text', '#333'), muted: col('--muted', '#888'), border: col('--border', '#ddd'), accent: col('--accent', '#5b5bd6'), bg: col('--bg', '#fff') };
      const KIND = { page: C.muted, daily: '#3b9ede', db: '#e08a00', canvas: '#c2379a', tag: '#2f9e44' };
      const radius = (n) => 3.5 + Math.min(12, Math.sqrt(n.deg) * 1.8);

      function rebuild() {
        const old = new Map(nodes.map((n) => [n.id, n]));
        const g = G.build(Object.assign({}, opts, { local }));
        nodes = g.nodes; edges = g.edges;
        byId = new Map(nodes.map((n) => [n.id, n]));
        adj = new Map(nodes.map((n) => [n.id, new Set()]));
        edges.forEach((e) => { adj.get(e.a).add(e.b); adj.get(e.b).add(e.a); e.s = byId.get(e.a); e.t = byId.get(e.b); });
        const R = 40 * Math.sqrt(nodes.length + 1);
        nodes.forEach((n, i) => {
          const o = old.get(n.id);
          if (o) { n.x = o.x; n.y = o.y; n.vx = o.vx; n.vy = o.vy; }
          else { const a = i * 2.399963, r = R * Math.sqrt((i + 0.5) / (nodes.length + 1)); n.x = Math.cos(a) * r; n.y = Math.sin(a) * r; n.vx = 0; n.vy = 0; }
        });
        if (local && byId.get(local)) { const c = byId.get(local); c.fx = 0; c.fy = 0; }
        info.textContent = nodes.length + ' pages · ' + edges.length + ' links';
        alpha = 1; kick();
      }
      /* forces: every pair repels (a grid keeps it fast for big graphs), links pull together, a weak pull to the centre */
      function tick() {
        const n = nodes.length;
        if (!n) return;
        const rep = 2400, spring = 0.035, rest = 95, grav = 0.01;
        if (n <= 900) {
          for (let i = 0; i < n; i++) { const a = nodes[i]; for (let j = i + 1; j < n; j++) { const b = nodes[j]; let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy; if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 0.5; } if (d2 > 250000) continue; const f = rep / d2 * alpha, d = Math.sqrt(d2); a.vx += dx / d * f; a.vy += dy / d * f; b.vx -= dx / d * f; b.vy -= dy / d * f; } }
        } else {
          const cell = 120, grid = new Map();
          nodes.forEach((a) => { const k = Math.floor(a.x / cell) + ',' + Math.floor(a.y / cell); (grid.get(k) || grid.set(k, []).get(k)).push(a); });
          nodes.forEach((a) => { const cx = Math.floor(a.x / cell), cy = Math.floor(a.y / cell); for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) (grid.get(gx + ',' + gy) || []).forEach((b) => { if (b === a) return; let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy || 0.5; const f = rep / d2 * alpha * 0.5, d = Math.sqrt(d2); a.vx += dx / d * f; a.vy += dy / d * f; }); });
        }
        edges.forEach((e) => { const a = e.s, b = e.t; const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1; const f = (d - rest) * spring * alpha; a.vx += dx / d * f; a.vy += dy / d * f; b.vx -= dx / d * f; b.vy -= dy / d * f; });
        nodes.forEach((a) => {
          a.vx -= a.x * grav * alpha; a.vy -= a.y * grav * alpha;
          a.vx *= 0.82; a.vy *= 0.82;
          if (a === dragN) { a.vx = a.vy = 0; return; }
          if (a.fx != null) { a.x = a.fx; a.y = a.fy; return; }
          a.x += Math.max(-30, Math.min(30, a.vx)); a.y += Math.max(-30, Math.min(30, a.vy));
        });
        alpha *= 0.985;
      }
      function draw() {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        ctx.translate(W / 2 + view.x, H / 2 + view.y);
        ctx.scale(view.k, view.k);
        const q = find.value.trim().toLowerCase();
        const focus = hover || (q ? null : null);
        const near = focus ? adj.get(focus.id) : null;
        const lit = (n) => !focus || n === focus || near.has(n.id);
        const match = (n) => q && n.label.toLowerCase().includes(q);
        ctx.lineWidth = 1 / view.k;
        edges.forEach((e) => {
          const on = focus && (e.s === focus || e.t === focus);
          ctx.strokeStyle = on ? C.accent : C.muted;
          ctx.globalAlpha = focus && !on ? 0.08 : e.kind === 'child' ? 0.22 : 0.42;
          ctx.setLineDash(e.kind === 'child' ? [3 / view.k, 3 / view.k] : []);
          ctx.beginPath(); ctx.moveTo(e.s.x, e.s.y); ctx.lineTo(e.t.x, e.t.y); ctx.stroke();
        });
        ctx.setLineDash([]);
        nodes.forEach((n) => {
          const r = radius(n);
          ctx.globalAlpha = lit(n) ? 1 : 0.2;
          ctx.fillStyle = n.id === local || n === focus ? C.accent : match(n) ? '#e5484d' : n.id === BP.state.current ? C.accent : KIND[n.kind] || C.muted;
          ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();
          if (n.id === BP.state.current) { ctx.strokeStyle = C.accent; ctx.lineWidth = 2 / view.k; ctx.beginPath(); ctx.arc(n.x, n.y, r + 3 / view.k, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1 / view.k; }
        });
        const fs = 12 / view.k;
        ctx.font = fs + 'px ' + (css.getPropertyValue('--font') || 'sans-serif');
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        // names: always for the hovered dot, its neighbours and search hits; otherwise only once zoomed in enough that they fit
        // (busy pages first), fading in, so a big graph is not a wall of overlapping text
        const many = nodes.length > 60;
        nodes.forEach((n) => {
          const zoomShow = !many || view.k > 1.6 || (view.k > 0.9 && n.deg >= 4) || n.deg >= 12;
          const show = n === focus || (near && near.has(n.id)) || match(n) || (opts.labels && zoomShow);
          if (!show) return;
          const fade = focus || match(n) || !many ? 1 : Math.min(1, Math.max(0.35, (view.k - 0.6) / 1.2 + (n.deg >= 12 ? 0.5 : 0)));
          ctx.globalAlpha = (lit(n) ? 1 : 0.25) * fade;
          ctx.fillStyle = C.text;
          const t = n.label.length > 32 ? n.label.slice(0, 31) + '…' : n.label;
          ctx.fillText(t, n.x, n.y + radius(n) + 3 / view.k);
        });
        ctx.globalAlpha = 1;
      }
      function loop() { raf = 0; if (alpha > 0.004 || dragN) { tick(); raf = requestAnimationFrame(loop); } draw(); }
      function kick() { if (!raf) raf = requestAnimationFrame(loop); }
      const redraw = () => { if (!raf) requestAnimationFrame(draw); };
      function size() {
        const r = stage.getBoundingClientRect();
        dpr = window.devicePixelRatio || 1; W = Math.max(50, r.width); H = Math.max(50, r.height);
        cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
        redraw();
      }
      function fit() {
        if (!nodes.length) return;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        nodes.forEach((n) => { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); });
        const k = Math.min(2, 0.85 * Math.min(W / Math.max(60, x1 - x0), H / Math.max(60, y1 - y0)));
        view = { k, x: -((x0 + x1) / 2) * k, y: -((y0 + y1) / 2) * k };
        redraw();
      }
      const toWorld = (cx, cy) => { const r = cv.getBoundingClientRect(); return { x: (cx - r.left - W / 2 - view.x) / view.k, y: (cy - r.top - H / 2 - view.y) / view.k }; };
      const hit = (cx, cy) => { const w = toWorld(cx, cy); let best = null, bd = Infinity; nodes.forEach((n) => { const d = Math.hypot(n.x - w.x, n.y - w.y); if (d < radius(n) + 6 / view.k && d < bd) { bd = d; best = n; } }); return best; };
      cv.addEventListener('pointerdown', (e) => {
        try { cv.setPointerCapture(e.pointerId); } catch (_) {}
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        moved = false;
        if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k }; dragN = null; panning = null; return; }
        const n = hit(e.clientX, e.clientY);
        if (n) { dragN = n; alpha = Math.max(alpha, 0.3); kick(); }
        else panning = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
      });
      cv.addEventListener('pointermove', (e) => {
        if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinch && pointers.size === 2) { const [a, b] = [...pointers.values()]; view.k = Math.max(0.1, Math.min(6, pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d)); moved = true; return redraw(); }
        if (dragN) { const w = toWorld(e.clientX, e.clientY); dragN.x = w.x; dragN.y = w.y; if (dragN.fx != null) { dragN.fx = w.x; dragN.fy = w.y; } moved = true; alpha = Math.max(alpha, 0.2); kick(); return; }
        if (panning) { view.x = panning.vx + e.clientX - panning.x; view.y = panning.vy + e.clientY - panning.y; if (Math.abs(e.clientX - panning.x) + Math.abs(e.clientY - panning.y) > 3) moved = true; return redraw(); }
        const n = hit(e.clientX, e.clientY);
        if (n !== hover) { hover = n; cv.style.cursor = n ? 'pointer' : 'grab'; redraw(); }
      });
      const up = (e) => {
        pointers.delete(e.pointerId);
        if (pointers.size < 2) pinch = null;
        const n = dragN;
        dragN = null; panning = null;
        if (n && !moved && !String(n.id).startsWith('tag:')) { close(); BP.open(n.id); }
        else if (n && !moved && String(n.id).startsWith('tag:')) { close(); BP.kb.openTag(n.id.slice(4)); }
      };
      cv.addEventListener('pointerup', up);
      cv.addEventListener('pointercancel', up);
      cv.addEventListener('pointerleave', () => { if (hover) { hover = null; redraw(); } });
      cv.addEventListener('wheel', (e) => {
        e.preventDefault();
        const r = cv.getBoundingClientRect();
        const mx = e.clientX - r.left - W / 2, my = e.clientY - r.top - H / 2;
        const k2 = Math.max(0.1, Math.min(6, view.k * Math.exp(-e.deltaY * 0.0015)));
        view.x = mx - (mx - view.x) * k2 / view.k; view.y = my - (my - view.y) * k2 / view.k; view.k = k2;
        redraw();
      }, { passive: false });
      find.addEventListener('input', redraw);
      find.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const q = find.value.trim().toLowerCase();
        const n = nodes.find((x) => x.label.toLowerCase().includes(q));
        if (n) { view.x = -n.x * view.k; view.y = -n.y * view.k; hover = n; redraw(); }
      });
      const ro = new ResizeObserver(size);
      ro.observe(stage);
      G._live = { nodes: () => nodes, edges: () => edges, view: () => view, hit, toWorld, canvas: cv };
      requestAnimationFrame(() => {
        size(); rebuild();
        // let the layout settle a moment, then frame it
        let n = 0; const settle = () => { for (let i = 0; i < 6 && alpha > 0.004; i++) tick(); if (++n < 25 && alpha > 0.02) requestAnimationFrame(settle); else fit(); }; settle();
      });
      const obs = new MutationObserver(() => { if (!body.isConnected) { cancelAnimationFrame(raf); ro.disconnect(); obs.disconnect(); G._live = null; } });
      obs.observe(document.body, { childList: true });
    }, { class: 'graph-modal' });
  };
})();

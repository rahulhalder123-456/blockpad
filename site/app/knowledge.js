/* Blockpad knowledge layer: what links where. Link and tag index, backlinks and unlinked mentions, page properties,
   tags, link previews on hover, daily notes and the command palette.
   Links are the bp://page/<id> anchors inside block text (written by @ and [[ ), tags are #words in text, bp://tag/<name>
   anchors, and a page's own tags property. Nothing here changes how pages are stored; the index is rebuilt per page
   only when that page's blocks, title or tags change. */
(function () {
  const BP = (window.BP = window.BP || {});
  const h = (...a) => BP.h(...a);
  const KB = (BP.kb = {});

  /* ---------- index ---------- */
  const PAGE_RE = /bp:\/\/page\/([A-Za-z0-9_-]+)/g;
  const TAG_HREF_RE = /bp:\/\/tag\/([^"'\s<>]+)/g;
  // a #tag: letters, digits, _ - /, at least one non-digit, and not glued to the word before it (so "C#" or "&#39;" are not tags)
  const TAG_TXT_RE = /(^|[\s(,;:!?])#([\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/gu;
  const plain = (html) => String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  KB.normTag = (t) => String(t || '').replace(/^#/, '').trim().replace(/\/+$/, '').toLowerCase();
  const cache = new WeakMap();
  function scan(p) {
    const c = cache.get(p);
    if (c && c.blocks === p.blocks && c.updated === p.updated && c.title === p.title && c.tags === p.tags && c.canvas === p.canvas) return c;
    const out = new Set(), kids = new Set(), tags = new Map(), texts = [];
    const addTag = (raw) => { const k = KB.normTag(raw); if (k && !/^\d+$/.test(k) && !tags.has(k)) tags.set(k, raw.replace(/^#/, '').replace(/\/+$/, '')); };
    const fromHtml = (html, id) => {
      if (!html) return;
      const s = String(html);
      let m;
      PAGE_RE.lastIndex = 0; while ((m = PAGE_RE.exec(s))) out.add(m[1]);
      TAG_HREF_RE.lastIndex = 0; while ((m = TAG_HREF_RE.exec(s))) { try { addTag(decodeURIComponent(m[1])); } catch (_) { addTag(m[1]); } }
      const t = plain(s);
      TAG_TXT_RE.lastIndex = 0; while ((m = TAG_TXT_RE.exec(t))) addTag(m[2]);
      texts.push({ id, html: s, text: t });
    };
    if (p.type !== 'db') BP.walkBlocks(p.blocks || [], (b) => {
      if (b.type === 'page' && b.ref) kids.add(b.ref);
      if (b.type === 'dbview' && b.ref) kids.add(b.ref);
      if (b.type === 'code' || b.type === 'equation' || b.type === 'html') return;
      if (b.text) fromHtml(b.text, b.id);
      if (b.caption) fromHtml(BP.esc(b.caption), b.id);
      if (b.type === 'table') (b.rows || []).forEach((r) => r.forEach((cell) => fromHtml(BP.esc(cell), b.id)));
    });
    if (p.type === 'canvas' && p.canvas) (p.canvas.nodes || []).forEach((n) => {
      if (n.type === 'file' && n.page) out.add(n.page);
      if (n.type === 'text' && n.text) { const t = String(n.text); TAG_TXT_RE.lastIndex = 0; let m; while ((m = TAG_TXT_RE.exec(t))) addTag(m[2]); texts.push({ id: n.id, html: BP.esc(t), text: t }); }
    });
    (Array.isArray(p.tags) ? p.tags : []).forEach((t) => addTag(String(t)));
    const r = { blocks: p.blocks, updated: p.updated, title: p.title, tags: p.tags, canvas: p.canvas, out, kids, tagMap: tags, texts };
    cache.set(p, r);
    return r;
  }
  const live = (p) => p && !BP.isTrashed(p);
  KB.scan = scan;
  KB.pages = () => BP.allPages().filter(live);
  KB.outgoing = (id) => { const p = BP.page(id); if (!p) return []; return [...scan(p).out].map(BP.page).filter((x) => live(x) && x.id !== id); };
  KB.tagsOf = (p) => [...scan(p).tagMap.values()];
  KB.backlinks = (id) => {
    const res = [];
    KB.pages().forEach((q) => {
      if (q.id === id) return;
      const s = scan(q);
      if (!s.out.has(id)) return;
      const needle = 'bp://page/' + id;
      const snippets = s.texts.filter((t) => t.html.includes(needle)).slice(0, 3).map((t) => ({ block: t.id, text: t.text.trim().replace(/\s+/g, ' ').slice(0, 180) }));
      res.push({ page: q, snippets });
    });
    return res.sort((a, b) => (b.page.updated || 0) - (a.page.updated || 0));
  };
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const namesOf = (p) => [p.title, ...(Array.isArray(p.aliases) ? p.aliases : [])].map((x) => String(x || '').trim()).filter((x) => x.length >= 3);
  KB.unlinked = (id) => {
    const p = BP.page(id);
    if (!p) return [];
    const names = namesOf(p);
    if (!names.length) return [];
    const re = new RegExp('(^|[^\\p{L}\\p{N}_])(' + names.map(reEsc).join('|') + ')(?=$|[^\\p{L}\\p{N}_])', 'iu');
    const res = [];
    KB.pages().forEach((q) => {
      if (q.id === id || q.type === 'db') return;
      const hits = scan(q).texts.filter((t) => re.test(t.text) && !linkedText(t.html, id, re)).slice(0, 3);
      if (hits.length) res.push({ page: q, snippets: hits.map((t) => ({ block: t.id, text: t.text.trim().replace(/\s+/g, ' ').slice(0, 180) })) });
    });
    return res;
  };
  // true when every occurrence of the name in this block is already inside a link
  function linkedText(html, id, re) {
    const d = document.createElement('div');
    d.innerHTML = html;
    const w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) if (!(n.parentElement && n.parentElement.closest('a')) && re.test(n.nodeValue)) return false;
    return true;
  }
  /* turn the first plain mention of page `id` in block `blockId` of page `srcId` into a link */
  KB.linkMention = (srcId, blockId, id) => {
    const src = BP.page(srcId), p = BP.page(id);
    if (!src || !p) return false;
    const f = BP.findBlock(src.blocks || [], blockId);
    if (!f) return false;
    const names = namesOf(p);
    const re = new RegExp('(^|[^\\p{L}\\p{N}_])(' + names.map(reEsc).join('|') + ')(?=$|[^\\p{L}\\p{N}_])', 'iu');
    const d = document.createElement('div');
    d.innerHTML = f.block.text || '';
    const w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.parentElement && n.parentElement.closest('a')) continue;
      const m = re.exec(n.nodeValue);
      if (!m) continue;
      const at = m.index + m[1].length;
      const mid = n.splitText(at);
      mid.splitText(m[2].length);
      const a = document.createElement('a');
      a.setAttribute('href', 'bp://page/' + id);
      a.textContent = mid.nodeValue;
      mid.replaceWith(a);
      f.block.text = BP.sanitize(d.innerHTML);
      BP.touch(src);
      return true;
    }
    return false;
  };
  KB.allTags = () => {
    const m = new Map();
    KB.pages().forEach((p) => scan(p).tagMap.forEach((name, k) => {
      // a nested tag (#work/client) also counts for its parents (#work)
      const parts = k.split('/');
      for (let i = 1; i <= parts.length; i++) {
        const key = parts.slice(0, i).join('/');
        let e = m.get(key);
        if (!e) m.set(key, (e = { key, name: i === parts.length ? name : name.split('/').slice(0, i).join('/'), pages: new Set(), own: 0 }));
        e.pages.add(p.id);
        if (i === parts.length) e.own++;
      }
    }));
    return [...m.values()].sort((a, b) => b.pages.size - a.pages.size || a.key.localeCompare(b.key));
  };
  KB.pagesWithTag = (tag) => {
    const k = KB.normTag(tag);
    return KB.pages().filter((p) => [...scan(p).tagMap.keys()].some((t) => t === k || t.startsWith(k + '/')));
  };
  KB.tagHref = (name) => 'bp://tag/' + encodeURIComponent(String(name).replace(/^#/, ''));

  /* rename: link text that still shows the old title follows the new one (links point at ids, so they never break) */
  KB.renamed = (p, oldTitle) => {
    if (!oldTitle || oldTitle === p.title) return 0;
    let n = 0;
    KB.backlinks(p.id).forEach(({ page: q }) => {
      let changed = false;
      BP.walkBlocks(q.blocks || [], (b) => {
        if (!b.text || !b.text.includes('bp://page/' + p.id)) return;
        const d = document.createElement('div');
        d.innerHTML = b.text;
        d.querySelectorAll('a[href="bp://page/' + p.id + '"]').forEach((a) => { if (a.textContent === oldTitle) { a.textContent = p.title || 'Untitled'; changed = true; n++; } });
        if (changed) b.text = BP.sanitize(d.innerHTML);
      });
      if (changed) BP.touch(q);
    });
    return n;
  };

  /* ---------- properties (Obsidian-style frontmatter) on normal pages: p.tags, p.aliases, p.meta ---------- */
  const fmtVal = (v) => (Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v));
  const parseVal = (s, old) => {
    s = String(s).trim();
    if (Array.isArray(old) || /,/.test(s)) return s.split(/\s*,\s*/).filter(Boolean);
    if (/^(true|false)$/i.test(s)) return /^true$/i.test(s);
    if (/^-?\d+(\.\d+)?$/.test(s)) return +s;
    return s;
  };
  KB.hasProps = (p) => !!(Array.isArray(p.tags) || Array.isArray(p.aliases) || (p.meta && Object.keys(p.meta).length));
  KB.propsView = (p, locked, rerender) => {
    const box = h('div', { class: 'kb-props' });
    const row = (label, valueEl, onDel) => box.append(h('div', { class: 'kb-prop' }, h('span', { class: 'kb-pk' }, label), valueEl, !locked && onDel ? h('button', { class: 'icon-btn kb-pdel', title: 'Remove property', html: BP.icons.x, onclick: onDel }) : null));
    if (Array.isArray(p.tags) && (p.tags.length || !locked)) {
      const chips = h('div', { class: 'kb-chips' });
      p.tags.forEach((t, i) => chips.append(h('span', { class: 'kb-chip' }, h('a', { href: KB.tagHref(t) }, '#' + t), locked ? null : h('button', { title: 'Remove tag', onclick: () => { p.tags.splice(i, 1); BP.touch(p); rerender(); } }, '×'))));
      if (!locked) {
        const inp = h('input', { class: 'kb-tagin', placeholder: '+ tag' });
        inp.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter' && e.key !== ',') return;
          e.preventDefault();
          const v = inp.value.replace(/^#/, '').trim();
          if (v && !p.tags.some((x) => KB.normTag(x) === KB.normTag(v))) { p.tags.push(v); BP.touch(p); rerender(); setTimeout(() => { const n = BP.$('.kb-tagin'); n && n.focus(); }, 0); }
        });
        chips.append(inp);
      }
      row('Tags', chips, () => { delete p.tags; BP.touch(p); rerender(); });
    }
    if (Array.isArray(p.aliases)) {
      const inp = h('input', { class: 'kb-pv', value: p.aliases.join(', '), placeholder: 'Other names for this page', readonly: locked ? '' : null });
      inp.addEventListener('change', () => { p.aliases = inp.value.split(/\s*,\s*/).filter(Boolean); BP.touch(p); });
      row('Aliases', inp, () => { delete p.aliases; BP.touch(p); rerender(); });
    }
    Object.keys(p.meta || {}).forEach((k) => {
      const v = p.meta[k];
      let el;
      if (typeof v === 'boolean') el = h('input', { type: 'checkbox', checked: v ? '' : null, disabled: locked ? '' : null, onchange: (e) => { p.meta[k] = e.target.checked; BP.touch(p); } });
      else {
        el = h('input', { class: 'kb-pv', value: fmtVal(v), readonly: locked ? '' : null });
        el.addEventListener('change', () => { p.meta[k] = parseVal(el.value, v); BP.touch(p); });
      }
      row(k, el, () => { delete p.meta[k]; if (!Object.keys(p.meta).length) delete p.meta; BP.touch(p); rerender(); });
    });
    if (!locked) box.append(h('button', { class: 'btn ghost small kb-padd', onclick: (e) => KB.addPropMenu(p, e.currentTarget, rerender) }, '+ Add property'));
    return box;
  };
  KB.addPropMenu = (p, anchor, rerender) => BP.menu(anchor, [
    Array.isArray(p.tags) ? null : { label: 'Tags', icon: '#', onClick: () => { p.tags = []; BP.touch(p); rerender(); setTimeout(() => { const n = BP.$('.kb-tagin'); n && n.focus(); }, 30); } },
    Array.isArray(p.aliases) ? null : { label: 'Aliases', icon: '≈', onClick: () => { p.aliases = []; BP.touch(p); rerender(); } },
    { label: 'Other property…', icon: '+', onClick: async () => {
      const k = await BP.prompt('Property name', '', 'Add');
      if (!k || !k.trim()) return;
      p.meta = p.meta || {};
      if (!(k.trim() in p.meta)) p.meta[k.trim()] = '';
      BP.touch(p); rerender();
    } },
  ]);

  /* ---------- the Links panel (right side): outline, backlinks, unlinked mentions, outgoing links, tags ---------- */
  const panelOpen = new Set(['outline', 'back', 'unlinked', 'out', 'tags']);
  KB.panel = (p, onClose) => {
    const box = h('aside', { class: 'comments kb-panel' });
    box.append(h('div', { class: 'cm-head' }, h('b', null, 'Links'), h('button', { class: 'icon-btn', html: BP.icons.x, onclick: onClose })));
    const list = h('div', { class: 'kb-list' });
    box.append(list);
    KB.fillPanel(list, p);
    return box;
  };
  KB.fillPanel = (list, p) => {
    list.innerHTML = '';
    const sec = (key, title, count, build) => {
      const open = panelOpen.has(key);
      const body = h('div', { class: 'kb-sec-body' });
      const head = h('button', { class: 'kb-sec' + (open ? ' open' : ''), onclick: () => { open ? panelOpen.delete(key) : panelOpen.add(key); KB.fillPanel(list, p); } }, h('span', { class: 'kb-tw', html: BP.icons.chevron }), h('span', null, title), count == null ? null : h('span', { class: 'kb-n' }, String(count)));
      list.append(head);
      if (open) { build(body); list.append(body); }
    };
    const pageRow = (q, snippets, extra) => {
      const r = h('div', { class: 'kb-row' });
      r.append(h('button', { class: 'kb-pg', onclick: () => BP.open(q.id) }, h('span', null, q.icon || (q.type === 'db' ? '🗂' : q.type === 'canvas' ? '🧭' : '📄')), h('span', { class: 'kb-pt' }, q.title || 'Untitled')));
      (snippets || []).forEach((s) => r.append(h('div', { class: 'kb-snip' }, h('span', { onclick: () => KB.openAt(q.id, s.block) }, s.text || '…'), extra ? extra(s) : null)));
      return r;
    };
    if (p.type !== 'db' && p.type !== 'canvas') {
      const heads = [];
      BP.walkBlocks(p.blocks || [], (b) => { if (/^h[123]$/.test(b.type) && BP.textOf(b.text).trim()) heads.push(b); });
      sec('outline', 'Outline', heads.length, (b) => {
        if (!heads.length) return b.append(h('div', { class: 'muted small kb-empty' }, 'No headings on this page.'));
        heads.forEach((x) => b.append(h('button', { class: 'kb-oh kb-' + x.type, onclick: () => KB.scrollToBlock(x.id) }, BP.textOf(x.text))));
      });
    }
    const back = KB.backlinks(p.id);
    sec('back', 'Linked mentions', back.length, (b) => {
      if (!back.length) return b.append(h('div', { class: 'muted small kb-empty' }, 'No other page links here yet. Type @ or [[ in any page to link to this one.'));
      back.forEach((x) => b.append(pageRow(x.page, x.snippets)));
    });
    sec('unlinked', 'Unlinked mentions', null, (b) => {
      const un = KB.unlinked(p.id);
      if (!un.length) return b.append(h('div', { class: 'muted small kb-empty' }, (p.title || '').trim().length < 3 ? 'Give the page a title of 3 or more letters to find mentions of it.' : 'No page mentions “' + p.title + '” without linking it.'));
      un.forEach((x) => b.append(pageRow(x.page, x.snippets, (s) => h('button', { class: 'btn small kb-link', onclick: () => { if (KB.linkMention(x.page.id, s.block, p.id)) { BP.toast('Linked'); KB.fillPanel(list, p); } } }, 'Link'))));
    });
    const out = KB.outgoing(p.id);
    sec('out', 'Outgoing links', out.length, (b) => {
      if (!out.length) return b.append(h('div', { class: 'muted small kb-empty' }, 'This page does not link to other pages.'));
      out.forEach((q) => b.append(pageRow(q)));
    });
    const tags = KB.tagsOf(p);
    sec('tags', 'Tags', tags.length, (b) => {
      if (!tags.length) return b.append(h('div', { class: 'muted small kb-empty' }, 'No tags. Type #word in the text, or add a Tags property (⋯ → Add property).'));
      const chips = h('div', { class: 'kb-chips' });
      tags.forEach((t) => chips.append(h('a', { class: 'kb-chip', href: KB.tagHref(t) }, '#' + t)));
      b.append(chips);
    });
    list.append(h('div', { class: 'kb-foot' }, h('button', { class: 'btn small', onclick: () => BP.graph && BP.graph.open({ local: p.id }) }, 'Local graph'), h('span', { class: 'muted small' }, KB.words(p) + ' words')));
  };
  KB.words = (p) => { let n = 0; scan(p).texts.forEach((t) => { n += (t.text.match(/\S+/g) || []).length; }); return n; };
  KB.scrollToBlock = (id) => {
    const el = BP.$('.editor .block[data-id="' + id + '"]');
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('kb-flash'); setTimeout(() => el.classList.remove('kb-flash'), 1400);
  };
  KB.openAt = (pid, blockId) => { if (BP.state.current !== pid) BP.open(pid); setTimeout(() => KB.scrollToBlock(blockId), 120); };
  // keep the panel current while you type (headings, word count) without rebuilding it on every key
  const refresh = BP.debounce(() => { const list = BP.$('.kb-panel .kb-list'); const p = BP.page(BP.state.current); if (list && p) KB.fillPanel(list, p); }, 900);
  const origTouch = BP.touch;
  BP.touch = function (p) { const r = origTouch.apply(this, arguments); if (BP.$('.kb-panel')) refresh(); return r; };

  /* ---------- tag view ---------- */
  KB.openTag = (tag) => {
    const all = KB.allTags();
    let sel = tag ? KB.normTag(tag) : null;
    BP.modal('Tags', (body, close) => {
      const wrap = h('div', { class: 'kb-tagview' });
      const left = h('div', { class: 'kb-tl' }), right = h('div', { class: 'kb-tr' });
      const filter = h('input', { class: 'input small', placeholder: 'Filter tags…' });
      const drawLeft = () => {
        left.innerHTML = '';
        left.append(filter);
        const q = filter.value.trim().toLowerCase().replace(/^#/, '');
        const shown = all.filter((t) => !q || t.key.includes(q));
        if (!all.length) left.append(h('p', { class: 'muted small' }, 'No tags yet. Type #word in any page, or add a Tags property.'));
        shown.forEach((t) => left.append(h('button', { class: 'kb-tagrow' + (t.key === sel ? ' on' : ''), style: { paddingLeft: 8 + (t.key.split('/').length - 1) * 14 + 'px' }, onclick: () => { sel = t.key; drawLeft(); drawRight(); } }, h('span', null, '#' + t.name.split('/').pop()), h('span', { class: 'kb-n' }, String(t.pages.size)))));
      };
      const drawRight = () => {
        right.innerHTML = '';
        if (!sel) return right.append(h('p', { class: 'muted' }, 'Pick a tag to see its pages.'));
        const pages = KB.pagesWithTag(sel).sort((a, b) => (b.updated || 0) - (a.updated || 0));
        right.append(h('h3', null, '#' + sel), h('p', { class: 'muted small' }, pages.length + (pages.length === 1 ? ' page' : ' pages')));
        pages.forEach((q) => right.append(h('button', { class: 'kb-pg wide', onclick: () => { close(); BP.open(q.id); } }, h('span', null, q.icon || '📄'), h('span', { class: 'kb-pt' }, q.title || 'Untitled'), h('span', { class: 'muted small' }, BP.fmtDay(new Date(q.updated || 0).toISOString().slice(0, 10))))));
      };
      filter.addEventListener('input', drawLeft);
      drawLeft(); drawRight();
      wrap.append(left, right);
      body.append(wrap);
    }, { class: 'wide' });
  };

  /* ---------- clicks on tag links anywhere ---------- */
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href^="bp://tag/"]');
    if (!a) return;
    e.preventDefault(); e.stopPropagation();
    let t = a.getAttribute('href').slice(9);
    try { t = decodeURIComponent(t); } catch (_) {}
    BP.closePopovers(0);
    KB.openTag(t);
  }, true);

  /* ---------- hover a page link: a small preview of that page ---------- */
  let hoverT = null, peek = null, peekFor = null, peekEd = null;
  const closePeek = () => { clearTimeout(hoverT); if (peekEd) { try { peekEd.destroy(); } catch (_) {} peekEd = null; } if (peek) { peek.remove(); peek = null; } peekFor = null; };
  KB.closePeek = closePeek;
  document.addEventListener('mouseover', (e) => {
    if (matchMedia('(hover: none)').matches) return;
    const a = e.target.closest && e.target.closest('a[href^="bp://page/"]');
    if (peek && (peek.contains(e.target) || a === peekFor)) { clearTimeout(hoverT); return; }
    clearTimeout(hoverT);
    if (!a) { if (peek) hoverT = setTimeout(closePeek, 300); return; }
    hoverT = setTimeout(() => {
      closePeek();
      const p = BP.page(a.getAttribute('href').slice(10));
      if (!p || !a.isConnected) return;
      peekFor = a;
      peek = h('div', { class: 'kb-peek' });
      peek.append(h('div', { class: 'kb-peek-h' }, h('span', null, p.icon || '📄'), h('b', null, p.title || 'Untitled')));
      const body = h('div', { class: 'kb-peek-b' });
      peek.append(body);
      if (BP.isTrashed(p)) body.append(h('p', { class: 'muted small' }, 'This page is in the trash.'));
      else if (p.type === 'db') body.append(h('p', { class: 'muted small' }, 'Database · ' + BP.rows(p.id).length + ' rows'));
      else if (p.type === 'canvas') body.append(h('p', { class: 'muted small' }, 'Canvas · ' + ((p.canvas && p.canvas.nodes) || []).length + ' cards'));
      else {
        const blocks = JSON.parse(JSON.stringify((p.blocks || []).filter((b) => b.type !== 'page' && b.type !== 'dbview').slice(0, 10)));
        if (!blocks.length || (blocks.length === 1 && !BP.textOf(blocks[0].text || '').trim())) body.append(h('p', { class: 'muted small' }, 'Empty page'));
        else peekEd = new BP.Editor(body, { id: 'peek', type: 'page', blocks }, { readonly: true });
      }
      peek.addEventListener('mouseleave', () => { hoverT = setTimeout(closePeek, 300); });
      peek.addEventListener('click', (ev) => { if (!ev.target.closest('a')) { closePeek(); BP.open(p.id); } });
      document.body.append(peek);
      const r = a.getBoundingClientRect(), pw = peek.offsetWidth, ph = peek.offsetHeight;
      let x = Math.min(Math.max(8, r.left), innerWidth - pw - 8), y = r.bottom + 6;
      if (y + ph > innerHeight - 8) y = Math.max(8, r.top - ph - 6);
      peek.style.left = x + 'px'; peek.style.top = y + 'px';
    }, 550);
  });
  document.addEventListener('mousedown', (e) => { if (peek && !peek.contains(e.target)) closePeek(); }, true);
  document.addEventListener('keydown', (e) => { if (peek && e.key === 'Escape') closePeek(); }, true);

  /* ---------- daily notes ---------- */
  const DAY_NAMES = (n) => new Date(2024, 0, 7 + n).toLocaleDateString(undefined, { weekday: 'long' });
  const MONTH_NAMES = (n) => new Date(2024, n, 1).toLocaleDateString(undefined, { month: 'long' });
  KB.fmtDate = (d, f) => String(f || 'YYYY-MM-DD').replace(/YYYY|MMMM|MMM|MM|M|DD|D|dddd|ddd/g, (t) => ({
    YYYY: d.getFullYear(), MMMM: MONTH_NAMES(d.getMonth()), MMM: MONTH_NAMES(d.getMonth()).slice(0, 3), MM: String(d.getMonth() + 1).padStart(2, '0'), M: d.getMonth() + 1,
    DD: String(d.getDate()).padStart(2, '0'), D: d.getDate(), dddd: DAY_NAMES(d.getDay()), ddd: DAY_NAMES(d.getDay()).slice(0, 3),
  }[t]));
  KB.dailySettings = () => {
    const s = BP.state.settings;
    s.daily = Object.assign({ folder: 'Daily notes', format: 'YYYY-MM-DD', template: '' }, s.daily || {});
    return s.daily;
  };
  const isoOf = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  KB.dailyPages = () => KB.pages().filter((p) => p.daily).sort((a, b) => (a.daily < b.daily ? -1 : 1));
  KB.dailyFor = (d, create) => {
    const iso = isoOf(d);
    const have = KB.pages().find((p) => p.daily === iso);
    if (have || !create) return have || null;
    const cfg = KB.dailySettings();
    let folder = null;
    if (cfg.folder) {
      folder = KB.pages().find((p) => p.dailyFolder && !p.parent) || KB.pages().find((p) => !p.parent && p.type === 'page' && (p.title || '') === cfg.folder);
      if (!folder) folder = BP.createPage(null, { title: cfg.folder, icon: '🗓', blocks: [], dailyFolder: true });
      else folder.dailyFolder = true;
    }
    const title = KB.fmtDate(d, cfg.format);
    const tpl = cfg.template && (BP.state.templates || []).find((t) => t.id === cfg.template);
    let p;
    if (tpl) { p = BP.useTemplate(tpl, folder ? folder.id : null); p.title = title; }
    else p = BP.createPage(folder ? folder.id : null, { title, icon: '🗓', blocks: [BP.newBlock('p')] });
    p.daily = iso;
    BP.touch(p);
    return p;
  };
  KB.openToday = () => { const p = KB.dailyFor(new Date(), true); BP.open(p.id); };
  KB.openDailyStep = (dir) => {
    const cur = BP.page(BP.state.current);
    const all = KB.dailyPages();
    if (!all.length) return BP.toast('No daily notes yet. Use Today to start one.');
    if (!cur || !cur.daily) return BP.open(all[all.length - 1].id);
    const i = all.findIndex((p) => p.id === cur.id);
    const nx = all[i + dir];
    if (nx) BP.open(nx.id); else BP.toast(dir < 0 ? 'This is the first daily note' : 'This is the newest daily note');
  };

  /* ---------- command palette (Ctrl+P) ---------- */
  KB.commands = () => {
    const p = BP.page(BP.state.current);
    const U = BP.ui || {};
    const pageCmd = (name, fn) => (p ? { name, run: () => fn(p) } : null);
    return [
      { name: 'New page', key: 'Ctrl+N', run: () => BP.newPage(null) },
      { name: 'New canvas', run: () => BP.canvas && BP.open(BP.canvas.create(null).id) },
      { name: 'Open today’s daily note', key: 'Ctrl+Shift+D', run: KB.openToday },
      { name: 'Previous daily note', run: () => KB.openDailyStep(-1) },
      { name: 'Next daily note', run: () => KB.openDailyStep(1) },
      { name: 'Search pages', key: 'Ctrl+K', run: () => U.openSearch && U.openSearch() },
      { name: 'Open graph view', key: 'Ctrl+G', run: () => BP.graph && BP.graph.open({}) },
      pageCmd('Open local graph of this page', (q) => BP.graph && BP.graph.open({ local: q.id })),
      pageCmd('Show links panel (backlinks, outline)', () => U.togglePanel && U.togglePanel('links', true)),
      { name: 'Browse tags', run: () => KB.openTag() },
      { name: 'Open a random page', run: () => { const all = KB.pages().filter((x) => !x.rowOf); if (all.length) BP.open(all[Math.floor(Math.random() * all.length)].id); } },
      { name: 'Toggle sidebar', key: 'Ctrl+\\', run: () => U.toggleSidebar && U.toggleSidebar() },
      { name: 'Switch light / dark theme', run: () => BP.setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark') },
      { name: 'Open settings', key: 'Ctrl+,', run: () => BP.openSettings() },
      { name: 'Templates', run: () => U.openTemplates && U.openTemplates() },
      { name: 'Open trash', run: () => U.openTrash && U.openTrash() },
      { name: 'Join a shared page', run: () => BP.joinDialog && BP.joinDialog() },
      { name: 'Import an Obsidian vault…', run: () => BP.vault && BP.vault.pickImport() },
      { name: 'Export workspace as an Obsidian vault…', run: () => BP.vault && BP.vault.exportDialog(null) },
      pageCmd('Export this page as an Obsidian vault…', (q) => BP.vault && BP.vault.exportDialog(q.id)),
      { name: 'Export full backup (.json)', run: () => BP.exportWorkspace() },
      pageCmd('Share this page', (q) => BP.shareDialog(q)),
      pageCmd('Export / print this page…', (q) => BP.shareDialog(q, 'export')),
      pageCmd('Page history', (q) => U.historyDialog && U.historyDialog(q)),
      pageCmd('Page info', (q) => U.infoDialog && U.infoDialog(q)),
      pageCmd('Move page to…', (q) => U.moveDialog && U.moveDialog(q)),
      pageCmd('Duplicate page', (q) => BP.open(BP.clonePage(q.id).id)),
      pageCmd('Add to / remove from favorites', (q) => { q.favorite = !q.favorite; BP.save(); BP.renderAll(); }),
      pageCmd('Lock / unlock page', (q) => { q.locked = !q.locked; BP.touch(q); BP.renderAll(); }),
      pageCmd('Add a property', (q) => { if (!KB.hasProps(q)) q.tags = []; BP.touch(q); BP.renderAll(); }),
      pageCmd('Copy link to this page', (q) => { navigator.clipboard.writeText('bp://page/' + q.id); BP.toast('Link copied'); }),
      pageCmd('Save page as template', (q) => { BP.saveTemplate(q.id); BP.toast('Saved as a template'); }),
      pageCmd('Move page to trash', (q) => U.trashPage && U.trashPage(q)),
      { name: 'Go back', key: 'Alt+←', run: () => U.go && U.go(-1) },
      { name: 'Go forward', key: 'Alt+→', run: () => U.go && U.go(1) },
    ].filter(Boolean);
  };
  KB.palette = () => {
    const s = BP.state.settings;
    BP.modal('', (body, close) => {
      const inp = h('input', { class: 'search-in', placeholder: 'Type a command…' });
      const list = h('div', { class: 'search-list' });
      body.append(inp, list);
      const cmds = KB.commands();
      let items = [], idx = 0;
      const score = (name, q) => {
        const n = name.toLowerCase();
        if (!q) return 1;
        if (n.startsWith(q)) return 100;
        if (n.includes(q)) return 60;
        let i = 0; for (const ch of n) if (ch === q[i]) i++;       // letters in order: "ogv" finds "Open graph view"
        return i === q.length ? 20 : 0;
      };
      const run = () => {
        const q = inp.value.trim().toLowerCase();
        const recent = s.recentCmds || [];
        items = cmds.map((c) => ({ c, s: score(c.name, q) + (recent.includes(c.name) ? 5 - recent.indexOf(c.name) : 0) })).filter((x) => x.s > (q ? 5 : 0)).sort((a, b) => b.s - a.s).map((x) => x.c);
        idx = Math.min(idx, Math.max(0, items.length - 1));
        list.innerHTML = '';
        if (!items.length) list.append(h('div', { class: 'muted pad' }, 'No matching command'));
        items.forEach((c, i) => {
          const row = h('div', { class: 'sr-item' + (i === idx ? ' on' : ''), onclick: () => pick(c) }, h('span', { class: 'sr-ico' }, '⌘'), h('span', { class: 'sr-main' }, h('b', null, c.name)), c.key ? h('span', { class: 'kbd' }, c.key) : null);
          row.addEventListener('mouseenter', () => { idx = i; list.querySelectorAll('.sr-item').forEach((x, j) => x.classList.toggle('on', j === i)); });
          list.append(row);
        });
      };
      const pick = (c) => {
        s.recentCmds = [c.name, ...(s.recentCmds || []).filter((x) => x !== c.name)].slice(0, 5);
        BP.save();
        close();
        setTimeout(() => c.run(), 0);
      };
      inp.addEventListener('input', () => { idx = 0; run(); });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { idx = Math.min(items.length - 1, idx + 1); e.preventDefault(); run(); }
        else if (e.key === 'ArrowUp') { idx = Math.max(0, idx - 1); e.preventDefault(); run(); }
        else if (e.key === 'Enter' && items[idx]) pick(items[idx]);
        const on = list.querySelector('.on'); on && on.scrollIntoView({ block: 'nearest' });
      });
      run();
      inp.focus();      // right away: keys typed straight after Ctrl+P must not land in the page behind
      setTimeout(() => inp.focus(), 20);
    }, { class: 'search', bare: true });
  };
})();

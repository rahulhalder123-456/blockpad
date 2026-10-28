/* Blockpad editor extensions: synced blocks, tabs, buttons, HTML, meeting notes, link previews, inline comments, AI. */
(function () {
  const BP = (window.BP = window.BP || {});
  const { h, uid } = BP;
  const E = BP.Editor.prototype;
  const H = BP.editorHelpers;
  const today = () => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const subst = (s) => String(s || '').replace(/\{date\}/g, today()).replace(/\{time\}/g, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })).replace(/\{me\}/g, BP.me());

  /* ---------- rendering of the extra block types ---------- */
  E.renderExtra = function (b, main) {
    switch (b.type) {
      case 'synced': {
        const where = [];
        BP.allPages().forEach((p) => { if (p.id !== this.page.id && !BP.isTrashed(p) && BP.hasSync(p, b.sid)) where.push(p.title || 'Untitled'); });
        const box = h('div', { class: 'synced' });
        const head = h('div', { class: 'synced-head' }, h('span', null, '🔁 Synced block'),
          h('span', { class: 'muted small' }, where.length ? 'also on: ' + where.slice(0, 3).join(', ') + (where.length > 3 ? ' +' + (where.length - 3) : '') : 'no other copies yet. Copy it, then /Paste synced block on another page'));
        if (!this.readonly) head.append(h('button', { class: 'btn small', onclick: () => { BP.syncClip = b.sid; BP.toast('Copied. Use /Paste synced block on another page.'); } }, 'Copy'));
        const body = h('div', { class: 'synced-body' });
        this.renderList(b.children, body);
        box.append(head, body);
        main.append(box);
        break;
      }
      case 'flow': {
        const wrap = h('div', { class: 'flow' + (b.dir === 'h' ? ' hz' : '') });
        const edit = (el, s, key) => {
          el.addEventListener('input', () => { s[key] = el.textContent; this.typed(); });
          el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
          el.addEventListener('paste', (e) => { e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData.getData('text/plain') || '').replace(/\s+/g, ' ')); });
        };
        b.steps.forEach((s, i) => {
          if (i) wrap.append(h('div', { class: 'flow-arrow' }, b.dir === 'h' ? '⇄' : '⇅'));
          const t = h('div', { class: 'flow-t', 'data-ph': 'Title', contenteditable: this.readonly ? 'false' : 'true', spellcheck: 'true' }, s.t);
          const d = h('div', { class: 'flow-d', 'data-ph': 'Details', contenteditable: this.readonly ? 'false' : 'true', spellcheck: 'true' }, s.d);
          edit(t, s, 't'); edit(d, s, 'd');
          const box = h('div', { class: 'flow-box' + (i === 0 || i === b.steps.length - 1 ? ' ends' : '') }, t, d);
          if (!this.readonly && b.steps.length > 1) box.append(h('button', { class: 'flow-x', title: 'Remove this step', html: BP.icons.x, onclick: () => this.mutate(() => { b.steps.splice(i, 1); }) }));
          wrap.append(box);
        });
        if (!this.readonly) wrap.append(h('button', { class: 'btn small flow-add', onclick: () => this.mutate(() => { b.steps.push({ t: 'Step', d: 'Details' }); }) }, '+ Step'));
        main.append(wrap);
        break;
      }
      case 'tabs': {
        b.active = Math.max(0, Math.min(b.active || 0, b.children.length - 1));
        const wrap = h('div', { class: 'tabs' });
        const bar = h('div', { class: 'tabs-bar' });
        b.children.forEach((t, i) => {
          bar.append(h('button', {
            class: 'tab-btn' + (i === b.active ? ' on' : ''),
            title: this.readonly ? '' : 'Double-click to rename, right-click for more',
            onclick: () => { if (b.active !== i) { b.active = i; BP.touch(this.page); this.render(); } },
            ondblclick: async () => { if (this.readonly) return; const n = await BP.prompt('Tab name', t.title); if (n) this.mutate(() => { t.title = n; }); },
            oncontextmenu: (e) => {
              e.preventDefault();
              if (this.readonly) return;
              BP.menu({ x: e.clientX, y: e.clientY }, [
                { label: 'Rename', icon: '✎', onClick: async () => { const n = await BP.prompt('Tab name', t.title); if (n) this.mutate(() => { t.title = n; }); } },
                b.children.length > 1 ? { label: 'Delete tab', icon: BP.icons.trash, danger: true, onClick: () => this.mutate(() => { b.children.splice(i, 1); b.active = Math.min(b.active, b.children.length - 1); }) } : null,
              ]);
            },
          }, t.title || 'Tab'));
        });
        if (!this.readonly) bar.append(h('button', { class: 'tab-btn add', title: 'Add a tab', onclick: () => this.mutate(() => { b.children.push({ id: uid(), type: 'tab', title: 'Tab ' + (b.children.length + 1), children: [BP.newBlock('p')] }); b.active = b.children.length - 1; }) }, '+'));
        const pane = h('div', { class: 'tab-pane' });
        this.renderList(b.children[b.active].children, pane);
        wrap.append(bar, pane);
        main.append(wrap);
        break;
      }
      case 'button': {
        main.append(h('button', { class: 'btn primary bp-button', onclick: () => this.runButton(b) }, b.label || 'Button'));
        if (!this.readonly) main.append(h('button', { class: 'icon-btn', title: 'Edit button', html: BP.icons.settings, onclick: () => this.editButton(b) }));
        break;
      }
      case 'html': {
        const box = h('div', { class: 'htmlblock' });
        const frame = h('iframe', { class: 'html-frame', sandbox: '', style: { height: (b.h || 160) + 'px' } });
        const draw = () => { frame.srcdoc = '<!doctype html><meta charset="utf-8"><style>body{margin:8px;font-family:system-ui,sans-serif}</style>' + (b.text || ''); };
        draw();
        const ta = this.plain(b, 'code', '<div>HTML and CSS here (scripts are disabled)</div>');
        ta.addEventListener('input', draw);
        const code = h('div', { class: 'html-code' }, ta);
        code.style.display = 'none';
        const tools = h('div', { class: 'html-bar' }, h('span', { class: 'muted small' }, 'HTML · scripts are disabled'));
        if (!this.readonly) {
          const hin = h('input', { class: 'input small', type: 'number', min: '40', max: '1200', value: b.h || 160, title: 'Height (px)' });
          hin.addEventListener('input', () => { b.h = Math.max(40, Math.min(1200, +hin.value || 160)); frame.style.height = b.h + 'px'; this.typed(); });
          tools.append(hin, h('button', { class: 'btn small', onclick: (e) => { const open = code.style.display === 'none'; code.style.display = open ? '' : 'none'; e.currentTarget.textContent = open ? 'Hide code' : 'Edit code'; if (open) { ta.dispatchEvent(new Event('input')); } } }, 'Edit code'));
        }
        box.append(tools, frame, code);
        main.append(box);
        break;
      }
    }
  };

  /* ---------- buttons ---------- */
  E.runButton = function (b) {
    if (b.action === 'link') { if (b.url) window.open(/^https?:/i.test(b.url) ? b.url : 'https://' + b.url, '_blank'); else BP.toast('Set a link in the button settings'); return; }
    if (b.action === 'addrow') {
      const db = BP.page(b.db);
      if (!db || db.type !== 'db' || BP.isTrashed(db)) return BP.toast('Pick a database in the button settings');
      const r = BP.addRow(db.id, subst(b.rowTitle || ''), {});
      BP.toast('Added “' + (r.title || 'Untitled') + '” to ' + (db.title || 'the database'));
      this.render();
      return;
    }
    const blocks = BP.mdToBlocks(subst(b.template || ''));
    if (!blocks.length) blocks.push(BP.newBlock('p'));
    this.mutate(() => { const f = BP.findBlock(this.page.blocks, b.id); f.list.splice(f.index + 1, 0, ...blocks); }, { id: blocks[0].id, pos: 'end' });
  };
  E.editButton = function (b) {
    BP.modal('Button', (body, close) => {
      const label = h('input', { class: 'input', value: b.label || '' });
      const act = h('select', { class: 'input' }, [['insert', 'Add blocks below the button'], ['addrow', 'Add a row to a database'], ['link', 'Open a link']].map(([k, n]) => h('option', { value: k, selected: k === (b.action || 'insert') ? '' : null }, n)));
      const tpl = h('textarea', { class: 'input mono', rows: '6', placeholder: '## Heading\n- [ ] a to-do\nUse {date}, {time}, {me}' });
      tpl.value = b.template || '';
      const dbs = BP.allPages().filter((p) => p.type === 'db' && !BP.isTrashed(p));
      const db = h('select', { class: 'input' }, dbs.map((d) => h('option', { value: d.id, selected: d.id === b.db ? '' : null }, (d.icon || '🗂') + ' ' + (d.title || 'Untitled'))));
      const rt = h('input', { class: 'input', value: b.rowTitle || '', placeholder: 'Row title (supports {date})' });
      const url = h('input', { class: 'input', value: b.url || '', placeholder: 'https://…' });
      const sec = { insert: h('div', { class: 'f-col' }, h('label', { class: 'muted' }, 'Markdown to insert'), tpl), addrow: h('div', { class: 'f-col' }, h('label', { class: 'muted' }, 'Database'), db, rt), link: h('div', { class: 'f-col' }, h('label', { class: 'muted' }, 'Link'), url) };
      const show = () => Object.keys(sec).forEach((k) => (sec[k].style.display = k === act.value ? '' : 'none'));
      act.onchange = show;
      show();
      body.append(h('label', { class: 'muted' }, 'Label'), label, h('label', { class: 'muted' }, 'When clicked'), act, sec.insert, sec.addrow, sec.link,
        h('div', { class: 'row-end' }, h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => { this.mutate(() => { b.label = label.value || 'Button'; b.action = act.value; b.template = tpl.value; b.db = db.value; b.rowTitle = rt.value; b.url = url.value; }); close(); } }, 'Save')));
    }, { class: 'small' });
  };

  /* ---------- menu extras: synced blocks, AI ---------- */
  E.makeSynced = function (b) {
    const sid = uid();
    this.mutate(() => { const f = BP.findBlock(this.page.blocks, b.id); f.list.splice(f.index, 1, { id: uid(), type: 'synced', sid, children: [JSON.parse(JSON.stringify(b))] }); });
    BP.syncClip = sid;
    BP.toast('Synced block created. Use /Paste synced block on another page.');
  };
  E.extraMenuItems = function (b) {
    const items = [];
    if (b.type === 'synced') {
      items.push({ label: 'Copy synced block', icon: '📌', onClick: () => { BP.syncClip = b.sid; BP.toast('Copied. Use /Paste synced block on another page.'); } },
        { label: 'Unsync (keep a normal copy)', icon: '⛓', onClick: () => this.mutate(() => { const f = BP.findBlock(this.page.blocks, b.id); f.list.splice(f.index, 1, ...JSON.parse(JSON.stringify(b.children || []))); }) });
    } else if (!['column', 'tab'].includes(b.type)) items.push({ label: 'Make synced block', icon: '🔁', onClick: () => this.makeSynced(b) });
    if (b.type === 'flow') items.push({ label: b.dir === 'h' ? 'Arrange vertically' : 'Arrange horizontally', icon: '⇅', onClick: () => this.mutate(() => { b.dir = b.dir === 'h' ? 'v' : 'h'; }) },
      { label: 'Turn into text lines', icon: '↻', onClick: () => this.mutate(() => { const f = BP.findBlock(this.page.blocks, b.id); f.list.splice(f.index, 1, ...b.steps.flatMap((s) => [BP.newBlock('p', BP.esc(s.t)), BP.newBlock('p', BP.esc(s.d))])); }) });
    if (b.type === 'button') items.push({ label: 'Edit button…', icon: BP.icons.settings, onClick: () => this.editButton(b) });
    if (b.type === 'bookmark' && b.src) items.push({ label: 'Refresh link preview', icon: '↻', onClick: () => { delete BP.state.meta[b.src]; BP.save(); this.render(); } });
    if (BP.rich(b.type) && b.type !== 'divider') items.push({ label: 'Ask AI about this block', icon: '✨', submenu: () => BP.AI_ACTIONS.map((a) => ({ label: a.label, onClick: () => this.aiRun(a, BP.textOf(b.text), null, b) })) });
    return items;
  };

  /* ---------- linked database view ---------- */
  E.pickLinkedDb = function (b, empty) {
    const dbs = BP.allPages().filter((p) => p.type === 'db' && !BP.isTrashed(p));
    if (!dbs.length) return BP.toast('There are no databases yet. Use /Table view to make one.');
    BP.modal('Linked view of a database', (body, close) => {
      const sel = h('select', { class: 'input' }, dbs.map((d) => h('option', { value: d.id }, (d.icon || '🗂') + ' ' + (d.title || 'Untitled') + ' (' + BP.rows(d.id).length + ' rows)')));
      body.append(h('p', { class: 'muted' }, 'The same rows, shown here with their own filters, sorts and layout.'), sel, h('div', { class: 'row-end' }, h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => {
        const db = BP.page(sel.value);
        const nb = Object.assign(BP.newBlock('dbview'), { ref: db.id, linked: true, views: db.views.map((v) => Object.assign(JSON.parse(JSON.stringify(v)), { id: uid() })) });
        close();
        this.mutate(() => { const ff = BP.findBlock(this.page.blocks, b.id); if (empty) ff.list.splice(ff.index, 1, nb); else ff.list.splice(ff.index + 1, 0, nb); if (ff.list[ff.list.length - 1] === nb) ff.list.push(BP.newBlock('p')); });
      } }, 'Add view')));
    }, { class: 'small' });
  };

  /* ---------- meeting notes + recorder ---------- */
  BP.meetingBlocks = () => {
    const n = (t, x, e) => Object.assign(BP.newBlock(t, x || ''), e || {});
    return [n('h2', 'Meeting notes'), n('bullet', '<b>Date:</b> ' + today()), n('bullet', '<b>Attendees:</b> '), n('h3', 'Agenda'), n('number', ''), n('number', ''), n('h3', 'Notes'), n('p', ''), n('h3', 'Action items'), n('todo', ''), n('todo', ''), n('h3', 'Recording'), n('audio')];
  };
  E.recorderUI = function (close, setSrc) {
    const box = h('div', { class: 'recorder' });
    const status = h('span', { class: 'muted small' }, 'Records from your microphone and stores the audio in the page.');
    const btn = h('button', { class: 'btn danger wide' }, '● Record');
    let rec = null, chunks = [], timer = null, t0 = 0, stream = null;
    btn.onclick = async () => {
      if (rec) { rec.stop(); return; }
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { status.textContent = 'Microphone not available: ' + e.message; return; }
      rec = new MediaRecorder(stream);
      chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        clearInterval(timer);
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        rec = null;
        const fr = new FileReader();
        fr.onload = () => { close(); setSrc(fr.result, 'Recording ' + new Date().toLocaleString() + '.webm', blob.size); };
        fr.readAsDataURL(blob);
      };
      rec.start(1000);
      t0 = Date.now();
      btn.textContent = '■ Stop and save';
      timer = setInterval(() => { const s = Math.round((Date.now() - t0) / 1000); status.textContent = 'Recording… ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }, 500);
    };
    box.append(btn, status);
    return box;
  };

  /* ---------- link previews (needs internet; falls back to the plain card offline) ---------- */
  const inflight = {};
  BP.linkMeta = function (url, cb) {
    const cache = BP.state.meta = BP.state.meta || {};
    if (cache[url]) return cb(cache[url].miss ? null : cache[url]);
    if (!window.bp || !window.bp.fetchMeta || !/^https?:/i.test(url)) return cb(null);
    if (!inflight[url]) inflight[url] = window.bp.fetchMeta(url).then((m) => { cache[url] = m && !m.error ? Object.assign(m, { t: Date.now() }) : { miss: true, t: Date.now() }; BP.save(); return cache[url]; }).catch(() => null);
    inflight[url].then((m) => cb(m && !m.miss ? m : null));
  };

  /* ---------- inline comments ---------- */
  E.commentSel = function () {
    const sel = getSelection();
    const r = sel.rangeCount ? sel.getRangeAt(0) : null;
    if (!r || r.collapsed) return BP.toast('Select some text first');
    const quote = r.toString().slice(0, 200);
    const saved = r.cloneRange();
    BP.prompt('Comment on “' + quote.slice(0, 40) + (quote.length > 40 ? '…' : '') + '”', '', 'Comment').then((text) => {
      if (!text || !text.trim()) return;
      const cid = uid().replace(/[^a-z0-9]/g, '').slice(0, 8);
      sel.removeAllRanges();
      sel.addRange(saved);
      const span = h('span', { class: 'cmt-' + cid });
      span.append(saved.extractContents());
      saved.insertNode(span);
      const nr = document.createRange();
      nr.selectNodeContents(span);
      sel.removeAllRanges();
      sel.addRange(nr);
      this.afterFormat();
      (this.page.comments = this.page.comments || []).push({ id: cid, text: text.trim(), t: Date.now(), resolved: false, quote, replies: [], author: BP.me() });
      this.hideToolbar();
      this.flushTyping();
      BP.touch(this.page);
      BP.openComments && BP.openComments(cid);
    });
  };
  BP.removeCommentMarks = function (page, cid) {
    BP.walkBlocks(page.blocks || [], (b) => {
      if (!BP.rich(b.type) || !b.text || b.text.indexOf('cmt-' + cid) < 0) return;
      const doc = new DOMParser().parseFromString('<body>' + b.text + '</body>', 'text/html');
      doc.body.querySelectorAll('span.cmt-' + cid).forEach((s) => { while (s.firstChild) s.parentNode.insertBefore(s.firstChild, s); s.remove(); });
      b.text = BP.sanitize(doc.body.innerHTML);
    });
  };

  /* ---------- AI (bring your own model: Ollama / any OpenAI-compatible endpoint) ---------- */
  E.aiMenu = function (anchor) {
    const sel = getSelection();
    const r = sel.rangeCount ? sel.getRangeAt(0) : null;
    const text = r ? r.toString() : '';
    const saved = r ? r.cloneRange() : null;
    BP.menu(anchor, BP.AI_ACTIONS.map((a) => ({ label: a.label, onClick: () => this.aiRun(a, text, saved) })));
  };
  E.aiRun = async function (a, text, savedRange, block) {
    if (!text.trim() && a.id !== 'continue') return BP.toast('Select some text first');
    const ctx = BP.currentPageMd ? BP.currentPageMd(this.page) : '';
    const done = BP.busy('✨ ' + a.label + '…');
    try {
      const out = await BP.aiChat([{ role: 'system', content: 'You are an editing assistant inside a notes app. Reply with only the result in plain text or simple Markdown, no preface. Always answer in the same language as the user text (English unless the text is in another language), never switch language.' }, { role: 'user', content: a.prompt + (a.id === 'continue' ? '\n\nPage so far:\n' + ctx.slice(-4000) : '\n\nText:\n' + text) }], { temperature: a.id === 'continue' || a.id === 'longer' ? 0.5 : 0.15, maxTokens: a.id === 'continue' ? 400 : 700 });
      done();
      if (a.mode === 'replace' && savedRange) {
        const s = getSelection(); s.removeAllRanges(); s.addRange(savedRange);
        document.execCommand('insertText', false, out.trim());
        this.afterFormat();
      } else {
        const blocks = BP.mdToBlocks(out);
        if (!blocks.length) return BP.toast('The model returned nothing');
        let anchorId = block && block.id;
        if (!anchorId) { const nd = savedRange && (savedRange.endContainer.nodeType === 1 ? savedRange.endContainer : savedRange.endContainer.parentElement); const el = nd && nd.closest && nd.closest('.block'); anchorId = el && el.dataset.id; }
        if (!anchorId) anchorId = this.page.blocks[this.page.blocks.length - 1].id;
        if (a.mode === 'replace' && block) this.mutate(() => { block.text = blocks[0].text; if (blocks.length > 1) { const f = BP.findBlock(this.page.blocks, block.id); f.list.splice(f.index + 1, 0, ...blocks.slice(1)); } }, { id: block.id });
        else this.mutate(() => { const f = BP.findBlock(this.page.blocks, anchorId); f.list.splice(f.index + 1, 0, ...blocks); }, { id: blocks[blocks.length - 1].id, pos: 'end' });
      }
    } catch (e) { done(); BP.aiError(e); }
  };
  E.aiPrompt = function (b) {
    if (!BP.aiConfigured()) return BP.aiSetupHint();
    BP.modal('Ask AI', (body, close) => {
      const ta = h('textarea', { class: 'input', rows: '4', placeholder: 'e.g. Write a short summary of this page, or: draft an agenda for a kickoff meeting' });
      const useCtx = h('input', { type: 'checkbox', checked: '' });
      body.append(ta, h('label', { class: 'chk' }, useCtx, ' Include this page as context'),
        h('div', { class: 'row-end' }, h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => {
          const prompt = ta.value.trim();
          if (!prompt) return;
          const withCtx = useCtx.checked;
          close();
          const done = BP.busy('✨ Thinking…');
          try {
            const ctx = withCtx && BP.currentPageMd ? '\n\nPage "' + (this.page.title || 'Untitled') + '":\n' + BP.currentPageMd(this.page).slice(0, 6000) : '';
            const out = await BP.aiChat([{ role: 'system', content: 'You write content for a notes app. Reply with Markdown only, no preface. Answer in the same language as the request.' }, { role: 'user', content: prompt + ctx }], { temperature: 0.4, maxTokens: 500 });
            done();
            const blocks = BP.mdToBlocks(out);
            if (!blocks.length) return BP.toast('The model returned nothing');
            this.mutate(() => { const f = BP.findBlock(this.page.blocks, b.id); const empty = !BP.textOf(b.text || '').trim(); f.list.splice(f.index + (empty ? 0 : 1), empty ? 1 : 0, ...blocks); }, { id: blocks[blocks.length - 1].id, pos: 'end' });
          } catch (e) { done(); BP.aiError(e); }
        } }, 'Generate')));
      setTimeout(() => ta.focus(), 30);
    }, { class: 'small' });
  };
})();

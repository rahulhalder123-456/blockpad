/* Blockpad block editor: rich text, slash menu, drag & drop, nesting, media, tables, undo. */
(function () {
  const BP = (window.BP = window.BP || {});
  const { h, esc, uid } = BP;

  /* ---------- caret helpers ---------- */
  const sel = () => getSelection();
  const selRange = () => (sel().rangeCount ? sel().getRangeAt(0) : null);
  const isPlainEl = (el) => el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT');
  function setCaret(el, where) {
    if (!el) return;
    el.focus();
    if (isPlainEl(el)) {
      const n = typeof where === 'number' ? Math.min(where, el.value.length) : where === 'start' ? 0 : el.value.length;
      el.setSelectionRange(n, n);
      return;
    }
    const r = document.createRange();
    if (typeof where === 'number') {
      let n = where, done = false;
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = w.nextNode())) {
        if (n <= node.length) { r.setStart(node, n); r.collapse(true); done = true; break; }
        n -= node.length;
      }
      if (!done) { r.selectNodeContents(el); r.collapse(false); }
    } else {
      r.selectNodeContents(el);
      r.collapse(where === 'start');
    }
    sel().removeAllRanges();
    sel().addRange(r);
  }
  function caretAtStart(el) {
    if (isPlainEl(el)) return el.selectionStart === 0 && el.selectionEnd === 0;
    const r = selRange();
    if (!r || !r.collapsed || !el.contains(r.startContainer)) return false;
    const pre = document.createRange();
    pre.selectNodeContents(el);
    pre.setEnd(r.startContainer, r.startOffset);
    return pre.toString().length === 0;
  }
  function caretAtEnd(el) {
    if (isPlainEl(el)) return el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
    const r = selRange();
    if (!r || !r.collapsed || !el.contains(r.startContainer)) return false;
    const post = document.createRange();
    post.selectNodeContents(el);
    post.setStart(r.endContainer, r.endOffset);
    return post.toString().length === 0;
  }
  function onEdgeLine(el, dir) {
    if (isPlainEl(el)) {
      const v = el.value, p = el.selectionStart;
      return dir < 0 ? v.lastIndexOf('\n', p - 1) < 0 : v.indexOf('\n', p) < 0;
    }
    const r = selRange();
    if (!r || !r.collapsed) return false;
    const rr = r.cloneRange();
    rr.collapse(true);
    const er = el.getBoundingClientRect();
    const rect = rr.getClientRects()[0] || (r.startContainer.nodeType === 1 ? r.startContainer.getBoundingClientRect() : er);
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 24;
    return dir < 0 ? rect.top - er.top < lh * 0.9 : er.bottom - rect.bottom < lh * 0.9;
  }
  function caretRect(el) {
    const r = selRange();
    if (r) {
      const rr = r.cloneRange();
      rr.collapse(true);
      const rect = rr.getClientRects()[0];
      if (rect && (rect.width || rect.height)) return rect;
    }
    return el.getBoundingClientRect();
  }
  function textBeforeCaret(el) {
    const r = selRange();
    if (!r || !el.contains(r.startContainer)) return null;
    const pre = document.createRange();
    pre.selectNodeContents(el);
    pre.setEnd(r.startContainer, r.startOffset);
    return pre.toString();
  }
  function rangeFromChars(el, a, b) {
    const r = document.createRange();
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let pos = 0, node, set1 = false;
    while ((node = w.nextNode())) {
      const end = pos + node.length;
      if (!set1 && a <= end) { r.setStart(node, a - pos); set1 = true; }
      if (set1 && b <= end) { r.setEnd(node, b - pos); return r; }
      pos = end;
    }
    return null;
  }
  function splitHtml(el) {
    const r = selRange();
    const pre = document.createRange(), post = document.createRange();
    pre.selectNodeContents(el);
    pre.setEnd(r.startContainer, r.startOffset);
    post.selectNodeContents(el);
    post.setStart(r.endContainer, r.endOffset);
    const d1 = h('div'), d2 = h('div');
    d1.append(pre.cloneContents());
    d2.append(post.cloneContents());
    return [BP.sanitize(d1.innerHTML), BP.sanitize(d2.innerHTML)];
  }
  const blobUrls = new Map();
  function dataToBlobUrl(d) {
    if (blobUrls.has(d)) return blobUrls.get(d);
    try {
      const [head, b64] = d.split(',');
      const mime = (/:(.*?)[;,]/.exec(head) || [0, 'application/octet-stream'])[1];
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const u = URL.createObjectURL(new Blob([arr], { type: mime }));
      blobUrls.set(d, u);
      return u;
    } catch (_) { return d; }
  }
  const autosize = (ta) => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };

  /* ---------- block catalogue ---------- */
  const TEXT_TYPES = ['p', 'h1', 'h2', 'h3', 'bullet', 'number', 'todo', 'toggle', 'quote', 'callout'];
  const CAN_NEST = ['p', 'h1', 'h2', 'h3', 'bullet', 'number', 'todo', 'toggle', 'quote', 'callout'];
  const LABEL = { p: 'Text', h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3', bullet: 'Bulleted list', number: 'Numbered list', todo: 'To-do list', toggle: 'Toggle list', quote: 'Quote', callout: 'Callout', code: 'Code' };
  const ITEMS = [
    { g: 'Basic blocks', t: 'p', label: 'Text', desc: 'Just start writing', ico: 'Aa', kw: 'paragraph plain' },
    { t: 'h1', label: 'Heading 1', desc: 'Big section heading', ico: 'H1', kw: 'title h1' },
    { t: 'h2', label: 'Heading 2', desc: 'Medium section heading', ico: 'H2', kw: 'h2 subtitle' },
    { t: 'h3', label: 'Heading 3', desc: 'Small section heading', ico: 'H3', kw: 'h3' },
    { t: 'th1', label: 'Toggle heading 1', desc: 'Big heading that hides content', ico: '▸H1', kw: 'collapsible h1' },
    { t: 'th2', label: 'Toggle heading 2', desc: 'Medium heading that hides content', ico: '▸H2', kw: 'collapsible h2' },
    { t: 'th3', label: 'Toggle heading 3', desc: 'Small heading that hides content', ico: '▸H3', kw: 'collapsible h3' },
    { t: 'bullet', label: 'Bulleted list', desc: 'A simple bulleted list', ico: '•', kw: 'ul unordered' },
    { t: 'number', label: 'Numbered list', desc: 'A list with numbering', ico: '1.', kw: 'ol ordered' },
    { t: 'todo', label: 'To-do list', desc: 'Track tasks with checkboxes', ico: '☑', kw: 'checkbox task' },
    { t: 'toggle', label: 'Toggle list', desc: 'Hide content inside', ico: '▸', kw: 'collapse' },
    { t: 'quote', label: 'Quote', desc: 'Capture a quote', ico: '❝', kw: 'blockquote' },
    { t: 'callout', label: 'Callout', desc: 'Make writing stand out', ico: '💡', kw: 'note info' },
    { t: 'divider', label: 'Divider', desc: 'Visually divide blocks', ico: '—', kw: 'hr line separator' },
    { t: 'code', label: 'Code', desc: 'Capture a code snippet', ico: '</>', kw: 'snippet pre' },
    { t: 'equation', label: 'Equation', desc: 'Show a formula as text', ico: '∑', kw: 'math latex' },
    { g: 'Pages & structure', t: 'page', label: 'Page', desc: 'Create a sub-page', ico: '📄', kw: 'subpage new' },
    { t: 'canvas', label: 'Canvas', desc: 'A board of cards joined by arrows', ico: '🧭', kw: 'cards mind map diagram obsidian' },      // no "board" in the words: /board must still give the Board view
    { t: 'flow', label: 'Flow diagram', desc: 'Boxes joined by arrows (process, request cycle)', ico: '⇅', kw: 'diagram process steps arrows cycle' },
    { t: 'tabs', label: 'Tabs', desc: 'Switch between groups of blocks', ico: '⎘', kw: 'tab panel' },
    { t: 'synced', label: 'Synced block', desc: 'Content mirrored across pages', ico: '🔁', kw: 'sync mirror shared' },
    { t: 'syncedpaste', label: 'Paste synced block', desc: 'Insert the synced block you copied', ico: '📌', kw: 'sync mirror paste', cond: () => !!BP.syncClip },
    { t: 'button', label: 'Button', desc: 'Click to add blocks, a row, or open a link', ico: '🔘', kw: 'template action automation' },
    { t: 'html', label: 'HTML', desc: 'Render a snippet of HTML and CSS', ico: '⌥', kw: 'code snippet web' },
    { t: 'meeting', label: 'Meeting notes', desc: 'Agenda, notes, actions and a recorder', ico: '🎙', kw: 'agenda minutes record' },
    { t: 'table', label: 'Table', desc: 'A simple grid of cells', ico: '▦', kw: 'grid' },
    { t: 'columns2', label: '2 columns', desc: 'Two side-by-side columns', ico: '◫', kw: 'layout' },
    { t: 'columns3', label: '3 columns', desc: 'Three side-by-side columns', ico: '☰', kw: 'layout' },
    { t: 'toc', label: 'Table of contents', desc: 'Links to your headings', ico: '≡', kw: 'toc contents outline' },
    { g: 'Media', t: 'image', label: 'Image', desc: 'Upload or link an image', ico: '🖼', kw: 'picture photo' },
    { t: 'video', label: 'Video', desc: 'Upload or embed a video', ico: '🎬', kw: 'youtube movie' },
    { t: 'audio', label: 'Audio', desc: 'Upload or link an audio file', ico: '🎧', kw: 'sound music mp3 podcast' },
    { t: 'pdf', label: 'PDF', desc: 'Show a PDF right in the page', ico: '📕', kw: 'document viewer' },
    { t: 'file', label: 'File', desc: 'Attach a file from this computer', ico: '📎', kw: 'attachment upload' },
    { t: 'bookmark', label: 'Web bookmark', desc: 'Save a link as a visual card', ico: '🔖', kw: 'link url' },
    { t: 'embed', label: 'Embed', desc: 'Embed a web page', ico: '🌐', kw: 'iframe' },
    { g: 'Databases', t: 'db:table', label: 'Table view', desc: 'Inline database as a table', ico: '▤', kw: 'database inline' },
    { t: 'db:board', label: 'Board view', desc: 'Inline database as a kanban board', ico: '▥', kw: 'database kanban inline' },
    { t: 'db:page', label: 'Database – full page', desc: 'A database in its own page', ico: '🗂', kw: 'database new' },
    { g: 'Insert', t: 'date', label: 'Today’s date', desc: 'Insert the current date', ico: '📅', kw: 'now time' },
    { t: 'mention', label: 'Mention a page', desc: 'Link to another page', ico: '@', kw: 'link reference' },
    { t: 'ai', label: 'Ask AI', desc: 'Write or edit with your own model', ico: '✨', kw: 'gpt llm assistant write generate ollama' },
    { t: 'dbview:linked', label: 'Linked view of database', desc: 'Show an existing database here', ico: '🔗', kw: 'database link view existing' },
  ];

  function makeBlock(type) {
    const b = BP.newBlock(type, '');
    if (type === 'callout') b.icon = '💡';
    if (type === 'toggle') b.open = true;
    if (type === 'todo') b.checked = false;
    if (type === 'code') b.lang = 'plain';
    if (type === 'table') { b.rows = [['', ''], ['', '']]; b.header = true; }
    if (type === 'columns') b.children = [0, 1].map(() => ({ id: uid(), type: 'column', children: [BP.newBlock('p')] }));
    if (type === 'flow') { b.dir = 'v'; b.steps = [{ t: 'Start', d: 'First step' }, { t: 'Process', d: 'What happens next' }, { t: 'Result', d: 'The outcome' }]; }
    if (type === 'tabs') { b.active = 0; b.children = [1, 2].map((n) => ({ id: uid(), type: 'tab', title: 'Tab ' + n, children: [BP.newBlock('p')] })); }
    if (type === 'synced') { b.sid = uid(); b.children = [BP.newBlock('p')]; }
    if (type === 'button') { b.label = 'New item'; b.action = 'insert'; b.template = ''; }
    if (type === 'html') { b.text = '<div style="padding:14px;border-radius:10px;background:#eef;color:#223">Hello <b>HTML</b></div>'; b.h = 160; }
    return b;
  }

  /* ---------- the editor ---------- */
  class Editor {
    constructor(host, page, o = {}) {
      this.host = host;
      this.page = page;
      this.readonly = !!o.readonly;
      this.root = h('div', { class: 'editor' + (this.readonly ? ' readonly' : '') });
      host.append(this.root);
      this.stack = [];
      this.redoStack = [];
      BP.syncIn(page);
      this.base = this.serialize();
      this.menu = null;
      this.render();
      this.bindRoot();
      this.bindSelection();
    }
    serialize() { return JSON.stringify(this.page.blocks); }
    destroy() {
      this.closeMenu(); this.hideToolbar(); this.root.remove();
      this._dk && document.removeEventListener('keydown', this._dk, true);
      this._dm && document.removeEventListener('mousedown', this._dm, true);
      this._sc && document.removeEventListener('selectionchange', this._sc);
      const sc = this.host.closest && this.host.closest('.scroller');
      this._rb && sc && sc.removeEventListener('mousedown', this._rb);
      if (this.tb) { this.tb.remove(); this.tb = null; }
    }

    /* undo */
    typed() { clearTimeout(this._tt); this._tt = setTimeout(() => this.record(), 700); BP.touch(this.page); this.refreshToc(); }
    flushTyping() { if (this._tt) { clearTimeout(this._tt); this._tt = null; this.record(); } }
    record() {
      this._tt = null;
      const cur = this.serialize();
      if (cur === this.base) return;
      this.stack.push(this.base);
      if (this.stack.length > 120) this.stack.shift();
      this.base = cur;
      this.redoStack = [];
      BP.syncOut(this.page);
    }
    undo() {
      this.flushTyping();
      if (!this.stack.length) return;
      this.redoStack.push(this.base);
      this.base = this.stack.pop();
      this.page.blocks = JSON.parse(this.base);
      BP.cleanBlocks(this.page);
      BP.touch(this.page);
      this.render();
    }
    redo() {
      if (!this.redoStack.length) return;
      this.stack.push(this.base);
      this.base = this.redoStack.pop();
      this.page.blocks = JSON.parse(this.base);
      BP.touch(this.page);
      this.render();
    }
    // run a structural mutation: separate it from typing in the undo history, rerender, refocus
    mutate(fn, focus) {
      if (this.readonly) return;
      this.flushTyping();
      fn();
      BP.cleanBlocks(this.page);
      this.record();
      BP.touch(this.page);
      this.render(focus);
    }

    /* rendering */
    render(focus) {
      const sc = this.host.closest('.scroller');
      const top = sc ? sc.scrollTop : 0;
      this.closeMenu();
      this.root.innerHTML = '';
      this.renderList(this.page.blocks, this.root);
      this.drop = h('div', { class: 'drop-line' });
      this.root.append(this.drop);
      if (!this.readonly) this.root.append(h('div', { class: 'tail', onclick: () => this.clickTail() }));
      if (sc) sc.scrollTop = top;
      this.refreshToc();
      if (this.sel && this.sel.size) {
        this.sel = new Set([...this.sel].filter((id) => this.root.querySelector(`.block[data-id="${id}"]`)));
        this.root.querySelectorAll('.block').forEach((e) => e.classList.toggle('selected', this.sel.has(e.dataset.id)));
      }
      if (focus) {
        const el = this.txtOf(focus.id);
        el && setCaret(el, focus.pos == null ? 'end' : focus.pos);
      }
    }
    clickTail() {
      if (Date.now() - (this._rbAt || 0) < 300) return;
      const list = this.page.blocks;
      const last = list[list.length - 1];
      if (last && last.type === 'p' && !BP.textOf(last.text).trim()) return setCaret(this.txtOf(last.id), 'end');
      const nb = BP.newBlock('p');
      this.mutate(() => list.push(nb), { id: nb.id, pos: 'start' });
    }
    txtOf(id) {
      const el = this.root.querySelector(`.block[data-id="${id}"]`);
      return el && el.querySelector(':scope > .brow .txt, :scope > .brow .ta');
    }
    renderList(list, parent) {
      let n = 0;
      list.forEach((b) => {
        n = b.type === 'number' ? n + 1 : 0;
        parent.append(this.renderBlock(b, n));
      });
    }
    renderBlock(b, num) {
      const el = h('div', { class: `block t-${b.type}${b.color ? ' c-' + b.color : ''}${b.bg ? ' bg-' + b.bg : ''}`, 'data-id': b.id });
      const row = h('div', { class: 'brow' });
      if (!this.readonly && b.type !== 'column') {
        row.append(
          h('div', { class: 'bctl' },
            h('button', { class: 'bplus', title: 'Add a block below', html: BP.icons.plus, onmousedown: (e) => e.preventDefault(), onclick: () => this.plusClick(b) }),
            h('button', { class: 'bdrag', title: 'Drag to move, click for options', html: BP.icons.drag, draggable: 'true',
              onclick: (e) => this.blockMenu(b, e.currentTarget),
              ondragstart: (e) => { this.dragId = b.id; BP.dragBlockRef = { ed: this, ids: this.sel && this.sel.has(b.id) ? this.selBlocks().map((x) => x.id) : [b.id] }; e.dataTransfer.setData('text/plain', 'bp-block'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setDragImage(el, 0, 0); } catch (_) {} el.classList.add('dragging'); },
              ondragend: () => { this.dragId = null; setTimeout(() => (BP.dragBlockRef = null), 50); el.classList.remove('dragging'); this.drop.style.display = 'none'; } })
          )
        );
      }
      row.append(this.renderMain(b, num));
      el.append(row);
      if (b.type === 'column') return el;
      if (!['columns', 'tabs', 'synced'].includes(b.type) && b.children && b.children.length && ((b.type !== 'toggle' && !b.tg) || b.open)) {
        const kids = h('div', { class: 'bkids' });
        this.renderList(b.children, kids);
        el.append(kids);
      }
      return el;
    }
    txt(b, ph) {
      const el = h('div', { class: 'txt', 'data-ph': ph || '', contenteditable: this.readonly ? 'false' : 'true', spellcheck: 'true' });
      el.innerHTML = BP.sanitize(b.text);
      el.addEventListener('input', () => this.onInput(b, el));
      el.addEventListener('keydown', (e) => this.onKey(e, b, el));
      el.addEventListener('paste', (e) => this.onPaste(e, b, el));
      el.addEventListener('keyup', (e) => { if (!['Escape', 'ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)) this.checkTriggers(b, el, false); });
      el.addEventListener('blur', () => setTimeout(() => this.menu && !this.root.contains(document.activeElement) && this.closeMenu(), 150));
      return el;
    }
    plain(b, cls, ph) {
      const ta = h('textarea', { class: 'ta ' + (cls || ''), rows: '1', spellcheck: 'false', placeholder: ph || '', readonly: this.readonly ? '' : null });
      ta.value = b.text || '';
      requestAnimationFrame(() => autosize(ta));
      ta.addEventListener('input', () => { b.text = ta.value; autosize(ta); this.typed(); });
      ta.addEventListener('keydown', (e) => this.onPlainKey(e, b, ta));
      return ta;
    }
    renderMain(b, num) {
      const main = h('div', { class: 'bmain' });
      const t = b.type;
      switch (t) {
        case 'p': main.append(this.txt(b, "Type '/' for commands")); break;
        case 'h1': case 'h2': case 'h3':
          if (b.tg) main.append(h('button', { class: 'tog' + (b.open ? ' open' : ''), html: BP.icons.chevron, onmousedown: (e) => e.preventDefault(), onclick: () => this.mutate(() => { b.open = !b.open; }) }));
          main.append(this.txt(b, LABEL[t]));
          break;
        case 'quote': main.append(this.txt(b, 'Quote')); break;
        case 'bullet': main.append(h('span', { class: 'marker' }, '•'), this.txt(b, 'List')); break;
        case 'number': main.append(h('span', { class: 'marker num' }, num + '.'), this.txt(b, 'List')); break;
        case 'todo': {
          const cb = h('input', { type: 'checkbox', class: 'todo-cb', disabled: this.readonly ? '' : null });
          cb.checked = !!b.checked;
          cb.addEventListener('change', () => { b.checked = cb.checked; main.classList.toggle('done', b.checked); BP.touch(this.page); this.flushTyping(); this.record(); });
          main.classList.toggle('done', !!b.checked);
          main.append(cb, this.txt(b, 'To-do'));
          break;
        }
        case 'toggle': {
          const arrow = h('button', { class: 'tog' + (b.open ? ' open' : ''), html: BP.icons.chevron, onmousedown: (e) => e.preventDefault(), onclick: () => this.mutate(() => { b.open = !b.open; }) });
          main.append(arrow, this.txt(b, 'Toggle'));
          break;
        }
        case 'callout': {
          const ico = h('button', { class: 'callout-ico', onmousedown: (e) => e.preventDefault(), onclick: (e) => !this.readonly && BP.emojiPicker(e.currentTarget, (v) => { b.icon = v || '💡'; BP.touch(this.page); this.render(); }) }, b.icon || '💡');
          main.append(ico, this.txt(b, 'Type something'));
          break;
        }
        case 'divider': main.append(h('hr')); break;
        case 'code': {
          const langs = ['plain', 'bash', 'python', 'javascript', 'typescript', 'html', 'css', 'json', 'sql', 'java', 'c', 'cpp', 'go', 'rust', 'php', 'yaml', 'xml', 'markdown'];
          const ta = this.plain(b, 'code', '// code');
          const pre = h('pre', { class: 'hl', 'aria-hidden': 'true' });
          const hl = () => { pre.innerHTML = BP.highlight(ta.value, b.lang); };
          ta.addEventListener('input', hl);
          const bar = h('div', { class: 'code-bar' },
            h('select', { class: 'lang', disabled: this.readonly ? '' : null, onchange: (e) => { b.lang = e.target.value; BP.touch(this.page); hl(); } }, (langs.includes(b.lang || 'plain') ? langs : langs.concat(b.lang)).map((l) => h('option', { value: l, selected: (b.lang || 'plain') === l ? '' : null }, l))),
            h('button', { class: 'btn small', onclick: () => { navigator.clipboard.writeText(b.text || ''); BP.toast('Copied'); } }, 'Copy')
          );
          hl();
          main.append(h('div', { class: 'codebox' }, bar, h('div', { class: 'codewrap' }, pre, ta)));
          break;
        }
        case 'equation': {
          const ta = this.plain(b, 'eq', 'LaTeX, e.g.  E = mc^2   or   \\int_0^1 x^2\\,dx');
          const out = h('div', { class: 'eq-render', title: 'Click to edit' });
          const box = h('div', { class: 'eqbox' + (b.text ? '' : ' editing') }, out, ta);
          const draw = () => {
            out.innerHTML = '';
            if (!ta.value.trim()) return;
            try { window.katex.render(ta.value, out, { displayMode: true, throwOnError: false, output: 'html', trust: false }); } catch (e) { out.textContent = ta.value; }
          };
          ta.addEventListener('input', draw);
          ta.addEventListener('blur', () => { if (ta.value.trim()) box.classList.remove('editing'); });
          out.addEventListener('click', () => { if (this.readonly) return; box.classList.add('editing'); ta.focus(); autosize(ta); });
          draw();
          main.append(box);
          break;
        }
        case 'page': {
          const p = BP.page(b.ref);
          const gone = !p || BP.isTrashed(p);
          const a = h('a', { class: 'page-link' + (gone ? ' gone' : ''), href: '#', onclick: (e) => { e.preventDefault(); !gone && BP.open(b.ref); } },
            h('span', { class: 'pl-ico' }, gone ? '🚫' : p.icon || (p.type === 'db' ? '🗂' : '📄')),
            h('span', { class: 'pl-title' }, gone ? 'Deleted page' : p.title || 'Untitled'));
          main.append(a);
          break;
        }
        case 'dbview': {
          const db = BP.page(b.ref);
          const box = h('div', { class: 'dbview' });
          main.append(box);
          if (!db || BP.isTrashed(db)) box.append(h('div', { class: 'muted pad' }, 'This database was deleted.'));
          else BP.renderDatabase(box, db, { inline: true, holder: b.linked ? b : null, key: b.linked ? b.id : null });
          break;
        }
        case 'toc': {
          main.append(h('div', { class: 'toc' }));
          break;
        }
        case 'image': case 'video': case 'audio': case 'pdf': case 'file': case 'bookmark': case 'embed': main.append(this.media(b)); break;
        case 'table': main.append(this.table(b)); break;
        case 'synced': case 'tabs': case 'button': case 'html': case 'flow': this.renderExtra(b, main); break;
        case 'columns': {
          const cols = h('div', { class: 'cols' });
          b.children.forEach((c, i) => {
            if (i) cols.append(this.colResizer(b, i));
            const col = h('div', { class: 'col', 'data-id': c.id, style: { flex: (c.w || 1) + ' 1 0' } });
            this.renderList(c.children, col);
            cols.append(col);
          });
          main.append(cols);
          break;
        }
      }
      return main;
    }
    colResizer(b, i) {
      return h('div', { class: 'col-resize', onmousedown: (e) => {
        e.preventDefault();
        const a = b.children[i - 1], c = b.children[i];
        const cols = e.target.parentElement;
        const total = (a.w || 1) + (c.w || 1);
        const ea = cols.children[(i - 1) * 2], ec = cols.children[i * 2];
        const wsum = ea.getBoundingClientRect().width + ec.getBoundingClientRect().width;
        const x0 = e.clientX, wa = ea.getBoundingClientRect().width;
        const mv = (ev) => {
          const w = Math.max(60, Math.min(wsum - 60, wa + ev.clientX - x0));
          a.w = (w / wsum) * total; c.w = total - a.w;
          ea.style.flex = a.w + ' 1 0'; ec.style.flex = c.w + ' 1 0';
        };
        const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); BP.touch(this.page); this.flushTyping(); this.record(); };
        addEventListener('mousemove', mv); addEventListener('mouseup', up);
      } });
    }

    /* media */
    media(b) {
      const t = b.type;
      const wrap = h('div', { class: 'media media-' + t });
      const setSrc = (src, name, size) => { b.src = src; if (name) b.name = name; if (size != null) b.size = size; BP.touch(this.page); this.record(); this.render(); };
      const pickFile = (accept) => {
        const inp = h('input', { type: 'file', accept: accept || '' });
        inp.onchange = () => {
          const f = inp.files[0];
          if (!f) return;
          if (f.size > 25 * 1024 * 1024 && !confirm('This file is over 25 MB and will be stored inside your workspace file. Continue?')) return;
          const fr = new FileReader();
          fr.onload = () => setSrc(fr.result, f.name, f.size);
          fr.readAsDataURL(f);
        };
        inp.click();
      };
      const ask = (anchor) => {
        BP.popover(anchor, (el, close) => {
          el.classList.add('embed-pop');
          const canUpload = ['image', 'video', 'audio', 'pdf', 'file'].includes(t);
          if (canUpload) el.append(h('button', { class: 'btn primary wide', onclick: () => { close(); pickFile({ image: 'image/*', video: 'video/*', audio: 'audio/*', pdf: 'application/pdf,.pdf', file: '' }[t]); } }, 'Choose a file from this computer'));
          if (t === 'audio') el.append(this.recorderUI(close, setSrc));
          if (t !== 'file') {
            const inp = h('input', { class: 'input', placeholder: t === 'bookmark' || t === 'embed' ? 'Paste a link…' : 'Or paste a link…' });
            const ok = () => { let u = inp.value.trim(); if (!u) return; if (!/^(https?:|data:|file:)/i.test(u)) u = 'https://' + u; close(); setSrc(u); };
            inp.addEventListener('keydown', (e) => e.key === 'Enter' && ok());
            el.append(inp, h('button', { class: 'btn wide', onclick: ok }, t === 'bookmark' ? 'Create bookmark' : t === 'embed' ? 'Embed link' : 'Use link'));
            setTimeout(() => !canUpload && inp.focus(), 30);
          }
        });
      };
      if (!b.src) {
        const label = { image: 'Add an image', video: 'Add a video', audio: 'Add an audio file', pdf: 'Add a PDF', file: 'Attach a file', bookmark: 'Add a web bookmark', embed: 'Embed a link' }[t];
        const ico = { image: '🖼', video: '🎬', audio: '🎧', pdf: '📕', file: '📎', bookmark: '🔖', embed: '🌐' }[t];
        wrap.append(h('button', { class: 'media-ph', onclick: (e) => !this.readonly && ask(e.currentTarget) }, h('span', null, ico), label));
        return wrap;
      }
      const cap = () => {
        if (this.readonly && !b.caption) return null;
        const c = h('input', { class: 'caption', placeholder: 'Add a caption', value: b.caption || '', readonly: this.readonly ? '' : null });
        c.addEventListener('input', () => { b.caption = c.value; this.typed(); });
        return c;
      };
      if (t === 'image') {
        const img = h('img', { src: b.src, alt: b.caption || '', style: { width: b.w ? b.w + 'px' : '' }, draggable: 'false' });
        const fig = h('figure', null, img);
        if (!this.readonly) {
          fig.append(h('div', { class: 'img-resize', onmousedown: (e) => {
            e.preventDefault();
            const x0 = e.clientX, w0 = img.getBoundingClientRect().width, max = this.root.getBoundingClientRect().width;
            const mv = (ev) => { b.w = Math.round(Math.max(80, Math.min(max, w0 + ev.clientX - x0))); img.style.width = b.w + 'px'; };
            const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); BP.touch(this.page); this.record(); };
            addEventListener('mousemove', mv); addEventListener('mouseup', up);
          } }));
          fig.append(h('button', { class: 'media-replace btn small', onclick: (e) => ask(e.currentTarget) }, 'Replace'));
        }
        wrap.append(fig, cap());
      } else if (t === 'video') {
        const yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/.exec(b.src);
        const vm = /vimeo\.com\/(\d+)/.exec(b.src);
        if (yt || vm) wrap.append(h('iframe', { class: 'frame', src: yt ? 'https://www.youtube-nocookie.com/embed/' + yt[1] : 'https://player.vimeo.com/video/' + vm[1], allowfullscreen: '', sandbox: 'allow-scripts allow-same-origin allow-presentation' }));
        else wrap.append(h('video', { src: b.src, controls: '', class: 'vid' }));
        wrap.append(cap());
      } else if (t === 'audio') {
        wrap.append(h('audio', { src: b.src, controls: '', class: 'aud' }), cap());
      } else if (t === 'pdf') {
        const url = b.src.startsWith('data:') ? dataToBlobUrl(b.src) : b.src;
        wrap.append(h('iframe', { class: 'frame pdf', src: url }), h('div', { class: 'muted small pdf-bar' }, b.name || 'PDF', ' · ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); BP.saveDataUrl(b.src, b.name || 'document.pdf'); } }, 'Save a copy')), cap());
        if (!this.readonly) wrap.append(h('button', { class: 'media-replace btn small', onclick: (e) => ask(e.currentTarget) }, 'Replace'));
      } else if (t === 'embed') {
        wrap.append(h('iframe', { class: 'frame', src: b.src, sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups' }), cap());
      } else if (t === 'bookmark') {
        let host = b.src;
        try { host = new URL(b.src).hostname; } catch (_) {}
        const tEl = h('b', null, host), dEl = h('div', { class: 'bm-desc' }), iEl = h('img', { class: 'bm-img', alt: '', draggable: 'false' });
        iEl.style.display = 'none';
        wrap.append(h('a', { class: 'bookmark', href: b.src, target: '_blank', rel: 'noopener' }, h('div', { class: 'bm-body' }, h('div', { class: 'bm-title' }, tEl), dEl, h('div', { class: 'bm-url' }, b.src)), iEl, h('span', { class: 'bm-ico' }, '🔖')));
        BP.linkMeta(b.src, (m) => {
          if (!m) return;
          if (m.title) tEl.textContent = m.title;
          if (m.description) dEl.textContent = m.description.slice(0, 220);
          if (m.image) { iEl.src = m.image; iEl.style.display = ''; iEl.onerror = () => (iEl.style.display = 'none'); }
        });
      } else if (t === 'file') {
        const kb = b.size != null ? (b.size > 1048576 ? (b.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b.size / 1024)) + ' KB') : '';
        wrap.append(h('div', { class: 'filecard', onclick: () => BP.saveDataUrl(b.src, b.name || 'file') }, h('span', { class: 'fc-ico' }, '📎'), h('span', { class: 'fc-name' }, b.name || 'File'), h('span', { class: 'muted' }, kb), h('span', { class: 'fc-act' }, 'Save as…')));
      }
      return wrap;
    }

    /* simple table block */
    table(b) {
      const wrap = h('div', { class: 'tablewrap' });
      const tbl = h('table', { class: 'stable' });
      b.rows.forEach((row, ri) => {
        const tr = h('tr');
        row.forEach((cell, ci) => {
          const td = h(ri === 0 && b.header ? 'th' : 'td');
          const ta = h('textarea', { class: 'ta cell' + (b.mono && b.mono[ci] && !(ri === 0 && b.header) ? ' mono' : ''), rows: '1', readonly: this.readonly ? '' : null });
          ta.value = cell;
          requestAnimationFrame(() => autosize(ta));
          ta.addEventListener('input', () => { b.rows[ri][ci] = ta.value; autosize(ta); this.typed(); });
          ta.addEventListener('focus', () => (this.cell = { b, ri, ci }));
          ta.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
              e.preventDefault();
              const all = [...tbl.querySelectorAll('textarea')];
              const i = all.indexOf(ta) + (e.shiftKey ? -1 : 1);
              if (i >= all.length) this.mutate(() => b.rows.push(b.rows[0].map(() => '')), null), setTimeout(() => { const t2 = this.root.querySelectorAll(`.block[data-id="${b.id}"] textarea`); t2[t2.length - b.rows[0].length] && t2[t2.length - b.rows[0].length].focus(); }, 0);
              else all[i] && all[i].focus();
            } else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const all = [...tbl.querySelectorAll('textarea')]; const nxt = all[all.indexOf(ta) + row.length]; nxt && nxt.focus(); }
            else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && onEdgeLine(ta, e.key === 'ArrowUp' ? -1 : 1)) { const all = [...tbl.querySelectorAll('textarea')]; const nxt = all[all.indexOf(ta) + (e.key === 'ArrowUp' ? -row.length : row.length)]; if (nxt) { e.preventDefault(); nxt.focus(); } }
          });
          td.append(ta);
          tr.append(td);
        });
        tbl.append(tr);
      });
      wrap.append(tbl);
      if (!this.readonly) {
        wrap.append(h('div', { class: 'tbl-tools' },
          h('button', { class: 'btn small', onclick: () => this.mutate(() => b.rows.push(b.rows[0].map(() => ''))) }, '+ Row'),
          h('button', { class: 'btn small', onclick: () => this.mutate(() => b.rows.forEach((r) => r.push(''))) }, '+ Column'),
          h('button', { class: 'btn small', onclick: () => { const c = this.cell && this.cell.b === b ? this.cell : null; if (!c || b.rows.length < 2) return BP.toast('Click a cell first'); this.mutate(() => b.rows.splice(c.ri, 1)); } }, '− Row'),
          h('button', { class: 'btn small', onclick: () => { const c = this.cell && this.cell.b === b ? this.cell : null; if (!c || b.rows[0].length < 2) return BP.toast('Click a cell first'); this.mutate(() => b.rows.forEach((r) => r.splice(c.ci, 1))); } }, '− Column'),
          h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: b.header ? '' : null, onchange: (e) => this.mutate(() => { b.header = e.target.checked; }) }), ' Header row')
        ));
      }
      return wrap;
    }
    refreshToc() {
      const tocs = this.root.querySelectorAll('.toc');
      if (!tocs.length) return;
      const heads = [];
      BP.walkBlocks(this.page.blocks, (b) => /^h[123]$/.test(b.type) && heads.push(b));
      tocs.forEach((t) => {
        t.innerHTML = '';
        if (!heads.length) t.append(h('div', { class: 'muted' }, 'Add headings to see a table of contents'));
        heads.forEach((hb) => t.append(h('a', { class: 'toc-' + hb.type, href: '#', onclick: (e) => { e.preventDefault(); const el = this.txtOf(hb.id); el && el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }, BP.textOf(hb.text) || 'Untitled')));
      });
    }

    /* ---------- input handling ---------- */
    onInput(b, el) {
      if (el.innerHTML === '<br>') el.innerHTML = '';
      b.text = BP.sanitize(el.innerHTML);
      if (b.type === 'p') {
        const raw = el.textContent.replace(/ /g, ' ');
        const m = this.mdShortcut(raw);
        if (m) {
          this.flushTyping();
          b.text = '';
          Object.assign(b, m);
          this.record();
          BP.touch(this.page);
          return this.render({ id: b.id, pos: 'start' });
        }
        if (raw === '---' || raw === '***') {
          this.flushTyping();
          b.type = 'divider'; b.text = '';
          const nb = BP.newBlock('p');
          const f = BP.findBlock(this.page.blocks, b.id);
          f.list.splice(f.index + 1, 0, nb);
          this.record(); BP.touch(this.page);
          return this.render({ id: nb.id, pos: 'start' });
        }
      }
      this.typed();
      this.checkTriggers(b, el, true);
    }
    mdShortcut(raw) {
      if (!raw.endsWith(' ') && raw !== '```') return null;
      if (raw === '```') return { type: 'code', lang: 'plain' };
      const t = raw.slice(0, -1);
      if (t === '#') return { type: 'h1' };
      if (t === '##') return { type: 'h2' };
      if (t === '###') return { type: 'h3' };
      if (t === '-' || t === '*' || t === '+') return { type: 'bullet' };
      if (/^\d+\.$/.test(t)) return { type: 'number' };
      if (t === '[]' || t === '[ ]') return { type: 'todo', checked: false };
      if (t === '[x]') return { type: 'todo', checked: true };
      if (t === '>') return { type: 'toggle', open: true };
      if (t === '"') return { type: 'quote' };
      return null;
    }
    onPaste(e, b, el) {
      e.preventDefault();
      const cd = e.clipboardData || window.clipboardData;
      const text = cd.getData('text/plain');
      const html = cd.getData('text/html');
      if (!text) return;
      const empty = !BP.textOf(b.text).trim();
      if (!/\n/.test(text.trim()) && !(html && /<pre/i.test(html))) {
        // a single line: if it is clearly a command/code and the block is empty, make it a code block
        if (empty && b.type === 'p' && BP.looksLikeCode(text.trim())) {
          const cb = Object.assign(BP.newBlock('code', text.trim()), { lang: 'plain' });
          cb.lang = BP.smartPaste(text, '')[0].lang || 'plain';
          return this.mutate(() => { const f = BP.findBlock(this.page.blocks, b.id); f.list.splice(f.index, 1, cb); }, { id: cb.id });
        }
        document.execCommand('insertText', false, text.replace(/\n/g, ' '));
        return;
      }
      const blocks = this.clipBlocks(text, html);
      if (!blocks.length) return;
      // an untitled page takes the pasted document's first heading as its title
      const isFirst = this.page.blocks[0] && this.page.blocks[0].id === b.id;
      if (blocks.suggestedTitle && !this.page.title && isFirst && empty && blocks[0].type !== 'code') {
        this.page.title = blocks.suggestedTitle;
        blocks.shift();
        const ti = document.querySelector('.title-in');
        if (ti) { ti.value = this.page.title; ti.dispatchEvent(new Event('input')); }
      }
      if (!blocks.length) return;
      this.mutate(() => {
        const f = BP.findBlock(this.page.blocks, b.id);
        if (empty) f.list.splice(f.index, 1, ...blocks);
        else f.list.splice(f.index + 1, 0, ...blocks);
      }, { id: blocks[blocks.length - 1].id, pos: 'end' });
    }
    onPlainKey(e, b, ta) {
      const el = ta;
      if (e.key === 'Escape' && !BP.$('.popover')) { e.preventDefault(); return this.selectOnly(b.id); }
      if (e.key === 'Tab' && b.type === 'code') {
        e.preventDefault();
        document.execCommand('insertText', false, '  ');
        return;
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && b.type !== 'table') {
        e.preventDefault();
        const nb = BP.newBlock('p');
        return this.mutate(() => { const f = BP.findBlock(this.page.blocks, b.id); f.list.splice(f.index + 1, 0, nb); }, { id: nb.id, pos: 'start' });
      }
      if (e.key === 'Backspace' && !ta.value && !e.ctrlKey) {
        e.preventDefault();
        return this.mutate(() => { b.type = 'p'; b.text = ''; }, { id: b.id, pos: 'start' });
      }
      if (e.key === 'ArrowUp' && caretAtStart(el)) { e.preventDefault(); this.focusNeighbor(el, -1); }
      if (e.key === 'ArrowDown' && caretAtEnd(el)) { e.preventDefault(); this.focusNeighbor(el, 1); }
    }
    focusables() {
      return [...this.root.querySelectorAll('.txt, .ta:not(.cell)')].filter((e) => e.offsetParent !== null);
    }
    focusNeighbor(el, dir) {
      const all = this.focusables();
      const n = all[all.indexOf(el) + dir];
      if (n) setCaret(n, dir < 0 ? 'end' : 'start');
    }
    flatBlocks() {
      return [...this.root.querySelectorAll('.block')].map((e) => ({ el: e, f: BP.findBlock(this.page.blocks, e.dataset.id) })).filter((x) => x.f);
    }
    onKey(e, b, el) {
      if (this.menu && this.menuKey(e)) return;
      const k = e.key;
      const mod = e.ctrlKey || e.metaKey;
      if (k === 'Escape' && !this.menu && !BP.$('.popover')) { e.preventDefault(); return this.selectOnly(b.id); }
      if (mod && !e.shiftKey && k.toLowerCase() === 'e') { e.preventDefault(); return this.toggleCode(); }
      if (mod && !e.shiftKey && k.toLowerCase() === 'k') { e.preventDefault(); return this.linkPrompt(); }
      if (mod && e.shiftKey && k.toLowerCase() === 's') { e.preventDefault(); document.execCommand('strikeThrough'); return this.syncFrom(el, b); }
      if (mod && k === 'Enter') {
        e.preventDefault();
        if (b.type === 'todo') this.mutate(() => { b.checked = !b.checked; }, { id: b.id });
        else if (b.type === 'toggle') this.mutate(() => { b.open = !b.open; }, { id: b.id });
        return;
      }
      if (k === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); return this.enter(b, el); }
      if (k === 'Backspace' || k === 'Delete') {
        const r = selRange();
        if (r && !r.collapsed && !this.sameTxt(r)) { e.preventDefault(); return this.deleteAcross(); }
        if (k === 'Backspace' && caretAtStart(el) && !(r && !r.collapsed)) { e.preventDefault(); return this.backspaceStart(b, el); }
        if (k === 'Delete' && caretAtEnd(el)) { e.preventDefault(); return this.deleteEnd(b, el); }
      }
      if (k === 'Tab') {
        e.preventDefault();
        return e.shiftKey ? this.outdent(b) : this.indent(b);
      }
      if (k === 'ArrowUp' && !e.shiftKey && onEdgeLine(el, -1)) { e.preventDefault(); return this.focusNeighbor(el, -1); }
      if (k === 'ArrowDown' && !e.shiftKey && onEdgeLine(el, 1)) { e.preventDefault(); return this.focusNeighbor(el, 1); }
      if (k === 'ArrowLeft' && !e.shiftKey && !mod && caretAtStart(el)) { e.preventDefault(); return this.focusNeighbor(el, -1); }
      if (k === 'ArrowRight' && !e.shiftKey && !mod && caretAtEnd(el)) { e.preventDefault(); return this.focusNeighbor(el, 1); }
      if (k.length === 1 && !mod) {
        const r = selRange();
        if (r && !r.collapsed && !this.sameTxt(r)) { e.preventDefault(); const f = this.deleteAcross(); setTimeout(() => document.execCommand('insertText', false, k), 0); }
      }
    }
    sameTxt(r) {
      const a = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
      const z = r.endContainer.nodeType === 1 ? r.endContainer : r.endContainer.parentElement;
      const ta = a && a.closest('.txt'), tz = z && z.closest('.txt');
      return ta && ta === tz;
    }
    syncFrom(el, b) { b.text = BP.sanitize(el.innerHTML); this.typed(); }
    enter(b, el) {
      this.flushTyping();
      const t = b.type;
      const empty = !BP.textOf(el.innerHTML).trim();
      const f = BP.findBlock(this.page.blocks, b.id);
      if (empty && ['bullet', 'number', 'todo', 'toggle', 'quote', 'callout'].includes(t) || (empty && ['h1', 'h2', 'h3'].includes(t))) {
        if (f.parent && f.parent.type !== 'column' && ['bullet', 'number', 'todo', 'toggle'].includes(t)) return this.outdent(b);
        return this.mutate(() => { b.type = 'p'; delete b.checked; delete b.open; }, { id: b.id, pos: 'start' });
      }
      const [before, after] = splitHtml(el);
      const keep = ['bullet', 'number', 'todo'].includes(t) ? t : 'p';
      const nb = BP.newBlock(keep, after);
      if (keep === 'todo') nb.checked = false;
      this.mutate(() => {
        b.text = before;
        const holder = t === 'toggle' || b.tg;
        const nested = b.children && b.children.length && (!holder || b.open);
        if (nested || (holder && b.open)) { b.children = b.children || []; b.children.unshift(nb); }
        else f.list.splice(f.index + 1, 0, nb);
      }, { id: nb.id, pos: 'start' });
    }
    backspaceStart(b, el) {
      this.flushTyping();
      if (b.type !== 'p') return this.mutate(() => { b.type = 'p'; delete b.checked; delete b.open; }, { id: b.id, pos: 'start' });
      const flat = this.flatBlocks();
      const i = flat.findIndex((x) => x.f.block.id === b.id);
      const prev = flat[i - 1];
      if (!prev) return;
      const pb = prev.f.block;
      if (BP.rich(pb.type) && pb.type !== 'column') {
        const pos = BP.textOf(pb.text).length;
        this.mutate(() => {
          pb.text = (pb.text || '') + (b.text || '');
          if (b.children && b.children.length) { pb.children = (pb.children || []).concat(b.children); }
          const f = BP.findBlock(this.page.blocks, b.id);
          f.list.splice(f.index, 1);
        }, { id: pb.id, pos });
      } else if (['divider', 'image', 'video', 'embed', 'bookmark', 'file', 'table', 'toc'].includes(pb.type)) {
        this.mutate(() => { const f = BP.findBlock(this.page.blocks, pb.id); f.list.splice(f.index, 1); }, { id: b.id, pos: 'start' });
      } else if (!BP.textOf(b.text).trim() && flat.length > 1) {
        this.mutate(() => { const f = BP.findBlock(this.page.blocks, b.id); f.list.splice(f.index, 1); }, { id: pb.id, pos: 'end' });
      }
    }
    deleteEnd(b, el) {
      this.flushTyping();
      const flat = this.flatBlocks();
      const i = flat.findIndex((x) => x.f.block.id === b.id);
      const nxt = flat[i + 1];
      if (!nxt || !BP.rich(nxt.f.block.type) || nxt.f.block.type === 'column') return;
      const nb = nxt.f.block;
      const pos = BP.textOf(b.text).length;
      this.mutate(() => {
        b.text = (b.text || '') + (nb.text || '');
        if (nb.children && nb.children.length) b.children = (b.children || []).concat(nb.children);
        nxt.f.list.splice(nxt.f.index, 1);
      }, { id: b.id, pos });
    }
    deleteAcross() {
      this.flushTyping();
      const r = selRange();
      const a = (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement).closest('.txt');
      const z = (r.endContainer.nodeType === 1 ? r.endContainer : r.endContainer.parentElement).closest('.txt');
      if (!a || !z) return;
      const ba = a.closest('.block').dataset.id, bz = z.closest('.block').dataset.id;
      const pre = document.createRange(); pre.selectNodeContents(a); pre.setEnd(r.startContainer, r.startOffset);
      const post = document.createRange(); post.selectNodeContents(z); post.setStart(r.endContainer, r.endOffset);
      const d1 = h('div'), d2 = h('div'); d1.append(pre.cloneContents()); d2.append(post.cloneContents());
      const flat = this.flatBlocks().map((x) => x.f.block.id);
      const ia = flat.indexOf(ba), iz = flat.indexOf(bz);
      const first = BP.findBlock(this.page.blocks, ba).block;
      const last = BP.findBlock(this.page.blocks, bz).block;
      const pos = BP.textOf(d1.innerHTML).length;
      this.mutate(() => {
        first.text = BP.sanitize(d1.innerHTML + d2.innerHTML);
        const kids = last.children || [];
        flat.slice(ia + 1, iz + 1).forEach((id) => { const f = BP.findBlock(this.page.blocks, id); if (f) f.list.splice(f.index, 1); });
        if (kids.length) first.children = (first.children || []).concat(kids);
      }, { id: first.id, pos });
    }
    indent(b) {
      if (!CAN_NEST.includes(b.type)) return;
      this.flushTyping();
      const f = BP.findBlock(this.page.blocks, b.id);
      const prev = f.list[f.index - 1];
      if (!prev || !CAN_NEST.includes(prev.type)) return;
      const pos = this.caretChars(b);
      this.mutate(() => { f.list.splice(f.index, 1); prev.children = prev.children || []; prev.children.push(b); if (prev.type === 'toggle') prev.open = true; }, { id: b.id, pos });
    }
    outdent(b) {
      this.flushTyping();
      const f = BP.findBlock(this.page.blocks, b.id);
      if (!f.parent || f.parent.type === 'column') return;
      const pf = BP.findBlock(this.page.blocks, f.parent.id);
      const pos = this.caretChars(b);
      this.mutate(() => { f.list.splice(f.index, 1); pf.list.splice(pf.index + 1, 0, b); }, { id: b.id, pos });
    }
    caretChars(b) {
      const el = this.txtOf(b.id);
      const t = el && !isPlainEl(el) ? textBeforeCaret(el) : null;
      return t == null ? 'end' : t.length;
    }

    /* ---------- slash / @ menus ---------- */
    checkTriggers(b, el, fromInput) {
      if (this.readonly || isPlainEl(el)) return;
      const pre = textBeforeCaret(el);
      if (pre == null) return this.closeMenu();
      // [[ links to a page (Obsidian style, spaces allowed), #word picks or makes a tag
      const wl = /\[\[([^\]\n[]{0,40})$/.exec(pre);
      const tg = !wl && /(?:^|\s)#([\p{L}\p{N}_\-/]{1,30})$/u.exec(pre);
      if (wl || tg) {
        if (!fromInput && !this.menu) return;
        const kind = wl ? 'link' : 'tag', q = wl ? wl[1] : tg[1];
        const start = pre.length - (wl ? 2 : 1) - q.length;
        if (this.dismissed === b.id + ':' + start) return;
        return this.openMenu(b, el, kind, start, q);
      }
      const m = /(?:^|\s)([\/@])([^\s\/@]{0,20})$/.exec(pre);
      if (!m) return this.closeMenu();
      if (!fromInput && !this.menu) return;
      const kind = m[1] === '/' ? 'slash' : 'mention';
      const start = pre.length - m[1].length - m[2].length;
      if (this.dismissed === b.id + ':' + start) return;
      this.openMenu(b, el, kind, start, m[2]);
    }
    openMenu(b, el, kind, start, query) {
      const q = query.toLowerCase();
      let items;
      if (kind === 'slash') {
        items = ITEMS.filter((i) => (!i.cond || i.cond()) && (!q || (i.label + ' ' + (i.kw || '')).toLowerCase().includes(q)));
      } else if (kind === 'tag') {
        // the tag being typed is already in this page's text: it only counts as existing if another page uses it too
        const mine = (t) => t.pages.size === 1 && t.pages.has(this.page.id) && t.key.startsWith(q) && q.startsWith(t.key);
        const all = (BP.kb ? BP.kb.allTags() : []).filter((t) => !mine(t));
        items = all.filter((t) => t.key.includes(q)).slice(0, 10).map((t) => ({ t: 'tag', label: '#' + t.name, ico: '#', desc: t.pages.size + (t.pages.size === 1 ? ' page' : ' pages'), tag: t.name }));
        if (q && !all.some((t) => t.key === q)) items.push({ t: 'tag', label: '#' + query, ico: '+', desc: 'New tag', tag: query });
      } else {
        const match = (p) => (p.title || 'untitled').toLowerCase().includes(q) || (Array.isArray(p.aliases) && p.aliases.some((a) => String(a).toLowerCase().includes(q)));
        items = BP.allPages().filter((p) => !p.trashed && !BP.isTrashed(p) && p.id !== this.page.id && (!q || match(p)))
          .sort((a, b) => ((b.title || '').toLowerCase().startsWith(q) ? 1 : 0) - ((a.title || '').toLowerCase().startsWith(q) ? 1 : 0) || (b.updated || 0) - (a.updated || 0))
          .slice(0, 12).map((p) => ({ t: 'pagelink', label: p.title || 'Untitled', ico: p.icon || '📄', desc: p.type === 'db' ? 'Database' : p.type === 'canvas' ? 'Canvas' : BP.path(p).slice(0, -1).map((x) => x.title || 'Untitled').join(' / '), ref: p.id }));
        const name = query.trim();
        if (name && !BP.allPages().some((p) => !BP.isTrashed(p) && (p.title || '').trim().toLowerCase() === name.toLowerCase())) items.push({ t: 'newpage', label: 'Create page “' + name + '”', ico: '+', desc: 'A new page, linked here', title: name });
      }
      if (!items.length) { if (this.menu) this.menu.items = []; this.renderMenu(); return this.menu && q.length > 6 && this.closeMenu(); }
      const same = this.menu && this.menu.kind === kind && this.menu.blockId === b.id;
      this.menu = { kind, blockId: b.id, el, start, query, items, idx: same ? Math.min(this.menu.idx, items.length - 1) : 0, box: same ? this.menu.box : null };
      this.renderMenu();
    }
    renderMenu() {
      const m = this.menu;
      if (!m) return;
      if (!m.box) {
        m.box = h('div', { class: 'slash', onmousedown: (e) => e.preventDefault() });
        document.body.append(m.box);
      }
      m.box.innerHTML = '';
      if (!m.items.length) m.box.append(h('div', { class: 'slash-empty' }, 'No results'));
      let lastG = null;
      m.items.forEach((it, i) => {
        if (m.kind === 'slash' && it.g && it.g !== lastG) { lastG = it.g; }
        if (m.kind === 'slash') {
          const g = ITEMS.slice(0, ITEMS.indexOf(it) + 1).reverse().find((x) => x.g);
          if (g && g.g !== lastG) { lastG = g.g; m.box.append(h('div', { class: 'slash-group' }, g.g)); }
        }
        const row = h('div', { class: 'slash-item' + (i === m.idx ? ' on' : ''), onclick: () => this.chooseItem(it) }, h('span', { class: 'si-ico' }, it.ico), h('span', { class: 'si-text' }, h('b', null, it.label), it.desc ? h('small', null, it.desc) : null));
        row.addEventListener('mouseenter', () => { m.idx = i; m.box.querySelectorAll('.slash-item').forEach((x, j) => x.classList.toggle('on', j === i)); });
        m.box.append(row);
      });
      const r = caretRect(m.el);
      const bw = m.box.offsetWidth, bh = m.box.offsetHeight;
      let x = Math.min(Math.max(8, r.left), innerWidth - bw - 8);
      let y = r.bottom + 6;
      if (y + bh > innerHeight - 8) y = Math.max(8, r.top - bh - 6);
      m.box.style.left = x + 'px';
      m.box.style.top = y + 'px';
      const on = m.box.querySelector('.on');
      on && on.scrollIntoView({ block: 'nearest' });
    }
    closeMenu() {
      if (this.menu && this.menu.box) this.menu.box.remove();
      this.menu = null;
    }
    menuKey(e) {
      const m = this.menu;
      if (!m || !m.box) return false;
      if (e.key === 'Escape') { this.dismissed = m.blockId + ':' + m.start; this.closeMenu(); e.preventDefault(); e.stopPropagation(); return true; }
      if (!m.items.length) return false;
      if (e.key === 'ArrowDown') { m.idx = (m.idx + 1) % m.items.length; this.renderMenu(); e.preventDefault(); return true; }
      if (e.key === 'ArrowUp') { m.idx = (m.idx - 1 + m.items.length) % m.items.length; this.renderMenu(); e.preventDefault(); return true; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); this.chooseItem(m.items[m.idx]); return true; }
      return false;
    }
    plusClick(b) {
      const empty = b.type === 'p' && !BP.textOf(b.text).trim();
      const go = (nb) => {
        const el = this.txtOf(nb.id);
        if (el) { setCaret(el, 'start'); document.execCommand('insertText', false, '/'); }
      };
      if (empty) return go(b);
      const nb = BP.newBlock('p');
      this.mutate(() => { const f = BP.findBlock(this.page.blocks, b.id); f.list.splice(f.index + 1, 0, nb); }, { id: nb.id, pos: 'start' });
      go(nb);
    }
    chooseItem(it) {
      const m = this.menu;
      if (!m) return;
      const b = BP.findBlock(this.page.blocks, m.blockId).block;
      const el = m.el;
      // remove the "/query" or "@query" text
      const caret = textBeforeCaret(el);
      const r = rangeFromChars(el, m.start, caret == null ? m.start + 1 + m.query.length : caret.length);
      if (r) { r.deleteContents(); el.normalize(); }
      if (el.innerHTML === '<br>') el.innerHTML = '';
      b.text = BP.sanitize(el.innerHTML);
      this.closeMenu();
      if (it.t === 'newpage') {
        const np = BP.createPage(null, { title: it.title });
        it = { t: 'pagelink', ref: np.id, label: it.title };
        setTimeout(() => BP.ui && BP.ui.refreshChrome && BP.ui.refreshChrome(), 0);
      }
      if (it.t === 'tag') {
        const range = selRange();
        const a = h('a', { href: BP.kb.tagHref(it.tag) }, '#' + it.tag);
        range && range.insertNode(a);
        range && range.setStartAfter(a);
        document.execCommand('insertText', false, ' ');
        return this.syncFrom(el, b);
      }
      if (it.t === 'pagelink') {
        const range = selRange();
        const a = h('a', { href: 'bp://page/' + it.ref }, it.label);
        range && range.insertNode(a);
        range && range.setStartAfter(a);
        document.execCommand('insertText', false, ' ');
        return this.syncFrom(el, b);
      }
      if (it.t === 'date') {
        document.execCommand('insertText', false, new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }));
        return this.syncFrom(el, b);
      }
      if (it.t === 'mention') {
        document.execCommand('insertText', false, '@');
        return this.checkTriggers(b, el, true);
      }
      this.flushTyping();
      this.applyItem(b, it.t);
    }
    applyItem(b, t) {
      const empty = !BP.textOf(b.text).trim() && BP.rich(b.type);
      const f = BP.findBlock(this.page.blocks, b.id);
      const newB = (spec) => Object.assign(makeBlock(spec.type || 'p'), spec);
      let nb = null, after = null, nav = null;
      if (t === 'page' || t === 'canvas') {
        const p = t === 'canvas' ? BP.canvas.create(this.page.id) : BP.createPage(this.page.id, { title: '' });
        // createPage appended a link block to the end; move it to the cursor instead
        const link = this.page.blocks.pop();
        nb = link;
        nav = p.id;
      } else if (t === 'db:table' || t === 'db:board') {
        const db = BP.createDatabase(this.page.id, { title: t === 'db:board' ? 'Board' : 'Table', inline: true });
        if (t === 'db:board') db.views.reverse();
        nb = Object.assign(BP.newBlock('dbview'), { ref: db.id });
      } else if (t === 'db:page') {
        const db = BP.createDatabase(this.page.id, { title: 'Untitled database' });
        nb = this.page.blocks.pop();
        nav = db.id;
      } else if (t === 'ai') {
        return this.aiPrompt(b);
      } else if (t === 'dbview:linked') {
        return this.pickLinkedDb(b, empty);
      } else if (t === 'syncedpaste') {
        const sid = BP.syncClip;
        if (!sid) return;
        if (BP.hasSync(this.page, sid)) return BP.toast('This page already has that synced block. Paste it on a different page.');
        nb = Object.assign(BP.newBlock('synced'), { sid, children: JSON.parse((BP.state.synced || {})[sid] || '[]') });
        if (!nb.children.length) nb.children = [BP.newBlock('p')];
      } else if (t === 'meeting') {
        nb = BP.meetingBlocks();
      } else if (t === 'columns2' || t === 'columns3') {
        nb = makeBlock('columns');
        if (t === 'columns3') nb.children.push({ id: uid(), type: 'column', children: [BP.newBlock('p')] });
      } else if (['divider', 'toc', 'image', 'video', 'audio', 'pdf', 'file', 'bookmark', 'embed', 'table', 'equation', 'code', 'tabs', 'synced', 'button', 'html', 'flow'].includes(t)) {
        nb = makeBlock(t);
      } else if (/^th[123]$/.test(t)) {
        return this.mutate(() => { const keepText = b.text; Object.assign(b, makeBlock('h' + t[2]), { id: b.id, text: keepText, tg: true, open: true, children: b.children }); if (!b.children) delete b.children; }, { id: b.id, pos: 'end' });
      } else {
        // simple text type conversions happen in place
        return this.mutate(() => { const keepText = b.text; Object.assign(b, makeBlock(t), { id: b.id, text: keepText, children: b.children }); if (!b.children) delete b.children; }, { id: b.id, pos: 'end' });
      }
      const many = Array.isArray(nb) ? nb : [nb];
      const first = many[0];
      this.mutate(() => {
        const ff = BP.findBlock(this.page.blocks, b.id);
        if (empty) ff.list.splice(ff.index, 1, ...many);
        else ff.list.splice(ff.index + 1, 0, ...many);
        const lastB = many[many.length - 1];
        if (!ff.list.some((x) => x.type === 'p') && ['divider', 'image', 'table', 'toc', 'page', 'dbview', 'columns', 'video', 'audio', 'pdf', 'file', 'bookmark', 'embed', 'tabs', 'synced', 'button', 'html', 'flow'].includes(lastB.type) && ff.list[ff.list.length - 1] === lastB) ff.list.push(BP.newBlock('p'));
      }, ['code', 'equation'].includes(first.type) ? { id: first.id } : first.type === 'columns' ? { id: first.children[0].children[0].id, pos: 'start' } : null);
      if (nav) setTimeout(() => BP.open(nav), 0);
      if (!nav && ['code', 'equation'].includes(first.type)) setTimeout(() => { const ta = this.root.querySelector(`.block[data-id="${first.id}"] textarea`); ta && ta.focus(); }, 0);
    }

    /* ---------- block context menu, drag & drop ---------- */
    blockMenu(b, anchor) {
      const f = BP.findBlock(this.page.blocks, b.id);
      const turn = TEXT_TYPES.filter((x) => x !== b.type).map((x) => ({ label: LABEL[x], onClick: () => this.mutate(() => { const text = b.text; const keep = { id: b.id, children: b.children, text }; Object.assign(b, makeBlock(x), keep); delete b.tg; if (!b.children) delete b.children; }, { id: b.id }) }));
      const colorItems = (key, prefix) => [{ label: 'Default', onClick: () => this.mutate(() => { delete b[key]; }) }].concat(BP.COLORS.map((c) => ({ label: c[0].toUpperCase() + c.slice(1) + (key === 'bg' ? ' background' : ''), icon: `<span class="swatch ${prefix}-${c}">A</span>`, onClick: () => this.mutate(() => { b[key] = c; }) })));
      const items = [
        { header: (LABEL[b.type] || b.type).toUpperCase() },
        BP.rich(b.type) && TEXT_TYPES.includes(b.type) ? { label: 'Turn into', icon: '↻', submenu: turn } : null,
        /^h[123]$/.test(b.type) ? { label: b.tg ? 'Make not collapsible' : 'Make collapsible', icon: '▸', onClick: () => this.mutate(() => { b.tg = !b.tg; b.open = true; if (!b.tg) delete b.open; }, { id: b.id }) } : null,
        { label: 'Select block', icon: '▭', kbd: 'Esc', onClick: () => this.selectOnly(b.id) },
        BP.rich(b.type) ? { label: 'Color', icon: '🎨', submenu: () => colorItems('color', 'c').concat([{ divider: true }, { header: 'BACKGROUND' }], colorItems('bg', 'bg')) } : null,
        ...this.extraMenuItems(b),
        { label: 'Duplicate', icon: BP.icons.copy, kbd: 'Ctrl+D', onClick: () => this.duplicate(b) },
        { label: 'Move up', icon: '↑', onClick: () => this.moveBy(b, -1) },
        { label: 'Move down', icon: '↓', onClick: () => this.moveBy(b, 1) },
        { divider: true },
        { label: 'Delete', icon: BP.icons.trash, danger: true, kbd: 'Del', onClick: () => this.removeBlock(b) },
      ];
      BP.menu(anchor, items);
    }
    duplicate(b) {
      const clone = JSON.parse(JSON.stringify(b));
      BP.walkBlocks([clone], (x) => (x.id = uid()));
      this.mutate(() => { const f = BP.findBlock(this.page.blocks, b.id); f.list.splice(f.index + 1, 0, clone); }, { id: clone.id });
    }
    moveBy(b, d) {
      this.mutate(() => { const f = BP.findBlock(this.page.blocks, b.id); const j = f.index + d; if (j < 0 || j >= f.list.length) return; f.list.splice(f.index, 1); f.list.splice(j, 0, b); }, null);
    }
    removeBlock(b) {
      this.mutate(() => { const f = BP.findBlock(this.page.blocks, b.id); f.list.splice(f.index, 1); }, null);
    }
    /* ---------- block selection (Esc, Shift+arrows, rubber band) ---------- */
    setSel(ids) {
      this.sel = new Set(ids);
      this.root.querySelectorAll('.block').forEach((e) => e.classList.toggle('selected', this.sel.has(e.dataset.id)));
      if (ids.length) {
        const a = document.activeElement;
        if (a && a !== document.body && a.blur && this.root.contains(a)) a.blur();
        getSelection().removeAllRanges();
        this.hideToolbar();
        this.closeMenu();
      }
    }
    selectOnly(id) { this.anchor = this.lastSel = id; this.setSel([id]); }
    clearSel() { if (this.sel && this.sel.size) this.setSel([]); }
    selOrder() { return [...this.root.querySelectorAll('.block')].filter((e) => !e.classList.contains('t-column') && !e.classList.contains('t-columns')).map((e) => e.dataset.id); }
    selRange(a, b) { const o = this.selOrder(); let i = o.indexOf(a), j = o.indexOf(b); if (i < 0 || j < 0) return [b]; if (i > j) [i, j] = [j, i]; return o.slice(i, j + 1); }
    selBlocks() {
      const out = [];
      const walk = (list) => list.forEach((b) => { if (this.sel.has(b.id)) out.push(b); else if (b.children) walk(b.children); });
      walk(this.page.blocks);
      return out;
    }
    copySel(cut) {
      const blocks = this.selBlocks();
      if (!blocks.length) return;
      const md = BP.blocksToMd(JSON.parse(JSON.stringify(blocks))).trim() || ' ';
      BP.blockClip = { md, json: JSON.stringify(blocks) };
      try { navigator.clipboard.writeText(md); } catch (_) {}
      BP.toast((cut ? 'Cut ' : 'Copied ') + blocks.length + ' block' + (blocks.length > 1 ? 's' : ''));
      if (cut) this.deleteSel();
    }
    deleteSel() {
      const blocks = this.selBlocks();
      if (!blocks.length) return;
      const order = this.selOrder();
      const lastIdx = Math.max(...blocks.map((b) => order.indexOf(b.id)));
      const after = order.slice(lastIdx + 1).find((id) => !this.sel.has(id));
      this.mutate(() => blocks.forEach((b) => { const f = BP.findBlock(this.page.blocks, b.id); f && f.list.splice(f.index, 1); }), after ? { id: after, pos: 'start' } : null);
      this.sel = new Set();
    }
    duplicateSel() {
      const blocks = this.selBlocks();
      if (!blocks.length) return;
      const clones = blocks.map((b) => { const c = JSON.parse(JSON.stringify(b)); BP.walkBlocks([c], (x) => (x.id = uid())); return c; });
      const last = blocks[blocks.length - 1];
      this.mutate(() => { const f = BP.findBlock(this.page.blocks, last.id); f.list.splice(f.index + 1, 0, ...clones); }, null);
      this.setSel(clones.map((c) => c.id));
    }
    clipBlocks(text, html) {
      if (BP.blockClip && text.trim() === BP.blockClip.md.trim()) {
        const bl = JSON.parse(BP.blockClip.json);
        BP.walkBlocks(bl, (x) => (x.id = uid()));
        return bl;
      }
      return BP.smartPaste(text, html);
    }
    async pasteSel() {
      let text = '';
      try { text = await navigator.clipboard.readText(); } catch (_) { return; }
      if (!text) return;
      const blocks = this.clipBlocks(text, '');
      const order = this.selOrder();
      const picked = this.selBlocks();
      const last = picked[picked.length - 1];
      if (!blocks.length || !last) return;
      this.mutate(() => { const f = BP.findBlock(this.page.blocks, last.id); f.list.splice(f.index + 1, 0, ...blocks); }, null);
      this.setSel(blocks.map((b) => b.id));
    }
    bindSelection() {
      this.sel = new Set();
      const sc = this.host.closest('.scroller');
      this._dk = (e) => {
        if (!this.sel.size || BP.$('.modal-back') || BP.$('.popover')) return;
        const a = document.activeElement;
        if (a && a !== document.body && (a.isContentEditable || ['TEXTAREA', 'INPUT', 'SELECT'].includes(a.tagName))) return;
        const k = e.key, mod = e.ctrlKey || e.metaKey;
        const move = (d) => {
          const o = this.selOrder();
          const cur = this.lastSel || [...this.sel][0];
          const i = Math.max(0, Math.min(o.length - 1, o.indexOf(cur) + d));
          const id = o[i];
          this.lastSel = id;
          if (e.shiftKey) this.setSel(this.selRange(this.anchor || id, id)); else { this.anchor = id; this.setSel([id]); }
          const el = this.root.querySelector(`.block[data-id="${id}"]`); el && el.scrollIntoView({ block: 'nearest' });
        };
        if (k === 'Escape') { e.preventDefault(); this.clearSel(); }
        else if (k === 'ArrowUp') { e.preventDefault(); move(-1); }
        else if (k === 'ArrowDown') { e.preventDefault(); move(1); }
        else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); this.deleteSel(); }
        else if (k === 'Enter') { e.preventDefault(); const id = [...this.sel][0]; this.clearSel(); const el = this.txtOf(id); el && setCaret(el, 'end'); }
        else if (mod && k.toLowerCase() === 'c') { e.preventDefault(); this.copySel(false); }
        else if (mod && k.toLowerCase() === 'x') { e.preventDefault(); this.copySel(true); }
        else if (mod && k.toLowerCase() === 'd') { e.preventDefault(); this.duplicateSel(); }
        else if (mod && k.toLowerCase() === 'v') { e.preventDefault(); this.pasteSel(); }
        else if (mod && k.toLowerCase() === 'a') { e.preventDefault(); this.setSel(this.selOrder()); }
        else if (mod && (k.toLowerCase() === 'z' || k.toLowerCase() === 'y')) { e.preventDefault(); e.stopImmediatePropagation(); this.clearSel(); k.toLowerCase() === 'z' && !e.shiftKey ? this.undo() : this.redo(); }
      };
      document.addEventListener('keydown', this._dk, true);
      this._dm = (e) => {
        if (!this.sel.size) return;
        const inSel = e.target.closest && e.target.closest('.block.selected');
        const inPop = e.target.closest && e.target.closest('.popover, .modal');
        if (e.shiftKey && e.target.closest && e.target.closest('.editor .block')) {
          const id = e.target.closest('.editor .block').dataset.id;
          e.preventDefault();
          this.lastSel = id;
          return this.setSel(this.selRange(this.anchor || id, id));
        }
        if (!inSel && !inPop) this.clearSel();
      };
      document.addEventListener('mousedown', this._dm, true);
      if (!sc || this.readonly) return;
      this._rb = (e) => {
        if (e.button !== 0 || !sc.contains(e.target)) return;
        if (e.target.closest('.txt, .ta, button, input, select, textarea, a, iframe, video, audio, .media, .popover, .db, .tablewrap, .title-in, .rowprops, .page-icon, .cover, .bctl, .comments, .topbar, .slash, .dbview, .codebox, .eqbox')) return;
        const x0 = e.clientX, y0 = e.clientY;
        let band = null, moved = false;
        const mv = (m) => {
          if (!moved && Math.hypot(m.clientX - x0, m.clientY - y0) < 5) return;
          if (!moved) { moved = true; band = h('div', { class: 'rubber' }); document.body.append(band); getSelection().removeAllRanges(); }
          const L = Math.min(x0, m.clientX), T = Math.min(y0, m.clientY), R = Math.max(x0, m.clientX), B = Math.max(y0, m.clientY);
          Object.assign(band.style, { left: L + 'px', top: T + 'px', width: R - L + 'px', height: B - T + 'px' });
          const hit = [...this.root.querySelectorAll('.block')].filter((el) => {
            if (el.classList.contains('t-column') || el.classList.contains('t-columns')) return false;
            const r = el.querySelector(':scope > .brow').getBoundingClientRect();
            return r.right > L && r.left < R && r.bottom > T && r.top < B;
          }).map((el) => el.dataset.id);
          this.anchor = hit[0]; this.lastSel = hit[hit.length - 1];
          this.setSel(hit);
        };
        const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); band && band.remove(); if (moved) { this._rbAt = Date.now(); } };
        addEventListener('mousemove', mv); addEventListener('mouseup', up);
      };
      sc.addEventListener('mousedown', this._rb);
    }
    bindRoot() {
      const root = this.root;
      root.addEventListener('click', (e) => {
        const cm = e.target.closest && e.target.closest('span[class*="cmt-"]');
        if (cm && root.contains(cm)) { const m = /cmt-([a-z0-9]+)/.exec(cm.className); m && BP.openComments && BP.openComments(m[1]); }
        const a = e.target.closest('a[href]');
        if (!a || !root.contains(a)) return;
        const href = a.getAttribute('href');
        if (href.startsWith('bp://page/')) { e.preventDefault(); BP.open(href.slice(10)); }
        else if (/^https?:/.test(href) && (a.closest('.txt') ? e.ctrlKey || e.metaKey || this.readonly : true)) { e.preventDefault(); window.open(href, '_blank'); }
      });
      root.addEventListener('dragover', (e) => {
        if (!this.dragId) return;
        e.preventDefault();
        const tgt = this.dropTarget(e);
        if (!tgt) return (this.drop.style.display = 'none');
        const rr = root.getBoundingClientRect(), br = tgt.rect;
        const d = this.drop;
        d.style.display = 'block';
        if (tgt.side === 'left' || tgt.side === 'right') {
          d.style.left = (tgt.side === 'left' ? br.left : br.right) - rr.left - 1 + 'px';
          d.style.top = br.top - rr.top + 'px';
          d.style.width = '3px'; d.style.height = br.height + 'px';
        } else {
          d.style.left = br.left - rr.left + 'px';
          d.style.top = (tgt.side === 'before' ? br.top : br.bottom) - rr.top - 1 + 'px';
          d.style.width = br.width + 'px'; d.style.height = '3px';
        }
        this.dropTgt = tgt;
      });
      root.addEventListener('dragleave', (e) => { if (!root.contains(e.relatedTarget)) this.drop.style.display = 'none'; });
      root.addEventListener('drop', (e) => {
        if (!this.dragId) return;
        e.preventDefault();
        this.drop.style.display = 'none';
        const tgt = this.dropTgt || this.dropTarget(e);
        const id = this.dragId;
        this.dragId = null;
        if (tgt) this.moveBlock(id, tgt.id, tgt.side);
      });
      document.addEventListener('selectionchange', this._sc = BP.debounce(() => this.updateToolbar(), 60));
    }
    dropTarget(e) {
      const blocks = [...this.root.querySelectorAll('.block')].filter((x) => x.dataset.id !== this.dragId && !x.closest(`.block[data-id="${this.dragId}"]`) && !x.classList.contains('t-column'));
      let best = null, bd = 1e9;
      for (const el of blocks) {
        const row = el.querySelector(':scope > .brow');
        const r = row.getBoundingClientRect();
        const cy = e.clientY;
        const d = cy < r.top ? r.top - cy : cy > r.bottom ? cy - r.bottom : 0;
        if (d < bd || (d === bd && best && el.contains(best.el))) { bd = d; best = { el, r }; }
      }
      if (!best || bd > 40) return null;
      const id = best.el.dataset.id, r = best.r;
      const rel = (e.clientX - r.left) / Math.max(1, r.width);
      let side = e.clientY < r.top + r.height / 2 ? 'before' : 'after';
      const blk = BP.findBlock(this.page.blocks, id).block;
      if (blk.type !== 'columns' && e.clientY >= r.top && e.clientY <= r.bottom) {
        if (rel < 0.06) side = 'left';
        else if (rel > 0.94) side = 'right';
      }
      return { id, side, rect: r, el: best.el };
    }
    moveBlock(id, targetId, side) {
      if (id === targetId) return;
      this.mutate(() => {
        const src = BP.findBlock(this.page.blocks, id);
        if (!src) return;
        const moved = src.block;
        if (BP.findBlock(moved.children || [], targetId)) return;
        src.list.splice(src.index, 1);
        const tf = BP.findBlock(this.page.blocks, targetId);
        if (!tf) return;
        if (side === 'before' || side === 'after') {
          tf.list.splice(tf.index + (side === 'after' ? 1 : 0), 0, moved);
        } else if (tf.parent && tf.parent.type === 'column') {
          const cf = BP.findBlock(this.page.blocks, tf.parent.id);
          cf.list.splice(cf.index + (side === 'right' ? 1 : 0), 0, { id: uid(), type: 'column', children: [moved] });
        } else {
          const col = (c) => ({ id: uid(), type: 'column', children: [c] });
          const grp = Object.assign(BP.newBlock('columns'), { children: side === 'left' ? [col(moved), col(tf.block)] : [col(tf.block), col(moved)] });
          tf.list.splice(tf.index, 1, grp);
        }
      }, { id });
    }

    /* ---------- selection toolbar ---------- */
    updateToolbar() {
      if (this.readonly) return;
      const r = selRange();
      const tb = this.tb;
      if (!r || r.collapsed || !this.root.contains(r.commonAncestorContainer) || !this.sameTxt(r)) return this.hideToolbar();
      const rect = r.getBoundingClientRect();
      if (!rect.width && !rect.height) return this.hideToolbar();
      if (!tb) this.buildToolbar();
      this.tb.style.display = 'flex';
      const w = this.tb.offsetWidth;
      this.tb.style.left = Math.max(8, Math.min(innerWidth - w - 8, rect.left + rect.width / 2 - w / 2)) + 'px';
      this.tb.style.top = Math.max(8, rect.top - 44) + 'px';
      this.savedRange = r.cloneRange();
      ['bold', 'italic', 'underline', 'strikeThrough'].forEach((c) => { const bt = this.tb.querySelector(`[data-cmd="${c}"]`); bt && bt.classList.toggle('on', document.queryCommandState(c)); });
    }
    buildToolbar() {
      const mk = (label, title, fn, cmd, cls) => h('button', { class: 'tb-btn ' + (cls || ''), title, 'data-cmd': cmd || '', html: label, onmousedown: (e) => { e.preventDefault(); fn(e); } });
      this.tb = h('div', { class: 'sel-toolbar' },
        mk('<b>B</b>', 'Bold (Ctrl+B)', () => this.cmd('bold'), 'bold'),
        mk('<i>I</i>', 'Italic (Ctrl+I)', () => this.cmd('italic'), 'italic'),
        mk('<u>U</u>', 'Underline (Ctrl+U)', () => this.cmd('underline'), 'underline'),
        mk('<s>S</s>', 'Strikethrough', () => this.cmd('strikeThrough'), 'strikeThrough'),
        mk('&lt;/&gt;', 'Code (Ctrl+E)', () => this.toggleCode()),
        mk(BP.icons.link, 'Link (Ctrl+K)', () => this.linkPrompt()),
        mk('A ▾', 'Color', (e) => this.colorMenu(e.currentTarget), '', 'wide'),
        mk('💬', 'Comment on this text', () => this.commentSel()),
        mk('✨ ▾', 'AI (uses your own model)', (e) => this.aiMenu(e.currentTarget), '', 'wide')
      );
      document.body.append(this.tb);
    }
    hideToolbar() { if (this.tb) this.tb.style.display = 'none'; }
    cmd(c) {
      document.execCommand(c);
      this.afterFormat();
    }
    afterFormat() {
      const r = selRange();
      const el = r && (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement).closest('.txt');
      if (el) { const b = BP.findBlock(this.page.blocks, el.closest('.block').dataset.id).block; this.syncFrom(el, b); }
      this.updateToolbar();
    }
    toggleCode() {
      const r = selRange();
      if (!r || r.collapsed) return;
      const anc = (r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement).closest('code');
      if (anc) { const p = anc.parentNode; while (anc.firstChild) p.insertBefore(anc.firstChild, anc); anc.remove(); }
      else { const code = h('code'); code.append(r.extractContents()); r.insertNode(code); sel().removeAllRanges(); const nr = document.createRange(); nr.selectNodeContents(code); sel().addRange(nr); }
      this.afterFormat();
    }
    wrapClass(cls, family) {
      const r = this.savedRange || selRange();
      if (!r || r.collapsed) return;
      sel().removeAllRanges(); sel().addRange(r);
      const frag = r.extractContents();
      frag.querySelectorAll('span').forEach((s) => { if ([...s.classList].some((c) => c.startsWith(family + '-'))) { while (s.firstChild) s.parentNode.insertBefore(s.firstChild, s); s.remove(); } });
      if (cls) { const sp = h('span', { class: cls }); sp.append(frag); r.insertNode(sp); sel().removeAllRanges(); const nr = document.createRange(); nr.selectNodeContents(sp); sel().addRange(nr); }
      else r.insertNode(frag);
      this.afterFormat();
    }
    colorMenu(anchor) {
      const r0 = selRange();
      if (r0 && !r0.collapsed) this.savedRange = r0.cloneRange();
      const items = [{ header: 'TEXT COLOR' }, { label: 'Default', onClick: () => this.wrapClass('', 'c') }]
        .concat(BP.COLORS.map((c) => ({ label: c[0].toUpperCase() + c.slice(1), icon: `<span class="swatch c-${c}">A</span>`, onClick: () => this.wrapClass('c-' + c, 'c') })))
        .concat([{ divider: true }, { header: 'BACKGROUND' }, { label: 'None', onClick: () => this.wrapClass('', 'bg') }])
        .concat(BP.COLORS.map((c) => ({ label: c[0].toUpperCase() + c.slice(1), icon: `<span class="swatch bg-${c}">A</span>`, onClick: () => this.wrapClass('bg-' + c, 'bg') })));
      BP.menu(anchor, items);
    }
    linkPrompt() {
      const r = selRange();
      if (!r || r.collapsed) return BP.toast('Select some text first');
      this.savedRange = r.cloneRange();
      const anchor = this.tb && this.tb.style.display !== 'none' ? this.tb : this.root;
      BP.popover(anchor, (el, close) => {
        el.classList.add('embed-pop');
        const inp = h('input', { class: 'input', placeholder: 'Paste a link…  (empty removes the link)' });
        const ok = () => {
          close();
          sel().removeAllRanges(); sel().addRange(this.savedRange);
          let u = inp.value.trim();
          if (!u) document.execCommand('unlink');
          else { if (!/^(https?:|mailto:|bp:)/i.test(u)) u = 'https://' + u; document.execCommand('createLink', false, u); }
          this.afterFormat();
        };
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
        el.append(inp, h('button', { class: 'btn primary wide', onclick: ok }, 'Apply'));
        setTimeout(() => inp.focus(), 20);
      });
    }
  }
  BP.Editor = Editor;
  BP.editorHelpers = { makeBlock, setCaret, LABEL };

  /* ---------- markdown helpers (paste / import) ---------- */
  BP.mdInline = function (s) {
    let t = esc(s);
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>').replace(/~~([^~]+)~~/g, '<s>$1</s>').replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
    return BP.sanitize(t);
  };
  BP.mdToBlocks = function (text) {
    const out = [];
    const lines = text.replace(/\r/g, '').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/^```/.test(l)) {
        const lang = l.slice(3).trim() || 'plain';
        const buf = [];
        for (i++; i < lines.length && !/^```/.test(lines[i]); i++) buf.push(lines[i]);
        out.push(Object.assign(BP.newBlock('code', buf.join('\n')), { lang }));
        continue;
      }
      if (!l.trim()) continue;
      let m;
      if ((m = /^(#{1,3})\s+(.*)$/.exec(l))) out.push(BP.newBlock('h' + m[1].length, BP.mdInline(m[2])));
      else if ((m = /^\s*[-*+]\s+\[( |x|X)\]\s+(.*)$/.exec(l))) out.push(Object.assign(BP.newBlock('todo', BP.mdInline(m[2])), { checked: m[1] !== ' ' }));
      else if ((m = /^\s*[-*+]\s+(.*)$/.exec(l))) out.push(BP.newBlock('bullet', BP.mdInline(m[1])));
      else if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(l))) out.push(BP.newBlock('number', BP.mdInline(m[1])));
      else if ((m = /^>\s?(.*)$/.exec(l))) out.push(BP.newBlock('quote', BP.mdInline(m[1])));
      else if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) out.push(BP.newBlock('divider'));
      else if ((m = /^!\[([^\]]*)\]\(([^)\s]+)\)/.exec(l))) out.push(Object.assign(BP.newBlock('image'), { src: m[2], caption: m[1] }));
      else out.push(BP.newBlock('p', BP.mdInline(l)));
    }
    return out;
  };
  /* ---------- smart paste: tell code from prose ---------- */
  const CMDS = new Set('curl wget sudo apt apt-get yum dnf pip pip3 python python3 node npm npx yarn pnpm git cd ls cat echo grep sed awk chmod chown mkdir rm cp mv ssh scp nmap nc netcat ncat docker kubectl make gcc g++ go cargo java javac mvn gradle powershell pwsh bash sh zsh export source tar unzip systemctl service ps kill man which find touch head tail sort uniq wc dig nslookup ping traceroute ifconfig ip tcpdump openssl msfconsole sqlmap hydra gobuster ffuf nikto john hashcat php ruby perl nano vim vi emacs less more tee xxd strings file objdump gdb strace ltrace base64 md5sum sha256sum whoami hostname uname env printenv'.split(' '));
  const KW = /^(import|from\s+\S+\s+import|def|class|function|const|let|var|return|if|elif|else|for|while|try|catch|except|finally|public|private|static|void|int|package|using|namespace|#include|#!\/|SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|<\?php|<!DOCTYPE|<\/?[a-z][\w-]*[\s>])/;
  function codeScore(line) {
    const s = line.trim();
    if (!s) return 0;
    // a command-looking line that ends like a sentence ("curl -c -b cookies.txt fails") is a description, not a command
    if (/\s(fails?|failed|works?|errors?|returns?|hangs|breaks|exits|crashes|loops|is|are|was|means|happens)\.?$/i.test(s) && !/^\$\s/.test(s) && !/[;|&>"'\/]\s*$/.test(s)) return 0;
    if (/^\$\s+\S/.test(s) || /^>>>\s/.test(s)) return 3;
    if (/^(\.{0,2}\/|~\/)[\w.\-\/]*$/.test(s)) return 3;                      // a bare path like /challenge/server
    const first = s.split(/\s+/)[0].replace(/^\.\//, '');
    if (CMDS.has(first) && /\s/.test(s) || (CMDS.has(first) && /^(ls|ps|pwd|id|whoami)$/.test(first))) return 3;
    if (/^\.?\/?[a-z][\w.\-\/]*\s+(-{1,2}[\w-]+)/.test(s)) return 2;           // tool --flag (tool names are lowercase; "Without -L" is prose)
    if (KW.test(s)) return 2;
    let n = 0;
    if (/[{};]\s*$/.test(s)) n += 2;
    if (/=>|::|&&|\|\||\+\+|!==?|===?|\$\(|\$\{|<\/?\w+>|\\n/.test(s)) n += 1;
    if (/\w\(.*\)/.test(s) && !/[.!?]$/.test(s) && !/\s{1}\w+\s+\w+\s+\w+\s+\w+/.test(s.replace(/\(.*\)/, ''))) n += 1;
    if (/^[\w.\[\]"']+\s*[:=]\s*\S/.test(s) && !/^[A-Z][a-z]+\s+\w+/.test(s)) n += 1;
    if (/^["'{\[]/.test(s) && /["'}\]],?$/.test(s)) n += 1;
    if (/^(#|\/\/|--)\s?\S/.test(s) && n) n += 1;
    return n >= 2 ? 2 : n;
  }
  function langOf(code) {
    const f = code.trim().split('\n')[0].trim();
    if (CMDS.has(f.split(/\s+/)[0].replace(/^\.\//, '')) && /\s/.test(f)) return 'bash';
    if (/^(\$\s|curl|wget|sudo|apt|cd|ls|cat|echo|grep|chmod|ssh|nmap|nc\s|docker|git|npm|npx|pip|python3?\s+-|export|\.\/|\/\w)/.test(f)) return 'bash';
    if (/^(<!DOCTYPE|<\/?[a-z][\w-]*[\s>])/i.test(f)) return 'html';
    if (/^(import\s+\w+$|from\s+\S+\s+import|def\s|class\s.*:|print\(|>>>)/.test(f) || /^import\s/.test(f) && !/from\s+['"]/.test(f)) return 'python';
    if (/^(const|let|var|function|import .* from|export|console\.|async\s)/.test(f) || /=>/.test(code)) return 'javascript';
    if (/^[{\[]\s*["{\[]?/.test(f) && /["}\]]\s*$/.test(code.trim())) return 'json';
    if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE)\b/i.test(f)) return 'sql';
    if (/^(#include|int\s+main|using\s+namespace)/.test(f)) return 'cpp';
    if (/^(package|public\s+class|import\s+java)/.test(f)) return 'java';
    if (/^<\?php/.test(f)) return 'php';
    return 'plain';
  }
  BP.looksLikeCode = (text) => {
    const lines = text.split('\n').filter((l) => l.trim());
    if (!lines.length) return false;
    const hits = lines.filter((l) => codeScore(l) >= 2 || /^\s{2,}\S/.test(l)).length;
    return hits / lines.length >= 0.6;
  };
  const SELECT_LANGS = ['plain', 'bash', 'python', 'javascript', 'typescript', 'html', 'css', 'json', 'sql', 'java', 'c', 'cpp', 'go', 'rust', 'php', 'yaml', 'xml', 'markdown'];
  const LABELS = new Set('bash sh shell zsh console terminal powershell python python3 py javascript js typescript ts html css json sql text plaintext plain http yaml yml xml php java c cpp c++ go rust ruby perl markdown md diff ini toml dockerfile csharp'.split(' '));
  const AMBIG = new Set(['text', 'plain', 'plaintext', 'go', 'c', 'http', 'sh', 'console', 'terminal', 'diff', 'ini', 'md', 'py', 'js', 'ts', 'shell', 'perl', 'ruby']);
  const LANG_MAP = { sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash', terminal: 'bash', powershell: 'bash', python3: 'python', py: 'python', js: 'javascript', ts: 'typescript', text: 'plain', plaintext: 'plain', http: 'plain', yml: 'yaml', 'c++': 'cpp', md: 'markdown', csharp: 'plain', dockerfile: 'plain', ini: 'plain', toml: 'plain', diff: 'plain', perl: 'plain', ruby: 'plain' };
  const normLang = (l) => { l = (l || '').toLowerCase(); l = LANG_MAP[l] || l; return SELECT_LANGS.includes(l) ? l : 'plain'; };
  const wordsOf = (s) => s.trim().split(/\s+/).length;
  const isSentence = (s) => { s = s.trim(); const body = s.replace(/[:.!?]$/, ''); return wordsOf(s) >= 4 && /[.!?:]$/.test(s) && /^[A-Z"'`(\[]/.test(s) && !/[{};<>]/.test(body) && !/\s=\s|\w=\S/.test(body); };
  const titleLike = (s) => { s = s.trim(); const n = wordsOf(s); return n >= 1 && n <= 10 && s.length <= 90 && /^[A-Z0-9][A-Za-z0-9 ,'’\/&\-—–·:+.]*$/.test(s) && !/[:.!?]$/.test(s); };
  // a short plain line right before a language label ("curl cookie workflow" / "bash") names the block, it is not code itself
  const headingBeforeLabel = (s) => { s = s.trim(); return wordsOf(s) <= 8 && /^[A-Za-z0-9]/.test(s) && !/[.!?:]$/.test(s) && !/[{}();=<>$|"'`\\]/.test(s); };
  const TOKEN_RE = /(https?:\/\/[^\s)`,;]*[^\s)`,;.:!?])|((?<=^|[\s(])-{1,2}[A-Za-z][\w-]*(?![\w-]))|([A-Za-z_]\w*(?:\.\w+)*\(\))|(\b[\w-]+\.(?:txt|html|json|py|js|css|md|sh|csv)\b)|((?<=^|[\s(])\/[\w.~-]+(?:\/[\w.~-]*)*)|(\b[a-z_]+=(?=[\s,.]|$))/g;
  // plain-text copies lose backticks: put them back on flags, calls, files, paths and URLs
  function backtickTokens(s) {
    if (/`/.test(s)) return s;
    return s.replace(TOKEN_RE, (m) => { const tail = /[.,:;]+$/.exec(m); return tail && !/\)$/.test(m) ? '`' + m.slice(0, -tail[0].length) + '`' + tail[0] : '`' + m + '`'; });
  }
  function tableBlock(rows) {
    const cols = Math.max(...rows.map((r) => r.length));
    rows = rows.map((r) => r.concat(Array(cols - r.length).fill('')));
    const body = rows.slice(1);
    const mono = rows[0].map((_, c) => body.length > 0 && body.filter((r) => codeScore(r[c]) >= 2).length / body.length >= 0.6);
    return Object.assign(BP.newBlock('table'), { rows, header: true, mono: mono.some(Boolean) ? mono : undefined });
  }
  // find tables: ChatGPT-style flattened tables ("cell", tab-only line, "cell") and real tab-separated rows
  function tableize(lines) {
    const isTab = (l) => /^[ ]*\t[\t ]*$/.test(l);
    const nb = (k, d) => { for (let j = k + d; j >= 0 && j < lines.length; j += d) if (lines[j].trim() !== '') return j; return -1; };
    const tables = [];
    const tabs = lines.map((l, i) => (isTab(l) ? i : -1)).filter((i) => i >= 0);
    const rows = [];
    for (let k = 0; k < tabs.length;) {
      const L = nb(tabs[k], -1), R = nb(tabs[k], 1);
      if (L < 0 || R < 0) { k++; continue; }
      const cells = [lines[L].trim(), lines[R].trim()];
      let end = R;
      k++;
      while (k < tabs.length && nb(tabs[k], -1) === end && nb(tabs[k], 1) >= 0) { end = nb(tabs[k], 1); cells.push(lines[end].trim()); k++; }
      rows.push({ start: L, end, cells });
    }
    let cur = null;
    rows.forEach((r) => {
      if (cur && nb(cur.end, 1) === r.start && cur.rows[0].length === r.cells.length) { cur.rows.push(r.cells); cur.end = r.end; }
      else { if (cur) tables.push(cur); cur = { start: r.start, end: r.end, rows: [r.cells] }; }
    });
    if (cur) tables.push(cur);
    const inTable = (i) => tables.some((t) => i >= t.start && i <= t.end);
    for (let i = 0; i < lines.length; i++) {   // spreadsheet-style TSV
      if (inTable(i) || !/\S\t+\S/.test(lines[i])) continue;
      const n = lines[i].split('\t').length;
      let j = i;
      while (j + 1 < lines.length && !inTable(j + 1) && /\S\t+\S/.test(lines[j + 1]) && lines[j + 1].split('\t').length === n) j++;
      if (j > i) { tables.push({ start: i, end: j, rows: lines.slice(i, j + 1).map((l) => l.split('\t').map((c) => c.trim())) }); i = j; }
    }
    tables.sort((a, b) => a.start - b.start);
    const entries = [];
    for (let i = 0; i < lines.length; i++) {
      const t = tables.find((x) => x.start === i);
      if (t) { entries.push({ table: t.rows }); i = t.end; continue; }
      entries.push({ s: isTab(lines[i]) ? '' : lines[i] });
    }
    return entries;
  }
  function plainToBlocks(text) {
    let lines = text.replace(/\r/g, '').split('\n').filter((l) => !/^\s*(Copy code|Copy)\s*$/i.test(l));
    if (lines.some((l) => /^```/.test(l))) return BP.mdToBlocks(lines.join('\n'));
    const E = tableize(lines);
    const isBlank = (e) => !e.table && !e.s.trim();
    const docLike = E.filter((e) => !isBlank(e)).length >= 25;
    const nextNB = (k) => { for (let j = k + 1; j < E.length; j++) if (!isBlank(E[j])) return j; return -1; };
    const kind = (j) => {
      if (j < 0) return 'none';
      const e = E[j];
      if (e.table) return 'table';
      const s = e.s.trim();
      if (LABELS.has(s.toLowerCase())) return 'label';
      if (codeScore(e.s) >= 2) return 'code';
      if (isSentence(s)) return 'sentence';
      if (/^\d+\.\s+\S/.test(s)) return 'numbered';
      return 'other';
    };
    const endsCode = (L, gap, j) => {
      const lt = L.trim();
      const sc = codeScore(L);
      if (isSentence(lt) && sc < 2) return true;
      if (/^[A-Z][A-Za-z0-9 ,'’\/&\-—–·+.]*:$/.test(lt) && wordsOf(lt) <= 8) return true;   // "Output:" / "For example:"
      if (/^\d+\.\s+[A-Z]/.test(lt) && sc < 2 && !/[;{}()=]/.test(lt)) return true;
      if (gap === 0 && sc < 2 && /^[A-Z][a-z]+(\s+\S+){3,}[.!?]$/.test(lt) && !/[{};=<>()]/.test(lt)) return true;
      if (gap >= 1 && LABELS.has(lt.toLowerCase()) && !AMBIG.has(lt.toLowerCase()) && nextNB(j) >= 0) return true;
      if (gap >= 1 && titleLike(lt) && sc < 2 && wordsOf(lt) >= 2) return true;
      if (gap >= 1 && titleLike(lt) && wordsOf(lt) === 1 && /^[A-Z]/.test(lt) && !CMDS.has(lt.toLowerCase()) && ['label', 'sentence', 'code'].includes(kind(nextNB(j)))) return true;
      return false;
    };
    const out = [];
    let prose = [];
    let titleIdx = -1, seenContent = false;
    const flushProse = () => { if (prose.some((l) => l.trim())) out.push(...BP.mdToBlocks(prose.join('\n'))); prose = []; };
    const pushCode = (body, lang) => { const t = body.join('\n').replace(/\s+$/, ''); if (t.trim()) out.push(Object.assign(BP.newBlock('code', t), { lang: lang || langOf(t) })); };
    for (let i = 0; i < E.length; i++) {
      const e = E[i];
      if (e.table) { flushProse(); out.push(tableBlock(e.table)); seenContent = true; continue; }
      const s = e.s, t = s.trim();
      if (!t) { prose.push(''); continue; }
      const nk = nextNB(i);
      const prevBlank = i === 0 || isBlank(E[i - 1]);
      const lower = t.toLowerCase();
      // 1) a language label on its own line starts a code block
      if (LABELS.has(lower) && nk >= 0 && !E[nk].table && (!AMBIG.has(lower) || (nk - i <= 3 && kind(nk) !== 'sentence'))) {
        flushProse();
        const body = [];
        let gap = 0, j = nk;
        for (; j < E.length; j++) {
          const f = E[j];
          if (f.table) break;
          if (!f.s.trim()) { gap++; continue; }
          if (endsCode(f.s, gap, j)) break;
          if (gap) body.push('');
          gap = 0;
          body.push(f.s);
        }
        pushCode(body, normLang(lower));
        i = j - 1;
        seenContent = true;
        continue;
      }
      // 2) headings
      const first = !seenContent;
      let pj = i - 1;
      while (pj >= 0 && isBlank(E[pj])) pj--;
      const prevText = pj >= 0 && !E[pj].table ? E[pj].s.trim() : '';
      // a heading follows a blank line, a table, or a finished sentence (ChatGPT often omits the blank line)
      const lastBlock = out[out.length - 1];
      const afterBlock = !!lastBlock && prose.every((l) => !l.trim()) && ['code', 'table', 'h1', 'h2', 'h3'].includes(lastBlock.type);
      const prevOk = first || prevBlank || afterBlock || (pj >= 0 && !!E[pj].table) || /[.!?:]$/.test(prevText) || (prevText && titleLike(prevText));
      const nkind = kind(nk);
      const heading = (type) => { flushProse(); out.push(BP.newBlock(type, BP.esc(t))); seenContent = true; };
      let m;
      if (prevOk && (m = /^(\d+)\.\s+(.+)$/.exec(t)) && !/[.!?]$/.test(t) && wordsOf(t) <= 14 && nkind !== 'numbered') {
        // ChatGPT draws a rule between numbered sections
        if (out.length || prose.some((l) => l.trim())) { flushProse(); out.push(BP.newBlock('divider')); }
        heading('h2');
        continue;
      }
      if (prevOk && /^[A-Z]\.\s+\S/.test(t) && wordsOf(t) <= 9 && !/[.!?]$/.test(t)) { heading('h3'); continue; }
      // only a long, document-like paste gets its first line promoted to a title (a 2-line snippet stays plain)
      if (first && docLike && (titleLike(t) || headingBeforeLabel(t)) && codeScore(s) < 2 && ['sentence', 'other'].includes(nkind)) { titleIdx = out.length; heading('h1'); continue; }
      // a short line right before a language label names that code block ("curl cookie workflow" + "bash")
      if (!first && nkind === 'label' && !AMBIG.has(E[nk].s.trim().toLowerCase()) && headingBeforeLabel(t)) { heading('h3'); continue; }
      if (prevOk && titleLike(t) && codeScore(s) < 2 && ['label', 'code', 'table', 'sentence'].includes(nkind)) { heading('h3'); continue; }
      // a sub-heading directly under a section heading
      if (lastBlock && /^h[12]$/.test(lastBlock.type) && prose.every((l) => !l.trim()) && titleLike(t) && codeScore(s) < 2) { heading('h3'); continue; }
      seenContent = true;
      // 3) indented lines are list items (ChatGPT's plain copy indents bullets)
      if (/^( {2,}|\t)\S/.test(s)) { prose.push('- ' + backtickTokens(t)); continue; }
      // 4) unlabeled code: a run of command/code-looking lines
      if (codeScore(s) >= 2) {
        flushProse();
        const body = [s];
        let gap = 0, j = i + 1;
        for (; j < E.length; j++) {
          const f = E[j];
          if (f.table) break;
          if (!f.s.trim()) { gap++; continue; }
          const L = f.s, sc = codeScore(L), ind = /^( {2,}|\t)\S/.test(L);
          if (sc >= 2 || ind || (gap === 0 && /^(#|\/\/)/.test(L.trim()))) { if (gap) body.push(''); gap = 0; body.push(L); } else break;
        }
        pushCode(body);
        i = j - 1;
        continue;
      }
      // 5) ordinary prose
      prose.push(/^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s)/.test(t) ? t : backtickTokens(t).replace(/^(Important|Tip|Note|Warning|Caution|Common mistake|Remember|Example):(\s)/, '**$1:**$2'));
    }
    flushProse();
    if (titleIdx >= 0) out.suggestedTitle = BP.textOf(out[titleIdx].text);
    return out;
  }
  function htmlToBlocks(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (!doc.querySelector('pre, table, h1, h2, h3, h4, li, blockquote')) return null;
    const out = [];
    const inline = (el) => BP.sanitize(el.innerHTML);
    const push = (type, el, extra) => { const t = inline(el); if (BP.textOf(t).trim() || type === 'divider') out.push(Object.assign(BP.newBlock(type, type === 'divider' ? '' : t), extra || {})); };
    const walk = (node) => {
      node.childNodes.forEach((n) => {
        if (n.nodeType === 3) { const t = n.nodeValue.trim(); if (t && node === doc.body) out.push(BP.newBlock('p', BP.esc(t))); return; }
        if (n.nodeType !== 1) return;
        const tag = n.tagName;
        if (/^(SCRIPT|STYLE|BUTTON|SVG|NAV|META|LINK)$/.test(tag)) return;
        if (tag === 'PRE') {
          const c = n.querySelector('code') || n;
          let t = c.textContent.replace(/\n+$/, '').replace(/^\s*(Copy code|Copy)\s*\n/, '');
          const m = /(?:language|lang)-([\w+#-]+)/.exec((c.className || '') + ' ' + (n.className || ''));
          const label = ((n.firstElementChild && n.firstElementChild !== c && !n.firstElementChild.contains(c) ? n.firstElementChild.textContent : '') || '').toLowerCase().replace(/copy.*$/, '').trim();
          let lang = normLang(m ? m[1] : label);
          if (lang === 'plain') lang = langOf(t);
          if (t.trim()) out.push(Object.assign(BP.newBlock('code', t), { lang }));
        } else if (tag === 'TABLE') {
          const rows = [...n.querySelectorAll('tr')].map((tr) => [...tr.children].filter((c) => /^(TD|TH)$/.test(c.tagName)).map((c) => c.textContent.replace(/\s+/g, ' ').trim())).filter((r) => r.length);
          if (rows.length) out.push(tableBlock(rows));
        } else if (/^H[1-6]$/.test(tag)) push('h' + Math.min(3, +tag[1]), n);
        else if (tag === 'P') push('p', n);
        else if (tag === 'BLOCKQUOTE') push('quote', n);
        else if (tag === 'HR') push('divider', n);
        else if (tag === 'UL' || tag === 'OL') {
          n.querySelectorAll(':scope > li').forEach((li) => {
            const clone = li.cloneNode(true);
            clone.querySelectorAll('ul,ol,pre,table').forEach((x) => x.remove());
            const chk = li.querySelector('input[type=checkbox]');
            push(chk ? 'todo' : tag === 'OL' ? 'number' : 'bullet', clone, chk ? { checked: chk.checked } : {});
            [...li.children].filter((c) => /^(PRE|TABLE|UL|OL)$/.test(c.tagName)).forEach((c) => walk({ childNodes: [c] }));
          });
        }
        else if (tag === 'CODE' && node === doc.body) { const t = n.textContent; if (t.trim()) out.push(Object.assign(BP.newBlock('code', t), { lang: langOf(t) })); }
        else if (n.querySelector('pre, table, p, h1, h2, h3, h4, ul, ol, blockquote, div')) walk(n);
        else { const t = BP.textOf(n.innerHTML).trim(); if (t && !/^(Copy|Copy code)$/i.test(t)) push('p', n); }
      });
    };
    walk(doc.body);
    return out.length ? out : null;
  }
  // "Title / detail / Title / detail ..." right under a heading is a flow diagram (ChatGPT draws these as boxes with arrows;
  // a plain-text copy keeps only the lines). Needs 3+ pairs so ordinary paragraphs are not turned into boxes.
  function detectFlows(blocks) {
    const txt = (b) => BP.textOf(b.text || '').trim();
    const isTitle = (b) => { if (!b || b.type !== 'p') return false; const s = txt(b); return s.length > 0 && s.length <= 30 && wordsOf(s) <= 4 && /^[A-Z]/.test(s) && !/[.!?:;,]$/.test(s); };
    const isDetail = (b) => { if (!b || b.type !== 'p') return false; const s = txt(b); return s.length > 0 && s.length <= 100 && wordsOf(s) <= 14 && !/[.!?]$/.test(s); };
    const res = [];
    for (let i = 0; i < blocks.length;) {
      const prevOk = i === 0 || /^h[123]$/.test((res[res.length - 1] || {}).type || '');
      let j = i;
      const steps = [];
      while (prevOk && j + 1 < blocks.length && isTitle(blocks[j]) && isDetail(blocks[j + 1])) { steps.push({ t: txt(blocks[j]), d: txt(blocks[j + 1]) }); j += 2; }
      if (steps.length >= 3) { res.push(Object.assign(BP.newBlock('flow'), { dir: 'v', steps })); i = j; }
      else { res.push(blocks[i]); i++; }
    }
    return res;
  }
  BP.smartPaste = function (text, html) {
    let out = html ? htmlToBlocks(html) : null;
    if (!out) out = plainToBlocks(text);
    const title = out.suggestedTitle;
    out = detectFlows(out);
    if (title) out.suggestedTitle = title;
    if (!out.suggestedTitle && out[0] && /^h[12]$/.test(out[0].type)) out.suggestedTitle = BP.textOf(out[0].text);
    return out;
  };
  // drop blocks onto a page in the sidebar: move them there
  BP.moveBlocksToPage = function (ref, targetId) {
    const ed = ref && ref.ed, target = BP.page(targetId);
    if (!ed || !target || target.type !== 'page' || target.id === ed.page.id || BP.isTrashed(target)) return false;
    const moving = ref.ids.map((id) => (BP.findBlock(ed.page.blocks, id) || {}).block).filter(Boolean);
    if (!moving.length) return false;
    ed.mutate(() => ref.ids.forEach((id) => { const f = BP.findBlock(ed.page.blocks, id); f && f.list.splice(f.index, 1); }), null);
    target.blocks = target.blocks || [];
    const last = target.blocks[target.blocks.length - 1];
    if (last && last.type === 'p' && !BP.textOf(last.text).trim()) target.blocks.splice(target.blocks.length - 1, 0, ...moving);
    else target.blocks.push(...moving);
    BP.touch(target);
    BP.toast('Moved ' + moving.length + ' block' + (moving.length > 1 ? 's' : '') + ' to “' + (target.title || 'Untitled') + '”');
    return true;
  };
  BP.saveDataUrl = async function (src, name) {
    if (window.bp && src.startsWith('data:')) return window.bp.saveFile(name, src.split(',')[1], true);
    const a = h('a', { href: src, download: name, target: '_blank' });
    document.body.append(a); a.click(); a.remove();
  };
})();

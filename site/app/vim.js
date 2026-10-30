/* Vim keys for the block editor (Settings → General → Vim keys; off by default).
   Esc leaves typing (INSERT) for NORMAL mode, where keys move and edit instead of typing:
     h j k l  ← ↓ ↑ →   (j / k carry on into the next / previous block)     w b e  words     0 ^ $  line start / end
     gg G  first / last block      i a I A  type before / after / at line start / at line end      o O  new block below / above
     x  delete a letter    dd  delete the block    D  delete to line end    C  change to line end    cc  change the whole block
     yy  copy the block    p P  paste it below / above    u  undo    Ctrl+R  redo    /  search    :  command palette
   A number first repeats a move or edit (3j, 5x). Works in text blocks; code boxes and the title keep normal keys. */
(function () {
  const BP = (window.BP = window.BP || {});
  const V = (BP.vim = { mode: 'normal' });
  let pending = '', count = '', reg = null, pill = null;
  const on = () => !!(BP.state && BP.state.settings && BP.state.settings.vim);
  const ed = () => BP.currentEditor;
  const txtEl = () => { const a = document.activeElement; return a && a.classList && a.classList.contains('txt') && a.isContentEditable && ed() && ed().root.contains(a) ? a : null; };
  const blockOf = (el) => { const id = el.closest('.block') && el.closest('.block').dataset.id; const f = id && BP.findBlock(ed().page.blocks, id); return f ? f.block : null; };
  const setMode = (m) => {
    V.mode = m;
    pending = ''; count = '';
    document.body.classList.toggle('vim-normal', on() && m === 'normal');
    paint();
  };
  V.setMode = setMode;
  function paint() {
    const show = on() && !!txtEl();
    if (!pill) { pill = BP.h('div', { class: 'vim-pill' }); document.body.append(pill); }
    pill.style.display = show ? '' : 'none';
    pill.textContent = V.mode === 'normal' ? '-- NORMAL --' + (count || pending ? '  ' + count + pending : '') : '-- INSERT --';
    pill.classList.toggle('ins', V.mode !== 'normal');
    document.body.classList.toggle('vim-normal', show && V.mode === 'normal');
  }
  const move = (dir, unit) => { const s = getSelection(); s.modify('move', dir, unit); };
  // where the caret is: its character offset in the block and the top of its line on screen
  const offsetIn = (el) => { const s = getSelection(); if (!s.rangeCount || !el.contains(s.focusNode)) return -1; const r = document.createRange(); r.selectNodeContents(el); r.setEnd(s.focusNode, s.focusOffset); return r.toString().length; };
  // the on-screen box of the character at index i (a collapsed caret has no reliable box, a character does)
  const charRect = (el, i) => {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n, left = i;
    while ((n = w.nextNode())) {
      const L = n.nodeValue.length;
      if (left < L) { const r = document.createRange(); r.setStart(n, left); r.setEnd(n, left + 1); const rs = r.getClientRects(); return rs.length ? rs[0] : null; }
      left -= L;
    }
    return null;
  };
  // the top of the line the caret is on: measured from the character beside it, so it reads the same at the start and the end of a line
  const lineTop = (el) => {
    const o = offsetIn(el);
    if (o < 0) return null;
    const len = el.textContent.length;
    if (!len) return el.getBoundingClientRect().top;
    const r = charRect(el, Math.min(o, len - 1));
    return r ? r.top : el.getBoundingClientRect().top;
  };
  // j / k: down / up a line inside the block, or into the next / previous block when the caret cannot go further
  const vert = (el, d) => {
    const t0 = lineTop(el), o0 = offsetIn(el);
    move(d > 0 ? 'forward' : 'backward', 'line');
    const t1 = lineTop(el), o1 = offsetIn(el);
    // stuck = the caret did not change line, or it left this block (the browser can step into the next editable)
    const stuck = o1 === -1 || (t0 != null && t1 != null ? Math.abs(t0 - t1) < 2 : o0 === o1);
    if (stuck) { const all = ed().focusables(); const n = all[all.indexOf(el) + d]; if (n) BP.editorHelpers.setCaret(n, d > 0 ? 'start' : 'end'); }
  };
  const del = (unit, dir) => { const s = getSelection(); s.modify('extend', dir || 'forward', unit); if (!s.isCollapsed) document.execCommand('delete'); };
  const newBlockBy = (b, after) => {
    const e = ed(), nb = BP.newBlock('p');
    e.mutate(() => { const f = BP.findBlock(e.page.blocks, b.id); f.list.splice(f.index + (after ? 1 : 0), 0, nb); }, { id: nb.id, pos: 'start' });
    setMode('insert');
  };
  const removeBlock = (b, el) => {
    const e = ed(), all = e.focusables(), i = all.indexOf(el);
    const next = all[i + 1] || all[i - 1];
    const nid = next && next.closest('.block') && next.closest('.block').dataset.id;
    reg = JSON.parse(JSON.stringify(b));
    e.mutate(() => { const f = BP.findBlock(e.page.blocks, b.id); f && f.list.splice(f.index, 1); if (!e.page.blocks.length) e.page.blocks.push(BP.newBlock('p')); }, nid && nid !== b.id ? { id: nid, pos: 'start' } : { id: e.page.blocks[0].id, pos: 'start' });
  };
  const paste = (b, after) => {
    if (!reg) return BP.toast('Nothing copied yet: yy copies a block');
    const e = ed(), c = JSON.parse(JSON.stringify(reg));
    BP.walkBlocks([c], (x) => (x.id = BP.uid()));
    e.mutate(() => { const f = BP.findBlock(e.page.blocks, b.id); f.list.splice(f.index + (after ? 1 : 0), 0, c); }, { id: c.id, pos: 'start' });
  };
  const PRINTABLE = (e) => e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;

  document.addEventListener('keydown', (e) => {
    if (!on()) return;
    const el = txtEl();
    if (!el || BP.$('.modal-back') || BP.$('.popover') || BP.$('.slash') || e.isComposing) return;
    if (V.mode === 'insert') {
      if (e.key === 'Escape' || (e.key === '[' && e.ctrlKey)) { e.preventDefault(); e.stopImmediatePropagation(); move('backward', 'character'); setMode('normal'); }
      return;
    }
    // NORMAL
    const k = e.key;
    const b = blockOf(el);
    if (!b) return;
    if (e.ctrlKey && k.toLowerCase() === 'r') { e.preventDefault(); e.stopImmediatePropagation(); ed().redo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;                  // shortcuts like Ctrl+K keep working
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(k)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (k === 'Escape') { pending = ''; count = ''; return paint(); }
    if (/^[1-9]$/.test(k) || (k === '0' && count)) { count += k; return paint(); }
    const n = Math.min(500, +count || 1);
    const seq = pending + k;
    pending = ''; count = '';
    const rep = (fn) => { for (let i = 0; i < n; i++) fn(); };
    switch (seq) {
      case 'h': rep(() => move('backward', 'character')); break;
      case 'l': rep(() => move('forward', 'character')); break;
      case 'j': rep(() => vert(txtEl() || el, 1)); break;
      case 'k': rep(() => vert(txtEl() || el, -1)); break;
      case 'w': rep(() => { move('forward', 'word'); move('forward', 'word'); move('backward', 'word'); }); break;
      case 'e': rep(() => move('forward', 'word')); break;
      case 'b': rep(() => move('backward', 'word')); break;
      case '0': case '^': move('backward', 'lineboundary'); break;
      case '$': move('forward', 'lineboundary'); break;
      case 'G': { const all = ed().focusables(); all.length && BP.editorHelpers.setCaret(all[all.length - 1], 'start'); break; }
      case 'gg': { const all = ed().focusables(); all.length && BP.editorHelpers.setCaret(all[0], 'start'); break; }
      case 'i': setMode('insert'); break;
      case 'a': move('forward', 'character'); setMode('insert'); break;
      case 'I': move('backward', 'lineboundary'); setMode('insert'); break;
      case 'A': move('forward', 'lineboundary'); setMode('insert'); break;
      case 'o': newBlockBy(b, true); break;
      case 'O': newBlockBy(b, false); break;
      case 'x': rep(() => del('character')); break;
      case 'X': rep(() => del('character', 'backward')); break;
      case 'D': del('lineboundary'); break;
      case 'C': del('lineboundary'); setMode('insert'); break;
      case 'dd': rep(() => { const cur = txtEl(); const cb = cur && blockOf(cur); if (cb) removeBlock(cb, cur); }); break;
      case 'cc': { BP.editorHelpers.setCaret(el, 'start'); const s = getSelection(); s.selectAllChildren(el); document.execCommand('delete'); setMode('insert'); break; }
      case 'yy': reg = JSON.parse(JSON.stringify(b)); BP.toast('Copied the block'); break;
      case 'p': rep(() => paste(blockOf(txtEl() || el) || b, true)); break;
      case 'P': paste(b, false); break;
      case 'u': rep(() => ed().undo()); break;
      case '/': BP.ui.openSearch(); break;
      case ':': BP.kb.palette(); break;
      case 'g': case 'd': case 'c': case 'y': pending = seq; break;
      default: break;                                                  // any other letter does nothing (it must not type)
    }
    paint();
  }, true);
  // a click or new focus keeps the mode but shows where you are
  document.addEventListener('focusin', () => { if (on()) paint(); });
  document.addEventListener('focusout', () => setTimeout(() => on() && paint(), 0));
  // in NORMAL mode text cannot be typed or dropped in by other means either
  document.addEventListener('beforeinput', (e) => { if (on() && V.mode === 'normal' && e.isTrusted && txtEl() && /^insert(Text|FromPaste|FromDrop|Paragraph|LineBreak|CompositionText)$/.test(e.inputType)) e.preventDefault(); }, true);
  V.refresh = () => setMode(on() ? 'normal' : 'insert');
})();

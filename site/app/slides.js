/* Present a page as slides (⋯ → Present, or the command palette). The page is cut into slides at its dividers (---);
   a page without dividers is cut at each top heading instead (H1, or H2 when there are no H1s). The first slide is the
   page title. → / Space / click the right side for the next slide, ← for the previous, Home / End, F for full screen,
   Esc to stop. Swipe on a phone. */
(function () {
  const BP = (window.BP = window.BP || {});
  const h = (...a) => BP.h(...a);
  const S = (BP.slides = {});
  const blank = (b) => b.type === 'p' && !BP.textOf(b.text || '').trim() && !(b.children && b.children.length);
  S.split = (p) => {
    const blocks = (p.blocks || []).filter((b) => b.type !== 'toc');
    const decks = [];
    if (blocks.some((b) => b.type === 'divider')) {
      let cur = [];
      blocks.forEach((b) => { if (b.type === 'divider') { decks.push(cur); cur = []; } else cur.push(b); });
      decks.push(cur);
    } else {
      const lvl = blocks.some((b) => b.type === 'h1') ? 'h1' : blocks.some((b) => b.type === 'h2') ? 'h2' : null;
      let cur = [];
      blocks.forEach((b) => { if (lvl && b.type === lvl && cur.some((x) => !blank(x))) { decks.push(cur); cur = []; } cur.push(b); });
      decks.push(cur);
    }
    return decks.map((d) => d.filter((b, i, a) => !(blank(b) && (i === 0 || i === a.length - 1)))).filter((d) => d.some((b) => !blank(b)));
  };
  S.present = (p) => {
    if (!p || p.type === 'db' || p.type === 'canvas') return BP.toast('Slides are made from a page’s text');
    const slides = [{ title: true }].concat(S.split(p).map((blocks) => ({ blocks })));
    let i = 0, ed = null;
    const deck = h('div', { class: 'sl-deck', tabindex: '-1' });
    const stage = h('div', { class: 'sl-stage' });
    const slide = h('div', { class: 'sl-slide' });
    const count = h('span', { class: 'sl-count' });
    const bar = h('div', { class: 'sl-bar' },
      h('button', { class: 'icon-btn', title: 'Previous (←)', html: BP.icons.back, onclick: (e) => { e.stopPropagation(); go(i - 1); } }), count,
      h('button', { class: 'icon-btn', title: 'Next (→)', html: BP.icons.fwd, onclick: (e) => { e.stopPropagation(); go(i + 1); } }),
      h('button', { class: 'btn small', title: 'Full screen (F)', onclick: (e) => { e.stopPropagation(); full(); } }, 'Full screen'),
      h('button', { class: 'btn small', title: 'Stop (Esc)', onclick: (e) => { e.stopPropagation(); stop(); } }, 'Stop'));
    const progress = h('div', { class: 'sl-progress' }, h('i'));
    stage.append(slide);
    deck.append(progress, stage, bar);
    document.body.append(deck);
    deck.focus();
    function draw() {
      if (ed) { try { ed.destroy(); } catch (_) {} ed = null; }
      slide.innerHTML = '';
      const s = slides[i];
      slide.classList.toggle('sl-title', !!s.title);
      if (s.title) {
        if (p.icon) slide.append(h('div', { class: 'sl-ico' }, p.icon));
        slide.append(h('h1', null, p.title || 'Untitled'));
        const by = [p.createdBy && p.createdBy !== 'You' ? p.createdBy : '', new Date(p.updated || Date.now()).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })].filter(Boolean).join(' · ');
        slide.append(h('p', { class: 'sl-by' }, by));
      } else {
        const host = h('div', { class: 'sl-body' });
        slide.append(host);
        ed = new BP.Editor(host, { id: 'slides', type: 'page', blocks: JSON.parse(JSON.stringify(s.blocks)) }, { readonly: true });
      }
      count.textContent = (i + 1) + ' / ' + slides.length;
      progress.firstChild.style.width = (100 * (i + 1) / slides.length) + '%';
      // a slide that is taller than the screen shrinks to fit
      slide.style.transform = '';
      requestAnimationFrame(() => { const k = Math.min(1, (stage.clientHeight - 24) / slide.scrollHeight, (stage.clientWidth - 24) / slide.scrollWidth); slide.style.transform = k < 1 ? 'scale(' + k.toFixed(3) + ')' : ''; });
    }
    function go(n) { const j = Math.max(0, Math.min(slides.length - 1, n)); if (j === i) return; i = j; draw(); }
    function full() { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else deck.requestFullscreen && deck.requestFullscreen().catch(() => {}); }
    function stop() {
      if (ed) { try { ed.destroy(); } catch (_) {} }
      document.removeEventListener('keydown', key, true);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      deck.remove();
      S.active = null;
    }
    function key(e) {
      const k = e.key;
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n'].includes(k)) go(i + 1);
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p'].includes(k)) go(i - 1);
      else if (k === 'Home') go(0);
      else if (k === 'End') go(slides.length - 1);
      else if (k === 'f' || k === 'F') full();
      else if (k === 'Escape') { if (!document.fullscreenElement) stop(); else return; }
      else return;
      e.preventDefault(); e.stopPropagation();
    }
    document.addEventListener('keydown', key, true);
    let sx = null, swiped = 0;
    stage.addEventListener('click', (e) => { if (e.target.closest('a') || Date.now() - swiped < 500) return; const r = stage.getBoundingClientRect(); go(e.clientX > r.left + r.width / 3 ? i + 1 : i - 1); });
    stage.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', (e) => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 50) { swiped = Date.now(); go(dx < 0 ? i + 1 : i - 1); } });
    draw();
    S.active = { go: (n) => go(n), index: () => i, count: () => slides.length, stop };
    return S.active;
  };
})();

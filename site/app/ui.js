/* Blockpad UI primitives: icons, popovers, menus, modals, toasts, emoji picker. */
(function () {
  const BP = (window.BP = window.BP || {});
  const esc = BP.esc;
  BP.$ = (s, el) => (el || document).querySelector(s);
  BP.$$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  BP.h = function (tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => c != null && e.append(c.nodeType ? c : document.createTextNode(c)));
    return e;
  };
  const svg = (d) => `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  BP.icons = {
    chevron: svg('<path d="M9 6l6 6-6 6"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
    trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3h0a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8v0a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
    share: svg('<path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v13"/>'),
    comment: svg('<path d="M21 12a8 8 0 01-11.5 7.2L3 21l1.8-5.5A8 8 0 1121 12z"/>'),
    more: svg('<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>'),
    back: svg('<path d="M15 6l-6 6 6 6"/>'),
    fwd: svg('<path d="M9 6l6 6-6 6"/>'),
    star: svg('<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.3l1-6.2L3 9.7l6.2-.9z"/>'),
    sidebar: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>'),
    drag: svg('<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>'),
    table: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/>'),
    board: svg('<rect x="3" y="4" width="5" height="14" rx="1"/><rect x="10" y="4" width="5" height="9" rx="1"/><rect x="17" y="4" width="4" height="11" rx="1"/>'),
    list: svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
    gallery: svg('<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>'),
    calendar: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    filter: svg('<path d="M3 5h18l-7 8v6l-4-2v-4z"/>'),
    sort: svg('<path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/>'),
    check: svg('<path d="M5 12l5 5 9-10"/>'),
    x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    home: svg('<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>'),
    file: svg('<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8zM14 3v5h5"/>'),
    moon: svg('<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>'),
    copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/>'),
    link: svg('<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3A4 4 0 0011 18.7l1-1"/>'),
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    template: svg('<rect x="3" y="3" width="18" height="6" rx="1"/><rect x="3" y="12" width="8" height="9" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/>'),
  };

  /* ---------- toast ---------- */
  BP.toast = function (msg, ms = 2600) {
    let box = BP.$('#toasts');
    if (!box) { box = BP.h('div', { id: 'toasts' }); document.body.append(box); }
    const t = BP.h('div', { class: 'toast' }, msg);
    box.append(t);
    setTimeout(() => t.classList.add('out'), ms);
    setTimeout(() => t.remove(), ms + 300);
  };

  /* ---------- popovers ---------- */
  const pops = [];
  BP.closePopovers = (from = 0) => {
    while (pops.length > from) pops.pop().el.remove();
  };
  BP.popover = function (anchor, build, o = {}) {
    const el = BP.h('div', { class: 'popover ' + (o.class || '') });
    const level = o.level == null ? 0 : o.level;
    if (!o.keep) BP.closePopovers(level);
    const rec = { el, anchor };
    pops.push(rec);
    document.body.append(el);
    const close = () => {
      const i = pops.indexOf(rec);
      if (i >= 0) BP.closePopovers(i);
    };
    build(el, close);
    const place = () => {
      const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, top: anchor.y, right: anchor.x, bottom: anchor.y, width: 0, height: 0 };
      const pw = el.offsetWidth, ph = el.offsetHeight;
      let x = o.side === 'right' ? r.right + 2 : r.left;
      let y = o.side === 'right' ? r.top - 4 : r.bottom + 4;
      if (x + pw > innerWidth - 8) x = Math.max(8, (o.side === 'right' ? r.left - pw - 2 : innerWidth - pw - 8));
      if (y + ph > innerHeight - 8) y = o.side === 'right' ? Math.max(8, innerHeight - ph - 8) : Math.max(8, r.top - ph - 4);
      el.style.left = Math.max(8, x) + 'px';
      el.style.top = Math.max(8, y) + 'px';
    };
    place();
    requestAnimationFrame(place);
    rec.place = place;
    return { el, close, place };
  };
  document.addEventListener('mousedown', (e) => {
    if (!pops.length) return;
    // keep a popover open if the click happened inside it or on its anchor
    const idx = pops.findIndex((p) => p.el.contains(e.target) || (p.anchor.contains && p.anchor.contains(e.target) && !p.el.dataset.toggle));
    BP.closePopovers(idx < 0 ? 0 : idx + 1);
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pops.length) { BP.closePopovers(pops.length - 1); e.stopPropagation(); }
  }, true);
  window.addEventListener('resize', () => BP.closePopovers(0));

  BP.menu = function (anchor, items, o = {}) {
    return BP.popover(anchor, (el, close) => {
      el.classList.add('menu');
      const build = () => {
        items.forEach((it) => {
          if (!it) return;
          if (it.divider) return el.append(BP.h('div', { class: 'menu-div' }));
          if (it.header) return el.append(BP.h('div', { class: 'menu-head' }, it.header));
          const row = BP.h('div', { class: 'menu-item' + (it.danger ? ' danger' : '') + (it.active ? ' active' : '') },
            BP.h('span', { class: 'mi-ico', html: it.icon && it.icon.startsWith('<') ? it.icon : esc(it.icon || '') }),
            BP.h('span', { class: 'mi-label' }, it.label),
            it.kbd ? BP.h('span', { class: 'mi-kbd' }, it.kbd) : null,
            it.check ? BP.h('span', { class: 'mi-check', html: BP.icons.check }) : null,
            it.submenu ? BP.h('span', { class: 'mi-sub', html: BP.icons.chevron }) : null
          );
          if (it.submenu) {
            let t;
            row.addEventListener('mouseenter', () => { t = setTimeout(() => BP.menu(row, typeof it.submenu === 'function' ? it.submenu() : it.submenu, { level: (BP._lvl(el) + 1), side: 'right' }), 80); });
            row.addEventListener('mouseleave', () => clearTimeout(t));
            row.addEventListener('click', () => BP.menu(row, typeof it.submenu === 'function' ? it.submenu() : it.submenu, { level: (BP._lvl(el) + 1), side: 'right' }));
          } else {
            row.addEventListener('mouseenter', () => BP.closePopovers(BP._lvl(el) + 1));
            row.addEventListener('click', () => {
              if (!it.keepOpen) BP.closePopovers(0);
              it.onClick && it.onClick();
            });
          }
          row.addEventListener('mousedown', (e) => e.preventDefault());
          el.append(row);
        });
      };
      build();
    }, o);
  };
  BP._lvl = (el) => pops.findIndex((p) => p.el === el);

  /* ---------- modal ---------- */
  BP.modal = function (title, build, o = {}) {
    BP.closePopovers(0);
    const back = BP.h('div', { class: 'modal-back' });
    const box = BP.h('div', { class: 'modal ' + (o.class || ''), role: 'dialog', 'aria-label': title });
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey, true); o.onClose && o.onClose(); };
    const onKey = (e) => { if (e.key === 'Escape' && !pops.length) { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    if (title && !o.bare) box.append(BP.h('div', { class: 'modal-head' }, BP.h('span', null, title), BP.h('button', { class: 'icon-btn', onclick: close, html: BP.icons.x, 'aria-label': 'Close' })));
    const body = BP.h('div', { class: 'modal-body' });
    box.append(body);
    back.append(box);
    back.addEventListener('mousedown', (e) => e.target === back && close());
    document.body.append(back);
    build(body, close);
    return close;
  };
  BP.prompt = (title, value = '', ok = 'Save') =>
    new Promise((res) => {
      let done = false;
      const fin = (v) => { if (!done) { done = true; res(v); } };
      BP.modal(title, (body, close) => {
        const inp = BP.h('input', { class: 'input', value });
        const go = () => { fin(inp.value); close(); };
        inp.addEventListener('keydown', (e) => e.key === 'Enter' && go());
        body.append(inp, BP.h('div', { class: 'row-end' }, BP.h('button', { class: 'btn', onclick: close }, 'Cancel'), BP.h('button', { class: 'btn primary', onclick: go }, ok)));
        setTimeout(() => { inp.focus(); inp.select(); }, 20);
      }, { class: 'small', onClose: () => fin(null) });
    });
  BP.confirm = (title, msg, ok = 'Delete') =>
    new Promise((res) => {
      let done = false;
      const fin = (v) => { if (!done) { done = true; res(v); } };
      BP.modal(title, (body, close) => {
        body.append(BP.h('p', { class: 'muted' }, msg), BP.h('div', { class: 'row-end' }, BP.h('button', { class: 'btn', onclick: close }, 'Cancel'), BP.h('button', { class: 'btn danger', onclick: () => { fin(true); close(); } }, ok)));
      }, { class: 'small', onClose: () => fin(false) });
    });

  /* ---------- emoji picker ---------- */
  const EMOJI = {
    Faces: '😀😃😄😁😆😅😂🙂😉😊😍🤩😎🤔🫡😴🥳🤯😇🤓',
    Nature: '🌱🌿🌳🌸🌻🌈🔥💧⭐🌙☀️⚡❄️🌊🍀🪴🐶🐱🦊🐼🦋🐝',
    Food: '🍎🍊🍋🍌🍉🍇🍓🥑🍕🍔🍟🌮🍣🍰🍪☕🍵🍷',
    Work: '📌📎📁📂🗂️📓📔📒📚📝✏️🖊️📅🗓️📊📈📉💼🧾💡🔍🔑🔒🧠🎯🚀🛠️⚙️🧩📦🏷️',
    Objects: '💻🖥️⌨️📱🎧🎮📷🎬🎨🎵🏠🚗✈️⛵🏆🎁💎🔔📣🧪🔬',
    Symbols: '✅❌⚠️❓❗💬♻️🔴🟠🟡🟢🔵🟣⬛⬜❤️🧡💛💚💙💜',
  };
  BP.emojiPicker = function (anchor, onPick, allowRemove) {
    BP.popover(anchor, (el, close) => {
      el.classList.add('emoji-pop');
      const head = BP.h('div', { class: 'emoji-head' }, BP.h('b', null, 'Icon'));
      if (allowRemove) head.append(BP.h('button', { class: 'btn small', onclick: () => { onPick(''); close(); } }, 'Remove'));
      const rand = BP.h('button', { class: 'btn small', onclick: () => { const all = [...Object.values(EMOJI).join('').matchAll(/\p{Extended_Pictographic}️?/gu)].map((m) => m[0]); onPick(all[Math.floor(Math.random() * all.length)]); close(); } }, 'Random');
      head.append(rand);
      el.append(head);
      const custom = BP.h('input', { class: 'input', placeholder: 'Type or paste an emoji…' });
      custom.addEventListener('keydown', (e) => { if (e.key === 'Enter' && custom.value.trim()) { onPick(custom.value.trim().slice(0, 4)); close(); } });
      el.append(custom);
      for (const cat in EMOJI) {
        el.append(BP.h('div', { class: 'emoji-cat' }, cat));
        const grid = BP.h('div', { class: 'emoji-grid' });
        [...EMOJI[cat].matchAll(/\p{Extended_Pictographic}️?/gu)].forEach((m) => grid.append(BP.h('button', { class: 'emoji', onclick: () => { onPick(m[0]); close(); } }, m[0])));
        el.append(grid);
      }
    });
  };

  BP.fmtDate = (t) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  BP.fmtDay = (s) => { if (!s) return ''; const d = new Date(s + (s.length <= 10 ? 'T00:00:00' : '')); return isNaN(d) ? s : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };
  BP.download = async function (name, content, mime) {
    if (window.bp) return window.bp.saveFile(name, content, false);
    const a = BP.h('a', { href: URL.createObjectURL(new Blob([content], { type: mime || 'text/plain' })), download: name });
    document.body.append(a); a.click(); a.remove();
  };
  BP.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
})();

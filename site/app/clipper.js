/* Web clipper: give it a web address and it saves the article on that page as a Blockpad page: headings, paragraphs,
   lists, quotes, code, images, tables and links, without the menus, ads and footers. The address and the date are kept
   as page properties (source, clipped).
   Fetching: the desktop app fetches the page itself; the phone app uses the phone's own web access; a browser can only
   read sites that allow it, so there the fallback is to copy the article and paste it into a page. */
(function () {
  const BP = (window.BP = window.BP || {});
  const h = (...a) => BP.h(...a);
  const C = (BP.clip = {});

  C.fetchHtml = async (url) => {
    if (window.bp && window.bp.fetchPage) { const r = await window.bp.fetchPage(url); if (r.error) throw new Error(r.error); return r; }
    const nat = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp;
    if (nat) { const r = await nat.request({ url, method: 'GET', responseType: 'text', headers: { accept: 'text/html' } }); if (r.status >= 400) throw new Error('The site answered ' + r.status); return { html: String(r.data || ''), url: r.url || url }; }
    let res;
    try { res = await fetch(url, { headers: { accept: 'text/html' } }); } catch (_) { const e = new Error('This browser is not allowed to read that site.'); e.blocked = true; throw e; }
    if (!res.ok) throw new Error('The site answered ' + res.status);
    return { html: await res.text(), url: res.url || url };
  };

  /* ---------- finding the article ---------- */
  const DROP = 'script,style,noscript,template,iframe,object,embed,svg,canvas,form,button,input,select,textarea,nav,footer,header,aside,dialog,[hidden],[aria-hidden="true"],[role="navigation"],[role="banner"],[role="contentinfo"],[role="complementary"],[role="dialog"],[role="search"]';
  const NOISE = /(^|[\s_-])(nav|menu|footer|header|sidebar|side-bar|share|social|comment|related|recommend|promo|advert|ad-|ads|banner|cookie|consent|newsletter|subscribe|popup|modal|breadcrumb|pagination|widget|sponsor|outbrain|taboola)([\s_-]|$)/i;
  const textLen = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim().length;
  const linkLen = (el) => [...el.querySelectorAll('a')].reduce((n, a) => n + textLen(a), 0);
  C.extract = (html, url) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const base = doc.createElement('base'); base.href = url; doc.head.prepend(base);
    const meta = (p) => { const m = doc.querySelector('meta[property="' + p + '"],meta[name="' + p + '"]'); return m ? (m.getAttribute('content') || '').trim() : ''; };
    const title = meta('og:title') || (doc.querySelector('h1') && doc.querySelector('h1').textContent.trim()) || (doc.title || '').trim() || url;
    const info = { title: title.replace(/\s+/g, ' ').slice(0, 200), site: meta('og:site_name') || new URL(url).hostname.replace(/^www\./, ''), author: meta('author') || meta('article:author'), published: meta('article:published_time') || meta('date'), description: meta('og:description') || meta('description'), image: meta('og:image') };
    doc.querySelectorAll(DROP).forEach((e) => e.remove());
    doc.querySelectorAll('[class],[id]').forEach((e) => { if (e === doc.body || e.closest('article,main') === e) return; const s = (e.className && e.className.baseVal == null ? e.className : '') + ' ' + (e.id || ''); if (NOISE.test(s) && textLen(e) < 2000) e.remove(); });
    // the element whose own text is the densest wins (links count against it)
    let best = doc.querySelector('article') || doc.querySelector('main') || doc.querySelector('[role="main"]');
    if (!best || textLen(best) < 400) {
      let score = -1;
      doc.body.querySelectorAll('div,section,td').forEach((el) => {
        const ps = el.querySelectorAll(':scope > p, :scope > div > p').length;
        const t = textLen(el); if (t < 250) return;
        const s = (t - 1.5 * linkLen(el)) * (1 + ps * 0.25) / Math.sqrt(el.querySelectorAll('*').length + 10);
        if (s > score) { score = s; best = el; }
      });
    }
    return { info, root: best || doc.body };
  };

  /* ---------- article HTML -> blocks ---------- */
  const LANG = { js: 'javascript', ts: 'typescript', py: 'python', sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash', yml: 'yaml', 'c++': 'cpp', text: 'plain', txt: 'plain' };
  const absUrl = (u, base) => { try { const x = new URL(u, base); return /^(https?:|mailto:)/.test(x.protocol) ? x.href : ''; } catch (_) { return ''; } };
  const inlineHtml = (el, base) => {
    const out = document.createElement('div');
    (function walk(src, dst) {
      src.childNodes.forEach((n) => {
        if (n.nodeType === 3) return dst.append(document.createTextNode(n.nodeValue.replace(/\s+/g, ' ')));
        if (n.nodeType !== 1) return;
        const t = n.tagName;
        if (t === 'BR') return dst.append(document.createElement('br'));
        if (t === 'IMG') return;
        const map = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', S: 's', DEL: 's', CODE: 'code', KBD: 'code', MARK: 'span' };
        if (t === 'A') { const href = absUrl(n.getAttribute('href') || '', base); if (!href) return walk(n, dst); const a = document.createElement('a'); a.setAttribute('href', href); walk(n, a); return dst.append(a); }
        if (map[t]) { const e = document.createElement(map[t]); if (t === 'MARK') e.className = 'bg-yellow'; walk(n, e); return dst.append(e); }
        walk(n, dst);
      });
    })(el, out);
    return BP.sanitize(out.innerHTML.replace(/^\s+|\s+$/g, '').replace(/(<br>\s*){3,}/g, '<br><br>'));
  };
  C.toBlocks = (root, base) => {
    const out = [];
    const nb = (type, text, extra) => Object.assign(BP.newBlock(type, text || ''), extra || {});
    const img = (el) => { const src = absUrl(el.getAttribute('src') || el.getAttribute('data-src') || (el.getAttribute('srcset') || '').split(/\s+/)[0] || '', base); if (src && !/^data:/.test(src) && !/(pixel|spacer|1x1|tracking)/i.test(src)) out.push(nb('image', '', { src, caption: (el.getAttribute('alt') || '').slice(0, 200) })); };
    const list = (el, type, into, depth) => {
      [...el.children].filter((x) => x.tagName === 'LI').forEach((li) => {
        const sub = [...li.children].filter((x) => x.tagName === 'UL' || x.tagName === 'OL');
        sub.forEach((s) => s.remove());
        const cb = li.querySelector('input[type=checkbox]');
        const b = cb ? nb('todo', inlineHtml(li, base), { checked: cb.checked }) : nb(type, inlineHtml(li, base));
        if (sub.length && depth < 4) { b.children = []; sub.forEach((s) => list(s, s.tagName === 'OL' ? 'number' : 'bullet', b.children, depth + 1)); }
        if (BP.textOf(b.text).trim() || b.children) into.push(b);
      });
    };
    const walk = (el) => {
      [...el.children].forEach((c) => {
        const t = c.tagName;
        if (/^H[1-6]$/.test(t)) { const x = inlineHtml(c, base); if (BP.textOf(x).trim()) out.push(nb('h' + Math.min(3, Math.max(1, +t[1] - 1 || 1)), x)); return; }
        if (t === 'P') { c.querySelectorAll('img').forEach(img); const x = inlineHtml(c, base); if (BP.textOf(x).trim()) out.push(nb('p', x)); return; }
        if (t === 'UL' || t === 'OL') return list(c, t === 'OL' ? 'number' : 'bullet', out, 0);
        if (t === 'BLOCKQUOTE') { const x = inlineHtml(c, base); if (BP.textOf(x).trim()) out.push(nb('quote', x)); return; }
        if (t === 'PRE') { const code = c.querySelector('code') || c; const lang = ((code.className || '').match(/(?:lang(?:uage)?-)([\w+#-]+)/) || [])[1] || 'plain'; out.push(nb('code', code.textContent.replace(/\n$/, ''), { lang: LANG[lang.toLowerCase()] || lang.toLowerCase() })); return; }
        if (t === 'IMG') return img(c);
        if (t === 'FIGURE') { const i = c.querySelector('img'); if (i) { img(i); const cap = c.querySelector('figcaption'); if (cap && out.length && out[out.length - 1].type === 'image') out[out.length - 1].caption = cap.textContent.trim().slice(0, 200); } return; }
        if (t === 'HR') return out.push(nb('divider'));
        if (t === 'TABLE') {
          const rows = [...c.querySelectorAll('tr')].slice(0, 200).map((tr) => [...tr.children].filter((x) => /^T[DH]$/.test(x.tagName)).map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
          const w = Math.max(0, ...rows.map((r) => r.length));
          if (w && rows.length) out.push(nb('table', '', { rows: rows.map((r) => r.concat(Array(w - r.length).fill(''))), header: !!c.querySelector('th') }));
          return;
        }
        if (t === 'DL') { [...c.children].forEach((x) => { const v = inlineHtml(x, base); if (BP.textOf(v).trim()) out.push(nb(x.tagName === 'DT' ? 'h3' : 'p', v)); }); return; }
        // a container: go inside; loose text in it becomes a paragraph
        const hasBlocks = c.querySelector('p,h1,h2,h3,h4,h5,h6,ul,ol,pre,blockquote,table,figure,img,hr');
        if (hasBlocks) return walk(c);
        const x = inlineHtml(c, base);
        if (BP.textOf(x).trim().length > 1) out.push(nb('p', x));
      });
    };
    walk(root);
    return out;
  };

  C.clip = async (url, parent) => {
    const r = await C.fetchHtml(url);
    const { info, root } = C.extract(r.html, r.url || url);
    let blocks = C.toBlocks(root, r.url || url);
    if (blocks.length && /^h[1-3]$/.test(blocks[0].type) && BP.textOf(blocks[0].text).trim().toLowerCase() === info.title.toLowerCase()) blocks = blocks.slice(1);
    if (!blocks.some((b) => BP.textOf(b.text || '').trim().length > 40)) throw new Error('No article text was found on that page');
    const meta = { source: r.url || url, clipped: new Date().toISOString().slice(0, 10) };
    if (info.site) meta.site = info.site;
    if (info.author && !/^https?:/.test(info.author)) meta.author = info.author;
    if (info.published) meta.published = info.published.slice(0, 10);
    const p = BP.createPage(parent || null, { title: info.title, icon: '🔖', blocks: blocks.slice(0, 3000), meta, tags: ['clipped'] });
    if (info.image && !blocks.some((b) => b.type === 'image')) p.cover = absUrl(info.image, url) || null;
    BP.touch(p);
    return p;
  };

  C.dialog = (prefill) => {
    BP.modal('Clip a web page', (body, close) => {
      const inp = h('input', { class: 'input', placeholder: 'https://… the page to save', value: prefill || '' });
      const msg = h('div', { class: 'muted small' }, 'Saves the article on that page (text, headings, lists, images, tables and links) as a new page, with the address kept as its source.');
      const go = h('button', { class: 'btn primary' }, 'Clip');
      const run = async () => {
        let url = inp.value.trim();
        if (!url) return;
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        go.disabled = true; go.textContent = 'Clipping…'; msg.textContent = 'Fetching the page…';
        try {
          const p = await C.clip(url);
          close(); BP.open(p.id); BP.toast('Clipped “' + (p.title || 'page') + '”', 4000);
        } catch (e) {
          go.disabled = false; go.textContent = 'Clip';
          msg.innerHTML = '';
          msg.append('⚠ ' + e.message + ' ');
          if (e.blocked || !window.bp) msg.append(h('span', null, 'Instead: open the page, select the article, copy it, and paste it into a new page; headings, lists and links are kept. '), h('button', { class: 'btn small', onclick: () => { close(); const p = BP.createPage(null, { title: 'Clipped page', icon: '🔖', meta: { source: url, clipped: new Date().toISOString().slice(0, 10) }, tags: ['clipped'] }); BP.open(p.id); } }, 'Make the page to paste into'));
        }
      };
      go.onclick = run;
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
      body.append(inp, msg, h('div', { class: 'row-end' }, h('button', { class: 'btn', onclick: close }, 'Cancel'), go));
      setTimeout(() => inp.focus(), 20);
    }, { class: 'small' });
  };
})();

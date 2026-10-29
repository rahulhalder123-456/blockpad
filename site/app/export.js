/* Blockpad export / import: Markdown, standalone HTML, JSON backup. */
(function () {
  const BP = (window.BP = window.BP || {});
  const esc = BP.esc;

  function inlineMd(html) {
    const doc = new DOMParser().parseFromString('<body>' + (html || '') + '</body>', 'text/html');
    const walk = (n) => {
      let s = '';
      n.childNodes.forEach((c) => {
        if (c.nodeType === 3) s += c.nodeValue.replace(/ /g, ' ');
        else if (c.nodeType === 1) {
          const t = c.tagName, inner = walk(c);
          if (!inner) return;
          if (t === 'B' || t === 'STRONG') s += '**' + inner + '**';
          else if (t === 'I' || t === 'EM') s += '*' + inner + '*';
          else if (t === 'S' || t === 'STRIKE') s += '~~' + inner + '~~';
          else if (t === 'CODE') s += '`' + inner + '`';
          else if (t === 'A') { const h = c.getAttribute('href') || ''; s += h.startsWith('bp://') || !h ? inner : '[' + inner + '](' + h + ')'; }
          else if (t === 'BR') s += '  \n';
          else s += inner;
        }
      });
      return s;
    };
    return walk(doc.body);
  }
  BP.dbToMd = function (db) {
    const v = db.views[0];
    const props = db.props.filter((p) => p.type === 'title' || !(v.hidden || []).includes(p.id));
    const cellText = (r, p) => {
      if (['formula', 'rollup', 'relation', 'unique_id', 'last_edited_time'].includes(p.type)) return String(BP.fmtComputed(BP.displayValue(r, p))).replace(/\|/g, '\\|');
      const val = BP.propVal(r, p);
      if (val == null) return '';
      if (p.type === 'date') return String(val).replace('→', ' → ');
      if (p.type === 'select' || p.type === 'status') return (BP.optById(p, val) || {}).name || '';
      if (p.type === 'multi_select') return val.map((id) => (BP.optById(p, id) || {}).name).filter(Boolean).join(', ');
      if (p.type === 'checkbox') return val ? '✓' : '';
      if (p.type === 'created_time') return new Date(val).toISOString().slice(0, 10);
      return String(val).replace(/\|/g, '\\|').replace(/\n/g, ' ');
    };
    const rows = BP.viewRows(db, v, '');
    let out = '| ' + props.map((p) => p.name).join(' | ') + ' |\n| ' + props.map(() => '---').join(' | ') + ' |\n';
    rows.forEach((r) => (out += '| ' + props.map((p) => cellText(r, p)).join(' | ') + ' |\n'));
    return out;
  };
  BP.blocksToMd = function (blocks, depth = 0) {
    const pad = '  '.repeat(depth);
    let out = '';
    let n = 0;
    let prevList = false;
    blocks.forEach((b) => {
      n = b.type === 'number' ? n + 1 : 0;
      const isList = ['bullet', 'number', 'todo', 'toggle'].includes(b.type);
      if (prevList && !isList) out += '\n';
      prevList = isList;
      const t = inlineMd(b.text);
      const kids = () => (b.children && b.children.length ? BP.blocksToMd(b.children, depth + 1) : '');
      switch (b.type) {
        case 'p': out += (t ? pad + t : '') + '\n\n' + kids(); break;
        case 'h1': out += '# ' + t + '\n\n' + kids(); break;
        case 'h2': out += '## ' + t + '\n\n' + kids(); break;
        case 'h3': out += '### ' + t + '\n\n' + kids(); break;
        case 'bullet': case 'toggle': out += pad + '- ' + t + '\n' + kids(); break;
        case 'number': out += pad + n + '. ' + t + '\n' + kids(); break;
        case 'todo': out += pad + '- [' + (b.checked ? 'x' : ' ') + '] ' + t + '\n' + kids(); break;
        case 'quote': out += '> ' + t + '\n\n' + kids(); break;
        case 'callout': out += '> ' + (b.icon || '💡') + ' ' + t + '\n\n' + kids(); break;
        case 'code': out += '```' + (b.lang && b.lang !== 'plain' ? b.lang : '') + '\n' + (b.text || '') + '\n```\n\n'; break;
        case 'equation': out += '$$\n' + (b.text || '') + '\n$$\n\n'; break;
        case 'divider': out += '---\n\n'; break;
        case 'image': out += '![' + (b.caption || '') + '](' + encodeURI(assetRef(b.src, b.name || b.caption)) + ')\n\n'; break;
        case 'video': case 'embed': case 'bookmark': out += (b.src ? '[' + (b.caption || b.name || b.src.slice(0, 60)) + '](' + encodeURI(assetRef(b.src, b.name || b.caption)) + ')' : '') + '\n\n'; break;
        case 'file': out += (b.src && BP._assetCollector ? '[📎 ' + (b.name || 'file') + '](' + encodeURI(assetRef(b.src, b.name)) + ')' : '📎 ' + (b.name || 'file')) + '\n\n'; break;
        case 'flow': out += (b.steps || []).map((s, i) => (i ? '↓\n' : '') + '**' + s.t + '** — ' + s.d).join('\n\n') + '\n\n'; break;
        case 'audio': case 'pdf': out += (b.src ? '[' + (b.type === 'pdf' ? '📕 ' : '🎧 ') + (b.name || b.type) + '](' + encodeURI(assetRef(b.src, b.name)) + ')' : '') + '\n\n'; break;
        case 'table': {
          const rows = b.rows || [];
          if (rows.length) {
            const row = (r) => '| ' + r.map((c) => String(c).replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ') + ' |';
            out += row(rows[0]) + '\n| ' + rows[0].map(() => '---').join(' | ') + ' |\n' + rows.slice(1).map(row).join('\n') + '\n\n';
          }
          break;
        }
        case 'columns': (b.children || []).forEach((c) => (out += BP.blocksToMd(c.children || [], depth))); break;
        case 'toc': out += '*Table of contents*\n\n'; break;
        case 'page': { const p = BP.page(b.ref); if (p && !p.trashed) out += '- 📄 ' + (p.title || 'Untitled') + '\n\n'; break; }
        case 'dbview': { const d = BP.page(b.ref); if (d && !d.trashed) out += '**' + (d.title || 'Database') + '**\n\n' + BP.dbToMd(d) + '\n'; break; }
      }
    });
    return out;
  };
  BP.pageToMd = function (p) {
    let s = '# ' + ((p.icon ? p.icon + ' ' : '') + (p.title || 'Untitled')) + '\n\n';
    if (p.type === 'db') s += BP.dbToMd(p);
    else {
      if (p.rowOf) {
        const db = BP.page(p.rowOf);
        db && db.props.filter((x) => x.type !== 'title').forEach((x) => {
          const val = BP.propVal(p, x);
          if (val == null || val === '' || (Array.isArray(val) && !val.length)) return;
          const text = x.type === 'select' || x.type === 'status' ? (BP.optById(x, val) || {}).name : x.type === 'multi_select' ? val.map((id) => (BP.optById(x, id) || {}).name).join(', ') : x.type === 'checkbox' ? (val ? 'Yes' : 'No') : x.type === 'created_time' ? BP.fmtDate(val) : val;
          s += '**' + x.name + ':** ' + text + '  \n';
        });
        s += '\n';
      }
      s += BP.blocksToMd(p.blocks);
    }
    return s.replace(/\n{3,}/g, '\n\n').trim() + '\n';
  };

  // while a folder export is running, embedded files (data: URLs) are saved as real files and referenced by relative path
  const assetRef = (src, hint) => (!src ? '' : src.startsWith('data:') ? (BP._assetCollector ? BP._assetCollector(hint, src) : 'embedded-file') : src);
  const MIME_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg', 'application/pdf': '.pdf', 'audio/webm': '.webm', 'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'audio/ogg': '.ogg', 'video/mp4': '.mp4', 'video/webm': '.webm', 'text/plain': '.txt' };
  // the whole page tree as files: Page.md next to a Page/ folder holding its sub-pages; databases become .csv with their rows as pages
  BP.exportTree = function (rootId) {
    const files = [];
    const used = new Set();
    const uniq = (dir, base, ext) => { let n = base, i = 2; while (used.has((dir + n + ext).toLowerCase())) n = base + ' ' + i++; used.add((dir + n + ext).toLowerCase()); return n; };
    const walk = (p, dir) => {
      if (!p || p.trashed) return;
      const isDb = p.type === 'db';
      const name = uniq(dir, BP.safeName(p.title), isDb ? '.csv' : '.md');
      const folder = dir + name + '/';
      if (isDb) {
        files.push({ path: dir + name + '.csv', content: BP.dbToCsv(p) });
        BP.rows(p.id).forEach((r) => walk(r, folder));
        return;
      }
      let n = 0;
      BP._assetCollector = (hint, dataUrl) => {
        const m = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(dataUrl);
        if (!m) return dataUrl;
        let fname = BP.safeName(hint || 'attachment');
        if (!/\.[A-Za-z0-9]{1,5}$/.test(fname)) fname += '-' + (n + 1) + (MIME_EXT[m[1]] || '');
        else fname = fname.replace(/(\.[A-Za-z0-9]{1,5})$/, '-' + (n + 1) + '$1');
        n++;
        const b64 = m[2] ? m[3] : btoa(unescape(encodeURIComponent(decodeURIComponent(m[3]))));
        files.push({ path: dir + name + '_files/' + fname, content: b64, base64: true });
        return name + '_files/' + fname;
      };
      let md;
      try { md = BP.pageToMd(p); } finally { BP._assetCollector = null; }
      files.push({ path: dir + name + '.md', content: md });
      BP.children(p.id).forEach((c) => walk(c, folder));
    };
    walk(BP.page(rootId), '');
    return files;
  };
  /* ---------- HTML ---------- */
  function blocksToHtml(blocks) {
    let out = '';
    let i = 0;
    while (i < blocks.length) {
      const b = blocks[i];
      const t = BP.sanitize(b.text || '');
      const kids = b.children && b.children.length ? blocksToHtml(b.children) : '';
      const cls = (b.color ? ' c-' + b.color : '') + (b.bg ? ' bg-' + b.bg : '');
      if (b.type === 'bullet' || b.type === 'number') {
        const tag = b.type === 'bullet' ? 'ul' : 'ol';
        let items = '';
        while (i < blocks.length && blocks[i].type === b.type) {
          const x = blocks[i];
          items += `<li class="${(x.color ? 'c-' + x.color : '')}">${BP.sanitize(x.text)}${x.children && x.children.length ? blocksToHtml(x.children) : ''}</li>`;
          i++;
        }
        out += `<${tag}>${items}</${tag}>`;
        continue;
      }
      i++;
      switch (b.type) {
        case 'p': out += `<p class="${cls}">${t || '<br>'}</p>${kids}`; break;
        case 'h1': case 'h2': case 'h3': out += `<${b.type} class="${cls}">${t}</${b.type}>${kids}`; break;
        case 'todo': out += `<div class="todo"><input type="checkbox" disabled ${b.checked ? 'checked' : ''}> <span class="${b.checked ? 'done' : ''}">${t}</span>${kids}</div>`; break;
        case 'toggle': out += `<details open><summary>${t}</summary>${kids}</details>`; break;
        case 'quote': out += `<blockquote>${t}</blockquote>${kids}`; break;
        case 'callout': out += `<div class="callout${cls}"><span>${esc(b.icon || '💡')}</span><div>${t}${kids}</div></div>`; break;
        case 'code': out += `<pre><code>${esc(b.text || '')}</code></pre>`; break;
        case 'equation': out += `<pre class="eq">${esc(b.text || '')}</pre>`; break;
        case 'divider': out += '<hr>'; break;
        case 'image': out += b.src ? `<figure><img src="${esc(b.src)}" ${b.w ? `style="width:${b.w}px"` : ''} alt="${esc(b.caption || '')}">${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ''}</figure>` : ''; break;
        case 'video': out += b.src ? (/^data:|\.(mp4|webm|ogg)/i.test(b.src) ? `<video src="${esc(b.src)}" controls></video>` : `<p><a href="${esc(b.src)}">${esc(b.src)}</a></p>`) : ''; break;
        case 'embed': case 'bookmark': out += b.src ? `<p class="bookmark"><a href="${esc(b.src)}">${esc(b.src)}</a></p>` : ''; break;
        case 'file': out += `<p>📎 ${esc(b.name || 'file')}</p>`; break;
        case 'flow': out += `<div class="flow${b.dir === 'h' ? ' hz' : ''}">` + (b.steps || []).map((s, i) => (i ? `<div class="flow-arrow">${b.dir === 'h' ? '⇄' : '⇅'}</div>` : '') + `<div class="flow-box"><b>${esc(s.t)}</b><span>${esc(s.d)}</span></div>`).join('') + '</div>'; break;
        case 'audio': out += b.src ? `<audio src="${esc(b.src)}" controls></audio>` : ''; break;
        case 'pdf': out += b.src ? `<p>📕 <a href="${esc(b.src)}">${esc(b.name || 'PDF')}</a></p>` : ''; break;
        case 'table': out += '<table>' + (b.rows || []).map((r, ri) => '<tr>' + r.map((c) => `<${ri === 0 && b.header ? 'th' : 'td'}>${esc(c)}</${ri === 0 && b.header ? 'th' : 'td'}>`).join('') + '</tr>').join('') + '</table>'; break;
        case 'columns': out += '<div class="cols">' + (b.children || []).map((c) => `<div style="flex:${c.w || 1}">${blocksToHtml(c.children || [])}</div>`).join('') + '</div>'; break;
        case 'page': { const p = BP.page(b.ref); if (p && !p.trashed) out += `<p class="sub">${esc(p.icon || '📄')} ${esc(p.title || 'Untitled')}</p>`; break; }
        case 'dbview': { const d = BP.page(b.ref); if (d && !d.trashed) out += dbToHtml(d); break; }
      }
    }
    return out;
  }
  function dbToHtml(db) {
    const md = BP.dbToMd(db).trim().split('\n');
    const split = (l) => l.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => esc(c.trim().replace(/\\\|/g, '|')));
    const head = split(md[0]);
    return `<h3>${esc(db.title || 'Database')}</h3><table><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr>${md.slice(2).map((l) => '<tr>' + split(l).map((c) => `<td>${c}</td>`).join('') + '</tr>').join('')}</table>`;
  }
  BP.pageToHtml = function (p) {
    const body = p.type === 'db' ? dbToHtml(p) : blocksToHtml(p.blocks);
    const css = `body{font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#2b2b2f;max-width:760px;margin:48px auto;padding:0 24px}h1{font-size:2.2em}img,video{max-width:100%;border-radius:6px}pre{background:#f4f4f6;padding:14px;border-radius:8px;overflow:auto}code{background:#f0f0f3;padding:1px 5px;border-radius:4px}blockquote{border-left:3px solid #333;margin:8px 0;padding:2px 14px}.callout{display:flex;gap:10px;background:#f4f4f6;border-radius:8px;padding:14px}table{border-collapse:collapse;margin:12px 0}td,th{border:1px solid #ddd;padding:6px 10px;text-align:left}.cols{display:flex;gap:24px}.done{text-decoration:line-through;color:#888}.flow{display:grid;gap:6px;border:1px solid #ddd;border-radius:12px;padding:12px;text-align:center}.flow.hz{grid-auto-flow:column;align-items:center}.flow-box{background:#f4f4f6;border-radius:8px;padding:10px}.flow-box b{display:block}.flow-box span{color:#666;font-size:.88em}.flow-arrow{color:#888}hr{border:0;border-top:1px solid #ddd}figcaption{color:#888;font-size:.85em}.c-red{color:#d44c47}.c-blue{color:#337ea9}.c-green{color:#448361}.c-orange{color:#d9730d}.c-yellow{color:#cb912f}.c-purple{color:#9065b0}.c-pink{color:#c14c8a}.c-brown{color:#9f6b53}.c-gray{color:#787774}.bg-yellow{background:#fbf3db}.bg-red{background:#fdebec}.bg-blue{background:#e7f3f8}.bg-green{background:#edf3ec}.bg-orange{background:#faebdd}.bg-purple{background:#f6f3f9}.bg-pink{background:#f9f0f5}.bg-brown{background:#f4eeee}.bg-gray{background:#f1f1ef}span.c-red{color:#d44c47}`;
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(p.title || 'Untitled')}</title><style>${css}</style></head><body><h1>${esc((p.icon ? p.icon + ' ' : '') + (p.title || 'Untitled'))}</h1>${body}<hr><p style="color:#999;font-size:.8em">Exported from Blockpad</p></body></html>`;
  };

  /* ---------- CSV ---------- */
  BP.csvParse = function (text) {
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/, 1)[0] || '';
    const counts = { ',': 0, ';': 0, '\t': 0 };
    let q = false;
    for (const ch of first) { if (ch === '"') q = !q; else if (!q && ch in counts) counts[ch]++; }
    const delim = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    const rows = [];
    let row = [], cell = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; } else cell += c;
      } else if (c === '"' && cell === '') inQ = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; rows.push(row); row = []; }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((x) => x.trim() !== ''));
  };
  const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  BP.dbToCsv = function (db, view) {
    const rows = BP.viewRows(db, view || { filters: [], sorts: [] }, '');
    const props = db.props;
    const cell = (r, p) => {
      const v = BP.displayValue(r, p);
      if (p.type === 'date') return BP.propVal(r, p) || '';
      if (p.type === 'checkbox') return v ? 'true' : 'false';
      if (p.type === 'formula' || p.type === 'rollup') return BP.fmtComputed(v);
      return Array.isArray(v) ? v.join(', ') : v == null ? '' : v;
    };
    return [props.map((p) => csvCell(p.name)).join(',')].concat(rows.map((r) => props.map((p) => csvCell(cell(r, p))).join(','))).join('\r\n') + '\r\n';
  };
  const DATE_RE = /^(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|[A-Z][a-z]{2,8}\.? \d{1,2},? \d{4})$/;
  const toIso = (s) => {
    s = String(s).trim();
    let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s);
    if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    const d = new Date(s);
    return isNaN(d) ? null : BP.isoDay(d);
  };
  function inferType(vals) {
    const v = vals.map((x) => x.trim()).filter(Boolean);
    if (!v.length) return 'text';
    if (v.every((x) => /^-?\d+(\.\d+)?$/.test(x.replace(/,/g, '')))) return 'number';
    if (v.every((x) => /^(true|false|yes|no|checked|unchecked|✓|✗)$/i.test(x))) return 'checkbox';
    if (v.every((x) => DATE_RE.test(x) && toIso(x))) return 'date';
    if (v.every((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))) return 'email';
    if (v.every((x) => /^https?:\/\/\S+$/.test(x))) return 'url';
    const uniq = new Set(v);
    if (v.length >= 4 && uniq.size <= 12 && uniq.size <= v.length / 2) return 'select';
    return 'text';
  }
  // text: CSV text; db: existing database or null to create a new one under `parent`
  BP.importCsv = function (text, db, parent, name) {
    const rows = BP.csvParse(text);
    if (rows.length < 1) throw new Error('The file is empty');
    const head = rows[0].map((h, i) => (h || '').trim() || 'Column ' + (i + 1));
    const body = rows.slice(1);
    if (!db) {
      db = BP.createDatabase(parent || null, { title: name || 'Imported data' });
      db.props = [db.props[0]];
      db.props[0].name = head[0];
      db.views = [{ id: BP.uid(), type: 'table', name: 'Table', filters: [], sorts: [], hidden: [] }];
    }
    const used = new Set();
    const cols = head.map((h, i) => {
      let p = db.props.find((x) => x.name.toLowerCase() === h.toLowerCase() && !used.has(x.id));
      if (!p && i === 0 && !db.props.some((x) => x.name.toLowerCase() === h.toLowerCase())) p = db.props.find((x) => x.type === 'title');
      if (!p) {
        const type = inferType(body.map((r) => r[i] || ''));
        p = { id: BP.uid(), name: h, type, w: 150 };
        if (type === 'select') p.options = [...new Set(body.map((r) => (r[i] || '').trim()).filter(Boolean))].map((n, k) => ({ id: BP.uid(), name: n, color: BP.COLORS[k % 9] }));
        db.props.push(p);
      }
      used.add(p.id);
      return p;
    });
    let added = 0;
    body.forEach((r) => {
      const values = {};
      let title = '';
      cols.forEach((p, i) => {
        const raw = (r[i] || '').trim();
        if (p.type === 'title') { title = raw; return; }
        if (BP.COMPUTED.includes(p.type) || p.type === 'relation' || raw === '') return;
        let val = raw;
        if (p.type === 'number') { val = parseFloat(raw.replace(/,/g, '')); if (isNaN(val)) return; }
        else if (p.type === 'checkbox') val = /^(true|yes|checked|✓|1|x)$/i.test(raw);
        else if (p.type === 'date') { const [a, b] = raw.split(/\s*(?:→|\bto\b| - )\s*/); const s = toIso(a); if (!s) return; val = BP.dateJoin(s, b ? toIso(b) : ''); }
        else if (p.type === 'select' || p.type === 'status' || p.type === 'multi_select') {
          p.options = p.options || [];
          const ids = (p.type === 'multi_select' ? raw.split(/\s*,\s*/) : [raw]).filter(Boolean).map((n) => { let o = p.options.find((x) => x.name.toLowerCase() === n.toLowerCase()); if (!o) p.options.push((o = { id: BP.uid(), name: n, color: BP.COLORS[p.options.length % 9] })); return o.id; });
          val = p.type === 'multi_select' ? ids : ids[0];
        }
        values[p.id] = val;
      });
      BP.addRow(db.id, title, values);
      added++;
    });
    BP.save();
    return { db, added };
  };

  /* ---------- workspace import / export ---------- */
  const stamp = () => new Date().toISOString().slice(0, 10);
  BP.safeName = (s) => (s || 'Untitled').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 60);
  BP.exportWorkspace = () => (BP.materializeHistory(), BP.download('blockpad-backup-' + stamp() + '.json', JSON.stringify(Object.assign({}, BP.state, { share: undefined }), null, 1), 'application/json'));   // share links and keys are not exported: a backup must not be an invite
  BP.importWorkspaceText = function (text, mode) {
    const st = JSON.parse(text);
    if (!st || typeof st.pages !== 'object') throw new Error('Not a Blockpad backup file');
    if (mode === 'replace') { BP.state = st; st.settings = Object.assign({ theme: 'auto', sidebar: true, name: 'My Workspace' }, st.settings); }
    else Object.keys(st.pages).forEach((id) => !BP.state.pages[id] && (BP.state.pages[id] = st.pages[id]));
    BP.corrupted = false;
    BP.save();
  };
  BP.importMarkdown = function (name, text, parent) {
    let title = name.replace(/\.(md|markdown|txt)$/i, '');
    const m = /^#\s+(.+)\n?/.exec(text);
    if (m) { title = m[1].trim(); text = text.slice(m[0].length); }
    const blocks = BP.mdToBlocks(text);
    const p = BP.createPage(parent || null, { title, blocks: blocks.length ? blocks : [BP.newBlock('p')] });
    return p;
  };
})();

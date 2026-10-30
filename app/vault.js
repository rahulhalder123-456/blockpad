/* Blockpad <-> Markdown vaults (a vault is a plain folder of Markdown notes, as several notes apps keep them).
   Import: folders become pages that hold their notes; [[links]] (with |alias, #heading, ^block) become page links;
   YAML frontmatter becomes page properties (tags, aliases, the rest); #tags stay tags; ![[embeds]] of images, PDFs,
   audio and video become media blocks with the file inside the workspace; callouts, tables, tasks, nested lists, code,
   math, ==highlights== and %%comments%% are converted; .canvas files become canvas pages.
   Export: the reverse: one .md per page with frontmatter and [[links]], a folder per page that has sub-pages (with the
   page itself inside as a folder note), attachments in attachments/, databases as a .base view file plus one
   note per row, canvases as .canvas. Saved into a folder (desktop app) or a .zip (browser / phone). */
(function () {
  const BP = (window.BP = window.BP || {});
  const h = (...a) => BP.h(...a);
  const V = (BP.vault = {});
  const esc = (s) => BP.esc(s);
  const MEDIA = { png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image', bmp: 'image', avif: 'image', pdf: 'pdf', mp3: 'audio', wav: 'audio', m4a: 'audio', ogg: 'audio', flac: 'audio', webm: 'video', mp4: 'video', mov: 'video', mkv: 'video', ogv: 'video' };
  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif', pdf: 'application/pdf', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', flac: 'audio/flac', webm: 'video/webm', mp4: 'video/mp4', mov: 'video/quicktime', mkv: 'video/x-matroska', ogv: 'video/ogg' };
  const MAX_FILE = 25 * 1024 * 1024;
  const extOf = (p) => { const m = /\.([A-Za-z0-9]+)$/.exec(p); return m ? m[1].toLowerCase() : ''; };
  const baseOf = (p) => p.split('/').pop();
  const stem = (p) => baseOf(p).replace(/\.[^.]+$/, '');
  const dirOf = (p) => p.split('/').slice(0, -1).join('/');
  const low = (s) => String(s).toLowerCase();

  /* ---------- YAML frontmatter (the subset notes use: scalars, [a, b] lists, "- item" lists, quoted strings) ---------- */
  const unq = (s) => { s = s.trim(); if ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'"))) return s.slice(1, -1).replace(/\\"/g, '"').replace(/''/g, "'"); return s; };
  const scalar = (s) => {
    s = s.trim();
    if (s === '' || s === '~' || s === 'null') return '';
    if (/^\[.*\]$/.test(s)) return s.slice(1, -1).split(',').map(unq).map((x) => x.trim()).filter(Boolean);
    if (/^(true|false)$/i.test(s)) return /^true$/i.test(s);
    if (/^-?\d+(\.\d+)?$/.test(s)) return +s;
    return unq(s);
  };
  V.parseFrontmatter = (text) => {
    text = text.replace(/^﻿/, '');
    const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(text);
    if (!m) return { data: {}, body: text };
    const data = {};
    const lines = m[1].split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const km = /^([^\s#:][^:]*?):(?:\s+(.*))?$/.exec(l);
      if (!km) continue;
      const key = km[1].trim(), rest = (km[2] || '').trim();
      if (rest === '' || rest === '|' || rest === '>') {
        const items = [], block = [];
        while (i + 1 < lines.length && (/^\s+/.test(lines[i + 1]) || /^-\s/.test(lines[i + 1]) || lines[i + 1] === '')) {
          i++;
          const li = /^\s*-\s+(.*)$/.exec(lines[i]);
          if (li) items.push(unq(li[1])); else if (lines[i].trim()) block.push(lines[i].trim());
        }
        data[key] = items.length ? items : block.length ? block.join(rest === '|' ? '\n' : ' ') : '';
      } else data[key] = scalar(rest);
    }
    return { data, body: text.slice(m[0].length) };
  };
  const toList = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,\s]+/) : v == null || v === '' ? [] : [String(v)]).map((x) => String(x).replace(/^#/, '').trim()).filter(Boolean);

  /* ---------- reading the picked folder ---------- */
  // entries: [{ path: 'Vault/Folder/Note.md', file: File }] (path is the folder-relative path the browser gives)
  V.importEntries = async (entries, opt = {}) => {
    const rep = { notes: 0, folders: 0, attachments: 0, canvases: 0, links: 0, unresolved: 0, skipped: [], tooBig: [] };
    const all = entries.filter((e) => e.path && !e.path.split('/').some((s) => s.startsWith('.') || s === 'node_modules'));
    if (!all.length) throw new Error('That folder has no notes in it');
    const rootName = opt.name || all[0].path.split('/')[0] || 'Markdown vault';
    const strip = (p) => (p.split('/')[0] === rootName ? p.split('/').slice(1).join('/') : p);
    const files = all.map((e) => ({ rel: strip(e.path.replace(/\\/g, '/')), file: e.file }));
    const notes = files.filter((f) => extOf(f.rel) === 'md');
    const canvases = files.filter((f) => extOf(f.rel) === 'canvas');
    const others = files.filter((f) => !['md', 'canvas'].includes(extOf(f.rel)));
    if (!notes.length && !canvases.length) throw new Error('No .md notes were found in that folder');
    const byAttPath = new Map(), byAttName = new Map();
    others.forEach((f) => { byAttPath.set(low(f.rel), f); const k = low(baseOf(f.rel)); if (!byAttName.has(k)) byAttName.set(k, f); });
    others.filter((f) => !MEDIA[extOf(f.rel)]).forEach((f) => { if (extOf(f.rel) === 'base') rep.skipped.push(f.rel + ' (a .base view: its notes come in, the view does not)'); });

    // the workspace page that holds the whole import
    const root = BP.createPage(opt.parent || null, { title: rootName, icon: '🗃', blocks: [] });
    const folderPage = new Map([['', root]]);
    const noteOfFolder = new Map();      // "A" -> "A/A.md" or "A.md" (a folder note: the note becomes the folder's page)
    // a page per folder that holds notes (an attachments-only folder does not become an empty page)
    const dirs = new Set();
    notes.concat(canvases).forEach((f) => { const parts = f.rel.split('/'); for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/')); });
    const notePaths = new Set(notes.map((n) => low(n.rel)));
    dirs.forEach((d) => { const inside = d + '/' + baseOf(d) + '.md', beside = d + '.md'; if (notePaths.has(low(inside))) noteOfFolder.set(d, inside); else if (notePaths.has(low(beside))) noteOfFolder.set(d, beside); });
    const folderNote = new Set([...noteOfFolder.values()].map(low));
    const sorted = (arr) => arr.slice().sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    const ensureFolder = (d) => {
      if (folderPage.has(d)) return folderPage.get(d);
      const parent = ensureFolder(dirOf(d));
      const p = BP.createPage(parent.id, { title: baseOf(d), icon: '📁', blocks: [] });
      p.vaultPath = d;
      folderPage.set(d, p);
      rep.folders++;
      return p;
    };
    sorted([...dirs]).forEach(ensureFolder);

    // pass 1: a page per note, so every [[link]] can be resolved in pass 2
    const pageOfNote = new Map(), byPath = new Map(), byName = new Map();
    const remember = (key, id, map) => { const k = low(key); if (!map.has(k)) map.set(k, []); map.get(k).push(id); };
    for (const n of notes.slice().sort((a, b) => a.rel.localeCompare(b.rel, undefined, { numeric: true, sensitivity: 'base' }))) {
      const isFolderNote = folderNote.has(low(n.rel));
      let p;
      if (isFolderNote) { const d = [...noteOfFolder].find(([, v]) => low(v) === low(n.rel))[0]; p = folderPage.get(d); p.icon = ''; }
      else p = BP.createPage(ensureFolder(dirOf(n.rel)).id, { title: stem(n.rel), blocks: [] });
      p.vaultPath = n.rel;
      pageOfNote.set(n.rel, p);
      remember(n.rel.replace(/\.md$/i, ''), p.id, byPath);
      remember(stem(n.rel), p.id, byName);
    }
    for (const c of canvases) {
      const p = BP.canvas.create(ensureFolder(dirOf(c.rel)).id, stem(c.rel));
      p.vaultPath = c.rel;
      pageOfNote.set(c.rel, p);
      remember(c.rel, p.id, byPath);
      remember(stem(c.rel) + '.canvas', p.id, byName);
    }
    const resolveNote = (target, fromRel) => {
      let t = target.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
      try { t = decodeURI(t); } catch (_) {}
      const noExt = t.replace(/\.md$/i, '');
      const tries = [noExt, dirOf(fromRel) ? dirOf(fromRel) + '/' + noExt : null].filter(Boolean);
      for (const k of tries) { const hit = byPath.get(low(k)); if (hit) return hit[0]; }
      const rel = dirOf(fromRel).split('/').filter(Boolean);
      noExt.split('/').forEach((s) => { if (s === '..') rel.pop(); else if (s !== '.') rel.push(s); });
      const hitRel = byPath.get(low(rel.join('/')));
      if (hitRel) return hitRel[0];
      const byN = byName.get(low(baseOf(noExt))) || byName.get(low(baseOf(t)));
      if (!byN) return null;
      if (byN.length === 1) return byN[0];
      // several notes share the name: the one closest to the linking note wins
      const here = dirOf(fromRel);
      return byN.slice().sort((a, b) => (BP.page(a).vaultPath.startsWith(here) ? 0 : 1) - (BP.page(b).vaultPath.startsWith(here) ? 0 : 1) || BP.page(a).vaultPath.length - BP.page(b).vaultPath.length)[0];
    };
    const attCache = new Map();
    const findAtt = (target, fromRel) => {
      let t = target.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
      try { t = decodeURI(t); } catch (_) {}
      return byAttPath.get(low(t)) || (dirOf(fromRel) && byAttPath.get(low(dirOf(fromRel) + '/' + t))) || byAttName.get(low(baseOf(t))) || null;
    };
    const readAtt = (f) => {
      if (attCache.has(f.rel)) return attCache.get(f.rel);
      const pr = (async () => {
        if (f.file.size > MAX_FILE) { rep.tooBig.push(f.rel); return null; }
        const buf = new Uint8Array(await f.file.arrayBuffer());
        let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        rep.attachments++;
        return 'data:' + (MIME[extOf(f.rel)] || f.file.type || 'application/octet-stream') + ';base64,' + btoa(bin);
      })();
      attCache.set(f.rel, pr);
      return pr;
    };

    // pass 2: content
    for (const n of notes) {
      const p = pageOfNote.get(n.rel);
      const text = await n.file.text();
      const fm = V.parseFrontmatter(text);
      const meta = Object.assign({}, fm.data);
      const tags = toList(meta.tags != null ? meta.tags : meta.tag);
      const aliases = toList(meta.aliases != null ? meta.aliases : meta.alias).map(String);
      ['tags', 'tag', 'aliases', 'alias', 'cssclasses', 'cssclass', 'position'].forEach((k) => delete meta[k]);
      if (tags.length) p.tags = tags;
      if (aliases.length) p.aliases = aliases;
      if (meta.icon && typeof meta.icon === 'string' && meta.icon.length <= 4) { p.icon = meta.icon; delete meta.icon; }
      const created = Date.parse(meta.created || meta['date created'] || meta.date || '');
      if (Object.keys(meta).length) p.meta = meta;
      const ctx = { fromRel: n.rel, resolveNote, findAtt, readAtt, rep, selfId: p.id };
      const blocks = await V.mdToBlocks(fm.body, ctx);
      const kids = (p.blocks || []).filter((b) => b.type === 'page');
      p.blocks = blocks.concat(kids);
      if (!p.blocks.length) p.blocks = [BP.newBlock('p')];
      p.created = isNaN(created) ? n.file.lastModified || Date.now() : created;
      p.updated = n.file.lastModified || Date.now();
      rep.notes++;
    }
    for (const c of canvases) {
      const p = pageOfNote.get(c.rel);
      try {
        const files = new Map();
        const j = JSON.parse(await c.file.text());
        for (const nd of j.nodes || []) if (nd.type === 'file' && nd.file && !/\.md$/i.test(nd.file) && !/\.canvas$/i.test(nd.file)) { const f = findAtt(nd.file, c.rel); if (f) files.set(nd.file, await readAtt(f)); }
        p.canvas = BP.canvas.fromJson(JSON.stringify(j), (file) => { if (/\.(md|canvas)$/i.test(file)) { const id = resolveNote(file, c.rel); return id ? { page: id } : null; } const src = files.get(file); return src ? { src } : null; });
        p.updated = c.file.lastModified || Date.now();
        rep.canvases++;
      } catch (e) { rep.skipped.push(c.rel + ' (could not read the canvas: ' + e.message + ')'); }
    }
    // folder pages without a folder note: their sub-pages are listed in them already (createPage added link blocks)
    root.blocks = [Object.assign(BP.newBlock('callout', 'Imported from the vault <b>' + esc(rootName) + '</b> on ' + esc(new Date().toLocaleDateString()) + ': ' + rep.notes + ' notes, ' + rep.folders + ' folders, ' + rep.attachments + ' files.'), { icon: '🗃' })].concat(root.blocks.filter((b) => b.type === 'page'));
    BP.save();
    rep.root = root;
    return rep;
  };

  /* ---------- vault Markdown -> blocks ---------- */
  const CALLOUT_ICON = { note: '📝', info: 'ℹ️', tip: '💡', hint: '💡', important: '❗', success: '✅', check: '✅', done: '✅', question: '❓', help: '❓', faq: '❓', warning: '⚠️', caution: '⚠️', attention: '⚠️', failure: '❌', fail: '❌', missing: '❌', danger: '⛔', error: '⛔', bug: '🐞', example: '🧪', quote: '❝', cite: '❝', abstract: '📋', summary: '📋', tldr: '📋', todo: '☑️' };
  const CALLOUT_BG = { warning: 'orange', caution: 'orange', attention: 'orange', danger: 'red', error: 'red', failure: 'red', fail: 'red', bug: 'red', success: 'green', check: 'green', done: 'green', tip: 'green', question: 'yellow', help: 'yellow', faq: 'yellow', important: 'purple', info: 'blue', note: 'blue', todo: 'blue', example: 'purple', abstract: 'blue', summary: 'blue', tldr: 'blue' };
  V.inline = (s, ctx) => {
    const tok = [];
    // placeholders use private-use characters: the HTML parser inside mdInline keeps them (it would replace a NUL)
    const T = (html) => '' + (tok.push(html) - 1) + '';
    s = String(s);
    s = s.replace(/`([^`]+)`/g, (_, c) => T('<code>' + esc(c) + '</code>'));
    s = s.replace(/%%[\s\S]*?%%/g, '');
    s = s.replace(/!?\[\[([^\n]+?)\]\](?!\])/g, (all, inner) => {      // (?!\]) lets an alias end in "]": [[note|[hiring]]]
      const [targetRaw, alias] = inner.split('|');
      const target = targetRaw.split('#')[0].split('^')[0];
      const heading = (targetRaw.split('#')[1] || '').replace(/^\^/, '');
      const label = alias || (target ? stem(target) + (heading ? ' › ' + heading : '') : heading);
      if (!target) return esc(label);         // a link to a heading on the same page
      const id = ctx && !all.startsWith('!') && ctx.resolveNote(target, ctx.fromRel);
      if (id) { ctx.rep.links++; return T('<a href="bp://page/' + id + '">' + esc(label) + '</a>'); }
      if (all.startsWith('!')) return esc(label);
      if (ctx && !(MEDIA[extOf(target)] || extOf(target) === 'base')) ctx.rep.unresolved++;      // a missing note; a link to a file (a .base, a .pdf) is not one
      return esc(label);
    });
    s = s.replace(/\[([^\]]+)\]\(<?([^)>\s]+)>?\)/g, (all, text, url) => {
      if (/^(https?:|mailto:)/i.test(url)) return all;
      const id = ctx && ctx.resolveNote(url.split('#')[0], ctx.fromRel);
      if (id) { ctx.rep.links++; return T('<a href="bp://page/' + id + '">' + esc(text) + '</a>'); }
      return esc(text);
    });
    s = s.replace(/(^|[\s(,;:!?])#([\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/gu, (_, pre, t) => pre + T('<a href="' + BP.kb.tagHref(t) + '">#' + esc(t) + '</a>'));
    s = s.replace(/==([^=\n]+)==/g, (_, t) => T('<span class="bg-yellow">' + BP.mdInline(t) + '</span>'));
    s = s.replace(/<br\s*\/?>/gi, () => T('<br>'));
    s = s.replace(/(^|[^\\\w])__([^_\n]+)__/g, '$1**$2**').replace(/(^|[^\\\w*])_([^_\s][^_\n]*?)_(?![\w])/g, '$1*$2*');
    let out = BP.mdInline(s);
    out = out.replace(/(\d+)/g, (_, i) => tok[+i]);
    return BP.sanitize(out);
  };
  const plainInline = (s, ctx) => BP.textOf(V.inline(s, ctx));
  V.mdToBlocks = async (text, ctx) => {
    ctx = ctx || { fromRel: '', resolveNote: () => null, findAtt: () => null, readAtt: async () => null, rep: { links: 0, unresolved: 0 } };
    const lines = String(text).replace(/\r/g, '').replace(/%%[\s\S]*?%%/g, (m) => (m.includes('\n') ? '' : m)).split('\n');
    const out = [];
    const listStack = [];        // [{ indent, block }]
    const push = (b, indent) => {
      if (indent == null) { listStack.length = 0; out.push(b); return; }
      while (listStack.length && listStack[listStack.length - 1].indent >= indent) listStack.pop();
      const parent = listStack[listStack.length - 1];
      if (parent) (parent.block.children = parent.block.children || []).push(b); else out.push(b);
      listStack.push({ indent, block: b });
    };
    const media = async (target, alt, size) => {
      const f = ctx.findAtt(target, ctx.fromRel);
      const kind = MEDIA[extOf(target)];
      if (!f || !kind) return null;
      const src = await ctx.readAtt(f);
      if (!src) return Object.assign(BP.newBlock('p', esc('📎 ' + baseOf(target) + ' (too large to import)')));
      const b = Object.assign(BP.newBlock(kind), { src, name: baseOf(target) });
      if (kind === 'image') { b.caption = alt && !/^\d+(x\d+)?$/.test(alt) ? alt : ''; const w = /^(\d+)/.exec(size || ''); if (w) b.w = +w[1]; }
      return b;
    };
    const indentOf = (s) => s.replace(/\t/g, '    ').length;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      let m;
      if ((m = /^(\s*)(```+|~~~+)\s*([\w+#.-]*)/.exec(l))) {
        const fence = m[2], buf = [];
        for (i++; i < lines.length && !lines[i].trim().startsWith(fence); i++) buf.push(lines[i]);
        push(Object.assign(BP.newBlock('code', buf.join('\n')), { lang: (m[3] || 'plain').toLowerCase() }));
        continue;
      }
      if (/^\s*\$\$/.test(l)) {
        const first = l.trim().slice(2);
        if (first.endsWith('$$') && first.length > 2) { push(BP.newBlock('equation', first.slice(0, -2).trim())); continue; }
        const buf = first ? [first] : [];
        for (i++; i < lines.length && !/\$\$\s*$/.test(lines[i]); i++) buf.push(lines[i]);
        if (i < lines.length) { const last = lines[i].replace(/\$\$\s*$/, ''); if (last.trim()) buf.push(last); }
        push(BP.newBlock('equation', buf.join('\n').trim()));
        continue;
      }
      if (!l.trim()) { listStack.length = 0; continue; }
      if ((m = /^(#{1,6})\s+(.*?)\s*#*$/.exec(l))) { push(BP.newBlock('h' + Math.min(3, m[1].length), V.inline(m[2], ctx))); continue; }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { push(BP.newBlock('divider')); continue; }
      // a table: header row, then a |---| row
      if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        // table cells are plain text in Blockpad, so the [[links]] in them are also listed under the table (backlinks and the graph keep them)
        const links = new Map();
        const cells = (row) => row.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => {
          const html = V.inline(c.trim().replace(/\\\|/g, '|'), ctx);
          for (const m of html.matchAll(/<a href="bp:\/\/page\/([^"]+)">([\s\S]*?)<\/a>/g)) if (!links.has(m[1])) links.set(m[1], m[2]);
          return BP.textOf(html);
        });
        const rows = [cells(l)];
        for (i += 2; i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]); i++) rows.push(cells(lines[i]));
        i--;
        const w = Math.max(...rows.map((r) => r.length));
        push(Object.assign(BP.newBlock('table'), { rows: rows.map((r) => r.concat(Array(w - r.length).fill(''))), header: true }));
        if (links.size) push(Object.assign(BP.newBlock('toggle', 'Links in the table above (' + links.size + ')'), { open: false, children: [...links].map(([id, label]) => BP.newBlock('bullet', '<a href="bp://page/' + id + '">' + label + '</a>')) }));
        continue;
      }
      // quotes and callouts: consecutive > lines
      if (/^\s*>/.test(l)) {
        const buf = [];
        for (; i < lines.length && /^\s*>/.test(lines[i]); i++) buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i--;
        const cm = /^\[!([\w-]+)\]([+-]?)\s*(.*)$/.exec(buf[0] || '');
        if (cm) {
          const type = cm[1].toLowerCase();
          const title = cm[3] || cm[1][0].toUpperCase() + cm[1].slice(1);
          const body = buf.slice(1).filter((x) => !/^\s*$/.test(x)).map((x) => V.inline(x.replace(/^\s*[-*+]\s+/, '• '), ctx));
          push(Object.assign(BP.newBlock('callout', '<b>' + V.inline(title, ctx) + '</b>' + (body.length ? '<br>' + body.join('<br>') : '')), { icon: CALLOUT_ICON[type] || '💡', bg: CALLOUT_BG[type] || undefined }));
        } else push(BP.newBlock('quote', buf.map((x) => V.inline(x, ctx)).join('<br>')));
        continue;
      }
      // embeds on their own line
      if ((m = /^\s*!\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]\s*$/.exec(l))) {
        const target = m[1].trim();
        if (MEDIA[extOf(target)]) { const b = await media(target, '', m[2]); if (b) { push(b); continue; } }
        const id = !extOf(target) || extOf(target) === 'md' ? ctx.resolveNote(target, ctx.fromRel) : null;
        if (id) { ctx.rep.links++; push(BP.newBlock('p', '↪ <a href="bp://page/' + id + '">' + esc(m[2] || stem(target)) + '</a>')); continue; }
        push(BP.newBlock('p', esc('📎 ' + baseOf(target))));
        continue;
      }
      if ((m = /^\s*!\[([^\]]*)\]\(<?([^)>]+?)>?(?:\s+"[^"]*")?\)\s*$/.exec(l))) {
        const url = m[2].trim();
        if (/^(https?:|data:)/i.test(url)) { push(Object.assign(BP.newBlock('image'), { src: url, caption: m[1] })); continue; }
        const alt = m[1].split('|');
        const b = await media(url, alt[0], alt[1]);
        if (b) { push(b); continue; }
      }
      // lists (nesting by indentation)
      if ((m = /^(\s*)[-*+]\s+\[(.)\]\s+(.*)$/.exec(l))) { push(Object.assign(BP.newBlock('todo', V.inline(m[3], ctx)), { checked: m[2] !== ' ' }), indentOf(m[1])); continue; }
      if ((m = /^(\s*)[-*+]\s+(.*)$/.exec(l))) { push(BP.newBlock('bullet', V.inline(m[2], ctx)), indentOf(m[1])); continue; }
      if ((m = /^(\s*)\d+[.)]\s+(.*)$/.exec(l))) { push(BP.newBlock('number', V.inline(m[2], ctx)), indentOf(m[1])); continue; }
      // an indented line right under a list item belongs to it
      if (listStack.length && /^\s+\S/.test(l)) { const last = listStack[listStack.length - 1].block; last.text = BP.sanitize((last.text || '') + '<br>' + V.inline(l.trim(), ctx)); continue; }
      // a paragraph: following lines join it (vault notes show single line breaks)
      const buf = [l];
      while (i + 1 < lines.length && lines[i + 1].trim() && !/^\s*([-*+]\s|\d+[.)]\s|#{1,6}\s|>|```|~~~|\$\$|\||!\[)/.test(lines[i + 1]) && !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i + 1])) buf.push(lines[++i]);
      push(BP.newBlock('p', buf.map((x) => V.inline(x.trim(), ctx)).join('<br>')));
    }
    return out;
  };

  /* ---------- a .zip of a vault (phones cannot pick a whole folder) ---------- */
  V.unzip = async (blob) => {
    const buf = new Uint8Array(await blob.arrayBuffer());
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let e = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('That is not a .zip file');
    const count = dv.getUint16(e + 10, true);
    let p = dv.getUint32(e + 16, true);
    const td = new TextDecoder();
    const out = [];
    for (let k = 0; k < count; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('The .zip file is damaged');
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), loc = dv.getUint32(p + 42, true);
      const name = td.decode(buf.subarray(p + 46, p + 46 + nlen)).replace(/\\/g, '/');
      p += 46 + nlen + xlen + clen;
      if (name.endsWith('/') || name.startsWith('__MACOSX/')) continue;
      const start = loc + 30 + dv.getUint16(loc + 26, true) + dv.getUint16(loc + 28, true);
      const raw = buf.subarray(start, start + csize);
      let data;
      if (method === 0) data = raw;
      else if (method === 8) data = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      else continue;
      out.push({ path: name, file: new File([data], name.split('/').pop()) });
    }
    return out;
  };

  /* ---------- picking a folder (or a .zip) ---------- */
  const runImport = async (entries, name) => {
    const n = entries.filter((e) => /\.md$/i.test(e.path) && !e.path.split('/').some((s) => s.startsWith('.'))).length;
    BP.toast('Importing ' + n + ' notes…', 4000);
    try {
      const rep = await V.importEntries(entries, name ? { name } : {});
      BP.renderAll();
      BP.open(rep.root.id);
      V.report(rep);
    } catch (e) { BP.toast('Import failed: ' + e.message, 7000); }
  };
  const pickFolder = () => {
    const i = h('input', { type: 'file', webkitdirectory: '', directory: '', multiple: '' });
    i.onchange = () => { const list = [...i.files]; if (list.length) runImport(list.map((f) => ({ path: f.webkitRelativePath || f.name, file: f }))); };
    i.click();
  };
  const pickZip = () => {
    const i = h('input', { type: 'file', accept: '.zip,application/zip' });
    i.onchange = async () => {
      const f = i.files[0];
      if (!f) return;
      try {
        let entries = await V.unzip(f);
        // a zip of the vault folder has one top folder; a zip of its contents does not: name it after the file
        const tops = new Set(entries.map((x) => x.path.split('/')[0]));
        const single = tops.size === 1 && entries.every((x) => x.path.includes('/'));
        const name = single ? [...tops][0] : f.name.replace(/\.zip$/i, '');
        if (!single) entries = entries.map((x) => ({ path: name + '/' + x.path, file: x.file }));
        runImport(entries, name);
      } catch (e) { BP.toast('Could not read the .zip: ' + e.message, 7000); }
    };
    i.click();
  };
  const canPickFolder = () => 'webkitdirectory' in document.createElement('input') && !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  V.pickImport = () => {
    BP.modal('Import a Markdown vault', (body, close) => {
      body.append(h('p', { class: 'muted' }, 'Pick the folder that holds your Markdown notes (your vault). Notes, folders, links, tags, properties, images and canvases come in as Blockpad pages. Your vault is only read, never changed.'));
      if (!canPickFolder()) body.append(h('p', { class: 'muted small' }, 'On a phone, choose a .zip of the vault instead (for example, zip the folder on your computer and copy it over).'));
      body.append(h('div', { class: 'row-end' }, h('button', { class: 'btn', onclick: () => { close(); pickZip(); } }, 'Choose a .zip…'), canPickFolder() ? h('button', { class: 'btn primary', onclick: () => { close(); pickFolder(); } }, 'Choose the vault folder…') : null));
    }, { class: 'small' });
  };
  V.report = (rep) => BP.modal('Vault imported', (body, close) => {
    const row = (k, v) => h('div', { class: 'info-row' }, h('span', { class: 'muted' }, k), h('b', null, String(v)));
    body.append(row('Notes', rep.notes), row('Folders', rep.folders), row('Canvases', rep.canvases), row('Images and files', rep.attachments), row('Links connected', rep.links), row('Links to notes that do not exist', rep.unresolved));
    if (rep.tooBig.length) body.append(h('p', { class: 'muted small' }, 'Left out (over 25 MB each): ' + rep.tooBig.join(', ')));
    if (rep.skipped.length) body.append(h('p', { class: 'muted small' }, 'Not imported: ' + rep.skipped.slice(0, 8).join('; ') + (rep.skipped.length > 8 ? ' …' : '')));
    body.append(h('p', { class: 'muted small' }, 'Your vault folder was only read, never changed. Everything is in the page “' + rep.root.title + '”; open the graph (Ctrl+G) to see how the notes connect.'), h('div', { class: 'row-end' }, h('button', { class: 'btn primary', onclick: close }, 'Done')));
  }, { class: 'small' });

  /* ---------- export ---------- */
  const yamlStr = (v) => {
    const s = String(v);
    return /^[\w\p{L}][\w\p{L} .\-/@+]*$/u.test(s) && !/^(true|false|null|yes|no|~|-?\d+(\.\d+)?)$/i.test(s) && !/[:#]\s|\s$/.test(s) ? s : JSON.stringify(s);
  };
  const yaml = (obj) => {
    const keys = Object.keys(obj).filter((k) => obj[k] != null && obj[k] !== '' && !(Array.isArray(obj[k]) && !obj[k].length));
    if (!keys.length) return '';
    return '---\n' + keys.map((k) => {
      const v = obj[k], key = /^[\w-][\w -]*$/.test(k) ? k : JSON.stringify(k);
      if (Array.isArray(v)) return key + ':\n' + v.map((x) => '  - ' + yamlStr(x)).join('\n');
      if (typeof v === 'boolean' || typeof v === 'number') return key + ': ' + v;
      return key + ': ' + yamlStr(v);
    }).join('\n') + '\n---\n';
  };
  const isoDay = (t) => new Date(t).toISOString().slice(0, 19);
  // the files of a vault: [{ path, content, base64? }]
  V.exportFiles = (rootId) => {
    const files = [];
    const vaultName = BP.safeName(rootId ? (BP.page(rootId) || {}).title : BP.state.settings.name || 'Blockpad');
    const usedNames = new Set(), nameOf = new Map(), pathOf = new Map();
    const uniqName = (title, ext) => { const b = BP.safeName(title || 'Untitled').replace(/[#^[\]|]/g, '-').trim() || 'Untitled'; let n = b, i = 2; while (usedNames.has(low(n + ext))) n = b + ' ' + i++; usedNames.add(low(n + ext)); return n; };
    const top = rootId ? [BP.page(rootId)] : BP.children(null);
    // sub-pages, inline databases included (BP.children leaves those out); a database's rows
    const kidsOf = (p) => (p.type === 'db' ? BP.rows(p.id) : BP.allPages().filter((x) => x.parent === p.id && !x.rowOf).sort((a, b) => (a.order || 0) - (b.order || 0))).filter((x) => !BP.isTrashed(x));
    // decide every page's file path first, so links can name them
    const plan = (p, dir) => {
      if (!p || BP.isTrashed(p)) return;
      const ext = p.type === 'canvas' ? '.canvas' : p.type === 'db' ? '.base' : '.md';
      const name = uniqName(p.title, ext);
      nameOf.set(p.id, name);
      const kids = kidsOf(p);
      // the exported page itself is the top of the vault (its note and sub-pages side by side), not a folder inside it
      const own = kids.length && p.id !== rootId ? dir + name + '/' : dir;
      pathOf.set(p.id, own + name + ext);
      kids.forEach((k) => plan(k, own));
    };
    top.forEach((p) => plan(p, ''));
    // inline databases (dbview blocks) that live under a page are planned as its sub-pages already (createDatabase sets parent)
    const usedAtt = new Set();
    const assetOf = (dataUrl, hint) => {
      const m = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(dataUrl);
      if (!m) return null;
      const extFromMime = Object.keys(MIME).find((k) => MIME[k] === m[1]) || 'bin';
      let base = BP.safeName(hint || 'attachment').replace(/[#^[\]|]/g, '-');
      if (!/\.[A-Za-z0-9]{1,5}$/.test(base)) base += '.' + extFromMime;
      let n = base, i = 2;
      while (usedAtt.has(low(n))) n = base.replace(/(\.[^.]+)$/, ' ' + i++ + '$1');
      usedAtt.add(low(n));
      const b64 = m[2] ? m[3] : btoa(unescape(encodeURIComponent(decodeURIComponent(m[3]))));
      files.push({ path: 'attachments/' + n, content: b64, base64: true });
      return n;
    };
    const linkName = (id) => { const p = pathOf.get(id); return p ? p.replace(/\.md$/, '') : null; };
    const propValue = (r, x) => {
      const val = BP.propVal(r, x);
      if (val == null || val === '' || (Array.isArray(val) && !val.length)) return null;
      if (x.type === 'select' || x.type === 'status') return (BP.optById(x, val) || {}).name || null;
      if (x.type === 'multi_select') return val.map((id) => (BP.optById(x, id) || {}).name).filter(Boolean);
      if (x.type === 'checkbox') return !!val;
      if (x.type === 'number') return +val;
      if (x.type === 'date') return String(val).split('→')[0].trim();
      if (x.type === 'relation') return (Array.isArray(val) ? val : [val]).map((id) => { const n = linkName(id); return n ? '[[' + n.split('/').pop() + ']]' : null; }).filter(Boolean);
      if (['formula', 'rollup', 'created_time', 'last_edited_time', 'created_by', 'last_edited_by', 'unique_id'].includes(x.type)) return null;
      return Array.isArray(val) ? val.map(String) : String(val);
    };
    BP._mdMode = { linkName: (id) => { const n = linkName(id); return n ? n.split('/').pop() : null; } };
    try {
      const write = (p) => {
        if (!p || BP.isTrashed(p)) return;
        const path = pathOf.get(p.id);
        if (p.type === 'canvas') files.push({ path, content: BP.canvas.toJson(p, (id) => pathOf.get(id), assetOf) });
        else if (p.type === 'db') {
          const folder = path.replace(/[^/]+$/, '').replace(/\/$/, '');
          const cols = p.props.filter((x) => x.type !== 'title');
          const views = (p.views || []).filter((v) => ['table', 'gallery', 'list', 'board'].includes(v.type)).map((v) => '  - type: ' + (v.type === 'gallery' ? 'cards' : 'table') + '\n    name: ' + yamlStr(v.name || 'Table') + '\n    order:\n      - file.name\n' + cols.filter((x) => !(v.hidden || []).includes(x.id)).map((x) => '      - ' + yamlStr(x.name)).join('\n'));
          files.push({ path, content: 'filters:\n  and:\n    - file.inFolder(' + JSON.stringify(folder || '/') + ')\n    - file.ext == "md"\nviews:\n' + (views.length ? views.join('\n') : '  - type: table\n    name: Table') + '\n' });
        } else {
          const fm = {};
          if (p.rowOf) { const db = BP.page(p.rowOf); (db ? db.props : []).filter((x) => x.type !== 'title').forEach((x) => { const v = propValue(p, x); if (v != null) fm[x.name] = v; }); }
          if (Array.isArray(p.tags) && p.tags.length) fm.tags = p.tags.slice();
          if (Array.isArray(p.aliases) && p.aliases.length) fm.aliases = p.aliases.slice();
          Object.assign(fm, p.meta || {});
          if (p.icon) fm.icon = p.icon;
          fm.created = isoDay(p.created || Date.now());
          fm.updated = isoDay(p.updated || Date.now());
          BP._assetCollector = (hint, dataUrl) => assetOf(dataUrl, hint) || 'embedded-file';
          let md;
          try { md = BP.blocksToMd(p.blocks || []); } finally { BP._assetCollector = null; }
          files.push({ path, content: yaml(fm) + '\n' + md.replace(/\n{3,}/g, '\n\n').trim() + '\n' });
        }
        kidsOf(p).forEach(write);
      };
      top.forEach(write);
    } finally { BP._mdMode = null; }
    return { files, name: vaultName };
  };

  /* a .zip (stored, no compression) for the browser and phones */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  V.zip = (files) => {
    const te = new TextEncoder();
    const parts = [], central = [];
    let off = 0;
    const d = new Date();
    const dosT = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dosD = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    files.forEach((f) => {
      const name = te.encode(f.path);
      const data = f.base64 ? Uint8Array.from(atob(f.content), (c) => c.charCodeAt(0)) : te.encode(f.content);
      const crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true); lh.setUint16(10, dosT, true); lh.setUint16(12, dosD, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, dosT, true); ch.setUint16(14, dosD, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), name);
      off += 30 + name.length + data.length;
    });
    const cdSize = central.reduce((a, x) => a + x.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
    const all = parts.concat(central, [new Uint8Array(end.buffer)]);
    const out = new Uint8Array(all.reduce((a, x) => a + x.length, 0));
    let p = 0; all.forEach((x) => { out.set(x, p); p += x.length; });
    return out;
  };
  V.exportDialog = (rootId) => {
    const what = rootId ? '“' + ((BP.page(rootId) || {}).title || 'Untitled') + '” and its sub-pages' : 'the whole workspace';
    BP.modal('Export as a Markdown vault', (body, close) => {
      body.append(h('p', { class: 'muted' }, 'Saves ' + what + ' as Markdown notes that Markdown note apps and editors open directly: links become [[links]], properties and tags go into each note’s frontmatter, images and files go into attachments/, databases become a .base view file with one note per row, canvases become .canvas files.'),
        h('p', { class: 'muted small' }, 'Comments, page history and sharing stay in Blockpad.'),
        h('div', { class: 'row-end' }, h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => {
          close();
          const { files, name } = V.exportFiles(rootId);
          try {
            if (window.bp && window.bp.exportFolder) {
              const r = await window.bp.exportFolder(files.map((f) => Object.assign({}, f, { path: name + '/' + f.path })));
              if (!r) return;
              BP.toast('Exported ' + r.count + ' files to ' + r.dir, 6000);
              window.bp.showItem && window.bp.showItem(r.dir);
            } else {
              await BP.download(name + ' (Markdown vault).zip', V.zip(files.map((f) => Object.assign({}, f, { path: name + '/' + f.path }))), 'application/zip');
              BP.toast('Saved a .zip with ' + files.length + ' files. Unzip it and open the folder in your Markdown notes app.', 6000);
            }
          } catch (e) { BP.toast('Export failed: ' + e.message, 6000); }
        } }, 'Export')));
    }, { class: 'small' });
  };
})();

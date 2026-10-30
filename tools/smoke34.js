/* Import real Markdown vaults (read-only) into a throwaway test workspace and report how well they came across:
     VAULTS="C:\path\to\Vault1;C:\path\to\Vault2"  (each folder is only read)
   Checks every note became a page, counts links resolved / missing, tags, attachments, and that the graph and an
   export of the import work. Prints a few links that did not resolve so they can be looked at. */
const fs = require('fs'); const path = require('path');
module.exports = async (t) => {
  let fails = 0;
  const check = (label, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + label + (extra != null ? '  ' + extra : '')); if (!cond) fails++; };
  const J = async (c) => JSON.parse(await t.eval(`Promise.resolve(${c}).then((v)=>JSON.stringify(v === undefined ? null : v))`));
  for (const dir of String(process.env.VAULTS || '').split(';').filter(Boolean)) {
    const name = path.basename(dir);
    const list = [];
    const walk = (d, rel) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) walk(path.join(d, e.name), r); else list.push(r); });
    walk(dir, '');
    const send = list.map((r) => { const full = path.join(dir, r); const st = fs.statSync(full); return { path: name + '/' + r, b64: fs.readFileSync(full).toString('base64'), mtime: st.mtimeMs }; });
    const notes = list.filter((r) => r.endsWith('.md') && !r.split('/').some((s) => s.startsWith('.'))).length;
    await t.eval(`window.__files = ${JSON.stringify(send)}`);
    const t0 = Date.now();
    const rep = await J(`(async () => {
      const entries = window.__files.map(f => ({ path: f.path, file: new File([Uint8Array.from(atob(f.b64), c => c.charCodeAt(0))], f.path.split('/').pop(), { lastModified: f.mtime }) }));
      const r = await BP.vault.importEntries(entries);
      const pages = BP.descendants(r.root.id).map(BP.page);
      const missing = [];
      return { notes: r.notes, folders: r.folders, att: r.attachments, canvases: r.canvases, links: r.links, unresolved: r.unresolved, tooBig: r.tooBig, skipped: r.skipped, root: r.root.id, pages: pages.length,
        withTags: pages.filter(p => BP.kb.tagsOf(p).length).length, withProps: pages.filter(p => p.meta).length, backlinked: pages.filter(p => BP.kb.backlinks(p.id).length).length };
    })()`);
    const ms = Date.now() - t0;
    console.log('\n== ' + name + ': ' + JSON.stringify(rep));
    check(name + ': every note became a page', rep.notes === notes, rep.notes + ' of ' + notes);
    check(name + ': imported in under 20 s', ms < 20000, (ms / 1000).toFixed(1) + ' s');
    // list some unresolved targets, found again straight from the files
    const miss = await J(`(() => {
      const out = new Map();
      window.__files.filter(f => f.path.endsWith('.md')).forEach(f => {
        const text = new TextDecoder().decode(Uint8Array.from(atob(f.b64), c => c.charCodeAt(0)));
        for (const m of text.matchAll(/(?<!!)\\[\\[([^\\]|#^]+)/g)) { const n = m[1].trim(); const known = BP.descendants('${rep.root}').some(id => { const p = BP.page(id); return p && ((p.title || '').toLowerCase() === n.split('/').pop().replace(/\\.md$/i, '').toLowerCase()); }); if (!known) out.set(n, (out.get(n) || 0) + 1); }
      });
      return [...out].slice(0, 8).map(([k, v]) => k + ' ×' + v);
    })()`);
    if (miss.length) console.log('   links to notes that are not in the vault: ' + miss.join(', '));
    const g = await J(`(() => { const b = BP.graph.build({ orphans: true, kids: true }); return { n: b.nodes.length, e: b.edges.length }; })()`);
    check(name + ': graph builds', g.n >= rep.pages, g.n + ' nodes, ' + g.e + ' edges');
    const ex = await J(`(() => { const t0 = performance.now(); const r = BP.vault.exportFiles('${rep.root}'); return { files: r.files.length, md: r.files.filter(f => f.path.endsWith('.md')).length, ms: Math.round(performance.now() - t0) }; })()`);
    check(name + ': exports back to a vault', ex.md >= rep.notes, ex.files + ' files in ' + ex.ms + ' ms');
    await t.eval(`BP.open('${rep.root}')`); await t.wait(300);
  }
  const errs = t.logs.filter((l) => /^\[3\]/.test(l));
  check('no errors in the console', !errs.length, errs.slice(0, 3).join(' || '));
  console.log(fails ? '\nFAIL ' + fails + ' check(s)' : '\nALL CHECKS PASSED');
  if (fails) throw new Error('smoke34 failed');
};

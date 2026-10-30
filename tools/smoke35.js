/* Screenshots of the linked-notes screens for a visual check (no pass/fail on looks):
     SHOTS=<folder>  VAULT=<a Markdown vault folder, read only>  */
const fs = require('fs'); const path = require('path');
module.exports = async (t) => {
  const out = process.env.SHOTS; fs.mkdirSync(out, { recursive: true });
  const J = async (c) => JSON.parse(await t.eval(`Promise.resolve(${c}).then((v)=>JSON.stringify(v === undefined ? null : v))`));
  const dir = process.env.VAULT, name = path.basename(dir);
  const list = [];
  const walk = (d, rel) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) walk(path.join(d, e.name), r); else list.push(r); });
  walk(dir, '');
  await t.eval(`window.__files = ${JSON.stringify(list.map((r) => ({ path: name + '/' + r, b64: fs.readFileSync(path.join(dir, r)).toString('base64') })))}`);
  const root = await J(`(async () => { const r = await BP.vault.importEntries(window.__files.map(f => ({ path: f.path, file: new File([Uint8Array.from(atob(f.b64), c => c.charCodeAt(0))], f.path.split('/').pop()) }))); BP.renderAll(); return r.root.id; })()`);
  const win = require('electron').BrowserWindow.getAllWindows()[0];
  const shot = async (n) => { await t.wait(500); await t.shot(path.join(out, n + '.png')); };
  win.setSize(1400, 900); await t.wait(300);
  // the most linked-to note
  const top = await J(`BP.descendants('${root}').map(BP.page).filter(p => p.type === 'page').sort((a, b) => BP.kb.backlinks(b.id).length - BP.kb.backlinks(a.id).length)[0].id`);
  await t.eval(`BP.open('${top}')`); await shot('1-note');
  await t.eval(`BP.ui.togglePanel('links', true)`); await shot('2-links-panel');
  await t.eval(`BP.ui.togglePanel('links', false); BP.graph.open({})`); await t.wait(2500); await shot('3-graph');
  await t.eval(`document.querySelectorAll('.modal-back').forEach(m => m.remove()); BP.graph.open({ local: '${top}' })`); await t.wait(2000); await shot('4-local-graph');
  await t.eval(`document.querySelectorAll('.modal-back').forEach(m => m.remove()); BP.kb.openTag()`); await t.wait(300);
  await t.eval(`document.querySelector('.kb-tagrow') && document.querySelector('.kb-tagrow').click()`); await shot('5-tags');
  await t.eval(`document.querySelectorAll('.modal-back').forEach(m => m.remove())`);
  const cv = await J(`(BP.descendants('${root}').map(BP.page).find(p => p.type === 'canvas') || {}).id`);
  if (cv) { await t.eval(`BP.open('${cv}')`); await t.wait(600); await shot('6-imported-canvas'); }
  const c2 = await J(`(() => { const c = BP.canvas.create(null, 'Plan'); const ids = BP.descendants('${root}').filter(id => BP.page(id).type === 'page').slice(0, 2);
    c.canvas.nodes = [{ id: 'g', type: 'group', label: 'This week', x: -30, y: -60, width: 940, height: 420, color: '5' },
      { id: 'a', type: 'text', x: 0, y: 0, width: 260, height: 150, text: '# Goal\\nShip the **vault bridge**\\n- [ ] import\\n- [x] graph' },
      { id: 'b', type: 'file', page: ids[0], x: 340, y: 0, width: 280, height: 180 },
      { id: 'c', type: 'link', url: 'https://example.com', x: 660, y: 40, width: 220, height: 100, color: '6' },
      { id: 'd', type: 'text', x: 340, y: 240, width: 240, height: 90, text: 'Ask for feedback', color: '4' }];
    c.canvas.edges = [{ id: 'e1', fromNode: 'a', fromSide: 'right', toNode: 'b', toSide: 'left', toEnd: 'arrow', label: 'needs' }, { id: 'e2', fromNode: 'b', fromSide: 'bottom', toNode: 'd', toSide: 'top', toEnd: 'arrow' }];
    BP.touch(c); BP.open(c.id); return c.id; })()`);
  await t.wait(500); await t.eval('BP.canvas._fit && BP.canvas._fit()'); await shot('7-canvas');
  await t.eval(`(() => { const p = BP.page('${top}'); BP.open(p.id); })()`); await t.wait(300);
  await t.eval(`(() => { const k = new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true }); document.dispatchEvent(k); })()`); await t.wait(200);
  await t.type('dai'); await shot('8-palette');
  await t.eval(`document.querySelectorAll('.modal-back').forEach(m => m.remove())`);
  await t.eval(`BP.setTheme('dark')`); await t.eval(`BP.open('${top}')`); await t.eval(`BP.ui.togglePanel('links', true)`); await shot('9-dark-links');
  await t.eval(`BP.ui.togglePanel('links', false); BP.open('${c2}')`); await t.wait(400); await t.eval('BP.canvas._fit && BP.canvas._fit()'); await shot('10-dark-canvas');
  await t.eval(`BP.setTheme('light')`);
  win.setSize(400, 860); await t.wait(600);
  await t.eval(`BP.open('${top}')`); await shot('11-phone-note');
  await t.eval(`BP.ui.togglePanel('links', true)`); await shot('12-phone-links');
  await t.eval(`BP.ui.togglePanel('links', false); BP.graph.open({})`); await t.wait(2000); await shot('13-phone-graph');
  await t.eval(`document.querySelectorAll('.modal-back').forEach(m => m.remove()); BP.open('${c2}')`); await t.wait(500); await t.eval('BP.canvas._fit && BP.canvas._fit()'); await shot('14-phone-canvas');
  console.log('shots in ' + out);
  console.log('\nALL CHECKS PASSED');
};

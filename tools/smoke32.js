/* fast saving (history in its own file, edit-only saves) must never lose data. Run in phases against one BP_SMOKE_DIR:
     PHASE=old      writes an old-format workspace (history inline in each page, no history file) into the data folder and quits
     PHASE=a        the app loads it: history is there; edits through BP.touch; a change that skips BP.touch; external merge; quits
     PHASE=b        a fresh start: every edit, every change and every history version is back; the files have the new layout */
const fs = require('fs'); const path = require('path');
module.exports = async (t) => {
  let fails = 0;
  const check = (label, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + label + (extra ? '  ' + extra : '')); if (!cond) fails++; };
  const J = async (c) => JSON.parse(await t.eval(`Promise.resolve(${c}).then((v)=>JSON.stringify(v === undefined ? null : v))`));
  const dir = path.join(process.env.BP_SMOKE_DIR, 'data');
  const main = path.join(dir, 'workspace.json'), hist = path.join(dir, 'workspace.history.json');
  const phase = process.env.PHASE;

  if (phase === 'old') {
    const pages = {};
    for (let i = 0; i < 5; i++) {
      const id = 'old' + i;
      pages[id] = { id, type: 'page', parent: null, order: i, title: 'Old ' + i, blocks: [{ id: 'b' + i, type: 'p', text: 'original ' + i }],
        history: [{ t: 1000 + i, title: 'Old ' + i, blocks: [{ id: 'b' + i, type: 'p', text: 'first version ' + i }] }, { t: 2000 + i, title: 'Old ' + i, blocks: [{ id: 'b' + i, type: 'p', text: 'second version ' + i }] }],
        comments: [], favorite: false, trashed: false, created: 1, updated: 2 };
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(main, JSON.stringify({ v: 1, pages, settings: { theme: 'auto', sidebar: true, name: 'Old WS' }, current: 'old0' }));
    try { fs.unlinkSync(hist); } catch (_) {}
    console.log('wrote an old-format workspace');
    // the app already loaded its own default workspace on start; quit without saving over the file just written
    await t.eval('BP.corrupted = true');
    console.log('\nALL CHECKS PASSED');
    return;
  }

  if (phase === 'a') {
    check('old workspace loaded', await J(`BP.page('old0') && BP.page('old0').title`) === 'Old 0');
    check('inline history from the old file is in memory', await J(`BP.page('old3').history.length`) === 2);
    // an edit through BP.touch (the fast path)
    await t.eval(`(()=>{ const p=BP.page('old1'); p.blocks[0].text='edited through touch'; BP.touch(p); })()`);
    await t.eval('BP.flush()');
    const m1 = JSON.parse(fs.readFileSync(main, 'utf8'));
    check('main file no longer carries history', !Object.values(m1.pages).some((p) => p.history && p.history.length));
    check('history file was written', fs.existsSync(hist));
    const h1 = JSON.parse(fs.readFileSync(hist, 'utf8'));
    check('history file holds the old versions', h1.old3 && h1.old3.length === 2 && h1.old3[0].blocks[0].text === 'first version 3');
    check('the touched edit is saved', m1.pages.old1.blocks[0].text === 'edited through touch');
    // a change that skips BP.touch, saved alongside an edit to another page: the fast save leaves it out, the check a few seconds later must pick it up
    await t.eval(`(()=>{ BP.page('old2').blocks[0].text='changed without touch'; const p=BP.page('old4'); p.blocks[0].text='touched'; BP.touch(p); })()`);
    await t.eval('BP.flush()');
    await t.wait(9000);
    const m2 = JSON.parse(fs.readFileSync(main, 'utf8'));
    check('a change that skipped BP.touch reaches the file within seconds', m2.pages.old2.blocks[0].text === 'changed without touch');
    check('the touched page is saved too', m2.pages.old4.blocks[0].text === 'touched');
    // typing keeps the newest version following the page, and history dialog sees it
    await t.eval(`(()=>{ const p=BP.page('old0'); p.history.push({ t: Date.now(), title: p.title, blocks: JSON.parse(JSON.stringify(p.blocks)) }); BP.save(); })()`);
    await t.eval(`(()=>{ const p=BP.page('old0'); p.blocks[0].text='typed into the newest version'; BP.touch(p); })()`);
    await t.eval('BP.flush({ full: true })');
    const h2 = JSON.parse(fs.readFileSync(hist, 'utf8'));
    const last = h2.old0[h2.old0.length - 1];
    check('the newest history version follows the page', last && last.blocks[0].text === 'typed into the newest version', last && last.blocks[0].text);
    // a change arriving from another device (shared folder) has no history in its file: ours must stay
    await J(`(()=>{ const ext = JSON.parse(JSON.stringify(BP.state)); delete ext.share; const q = ext.pages.old3; q.blocks[0].text = 'from another device'; q.updated = Date.now() + 1000; delete q.history; return BP.mergeExternal(JSON.stringify(ext)).changed; })()`);
    check('external merge applied', await J(`BP.page('old3').blocks[0].text`) === 'from another device');
    check('external merge kept our history', await J(`BP.page('old3').history.length`) === 2);
    // export backup still contains history
    check('page history dialog data intact', await J(`BP.page('old3').history[1].blocks[0].text`) === 'second version 3');
    await t.eval('BP.flush({ full: true })');
    await t.wait(400);
  }

  if (phase === 'b') {
    check('restart: touched edit kept', await J(`BP.page('old1').blocks[0].text`) === 'edited through touch');
    check('restart: change without touch kept', await J(`BP.page('old2').blocks[0].text`) === 'changed without touch');
    check('restart: external change kept', await J(`BP.page('old3').blocks[0].text`) === 'from another device');
    check('restart: old history versions back in memory', await J(`BP.page('old3').history.map(v=>v.blocks[0].text).join('|')`) === 'first version 3|second version 3');
    check('restart: newest version kept', await J(`BP.page('old0').history[BP.page('old0').history.length-1].blocks[0].text`) === 'typed into the newest version');
    check('restart: every page present', await J(`['old0','old1','old2','old3','old4'].every(id=>!!BP.page(id))`));
    const m = JSON.parse(fs.readFileSync(main, 'utf8'));
    check('restart: main file stays without history', !Object.values(m.pages).some((p) => p.history && p.history.length));
  }

  console.log(fails ? '\nFAIL ' + fails + ' check(s)' : '\nALL CHECKS PASSED');
  if (fails) throw new Error('smoke32 failed');
};

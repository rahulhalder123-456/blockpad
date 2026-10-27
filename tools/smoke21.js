/* sharing test, process B = an editor who joins with the edit link right away */
module.exports = async (t) => {
  const c = require('./p2p-common')(t, 'editor');
  const { J, check, signal, waitSignal, waitUntil, finish } = c;
  const links = await waitSignal('links');
  const R = links.root;
  const sp = await J(`BP.share.join(BP.share.parseLink(${JSON.stringify(links.edit)})).then(s=>({role:s.role,root:s.root}))`);
  check('joined with the edit link as an editor', sp.role === 'editor');
  check('the shared page appears and fills with content', await waitUntil(`BP.page('${R}') && BP.page('${R}').blocks.length>=3 && BP.allPages().some(p=>p.parent==='${R}'&&p.title==='Sub page')`));
  check('title and icon arrived', await waitUntil(`BP.page('${R}').title==='Team plan' && BP.page('${R}').icon==='🧭'`, 8000), JSON.stringify(await J(`({title:BP.page('${R}').title, icon:BP.page('${R}').icon, keys:Object.keys(BP.page('${R}')).join(',')})`)));
  await t.eval(`BP.open('${R}'); 0`); await t.wait(500);
  check('page is editable (not read-only)', await J(`!document.querySelector('.editor.readonly') && !!document.querySelector('.editor')`));
  check('top bar shows the shared space', await J(`!!document.querySelector('.who-bar')`));
  const STATE = `(()=>{ const p=BP.page('${R}'); const sub=BP.allPages().find(x=>x.parent==='${R}'&&!x.rowOf); return { title:p.title, root:p.blocks.map(b=>b.type+':'+(BP.textOf(b.text||'')||b.ref||'')), subTitle: sub&&sub.title, sub: sub? sub.blocks.map(b=>BP.textOf(b.text)) : null }; })()`;
  signal('B.joined');
  // edit through the real editor so the normal editing path is exercised
  await t.eval(`(()=>{ const e=BP.currentEditor; e.mutate(()=>{ e.page.blocks.push(BP.newBlock('p','B was here')); }); 0; })()`);
  check('owner edit arrives', await waitUntil(`BP.page('${R}').blocks.some(b=>BP.textOf(b.text)==='hello (edited by owner)')`));
  signal('B.sawA');
  check('block inserted by the owner lands in the right place', await waitUntil(`(()=>{ const t=BP.page('${R}').blocks.map(b=>BP.textOf(b.text||'')); return t[1]==='inserted at 2nd' && t[2]==='hello (edited by owner)'; })()`));
  signal('B.sawOrder');
  check('block deleted by the owner disappears', await waitUntil(`!BP.page('${R}').blocks.some(b=>BP.textOf(b.text)==='second')`));
  signal('B.sawDelete');
  check('sub-page edits and title arrive', await waitUntil(`(()=>{ const sub=BP.allPages().find(x=>x.parent==='${R}'&&!x.rowOf); return sub && sub.title==='Sub page v2' && BP.textOf(sub.blocks[0].text)==='sub changed'; })()`));
  signal('B.sawSub');
  await t.wait(2500);
  signal('state.B', await J(STATE));
  await waitSignal('A.done', 90000);
  check('no console errors', t.logs.length === 0, t.logs.join(' | ').slice(0, 300));
  finish();
};

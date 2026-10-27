/* sharing test, process A = the owner who starts sharing */
module.exports = async (t) => {
  const c = require('./p2p-common')(t, 'owner');
  const { J, check, signal, waitSignal, waitUntil, finish } = c;
  const R = `BP.state.__R`;
  const STATE = `(()=>{ const p=BP.page(${R}); const sub=BP.allPages().find(x=>x.parent===${R}&&!x.rowOf); return { title:p.title, root:p.blocks.map(b=>b.type+':'+(BP.textOf(b.text||'')||b.ref||'')), subTitle: sub&&sub.title, sub: sub? sub.blocks.map(b=>BP.textOf(b.text)) : null }; })()`;
  await t.eval(`(()=>{ const p=BP.createPage(null,{title:'Team plan',icon:'🧭'}); p.blocks=[BP.newBlock('h2','Plan'),BP.newBlock('p','hello'),BP.newBlock('p','second')]; const sub=BP.createPage(p.id,{title:'Sub page'}); sub.blocks=[BP.newBlock('p','sub content')]; BP.state.__R=p.id; BP.open(p.id); 0; })()`);
  check('sharing is available in the app', await J(`BP.share.available()`));
  const info = await J(`BP.share.start(${R}).then(sp=>({id:sp.id,edit:BP.share.link(sp,true),view:BP.share.link(sp,false),root:sp.root,role:sp.role}))`);
  check('owner role and blockpad:// links', info.role === 'owner' && info.edit.startsWith('blockpad://join?d=') && info.view.startsWith('blockpad://join?d='));
  const dec = (u) => JSON.parse(Buffer.from(u.split('d=')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  check('edit link carries the write key, view link does not', !!dec(info.edit).k && !dec(info.view).k && dec(info.view).p === dec(info.edit).p);
  signal('links', info);

  await waitSignal('B.joined');
  check('edit from the editor arrives (new block)', await waitUntil(`BP.page(${R}).blocks.some(b=>BP.textOf(b.text)==='B was here')`));
  await t.eval(`(()=>{ const p=BP.page(${R}); p.blocks[1].text='hello (edited by owner)'; BP.touch(p); 0; })()`);
  await waitSignal('B.sawA');
  await t.eval(`(()=>{ const p=BP.page(${R}); p.blocks.splice(1,0,BP.newBlock('p','inserted at 2nd')); BP.touch(p); 0; })()`);
  await waitSignal('B.sawOrder');
  await t.eval(`(()=>{ const p=BP.page(${R}); p.blocks=p.blocks.filter(b=>BP.textOf(b.text)!=='second'); BP.touch(p); 0; })()`);
  await waitSignal('B.sawDelete');
  await t.eval(`(()=>{ const sub=BP.allPages().find(x=>x.parent===${R}&&!x.rowOf); sub.blocks[0].text='sub changed'; sub.title='Sub page v2'; BP.touch(sub); 0; })()`);
  await waitSignal('B.sawSub');
  signal('A.phase1done');

  await waitSignal('C.joined');
  await waitSignal('C.forged');
  await t.wait(1500);
  const me = await J(STATE);
  console.log('   owner state:', JSON.stringify(me));
  check('forged / unsigned / viewer edits were rejected', !me.root.some((x) => /HACKED|LOCAL VIEWER/.test(x)) && me.root.includes('p:hello (edited by owner)'));
  signal('state.A', me);
  const sb = await waitSignal('state.B'), sc = await waitSignal('state.C');
  check('owner, editor and late-joining viewer all converge to the same pages', JSON.stringify(sb) === JSON.stringify(me) && JSON.stringify(sc) === JSON.stringify(me), 'B==A ' + (JSON.stringify(sb) === JSON.stringify(me)) + ', C==A ' + (JSON.stringify(sc) === JSON.stringify(me)));
  check('expected final content', JSON.stringify(me.root.filter((x) => !x.startsWith('page:'))) === JSON.stringify(['h2:Plan', 'p:inserted at 2nd', 'p:hello (edited by owner)', 'p:B was here']) && me.sub[0] === 'sub changed' && me.subTitle === 'Sub page v2' && me.title === 'Team plan');
  await waitUntil(`BP.share.spaces().every(s=>BP.share.peerCount(s)>=2 && BP.share.online(s).length>=2)`, 40000);
  const st = await J(`BP.share.spaces().map(s=>({peers:BP.share.peerCount(s), online: BP.share.online(s).length}))[0]`);
  check('owner sees both other people connected', st.peers >= 2 && st.online >= 2, JSON.stringify(st));
  signal('A.done');
  await t.wait(1500);
  check('no console errors', t.logs.length === 0, t.logs.join(' | ').slice(0, 300));
  finish();
};

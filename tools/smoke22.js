/* sharing test, process C = a viewer who joins late with the view-only link and tries to cheat */
module.exports = async (t) => {
  const c = require('./p2p-common')(t, 'viewer');
  const { J, check, signal, waitSignal, waitUntil, finish } = c;
  const links = await waitSignal('links');
  await waitSignal('A.phase1done');
  const R = links.root;
  const sp = await J(`BP.share.join(BP.share.parseLink(${JSON.stringify(links.view)})).then(s=>({role:s.role,id:s.id,hasKey:!!s.writeSec}))`);
  check('joined with the view link as a viewer without a write key', sp.role === 'viewer' && !sp.hasKey);
  check('late joiner receives the full current state (incl. deletions and sub-page)', await waitUntil(`(()=>{ const p=BP.page('${R}'); const sub=BP.allPages().find(x=>x.parent==='${R}'&&!x.rowOf); return p && p.blocks.length>=4 && sub && BP.textOf(sub.blocks[0].text)==='sub changed' && !p.blocks.some(b=>BP.textOf(b.text)==='second'); })()`));
  await t.eval(`BP.open('${R}'); 0`); await t.wait(600);
  check('page is read-only for a viewer', await J(`!!document.querySelector('.editor.readonly') && !!document.querySelector('.pagewrap.viewer')`));
  check('top bar says view only', await J(`(document.querySelector('.who-bar .who-t')||{}).textContent==='View only'`));
  const STATE = `(()=>{ const p=BP.page('${R}'); const sub=BP.allPages().find(x=>x.parent==='${R}'&&!x.rowOf); return { title:p.title, root:p.blocks.map(b=>b.type+':'+(BP.textOf(b.text||'')||b.ref||'')), subTitle: sub&&sub.title, sub: sub? sub.blocks.map(b=>BP.textOf(b.text)) : null }; })()`;
  signal('state.C', await J(STATE));
  signal('C.joined');
  // cheating attempts
  const bid = await J(`BP.page('${R}').blocks.find(b=>BP.textOf(b.text)==='hello (edited by owner)').id`);
  await J(`(()=>{
    const hex=(u)=>Array.from(u,(b)=>b.toString(16).padStart(2,'0')).join('');
    const payload=JSON.stringify({id:'${bid}',type:'p',text:'HACKED'});
    const forged=[{k:'b:${R}:${bid}',t:[999999,'evil'],pos:2048,n:'Mallory',v:payload,sig:hex(nacl.randomBytes(64))}];
    const kp=nacl.sign.keyPair();
    forged.push({k:'b:${R}:${bid}',t:[999999,'evil'],pos:2048,n:'Mallory',v:payload,sig:hex(nacl.sign.detached(nacl.hash(new TextEncoder().encode('x')),kp.secretKey))});
    window.bp.p2p.send('all', JSON.stringify({t:'ops',s:'${sp.id}',ops:forged}));
    const p=BP.page('${R}'); p.blocks[1].text='LOCAL VIEWER EDIT'; BP.touch(p);
    BP.share.pushNow(); return 0; })()`);
  await t.wait(1500);
  signal('C.forged');
  check('viewer local edit stays local (nothing signed or sent)', await J(`BP.page('${R}').blocks.some(b=>BP.textOf(b.text)==='LOCAL VIEWER EDIT')`));
  await waitSignal('A.done', 90000);
  check('no console errors', t.logs.length === 0, t.logs.join(' | ').slice(0, 300));
  finish();
};

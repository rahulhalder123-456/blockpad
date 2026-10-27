/* sharing test 2, process B (Bea) */
module.exports = async (t) => {
  const c = require('./p2p-common')(t, 'bea');
  const { J, check, signal, waitSignal, waitUntil, finish } = c;
  const links = await waitSignal('links');
  const R = links.root;
  const TEXTS = `BP.page('${R}').blocks.map(b=>BP.textOf(b.text||''))`;
  await t.eval(`BP.state.settings.userName='Bea'; 0`);
  await J(`BP.share.join(BP.share.parseLink(${JSON.stringify(links.edit)})).then(s=>s.role)`);
  check('content arrived', await waitUntil(`BP.page('${R}') && BP.page('${R}').blocks.length===4`));
  await t.eval(`BP.open('${R}'); 0`); await t.wait(500);
  signal('B.joined');

  // 1. simultaneous edits
  signal('B.ready1');
  await waitSignal('go1');
  await t.eval(`(()=>{ const p=BP.page('${R}'); p.blocks[3].text='delta by B'; p.blocks[1].text='beta by B'; BP.touch(p); 0; })()`);
  await t.wait(4500);
  signal('state.B1', await J(TEXTS));

  // 2. focus a block (A should see a tag)
  const gid = await J(`BP.page('${R}').blocks[2].id`);
  await t.eval(`(()=>{ const e=BP.currentEditor; BP.editorHelpers.setCaret(e.txtOf('${gid}'), 2); 0; })()`);
  await t.wait(1200);
  signal('B.focused', gid);

  // 3. type in the middle of "gamma", then a remote edit to another block arrives
  await t.eval(`document.execCommand('insertText', false, 'XY'); 0`);
  await t.wait(700);
  check('typed text landed in the block', (await J(TEXTS))[2] === 'gaXYmma');
  signal('B.typed');
  check('remote edit from A arrived while B was typing', await waitUntil(`(${TEXTS})[0]==='alpha 2 by A'`, 15000));
  await t.wait(500);
  const cur = await J(`(()=>{ const a=document.activeElement; const blk=a&&a.closest&&a.closest('.block'); let off=null; const s=getSelection(); if(a&&s.rangeCount&&a.contains(s.getRangeAt(0).startContainer)){ const r=document.createRange(); r.selectNodeContents(a); r.setEnd(s.getRangeAt(0).startContainer,s.getRangeAt(0).startOffset); off=r.toString().length; } return {focusedBlock: blk&&blk.dataset.id, off, text: a&&a.textContent}; })()`);
  console.log('   caret after remote update:', JSON.stringify(cur));
  check('cursor stayed in the same block after the remote update', cur.focusedBlock === gid);
  check('cursor stayed at the same position (after "gaXY")', cur.off === 4, 'offset ' + cur.off);
  await t.eval(`document.execCommand('insertText', false, 'Z'); 0`);
  await t.wait(700);
  check('typing continues normally after the update', (await J(TEXTS))[2] === 'gaXYZmma');
  signal('B.cursorChecked');
  await waitSignal('A.sawZ');

  // 4. offline edit, then reconnect
  await J(`window.bp.p2p.stop()`);
  check('going offline drops the peer connections', await waitUntil(`BP.share.spaces().every(s=>BP.share.peerCount(s)===0)`, 10000));
  signal('B.offline');
  await t.eval(`(()=>{ const p=BP.page('${R}'); p.blocks[0].text='alpha offline B'; BP.touch(p); 0; })()`);
  await waitSignal('A.offlineEdit');
  await t.eval(`BP.share.reconnect(); 0`);
  signal('B.reconnected');
  check('A edit made during the offline period arrives after reconnecting', await waitUntil(`(${TEXTS})[3]==='delta offline A'`, 30000));
  await t.wait(2000);
  signal('state.B2', await J(TEXTS));
  await waitSignal('A.done', 90000);
  check('no console errors', t.logs.length === 0, t.logs.join(' | ').slice(0, 300));
  finish();
};

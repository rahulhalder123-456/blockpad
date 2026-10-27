/* sharing test 2, process A (Alex): simultaneous edits, who-is-editing marks, cursor safety, offline catch-up */
module.exports = async (t) => {
  const c = require('./p2p-common')(t, 'alex');
  const { J, check, signal, waitSignal, waitUntil, finish } = c;
  const R = `BP.state.__R`;
  const TEXTS = `BP.page(${R}).blocks.map(b=>BP.textOf(b.text||''))`;
  await t.eval(`BP.state.settings.userName='Alex'; (()=>{ const p=BP.createPage(null,{title:'Concurrency'}); p.blocks=[BP.newBlock('p','alpha'),BP.newBlock('p','beta'),BP.newBlock('p','gamma'),BP.newBlock('p','delta')]; BP.state.__R=p.id; BP.open(p.id); 0; })()`);
  const info = await J(`BP.share.start(${R}).then(sp=>({edit:BP.share.link(sp,true),root:sp.root}))`);
  signal('links', info);
  await t.wait(600);
  await waitSignal('B.joined');

  // 1. simultaneous edits to different blocks both survive; a same-block conflict converges to one value on both sides
  await waitSignal('B.ready1');
  signal('go1');
  await t.eval(`(()=>{ const p=BP.page(${R}); p.blocks[0].text='alpha by A'; p.blocks[1].text='beta by A'; BP.touch(p); 0; })()`);
  await t.wait(4500);
  const a1 = await J(TEXTS);
  signal('state.A1', a1);
  const b1 = await waitSignal('state.B1');
  console.log('   after simultaneous edits  A:', JSON.stringify(a1), ' B:', JSON.stringify(b1));
  check('both people see identical text after simultaneous edits', JSON.stringify(a1) === JSON.stringify(b1));
  check('edits to different blocks are both kept', a1[0] === 'alpha by A' && a1[3] === 'delta by B');
  check('same-block conflict resolved to one of the two edits', a1[1] === 'beta by A' || a1[1] === 'beta by B', a1[1]);

  // 2. who is editing marks
  const gid = await waitSignal('B.focused');
  check('a coloured name tag marks the block the other person is editing', await waitUntil(`!!document.querySelector('.block.has-who[data-who="Bea"]')`, 15000));
  check('top bar shows the other person', await J(`document.querySelectorAll('.who-bar .who-av').length>=1 && /online/.test(document.querySelector('.who-bar .who-t').textContent)`));

  // 3. typing safety: A edits another block while B has the caret in the middle of a word
  await waitSignal('B.typed');
  await t.eval(`(()=>{ const p=BP.page(${R}); p.blocks[0].text='alpha 2 by A'; BP.touch(p); 0; })()`);
  signal('A.edited2');
  await waitSignal('B.cursorChecked');
  check('text B typed (with the remote edit arriving meanwhile) reached A', await waitUntil(`(${TEXTS})[2]==='gaXYZmma'`, 15000));
  signal('A.sawZ');

  // 4. offline catch-up
  await waitSignal('B.offline');
  await t.eval(`(()=>{ const p=BP.page(${R}); p.blocks[3].text='delta offline A'; BP.touch(p); 0; })()`);
  signal('A.offlineEdit');
  await waitSignal('B.reconnected');
  check('B (back online) receives what A wrote while B was offline', await waitUntil(`(${TEXTS})[3]==='delta offline A'`, 30000));
  check('A receives what B wrote while offline', await waitUntil(`(${TEXTS})[0]==='alpha offline B'`, 30000));
  await t.wait(1500);
  const a2 = await J(TEXTS);
  signal('state.A2', a2);
  const b2 = await waitSignal('state.B2');
  check('final text identical on both sides', JSON.stringify(a2) === JSON.stringify(b2), JSON.stringify(a2));
  signal('A.done');
  await t.wait(1000);
  check('no console errors', t.logs.length === 0, t.logs.join(' | ').slice(0, 300));
  finish();
};

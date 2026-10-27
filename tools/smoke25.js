/* a blockpad:// link handed to the app by the OS opens the Join dialog; joining creates the page; UI screenshots for review */
const path = require('path');
module.exports = async (t) => {
  const J = async (code) => JSON.parse(await t.eval(`Promise.resolve(${code}).then((v) => JSON.stringify(v === undefined ? null : v))`));
  let fails = 0; const check = (l, c, x) => { console.log((c ? 'PASS ' : 'FAIL ') + l + (x ? '  ' + x : '')); if (!c) fails++; };
  const out = process.env.BP_SMOKE_OUT; require('fs').mkdirSync(out, { recursive: true });
  await t.wait(1200);
  check('the Join dialog opened by itself from the OS link', await J(`!!document.querySelector('.modal.join')`));
  check('it names the shared page and the access level', await J(`/My Team Doc/.test(document.querySelector('.join-card').textContent) && /View only/.test(document.querySelector('.join-card').textContent)`));
  check('the Join button is enabled', await J(`!document.querySelector('.modal.join .btn.primary').disabled`));
  await t.shot(path.join(out, 'join-dialog.png'));
  await t.eval(`document.querySelector('.modal.join .btn.primary').click(); 0`);
  await t.wait(1500);
  check('joining created the page in the workspace as a viewer', await J(`(()=>{ const sp=BP.share.spaces()[0]; return !!sp && sp.role==='viewer' && !!BP.page(sp.root) && BP.page(sp.root).title==='My Team Doc' && BP.state.current===sp.root; })()`));
  check('the page opened read-only', await J(`!!document.querySelector('.editor.readonly')`));
  await t.shot(path.join(out, 'viewer-page.png'));
  // a bad link is rejected with a message, not a crash
  await t.eval(`BP.joinDialog('blockpad://join?d=AAAA'); 0`); await t.wait(400);
  check('a damaged link is refused with a message', await J(`/damaged|not a Blockpad/.test((document.querySelector('.join-err')||{}).textContent||'') && document.querySelector('.modal.join .btn.primary').disabled`));
  await t.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); 0`); await t.wait(200);
  // owner side screenshots: Share dialog (before / after starting), people tab, settings tab
  await t.eval(`(()=>{ const p=BP.createPage(null,{title:'Roadmap',icon:'🧭'}); p.blocks=[BP.newBlock('h2','Q3 goals'),BP.newBlock('p','Ship sharing')]; BP.open(p.id); BP.state.__R=p.id; 0; })()`);
  await t.wait(400);
  await t.eval(`BP.shareDialog(BP.page(BP.state.__R)); 0`); await t.wait(400);
  await t.shot(path.join(out, 'share-before.png'));
  await t.eval(`[...document.querySelectorAll('.share-pane .btn.primary')][0].click(); 0`); await t.wait(1500);
  check('Start sharing shows both links', await J(`document.querySelectorAll('.share-pane .link-in').length===2 && /^blockpad:\\/\\/join\\?d=/.test(document.querySelector('.share-pane .link-in').value)`));
  await t.shot(path.join(out, 'share-links.png'));
  await t.eval(`[...document.querySelectorAll('.set-tabs button')].find(b=>b.textContent==='People').click(); 0`); await t.wait(400);
  await t.shot(path.join(out, 'share-people.png'));
  await t.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); BP.openSettings('sharing'); 0`); await t.wait(500);
  await t.shot(path.join(out, 'settings-sharing.png'));
  check('Settings has a Sharing tab listing both spaces', await J(`document.querySelectorAll('.set-pane .sh-list .ppl-row').length===2`));
  check('a backup does not contain the sharing keys', await J(`!JSON.stringify(Object.assign({}, BP.state, { share: undefined })).includes('writeSec')`));
  console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED');
  if (fails) throw new Error('failed');
};

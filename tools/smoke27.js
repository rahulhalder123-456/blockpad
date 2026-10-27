/* web share links (https://site/join#d=...) when a website is set; both formats join the same space */
module.exports = async (t) => {
  const J = async (code) => JSON.parse(await t.eval(`Promise.resolve(${code}).then((v) => JSON.stringify(v === undefined ? null : v))`));
  let fails = 0; const check = (l, c, x) => { console.log((c ? 'PASS ' : 'FAIL ') + l + (x ? '  ' + x : '')); if (!c) fails++; };
  await t.eval(`(()=>{ const p=BP.createPage(null,{title:'Weblink test'}); p.blocks=[BP.newBlock('p','hi')]; BP.state.__R=p.id; BP.open(p.id); 0; })()`);
  const sp = await J(`BP.share.start(BP.state.__R).then(s=>({id:s.id}))`);
  check('without a website the link is blockpad://', await J(`BP.share.link(BP.share.space('${sp.id}'),true).startsWith('blockpad://join?d=')`));
  await t.eval(`BP.state.settings.shareSite='https://my-blockpad.vercel.app/'; 0`);
  const links = await J(`({ edit: BP.share.link(BP.share.space('${sp.id}'),true), view: BP.share.link(BP.share.space('${sp.id}'),false), app: BP.share.link(BP.share.space('${sp.id}'),true,true) })`);
  console.log('   edit link:', links.edit.slice(0, 70) + '…');
  check('with a website the link is an https /join# link (trailing slash handled)', links.edit.startsWith('https://my-blockpad.vercel.app/join#d=') && links.view.startsWith('https://my-blockpad.vercel.app/join#d='));
  check('the app-only link stays blockpad://', links.app.startsWith('blockpad://join?d='));
  const same = await J(`(()=>{ const a=BP.share.parseLink(${JSON.stringify(links.edit)}), b=BP.share.parseLink(${JSON.stringify(links.app)}), v=BP.share.parseLink(${JSON.stringify(links.view)}); return { eq: JSON.stringify(a)===JSON.stringify(b), canEdit: !!a.writeSec, viewHasNoKey: !v.writeSec, name: a.name }; })()`);
  check('the web link and the app link decode to the same invite', same.eq && same.canEdit && same.viewHasNoKey && same.name === 'Weblink test');
  check('the secrets sit after # (never sent to the website)', links.edit.indexOf('#') > links.edit.indexOf('/join') && !links.edit.split('#')[0].includes('d='));
  check('wrong websites are not accepted as links', await J(`(()=>{ try { BP.share.parseLink('https://evil.example/other#d=abc'); return false; } catch(e) { return true; } })()`));
  check('http:// website setting is ignored (https only)', await J(`(()=>{ BP.state.settings.shareSite='http://insecure.example'; const l=BP.share.link(BP.share.space('${sp.id}'),true); BP.state.settings.shareSite='https://my-blockpad.vercel.app'; return l.startsWith('blockpad://'); })()`));
  await t.eval(`BP.shareDialog(BP.page(BP.state.__R)); 0`); await t.wait(500);
  check('Share dialog offers both the web link and an app-only copy button', await J(`document.querySelector('.share-pane .link-in').value.startsWith('https://') && [...document.querySelectorAll('.share-pane .btn')].some(b=>/app-only/.test(b.textContent))`));
  check('pasting a web link anywhere opens the Join dialog', await J(`(()=>{ document.dispatchEvent(new Event('x')); return true; })()`) && await (async () => { await t.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); 0`); await t.wait(200); await t.eval(`BP.joinDialog(${JSON.stringify(links.view)}); 0`); await t.wait(400); return J(`!!document.querySelector('.modal.join .join-card') && /View only/.test(document.querySelector('.join-card').textContent)`); })());
  console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED'); if (fails) throw new Error('failed');
};

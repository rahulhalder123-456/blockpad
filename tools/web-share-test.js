/* End-to-end test of sharing between two separate browser sessions (like two phones) against a deployed web app:
   A shares the Welcome page, B joins with the link, then an edit made by A must show up in B.
   usage: node_modules\electron\dist\electron.exe tools\web-share-test.js https://blockpad-umber.vercel.app/app/
   (needs internet; ELECTRON_RUN_AS_NODE must be unset) */
const { app, BrowserWindow } = require('electron');
const url = process.argv.find((a) => /^(https?|file):/.test(a)) || 'https://blockpad-umber.vercel.app/app/';
const open = (name) => new Promise((resolve) => {
  const w = new BrowserWindow({ show: false, width: 420, height: 800, webPreferences: { partition: 'web-' + name + Date.now() } });
  w.webContents.on('console-message', (_e, _l, msg) => { if (/rtc|webrtc|CSP|Content Security/i.test(msg)) console.log('[' + name + ' console]', msg.slice(0, 200)); });
  w.loadURL(url).then(() => setTimeout(() => resolve(w), 4000));
});
const ev = (w, code) => w.webContents.executeJavaScript(code);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const fail = (m) => { console.log('FAIL ' + m); console.log('WEB SHARE TEST FAILED'); app.exit(1); };
  const A = await open('A'); const B = await open('B');
  await ev(A, 'window.__rep = ' + (+process.env.REP || 0));
  await ev(B, 'BP.rtc.__delayOpenMs = ' + (+process.env.DELAY || 0));
  const avail = await Promise.all([A, B].map((w) => ev(w, 'BP.share.available()')));
  console.log('sharing available (A, B):', avail.join(', '));
  if (!avail.every(Boolean)) return fail('sharing not available in the web app');

  const link = await ev(A, `(async () => { const p = BP.allPages().find((x) => /welcome/i.test(x.title)) || BP.allPages()[0]; const base = p.blocks.slice(); const rep = +(window.__rep || 0); for (let k = 0; k < rep; k++) base.forEach((b, i) => { const c = JSON.parse(JSON.stringify(b)); c.id = 'x' + k + '_' + i + '_' + Math.random().toString(36).slice(2, 7); p.blocks.push(c); }); window.__n = p.blocks.length; const sp = await BP.share.start(p.id); window.__pid = p.id; return BP.share.link(sp, ${process.env.VIEW ? 'false' : 'true'}, true); })()`);
  console.log('link created:', link.slice(0, 40) + '…');
  await ev(B, `(async () => { const info = BP.share.parseLink(${JSON.stringify(link)}); window.__root = info.root; await BP.share.join(info); })()`);

  let got = null;
  for (let i = 0; i < 90 && !got; i++) { await wait(1000); got = await ev(B, `(() => { const p = BP.page(window.__root); return p && p.title ? p.title : null; })()`); }
  console.log('B received page title:', got);
  if (!got) return fail('B never received the shared page');

  let nb = 0; for (let i = 0; i < 90 && !nb; i++) { await wait(1000); nb = await ev(B, `(BP.page(window.__root).blocks || []).length`); }
  await wait(5000); nb = await ev(B, `(BP.page(window.__root).blocks || []).length`);
  const na = await ev(A, 'window.__n');
  console.log('blocks A/B:', na, nb);
  if (nb < na) return fail('blocks missing on B');
  const marker = 'Edited by A ' + Date.now();
  await ev(A, `(() => { BP.page(window.__pid).title = ${JSON.stringify(marker)}; BP.save(); BP.share.pushNow(); })()`);
  let seen = false;
  for (let i = 0; i < 60 && !seen; i++) { await wait(1000); seen = await ev(B, `(BP.page(window.__root) || {}).title === ${JSON.stringify(marker)}`); }
  console.log('B saw A\'s edit:', seen);
  if (!seen) return fail('edit did not reach B');
  // leave, trash the copy, then join the same link again (the page is still in Trash)
  const again = await ev(B, `(async () => { const info = BP.share.parseLink(${JSON.stringify(link)}); await BP.share.leave(info.id); BP.trash(info.root); try { await BP.share.join(info); } catch (e) { return 'ERR ' + e.message; } const p = BP.page(info.root); return p && !p.trashed && p.sharedRoot === info.id ? 'ok' : 'bad state'; })()`);
  console.log('rejoin after trash:', again);
  if (again !== 'ok') return fail('could not rejoin after trashing');
  console.log('WEB SHARE TEST PASSED');
  app.exit(0);
});

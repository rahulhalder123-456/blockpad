/* What someone sees when the owner of a shared page is gone, between separate browser sessions (like phones):
     1. A shares a page, then stops sharing before B opens the link: B must not spin forever; after ~15 s it says nobody is online
     2. A shares again, B joins and gets the content, then A stops sharing: B is told (banner), and C, who opens the old link
        while only B is online, learns it too
   usage: node_modules\electron\dist\electron.exe tools\web-share-stop-test.js [web app url]   (needs internet; ELECTRON_RUN_AS_NODE unset) */
const { app, BrowserWindow } = require('electron');
const url = process.argv.find((a) => /^(https?|file):/.test(a)) || 'https://blockpad-umber.vercel.app/app/';
const open = (name) => new Promise((resolve) => {
  const w = new BrowserWindow({ show: false, width: 420, height: 800, webPreferences: { partition: 'web-' + name + Date.now() } });
  w.webContents.on('console-message', (_e, l, msg) => { if (l >= 3) console.log('[' + name + ' error]', msg.slice(0, 200)); });
  w.loadURL(url).then(() => setTimeout(() => resolve(w), 4000));
});
const ev = (w, code) => w.webContents.executeJavaScript(code);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (w, code, secs) => { for (let i = 0; i < secs; i++) { const v = await ev(w, code); if (v) return v; await wait(1000); } return ev(w, code); };

app.whenReady().then(async () => {
  let fails = 0;
  const check = (label, ok, extra) => { console.log((ok ? 'PASS ' : 'FAIL ') + label + (extra != null ? '  ' + extra : '')); if (!ok) fails++; };
  const A = await open('A'), B = await open('B');
  const share = (w) => ev(w, `(async () => { const p = BP.createPage(null, { title: 'Stop test ' + Date.now(), blocks: [{ id: 'b1', type: 'p', text: 'shared text' }] }); const sp = await BP.share.start(p.id); return BP.share.link(sp, false, true); })()`);
  const join = (w, link) => ev(w, `(async () => { const info = BP.share.parseLink(${JSON.stringify(link)}); window.__root = info.root; await BP.share.join(info); BP.open(info.root); return info.id; })()`);
  const stop = (w) => ev(w, `(async () => { const sp = BP.share.spaces().find((s) => s.role === 'owner'); await BP.share.leave(sp.id); })()`);
  const stateOf = (w) => ev(w, `(() => { const el = document.querySelector('.sh-loading'); return el ? el.dataset.state : 'none'; })()`);

  // 1) the owner is already gone
  const link1 = await share(A);
  await stop(A);
  await join(B, link1);
  const first = await stateOf(B);
  check('right after opening the link: a loading animation', first === 'waiting', first);
  const t0 = Date.now();
  const later = await until(B, `(() => { const el = document.querySelector('.sh-loading'); return el && el.dataset.state === 'offline' ? 'offline' : ''; })()`, 30);
  check('the animation stops and explains (nobody online)', later === 'offline', ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  check('Try again and Remove buttons shown', await ev(B, `[...document.querySelectorAll('.sh-loading .btn')].map((b) => b.textContent).join('|')`) === 'Try again|Remove this page');
  await ev(B, `[...document.querySelectorAll('.sh-loading .btn')].find((b) => /Remove/.test(b.textContent)).click()`);
  await wait(800);
  check('Remove this page removes the empty stub', await ev(B, `!BP.page(window.__root) && !document.querySelector('.sh-loading')`));

  // 2) the owner stops while others are online
  const link2 = await share(A);
  await join(B, link2);
  const got = await until(B, `(BP.page(window.__root) && BP.page(window.__root).blocks || []).length`, 90);
  check('B received the content', got > 0, got);
  check('B shows no loading box once content is in', (await stateOf(B)) === 'none');
  await stop(A);
  const ended = await until(B, `(() => { const sp = BP.share.spaces()[0]; return !!(sp && sp.ended); })()`, 20);
  check('B is told the owner stopped sharing', ended);
  check('B sees the banner', await until(B, `[...document.querySelectorAll('.banner')].some((b) => /stopped sharing/.test(b.textContent))`, 5));
  const C = await open('C');
  await join(C, link2);
  const cEnded = await until(C, `(() => { const sp = BP.share.spaces()[0]; return !!(sp && sp.ended); })()`, 90);
  check('C, joining later, learns it from B', cEnded);
  check('C still got the content B had', await ev(C, `(BP.page(window.__root).blocks || []).length > 0`));
  await ev(B, `[...document.querySelectorAll('.banner .btn')].find((b) => b.textContent === 'OK').click()`);
  await wait(800);
  check('OK on the banner keeps the page as a normal copy', await ev(B, `!!BP.page(window.__root) && !BP.page(window.__root).sharedRoot && !BP.share.spaces().length`));

  console.log(fails ? '\nSHARE STOP TEST FAILED (' + fails + ')' : '\nSHARE STOP TEST PASSED');
  app.exit(fails ? 1 : 0);
});

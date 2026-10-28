/* web client for the desktop -> web sharing test: joins the link written by smoke30 in a fresh browser session and checks the blocks arrive */
const { app, BrowserWindow } = require('electron');
const fs = require('fs'); const path = require('path');
const url = process.argv.find((a) => /^https?:/.test(a)) || 'https://blockpad-umber.vercel.app/app/';
const dir = process.env.BP_SYNC_DIR;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const done = (v) => { fs.writeFileSync(path.join(dir, 'done.txt'), v); console.log(v === 'ok' ? 'WEB JOIN TEST PASSED' : 'WEB JOIN TEST FAILED: ' + v); app.exit(v === 'ok' ? 0 : 1); };
  const w = new BrowserWindow({ show: false, webPreferences: { partition: 'wj' + Date.now() } });
  await w.loadURL(url); await wait(4000);
  const ev = (c) => w.webContents.executeJavaScript(c);
  let link = ''; for (let i = 0; i < 120 && !link; i++) { try { link = fs.readFileSync(path.join(dir, 'link.txt'), 'utf8'); } catch (_) { await wait(1000); } }
  if (!link) return done('no link');
  await ev(`(async () => { const info = BP.share.parseLink(${JSON.stringify(link)}); window.__root = info.root; await BP.share.join(info); })()`);
  let n = 0; for (let i = 0; i < 120 && n < 150; i++) { await wait(1000); n = await ev(`(BP.page(window.__root).blocks || []).length`); }
  console.log('web client received blocks:', n);
  done(n >= 150 ? 'ok' : 'only ' + n + ' blocks');
});

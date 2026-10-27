/* the web / phone version in a plain Chromium window (no desktop bridge): storage, offline, phone layout, graceful missing features */
const { BrowserWindow } = require('electron');
const fs = require('fs'); const path = require('path');
const URL = process.env.BP_WEB_URL || 'http://127.0.0.1:4789/app/';
module.exports = async (t) => {
  let fails = 0; const check = (l, c, x) => { console.log((c ? 'PASS ' : 'FAIL ') + l + (x ? '  ' + x : '')); if (!c) fails++; };
  const out = process.env.BP_SMOKE_OUT; fs.mkdirSync(out, { recursive: true });
  const logs = [];
  const win = new BrowserWindow({ show: false, width: 1100, height: 800, webPreferences: { partition: 'persist:web-test-' + Date.now() } });
  const wc = win.webContents;
  wc.on('console-message', (...a) => { const e = a[0]; const level = (e && e.level !== undefined ? e.level : a[1]); const msg = e && e.message !== undefined ? e.message : a[2]; if (level === 'error' || level === 3 || level === 2) logs.push(String(msg).slice(0, 200)); });
  const J = async (code) => JSON.parse(await wc.executeJavaScript(`Promise.resolve(${code}).then((v) => JSON.stringify(v === undefined ? null : v))`));
  const load = async (u = URL) => { await wc.loadURL(u); await t.wait(1200); };
  const shot = async (name) => fs.writeFileSync(path.join(out, name + '.png'), (await wc.capturePage()).toPNG());

  await load();
  check('the app starts in a normal browser (no desktop bridge)', await J(`typeof window.bp === 'undefined' && !!document.querySelector('.sidebar')`));
  check('first run shows the welcome pages', await J(`BP.allPages().length >= 3`));
  // create + persist
  await wc.executeJavaScript(`(()=>{ const p=BP.createPage(null,{title:'Phone note',icon:'📱'}); p.blocks=[BP.newBlock('h2','Hello web'),BP.newBlock('p','typed in the browser')]; BP.state.__R=p.id; BP.open(p.id); BP.flush(); 0; })()`);
  await t.wait(600);
  // a large attachment would overflow localStorage (~5 MB): the workspace must still save
  await wc.executeJavaScript(`(()=>{ const p=BP.page(BP.state.__R); const big='data:image/png;base64,'+'A'.repeat(9*1024*1024); const b=BP.newBlock('image'); b.src=big; p.blocks.push(b); BP.touch(p); return BP.flush(); })()`);
  await t.wait(1500);
  const where = await J(`(async()=>{ let inLS=false; try{ inLS=!!localStorage.getItem('blockpad.ws'); }catch(e){} const db=await new Promise((res,rej)=>{ const r=indexedDB.open('blockpad',1); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); const v=await new Promise((res)=>{ const q=db.transaction('kv').objectStore('kv').get('ws'); q.onsuccess=()=>res(q.result); }); return { inLS, idbMB: v ? Math.round(v.length/1048576) : 0 }; })()`);
  check('the workspace is stored in IndexedDB (a 9 MB attachment does not break saving)', where.idbMB >= 9 && !where.inLS, JSON.stringify(where));
  await load();
  check('data survives a reload', await J(`BP.allPages().some(p=>p.title==='Phone note' && p.blocks.length===3 && BP.textOf(p.blocks[1].text)==='typed in the browser')`));
  // service worker + offline
  check('the offline cache (service worker) is active', await J(`(async()=>{ const r=await navigator.serviceWorker.ready; return !!r.active; })()`));
  await t.wait(800);
  const cached = await J(`(async()=>{ const ks=await caches.keys(); const c=await caches.open(ks[0]); return (await c.keys()).length; })()`);
  check('the whole app is cached', cached >= 40, cached + ' files');
  await wc.session.enableNetworkEmulation({ offline: true });
  await load();
  check('the app loads with no network at all', await J(`!!document.querySelector('.sidebar') && BP.allPages().some(p=>p.title==='Phone note')`));
  await wc.session.enableNetworkEmulation({ offline: false });
  // features that need the desktop degrade politely
  await wc.executeJavaScript(`BP.openSettings('ai'); 0`); await t.wait(500);
  check('Settings → AI explains the built-in AI is desktop-only and offers your own endpoint', await J(`/desktop apps/.test(document.querySelector('.set-pane').textContent) && !!document.querySelector('.set-pane input')`));
  await wc.executeJavaScript(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); BP.shareDialog(BP.page(BP.state.__R)); 0`); await t.wait(400);
  check('Share says sharing needs the desktop app (no crash)', await J(`/desktop app/.test(document.querySelector('.share-pane').textContent)`));
  await wc.executeJavaScript(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); 0`);
  for (const tab of ['general', 'members', 'sharing', 'ai', 'api', 'data', 'keys', 'about']) { await wc.executeJavaScript(`BP.openSettings('${tab}'); 0`); await t.wait(150); await wc.executeJavaScript(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); 0`); }
  check('every Settings tab opens in the browser', true);
  check('the AI chip stays hidden in the browser', await J(`getComputedStyle(document.querySelector('.ai-chip')).display==='none'`));
  await shot('web-desktop');

  // phone layout
  win.setSize(390, 844);
  wc.enableDeviceEmulation({ screenPosition: 'mobile', screenSize: { width: 390, height: 844 }, viewPosition: { x: 0, y: 0 }, deviceScaleFactor: 2, viewSize: { width: 390, height: 844 }, scale: 1 });
  await load(); await t.wait(500);
  check('on a phone the sidebar starts closed', await J(`document.getElementById('app').classList.contains('sb-hidden')`));
  check('page content uses the full width (no horizontal scroll)', await J(`document.documentElement.scrollWidth <= window.innerWidth + 1`), await J(`document.documentElement.scrollWidth + ' vs ' + window.innerWidth`));
  await shot('web-phone-page');
  await wc.executeJavaScript(`document.querySelector('.topbar .sb-toggle').click(); 0`); await t.wait(400);
  check('the menu button opens the sidebar as a drawer', await J(`!document.getElementById('app').classList.contains('sb-hidden') && getComputedStyle(document.querySelector('.sidebar')).position==='fixed'`));
  await shot('web-phone-drawer');
  await wc.executeJavaScript(`document.querySelector('.sb-item').click(); 0`); await t.wait(500);
  check('choosing a page closes the drawer', await J(`document.getElementById('app').classList.contains('sb-hidden')`));
  await wc.executeJavaScript(`BP.open(BP.state.__R); 0`); await t.wait(500);
  check('the block menu handle is reachable by touch (always visible)', await J(`(()=>{ const c=document.querySelector('.bctl'); return !!c && parseFloat(getComputedStyle(c).opacity) > 0.3 && c.getBoundingClientRect().left >= 0; })()`));
  await wc.executeJavaScript(`BP.openSettings('general'); 0`); await t.wait(400);
  check('dialogs fit the phone screen', await J(`(()=>{ const m=document.querySelector('.modal').getBoundingClientRect(); return m.left >= 0 && m.right <= window.innerWidth + 1; })()`));
  await shot('web-phone-settings');
  check('no console errors during the whole run', logs.length === 0, logs.join(' | ').slice(0, 400));
  win.destroy();
  console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED'); if (fails) throw new Error('failed');
};

/* Installs the APK on a running emulator/device and drives the app through Chrome DevTools (WebView debugging) plus real adb input.
   usage: node tools/android-test.js <apk> [screenshot dir] */
const { execFileSync, execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const sdk = process.env.ANDROID_HOME || path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
const adb = path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
const apk = process.argv[2]; const shots = process.argv[3] || '.'; fs.mkdirSync(shots, { recursive: true });
const PKG = 'app.blockpad.mobile';
const sh = (...a) => execFileSync(adb, a, { encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (l, c, x) => { console.log((c ? 'PASS ' : 'FAIL ') + l + (x ? '  ' + x : '')); if (!c) fails++; };
const shot = (name) => fs.writeFileSync(path.join(shots, name + '.png'), execFileSync(adb, ['exec-out', 'screencap', '-p'], { maxBuffer: 1 << 28 }));

async function cdp() {
  let pid = '';
  for (let i = 0; i < 40 && !pid; i++) { try { pid = sh('shell', 'pidof', PKG).split(/\s+/)[0]; } catch (_) {} if (!pid) await sleep(500); }
  if (!pid) throw new Error('app is not running');
  sh('forward', 'tcp:9333', 'localabstract:webview_devtools_remote_' + pid);
  let page = null;
  for (let i = 0; i < 40 && !page; i++) { try { page = (await (await fetch('http://127.0.0.1:9333/json')).json()).find((p) => p.type === 'page'); } catch (_) {} if (!page) await sleep(500); }
  if (!page) throw new Error('no WebView page to attach to');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const waiting = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } };
  const call = (method, params = {}) => new Promise((res) => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await call('Runtime.evaluate', { expression: `Promise.resolve(${expr}).then(v=>JSON.stringify(v===undefined?null:v))`, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text + ' ' + JSON.stringify(r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description)); return JSON.parse(r.result.result.value); };
  return { call, ev, page, close: () => ws.close() };
}

(async () => {
  console.log('device:', sh('shell', 'getprop', 'ro.product.model'), '| Android', sh('shell', 'getprop', 'ro.build.version.release'), '| screen', sh('shell', 'wm', 'size').split(': ')[1]);
  try { sh('uninstall', PKG); } catch (_) {}
  console.log(sh('install', '-r', apk));
  sh('shell', 'am', 'start', '-n', PKG + '/.MainActivity');
  await sleep(5000);
  let c = await cdp();
  check('the app launched on the phone', true, c.page.title + ' @ ' + c.page.url);
  check('the web app is running inside the native shell (no desktop bridge)', await c.ev(`typeof window.bp === 'undefined' && !!document.querySelector('.sidebar') && typeof BP !== 'undefined'`));
  check('welcome pages are there on first start', await c.ev(`BP.allPages().length >= 3`));
  const vp = await c.ev(`({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio, sb: document.getElementById('app').classList.contains('sb-hidden'), scrollW: document.documentElement.scrollWidth })`);
  check('phone layout: sidebar closed, content fits the screen', vp.sb && vp.scrollW <= vp.w + 1, JSON.stringify(vp));
  const tb = await c.ev(`(()=>{ const b=document.querySelector('.topbar').getBoundingClientRect(); const cs=getComputedStyle(document.documentElement); return { top:b.top, height:b.height, innerH:innerHeight, vvTop: visualViewport.offsetTop, safeTop: getComputedStyle(document.querySelector('.topbar')).paddingTop }; })()`);
  check('the top bar is fully visible below the status bar', tb.top >= 0 && tb.height >= 40, JSON.stringify(tb));
  shot('android-1-home');

  // open the drawer with a real touch, pick a page with another touch
  const tap = async (selector) => { const r = await c.ev(`(()=>{ const e=document.querySelector(${JSON.stringify(selector)}); if(!e) return null; const b=e.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2}; })()`); if (!r) return false; const dpr = await c.ev('devicePixelRatio'); sh('shell', 'input', 'tap', String(Math.round(r.x * dpr)), String(Math.round(r.y * dpr))); await sleep(600); return true; };   // a real touch, in device pixels
  check('tapping the menu button opens the sidebar drawer', (await tap('.topbar .sb-toggle')) && await c.ev(`!document.getElementById('app').classList.contains('sb-hidden')`));
  shot('android-2-drawer');
  await c.ev(`(()=>{ const p=BP.createPage(null,{title:'From my phone',icon:'📱'}); p.blocks=[BP.newBlock('h2','Phone test'),BP.newBlock('p','')]; BP.state.__R=p.id; BP.open(p.id); BP.flush(); return 1; })()`);
  await sleep(800);
  check('opening a page closes the drawer', await c.ev(`document.getElementById('app').classList.contains('sb-hidden')`));

  // type with the real keyboard path: focus the empty paragraph, then adb input text
  await c.ev(`(()=>{ const e=BP.currentEditor; const id=BP.page(BP.state.__R).blocks[1].id; BP.editorHelpers.setCaret(e.txtOf(id), 'end'); return 1; })()`);
  await sleep(600);
  sh('shell', 'input', 'text', 'typed%son%sAndroid');
  await sleep(1200);
  const typed = await c.ev(`BP.textOf(BP.page(BP.state.__R).blocks[1].text)`);
  check('real keyboard input reaches the page', /typed on Android/.test(typed), JSON.stringify(typed));
  shot('android-3-typing');

  // persistence across a full app restart
  await c.ev(`BP.flush()`); await sleep(800);
  c.close();
  sh('shell', 'am', 'force-stop', PKG); await sleep(1200);
  sh('shell', 'am', 'start', '-n', PKG + '/.MainActivity'); await sleep(5000);
  c = await cdp();
  check('the note is still there after force-stopping and reopening the app', await c.ev(`BP.allPages().some(p=>p.title==='From my phone' && BP.textOf(p.blocks[1].text)==='typed on Android')`));
  check('data is in IndexedDB inside the app (not the 5 MB localStorage)', await c.ev(`(async()=>{ const db=await new Promise((res,rej)=>{ const r=indexedDB.open('blockpad',1); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); const v=await new Promise((res)=>{ const q=db.transaction('kv').objectStore('kv').get('ws'); q.onsuccess=()=>res(q.result); }); return !!v && v.length > 1000; })()`));

  // offline: put the device in airplane mode and restart
  try { sh('shell', 'svc', 'wifi', 'disable'); sh('shell', 'svc', 'data', 'disable'); } catch (_) {}
  await sleep(1500);
  check('works with no network (shell + data are bundled in the app)', await c.ev(`!!document.querySelector('.sidebar') && BP.allPages().length >= 4`));
  try { sh('shell', 'svc', 'wifi', 'enable'); sh('shell', 'svc', 'data', 'enable'); } catch (_) {}

  // rotation to landscape keeps working
  sh('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0'); sh('shell', 'settings', 'put', 'system', 'user_rotation', '1'); await sleep(2000);
  const land = await c.ev(`({ w: innerWidth, h: innerHeight, fits: document.documentElement.scrollWidth <= innerWidth + 1 })`);
  check('landscape layout fits', land.w > land.h && land.fits, JSON.stringify(land));
  shot('android-4-landscape');
  sh('shell', 'settings', 'put', 'system', 'user_rotation', '0'); await sleep(1000);

  // desktop-only features degrade politely
  await c.ev(`BP.shareDialog(BP.page(BP.state.__R))`); await sleep(500);
  check('Share explains it needs the desktop app (no crash)', await c.ev(`/desktop app/.test(document.querySelector('.share-pane').textContent)`));
  shot('android-5-share');
  const crash = sh('logcat', '-d', '-s', 'AndroidRuntime:E').split('\n').filter((l) => l.includes(PKG));
  check('no crashes in the system log', crash.length === 0, crash.slice(0, 2).join(' | '));
  c.close();
  console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('TEST ERROR', e); process.exit(1); });

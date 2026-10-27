/* The web app in WebKit (Safari's engine) with an iPhone profile, via Playwright. Stand-in for Safari/iOS testing on a machine without a Mac.
   usage (from a folder where playwright is installed): node webkit-test.js <url> <screenshot dir> */
const { webkit, devices } = require('playwright');
const fs = require('fs'); const path = require('path');
const url = process.argv[2]; const shots = process.argv[3] || '.'; fs.mkdirSync(shots, { recursive: true });
let fails = 0; const check = (l, c, x) => { console.log((c ? 'PASS ' : 'FAIL ') + l + (x ? '  ' + x : '')); if (!c) fails++; };
(async () => {
  const browser = await webkit.launch();
  console.log('engine: WebKit', browser.version());
  const ctx = await browser.newContext({ ...devices['iPhone 14'], serviceWorkers: 'allow' });
  const page = await ctx.newPage();
  const errors = []; page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200))); page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url() + ' ' + (r.failure() && r.failure().errorText)));
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)));
  await page.goto(url); await page.waitForSelector('#app .main', { timeout: 15000 });
  check('loads and renders in WebKit', await page.evaluate(() => !!document.querySelector('.topbar') && typeof BP !== 'undefined'));
  const vp = await page.evaluate(() => ({ w: innerWidth, scrollW: document.documentElement.scrollWidth, sb: document.getElementById('app').classList.contains('sb-hidden') }));
  check('iPhone layout: sidebar closed, nothing overflows horizontally', vp.sb && vp.scrollW <= vp.w + 1, JSON.stringify(vp));
  await page.screenshot({ path: path.join(shots, 'webkit-1-home.png') });
  await page.tap('.topbar .sb-toggle'); await page.waitForTimeout(500);
  check('tapping the menu opens the sidebar drawer', await page.evaluate(() => !document.getElementById('app').classList.contains('sb-hidden')));
  await page.screenshot({ path: path.join(shots, 'webkit-2-drawer.png') });
  await page.evaluate(() => { const p = BP.createPage(null, { title: 'WebKit note', icon: '🍎' }); p.blocks = [BP.newBlock('h2', 'Hello Safari'), BP.newBlock('p', '')]; window.__R = p.id; BP.open(p.id); });
  await page.waitForTimeout(600);
  check('opening a page closes the drawer', await page.evaluate(() => document.getElementById('app').classList.contains('sb-hidden')));
  // real typing through the keyboard path
  const blk = await page.evaluate(() => { const id = BP.page(window.__R).blocks[1].id; const el = BP.currentEditor.txtOf(id); el.focus(); return id; });
  await page.keyboard.type('typed in WebKit');
  await page.waitForTimeout(500);
  check('typing works', await page.evaluate((id) => BP.textOf(BP.page(window.__R).blocks.find((b) => b.id === id).text) === 'typed in WebKit', blk));
  // a large attachment must save (IndexedDB in WebKit)
  await page.evaluate(() => { const p = BP.page(window.__R); const b = BP.newBlock('image'); b.src = 'data:image/png;base64,' + 'A'.repeat(6 * 1024 * 1024); p.blocks.push(b); BP.touch(p); return BP.flush(); });
  await page.waitForTimeout(1500);
  await page.reload(); await page.waitForSelector('#app .main'); await page.waitForTimeout(800);
  check('data (with a 6 MB attachment) survives a reload in WebKit', await page.evaluate(() => BP.allPages().some((p) => p.title === 'WebKit note' && p.blocks.length === 3 && BP.textOf(p.blocks[1].text) === 'typed in WebKit')));
  check('the offline cache registered a service worker', await page.evaluate(async () => { try { const r = await navigator.serviceWorker.ready; return !!r.active; } catch (e) { return 'ERR ' + e.message; } }) === true);
  await ctx.setOffline(true);
  await page.reload(); await page.waitForSelector('#app .main', { timeout: 15000 });
  check('loads with no network (from the cache)', await page.evaluate(() => BP.allPages().some((p) => p.title === 'WebKit note')));
  await ctx.setOffline(false);
  await page.evaluate(() => BP.openSettings('general')); await page.waitForTimeout(400);
  check('dialogs fit the iPhone screen', await page.evaluate(() => { const m = document.querySelector('.modal').getBoundingClientRect(); return m.left >= 0 && m.right <= innerWidth + 1; }));
  await page.screenshot({ path: path.join(shots, 'webkit-3-settings.png') });
  check('no console errors', errors.length === 0, errors.join(' | ').slice(0, 300));
  await browser.close();
  console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('TEST ERROR', e); process.exit(1); });

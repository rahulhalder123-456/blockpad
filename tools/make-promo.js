/* Records the Blockpad promo video from the real web app, frame by frame (exact 30 fps timing, 1080p), then tools/encode-promo.js dresses it up:
     node tools/build-web.js
     node_modules\electron\dist\electron.exe tools\make-promo.js        -> prints the work folder
     node tools\encode-promo.js <work folder>                           -> promo/blockpad-promo.mp4
   Every frame is stepped (state is set, the page paints, the frame is captured), so typing, scrolling and the cursor are perfectly even. */
const { app, BrowserWindow } = require('electron');
const fs = require('fs'); const path = require('path'); const os = require('os');
const { pathToFileURL } = require('url');
const root = path.join(__dirname, '..');
const APP = pathToFileURL(path.join(root, 'site', 'app', 'index.html')).href;
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-promo-'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (t) => Math.max(0, Math.min(1, t));
let win; const segs = []; let expectRatio = 16 / 9;      // every captured frame must have this shape (a window larger than the screen gets clamped and would be stretched)
const ev = (c) => win.webContents.executeJavaScript(c);

const LOGO = '<div class="logo">' + fs.readFileSync(path.join(root, 'assets', 'logo.svg'), 'utf8').replace(/ width="256" height="256"/, '') + '</div>';
const card = (html) => 'data:text/html;charset=utf-8,' + encodeURIComponent(`<style>
  html,body{margin:0;height:100%;background:radial-gradient(120% 120% at 20% 10%,#6d5dfc 0%,#2b2889 55%,#15133f 100%);color:#fff;font:600 28px/1.35 "Segoe UI",system-ui,sans-serif;overflow:hidden}
  .w{height:100%;display:grid;place-content:center;text-align:center;gap:20px}
  .logo{width:132px;height:132px;margin:0 auto;animation:pop .9s cubic-bezier(.2,.9,.3,1.3) both;filter:drop-shadow(0 18px 30px rgba(0,0,0,.35))} .logo svg{width:100%;height:100%;display:block}
  h1{margin:0;font-size:68px;letter-spacing:-1px;animation:up .8s .25s both}
  p{margin:0;font-weight:400;font-size:28px;opacity:.9;animation:up .8s .5s both}
  .u{display:inline-block;margin-top:10px;padding:12px 26px;border-radius:999px;background:#ffb454;color:#2b2889;font-weight:700;animation:up .8s .9s both}
  .pills{display:flex;gap:16px;justify-content:center;flex-wrap:wrap;max-width:980px;margin:6px auto 0}
  .pill{padding:14px 26px;border-radius:999px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.28);font-size:28px;font-weight:600;animation:up .7s both}
  .pill:nth-child(1){animation-delay:.35s}.pill:nth-child(2){animation-delay:.55s}.pill:nth-child(3){animation-delay:.75s}.pill:nth-child(4){animation-delay:.95s}.pill:nth-child(5){animation-delay:1.15s}
  @keyframes pop{from{transform:scale(.3) rotate(-12deg);opacity:0}}@keyframes up{from{transform:translateY(24px);opacity:0}}
  </style><div class="w">${html}</div>`);
const CURSOR = `(()=>{ if(window.__c) return;
  const c=document.createElement('div'); c.style.cssText='position:fixed;left:0;top:0;width:30px;height:30px;z-index:99999;pointer-events:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.5));display:none';
  c.innerHTML='<svg width="30" height="30" viewBox="0 0 24 24"><path d="M5 3l14 8-6 2 4 7-3 1.5-4-7-5 4z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  const r=document.createElement('div'); r.style.cssText='position:fixed;width:46px;height:46px;border-radius:50%;border:3px solid #ffb454;background:rgba(255,180,84,.18);z-index:99998;pointer-events:none;opacity:0';
  document.body.append(r,c); window.__c=c; window.__r=r; })()`;
const cur = (x, y, ripple, show = true) => ev(`(()=>{const c=window.__c,r=window.__r; c.style.display=${show ? "'block'" : "'none'"}; c.style.transform='translate(${x}px,${y}px)'; r.style.left=(${x}-23)+'px'; r.style.top=(${y}-23)+'px'; r.style.opacity=${ripple.toFixed(2)}; r.style.transform='scale('+(0.5+(1-${ripple.toFixed(2)})*1.2)+')'})()`);
const center = (js) => ev(`(()=>{const e=${js}; if(!e) return null; const b=e.getBoundingClientRect(); return {x:b.left+b.width/2,y:b.top+b.height/2}})()`);
const byText = (sel, text) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find(b=>b.textContent.trim()===${JSON.stringify(text)})`;

/* a scene: step(p 0..1, i) is called once per frame, then the frame is captured */
async function scene(name, meta, frames, step) {
  const dir = path.join(work, name); fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < frames; i++) {
    if (step) await step(frames > 1 ? i / (frames - 1) : 0, i);
    await wait(45);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(dir, String(i).padStart(5, '0') + '.jpg'), img.toJPEG(92));
    if (i === 0) { const z = img.getSize(); meta.size = z; if (Math.abs(z.width / z.height / expectRatio - 1) > 0.015) throw new Error(name + ': captured ' + z.width + 'x' + z.height + ', wrong shape (expected ratio ' + expectRatio.toFixed(3) + ')'); }
  }
  segs.push(Object.assign({ name, frames }, meta)); console.log('scene', name, frames);
}
const cardScene = (name, html, frames) => async () => {
  expectRatio = 16 / 9; win.setContentSize(1280, 720); await win.loadURL(card(html)); win.webContents.setZoomFactor(1); await wait(250);
  await ev(`document.getAnimations().forEach(a=>a.pause())`);
  await scene(name, { type: 'card' }, frames, (p, i) => ev(`document.getAnimations().forEach(a=>{a.currentTime=${(i / 30) * 1000}})`));
};
const key = (k) => { win.webContents.sendInputEvent({ type: 'keyDown', keyCode: k }); if (k === 'Enter') win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: k }); };
const typeCh = (ch) => win.webContents.sendInputEvent({ type: 'char', keyCode: ch });
const typingPlan = (tokens, start, perChar) => { const ops = []; let f = start; for (const t of tokens) { if (t === 'Enter') { ops.push({ f: Math.round(f), k: 1 }); f += 7; } else { for (const ch of t) { ops.push({ f: Math.round(f), ch }); f += perChar; } f += 6; } } return { ops, end: Math.round(f) }; };
const desktop = async () => { expectRatio = 16 / 9; win.setContentSize(1280, 720); await win.loadURL(APP); win.webContents.setZoomFactor(1); await wait(3200); await ev(`BP.setTheme('dark')`); await ev(CURSOR); await wait(300); };
const phone = async () => { expectRatio = 390 / 780; win.setContentSize(390, 780); await win.loadURL(APP); win.webContents.setZoomFactor(1); await wait(3200); await ev(`BP.setTheme('light')`); await ev(CURSOR); await wait(300); };
const openPage = (re) => ev(`(()=>{BP.open(BP.allPages().find(x=>${re}.test(x.title)).id)})()`);

app.whenReady().then(async () => {
  win = new BrowserWindow({ show: false, width: 1280, height: 720, useContentSize: true, webPreferences: { partition: 'promo' + Date.now(), backgroundThrottling: false } });

  await cardScene('01-intro', LOGO + '<h1>Blockpad</h1><p>Notes, wiki and databases that live on your device</p>', 96)();

  // --- write with blocks
  await desktop(); await openPage('/welcome/i'); await wait(500);
  await ev(`(()=>{const p=BP.createPage(null,{title:''}); BP.open(p.id)})()`); await wait(700);
  await ev(`document.querySelector('.title-in').focus()`);
  const plan = typingPlan(['Weekend trip', 'Enter', '## Things to pack', 'Enter', '- Camera', 'Enter', 'Chargers', 'Enter', 'Enter', '[] Book the train', 'Enter', 'Check the weather'], 22, 1.7);
  let at = 0;
  await scene('02-write', { type: 'app', title: 'Write with blocks', sub: 'Headings, lists, to-dos. Just type.' }, plan.end + 50, async (p, i) => {
    while (at < plan.ops.length && plan.ops[at].f <= i) { const o = plan.ops[at++]; o.k ? key('Enter') : typeCh(o.ch); }
  });

  // --- databases: table -> board with a real click
  await ev(`(()=>{BP.open(BP.allPages().find(x=>x.type==='db').id)})()`); await wait(900);
  const board = await center(byText('button', 'Board'));
  await scene('03-database', { type: 'app', title: 'Databases built in', sub: 'Table, board, calendar and more' }, 190, async (p, i) => {
    const t = ease(clamp((i - 30) / 55)); const x = lerp(1000, board.x, t), y = lerp(520, board.y, t);
    const rip = i >= 92 && i < 108 ? 1 - (i - 92) / 16 : 0;
    await cur(x, y, rip);
    if (i === 94) await ev(`${byText('button', 'Board')}.click()`);
  });

  // --- themes
  await ev(`window.__c.style.display='none'`);
  await scene('04-theme', { type: 'app', title: 'Light and dark', sub: 'Follows your device, or pick one' }, 110, async (p, i) => {
    if (i === 30) await ev(`BP.setTheme('light')`);
    if (i === 70) await ev(`BP.setTheme('dark')`);
  });

  // --- comments
  await openPage('/welcome/i'); await wait(600);
  const cbtn = await center(`document.querySelector('.topbar .icon-btn[title="Comments"]')`);
  let typed = 0; const msg = 'Love this layout!';
  await scene('05-comments', { type: 'app', title: 'Comment on anything', sub: 'Talk about the page, right on the page' }, 230, async (p, i) => {
    if (i < 45) { const t = ease(clamp(i / 40)); await cur(lerp(1100, cbtn.x, t), lerp(560, cbtn.y, t), 0); }
    else if (i < 63) { await cur(cbtn.x, cbtn.y, i >= 47 ? 1 - (i - 47) / 16 : 0); if (i === 49) await ev(`document.querySelector('.topbar .icon-btn[title="Comments"]').click()`); }
    if (i === 70) { await ev(`document.querySelector('.comments textarea').focus()`); await cur(cbtn.x, cbtn.y, 0, false); }
    if (i >= 74 && typed < msg.length && (i - 74) % 3 === 0) typeCh(msg[typed++]);
    if (i === 150) { const b = await center(byText('.comments button', 'Comment')); await cur(b.x - 120, b.y - 40, 0); }
    if (i > 150 && i < 172) { const b = await center(byText('.comments button', 'Comment')); const t = ease(clamp((i - 150) / 20)); await cur(lerp(b.x - 120, b.x, t), lerp(b.y - 40, b.y, t), i >= 168 ? 1 - (i - 168) / 4 : 0); }
    if (i === 176) { await ev(`${byText('.comments button', 'Comment')}.click()`); await cur(0, 0, 0, false); }
  });
  await ev(`BP.state && (document.querySelector('.comments .icon-btn')||{click(){}}).click()`); await wait(300);

  // --- share
  const sbtn = await center(byText('.topbar button', 'Share'));
  await scene('06-share', { type: 'app', title: 'Share without a server', sub: 'A link is all it takes. Peer to peer, end to end.' }, 150, async (p, i) => {
    const t = ease(clamp((i - 8) / 36)); await cur(lerp(1200, sbtn.x, t), lerp(600, sbtn.y, t), i >= 48 && i < 62 ? 1 - (i - 48) / 14 : 0);
    if (i === 50) await ev(`${byText('.topbar button', 'Share')}.click()`);
    if (i === 70) await cur(sbtn.x, sbtn.y, 0, false);
  });
  await ev(`document.querySelector('.modal-back') && document.querySelector('.modal-back').remove()`);

  // --- phone
  await phone(); await openPage('/welcome/i'); await wait(700);
  const menu = await center(`document.querySelector('.topbar .icon-btn')`);
  const cm = await center(`document.querySelector('.topbar .icon-btn[title="Comments"]')`);
  await scene('07-phone', { type: 'phone', title: 'Made for your phone', sub: 'The same app on any screen' }, 330, async (p, i) => {
    if (i >= 15 && i < 105) await ev(`document.querySelector('.scroller').scrollTop=${Math.round(ease((i - 15) / 90) * 640)}`);
    if (i >= 110 && i < 150) await ev(`document.querySelector('.scroller').scrollTop=${Math.round((1 - ease((i - 110) / 40)) * 640)}`);
    if (i >= 160 && i < 176) await cur(menu.x, menu.y, 1 - (i - 160) / 16, false);
    if (i === 164) await ev(`document.querySelector('.topbar .icon-btn').click()`);
    if (i === 235) await ev(`document.querySelector('#app').click()`);
    if (i >= 260 && i < 276) await cur(cm.x, cm.y, 1 - (i - 260) / 16, false);
    if (i === 264) await ev(`document.querySelector('.topbar .icon-btn[title="Comments"]').click()`);
  });

  await cardScene('08-private', LOGO + '<h1>Yours. Private. Everywhere.</h1><div class="pills"><span class="pill">Works offline</span><span class="pill">No account</span><span class="pill">Peer-to-peer sharing</span><span class="pill">Free</span></div>', 100)();
  await cardScene('09-end', LOGO + '<h1>Get Blockpad</h1><p>Windows · Linux · Android · macOS · iOS · Web</p><div><span class="u">blockpad-umber.vercel.app</span></div>', 130)();

  fs.writeFileSync(path.join(work, 'segments.json'), JSON.stringify(segs, null, 1));
  console.log('WORK ' + work);
  app.exit(0);
});

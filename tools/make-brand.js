/* Renders the official Blockpad mark (the "B-Blocks" logo) into every icon the project uses:
     node_modules\electron\dist\electron.exe tools\make-brand.js
   writes assets/logo.svg, icon.png, icon-512.png, icon.ico, icon.icns and assets/icons/* (PWA, Apple touch, App Store). */
const { app, BrowserWindow } = require('electron');
const fs = require('fs'); const path = require('path');
const A = path.join(__dirname, '..', 'assets');
const DEFS = '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a6bff"/><stop offset="1" stop-color="#2b2889"/></linearGradient></defs>';
const MARK = '<path fill="#fff" d="M34 22h20a14 14 0 0 1 0 28H34a4 4 0 0 1-4-4V26a4 4 0 0 1 4-4z"/><path fill="#ffb454" d="M34 54h24a12 12 0 0 1 0 24H34a4 4 0 0 1-4-4V58a4 4 0 0 1 4-4z"/>';
const svg = (kind, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"${extra}>${DEFS}` +
  (kind === 'tile' ? '<rect width="100" height="100" rx="23" fill="url(#g)"/>' + MARK
    : kind === 'square' ? '<rect width="100" height="100" fill="url(#g)"/>' + MARK
    : kind === 'round' ? '<clipPath id="c"><circle cx="50" cy="50" r="50"/></clipPath><g clip-path="url(#c)"><rect width="100" height="100" fill="url(#g)"/><g transform="translate(50 50) scale(.8) translate(-50 -50)">' + MARK + '</g></g>'
    : '<rect width="100" height="100" fill="url(#g)"/><g transform="translate(50 50) scale(.72) translate(-50 -50)">' + MARK + '</g>') + '</svg>';   // maskable: mark inside the safe zone

fs.writeFileSync(path.join(A, 'logo.svg'), svg('tile', ' width="256" height="256"'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let win; const masters = {};
const master = async (kind) => {      // one window, three 1024px masters; every other size is a high-quality downscale
  if (!win) { win = new BrowserWindow({ show: false, width: 1024, height: 1024, useContentSize: true, transparent: true, frame: false }); await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block;width:1024px;height:1024px}</style><div id="x"></div>')); }
  if (!masters[kind]) { await win.webContents.executeJavaScript('document.getElementById("x").innerHTML=' + JSON.stringify(svg(kind)) + ';0'); await wait(300); masters[kind] = await win.webContents.capturePage(); }
  return masters[kind];
};
const render = async (kind, size) => { const m = await master(kind); return (size === 1024 ? m : m.resize({ width: size, height: size, quality: 'best' })).toPNG(); };
const ico = (list) => {            // PNG-compressed ICO
  const head = Buffer.alloc(6 + 16 * list.length); head.writeUInt16LE(1, 2); head.writeUInt16LE(list.length, 4);
  let off = head.length; list.forEach(([s, p], i) => { const o = 6 + 16 * i; head[o] = s >= 256 ? 0 : s; head[o + 1] = s >= 256 ? 0 : s; head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6); head.writeUInt32LE(p.length, o + 8); head.writeUInt32LE(off, o + 12); off += p.length; });
  return Buffer.concat([head, ...list.map((x) => x[1])]);
};
const icns = (entries) => { const parts = entries.map(([t, p]) => { const h = Buffer.alloc(8); h.write(t, 0, 'ascii'); h.writeUInt32BE(p.length + 8, 4); return Buffer.concat([h, p]); }); const body = Buffer.concat(parts); const h = Buffer.alloc(8); h.write('icns', 0, 'ascii'); h.writeUInt32BE(body.length + 8, 4); return Buffer.concat([h, body]); };

app.whenReady().then(async () => {
  const w = {}; const tile = async (s) => (w[s] = w[s] || (await render('tile', s)));
  fs.writeFileSync(path.join(A, 'icon.png'), await tile(256));
  fs.writeFileSync(path.join(A, 'icon-512.png'), await tile(512));
  fs.writeFileSync(path.join(A, 'icons', 'icon-192.png'), await tile(192));
  fs.writeFileSync(path.join(A, 'icons', 'icon-512.png'), await tile(512));
  fs.writeFileSync(path.join(A, 'icons', 'maskable-512.png'), await render('maskable', 512));
  fs.writeFileSync(path.join(A, 'icons', 'apple-touch-180.png'), await render('square', 180));
  fs.writeFileSync(path.join(A, 'icons', 'appstore-1024.png'), await render('square', 1024));
  const sizes = [16, 24, 32, 48, 64, 128, 256]; const list = []; for (const s of sizes) list.push([s, await tile(s)]);
  fs.writeFileSync(path.join(A, 'icon.ico'), ico(list));
  fs.writeFileSync(path.join(A, 'icon.icns'), icns([['ic07', await tile(128)], ['ic08', await tile(256)], ['ic09', await tile(512)], ['ic10', await tile(1024)]]));
  // Android launcher icons (adaptive foreground is the full-bleed art; legacy and round icons for old launchers)
  const res = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
  if (fs.existsSync(res)) {
    const dens = { mdpi: [48, 108], hdpi: [72, 162], xhdpi: [96, 216], xxhdpi: [144, 324], xxxhdpi: [192, 432] };
    for (const [d, [l, f]] of Object.entries(dens)) {
      const dir = path.join(res, 'mipmap-' + d);
      fs.writeFileSync(path.join(dir, 'ic_launcher.png'), await render('tile', l));
      fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), await render('round', l));
      fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), await render('maskable', f));
    }
  }
  console.log('brand assets written');
  app.exit(0);
});

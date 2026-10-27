// Renders the Blockpad logo at every size the other platforms need (no dependencies):
//   assets/icons/icon-192.png, icon-512.png, apple-touch-180.png, maskable-512.png   (web app / Android / iOS home screen)
//   assets/icon-512.png (Linux)   assets/icon.icns (macOS)
const fs = require('fs'); const path = require('path'); const zlib = require('zlib');
const shapes = [
  { x: 56, y: 62, w: 144, h: 34, r: 12, c: [255, 255, 255, 1] },
  { x: 56, y: 111, w: 104, h: 34, r: 12, c: [255, 255, 255, 0.85] },
  { x: 172, y: 107, w: 9, h: 42, r: 4.5, c: [255, 180, 84, 1] },
  { x: 56, y: 160, w: 124, h: 34, r: 12, c: [255, 180, 84, 1] },
];
const lerp = (a, b, t) => a + (b - a) * t;
const inRR = (s, px, py) => { if (px < s.x || py < s.y || px > s.x + s.w || py > s.y + s.h) return false; const cx = Math.min(Math.max(px, s.x + s.r), s.x + s.w - s.r), cy = Math.min(Math.max(py, s.y + s.r), s.y + s.h - s.r); return (px - cx) ** 2 + (py - cy) ** 2 <= s.r * s.r; };
const crcT = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };

/* size px square. rounded: the app icon has rounded corners (transparent outside). maskable: full-bleed gradient, artwork shrunk into the 80% safe zone. */
function render(S, { rounded = true, maskable = false, foregroundOnly = false } = {}) {
  const SS = S >= 512 ? 2 : 3, raw = Buffer.alloc((S * 4 + 1) * S);
  const art = maskable ? 0.62 : 1;                       // scale of the white bars inside the 256 design space
  const off = (256 - 256 * art) / 2;
  for (let y = 0; y < S; y++) {
    raw[y * (S * 4 + 1)] = 0;
    for (let x = 0; x < S; x++) {
      let R = 0, G = 0, B = 0, A = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const px = ((x + (sx + 0.5) / SS) / S) * 256, py = ((y + (sy + 0.5) / SS) / S) * 256;
        let c = null;
        if (!foregroundOnly && (!rounded || inRR({ x: 0, y: 0, w: 256, h: 256, r: 58 }, px, py))) { const t = (px + py) / 512; c = [lerp(0x6d, 0x2d, t), lerp(0x5d, 0x2a, t), lerp(0xfc, 0x8f, t)]; }
        if (foregroundOnly) c = c || null;
        for (const s of shapes) {
          if (!c && !foregroundOnly) break;
          const q = { x: off + s.x * art, y: off + s.y * art, w: s.w * art, h: s.h * art, r: s.r * art };
          if (inRR(q, px, py)) { const a = s.c[3]; c = c ? [s.c[0] * a + c[0] * (1 - a), s.c[1] * a + c[1] * (1 - a), s.c[2] * a + c[2] * (1 - a)] : [s.c[0], s.c[1], s.c[2]]; }
        }
        if (c) { R += c[0]; G += c[1]; B += c[2]; A += 1; }
      }
      const n = SS * SS, o = y * (S * 4 + 1) + 1 + x * 4;
      if (A > 0) { raw[o] = R / A; raw[o + 1] = G / A; raw[o + 2] = B / A; raw[o + 3] = (A / n) * 255; }
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const assets = path.join(__dirname, '..', 'assets'); const icons = path.join(assets, 'icons');
fs.mkdirSync(icons, { recursive: true });
fs.writeFileSync(path.join(icons, 'icon-192.png'), render(192));
fs.writeFileSync(path.join(icons, 'icon-512.png'), render(512));
fs.writeFileSync(path.join(icons, 'maskable-512.png'), render(512, { rounded: false, maskable: true }));
fs.writeFileSync(path.join(icons, 'apple-touch-180.png'), render(180, { rounded: false }));          // iOS rounds the corners itself
fs.writeFileSync(path.join(assets, 'icon-512.png'), render(512));
fs.writeFileSync(path.join(icons, 'appstore-1024.png'), render(1024, { rounded: false }));   // iOS app icon: square, iOS rounds it
// macOS .icns: PNG payloads (ic08 = 256, ic09 = 512, ic10 = 1024)
const parts = [['ic08', render(256)], ['ic09', render(512)], ['ic10', render(1024)]].map(([t, d]) => { const h = Buffer.alloc(8); h.write(t, 0, 'ascii'); h.writeUInt32BE(d.length + 8, 4); return Buffer.concat([h, d]); });
const body = Buffer.concat(parts); const head = Buffer.alloc(8); head.write('icns', 0, 'ascii'); head.writeUInt32BE(body.length + 8, 4);
fs.writeFileSync(path.join(assets, 'icon.icns'), Buffer.concat([head, body]));
console.log('icons written:', fs.readdirSync(icons).join(', '), '+ assets/icon.icns, assets/icon-512.png');

// Android launcher icons (adaptive foreground + legacy square/round) when the Android project exists
const res = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
if (fs.existsSync(res)) {
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(dens)) {
    const dir = path.join(res, 'mipmap-' + d);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'ic_launcher.png'), render(Math.round(48 * k)));
    fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), render(Math.round(48 * k)));
    fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), render(Math.round(108 * k), { rounded: false, maskable: true, foregroundOnly: true }));
  }
  fs.mkdirSync(path.join(res, 'values'), { recursive: true });
  fs.writeFileSync(path.join(res, 'values', 'ic_launcher_background.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#5B5BD6</color>\n</resources>\n');
  console.log('android launcher icons written');
}

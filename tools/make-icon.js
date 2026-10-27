// Rasterizes assets/logo.svg's shapes into assets/icon.png and assets/icon.ico (no dependencies).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const S = 256, SS = 3;
const shapes = [
  { x: 0, y: 0, w: 256, h: 256, r: 58, grad: true },
  { x: 56, y: 62, w: 144, h: 34, r: 12, c: [255, 255, 255, 1] },
  { x: 56, y: 111, w: 104, h: 34, r: 12, c: [255, 255, 255, 0.85] },
  { x: 172, y: 107, w: 9, h: 42, r: 4.5, c: [255, 180, 84, 1] },
  { x: 56, y: 160, w: 124, h: 34, r: 12, c: [255, 180, 84, 1] },
];
const inRR = (s, px, py) => {
  if (px < s.x || py < s.y || px > s.x + s.w || py > s.y + s.h) return false;
  const cx = Math.min(Math.max(px, s.x + s.r), s.x + s.w - s.r);
  const cy = Math.min(Math.max(py, s.y + s.r), s.y + s.h - s.r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= s.r * s.r;
};
const lerp = (a, b, t) => a + (b - a) * t;
const grad = (px, py) => {
  const t = (px + py) / (2 * S);
  return [lerp(0x6d, 0x2d, t), lerp(0x5d, 0x2a, t), lerp(0xfc, 0x8f, t), 1];
};

const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  for (let x = 0; x < S; x++) {
    let R = 0, G = 0, B = 0, A = 0;
    for (let sy = 0; sy < SS; sy++)
      for (let sx = 0; sx < SS; sx++) {
        const px = x + (sx + 0.5) / SS, py = y + (sy + 0.5) / SS;
        let c = null;
        for (const s of shapes) {
          if (!inRR(s, px, py)) continue;
          const col = s.grad ? grad(px, py) : s.c;
          if (!c) c = [col[0], col[1], col[2], col[3]];
          else {
            const a = col[3];
            c = [col[0] * a + c[0] * (1 - a), col[1] * a + c[1] * (1 - a), col[2] * a + c[2] * (1 - a), 1];
          }
        }
        if (c) { R += c[0] * c[3]; G += c[1] * c[3]; B += c[2] * c[3]; A += c[3]; }
      }
    const n = SS * SS, o = y * (S * 4 + 1) + 1 + x * 4;
    if (A > 0) { raw[o] = R / A; raw[o + 1] = G / A; raw[o + 2] = B / A; raw[o + 3] = (A / n) * 255; }
  }
}
const crcT = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => {
  const l = Buffer.alloc(4); l.writeUInt32BE(d.length);
  const td = Buffer.concat([Buffer.from(t), d]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([l, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
]);
const out = path.join(__dirname, '..', 'assets');
fs.writeFileSync(path.join(out, 'icon.png'), png);
const ico = Buffer.alloc(22);
ico.writeUInt16LE(0, 0); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
ico[6] = 0; ico[7] = 0; ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18);
fs.writeFileSync(path.join(out, 'icon.ico'), Buffer.concat([ico, png]));
console.log('icon.png', png.length, 'bytes; icon.ico written');

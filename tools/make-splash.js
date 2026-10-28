/* Native launch screens (the splash.png in each Android drawable folder) in the same look as the in-app startup animation: dark indigo gradient + the logo tile.
     node tools/make-splash.js        (needs ffmpeg on PATH and assets/icon-512.png from tools/make-brand.js) */
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..'); const res = path.join(root, 'android', 'app', 'src', 'main', 'res');
const icon = path.join(root, 'assets', 'icon-512.png');
let n = 0;
for (const d of fs.readdirSync(res).filter((x) => /^drawable/.test(x))) {
  const f = path.join(res, d, 'splash.png'); if (!fs.existsSync(f)) continue;
  const b = fs.readFileSync(f); const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  const s = Math.round(Math.min(w, h) * 0.3);
  const tmp = f + '.new.png';
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `gradients=s=${w}x${h}:c0=0x2a2570:c1=0x0e0c2b:x0=${Math.round(w * 0.25)}:y0=${Math.round(h * 0.15)}:x1=${w}:y1=${h}:type=radial:d=1:r=1`, '-i', icon,
    '-filter_complex', `[1:v]scale=${s}:${s}:flags=lanczos[i];[0:v][i]overlay=(W-w)/2:(H-h)/2:format=auto`, '-frames:v', '1', tmp]);
  fs.renameSync(tmp, f); n++;
}
console.log('splash images written:', n);

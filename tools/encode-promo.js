/* Turns the frames recorded by tools/make-promo.js into promo/blockpad-promo.mp4 (1920x1080, 30 fps):
     node tools/encode-promo.js <work folder>      (needs ffmpeg on PATH)
   App scenes go on a gradient stage with a rounded window and shadow, the phone scene gets a device frame, every scene gets an animated caption.
   The stage (background + shadow) is rendered once; scenes are encoded in parallel. */
const fs = require('fs'); const path = require('path'); const os = require('os'); const { spawn, execFileSync } = require('child_process');
const work = process.argv[2]; const outDir = path.join(__dirname, '..', 'promo');
const segs = JSON.parse(fs.readFileSync(path.join(work, 'segments.json'), 'utf8'));
const ffSync = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
const ffAsync = (args) => new Promise((res, rej) => { const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] }); p.on('exit', (c) => (c ? rej(new Error('ffmpeg exit ' + c)) : res())); });
const FONT = 'C\\:/Windows/Fonts/segoeuib.ttf', FONT2 = 'C\\:/Windows/Fonts/segoeui.ttf';
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, '').replace(/:/g, '\\:').replace(/,/g, '\\,');
const fwd = (p) => p.split(path.sep).join('/');
const P = (n) => path.join(work, n);

// rounded-corner masks, and the two stages (gradient background + soft shadow), each made once
const mask = (w, h, r, file) => ffSync(['-f', 'lavfi', '-i', `color=c=white:s=${w}x${h}`, '-vf', `format=gray,geq=lum='if(gt(abs(W/2-X),W/2-${r})*gt(abs(H/2-Y),H/2-${r}),if(lte(hypot(abs(W/2-X)-(W/2-${r}),abs(H/2-Y)-(H/2-${r})),${r}),255,0),255)'`, '-frames:v', '1', file]);
mask(1600, 900, 20, P('mask-app.png')); mask(430, 860, 58, P('mask-phone.png'));
ffSync(['-f', 'lavfi', '-i', 'gradients=s=1920x1080:c0=0x1a1750:c1=0x3b34b8:x0=0:y0=0:x1=1920:y1=1080:n=2:d=1:r=1', '-frames:v', '1', P('bg.png')]);
const stage = (maskFile, w, h, x, y, out) => ffSync(['-i', P('bg.png'), '-i', maskFile, '-filter_complex',
  `[1:v]format=gray,pad=1920:1080:${x}:${y + 26}:black[big];color=c=black:s=1920x1080,format=rgba[blk];[blk][big]alphamerge[sh0];` +
  `[sh0]colorchannelmixer=aa=0.6,boxblur=34:6[sh];[0:v][sh]overlay=0:0:format=auto,format=rgb24[o]`, '-map', '[o]', '-frames:v', '1', out]);
stage(P('mask-app.png'), 1600, 900, 160, 150, P('stage-app.png'));
stage(P('mask-phone.png'), 430, 860, 745, 170, P('stage-phone.png'));

const caption = (s, D) => {
  const a = `min(1,t/0.5)*min(1,(${D}-t)/0.4)`, y = (base) => `'${base}+(1-min(1,t/0.5))*18'`;
  return `drawtext=fontfile='${FONT}':text='${esc(s.title)}':fontsize=54:fontcolor=white:x=(w-text_w)/2:y=${y(34)}:alpha='${a}',` +
    `drawtext=fontfile='${FONT2}':text='${esc(s.sub)}':fontsize=28:fontcolor=0xd9d6ff:x=(w-text_w)/2:y=${y(100)}:alpha='${a}'`;
};
const job = (s) => {
  const dir = path.join(work, s.name), D = s.frames / 30, o = P(s.name + '.mp4');
  const fades = `fade=t=in:d=0.3,fade=t=out:st=${(D - 0.3).toFixed(2)}:d=0.3,format=yuv420p`;
  const inFrames = ['-framerate', '30', '-i', path.join(dir, '%05d.jpg')];
  const enc = ['-c:v', 'libx264', '-crf', '17', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '30', '-frames:v', String(s.frames), '-threads', '3', o];
  if (s.type === 'card') return ffAsync([...inFrames, '-vf', `scale=1920:1080:flags=bicubic,${fades}`, ...enc]).then(() => o);
  const app = s.type === 'app';
  const place = app ? 'scale=1600:900:flags=bicubic,format=rgba' : 'scale=-2:840:flags=bicubic,pad=430:860:10:10:color=0x0b0b10,format=rgba';
  const [px, py] = app ? [160, 150] : [745, 170];
  return ffAsync(['-loop', '1', '-i', P(app ? 'stage-app.png' : 'stage-phone.png'), ...inFrames, '-loop', '1', '-i', P(app ? 'mask-app.png' : 'mask-phone.png'), '-shortest', '-filter_complex',
    `[1:v]${place}[a0];[2:v]format=gray[m];[a0][m]alphamerge[win];[0:v][win]overlay=${px}:${py}:format=auto[t1];[t1]${caption(s, D)},${fades}[v]`, '-map', '[v]', ...enc]).then(() => o);
};
(async () => {
  const done = new Array(segs.length); let next = 0;
  const worker = async () => { while (next < segs.length) { const i = next++; done[i] = await job(segs[i]); console.log('encoded', segs[i].name); } };
  await Promise.all(Array.from({ length: Math.max(2, Math.min(4, os.cpus().length >> 2)) }, worker));
  fs.writeFileSync(P('all.txt'), done.map((p) => "file '" + fwd(p) + "'").join('\n'));
  fs.mkdirSync(outDir, { recursive: true });
  const final = path.join(outDir, 'blockpad-promo.mp4');
  ffSync(['-f', 'concat', '-safe', '0', '-i', P('all.txt'), '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', final]);
  console.log('written', final);
})().catch((e) => { console.error(e); process.exit(1); });

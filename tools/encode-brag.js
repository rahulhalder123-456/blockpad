/* Builds the ~24 s Blockpad launch cut (brag-output/brag.mp4) from the frames recorded by tools/make-promo.js:
     node tools/encode-brag.js <promo work folder> <music.wav>        (run tools/encode-promo.js on the same folder first: it makes the stage images)
   Every cut lands on the 120 BPM grid of tools/make-brag-music.py. The poster frame is baked in as frame 0 (replacing it, so duration and audio stay in sync). */
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const work = process.argv[2]; const music = path.resolve(process.argv[3]);
const root = path.join(__dirname, '..'); const outDir = path.join(root, 'brag-output'); const tmp = path.join(outDir, 'work');
fs.mkdirSync(tmp, { recursive: true });
const ff = (a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a], { stdio: ['ignore', 'inherit', 'inherit'] });
const W = (n) => path.join(work, n);
const FONT = 'C\\:/Windows/Fonts/segoeuib.ttf', FONT2 = 'C\\:/Windows/Fonts/segoeui.ttf';
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, '').replace(/:/g, '\\:').replace(/,/g, '\\,');
const fwd = (p) => p.split(path.sep).join('/');
const BEAT = 0.5;

/* the storyboard (seconds, all multiples of a beat): hook, reveal, three highlights, punchline, end card */
const scenes = [
  { name: 'hook',    type: 'app',  seg2: '02-write',    from: 22,  secs: 2.0, speed: 1.35, title: 'Your notes. Your device.', sub: 'No cloud. No account.' },
  { name: 'reveal',  seg2: '01-intro',    type: 'card', from: 6,   secs: 3.5, speed: 1 },
  { name: 'write',   seg2: '02-write',    type: 'app',  from: 100, secs: 4.0, speed: 184 / 120, title: 'Write with blocks', sub: 'Headings, lists, to-dos. Just type.' },
  { name: 'data',    seg2: '03-database', type: 'app',  from: 40,  secs: 4.0, speed: 1, title: 'Databases built in', sub: 'Table, board, calendar and more' },
  { name: 'phone',   seg2: '07-phone',    type: 'phone', from: 0,  secs: 4.0, speed: 330 / 120, title: 'Made for your phone', sub: 'The same app on any screen' },
  { name: 'private', seg2: '08-private',  type: 'card', from: 6,   secs: 2.5, speed: 1 },
  { name: 'end',     seg2: '09-end',      type: 'card', from: 6,   secs: 4.0, speed: 1 },
];
const total = scenes.reduce((a, s) => a + s.secs, 0);
if (Math.abs(total - 24) > 1e-6 || scenes.some((s) => (s.secs / BEAT) % 1 !== 0)) throw new Error('storyboard is off the beat grid: ' + total);

const caption = (s, D) => {
  const a = `min(1,t/0.35)*min(1,(${D}-t)/0.25)`, y = (b) => `'${b}+(1-min(1,t/0.35))*18'`;
  return `drawtext=fontfile='${FONT}':text='${esc(s.title)}':fontsize=56:fontcolor=white:x=(w-text_w)/2:y=${y(30)}:alpha='${a}',` +
    `drawtext=fontfile='${FONT2}':text='${esc(s.sub)}':fontsize=28:fontcolor=0xd9d6ff:x=(w-text_w)/2:y=${y(100)}:alpha='${a}'`;
};
const parts = [];
for (const s of scenes) {
  const dir = W(s.seg2), o = path.join(tmp, 'cut-' + s.name + '.mp4'), nOut = Math.round(s.secs * 30);
  const inp = ['-start_number', String(s.from), '-framerate', String(30 * s.speed), '-i', path.join(dir, '%05d.jpg')];
  const enc = ['-c:v', 'libx264', '-crf', '16', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-r', '30', '-frames:v', String(nOut), o];
  if (s.type === 'card') {
    ff([...inp, '-vf', `scale=1920:1080:flags=lanczos,tpad=stop_mode=clone:stop_duration=2,format=yuv420p`, ...enc]);
  } else {
    const app = s.type === 'app';
    const place = app ? 'scale=1600:900:flags=lanczos,format=rgba' : 'scale=-2:840:flags=lanczos,pad=430:860:10:10:color=0x0b0b10,format=rgba';
    const [px, py] = app ? [160, 150] : [745, 170];
    ff(['-loop', '1', '-i', W(app ? 'stage-app.png' : 'stage-phone.png'), ...inp, '-loop', '1', '-i', W(app ? 'mask-app.png' : 'mask-phone.png'), '-shortest', '-filter_complex',
      `[1:v]${place}[a0];[2:v]format=gray[m];[a0][m]alphamerge[win];[0:v][win]overlay=${px}:${py}:format=auto[t1];[t1]${caption(s, s.secs)},format=yuv420p[v]`, '-map', '[v]', ...enc]);
  }
  parts.push(o); console.log('cut', s.name, s.secs + 's');
}
fs.writeFileSync(path.join(tmp, 'cuts.txt'), parts.map((p) => "file '" + fwd(p) + "'").join('\n'));
const silent = path.join(tmp, 'brag-silent.mp4');
ff(['-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'cuts.txt'), '-c', 'copy', silent]);

// poster: a settled frame (the Board view, caption fully in), pulled out and baked in as frame 0 of the video
const poster = path.join(outDir, 'brag.jpg');
ff(['-ss', '12.9', '-i', silent, '-frames:v', '1', '-q:v', '2', poster]);
const withPoster = path.join(tmp, 'brag-poster.mp4');
ff(['-i', silent, '-i', poster, '-filter_complex', '[1:v]scale=1920:1080,format=yuv420p,fps=30,trim=end_frame=1,setpts=PTS-STARTPTS[p];[0:v]trim=start_frame=1,setpts=PTS-STARTPTS[v];[p][v]concat=n=2:v=1:a=0[o]', '-map', '[o]', '-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-r', '30', withPoster]);
ff(['-i', withPoster, '-i', music, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', path.join(outDir, 'brag.mp4')]);
console.log('written', path.join(outDir, 'brag.mp4'));

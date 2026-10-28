/* NullMotion-style breakdown of the Blockpad launch cut: brag.mp4 plays on top, full width; seven plain black-and-white
   "draft" scenes (one per section of the storyboard in tools/encode-brag.js) sit in a row underneath, each a flat,
   Arial, one-idea sketch of that section before the polish. A playhead sweeps the row and the live section gets an
   orange outline, exactly the device NullMotion's own README describes ("the draft... gets an orange outline").
   This reimplements that documented technique directly (scene-synced drafts, frame-accurate combined export) rather
   than running NullMotion's own server: its importer expects another tool's (MotionClone's) export format, and its
   export path drives a live Chromium tab through WebCodecs, which this project's own render pipeline already covers
   with ffmpeg. No NullMotion code ships here.
     node tools/make-breakdown.js        (needs brag-output/brag.mp4 already built, and ffmpeg on PATH) */
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..'); const outDir = path.join(root, 'brag-output'); const work = path.join(outDir, 'work');
fs.mkdirSync(work, { recursive: true });
const ff = (a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a], { stdio: ['ignore', 'inherit', 'inherit'] });
const ARIAL = 'C\\:/Windows/Fonts/arial.ttf', ARIALB = 'C\\:/Windows/Fonts/arialbd.ttf';
const DW = 480, DH = 270;      // one draft's native canvas (16:9)

/* the same seven sections as the launch cut's storyboard (tools/encode-brag.js), same timings */
const SECTIONS = [
  { name: 'hook', start: 0, end: 2.0, label: 'WRITE', draw: (b) => [
    box(b, 60, 64, 360, 16), box(b, 60, 96, 300, 16), box(b, 60, 128, 330, 16) ] },
  { name: 'reveal', start: 2.0, end: 5.5, label: 'BLOCKPAD', draw: (b) => [ box(b, 195, 70, 90, 90) ] },
  { name: 'write', start: 5.5, end: 9.5, label: 'OUTLINE', draw: (b) => [
    box(b, 60, 56, 200, 26), box(b, 60, 96, 360, 14), box(b, 60, 122, 300, 14), box(b, 60, 148, 330, 14) ] },
  { name: 'data', start: 9.5, end: 13.5, label: 'TABLE', draw: (b) => {
    const r = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r.push(box(b, 60 + j * 128, 48 + i * 52, 112, 40)); return r; } },
  { name: 'phone', start: 13.5, end: 17.5, label: 'PHONE', draw: (b) => [
    outline(b, 190, 30, 100, 210, 5), box(b, 206, 60, 68, 10), box(b, 206, 80, 68, 10), box(b, 206, 100, 50, 10) ] },
  { name: 'private', start: 17.5, end: 20.0, label: 'PRIVATE', draw: (b) => [0, 1, 2, 3].map((i) => outline(b, 40 + i * 105, 110, 90, 36, 4)) },
  { name: 'end', start: 20.0, end: 24.0, label: 'GET IT', draw: (b) => [ box(b, 210, 50, 60, 60), box(b, 140, 150, 200, 8) ] },
];
const box = (b, x, y, w, h) => `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=white@0.92:t=fill`;
const outline = (b, x, y, w, h, t) => `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=white@0.92:t=${t}`;

// 1) one PNG per section: plain black background, flat white shapes, a short Arial caption at the bottom
SECTIONS.forEach((s) => {
  const shapes = s.draw().join(',');
  const png = path.join(work, 'draft-' + s.name + '.png');
  ff(['-f', 'lavfi', '-i', `color=c=black:s=${DW}x${DH}`, '-vf',
    `${shapes},drawtext=fontfile='${ARIALB}':text='${s.label}':fontsize=30:fontcolor=white@0.85:x=(w-text_w)/2:y=${DH - 44}`,
    '-frames:v', '1', png]);
  console.log('draft', s.name);
});

// 2) layout: film letterboxed (no distortion) over a gradient plate; the seven drafts in a flat dark strip underneath
const FILM_H = 980, FILM_W = Math.round(FILM_H * 1920 / 1080 / 2) * 2, PAD_X = Math.round((1920 - FILM_W) / 2);
const STRIP_H = 340, GAP = 14, MARGIN = 18;
const DRAFT_W = Math.floor((1920 - 2 * MARGIN - 6 * GAP) / 7), DRAFT_H = Math.round(DRAFT_W * 9 / 16);
const DRAFT_Y = FILM_H + Math.round((STRIP_H - DRAFT_H) / 2);
const slotX = (i) => MARGIN + i * (DRAFT_W + GAP);
const CANVAS_H = FILM_H + STRIP_H;

ff(['-f', 'lavfi', '-i', `gradients=s=1920x${FILM_H}:c0=0x2a2570:c1=0x0e0c2b:x0=${Math.round(1920 * 0.2)}:y0=0:x1=1920:y1=${FILM_H}:type=radial:d=1:r=1`, '-frames:v', '1', path.join(work, 'bk-top.png')]);
ff(['-f', 'lavfi', '-i', `color=c=0x0b0a1f:s=1920x${STRIP_H}`, '-frames:v', '1', path.join(work, 'bk-strip.png')]);
ff(['-f', 'lavfi', '-i', `color=c=white@0.9:s=3x${STRIP_H}`, '-frames:v', '1', path.join(work, 'playhead.png')]);   // a thin bar; its *position* is animated via overlay's x expression below (drawbox's x expression does not reliably track t in this ffmpeg build)
ff(['-i', path.join(work, 'bk-top.png'), '-i', path.join(work, 'bk-strip.png'), '-filter_complex',
  `[0:v][1:v]vstack=2,drawbox=x=0:y=${FILM_H}:w=1920:h=2:color=0x3a3570,` +
  `drawtext=fontfile='${ARIAL}':text='How it was planned':fontsize=24:fontcolor=0x9a93d8:x=${MARGIN}:y=${FILM_H + 14}[o]`,
  '-map', '[o]', path.join(work, 'bk-canvas.png')]);

const inputs = ['-loop', '1', '-i', path.join(work, 'bk-canvas.png'), '-i', path.join(outDir, 'brag.mp4'), '-loop', '1', '-i', path.join(work, 'playhead.png')];
SECTIONS.forEach((s) => inputs.push('-loop', '1', '-i', path.join(work, 'draft-' + s.name + '.png')));
let chain = `[1:v]scale=${FILM_W}:${FILM_H}[film];[0:v][film]overlay=${PAD_X}:0[c0];`;
SECTIONS.forEach((s, i) => {
  chain += `[${i + 3}:v]scale=${DRAFT_W}:${DRAFT_H}[d${i}];[c${i}][d${i}]overlay=${slotX(i)}:${DRAFT_Y}[c${i + 1}];`;
});
let last = `c${SECTIONS.length}`;
SECTIONS.forEach((s, i) => {
  chain += `[${last}]drawbox=x=${slotX(i) - 4}:y=${DRAFT_Y - 4}:w=${DRAFT_W + 8}:h=${DRAFT_H + 8}:color=0xffb454:t=4:enable='between(t,${s.start},${s.end})'[h${i}];`;
  last = `h${i}`;
});
// the playhead: a thin bar swept across the strip by overlay's x expression (overlay evaluates x per-frame by default; drawbox's x does not track t reliably in this ffmpeg build)
chain += `[${last}][2:v]overlay=x='t/24*${1920 - 3}':y=${FILM_H},format=yuv420p[v]`;

ff([...inputs, '-filter_complex', chain, '-map', '[v]', '-map', '1:a', '-c:v', 'libx264', '-crf', '17', '-preset', 'medium',
  '-c:a', 'aac', '-b:a', '192k', '-shortest', '-r', '30', '-t', '24', '-movflags', '+faststart', path.join(outDir, 'brag-breakdown.mp4')]);
console.log('written', path.join(outDir, 'brag-breakdown.mp4'), CANVAS_H + 'px tall');

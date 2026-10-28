/* NullMotion-style breakdown of the full 54s Blockpad walkthrough (promo/blockpad-promo.mp4): the finished, now-scored
   film plays on top, full width; nine plain black-and-white "draft" scenes (one per real section of the walkthrough)
   sit in a row underneath, each a flat, one-idea sketch of that section before the polish; a playhead sweeps the row
   and the live section gets an orange outline. Same device as tools/make-breakdown.js (see that file for why this
   reimplements NullMotion's documented technique directly rather than running its server), generalized from 7
   sections to this film's real 9.
     node tools/make-promo-breakdown.js   (needs promo/blockpad-promo.mp4 already built, and ffmpeg on PATH) */
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..'); const promoDir = path.join(root, 'promo'); const work = path.join(root, 'brag-output', 'work', 'promo-breakdown');
fs.mkdirSync(work, { recursive: true });
const ff = (a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a], { stdio: ['ignore', 'inherit', 'inherit'] });
const ARIAL = 'C\\:/Windows/Fonts/arial.ttf', ARIALB = 'C\\:/Windows/Fonts/arialbd.ttf';
const DW = 480, DH = 270;
const DUR = 54.0;

/* the real nine sections of the walkthrough (tools/make-promo.js / tools/encode-promo.js), same timings */
const SECTIONS = [
  { name: 'intro', start: 0, end: 3.200, label: 'BLOCKPAD', draw: (b) => [ box(b, 195, 70, 90, 90) ] },
  { name: 'write', start: 3.200, end: 12.667, label: 'OUTLINE', draw: (b) => [
    box(b, 60, 56, 200, 26), box(b, 60, 96, 360, 14), box(b, 60, 122, 300, 14), box(b, 60, 148, 330, 14) ] },
  { name: 'database', start: 12.667, end: 19.000, label: 'TABLE', draw: () => {
    const r = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r.push(box(null, 60 + j * 128, 48 + i * 52, 112, 40)); return r; } },
  { name: 'theme', start: 19.000, end: 22.667, label: 'THEME', draw: (b) => [ outline(b, 130, 60, 100, 100, 5), outline(b, 250, 60, 100, 100, 5) ] },
  { name: 'comments', start: 22.667, end: 30.333, label: 'COMMENTS', draw: (b) => [
    outline(b, 110, 50, 260, 130, 5), box(b, 150, 60, 200, 16), box(b, 150, 86, 160, 16), box(b, 150, 112, 60, 40) ] },
  { name: 'share', start: 30.333, end: 35.333, label: 'SHARE', draw: (b) => [
    outline(b, 90, 90, 90, 90, 5), outline(b, 300, 90, 90, 90, 5), box(b, 218, 125, 44, 20) ] },
  { name: 'phone', start: 35.333, end: 46.333, label: 'PHONE', draw: (b) => [
    outline(b, 190, 30, 100, 210, 5), box(b, 206, 60, 68, 10), box(b, 206, 80, 68, 10), box(b, 206, 100, 50, 10) ] },
  { name: 'private', start: 46.333, end: 49.667, label: 'PRIVATE', draw: (b) => [0, 1, 2, 3].map((i) => outline(b, 40 + i * 105, 110, 90, 36, 4)) },
  { name: 'end', start: 49.667, end: 54.000, label: 'GET IT', draw: (b) => [ box(b, 210, 50, 60, 60), box(b, 140, 150, 200, 8) ] },
];
const box = (b, x, y, w, h) => `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=white@0.92:t=fill`;
const outline = (b, x, y, w, h, t) => `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=white@0.92:t=${t}`;

SECTIONS.forEach((s) => {
  const shapes = s.draw().join(',');
  const png = path.join(work, 'draft-' + s.name + '.png');
  ff(['-f', 'lavfi', '-i', `color=c=black:s=${DW}x${DH}`, '-vf',
    `${shapes},drawtext=fontfile='${ARIALB}':text='${s.label}':fontsize=28:fontcolor=white@0.85:x=(w-text_w)/2:y=${DH - 40}`,
    '-frames:v', '1', png]);
  console.log('draft', s.name);
});

const FILM_H = 980, FILM_W = Math.round(FILM_H * 1920 / 1080 / 2) * 2, PAD_X = Math.round((1920 - FILM_W) / 2);
const STRIP_H = 340, GAP = 10, MARGIN = 16, N = SECTIONS.length;
const DRAFT_W = Math.floor((1920 - 2 * MARGIN - (N - 1) * GAP) / N), DRAFT_H = Math.round(DRAFT_W * 9 / 16);
const DRAFT_Y = FILM_H + Math.round((STRIP_H - DRAFT_H) / 2);
const slotX = (i) => MARGIN + i * (DRAFT_W + GAP);
const CANVAS_H = FILM_H + STRIP_H;

ff(['-f', 'lavfi', '-i', `gradients=s=1920x${FILM_H}:c0=0x2a2570:c1=0x0e0c2b:x0=${Math.round(1920 * 0.2)}:y0=0:x1=1920:y1=${FILM_H}:type=radial:d=1:r=1`, '-frames:v', '1', path.join(work, 'bk-top.png')]);
ff(['-f', 'lavfi', '-i', `color=c=0x0b0a1f:s=1920x${STRIP_H}`, '-frames:v', '1', path.join(work, 'bk-strip.png')]);
ff(['-f', 'lavfi', '-i', `color=c=white@0.9:s=3x${STRIP_H}`, '-frames:v', '1', path.join(work, 'playhead.png')]);
ff(['-i', path.join(work, 'bk-top.png'), '-i', path.join(work, 'bk-strip.png'), '-filter_complex',
  `[0:v][1:v]vstack=2,drawbox=x=0:y=${FILM_H}:w=1920:h=2:color=0x3a3570,` +
  `drawtext=fontfile='${ARIAL}':text='How it was planned':fontsize=24:fontcolor=0x9a93d8:x=${MARGIN}:y=${FILM_H + 14}[o]`,
  '-map', '[o]', path.join(work, 'bk-canvas.png')]);

const inputs = ['-loop', '1', '-i', path.join(work, 'bk-canvas.png'), '-i', path.join(promoDir, 'blockpad-promo.mp4'), '-loop', '1', '-i', path.join(work, 'playhead.png')];
SECTIONS.forEach((s) => inputs.push('-loop', '1', '-i', path.join(work, 'draft-' + s.name + '.png')));
let chain = `[1:v]scale=${FILM_W}:${FILM_H}[film];[0:v][film]overlay=${PAD_X}:0[c0];`;
SECTIONS.forEach((s, i) => {
  chain += `[${i + 3}:v]scale=${DRAFT_W}:${DRAFT_H}[d${i}];[c${i}][d${i}]overlay=${slotX(i)}:${DRAFT_Y}[c${i + 1}];`;
});
let last = `c${SECTIONS.length}`;
SECTIONS.forEach((s, i) => {
  chain += `[${last}]drawbox=x=${slotX(i) - 3}:y=${DRAFT_Y - 3}:w=${DRAFT_W + 6}:h=${DRAFT_H + 6}:color=0xffb454:t=3:enable='between(t,${s.start},${s.end})'[h${i}];`;
  last = `h${i}`;
});
chain += `[${last}][2:v]overlay=x='t/${DUR}*${1920 - 3}':y=${FILM_H},format=yuv420p[v]`;

ff([...inputs, '-filter_complex', chain, '-map', '[v]', '-map', '1:a', '-c:v', 'libx264', '-crf', '17', '-preset', 'medium',
  '-c:a', 'aac', '-b:a', '192k', '-shortest', '-r', '30', '-t', String(DUR), '-movflags', '+faststart', path.join(promoDir, 'blockpad-promo-breakdown.mp4')]);
console.log('written', path.join(promoDir, 'blockpad-promo-breakdown.mp4'), CANVAS_H + 'px tall');

/* Blockpad built-in AI: a tiny open-weight model run by a bundled llama.cpp server on THIS computer.
   No account, no API key, no network while you use it. The engine is a separate process, so Stop frees all of its memory.
   Guards: it only listens on 127.0.0.1 with a random per-run key, the model is sized to your RAM limit, a watchdog stops it
   if it ever goes over the limit, and it shuts itself down when idle. Models are downloaded once, on request, from Hugging Face. */
const { app, net } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');

const MB = 1024 * 1024;
// kv = bytes of KV-cache per context token (layers x kv-heads x head-dim x 2 x 2 bytes), size = approximate file size
const MODELS = [
  { id: 'nano', name: 'SmolLM2 360M (nano, fastest)', file: 'smollm2-360m-instruct-q4_k_m.gguf', url: 'https://huggingface.co/bartowski/SmolLM2-360M-Instruct-GGUF/resolve/main/SmolLM2-360M-Instruct-Q4_K_M.gguf', size: 270590880, kv: 40960 },
  { id: 'tiny', name: 'Qwen2.5 0.5B (tiny, recommended)', file: 'qwen2.5-0.5b-instruct-q4_k_m.gguf', url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf', size: 491400032, kv: 12288 },
  { id: 'small', name: 'Qwen2.5 1.5B (small, smarter)', file: 'qwen2.5-1.5b-instruct-q4_k_m.gguf', url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf', size: 1117320736, kv: 28672 },
];
const OVERHEAD = 130 * MB;       // server buffers on top of weights + KV cache
const MIN_CTX = 1024, MAX_CTX = 8192;

const S = { state: 'stopped', proc: null, port: 0, key: '', model: '', pid: 0, rss: 0, budget: 0, ctx: 0, threads: 0, error: '', lastUse: 0, idleMin: 10, startedAt: 0, starting: null };
let dl = null;                    // { id, done, total, ctl }
let emitFn = () => {};
let watch = null;

const modelDir = () => process.env.BP_LLM_DIR || path.join(app.getPath('userData'), 'ai', 'models');
// one engine folder per platform: engine/win32-x64, engine/linux-x64, engine/darwin-arm64, engine/darwin-x64
// (packaged builds keep it outside app.asar: a program cannot be launched from inside an archive)
const IS_WIN = process.platform === 'win32';
const engineDir = () => path.join(__dirname.replace(/app\.asar(?![.\w])/, 'app.asar.unpacked'), 'engine', process.platform + '-' + process.arch);
const serverExe = () => path.join(engineDir(), IS_WIN ? 'llama-server.exe' : 'llama-server');
const modelPath = (m) => path.join(modelDir(), m.file);
const catalog = (id) => MODELS.find((m) => m.id === id);
const installed = (m) => { try { const st = fs.statSync(modelPath(m)); return st.size > m.size * 0.9; } catch (_) { return false; } };
const totalRam = () => os.totalmem();
const budgetFor = (pct) => Math.floor(totalRam() * Math.max(5, Math.min(40, +pct || 15)) / 100);

function plan(m, pct) {
  const budget = budgetFor(pct);
  const room = budget - m.size - OVERHEAD;
  let ctx = Math.min(MAX_CTX, Math.floor(room / m.kv / 256) * 256);
  return { budget, ctx, ok: ctx >= MIN_CTX, need: m.size + OVERHEAD + MIN_CTX * m.kv };
}

function status() {
  return {
    state: S.state, model: S.model, pid: S.pid, rssMB: Math.round(S.rss / MB), budgetMB: Math.round((S.budget || 0) / MB), ctx: S.ctx, threads: S.threads, error: S.error,
    totalMB: Math.round(totalRam() / MB), engine: fs.existsSync(serverExe()),
    models: MODELS.map((m) => ({ id: m.id, name: m.name, sizeMB: Math.round(m.size / MB), installed: installed(m), needMB: Math.round((m.size + OVERHEAD + MIN_CTX * m.kv) / MB) })),
    download: dl ? { id: dl.id, done: dl.done, total: dl.total } : null,
  };
}
const emit = () => { try { emitFn(status()); } catch (_) {} };
const setState = (st, err) => { S.state = st; if (err !== undefined) S.error = err; emit(); };

/* resident memory of the engine process, read from the OS (works without extra packages) */
function sampleRss(pid) {
  return new Promise((resolve) => {
    if (!IS_WIN) {      // Linux and macOS: ps reports resident memory in KB
      return execFile('ps', ['-o', 'rss=', '-p', String(pid)], { timeout: 4000 }, (err, out) => { const kb = err ? 0 : parseInt(String(out).trim(), 10); resolve(kb ? kb * 1024 : 0); });
    }
    execFile('tasklist', ['/FI', 'PID eq ' + pid, '/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 4000 }, (err, out) => {
      if (err) return resolve(0);
      const cells = String(out).trim().split('","');
      const kb = parseInt((cells[4] || '').replace(/\D/g, ''), 10);
      resolve(kb ? kb * 1024 : 0);
    });
  });
}

function startWatchdog() {
  stopWatchdog();
  watch = setInterval(async () => {
    if (!S.proc) return stopWatchdog();
    const rss = await sampleRss(S.pid);
    if (rss) S.rss = rss;
    if (S.state === 'running' && rss && rss > S.budget * 1.02) { stop('Stopped: the AI went over your ' + Math.round(S.budget / MB) + ' MB memory limit.'); return; }
    if (S.state === 'running' && S.idleMin > 0 && Date.now() - S.lastUse > S.idleMin * 60000) { stop('Stopped after ' + S.idleMin + ' idle minutes to free memory.'); return; }
    emit();
  }, 3000);
}
function stopWatchdog() { if (watch) { clearInterval(watch); watch = null; } }

function killTree(proc) {
  if (!proc || !proc.pid) return;
  try { proc.kill(); } catch (_) {}
  if (IS_WIN) { try { execFile('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { windowsHide: true }, () => {}); } catch (_) {} }
  else setTimeout(() => { try { process.kill(proc.pid, 'SIGKILL'); } catch (_) {} }, 1500);       // if it ignored SIGTERM
}

async function stop(reason) {
  const p = S.proc;
  S.proc = null; S.starting = null;
  stopWatchdog();
  if (p) { setState('stopping'); killTree(p); await new Promise((r) => setTimeout(r, 250)); }
  S.pid = 0; S.rss = 0; S.port = 0; S.key = '';
  setState('stopped', reason || '');
  return status();
}
function stopSync() { const p = S.proc; S.proc = null; stopWatchdog(); killTree(p); }

async function waitHealthy(port, key, proc, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (S.proc !== proc || proc.exitCode !== null) return false;
    try {
      const r = await net.fetch('http://127.0.0.1:' + port + '/health', { headers: { authorization: 'Bearer ' + key } });
      if (r.ok) return true;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}
const freePort = () => new Promise((resolve) => { const s = require('net').createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });

/* cfg: { model: 'tiny', ramPct: 10..25, idleMin: minutes (0 = never), threads?: n } */
function start(cfg) {
  cfg = cfg || {};
  if (S.state === 'running') { S.lastUse = Date.now(); return Promise.resolve(status()); }
  if (S.starting) return S.starting;
  S.starting = (async () => {
    const m = catalog(cfg.model || 'tiny');
    if (!m) return fail('Unknown model');
    if (!fs.existsSync(serverExe())) return fail('The AI engine files are missing from this install (engine/llama-server.exe).');
    if (!installed(m)) return fail('The model “' + m.name + '” is not downloaded yet. Open Settings → AI and press Download.');
    const pl = plan(m, cfg.ramPct);
    S.budget = pl.budget;
    if (!pl.ok) return fail('Not enough memory for “' + m.name + '” inside a ' + Math.round(pl.budget / MB) + ' MB limit (needs about ' + Math.round(pl.need / MB) + ' MB). Raise the limit or pick a smaller model.');
    const cores = os.cpus().length || 4;
    const threads = Math.max(1, Math.min(+cfg.threads || Math.floor(cores / 4), 6));
    const port = await freePort();
    const key = crypto.randomBytes(18).toString('hex');
    setState('starting', '');
    const args = ['-m', modelPath(m), '--host', '127.0.0.1', '--port', String(port), '--api-key', key, '-c', String(pl.ctx), '-t', String(threads), '-lm', 'none', '-np', '1', '-cram', '32', '--no-webui', '--no-warmup'];
    let stderr = '';
    const libs = engineDir();
    const env = Object.assign({}, process.env, process.platform === 'linux' ? { LD_LIBRARY_PATH: libs + (process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : '') } : process.platform === 'darwin' ? { DYLD_LIBRARY_PATH: libs } : {});
    try { if (!IS_WIN) fs.chmodSync(serverExe(), 0o755); } catch (_) {}
    const proc = spawn(serverExe(), args, { cwd: engineDir(), env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    S.proc = proc; S.pid = proc.pid; S.port = port; S.key = key; S.model = m.id; S.ctx = pl.ctx; S.threads = threads; S.idleMin = cfg.idleMin == null ? 10 : +cfg.idleMin; S.lastUse = Date.now(); S.startedAt = Date.now();
    proc.stderr.on('data', (d) => { stderr = (stderr + d).slice(-1500); });
    proc.on('error', (e) => { if (S.proc === proc) { S.proc = null; fail('Could not start the engine: ' + e.message); } });
    proc.on('exit', (code) => { if (S.proc === proc) { S.proc = null; stopWatchdog(); S.pid = 0; S.rss = 0; setState('error', 'The AI engine stopped unexpectedly (code ' + code + '). ' + (stderr.split('\n').filter(Boolean).pop() || '')); } });
    try { os.setPriority(proc.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch (_) {}   // keep the laptop responsive
    const ok = await waitHealthy(port, key, proc, 90000);
    if (!ok) { if (S.proc === proc) { killTree(proc); S.proc = null; } return fail(S.state === 'error' ? S.error : 'The AI engine did not become ready in time.'); }
    S.rss = (await sampleRss(proc.pid)) || S.rss;
    startWatchdog();
    setState('running', '');
    return status();
  })().finally(() => { S.starting = null; });
  return S.starting;
}
function fail(msg) { S.proc = null; S.pid = 0; S.rss = 0; setState('error', msg); return status(); }

/* one chat completion against the running engine (auto-start is decided by the caller through cfg.autoStart) */
async function chat(messages, cfg) {
  cfg = cfg || {};
  if (S.state !== 'running') {
    if (!cfg.autoStart) return { error: 'The built-in AI is stopped. Start it in Settings → AI (or the 🧠 button).' };
    const st = await start(cfg);
    if (st.state !== 'running') return { error: st.error || 'Could not start the built-in AI.' };
  }
  S.lastUse = Date.now();
  // keep the prompt inside the context window (about 3 characters per token), cutting the oldest part of the longest message
  const budgetChars = Math.max(800, (S.ctx - 600) * 3);
  let msgs = (messages || []).map((m) => ({ role: m.role, content: String(m.content || '') }));
  let total = msgs.reduce((n, m) => n + m.content.length, 0);
  if (total > budgetChars) {
    const i = msgs.reduce((best, m, k) => (m.content.length > msgs[best].content.length ? k : best), 0);
    const keep = Math.max(200, msgs[i].content.length - (total - budgetChars));
    msgs[i].content = '…' + msgs[i].content.slice(-keep);
  }
  const CJK = /[぀-ヿ㐀-鿿가-힯]/;
  const inputHasCjk = msgs.some((m) => CJK.test(m.content));
  const ask = async (list, temperature) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 180000);
    const res = await net.fetch('http://127.0.0.1:' + S.port + '/v1/chat/completions', { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + S.key }, body: JSON.stringify({ model: 'local', messages: list, temperature, top_p: 0.9, repeat_penalty: 1.1, max_tokens: Math.min(cfg.maxTokens || 1024, Math.max(128, S.ctx - Math.ceil(total / 3) - 64)), stream: false }) });
    clearTimeout(timer);
    const txt = await res.text();
    S.lastUse = Date.now();
    if (!res.ok) return { error: 'AI engine HTTP ' + res.status + ' ' + txt.slice(0, 160) };
    const j = JSON.parse(txt);
    const out = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    return out && out.trim() ? { text: out.trim() } : { error: 'The model returned an empty response' };
  };
  try {
    const temp = typeof cfg.temperature === 'number' ? cfg.temperature : 0.4;
    let r = await ask(msgs, temp);
    // small Qwen models sometimes slip into Chinese on English input: retry once, firmly, in English
    for (let k = 0; k < 3 && r.text && !inputHasCjk && CJK.test(r.text); k++) {
      const last = msgs.length - 1;
      const fixed = msgs.map((m, i) => (i === last ? { role: m.role, content: m.content + '\n\n(Answer in English only.)' } : m));
      r = await ask(fixed, [0.1, 0.6, 0.9][k]);   // vary it, or a greedy retry repeats the same slip
    }
    if (r.text && !inputHasCjk && CJK.test(r.text)) return { error: 'The model kept answering in another language. Try again or pick a larger model.' };
    return r;
  } catch (e) { return { error: e.name === 'AbortError' ? 'The built-in AI timed out' : e.message }; }
}

/* ---- model download (resumable; verified by size and the GGUF header) ---- */
async function download(id) {
  const m = catalog(id);
  if (!m) return { error: 'Unknown model' };
  if (dl) return { error: 'A download is already running' };
  fs.mkdirSync(modelDir(), { recursive: true });
  const part = modelPath(m) + '.part';
  const ctl = new AbortController();
  dl = { id, done: 0, total: m.size, ctl };
  try {
    let have = 0; try { have = fs.statSync(part).size; } catch (_) {}
    const res = await net.fetch(m.url, { signal: ctl.signal, headers: have ? { range: 'bytes=' + have + '-' } : {} });
    if (!res.ok && res.status !== 206) throw new Error('Download failed: HTTP ' + res.status);
    if (res.status === 200) have = 0;     // server ignored the range, start over
    const len = +res.headers.get('content-length') || 0;
    if (len) dl.total = have + len;
    const fd = fs.openSync(part, have ? 'r+' : 'w');
    let pos = have; dl.done = have;
    let last = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      fs.writeSync(fd, value, 0, value.length, pos);
      pos += value.length; dl.done = pos;
      if (Date.now() - last > 300) { last = Date.now(); emit(); }
    }
    fs.closeSync(fd);
    const head = Buffer.alloc(4); const f = fs.openSync(part, 'r'); fs.readSync(f, head, 0, 4, 0); fs.closeSync(f);
    if (head.toString('latin1') !== 'GGUF') { fs.unlinkSync(part); throw new Error('The downloaded file is not a valid model'); }
    if (dl.total && pos < dl.total) throw new Error('Download was interrupted — press Download again to resume');
    fs.renameSync(part, modelPath(m));
    dl = null; emit();
    return { ok: true };
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'Download cancelled (partial file kept, you can resume)' : e.message;
    dl = null; emit();
    return { error: msg };
  }
}
function cancelDownload() { if (dl) dl.ctl.abort(); return { ok: true }; }
async function remove(id) {
  const m = catalog(id);
  if (!m) return { error: 'Unknown model' };
  if (S.state !== 'stopped' && S.model === id) await stop();
  try { fs.unlinkSync(modelPath(m)); } catch (_) {}
  try { fs.unlinkSync(modelPath(m) + '.part'); } catch (_) {}
  emit();
  return { ok: true };
}

function init(ipcMain, onEmit) {
  emitFn = onEmit;
  ipcMain.handle('llm:status', async () => { if (S.proc) S.rss = (await sampleRss(S.pid)) || S.rss; return status(); });
  ipcMain.handle('llm:start', (_e, cfg) => start(cfg));
  ipcMain.handle('llm:stop', () => stop());
  ipcMain.handle('llm:download', (_e, id) => download(String(id)));
  ipcMain.handle('llm:cancel', () => cancelDownload());
  ipcMain.handle('llm:remove', (_e, id) => remove(String(id)));
  app.on('before-quit', stopSync);
  app.on('will-quit', stopSync);
  process.on('exit', stopSync);
}

module.exports = { init, chat, stop, stopSync, status, MODELS, plan };

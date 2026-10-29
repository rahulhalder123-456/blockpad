const { app, BrowserWindow, ipcMain, dialog, Menu, shell, net, session } = require('electron');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

// --smoke=<script.js>: developer test mode. Uses a throwaway data directory and runs a driver script.
const smokeArg = process.argv.find((a) => a.startsWith('--smoke='));
if (process.env.BP_USERDATA) app.setPath('userData', process.env.BP_USERDATA);   // tests: isolated profile without smoke mode
if (smokeArg) app.setPath('userData', process.env.BP_SMOKE_DIR || path.join(require('os').tmpdir(), 'blockpad-smoke-' + Date.now()));
else if (!app.requestSingleInstanceLock()) app.quit();

/* ---- where the workspace file lives (default: app data; can be moved to a synced folder) ---- */
const configFile = () => path.join(app.getPath('userData'), 'config.json');
const readConfig = () => { try { return JSON.parse(fs.readFileSync(configFile(), 'utf8')); } catch (_) { return {}; } };
const writeConfig = (c) => { try { fs.mkdirSync(path.dirname(configFile()), { recursive: true }); fs.writeFileSync(configFile(), JSON.stringify(c)); } catch (_) {} };
const defaultDir = () => path.join(app.getPath('userData'), 'data');
const dataDir = () => { const d = readConfig().dataDir; return d && fs.existsSync(d) ? d : defaultDir(); };
const dataFile = () => path.join(dataDir(), 'workspace.json');

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 520,
    backgroundColor: '#17143f',
    title: 'Blockpad',
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });
}

if (process.platform === 'win32') app.setAppUserModelId('app.blockpad.desktop');      // stable taskbar identity (icon, pinning, grouping)
app.whenReady().then(() => {
  // macOS needs a real menu for Cmd+C/V/X/Z/Q to work in text fields; the other platforms run without one
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] },
      { role: 'windowMenu' },
    ]));
  } else Menu.setApplicationMenu(null);
  // microphone (audio blocks) and clipboard (paste copied blocks) are the only permissions the app asks for
  const allowed = ['media', 'clipboard-read', 'clipboard-sanitized-write'];
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(allowed.includes(perm)));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => allowed.includes(perm));
  fs.mkdirSync(dataDir(), { recursive: true });
  try { if (fs.existsSync(dataFile())) fs.copyFileSync(dataFile(), path.join(dataDir(), 'workspace.bak.json')); } catch (_) {}
  try { const hf = dataFile().replace(/\.json$/i, '') + '.history.json'; if (fs.existsSync(hf)) fs.copyFileSync(hf, path.join(dataDir(), 'workspace.history.bak.json')); } catch (_) {}
  createWindow();
  if (!smokeArg) {
    try {
      if (app.isPackaged) app.setAsDefaultProtocolClient('blockpad');
      else if (process.defaultApp && process.argv.length >= 2) app.setAsDefaultProtocolClient('blockpad', process.execPath, [path.resolve(process.argv[1])]);
    } catch (_) {}
    const first = linkIn(process.argv); if (first) deliverLink(first);
  }
  if (smokeArg && process.env.BP_SMOKE_LINK) deliverLink(process.env.BP_SMOKE_LINK);   // tests: behave as if the OS opened this link
  watchWorkspace();
  if (smokeArg) runSmoke(smokeArg.slice(8));
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});
/* ---- blockpad:// share links: only an installed Blockpad can open them (there is no web page behind a link) ---- */
let rendererReady = false;
const pendingLinks = [];
const linkIn = (argv) => (argv || []).find((a) => /^blockpad:\/\//i.test(a));
function deliverLink(url) {
  if (process.env.BP_LINK_LOG) { try { fs.appendFileSync(process.env.BP_LINK_LOG, url + '\n'); } catch (_) {} }
  if (win && !win.isDestroyed() && rendererReady) win.webContents.send('app:link', url); else pendingLinks.push(url);
}
ipcMain.handle('app:ready', () => { rendererReady = true; pendingLinks.splice(0).forEach(deliverLink); return true; });
app.on('open-url', (e, url) => { e.preventDefault(); if (/^blockpad:\/\//i.test(url)) deliverLink(url); });   // macOS delivers links here
app.on('second-instance', (_e, argv) => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  const l = linkIn(argv); if (l) deliverLink(l);
});
app.on('window-all-closed', () => { stopApi(); localAi.stopSync(); p2p.stopAll(); app.quit(); });
app.on('before-quit', () => { try { localAi.stopSync(); } catch (_) {} });

async function runSmoke(script) {
  const wc = win.webContents;
  const logs = [];
  wc.on('console-message', (_e, level, msg, line, src) => level >= 2 && logs.push(`[${level}] ${msg} (${path.basename(src || '')}:${line})`));
  wc.on('render-process-gone', (_e, d) => logs.push('RENDER GONE ' + d.reason));
  await new Promise((r) => wc.once('did-finish-load', r));
  const helpers = {
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    eval: (code) => wc.executeJavaScript(code, true),
    shot: async (file) => { fs.writeFileSync(file, (await wc.capturePage()).toPNG()); },
    key: (keyCode, modifiers) => { wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers: modifiers || [] }); wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers: modifiers || [] }); },
    type: async (text) => { for (const ch of text) { wc.sendInputEvent({ type: 'char', keyCode: ch }); await helpers.wait(8); } },
    click: (x, y) => { wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 }); },
    logs,
  };
  let code = 0;
  try {
    await helpers.wait(600);
    await require(script)(helpers);
  } catch (e) {
    console.log('SMOKE FAILED:', e && e.stack ? e.stack : e);
    code = 1;
  }
  console.log('CONSOLE ISSUES:', logs.length ? '\n' + logs.join('\n') : 'none');
  app.exit(code);
}

/* ---- workspace persistence + change detection (for syncing through a shared folder) ---- */
let lastMtime = 0;
const stamp = () => { try { lastMtime = fs.statSync(dataFile()).mtimeMs; } catch (_) {} };
function writeWorkspace(json) {
  const tmp = dataFile() + '.tmp';
  fs.writeFileSync(tmp, json, 'utf8');
  fs.renameSync(tmp, dataFile());
  stamp();
}
let watching = null;
function watchWorkspace() {
  if (watching) fs.unwatchFile(watching);
  watching = dataFile();
  stamp();
  fs.watchFile(watching, { interval: 2000 }, (cur) => {
    if (cur.mtimeMs && cur.mtimeMs !== lastMtime) { lastMtime = cur.mtimeMs; win && win.webContents.send('ws:external'); }
  });
}
ipcMain.handle('ws:load', () => { try { stamp(); return fs.readFileSync(dataFile(), 'utf8'); } catch (_) { return null; } });
// page history lives next to the workspace (workspace.history.json): rewritten only when a version is added, so normal saves stay small
const historyFile = () => dataFile().replace(/\.json$/i, '') + '.history.json';
function writeHistory(json) { const tmp = historyFile() + '.tmp'; fs.writeFileSync(tmp, json, 'utf8'); fs.renameSync(tmp, historyFile()); }
ipcMain.handle('ws:loadHistory', () => { try { return fs.readFileSync(historyFile(), 'utf8'); } catch (_) { return null; } });
ipcMain.handle('ws:saveHistory', (_e, json) => { writeHistory(json); return true; });
ipcMain.on('ws:saveHistorySync', (e, json) => { try { writeHistory(json); e.returnValue = true; } catch (_) { e.returnValue = false; } });
ipcMain.handle('ws:save', (_e, json) => { writeWorkspace(json); return true; });
ipcMain.on('ws:saveSync', (e, json) => { try { writeWorkspace(json); e.returnValue = true; } catch (_) { e.returnValue = false; } });
ipcMain.handle('ws:path', () => dataFile());
ipcMain.handle('ws:reveal', () => shell.showItemInFolder(dataFile()));
ipcMain.handle('ws:chooseDir', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Choose a folder for your workspace (a synced folder works for several devices)', properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const dir = r.filePaths[0];
  const target = path.join(dir, 'workspace.json');
  const existing = fs.existsSync(target);
  return { dir, existing, file: target };
});
ipcMain.handle('ws:setDir', (_e, dir, useExisting) => {
  const c = readConfig();
  const target = path.join(dir, 'workspace.json');
  if (!useExisting || !fs.existsSync(target)) { try { fs.copyFileSync(dataFile(), target); } catch (_) {} try { fs.copyFileSync(historyFile(), path.join(dir, 'workspace.history.json')); } catch (_) {} }
  c.dataDir = dir;
  writeConfig(c);
  watchWorkspace();
  return dataFile();
});
ipcMain.handle('ws:resetDir', () => { const c = readConfig(); delete c.dataDir; writeConfig(c); watchWorkspace(); return dataFile(); });
// in --smoke test mode, saves go to BP_SMOKE_OUT (or the temp folder) instead of opening dialogs
const smokeOut = () => { const d = process.env.BP_SMOKE_OUT || require('os').tmpdir(); fs.mkdirSync(d, { recursive: true }); return d; };
ipcMain.handle('file:save', async (_e, name, content, isBase64) => {
  let target;
  if (smokeArg) target = path.join(smokeOut(), path.basename(name));
  else {
    const r = await dialog.showSaveDialog(win, { defaultPath: name });
    if (r.canceled || !r.filePath) return false;
    target = r.filePath;
  }
  fs.writeFileSync(target, isBase64 ? Buffer.from(content, 'base64') : content, isBase64 ? undefined : 'utf8');
  return target;
});
// real PDF export of what is on screen (the print stylesheet hides the app chrome)
ipcMain.handle('pdf:save', async (_e, name) => {
  const data = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { marginType: 'default' } });
  let target;
  if (smokeArg) target = path.join(smokeOut(), path.basename(name));
  else {
    const r = await dialog.showSaveDialog(win, { defaultPath: name, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (r.canceled || !r.filePath) return false;
    target = r.filePath;
  }
  fs.writeFileSync(target, data);
  return target;
});
// write a set of files (a page tree exported as a folder of Markdown + attachments)
ipcMain.handle('export:folder', async (_e, files) => {
  let dir;
  if (smokeArg) dir = path.join(smokeOut(), 'export-' + Date.now());
  else {
    const r = await dialog.showOpenDialog(win, { title: 'Choose where to save the export', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return false;
    dir = r.filePaths[0];
  }
  let n = 0;
  for (const f of files) {
    const rel = String(f.path).split(/[\\/]+/).filter((s) => s && s !== '.' && s !== '..').map((s) => s.replace(/[<>:"|?*]+/g, '-')).join(path.sep);
    if (!rel) continue;
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, f.base64 ? Buffer.from(f.content, 'base64') : f.content, f.base64 ? undefined : 'utf8');
    n++;
  }
  return { dir, count: n };
});
ipcMain.handle('show:item', (_e, p) => { try { shell.showItemInFolder(p); } catch (_) {} });
ipcMain.handle('devtools', () => win && win.webContents.toggleDevTools());

/* ---- link previews (only runs when you add a bookmark; needs internet) ---- */
const unent = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x27;/g, "'").trim();
ipcMain.handle('update:info', async () => {          // the release manifest the site publishes; fetched here because the page's CSP only allows its own files
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch('https://blockpad-umber.vercel.app/version.json', { cache: 'no-store', signal: ctl.signal }); clearTimeout(t);
    return r.ok ? await r.json() : null;
  } catch (_) { return null; }
});
ipcMain.handle('meta:fetch', async (_e, url) => {
  try {
    if (!/^https?:\/\//i.test(url)) return { error: 'bad url' };
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    const res = await net.fetch(url, { signal: ctl.signal, headers: { 'user-agent': 'Mozilla/5.0 (Blockpad link preview)', accept: 'text/html' } });
    clearTimeout(timer);
    if (!/html/i.test(res.headers.get('content-type') || '')) return { error: 'not html' };
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let html = '', n = 0;
    while (n < 300000) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.length;
      html += dec.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    try { reader.cancel(); } catch (_) {}
    const meta = (p) => {
      const a = new RegExp('<meta[^>]+(?:property|name)=["\']' + p + '["\'][^>]*content=["\']([^"\']*)["\']', 'i').exec(html);
      const b = new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']' + p + '["\']', 'i').exec(html);
      return unent((a || b || [0, ''])[1]);
    };
    const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    let image = meta('og:image') || meta('twitter:image');
    try { if (image) image = new URL(image, url).href; } catch (_) { image = ''; }
    return { title: meta('og:title') || unent(t && t[1]).replace(/\s+/g, ' '), description: meta('og:description') || meta('description'), image, site: meta('og:site_name') };
  } catch (e) { return { error: e.message }; }
});

/* ---- AI: forwards your chat request to the endpoint YOU configured (Ollama, LM Studio, OpenAI-compatible...) ---- */
const p2p = require('./p2p');
p2p.init(ipcMain, (ev) => { try { if (win && !win.isDestroyed()) win.webContents.send('p2p:event', ev); } catch (_) {} });
/* a copy of the installed app (zip) to hand to someone who does not have Blockpad yet */
ipcMain.handle('app:zip', async () => {
  if (!app.isPackaged) return { error: 'This works from the installed app (not from a development run).' };
  if (process.platform !== 'win32') return { error: 'Sending a copy is available on Windows. Share the download page address instead.' };
  const dir = path.dirname(process.execPath);
  let target;
  if (smokeArg) target = path.join(smokeOut(), 'Blockpad-for-a-friend.zip');
  else {
    const r = await dialog.showSaveDialog(win, { title: 'Save a copy of Blockpad', defaultPath: 'Blockpad-for-a-friend.zip', filters: [{ name: 'Zip', extensions: ['zip'] }] });
    if (r.canceled || !r.filePath) return null;
    target = r.filePath;
  }
  return new Promise((resolve) => require('child_process').execFile('tar.exe', ['-a', '-cf', target, '-C', dir, '.'], { windowsHide: true, maxBuffer: 1 << 20 }, (err) => resolve(err ? { error: err.message } : { path: target })));
});
const localAi = require('./localai');
localAi.init(ipcMain, (st) => { try { if (win && !win.isDestroyed()) win.webContents.send('llm:event', st); } catch (_) {} });
ipcMain.handle('ai:chat', async (_e, { provider, local, endpoint, model, key, messages }) => {
  if (provider === 'builtin') return localAi.chat(messages, local);
  try {
    let base = String(endpoint || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(base)) return { error: 'Invalid endpoint URL' };
    const url = /\/chat\/completions$/.test(base) ? base : base + '/chat/completions';
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 180000);
    const res = await net.fetch(url, { method: 'POST', signal: ctl.signal, headers: Object.assign({ 'content-type': 'application/json' }, key ? { authorization: 'Bearer ' + key } : {}), body: JSON.stringify({ model, messages, stream: false, temperature: 0.4 }) });
    clearTimeout(timer);
    const txt = await res.text();
    if (!res.ok) return { error: 'HTTP ' + res.status + ' ' + txt.slice(0, 200) };
    const j = JSON.parse(txt);
    const out = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    return out ? { text: out } : { error: 'The model returned an empty response' };
  } catch (e) { return { error: e.name === 'AbortError' ? 'Timed out' : e.message }; }
});

/* ---- local REST API (off by default; 127.0.0.1 only; bearer token required) ---- */
let apiServer = null, apiToken = '';
function stopApi() { if (apiServer) { try { apiServer.close(); } catch (_) {} apiServer = null; } }
function startApi(port, token) {
  stopApi();
  apiToken = token;
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const send = (code, obj) => { const b = JSON.stringify(obj); res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(b); };
      if (req.headers.origin) return send(403, { error: 'Browser requests are not allowed' });   // blocks web pages from calling the API
      const host = (req.headers.host || '').split(':')[0];
      if (host !== '127.0.0.1' && host !== 'localhost') return send(403, { error: 'Bad host' });
      const given = Buffer.from(String(req.headers.authorization || ''));
      const want = Buffer.from('Bearer ' + apiToken);
      if (!apiToken || given.length !== want.length || !crypto.timingSafeEqual(given, want)) return send(401, { error: 'Missing or wrong bearer token' });
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 8e6) req.destroy(); });
      req.on('end', async () => {
        try {
          const u = new URL(req.url, 'http://127.0.0.1');
          const payload = { method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), body: body ? JSON.parse(body) : null };
          const code = 'BP.api(' + JSON.stringify(payload).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') + ')';
          const out = await win.webContents.executeJavaScript(code, true);
          send(out.status || 200, out.body);
        } catch (e) { send(400, { error: String(e.message || e) }); }
      });
    });
    srv.on('error', (e) => { apiServer = null; resolve({ ok: false, error: e.code === 'EADDRINUSE' ? 'Port ' + port + ' is already in use' : e.message }); });
    srv.listen(port, '127.0.0.1', () => { apiServer = srv; resolve({ ok: true, port }); });
  });
}
ipcMain.handle('api:configure', async (_e, { enabled, port, token }) => (enabled ? startApi(+port || 7878, String(token || '')) : (stopApi(), { ok: true, stopped: true })));

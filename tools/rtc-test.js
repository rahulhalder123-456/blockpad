/* WebRTC transport test: two windows join the same topic through the public trackers and exchange messages.
   usage: node_modules\electron\dist\electron.exe tools\rtc-test.js   (needs internet; ELECTRON_RUN_AS_NODE must be unset) */
const { app, BrowserWindow } = require('electron');
const path = require('path'); const fs = require('fs'); const os = require('os');
const { pathToFileURL } = require('url');
const appDir = path.join(__dirname, '..', 'app');
const page = path.join(os.tmpdir(), 'bp-rtc-test.html');
const src = (f) => pathToFileURL(path.join(appDir, f)).href;
fs.writeFileSync(page, '<!doctype html><meta charset="utf8"><script src="' + src('vendor/trystero-torrent.min.js') + '"></script><script src="' + src('webrtc.js') + '"></script>');
const topic = require('crypto').randomBytes(32).toString('hex');

const code = (name) => `new Promise(async (res) => {
  const R = window.BP.rtc, got = [], opened = [], t0 = Date.now();
  if (!R.available()) return res({ name: '${name}', fail: 'rtc not available' });
  R.onEvent((ev) => {
    if (ev.type === 'open') { opened.push(ev); R.send(ev.peer, 'hello from ${name}'); setTimeout(() => R.send(ev.peer, 'again from ${name}'), 1500); }
    if (ev.type === 'msg') got.push(ev.data);
  });
  await R.join('s1', '${topic}');
  const iv = setInterval(() => {
    if (got.length >= 2 || Date.now() - t0 > 70000) {
      clearInterval(iv);
      res({ name: '${name}', ms: Date.now() - t0, got, keys: opened[0] && [opened[0].localKey, opened[0].remoteKey] });
    }
  }, 300);
})`;

const run = (name) => new Promise((resolve) => {
  const w = new BrowserWindow({ show: false, webPreferences: { partition: 'p-' + name } });
  w.loadFile(page).then(() => w.webContents.executeJavaScript(code(name))).then(resolve);
});

app.whenReady().then(async () => {
  const [a, b] = await Promise.all([run('A'), run('B')]);
  console.log(JSON.stringify(a)); console.log(JSON.stringify(b));
  const ok = a.got && b.got && a.got.includes('hello from B') && b.got.includes('hello from A') && a.keys[0] === b.keys[1] && a.keys[1] === b.keys[0];
  console.log(ok ? 'RTC TEST PASSED' : 'RTC TEST FAILED');
  app.exit(ok ? 0 : 1);
});

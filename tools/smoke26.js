/* screenshots of the website pages (desktop + phone width), loaded from the local preview server */
const { BrowserWindow } = require('electron');
const fs = require('fs'); const path = require('path');
module.exports = async (t) => {
  const out = process.env.BP_SMOKE_OUT; fs.mkdirSync(out, { recursive: true });
  const b = fs.readFileSync(path.join(__dirname, '.invite.tmp'), 'utf8').trim();
  const shots = [['home', 'http://127.0.0.1:4789/', 1100, 1500], ['join', 'http://127.0.0.1:4789/join#d=' + b, 900, 820], ['join-phone', 'http://127.0.0.1:4789/join#d=' + b, 390, 900, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148']];
  for (const [name, url, w, h, ua] of shots) {
    const win = new BrowserWindow({ show: false, width: w, height: h });
    if (ua) win.webContents.setUserAgent(ua);
    await win.loadURL(url); await t.wait(900);
    fs.writeFileSync(path.join(out, name + '.png'), (await win.webContents.capturePage()).toPNG());
    win.destroy();
  }
  console.log('shots written');
};

/* Drives the Blockpad app inside an Android emulator/device over Chrome DevTools: joins the link written by smoke30 and reports what arrives.
   usage: adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>; BP_SYNC_DIR=... node tools/android-cdp-join.js */
const fs = require('fs'); const path = require('path');
const dir = process.env.BP_SYNC_DIR; const port = process.env.CDP_PORT || 9222;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = list.find((p) => p.type === 'page') || list[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  const ev = (expr) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } })); }).then((d) => (d.result && d.result.result ? d.result.result.value : JSON.stringify(d)));
  console.log('page:', page.url, '| sharing available:', await ev('BP.share.available()'), '| webrtc:', await ev('BP.rtc.available()'));
  let link = ''; for (let i = 0; i < 120 && !link; i++) { try { link = fs.readFileSync(path.join(dir, 'link.txt'), 'utf8'); } catch (_) { await wait(1000); } }
  console.log('joining a', /"k"/.test(Buffer.from(link.split('d=')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()) ? 'EDIT' : 'VIEW-ONLY', 'link');
  await ev(`(async () => { const info = BP.share.parseLink(${JSON.stringify(link)}); window.__root = info.root; await BP.share.join(info); })()`);
  let n = 0; for (let i = 0; i < 90 && n < 150; i++) { await wait(1000); n = await ev('(BP.page(window.__root).blocks || []).length'); }
  console.log('android received blocks:', n);
  console.log('diagnose:\n' + (await ev(`BP.rtc.diagnose().then((l) => l.join(String.fromCharCode(10)))`)));
  console.log('peers:', await ev(`BP.share.spaces().map((s) => BP.share.peerCount(s)).join(',')`));
  fs.writeFileSync(path.join(dir, 'done.txt'), n >= 150 ? 'ok' : 'only ' + n);
  ws.close(); process.exit(n >= 150 ? 0 : 1);
})().catch((e) => { console.log('ERR', e.message); process.exit(2); });

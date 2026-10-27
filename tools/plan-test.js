// unit check of the RAM-limit planner with different laptop sizes (no Electron needed)
const os = require('os'); const Module = require('module');
const orig = Module._load; Module._load = function (r, ...a) { return r === 'electron' ? { app: { getPath: () => '.' }, net: {} } : orig.call(this, r, ...a); };
const GB = 1024 ** 3; const L = require('../localai');
let bad = 0;
for (const [ram, pct, id, want] of [[16, 10, 'small', true], [16, 10, 'tiny', true], [8, 10, 'small', false], [8, 10, 'tiny', true], [8, 25, 'small', true], [4, 10, 'tiny', false], [4, 10, 'nano', false], [4, 15, 'nano', true], [4, 25, 'tiny', true]]) {
  os.totalmem = () => ram * GB;
  const m = L.MODELS.find((x) => x.id === id); const p = L.plan(m, pct);
  const ok = p.ok === want; if (!ok) bad++;
  console.log((ok ? 'PASS ' : 'FAIL ') + `${ram} GB RAM @${pct}% -> limit ${(p.budget / 1048576) | 0} MB, ${id}: ${p.ok ? 'fits, ctx ' + p.ctx : 'refused (needs ~' + ((p.need / 1048576) | 0) + ' MB)'}`);
}
process.exit(bad ? 1 : 0);

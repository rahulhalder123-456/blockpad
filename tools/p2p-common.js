/* helpers for the multi-process sharing tests: processes coordinate through small files in BP_SYNC_DIR */
const fs = require('fs'); const path = require('path');
module.exports = (t, who) => {
  const dir = process.env.BP_SYNC_DIR; fs.mkdirSync(dir, { recursive: true });
  const J = async (code) => JSON.parse(await t.eval(`Promise.resolve(${code}).then((v) => JSON.stringify(v === undefined ? null : v))`));
  let fails = 0;
  const check = (l, c, x) => { console.log((c ? 'PASS ' : 'FAIL ') + '[' + who + '] ' + l + (x ? '  ' + x : '')); if (!c) fails++; };
  const signal = (name, val) => fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify(val === undefined ? true : val));
  const read = (name) => { try { return JSON.parse(fs.readFileSync(path.join(dir, name + '.json'), 'utf8')); } catch (_) { return undefined; } };
  const waitSignal = async (name, ms = 60000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = read(name); if (v !== undefined) return v; await t.wait(250); } throw new Error('timeout waiting for signal ' + name); };
  const waitUntil = async (code, ms = 40000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await J(code)) return true; } catch (_) {} await t.wait(300); } return false; };
  const finish = () => { console.log(fails ? `\n[${who}] ${fails} CHECK(S) FAILED` : `\n[${who}] ALL CHECKS PASSED`); if (fails) throw new Error(fails + ' failed'); };
  return { J, check, signal, read, waitSignal, waitUntil, finish, dir };
};

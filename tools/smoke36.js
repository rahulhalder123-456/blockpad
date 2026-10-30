/* Importing a vault from a .zip (the way phones import): ZIP=<a .zip of a Markdown vault folder>, NOTES=<how many .md notes it has> */
const fs = require('fs');
module.exports = async (t) => {
  let fails = 0;
  const check = (label, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + label + (extra != null ? '  ' + extra : '')); if (!cond) fails++; };
  const J = async (c) => JSON.parse(await t.eval(`Promise.resolve(${c}).then((v)=>JSON.stringify(v === undefined ? null : v))`));
  const b64 = fs.readFileSync(process.env.ZIP).toString('base64');
  const r = await J(`(async () => {
    const blob = new Blob([Uint8Array.from(atob('${b64}'), c => c.charCodeAt(0))]);
    const entries = await BP.vault.unzip(blob);
    const rep = await BP.vault.importEntries(entries);
    return { entries: entries.length, md: entries.filter(e => e.path.endsWith('.md')).length, notes: rep.notes, links: rep.links, root: rep.root.title, sample: await entries.find(e => e.path.endsWith('.md')).file.text().then(s => s.length) };
  })()`);
  check('the .zip is read (deflate)', r.entries > 0 && r.sample > 0, JSON.stringify(r));
  check('every note in the .zip imported', r.notes === +process.env.NOTES, r.notes + ' of ' + process.env.NOTES);
  check('links resolved from the .zip', r.links > 50, r.links);
  const errs = t.logs.filter((l) => /^\[3\]/.test(l));
  check('no errors in the console', !errs.length, errs.slice(0, 3).join(' || '));
  console.log(fails ? '\nFAIL ' + fails + ' check(s)' : '\nALL CHECKS PASSED');
  if (fails) throw new Error('smoke36 failed');
};

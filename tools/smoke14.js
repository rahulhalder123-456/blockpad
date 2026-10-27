/* real model download: start, cancel mid-way (partial kept), resume, verify, answer with it, remove */
const fs = require('fs'); const path = require('path');
module.exports = async (t) => {
  const J = async (code) => JSON.parse(await t.eval(`Promise.resolve(${code}).then((v) => JSON.stringify(v === undefined ? null : v))`));
  let fails = 0; const check = (l, c, x) => { console.log((c ? 'PASS ' : 'FAIL ') + l + (x ? '  ' + x : '')); if (!c) fails++; };
  const dir = process.env.BP_LLM_DIR; const file = path.join(dir, 'smollm2-360m-instruct-q4_k_m.gguf');
  check('nano not installed at first', !(await J(`window.bp.llm.status()`)).models.find((m) => m.id === 'nano').installed);
  const p1 = t.eval(`window.bp.llm.download('nano').then((r)=>JSON.stringify(r))`);
  await t.wait(4000);
  const mid = await J(`window.bp.llm.status()`);
  check('progress is reported', mid.download && mid.download.done > 0, mid.download && Math.round(mid.download.done / 1048576) + ' / ' + Math.round(mid.download.total / 1048576) + ' MB');
  await J(`window.bp.llm.cancel()`);
  console.log('   cancel result:', await p1);
  const part = fs.existsSync(file + '.part') ? fs.statSync(file + '.part').size : 0;
  check('cancel keeps a partial file', part > 0 && !fs.existsSync(file), Math.round(part / 1048576) + ' MB kept');
  const t0 = Date.now();
  const r = await J(`window.bp.llm.download('nano')`);
  check('resume finishes the download', r.ok === true, (Date.now() - t0) / 1000 + ' s ' + JSON.stringify(r));
  check('file is complete and a GGUF', fs.existsSync(file) && fs.statSync(file).size === 270590880 && fs.readFileSync(file).slice(0, 4).toString() === 'GGUF');
  const s = await J(`window.bp.llm.start({model:'nano',ramPct:10,idleMin:0})`);
  check('the downloaded nano model runs', s.state === 'running', s.rssMB + ' MB, ' + s.error);
  const a = await J(`BP.aiChat([{role:'user',content:'Reply with one short sentence about the sun.'}]).catch(e=>'ERR '+e.message)`);
  console.log('   nano said:', JSON.stringify(a));
  check('nano answers', typeof a === 'string' && !/^ERR/.test(a) && a.length > 5);
  await J(`window.bp.llm.stop()`);
  await J(`window.bp.llm.remove('nano')`);
  check('remove deletes the file', !fs.existsSync(file));
  console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED'); if (fails) throw new Error('failed');
};

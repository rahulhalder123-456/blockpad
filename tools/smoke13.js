/* built-in AI: start/stop, RAM cap, real answer, auto-start, idle off, UI */
module.exports = async (t) => {
  const J = async (code) => JSON.parse(await t.eval(`Promise.resolve(${code}).then((v) => JSON.stringify(v === undefined ? null : v))`));
  let fails = 0;
  const check = (label, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + label + (extra ? '  ' + extra : '')); if (!cond) fails++; };
  const st = () => J(`window.bp.llm.status()`);
  let s = await st();
  check('engine present, model installed, starts stopped', s.engine && s.state === 'stopped' && s.models.find((m) => m.id === 'tiny').installed);
  check('chip shows "AI off"', (await J(`document.querySelector('.ai-chip .ai-chip-t').textContent`)) === 'AI off');

  s = await J(`window.bp.llm.start({model:'tiny',ramPct:10,idleMin:0})`);
  check('start works', s.state === 'running', JSON.stringify({ rss: s.rssMB, limit: s.budgetMB, ctx: s.ctx, threads: s.threads }));
  check('RAM is below the 10% limit', s.rssMB > 50 && s.rssMB < s.budgetMB, s.rssMB + ' MB of ' + s.budgetMB + ' MB (' + (100 * s.rssMB / s.totalMB).toFixed(1) + '% of RAM)');
  await t.wait(500);
  check('chip shows on', /^AI on/.test(await J(`document.querySelector('.ai-chip .ai-chip-t').textContent`)));
  const r = await J(`BP.aiChat([{role:'user',content:'Fix spelling and grammar. Return only the corrected text: she dont like apples'}]).catch(e=>'ERR '+e.message)`);
  console.log('   model said:', JSON.stringify(r));
  check('real answer from the built-in model', typeof r === 'string' && /apples/i.test(r) && !/^ERR/.test(r));
  // a long input is trimmed to fit the context instead of failing
  const big = await J(`BP.aiChat([{role:'user',content:'Summarize in one line: ' + 'The quick brown fox jumps over the lazy dog. '.repeat(3000)}]).then(x=>'OK '+x.length).catch(e=>'ERR '+e.message)`);
  check('oversized input is trimmed, not an error', /^OK/.test(big), big);
  s = await J(`window.bp.llm.stop()`);
  check('stop works and frees the process', s.state === 'stopped' && s.pid === 0);
  await t.wait(600);
  check('status stays stopped', (await st()).state === 'stopped');

  // auto-start from an AI action (setting on)
  const r2 = await J(`BP.aiChat([{role:'user',content:'Reply with the single word OK.'}]).catch(e=>'ERR '+e.message)`);
  check('auto-start on first use', !/^ERR/.test(r2) && (await st()).state === 'running', JSON.stringify(r2));
  await J(`window.bp.llm.stop()`);
  // autoStart off -> refuses politely
  await t.eval(`BP.state.settings.ai.local.autoStart=false; 0`);
  const r3 = await J(`BP.aiChat([{role:'user',content:'hi'}]).catch(e=>'ERR '+e.message)`);
  check('stopped + autoStart off gives a clear message', /^ERR .*stopped/i.test(r3), r3);
  await t.eval(`BP.state.settings.ai.local.autoStart=true; 0`);

  // a model that is not downloaded is refused with a clear message
  s = await J(`window.bp.llm.start({model:'nano',ramPct:10,idleMin:0})`);
  check('model that is not downloaded is refused with a clear message', s.state === 'error' && /download/i.test(s.error), s.error);

  // idle shutdown (watchdog ticks every 3s; 0.05 min = 3s)
  await J(`window.bp.llm.stop()`);
  s = await J(`window.bp.llm.start({model:'tiny',ramPct:15,idleMin:0.05})`);
  check('restarts after an error', s.state === 'running');
  await t.wait(9500);
  s = await st();
  check('idle timeout stops it by itself', s.state === 'stopped' && /idle/i.test(s.error), s.error);

  // settings UI
  await t.eval(`BP.openSettings('ai'); 0`); await t.wait(600);
  const ui = await J(`({ btn: [...document.querySelectorAll('.set-pane .ai-status .btn')].map(b=>b.textContent), slider: !!document.querySelector('.set-pane input[type=range]'), models: document.querySelectorAll('.set-pane select')[0].options.length, label: document.querySelector('.set-pane input[type=range]').nextSibling.textContent })`);
  console.log('   settings UI:', JSON.stringify(ui));
  check('settings shows Start button, slider, 3 models', ui.btn[0] === 'Start AI' && ui.slider && ui.models === 3);
  await t.eval(`document.querySelector('.set-pane .ai-status .btn').click(); 0`); await t.wait(3000);
  check('Start AI button starts it', (await st()).state === 'running');
  check('button now says Stop AI', (await J(`document.querySelector('.set-pane .ai-status .btn').textContent`)) === 'Stop AI');
  await t.eval(`document.querySelector('.ai-chip').click(); 0`); await t.wait(1500);
  check('top chip stops it', (await st()).state === 'stopped');
  // switching to own endpoint hides the chip
  await t.eval(`BP.state.settings.ai.provider='custom'; BP.paintAiChip(); 0`);
  check('chip is hidden when using your own endpoint', (await J(`document.querySelector('.ai-chip').style.display`)) === 'none');
  console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  if (fails) throw new Error(fails + ' failed');
};

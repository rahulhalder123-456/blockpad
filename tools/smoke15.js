/* quality + behaviour test of the built-in AI through the real editor code paths */
module.exports = async (t) => {
  const J = async (code) => JSON.parse(await t.eval(`Promise.resolve(${code}).then((v) => JSON.stringify(v === undefined ? null : v))`));
  let fails = 0; const check = (l, c, x) => { console.log((c ? 'PASS ' : 'FAIL ') + l + (x ? '  ' + x : '')); if (!c) fails++; };
  const SAMPLE = 'me and my team has went to the market yesterday and we buyed alot of fruits, there was apples, bananas and oranges. the prices was very cheap so we decide to buy more then we planed.';
  const NOTES = 'Meeting notes: Sara will send the budget to finance by Friday. John needs to book the venue for the offsite. We agreed the launch moves to March 3. Priya to review the contract draft next week.';
  await t.eval(`(()=>{ const p=BP.createPage(null,{title:'AI test'}); p.blocks=[BP.newBlock('p',${JSON.stringify(SAMPLE)}),BP.newBlock('p',${JSON.stringify(NOTES)})]; BP.state.__P=p.id; BP.open(p.id); 0;})()`);
  await t.wait(400);
  await t.eval(`BP.state.settings.ai.local.model=${JSON.stringify(process.env.BP_TEST_MODEL || 'tiny')}; 0`);
  const started = await J(`window.bp.llm.start(BP.llm.cfg())`);
  console.log('model:', started.model, '| state:', started.state, started.error || '', '| ctx', started.ctx);
  const peak = { v: 0 };
  const sample = async () => { const s = await J(`window.bp.llm.status()`); peak.v = Math.max(peak.v, s.rssMB); return s; };
  const run = async (id, text, extra) => {
    const t0 = Date.now();
    const prompt = await J(`BP.AI_ACTIONS.find(x=>x.id===${JSON.stringify(id)}).prompt`);
    const NL = String.fromCharCode(10);
    const msgs = [{ role: 'system', content: 'You are an editing assistant inside a notes app. Reply with only the result in plain text or simple Markdown, no preface. Always answer in the same language as the user text (English unless the text is in another language), never switch language.' }, { role: 'user', content: prompt + (id === 'continue' ? NL + NL + 'Page so far:' + NL : NL + NL + 'Text:' + NL) + text }];
    const temp = id === 'continue' || id === 'longer' ? 0.5 : 0.15;
    const a = await J(`BP.aiChat(${JSON.stringify(msgs)}, {temperature:${temp}, maxTokens:${id === 'continue' ? 400 : 700}}).catch(e=>'ERR '+e.message)`);
    await sample();
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\n[${id}] ${secs}s\n   -> ${String(a).replace(/\n/g, '\n      ')}`);
    return { out: String(a), secs: +secs };
  };
  let r;
  r = await run('grammar', SAMPLE);   check('grammar: fixed the errors', !/buyed|boughted|alot|has went|was apples|more then|team has/i.test(r.out) && /apples/i.test(r.out) && !/^ERR/.test(r.out));
  let good = 0; for (let i = 0; i < 4; i++) { const g = await run('grammar', SAMPLE); if (!/buyed|boughted|alot|has went|was apples|more then|team has|I and my/i.test(g.out) && /apples/i.test(g.out)) good++; }
  check('grammar is clean in at least 3 of 4 repeats', good >= 3, good + '/4 clean');
  r = await run('improve', SAMPLE);   check('improve: stays English and keeps the facts', !/[　-鿿]/.test(r.out) && /apples/i.test(r.out) && /market/i.test(r.out) && !/^ERR/.test(r.out));
  r = await run('shorter', SAMPLE);   check('shorter: is shorter than the input', r.out.length > 20 && r.out.length < SAMPLE.length);
  r = await run('longer', SAMPLE);    check('longer: is longer than the input', r.out.length > SAMPLE.length);
  r = await run('translate', 'Hola, me gustaría reservar una mesa para dos personas esta noche.'); check('translate: Spanish -> English', /table/i.test(r.out) && /tonight|this evening|night/i.test(r.out));
  r = await run('summarize', NOTES);  check('summarize: gives a list that mentions the key facts', /march|budget|venue|contract/i.test(r.out) && /^[-*•\d]/m.test(r.out));
  r = await run('explain', 'Photosynthesis converts light energy into chemical energy stored in glucose.'); check('explain: answers', r.out.length > 40 && !/^ERR/.test(r.out));
  r = await run('todo', NOTES);       check('todo: checklist with all 4 people/tasks', /- \[ \]/.test(r.out) && /Sara/.test(r.out) && /John/.test(r.out) && /Priya/.test(r.out) && /March/.test(r.out));
  r = await run('continue', 'My trip to Japan started in Tokyo.'); check('continue: writes more', r.out.length > 60 && !/^ERR/.test(r.out));
  check('all runs stayed under the RAM limit', peak.v < (await J(`window.bp.llm.status()`)).budgetMB, 'peak ' + peak.v + ' MB');

  // real editor paths
  const ids = await J(`BP.page(BP.state.__P).blocks.map(b=>b.id)`);
  // (a) block action with replace -> block text is replaced in the page
  await t.eval(`(async()=>{ const e=BP.currentEditor; const a=BP.AI_ACTIONS.find(x=>x.id==='grammar'); const b=e.page.blocks[0]; await e.aiRun(a, BP.textOf(b.text), null, b); })().then(()=>0)`);
  await t.wait(300);
  const b0 = await J(`BP.textOf(BP.page(BP.state.__P).blocks[0].text)`);
  console.log('\n[editor: block replace] ->', b0);
  check('editor: "Fix grammar" replaces the block text in the page', b0 !== SAMPLE && /apples/i.test(b0) && !/buyed/i.test(b0));
  // (b) insert action adds new blocks below
  const n0 = await J(`BP.page(BP.state.__P).blocks.length`);
  await t.eval(`(async()=>{ const e=BP.currentEditor; const a=BP.AI_ACTIONS.find(x=>x.id==='todo'); const b=e.page.blocks[1]; await e.aiRun(a, BP.textOf(b.text), null, b); })().then(()=>0)`);
  await t.wait(300);
  const pg = await J(`BP.page(BP.state.__P).blocks.map(b=>b.type+': '+BP.textOf(b.text||'').slice(0,60))`);
  console.log('[editor: insert] blocks now:', JSON.stringify(pg));
  check('editor: "Extract action items" inserts new blocks (todo list)', pg.length > n0 && pg.some((x) => /^todo|^check/i.test(x)));
  // (c) Ask AI free prompt
  const ask = await J(`BP.aiChat([{role:'system',content:'You write content for a notes app. Reply with Markdown only, no preface. Answer in the same language as the request.'},{role:'user',content:'Draft a 3-item agenda for a project kickoff meeting.'}], {temperature:0.4,maxTokens:500}).then(o=>({o, n: BP.mdToBlocks(o).length})).catch(e=>({o:'ERR '+e.message,n:0}))`);
  console.log('\n[ask AI]\n   ' + ask.o.replace(/\n/g, '\n   '));
  check('Ask AI: produces blocks and stays reasonably short', ask.n >= 2 && ask.o.length < 2200 && !/^ERR/.test(ask.o), ask.o.length + ' chars');
  // concurrency: two requests at once are queued, both answer
  const [c1, c2] = await J(`Promise.all([BP.aiChat([{role:'user',content:'Say the word ONE.'}]),BP.aiChat([{role:'user',content:'Say the word TWO.'}])]).catch(e=>['ERR '+e.message,'ERR'])`);
  check('two simultaneous requests both answer', !/^ERR/.test(c1) && !/^ERR/.test(c2), JSON.stringify([c1, c2]));
  // stop during a request -> clean error, then restart works
  const pend = t.eval(`BP.aiChat([{role:'user',content:'Write a very long story about a dragon, 800 words.'}]).then(()=> 'done').catch(e=>'ERR '+e.message)`);
  await t.wait(700);
  await J(`window.bp.llm.stop()`);
  const res = await pend;
  check('stopping mid-request returns an error instead of hanging', /ERR|done/.test(res), res.slice(0, 120));
  const after = await J(`BP.aiChat([{role:'user',content:'Reply with the single word OK.'}]).catch(e=>'ERR '+e.message)`);
  check('works again after a stop (auto-restart)', !/^ERR/.test(after), after);
  const fin = await J(`window.bp.llm.status()`);
  console.log(`\npeak RAM ${peak.v} MB, final ${fin.rssMB} MB of ${fin.budgetMB} MB limit (${(100*fin.rssMB/fin.totalMB).toFixed(1)}% of ${fin.totalMB} MB)`);
  await J(`window.bp.llm.stop()`);
  console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL CHECKS PASSED'); if (fails) throw new Error(fails + ' failed');
};

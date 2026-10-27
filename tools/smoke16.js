/* language-drift guard: run "Improve writing" 8 times on 1.5B and count non-English answers */
module.exports = async (t) => {
  const J = async (code) => JSON.parse(await t.eval(`Promise.resolve(${code}).then((v) => JSON.stringify(v === undefined ? null : v))`));
  await t.eval(`BP.state.settings.ai.local.model='small'; 0`);
  const st = await J(`window.bp.llm.start(BP.llm.cfg())`); console.log('model', st.model, st.state);
  const S = 'me and my team has went to the market yesterday and we buyed alot of fruits, there was apples, bananas and oranges. the prices was very cheap so we decide to buy more then we planed.';
  const prompt = await J(`BP.AI_ACTIONS.find(x=>x.id==='improve').prompt`);
  const NL = String.fromCharCode(10); let bad = 0;
  for (let i = 0; i < 8; i++) {
    const msgs = [{ role: 'system', content: 'You are an editing assistant inside a notes app. Reply with only the result in plain text or simple Markdown, no preface. Always answer in the same language as the user text (English unless the text is in another language), never switch language.' }, { role: 'user', content: prompt + NL + NL + 'Text:' + NL + S }];
    const o = await J(`BP.aiChat(${JSON.stringify(msgs)}, {temperature:0.15,maxTokens:700}).catch(e=>'ERR '+e.message)`);
    const cjk = /[぀-ヿ㐀-鿿]/.test(o); if (cjk || /^ERR/.test(o)) bad++;
    console.log((cjk || /^ERR/.test(o) ? 'BAD  ' : 'ok   ') + o.slice(0, 110));
  }
  await J(`window.bp.llm.stop()`);
  console.log(bad ? `\n${bad}/8 BAD` : '\nALL 8 ENGLISH'); if (bad) throw new Error('drift');
};
